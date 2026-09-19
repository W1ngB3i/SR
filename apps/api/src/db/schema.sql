-- SR 审核工单系统表结构（SQLite 方言；正式环境按 PostgreSQL 调整索引与约束）

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
  intention        TEXT NOT NULL DEFAULT '',
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

CREATE TABLE IF NOT EXISTS appeal (
  id             TEXT PRIMARY KEY,
  ticket_id      TEXT NOT NULL REFERENCES ticket(id),
  reason         TEXT NOT NULL,
  contact        TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  handle_note    TEXT NOT NULL DEFAULT '',
  handled_by     TEXT,
  handled_at     TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appeal_ticket ON appeal(ticket_id);
CREATE INDEX IF NOT EXISTS idx_appeal_status ON appeal(status);

CREATE TABLE IF NOT EXISTS config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

-- 接洽码（一次性）：审核员生成后线下交付申请人，提单时消耗
CREATE TABLE IF NOT EXISTS contact_key (
  id             TEXT PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  created_by     TEXT NOT NULL REFERENCES "user"(id),
  created_at     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused','used')),
  used_ticket_id TEXT,
  used_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_key_created_by ON contact_key(created_by);
CREATE INDEX IF NOT EXISTS idx_key_status ON contact_key(status);
