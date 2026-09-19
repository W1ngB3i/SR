import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DB_PATH, ensureDirs } from '../env.js';

export type DB = Database.Database;

let instance: DB | null = null;

/** 打开（或复用）数据库连接，并确保表结构与外键约束就绪 */
export function getDb(): DB {
  if (instance) return instance;
  ensureDirs();
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  migrate(db);
  instance = db;
  return db;
}

/** 轻量列迁移：已存在时静默跳过（SQLite 无 IF NOT EXISTS 的 ADD COLUMN） */
function migrate(db: DB): void {
  const columns = new Set(
    (db.prepare('PRAGMA table_info("user")').all() as { name: string }[]).map((c) => c.name),
  );
  for (const col of ['qq', 'skills']) {
    if (!columns.has(col)) {
      db.exec(`ALTER TABLE "user" ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
    }
  }
}

/** 测试与重置场景：关闭并清空连接 */
export function closeDb(): void {
  instance?.close();
  instance = null;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "user" (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('reviewer','deputy','chief','admin')),
  password_hash TEXT NOT NULL,
  qq            TEXT NOT NULL DEFAULT '',
  skills        TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS department (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  tier        TEXT NOT NULL DEFAULT '',
  contact     TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sort        INTEGER NOT NULL DEFAULT 0,
  enabled     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS mode (
  id             TEXT PRIMARY KEY,
  department_id  TEXT NOT NULL REFERENCES department(id),
  group_name     TEXT NOT NULL DEFAULT '',
  name           TEXT NOT NULL,
  min_requirement TEXT NOT NULL DEFAULT '',
  sort           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_mode_dept ON mode(department_id);

CREATE TABLE IF NOT EXISTS ticket (
  id               TEXT PRIMARY KEY,
  query_code       TEXT NOT NULL UNIQUE,
  circle_name      TEXT NOT NULL,
  intention        TEXT NOT NULL,
  department_id    TEXT NOT NULL REFERENCES department(id),
  module           TEXT NOT NULL CHECK (module IN ('PE','PC','BOTH')),
  mode_id          TEXT NOT NULL REFERENCES mode(id),
  self_proof       INTEGER NOT NULL CHECK (self_proof IN (0,1)),
  contact          TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending_claim'
                   CHECK (status IN ('pending_claim','reviewing','supplementing','resulted','published')),
  assignee_id      TEXT REFERENCES "user"(id),
  is_priority      INTEGER NOT NULL DEFAULT 0,
  supplement_reason TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  claimed_at       TEXT,
  resulted_at      TEXT,
  published_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_ticket_status ON ticket(status);
CREATE INDEX IF NOT EXISTS idx_ticket_dept ON ticket(department_id);
CREATE INDEX IF NOT EXISTS idx_ticket_assignee ON ticket(assignee_id);
CREATE INDEX IF NOT EXISTS idx_ticket_created ON ticket(created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_circle ON ticket(circle_name);

CREATE TABLE IF NOT EXISTS ticket_event (
  id         TEXT PRIMARY KEY,
  ticket_id  TEXT NOT NULL REFERENCES ticket(id),
  type       TEXT NOT NULL,
  actor_id   TEXT,
  actor_name TEXT NOT NULL DEFAULT '',
  detail     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_ticket ON ticket_event(ticket_id);

CREATE TABLE IF NOT EXISTS receipt (
  ticket_id         TEXT PRIMARY KEY REFERENCES ticket(id),
  is_draft          INTEGER NOT NULL DEFAULT 1,
  pe_grade          TEXT CHECK (pe_grade IN ('E','D','C','B','A','S','S+')),
  pc_grade          TEXT CHECK (pc_grade IN ('E','D','C','B','A','S','S+')),
  pass              INTEGER CHECK (pass IN (0,1)),
  target_department TEXT NOT NULL DEFAULT '',
  auditor_id        TEXT REFERENCES "user"(id),
  comment           TEXT NOT NULL DEFAULT '',
  submitted_at      TEXT
);

CREATE TABLE IF NOT EXISTS attachment (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT NOT NULL REFERENCES ticket(id),
  kind        TEXT NOT NULL CHECK (kind IN ('image','video','other')),
  filename    TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  size        INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_att_ticket ON attachment(ticket_id);

CREATE TABLE IF NOT EXISTS announcement (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  pinned     INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id            TEXT PRIMARY KEY,
  operator_id   TEXT,
  operator_name TEXT NOT NULL DEFAULT '',
  action        TEXT NOT NULL,
  resource      TEXT NOT NULL,
  target_id     TEXT NOT NULL DEFAULT '',
  before        TEXT NOT NULL DEFAULT '',
  after         TEXT NOT NULL DEFAULT '',
  request_id    TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
`;
