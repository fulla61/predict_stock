# 27. Frontend Architecture（本体フロントエンド設計）

| 項目 | 値 |
|---|---|
| Status | **Draft** |
| Version | v0.1 |
| 日付 | 2026-08-11 |
| 作成 | FE-A（Frontend Architect） |
| 準拠 | 05-governance-pack.md v3.2（§8 遮断・§13-B AI Data Scope Contract / AI Output Security Gate・§14 言語ルール）/ 24-ux-architecture.md v1.1（FINAL 9画面・§12 Progressive Disclosure・§13 State設計・§14 Role別表示）/ 25-security-architecture.md v1.0（§5〜6 認可・§11 Application Security・§18.1 Security Baseline 3階層）/ 21-phase1-decision-log.md §3.1 第5・6項（Presentation Layer分離原則・Visual実装順）/ poc/visual-poc.html（Feature Flag・Quality Governor・Reduced Motion実装パターン） |
| 本書の範囲 | オーナー指定Visual実装順の**手順(1)「本体Frontend Architectureの確定」**に対応する設計書。実装コードは含まない。コンポーネントライブラリの選定は行わない（Design System Phaseで決定） |
| 位置づけ | 本書の技術スタック（§1）は**オーナー確認事項としての推奨案**であり断定ではない。確定分類（§9）の最終確定もオーナー確認後とする |

> 注: 本書中の画面例・イベント例は24番FINAL 9画面・05番§16 Commercial Feasibility Loop（商業成立ループ：条件が工場回答と顧客判断で収束していく往復工程）に基づく設計例であり、特定商品カテゴリーの仕様ではない（Governance §0-2）。

---

## 1. 技術スタック推奨案（オーナー確認事項）

以下はすべて**推奨+代替+理由**の形式で提示する。断定確定はオーナー確認後（§9）。ライブラリ名は原則 `CONFIGURABLE`（管理判断で差替可能な選定事項）であり、構造上の原則（SPA採用・サーバー状態とUI状態の分離等）のみをLOCK候補とする。

### 1.1 フレームワーク

| 区分 | 内容 |
|---|---|
| **推奨** | **React + TypeScript + Vite による SPA（Single Page Application：単一ページ内で画面を切り替えるWebアプリ形式）** |
| 代替 | Next.js（React用フルスタックフレームワーク：SSR〔Server Side Rendering：サーバー側でHTMLを組み立てる方式〕やルーティングを内蔵） |
| 理由 | ①**3 Portal共通基盤**: CLIENT / TRADING CO / FACTORY-CHINA の3 Portalは認証必須の業務アプリであり、同一コンポーネント基盤・同一Design Token（デザイントークン：色・余白等のデザイン定数）を共有するSPA構成が最も単純。②**社内ツール性質**: 全画面ログイン後利用のため SEO（検索エンジン最適化）不要=SSRの主目的が存在しない。③**SSR不要性**: SSRはサーバー実行環境・キャッシュ設計・遮断済みデータのサーバー側レンダリング経路という追加のセキュリティ検証面を持ち込む。25番の認可・遮断はAPI境界（§5）で保証するため、フロントは静的配信+API通信の単純構成が防御面でも有利。④Viteのビルド速度・Code Splitting（コード分割：使う画面の分だけJSを読み込む仕組み）対応はvisual-engine遅延ロード（§6）と相性がよい |
| 補足 | Next.js採用が有利になる条件（将来、未ログインの公開ページ・マーケティングページを同一リポジトリで持つ場合等）が発生した時点で再評価する。現Scopeでは顧客企業マーケティングはScope外（Governance §0-7）のため該当しない |

### 1.2 状態管理

| 区分 | 内容 |
|---|---|
| **推奨** | **TanStack Query（サーバー状態管理ライブラリ：APIデータの取得・キャッシュ・再取得を担う）でサーバー状態を管理し、Zustand（軽量ストア：小さなグローバルUI状態置き場）等でUI状態のみを管理する2系統分離** |
| 代替 | Redux Toolkit（大規模状態管理ライブラリ）への統一 |
| Redux不採用の理由 | 本システムの状態の大半は「サーバーが正のデータ」（Project / Task / Approval / Quote版…= SoT〔Source of Truth：正とみなすデータの置き場〕はDB。Governance §6）であり、フロントに業務状態の複製ストアを持つと**二重SoT・stale表示（古いデータの表示）・キャッシュ手動管理**が発生する。TanStack Queryはサーバー状態を「キャッシュであって正ではない」と扱う設計で、Waiting系表示（24番§13）の自動再取得とも整合する。Reduxの利点（単一ストアの時系列デバッグ）が必要な規模のクライアント状態を本設計は持たない |
| 状態の3分類 | ①サーバー状態（案件・判断キュー・Quote等）→TanStack Query ②UI状態（Drawer開閉・表示レベル・選択中タブ等）→軽量ストア+コンポーネントローカル ③**Visual状態（演出の再生状態）→ packages/visual-engine 内に閉じ込め、業務ストアに置かない**（§2・§3） |

