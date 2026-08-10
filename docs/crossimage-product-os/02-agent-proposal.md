# 02. 開発エージェント提案（クロードイメージ秘書AI 配下体制）

Master Prompt を精査した結果、**「1つの巨大プロンプトを1セッションに投げる」のではなく、秘書AI（オーケストレーター）の配下に専門エージェントを置き、成果物単位で分担・相互レビューさせる体制**を提案する。

理由:
1. Master Prompt は Phase 0 だけで36成果物+50トラブルケースを要求しており、単一セッションのコンテキストでは品質が劣化する
2. 「設計→自己レビュー→改善」の往復は、**設計者と批判者を別エージェントに分ける**方が実効性が高い
3. 日本語UX・中国語業務文書・DB設計・法規は必要な専門性が全く異なる

---

## 全体構成

```
クロードイメージ秘書AI（オーケストレーター）
│  役割: 案件受付・エージェント起動・成果物の版管理・人間承認の取次
│
├─【設計フェーズ（Phase 0）】
│   ├─ A1 業務設計エージェント（Business Process Architect）
│   ├─ A2 顧客体験エージェント（Customer Journey / UX Designer）
│   ├─ A3 データ設計エージェント（DB / ERD Architect）
│   ├─ A4 品質・検品設計エージェント（QMS Designer）
│   ├─ A5 中国側業務エージェント（China Ops / 中文文書設計）
│   ├─ A6 法規エージェント（Regulatory Research）
│   └─ A7 批判レビューエージェント（Red Team Reviewer）
│
├─【実装フェーズ（Phase 1〜3）】
│   ├─ B1 バックエンドエージェント（Core / API / Gate Engine）
│   ├─ B2 フロントエンドエージェント（3 Portal UI）
│   ├─ B3 AIエンジン実装エージェント（LLMパイプライン）
│   ├─ B4 帳票エージェント（Excel / PDF Export）
│   ├─ B5 テスト・ペルソナ検証エージェント（QA / Persona Simulator)
│   └─ B6 セキュリティ・権限エージェント（RBAC / Audit Auditor）
│
└─【運用フェーズ（本番）】
    └─ 01-architecture-overview.md 記載の AI Engines 9種
       （Requirement Analyzer / Proposal / Enhancement / Quality Reco /
         Regulatory / Factory Score / Next Best Action / Translation / Report）
```

---

## 設計フェーズ・エージェント詳細

### A1. 業務設計エージェント（Business Process Architect）
- **担当成果物**: 日本側全Workflow（■33の細分化Task定義票）、中国側Workflow骨格、Adaptive Workflow設計、Task Generator Logic、Next Best Action Engine仕様、Soft/Hard Gate定義、Automation Matrix、Approval Workflow
- **入力**: Master Prompt、01-architecture-overview.md
- **完了条件**: 全Taskが A/B/C/D 分類済みで A+B ≥ 80%、各Hard Gateに突破不可条件が明記されている

### A2. 顧客体験エージェント（Customer Journey / UX Designer）
- **担当成果物**: Customer Journey（DREAM→PLAN→REALITY）、4 Entry Route画面フロー、Minimum Question設計、Just-in-Time Education文言集、CLIENT DASHBOARD（5画面）、社内Dashboard、Screen Map全体
- **特記**: Zero Knowledge Customer Test（■69）と Professional Customer Test（■70）のシナリオ台本もこのエージェントが書く
- **完了条件**: 「オリジナルタンブラー作りたい」だけの顧客がProductionまで到達するフローが専門用語なしで通ること（B5が検証）

### A3. データ設計エージェント（DB / ERD Architect）
- **担当成果物**: ERD全体、全テーブル定義、State Machines（Project/Sample/Golden Sample/ECR/PO/Lot/Shipment/Complaint/CAPA）、File・Version管理設計、Audit Architecture
- **重点**: Specification Field単位のStatus、Golden Sample LOCKEDの不変性、Soft Delete、承認履歴の削除不可をスキーマレベルで保証する

### A4. 品質・検品設計エージェント（QMS Designer）
- **担当成果物**: Quality Tier詳細（Q1〜Q4の具体基準表）、FIXED MINIMUM定義、外観基準テンプレート（A/B/C Surface）、Defect分類、Inspection Plan（AQL: Lot Size/Level/Sample Size/Ac/Re）、Quality⇄Cost可視化ロジック、Quality Recommendation Engine仕様
- **完了条件**: 同一カテゴリ（例: タンブラー）で500円ノベルティと8000円ブランド品の基準差が数値で示されていること

### A5. 中国側業務エージェント（China Ops / 中文文書設計）
- **担当成果物**: 中国側全Task（寻厂〜出货批准、■35全項目）、中国語文書テンプレート11種（■36）、工場向けExcel 13シート構成（■63）、Factory Database・Factory Scoreスキーマ、Change Control（ECR）フロー
- **特記**: 「日本語直訳」を禁止し、製造・QC現場の慣用表現（例: 限度样/首件确认/不良整改）へ変換するルールブックを作る。中国工場が実際に使うか？の観点で機能を削る役割も持つ

