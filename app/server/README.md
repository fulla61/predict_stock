# Crossimage Product OS — server (Build Increment 1 + 2)

Node 20+ / TypeScript / Express / better-sqlite3。契約は `app/CONTRACT.md`（§1〜§5, §7）+ `app/CONTRACT-2.md`（§1 DB追加・§2 API・§4 受入基準）。

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

---

# Build Increment 2（CONTRACT-2）追記

## DB追加（8表追加 → 計26表）

factories(FA-{NNNN}), factory_notes(追記型), rfqs({ProjectID}-RFQ-{NN}), rfq_recipients,
quotes({ProjectID}-QT-{NN}・**上書き禁止=新版行** supersedes_quote_id で版連鎖), quote_conditions,
commercial_loops({ProjectID}-LOOP-{NN}), loop_options（based_on_quote_id / internal_note は内部のみ）

- `clients` に `settings_json` 列を `ALTER TABLE ADD COLUMN` で追加（`db.ts` migrate()内・非破壊）
- `settings` に係数をseed（CONFIGURABLE・既存値は上書きしない）:
  - `price_coefficient` = 1.35（顧客向け表示価格 = 見積単価 × 為替 × 係数）
  - `cny_jpy_rate` = 21 / （`usd_jpy_rate` 未設定時は150）
- `quotes` / `factory_notes` / `audit_logs` / `approvals` はコード上 UPDATE/DELETE なし（quotesの版更新は行追加のみ）

## API追加（11エンドポイント。★=STAFF / ☆=CLIENT）

| # | エンドポイント | 内容 |
|---|---|---|
| 1★ | `GET /admin/clients` | 会社一覧（進行中件数・状態内訳 ok/waiting/action・直近更新）+ 動きがあった案件 |
| 2★ | `GET /admin/clients/:id` | 会社詳細（projects + settings + 直近activity + 自動判定レベル） |
| 3★ | `PATCH /admin/clients/:id/settings` | 見え方の設定（EXP_*上書き / 既定の入り口 / 社内メモ）→ audit |
| 4★ | `GET/POST /admin/factories` | 工場一覧 / 登録（FA採番） |
| 5★ | `POST /admin/projects/:id/rfq` | **中国語RFQドラフト生成**（live: claude-haiku-4-5 + tool use / mock: 询价单テンプレート）→ rfqs保存・本文返却 |
| 6★ | `POST /admin/rfqs/:id/sent` | status=SENT（送信自体は人間がWeChat/メールで実施。二重送信は409） |
| 7★ | `POST /admin/rfqs/:id/quotes` | 見積の手入力取込（(rfq,factory)ごとに版採番・supersedes連鎖・conditions付き） |
| 8★ | `POST /admin/projects/:id/loop` | Feasibility分析（希望数量 vs 全Quote差分JSON）+ 顧客向けOption 2〜3案をAI生成 → PENDING_APPROVAL |
| 9★ | `PATCH /admin/loops/:id/options` / `POST /admin/loops/:id/approve` | 承認前の編集（価格レンジ等）/ 承認→顧客へ公開 |
| 10☆ | `GET /projects/:id`（拡張） | 承認済みloopがあれば `loop` にサニタイズ済みoptionsを同梱（STAFFには loops/rfqs/quotes 全項目） |
| 11☆ | `POST /loops/:id/decide` | ACCEPT=案確定→COMPLETED / MODIFY=理由記録→社内キュー着信（2周目はSTAFFが再度 /loop 実行） |

- `GET /admin/queue` を拡張: `loops`（Loop承認待ち）/ `modifyRequests`（顧客MODIFY着信）を追加（既存 `items` は不変）

## 遮断（最重要）

- 顧客向けOptionは **`views.ts` の `toClientView()` 系（`toLoopOptionClientView` / `toLoopClientView`）経由のみ**。
  返すフィールドは title/concept/customerPriceRange/qtyFrom/leadDays/pros/tradeoff/recommended（+key/selected）のみで、
  **factory名・quote原価・based_on_quote_id・internal_note・margin系は絶対に含めない**
- RFQ生成: `services/commerce.ts` の `buildRfqContext()` が予算・販売価格系フィールドをコンテキストから除外し、
  プロンプト（`RFQ_SYSTEM`）とmockテンプレートの両方で顧客販売価格・マージン・他工場情報の出力を禁止
