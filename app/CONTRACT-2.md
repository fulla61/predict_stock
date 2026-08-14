# Build Increment 2 実装契約 — 管理コンソール本実装 + 工場・見積・商流ループ最小実装

Status: v1.0 / 2026-08-13 / 秘書AI。CONTRACT.md（Increment 1）の上に追加する。矛盾時は本書が優先。
目的貢献: ②Crossimageの手作業減（比較・転記・翻訳の自動化）/ ⑤利益が見える / ⑥少人数で案件を増やせる / 実商流Loop（Governance §16）の初の実走。

## 0. スコープ
- 社内: 管理コンソール本実装（ホーム=判断キュー / お客様一覧 / 会社ページ+**見え方の設定** / 案件詳細）
- 商流: 工場台帳 → 中国語RFQドラフト生成（送信は人間・コピー/ダウンロード）→ 工場見積の手入力取込（版管理）→ Feasibility分析 → 顧客向け「選べる進め方」Option生成 → 社内承認 → 顧客決定（ACCEPT/MODIFY）→ MODIFY時は2周目
- **やらないこと**: WeChat自動連携・Excel自動取込・サンプル以降の工程・Cost Ledger全費目（簡易係数のみ）・visual演出

## 1. DB追加（15番準拠・8表追加 → 計26表）
factories(公開ID FA-{NNNN}, 名称, 地域, 得意分野, risk区分 FRISK_*, 対応チャネルメモ),
factory_notes(内部評価メモ・追記型),
rfqs({ProjectID}-RFQ-{NN}, 中文ドラフト本文, status: DRAFT/SENT, sent_at, sent_channel手入力),
rfq_recipients(rfq_id, factory_id),
quotes({ProjectID}-QT-{NN}, rfq_id, factory_id, version_no, supersedes_quote_id, unit_price_cny_or_jpy(通貨コード付), moq, tooling_cost, sample_cost, lead_days, valid_until, notes, **上書き禁止=新版行**),
quote_conditions(quote_id, condition_type: MOQ/PRICE_TIER/TOOLING/LEADTIME/OTHER, moq_dimension?, threshold_qty, value, note),
commercial_loops({ProjectID}-LOOP-{NN}, loop_no, trigger_reason, feasibility_result JSON(希望vs回答差分), customer_decision: NULL/ACCEPT/MODIFY/HOLD, decided_at, approval_id),
loop_options(loop_id, key, title, concept, customer_price_range(顧客向け表示価格・レンジ文字列), qty_from, lead_days, pros JSON, tradeoff, based_on_quote_id(内部のみ), internal_note(内部のみ), recommended, selected)
- clients に settings列追加（JSON: experience_level_override: NULL|EXP_*, default_entry_route, note）。ALTER TABLEで追加。
- 遮断（最重要）: **顧客向けレスポンスに factory名・quote原価・based_on_quote_id・internal_note・margin系を絶対に含めない**。loop_optionsのtoClientView()は title/concept/customer_price_range/qty_from/lead_days/pros/tradeoff/recommended のみ。

## 2. API追加（prefix /api、★=要認証。既存パターン踏襲・zod検証・audit記録）
STAFF専用:
1. GET  /admin/clients → 会社一覧（進行中件数・状態内訳・直近更新）
2. GET  /admin/clients/:id → 会社詳細（projects一覧+settings+直近activity）
3. PATCH /admin/clients/:id/settings {experienceLevelOverride?, defaultEntryRoute?, note?}
4. GET/POST /admin/factories（登録・一覧。POSTでFA採番）
5. POST /admin/projects/:id/rfq {factoryIds[]} → AIサービスで**中国語RFQドラフト生成**（理解済み仕様+数量シナリオ+品質要求+法規要求書類。CONTRACT§4と同じlive/mockフォールバック。mockはテンプレート整形）→ rfqs保存、本文返却（画面でコピー/『.md』ダウンロード）。**顧客販売価格・マージン・他工場情報を含めない生成制約**
6. POST /admin/rfqs/:id/sent {channel} → status=SENT（送信自体は人間がWeChat/メールで実施）
7. POST /admin/rfqs/:id/quotes {factoryId, currency, unitPrice, moq, toolingCost?, sampleCost?, leadDays, validUntil?, notes?, conditions[]} → 版採番
8. POST /admin/projects/:id/loop → Feasibility分析実行: 顧客の選択案・数量希望 vs 登録済み全Quote → 差分JSON+**顧客向けOption案(2〜3件)をAI生成**（価格は quote×係数 settings.price_coefficient〔seed 1.35、CONFIGURABLE〕でレンジ化し、スタッフが承認前に編集可）→ loop作成 status=PENDING_APPROVAL
9. PATCH /admin/loops/:id/options {options[](価格レンジ等の修正)} / POST /admin/loops/:id/approve → 顧客へ公開
CLIENT:
10. GET /projects/:id （拡張: 承認済みloopがあれば options を含める〔サニタイズ済〕）
11. POST /loops/:id/decide {decision: "ACCEPT"|"MODIFY", selectedOptionKey?, modifyNote?} → ACCEPT=案確定・完了状態へ / MODIFY=理由記録し社内キューへ（2周目はスタッフが再度 /loop 実行）

## 3. Web
- `/admin` を左ナビ型コンソール化（prototype/admin.html のホーム/会社/案件のIA・トーンを実装。インサイトタブはプレースホルダー「データ蓄積後に有効化」）:
  - ホーム: 判断キュー（提案承認待ち+Loop承認待ち+顧客MODIFY着信）/ 動きがあった案件 / お客様一覧
  - 会社ページ: 案件一覧+**見え方の設定**（お客様レベル上書き: 自動判定を表示しつつ select で上書き、既定の入り口、社内メモ）
  - 案件詳細: 工程表示 / RFQ生成（工場チェックボックス→生成→本文表示・コピー・.mdダウンロード→「送信済みにする」）/ 見積入力フォーム（複数工場・版）/ 「条件を分析して提案を作る」→ Option編集→承認
- 顧客 `/`: 選択完了後の案件に承認済みLoopが来たら**「選べる進め方」**画面（11番§10のトーン: 「条件を調整して、より合う方法を探しています」→ Option表示→「この案で進める」or「条件を変えたい（自由記入）」）。MODIFY送信後は「担当者が再調整しています」表示
- 文言は§14言語ルール。デザインはtokens継承。既存の相談フローを壊さない。

## 4. 受入基準（E2E）
1. STAFF: 工場2社登録→対象案件でRFQ生成（中文が表示され、顧客価格・マージン語が含まれない）→送信済み化→2社の見積を版入力
2. STAFF: Loop分析→Option価格を編集→承認。CLIENT: 「選べる進め方」に2〜3案表示（**工場名・原価・内部メモが応答JSONに存在しない**）
3. CLIENT: MODIFY（「もう少し数量を減らしたい」）→STAFFキューに着信→（2周目）再分析→承認→CLIENT: ACCEPT→完了
4. 会社ページでレベル上書き保存→audit記録。既存Increment 1の受入（相談→提案→承認→選択）が回帰していない
