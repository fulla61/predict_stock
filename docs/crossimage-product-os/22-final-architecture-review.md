# 22. A10 最終Business Architecture Review（実商流統合・Governance v3.0対応）

| 項目 | 値 |
|---|---|
| Status | **Reviewed** |
| 版 | v1.0 |
| 日付 | 2026-08-10 |
| 作成 | A10 最終Business Architecture Reviewエージェント |
| 準拠 | 05-governance-pack.md **v3.0**（§0-6〜10 / §3 v3.0 enum群 / §9 G-02改訂 / §16 / §17 / §18 / §19 / §20 DoD 10〜12） |
| 対象 | 01 / 10 / 11 / 15 / 16 / 18 / 20 / 21（参照: 12 / 13 / 17） |
| 大原則 | 既存Phase 0設計・20番Decision Brief・A7判定（17番）は**破棄しない**。本書はv3.0との**差分**を特定し、「必要変更リスト」として提示する（本書自身は他文書を修正しない） |

**判定軸（本書全体で適用）**: ①顧客に簡単 ②Crossimageに少ない作業 ③中国側に明確 ④品質・責任・費用に厳格 ⑤案件を重ねるほど賢くなる。書類・機能・テーブルを増やすこと自体は目的ではない。

**表記原則（§14準拠）**: 専門用語は初出時に「用語（日本語説明：短い定義）」で示す。本書の具体商品例はすべて「例でありシステム仕様ではない」（Governance §0-2）。

---

## 1. 現在のPhase 0から変更が必要なArchitecture

v3.0（実商流原則）と突き合わせた結果、変更が必要な箇所は**16件（大2 / 中7 / 小7）**。既存骨格の「破壊」を要する項目は**ゼロ**であり、全件が「拡張・条件書換え・注記」で対応可能である。

