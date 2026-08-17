# Build Increment 4 実装契約 — サンプル〜生産〜検品〜輸送〜納品〜振り返り（後工程の最小実装）

Status: v1.0 / 2026-08-14 / 秘書AI。CONTRACT.md / -2 / -3 の上に追加。矛盾時は本書が優先。
目的貢献: ④クレームが少ない（G-02ゲート強制・検品記録）/ ①顧客の手間減（進捗が見える=「どうなってる？」チャット削減）/ ⑤利益が見える一歩手前（ロット・検品・輸送の実績記録）/ ⑦リピート（納品後フィードバック=P-12）。
オーナー承認: 2026-08-14「続行して」（前回報告の「残る大物」に対して）。

## 0. スコープ
1. サンプル往復（依頼→到着→写真→顧客の見本承認/修正希望）
2. 生産ロット（**G-02ハードゲート: 合意書AGREEDでないと開始不可**）
3. 検品（合格/不合格・不良数と許容率の突合・写真）
4. 輸送・輸入（船便/航空便・出発/到着予定・通関ステータス）
5. 納品と受取確認 + ひとことフィードバック（P-12の最小形）
6. 全工程のタイムライン記録・社内キュー連動・決めることマップの現在地連動
**やらないこと**: Cost Ledger費目管理・通関書類の生成・船腹予約・複数ロット並行の高度管理・再検品の枝分かれ管理（FAILは記録+メモ+新しい検品行で表現）。

## 1. DB（4表追加 → 計31表。既存パターン: public_id採番・追記型）
- samples: id, project_id, public_id `{Proj}-SMP-{NN}`, round_no, status `REQUESTED|ARRIVED|CUSTOMER_REVIEW|APPROVED|REJECTED`, request_note, factory_note, photo_doc_ids_json, customer_note, decided_at, created_at
  - 顧客APPROVED時: 該当写真docを合意書の approved_sample_doc_id 候補として提示（自動設定はしない。スタッフが合意書側で選ぶ）
- production_lots: id, project_id, public_id `{Proj}-LOT-{NN}`, qty, status `PLANNED|IN_PROGRESS|DONE`, started_at, expected_done_on, done_at, note
- inspections: id, project_id, lot_id FK, public_id `{Proj}-INS-{NN}`, result `PASS|FAIL`, inspected_qty, defect_qty, defect_note, photo_doc_ids_json, inspected_on, created_at
  - 登録時に合意書 tolerance の不良許容率と突合し、超過なら response に `overTolerance: true`（判断は人間。自動アクションしない）
- shipments: id, project_id, public_id `{Proj}-SHP-{NN}`, lot_id FK NULL可, method `SEA|AIR|COURIER`, status `PREPARING|SHIPPED|CUSTOMS|ARRIVED_JP|DELIVERED`, etd, eta, delivered_on, destination_note, tracking_note, created_at
- projects.state の拡張値: `SAMPLE|PRODUCTION|INSPECTION|SHIPPING|DELIVERED|COMPLETED`（既存stateから前進。後戻りは管理画面から可）
- feedback は新表を作らず timeline イベント `FEEDBACK` + projects に `feedback_json TEXT`（{rating:1-5, comment, askedRepeat:boolean} ALTER追加）

