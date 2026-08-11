# 10. A1 日本側業務設計（Business Workflow / Task定義 / Task Generator / Automation Matrix）

| 項目 | 値 |
|---|---|
| Status | **Reviewed** |
| 版 | v0.5 |
| 日付 | 2026-08-11 |
| 作成 | A1 業務設計エージェント（Business Process Architect） |
| 準拠 | 05-governance-pack.md **v3.1**（用語・ID・Status・Task定義15項目・Gate・DNAに完全準拠。G-14/G-15はv1.1裁定、G-16はv2.2裁定、CustomerDecision / CommercialLoop enum・TYPEコードLOOP・G-02改訂〔Approved Production Reference Set〕はv3.0/v3.1を反映済み） |
| 依存 | 01-architecture-overview.md / 並行成果物: 11(A2), 12(A5), 13(A6)。related_tables のテーブル名は A3(15番)確定後に統合レビューで整合させる |

## 0. 設計原則（本書全体に適用）

> 注: 本書中のタンブラー等の具体例（§2のVertical Slice Task定義票を含む）は**テストケース第1号の例であり、システム仕様ではない**（Governance §0-2 / §13）。カテゴリー固有ロジックのハードコードは禁止され、カテゴリー差は Category Rule Pack + 属性タグのデータとして供給される（18番 §8）。

1. **人間の仕事は「営業・提案・重要判断・承認」のみ**。翻訳・リマインド・転記・進捗確認・定型文書は全て `A_FULL_AUTO` または `B_AI_DRAFT`。
2. **工場との入出力はハイブリッド前提**（Governance §11）。工場向け出力Taskは「中国語Excel生成＋WeChatDigest生成→CN_OFFICE経由送信」を標準動作とし、Portalは閲覧補助。工場からの入力はExcel/WeChat要約の構造化取込（登録時点でSoT昇格）。
3. 固定Workflowは持たない。**Task Generator（§4）が ProjectDNA + Entry Route から必要Taskのみ生成**し、不要Taskは生成しない（または `SKIPPED`）。
4. 承認が必要なB分類Taskは、Task内の `human_action` として承認を内包する。独立した承認Task（C分類）を切り出すのは Gate に直結する重要判断のみ。
5. Task実体IDは案件生成時に `{ProjectID}-TSK-{NNNN}` を採番。本書はテンプレート（`JP-{領域}-{NNN}`、10刻み）を定義する。

---

## 1. 日本側業務の全体マップ（7 Workstream × 約45プロセス）

Workstream割付の原則: LEAD/PROP/FIN/CMP/RPT→COMMERCIAL、REQ/SPEC(仕様)→PRODUCT、SPEC(デザイン・版下・パッケージ)→DESIGN、FACT/RFQ/PROD→FACTORY、QUAL/SMP/INSP/CAPA→QUALITY、REG→REGULATORY、LOGI→LOGISTICS。
（領域コードに DESIGN 専用コードは無いため、デザイン系プロセスは SPEC 領域の後半番号(050〜)を充当。新コードは新設しない。顧客見積(Quotation)は提案行為として PROP 領域を充当。）

| # | Workstream | プロセス | テンプレートID範囲 | Automation分類(主) |
|---|---|---|---|---|
| P-01 | COMMERCIAL | Lead受付・Project起票 | JP-LEAD-010 | A_FULL_AUTO |
| P-02 | COMMERCIAL | Entry Route判定・ProjectDNA初期推定 | JP-LEAD-020 | A_FULL_AUTO |
| P-03 | COMMERCIAL | ProjectDNA確定 | JP-LEAD-030 | C_HUMAN_DECISION |
| P-04 | COMMERCIAL | 商談・ヒアリング（人的営業） | JP-LEAD-040 | C_HUMAN_DECISION |
| P-05 | COMMERCIAL | 休眠Leadフォローアップ | JP-LEAD-050 | A_FULL_AUTO |
| P-06 | COMMERCIAL | Proposal生成・承認・送信・反応分析 | JP-PROP-010〜050 | B_AI_DRAFT / C |
| P-07 | COMMERCIAL | 顧客見積(Quotation)作成・送信 | JP-PROP-060〜070 | B_AI_DRAFT |
| P-08 | COMMERCIAL | 価格交渉・条件調整 | JP-PROP-080 | C_HUMAN_DECISION |
| P-09 | COMMERCIAL | 受注確認・注文請書 | JP-FIN-010 | B_AI_DRAFT |
| P-10 | COMMERCIAL | 請求・入金管理 | JP-FIN-020〜030 | A_FULL_AUTO |
| P-11 | COMMERCIAL | Profitability集計・マージン差異警告 | JP-FIN-040 | A_FULL_AUTO |
| P-12 | COMMERCIAL | 工場支払管理 | JP-FIN-050 | A_FULL_AUTO |
| P-13 | COMMERCIAL | クレーム受付・一次対応 | JP-CMP-010〜020 | B_AI_DRAFT |
| P-14 | COMMERCIAL | 重大クレーム・責任交渉／市場事故対応 | JP-CMP-040〜050 | D_MANUAL_EXCEPTION |
| P-15 | COMMERCIAL | Repeat Order受付・差分確認・発注 | JP-RPT-010〜040 | A_FULL_AUTO / C |
| P-16 | PRODUCT | Requirement解析（Known/Missing/Conflicting） | JP-REQ-010 | A_FULL_AUTO |
| P-17 | PRODUCT | BLOCKER質問生成・回答取込 | JP-REQ-020〜030 | B_AI_DRAFT / A |
| P-18 | PRODUCT | Requirement確定 | JP-REQ-040 | C_HUMAN_DECISION |
| P-19 | PRODUCT | 要件変更受付・差分解析 | JP-REQ-050 | B_AI_DRAFT |
| P-20 | PRODUCT | SpecField起票・補完質問 | JP-SPEC-010〜020 | B_AI_DRAFT |
| P-21 | PRODUCT | 付加価値提案(Enhancement)掲載 | JP-SPEC-030 | A_FULL_AUTO |
| P-22 | PRODUCT | Specification版発行・承認 | JP-SPEC-040 | B_AI_DRAFT |
| P-23 | DESIGN | デザインデータ受領・検証 | JP-SPEC-050 | B_AI_DRAFT |
| P-24 | DESIGN | アートワーク・版下確認 | JP-SPEC-060 | B_AI_DRAFT |
| P-25 | DESIGN | パッケージ仕様設計 | JP-SPEC-070 | B_AI_DRAFT |
| P-26 | FACTORY | 工場候補抽出（Factory Score） | JP-FACT-010 | B_AI_DRAFT |
| P-27 | FACTORY | RFQ先工場選定／量産工場最終選定 | JP-FACT-020, 050 | C_HUMAN_DECISION |
| P-28 | FACTORY | 新規工場調査依頼（→CN連携） | JP-FACT-030〜040 | B_AI_DRAFT / A |
| P-29 | FACTORY | RFQ生成・承認・発行（中国語Excel+WeChatDigest） | JP-RFQ-010〜030 | B / C / A |
| P-30 | FACTORY | 中国語工場仕様書生成指示 | JP-RFQ-040 | A_FULL_AUTO |
| P-31 | FACTORY | RFQ督促・Quote取込・比較・交渉準備 | JP-RFQ-050〜080 | A_FULL_AUTO / B |
| P-32 | FACTORY | Reference Set確定・工場PO作成・承認・発行 | JP-PROD-005〜020 | C / B / C |
| P-33 | FACTORY | 生産進捗取込・遅延検知 | JP-PROD-030〜040 | A_FULL_AUTO |
| P-34 | FACTORY | ECR受付・審査・承認 | JP-PROD-050〜060 | B / C |
| P-35 | FACTORY | UnauthorizedChange検知対応 | JP-PROD-070 | A_FULL_AUTO |
| P-36 | FACTORY | 週次顧客進捗レポート | JP-PROD-080 | A_FULL_AUTO |
| P-37 | QUALITY | Quality Profile推奨・Tier確定 | JP-QUAL-010〜020 | B / C |
| P-38 | QUALITY | 品質基準書作成・中国語出力・コスト可視化 | JP-QUAL-030〜050 | B / A |
| P-39 | QUALITY | サンプル依頼・追跡・評価 | JP-SMP-010〜040, 080 | A / B |
| P-40 | QUALITY | GoldenSample承認・LOCK／LimitSample登録 | JP-SMP-050〜070 | C / A / B |
| P-41 | QUALITY | 検品計画・検品指示・結果判定 | JP-INSP-010〜040 | B / A |
| P-42 | QUALITY | CAPA依頼・フォロー・クローズ | JP-CMP-030, 060 | B / A |
| P-43 | REGULATORY | 法規初期チェック（Regulatory Engine連携） | JP-REG-010 | B_AI_DRAFT |
| P-44 | REGULATORY | 必要書類・試験リスト・試験手配 | JP-REG-020〜030 | B_AI_DRAFT |
| P-45 | REGULATORY | 法規最終判断・Status確定 | JP-REG-040 | C_HUMAN_DECISION |
| P-46 | REGULATORY | 表示・ラベル法規確認 | JP-REG-050 | B_AI_DRAFT |
| P-47 | LOGISTICS | 出荷書類生成・ブッキング | JP-LOGI-010〜020 | A / B |
| P-48 | LOGISTICS | ShipmentRelease（出荷承認） | JP-LOGI-030 | C_HUMAN_DECISION |
| P-49 | LOGISTICS | 通関・納品・完了レポート | JP-LOGI-040〜060 | A_FULL_AUTO |
| P-50 | QUALITY | Claim（性能主張）候補抽出・実証管理 | JP-QUAL-060〜070 | B_AI_DRAFT |
| P-51 | COMMERCIAL | Commercial Feasibility Loop（商流成立性の周回: Feasibility分析・顧客Option提案・CustomerDecision取込） | JP-LOOP-010〜030 | A / B / A |

---

## 2. Vertical Slice 詳細Task定義票（タンブラーPoC: 0知識顧客 → Proposal → Requirement → RFQ → 中国語工場仕様書出力）

