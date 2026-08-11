# 03. 開発ロードマップ（Phase 0〜3）

| 項目 | 値 |
|---|---|
| Status | **Reviewed** |
| Version | v1.1 |
| 日付 | 2026-08-11 |
| 準拠 | 05-governance-pack.md **v3.1** / 22-final-architecture-review.md §1（A-16の実反映）・§18 |

「一発で全部実装しない」を原則とし、各Phaseの完了条件（Exit Criteria）を人間承認で確定してから次へ進む。

---

## Phase 0 — 業務・UX・DB・Automation設計（コードを書かない）

| # | 成果物 | 担当エージェント |
|---|---|---|
| 1 | Executive Summary / Product Vision / Business Operating Model | 秘書AI + A1 |
| 2 | Customer Journey（DREAM→PLAN→REALITY、4 Entry Route） | A2 |
| 3 | 日本側全Workflow・Task定義票（■33） | A1 |
| 4 | 中国側全Workflow・中国語文書テンプレート（■35・36） | A5 |
| 5 | Adaptive Workflow / Project DNA / Task Generator Logic | A1 |
| 6 | Next Best Action / Proposal / Enhancement / Quality Reco / Regulatory / Factory Score 各Engine仕様 | A1・A4・A6 |
| 7 | User Roles / Permission Matrix / Screen Map | A2 + B6観点レビュー |
| 8 | ERD・全テーブル・State Machines・Audit Architecture | A3 |
| 9 | Soft/Hard Gate・Approval Workflow・Notification Logic・Automation Matrix | A1 |
| 10 | Excel Export Architecture / Security Architecture / KPI設計 | A3・B4観点 |
| 11 | トラブルシミュレーション50ケース + 設計後の追加20件 | A7 |
| 12 | MVP定義 / Phase 2・3 スコープ / Long Term Vision | 秘書AI |

**Exit Criteria**: オーナー承認10点セット（顧客Journey / 日本側Task / 中国側Task / Project DNA / Task Generator / Gate / Quality Tier / ERD / 権限 / Automation Matrix）+ A7レビュー通過。
※v1.1注記: 承認セットは22番§24で**16点セット**へ改訂され（実商流統合6点を追加）、2026-08-11にオーナーが条件付き承認済み（14番§8）。条件=22番§1の必要変更リストの実反映+23番Stress Test完了確認（Governance §20 DoD-10〜12併読）。

### Phase 0 Freeze後の運用（v1.1追加）

- Phase 0 Freeze後に出た新アイデア・追加要望は、**重大なArchitecture欠陥（ARCHITECTURE_LOCK〔後から変えると大改修になる構造〕に関わる欠陥）でない限り、Phase 1 Backlogへ登録**して扱う。**Phase 0成果物の再拡張（スコープ追加・章の増設による設計やり直し）は行わない**。
- Phase 0文書への変更は、是正パス（22番§1の必要変更リストの消化・承認条件の反映）に限定する。それ以外はPhase 1以降の版で扱う。

---

## Phase 1 — MVP

**スコープ（v1.1改訂・A-16）**: 22番§18の **Vertical Slice 15工程**（顧客相談受付 → Requirement構造化 → Proposal → Commercial Profile確定 → 工場探索・RFQ → Quote取込〔版+条件〕→ **Loop 1周目（不成立→Option型提案→MODIFY）** → **Loop 2周目（再分析→ACCEPT）** → Landed Cost試算・Quotation確定・受注 → サンプル・Reference Set確定〔G-02改訂版〕→ 法規・PO・生産・検品 → 出荷・輸入・納品 → 請求・実績原価化 → Feedback登録 → Repeat提案）を1本通せる最小構成。対象スキーマは22番§17のPhase 1 Minimum Schema（約79表）。

