# 05. Governance Pack（全エージェント共通規約）

| 項目 | 値 |
|---|---|
| Status | **v2.2 APPROVED（v2.0差分はオーナー指示「Category-Agnostic Core」「言語設計ルール」を反映。v2.1/v2.2差分はA8/A9/A3/A4提案の裁定によるもので、オーナー事後確認事項）** |
| 適用範囲 | Crossimage Product OS に関わる全エージェント（A1〜A7, B1〜B6, C1〜C4, 運用AI Engine）および全設計・実装成果物 |
| 変更手続 | 本書の変更は秘書AIがChange Logに追記し、オーナー承認後に発効。**各エージェントによる勝手な用語・Status・ID の新設は禁止**（必要時は「Governance変更提案」として成果物末尾に記載し、統合レビューで採否判定） |

## 0. 前提（オーナー決定事項）

1. **中国工場は Portal 強制ではなく、Web / Excel / WeChat要約 のハイブリッド運用**を前提とする。Excel と WeChat 要約は第一級の入出力チャネルであり、Portal は商社側の構造化ビューと位置付ける。
2. **本システムは特定商品向けではない（Category-Agnostic）**。タンブラー・電動デスク・家電等の具体例は**検証用テストケースであり、優先カテゴリー・システム仕様ではない**。設計・実装においてカテゴリー固有ロジックのハードコードを禁止する（§13）。成果物中の具体例には「例でありシステム仕様ではない」ことが分かる注記を付ける。
3. **最初の Vertical Slice**: `0知識顧客 → Proposal → Requirement → RFQ → 中国語工場仕様書出力` を、テストケース第1号（タンブラー）で通しで検証する。これはUniversal Core+Rule Pack機構の検証であり、タンブラー専用設計の根拠にしてはならない。
4. **A7 Red Team 承認までコード実装は禁止**。
5. **最上位目的**: 商品開発知識ゼロの顧客からプロまで受け入れ、どんな商品でも要求を構造化し、最適な製造能力・品質・価格・リスク管理を設計し、少人数で大量案件を安全かつ高収益に回し、リピートまで自動化すること。評価指標は機能数ではなく、顧客（簡単・作りたくなる・安心・また頼みたい）/ 商社（作業が少ない・利益と責任が見える）/ 中国側（指示が明確・往復が少ない）/ 結果（低クレーム・高品質・高粗利・高リピート）。

---

## 1. 用語統一（Canonical Glossary）

- **正準キーは英語（UPPER_SNAKE または PascalCase）**。DB・API・State Machine・Gate定義は必ず正準キーで書く。
- UI・文書での表示は下表の日本語・中国語を使用。**表にない同義語の使用は禁止**（例:「検査」と「検品」の揺れ → 出荷前の現物検査は必ず「検品/检验」）。

