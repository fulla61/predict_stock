# 01. アーキテクチャ概要（Phase 0 要約）

| 項目 | 値 |
|---|---|
| Status | **Reviewed** |
| Version | v1.1 |
| 日付 | 2026-08-11 |
| 準拠 | 05-governance-pack.md **v3.1** / 22-final-architecture-review.md §1（A-07の実反映） |

Master Prompt の36成果物のうち、以降の全設計・全実装の土台になる骨格をここに要約する。
個別の詳細設計書（ERD全表、State Machine全図、画面Map等）は Phase 0 の各専門エージェントが本書を親として生成する。

---

## 1. システム構成（3 Portal + Core）

```
┌─────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ CLIENT PORTAL│  │ TRADING CO PORTAL │  │ FACTORY/CHINA    │
│ (日本語/平易) │  │ (日本語/業務)      │  │ PORTAL (中国語)   │
└──────┬──────┘  └────────┬─────────┘  └────────┬─────────┘
       │                  │                     │
       └──────────────────┼─────────────────────┘
                          │
              ┌───────────▼────────────┐
              │  Product OS Core       │
              │  - Project Engine      │
              │  - Project DNA        │
              │  - Task Generator     │
              │  - Next Best Action   │
              │  - Gate Engine        │
              │  - AI Engines(下記)   │
              │  - RBAC + Audit       │
              └───────────┬────────────┘
                          │
        ┌────────┬────────┼─────────┬──────────┐
     Database  Files   Translation  Export   Notification
     (Project) (版管理) (日⇄中)     (Excel/PDF) (Mail/WeChat/LINE)
```

### AI Engines（Coreに常駐する推論部品）

| Engine | 入力 | 出力 | 人間承認 |
|---|---|---|---|
| Requirement Analyzer | 顧客自由入力（文章/画像/URL） | Known/Missing/Conflicting/Assumption/Critical Missing 分類、BLOCKER質問 | 不要 |
| Proposal Engine | 要件+Project DNA | OPTION A/B/C 商品提案 | 送信前承認（初期のみ） |
| Product Enhancement Engine | 商品仕様 | Must/Recommended/Optional 付加価値提案 | 提案掲載は自動 |
| Quality Recommendation Engine | カテゴリ×価格×チャネル×DNA | Recommended Quality Profile+理由 | **必須** |
| Regulatory Engine | 商品情報 | 適用法規候補・必要書類・試験・表示 | **必須（法令最終判断は人間）** |
| Factory Score Engine | 過去案件実績 | 工場スコア更新・RFQ先推薦 | 選定は人間 |
| Next Best Action Engine | Project全状態 | 次の最高価値アクション | 正常系は自動実行 |
| Translation/Doc Engine | 日本側Approved Data | 中国語RFQ/仕様書/品質基準/検品基準 等 | 初回テンプレは承認、以降自動 |
| Progress Report Engine | 生産・検品ステータス | 週次顧客レポート | 正常系自動 / Cost増・遅延・リスク・仕様変更は承認 |
| **Feasibility & Cost Simulation Engine（実現性・費用試算）**（v1.1追加・A-07） | Commercial Profile（商業条件プロファイル：予算・数量・MOQ許容等の商業成立条件）+ Quote（工場見積）版 + Cost Ledger（費用台帳） | 希望vs工場回答の差分・成立/不成立判定、Landed Cost（着地原価：顧客指定納品地点までの総原価）概算、Option型再提案ドラフト（Commercial Feasibility Loop用） | 正式顧客提案（価格・工場・利益・重要条件を含む）は**必須**（Governance §16） |

---

## 2. Project 中心設計

全データは `Project ID`（例: `CI-2026-0001`）に紐付く。主要エンティティ群:

```
Client ─┬─ Project ─┬─ Requirement / Specification(Field単位Status付) / Design / CAD
        │           ├─ CommercialProfile(版管理) ─ CommercialLoop({ProjectID}-LOOP-{NN}, 追記型周回記録)
        │           ├─ Factory ─ RFQ ─ Quote(版管理+QuoteCondition) ─ Comparison
        │           ├─ CostLedger ─ CostItem ─ DutyAssessment ─ LandedCostSnapshot(3段階)
        │           ├─ Sample(V1..Vn) ─ GoldenSample(LOCKED, 版管理)
        │           ├─ ProductionReferenceSet(ReferenceItem, G-02改訂版の判定対象)
        │           ├─ QualityProfile ─ QualityStandard ─ InspectionPlan
        │           ├─ Regulatory(Status付) / Approval / ChangeRequest(ECR)
        │           ├─ PO ─ ProductionLot ─ Inspection ─ Shipment ─ Import ─ Delivery
        │           ├─ DeliveryTerms(Incoterms・納品責任分岐点)
        │           ├─ Invoice / Payment / Profitability
        │           ├─ Complaint ─ CAPA / Warranty / Traceability
        │           └─ Document / Comment / ActivityTimeline / AuditLog
        ├─ Product(PRD-{NNNN}, 案件横断) ─ ProductVersion(V1→V1.1→…系譜) ─ ProductFeedback
        └─ Contact
```