- Project Engine + Project DNA + 4 Entry Route
- Requirement Analyzer + Minimum Question + Proposal Engine（AI Draft + Human Approval）
- **Commercial Feasibility Loop最小実装（v1.1追加）**: commercial_profiles（版管理）/ commercial_loops / quote_conditions、社内Loop判断画面（6点セット+判断ボタン）と顧客「選べる進め方」画面（11番§10）
- **Cost・関税・Landed Cost最小実装（v1.1追加）**: cost_ledgers / cost_items / duty_assessments / landed_cost_snapshots（ESTIMATED→ACTUAL の3段階比較）
- **Production Reference Set（G-02改訂版）/ 納品後最小実装（v1.1追加）**: production_reference_sets / reference_items、products / product_versions / product_feedbacks
- CLIENT PORTAL（5画面Dashboard）/ 商社Portal（TODAY'S DECISIONS中心）
- Specification（Field Status付）/ 見積（粗利非表示制御・Quote版管理）/ RBAC / Audit Log
- 基本通知（メール）と中国語RFQドラフト生成（送信は人間）

**MVP自動化方針（v1.1明記・Governance §20 DoD-12）**: 初期MVPは「**AIが自動作成 → 人間確認 → 送信**」を基本とし、顧客・工場への重要情報を初日から完全自動送信しない。実績が蓄積したTaskからHuman Approvalを段階的に外す（20番⑩と同一方針）。

**Exit Criteria**: Zero Knowledge Test と Professional Test の2ペルソナがE2Eで通過（B5検証）。**E2Eテストケースは Loop最低2周（1周目=希望条件で不成立→MODIFY、2周目=ACCEPT）を必ず含む**（1周完結前提の排除を通しで実証。22番§18検証条件）。KPI 16指標（Governance §20 DoD-11）が実データで集計できること。Time To First Proposal と顧客入力時間を計測開始。

## Phase 2 — Quality / Production / Factory

- FACTORY/CHINA PORTAL（中国語UI）/ Factory Database + Factory Score
- RFQ配信・工場比較・Sample管理（V1..Vn）・Golden Sample LOCKED
- Quality Tier / 外観基準 / Inspection Plan（AQL）/ Quality Recommendation Engine
- Change Control（ECR、無断変更ブロック）/ Production Approval / 生産ステータス自動進行
- 工場用Excel 13シート自動生成 / 週次顧客レポート自動化

**Exit Criteria**: 実案件1件をPortal上でサンプル→量産承認まで通す。無断変更シナリオがHard Gateで止まることを実証。

## Phase 3 — Logistics / Complaint / CAPA / Analytics

- 輸入・物流管理（HS Code / Incoterms / BL / 通関 / 国内配送）/ Shipment Release
- Complaint管理 / Safety Issue分離・即時Escalation / CAPA / Traceability
- Repeat Order自動化（人間工数を初回の20%以下に）/ Customer Retention
- Project Profitability / KPIダッシュボード（■64全指標）

**Exit Criteria**: Repeat Order 1件を人間承認2回以内で完了。KPI自動集計が経営Dashboardに表示される。

---

## Phase横断の原則

- 各Phaseで A7（批判レビュー）と B5（ペルソナ検証）を必ず通す
- 「人間が頑張れば運用できる」機能はリリースしない。運用手順書が2ページを超えたら設計に差し戻す
- 実装順序: DB設計 → 顧客側UX → 社内管理 → 中国側 → Excel生成 → Quality → Production → Logistics → Complaint

---

## Change Log

| 版 | 日付 | 変更 |
|---|---|---|
| v1.0 | 2026-08-10 | 初版（Phase 0〜3ロードマップ） |
| v1.1 | 2026-08-11 | 是正パスR2（22番§1 A-16の実反映・Governance v3.1準拠）。Phase 1スコープを22番§18のVertical Slice 15工程・§17 Minimum Schema（約79表）と整合させ、Loop/Cost/Reference Set/Feedback最小実装を追加。Exit CriteriaにLoop最低2周のテストケース必須・KPI 16指標集計を追加。MVP自動化方針（AI作成→人間確認→送信=DoD-12）を明記。Phase 0 Exit Criteriaに16点セット改訂・条件付き承認済み（14番§8）の注記、「Phase 0 Freeze後の運用」（新アイデアはPhase 1 Backlogへ・Phase 0再拡張禁止）を追記。Statusヘッダを新設 |