| 正準キー(EN) | 日本語 | 中国語 | 備考 |
|---|---|---|---|
| Project | 案件 | 项目 | |
| Client | 顧客 | 客户 | 日本の発注者 |
| TradingCompany | 商社 | 贸易公司（本公司） | 当社 |
| Factory | 工場 | 工厂 | |
| ChinaOffice | 中国側事務所 | 中国办事处 | |
| Requirement | 要求事項 | 需求 | 顧客の生の要求 |
| Specification | 仕様書 | 产品规格书 | 承認済み仕様のSoT |
| SpecField | 仕様項目 | 规格项 | Field単位Status付 |
| Proposal | 商品提案 | 产品方案 | OPTION A/B/C |
| RFQ | 見積依頼 | 询价 | 商社→工場 |
| Quote | 工場見積 | 工厂报价 | 工場→商社 |
| Quotation | 顧客見積書 | （顧客非公開のため中文なし） | 商社→顧客 |
| Sample | サンプル | 样品 | V1..Vn |
| GoldenSample | ゴールデンサンプル | 黄金样（签样） | LOCKED対象 |
| LimitSample | 限度見本 | 限度样 | 外観許容限度 |
| FirstArticle | 首件 | 首件 | 量産初品確認 |
| PilotRun | 試作量産 | 试产 | |
| MassProduction | 量産 | 大货生产 | |
| QualityStandard | 品質基準書 | 品质标准书 | |
| InspectionPlan | 検品計画 | 检验计划 | |
| PreShipmentInspection | 出荷検品 | 出货检验 | |
| Defect | 不良 | 不良 | CRITICAL/MAJOR/MINOR |
| ECR | 変更申請 | 工程变更申请 | Engineering Change Request |
| UnauthorizedChange | 無断変更 | 未经批准变更 | Hard Gate対象 |
| CAPA | 是正・予防処置 | 纠正预防措施（CAPA） | |
| PO | 発注書 | 采购订单 | |
| Lot | ロット | 批次 | |
| Tooling | 金型 | 模具 | |
| MOQ | 最小発注数量 | 最小起订量 | |
| LeadTime | 納期 | 交期 | |
| Packaging | 梱包・包装 | 包装 | |
| ShipmentRelease | 出荷承認 | 出货批准 | 商社の最終承認 |
| Complaint | クレーム | 客诉 | |
| Traceability | トレーサビリティ | 追溯 | |
| ProjectDNA | 案件DNA | 项目DNA | §4 |
| Gate | ゲート | 关卡 | SOFT/HARD |
| WeChatDigest | WeChat要約 | 微信摘要 | §11 ハイブリッド運用 |
| FactoryAudit | 工場監査 | 工厂审核 | v1.1追加（A5提案） |
| IPQC | 工程内検査 | 制程检验（IPQC） | v1.1追加（A5提案） |
| Rework | 手直し | 返工 | v1.1追加（A5提案） |
| LoadingSupervision | 積込立会 | 装柜监督 | v1.1追加（A5提案） |
| Claim | 性能主張 | 性能宣称 | v2.2追加（A4提案）。仕様・試験・表現規制にリンクする第一級オブジェクト |
| DUPRO | 生産中検査 | 生产中检验（DUPRO） | v2.2追加（A4提案） |

## 2. ID体系

| 対象 | 形式 | 例 |
|---|---|---|
| Project | `CI-{YYYY}-{NNNN}` | `CI-2026-0001` |
| Client | `CL-{NNNN}` | `CL-0042` |
| Factory | `FA-{NNNN}` | `FA-0007` |
| Project配下エンティティ | `{ProjectID}-{TYPE}-{NN}` | `CI-2026-0001-RFQ-01` |
| TYPEコード | RFQ / QT(工場見積) / QO(顧客見積) / SMP / GS / ECR / PO / LOT / INS / SHP / CMP / CAPA / DOC / CLM(性能主張、v2.2追加・A4提案) | `…-SMP-02`（=Sample V2） |
| 業務Taskテンプレート（日本側） | `JP-{領域}-{NNN}`（10刻み） | `JP-PROP-020` |
| 業務Taskテンプレート（中国側） | `CN-{領域}-{NNN}`（10刻み） | `CN-RFQ-010` |
| Task実体（案件生成後） | `{ProjectID}-TSK-{NNNN}` | `CI-2026-0001-TSK-0031` |
| Factory付帯記録（案件非依存） | `FA-{NNNN}-{TYPE}-{NN}`（TYPE: AUD監査 / DOC資質書類 / CAPA） | `FA-0007-AUD-01`（v1.1追加、A5提案） |
| Category Rule Pack | `RP-{NNN}` | `RP-001`（v2.1追加、A8提案） |
| Gate | `G-{NN}` | `G-01` |
| 領域コード | LEAD/PROP(提案)/REQ(要件)/SPEC/RFQ/FACT(工場)/SMP/QUAL/REG(法規)/PROD/INSP/LOGI/FIN/CMP/RPT(Repeat) | |