対象Entry Route: A. IDEA MODE、想定DNA初期推定: `EXP_BEGINNER × INT_EXPLORE × ODM_1_LOGO × PRISK_MEDIUM(食品接触) × Q2_STANDARD × BIMP_MEDIUM × FRISK_TRUSTED × CRISK_LOW/PRIO_NORMAL`。
全20Task。Governance §5 の15項目完全形。実行順は概ね記載順（Task GeneratorがDAGとして生成、並行可のものは並行）。

> ※ 本節のタンブラーは Universal Core + Rule Pack 機構検証用の**テストケース第1号の例であり、タンブラー専用のシステム仕様ではない**（Governance §0-2 / §13）。Task本文中のカテゴリ由来の質問・仕様項目・法規・試験の中身は、Category Rule Pack + 属性タグから供給されるデータである（18番 §8.1）。

```yaml
task_id: JP-LEAD-010
name: Lead受付・Project起票
purpose: 顧客の自由入力（文章/画像/URL）を受け付け、Projectを即時起票して初動遅延をゼロにする
owner_role: SYSTEM
trigger: CLIENT PORTAL/メール/LINE経由の新規問い合わせ受信
inputs: [顧客自由入力, Client既存情報（あれば）]
system_action: Client名寄せ・重複チェック、Project採番（CI-{YYYY}-{NNNN}）、Status=DRAFT設定、入力原文をDocument保存
ai_action: 入力チャネル文面から商品カテゴリ・緊急度の一次タグ付け
human_action: none
outputs: [Project(DRAFT), Document(問い合わせ原文)]
approval_required: false
blocking_condition: none
deadline_rule: trigger+5分（自動処理）
notification: 起票完了→担当SALESへ新着Lead通知
related_docs: [問い合わせ受付控え]
related_tables: [clients, projects, documents]
automation_class: A_FULL_AUTO
gates: []
```

```yaml
task_id: JP-LEAD-020
name: Entry Route判定・ProjectDNA初期推定
purpose: 入力内容からEntry Route(A/B/C/D)とDNA8軸を推定し、Task Generatorの入力を作る
owner_role: AI
trigger: JP-LEAD-010完了
inputs: [顧客自由入力, Client過去案件履歴]
system_action: Entry Route判定結果とDNA推定値をProjectへ格納（全軸AI_SUGGESTED）、Task Generator起動
ai_action: DNA8軸推定（根拠テキスト付き）、Entry Route判定（CAD/BOM添付検知→C、過去仕様参照→D 等）
human_action: none（確定はJP-LEAD-030で実施）
outputs: [ProjectDNA(AI_SUGGESTED), EntryRoute判定, 生成Taskセット]
approval_required: false
blocking_condition: none
deadline_rule: trigger+5分（自動処理）
notification: DNA推定完了→担当SALESへ（推定根拠付き）
related_docs: [none]
related_tables: [projects, project_dna, tasks]
automation_class: A_FULL_AUTO
gates: [G-13]
```

```yaml
task_id: JP-REQ-010
name: Requirement解析
purpose: 顧客の生の要求をKnown/Missing/Conflicting/Assumption/Critical Missingに分類し、以降の全Taskの土台を作る
owner_role: AI
trigger: JP-LEAD-020完了
inputs: [顧客自由入力, ProjectDNA(AI_SUGGESTED)]
system_action: Requirement Analyzer実行、分類結果をRequirementレコードとして登録
ai_action: 要求分解・分類、Assumptionの明示（例:「タンブラー=真空断熱ステンレスと仮定」）、BLOCKER候補抽出
human_action: none（01の定義によりRequirement Analyzerは人間承認不要）
outputs: [Requirement(分類済), BLOCKER質問候補リスト]
approval_required: false
blocking_condition: none
deadline_rule: trigger+10分（自動処理）
notification: 解析完了→担当SALESへ（Critical Missing件数付き）
related_docs: [none]
related_tables: [requirements, projects]
automation_class: A_FULL_AUTO
gates: []
```

```yaml
task_id: JP-REQ-020
name: BLOCKER質問生成・送信
purpose: 提案・見積に不可欠な欠落情報のみを最小質問数で顧客に確認し、離脱を防ぐ
owner_role: SALES
trigger: JP-REQ-010完了 かつ Critical Missingが1件以上
inputs: [Requirement, ProjectDNA]
system_action: 質問セット起票、CLIENT PORTAL/メールへの送信キュー作成、未回答リマインドのスケジューリング
ai_action: BLOCKER質問ドラフト生成（EXP_BEGINNERには専門用語を使わず選択肢形式、質問数はDNA導出上限内）
human_action: 質問文面の確認・修正・送信承認（初回顧客のみ。2回目以降の同型質問は自動送信）
outputs: [BLOCKER質問セット(送信済)]
approval_required: true（SALES）
blocking_condition: none
deadline_rule: trigger+4営業時間
notification: 送信承認待ち→SALES、顧客未回答48時間→SALESへ、96時間→MGRへ
related_docs: [質問メール/PORTALメッセージ]
related_tables: [requirements, questions, notifications]
automation_class: B_AI_DRAFT
gates: [G-10]
```

```yaml
task_id: JP-REQ-030
name: 顧客回答取込・Requirement更新
purpose: 顧客回答を転記ゼロでRequirementへ反映し、G-10解消を自動判定する
owner_role: SYSTEM
trigger: BLOCKER質問への顧客回答受信（PORTAL/メール/LINEいずれも）
inputs: [顧客回答, BLOCKER質問セット]
system_action: 回答を構造化してRequirement更新、G-10充足再判定、未回答残数の更新
ai_action: 自由文回答の構造化（曖昧回答はAssumptionとして記録し確認質問を再生成）
human_action: none
outputs: [Requirement(更新), G-10判定結果]
approval_required: false
blocking_condition: none
deadline_rule: 回答受信+10分（自動処理）
notification: 全BLOCKER解消→SALESへ「必須質問すべて回答済み → 商品提案（Proposal）を確定できます」通知
related_docs: [none]
related_tables: [requirements, questions]
automation_class: A_FULL_AUTO
gates: [G-10]
```

```yaml
task_id: JP-PROP-010
name: 参考商品・過去案件検索
purpose: Proposalドラフトの素材（類似過去案件・参考商品・概算原価レンジ）を自動収集する
owner_role: AI
trigger: JP-REQ-010完了 かつ EntryRoute=A かつ ExperienceLevel=EXP_BEGINNER/EXP_INTERMEDIATE
inputs: [Requirement, ProjectDNA, 過去案件DB, Factory Score]
system_action: 類似案件・参考商品・実績価格レンジの検索結果をProposal素材として格納
ai_action: タンブラー類似案件の抽出、容量・材質・加飾の選択肢マップ生成、概算レンジ推定（根拠付き）
human_action: none
outputs: [Proposal素材セット]
approval_required: false
blocking_condition: none
deadline_rule: trigger+30分（自動処理）
notification: none
related_docs: [none]
related_tables: [projects, proposals, quotes]
automation_class: A_FULL_AUTO
gates: []
```

```yaml
task_id: JP-PROP-020
name: Proposalドラフト生成（OPTION A/B/C）
purpose: 曖昧要求に対しOPTION A/B/Cを提示し、0知識顧客の離脱を防ぎCOMMITTEDへ導く
owner_role: SALES
trigger: JP-PROP-010完了（G-10未解消でもWARN付きで生成可）
inputs: [Requirement, ProjectDNA, Proposal素材セット]
system_action: Proposalレコード起票（{ProjectID}-DOC採番）、Enhancement Engineの付加価値候補を添付
ai_action: OPTION A/B/C生成（Concept/Features/MOQ/概算価格レンジ/LeadTime/利点/Trade-off。EXP_BEGINNER向け平易文体、工場原価・粗利は含めない）
human_action: none（承認はJP-PROP-030）
outputs: [Proposal(ドラフト)]
approval_required: false
blocking_condition: BLOCKER質問未回答が残る場合はWARN表示のうえ暫定値明記で生成
deadline_rule: trigger+4営業時間
notification: ドラフト完成→SALESへレビュー依頼
related_docs: [Proposal Export PDF(ドラフト)]
related_tables: [proposals, projects, requirements]
automation_class: B_AI_DRAFT
gates: [G-10, G-12, G-16]
```

```yaml
task_id: JP-PROP-030
name: Proposal承認
purpose: 顧客に出す提案の品質・価格レンジ・実現可能性を人間が最終確認する（初期運用は全件承認）
owner_role: SALES
trigger: JP-PROP-020完了
inputs: [Proposal(ドラフト), Requirement, ProjectDNA]
system_action: Approvalレコード作成（PENDING）、承認画面提示（修正はドラフトへ差し戻し）
ai_action: 承認観点チェックリスト提示（概算根拠・MOQ整合・情報遮断違反スキャン結果）
human_action: 内容確認・修正指示または承認（APPROVED/REJECTED/CONDITIONAL）
outputs: [Approval記録, Proposal(承認済)]
approval_required: true（SALES。代理承認者=MGR）
blocking_condition: G-10未解消の場合はWARN表示（SOFT、承認者判断で進行可）
deadline_rule: trigger+1営業日
notification: 承認待ち→SALES、期限超過→MGRへエスカレーション
related_docs: [Proposal Export PDF]
related_tables: [proposals, approvals]
automation_class: C_HUMAN_DECISION
gates: [G-10]
```

```yaml
task_id: JP-PROP-040
name: Proposal送信・追跡
purpose: 承認済Proposalを顧客チャネルへ自動送信し、閲覧・反応を追跡する
owner_role: SYSTEM
trigger: JP-PROP-030でApproval=APPROVED
inputs: [Proposal(承認済), Client連絡チャネル設定]
system_action: PDF出力（透かし・版番号付与）、PORTAL掲示+メール/LINE送信、閲覧トラッキング、未反応時フォローアップのスケジューリング
ai_action: 送付文面の生成（顧客心理Statusに応じたトーン調整）
human_action: none
outputs: [Proposal送信記録, 閲覧ログ]
approval_required: false
blocking_condition: Approval=APPROVED以外では送信不可
deadline_rule: 承認+1営業時間
notification: 顧客閲覧→SALESへ、7日間未閲覧→SALESへフォロー提案
related_docs: [Proposal Export PDF]
related_tables: [proposals, documents, notifications]
automation_class: A_FULL_AUTO
gates: [G-16]
```

