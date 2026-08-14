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

-- ============================================================
-- BI-2 追加（CONTRACT-2 §1: 8表追加 → 計26表）
-- clients への settings_json 列は db.ts の migrate() で ALTER TABLE 追加（破壊的変更なし）
-- ============================================================

-- 19. factories（工場台帳）
CREATE TABLE IF NOT EXISTS factories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,             -- FA-{NNNN}
  name TEXT NOT NULL,
  region TEXT,
  specialties TEXT,                            -- 得意分野（自由記述）
  risk_class TEXT NOT NULL DEFAULT 'FRISK_UNKNOWN', -- FRISK_LOW/FRISK_MEDIUM/FRISK_HIGH/FRISK_UNKNOWN
  channel_note TEXT,                           -- 対応チャネルメモ（WeChat ID等・手入力）
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 20. factory_notes（内部評価メモ・追記型。UPDATE/DELETEしない）
CREATE TABLE IF NOT EXISTS factory_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  factory_id INTEGER NOT NULL REFERENCES factories(id),
  note TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 21. rfqs（中国語RFQドラフト。送信自体は人間が実施）
CREATE TABLE IF NOT EXISTS rfqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,             -- {ProjectID}-RFQ-{NN}
  project_id INTEGER NOT NULL REFERENCES projects(id),
  body_zh TEXT NOT NULL,                       -- 中文ドラフト本文（内部用・顧客へ返さない）
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT')),
  sent_at TEXT,
  sent_channel TEXT,                           -- 手入力（WeChat/メール等）
  ai_mode TEXT CHECK (ai_mode IN ('live','mock')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rfqs_project ON rfqs(project_id);

-- 22. rfq_recipients（RFQ送付先工場）
CREATE TABLE IF NOT EXISTS rfq_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rfq_id INTEGER NOT NULL REFERENCES rfqs(id),
  factory_id INTEGER NOT NULL REFERENCES factories(id),
  UNIQUE (rfq_id, factory_id)
);

-- 23. quotes（工場見積。上書き禁止=新版行。UPDATE文を書かない）
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,             -- {ProjectID}-QT-{NN}
  rfq_id INTEGER NOT NULL REFERENCES rfqs(id),
  factory_id INTEGER NOT NULL REFERENCES factories(id),
  version_no INTEGER NOT NULL DEFAULT 1,
  supersedes_quote_id INTEGER REFERENCES quotes(id),
  currency TEXT NOT NULL CHECK (currency IN ('CNY','JPY','USD')),
  unit_price REAL NOT NULL,
  moq INTEGER NOT NULL,
  tooling_cost REAL,
  sample_cost REAL,
  lead_days INTEGER NOT NULL,
  valid_until TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (rfq_id, factory_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_quotes_rfq ON quotes(rfq_id);

-- 24. quote_conditions（見積条件）
CREATE TABLE IF NOT EXISTS quote_conditions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id),
  condition_type TEXT NOT NULL CHECK (condition_type IN ('MOQ','PRICE_TIER','TOOLING','LEADTIME','OTHER')),
  moq_dimension TEXT,
  threshold_qty INTEGER,
  value TEXT,
  note TEXT
);

-- 25. commercial_loops（実商流Loop）
CREATE TABLE IF NOT EXISTS commercial_loops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,             -- {ProjectID}-LOOP-{NN}
  project_id INTEGER NOT NULL REFERENCES projects(id),
  loop_no INTEGER NOT NULL DEFAULT 1,
  trigger_reason TEXT NOT NULL,                -- INITIAL / CUSTOMER_MODIFY
  feasibility_json TEXT NOT NULL,              -- 希望vs回答差分（内部用・顧客へ返さない）
  status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL','APPROVED')),
  ai_mode TEXT CHECK (ai_mode IN ('live','mock')),
  customer_decision TEXT CHECK (customer_decision IN ('ACCEPT','MODIFY','HOLD')),
  modify_note TEXT,
  decided_at TEXT,
  approval_id INTEGER REFERENCES approvals(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_loops_project ON commercial_loops(project_id);

-- 26. loop_options（顧客向けOption。based_on_quote_id/internal_noteは内部のみ・toClientView()で遮断）
CREATE TABLE IF NOT EXISTS loop_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loop_id INTEGER NOT NULL REFERENCES commercial_loops(id),
  option_key TEXT NOT NULL,                    -- a / b / c
  title TEXT NOT NULL,
  concept TEXT NOT NULL,
  customer_price_range TEXT NOT NULL,          -- 顧客向け表示価格レンジ（文字列）
  qty_from TEXT NOT NULL,
  lead_days TEXT NOT NULL,
  pros_json TEXT NOT NULL DEFAULT '[]',
  tradeoff TEXT NOT NULL,
  based_on_quote_id INTEGER REFERENCES quotes(id),  -- 内部のみ
  internal_note TEXT,                               -- 内部のみ
  recommended INTEGER NOT NULL DEFAULT 0,
  selected_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (loop_id, option_key)
);

-- ============================================================
-- BI-3 追加（CONTRACT-3 §1: 1表追加 → 計27表）
-- documents への file_name/mime_type/size_bytes/storage_path/uploaded_by_user_id/visibility/source 列、
-- projects への hide_initial_prices 列は db.ts の migrate() で ALTER TABLE 追加（非破壊）
-- ============================================================

-- 27. production_agreements（量産合意書 = G-02。public_id: {ProjectID}-GS-{NN}）
CREATE TABLE IF NOT EXISTS production_agreements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  public_id TEXT NOT NULL UNIQUE,             -- {ProjectID}-GS-{NN}
  version_no INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','PENDING_CUSTOMER','AGREED','SUPERSEDED')),
  approved_sample_doc_id INTEGER REFERENCES documents(id),
  check_items_json TEXT NOT NULL DEFAULT '[]',    -- [{name, criteria_ja, criteria_zh, method}] 3〜7件
  limit_samples_json TEXT NOT NULL DEFAULT '[]',  -- [{docId, label:'OK_LIMIT'|'NG', note}]
  tolerance_json TEXT,                             -- {defectRatePct, spareQty, note}
  responsibility_json TEXT,                        -- {inspectionPass, marketDefect, compensation}
  body_zh TEXT,                                    -- 中文版（工場向け。顧客名・販売価格・マージン混入禁止）
  customer_note TEXT,                              -- 顧客の修正希望（本人とSTAFFのみ閲覧）
  customer_decided_at TEXT,
  ai_mode TEXT CHECK (ai_mode IN ('live','mock')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agreements_project ON production_agreements(project_id);