- Specification の各 Field は `CONFIRMED / PROVISIONAL / AI_SUGGESTED / UNKNOWN` を持つ
- Golden Sample は CLIENT承認 + 商社承認 + 工場確認 の3者完了で `LOCKED`。上書き禁止、変更は新Version
- AuditLog は Who/When/Before/After/Reason/Approval。承認履歴削除不可、Soft Delete基本
- **v1.1追加（A-07）**: CommercialLoop（商流成立ループの周回記録）/ CommercialProfile（商業条件プロファイル）/ CostLedger（費用台帳）/ ProductionReferenceSet（承認済み量産基準セット）/ DeliveryTerms（納品条件：Delivery Responsibility Point〔納品責任分岐点：費用と危険がCrossimageから離れる地点〕の記録）/ Product・ProductVersion / ProductFeedback を追記。詳細設計は 22番§5〜§15・15番

---

## 3. Project DNA（案件ごとの遺伝子）

案件作成時にAIが推定し、人間が確定する8軸。**全ての質問・Workflow・承認・品質・検品・報告頻度がここから導出される。**

| 軸 | 値 |
|---|---|
| Customer Experience | Beginner / Intermediate / Professional |
| Customer Intent | Explore / Consider / Ready / Urgent |
| ODM Level | 0既製品 / 1 Logo / 2 Color・Pkg / 3 構造変更 / 4 Full ODM |
| Product Risk | Low / Medium / High / Critical |
| Quality/Brand Level | Essential / Standard / Premium / Luxury |
| Brand Impact | Low / Medium / High / Critical |
| Factory Risk | Trusted / Normal / New / High Risk |
| Commercial Risk / Priority | Low〜High / Experimental〜Strategic |

導出例: `Beginner × Explore` → Proposal Engine先行・専門用語非表示。`Professional × Ready + CAD保有` → FAST TRACK、即RFQ。`Product Risk: Critical` → 法規Hard Gate強化・検品密度増。

---

## 4. Entry Route（4入口）と Adaptive Workflow

- **A. IDEA MODE** — 相談ベース。文章/画像/URLのみで開始 → Proposal Engine が3案提示
- **B. PRODUCT MODE** — 商品確定済。数量・価格・納期を直接入力
- **C. FAST TRACK** — CAD/BOM/仕様書保有 → 即RFQ・工場探索
- **D. REPEAT ORDER** — 前回仕様コピー、差分のみ確認。人間工数は初回の20%以下

固定Workflowは持たない。Task Generator が Project DNA + Entry Route から必要Taskだけを生成し、
COMMERCIAL / PRODUCT / DESIGN / FACTORY / QUALITY / REGULATORY / LOGISTICS の7 Workstream を並列進行させる。

**v1.1追加（A-07・Governance v3.0原則の反映）**:
- 商流の中核は **Commercial Feasibility Loop（商流成立ループ：工場回答と顧客判断で価格・数量・仕様を収束させる周回工程。Governance §16）** であり、第一級Workflowとして扱う。**Loopは1周で終わらない前提**で、各周回を `{ProjectID}-LOOP-{NN}` として追記記録し、CustomerDecision（`ACCEPT / MODIFY / NEGOTIATE / RE_SOURCE / RE_RFQ / HOLD / REJECT`）で分岐する。価格・MOQ・数量・仕様の事前確定を前提にしたUI・スキーマは禁止（BudgetStatus / QuantityStatus = `UNKNOWN` でも案件開始可）。
- **納品はProjectの終了ではない**（Governance §0-10）: 納品後の Feedback → 改善 → Repeat / Version Up / New Product までを商流の一部として扱い、Product / ProductVersion / ProductFeedback は Project CLOSED 後も生存する（§2エンティティ図）。

---

## 5. Gate Engine

| 種別 | 例 | 挙動 |
|---|---|---|
| **Soft Gate** | Pantone未定でも概算RFQ可 | 警告付きで進行可 |
| **Hard Gate** | 重大法規未確認→Shipment不可 / Golden Sample未承認→量産不可 / Critical Issue未解決→出荷不可 / 正式発注なし→量産不可 / 工場無断変更検知→出荷保留 | システムが物理的にブロック。人間でも承認記録なしに突破不可 |

Readiness は `RFQ READY / SAMPLE READY / PRODUCTION READY / SHIPMENT READY` を個別判定。

---

## 6. Quality 設計