### A6. 法規エージェント（Regulatory Research）
- **担当成果物**: Regulatory Engine仕様、カテゴリ別適用法規マトリクス（PSE/食品衛生/食品接触/電波法/消安法/家庭用品品質表示法/知財・商標・意匠）、必要書類・試験・表示テンプレート、Regulatory Status遷移とHard Gate連動
- **制約**: **AIは法令の最終判断をしない**。出力は常に「候補+根拠+専門家確認要否」。BLOCKED時に止める工程の定義までが責務

### A7. 批判レビューエージェント（Red Team Reviewer）
- **担当成果物**: トラブルシミュレーション50ケース（■68）、各設計書への批判レビュー（過剰工程・二重入力・不要承認・顧客離脱要因・工場が使わない機能の指摘）、設計完成後の追加トラブル20件（■72）
- **運用ルール**: A1〜A6の成果物を**必ず別セッションで**レビューする。設計者自身の自己レビューは承認条件にしない

---

## 実装フェーズ・エージェント詳細

| # | エージェント | 担当 | 重点 |
|---|---|---|---|
| B1 | バックエンド | Project Engine、Task Generator、Gate Engine、RBAC、Audit、API | Hard GateはDB制約+アプリ層の二重防御。監査ログは追記専用 |
| B2 | フロントエンド | CLIENT（平易な日本語）/ 商社（判断中心）/ 工場（中国語）3 Portal | CLIENTにERP画面を見せない。社内は「TODAY'S DECISIONS」中心 |
| B3 | AIエンジン実装 | 9 Engineのプロンプト・評価・Human-in-the-loop接続 | 各Engineに評価データセットとregressionテストを必ず付ける |
| B4 | 帳票 | Excel（工場用13シート）/ PDF Export 14種 | Export時の権限遮断（粗利・他工場情報の混入防止）を自動テスト |
| B5 | テスト・ペルソナ検証 | Zero Knowledge / Professional / 中国工場QC担当の3ペルソナでE2Eシナリオ実行 | 「離脱ポイント」「二重入力」「翻訳誤解」を検出したらA2/A5へ差し戻し |
| B6 | セキュリティ・権限 | 権限マトリクス検証、情報遮断の侵入テスト、Audit完全性 | CLIENTセッションで工場原価がAPIレスポンスに含まれないことを機械検証 |

---

## 起動順序と依存関係

```
A1 業務設計 ──┬─→ A3 DB設計 ──→ B1 バックエンド ─┬─→ B4 帳票
              ├─→ A4 品質設計 ─┘                  ├─→ B3 AIエンジン
A2 顧客UX ────┤                                   └─→ B2 フロント
A5 中国側 ────┤
A6 法規 ──────┘
        ↑↓ 常時
A7 批判レビュー（全成果物を横断レビュー、承認ゲート）
                                    B5 / B6（実装物を継続検証）
```

- Phase 0 では A1・A2・A5・A6 を並列起動 → A7レビュー → 修正 → A3・A4 → A7レビュー
- 実装は「DB設計 → 顧客側UX → 社内管理 → 中国側 → Excel生成 → Quality → Production → Logistics → Complaint」の推奨順序に従う

---

## 秘書AIの運用ルール（重要）

1. **成果物単位で発注する**: エージェントには「■33を全部」ではなく「Lead Management〜Proposal のTask定義票」のように分割して依頼する
2. **設計者と批判者を分ける**: A7の承認なしに実装フェーズへ進めない
3. **人間承認ポイントを固定する**: ①顧客Journey ②日本側全Task ③中国側全Task ④Project DNA ⑤Task Generator ⑥Gate定義 ⑦Quality Tier ⑧ERD ⑨権限 ⑩Automation Matrix — この10点はオーナー（人間）承認を必須とする
4. **各成果物はこのリポジトリ（またはProduct OS専用リポジトリ）にMarkdownでコミットし、版管理する**。チャット内の合意は成果物ではない
5. Claude Code のサブエージェント定義（`.claude/agents/*.md`）としてA1〜B6を登録すれば、`Agent` ツールで並列起動できる。Product OS 専用リポジトリを新設した時点で登録することを推奨

---

## 今すぐ追加を推奨するエージェント（Master Promptに無い提案）

| 提案エージェント | 理由 |
|---|---|
| **C1 データ移行・現行業務ヒアリングエージェント** | 現在のExcel/WeChat/メール運用の実データを構造化しないと、Factory ScoreもRepeat Orderも初期値ゼロで価値が出ない。過去案件の取込設計が必要 |
| **C2 通知・連絡チャネル統合エージェント** | 顧客はメール/LINE、工場はWeChat/QQが現実。Portal完結を前提にすると使われない。チャネル橋渡し（受信→構造化→Portal反映）の設計が必要 |
| **C3 価格・原価シミュレーションエージェント** | Total Landed Cost（■51）は為替・関税・運賃が変動する。見積時と発注時の差異を自動検知しマージン毀損を警告する専門機能は独立させる価値がある |
| **C4 プロンプト運用・評価エージェント（LLMOps）** | 運用AI Engine 9種の出力品質は劣化する。評価セット管理・改善サイクルを回す担当がいないと「AIが変な提案をする」で現場が使わなくなる |