### 1.3 ルーティング

- **推奨**: TanStack Router または React Router（いずれもSPA用ルーティングライブラリ。型安全性でTanStack Routerを第一候補）。`CONFIGURABLE`。
- 構造原則（こちらが本質）: ①Portal別にルートツリーを分離（`/client/*` `/internal/*` `/cn/*`）②ルートガード（画面到達前の認可チェック）はRole判定の**表示制御のみ**とし、認可の実体はサーバー側（§5.2）③ExperienceLevel（習熟度レベル）によってURL・遷移構造を変えない（24番§12「別UX禁止」）④9画面とルートの対応は§4.3の表を正とする。

### 1.4 フォーム

- **推奨**: React Hook Form（フォーム状態管理ライブラリ）+ Zod（スキーマバリデーション：入力値の型・制約を宣言的に検証するライブラリ）。代替: TanStack Form。`CONFIGURABLE`。
- 構造原則: ①Zodスキーマは `packages/shared-types` に置きAPI入出力型と単一ソース化（二重定義禁止=24番§1.4-3の思想をコードに適用）②エラーメッセージは19番の言語ルール準拠（日本語主・4点構成は§5.4）③24番の「Inline質問カード」「変更条件ミニフォーム」（SC-C4）等は同一フォーム基盤の構成違いとして実装し、画面別のフォーム実装を作らない。

### 1.5 i18n（国際化：多言語表示の仕組み）

- **推奨**: i18next + ICU MessageFormat（複数形・変数埋込の国際標準書式）。代替: FormatJS（react-intl）。`CONFIGURABLE`。
- 構造原則（LOCK候補に含む部分あり。§9）:
  1. **日本語が主言語**。CLIENT / TRADING CO Portalは日本語、FACTORY-CHINA Portal（CN_OFFICE用）は中国語（zh-CN）を既定とする（24番§4.3「中国語最小UI」）。
  2. **enum・正準キー（EN）を表示層に直接出すコードパスを持たない**（Governance §14）。表示は必ず「表示名マップ」を経由し、そのマップのSoTは**19番の用語辞書（Glossary）**とする。翻訳リソースは用語辞書から生成・同期し、辞書にない同義語をリソースに手書きしない。
  3. **Tooltip機構との接続**: 専門用語コンポーネント（例: `<Term termKey="MOQ">`）を共通部品とし、①表示名（「最小数量」等の日本語主表記）②Tooltip本文（定義・例・関連語）③ExperienceLevel別の説明密度（EXP_BEGINNER=完全説明 / EXP_INTERMEDIATE=簡易 / EXP_PROFESSIONAL=用語のみ・Tooltip常備）を19番辞書+24番§12の規則で解決する。用語のハードコード表示は lint（静的検査）で検出対象とする。
  4. 中国語リソースも同原則（中文用語+説明。Governance §14適用範囲）。

### 1.6 日付・数値・通貨フォーマット

- **推奨**: `Intl`（ブラウザ標準の国際化API）を基盤とし、日付操作はDay.jsまたはdate-fns。`CONFIGURABLE`。
- 構造原則:
  1. **金額・数量・日付等の数値表示には `font-variant-numeric: tabular-nums`（等幅数字：桁位置が揃う数字表示）を標準適用**（PoCのDecision Card実装パターンを昇格。比較・差分表示の可読性要件）。
  2. 通貨は多通貨前提（JPY / CNY / USD…）。**金額は必ず通貨コード+確度バッジ（概算/見積あり/確定/実績）とセットの共通コンポーネント**で表示し、裸の数値表示を禁止する（24番§10.1・UX-RT是正#11「金額と確度バッジは同一カード内」を部品構造で保証）。
  3. 中国語ロケール: FACTORY-CHINA Portalの日付・数値は `zh-CN` ロケール書式（`Intl.NumberFormat('zh-CN')` 等）。日本側Portalは `ja-JP`。ロケールはPortal既定+ユーザー設定で解決し、画面個別指定を禁止。
  4. タイムゾーン: 日中間運用のため、期限・日時はサーバーUTC保持+表示側ロケールTZ変換を原則とする（「本期限」の日中での読み違い防止）。

### 1.7 コンポーネントライブラリ — **本書では確定しない**

