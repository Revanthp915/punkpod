import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export function createDatabase(file: string) {
  const path = resolve(file);
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  upgradeLegacyPods(db);
  const migrationDirectory = new URL('../migrations/', import.meta.url);
  const applied = db.prepare('SELECT name FROM schema_migrations').all() as Array<{ name: string }>;
  const appliedNames = new Set(applied.map(row => row.name));
  for (const name of readdirSync(migrationDirectory).filter(file => file.endsWith('.sql')).sort()) {
    if (appliedNames.has(name)) continue;
    db.exec(readFileSync(new URL(name, migrationDirectory), 'utf8'));
    db.prepare('INSERT INTO schema_migrations(name,applied_at) VALUES (?,?)').run(name, now());
  }
  // Keep the MVP database upgradeable when a developer already has an older file.
  const sessionColumns = db.prepare('PRAGMA table_info(focus_sessions)').all() as Array<{ name: string }>;
  if (!sessionColumns.some(column => column.name === 'break_category')) {
    db.exec('ALTER TABLE focus_sessions ADD COLUMN break_category TEXT');
  }
  const profileColumns = db.prepare('PRAGMA table_info(profiles)').all() as Array<{ name: string }>;
  if (!profileColumns.some(column => column.name === 'age')) db.exec('ALTER TABLE profiles ADD COLUMN age INTEGER');
  if (!profileColumns.some(column => column.name === 'gender')) db.exec('ALTER TABLE profiles ADD COLUMN gender TEXT');
  if (!profileColumns.some(column => column.name === 'matching_preference')) db.exec('ALTER TABLE profiles ADD COLUMN matching_preference TEXT NOT NULL DEFAULT \'any\'');
  if (!profileColumns.some(column => column.name === 'avatar_id')) db.exec('ALTER TABLE profiles ADD COLUMN avatar_id TEXT');
  const userColumns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  if (!userColumns.some(column => column.name === 'role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
  seedCatalogue(db);
  return db;
}

function upgradeLegacyPods(db: Database.Database) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pods'").all() as Array<{ name: string }>;
  if (!tables.length) return;
  const columns = db.prepare('PRAGMA table_info(pods)').all() as Array<{ name: string }>;
  const names = new Set(columns.map(column => column.name));
  if (!names.has('capacity')) db.exec("ALTER TABLE pods ADD COLUMN capacity INTEGER NOT NULL DEFAULT 6");
  if (!names.has('pod_type')) db.exec("ALTER TABLE pods ADD COLUMN pod_type TEXT NOT NULL DEFAULT 'study'");
  if (!names.has('invitation_code')) db.exec('ALTER TABLE pods ADD COLUMN invitation_code TEXT');
}

function seedCatalogue(db: Database.Database) {
  const count = db.prepare('SELECT COUNT(*) AS count FROM catalogue').get() as { count: number };
  if (count.count) return;
  const insert = db.prepare('INSERT INTO catalogue(type,title,description,tags) VALUES (?,?,?,?)');
  const rows = [
    ['exam', 'JEE Main + Advanced', 'Engineering entrance prep from concepts to mocks.', ['Engineering', 'Physics', 'Chemistry', 'Maths']],
    ['exam', 'NEET-UG', 'A steady daily rhythm for medical aspirants.', ['Medical', 'Biology', 'Chemistry']],
    ['exam', 'UPSC Civil Services', 'Accountability for General Studies and revision.', ['Government', 'GS']],
    ['degree', 'Computer Science & AI', 'Systems, code and applied intelligence.', ['Engineering', 'Coding', 'Data']],
    ['degree', 'Commerce & Finance', 'A shared desk for CA, CMA, BCom and finance.', ['Commerce', 'CA']],
    ['career', 'Banking & SSC', 'Quant, reasoning, English and awareness.', ['Government', 'Quant']],
    ['pathway', 'Research & PhD', 'Long-form independent research with peers.', ['Research', 'Writing']]
  ];
  const transaction = db.transaction(() => rows.forEach(([type, title, description, tags]) => insert.run(type, title, description, JSON.stringify(tags))));
  transaction();
}

export const now = () => new Date().toISOString();
export const id = () => randomUUID();