```yaml
task_id: JP-REQ-040
name: Requirement確定
purpose: 顧客のOPTION選択・修正要望を反映し、Requirementを確定して仕様化フェーズへ進める
owner_role: SALES
trigger: 顧客がOPTIONを選択（または修正要望を返信）
inputs: [Proposal, 顧客選択・修正要望, Requirement]
system_action: 選択OPTIONをRequirementへマージ、修正要望の差分をAIが反映案として提示、確定操作でRequirementを確定版化
ai_action: 修正要望の解釈・Requirement反映ドラフト、残存曖昧点の警告
human_action: 反映内容を確認しRequirement確定を決定（顧客との齟齬リスクの最終判断）
outputs: [Requirement(確定版)]
approval_required: true（SALES）
blocking_condition: 顧客選択が未着の場合は開始不可
deadline_rule: 顧客選択受信+1営業日
notification: 確定完了→PMへ（SpecField起票へ引継ぎ）
related_docs: [Requirement確定通知（顧客向け平易版）]
related_tables: [requirements, projects, approvals]
automation_class: C_HUMAN_DECISION
gates: []
```

```yaml
task_id: JP-SPEC-010
name: SpecField起票（Requirement→SpecField変換）
purpose: 確定Requirementを仕様項目に分解し、Field単位Status付きでSpecificationの骨格を作る
owner_role: PM
trigger: JP-REQ-040完了
inputs: [Requirement(確定版), ProjectDNA, カテゴリ別SpecFieldテンプレート（Category Rule Pack + 属性タグから供給されるデータ・18番 §8。例〔テストケース第1号タンブラー〕: 容量/材質/表面処理/断熱構造/蓋仕様/印刷・加飾/色(Pantone)/容器包装/食品接触材質明細 等）]
system_action: SpecFieldレコード一括起票、各FieldへStatus付与（顧客明言=CONFIRMED、AI補完=AI_SUGGESTED、暫定=PROVISIONAL、不明=UNKNOWN）、Readiness(RFQ_READY)判定開始
ai_action: Requirement→SpecFieldマッピング、業界標準値による補完提案（根拠付き）
human_action: 起票結果の確認、AI_SUGGESTED値の妥当性チェック（確定操作は不要、確定は顧客回答・サンプルで段階的に）
outputs: [SpecField一式(Status付), RFQ_READY判定(不足理由リスト)]
approval_required: true（PM。AI補完値の採用可否）
blocking_condition: Requirement未確定
deadline_rule: trigger+1営業日
notification: 「見積依頼の準備状況（RFQ_READY）: 不足理由○件」→PMへ（通知文面は日本語主+括弧コード）、起票完了→SALESへ
related_docs: [Specification(ドラフト)]
related_tables: [specifications, spec_fields, requirements]
automation_class: B_AI_DRAFT
gates: [G-11, G-12]
```

```yaml
task_id: JP-LEAD-030
name: ProjectDNA確定
purpose: AI推定DNAを人間が確定し、以降の承認段数・検品密度・報告頻度の導出を固定する
owner_role: SALES
trigger: JP-REQ-040完了（Requirement確定によりDNA判断材料が揃った時点。以降RFQ発行までに実施）
inputs: [ProjectDNA(AI_SUGGESTED), Requirement(確定版), Client情報]
system_action: DNA確定画面提示（軸ごとに推定根拠を表示）、確定時に履歴保存（変更前後・理由・承認者）、Task Generator再実行（差分Taskの生成/SKIP）
ai_action: 確定推奨値と変更時の影響提示（例: PRISK_MEDIUM→HIGHで法規Task追加）
human_action: 8軸の確定（修正可）。PRIO/CRISK軸はMGRと協議可
outputs: [ProjectDNA(確定, 履歴付)]
approval_required: true（SALES。PRIO_STRATEGIC指定時はMGR）
blocking_condition: none（未確定でもSOFT範囲は進行可、ただしG-13によりRFQ発行時WARN）
deadline_rule: RFQ発行前まで（推奨: Requirement確定+1営業日）
notification: 未確定のままRFQ準備開始→SALESへWARN
related_docs: [none]
related_tables: [project_dna, projects, audit_logs]
automation_class: C_HUMAN_DECISION
gates: [G-13]
```

```yaml
task_id: JP-REG-010
name: 法規初期チェック連携（Regulatory Engine起動）
purpose: タンブラー（食品接触）の適用法規候補を早期に洗い出し、後工程での手戻り・出荷停止を防ぐ
owner_role: REG
trigger: JP-SPEC-010完了（材質・用途Fieldが起票された時点。UNKNOWNでもカテゴリベースで起動）
inputs: [SpecField(材質・用途・対象年齢・販売チャネル), ProjectDNA]
system_action: Regulatory Engine実行（案件作成時の自動一次判定で既にCHECKINGへ遷移済みの場合は再照合。A6 §1.5準拠）、結果をRegulatoryレコード登録
ai_action: 適用法規候補リスト生成（食品衛生法・食品接触材質、家庭用品品質表示法 等）+必要書類・試験候補+専門家確認要否（法令の最終判断はしない）
human_action: 候補リストの一次確認、REVIEW_REQUIRED項目の特定（最終判断はJP-REG-040）
outputs: [Regulatory(CHECKING→REVIEW_REQUIRED or APPROVED候補), 必要試験候補リスト]
approval_required: true（REG。候補リストの確認）
blocking_condition: none（初期チェック段階。BLOCKED時はG-03が該当工程を停止）
deadline_rule: trigger+2営業日
notification: REVIEW_REQUIRED検出→REGへ、5営業日放置→MGRへ
related_docs: [法規チェックリスト（A6テンプレート準拠）]
related_tables: [regulatory_checks, spec_fields, projects]
automation_class: B_AI_DRAFT
gates: [G-03]
```

```yaml
task_id: JP-FACT-010
name: 工場候補抽出（Factory Score）
purpose: RFQ送付先候補をFactory Scoreに基づき客観抽出し、選定判断の材料を揃える
owner_role: PM
trigger: JP-SPEC-010完了 かつ RFQ_READY=true見込み（不足理由がSOFT範囲のみ）
inputs: [SpecField一式, ProjectDNA, Factory Database, Factory Score]
system_action: カテゴリ・工程適合・実績・監査状態で候補フィルタ、スコア順リスト生成
ai_action: 候補工場ごとの推薦理由・リスク（FRISK軸・過去不良率・LeadTime実績）要約。FRISK_NEW工場は監査要件を注記
human_action: 候補リストの確認、追加候補の指名（あれば）。CN_OFFICEへの新規調査依頼要否判断
outputs: [工場候補リスト(スコア・根拠付)]
approval_required: true（PM）
blocking_condition: 候補0件の場合はJP-FACT-030（新規工場調査依頼）を自動起票しWAITING_CHINA
deadline_rule: trigger+1営業日
notification: 候補リスト完成→PM/SALESへ、候補0件→PM+CN_OFFICEへ
related_docs: [none]
related_tables: [factories, factory_scores, projects]
automation_class: B_AI_DRAFT
gates: []
```

```yaml
task_id: JP-FACT-020
name: RFQ先工場選定
purpose: RFQを送る工場を人間が決定する（複数社並行が原則。情報遮断の起点管理）
owner_role: PM
trigger: JP-FACT-010完了
inputs: [工場候補リスト, ProjectDNA]
system_action: 選定結果をProject-Factory関連として登録、RFQ Task（JP-RFQ-010）を選定社数分起票
ai_action: 推奨組合せ提示（例: FRISK_TRUSTED 2社+相見積用1社。FRISK_NEW/HIGHが含まれる場合は3社以上を推奨）
human_action: 送付先工場の最終決定（社数・組合せ）
outputs: [RFQ先工場リスト(確定)]
approval_required: true（PM。代理承認者=MGR）
blocking_condition: 候補リスト未作成
deadline_rule: trigger+1営業日
notification: 選定完了→SALES/CN_OFFICEへ
related_docs: [none]
related_tables: [factories, projects, rfqs]
automation_class: C_HUMAN_DECISION
gates: []
```

```yaml
task_id: JP-RFQ-010
name: RFQドラフト生成
purpose: 承認済SpecFieldから工場見積依頼（中国語）を自動ドラフトし、転記・翻訳工数をゼロにする
owner_role: PM
trigger: JP-FACT-020完了
inputs: [SpecField一式(Status付), 数量シナリオ, ProjectDNA, A5中国語RFQテンプレート(12番)]
system_action: RFQ採番（{ProjectID}-RFQ-{NN}）、SpecFieldのStatusをRFQに明記（CONFIRMED/PROVISIONAL/UNKNOWN別記号）、数量未確定時は複数数量シナリオを自動設定
ai_action: 中国語RFQドラフト生成（Translation/Doc Engine。製造現場慣用表現ルールブック準拠、PROVISIONAL項目は「暂定」明記）、顧客販売価格・粗利・他工場情報の混入スキャン
human_action: none（承認はJP-RFQ-020）
outputs: [RFQ(ドラフト, 中国語)]
approval_required: false
blocking_condition: RFQ先工場未確定
deadline_rule: trigger+4営業時間
notification: ドラフト完成→PMへレビュー依頼
related_docs: [RFQ Excel(中国語, 13シート構成サブセット)]
related_tables: [rfqs, spec_fields, factories]
automation_class: B_AI_DRAFT
gates: [G-11, G-12, G-13]
```