- 連番はゼロ埋め。**IDの再利用・欠番の詰め直しは禁止**。
- 設計ドキュメントは `docs/crossimage-product-os/{NN}-{slug}.md`。Phase 0 成果物は 10番台以降を使用（割当は §10）。

## 3. Status体系（正準enum・新設禁止）

| 対象 | 値 |
|---|---|
| SpecField | `CONFIRMED / PROVISIONAL / AI_SUGGESTED / UNKNOWN` |
| Project | `DRAFT / ACTIVE / ON_HOLD / CLOSED_WON / CLOSED_LOST / CANCELLED` |
| Task | `TODO / IN_PROGRESS / WAITING_CLIENT / WAITING_CHINA / WAITING_APPROVAL / DONE / SKIPPED / BLOCKED` |
| Approval | `PENDING / APPROVED / REJECTED / CONDITIONAL` |
| Sample評価(項目単位) | `APPROVED / REJECTED / CONDITIONAL / PENDING` |
| GoldenSample | `DRAFT / CLIENT_APPROVED / COMPANY_APPROVED / FACTORY_ACKNOWLEDGED / LOCKED / SUPERSEDED` |
| Regulatory | `NOT_CHECKED / CHECKING / REVIEW_REQUIRED / APPROVED / NOT_APPLICABLE / BLOCKED` |
| Readiness(4種独立判定) | `RFQ_READY / SAMPLE_READY / PRODUCTION_READY / SHIPMENT_READY`（各 true/false + 不足理由リスト） |
| Defect | `CRITICAL / MAJOR / MINOR` |
| Gate判定 | `PASS / WARN / BLOCK`（WARN=Soft Gate通過、BLOCK=Hard Gate停止） |
| ECR | `DRAFT / SUBMITTED / UNDER_REVIEW / APPROVED / REJECTED / IMPLEMENTED` |
| Production | `MATERIAL_PREP / PILOT / P10 / P30 / P50 / P80 / P100 / INSPECTION / READY_TO_SHIP` |
| Complaint根本原因 | `FACTORY / TRADING_COMPANY / CLIENT / LOGISTICS / END_USER / UNKNOWN`（UNKNOWN≠商社責任） |
| 顧客心理(内部) | `IDEA / EXCITED / CONVINCED / COMMITTED / ORDERED` |
| Automation分類 | `A_FULL_AUTO / B_AI_DRAFT / C_HUMAN_DECISION / D_MANUAL_EXCEPTION` |
| QuestionClass（顧客質問分類） | `BLOCKER / IMPORTANT_LATER / OPTIONAL`（v1.1追加、A2提案） |
| RulePack | `DRAFT / REVIEW_REQUIRED / APPROVED / SUPERSEDED`（v2.1追加、A8提案） |
| SpecVersion（仕様書版） | `DRAFT / APPROVED / SUPERSEDED`（v2.2追加、A3提案。quality_standards版にも流用。RFQ添付はDRAFT可、量産はAPPROVED必須） |
| PO | `DRAFT / APPROVED / ISSUED / FACTORY_CONFIRMED / COMPLETED / CANCELLED`（v2.2追加、A3提案。G-01判定の参照先） |
| Sample実体（現物進行） | `REQUESTED / IN_PROGRESS / SHIPPED / RECEIVED / EVALUATED / CLOSED`（v2.2追加、A3提案。項目単位評価enumとは別） |
| Shipment | `PREPARING / RELEASE_REQUESTED / RELEASED / SHIPPED / ARRIVED / DELIVERED / CANCELLED`（v2.2追加、A3提案。RELEASED以外での船積み禁止） |
| Complaint進行 | `RECEIVED / INVESTIGATING / CORRECTING / RESOLVED / CLOSED`（v2.2追加、A3提案） |
| CAPA | `REQUESTED / SUBMITTED / IN_IMPLEMENTATION / VERIFICATION / CLOSED`（v2.2追加、A3提案） |

## 4. Project DNA（8軸・正準コード）

