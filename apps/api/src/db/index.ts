import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  addMissingColumns(db, 'user', {
    qq: `TEXT NOT NULL DEFAULT ''`,
    skills: `TEXT NOT NULL DEFAULT ''`,
    department_id: `TEXT REFERENCES department(id)`,
  });
  // 机器人拿码时绑定 openid：用于提交校验与审核结果推送（guild_id 决定结果推到哪个群）
  addMissingColumns(db, 'contact_key', {
    bind_openid: 'TEXT',
    bound_at: 'TEXT',
    guild_id: `TEXT NOT NULL DEFAULT ''`,
  });
  relaxContactKeyIssuer(db);
}

/** 逐表补齐缺失列，供老版本数据库平滑升级 */
function addMissingColumns(db: DB, table: string, columns: Record<string, string>): void {
  const existing = new Set(
    (db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as { name: string }[]).map(
      (c) => c.name,
    ),
  );
  for (const [name, ddl] of Object.entries(columns)) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE ${JSON.stringify(table)} ADD COLUMN ${name} ${ddl}`);
    }
  }
}

/**
 * 老库的 contact_key.created_by 为 NOT NULL，机器人签发的接洽码没有人工签发人。
 * SQLite 无法直接放松约束，只能按新结构重建；无子表引用 contact_key，整段放在事务内执行。
 */
function relaxContactKeyIssuer(db: DB): void {
  const columns = db
    .prepare('PRAGMA table_info(contact_key)')
    .all() as { name: string; notnull: number }[];
  const issuer = columns.find((c) => c.name === 'created_by');
  if (!issuer || issuer.notnull === 0) return;

  db.transaction(() => {
    db.exec(`
      ALTER TABLE contact_key RENAME TO contact_key_legacy;
      CREATE TABLE contact_key (
        id             TEXT PRIMARY KEY,
        code           TEXT NOT NULL UNIQUE,
        created_by     TEXT REFERENCES "user"(id),
        created_at     TEXT NOT NULL,
        status         TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused','used')),
        used_ticket_id TEXT,
        used_at        TEXT,
        bind_openid    TEXT,
        bound_at       TEXT,
        guild_id       TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO contact_key (id, code, created_by, created_at, status, used_ticket_id, used_at, bind_openid, bound_at, guild_id)
        SELECT id, code, created_by, created_at, status, used_ticket_id, used_at, bind_openid, bound_at, guild_id
        FROM contact_key_legacy;
      DROP TABLE contact_key_legacy;
      CREATE INDEX IF NOT EXISTS idx_key_created_by ON contact_key(created_by);
      CREATE INDEX IF NOT EXISTS idx_key_status ON contact_key(status);
      CREATE INDEX IF NOT EXISTS idx_key_used_ticket ON contact_key(used_ticket_id);
    `);
  })();
}

/** 测试与重置场景：关闭并清空连接 */
export function closeDb(): void {
  instance?.close();
  instance = null;
}

/** 单一真源：建表语句统一维护在 schema.sql（构建时随 dist 一起部署） */
const SCHEMA_SQL = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql'),
  'utf8',
);

