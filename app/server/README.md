# Crossimage Product OS — server (Build Increment 1)

Node 20+ / TypeScript / Express / better-sqlite3。契約は `app/CONTRACT.md`（§1〜§5, §7が本サーバーの範囲）。

## セットアップ

```bash
cd app/server
npm install
cp .env.example .env   # 必要に応じて編集（無ければ .env.example の値を既定として読む）
npm run seed           # 初期ユーザー作成
npm run dev            # 開発（tsx watch）
# npm run start        # 起動
# npm run check        # 型チェック（tsc --noEmit）
```

## 環境変数（.env / .env.example）

| 変数 | 既定 | 説明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | （空） | 未設定なら**構造化モックAI**へ自動フォールバック（`ai_mode:"mock"`） |
| `SESSION_SECRET` | change-me-in-production | セッション用シークレット |
| `AUTO_APPROVE_PROPOSALS` | false | trueなら提案を即APPROVED、falseなら承認キューへ |
| `PORT` | 8787 | |
| `SEED_STAFF_PW` | changeme-staff | シードSTAFF初期パスワード |
| `SEED_CLIENT_PW` | changeme-client | シードCLIENT初期パスワード |

## シードアカウント

| ロール | メール | 初期パスワード |
|---|---|---|
| STAFF | `admin@crossimage.jp` | `SEED_STAFF_PW`（既定: `changeme-staff`） |
| CLIENT（デモ株式会社） | `demo@example.co.jp` | `SEED_CLIENT_PW`（既定: `changeme-client`） |

## AIモード

- `ANTHROPIC_API_KEY` 設定時: Anthropic API（モデル: `claude-haiku-4-5`・高速/低コスト帯）。出力はtool useで強制JSON、失敗時1リトライ→モック。
- 未設定時: prototype/consultation.html の6分類ロジックを移植した構造化モック。
- どちらの経路でもレスポンスに `aiMode: "live" | "mock"` を含める（mock時はUIで「デモAI」バッジ表示）。
- AI Data Scope: プロンプトへは当該projectの相談文・理解カード・回答のみを渡す（他client・他project・内部原価は渡さない）。価格はすべて「工場確認前の目安」の概算レンジで、断定価格を禁止するプロンプト制約入り。

## DB

- SQLite: `server/data/app.db`（初回起動/seed時に `src/db/schema.sql` から自動作成）
- 18表: clients, users, sessions, id_sequences, projects, requirements, requirement_questions, spec_fields, project_attributes, project_dna, commercial_profiles, proposals, proposal_options, approvals, audit_logs, documents, activity_timeline, settings
- `audit_logs` / `approvals` は追記専用（コードにUPDATE/DELETE文なし。承認判定は行追加で表現）
- `projects.public_id` は `CI-{YYYY}-{NNNN}`（`id_sequences` でトランザクション内採番・再利用禁止）
- AI推定のspec_fieldsは必ず `AI_SUGGESTED`（未定は `UNKNOWN`）。自動昇格なし。

## API（prefix /api、エラー形式 `{error:{code,message}}`）

1. `POST /auth/login` / 2. `POST /auth/logout` / 3. `GET /me`
4. `POST /consultations`（CLIENT。project+requirement作成→即analyze→理解カード+質問≤2を同梱）
5. `POST /projects/:id/answers`（CLIENT）
6. `POST /projects/:id/proposals`（CLIENT。AUTO_APPROVE=falseなら`pending_approval`）
7. `GET /projects/:id`（CLIENT=自社のみ・サニタイズ済 / STAFF=全項目）
8. `POST /proposals/:optionId/select`（CLIENT）
9. `GET /admin/queue`（STAFF）
10. `POST /admin/proposals/:id/approve` / `POST /admin/proposals/:id/revise`（STAFF。reviseは再生成→再びPENDING）

セキュリティ: `cx_session` httpOnly/SameSite=Lax cookie（24h）、bcrypt、zod入力検証、login/consultationsに10req/分/IPの簡易レートリミット、repo層で全クエリ`client_id`スコープ（テナント分離）、CLIENT向けレスポンスは `src/views.ts` の整形関数経由のみ。`web/dist` が存在すれば静的配信（無くてもAPIは動作）。

## 起動確認結果（2026-08-14 実施）

環境: `ANTHROPIC_API_KEY` 未設定のため **mockフォールバック経路** で確認（契約上これで正常）。`AUTO_APPROVE_PROPOSALS=false`。

| # | 確認項目 | 結果 |
|---|---|---|
| 1 | CLIENTログイン → 相談投稿（予算・数量未記入） | OK。`CI-2026-0001` 採番、理解カードでqty/budgetが `AI_INFERRED`/`UNKNOWN`、商品/用途/こだわりが `FROM_INPUT` |
| 2 | 質問回答（数量「まず少量(〜500)」） | OK。理解カードのqtyが `FROM_INPUT`/`PROVISIONAL` に更新 |
| 3 | 提案生成 | OK。`{status:"pending_approval", aiMode:"mock"}` |
| 4 | 顧客ビューは「確認中」（提案内容非公開） | OK。`proposal.state = "pending_approval"` で中身なし |
| 5 | STAFFログイン → /admin/queue → approve | OK。キューに1件表示 → `{ok:true,status:"APPROVED"}` |
| 6 | 承認後、顧客に3案表示（価格は「工場確認前の目安」レンジ） | OK |
| 7 | 顧客が選択 | OK。`{ok:true,selectedOptionId:1}`、proposals.status=SELECTED |
| 8 | テナント分離: CLIENTが他project取得 → 404 / CLIENTが/admin/queue → 403 / 未ログイン → 401 | OK |
| 9 | CLIENTレスポンスJSONに `margin/cost/prompt` 系フィールドなし | OK（grepで検出ゼロ） |
| 10 | audit_logsに login/consult/answer/generate/approve/select が追記 | OK（approvalsもREQUEST/APPROVED行追加を確認） |
| 11 | 数量・予算明示時の抽出（「3,000枚」「1枚300円以内」） | OK。`FROM_INPUT` として抽出 |
| 12 | revise: 修正指示→再生成→新提案がPENDINGでキューに再掲 | OK |
| 13 | 承認前のoption選択 → 409 | OK |
| 14 | ログインレートリミット（10req/分/IP超で429） | OK |
| 15 | `npm run check`（tsc --noEmit） | OK（エラーなし） |

ANTHROPIC_API_KEY を設定して起動すると同一フローが `aiMode:"live"`（claude-haiku-4-5）で動作する。live経路のAPI失敗時は1リトライ後にモックへ自動フォールバックする。
