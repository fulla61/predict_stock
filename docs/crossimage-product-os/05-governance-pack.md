# 05. Governance Pack（全エージェント共通規約）

| 項目 | 値 |
|---|---|
| Status | **v1.0 APPROVED（オーナー承認済方針に基づき固定）** |
| 適用範囲 | Crossimage Product OS に関わる全エージェント（A1〜A7, B1〜B6, C1〜C4, 運用AI Engine）および全設計・実装成果物 |
| 変更手続 | 本書の変更は秘書AIがChange Logに追記し、オーナー承認後に発効。**各エージェントによる勝手な用語・Status・ID の新設は禁止**（必要時は「Governance変更提案」として成果物末尾に記載し、統合レビューで採否判定） |

## 0. 前提（オーナー決定事項）

1. **中国工場は Portal 強制ではなく、Web / Excel / WeChat要約 のハイブリッド運用**を前提とする。Excel と WeChat 要約は第一級の入出力チャネルであり、Portal は商社側の構造化ビューと位置付ける。
2. **Phase 0 の PoC商品は「タンブラー」を第一候補**とする。
3. **最初の Vertical Slice**: `0知識顧客 → Proposal → Requirement → RFQ → 中国語工場仕様書出力` までを通しで検証する。全エージェントは自分の成果物の中でこのSliceに該当する部分を最も詳細に書く。
4. **A7 Red Team 承認までコード実装は禁止**。

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

## 2. ID体系

| 対象 | 形式 | 例 |
|---|---|---|
| Project | `CI-{YYYY}-{NNNN}` | `CI-2026-0001` |
| Client | `CL-{NNNN}` | `CL-0042` |
| Factory | `FA-{NNNN}` | `FA-0007` |
| Project配下エンティティ | `{ProjectID}-{TYPE}-{NN}` | `CI-2026-0001-RFQ-01` |
| TYPEコード | RFQ / QT(工場見積) / QO(顧客見積) / SMP / GS / ECR / PO / LOT / INS / SHP / CMP / CAPA / DOC | `…-SMP-02`（=Sample V2） |
| 業務Taskテンプレート（日本側） | `JP-{領域}-{NNN}`（10刻み） | `JP-PROP-020` |
| 業務Taskテンプレート（中国側） | `CN-{領域}-{NNN}`（10刻み） | `CN-RFQ-010` |
| Task実体（案件生成後） | `{ProjectID}-TSK-{NNNN}` | `CI-2026-0001-TSK-0031` |
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
| G-03 | Regulatory=BLOCKED | HARD | Production/Shipment（該当工程） | 不可（REG承認でStatus変更のみ） |
| G-04 | Critical Issue未解決 | HARD | ShipmentRelease | 不可 |
| G-05 | 検品未完了/FAIL未処理 | HARD | ShipmentRelease | 不可 |
| G-06 | UnauthorizedChange検知 | HARD | ShipmentRelease（ECR承認まで） | 不可 |
| G-10 | BLOCKER質問未回答 | SOFT | Proposal確定 | WARN付き進行可 |
| G-11 | Pantone未確定 | SOFT | 概算RFQ | WARN付き進行可 |
| G-12 | 数量未確定 | SOFT | Proposal/概算見積 | 概算値で進行可 |
| G-13 | ProjectDNA未確定 | SOFT | RFQ発行 | AI推定値で進行可（発注前に確定必須→G-01系） |

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

## 11. ハイブリッド・チャネル運用原則（Web / Excel / WeChat要約）

1. **工場への出力**: Portal表示と同内容の中国語Excel（13シート構成のサブセット）を常に生成可能とする。RFQ・仕様書・品質基準はExcel添付が正、Portalは閲覧補助。
2. **工場からの入力**: 返信Excel・WeChatメッセージを中国側事務所（またはAI）が構造化してシステムへ登録。**登録された時点でSoT**となり、元メッセージはDocumentとして添付保存（証跡）。
3. **WeChat要約（WeChatDigest）**: 案件ごとの要点（未回答質問・期限・変更点）をAIが中国語で要約生成し、事務所経由で送信。逆方向（WeChat→システム）の要約取込も同フォーマット。
4. **禁止事項**: WeChat/メール上の合意のみで仕様・価格・納期を確定すること。必ずシステム登録（Approval記録）を経る。

## 12. Phase 0 Definition of Done

以下を全て満たした時点で Phase 0 完了とする。

1. `10`〜`17` の全成果物が `Reviewed` 以上で存在する
2. 統合レビュー（14番）で検出された矛盾が全件裁定済み（裁定結果が各docに反映済み）
3. **A7 Red Team の判定が APPROVED または CONDITIONAL（条件全消化）**である — それまでコード実装禁止
4. オーナー承認10点セット（顧客Journey / 日本側Task / 中国側Task / Project DNA / Task Generator / Gate / Quality Tier / ERD / 権限 / Automation Matrix）が承認済み
5. **タンブラーVertical Sliceの机上検証**が完了している: 0知識顧客の入力例 → Proposal(OPTION A/B/C 実例) → Requirement/SpecField一覧 → RFQ実例 → **中国語工場仕様書の実出力例（テンプレートに実データを流し込んだもの）** が成果物内に存在し、用語・ID・Statusが本書に完全準拠している
6. Automation Matrix上で A+B ≥ 80%（Phase 0時点は分類ベースで可）
7. 本書への未裁定の「Governance変更提案」が残っていない

## Change Log

| 版 | 日付 | 変更 |
|---|---|---|
| v1.0 | 2026-08-10 | 初版制定（オーナー承認方針: ハイブリッド運用・タンブラーPoC・Vertical Slice・A7承認まで実装禁止 を反映） |