- **Quality Tier**: Q1 ESSENTIAL / Q2 STANDARD / Q3 PREMIUM / Q4 LUXURY。ただし安全・法令・重大機能はTierで緩和しない（FIXED MINIMUM）
- **Quality Dimension**: Safety / Functional / Durability / Appearance / Sensory の5分類
- **Defect**: CRITICAL / MAJOR / MINOR。安全・重大法令不良は原則Critical
- **外観基準**: A/B/C Surface × 欠陥種(Scratch/Dent/色差/印刷ズレ/バリ/糊/隙間/汚れ) × 検査距離・照明・最大サイズ・最大数。OK/Limit/NG Sample写真を保存
- 顧客には AQL/CTQ を見せず「コスト重視/標準/ブランド重視/プレミアム」で選択させ、内部で正式基準へ変換
- 品質⇄コストの関係を可視化（「この項目を緩和すると−X円/強化すると+Y円」）

---

## 7. Automation Matrix（分類原則)

| 分類 | 対象例 |
|---|---|
| A. FULL AUTOMATION | ステータス更新、リマインド、進捗集計、翻訳ドラフト、定型Excel/PDF生成、Repeat見積依頼 |
| B. AI DRAFT + HUMAN APPROVAL | 商品提案、見積書、仕様書、品質基準、法規チェックリスト、週次報告(異常時)、CAPA依頼文 |
| C. HUMAN DECISION | 工場最終選定、価格交渉、品質Tier確定、法規最終判断、Golden Sample承認、出荷Release |
| D. MANUAL EXCEPTION | 市場事故対応、重大クレーム、責任交渉 |

A+B ≥ 80% を設計上の必達条件とし、各TaskはTask定義票（Owner/Trigger/Input/AI Action/Human Action/Output/Approval/Blocking/Deadline）で管理する。

---

## 8. 権限設計（情報遮断）

| 見せない情報 | CLIENT | FACTORY |
|---|---|---|
| 工場原価 | ✕ | ─ |
| 商社粗利 | ✕ | ✕ |
| 他工場見積・情報 | ✕ | ✕ |
| 中国側内部評価 | ✕ | ─ |
| 顧客販売価格・顧客内部情報 | ─ | ✕ |

RBAC + Project Based Permission。Export（Excel/PDF）にも同じ遮断ルールを適用する（帳票からの粗利漏洩が最頻の事故経路）。
遮断はUI・Excel/PDFに限らず、CSV / AI出力（生成文書・要約・提案文）/ 通知 / API応答 / WeChat向け出力の全チャネルに適用する（Governance §8 v3.1）。Cost Ledger・Landed Cost も同じ `sensitivity=COST/MARGIN` 体系に載せる（22番§8.3）。

---

## 9. KPI設計（v1.1追加・A-07。Governance §20 DoD-11の16指標）

KPI（重要業績評価指標：経営判断に使う測定値）は Automation Rate（A+B ≥ 80%）単独ではなく、以下の16指標を計測対象とする。**定義・計測方法は 22番§10.3 の定義表を正**とし、目標値はすべて `CALIBRATION_VALUE`（実案件データで校正する数値。Phase 0では固定しない）。

| 群 | 指標 |
|---|---|
| 人間工数 | Human Touch Time per Project（案件あたり人間総アクティブ時間）/ Human Decision Count（人間判断回数）/ Human Administrative Time（判断以外の人間作業時間。設計目標は0への漸近） |
| 速度 | Time to First Proposal / Time to First Factory Quote / RFQ Turnaround |
| 商流Loop | Commercial Loop回数 / Quote Acceptance Rate / MOQ Acceptance Rate |
| 費用・利益 | Estimate vs Actual Cost Variance（Landed Cost 3段階の乖離）/ Gross Margin Variance |
| 品質・納期 | Sample Iteration Count / 不良率 / 納期遵守 |
| 納品後 | Feedback Rate / Repeat Rate / Version Improvement Rate |

計測は操作イベント・タイムスタンプ・Loop記録等からの**自動集計**とし、自己申告をさせない（22番§10.3）。正式収載先はKPI定義表（A-05: 10番側の是正で収載）。

---

## Change Log

| 版 | 日付 | 変更 |
|---|---|---|
| v1.0 | 2026-08-10 | 初版（Phase 0骨格要約） |
| v1.1 | 2026-08-11 | 是正パスR2（22番§1 A-07の実反映・Governance v3.1準拠）。AI Enginesに Feasibility & Cost Simulation Engine（実現性・費用試算）を追加。§2エンティティ図に CommercialLoop / CommercialProfile / CostLedger / ProductionReferenceSet / DeliveryTerms / Product・ProductVersion / ProductFeedback を追記。§4に Commercial Feasibility Loop（第一級Workflow・事前確定前提の禁止）と「納品はProjectの終了ではない」（Governance §0-10）を追記。§8に遮断チャネル拡張（v3.1）とCost系sensitivity適用を追記。§9 KPI設計（DoD-11の16指標一覧・定義は22番§10.3参照）を新設。Statusヘッダを新設 |
