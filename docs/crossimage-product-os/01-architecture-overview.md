# 01. アーキテクチャ概要（Phase 0 要約）

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

---

## 2. Project 中心設計

全データは `Project ID`（例: `CI-2026-0001`）に紐付く。主要エンティティ群:

```
Client ─┬─ Project ─┬─ Requirement / Specification(Field単位Status付) / Design / CAD
        │           ├─ Factory ─ RFQ ─ Quote ─ Comparison
        │           ├─ Sample(V1..Vn) ─ GoldenSample(LOCKED, 版管理)
        │           ├─ QualityProfile ─ QualityStandard ─ InspectionPlan
        │           ├─ Regulatory(Status付) / Approval / ChangeRequest(ECR)
        │           ├─ PO ─ ProductionLot ─ Inspection ─ Shipment ─ Import ─ Delivery
        │           ├─ Invoice / Payment / Profitability
        │           ├─ Complaint ─ CAPA / Warranty / Traceability
        │           └─ Document / Comment / ActivityTimeline / AuditLog
        └─ Contact
```

- Specification の各 Field は `CONFIRMED / PROVISIONAL / AI_SUGGESTED / UNKNOWN` を持つ
- Golden Sample は CLIENT承認 + 商社承認 + 工場確認 の3者完了で `LOCKED`。上書き禁止、変更は新Version
- AuditLog は Who/When/Before/After/Reason/Approval。承認履歴削除不可、Soft Delete基本

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