- コンポーネントライブラリ・ビジュアルスタイルの選定は**Design System Phase（Visual実装順(5) Design Token / Motion Token化以降）で決定**する。本書は方針のみ規定する:
  - **ヘッドレスUI（見た目を持たず挙動・アクセシビリティのみ提供する部品群。例: Radix UI / React Aria / Headless UI）前提**とし、見た目はDesign Token承認後に被せる。
  - これにより、Visual Direction（視覚方向性）のOwner Review（実装順(4)）の結果がどう転んでも、挙動・フォーカス管理・ARIA（支援技術向け属性）の実装をやり直さない。

---

## 2. ★Layer Architecture（オーナー指定の5層・最重要）

### 2.1 5層の定義

| Layer | 名称 | 内容 | 確定分類 |
|---|---|---|---|
| **Layer 1** | Business UI | Navigation / Card / Form / Table / Decision（One Decision画面部品）/ Tooltip / 通知等、9画面を構成する業務UI。**この層だけで業務が100%成立する** | 構造はLOCK候補 |
| **Layer 2** | Glass・Translucent Surface | 半透明サーフェス（Glassカード等）。CSSレベルの表層装飾。乱用禁止（PoC方針: Decision Card等主要カードのみ） | Presentation Layer |
| **Layer 3** | Ambient WebGL Background | WebGL（ブラウザの3D/GPU描画API）による背景演出（粒子・流体・水面・光） | Presentation Layer |
| **Layer 4** | Interaction Effect | カーソル反応・Ripple（波紋）・Meaningful Motion（業務Stateに呼応する演出）等の相互作用演出 | Presentation Layer |
| **Layer 5** | Optional Audio | 任意の音演出。**既定OFF**（PoC `sound: false` を踏襲） | Presentation Layer |

### 2.2 Presentation Layer分離原則（21番§3.1第5項の実装構造）

1. **Layer 3〜5（および Layer 2 の装飾実装）はPresentation Layerであり、ARCHITECTURE_LOCK対象外・後から継続変更可**。変更・削除がBusiness Function（業務機能）に一切影響しない構造を必須とする。
2. **パッケージ構造上も分離**する（§4.1）: Presentation Layerは `packages/visual-engine` に隔離し、`packages/app`（Business UI）から**一方向依存**で参照する。**逆依存（visual-engine → app / shared-types業務型への依存）を禁止**。依存方向はlint / ビルド設定（依存境界ルール）で機械的に強制する。
3. visual-engineが担ってよいのは「描画・演出」のみ。業務データの取得（API呼出し）・業務状態の保持・DOM上の業務要素の書換えを禁止する。visual-engineへの入力は§3のVisual Event Busと画面ジオメトリ（減光領域の矩形等、PoC `u_contentRect` パターン）に限定する。
4. **失敗の無害化**: visual-engineのロード失敗・WebGL初期化失敗・実行時例外は、すべて「静的fallback表示 or 演出なし」に縮退し（PoC `body.no-webgl` パターン）、業務UIの動作・入力・承認操作を止めない。visual-engine内の例外は境界（Error Boundary：描画エラーを局所で受け止める仕組み）で吸収し、appへ伝播させない。
5. Layer 2（Glass）はCSSのみで実装可能なため `app` 側に置いてもよいが、そのスタイル値（blur量・透明度等）はDesign Token化対象とし、業務ロジックと混在させない。

---

## 3. ★Visual Event Bus設計（業務State→Visual Layerの疎結合契約）

### 3.1 設計原則

- Business UI（発行側）は「いま業務で何が起きたか」を**抽象State名のみ**でEvent発行する。visual-engine（購読側）はそれをどう演出するかを独自に決める。**発行側は購読者の存在を知らず、購読側は業務の実装を知らない**。
- **双方向禁止**: visual-engineからappへのEvent・コールバックによる業務制御を認めない（演出は業務に影響しない、の型化）。

### 3.2 Event型定義（契約。LOCK候補）

```
// packages/shared-types/visual-events.ts（型定義のみ・実装なし）

// 抽象State名（初期セット。追加はCONFIGURABLE、削除・意味変更は契約変更）
type VisualEventName =
  | 'IDLE'                       // 平常
  | 'DECISION_REQUIRED'          // 判断・承認が到着した（SC-S1/S2, SC-C3 NEXT DECISION）
  | 'APPROVED'                   // 承認・確定が成立した
  | 'FACTORY_RESPONSE_RECEIVED'  // 工場回答が届いた（SC-C3 回答欄出現）
  | 'COMMERCIAL_LOOP'            // Loop周回の進行（条件調整中）
  | 'PROJECT_COMPLETED'          // 案件の完了・納品
  | 'WAITING'                    // 待機状態（工場回答待ち等）
  | 'BLOCKED';                   // Hard Gate停止（演出は沈静化方向のみ）

interface VisualEvent {
  name: VisualEventName;
  intensity?: 'low' | 'normal' | 'high';  // 演出強度の抽象指定のみ
  screenId?: 'SC-C1' | ... | 'SC-N2';     // 発生画面（9画面ID）
  // ★ペイロードはこれで全部。自由なdataフィールドを型として持たない
}
```

