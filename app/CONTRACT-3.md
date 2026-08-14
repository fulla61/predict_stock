# Build Increment 3 実装契約 — 実案件運用の土台（アップロード・量産合意書・リピート・依頼ガイド・顧客発行）

Status: v1.0 / 2026-08-14 / 秘書AI。CONTRACT.md / CONTRACT-2.md の上に追加。矛盾時は本書が優先。
目的貢献: ④クレームが少ない（量産合意書=G-02）/ ⑦リピート時は前回より簡単 / ①顧客の手間減（依頼ガイド・決めることマップ）/ ②手作業減（30秒記録・アカウント発行）。
オーナー承認: 2026-08-14「それで作ってほしい」（段階×到達順の修正案に対して）。P-17〜P-20対応。

## 0. スコープ
1. ファイルアップロード（顧客・社内両方。documents表のUI化+実ファイル保存）
2. 量産合意書（Production Agreement = G-02 の最小実装。AI下書き+曖昧語検出+中文生成+顧客承認）
3. リピート引き継ぎ（REPEAT入口で前回案件から仕様コピー→差分だけ質問）
4. 依頼ガイド軽量版（入口別の実例テンプレ挿入+「決めることマップ」常設）
5. お客様アカウント発行（管理画面から client+user 作成）
6. P-17 価格方針（初回3案: 高め係数・承認画面でスタッフが数値編集・案件単位の金額非表示モード）
**やらないこと**: LINE/WeChat自動連携・HP埋め込みフォーム（Backlog P-21）・サンプル/検品の工程管理・署名捺印の電子契約。

## 1. DB（非破壊ALTER+1表追加 → 計27表）
- documents へ ALTER 追加: `file_name TEXT, mime_type TEXT, size_bytes INTEGER, storage_path TEXT, uploaded_by_user_id INTEGER, visibility TEXT NOT NULL DEFAULT 'CLIENT_VISIBLE', source TEXT`（visibility: CLIENT_VISIBLE|INTERNAL / source: CLIENT|STAFF|CN）。既存kind/doc_typeは流用（doc_type='UPLOAD'）。
- projects へ ALTER 追加: `hide_initial_prices INTEGER NOT NULL DEFAULT 0`
- 新表 production_agreements: id, project_id FK, public_id `{ProjectID}-GS-{NN}`, version_no, status `DRAFT|PENDING_CUSTOMER|AGREED|SUPERSEDED`, approved_sample_doc_id FK documents NULL可, check_items_json（[{name, criteria_ja, criteria_zh, method}] 3〜7件）, limit_samples_json（[{docId, label:'OK_LIMIT'|'NG', note}]）, tolerance_json（{defectRatePct, spareQty, note}), responsibility_json（{inspectionPass, marketDefect, compensation}）, body_zh TEXT, customer_note TEXT, customer_decided_at, created_at
- settings seed 追加: `market_price_bias='1.2'`（初回概算の高め係数・CONFIGURABLE）
- ファイル実体: `DATA_DIR/uploads/{projectId}/{docId}_{安全化ファイル名}`。**静的配信禁止**（必ず認証+テナント確認付きAPI経由）。multer使用（server依存に追加）。上限15MB。MIME allowlist: png/jpeg/webp/gif/pdf/xlsx/xls/csv/docx/doc/zip。