| 軸 | 正準コード |
|---|---|
| ExperienceLevel | `EXP_BEGINNER / EXP_INTERMEDIATE / EXP_PROFESSIONAL` |
| Intent | `INT_EXPLORE / INT_CONSIDER / INT_READY / INT_URGENT` |
| OdmLevel | `ODM_0_STOCK / ODM_1_LOGO / ODM_2_COLOR_PKG / ODM_3_STRUCTURE / ODM_4_FULL` |
| ProductRisk | `PRISK_LOW / PRISK_MEDIUM / PRISK_HIGH / PRISK_CRITICAL` |
| QualityLevel | `Q1_ESSENTIAL / Q2_STANDARD / Q3_PREMIUM / Q4_LUXURY` |
| BrandImpact | `BIMP_LOW / BIMP_MEDIUM / BIMP_HIGH / BIMP_CRITICAL` |
| FactoryRisk | `FRISK_TRUSTED / FRISK_NORMAL / FRISK_NEW / FRISK_HIGH` |
| CommercialRisk / Priority | `CRISK_LOW / CRISK_MEDIUM / CRISK_HIGH` × `PRIO_EXPERIMENTAL / PRIO_NORMAL / PRIO_KEY_ACCOUNT / PRIO_STRATEGIC` |

- DNAは案件作成時にAIが推定（`AI_SUGGESTED`）し、人間確定で `CONFIRMED`。**確定前でもSoft Gate範囲の工程は進行可**。
- DNA変更は履歴を残す（変更前後・理由・承認者）。派生ロジック（質問数・承認段数・検品密度・報告頻度）は必ずDNAコードを条件式のキーにする。

## 5. Task定義フォーマット（■33/■35共通・必須15項目）

全Taskは以下のYAML形式で定義する。**項目の省略・改名は禁止**（値が無い場合は `none` と明記）。

```yaml
task_id: JP-PROP-020            # §2 のテンプレートID
name: 商品提案ドラフト生成       # 中国側TaskはnameとdescriptionをZH併記
purpose: 曖昧要求に対しOPTION A/B/Cを提示し離脱を防ぐ
owner_role: SALES               # §8 のRole正準キー
trigger: Requirement Analyzer完了 かつ ExperienceLevel=EXP_BEGINNER
inputs: [Requirement, ProjectDNA]
system_action: 提案テンプレート起票、参考商品検索
ai_action: OPTION A/B/C ドラフト生成（Concept/Features/MOQ/概算/納期/利点/Trade-off）
human_action: 内容確認・修正・送信承認
outputs: [Proposal]
approval_required: true          # Approval対象と承認Role
blocking_condition: BLOCKER質問が未回答
deadline_rule: trigger+2営業日
notification: 承認待ち→担当SALESへ、期限超過→MGRへ
related_docs: [Proposal Export PDF]
related_tables: [proposals, projects]
automation_class: B_AI_DRAFT     # §3 のAutomation分類
gates: [G-10]                    # 関係Gate（なければ []）
```

## 6. Source of Truth（SoT）

1. **設計フェーズのSoTは本リポジトリの docs**。チャット・口頭・WeChat・メール内の合意は成果物ではなく、docsに反映されて初めて有効。
2. **優先順位**: Governance Pack（本書） > 統合レビュー（14番） > 各エージェント成果物 > 過去の議論。矛盾は統合レビューが裁定し、裁定結果を各docへ反映する。
3. **運用時のSoT**: 承認済みDBレコード（Specification / QualityStandard / GoldenSample / PO）。Excel・WeChatは入出力チャネルであり、**取り込んで構造化された時点でSoTに昇格**する（§11）。
4. ドメイン別SoT: 仕様=Specification(SpecField)、価格(工場)=Quote、価格(顧客)=Quotation、品質=QualityStandard、変更=ECR、責任判断=AuditLog+Approval記録。

## 7. Versionルール