**機微データの型レベル禁止（25番§9.4整合・LOCK候補)**:

1. `VisualEvent` に自由記述の `payload / data / detail` フィールドを**定義しない**。価格・マージン・顧客名・工場名・Quote数値・Project実ID・enum生値等の機微・業務データは**型として搭載不可能**にする（「入れない情報は漏れない」= 25番§9.3.1と同原則の演出層適用）。
2. PoC実証済みパターンの昇格: PoCのMeaningful Motionはシェーダーuniform `u_motionMode`（0=idle / factory / decision / approved / completed / loop の抽象番号のみ）で駆動されており、この「抽象State番号のみ渡す」方式を正式契約とする。
3. 契約の検査: `VisualEventName` 追加時は文字列に業務データを埋め込んでいないか（例: `'APPROVED_CI-2026-0001'` のような命名）をレビュー必須とする。lintで動的文字列のEvent名生成を禁止。

### 3.3 購読側の独立性（LOCK候補）

1. **Eventが1件も発行されなくてもvisual-engineは成立する**（IDLE演出のみで動作）。
2. **visual-engineが存在しなくても業務は100%動く**: appはEvent発行を「投げっぱなし」（購読者ゼロでも正常）とし、発行の成否・演出の完了を業務フローの条件にしない。E2Eテスト（§8）はvisual-engine無効状態を標準系として実行する。
3. Bus実装は軽量（`EventTarget` ベース等）とし、`CONFIGURABLE`。契約（3.2の型と本節の独立性）のみがLOCK候補。

### 3.4 Feature Flag / Reduced Motion / Quality Governor（PoCパターンの昇格）

| 機構 | PoC実装パターン | 本体への昇格方針 |
|---|---|---|
| Feature Flag（機能フラグ：演出単位のON/OFFスイッチ） | `FLAG_DEFAULTS` + localStorage永続化 + `onChange` リスナー + `masterOff`（全演出一括OFF） | visual-engine内のFlagストアとして昇格。フラグ単位（ambientParticles / cursorInteraction / clickRipple / meaningfulMotion / particleMorph / liquidOrb / sound / masterOff / quality）を初期セットとして継承。既定値・保存先（ユーザー設定API化するか）は`CONFIGURABLE`。**sound既定OFFは維持** |
| 有効判定の集約 | `fx(name)` 関数に masterOff・WebGL可否・依存関係・reducedMotion を集約 | 単一の有効判定関数をvisual-engine唯一のゲートとして維持（判定ロジックの分散禁止） |
| Reduced Motion（動きの抑制設定：OSの「視差効果を減らす」等） | `prefers-reduced-motion` を起動時取得し、cursor追従・morphを無効化、その他は強度縮減（×0.1〜0.4）・粒子数1/4 | 同方式を昇格し、**媒体クエリの動的変更にも追従**（起動時固定をやめる）。詳細は§7 |
| Quality Governor（品質統治機構：実測FPSで描画品質を自動段階調整） | fps移動平均→ 45fps未満で降格（high→med→low）、57fps超6秒継続で昇格。tier別にDPR・粒子数倍率・shader複雑度を変更。手動固定も可 | 機構として昇格。**閾値（45/57/評価間隔2s/復帰6s）とtier係数はCALIBRATION_VALUE**（実機データで校正・固定禁止） |

---

## 4. ディレクトリ構造案（モノレポ）

### 4.1 パッケージ構成（`CONFIGURABLE`。依存方向のみLOCK候補）