## 2. API追加（既存パターン踏襲: zod・audit・timeline・toClientView遮断）
アップロード:
1. POST `/projects/:id/documents` ★両Role multipart {file, title?, visibility?, source?} — CLIENTは強制 visibility=CLIENT_VISIBLE/source=CLIENT。STAFFはvisibility选択可（既定INTERNAL）→ {document}
2. GET `/projects/:id/documents` ★ — CLIENTはCLIENT_VISIBLEのみ
3. GET `/documents/:id/file` ★ — テナント確認後にファイル返却（Content-Disposition; CLIENTはCLIENT_VISIBLEのみ）
4. POST `/admin/projects/:id/note` ★STAFF {text} → timelineへNOTE記録（30秒記録。添付は1.で）
量産合意書:
5. POST `/admin/projects/:id/agreement` ★STAFF → AIが仕様から check_items 下書き（3〜7件・測れる文・mockフォールバック）を生成しDRAFT作成 → {agreement, aiMode}
6. PATCH `/admin/agreements/:id` ★STAFF {checkItems?, limitSamples?, toleranceJson?, responsibilityJson?, approvedSampleDocId?} — DRAFTのみ編集可
7. POST `/admin/agreements/:id/vague-check` ★STAFF → AIが曖昧語（「綺麗」「しっかり」等）を検出し書き直し案 → {findings:[{itemIndex, phrase, suggestion}], aiMode}
8. POST `/admin/agreements/:id/send` ★STAFF → body_zh生成（中文版・工場向け。顧客価格/マージン/顧客名の混入禁止）→ status=PENDING_CUSTOMER
9. GET `/admin/agreements/:id/export.md` ★STAFF → 日中併記の.mdダウンロード（WeChat転送用）
10. CLIENT: GET `/projects/:id`（拡張: agreement同梱〔サニタイズ: body_zhは含めるが内部メモ系なし〕）/ POST `/agreements/:id/decide` ★CLIENT {decision:'APPROVE'|'REQUEST_CHANGE', note?} — APPROVE→AGREED（G-02成立・timeline)/REQUEST_CHANGE→DRAFTへ戻し customer_note保存→社内キュー表示
リピート:
11. GET `/projects` ★CLIENT → 自社案件一覧（id, publicId, title, state, updatedAt）
12. POST `/consultations` 拡張: {sourceProjectId?} — entryRoute='REPEAT'時に指定可。spec_fields/project_dna/project_attributesを新案件へコピー（status=PROVISIONAL・出所メモ）。AIは差分だけ質問（≤2）
顧客発行:
13. POST `/admin/clients` ★STAFF {companyName, contactName, email, tempPassword} → client(CL採番)+user作成 → {clientId, publicId}（メール重複は409）
価格方針:
14. 初回3案生成: レンジに settings.market_price_bias を乗算（live promptにも「高め側の相場」を明示）。projects.hide_initial_prices=1 の案件はCLIENTレスポンスから price レンジを除外し UI は「概算金額は工場確認後にご提示します」
15. PATCH `/admin/proposals/:id/options` ★STAFF {options:[{key, priceRangeJpy?}]} — PENDING_APPROVAL中に編集可 / POST `/admin/projects/:id/pricing-mode` {hideInitialPrices:boolean}

## 3. Web
顧客 `/`:
- 入口4分岐の各分岐に**実例テンプレchips**（2〜3件/分岐。タップで入力欄へ雛形挿入。IDEA=曖昧でOKの見本, PRODUCT=「この商品を◯個・いつまでに」型, SPEC=仕様列挙型, REPEAT=前回参照型）
- REPEAT選択時: 自社の過去案件select（11.）→「前回の内容を引き継ぐ」
- 案件画面に**決めることマップ**常設: 相談→提案→工場確認→サンプル→量産合意→生産→検品→お届け の横レール。各段に「お客様が決めること/Crossimageがやること」ツールチップ、現在地ハイライト
- **添付**: 相談時+案件画面でファイル添付（画像プレビュー）。「参考画像・図面などあればどうぞ」
- **量産合意書画面**: 承認サンプル写真・チェック項目（日本語）・限度見本写真（OK/NG）・許容条件を表示 →「この内容で合意する」/「修正を希望する（自由記入）」。合意後はAGREEDバッジ
- hide_initial_prices時の3案は金額行の代わりに説明文
社内 `/admin`:
- お客様一覧に**「お客様を追加」**（会社名・担当者名・メール・仮パスワード。作成後に仮PW表示）
- 承認キュー詳細: 3案の**価格レンジ直接編集**+「金額非表示で公開」トグル
- 案件詳細に**資料セクション**（一覧・アップロード・visibility切替）と**30秒記録**（テキスト+添付→タイムライン）
- 案件詳細に**量産合意書セクション**: 「AIで下書き作成」→チェック項目編集（曖昧語チェックボタン→指摘をインライン表示）→限度見本写真の選択（アップロード済みから）→許容・責任分界入力→「顧客へ送る」→顧客合意待ち/AGREED表示、.mdダウンロード
- ホーム判断キューに「量産合意書の顧客修正希望」着信
- タイムラインにNOTE/UPLOAD/AGREEMENT系イベント表示

## 4. 受入基準（E2E）
1. CLIENT: 相談時に画像添付→STAFFが案件詳細で閲覧できる。STAFFがINTERNAL資料を上げてもCLIENTの一覧・APIレスポンスに現れない
2. STAFF: 合意書AI下書き→曖昧語チェックが「綺麗」等を指摘→修正→限度見本写真設定→顧客へ送信。CLIENT: 合意書を承認→AGREED・タイムライン記録。export.mdに中文が含まれ顧客名・価格が無い
3. CLIENT(REPEAT): 前回案件を選んで相談→理解カードに前回仕様が引き継ぎ表示（PROVISIONAL）→質問は差分のみ≤2
4. STAFF: 3案の価格レンジを編集して公開→CLIENTに編集後の数字が表示。別案件で金額非表示モード→CLIENTに金額が出ず説明文表示
5. STAFF: お客様を追加→新規CLIENTでログイン成功。既存Increment 1/2フロー回帰
