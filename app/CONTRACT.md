# Crossimage Product OS — Build Increment 1 実装契約（API/構成/規約）

Status: v1.0 / 2026-08-13 / 秘書AI。バックエンド・フロントエンド実装は本契約に従う。矛盾時は本契約が正。
準拠: docs/crossimage-product-os/ 05(v3.2 Governance) / 15(データ設計) / 25(§18.1 Security Baseline) / 27(Frontend Architecture) / 28(§3 Build Increment 1)。

## 0. スコープ（Increment 1のみ）
顧客: ログイン → 相談投稿 → AI整理（理解カード+質問≤2）→ 3案提案 → 選択。
社内: ログイン → 承認キュー → 提案の承認/修正 → 顧客へ公開。
**やらないこと**: Loop周回・RFQ・Cost Ledger・中国側・visual-engine接続（イベント発火点のみ）・通知メール。

## 1. 構成
```
app/
  CONTRACT.md          # 本書
  server/              # Node 20+ / TypeScript / Express / better-sqlite3
    src/ …             # routes, services(ai/…), repo(データアクセス層), db(schema.sql, migrate)
    .env.example       # ANTHROPIC_API_KEY= / SESSION_SECRET= / AUTO_APPROVE_PROPOSALS=false / PORT=8787
  web/                 # Vite / React / TypeScript（SPA）
    src/ …             # pages(consult, admin, login), components, styles/tokens.css
  shared/
    api-types.ts       # 本契約のリクエスト/レスポンス型（両側でimport）
```
- 本番形態: server が web/dist を静的配信（単一プロセス）。開発: Vite devサーバー + proxy `/api`→8787。
- Node実行: tsx（server）。テスト: Playwright（既存 /opt/pw-browsers/chromium）。

## 2. 認証・Role・テナント分離（Security Baseline MVP該当分）
- セッション: httpOnly + SameSite=Lax cookie（`cx_session`）、有効24h、bcryptパスワード。
- Role: `CLIENT`（client_idに紐付く）/ `STAFF`（社内。全client閲覧可）。
- **テナント分離**: repo層の全クエリが `client_id` スコープ必須（CLIENTは自社のみ。関数シグネチャで強制、生SQLの直接呼出をroutesから禁止）。
- 監査: `audit_logs` は追記専用（UPDATE/DELETE文を書かない）。who/when/action/entity/before/after(JSON)/reason。
- 入力検証: zod。ログイン・相談投稿に簡易rate limit（メモリ、10req/分/IP）。
- 遮断: CLIENT向けレスポンスに内部フィールド（原価・マージン・AI生プロンプト・他client情報）を含めない。レスポンス整形は`toClientView()`系関数経由のみ。

## 3. DB（SQLite: server/data/app.db。18表・15番の定義に準拠、snake_case）
clients, users, sessions, id_sequences, projects, requirements, requirement_questions,
spec_fields, project_attributes, project_dna, commercial_profiles, proposals, proposal_options,
approvals, audit_logs, documents, activity_timeline, settings
- projects.public_id = `CI-{YYYY}-{NNNN}`（id_sequencesで採番、再利用禁止）。
- spec_fields.status: `CONFIRMED/PROVISIONAL/AI_SUGGESTED/UNKNOWN`。AI推定は必ず `AI_SUGGESTED`（Governance: 自動昇格禁止）。
- commercial_profiles.budget_status/quantity_status: Governance §3 enum（UNKNOWN可）。
- proposals.status: `DRAFT/PENDING_APPROVAL/APPROVED/REVISION_REQUESTED/SELECTED`。