```yaml
task_id: JP-RFQ-020
name: RFQ承認
purpose: 工場に出す依頼内容（仕様・数量・希望条件・情報遮断）を人間が最終確認する
owner_role: PM
trigger: JP-RFQ-010完了
inputs: [RFQ(ドラフト), SpecField一式, ProjectDNA]
system_action: Approvalレコード作成（PENDING）、G-11/G-12/G-13の判定結果を承認画面に表示（表示規則: 「注意（WARN）: 色番号（パントン）未確定〔G-11〕」のように日本語名+括弧コードで表示。SOFT、承認者判断で進行可）
ai_action: 承認観点チェックリスト（PROVISIONAL/UNKNOWN項目一覧、情報遮断スキャン結果、数量シナリオ妥当性）
human_action: RFQ内容の確認・修正指示または承認
outputs: [Approval記録, RFQ(承認済)]
approval_required: true（PM。代理承認者=MGR）
blocking_condition: none（SOFT Gate WARNは承認画面に明示）
deadline_rule: trigger+1営業日
notification: 承認待ち→PM、期限超過→MGRへ
related_docs: [RFQ Excel(中国語)]
related_tables: [rfqs, approvals]
automation_class: C_HUMAN_DECISION
gates: [G-11, G-12, G-13]
```

```yaml
task_id: JP-RFQ-030
name: RFQ発行（Excel生成・WeChatDigest送信）
purpose: 承認済RFQをハイブリッドチャネル（Excel添付が正、Portal閲覧補助、WeChat要約）で工場へ確実に届ける
owner_role: SYSTEM
trigger: JP-RFQ-020でApproval=APPROVED
inputs: [RFQ(承認済), RFQ先工場リスト, 工場チャネル設定]
system_action: 中国語Excel出力（ProjectID/DocType/Version/出力日時/DRAFT or APPROVED透かし埋込）、FACTORY PORTAL掲載、WeChatDigest生成→CN_OFFICE送信キュー、回答期限の設定と督促スケジューリング
ai_action: WeChatDigest中国語要約生成（要求要点・回答期限・PROVISIONAL項目注意書き）
human_action: none（CN_OFFICE側の送信操作は12番A5成果物のCN Task側で定義）
outputs: [RFQ(発行済), WeChatDigest, 送付記録]
approval_required: false
blocking_condition: Approval=APPROVED以外では発行不可
deadline_rule: 承認+1営業時間
notification: 発行完了→PM/CN_OFFICEへ、工場既読なし24時間→CN_OFFICEへ
related_docs: [RFQ Excel(中国語), WeChatDigest]
related_tables: [rfqs, documents, notifications]
automation_class: A_FULL_AUTO
gates: [G-13, G-14]
```

```yaml
task_id: JP-RFQ-040
name: 中国語工場仕様書生成指示
purpose: RFQ発行時点のSpecFieldから中国語工場仕様書（产品规格书ドラフト）を自動生成し、工場の見積精度と後続量産の仕様SoTを揃える
owner_role: SYSTEM
trigger: JP-RFQ-030完了
inputs: [SpecField一式(Status付), A5中国語仕様書テンプレート(12番), ProjectDNA]
system_action: Translation/Doc Engineへ生成指示、仕様書ドラフトをDocument登録（Version=V1, DRAFT透かし）、SpecField Statusを仕様書上に明記（CONFIRMED=确认/PROVISIONAL=暂定/UNKNOWN=待定）
ai_action: 中国語仕様書ドラフト生成（製造・QC現場慣用表現。日本語直訳禁止ルール準拠）、情報遮断スキャン
human_action: none（初回テンプレートの承認は済んでいる前提。テンプレ未承認期間はPM確認を挟むB運用）
outputs: [中国語工場仕様書ドラフト(V1)]
approval_required: false
blocking_condition: RFQ未発行
deadline_rule: trigger+1営業時間
notification: 生成完了→PM/CN_OFFICEへ
related_docs: [中国語工場仕様書(产品规格书) Excel/PDF]
related_tables: [specifications, spec_fields, documents]
automation_class: A_FULL_AUTO
gates: []
```

```yaml
task_id: JP-RFQ-050
name: RFQ回答リマインド・督促
purpose: 工場からのQuote回収を人手ゼロで追跡し、回答期限超過を放置しない
owner_role: SYSTEM
trigger: JP-RFQ-030完了（回答期限監視の常駐タスク）
inputs: [RFQ(発行済), 回答期限, 工場既読・回答状況]
system_action: 期限-2営業日と期限超過時にWeChatDigest督促文を自動生成しCN_OFFICE送信キューへ、Task Status=WAITING_CHINA管理
ai_action: 督促文の中国語生成（関係性を損なわない表現、未回答項目の特定）
human_action: none（期限+3営業日超過時のみPMへ判断エスカレーション）
outputs: [督促記録, 回答状況レポート]
approval_required: false
blocking_condition: none
deadline_rule: 回答期限に連動（自動）
notification: 期限-2営業日→CN_OFFICE、期限超過→PM、+3営業日→MGR
related_docs: [WeChatDigest(督促)]
related_tables: [rfqs, notifications]
automation_class: A_FULL_AUTO
gates: []
```

### 2.1 Vertical Slice の流れ（要約）

```
JP-LEAD-010(A) → JP-LEAD-020(A) → JP-REQ-010(A) → JP-REQ-020(B) ⇄ JP-REQ-030(A)
  → JP-PROP-010(A) → JP-PROP-020(B) → JP-PROP-030(C) → JP-PROP-040(A)
  → [顧客選択] → JP-REQ-040(C) → JP-SPEC-010(B) ─┬→ JP-LEAD-030(C: DNA確定)
                                                  └→ JP-REG-010(B: 法規初期チェック・並行)
  → JP-FACT-010(B) → JP-FACT-020(C) → JP-RFQ-010(B) → JP-RFQ-020(C)
  → JP-RFQ-030(A) → JP-RFQ-040(A: 中国語仕様書) / JP-RFQ-050(A: 督促常駐)
```

Slice内訳: 20 Task = A:9 / B:6 / C:5 / D:0（A+B=75%。Cの5件は全て承認・重要判断であり設計原則どおり。全体比率は§6参照）。

---

## 3. その他プロセスの簡易Task定義（Vertical Slice外・75 Task。§3表72件 + §3.1 Claim管理2件は表と重複掲載 + §3.2 Loop系3件）

