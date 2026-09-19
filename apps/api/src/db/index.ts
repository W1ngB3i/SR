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

/** 单一真源：建表语句统一维护在 schema.sql（构建时随 dist 一起部署） */
const SCHEMA_SQL = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql'),
  'utf8',
);