```
frontend/                          # モノレポ（pnpm workspace等を想定。ツールはCONFIGURABLE）
├─ packages/
│  ├─ app/                        # Layer 1 Business UI（3 Portal + 共通業務部品）
│  │  ├─ src/portals/client/      #   CLIENT PORTAL（SC-C1〜C4）
│  │  ├─ src/portals/internal/    #   TRADING CO PORTAL（SC-S1〜S3）
│  │  ├─ src/portals/cn/          #   FACTORY/CHINA PORTAL（SC-N1〜N2・zh-CN）
│  │  ├─ src/features/            #   画面横断の業務機能（decision / loop / feedback…）
│  │  ├─ src/components/          #   共通業務部品（Term/金額+確度バッジ/状態4点表示…）
│  │  └─ src/api/                 #   APIクライアント・TanStack Query hooks
│  ├─ visual-engine/              # Layer 2(装飾)〜5。Presentation Layer（LOCK対象外）
│  │  ├─ src/flags/               #   Feature Flag / Quality Governor（§3.4）
│  │  ├─ src/ambient/             #   WebGL背景（Layer 3）
│  │  ├─ src/interaction/         #   Ripple・カーソル反応（Layer 4）
│  │  ├─ src/audio/               #   Optional Audio（Layer 5・既定OFF）
│  │  └─ src/bus/                 #   Visual Event Bus購読側
│  ├─ ui-tokens/                  # Design Token / Motion Token 置き場
│  │  └─ (空構造のみ用意。中身はVisual実装順(4)承認→(5)Token化の後に投入)
│  └─ shared-types/               # 型契約のみ（実装を持たない）
│     ├─ visual-events.ts         #   §3.2 Event契約
│     ├─ api/                     #   API入出力型・Zodスキーマ
│     └─ display/                 #   表示名マップ型（19番辞書と同期）
└─ e2e/                           # Playwright E2E（§8）
```

**依存ルール（機械強制。LOCK候補）**: `app → visual-engine`（遅延ロードのみ）/ `app → shared-types` / `visual-engine → shared-types（visual-events型のみ）` / `app・visual-engine → ui-tokens`。**逆方向・visual-engineから業務型/APIへの依存は禁止**。

### 4.2 shared-typesの遮断整合

- `shared-types/api` の応答型は**Role別に到達可能なフィールドのみを持つ型**として定義する（例: CLIENT向け型に工場名・原価・Marginフィールドが型として存在しない）。24番§14-4「CLIENTで到達不能なデータはAPI応答に含めない」を型レベルでも表現し、フロントでの「受け取って隠す」実装を構造的に不可能にする。

### 4.3 9画面（24番FINAL）とルートの対応表

| 画面ID | 画面名 | ルート案 | 備考 |
|---|---|---|---|
| SC-C1 | 相談キャンバス | `/client/consult` | 未ログイン到達可否は認証設計（25番§4）に従う。SC-C2へは連続キャンバス遷移（UX-RT是正#5）のためルート遷移してもアニメーション上は連続に見せる |
| SC-C2 | プランを固める | `/client/projects/:id/plan` | State遷移（提案→質問→確定）はルートを分けずクエリ/内部Stateで表現（24番§5.4） |
| SC-C3 | あなたの商品 | `/client/projects/:id`（顧客ホーム: `/client`） | 見積確認・サンプル確認・成立時ACCEPT・Feedback・Repeatはすべて本ルート内カード（新ルートを作らない） |
| SC-C4 | 進め方の選択 | `/client/projects/:id/options` | 不成立・条件付周回専用。成立周回はSC-C3内で完結（UX-RT是正#4） |
| SC-S1 | 今日の判断 | `/internal`（ホーム） | Decision Queue+例外リスト |
| SC-S2 | One Decision画面 | `/internal/decisions/:decisionId` | 判断種別はデータ差。通知からの直行リンク先（24番§11-4） |
| SC-S3 | 案件360 | `/internal/projects/:id` | Drill Down・DNA確認Inline含む |
| SC-N1 | 今日任务 | `/cn`（ホーム・zh-CN） | 出货批准を最上位固定 |
| SC-N2 | 取込・差分レビュー | `/cn/inbox/:itemId` | 軽微差分はSC-N1カード内完結のためルート遷移なし（UX-RT是正#9） |

- 新ルート追加=新画面追加であり、24番§5.2の10検証質問を通過しない限り追加しない。Drawer / Modal / Inline カードにはルートを与えない（ただしSC-S2のDrill Down Drawer等、復元性が必要なものはクエリパラメータでの状態復元を許可）。

---

## 5. API境界

### 5.1 BFF（Backend for Frontend：画面専用の中間API層）の採用検討