- **設計doc**: 冒頭にStatusヘッダ（`Draft / Reviewed / Approved` + 版 + 日付 + 作成エージェント）。承認済みdocの変更は版を上げ、Change Log行を追記。
- **運用データ**: 承認済みSpecification・QualityStandard・GoldenSampleは**イミュータブル**。変更は新Version作成（旧版は `SUPERSEDED`）。上書き・削除は禁止（Soft Deleteのみ、承認履歴は削除不可）。
- Version番号: 仕様・サンプルは `V1, V2, …`。「最新版」という表記のみのファイル名は禁止（必ず版番号+日付）。
- Excel出力には必ず `ProjectID / DocType / Version / 出力日時 / APPROVED or DRAFT透かし` を埋め込む。

## 8. Role正準キーと権限前提

`CLIENT / SALES / PM(商品開発) / QA / REG(法規担当) / TRADE(貿易) / MGR(経営・承認者) / CN_OFFICE / FACTORY / SYSTEM / AI`

- 情報遮断（01の§8）を全成果物・全帳票に適用。**CLIENTに工場原価・粗利・他工場情報を、FACTORYに顧客販売価格・粗利・他工場情報を含めない**ことを、画面・Excel・WeChat要約の全チャネルで保証する。
- 承認の**代理ルール**: 各Hard Gate承認Roleには必ず代理承認者を定義する（承認者単一障害の禁止）。

## 9. Soft / Hard Gate（初期レジストリ）

Gate定義フォーマット: `gate_id / name / type / checkpoint / condition / blocked_actions / evidence / override`

| ID | 名称 | 種別 | 停止対象 | Override |
|---|---|---|---|---|
| G-01 | 正式発注なし | HARD | MassProduction開始 | 不可 |
| G-02 | GoldenSample未LOCKED | HARD | 正式量産開始 | 不可 |
| G-03 | Regulatory=BLOCKED | HARD | Production/Shipment（該当工程） | 不可（REG承認でStatus変更のみ）。※v1.1明文化: `PRODUCTION_READY` / `SHIPMENT_READY` は Regulatory が `APPROVED` または `NOT_APPLICABLE` であることが必須条件（A6提案） |
| G-04 | Critical Issue未解決 | HARD | ShipmentRelease | 不可 |
| G-05 | 検品未完了/FAIL未処理 | HARD | ShipmentRelease | 不可 |
| G-06 | UnauthorizedChange検知 | HARD | ShipmentRelease（ECR承認まで） | 不可 |
| G-10 | BLOCKER質問未回答 | SOFT | Proposal確定 | WARN付き進行可 |
| G-11 | Pantone未確定 | SOFT | 概算RFQ | WARN付き進行可 |
| G-12 | 数量未確定 | SOFT | Proposal/概算見積 | 概算値で進行可 |
| G-13 | ProjectDNA未確定 | SOFT | RFQ発行 | AI推定値で進行可（発注前に確定必須→G-01系） |
| G-14 | Regulatory=NOT_CHECKED | SOFT | RFQ発行・Quotation送信 | WARN付き進行可（v1.1追加。A1・A6の同番重複提案を一本化） |
| G-15 | 工場Quote未登録 | SOFT | Quotation承認 | WARN付き進行可＝概算見積であることを明示（v1.1追加、A1提案） |
| G-16 | 未実証Claim（性能主張）表現 | SOFT | 顧客向け性能表現の掲載・提案送信 | WARN付き進行可＝試験実証前の性能表現に「実証予定」注記を強制。実証失敗が確定した表現の使用はG-04系のCritical Issueへ昇格（v2.2追加、A4提案） |

- HARDは**システム・人間ともに承認記録なしで突破不可**。DB制約+アプリ層の二重防御（実装フェーズ要件）。
- Gateの追加・変更は本書への追記が必須。各エージェントは自成果物で `G-xx` を参照し、新Gateが必要なら「Governance変更提案」として起案する。