| task_id | name | owner_role | trigger | automation_class | gates |
|---|---|---|---|---|---|
| JP-LEAD-040 | 商談・ヒアリング実施（非定型） | SALES | 顧客が対話希望 or AI判定で人的対応推奨 | C_HUMAN_DECISION | [] |
| JP-LEAD-050 | 休眠Leadフォローアップ | SYSTEM | 最終接点から14日無応答 | A_FULL_AUTO | [] |
| JP-PROP-050 | Proposal反応分析・顧客心理Status更新 | AI | Proposal閲覧ログ/返信受信 | A_FULL_AUTO | [] |
| JP-PROP-060 | 顧客見積(Quotation)ドラフト生成・承認 | SALES | Quote比較完了 or 概算依頼受信 | B_AI_DRAFT | [G-12, G-15] |
| JP-PROP-070 | Quotation送信・追跡 | SYSTEM | Quotation承認完了 | A_FULL_AUTO | [G-14] |
| JP-PROP-080 | 価格交渉・条件調整 | SALES | 顧客/工場から価格協議要求 | C_HUMAN_DECISION | [] |
| JP-REQ-050 | 要件変更受付・差分解析 | PM | 顧客から仕様変更要望受信 | B_AI_DRAFT | [] |
| JP-SPEC-020 | SpecField補完質問生成・送信 | PM | UNKNOWN/PROVISIONAL Fieldが工程期限に接近 | B_AI_DRAFT | [G-11] |
| JP-SPEC-030 | Enhancement提案掲載 | SYSTEM | SpecField起票完了 | A_FULL_AUTO | [] |
| JP-SPEC-040 | Specification版発行・承認（V1..Vn） | PM | 主要SpecField=CONFIRMED到達 or ECR承認 | B_AI_DRAFT | [] |
| JP-SPEC-050 | デザインデータ受領・検証 | PM | 顧客からロゴ/デザイン入稿 | B_AI_DRAFT | [] |
| JP-SPEC-060 | アートワーク・版下確認 | PM | 工場から版下(印刷校正)受領 | B_AI_DRAFT | [G-16] |
| JP-SPEC-070 | パッケージ仕様ドラフト | PM | Packaging要求確定 or Q3以上でTier確定 | B_AI_DRAFT | [G-16] |
| JP-RFQ-060 | Quote受領・構造化取込（Excel/WeChat→SoT） | SYSTEM | 工場から返信Excel/WeChat要約受信 | A_FULL_AUTO | [] |
| JP-RFQ-070 | Quote比較表生成 | SYSTEM | 全RFQ先のQuote登録完了 or 期限到達 | A_FULL_AUTO | [] |
| JP-RFQ-080 | 追加交渉ポイント抽出 | PM | Quote比較表生成完了 | B_AI_DRAFT | [] |
| JP-FACT-030 | 新規工場調査依頼（→CN_OFFICE） | PM | 候補0件 or 人間が新規開拓指示 | B_AI_DRAFT | [] |
| JP-FACT-040 | Factory Score更新確認 | SYSTEM | 検品/納期/クレーム実績の登録 | A_FULL_AUTO | [] |
| JP-FACT-050 | 量産工場最終選定 | PM | Quote比較+サンプル評価完了 | C_HUMAN_DECISION | [] |
| JP-SMP-010 | サンプル依頼書生成・送付（中国語） | SYSTEM | 工場選定+サンプル要否確定 | A_FULL_AUTO | [] |
| JP-SMP-020 | サンプル進捗トラッキング・リマインド | SYSTEM | サンプル依頼発行 | A_FULL_AUTO | [] |
| JP-SMP-030 | サンプル受領・評価記録起票 | QA | サンプル(Vn)到着 | B_AI_DRAFT | [] |
| JP-SMP-040 | サンプル評価判定ドラフト・確認（項目単位） | QA | 評価記録起票完了 | B_AI_DRAFT | [] |
| JP-SMP-050 | GoldenSample承認手続（CLIENT/商社/工場3者） | QA | サンプル評価=全項目APPROVED **かつ Reference Set構成にGolden Sampleを含む案件のみ生成**（22番§11.4） | C_HUMAN_DECISION | [G-02] |
| JP-SMP-060 | GoldenSample LOCK登録・配布 | SYSTEM | 3者承認完了（FACTORY_ACKNOWLEDGED）。**GSを要するReference構成の案件でのみ生成**（22番§11.4） | A_FULL_AUTO | [G-02] |
| JP-SMP-070 | LimitSample登録（外観許容限度） | QA | Q3以上 or BIMP_HIGH以上で外観基準確定 | B_AI_DRAFT | [] |
| JP-SMP-080 | サンプル輸送トラッキング | SYSTEM | サンプル発送通知受信 | A_FULL_AUTO | [] |
| JP-QUAL-010 | Quality Profile推奨生成 | QA | ProjectDNA確定 | B_AI_DRAFT | [] |
| JP-QUAL-020 | Quality Tier確定（顧客選択→内部基準変換） | SALES | Profile推奨提示+顧客選択受信 | C_HUMAN_DECISION | [] |
| JP-QUAL-030 | 品質基準書(QualityStandard)ドラフト生成 | QA | Quality Tier確定 | B_AI_DRAFT | [] |
| JP-QUAL-040 | 品質⇄コスト影響提示（緩和−X円/強化+Y円） | SYSTEM | 品質基準書ドラフト生成 | A_FULL_AUTO | [] |
| JP-QUAL-050 | 中国語品質基準書出力指示 | SYSTEM | 品質基準書承認完了 | A_FULL_AUTO | [] |
| JP-QUAL-060 | Claim（性能主張）候補抽出・登録（→15番claims。詳細§3.1） | QA | Proposal/商品ページ案/版下で性能表現をAI検知 | B_AI_DRAFT | [G-16] |
| JP-QUAL-070 | Claim実証管理（試験接続・表現確定。詳細§3.1） | QA | Claim登録 or リンク先CTQ/SpecField変更（PENDING差戻し） | B_AI_DRAFT | [G-16] |
| JP-REG-020 | 必要書類・試験リストドラフト確定 | REG | 法規初期チェックでREVIEW_REQUIRED | B_AI_DRAFT | [G-03] |
| JP-REG-030 | 試験機関手配・進捗管理 | REG | 試験リスト確定 | B_AI_DRAFT | [G-03] |
| JP-REG-040 | 法規最終判断・Status確定 | REG | 試験結果・書類受領完了 | C_HUMAN_DECISION | [G-03] |
| JP-REG-050 | 表示・ラベル法規確認 | REG | パッケージ仕様ドラフト完成 | B_AI_DRAFT | [G-03] |
| JP-PROD-005 | **Reference Set確定**（Approved Production Reference Set〔承認済み量産基準セット〕の構成充足確認・確定。**PO承認の前提**） | QA | 案件の必要構成要素（構成ルール評価結果=production_reference_sets.required_components）の全項目APPROVED到達 | C_HUMAN_DECISION | [G-02] |
| JP-PROD-010 | 工場PO(発注書)ドラフト生成 | TRADE | 顧客受注確認+量産工場選定完了 | B_AI_DRAFT | [G-01] |
| JP-PROD-020 | PO承認・発行 | MGR | POドラフト完成 **かつ Reference Set=COMPLETE**（JP-PROD-005確定済み） | C_HUMAN_DECISION | [G-01, G-02, G-03] |
| JP-PROD-030 | 生産進捗取込（WeChat/Excel→構造化） | SYSTEM | 工場/CN_OFFICEから進捗報告受信 | A_FULL_AUTO | [] |
| JP-PROD-040 | 進捗遅延検知・アラート | SYSTEM | 進捗更新 or 予定日超過 | A_FULL_AUTO | [] |
| JP-PROD-050 | ECR受付・影響分析ドラフト | PM | 工場/顧客/社内から変更申請 | B_AI_DRAFT | [G-06] |
| JP-PROD-060 | ECR承認 | MGR | 影響分析完了（コスト/納期/品質/法規影響提示） | C_HUMAN_DECISION | [G-06] |
| JP-PROD-070 | UnauthorizedChange検知・起票 | SYSTEM | 検品/報告データと承認仕様の不一致検知 | A_FULL_AUTO | [G-06] |
| JP-PROD-080 | 週次顧客進捗レポート生成・送信 | SYSTEM | 週次スケジュール（正常系自動。Cost増・遅延・リスク・仕様変更時は承認要=B運用へ切替） | A_FULL_AUTO | [] |
| JP-INSP-010 | 検品計画(InspectionPlan)ドラフト生成 | QA | 品質基準書承認+PO発行 | B_AI_DRAFT | [G-05] |
| JP-INSP-020 | 検品指示書（中国語）出力指示 | SYSTEM | 検品計画承認完了 | A_FULL_AUTO | [] |
| JP-INSP-030 | 検品結果取込・構造化 | SYSTEM | 検品報告(Excel/WeChat)受信 | A_FULL_AUTO | [G-05] |
| JP-INSP-040 | 検品合否判定ドラフト・FAIL対応起票 | QA | 検品結果取込完了 | B_AI_DRAFT | [G-04, G-05] |
| JP-LOGI-010 | 出荷書類生成（インボイス（INV：商業送り状）/ パッキングリスト（P/L：梱包明細書）等・定型） | SYSTEM | 出荷予定確定（**ドラフト先行生成**）→ShipmentRelease承認で確定版出力（RT-08是正） | A_FULL_AUTO | [] |
| JP-LOGI-020 | ブッキング・輸送手配（**暫定ブッキング先行可**） | TRADE | 出荷予定確定（検品・Release承認を待たず暫定ブッキング可。RT-08是正） | B_AI_DRAFT | [] |
| JP-LOGI-030 | ShipmentRelease（出荷承認） | MGR | 検品PASS+Critical Issue無し+Regulatory充足 | C_HUMAN_DECISION | [G-03, G-04, G-05, G-06] |
| JP-LOGI-040 | 通関進捗トラッキング | SYSTEM | 出荷実行 | A_FULL_AUTO | [] |
| JP-LOGI-050 | 納品確認・配送完了処理 | SYSTEM | 国内配送完了通知受信 | A_FULL_AUTO | [] |
| JP-LOGI-060 | 納品完了レポート送信（顧客向け） | SYSTEM | 納品確認完了 | A_FULL_AUTO | [] |
| JP-FIN-010 | 受注確認・注文請書発行 | SALES | 顧客がQuotationに正式合意 | B_AI_DRAFT | [G-01] |
| JP-FIN-020 | 請求書発行 | SYSTEM | 契約条件のマイルストーン到達 | A_FULL_AUTO | [] |
| JP-FIN-030 | 入金消込・督促 | SYSTEM | 入金データ取込/期日超過 | A_FULL_AUTO | [] |
| JP-FIN-040 | Profitability集計・マージン差異警告 | SYSTEM | Quote/為替/運賃の変動登録 | A_FULL_AUTO | [] |
| JP-FIN-050 | 工場支払管理・期日リマインド | SYSTEM | PO支払条件のマイルストーン到達 | A_FULL_AUTO | [] |
| JP-CMP-010 | クレーム受付・初期分類（Complaint起票） | SALES | 顧客からクレーム受信 | B_AI_DRAFT | [] |
| JP-CMP-020 | 原因調査依頼（→CN_OFFICE/工場） | QA | Complaint起票+Traceability特定 | B_AI_DRAFT | [] |
| JP-CMP-030 | CAPA依頼文生成・追跡 | QA | 根本原因=FACTORY判明 | B_AI_DRAFT | [] |
| JP-CMP-040 | 重大クレーム・責任交渉 | MGR | Defect=CRITICAL or 賠償要求発生 | D_MANUAL_EXCEPTION | [G-04] |
| JP-CMP-050 | 市場事故対応（リコール等） | MGR | 市場での安全事故報告 | D_MANUAL_EXCEPTION | [G-04] |
| JP-CMP-060 | CAPA有効性フォロー・クローズ | SYSTEM | CAPA実施報告受領+検証期間経過 | A_FULL_AUTO | [] |
| JP-RPT-010 | Repeat受付・前回仕様コピー | SYSTEM | EntryRoute=D判定 | A_FULL_AUTO | [] |
| JP-RPT-020 | 再確認8項目チェックリスト生成・差分確認送信 | SYSTEM | 前回仕様コピー完了 | A_FULL_AUTO | [] |
| JP-RPT-030 | Repeat見積依頼（工場・定型） | SYSTEM | 差分確認完了（仕様変更なし） | A_FULL_AUTO | [G-13] |
| JP-RPT-040 | Repeat発注承認 | SALES | Repeat見積受領+顧客合意 | C_HUMAN_DECISION | [G-01] |

注: 仕様変更ありのRepeatはJP-REQ-050（差分解析）経由で通常フローの該当Taskのみを再生成する（§4 R-04）。

注（v0.4・C-03/RT-03是正）: JP-FIN-010（受注確認・注文請書発行）およびJP-RPT-040（Repeat発注承認）のoutputsは**顧客受注レコード（15番 `sales_orders`）+ 注文請書Document**であり、G-01「正式発注なし」の判定参照先は「`sales_orders`確定（status=APPROVED∧顧客合意証跡FK）∧ PO=APPROVED以上」（15番§4.1の宣言的条件）である。確定見積（`is_provisional=false`のQuotation）に紐づかない受注登録はDB制約で拒否される（概算価格の確定視=TC-02系の防御）。

注（v0.5・22番A-06/§11・G-02改訂の反映）: JP-PROD-020のガード条件は「GoldenSample=LOCKED」から「**Reference Set=COMPLETE**（`production_reference_sets` 最新版の required_components 全行がAPPROVED）」へ差替えた。Golden Sampleは Approved Production Reference Set（承認済み量産基準セット：量産の正となる承認済み基準物の組合せ）の**構成要素の一つ**であり、JP-SMP-050/060 は「GSを要するReference構成の案件でのみ生成」される（Task Generator条件。Repeat・既製品案件では不要なGS作成工程が生成されない）。必要構成の決定ルールは f(OdmLevel × ProductRisk × BrandImpact × Rule Pack供給ルール × Entry Route) の CONFIGURABLE_RULE（22番§11.3、供給は18番 第10要素 REFERENCE_SET）。G-02の宣言的条件データの書換えのみで実装し、Gate機構は無変更。

