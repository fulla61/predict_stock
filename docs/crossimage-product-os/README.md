# Crossimage Product OS — Phase 0 設計ドキュメント

日本向け OEM/ODM 商社を少人数で半自動運営するための統合型 Product Development Operating System（仮称: Crossimage Product OS）の設計リポジトリです。

> 最重要思想:
> **「商品作り0知識の顧客には優秀な商品開発コンサルタントとして振る舞い、経験者には高速調達ツールとして振る舞い、運営会社には自動運転型ODM商社OSとして振る舞う。」**

## ドキュメント構成

| ファイル | 内容 |
|---|---|
| [01-architecture-overview.md](./01-architecture-overview.md) | システム全体設計の要約（Project DNA / Task Generator / Gate / Quality Tier / ERD概要 / Automation Matrix） |
| [02-agent-proposal.md](./02-agent-proposal.md) | **開発エージェント提案**（クロードイメージ秘書AI配下に置くべきエージェント体制） |
| [03-roadmap.md](./03-roadmap.md) | Phase 0〜3 開発ロードマップと各Phaseの完了条件 |
| [04-critical-review.md](./04-critical-review.md) | Master Promptへの批判的レビューと、それでも起こりうるトラブルの指摘 |

## 基本思想（Master Promptより）

- 記憶ではなく記録 / 感覚ではなく基準 / 口頭ではなく承認
- 問題発生後の責任追及より、問題が起きにくい設計
- 顧客を工程に合わせるのではなく、工程を顧客に合わせる（Adaptive Workflow）
- 入口は柔軟、量産・安全・法規・出荷は厳格（Soft Gate / Hard Gate）
- 正常案件は自動進行し、異常案件だけ人間が判断
- 全業務の80%以上を Full Automation または AI Draft + Human Approval へ

## 成功条件（KPI）

日本側3〜5名で多数案件を同時管理しながら、高粗利・低クレーム・高リピートを実現すること。
機能数の多さではなく、顧客入力の少なさ・人間作業時間の短さ・認識齟齬の少なさで評価する。

## 推奨開発順序

```
設計レビュー → DB設計 → 顧客側UX → 社内管理 → 中国側 → Excel生成
→ Quality → Production → Logistics → Complaint
```

一発で全部実装せず、各ステップで人間レビューを挟む。詳細は [03-roadmap.md](./03-roadmap.md) を参照。