| # | 文書/箇所 | v3.0との矛盾・不足 | 変更内容 | 規模 |
|---|---|---|---|---|
| A-01 | **15番** テーブル定義（64表） | (c)該当: `CommercialLoop` / `CommercialProfile` / `Cost Ledger` / `ProductFeedback` / `Product・ProductVersion` / `Production Reference Set` / 関税（DutyStatus管理）/ MOQ条件 / `Client・Factory Knowledge` / 納品責任分岐点 の受け皿テーブルが存在しない | 本書§5〜§16の設計案どおり**約12テーブル+参照マスタを追加**（§17に一覧）。既存64表の削除・改変は不要（追加のみ） | **大** |
| A-02 | **11番** Customer Journey全体 | (d)該当: シナリオ（§8台本）がSTEP 11「見積依頼を送ります」で終端し、**Loop 1周で完結する前提**。工場回答後の FEASIBILITY → 顧客Option再提示 → CustomerDecision（MODIFY / NEGOTIATE / RE_SOURCE / RE_RFQ / HOLD）の顧客画面・導線が §1.2「逆戻り」1行しかない | 「工場からの回答が届いた後」の顧客体験（Loop画面群）を1章追加: 🏭工場からの回答欄の実表示 / 成立しない場合のOption型再提案画面 / 条件変更履歴の顧客向け表示。台本にLoop 2周目（例: 希望数量<工場MOQ→数量・仕様の選び直し）を追補 | **大** |
| A-03 | **15番** `quotes` 表 | Quote（工場見積）が版として管理されておらず（`{ProjectID}-QT-{NN}`の単発行）、§16の**Quote Version**要件（前提条件記録・上書き禁止・価格差追跡）を満たさない。`moq`が単一数値カラム＝MOQを工場固定属性のように保持 | §9の設計案どおり版連鎖・前提条件カラム・MOQ条件の別表化（`quote_conditions`）へ拡張 | 中 |
| A-04 | **10番** Task定義 | Loop周回を業務として回すTaskがない（JP-RFQ-060〜080/JP-PROP-060〜080は存在するが、Loop記録・CustomerDecision分岐・再RFQ/再Sourcingの配線と「なぜ条件が変わったか」の記録Taskが欠落）。JP-RPT-020の再確認チェックリストが§19の8項目（価格/MOQ/材料/納期/運賃/為替/法規/部品供給）を明示していない | §6のとおり JP-LOOP系Task（3件程度）を新設し、既存RFQ/PROP系TaskをLoop配下に位置づけ。JP-RPT-020を8項目チェックリスト化 | 中 |
| A-05 | **10番/01番** KPI定義 | (e)該当: KPI（重要業績評価指標：経営判断に使う測定値）が Automation A+B≥80% のみ。DoD-11の16指標（Human Touch Time等）の定義・計測方法がどの文書にも存在しない | §10.3のKPI定義表を10番（または新節）へ正式収載。目標値はCALIBRATION_VALUE | 中 |
| A-06 | **15番/10番/16番** G-02関連 | (b)該当: G-02が**Golden Sample単独前提**のまま。15番`gate_definitions`のG-02条件=`golden_samples latest=LOCKED`、10番JP-SMP-050/060・JP-PROD-020のガード、16番QT-12「GoldenSample承認は必須（G-02・全Tier共通）」がv3.0のReference Set概念と不整合 | §11のとおり `production_reference_sets` を導入しG-02条件を「案件が要求するReference Set構成要素が全てAPPROVED」へ書換え。Golden Sampleは構成要素の一つ（既存イミュータブル機構は無変更で流用） | 中 |
| A-07 | **01番** 概要 | AI Enginesに Feasibility分析 / Cost Simulation（費用試算）がない。エンティティ図にCost Ledger / Feedback / ProductVersionがない。「納品はProjectの終了ではない」（§0-10）が反映されていない | Feasibility & Cost Simulation Engineの追記、エンティティ図の拡張、KPI節の追記 | 中 |
| A-08 | **18番** Rule Pack 9要素 | Rule Packが供給すべきv3.0データが未定義: ①案件別Reference Set構成要素の既定（§11） ②MOQ次元候補 ③費目シード候補（カテゴリー特有費用: 例〔例であり仕様ではない〕電池系の危険品輸送費） ④カテゴリー価格レンジは既存（Reco Engine入力）だが費用レンジ供給が暗黙 | payload拡張（第10要素 REFERENCE_SET を追加、または既存要素のpayloadへ追加）。DSL・スキーマ検証の枠組みは無変更 | 中 |
| A-09 | **20番** 承認10点セット | v3.0の新規承認事項（Loop / Cost / Reference Gate / Profile分離 / Feedback / KPI）が含まれない | §24の改訂承認セット（16項目）へ差替え | 中 |
| A-10 | **11番** STEP 8等のMOQ・単価断定表現 | 「OPTION Bの最小数量は1,000個です」等、**工場回答前にMOQ・単価が確定しているかのUI文言**（Proposal段階の概算MOQ・概算単価が固定値に見える） | 「工場確認前の目安」注記の徹底（G-15の概算原則をMOQ・納期にも拡張適用）。画面構造の変更は不要 | 小 |
| A-11 | **12番** Quote回収Excel／RFQテンプレート | 工場回答の取得列に「MOQ次元別条件・含む費用/含まない費用・有効期限・前提条件」が不足（現行はMOQ単一値+価格） | 回収シートに回答列を追加（テンプレートのデータ変更のみ） | 小 |
| A-12 | **13番/15番** 関税 | `imports.duty_amounts`のみで、DutyStatus（関税確度enum）・HS Code候補・EPA（経済連携協定：関税優遇の可能性）適用候補の管理構造がない | `duty_assessments`（§8）を追加し13番の輸入手続フローへ参照を追記 | 小 |
| A-13 | **16番** Quality Dimension | §18は6 Dimension（Safety/Function/Durability/Appearance/Sensory/**Packaging**）だが16番は5分類（PackagingはQT-19〜21のパラメータ扱い） | Packagingを第6 Dimensionとして正式化（QT-19〜21を帰属）。Q1〜Q4・FIXED MINIMUM・26パラメータは無変更（§12） | 小 |
| A-14 | **19番** Glossary | v3.0用語（Commercial Feasibility Loop / Cost Ledger / Landed Cost / Commercial Profile / ProductFeedback / Reference Set等）の辞書・Tooltip未収載 | 用語追補（データ追加のみ） | 小 |
| A-15 | **21番** Decision Log | v3.0統合後の残余リスク（§23）が未登録 | §23の8件を追記候補として登録 | 小 |
| A-16 | **03番** Roadmap | Phase 1範囲にv3.0追加分（Loop/Cost/Feedback最小実装）が未反映 | Phase 1 Vertical Slice定義（§18）と整合させ更新 | 小 |

**変更が「不要」と確認できた懸念箇所（誤検出の排除）**:
- 11番 Route B の数量・目標単価入力は**任意入力**であり、BudgetStatus/QuantityStatus=UNKNOWN許容と整合（矛盾なし）。
- 10番 G-12（数量未確定・SOFT）/G-15（Quote未登録＝概算明示・SOFT）は、v3.0の「事前確定を前提にしない」原則を**既に部分的に先取り**しており、廃止ではなくCommercial Profileへの接続で強化する。
- 15番 `quotations.is_provisional` と `sales_orders`の「確定見積のみ受注可」制約は、Loopの出口（ACCEPT後）の防御としてそのまま有効。

---

## 2. 変更不要なArchitecture（v3.0後も有効な骨格）

| 骨格 | 変更不要の理由 |
|---|---|
| **2層アーキテクチャ**（Universal Core / Category Rule Pack、§13） | Loop・Cost・FeedbackはすべてLayer 1の汎用機構として追加でき、カテゴリー固有ロジックを要しない。Rule Packの供給データが増えるだけ |
| **属性タグ（ATTR_*）+ Rule Engine** | v3.0はカテゴリー非依存原則を強化こそすれ変更しない。費用・MOQのカテゴリー差もRule Packデータで表現できる |
| **Gate機構**（Hard/Soft・宣言的条件・gate_evaluations追記型） | G-02の**条件データの書換え**だけで対応可能（15番§4.1の設計どおりGateはデータであり、機構のコード変更不要。この設計が今回の改訂コストを最小化した） |
| **G-01/G-03〜G-06、G-10〜G-16** | 実商流でも「入口は柔軟、出口は厳格」は不変。特にG-15（概算明示）はLoop前提の価格運用と完全に整合 |
| **State Machine 15本・イミュータブル版管理**（Spec版/GS/Quote追記/approvals凍結） | Quote Version・Reference Set・ProductVersionは同じ「上書き禁止・新版行」パターンの適用先が増えるだけ |
| **言語ルール（§14）・19番Glossary/Tooltip機構** | v3.0新用語も同じ辞書機構に載せる（データ追加のみ） |
| **権限遮断（3層: DBビュー/アプリ/Export）** | Cost Ledger・Landed Costは§17の遮断要件（Clientに工場原価・マージン・他工場見積・内部リスクコスト非表示）をそのまま`sensitivity=COST/MARGIN`体系に載せられる |
| **監査（audit_logs追記専用・ハッシュ連鎖・WORM）** | Loop周回記録・費用根拠・Feedback証跡の「なぜ」を担保する基盤としてむしろ必須 |
| **ID体系・採番（id_sequences単調増加）** | LOOP/FB等のTYPEコード追加で対応（§24でGovernance変更提案として整理） |
| **Task Generator / Next Best Action / ハイブリッドチャネル（Web/Excel/WeChat）** | Loop系Taskも同じテンプレート機構・チャネル機構で生成・配信できる |
| **Claim機構（G-16・claims表）・FIXED MINIMUM** | 実商流でも性能表現の実証従属・安全非緩和は不変 |
| **Automation 4分類とMVP方針** | DoD-12「AI作成→人間確認→送信」は20番⑩の推奨案と同一。矛盾なし |

---

## 3. Project DNA最終案（8軸維持 + Profile分離後の整理）

**結論: 8軸構成・正準コードは無変更で維持**（20番④の確定承認対象のまま）。§18のProfile分離は「DNAから軸を抜く」のではなく、**DNAに入れるべきでなかった情報をDNAの外に正しく置く**整理である。

| 要素 | 分離後の置き場所 | 備考 |
|---|---|---|
| ExperienceLevel / Intent / OdmLevel / ProductRisk / BrandImpact / FactoryRisk / CommercialRisk・Priority | **DNAに残る**（案件運営の分岐キー） | Task生成・承認段数・検品密度・報告頻度の導出キーとしての役割は不変 |
| QualityLevel（Q1〜Q4） | **DNAに軸として残す**が、値のSoT（Source of Truth：正となるデータ）は `quality_profiles.tier`（Quality Profile） | 現行も二重管理気味（DNA軸+quality_profiles）。「確定はJP-QUAL-020→quality_profiles、DNA軸は参照キャッシュ」と規定して二重更新事故を防ぐ |
| 数量・予算・納期・MOQ許容・初期投資許容度 | **Commercial Profile**（§5。新設） | 現行はSpecField（quantity/deadline）と画面入力に散在。商業条件は仕様ではないため分離 |
| ATTR_*・商品仕様 | **Product Attributes**（§4。既存機構の名前付け） | 変更なし |
| 法規状態 | **Regulatory Profile** = 既存`regulatory_assessments` | 変更なし（名称整理のみ） |
| 工場要件 | **Factory Profile** = 既存FactoryQualView+factory_scores | 変更なし（名称整理のみ） |

- DNA8軸構成は `ARCHITECTURE_LOCK`。QualityLevelのSoT一本化ルールは `CONFIGURABLE_RULE`。
- DNA変更履歴（project_dna_history）の機構はProfile側にも同型適用する（§5のVersion管理）。

---

## 4. Product Attribute構造（§13属性タグ + 商品仕様）

**新規設計は不要**。既存の2要素を「Product Attributes Profile」として束ねる（論理的な名前付けのみ）:

| 構成要素 | 実体（15番） | 供給元（18番） |
|---|---|---|
| 属性タグ | `project_attributes`（ATTR_*、AI_SUGGESTED→CONFIRMED、除外は承認必須） | 属性レジストリ（Governance §13）+ AR-*ルールセット |
| 商品仕様 | `spec_versions` + `spec_fields`（field_key + Field単位Status） | Rule Pack Required Questionの`target_spec_field`がキー辞書を供給 |

- 「何を作っているか」への問いはこの2つで完結し、Commercial Profile（いくらで・何個・いつ）とは参照関係のみ持つ。
- Rule生成式 `f(Category + Product Attributes + Risk Attributes + Brand/Quality Tier)` は不変。v3.0で追加されるのは、この式の出力に**費目候補・MOQ次元候補・Reference Set構成**が加わること（A-08）。

---

## 5. Commercial Profile（フィールド定義案とVersion管理）

新設テーブル `commercial_profiles`（project 1:1）+ `commercial_profile_versions`（Loop周回スナップショット・追記専用）。

| フィールド | 型/enum | 説明 |
|---|---|---|
| budget_status | BudgetStatus（§3 v3.0） | `UNKNOWN`でも案件開始可（必須入力にしない） |
| target_unit_price / max_unit_price / total_project_budget / benchmark_ref | numeric / 参照 | budget_statusに応じ該当欄のみ使用。benchmark_refは「競合品◯円」等の参照情報（document参照可） |
| quantity_status | QuantityStatus（§3 v3.0） | `FLEXIBLE_BASED_ON_MOQ`＝工場MOQ（最小発注数量：工場が受けられる最低ロット）を見て顧客が決める前提を第一級で表現 |
| target_quantity / min_desired / max_acceptable / annual_forecast / trial_lot_qty | numeric | quantity_statusに応じ使用 |
| acceptable_moq_max | numeric + 次元参照 | 顧客が受け入れられるMOQ上限（次元は§7のCONFIGURABLEマスタ参照） |
| target_delivery | date + flexibility区分 | 「特に急がない」を正の値として持つ（NULL≠未入力と区別） |
| priority_axes | 順位付きJSONB | §16の優先軸（価格/MOQ/品質/開発力/納期）の顧客優先順位。Loop Option生成・工場評価の重み入力 |
| initial_investment_tolerance | レンジ or 区分 | 金型（Tooling）・治具・試験費等の初期投資許容度。`TBD`可 |
| incoterms_pref / delivery_point_pref | 参照 | Incoterms（貿易条件：費用と危険の分岐点の国際規則）・納品先の希望。確定は§13のDelivery Termsで |
| 各項目 `_status` | SpecField enum流用（AI_SUGGESTED/PROVISIONAL/CONFIRMED/UNKNOWN） | 顧客明言かAI推定かを常に区別（新enum不要） |

**Version管理**: Loop周回（§6）の各`CustomerDecision`確定時に `commercial_profile_versions` へスナップショット（loop_id FK・変更者・変更理由・根拠Quote Version FK）。「予算・数量が途中で変わった」ことが**正常な商流イベントとして履歴に残る**（上書き・削除禁止）。SpecFieldのquantity等は本Profileへの参照に一本化し二重入力を禁止する（A-01の実装要件）。

---

## 6. Commercial Feasibility Loop の実装設計

### 6.1 データ（`commercial_loops`）

| フィールド | 説明 |
|---|---|
| public_id | `{ProjectID}-LOOP-{NN}`（Governance §16既定のID） |
| loop_no / previous_loop_id | 周回番号・前周回への連鎖 |
| trigger_reason | 開始理由（初回 / 顧客MODIFY / 工場回答不成立 / 為替・原価変動 / 再Sourcing 等） |
| input_snapshot | Commercial Profile版・Spec版・対象RFQ/Quote版のFK群（**誰が・なぜ・どの工場回答を根拠に**の3点をFKで担保） |
| feasibility_result | 成立/条件付成立/不成立 + 差分明細（希望vs回答: 価格・MOQ・納期・仕様・初期費用） |
| options_presented | 提示Option（A/B/C…各: 何を維持し何を変えるか・数量優先/価格優先/オリジナル性優先等の型） |
| customer_decision | **CustomerDecision enum**（ACCEPT/MODIFY/NEGOTIATE/RE_SOURCE/RE_RFQ/HOLD/REJECT） |
| decided_by / decided_at / decision_evidence | 顧客操作 or SALES代行入力（顧客合意証跡document FK） |
| approval_id | 正式顧客提案（価格・工場・利益・重要条件を含む）のHuman Approval FK（§16原則） |

State Machine案（追記型・逆行なし）: `OPEN → ANALYZING → OPTIONS_PRESENTED → DECIDED → CLOSED`。DECIDED時の分岐: ACCEPT→次工程（Quotation確定/sales_order経路）、MODIFY→新Loop行+Profile新版、NEGOTIATE→交渉Task起票のうえ同Loop内で工場回答待ち→再ANALYZING、RE_SOURCE→JP-FACT-010再実行+新Loop、RE_RFQ→JP-RFQ系再生成+新Loop、HOLD→Project ON_HOLD連動、REJECT→CLOSED_LOST or 代替提案の新Loop。
（LoopのStatusはGovernance §3への追記が必要 → **Governance変更提案①**として§24に整理。）

### 6.2 Task / 画面への落とし込み

| 新旧 | Task | 内容 | 分類 |
|---|---|---|---|
| 新 | JP-LOOP-010 Feasibility分析ドラフト | 全Quote登録（JP-RFQ-070比較表）後、希望vs回答の差分・リスク・概算利益・推奨案を自動整理 | A_FULL_AUTO |
| 新 | JP-LOOP-020 顧客Option提案生成・承認 | 成立しない場合のOption型提案（「できません」禁止）。AIドラフト→SALES/PM承認 | B_AI_DRAFT |
| 新 | JP-LOOP-030 CustomerDecision取込・Loop記録 | 顧客選択の構造化取込・Profile新版化・後続Task自動起票 | A_FULL_AUTO |
| 既存 | JP-RFQ-060〜080 / JP-PROP-060〜080 / JP-FACT-050 | Loop配下の工程として位置づけ直し（Task自体は再利用） | 現行どおり |

**画面**: 社内=「Loop判断画面」（§10.2の6点セット+5ボタン）。顧客=「選べる進め方」画面（Option A/B/C再提示。11番§1.2「逆戻り」の正式化＝A-02）。工場=WeChatDigest/Excelでの再見積依頼（既存チャネル機構）。

**Loop Version記録**: 全遷移をaudit_logsへ（既存機構）。加えてLoop行自体がFKで「誰が（decided_by/approval）・なぜ（trigger_reason/decision理由）・どの根拠で（quote_version FK）」を構造として持つため、Excel比較・記憶に依存しない。

---

## 7. Dynamic MOQ / Pricing Model

**原則（ARCHITECTURE_LOCK）**: MOQ・価格は Factory の固定属性としてどのテーブルにも持たない。`Factory × Requirement Version × Specification Version × Quote Version` に紐づく **Commercial Condition（商業条件：その見積の前提でのみ有効な条件）** として保持する。

新設 `quote_conditions`（quotes配下・追記専用）:

| フィールド | 説明 |
|---|---|
| quote_id | 親Quote版FK（版が変われば条件も新行） |
| condition_type | `MOQ / PRICE_TIER / TOOLING / SAMPLE_FEE / LEADTIME / PAYMENT / OTHER` |
| moq_dimension | **CONFIGURABLEマスタ`moq_dimensions`参照**（初期シード: per Order / per SKU / per Color / per Size / per Material / per Packaging / Custom Mold起工数量。追加はデータ登録のみ） |
| threshold_qty / value / unit / currency | 例〔例であり仕様ではない〕: 「色ごと1,000個以上」「3,000個で単価▲8%」 |
| applies_to_spec_ref | 条件が依存する仕様参照（spec_field_key等） |
| notes_ja / notes_zh | 工場原文の要旨（原本はdocument保存） |

- `quotes.moq`単一カラムは廃止せず「代表値（表示用導出値）」へ降格（互換のため。SoTはquote_conditions）。
- Factory Knowledge（§16）には「この工場のMOQ・価格の**推定レンジ**」を実績Quoteから蓄積するが、必ず`AI_ESTIMATED`表示とし、案件の正式条件は常に当該案件のQuote Versionから取る。
- 顧客表示は情報遮断ビュー経由（工場名・原価非表示、Quotation化した条件のみ）。

---

## 8. Cost Architecture（Cost Ledger設計案）

### 8.1 構造

`cost_ledgers`（project 1:1のコンテナ）+ `cost_items`（明細・追記/版型）+ 参照マスタ `cost_categories`（8分類）+ `cost_item_catalog`（費目シードマスタ・CONFIGURABLE）。

**費目シード**（8分類 × 初期項目。ASSUMPTION: オーナー列挙■10〜18の費目は下表の8分類へ対応付けて項目マスタ化する。個別費目の網羅はマスタデータ整備で行い、固定リスト化しない＝§17）:

| 分類（§17正準） | シード費目例（初期マスタ。追加・無効化はデータ変更のみ） |
|---|---|
| 製造 | 製品単価（数量段階別）/ 材料費内訳 / 加工・組立 / 不良・歩留引当 |
| 開発・初期 | 金型（Tooling）/ 治具 / 設計・図面 / サンプル費 / 印刷版・版下 / 初回認証取得 |
| 品質・試験 | 法規試験 / 性能・耐久試験 / 検品費（現地・第三者）/ 工場監査 / 限度見本作成 |
| 中国国内 | 工場→港内陸輸送 / 輸出通関・港湾諸掛 / 中国側倉庫 / 輸出梱包 |
| 国際物流 | 海上・航空運賃 / 燃油等サーチャージ / 貨物保険 / コンテナ諸費 |
| 日本輸入 | 関税 / 輸入消費税 / 通関手数料 / 輸入届出・検疫（食品接触等該当時）/ 港湾諸掛 |
| 日本国内物流 | ドレージ（コンテナ陸送）/ 国内配送 / 国内保管 / 配送付帯（時間指定等） |
| その他・例外 | 為替影響 / クレーム・リワーク引当 / 廃棄 / 特急対応 / その他Custom |

**Custom Cost Item**: catalog外の自由費目行を案件単位で追加可能（`is_custom=true` + 命名 + 分類必須）。実績が繰り返された費目はマスタへ昇格（Knowledge資産化の一形態）。

### 8.2 Cost Itemの必須属性（§17完全準拠）

`cost_status`（CostStatus enum: ESTIMATED〜ACTUAL。**見積と実績の混同をenumで構造的に禁止**）/ `cost_class`（ONE_TIME/RECURRING/VARIABLE_EXTERNAL/EXCEPTION）/ `cost_responsibility`（CLIENT/CROSSIMAGE/FACTORY/LOGISTICS_PROVIDER/OTHER/TBD）/ `source_ref`（Quote版・第三者見積等のFK）/ `evidence_document_id` / `valid_until` / `currency` + `exchange_rate` / `assumption`（前提テキスト）/ `confidence` / `updated_at`。金額変更は新行（旧行は履歴）。**「なぜこの金額か」が常にFKと証跡で遡れる**。

### 8.3 関税（`duty_assessments`）と Landed Cost

- `duty_assessments`: hs_code_candidates（候補複数）/ 原産国 / 課税価格 / 税率候補 / EPA・FTA・RCEP適用候補 / 概算額 / **duty_status**（AI_ESTIMATE→REVIEW_REQUIRED→BROKER_CONFIRMED→FINAL→ACTUAL）。税率・計算方法のハードコード禁止（マスタ+外部確認）。AIだけで最終確定しない（13番の免責・責任分界と同一原則）。
- **Landed Cost（着地原価：顧客指定納品地点までの総原価）**: `landed_cost_snapshots`として `ESTIMATED / CONFIRMED / ACTUAL` の3段階を保存し比較可能にする（Estimate vs Actual VarianceのKPI入力）。
- 見積構造: `Factory Quote → Cost Ledger → Estimated Landed Cost → Crossimage Margin/Fee → Client Quotation`。既存`quotations.margin`（内部のみ）・遮断ビュー機構に接続。**Clientに工場原価・マージン・他工場見積・内部リスクコストを出さない遮断は既存3層防御をそのまま適用**。

---

## 9. Quote Version Model（見積版管理）

15番`quotes`の拡張（A-03）。既存の「public_id `{ProjectID}-QT-{NN}`・原本document保存・遮断」は維持し、以下を追加:

| 追加要素 | 内容 |
|---|---|
| 版連鎖 | `(rfq_id, factory_id, version_no)` + `supersedes_quote_id`。**旧版の上書き・削除禁止**（append-only。承認済み版凍結と同じトリガーパターン） |
| 前提条件（§16列挙の9点を明示カラム化） | 数量前提 / spec_version_id FK / 為替（通貨+レート+基準日）/ 運賃前提 / 関税前提（duty_assessment FK）/ valid_until / Incoterms / 納品地 / 含む費用・含まない費用（cost_item_catalog参照の2リスト） |
| 価格差追跡 | 導出ビュー `v_quote_diff`: 前版比の差分（単価・MOQ・初期費・納期）+ 差異原因タグ（数量変更/仕様変更/為替/材料/交渉/その他）。原因タグは取込時にAIドラフト→人間確認 |
| 失効管理 | valid_until超過QuoteをNext Best Actionが検知し再見積提案（TC-61の恒久対策と同根） |

- Quotation（顧客見積書）は既存の版管理（QO-NN + is_provisional + G-15透かし）で足りる。追加するのは「どのQuote版・どのLoop・どのLanded Cost版に基づくか」のFKのみ。
- QuoteのStatus enumは**新設しない**（valid_until+supersedes+版で表現できる。Status新設禁止原則の遵守）。

---

## 10. Human Decision Architecture

### 10.1 残す判断 / 排除する作業の対応表

| 人間に残す判断（C/D分類で維持） | 人間から排除する作業（System/AIが実施） |
|---|---|
| 価格交渉の方針・着地判断（JP-PROP-080） | 見積Excelの比較・転記 → JP-RFQ-060/070の構造化取込・自動比較表 |
| 工場選定（JP-FACT-020/050） | 工場情報の探索・整理 → Factory Score+Knowledge照会 |
| 顧客への正式提案・Quotation承認（価格・利益含む） | Landed Cost・マージン・品質コスト差の計算 → Cost Ledger/概算エンジン |
| 重要品質（Tier確定・Reference Set承認・特採） | 翻訳 → Translation/Doc Engine（RFQ・仕様書・Digest） |
| 法規最終判断（REG）・ShipmentRelease（MGR） | 督促・リマインド・進捗確認 → 常駐A分類Task |
| CustomerDecisionの顧客支援・例外対応（HOLD/REJECT折衝） | 顧客・工場回答の整理 → Loop Feasibility分析（JP-LOOP-010） |

### 10.2 判断提示UI原則

1画面=1判断。Systemが**6点セット**（①顧客希望〔Commercial Profile〕②各工場回答〔Quote版〕③差分④リスク⑤利益（内部のみ）⑥推奨案+根拠）を提示し、人間の操作は **APPROVE / MODIFY / NEGOTIATE / RE_SOURCE / REJECT** のボタン+理由入力のみ（CustomerDecision enumと同語彙で内外の判断を揃える）。承認画面から比較元Excelを開かせない（データはすべて画面に集約済みであること＝実装受入基準）。

### 10.3 KPI定義（DoD-11対応。目標値はすべてCALIBRATION_VALUE）

| KPI | 定義 | 計測方法 |
|---|---|---|
| Human Touch Time per Project | 人間（社内Role）が案件に費やした総アクティブ時間 | Task/承認画面の操作イベント（開始〜完了）から自動集計。tasksのIN_PROGRESS区間+approvals判定操作で近似。自己申告させない |
| Human Decision Count | 案件あたりの人間判断回数 | C/D分類Task完了数 + approvals判定数（audit_logsから導出） |
| Human Administrative Time | 判断以外の人間作業時間（B分類の修正・手動取込・例外転記） | Touch Time − Decision画面滞在。**設計目標は0への漸近** |
| Time to First Proposal / Time to First Factory Quote | Lead受付→Proposal送信 / RFQ発行→初回Quote登録 | タイムスタンプ差（projects/proposals/quotes） |
| RFQ Turnaround / Commercial Loop回数 | RFQ→全Quote回収 / 案件のLoop周回数 | rfq_recipients / commercial_loops |
| Quote Acceptance Rate / MOQ Acceptance Rate | 提示OptionのACCEPT率 / 工場MOQを顧客が受容した率 | commercial_loops.customer_decision集計 |
| Estimate vs Actual Cost Variance / Gross Margin Variance | Landed Cost 3段階の乖離 / 見積時vs実績粗利乖離 | landed_cost_snapshots / profitability |
| Sample Iteration Count / 不良率 / 納期遵守 | サンプル版数 / 検品・市場不良 / ETA遵守 | samples / inspections+feedbacks / shipments |
| Feedback Rate / Repeat Rate / Version Improvement Rate | 納品後Feedback取得率 / リピート率 / Feedback→Version反映率 | product_feedbacks / Entry Route D / product_versions.addressed_feedback |

---

## 11. Production Reference Gate（G-02改訂の詳細設計）

### 11.1 概念

「何を正として量産するのか」を確定するのがG-02の本質。Golden Sampleは**手段の一つ**であり、案件が要求する **Approved Production Reference Set（承認済み量産基準セット：量産の正となる承認済み基準物の組合せ）** が揃っていることをHard Gate条件とする。

### 11.2 データ（`production_reference_sets` + `reference_items`）

| 要素 | 内容 |
|---|---|
| production_reference_sets | project_id / version_no / required_components（本案件が要求する構成要素リスト=ルール評価結果のスナップショット）/ completeness（導出）/ 版管理（変更はECR経由の新版） |
| reference_items | component_type: `GOLDEN_SAMPLE / APPROVED_SPECIFICATION / APPROVED_DRAWING / APPROVED_BOM / APPROVED_ARTWORK / APPROVED_COLOR_SAMPLE / APPROVED_PACKAGING / PREVIOUS_APPROVED_PRODUCTION`（§9 G-02の8要素）/ 対象FK（golden_samples・spec_versions・documents等へのpolymorphic参照）/ 承認FK（approvals）/ 工場承諾証跡（签回document） |

**G-02の宣言的条件（書換え案）**: `production_reference_sets 最新版の required_components 全行が APPROVED（各項目の承認FK非NULL）` の否定でBLOCK。gate_definitionsの**条件データ書換えのみ**で実装（機構変更なし）。

### 11.3 案件別必要Setの決定ルール（CONFIGURABLE_RULE）

必要構成 = f(OdmLevel × ProductRisk × BrandImpact × Rule Pack供給ルール × Entry Route)。初期ルール例（すべてデータ・例であり仕様ではない）:

| 条件 | 必要Set例 |
|---|---|
| ODM_0_STOCK（既製品+ロゴなし） | Approved Specification + Approved Color Sample（現物GS新規作成は不要にできる） |
| ODM_1_LOGO / ODM_2_COLOR_PKG | 上記 + Approved Artwork + Approved Packaging（+Q3以上はGolden Sample） |
| ODM_3 / ODM_4 | Golden Sample + Approved Drawing + Approved BOM + Artwork + Packaging（フルセット） |
| Entry Route D（Repeat・仕様変更なし） | **Previous Approved Production**（前回LOCKED Reference Setの継承）+ 再確認チェック済み |
| PRISK_HIGH以上 / BIMP_CRITICAL | 下限をフルセット側へ引上げ（緩和不可） |

### 11.4 既存Golden Sample設計との整合

- 15番`golden_samples`（3者承認・LOCK・イミュータブル3層保証・ECR経由SUPERSEDED）は**そのまま**component_type=GOLDEN_SAMPLEの実装として使う。42番思想（現物照合・双方保管）も不変。
- 10番 JP-SMP-050/060 は「GSを要するReference構成の案件でのみ生成」へTask Generator条件を変更。新Task **JP-PROD-005 Reference Set確定（C_HUMAN_DECISION・PO承認の前提）** を追加。JP-PROD-020（PO承認）のガードは「GS=LOCKED」から「Reference Set=COMPLETE」へ差替え。
- 16番QT-12の「GoldenSample承認は必須（全Tier共通）」は「Reference Set確定は必須（全Tier共通）。GS要否は構成ルールによる」へ文言修正（A-06）。
- 効果: Repeat・既製品案件で**不要なGS作成工程が消え**（Crossimageの作業減）、フルODM・高リスク案件では従来どおり厳格（責任に厳格）。

---

## 12. Quality Architecture（Q1〜Q4維持 + Dimension別内部管理）

確認結果: **16番との差分は小さい（想定どおり）**。

| §18要件 | 16番の現状 | 判定・必要修正 |
|---|---|---|
| Q1〜Q4は顧客・社内の理解補助として維持 | §5.3の4択変換・§1.2の26パラメータで実装済み | 変更不要 |
| 内部はDimension別管理 | §1.3で5 Dimension×パラメータ族マトリクス実装済み | **Packagingを第6 Dimensionとして正式化**（QT-19〜21を帰属変更。A-13・小） |
| Safety・Legal・Critical FunctionはFIXED MINIMUM | §2で4領域判定+スキーマ強制済み | 変更不要 |
| Quality Profileの実体 | `quality_profiles`はtier+4択ラベルのみ | Dimension別重点度（H/M/L。Reco Engine出力）と重点CTQを格納するカラム追加（小） |

---

## 13. Delivery Scope（納品責任分岐点とScope境界）

- 新設 `delivery_terms`（project単位・版管理）: incoterms / named_place（指定地）/ **Delivery Responsibility Point（納品責任分岐点：費用と危険がCrossimageから離れる地点）** の明示記録 / 費用負担・危険負担の分岐説明 / scope_exclusions。Quotation・sales_orders・posの各Incoterms欄はここへのFK参照に整合させる（posには既にincoterms列あり＝矛盾なし、SoTを一本化するのみ）。
- 物流Scope原則「日本国内の顧客指定納品先まで」は既存設計（imports→deliveries）と整合。案件ごとにIncotermsで変わることをdelivery_termsが吸収する。
- **マーケティングScope外の明文化**: 既存設計に広告運用・SNS運用・EC運営・販促の機能は存在せず**矛盾なし**。ただし顧客誤解防止のため、11番の顧客向け文言（サービス範囲説明）と契約テンプレート（Phase 1法務課題・21番#5と同枠）に「Scope外」を明記する（A-02の追補範囲に含める）。Proposal Engineの「付加価値提案」は商品仕様の提案でありマーケティング支援ではない、という線引きをGlossaryに収載（A-14）。

---

## 14. Product Feedback（§19設計案）

新設 `product_feedbacks`（TYPEコード `FB` 追加を**Governance変更提案②**として起案）:

| フィールド | 説明 |
|---|---|
| public_id | `{ProjectID}-FB-{NN}` |
| product_version_id / lot_id（NULL可） | Product Version・Lot・Factoryへの紐付け（Traceability） |
| source | CLIENT / END_USER / ECレビュー / CN_OFFICE / 社内（区分マスタ・CONFIGURABLE） |
| feedback_type | **FeedbackType enum**（DEFECT〜POSITIVE。§3 v3.0） |
| feedback_cause | **FeedbackCause enum**（PRODUCT_FAILURE〜UNKNOWN。**UNKNOWN≠商社責任**） |
| severity / description / evidence | Defect enum流用 / 記述 / 写真・動画document FK（**証跡必須**） |
| responsibility / action | 原因確定後の責任区分（Complaint根本原因enum流用）と対応記録 |
| linked_complaint_id / linked_ecr_id / linked_version_id | 昇格・反映先への接続 |

**Complaintとの関係（重複させない）**: ProductFeedback=納品後の市場の声すべて（好意的・改善要望含む）を受ける広い入口。**責任・是正・賠償を伴う事案はComplaintへ昇格**（linked_complaint_id）し、既存のComplaint進行enum・CAPA・G-04機構で処理する。Feedback自体は軽量運用（承認不要・Task起票のみ）とし、Crossimageの作業を増やさない。
**責任防御**: 原因区分と証拠の必須化により「問題が起きた＝Crossimage責任」への構造的反証を可能にする（§19要件）。原因確定前はfeedback_cause=UNKNOWNで保持し、推測で責任を確定しない。

---

## 15. Product Version / Evolution

新設 `products`（顧客の商品アイデンティティ。project横断）+ `product_versions`:

| 要素 | 内容 |
|---|---|
| products | client_id / 商品名 / 初出project_id。TYPEコード `PRD`（**Governance変更提案③**。グローバル採番 `PRD-{NNNN}`） |
| product_versions | version_label（V1 / V1.1 / V2…）/ parent_version_id（**系譜**）/ 実現project_id / spec_version FK / BOM参照 / quality_standard FK / factory_id / Reference Set FK / actual landed cost snapshot / **addressed_feedback_ids**（対応したFeedback）/ change_reason |
| 差分比較 | 導出ビュー `v_product_version_diff`: 仕様差分（spec_fields比較）/ BOM差分 / 品質差分（quality_standards）/ 工場差分 / コスト差分（landed actual比較）/ 対応Feedback / 変更理由 — §19の7比較軸を全てFK済みデータから機械生成（人間の資料作成ゼロ） |

- 「納品でProjectを完全終了しない」の実装: Project=CLOSED_WONでもproducts/product_versionsは生き続け、Feedback・Repeat・Version Upの起点になる。Projectライフサイクル（15番§3.1）は変更不要。
- V1.1の立ち上げ = 新Project（Entry Route D+仕様変更あり）としてTask Generatorが差分工程のみ生成（既存R-04機構を流用）。

---

## 16. Repeat / Next Product / Knowledge資産化

| 要素 | 設計 |
|---|---|
| 再確認自動チェックリスト | JP-RPT-020を§19の8項目に拡張: 工場価格（Quote失効チェック）/ MOQ（quote_conditions再確認）/ 材料（供給可否・ECR有無）/ 納期 / 運賃 / 為替 / 法規（regulatory_assessments自動差戻し判定=既存機構）/ 部品供給可否。各項目「前回値・現在値・要再確認フラグ」を自動生成し、**変化があった項目だけ**人間・工場に確認する（A_FULL_AUTO→差分のみB） |
| Client Knowledge | 新設 `client_knowledge`: ブランド期待 / 品質嗜好（Tier実績）/ 承認傾向（承認所要時間・差戻し率）/ 過去問題 / 商流条件実績。新Project（Next Product）でDNA初期推定・Reco Engineの入力に自動供給 |
| Factory Knowledge | 新設 `factory_knowledge`: 実績由来のMOQ・価格・納期レンジ / 品質実績 / 対応可能工程。Factory Score（12軸・既存）と分離: Scoreは評価、Knowledgeは推定材料 |
| AI推定と確定情報の区別 | Knowledge行に basis: `ACTUAL（実績）/ CONFIRMED（確認済）/ AI_ESTIMATED（推定）` を必須付与（SpecField enumの部分流用+CostStatusのAI_ESTIMATED語彙。表示は必ず「推定」明示=§19）。**推定値を案件の正式条件に自動昇格させない**（正式条件は常に当該案件のQuote/承認から） |
| 賢くなるループ | 案件CLOSED時に実績（Quote/検品/納期/Feedback）をKnowledgeへ還流するA分類Taskを新設。Rule Packのsource_projects還流（18番§7）と並ぶ第2の学習経路 |

---

## 17. Phase 1 Minimum Schema

15番64表 + 本書追加分から、§18のVertical Sliceを1本通すのに必要な最小集合を選定する。

| 群 | テーブル（**太字=v3.0追加分**） | 数 |
|---|---|---|
| 基盤 | clients, contacts, projects, project_dna(+history), users, id_sequences | 7 |
| 要求・仕様 | requirements, questions, proposals, specifications, spec_versions, spec_fields | 6 |
| 工場・見積 | factories, factory_scores（手動5軸）, rfqs, rfq_recipients, quotes, **quote_conditions**, quotations, sales_orders | 8 |
| 商流Loop | **commercial_profiles(+versions), commercial_loops** | 3 |
| 費用 | **cost_ledgers, cost_items, cost_categories, cost_item_catalog, duty_assessments, landed_cost_snapshots** | 6 |
| 品質・サンプル | quality_profiles, quality_standards, inspection_plans, samples, sample_evaluations, golden_samples, **production_reference_sets, reference_items**, claims（簡易運用） | 9 |
| 法規 | regulatory_assessments | 1 |
| 発注・生産・物流 | pos, production_lots, inspections, inspection_defects, shipments, imports, deliveries, **delivery_terms**, invoices, payments | 10 |
| 納品後 | **product_feedbacks, products, product_versions** | 3 |
| 横断 | documents, document_versions, tasks, task_templates, task_dependencies, gate_definitions, gate_evaluations, readiness_snapshots, approvals, audit_logs, notifications, activity_timeline | 12 |
| 権限 | roles, permissions, role_permissions, user_roles, project_members | 5 |
| Rule Pack層 | category_rule_packs, rule_pack_versions, rule_records, attribute_tags, attribute_rule_sets(+versions), project_attributes, project_rule_evaluations | 8 |
| 暦 | **business_calendars**（JP/CN営業日。17番TC-69対応） | 1 |

**Phase 1最小 = 約79表**（既存64のうちPhase 1後送可: complaints/capas〔Feedback昇格が発生するまで〕, ecrs〔量産中変更が発生するまで。ただしスキーマは先行作成推奨〕, factory_records/factory_score_snapshots/score_events〔監査運用開始まで〕, comments）。**v3.0追加は15表+マスタ**であり、既存64表への変更はquotes拡張・gate_definitionsデータ書換え等の**追加型変更のみ**。`Knowledge 2表`はPhase 1後半（実績が貯まってから）で可＝TBD。

---

## 18. Phase 1 Vertical Slice（■43「顧客相談→…→Feedback」1本通し）

検証条件: **Loop最低2周**（1周目=希望条件で不成立→MODIFY、2周目=ACCEPT）を含むこと。Loop 1周完結前提の排除を通しで実証する。テストケースは第1号（タンブラー等）を流用してよいが**例であり仕様ではない**。

| # | 工程 | 主担当 | 主要テーブル | Gate |
|---|---|---|---|---|
| 1 | 顧客相談受付（自由入力・BudgetStatus/QuantityStatus=UNKNOWN可） | SYSTEM/AI | projects, requirements, **commercial_profiles** | — |
| 2 | Requirement構造化・属性推定・DNA推定 | AI | spec_fields, project_attributes, project_dna | G-13 |
| 3 | Proposal（OPTION A/B/C・概算明示） | AI→SALES承認 | proposals | G-10/G-12/G-16 |
| 4 | 顧客選択→Requirement確定・Commercial Profile初期確定 | 顧客+SALES | requirements, commercial_profile_versions | — |
| 5 | 工場探索・RFQ発行（複数数量シナリオ） | PM+SYSTEM | factories, rfqs | G-11〜G-14 |
| 6 | Quote取込（版+条件+前提） | SYSTEM | quotes, **quote_conditions** | — |
| 7 | **Loop 1周目**: Feasibility分析→不成立→Option型提案→顧客MODIFY | AI→SALES→顧客 | **commercial_loops**, cost_items(ESTIMATED) | G-15 |
| 8 | **Loop 2周目**: 再RFQ or 条件変更→再分析→ACCEPT | 同上 | commercial_loops(新周回), commercial_profile_versions | — |
| 9 | Landed Cost試算→Quotation確定→受注 | SYSTEM→SALES→MGR | **landed_cost_snapshots**, quotations(is_provisional=false), sales_orders | G-01 |
| 10 | サンプル→評価→Reference Set確定 | QA/顧客/工場 | samples, golden_samples, **production_reference_sets** | **G-02改訂版** |
| 11 | 法規確定・PO発行・生産・検品 | REG/MGR/CN | regulatory_assessments, pos, production_lots, inspections | G-03/G-05/G-06 |
| 12 | 出荷承認→輸入（関税FINAL化）→国内納品 | MGR/TRADE | shipments, imports, **duty_assessments**, deliveries, **delivery_terms** | G-04/G-05 |
| 13 | 請求・入金・Landed Cost ACTUAL化・粗利差異 | SYSTEM | invoices, payments, landed_cost_snapshots(ACTUAL) | — |
| 14 | **Feedback登録**（納品30〜60日後の能動収集Task）→ 原因区分・証跡→（必要時V1.1提案） | SYSTEM/SALES/QA | **product_feedbacks, products, product_versions** | — |
| 15 | Repeat提案（再確認8項目チェックリスト自動生成） | SYSTEM | （JP-RPT系） | G-13 |

合格基準（判定軸対応): 顧客操作は各Loop周回で3画面以内 / 人間のExcel比較・転記ゼロ（§10.2受入基準）/ 中国側へのRFQ・再見積依頼が既存Excel+WeChat機構で完結 / 全価格・費用にStatus（概算/確定/実績）表示 / KPI 16指標が実データで集計できること。

---

## 19. Architecture Lock（後から変えると大改修になる構造・Phase 0で確定）

1. Category-Agnostic 2層アーキテクチャ（Layer 1にカテゴリー固有ロジック禁止）
2. Project中心設計 + 公開ID/サロゲートキー併用 + id_sequences単調増加採番
3. 追記専用監査（audit_logs・ハッシュ連鎖・WORM）+ approvals凍結 + 承認FKなしのHard Gate突破経路の不存在
4. Hard/Soft Gate機構（Gateはデータ、6 Hard本数、G-02=**Approved Production Reference Set**方式）
5. Project DNA 8軸構成・正準コード
6. **Profile分離6種**（Product Attributes / DNA / Commercial / Quality / Regulatory / Factory）と相互参照構造
7. **Commercial Feasibility Loopが第一級Workflow**であること（周回は上書きでなく`{ProjectID}-LOOP-{NN}`の追記記録。1周完結を前提とするUI・スキーマの禁止）
8. **価格・MOQ・数量・仕様の事前確定を前提にしない**こと（BudgetStatus/QuantityStatus=UNKNOWN許容、MOQ=Quote Versionに従属するCommercial Condition）
9. イミュータブル版管理パターン（Spec版 / Quote版 / Golden Sample / Reference Set / Rule Pack版 / ProductVersion。上書き禁止・新版行・SUPERSEDED）
10. **Cost Ledger構造**（8分類+Custom費目+必須属性〔Status/Class/Responsibility/Evidence/Confidence〕、見積と実績のenum分離、Landed Cost 3段階）
11. 情報遮断3層（DBビュー/アプリ/Export）と遮断マトリクス、Role 11種
12. 言語ルール（§14: 日本語主・初出定義・Tooltip）
13. State Machine機構と正準enum体系（新設はGovernance変更手続のみ）
14. 納品後継続構造（Product/ProductVersion/Feedbackが Project CLOSED後も生存）

---

## 20. Configurable Rules（管理データとして変更可能）

Rule Pack全9(+新)要素 / **Reference Set構成決定ルール**（§11.3） / **MOQ次元マスタ** / **費用カテゴリー配下の費目シードマスタ・Custom費目** / 関税率・税計算・HS Code候補・EPA適用マッピング / Task Generatorルール（R-01〜14+Loop系） / Soft Gateの本数・WARN文言・チェックポイント / 再確認チェックリスト8項目の構成 / 質問上限・表示段階 / 通知・エスカレーション連鎖 / Tier別要否系パラメータ（LimitSample要否・検品主体等の「要否」区分） / Feedback source区分・昇格条件 / Knowledge還流の対象項目 / 営業日カレンダー（JP/CN） / Quality Profileの4択文言・教育文言集 / 承認の段階解禁（B→A化）対象Task。

---

## 21. Calibration Values（実案件データで校正する数値）

Quality Tier 26パラメータの具体数値（AQL値・抜取数・係数） / 品質⇄コスト感度係数（16番§5.1） / 概算価格・納期レンジの初期値 / deadline_rule日数・リマインド閾値 / **KPI 16指標の目標値**（Human Touch Time / Loop回数目安 / Feedback Rate等） / AI推定のconfidence閾値（自動提示可否の線） / 為替バッファ・マージン警告閾値 / MOQ・価格のKnowledge推定レンジ / Loop Option提示数の既定（A/B/Cの3が最適かは実測） / 検品厳格化・緩和の切替閾値 / 納品後Feedback収集タイミング（30日/60日）。

---

## 22. 20ケースStress Test結果

詳細は**23番（A11実施中）を正**とする。本書では代表3ケースのみ机上検証し、§1の変更リスト反映を前提にArchitecture変更なしで処理可能なことを確認した。

| ケース | 机上検証 | 判定 |
|---|---|---|
| ①予算不明の顧客 | BudgetStatus=UNKNOWNで案件開始（Commercial Profile）→ Proposalは概算レンジ+G-15透かし → Loop内で工場回答を見ながら予算観が形成され、Profileの版として記録。Quotation確定（is_provisional=false）まで受注は構造的に不可（sales_ordersのCHECK）。11番STEP 1の「予算とか数量はまだ決めていません」入力例とも整合 | **可**（追加スキーマのみで成立） |
| ②希望MOQで受ける工場がない | 全Quoteのquote_conditions vs commercial_profiles.acceptable_moq_max の突合で不成立検知（JP-LOOP-010）→「できません」ではなくOption型提案（数量増/仕様簡素化で別工場/単価増で小ロット/在庫品ベース等）→ customer_decision=MODIFY or RE_SOURCEで新Loop周回。全経路が既存Task+新Loop機構で表現でき、State Machine追加はLoopのみ | **可** |
| ③納品後の不良Feedback | product_feedbacks登録（type=DEFECT・証跡必須）→ lot_id→Traceabilityで工場・材料特定（既存機構）→ cause調査: MANUFACTURING確定ならComplaint昇格→CAPA→（必要時）V1.1をEntry Route Dの新Projectで立上げ・addressed_feedbackに記録。cause=END_USER_MISUSE/UNKNOWNなら証跡を添えて責任反証。**「問題=Crossimage責任」に自動でならない** | **可** |

DoD-10の「20ケースをArchitecture変更なしに処理可能」の最終確認は23番の完了をもって充足とする（本書§1の変更リスト反映が前提条件）。

---

## 23. 残余リスク（21番Decision Logへの追加候補）

v3.0統合後も**仕組みでは消えない/新たに生じる**リスク。番号は21番§3への追記候補（P-9〜）。

| # | リスク | 低減策 |
|---|---|---|
| P-9 | Loop多周回の営業コスト増・失注（収束しない案件に工数が溶ける） | Loop回数KPI監視+HOLD/REJECT判断の基準づくり（人間判断のまま）。周回数閾値でMGRへ提示 |
| P-10 | Cost Ledger入力負荷とAI推定依存（Confidence低のまま受注する誤判断） | Quotation承認画面にconfidence・ESTIMATED費目残数を強制表示。低confidence受注はMGR承認 |
| P-11 | 関税AI推定の誤り（BROKER_CONFIRMED前の受注でLanded Cost乖離） | DutyStatusをQuotation承認画面に表示。高税率リスク品はREVIEW_REQUIRED時点で通関業者確認をTask化 |
| P-12 | Feedback収集率が上がらない（顧客が報告しない＝賢くならない） | 能動収集Task（納品後30/60日）+Repeat提案時のヒアリング統合。Feedback Rate KPI監視 |
| P-13 | Knowledge汚染（誤った実績・例外的案件がAI推定を歪める） | Knowledge行のsource_project追跡+basis区分必須。異常値の還流はレビュー付き |
| P-14 | Reference Set構成ルールの初期不備（G-02が緩すぎ→事故 / 厳しすぎ→Repeatの利点消滅） | 初期ルールは保守側（現行GS必須相当）から開始し、実績で緩和方向はMGR承認必須 |
| P-15 | Commercial ProfileとSpecFieldの二重管理ズレ（数量の置き場所移行期の不整合） | 移行時に参照一本化を実装受入基準化（§5）。二重書込みをスキーマで禁止 |
| P-16 | Loop概念の顧客過負荷（選択肢が多すぎて決められない） | 顧客表示は常に「おすすめ1+代替」の既存原則（16番§6.2）をLoop Optionにも適用。EXP_BEGINNERはOption数上限 |

---

## 24. Owner Approval推奨内容（承認セット改訂案: 10点→16点）

20番の10点セットを破棄せず、v3.0追加6点を加えた**16点セット**へ改訂する。既存項目の分類・要旨の変更点も明記する。

| # | 項目 | 分類 | 推奨承認内容（要約） | 20番からの変更 |
|---|---|---|---|---|
| ① | 顧客Journey | B | 骨格承認。**ただしLoop画面群（A-02）の追補を承認条件に含める** | 条件追加 |
| ② | 日本側Task | B | 91Task+**Loop系3Task**を暫定承認 | 範囲拡大 |
| ③ | 中国側Task | B | 35Task+Quote回収列拡張（A-11）を暫定承認 | 微修正 |
| ④ | Project DNA | **A** | 8軸+正準コード確定（変更なし）。QualityLevelのSoT一本化ルール付帯 | 付帯追加 |
| ⑤ | Task Generator | B | 14ルール+Reference Set連動・Loop連動ルールを暫定承認 | 範囲拡大 |
| ⑥ | Gate定義 | **A** | Hard 6本+区分を確定承認。**G-02は「Approved Production Reference Set」方式で承認**（Golden Sampleは構成要素） | **要旨変更** |
| ⑦ | Quality Tier | **A** | 4段階+FIXED MINIMUM確定（26数値は暫定）。第6 Dimension（Packaging）追加を含む | 微修正 |
| ⑧ | ERD/データ設計 | **A** | 骨格確定承認の対象に**v3.0追加15表（Loop/Profile/Cost/Reference/Feedback/Version/Delivery/暦）とquotes版管理拡張**を含めて再承認 | **範囲拡大** |
| ⑨ | 権限設計 | **A** | 遮断マトリクス+代理承認確定。Cost Ledger・Landed Costへのsensitivity適用を明記 | 微修正 |
| ⑩ | Automation Matrix | B | 分類暫定承認+自動送信の段階解禁（DoD-12と同一）。Loop系Task込み再集計（A+B≥80%維持）を条件 | 条件追加 |
| ⑪ | **Commercial Feasibility Loop** | **A** | Loopを第一級Workflowとする構造（周回記録・CustomerDecision分岐・事前確定前提の禁止・Option型提案原則）を確定承認。**LoopのStatus enum新設をGovernance変更提案①として同時承認** | 新規 |
| ⑫ | **Cost Architecture** | **A（構造）/ B（シード）** | 台帳構造・必須属性・Landed Cost 3段階・遮断適用を確定承認。8分類配下の費目シード・係数は暫定（データ） | 新規 |
| ⑬ | **Production Reference Gate（G-02改訂）** | **A** | Reference Set 8構成要素と「構成はCONFIGURABLE・Gate機構はHard」の構造を確定承認。初期構成ルールは保守側で暫定 | 新規（⑥と連動） |
| ⑭ | **Profile分離** | **A** | 6 Profile分離と相互参照構造、Commercial Profileのフィールド骨格を確定承認 | 新規 |
| ⑮ | **Feedback / Product Evolution / Knowledge** | **A（構造）/ B（運用）** | ProductFeedback分離（Complaintと別）・Version系譜・AI推定/実績区別の構造を確定承認。収集タイミング・還流項目は暫定。**TYPEコードFB/PRD追加をGovernance変更提案②③として同時承認** | 新規 |
| ⑯ | **KPIセット** | B | 16指標の定義（§10.3）を暫定承認。目標値はCALIBRATION_VALUEとして実測後に設定 | 新規 |

付帯: 21番P-3（Governance v1.1〜v2.3の秘書AI裁定の事後確認）に**v3.0**を加えて一括確認すること。承認記録は14番へ追記し、C-08消化と本16点承認をもってPhase 0完了とする（DoD-10は23番完了が併せて必要）。

---

## 最終判定

### 重大な構造問題の有無: **無し（Owner Approval可）**

**理由**:
1. v3.0の全要求（Loop / Cost / Profile分離 / Reference Gate / Feedback）は、Phase 0骨格（2層アーキテクチャ・Gateのデータ化・イミュータブル版管理・追記監査・遮断3層）の**上に追加型で実装可能**であり、既存64表・State Machine 15本・Gate機構のいずれにも破壊的変更を要しない。Phase 0の「Gateはデータ」「版は上書きしない」という設計判断が、G-02改訂とQuote Version化のコストを最小化している。
2. 検出された不整合16件（大2/中7/小7）はすべて「追加・条件書換え・注記」で解消でき、§22の代表3ケース（および23番で検証中の20ケース）をArchitecture変更なしで処理できる見込みである。
3. ただし**無条件のFreezeではない**。§1の必要変更リストのうち **大2件（15番テーブル追加・11番Loop画面）と中7件** をPhase 0是正パス（またはPhase 1冒頭の設計反映スプリント）で各文書へ反映し、23番Stress Testの完了確認を経ることを、§24の16点承認の付帯条件とする。

---

## Change Log

| 版 | 日付 | 変更 |
|---|---|---|
| v1.0 | 2026-08-10 | 初版（A10）。Governance v3.0（実商流統合）と既存Phase 0設計の全差分レビュー: 必要変更16件（大2/中7/小7）、変更不要骨格の確認、Commercial Profile/Loop/Cost Ledger/Quote Version/Reference Set/Feedback/Versionの設計案、LOCK/CONFIGURABLE/CALIBRATION分類、KPI 16指標定義、代表3ケース机上検証、残余リスク8件、承認セット16点改訂案、判定=重大構造問題なし（条件付きOwner Approval可） |