| 論点 | 検討 |
|---|---|
| 推奨 | **Phase 1は「Role別に応答を整形する単一API」から開始し、独立したBFF層は置かない**（薄いBFF相当の責務をAPI層のview/serializer（応答整形部）が担う）。将来、Portal別の要求差が大きくなった場合にPortal別BFFへ分離できるよう、応答整形部をRole/Portal単位でモジュール分離しておく |
| 理由 | ①遮断・認可の強制点は増やすほど検査面が増える。25番§5の認可3層+§10の出力allowlistを**1箇所のAPI境界**に集約する方が監査・テストが単純 ②One Decision画面の「6点セット集約済み提示」（24番§9.1）はサーバー側集約が必須であり、これはBFFの有無に関わらずAPI設計要件 ③少人数運用でBFFの独立デプロイ運用コストが見合わない |
| 条件 | 独立BFFを後日導入する場合も、**認可・遮断はBFFの背後のAPI/DB層で強制されている状態を変えない**（BFFを信頼境界にしない） |

### 5.2 認可はサーバー側強制（LOCK候補）

1. **クライアント側のRole判定・ルートガード・欄マスクはすべて「表示制御」であり、認可ではない**。情報遮断は**APIレスポンスに含まれないこと**で保証する（25番§5 認可3層・§6 テナント分離・24番§14-4）。
2. フロントは「受信データに存在しない欄は描画しない」を原則とし、機微欄の**存在自体を出さない**（値の伏字表示をしない=24番§14-1）。
3. 承認ボタン等の操作UIは権限がなければ**非表示**（無効化ではない。24番§14-3）。ただし非表示にしてもAPIは同一の認可検査を行う（UI制御を防御とみなさない）。
4. XSS（クロスサイトスクリプティング：注入スクリプト実行）対策として、工場返信・顧客入力等の非信頼テキストは自動エスケープ経由でのみ描画し、`dangerouslySetInnerHTML`（生HTML挿入API）の使用をlintで禁止する。CSP（Content Security Policy：読み込み元制限ポリシー）・CSRF（偽リクエスト強制）対策・Rate Limit連動は25番§11の方針に従う。

### 5.3 エラー・ローディング・Waiting状態の標準ハンドリング

- **24番§13の4点構成（①何が起きているか ②誰が何をしている途中か ③次に何が起こるか〔目安日〕④あなたがすること）を共通State表示コンポーネントとして1実装に集約**し、画面個別のエラー/待機表示実装を禁止する。日付なしの待機・遅延表示はコンポーネントの型レベルで不可能にする（目安日 or 「お待ちいただくだけで大丈夫です」のどちらかを必須プロパティ化）。
- 状態分類と標準挙動:

| 状態 | 標準ハンドリング |
|---|---|
| ローディング | スケルトン表示（読み込み中の枠表示）。スピナー乱立禁止。TanStack Queryのstale-while-revalidate（古い表示を出しつつ裏で更新）でLoading画面自体を減らす |
| Waiting（WAITING_CLIENT / WAITING_CHINA等） | 業務上の正常状態としてデザイン（エラー扱いしない）。4点構成+「当社が進めていること」並記（24番§13） |
| Empty | 顧客=SC-C1入力誘導が兼ねる。社内=「今日決めることはありません」（健全表示） |
| Blocked（Hard Gate） | 顧客にGate名を出さない。社内は解除条件+担当Role併記・解除ボタンなし |
| APIエラー | 分類（認証切れ/認可外/検証エラー/サーバー障害/オフライン）別の共通ハンドラ。文言は19番準拠の日本語（CN Portalは中国語）。技術詳細・スタックトレースを表示しない（25番§11 ログ機微非露出と同系） |
| 楽観更新 | 承認・判断等の証跡系操作には楽観更新（成功を先取りするUI更新）を使わない（サーバー確定後に反映。誤表示の証跡リスク回避） |

---

## 6. パフォーマンス予算（数値目標はCALIBRATION_VALUE。構造方針のみ確定）

1. **業務UI優先の絶対原則**: 全演出OFF（masterOff）時に業務UIが最軽量で動くことを基準状態とする。**Effect OFFで60fps**（判断・入力・スクロールの応答性）を受入基準とし、演出はそこからQuality Governorの許す範囲でのみ加算される。
2. **初期ロード目標**: 各Portalの初期表示（ログイン→ホーム描画）を業務回線・標準的なノートPC/スマホで体感即応とする。数値目標（例: 初期JSサイズ上限・LCP〔Largest Contentful Paint：主要コンテンツ表示時間〕目標値）は実測に基づき設定・校正する `CALIBRATION_VALUE`（仮固定しない。Governance §0-8）。
3. **Code Splitting方針**:
   - Portal別・画面別に分割し、他Portalのコードを読み込まない。
   - **visual-engineは必ず遅延ロード（dynamic import）**とし、初期バンドルに含めない。ロード失敗時は演出なしで業務継続（§2.2-4）。Layer 5 Audioはさらにユーザー有効化時のみロード。
   - 重量ライブラリ（WebGL関連・チャート等）は使用画面で初回参照時ロード。
