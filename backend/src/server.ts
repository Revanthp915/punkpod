import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type Database from 'better-sqlite3';
import { config } from './config.js';
import { createDatabase, id, now } from './db.js';
import { parseCompletedSession } from './focus.js';
import { randomBytes } from 'node:crypto';

type Body = Record<string, unknown>;
const text = (v: unknown, fallback = '') => typeof v === 'string' ? v.trim() : fallback;
const currentUser = (req: { headers: Record<string, unknown> }) => text(req.headers['x-user-id'], 'demo-user');
const bodyOf = (req: { body: unknown }) => (req.body && typeof req.body === 'object' ? req.body as Body : {});
const bool = (v: unknown) => v === true || v === 1;
const invitationCode = () => randomBytes(4).toString('hex').toUpperCase();
const validGenders = new Set(['female', 'male', 'nonbinary', 'unspecified']);
const validPreferences = new Set(['any', 'women-only']);
const validAvatar = (value: unknown) => typeof value === 'string' && /^[a-z0-9_-]{1,64}$/i.test(value);

type PodRow = {
  id: string;
  mode: string;
  language: string;
  learningPath: string | null;
  podType: string;
  capacity: number;
  invitationCode: string | null;
  createdAt: string;
  memberCount: number;
};

const podSelect = `
  SELECT p.id,p.mode,p.language,p.learning_path as learningPath,
         p.pod_type as podType,p.capacity,p.invitation_code as invitationCode,
         p.created_at as createdAt,COUNT(pm.user_id) as memberCount
  FROM pods p LEFT JOIN pod_members pm ON pm.pod_id=p.id
  WHERE p.id=? GROUP BY p.id`;