## 10. Phase 0 成果物のファイル割当

| ファイル | 担当 | 内容 |
|---|---|---|
| `10-a1-business-workflow.md` | A1 | 日本側Workflow・Task定義票・Task Generator・Automation Matrix |
| `11-a2-customer-journey.md` | A2 | Customer Journey・Entry Route・質問設計・Dashboard・Zero Knowledgeシナリオ |
| `12-a5-china-ops.md` | A5 | 中国側Task・ハイブリッド運用設計・中国語文書テンプレート（タンブラーRFQ/仕様書含む） |
| `13-a6-regulatory.md` | A6 | Regulatory Engine仕様・タンブラー法規マトリクス・Gate連動 |
| `14-integration-review.md` | 秘書AI | 成果物間矛盾の裁定記録 |
| `15-a3-data-design.md` | A3 | ERD・テーブル定義・State Machine・Audit |
| `16-a4-quality-design.md` | A4 | Quality Tier詳細・外観基準・Inspection Plan・Quality Reco Engine |
| `17-a7-red-team.md` | A7 | Red Teamレビュー・トラブルケース・承認判定 |
| `18-category-rule-packs.md` | A8 | Category Rule Pack設計・属性ルールエンジン・20カテゴリー比較表（v2.0追加） |
| `19-language-ux.md` | A9 | 言語設計・用語辞書（Glossary）・Tooltip仕様・レベル別説明・初心者モードUI（v2.0追加） |

## 11. ハイブリッド・チャネル運用原則（Web / Excel / WeChat要約）

1. **工場への出力**: Portal表示と同内容の中国語Excel（13シート構成のサブセット）を常に生成可能とする。RFQ・仕様書・品質基準はExcel添付が正、Portalは閲覧補助。
2. **工場からの入力**: 返信Excel・WeChatメッセージを中国側事務所（またはAI）が構造化してシステムへ登録。**登録された時点でSoT**となり、元メッセージはDocumentとして添付保存（証跡）。
3. **WeChat要約（WeChatDigest）**: 案件ごとの要点（未回答質問・期限・変更点）をAIが中国語で要約生成し、事務所経由で送信。逆方向（WeChat→システム）の要約取込も同フォーマット。
4. **禁止事項**: WeChat/メール上の合意のみで仕様・価格・納期を確定すること。必ずシステム登録（Approval記録）を経る。

## 13. Category-Agnostic 2層アーキテクチャ（v2.0・最上位制約）

システムは以下の2層に分離する。**Layer 1 にカテゴリー固有ロジックを書くことを禁止**し、カテゴリー差は全て Layer 2 のデータ（設定・Rule・Template）として表現する。

### Layer 1: Universal Core（カテゴリー非依存）
Project / Requirement / Specification / RFQ / Quote / Sample / Approval / Quality / Production / Inspection / Logistics / Complaint / RepeatOrder — 全エンティティ・State Machine・Gate・Workflow機構はカテゴリーを知らない。

### Layer 2: Category Rule Pack（データとして定義）
各カテゴリーは以下の構成要素を持つ**データパッケージ**であり、新カテゴリー追加は**コード修正なし（設定・テンプレート追加のみ）**で行えること:
`Required Questions（必須質問）/ CTQ（重要品質特性）/ Risk / Regulatory Candidates（適用法規候補）/ Test Plan / Quality Standard / Factory Qualification（工場適格要件）/ Inspection Template（検品テンプレート）/ Packaging Requirement`

### Rule生成式（最終形）
```
適用Ruleセット = f( Category + Product Attributes + Risk Attributes + Brand/Quality Tier )
```
カテゴリー単独でルールを決めない。属性の組合せ（例: ウォーターサーバー = 電気×食品接触×水漏れ×高温×大型物流）で必要ルールを合成する。