- Loop Option生成: AIへは原価を渡さず、**係数適用済みの表示レンジ文字列のみ**を渡す（工場名も渡さない）。
  live経路でAIが新価格を作った場合は候補側のレンジで上書き

## audit追加アクション

`rfq_generate` / `rfq_sent` / `quote_add` / `loop_analyze` / `loop_approve` / `loop_decide` /
`client_settings_update` / `loop_options_edit` / `factory_create`（approvalsにも LOOP_APPROVAL の REQUEST/APPROVED 行を追記）

## シード拡張

`npm run seed` で工場2社を追加登録（既存ならスキップ）:

| public_id | 名称 | 地域 | 得意分野 | risk |
|---|---|---|---|---|
| FA-0001 | 宁波B工場 | 浙江省寧波市 | 生活雑貨・キッチン用品・シリコン成型 | FRISK_LOW |
| FA-0002 | 深圳C工場 | 広東省深圳市 | 電子小物・アクセサリー・小ロット対応 | FRISK_MEDIUM |

## 受入基準検証結果（2026-08-14 実施・実起動+curl）

環境: `ANTHROPIC_API_KEY` 未設定のため **mockフォールバック経路**（契約上これで正常）。34項目 PASS / 0 FAIL。

| 受入 | 確認内容 | 結果 |
|---|---|---|
| 1 | 工場2社（seed）+追加登録（FA採番）→RFQ生成（中文: 询价单/数量方案/品质要求/材质证明・测试报告/报价格式）→**本文に販売価格・マージン・予算・他工場情報なし**→送信済み化（二重送信409）→2社の見積入力+同一工場の新版（version_no=2, supersedes連鎖・上書きなし） | OK |
| 2 | Loop分析（feasibility差分JSON+Option2〜3案, PENDING_APPROVAL）→STAFFが価格レンジ編集→承認→CLIENTの `GET /projects/:id` に「選べる進め方」表示。**応答JSONのキーは key/title/concept/customerPriceRange/qtyFrom/leadDays/pros/tradeoff/recommended/selected のみで、工場名・原価・internalNote・basedOnQuoteId・quote参照が存在しないことをアサート** | OK |
| 3 | CLIENT MODIFY（「もう少し数量を減らしたい」）→`/admin/queue` の modifyRequests に要望文付きで着信→MODIFY後はCLIENTのloop非表示（再調整中）→2周目再分析（loopNo=2, trigger=CUSTOMER_MODIFY）→承認→CLIENT ACCEPT→project=COMPLETED・selectedOptionKey記録 | OK |
| 4 | `PATCH /admin/clients/:id/settings` でレベル上書き（EXP_BEGINNER）→ audit_logs に `client_settings_update`（before/after付き）。rfq_generate/rfq_sent/quote_add/loop_analyze/loop_approve/loop_decide も全て追記済みを確認 | OK |
| 回帰 | Increment 1フロー（相談→理解カード→質問回答→提案生成→STAFF承認→顧客3案表示→選択）7項目すべて回帰なし | OK |
| 遮断 | CLIENT→/admin/* は403 / 他社・不存在loopのdecideは404 | OK |
| 型 | `npm run check`（tsc --noEmit）エラーゼロ | OK |

---

# Build Increment 3（CONTRACT-3）追記

## DB追加（1表追加 → 計27表 + 非破壊ALTER）

- 新表 `production_agreements`（量産合意書=G-02。public_id `{ProjectID}-GS-{NN}`・version_no・status `DRAFT/PENDING_CUSTOMER/AGREED/SUPERSEDED`・check_items_json・limit_samples_json・tolerance_json・responsibility_json・body_zh・customer_note）
- `documents` へ ALTER 追加: `file_name / mime_type / size_bytes / storage_path / uploaded_by_user_id / visibility(DEFAULT 'CLIENT_VISIBLE') / source`（doc_type='UPLOAD' を流用）
- `projects` へ ALTER 追加: `hide_initial_prices INTEGER NOT NULL DEFAULT 0`
- settings seed 追加: `market_price_bias = 1.2`（初回3案の高め係数・CONFIGURABLE）

## ファイルアップロード

- 依存追加: `multer`（+ `@types/multer`）
- 実体: `DATA_DIR/uploads/{projectId}/{docId}_{安全化ファイル名}`（`config.dbPath` のディレクトリ基準 → 本番は永続ディスクに載る）
- **静的配信は一切しない**。取得は必ず `GET /api/documents/:id/file`（認証+テナント確認。CLIENTはCLIENT_VISIBLEのみ・INTERNAL/他社は404）
- 上限15MB（超過は413）。MIME allowlist: png/jpg/jpeg/webp/gif/pdf/xlsx/xls/csv/docx/doc/zip（拡張子allowlist + MIME一致検証。`.sh`等は400）
- ファイル名は拡張子を保持したまま危険文字を `_` に置換（パス区切り・制御文字除去）

## API追加（15項目。★=STAFF / ☆=CLIENT / ◆=両Role）

| # | エンドポイント | 内容 |
|---|---|---|
| 1◆ | `POST /projects/:id/documents` | multipart {file, title?, visibility?, source?}。CLIENTは強制 CLIENT_VISIBLE/CLIENT（INTERNAL指定しても無視）。STAFF既定はINTERNAL |
| 2◆ | `GET /projects/:id/documents` | CLIENTはCLIENT_VISIBLEのみ。レスポンスに storage_path/内部ユーザー情報なし（ロールラベルのみ） |
| 3◆ | `GET /documents/:id/file` | テナント確認後にContent-Dispositionでファイル返却 |
| 4★ | `POST /admin/projects/:id/note` | 30秒記録 → timeline NOTE + audit |
| 5★ | `POST /admin/projects/:id/agreement` | AIが仕様からチェック項目3〜7件（測れる文・日中）+許容条件を下書き → DRAFT作成（mockフォールバック対応） |
| 6★ | `PATCH /admin/agreements/:id` | DRAFTのみ。checkItems/limitSamples（案件内docのみ参照可）/tolerance/responsibility/approvedSampleDocId |
| 7★ | `POST /admin/agreements/:id/vague-check` | 曖昧語（綺麗・しっかり・ちゃんと・高品質・問題ない・丈夫 等）検出+書き直し案（mockは正規表現辞書） |
| 8★ | `POST /admin/agreements/:id/send` | body_zh（质检标准: 编号/检验项目表/限度样品/允收标准AQL/责任划分）生成 → PENDING_CUSTOMER。**顧客名・JPY価格・マージン混入禁止（コンテキストに渡さない設計）** |
| 9★ | `GET /admin/agreements/:id/export.md` | 日中併記md（WeChat転送用。顧客名・価格なし） |
| 10☆ | `GET /projects/:id`（拡張）/ `POST /agreements/:id/decide` | client viewに `agreement`（PENDING_CUSTOMER/AGREEDのみ・body_zh含む）同梱 / APPROVE→AGREED・REQUEST_CHANGE→DRAFT+customer_note保存→社内キュー着信 |
| 11☆ | `GET /projects` | 自社案件一覧（リピート入口の選択用） |
| 12☆ | `POST /consultations`（拡張） | `sourceProjectId?`（REPEATのみ・自社のみ）。spec_fields（status→PROVISIONAL・「引き継ぎ元」項目で出所明示）/project_dna/project_attributesをコピーし、質問は差分のみ≤2 |
| 13★ | `POST /admin/clients` | client(CL採番)+CLIENT user作成（bcrypt）。メール重複は409 |
| 14 | 初回3案の価格 | mock/liveともレンジへ `market_price_bias` を乗算（live promptにも高め側指示）。`hide_initial_prices=1` の案件はCLIENTレスポンスから `priceRangeJpy` キー自体を除外 |
| 15★ | `PATCH /admin/proposals/:id/options` / `POST /admin/projects/:id/pricing-mode` | PENDING_APPROVAL中の価格レンジ編集 / 金額非表示モード切替 |

- `GET /admin/queue` を拡張: `agreementsPending`（顧客回答待ち）/ `agreementChangeRequests`（顧客修正希望着信）を追加（既存キーは不変）
- `GET /projects/:id` STAFF viewに `agreements` / `documents` / `hideInitialPrices` を追加

## 遮断（BI-3分）

- 顧客向けdocumentは `toDocumentClientView()` 経由のみ: **storage_path・uploaded_by_user_id・visibility・氏名を含めない**（ロールラベルのみ）。INTERNAL資料は一覧にもファイルAPIにも存在しない扱い（404）
- 合意書の中文生成・export.mdは **顧客企業名・JPY販売価格・マージンをコンテキストに渡さない**（プロンプト制約も併用）
- `customer_note` は記入した本人（当該client）とSTAFFのみ到達可能な経路でのみ返却
- 金額非表示モード時はCLIENT向け提案JSONに価格キーが存在しない（`toOptionView(rows, hidePrices)`）

## audit / timeline 追加

audit: `doc_upload / note_add / agreement_create / agreement_edit / agreement_send / agreement_decide / client_create / proposal_options_edit / pricing_mode_change`
timeline: `DOC_UPLOADED / NOTE / AGREEMENT_DRAFTED / AGREEMENT_SENT / AGREEMENT_AGREED / AGREEMENT_CHANGE_REQUESTED / PROPOSAL_PRICE_EDITED / PRICING_MODE_CHANGED`

## 検証結果（2026-08-14 実施・DB初期化→実起動+curl。ANTHROPIC_API_KEY未設定=mockフォールバック経路）

| # | 確認項目 | 結果 |
|---|---|---|
| 1 | CLIENT画像添付→STAFFが閲覧可 / STAFFのINTERNAL資料がCLIENTの一覧・APIに現れない（`INTERNAL`/`storage_path` 文字列の混入ゼロをアサート） | OK |
| 2 | CLIENTはINTERNALファイル取得404 / 他社CLIENTは他社ファイル・案件・合意書すべて404 / 未認証401 | OK |
| 3 | `.sh` アップロード400（allowlist外）/ MIME・拡張子不一致400 / 15MBちょうど200・15MB+1は413 | OK |
| 4 | CLIENTがvisibility=INTERNALを指定しても強制CLIENT_VISIBLE | OK |
| 5 | 合意書AI下書き（GS採番・チェック項目6件・日中・許容条件）→曖昧語チェックが「綺麗」「しっかり」を指摘（書き直し案付き）→修正後は指摘0件 | OK |
| 6 | 限度見本（OK/NG・案件内docのみ）・許容・責任分界・承認サンプル設定→送信でbody_zh生成（质检标准/限度样品/责任划分を含み、顧客名・¥・円・マージンを含まない）→PENDING_CUSTOMER | OK |
| 7 | CLIENT: REQUEST_CHANGE→DRAFTへ戻りqueueの`agreementChangeRequests`に要望文付き着信→再送→APPROVE→AGREED（G-02成立・timeline記録）。AGREED後のPATCH/再decideは409 | OK |
| 8 | export.mdに中文が含まれ顧客名・価格なし | OK |
| 9 | REPEAT: `GET /projects`で前回案件選択→spec_fields引き継ぎ（PROVISIONAL・「引き継ぎ元 CI-xxxx」項目）+DNA/属性コピー→質問は差分のみ1問（qty再質問なし）。IDEA+sourceProjectIdは400・他社sourceは404 | OK |
| 10 | 初回3案に market_price_bias 1.2 が乗算（¥980〜1,180 → ¥1,180〜1,420 等） | OK |
| 11 | STAFFがPENDING中に価格レンジ編集→承認→CLIENTに編集後の数字表示 | OK |
| 12 | 金額非表示モード: CLIENT JSONから`priceRangeJpy`キー自体が消える（3案は表示・`hideInitialPrices:true`）。STAFFは引き続き価格閲覧可。OFFに戻すと再表示 | OK |
| 13 | お客様追加（CL-0002採番）→新規CLIENTでログイン成功。メール重複409 | OK |
| 14 | audit（doc_upload〜pricing_mode_change 9種）/ timeline（DOC_UPLOADED〜PRICING_MODE_CHANGED 8種）追記を確認 | OK |
| 15 | 回帰: BI-1相談→理解→回答→提案→承認→選択 / BI-2 RFQ→送信済み→見積2社→Loop分析→承認→CLIENT表示（工場名・internalNoteなし）→ACCEPT すべて動作 | OK |
| 16 | `npm run check`（tsc --noEmit）エラーゼロ | OK |

ファイル実体は `data/uploads/{projectId}/{docId}_{ファイル名}` に保存されることを確認（本番はDATA_DIR配下）。