export function buildApp(db = createDatabase(config.databaseFile)): FastifyInstance {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: true });
  app.addHook('onClose', async () => db.close());
  const ensureUser = (userId: string) => db.prepare('INSERT INTO users(id,name,created_at) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING').run(userId, 'PunkPod member', now());
  const cleanupMessages = () => { db.prepare("DELETE FROM room_messages WHERE julianday(created_at) < julianday('now','-30 days')").run(); db.prepare("DELETE FROM direct_messages WHERE julianday(created_at) < julianday('now','-30 days')").run(); };
  cleanupMessages();
  const cleanupTimer = setInterval(cleanupMessages, 60 * 60 * 1000); cleanupTimer.unref();
  app.addHook('onRequest', async (request) => { if (request.url.includes('/messages')) cleanupMessages(); });
  app.addHook('onClose', async () => clearInterval(cleanupTimer));
  const isAdmin = (userId: string) => Boolean(db.prepare("SELECT 1 FROM users WHERE id=? AND role='admin'").get(userId));
  const memberOf = (podId: string, userId: string) => Boolean(db.prepare('SELECT 1 FROM pod_members WHERE pod_id=? AND user_id=?').get(podId, userId));

  const health = async () => ({ ok: true, service: 'punkpod-api', premium: config.premiumEnabled });
  app.get('/health', health);
  app.get('/api/v1/health', health);
  app.get('/api/v1/catalogue', async (req) => {
    const q = text((req.query as Body).q).toLowerCase(); const type = text((req.query as Body).type).toLowerCase();
    const rows = db.prepare('SELECT id,type,title,description,tags FROM catalogue WHERE (? = "" OR lower(title || " " || description || " " || tags) LIKE ?) AND (? = "" OR type = ?) ORDER BY title').all(q, `%${q}%`, type, type) as Array<Record<string, unknown>>;
    return rows.map(row => ({ ...row, tags: JSON.parse(String(row.tags)) }));
  });

  app.get('/api/v1/profile', async (req) => db.prepare('SELECT u.id,u.name,u.email,p.language,p.learning_path as learningPath,p.mode,p.onboarding_complete as onboardingComplete,p.age,p.gender,p.matching_preference as matchingPreference,p.avatar_id as avatarId FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=?').get(currentUser(req)) ?? { id: currentUser(req), onboardingComplete: false });
  app.put('/api/v1/profile', async (req, reply) => {
    const userId = currentUser(req); const b = bodyOf(req); const name = text(b.name, 'PunkPod member');
    const previous = db.prepare('SELECT age,gender,matching_preference as matchingPreference,avatar_id as avatarId FROM profiles WHERE user_id=?').get(userId) as { age?: number | null; gender?: string; matchingPreference?: string; avatarId?: string | null } | undefined;
    const age = b.age === undefined ? (previous?.age ?? null) : (b.age === null ? null : Number(b.age));
    const gender = (b.gender === undefined ? (previous?.gender ?? 'unspecified') : text(b.gender, 'unspecified')).toLowerCase(); const matchingPreference = (b.matchingPreference === undefined ? (previous?.matchingPreference ?? 'any') : text(b.matchingPreference, 'any')).toLowerCase();
    const avatarId = b.avatarId === undefined ? (previous?.avatarId ?? null) : (b.avatarId === null ? null : b.avatarId);
    if (age !== null && (!Number.isInteger(age) || age < 13 || age > 120)) return reply.code(400).send({ error: 'age must be a whole number from 13 to 120' });
    if (!validGenders.has(gender) || !validPreferences.has(matchingPreference)) return reply.code(400).send({ error: 'invalid gender or matchingPreference' });
    if (avatarId !== null && !validAvatar(avatarId)) return reply.code(400).send({ error: 'avatarId must be a safe avatar identifier' });
    const timestamp = now();
    db.prepare('INSERT INTO users(id,name,email,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=COALESCE(excluded.email,users.email)').run(userId, name, text(b.email) || null, timestamp);
    db.prepare('INSERT INTO profiles(user_id,language,learning_path,mode,onboarding_complete,age,gender,matching_preference,avatar_id,updated_at) VALUES (?,?,?,?,1,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET language=excluded.language,learning_path=excluded.learning_path,mode=excluded.mode,onboarding_complete=1,age=excluded.age,gender=excluded.gender,matching_preference=excluded.matching_preference,avatar_id=excluded.avatar_id,updated_at=excluded.updated_at').run(userId, text(b.language, 'English'), text(b.learningPath), text(b.mode, 'Focused pods'), age, gender, matchingPreference, avatarId, timestamp);
    return reply.code(200).send({ userId, language: text(b.language, 'English'), learningPath: text(b.learningPath), mode: text(b.mode, 'Focused pods'), onboardingComplete: true, age, gender, matchingPreference, avatarId });
  });

  app.post('/api/v1/matching', async (req, reply) => {
    const userId = currentUser(req); ensureUser(userId); const b = bodyOf(req); const language = text(b.language, 'English'); const learningPath = text(b.learningPath); const mode = text(b.mode, 'Random pod'); const savedPreference = (db.prepare('SELECT matching_preference as matchingPreference FROM profiles WHERE user_id=?').get(userId) as { matchingPreference?: string } | undefined)?.matchingPreference; const preference = text(b.matchingPreference, savedPreference || 'any').toLowerCase();
    if (!validPreferences.has(preference)) return reply.code(400).send({ error: 'invalid matchingPreference' });
    if (preference === 'women-only' && (db.prepare('SELECT gender FROM profiles WHERE user_id=?').get(userId) as { gender?: string } | undefined)?.gender !== 'female') return reply.code(400).send({ error: 'women-only matching requires a female profile' });
    // An IMMEDIATE transaction serializes the read-and-join decision with other
    // writers. The capacity predicate is evaluated while SQLite holds the write lock.
    const transaction = db.transaction(() => {
      const capacity = preference === 'women-only' ? 2 : 6;
      const existing = db.prepare('SELECT p.id FROM pods p JOIN pod_members pm ON pm.pod_id=p.id WHERE p.mode=? AND p.language=? AND p.capacity=? AND (p.learning_path=? OR p.learning_path IS NULL) AND pm.user_id=? LIMIT 1').get(mode, language, capacity, learningPath, userId) as { id: string } | undefined;
      if (existing) return { podId: existing.id, created: false };
      const pod = db.prepare("SELECT p.id FROM pods p LEFT JOIN pod_members pm ON pm.pod_id=p.id LEFT JOIN profiles candidate ON candidate.user_id=pm.user_id WHERE p.mode=? AND p.language=? AND (p.learning_path=? OR p.learning_path IS NULL) AND p.capacity=? AND (?='any' OR (candidate.gender='female' AND candidate.matching_preference='women-only')) GROUP BY p.id HAVING COUNT(pm.user_id) < p.capacity ORDER BY p.created_at LIMIT 1").get(mode, language, learningPath, capacity, preference) as { id: string } | undefined;
      const podId = pod?.id ?? id();
      if (!pod) db.prepare('INSERT INTO pods(id,mode,language,learning_path,pod_type,capacity,invitation_code,created_at) VALUES (?,?,?,?,?,?,?,?)').run(podId, mode, language, learningPath || null, preference === 'women-only' ? 'one_to_one' : 'study', capacity, invitationCode(), now());
      db.prepare('INSERT INTO pod_members(pod_id,user_id,joined_at) VALUES (?,?,?) ON CONFLICT(pod_id,user_id) DO NOTHING').run(podId, userId, now());
      return { podId, created: !pod };
    });
    const result = transaction.immediate();
    const pod = db.prepare(podSelect).get(result.podId) as PodRow;
    return reply.code(result.created ? 201 : 200).send(pod);
  });
  app.get('/api/v1/pods/:id', async (req, reply) => { const podId = (req.params as { id: string }).id; const userId = currentUser(req); const pod = db.prepare(podSelect).get(podId) as PodRow | undefined; if (!pod) return reply.code(404).send({ error: 'pod not found' }); if (!memberOf(podId, userId)) return reply.code(403).send({ error: 'join the pod first' }); if (db.prepare("SELECT 1 FROM room_restrictions WHERE pod_id=? AND user_id=? AND expires_at > ?").get(podId, userId, now())) return reply.code(403).send({ error: 'temporarily restricted from this room' }); return { ...pod, members: db.prepare('SELECT u.id,u.name,pm.joined_at as joinedAt FROM pod_members pm JOIN users u ON u.id=pm.user_id WHERE pm.pod_id=? ORDER BY pm.joined_at').all(podId) }; });
  app.post('/api/v1/pods/:id/leave', async (req, reply) => { const result = db.prepare('DELETE FROM pod_members WHERE pod_id=? AND user_id=?').run((req.params as { id: string }).id, currentUser(req)); return result.changes ? { left: true } : reply.code(404).send({ error: 'membership not found' }); });
  app.get('/api/v1/pods/:id/messages', async (req, reply) => { const podId = (req.params as { id: string }).id; const userId = currentUser(req); if (!memberOf(podId, userId)) return reply.code(403).send({ error: 'join the pod first' }); if (db.prepare("SELECT 1 FROM room_restrictions WHERE pod_id=? AND user_id=? AND expires_at > ?").get(podId, userId, now())) return reply.code(403).send({ error: 'temporarily restricted from this room' }); const messages = db.prepare('SELECT m.id,m.pod_id as podId,m.text,m.reply_to as replyTo,m.created_at as createdAt,u.id as userId,u.name FROM room_messages m JOIN users u ON u.id=m.user_id WHERE m.pod_id=? ORDER BY m.created_at').all(podId) as Array<Record<string, unknown>>; const reactions = db.prepare('SELECT message_id as messageId,emoji,COUNT(*) as count FROM message_reactions WHERE message_id IN (SELECT id FROM room_messages WHERE pod_id=?) GROUP BY message_id,emoji').all(podId) as Array<Record<string, unknown>>; return messages.map(message => ({ ...message, messageId: message.id, roomId: message.podId, senderId: message.userId, timestamp: message.createdAt, reactions: reactions.filter(reaction => reaction.messageId === message.id).map(reaction => ({ emoji: reaction.emoji, count: reaction.count })) })); });
  app.post('/api/v1/pods/:id/messages', async (req, reply) => { const podId = (req.params as { id: string }).id; const userId = currentUser(req); const b = bodyOf(req); const message = { id: id(), text: text(b.text), replyTo: text(b.replyTo) || null, createdAt: now() }; if (!message.text || message.text.length > 2000) return reply.code(400).send({ error: 'text is required and must be at most 2000 characters' }); if (!memberOf(podId, userId)) return reply.code(403).send({ error: 'join the pod first' }); if (db.prepare("SELECT 1 FROM room_restrictions WHERE pod_id=? AND user_id=? AND expires_at > ?").get(podId, userId, now())) return reply.code(403).send({ error: 'temporarily restricted from this room' }); ensureUser(userId); db.prepare('INSERT INTO room_messages(id,pod_id,user_id,text,reply_to,created_at) VALUES (?,?,?,?,?,?)').run(message.id,podId,userId,message.text,message.replyTo,message.createdAt); return reply.code(201).send({ ...message, messageId: message.id, roomId: podId, userId, senderId: userId, createdAt: message.createdAt, timestamp: message.createdAt, reactions: [] }); });
  app.post('/api/v1/pods/:id/messages/:messageId/reactions', async (req, reply) => { const podId = (req.params as { id: string }).id; const messageId = (req.params as { messageId: string }).messageId; const userId = currentUser(req); const emoji = text(bodyOf(req).emoji); if (!emoji || [...emoji].length > 8) return reply.code(400).send({ error: 'a short emoji is required' }); const member = db.prepare('SELECT 1 FROM pod_members WHERE pod_id=? AND user_id=?').get(podId, userId); const message = db.prepare('SELECT 1 FROM room_messages WHERE id=? AND pod_id=?').get(messageId, podId); if (!member || !message) return reply.code(403).send({ error: 'join the pod first' }); ensureUser(userId); db.prepare('INSERT OR IGNORE INTO message_reactions(message_id,user_id,emoji,created_at) VALUES (?,?,?,?)').run(messageId,userId,emoji,now()); return { messageId, emoji }; });
  app.post('/api/v1/reports', async (req, reply) => {
    const reporterId = currentUser(req); const b = bodyOf(req); const podId = text(b.podId) || null; const reportedUserId = text(b.reportedUserId) || null; const messageId = text(b.messageId) || null; const reason = text(b.reason);
    if (!reason || reason.length > 500 || (!reportedUserId && !messageId)) return reply.code(400).send({ error: 'reason and a reported user or message are required' });
    if (podId && !memberOf(podId, reporterId)) return reply.code(403).send({ error: 'join the pod first' });
    if (reportedUserId && (!podId || !memberOf(podId, reportedUserId))) return reply.code(400).send({ error: 'reported user must be a member of the room' });
    if (messageId && !db.prepare('SELECT 1 FROM room_messages WHERE id=? AND (? IS NULL OR pod_id=?)').get(messageId, podId, podId)) return reply.code(400).send({ error: 'message not found' });
    ensureUser(reporterId); if (reportedUserId) ensureUser(reportedUserId); const report = { id: id(), reporterId, reportedUserId, podId, messageId, reason, status: 'open', createdAt: now() };
    db.prepare('INSERT INTO reports(id,reporter_id,reported_user_id,pod_id,message_id,reason,created_at) VALUES (?,?,?,?,?,?,?)').run(report.id,report.reporterId,report.reportedUserId,report.podId,report.messageId,report.reason,report.createdAt); return reply.code(201).send(report);
  });
  app.get('/api/v1/admin/reports', async (req, reply) => { const userId = currentUser(req); if (!isAdmin(userId)) return reply.code(403).send({ error: 'admin role required' }); return db.prepare('SELECT id,reporter_id as reporterId,reported_user_id as reportedUserId,pod_id as podId,message_id as messageId,reason,status,decision_note as decisionNote,decided_by as decidedBy,decided_at as decidedAt,created_at as createdAt FROM reports ORDER BY created_at DESC').all(); });
  app.get('/api/v1/admin/moderation/audit', async (req, reply) => { const userId = currentUser(req); if (!isAdmin(userId)) return reply.code(403).send({ error: 'admin role required' }); return db.prepare("SELECT id,report_id as reportId,actor_id as actorId,decision,note,created_at as createdAt FROM moderation_actions ORDER BY created_at DESC").all(); });
  app.patch('/api/v1/admin/reports/:id', async (req, reply) => {
    const adminId = currentUser(req); if (!isAdmin(adminId)) return reply.code(403).send({ error: 'admin role required' }); const b = bodyOf(req); const decision = text(b.decision).toLowerCase();
    if (!['dismissed','restricted','removed'].includes(decision)) return reply.code(400).send({ error: 'decision must be dismissed, restricted, or removed' });
    const report = db.prepare('SELECT * FROM reports WHERE id=?').get((req.params as { id: string }).id) as Record<string, unknown> | undefined; if (!report) return reply.code(404).send({ error: 'report not found' });
    const decidedAt = now(); db.prepare('UPDATE reports SET status=?,decision_note=?,decided_by=?,decided_at=? WHERE id=?').run(decision, text(b.note) || null, adminId, decidedAt, report.id); db.prepare('INSERT INTO moderation_actions(id,report_id,actor_id,decision,note,created_at) VALUES (?,?,?,?,?,?)').run(id(), report.id, adminId, decision, text(b.note) || null, decidedAt);
    if (decision === 'restricted' && report.pod_id && report.reported_user_id) { const days = Number(b.durationDays ?? 7); if (!Number.isInteger(days) || days < 1 || days > 30) return reply.code(400).send({ error: 'durationDays must be 1 to 30' }); const expires = new Date(Date.now() + days * 86400000).toISOString(); db.prepare('INSERT INTO room_restrictions(id,pod_id,user_id,expires_at,reason,created_by,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(pod_id,user_id) DO UPDATE SET expires_at=excluded.expires_at,reason=excluded.reason,created_by=excluded.created_by').run(id(), report.pod_id, report.reported_user_id, expires, text(b.note, 'moderation decision'), adminId, decidedAt); }
    if (decision === 'removed' && report.pod_id && report.reported_user_id) db.prepare('DELETE FROM pod_members WHERE pod_id=? AND user_id=?').run(report.pod_id, report.reported_user_id);
    return { id: report.id, status: decision, decidedBy: adminId, decidedAt };
  });
  app.get('/api/v1/pods/:id/direct-messages/:userId', async (req, reply) => { const podId = (req.params as { id: string }).id; const otherUserId = (req.params as { userId: string }).userId; const userId = currentUser(req); const member = db.prepare('SELECT 1 FROM pod_members WHERE pod_id=? AND user_id=?').get(podId, userId) && db.prepare('SELECT 1 FROM pod_members WHERE pod_id=? AND user_id=?').get(podId, otherUserId); if (!member) return reply.code(403).send({ error: 'both users must be pod members' }); return db.prepare('SELECT id,from_user_id as fromUserId,to_user_id as toUserId,text,created_at as createdAt FROM direct_messages WHERE pod_id=? AND ((from_user_id=? AND to_user_id=?) OR (from_user_id=? AND to_user_id=?)) ORDER BY created_at').all(podId,userId,otherUserId,otherUserId,userId); });
  app.post('/api/v1/pods/:id/direct-messages/:userId', async (req, reply) => { const podId = (req.params as { id: string }).id; const toUserId = (req.params as { userId: string }).userId; const fromUserId = currentUser(req); const message = { id: id(), text: text(bodyOf(req).text), createdAt: now() }; if (!message.text || message.text.length > 2000 || toUserId === fromUserId) return reply.code(400).send({ error: 'a message to another member is required and must be at most 2000 characters' }); const members = db.prepare('SELECT COUNT(*) AS count FROM pod_members WHERE pod_id=? AND user_id IN (?,?)').get(podId,fromUserId,toUserId) as { count: number }; if (members.count !== 2) return reply.code(403).send({ error: 'both users must be pod members' }); ensureUser(fromUserId); ensureUser(toUserId); db.prepare('INSERT INTO direct_messages(id,pod_id,from_user_id,to_user_id,text,created_at) VALUES (?,?,?,?,?,?)').run(message.id,podId,fromUserId,toUserId,message.text,message.createdAt); return reply.code(201).send({ ...message, fromUserId, toUserId }); });

  app.get('/api/v1/tasks', async req => db.prepare('SELECT id,title,metadata,completed,due_date as dueDate,created_at as createdAt FROM tasks WHERE user_id=? ORDER BY completed,due_date,created_at').all(currentUser(req)));
  app.post('/api/v1/tasks', async (req, reply) => { const b = bodyOf(req); const userId = currentUser(req); ensureUser(userId); const task = { id: id(), userId, title: text(b.title), metadata: text(b.metadata) || null, dueDate: text(b.dueDate) || null, createdAt: now() }; if (!task.title) return reply.code(400).send({ error: 'title is required' }); db.prepare('INSERT INTO tasks(id,user_id,title,metadata,due_date,created_at) VALUES (?,?,?,?,?,?)').run(task.id,task.userId,task.title,task.metadata,task.dueDate,task.createdAt); return reply.code(201).send(task); });
  app.patch('/api/v1/tasks/:id', async (req, reply) => { const b = bodyOf(req); const result = db.prepare('UPDATE tasks SET completed=COALESCE(?,completed),title=COALESCE(?,title),metadata=COALESCE(?,metadata) WHERE id=? AND user_id=?').run(b.completed === undefined ? null : (bool(b.completed) ? 1 : 0), text(b.title) || null, text(b.metadata) || null, (req.params as { id: string }).id, currentUser(req)); return result.changes ? db.prepare('SELECT * FROM tasks WHERE id=?').get((req.params as { id: string }).id) : reply.code(404).send({ error: 'task not found' }); });

  app.post('/api/v1/focus-sessions', async (req, reply) => { const b = bodyOf(req); const parsed = parseCompletedSession({ ...b, startedAt: text(b.startedAt, now()) }); if (!parsed) return reply.code(400).send({ error: 'completed kind, end time, valid break category, and whole minutes are required' }); const userId = currentUser(req); ensureUser(userId); const session = { id: id(), userId, ...parsed }; db.prepare('INSERT INTO focus_sessions(id,user_id,started_at,ended_at,kind,break_category,minutes) VALUES (?,?,?,?,?,?,?)').run(session.id,session.userId,session.startedAt,session.endedAt,session.kind,session.breakCategory,session.minutes); return reply.code(201).send(session); });
  app.get('/api/v1/focus-sessions', async req => db.prepare('SELECT id,user_id as userId,started_at as startedAt,ended_at as endedAt,kind,break_category as breakCategory,minutes FROM focus_sessions WHERE user_id=? ORDER BY started_at DESC').all(currentUser(req)));
  app.get('/api/v1/focus-stats', async req => { const row = db.prepare("SELECT COALESCE(SUM(CASE WHEN kind='focus' THEN minutes ELSE 0 END),0) AS focusMinutes,COALESCE(SUM(CASE WHEN kind='break' THEN minutes ELSE 0 END),0) AS breakMinutes,COUNT(CASE WHEN kind='focus' THEN 1 END) AS sessions FROM focus_sessions WHERE user_id=?").get(currentUser(req)); return row; });

  app.get('/api/v1/friends', async req => db.prepare('SELECT f.friend_id as friendId,u.name,f.status,f.created_at as createdAt FROM friendships f JOIN users u ON u.id=f.friend_id WHERE f.user_id=?').all(currentUser(req)));
  app.get('/api/v1/friends/invitations', async req => db.prepare("SELECT id,from_user_id as fromUserId,to_user_id as toUserId,pod_id as podId,status,created_at as createdAt FROM invitations WHERE from_user_id=? OR to_user_id=? ORDER BY created_at DESC").all(currentUser(req), currentUser(req)));
  app.post('/api/v1/friends/invitations', async (req, reply) => { const b = bodyOf(req); const fromUserId = currentUser(req); const toUserId = text(b.toUserId); if (!toUserId || toUserId === fromUserId) return reply.code(400).send({ error: 'a different toUserId is required' }); ensureUser(fromUserId); ensureUser(toUserId); const invitation = { id: id(), fromUserId, toUserId, podId: text(b.podId) || null, status: 'pending', createdAt: now() }; db.prepare('INSERT INTO invitations(id,from_user_id,to_user_id,pod_id,status,created_at) VALUES (?,?,?,?,?,?)').run(invitation.id,invitation.fromUserId,invitation.toUserId,invitation.podId,invitation.status,invitation.createdAt); return reply.code(201).send(invitation); });
  app.patch('/api/v1/friends/invitations/:id', async (req, reply) => { const status = text(bodyOf(req).status); if (!['accepted','declined'].includes(status)) return reply.code(400).send({ error: 'status must be accepted or declined' }); const inviteId = (req.params as { id: string }).id; const invitation = db.prepare('SELECT * FROM invitations WHERE id=? AND to_user_id=?').get(inviteId,currentUser(req)) as Record<string, unknown> | undefined; if (!invitation) return reply.code(404).send({ error: 'invitation not found' }); db.prepare('UPDATE invitations SET status=? WHERE id=?').run(status,inviteId); if (status === 'accepted') db.prepare('INSERT OR IGNORE INTO friendships(user_id,friend_id,status,created_at) VALUES (?,?,?,?)').run(invitation.from_user_id,currentUser(req),'accepted',now()); return { id: inviteId, status }; });
  return app;
}

if (process.argv[1]?.endsWith('server.js') || process.argv[1]?.endsWith('server.ts')) buildApp().listen({ host: config.host, port: config.port }).catch(error => { console.error(error); process.exit(1); });