### 属性タグ正準レジストリ（ATTR_*）
| コード | 意味 |
|---|---|
| ATTR_ELECTRIC | 電気を使う |
| ATTR_FOOD_CONTACT | 食品・飲料に触れる |
| ATTR_CHILD_USE | 子供が使う |
| ATTR_LOAD_BEARING | 荷重がかかる（身体を支える・重量物を載せる） |
| ATTR_WATER | 水を使う・水漏れリスク |
| ATTR_HIGH_TEMP | 高温になる・加熱する |
| ATTR_LIQUID_SEAL | 液体の密閉が必要 |
| ATTR_BATTERY | バッテリーを内蔵する |
| ATTR_WIRELESS | Bluetooth / Wi-Fi 等の無線通信機能 |
| ATTR_SKIN_CONTACT | 人体に長時間触れる |
| ATTR_BULKY | 大型・重量物（物流特殊要件） |
| ATTR_OUTDOOR | 屋外・耐候使用 |
| ATTR_SHARP_EDGE | 鋭利部・可動部の挟み込みリスク |

属性の追加は本書の変更手続による。属性は Requirement 解析時にAIが推定（AI_SUGGESTED）し、人間確定で CONFIRMED。

### 未知カテゴリー対応
Category Rule Pack が存在しない商品が入力された場合: AIが属性タグを推定 → 属性ベースでルールを組み立て → `REVIEW_REQUIRED` として人間（PM/QA/REG）が確認・補正 → 実績が貯まったら新Rule Packとして正式登録する。**「未対応カテゴリーのため受付不可」という挙動は禁止**。

## 14. 言語設計ルール（v2.0・最上位制約）

本システムは日本語ユーザー中心・初心者利用前提の「知らない人でも使える専門システム」である。**理解を内蔵したプロダクトOS**として以下を全成果物・全UI・全文書に適用する。

### 禁止
- 英語のみでの専門用語提示（意味説明なしの英語単独出現）
- UI・顧客向け文書・エラーメッセージが英語前提になること

### 必須フォーマット
専門用語は初出時に必ず: **`用語（日本語説明：短い定義）`**
例: `MOQ（最小発注数量：工場が受けられる最低ロット）` / `CTQ（重要品質特性：品質判断の重要基準）` / `RFQ（見積依頼：工場に価格を依頼するプロセス）`
必要に応じて具体例・影響・関連用語を添える（例: `MOQ 1000個 → 小ロット不可、量産前提`）。

### インタラクティブUI前提
- 全専門用語に Tooltip（ホバー/タップで説明表示、詳細表示で定義・例・関連項目）
- **レベル別説明**: ExperienceLevel 連動 — `EXP_BEGINNER`=完全説明付き / `EXP_INTERMEDIATE`=簡易説明 / `EXP_PROFESSIONAL`=用語のみ（Tooltipは常に利用可）
- 用語を隠さない。ただし必ずその場で理解可能にする（学習ではなく"その場理解"）

### 適用範囲
UI上の全専門用語 / 顧客向け説明文 / Workflow説明 / Dashboard表示 / エラーメッセージ / 工場向け指示文（中国語も同原則: 中文用語+説明）。
§1 の正準キー（EN）は DB・API・内部識別子専用であり、**表示層に生のまま出してはならない**。表示用の用語辞書（Glossary）は 19番文書で管理し、同辞書収載の40語は §1 に準ずる正準用語として扱う（v2.1、A9提案）。

### 追加原則（v2.1、A9提案）
- **表示層は日本語主・英語従**: 見出し・ラベルは日本語を主とし、英語用語は括弧内補助に置く（例: 「見積依頼（RFQ）」であり「RFQ（見積依頼）」を主見出しにしない。本文中の初出フォーマットは従来どおり）
- **略語衝突時のフル表記義務**: 同一略語が複数の意味を持ちうる場合（例: BL＝船荷証券）、初出時は必ずフル表記＋日本語説明とする

## 15. Phase 0 Definition of Done

以下を全て満たした時点で Phase 0 完了とする。