## 4. AIサービス（server/src/services/ai.ts）
- **実装前に `claude-api` スキルをSkillツールで読み込むこと**（バックエンド担当の義務）。
- Anthropic SDK使用。`ANTHROPIC_API_KEY` 未設定時は**構造化モック**（prototype/consultation.html の6分類ロジック移植）へ自動フォールバックし、レスポンスに `ai_mode: "live"|"mock"` を含める。
- 2関数: `analyzeRequirement(text, attachmentsMeta)` → 理解フィールド（項目/値/根拠source: FROM_INPUT|AI_INFERRED）+ 不足質問≤2（選択肢付き）+ DNA推定。`generateProposals(project全文脈)` → 3案（title/concept/price_range_jpy/qty_from/lead_days/pros[2]/tradeoff/recommended flag）。
- **AI Data Scope**: プロンプトへは当該projectの入力・回答のみ（他client・他projectデータ・内部原価を渡さない）。出力はJSON強制（tool use or JSON schema）で受け、失敗時1リトライ→モック。
- 価格等はすべて概算レンジ（「工場確認前の目安」）。断定価格の生成を禁止するプロンプト制約を入れる。

## 5. API（prefix /api、エラー形式 `{error:{code,message}}`、認証必須は★）
1. `POST /auth/login` {email,password} → {user:{id,name,role,clientId?}}
2. `POST /auth/logout` ★
3. `GET  /me` ★
4. `POST /consultations` ★CLIENT {text, entryRoute:"IDEA"|"PRODUCT"|"SPEC"|"REPEAT", refUrl?} → {projectId, publicId}（project+requirement作成→即analyze実行→結果同梱: {understanding, questions, aiMode}）
5. `POST /projects/:id/answers` ★CLIENT {answers:[{questionId,value}]} → {understanding更新}
6. `POST /projects/:id/proposals` ★CLIENT（生成。AUTO_APPROVE_PROPOSALS=true なら即APPROVED、falseなら PENDING_APPROVAL で {status:"pending_approval"} を返し顧客UIは「担当者確認中」表示）
7. `GET  /projects/:id` ★（CLIENT=自社のみ・サニタイズ済 / STAFF=全項目）→ 理解・質問・提案（APPROVED以降のみCLIENTへ）・選択状態
8. `POST /proposals/:optionId/select` ★CLIENT → 選択記録+audit
9. `GET  /admin/queue` ★STAFF → 承認待ち提案一覧（project要約付き）
10. `POST /admin/proposals/:id/approve` ★STAFF {note?} / `POST /admin/proposals/:id/revise` {instruction} → 再生成→再びPENDING
- シード: `npm run seed` で STAFF 1名（admin@crossimage.jp / 初期PWは.envから）+ デモCLIENT 1社1名を作成。

## 6. フロントエンド（web）
- ルート: `/login`, `/`（顧客: 相談フロー。prototype/consultation.html のSTEP1〜5の体験・文言・トーンを踏襲し、状態はAPI駆動へ置換）, `/admin`（承認キュー+承認/修正。1画面1判断）。
- デザイン: prototype/consultation.html から**トークンとOutfit @font-faceを styles/tokens.css へ抽出して継承**。コンポーネントライブラリ導入禁止（27番決定）。日本語UI・§14言語ルール（専門用語は「用語（説明）」）。
- 状態: サーバー状態はfetch+軽量hook（TanStack Query導入は任意、無くても可）。認証ガード（未ログイン→/login、Role別リダイレクト）。
- 提案が PENDING_APPROVAL のとき顧客には「担当者が内容を確認しています（通常1営業日以内）」画面。ポーリング10s。
- visual-engine接続点: `window.dispatchEvent(new CustomEvent('cx-visual',{detail:{state:'PROPOSAL_READY'}}))` のみ（購読側なし）。

## 7. 受入基準（E2Eで検証）
1. CLIENTログイン→相談投稿（予算・数量未記入でも可）→理解カードにFROM_INPUT/AI_INFERRED区別表示→質問回答→提案生成。
2. AUTO_APPROVE=false時: 顧客は「確認中」、STAFFが/adminで承認→顧客画面に3案表示→選択完了。
3. CLIENT Aのセッションで CLIENT Bのproject取得→404/403。CLIENTレスポンスJSONに `margin|cost|prompt` 系フィールドが存在しない。
4. audit_logsに login/consult/generate/approve/select が追記される。ai_mode がUIに小さく表示される（mock時「デモAI」バッジ）。