注（v0.5・22番§16/§19・JP-RPT-020の8項目チェックリスト化）: JP-RPT-020は次の**8項目**の再確認チェックリストを自動生成する — ①工場価格（Quote失効チェック=valid_until）②MOQ（quote_conditions再確認）③材料（供給可否・ECR有無）④納期 ⑤運賃 ⑥為替 ⑦法規（regulatory_assessments自動差戻し判定=既存機構）⑧部品供給可否。各項目に「前回値・現在値・要再確認フラグ」を自動生成し、**変化があった項目だけ**を人間・工場に確認する（A_FULL_AUTO→差分のみB運用）。チェックリスト8項目の構成はCONFIGURABLE_RULE。

注（v0.4・C-09/RT-08是正・物流順序）: JP-LOGI-020は出荷予定確定時点での**暫定ブッキング**（キャンセル可能条件）を許可し、JP-LOGI-010は出荷書類**ドラフトを先行生成**する。ShipmentRelease（JP-LOGI-030、G-03〜G-06）が物理的に停止するのは**船積み実行**（15番§3.10のRELEASED→SHIPPED遷移）であり、暫定ブッキング・書類ドラフト生成は停止対象外。確定版書類・ブッキング確定はRELEASED遷移の副作用として生成する（15番§3.10と整合確認済み）。船腹確保の実務（ブッキングは出荷2〜3週前）と検品→Release承認の直列待ちを分離し、船を逃す構造を解消する。

### 3.1 Claim管理Task定義票（v0.4追加・15項目完全形。C-04/RT-06是正）

```yaml
task_id: JP-QUAL-060
name: Claim（性能主張）候補抽出・登録
purpose: 顧客向け表現（Proposal・商品ページ案・パッケージ版下）から性能主張を自動抽出しClaim Ledger（15番claims）へ登録する。宙に浮いた約束を構造的になくす（16番§7.1）
owner_role: QA
trigger: Proposalドラフト生成（JP-PROP-020）・商品ページ文言登録・版下受領（JP-SPEC-060/070）で性能表現をAIが検知
inputs: [Proposal/商品ページ案/版下の文言, SpecField一式, Rule Pack CtqList/TestPlanView]
system_action: claimsレコード起票（{ProjectID}-CLM-{NN}採番）、linked_spec_field/required_tests候補の自動接続、G-16評価入力の更新
ai_action: 性能表現の抽出・Claim候補化、対応CTQ・試験の候補提示、工場非承諾（factory_acknowledgement=false）との矛盾検知（即時WARN）
human_action: 候補の確認・接続先（CTQ/試験）の確定（実証判定はJP-QUAL-070）
outputs: [Claim(PENDING)]
approval_required: true（QA。接続確定）
blocking_condition: none（G-16はSOFT: 未実証でも「実証予定」注記付きで進行可）
deadline_rule: trigger+1営業日
notification: Claim候補検出→QA/SALESへ、工場非承諾との矛盾検知→QA/REGへ即時
related_docs: [none]
related_tables: [claims, proposals, spec_fields]
automation_class: B_AI_DRAFT
gates: [G-16]
```

```yaml
task_id: JP-QUAL-070
name: Claim実証管理（試験接続・表現確定）
purpose: Claimの実証（試験合格+REG確認）を管理し、実証レベルに応じた許容表現（allowed_expressions）を確定する。量産用版下承認（印刷発注）前の実証完了を担保する（16番§7.1-4）
owner_role: QA
trigger: Claim登録（JP-QUAL-060）完了、またはリンク先CTQ選択肢・SpecField変更によるPENDING差戻し（15番§3.15）
inputs: [Claim(PENDING), 試験成績書Document, Regulatory Assessment, 工場承諾記録（RFQ回答・仕様書签回）]
system_action: evidence_status遷移の記録（Approval FK必須）、試験成績書のDocument接続（景品表示法の合理的根拠資料）、REJECTED確定時の当該表現の自動除外
ai_action: 試験結果とClaim文言の適合判定ドラフト、条件付き表現（「（条件）で（結果）」形式）の生成案
human_action: 実証判定（APPROVED/CONDITIONAL/REJECTED。REG確認を含む）
outputs: [Claim(判定済), allowed/forbidden_expressions確定]
approval_required: true（QA+REG。evidence_approval_id）
blocking_condition: 量産用版下承認（印刷発注）時点で未実証Claimが残存（運用はG-04系Critical Issue化で担保=05 §9 G-16行）
deadline_rule: 版下承認予定日-5営業日
notification: 実証失敗確定→SALES/QA/REGへ即時（表現差替え）、版下承認接近で未実証残→PM/MGRへ
related_docs: [試験成績書, 版下チェックリスト]
related_tables: [claims, approvals, documents]
automation_class: B_AI_DRAFT
gates: [G-16]
```

### 3.2 Commercial Feasibility Loop Task定義票（v0.5追加・15項目完全形。22番§6.2 / A-04是正）

Commercial Feasibility Loop（商流成立性の周回：工場回答と顧客判断を往復しながら価格・数量・仕様を成立条件へ収束させる中核Workflow。Governance §16）を業務として回すTask群。各周回は `{ProjectID}-LOOP-{NN}` として追記記録し（上書き禁止）、**1周完結を前提にしない**（ARCHITECTURE_LOCK・22番§19-7）。

> **既存Taskの位置づけ直し（22番§6.2）**: JP-RFQ-060〜080（Quote取込・比較・交渉ポイント抽出）/ JP-PROP-060〜080（Quotation作成・送信・価格交渉）/ JP-FACT-050（量産工場最終選定）は、**Loop配下の工程**として位置づけ直す（Task自体は再利用・分類/定義は現行どおり）。CustomerDecision（Loop分岐：顧客の進め方選択）の各分岐からこれらのTaskが再起票される配線はJP-LOOP-030が担う。

```yaml
task_id: JP-LOOP-010
name: Feasibility分析ドラフト（Loop周回分析）
purpose: 顧客希望（Commercial Profile）と工場回答（Quote版+quote_conditions）の差分・リスク・概算利益・推奨案を自動整理し、人間にExcel比較・転記をさせずLoop判断の材料を揃える（22番§6.2 / §10.2）
owner_role: AI
trigger: 全RFQ先のQuote登録完了（JP-RFQ-070比較表生成完了）、または交渉・再RFQ・条件変更後のQuote更新登録
inputs: [Commercial Profile(最新版), Quote(全版)+quote_conditions, Specification版, Cost Ledger(ESTIMATED費目), commercial_loops(前周回があれば)]
system_action: commercial_loops周回行の起票（{ProjectID}-LOOP-{NN}採番、OPEN→ANALYZING）、input_snapshotのFK固定（Profile版・Spec版・対象Quote版）、希望vs回答の差分明細（価格・MOQ・納期・仕様・初期費用）の自動算出
ai_action: feasibility_result（成立/条件付成立/不成立）ドラフト生成、リスク・概算利益（内部のみ）・推奨案+根拠の整理（§10.2の6点セット。22番§10.2）
human_action: none（判断はJP-LOOP-020以降）
outputs: [commercial_loops(ANALYZING・feasibility_resultドラフト), Loop判断画面用6点セット]
approval_required: false
blocking_condition: Quoteが1件も未登録
deadline_rule: trigger+2営業時間（自動処理）
notification: 分析完了→SALES/PMへ（不成立検知時は差分要点付き）
related_docs: [none]
related_tables: [commercial_loops, commercial_profiles, quotes, quote_conditions, cost_items]
automation_class: A_FULL_AUTO
gates: []
```

```yaml
task_id: JP-LOOP-020
name: 顧客Option提案生成・承認
purpose: 成立しない場合も単純な「できません」で終わらせず、何を維持し何を変えれば成立するかをOption型（A/B/C…数量優先/価格優先/オリジナル性優先等）で顧客へ提案する（Governance §16のOption型提案原則）
owner_role: SALES
trigger: JP-LOOP-010完了（feasibility_result=条件付成立/不成立の場合は再提案型、成立の場合は正式提案型）
inputs: [commercial_loops(ANALYZING), Commercial Profile(priority_axes含む), Quote比較表, Cost Ledger(概算)]
system_action: options_presentedの起票、承認画面提示（1画面=1判断。データは画面に集約済み・比較元Excelを開かせない=§10.2受入基準）、承認後の顧客チャネル送信キュー作成
ai_action: Option案ドラフト生成（各Option: 何を維持し何を変えるか+概算影響。EXP_BEGINNERにはOption数上限=22番P-16低減策・「おすすめ1+代替」原則）、情報遮断スキャン（工場原価・マージン・他工場見積の混入検知）
human_action: Option内容・価格・利益・重要条件の確認・修正・承認（価格・工場・商社利益を含む正式顧客提案はHuman Approvalを基本とする=Governance §16）
outputs: [commercial_loops(OPTIONS_PRESENTED), 顧客向けOption提案(承認済・送信・概算明示)]
approval_required: true（SALES/PM。代理承認者=MGR）
blocking_condition: feasibility_resultドラフト未生成
deadline_rule: trigger+1営業日
notification: 承認待ち→SALES/PM、期限超過→MGRへ、顧客未応答7日→SALESへフォロー提案
related_docs: [Option提案（顧客向け・G-15の概算明示準拠）]
related_tables: [commercial_loops, approvals, quotations, notifications]
automation_class: B_AI_DRAFT
gates: [G-15, G-16]
```