1. `10`〜`17` の全成果物が `Reviewed` 以上で存在する
2. 統合レビュー（14番）で検出された矛盾が全件裁定済み（裁定結果が各docに反映済み）
3. **A7 Red Team の判定が APPROVED または CONDITIONAL（条件全消化）**である — それまでコード実装禁止
4. オーナー承認10点セット（顧客Journey / 日本側Task / 中国側Task / Project DNA / Task Generator / Gate / Quality Tier / ERD / 権限 / Automation Matrix）が承認済み
5. **タンブラーVertical Sliceの机上検証**が完了している: 0知識顧客の入力例 → Proposal(OPTION A/B/C 実例) → Requirement/SpecField一覧 → RFQ実例 → **中国語工場仕様書の実出力例（テンプレートに実データを流し込んだもの）** が成果物内に存在し、用語・ID・Statusが本書に完全準拠している
6. Automation Matrix上で A+B ≥ 80%（Phase 0時点は分類ベースで可）
7. 本書への未裁定の「Governance変更提案」が残っていない
8. **Category-Agnostic遵守（v2.0追加)**: 全設計にカテゴリー固有ロジックのハードコードが存在しないこと。`18-category-rule-packs.md` に最低20カテゴリー×10軸の比較表と属性ベースRule組立設計が存在すること。具体例には「例でありシステム仕様ではない」注記があること
9. **言語ルール準拠（v2.0追加)**: 顧客向け文言・Dashboard・エラーメッセージの設計に英語専門用語の単独出現（日本語補足なし）がゼロであること。`19-language-ux.md` に用語辞書とTooltip仕様が存在すること

## Change Log

| 版 | 日付 | 変更 |
|---|---|---|
| v1.0 | 2026-08-10 | 初版制定（オーナー承認方針: ハイブリッド運用・タンブラーPoC・Vertical Slice・A7承認まで実装禁止 を反映） |
| v1.1 | 2026-08-10 | 統合レビュー裁定によるGovernance変更提案8件の採否反映。採用6件: QuestionClass enum（A2①）、G-03 Readiness条件明文化（A6②）、G-14新設（A1①+A6①を一本化）、G-15新設（A1②）、Glossary 4語追加（A5①）、Factory付帯記録ID（A5②）。不採用2件: 教育文言ライフサイクルStatus（A2②→既存Approval enum流用）、A6のG-14単独案（A1案と統合）。詳細裁定は 14-integration-review.md |
| v2.0 | 2026-08-10 | オーナー指示による最上位制約の追加: §13 Category-Agnostic 2層アーキテクチャ（Universal Core / Category Rule Pack、属性タグレジストリ、未知カテゴリー対応、タンブラー等をテストケースへ降格）、§14 言語設計ルール（日本語補足必須フォーマット、Tooltip/レベル別説明UI前提）、§0に最上位目的を明文化、DoDに8・9項を追加、A8/A9成果物（18・19番）を割当。旧§12はDoD→§15へ改番 |
| v2.1 | 2026-08-10 | A8/A9のGovernance変更提案5件を全件採用: Rule Pack ID `RP-{NNN}`（A8①）、RulePack Status enum（A8②）、19番辞書40語の正準扱い（A9①）、表示層の日本語主・英語従原則（A9②）、略語衝突時フル表記義務（A9③）。あわせてIR-13を裁定: Automation A+B比率のDoD集計単位は「日本側+中国側の全Task合算」と定義（未達の場合は無理な再分類をせずA7/オーナー判断事項として記録） |
| v2.2 | 2026-08-10 | A3/A4のGovernance変更提案8件を全件採用: SpecVersion・PO・Sample実体・Shipment・Complaint進行・CAPAの各Status enum（A3①〜⑤）、TYPEコード`CLM`（A4①）、Soft Gate G-16 未実証Claim表現（A4②）、Glossary 2語 Claim/DUPRO（A4③、19番辞書への追補はA7後の最終整合パスで実施） |