4. モバイル（スマホ完結保証対象画面。24番§8.8）は低性能端末でのGovernor降格を前提に、演出既定を控えめ側にできるようFlag既定値をPortal/デバイス別に設定可能とする（`CONFIGURABLE`）。

---

## 7. アクセシビリティ基盤

1. **フォーカス管理**: Drawer / Modal / Inlineカード出現時のフォーカス移動・トラップ（枠内循環）・復帰をヘッドレスUI部品（§1.7）の標準挙動で保証。`focus-visible` リング（PoC実装済みパターン）を全操作要素に適用。
2. **キーボード**: 全業務操作（判断5ボタン・承認・フォーム・Drawer開閉）をキーボードのみで完結可能とする。visual-engineの演出（Ripple等）はポインタ専用でよいが、**キーボード操作を横取りしない**（イベント購読は passive・非キャプチャ）。
3. **reduced-motion**: `prefers-reduced-motion: reduce` で ①CSSトランジションの停止（PoCのdrawer実装パターン）②visual-engineのカーソル追従・morph停止・強度縮減・粒子数削減（§3.4）③Meaningful Motionは「透明度のわずかな変化程度」へ縮退（PoC `strength 0.18` パターン）。設定変更へ動的追従。
4. **コントラスト**: テキスト・操作要素はWCAG（Webアクセシビリティ指針）AA相当のコントラスト比を確保する。**Layer 2 Glass・Layer 3 背景の上に載る文字は、背景演出の最悪ケース（最も明るい/動く瞬間）でも基準を満たすこと**を受験条件とし、満たせない場所には減光領域（PoC `u_contentRect` パターン）を敷く。具体的な色値はDesign System Phaseで決定するが、この検証義務は本書で確定する。
5. **Tooltip（19番接続）**: 用語Tooltipはホバー専用にせず、タップ・フォーカスでも開閉可能とし、`aria-describedby`（支援技術への説明参照属性）で読み上げに接続。ExperienceLevelに関わらずTooltipは常時利用可（Governance §14）。
6. スクリーンリーダー: 判断キュー到着・状態変化はライブリージョン（動的変化の読み上げ領域）で通知。visual-engineのcanvasは `aria-hidden`（支援技術から隠す）とする（演出は情報を運ばない=情報は必ずLayer 1に存在する、の裏面保証）。

---

## 8. テスト戦略

| 層 | 対象 | 方針 |
|---|---|---|
| 単体 | 表示名マップ・フォーマッタ（金額+確度バッジ/日付/中文）・Zodスキーマ・権限別表示ロジック | Vitest等（`CONFIGURABLE`）。enum生値が表示文字列に出ないことの網羅テストを含む（Governance DoD-9対応） |
| コンポーネント | 共通業務部品（Term / 状態4点表示 / One Decisionカード / Inline質問カード） | Testing Libraryで挙動・ARIA・キーボード操作を検証。Role別欄マスク（存在しない欄が描画されないこと）を含む |
| E2E | **Playwrightによる主要Flow通し** | 下記 |
| visual-engine | **スモークのみ**（起動する・落ちない・OFFにできる） | 下記 |

**E2Eシナリオ（03番Exit Criteria=22番§18 Vertical Slice対応）**:
1. **Loop2周E2E**を最重要シナリオとする: 相談受付（SC-C1）→プラン確定（SC-C2）→RFQ→Loop1周目不成立（SC-C3→SC-C4でMODIFY）→Loop2周目成立（SC-C3内カードでACCEPT完結）→Quotation承認→受注、を顧客・社内・CN 3Portal横断で通す。
2. 合格判定に24番の構造基準を組み込む: 各Loop周回の顧客画面数（不成立2 / 成立1）・再入力0・enum生値露出0。
3. E2Eは**visual-engine無効（masterOff）を標準系**として実行し、演出の有無がテスト安定性・業務動作に影響しないことを常時証明する。

**visual-engineスモーク（Business担保から分離）**:
- 検証項目は「①有効化してもJSエラーゼロ ②WebGL不可環境でfallback表示に縮退 ③masterOff即時反映 ④Event Bus購読者ゼロでもapp正常」の4点のみ。**演出の見た目・品質はテスト対象にしない**（見た目はOwner Review=Visual実装順(4)の領分であり、CIで業務リリースをブロックしない）。

---

## 9. 確定分類（最終確定はオーナー確認後）

> 以下の分類は本書v0.1時点のFE-A提案であり、**ARCHITECTURE_LOCK候補を含め、最終確定はオーナー確認後**とする（Governance §0-8）。

