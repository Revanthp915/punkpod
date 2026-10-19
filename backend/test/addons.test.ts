import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/server.js';
import { createDatabase } from '../src/db.js';

test('women-only matching is two-person and does not fall back to mixed pods', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'punkpod-addon-')); const db = createDatabase(join(directory, 'test.sqlite')); const app = buildApp(db);
  try {
    await app.inject({ method: 'PUT', url: '/api/v1/profile', headers: { 'x-user-id': 'woman-1' }, payload: { gender: 'female', matchingPreference: 'women-only' } });
    await app.inject({ method: 'PUT', url: '/api/v1/profile', headers: { 'x-user-id': 'man-1' }, payload: { gender: 'male' } });
    const first = await app.inject({ method: 'POST', url: '/api/v1/matching', headers: { 'x-user-id': 'woman-1' }, payload: { matchingPreference: 'women-only' } });
    const second = await app.inject({ method: 'POST', url: '/api/v1/matching', headers: { 'x-user-id': 'man-1' }, payload: { matchingPreference: 'women-only' } });
    assert.equal(first.statusCode, 201); assert.equal(second.statusCode, 400);
    await app.inject({ method: 'PUT', url: '/api/v1/profile', headers: { 'x-user-id': 'woman-2' }, payload: { gender: 'female', matchingPreference: 'women-only' } });
    const compatible = await app.inject({ method: 'POST', url: '/api/v1/matching', headers: { 'x-user-id': 'woman-2' }, payload: { matchingPreference: 'women-only' } });
    assert.equal(compatible.statusCode, 200);
    const bypass = await app.inject({ method: 'POST', url: '/api/v1/matching', headers: { 'x-user-id': 'woman-3' }, payload: { matchingPreference: 'any' } });
    assert.equal(bypass.statusCode, 201);
    assert.notEqual(bypass.json().id, compatible.json().id);
  } finally { await app.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('reports require membership and admin decisions are temporary or room-scoped', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'punkpod-addon-')); const db = createDatabase(join(directory, 'test.sqlite')); const app = buildApp(db);
  try {
    const joined = await app.inject({ method: 'POST', url: '/api/v1/matching', headers: { 'x-user-id': 'reporter' }, payload: {} }); const podId = joined.json().id;
    await app.inject({ method: 'POST', url: `/api/v1/matching`, headers: { 'x-user-id': 'target' }, payload: {} });
    db.prepare("UPDATE users SET role='admin' WHERE id=?").run('reporter');
    const report = await app.inject({ method: 'POST', url: '/api/v1/reports', headers: { 'x-user-id': 'reporter' }, payload: { podId, reportedUserId: 'target', reason: 'spam' } });
    assert.equal(report.statusCode, 201);
    const decision = await app.inject({ method: 'PATCH', url: `/api/v1/admin/reports/${report.json().id}`, headers: { 'x-user-id': 'reporter' }, payload: { decision: 'restricted', durationDays: 2 } });
    assert.equal(decision.statusCode, 200);
    const message = await app.inject({ method: 'POST', url: `/api/v1/pods/${podId}/messages`, headers: { 'x-user-id': 'target' }, payload: { text: 'blocked' } });
    assert.equal(message.statusCode, 403);
    const audit = await app.inject({ method: 'GET', url: '/api/v1/admin/moderation/audit', headers: { 'x-user-id': 'reporter' } });
    assert.equal(audit.statusCode, 200);
    assert.equal(audit.json()[0].decision, 'restricted');
  } finally { await app.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('profile metadata validates safe avatars and room messages are retained for thirty days', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'punkpod-addon-')); const db = createDatabase(join(directory, 'test.sqlite')); const app = buildApp(db);
  try {
    const invalid = await app.inject({ method: 'PUT', url: '/api/v1/profile', headers: { 'x-user-id': 'metadata-user' }, payload: { age: 12, avatarId: '../upload' } });
    assert.equal(invalid.statusCode, 400);
    const valid = await app.inject({ method: 'PUT', url: '/api/v1/profile', headers: { 'x-user-id': 'metadata-user' }, payload: { age: 25, gender: 'female', avatarId: 'avatar_01' } });
    assert.equal(valid.statusCode, 200); assert.equal(valid.json().avatarId, 'avatar_01');
    const joined = await app.inject({ method: 'POST', url: '/api/v1/matching', headers: { 'x-user-id': 'metadata-user' }, payload: {} }); const podId = joined.json().id;
    db.prepare("INSERT INTO room_messages(id,pod_id,user_id,text,created_at) VALUES (?,?,?,?,datetime('now','-31 days'))").run('old-message', podId, 'metadata-user', 'old');
    const messages = await app.inject({ method: 'GET', url: `/api/v1/pods/${podId}/messages`, headers: { 'x-user-id': 'metadata-user' } });
    assert.deepEqual(messages.json(), []);
  } finally { await app.close(); rmSync(directory, { recursive: true, force: true }); }
});