## 2. API（既存パターン: zod/audit/timeline/toClientView遮断。★=要認証）
STAFF:
1. POST `/admin/projects/:id/samples` {requestNote?} → SMP採番・status=REQUESTED・state=SAMPLE
2. PATCH `/admin/samples/:id` {status?, factoryNote?, photoDocIds?} — ARRIVED登録+写真紐付け→ status=CUSTOMER_REVIEW で顧客に見える
3. POST `/admin/projects/:id/lots` {qty, expectedDoneOn?, note?} — **合意書AGREEDが無ければ409 `{error:{code:'G02_NOT_AGREED'}}`**。作成でstate=PRODUCTION
4. PATCH `/admin/lots/:id` {status?, startedAt?, doneAt?, note?}
5. POST `/admin/lots/:id/inspections` {result, inspectedQty, defectQty, defectNote?, photoDocIds?, inspectedOn} → INS採番・state=INSPECTION・許容率突合を返す。PASS時に次工程促し
6. POST `/admin/projects/:id/shipments` {method, lotId?, etd?, eta?, destinationNote?, trackingNote?} → SHP採番・state=SHIPPING
7. PATCH `/admin/shipments/:id` {status?, eta?, deliveredOn?, trackingNote?} — DELIVERED で state=DELIVERED・顧客へ受取確認依頼が見える
CLIENT:
8. GET `/projects/:id` 拡張: samples(CUSTOMER_REVIEW以降・写真)、進捗サマリー（lot/inspection/shipmentの顧客向け表示: 工場名等の内部情報なし。検品は「合格しました(抜取n=◯)」レベル）、feedback状態
9. POST `/samples/:id/decide` ★CLIENT {decision:'APPROVE'|'REQUEST_CHANGE', note?} — APPROVE→APPROVED / REQUEST_CHANGE→REJECTED+社内キュー（次ラウンドはスタッフが再度 samples 作成）
10. POST `/projects/:id/delivery-confirm` ★CLIENT {} → state=COMPLETED・timeline
11. POST `/projects/:id/feedback` ★CLIENT {rating(1-5), comment?, askedRepeat?} → feedback_json保存・timeline FEEDBACK・社内キューに「振り返り着信」
キュー拡張: GET /admin/queue 系に sampleReviews(顧客待ち/修正希望着信)・inspectionFails・deliveredAwaitingConfirm・feedbackArrived を追加（既存の防御的フロント設計に合わせ、無くても壊れない形）。

## 3. Web
顧客 `/`（ConsultPage状態機械の拡張。既存10s pollingを流用）:
- サンプル確認画面: 写真ギャラリー+「この見本で進める」/「修正を希望する（自由記入）」。承認後は「量産合意書のご確認へ進みます」等の次工程案内（合意書が未送信なら「担当者が準備中」）
- 進捗画面（生産〜輸送中）: 決めることマップ現在地+状況カード（「生産中（◯月◯日ごろ完了予定）」「検品に合格しました（抜取20個）」「輸送中（到着予定◯月◯日）」「通関手続き中」）。内部情報・工場名なし
- お届け後: 「受け取りました」ボタン → 完了画面+**ひとことフィードバック**（星1-5+自由記入+「次の商品も相談したい」チェック）→ 送信後はリピート導線（「以前の商品をもう一度」への案内）
社内 `/admin` 案件詳細:
- 工程タブ/セクション追加: サンプル（往復一覧・写真紐付け・顧客待ちチップ）/ 生産ロット（**合意書未AGREEDなら開始ボタンをdisabled+理由表示**）/ 検品（フォーム+許容率突合の警告表示）/ 輸送（ステータス更新）/ 納品後（顧客フィードバック表示）
- ホーム判断キュー: サンプル修正希望・検品FAIL・受取確認待ち・フィードバック着信
- 工程表示（既存のステージレール）を新stateと連動

## 4. 受入基準（E2E）
1. STAFF: サンプル依頼→写真付きで顧客確認へ。CLIENT: 写真を見て「修正を希望」→社内キュー着信→2ラウンド目→CLIENT承認
2. STAFF: 合意書AGREED前にロット開始→409+UIで理由表示。AGREED後→ロット開始→検品FAIL(不良超過警告)→再検品PASS
3. STAFF: 輸送SHIPPED→CUSTOMS→DELIVERED。CLIENT: 進捗文言が変わる→「受け取りました」→フィードバック送信→STAFFキューに着信。project=COMPLETED
4. CLIENTの全レスポンスに工場名・原価・内部メモが無い。Increment 1〜3の回帰（相談→提案→選択→合意書→リピート）