```yaml
task_id: JP-LOOP-030
name: CustomerDecision取込・Loop記録
purpose: 顧客選択（CustomerDecision）を構造化取込し、「なぜ条件が変わったか・誰が・どの工場回答を根拠に」を証跡付きでLoop行に記録のうえ、Profile新版化と後続Taskの自動起票を行う
owner_role: SYSTEM
trigger: 顧客のOption選択・回答受信（PORTAL/メール/LINE。SALES代行入力を含む）
inputs: [commercial_loops(OPTIONS_PRESENTED), 顧客回答（選択+理由）, decision_evidence(顧客合意証跡Document)]
system_action: customer_decision確定（ACCEPT/MODIFY/NEGOTIATE/RE_SOURCE/RE_RFQ/HOLD/REJECT）、State遷移（DECIDED→CLOSED。追記型・逆行なし）、commercial_profile_versionsへのスナップショット（loop_id FK・変更理由・根拠Quote版FK）、分岐別後続の自動起票（MODIFY→新Loop行+Profile新版 / NEGOTIATE→JP-PROP-080起票のうえ同Loop工場回答待ち / RE_SOURCE→JP-FACT-010再実行+新Loop / RE_RFQ→JP-RFQ系再生成+新Loop / HOLD→Project ON_HOLD連動 / ACCEPT→JP-PROP-060確定見積・受注経路へ）
ai_action: 自由文回答の構造化（曖昧回答は確認質問を再生成）、trigger_reason（条件変更理由）ドラフトの記録
human_action: none（HOLD/REJECT時の折衝・例外対応は既存C/D分類Taskで実施）
outputs: [commercial_loops(DECIDED→CLOSED), commercial_profile_versions(新版), 後続Taskセット]
approval_required: false（正式提案の承認はJP-LOOP-020で完了済み）
blocking_condition: decision_evidence未添付（顧客合意証跡なしの確定登録は不可）
deadline_rule: 回答受信+10分（自動処理）
notification: DECIDED→SALES/PMへ（分岐内容付き）、REJECT→MGRへ
related_docs: [顧客合意証跡Document]
related_tables: [commercial_loops, commercial_profile_versions, tasks, audit_logs]
automation_class: A_FULL_AUTO
gates: []
```

---

## 4. Task Generator Logic（条件ルール表）

Task Generatorは Project作成時（JP-LEAD-020）と DNA確定時（JP-LEAD-030）、およびDNA・Entry Route変更時に実行し、差分Taskを生成/SKIPする。既に `DONE` のTaskはSKIP対象にしない（履歴保持）。

> ※ 本表のルール（R-01〜R-14）は DNA・Entry Route のみを条件にし、**カテゴリー条件は持たない**（Governance §13）。質問・CTQ・試験・検品・法規候補の中身はカテゴリー固有ロジックではなく、**Category Rule Pack + 属性タグ由来の Rule Engine 出力ビュー（QuestionList / TestPlanView / InspectionPlanView 等）から供給される**（18番 §8.1 接続仕様）。

| Rule | 条件（DNAコード/Entry Route） | 生成・変更内容 |
|---|---|---|
| R-01 | EntryRoute=A (IDEA) | フルセット生成: LEAD→REQ→PROP→SPEC→FACT/RFQ系。Proposal系（JP-PROP-010〜050）必須 |
| R-02 | EntryRoute=B (PRODUCT) | JP-PROP-010〜050をSKIP。JP-REQ-010→JP-SPEC-010へ直行。Quotation系（JP-PROP-060〜）は維持 |
| R-03 | EntryRoute=C (FAST TRACK) かつ ExperienceLevel=EXP_PROFESSIONAL | Proposal系・BLOCKER質問Task（JP-REQ-020）をSKIPし、CAD/BOM取込→JP-SPEC-010→即JP-FACT-010/JP-RFQ-010を生成。教育系文言（A2）非表示 |
| R-04 | EntryRoute=D (REPEAT) | JP-RPT-010〜040のみ生成。差分確認で仕様変更なし→REQ/PROP/SMP/QUAL系を全SKIP（GoldenSample・QualityStandardは前回版を継承）。仕様変更あり→JP-REQ-050+影響範囲のTaskのみ再生成 |
| R-05 | ExperienceLevel=EXP_BEGINNER | BLOCKER質問数をDNA導出上限（例:5問）に制限、JP-PROP-020は平易文体モード、A2のJust-in-Time教育コンテンツTaskを添付 |
| R-06 | OdmLevel=ODM_0_STOCK / ODM_1_LOGO | 金型(Tooling)・構造検証・CAD系Taskを非生成。ODM_1はJP-SPEC-050/060（デザイン・版下）を生成 |
| R-07 | OdmLevel=ODM_3_STRUCTURE / ODM_4_FULL | CAD/構造検証・Tooling見積・PilotRun・FirstArticle確認Taskを追加生成（詳細Taskは16番A4と12番A5に整合） |
| R-08 | ProductRisk=PRISK_HIGH / PRISK_CRITICAL | JP-REG-010〜050をフルセット必須生成（SKIP不可）、JP-INSP系の検品密度増強（AQL厳格化は16番A4準拠）、JP-PROD-080の報告頻度を週2回に |
| R-09 | ProductRisk=PRISK_LOW かつ Regulatory初期判定=NOT_APPLICABLE | JP-REG-020〜030を非生成（JP-REG-010の初期チェック自体は全案件必須。NOT_APPLICABLEの確定記録を残す） |
| R-10 | QualityLevel=Q3_PREMIUM / Q4_LUXURY または BrandImpact=BIMP_HIGH / BIMP_CRITICAL | JP-SMP-070（LimitSample）・外観基準Task・JP-QUAL-040必須生成。GoldenSample 3者承認（JP-SMP-050）はSKIP不可 |
| R-11 | FactoryRisk=FRISK_NEW / FRISK_HIGH | RFQ先3社以上を推奨条件に設定、工場監査Task（CN側 CN-FACT系へ依頼）・FirstArticle確認・PilotRun Taskを追加生成 |
| R-12 | Intent=INT_URGENT | 全Taskの deadline_rule を標準の50%に短縮、リマインド頻度2倍、並行可能Task（REG/FACT/QUAL）を即時並行起動 |
| R-13 | Priority=PRIO_KEY_ACCOUNT / PRIO_STRATEGIC | JP-PROP-030・JP-RFQ-020・JP-PROD-020にMGR承認段を追加（二段承認）、JP-PROD-080の顧客レポートに営業サマリ添付 |
| R-14 | CommercialRisk=CRISK_HIGH | 与信確認Task・前金条件設定TaskをJP-FIN-010の前提として生成、JP-FIN-040のマージン警告閾値を厳格化 |

補足: ルールは上から順に評価し全該当ルールを適用（排他ではなく合成）。矛盾時は「より厳しい方（Task追加・承認追加側）」を優先。DNA未確定（AI_SUGGESTED）の間は推定値で生成し、確定時に差分再生成する（G-13の趣旨に整合）。

---

## 5. Next Best Action ルール表（案件状態 → 次アクション）

Next Best Action Engine は Project全状態を入力に、正常系は自動実行（A分類の起動）、判断系は担当Roleへの提示のみ行う。

| # | 案件状態（条件） | 次アクション | 実行様式 |
|---|---|---|---|
| N-01 | Project=DRAFT かつ Requirement未解析 | JP-REQ-010を即時実行 | 自動実行 |
| N-02 | BLOCKER質問 未回答48時間経過 | 顧客リマインド送信（トーンはA2文言集準拠） | 自動実行 |
| N-03 | Requirement解析済 かつ EXP_BEGINNER かつ Proposal未作成 | JP-PROP-010→020を起動 | 自動実行 |
| N-04 | Task=WAITING_APPROVAL 24時間超過 | 承認者へ催促、48時間超過で代理承認者・MGRへエスカレーション | 自動実行 |
| N-05 | Proposal送信済 かつ 顧客未閲覧7日 | フォローアップ文面ドラフトをSALESへ提示 | 提示（B） |
| N-06 | Requirement確定済 かつ RFQ_READY=true かつ RFQ未発行 | JP-FACT-010→020を起動しPMへ選定提示 | 自動実行+提示 |
| N-07 | RFQ_READY=false | 不足理由リストからJP-SPEC-020（補完質問）を生成 | 自動実行 |
| N-08 | RFQ発行済 かつ Quote未着 かつ 期限まで2営業日 | JP-RFQ-050の督促Digest送信 | 自動実行 |
| N-09 | 全RFQ先のQuote登録完了 | JP-RFQ-070比較表生成→PMへ工場選定（JP-FACT-050）提示 | 自動実行+提示 |
| N-10 | Quotation送信済 かつ 顧客心理=COMMITTED | JP-FIN-010（受注確認）を起票しSALESへ提示 | 提示（C） |
| N-11 | GoldenSample=CLIENT_APPROVED かつ 未LOCKED | 残承認（COMPANY_APPROVED/FACTORY_ACKNOWLEDGED）の督促 | 自動実行 |
| N-12 | PO発行済 かつ 生産開始予定日超過 かつ 進捗報告なし | CN_OFFICEへ確認依頼Digest送信、PMへアラート | 自動実行 |
| N-13 | 検品PASS かつ Critical Issue=0 かつ Regulatory充足 | JP-LOGI-030（ShipmentRelease）承認要求をMGRへ提示 | 提示（C） |
| N-14 | Regulatory=REVIEW_REQUIRED 5営業日放置 | REGへエスカレーション、関係工程の期限リスクを表示 | 自動実行 |
| N-15 | 納品完了 かつ クレームなし30日経過 | Repeat Order提案ドラフトをSALESへ提示、Factory Score加点 | 提示（B）+自動実行 |

競合時の優先順位: HARD Gate解消系 > 期限超過エスカレーション > 顧客待ち解消（WAITING_CLIENT） > 中国側待ち解消（WAITING_CHINA） > 新規推進。同順位内はPriority軸（PRIO_STRATEGIC優先）→期限近接順。

---

## 6. Automation Matrix 集計

対象: 本書で定義した日本側テンプレートTask全95件（§2の20件 + §3の75件。v0.4でJP-QUAL-060/070〔Claim管理・C-04〕を追加、**v0.5でJP-LOOP-010/020/030〔Loop系・22番§6.2〕とJP-PROD-005〔Reference Set確定・22番§11.4〕の計4件を追加**）。

