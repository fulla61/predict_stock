-- Crossimage Product OS BI-1 — SQLite schema（契約§3の18表）
-- audit_logs / approvals は追記専用（アプリコードにUPDATE/DELETE文を書かない）

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 1. clients
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,             -- CL-{NNNN}
  name TEXT NOT NULL,
  name_kana TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. users（CLIENTはclient_id必須、STAFFはNULL）
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('CLIENT','STAFF')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (role != 'CLIENT' OR client_id IS NOT NULL)
);

-- 3. sessions
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 4. id_sequences（採番: 単調増加のみ・再利用禁止）
CREATE TABLE IF NOT EXISTS id_sequences (
  scope_type TEXT NOT NULL,                   -- GLOBAL / PROJECT / YEAR
  scope_id TEXT NOT NULL,
  type_code TEXT NOT NULL,                    -- CI / DOC / ...
  last_no INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope_type, scope_id, type_code)
);

-- 5. projects
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,             -- CI-{YYYY}-{NNNN}
  client_id INTEGER NOT NULL REFERENCES clients(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONSULTATION',
  entry_route TEXT NOT NULL CHECK (entry_route IN ('IDEA','PRODUCT','SPEC','REPEAT')),
  ref_url TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);

-- 6. requirements（相談原文とAI分析結果）
CREATE TABLE IF NOT EXISTS requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  raw_text TEXT NOT NULL,
  analysis_json TEXT,                          -- AI分析（内部用。CLIENTへ生返却しない）
  ai_mode TEXT CHECK (ai_mode IN ('live','mock')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_requirements_project ON requirements(project_id);

-- 7. requirement_questions（不足質問≤2）
CREATE TABLE IF NOT EXISTS requirement_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  requirement_id INTEGER NOT NULL REFERENCES requirements(id),
  question_key TEXT NOT NULL,
  title TEXT NOT NULL,
  choices_json TEXT NOT NULL DEFAULT '[]',
  answer_value TEXT,
  answered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, question_key)
);

-- 8. spec_fields（理解カードの項目。AI推定は必ずAI_SUGGESTED）
CREATE TABLE IF NOT EXISTS spec_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  field_key TEXT NOT NULL,
  name_ja TEXT NOT NULL,
  value TEXT,
  unit TEXT,
  status TEXT NOT NULL CHECK (status IN ('CONFIRMED','PROVISIONAL','AI_SUGGESTED','UNKNOWN')),
  source TEXT NOT NULL CHECK (source IN ('FROM_INPUT','AI_INFERRED','CLIENT_ANSWER')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, field_key)
);

-- 9. project_attributes（ATTR_*タグ。AI提案→人間確定）
CREATE TABLE IF NOT EXISTS project_attributes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  attribute_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AI_SUGGESTED' CHECK (status IN ('AI_SUGGESTED','CONFIRMED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, attribute_code)
);

-- 10. project_dna（8軸推定。AI推定はAI_SUGGESTED）
CREATE TABLE IF NOT EXISTS project_dna (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL UNIQUE REFERENCES projects(id),
  axes_json TEXT NOT NULL,                     -- {exp_level:..,intent:..,...}
  status TEXT NOT NULL DEFAULT 'AI_SUGGESTED' CHECK (status IN ('AI_SUGGESTED','CONFIRMED')),
  ai_rationale TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 11. commercial_profiles（予算・数量はUNKNOWN可＝未記入でも案件開始可）
CREATE TABLE IF NOT EXISTS commercial_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL UNIQUE REFERENCES projects(id),
  budget_status TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (budget_status IN ('UNKNOWN','TARGET_UNIT_PRICE','MAX_UNIT_PRICE','TOTAL_PROJECT_BUDGET','FLEXIBLE','BENCHMARK')),
  quantity_status TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (quantity_status IN ('UNKNOWN','TARGET_QUANTITY','MIN_DESIRED','MAX_ACCEPTABLE','ANNUAL_FORECAST','TRIAL_LOT','FLEXIBLE_BASED_ON_MOQ')),
  budget_note TEXT,
  quantity_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 12. proposals
CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  round_no INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','REVISION_REQUESTED','SELECTED')),
  ai_mode TEXT NOT NULL CHECK (ai_mode IN ('live','mock')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_proposals_project ON proposals(project_id);

-- 13. proposal_options（3案）
CREATE TABLE IF NOT EXISTS proposal_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id INTEGER NOT NULL REFERENCES proposals(id),
  option_key TEXT NOT NULL,                    -- rec / small / cost
  title TEXT NOT NULL,
  concept TEXT NOT NULL,
  price_range_jpy TEXT NOT NULL,               -- 概算レンジ（工場確認前の目安）
  qty_from TEXT NOT NULL,
  lead_days TEXT NOT NULL,
  pros_json TEXT NOT NULL DEFAULT '[]',
  tradeoff TEXT NOT NULL,
  recommended INTEGER NOT NULL DEFAULT 0,
  selected_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (proposal_id, option_key)
);

-- 14. approvals（追記専用。判定は行追加で表現、UPDATE/DELETE禁止）
CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_table TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  request_type TEXT NOT NULL,                  -- PROPOSAL_APPROVAL 等
  action TEXT NOT NULL CHECK (action IN ('REQUEST','APPROVED','REVISION_REQUESTED')),
  actor_user_id INTEGER REFERENCES users(id),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 15. audit_logs（追記専用・削除不可）
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  actor_role TEXT,
  action TEXT NOT NULL,                        -- login / consult / generate / approve / select ...
  entity_type TEXT,
  entity_id INTEGER,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 16. documents（DOC通番。BI-1では控え等の予約領域）
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  public_id TEXT NOT NULL UNIQUE,              -- {ProjectID}-DOC-{NN}
  kind TEXT NOT NULL DEFAULT 'EXPORT',
  doc_type TEXT NOT NULL,
  title TEXT NOT NULL,
  meta_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 17. activity_timeline（表示用イベント。監査の正はaudit_logs）
CREATE TABLE IF NOT EXISTS activity_timeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  event_type TEXT NOT NULL,
  summary_ja TEXT NOT NULL,
  actor_user_id INTEGER,
  ref_table TEXT,
  ref_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 18. settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
