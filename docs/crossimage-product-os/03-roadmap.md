# 03. 開発ロードマップ（Phase 0〜3）

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

---

## Phase 1 — MVP

**スコープ**: 顧客が問い合わせ→提案→仕様→見積→発注まで通り、社内が案件を1画面で回せる最小構成。

- Project Engine + Project DNA + 4 Entry Route
- Requirement Analyzer + Minimum Question + Proposal Engine（AI Draft + Human Approval）
- CLIENT PORTAL（5画面Dashboard）/ 商社Portal（TODAY'S DECISIONS中心）
- Specification（Field Status付）/ 見積（粗利非表示制御）/ RBAC / Audit Log
- 基本通知（メール）と中国語RFQドラフト生成（送信は人間）

**Exit Criteria**: Zero Knowledge Test と Professional Test の2ペルソナがE2Eで通過（B5検証）。Time To First Proposal と顧客入力時間を計測開始。

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
