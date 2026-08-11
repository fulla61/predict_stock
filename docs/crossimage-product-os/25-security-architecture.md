# 25. Security Architecture Review / Threat Modeling（実装前・独立工程）

| 項目 | 値 |
|---|---|
| Status | **Draft** |
| 版 | v0.1 |
| 日付 | 2026-08-11 |
| 作成 | SEC（Security Architect） |
| 準拠 | 05-governance-pack.md v3.1（§8 情報遮断・§9 Gate・Role 11種・§11 ハイブリッド運用）/ 15-a3-data-design.md v0.3.1（RBAC・audit_logs・イミュータブル設計・sensitivity体系・89表）/ 22-final-architecture-review.md §17（Phase 1 Minimum Schema）/ 01-architecture-overview.md §1（3 Portal構成）/ 12-a5-china-ops.md（Excel/WeChatハイブリッド）/ 21-phase1-decision-log.md（残余リスク） |
| 位置付け | Phase 0 Architecture（Freeze済み）に対する**実装前セキュリティレビュー**。実装はしない。本書は自社SaaSの防御要件の設計であり、攻撃手順書ではない。Phase 0の変更が必要な事項は末尾の ARCHITECTURE_CHANGE_REQUEST に分離し、勝手な変更はしない（21番§3.1 Freeze後運用ルール準拠） |

## 0. 本書の読み方と分類体系

- 全セキュリティ要件に一意ID（`SEC-` 系）を付し、以下4分類のいずれかを必ず付す:

| 分類 | 意味 |
|---|---|
| `MUST_BEFORE_MVP` | MVP（社外ユーザー1人でも触る最初の稼働）開始前に必須。これ無しで外部公開してはならない |
| `MUST_BEFORE_PRODUCTION` | 本番正式リリース（実案件・実金額の運用開始）前に必須 |
| `SHOULD` | 強く推奨。実装コストと突合してPhase 1内で計画 |
| `LATER` | 実績・規模が閾値を超えてから（Phase 1後半以降） |

- 既存設計（情報遮断3層・Append-only Audit・イミュータブル版管理・Hard Gate）は**前提として維持**するが、本書はそれを「安全の証明」とはみなさず、ゼロベースで攻撃者視点の検証を行った。結論: 既存設計はデータ層の遮断として優秀だが、**認証基盤・AI実行系の権限モデル・出力前検査・運用監視が未定義**であり、そこが現在の主要リスクである。

---

## 1. Threat Model（脅威モデル）

### 1.1 体系

STRIDE（脅威分類の体系：Spoofing なりすまし / Tampering 改竄 / Repudiation 否認 / Information Disclosure 情報漏洩 / Denial of Service サービス妨害 / Elevation of Privilege 権限昇格 の6分類）を用い、Actor（脅威主体）×資産×経路で主要シナリオを列挙する。

**Actor一覧**: ①外部攻撃者（無認証）②悪意ある/好奇心の強い顧客（CLIENTアカウント保持）③悪意ある工場（FACTORYアカウント/Excel返信チャネル保持）④内部者（SALES/PM/CN_OFFICE等の正規社内ユーザー）⑤侵害されたCN_OFFICE端末（マルウェア感染）⑥侵害されたWeChatアカウント（工場側・事務所側）⑦侵害されたAI実行系（Prompt Injection 経由の間接操作）⑧侵害された管理者/インフラ。

### 1.2 主要脅威シナリオ（20件）

| ID | 脅威（STRIDE） | Actor | 対象資産 | 経路 | 影響 | 主対策（要件参照） | 分類 |
|---|---|---|---|---|---|---|---|
| T-01 | 認証突破・パスワードリスト攻撃（S） | ①外部攻撃者 | 全案件データ・認証情報 | ログインAPIへの大量試行（漏洩パスワード再利用） | アカウント乗っ取り→遮断内側へ侵入 | AUTH-01〜06（MFA・レート制限・漏洩PW照合） | MUST_BEFORE_MVP |
| T-02 | 他Project/他顧客データの参照＝IDOR（オブジェクト直接参照：URLやIDを書き換えて他人のデータへ到達する攻撃）（I/E） | ②悪意ある顧客 | 他顧客の商品企画・仕様・価格 | 公開ID（CI-YYYY-NNNN）は推測容易。API直叩きでproject_id差替え | 顧客間漏洩＝事業信頼の崩壊 | TEN-01〜04・AZ-03（強制スコープ・RLS・認可テスト） | MUST_BEFORE_MVP |
| T-03 | 他工場Quote・Factory Scoreの閲覧（I） | ③悪意ある工場 | 他工場見積・内部評価 | FACTORY Portal APIのパラメータ操作・一覧APIの絞込み漏れ | 工場間競争情報の漏洩・当社交渉力の喪失 | TEN-02（factory_id強制スコープ）・AZ-04 | MUST_BEFORE_MVP |
| T-04 | 帳票経由のマージン漏洩（I） | ④内部者の過失/システム欠陥 | 商社粗利・顧客販売価格 | Excel/PDF生成テンプレートの参照誤り・隠し列・非表示シート・セル書式に残る元データ | 工場向けExcelに粗利が混入し関係破綻（01番§8「最頻事故経路」） | CH-01〜05（出力allowlist・カナリアテスト）・FILE-06 | MUST_BEFORE_MVP |
| T-05 | 工場返信Excelのマクロ/悪性ファイル（T/E） | ③悪意ある工場・⑤感染端末 | CN_OFFICE端末→システム全体 | 返信Excel（マクロ・数式・埋込オブジェクト）、偽装拡張子ZIP | 端末侵害→認証情報窃取→内側から全データ | FILE-01〜05（スキャン・マクロ既定除去・隔離）・AUTH-08 | MUST_BEFORE_MVP |
| T-06 | 侵害CN_OFFICE端末からの大量Export（I） | ⑤侵害端末（正規セッション悪用） | 全担当案件の仕様書・見積・顧客情報 | 正規権限での連続Download/Export | 静かな大量流出（正規操作なので防御が効かない） | AUD-03〜05（Export監査・大量Export検知・レート制限）・AZ-05 | MUST_BEFORE_PRODUCTION |
| T-07 | WeChatアカウント乗っ取り・なりすまし指示（S/T） | ⑥侵害WeChat | 仕様・価格合意・出荷判断 | 偽WeChatメッセージ・偽Excel返信の投入 | 偽情報がSoT昇格→誤った仕様/価格で進行 | 既存防御（§11-4: WeChat合意は無効・SoT昇格はApproval必須・出货批准はPortal