| 領域 | A_FULL_AUTO | B_AI_DRAFT | C_HUMAN_DECISION | D_MANUAL_EXCEPTION | 計 |
|---|---|---|---|---|---|
| LEAD | 3 | 0 | 2 | 0 | 5 |
| PROP | 4 | 2 | 2 | 0 | 8 |
| LOOP | 2 | 1 | 0 | 0 | 3 |
| REQ | 2 | 2 | 1 | 0 | 5 |
| SPEC | 1 | 6 | 0 | 0 | 7 |
| RFQ | 5 | 2 | 1 | 0 | 8 |
| FACT | 1 | 2 | 2 | 0 | 5 |
| SMP | 4 | 3 | 1 | 0 | 8 |
| QUAL | 2 | 4 | 1 | 0 | 7 |
| REG | 0 | 4 | 1 | 0 | 5 |
| PROD | 4 | 2 | 3 | 0 | 9 |
| INSP | 2 | 2 | 0 | 0 | 4 |
| LOGI | 4 | 1 | 1 | 0 | 6 |
| FIN | 4 | 1 | 0 | 0 | 5 |
| CMP | 1 | 3 | 0 | 2 | 6 |
| RPT | 3 | 0 | 1 | 0 | 4 |
| **合計** | **42 (44.2%)** | **35 (36.8%)** | **16 (16.8%)** | **2 (2.1%)** | **95** |

- **A+B = 77/95 = 81.1% ≥ 80%（維持・達成）**。達成計算（v0.5再集計）: v0.4の A=40/B=34/C=15/D=2（91件）に対し、新Task4件の内訳は JP-LOOP-010（A）/ JP-LOOP-020（B）/ JP-LOOP-030（A）/ JP-PROD-005（C）＝ A+2 / B+1 / C+1。よって A+B = (40+2)+(34+1) = **77/95 = 81.1%**。日中全Task合算（IR-13裁定の正式集計単位・14番。中国側35件はA=3/B=25/C=7で変更なし）では A+B = (77+28)/(95+35) = **105/130 = 80.8% ≥ 80%（基準維持を確認）**。22番§24-⑩「Loop系Task込み再集計（A+B≥80%維持）」の承認条件を充足する。
- C分類16件は全て「承認・重要判断」（Proposal/RFQ/PO承認、DNA・Requirement・Tier確定、工場選定、GoldenSample・**Reference Set確定**・ECR・Repeat発注承認、法規最終判断、ShipmentRelease、商談・価格交渉）であり、設計原則「人間は営業・提案・重要判断・承認のみ」に合致。D分類2件は市場事故・重大クレームのみ。
- 翻訳・リマインド・転記・進捗確認・定型文書は全件A（またはB）に分類済み。C/Dに定型作業は含まれない。
- Vertical Slice単体ではA+B=75%（承認密度が最も高い商流上流のため）。案件ライフサイクル全体で80%超となる構造。初期運用で全件承認としているB/C（JP-REQ-020送信承認、JP-PROP-030全件承認等）は、運用実績蓄積後に自動化率を引き上げる（Translation/Doc Engineの「初回テンプレ承認、以降自動」と同方針）。

---

## 7. Gate参照の整合

本書の各Taskの `gates` はGovernance Pack §9 のレジストリ（G-01〜G-06, G-10〜G-16）のみを参照している。G-14/G-15はv1.1裁定、G-16はv2.2裁定（A4提案・C-04でTask配線）、**G-02はv3.0改訂（Approved Production Reference Set方式）をv0.5で反映済み**。参照マップ:

| Gate | 参照Task |
|---|---|
| G-01 | JP-PROD-010/020, JP-FIN-010, JP-RPT-040 |
| G-02 | **JP-PROD-005（Reference Set確定）**, JP-SMP-050/060（GSを要するReference構成の案件のみ）, JP-PROD-020 |
| G-03 | JP-REG-010〜050, JP-PROD-020, JP-LOGI-030 |
| G-04 | JP-INSP-040, JP-LOGI-030, JP-CMP-040/050 |
| G-05 | JP-INSP-010/030/040, JP-LOGI-030 |
| G-06 | JP-PROD-050/060/070, JP-LOGI-030 |
| G-10 | JP-REQ-020/030, JP-PROP-020/030 |
| G-11 | JP-SPEC-010/020, JP-RFQ-010/020 |
| G-12 | JP-SPEC-010, JP-PROP-020/060, JP-RFQ-010/020 |
| G-13 | JP-LEAD-020/030, JP-RFQ-010/020/030, JP-RPT-030 |
| G-14 | JP-RFQ-030（RFQ発行）, JP-PROP-070（Quotation送信） |
| G-15 | JP-PROP-060（Quotation承認）, JP-LOOP-020（Option提案の概算明示） |
| G-16 | JP-PROP-020/040（Proposal生成・送信）, JP-SPEC-060/070（版下・パッケージ）, JP-QUAL-060/070（Claim抽出・実証管理）, JP-LOOP-020（Option提案の性能表現） |

---

## 8. KPI定義（16指標・DoD-11対応。22番§10.3の正式収載）

Automation A+B比率（§6）単独ではなく、以下の**KPI（重要業績評価指標：経営判断に使う測定値）16指標**を計測する。**目標値はすべてCALIBRATION_VALUE（実案件データで校正する数値）**であり、Phase 0では定義と計測方法のみを確定する（Governance §0-8。目標値は実測後にオーナー/MGRが設定）。計測はSystemの自動集計を原則とし、自己申告をさせない。

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

- 本表はGovernance DoD-11の16指標（Human Touch Time per Project / Human Administrative Time / Human Decision Count / Time to First Proposal / Time to First Factory Quote / RFQ Turnaround / Commercial Loop回数 / Quote Acceptance Rate / Estimate vs Actual Cost Variance / Gross Margin Variance / MOQ Acceptance Rate / Sample Iteration Count / 不良率 / 納期遵守 / Feedback Rate / Repeat Rate / Version Improvement Rate）を正式収載したものであり、22番§10.3を正とする。
- 表示層でのKPI名は言語ルール（§14）に従い日本語主表記（例:「案件あたり人間対応時間（Human Touch Time）」）とし、enum・英語名の生表示をしない（19番 表示名マップ）。

---

## Governance変更提案（2件）→ 統合レビューで裁定済み

> 本書起案の2件はいずれも**採用**され、Governance Pack v1.1 §9 に正式登録された（詳細裁定は 05 v1.1 / 14-integration-review.md 参照）。

- **提案1（G-14 法規チェック未着手・SOFT）**: 採用・`G-14` として正式化。A6の同番単独提案（13番 §7 提案-1）と一本化され、正式Gate定義は本書案どおり condition=`Regulatory=NOT_CHECKED`、checkpoint=RFQ発行（JP-RFQ-030）・Quotation送信（JP-PROP-070）。該当Taskの `gates` へ反映済み。
- **提案2（G-15 工場Quote未登録・SOFT）**: 採用・`G-15` として正式化。checkpoint=Quotation承認（JP-PROP-060）、WARN付き進行可＝概算見積であることの明示（「概算」透かし強制）。該当Taskの `gates` へ反映済み。

## Change Log

| 版 | 日付 | 変更 |
|---|---|---|
| v0.1 | 2026-08-10 | 初版Draft（A1）。全体マップ49プロセス、Vertical Slice 20Task（15項目完全形）、その他69Task、Task Generator 14ルール、NBA 15ルール、Automation Matrix A+B=80.9%、Governance変更提案2件 |
| v0.2 | 2026-08-10 | 統合レビュー（14番）反映。G-14/G-15正式採用に伴うgates追記（JP-RFQ-030 / JP-PROP-060 / JP-PROP-070）、§7 Gate参照マップをv1.1レジストリへ更新、JP-REG-010のRegulatory遷移記述をA6 §1.5と整合（IR-09）、Status=Reviewed |
| v0.3 | 2026-08-10 | 是正パス（Governance v2.1）反映。§14言語ルール是正4件（19番§5 #12〜#15: JP-REQ-030/JP-SPEC-010通知文言・JP-RFQ-020承認画面表示規則・JP-LOGI-010帳票名の日本語主表記）、Category-Agnostic注記追加（冒頭・§2）、Task Generator/JP-SPEC-010へのRule Pack供給参照（18番§8.1）。C分類15件の再点検で再分類なし（IR-13裁定・14番参照） |
| v0.4 | 2026-08-10 | 是正パス（A7条件消化）反映。C-04: G-16のTask配線（JP-PROP-020/040・JP-SPEC-060/070へgates追記、JP-QUAL-060/070を15項目完全形で新設=§3.1、§7参照マップv2.2化、Automation Matrix再集計 A+B=74/91=81.3%・日中合算102/126=81.0%で基準維持）。C-03: JP-FIN-010/JP-RPT-040のoutputsをsales_orders（15番）へ接続（§3注記）。C-09: JP-LOGI-010/020を書類ドラフト先行生成・暫定ブッキング先行可へ変更しShipmentReleaseの停止対象を船積み実行のみと明記（RT-08、§3注記・15番§3.10整合）。準拠をv2.2へ更新 |
| v0.5 | 2026-08-11 | 是正パスR3（22番§1必要変更の実反映・オーナー条件付き承認〔14番§8〕）。A-04: JP-LOOP-010/020/030を15項目完全形で新設（§3.2。22番§6.2）、既存JP-RFQ-060〜080/JP-PROP-060〜080/JP-FACT-050をLoop配下の工程として位置づけ（§3.2注記）、JP-RPT-020を8項目チェックリスト化（§3注記）。A-06: JP-PROD-005（Reference Set確定・C_HUMAN_DECISION・PO承認の前提）新設、JP-PROD-020ガードを「GS=LOCKED」→「Reference Set=COMPLETE」へ差替え、JP-SMP-050/060へ「GSを要するReference構成の案件でのみ生成」条件を追記（22番§11.4）。A-05: §8 KPI定義（16指標・DoD-11、目標値=CALIBRATION_VALUE）を正式収載。Automation Matrix再集計: A+B=77/95=81.1%・日中合算105/130=80.8%（A+B≥80%維持を確認・達成計算明記）。§7参照マップへG-02改訂/JP-LOOP-020を反映、準拠を05 v3.1へ更新 |