### 9.1 ARCHITECTURE_LOCK候補（後から変えると大改修になる構造）— 6件

| # | 項目 | 内容 |
|---|---|---|
| L-1 | Layer分離 | Layer 1（Business UI）とLayer 2〜5（Presentation Layer）の分離。Layer 3〜5はLOCK対象外として継続変更可、という**分離構造そのもの**をLOCKする（21番§3.1第5項） |
| L-2 | 一方向依存 | `app → visual-engine`（遅延ロードのみ）の一方向依存。逆依存禁止・機械強制（§2.2/§4.1） |
| L-3 | Visual Event Bus契約 | 抽象State名のみのEvent型・自由payload不保持=**機微データの型レベル禁止**（§3.2。25番§9.4整合） |
| L-4 | 購読側独立性 | Eventなし/visual-engineなしで業務100%動作。演出を業務フローの条件にしない（§3.3） |
| L-5 | サーバー側認可強制 | クライアントは表示制御のみ。遮断はAPIレスポンス非含有で保証・機微欄の存在自体を出さない（§5.2。25番§18.1 #1〜4整合） |
| L-6 | 表示層のenum非露出構造 | enum・正準キーを表示するコードパスを持たず、表示名マップ（19番辞書同期）経由を必須とする（§1.5。Governance §14） |

### 9.2 CONFIGURABLE（管理判断で変更可能）

- ライブラリ選定の具体（React/Vite/TanStack Query/Zustand/ルーター/フォーム/i18n/日付ライブラリ/モノレポツール/テストランナー）
- ディレクトリ詳細（§4.1のフォルダ割り・命名）、ルートパス文字列（§4.3。画面IDとの対応関係は24番準拠で維持）
- Feature Flagの項目追加・既定値・保存先、VisualEventNameの追加、BFF層の将来分離判断（§5.1の条件下で）
- Portal/デバイス別の演出既定値

### 9.3 CALIBRATION_VALUE（実測で校正・固定禁止）

- Quality Governor閾値（降格45fps/昇格57fps/評価間隔/復帰時間）・tier係数、初期ロード数値目標（バンドル上限・LCP等）、遅延ロード分割の粒度

### 9.4 Design System Phaseへ送る事項

- コンポーネントライブラリの選定（ヘッドレスUI前提のみ本書で確定）
- Design Token / Motion Tokenの中身（`ui-tokens` は空構造のみ先行作成。Visual実装順(4)Owner Review承認後に(5)で投入）
- 色・タイポグラフィ・具体的コントラスト色値（§7-4の検証義務のみ本書で確定）、Glassスタイル値、Motionのイージング・時間

---

## 10. オーナー確認が必要な決定事項（一覧）

1. フレームワーク推奨案の承認: React + TypeScript + Vite のSPA（代替: Next.js）— §1.1
2. 状態管理方針の承認: TanStack Query + 軽量UIストアの2系統分離（Redux不採用）— §1.2
3. ヘッドレスUI前提とし、コンポーネントライブラリ選定をDesign System Phaseへ送ること — §1.7
4. §9.1 ARCHITECTURE_LOCK候補6件（L-1〜L-6）の確定可否
5. Visual Event Bus初期Event集合（§3.2の8種）の妥当性確認（追加はCONFIGURABLE運用）
6. BFF層を置かず単一API境界で開始する方針 — §5.1
7. モノレポ4パッケージ構成（app / visual-engine / ui-tokens / shared-types）の承認 — §4.1
8. E2Eの標準系を「visual-engine無効」とし、visual-engineはスモークのみとするテスト責務分離 — §8

---

## Change Log

| 版 | 日付 | 変更 |
|---|---|---|
| v0.1 | 2026-08-11 | 初版Draft（FE-A）。Visual実装順(1)対応: 技術スタック推奨案（推奨+代替+理由・ライブラリ非確定）/ 5層Layer Architecture（Layer 3〜5=Presentation Layer・LOCK対象外・packages分離+一方向依存）/ Visual Event Bus契約（抽象State名のみ・機微データ型レベル禁止・購読側独立）/ PoCパターン昇格（Feature Flag・Quality Governor・Reduced Motion）/ モノレポ構造案+9画面ルート対応表 / API境界（BFF不採用開始・サーバー側認可強制・State表示4点構成の共通化）/ パフォーマンス予算（Effect OFF 60fps・visual-engine遅延ロード）/ アクセシビリティ基盤 / テスト戦略（Playwright Loop2周E2E・visual-engineスモーク分離）/ 確定分類（LOCK候補6・CONFIGURABLE・CALIBRATION・Design System Phase送り）。最終確定はオーナー確認後 |
