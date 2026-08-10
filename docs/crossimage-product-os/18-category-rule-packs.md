# 18. A8 Category Rule Pack設計（属性ベースRule Engine・20カテゴリー比較表）

| 項目 | 値 |
|---|---|
| Status | Draft |
| 版 | v0.1 |
| 日付 | 2026-08-10 |
| 作成エージェント | A8 |
| 準拠 | Governance Pack v2.0（特に §13 Category-Agnostic 2層アーキテクチャ / §14 言語設計ルール / §7 Versionルール） |

---

## 0. 本書の位置づけと設計原則

本書は、Category Rule Pack（カテゴリールールパック：商品分類ごとの質問・品質・法規・検品ルールをひとまとめにした設定データの束）と、それを読み込んで案件ごとの適用ルールを組み立てる Rule Engine（ルールエンジン：条件データを解釈して適用ルール一式を合成する仕組み）を設計する。

### 0.1 設計原則（Governance §13 の具体化）

1. **カテゴリー差は 100% データで表現する**。Layer 1（Universal Core：カテゴリーを知らない共通基盤）にカテゴリー名で分岐するコードを書くことを禁止する。「タンブラーなら」「家電なら」という条件式はコード上に存在してはならない。
2. **カテゴリー単独でルールを決めない**。適用ルールは常に次の合成式で決まる:
   `適用Ruleセット = f( Category + Product Attributes + Risk Attributes + Brand/Quality Tier )`
3. **Rule Pack はコードではなくデータである**ことを構造で保証する（§1.4）。実行可能なスクリプト欄・自由記述の条件式欄を持たせず、スキーマ検証（構造チェック：定義済みの型・語彙以外を登録時に拒否する仕組み）で担保する。
4. 本書に登場する具体商品（タンブラー・ウォーターサーバー等）は**すべて「例でありシステム仕様ではない」**（Governance §0-2）。
5. 未知カテゴリーは「受付不可」にしない（Governance §13）。属性ベースで暫定ルールを組み立て、人間補正を経て案件を進める（§6）。

### 0.2 用語（本書での初出定義）

- CTQ（重要品質特性：品質判断の重要基準）
- Quality Tier（品質等級：Q1_ESSENTIAL〜Q4_LUXURY の4段階品質レベル。Governance §4）
- AQL（抜取検査水準：ロットから何個抜き取り、不良を何個まで許容するかを定める国際的な検査基準）
- FIXED MINIMUM（絶対最低基準：安全・法令・重大機能に関わるため、Quality Tier では緩和できない基準。01番 §6）
- RFQ（見積依頼：工場に価格を依頼するプロセス）
- BOM（部品表：製品を構成する部品・材料の一覧）
- ODM（相手先ブランド設計製造：顧客ブランドで販売する商品の設計・製造受託）

---

## 1. Rule Pack データモデル

### 1.1 Pack 全体構造

1つの Category Rule Pack は「Packヘッダ + 9要素のルール集合」で構成する。全要素は共通の Rule Record（ルールレコード：1件のルールを表すデータ行）形式に載せ、要素ごとの固有フィールドを payload（本体データ：要素種別ごとの中身）として持つ。

```yaml
rule_pack:
  pack_id: RP-001                 # ID体系は §9 Governance変更提案-1 参照
  category_name: {ja: ドリンクウェア（断熱）, zh: 保温杯壶类, en: InsulatedDrinkware}
  version: V1                     # §7 Versionルール準拠（イミュータブル）
  status: DRAFT                   # §9 Governance変更提案-2 参照
  default_attributes: [ATTR_FOOD_CONTACT, ATTR_LIQUID_SEAL, ATTR_HIGH_TEMP]
                                  # 既定の属性タグ。案件ごとにAI推定+人間確定で上書き可
  owner_role: PM                  # Pack保守責任Role（Governance §8 正準キー）
  approved_by: {qa: QA, reg: REG, final: MGR}
  source_projects: [CI-2026-0001] # 根拠となった実案件ID（未知カテゴリー由来の場合）
  change_log: [...]
  rules:                          # 9要素 × Rule Record の配列
    - {rule_id: RP-001-RQ-01, element: REQUIRED_QUESTION, ...}
    - {rule_id: RP-001-CTQ-01, element: CTQ, ...}
```

### 1.2 Rule Record 共通フィールド（全9要素共通）

| フィールド | 型 | 説明 |
|---|---|---|
| rule_id | ID | `{PackID}-{要素略号}-{NN}`（要素略号: RQ/CTQ/RSK/REG/TST/QS/FQ/IT/PK） |
| element | enum | 9要素のいずれか（下記1.3） |
| condition | 限定DSL | 発火条件。DSL（限定記述言語：使える語彙を制限した宣言的な設定記述形式）で記述。**許可語彙は §1.4 のホワイトリストのみ** |
| priority_class | enum | `SAFETY / REGULATORY / FUNCTION / DURABILITY / APPEARANCE / SENSORY / LOGISTICS`（矛盾解決の優先順位キー。§2.4） |
| tier_scaling | 表 | Q1〜Q4 各Tierでの強度値（該当しない要素は `none`）。SAFETY/REGULATORY 行は全Tier同値（FIXED MINIMUM）であることをスキーマで強制 |
| payload | 構造体 | 要素別フィールド（§1.3）。スキーマ検証対象 |
| source | 文字列 | 根拠（法規名・実績案件ID・クレームID等） |
| notes_ja / notes_zh | 文字列 | 人間向け注記（表示用。§14言語ルール準拠の説明文） |

### 1.3 9要素の payload フィールド定義

#### (1) Required Questions（必須質問）

| フィールド | 説明 |
|---|---|
| question_class | `BLOCKER / IMPORTANT_LATER / OPTIONAL`（Governance §3 QuestionClass。新設なし） |
| question_text_ja | 顧客向け質問文（平易・専門用語なし。A2 §3.3 準拠） |
| reason_line | 質問理由の一行説明（例:「→ 数量で1個あたり価格が大きく変わるため」） |
| answer_format | `CHOICE / NUMBER / IMAGE / FREE_TEXT`（選択式優先。A2準拠） |
| choices | 選択肢リスト（CHOICE時） |
| target_spec_field | 回答を格納する SpecField（仕様項目：Field単位Status付の仕様データ）キー |
| default_value | 「わからない→おすすめ」選択時の既定値（`AI_SUGGESTED` で格納） |
| display_stage | 表示工程（`PROPOSAL / RFQ / SAMPLE / PRODUCTION`。Just-in-Time表示制御用） |

#### (2) CTQ（重要品質特性）

| フィールド | 説明 |
|---|---|
| ctq_name_ja / zh | CTQ名称（例: 保温性能 / 密閉性） |
| quality_dimension | `SAFETY / FUNCTIONAL / DURABILITY / APPEARANCE / SENSORY`（01番 §6 の5分類） |
| measurement_method | 測定方法（条件・器具・手順の参照） |
| target_value_by_tier | Q1〜Q4別の目標値（SAFETY次元は全Tier同値） |
| judgment_criteria | 合否判定基準 |
| related_test_ids | 対応する Test Plan の rule_id |
| defect_severity | 不適合時の Defect区分 `CRITICAL / MAJOR / MINOR`（Governance §3） |

#### (3) Risk

| フィールド | 説明 |
|---|---|
| risk_event_ja / zh | リスク事象（例: 真空不良による保温性能低下） |
| occur_stage | 発生工程（設計 / 材料 / 生産 / 検品 / 輸送 / 市場） |
| impact_class | 影響度 `CRITICAL / MAJOR / MINOR` + 影響先（CLIENT/TradingCompany/エンドユーザー） |
| prevention | 予防策（先行Task・工場適格要件・仕様指定への参照） |
| detection | 検知策（試験・検品項目への参照） |
| related_gate | 関係Gate（`G-xx`。なければ `none`） |

#### (4) Regulatory Candidates（適用法規候補）

| フィールド | 説明 |
|---|---|
| law_name_ja | 法規名（例: 食品衛生法） |
| applicability | `HIGH / CONDITIONAL / LOW`（A6 13番 §1.3 と同一語彙） |
| trigger_basis | 該当根拠（属性・材質・用途・訴求のどれに由来するか） |
| expert_check | `REQUIRED / RECOMMENDED / NOT_REQUIRED`（A6準拠） |
| doc_test_label_refs | 必要書類・試験・表示の候補参照 |
| notes | 備考。**本要素は候補提示のみ。最終判断は A6 Regulatory Engine + REG（法規担当）**（§8.3） |

#### (5) Test Plan

| フィールド | 説明 |
|---|---|
| test_name_ja / zh | 試験名（例: 落下試験 / 溶出試験） |
| stage | `SAMPLE / PILOT / MASS`（サンプル / 試作量産 / 量産） |
| method_ref | 方法・規格参照（JIS等の規格番号、社内手順書ID） |
| pass_criteria_by_tier | Tier別合格基準（SAFETY/REGULATORY起因の試験は全Tier同値） |
| test_body | 実施主体 `IN_HOUSE / FACTORY / THIRD_PARTY`（自社 / 工場 / 第三者機関） |
| lt_cost_range | 所要期間・費用レンジ（見積・納期計画に反映） |
| sampling | `ALL / SAMPLING`（全数 / 抜取。抜取時はAQL値参照） |

#### (6) Quality Standard

| フィールド | 説明 |
|---|---|
| target | 対象（外観 A/B/C Surface（見え面等級：よく見える面A〜通常見えない面C） / 機能 / 寸法 / 表示） |
| criteria_by_tier | Q1〜Q4別基準値（外観: 欠陥種×最大サイズ×最大数×検査距離・照明。01番 §6 の外観基準構造） |
| aql_by_tier | Tier別AQL値（CRITICAL不良は全Tierで AQL 0＝1個も許容しない） |
| limit_sample_required | 限度見本（外観許容限度の現物見本）要否（Tier・BrandImpact連動） |
| measurement_condition | 測定条件（距離・照明・治具） |

#### (7) Factory Qualification（工場適格要件）

| フィールド | 説明 |
|---|---|
| req_type | `EQUIPMENT / CERTIFICATION / PROCESS_CONTROL / TRACK_RECORD`（設備 / 認証 / 工程管理 / 実績） |
| requirement_ja / zh | 要件内容（例: 真空引き設備保有 / 食品グレード材のロット管理） |
| mandatory_by_tier | Tier・ProductRisk別の 必須/推奨 区分（SAFETY起因は全条件で必須） |
| verify_method | 確認方法 `DOCUMENT / AUDIT / SAMPLE_EVAL`（書類 / 工場監査（FA-xxxx-AUD参照）/ サンプル評価） |
| rfq_requirement | RFQ段階で工場に要求する書類（A6 13番 §3.6 形式と接続） |

#### (8) Inspection Template（検品テンプレート）

| フィールド | 説明 |
|---|---|
| inspection_stage | `IPQC（工程内検査：生産途中で行う検査） / FIRST_ARTICLE（首件：量産初品確認） / PRE_SHIPMENT（出荷検品）` |
| check_item_ja / zh | 検査項目（中国語併記必須。工場向け出力に使用） |
| method | 検査方法（目視 / 計測 / 通電 / 漏れ等） |
| sampling_ref | サンプリング（Quality Standard の aql_by_tier を参照） |
| severity_mapping | 不適合時の `CRITICAL / MAJOR / MINOR` 割当 |
| photo_required | 証跡写真要否・枚数 |

#### (9) Packaging Requirement

| フィールド | 説明 |
|---|---|
| pack_level | `UNIT / INNER / OUTER / PALLET`（個装 / 内箱 / 外箱 / パレット） |
| requirement_ja / zh | 要件（緩衝・防湿・向き指定・積段数上限等） |
| transport_test | 輸送試験参照（ISTA（国際輸送包装試験規格：輸送中の落下・振動・圧縮を模擬する試験規格）等） |
| label_requirement | 表示要件（取扱注意・電池マーク・原産国等。法規表示は Regulatory Candidates と連動） |
| special_flags | 特殊要件フラグ（大型 / 液体 / 電池内蔵 / 危険品該当可能性） |

### 1.4 「データでありコードではない」ことの構造的保証

| 保証手段 | 内容 |
|---|---|
| 条件式のホワイトリストDSL | condition に書ける語彙は次のみ: `ATTR_*`（Governance §13 の13属性）/ Quality Tier（`Q1_ESSENTIAL`〜`Q4_LUXURY`）/ ProductRisk（`PRISK_*`）/ OdmLevel（`ODM_*`）/ BrandImpact（`BIMP_*`）/ 論理結合 `AND / OR / NOT` / 定数比較（payload内の数値項目に対する `>= <= =` のみ）。**関数呼び出し・スクリプト・カテゴリー名の直書きは記述不可**（カテゴリー適用は pack_id の帰属で表現され、条件式には現れない） |
| スキーマ検証 | Pack登録時に全 Rule Record を JSONスキーマ（データ構造の型定義）で検証。未知フィールド・未知語彙・enum外の値は登録拒否 |
| FIXED MINIMUM 構造強制 | priority_class が `SAFETY / REGULATORY` の Rule は tier_scaling の4値が同一でなければ登録拒否（「Tierで安全を緩和する設定」を作れない） |
| 実行系の単一性 | Rule Engine（Layer 1）は全カテゴリーで同一バイナリ・同一評価順序（§2）。Pack差し替えで挙動が変わるのはデータの差のみ |
| 表示文の同梱 | notes_ja / question_text_ja 等の表示文は Pack 内データ。コード内に文言を持たない（§14 言語ルールの適用は 19番 Glossary と連携） |

---

## 2. Rule Engine 評価順序（評価パイプライン）

### 2.1 パイプライン全体（ステップ表）

| Step | 名称 | 入力 | 処理 | 出力 |
|---|---|---|---|---|
| (a) | Category Pack 読込 | Category（AI推定→人間確定） | 該当 pack_id の最新 APPROVED 版を読込。**不在なら §6 未知カテゴリーフローへ分岐（エラー停止は禁止）** | ベースRuleセット + default_attributes |
| (b) | 属性ルール追加 | Product Attributes + Risk Attributes（`ATTR_*`、AI_SUGGESTED→CONFIRMED） | 確定・推定済みの各属性について §3 の属性ルールセット（AR-*）を追加。default_attributes と案件個別属性の和集合で評価 | 拡張Ruleセット |
| (c) | Tier 強度調整 | Quality Tier（Q1〜Q4）+ BrandImpact | 各Ruleの tier_scaling から該当Tier列の値を選択（§2.3）。SAFETY/REGULATORY は全Tier同値のため実質無変換 | 強度確定Ruleセット |
| (d) | マージ・重複排除・矛盾解決 | (c)の全Rule | topic_key（対象キー：同じ事柄を指すルールを束ねる正規化キー。例: 対象SpecField / 試験方法+stage / 検査項目）単位で統合。矛盾は §2.4 の決定表で解決 | 正規化Ruleセット |
| (e) | 出力 | (d)の結果 | 消費エンジン別ビューに分割出力（§2.5） | 質問リスト / CTQリスト / 試験計画 / 検品計画 / 法規候補 / 工場適格要件 / 包装要件 |

- 再評価トリガー: Category変更 / 属性の追加・確定 / Quality Tier・DNA変更 / Pack新版承認。再評価は差分適用（既に DONE のTaskは維持。A1 §4 と同思想）。
- 属性が `AI_SUGGESTED` のままでも Soft Gate 範囲は進行可（Governance §4 のDNA運用と同じ）。ただし安全・法規系Ruleは推定属性でも先行発火する（見落とし防止優先。A6 の「UNKNOWNは保守側判定」と整合）。

### 2.2 Step(b) 属性追加の評価規則（ルール表）

| # | 規則 |
|---|---|
| B-1 | 属性ルールは加算のみ（属性が付くとルールが増える）。属性によってベースPackのルールを削除・緩和することは構造上できない |
| B-2 | 属性の重複（Pack既定と案件個別が同一属性）は1回だけ評価（冪等） |
| B-3 | 属性 `AI_SUGGESTED` 状態で発火した SAFETY/REGULATORY 系Ruleには「属性未確定」フラグを付け、人間確定質問を Required Questions に自動追加する |
| B-4 | 属性を人間が「非該当」と確定した場合、その属性由来Ruleは除去する（除去理由・承認者を AuditLog に記録） |

### 2.3 Step(c) Tier 強度調整（決定表・代表項目）

| 調整対象 | Q1_ESSENTIAL | Q2_STANDARD | Q3_PREMIUM | Q4_LUXURY |
|---|---|---|---|---|
| 外観AQL（MAJOR） | 4.0 | 2.5 | 1.5 | 1.0 |
| 外観AQL（MINOR） | 6.5 | 4.0 | 2.5 | 1.5 |
| CRITICAL不良 | 0（全Tier共通・FIXED MINIMUM） | 0 | 0 | 0 |
| 外観検査距離/時間 | 60cm/3秒 | 45cm/5秒 | 30cm/5秒 | 30cm/10秒 |
| 限度見本 | 不要 | 推奨 | 必須 | 必須+A面写真基準 |
| 耐久試験サイクル数 | 基準×1.0 | ×1.0 | ×1.5 | ×2.0 |
| 安全・法規試験 | 全Tier同一（緩和禁止） | 同左 | 同左 | 同左 |
| 首件・試作量産 | ODM/Risk条件次第 | 同左 | 必須 | 必須 |

※数値は初期既定値の例。正式な外観基準・AQL体系は 16番（A4 Quality設計）を正とし、本Engineは A4 の値をデータとして参照する。

### 2.4 Step(d) 矛盾解決（決定表）

| 競合の種類 | 判定キー | 解決規則 |
|---|---|---|
| SAFETY / REGULATORY 系で同一 topic_key に基準値相違 | topic_key | **常に最も厳しい方を採用**（Tier・カテゴリー既定より属性由来の厳格値が優先されうる）。緩和方向の上書きは構造上不可（§1.4） |
| APPEARANCE / SENSORY 系の基準相違 | topic_key | **Quality Tier 準拠の値を採用**（Tier列の値が正。Pack間で差があれば厳しい方） |
| FUNCTION / DURABILITY 系の相違 | topic_key | Tier準拠。ただし当該CTQが SAFETY 次元に連関（defect_severity=CRITICAL）する場合は SAFETY 扱い＝厳しい方 |
| 質問の重複（同一 target_spec_field） | target_spec_field | 1問に統合。question_class は厳しい方（BLOCKER > IMPORTANT_LATER > OPTIONAL）。文言はベースPack優先 |
| 試験の重複（同一 method+stage） | method+stage | 1試験に統合。合格基準は厳しい方。費用・LTは統合後1回分 |
| 検品項目の重複 | check_item | 1項目に統合。severity は厳しい方、サンプリングは厳しい方 |
| 両立不能の完全矛盾（例: 包装要件同士が物理的に両立しない） | — | 自動採用せず、当該Ruleペアを `REVIEW_REQUIRED` 相当として PM/QA/REG に提示（人間裁定→AuditLog記録） |

### 2.5 Step(e) 出力ビュー

| 出力ビュー | 内容 | 主な消費者（§8） |
|---|---|---|
| QuestionList | 統合済み Required Questions（class・工程・既定値付） | A2 Minimum Question / A1 Task Generator |
| CtqList | 統合済みCTQ + Tier確定目標値 | A4 Quality Reco Engine / QualityStandard生成 |
| TestPlanView | stage別試験計画（費用・LT付） | A1 Task Generator（試験Task生成）/ RFQ添付 |
| InspectionPlanView | 検品計画（IPQC/首件/出荷検品、中国語併記） | A5 中国側Task / InspectionPlan |
| RegulatoryCandidateView | 法規候補 + 根拠 + expert_check | A6 Regulatory Engine（入力候補） |
| FactoryQualView | 工場適格要件 + RFQ要求書類 | Factory Score Engine / RFQ生成 |
| PackagingView | 包装・物流要件 + 輸送試験 | LOGI系Task / 中国語仕様書 |

---

## 3. 属性タグ → ルール マッピング表（正準13属性・全属性）

各属性は属性ルールセット `AR-{属性略号}` を持ち、Step(b) で加算される。**1属性1行**。表中の項目は各属性ルールセットの代表Rule（初期テンプレート）であり、詳細は Pack データとして版管理する。

| 属性 | 発火する追加質問（例） | 追加法規候補 | 追加試験 | 追加検品ポイント | 追加包装・物流要件 | Factory適格要件 |
|---|---|---|---|---|---|---|
| ATTR_ELECTRIC（電気を使う） | 電源方式（AC/USB/電池）/ 使用国 / 定格 | 電気用品安全法（PSE：電気製品の安全規制）/ 電気設備の技術基準 | 絶縁耐圧 / 通電エージング / 温度上昇 / 異常時試験 | 全数通電 / 定格銘板表示 / コード・プラグ外観 | 静電・防湿包装 / 取説同梱確認 | 電安対応の生産・検査設備 / 型式区分の理解 / 通電検査ライン |
| ATTR_FOOD_CONTACT（食品・飲料に触れる） | 接触部材質 / 飲食物の種類・温度 / 電子レンジ・食洗機使用 | 食品衛生法（器具・容器包装、ポジティブリスト）/ 家庭用品品質表示法 | 溶出試験 / 材質試験 / 匂い・味移り官能 | 接触面の傷・異物・洗浄残り / 材質証明ロット照合 | 清潔包装（内袋）/ 防塵 | 食品グレード材の調達・ロット管理 / 洗浄工程 / 材質証明書発行能力 |
| ATTR_CHILD_USE（子供が使う） | 対象年齢 / 口に入る可能性 / 小部品の有無 | 食品衛生法（玩具規制）/ ST基準（玩具安全基準：業界の任意安全基準）/ 消費生活用製品安全法 | 小部品（誤飲）/ 鋭利端部 / 有害物質（重金属・フタル酸）/ 引張・トルク | 小部品脱落 / バリ・鋭利部 / 塗膜密着 | 誤飲警告表示 / 袋の窒息警告 | 玩具・子供用品の製造実績 / 有害物質管理 / 塗料ロット管理 |
| ATTR_LOAD_BEARING（荷重がかかる） | 最大想定荷重 / 使用者体重レンジ / 静的か動的か | 消費生活用製品安全法（該当品目の場合）/ 製造物責任法（PL：製造物の欠陥責任）留意 | 静荷重 / 動荷重・繰返し / 転倒安定性 / 疲労 | 溶接・接合部 / 締結トルク / ガタつき | 重量表示 / 組立部品の欠品防止（個数検査） | 構造計算・強度試験設備 / 溶接品質管理 / 治具管理 |
| ATTR_WATER（水を使う・水漏れリスク） | 使用水量 / 接液部位 / 防水等級の要否 | 水道法関連（給水器具の場合）/ 電安法（水×電気の複合時） | 漏水 / 防水等級（IPX）/ 接液部衛生 / カビ・水垢想定 | 全数または抜取の漏水検査 / シール部組付 | 残水乾燥後梱包 / 防湿 | シール・防水構造の実績 / 漏水検査設備 |
| ATTR_HIGH_TEMP（高温になる・加熱する） | 最高到達温度 / 連続使用時間 / 外面接触の可能性 | 電安法（発熱機器区分）/ 家庭用品品質表示法 | 温度上昇 / 断熱性能 / 耐熱変形 / 空焚き等異常時 | 断熱部組付 / 高温警告表示 / 温度ヒューズ実装 | 耐熱緩衝材 / 高温注意表示 | 温度試験設備 / 安全装置（ヒューズ・サーモ）の実装検査 |
| ATTR_LIQUID_SEAL（液体の密閉が必要） | 密閉対象（飲料・化粧品等）/ 携帯姿勢 / 逆さ使用 | 食品衛生法（内容物が飲食物の場合）※密閉自体は品質要件が主 | 漏れ（倒立・振動・温度差加圧）/ パッキン耐久・着脱 | 漏れ検査（全数推奨）/ パッキン装着・異物 | 液体輸送姿勢指定 / 内袋 | パッキン金型・材料管理 / 漏れ検査治具 |
| ATTR_BATTERY（バッテリー内蔵） | 電池種類・容量 / 充電方式 / 交換可否 | 電安法（リチウムイオン蓄電池）/ UN38.3（リチウム電池輸送試験：空輸・海運に必須の国連試験）/ 資源有効利用促進法（表示） | 充放電サイクル / 過充電・過放電・短絡 / UN38.3 | セルメーカー・ロット照合 / 膨れ・液漏れ / 充電動作 | 危険物輸送区分の確認（IATA/IMDG）/ 電池マーク表示 / SOC（充電残量）30%以下輸送 | セル調達先の管理 / 保護回路検査設備 / UN38.3取得支援能力 |
| ATTR_WIRELESS（無線通信機能） | 通信方式（BT/Wi-Fi）/ 使用国 / モジュールの技適有無 | 電波法（技適：技術基準適合証明。未取得品の国内使用は違法）/ 電気通信事業法（回線接続時） | 通信接続 / ペアリング / 干渉・距離 | 技適マーク表示 / モジュールロット照合 / 通信全数チェック | 技適表示の同梱物確認 | 技適取得済モジュール調達 / RF検査環境 / ファーム管理 |
| ATTR_SKIN_CONTACT（人体に長時間触れる） | 接触部位・時間 / 対象者（敏感肌・子供）/ 金属アレルギー配慮 | 有害物質含有家庭用品規制法 / 家庭用品品質表示法（繊維等）| 有害物質（ホルムアルデヒド・ニッケル溶出・アゾ染料）/ 皮膚刺激性（必要時） | 縫製・エッジ仕上げ / 金属部メッキ品質 / 匂い | 清潔包装 / 材質表示 | 対象物質の材料管理 / メッキ・染色工程の管理能力 |
| ATTR_BULKY（大型・重量物） | 完成品サイズ・重量 / 組立式か完成品か / 搬入経路 | 特になし（物流・表示要件が主） | 輸送試験（ISTA）/ 組立検証 / 梱包落下 | 梱包内容物・部品個数 / 傷（大面積A面） | パレット設計 / 積段数・天地無用 / 2人作業表示 / 容積重量とコンテナ効率 | 大型品の梱包設計能力 / 出荷ヤード / 積込立会（装柜监督）対応 |
| ATTR_OUTDOOR（屋外・耐候使用） | 使用環境（直射日光・雨・海辺）/ 想定使用年数 | 特になし（訴求表現は景品表示法（不当表示の規制）チェック） | 耐候（UV）/ 防錆・塩水噴霧 / 防水 / 温度サイクル | 塗装・コーティング膜厚 / 錆・異種金属接触 | 防湿 / 屋外保管不可表示 | 耐候材料・表面処理の実績 / 塩水噴霧等試験設備または外部委託 |
| ATTR_SHARP_EDGE（鋭利部・挟み込みリスク） | 刃・可動部の有無 / 使用者（子供含むか）/ ロック機構 | 消費生活用製品安全法（該当品目）/ PL留意 | 鋭利端部試験 / 挟み込み・ロック機構耐久 / 刃部硬度 | バリ・エッジ処理 / 保護カバー装着 / 可動部動作 | 刃部保護材 / 開封時注意表示 / 輸出入時の刃物該当性確認 | エッジ処理（面取り）工程 / 安全カバー組付検査 |

※ ATTR_CHILD_USE と他属性の併発（例: ATTR_CHILD_USE × ATTR_BATTERY）は、電池フタのネジ止め要求等の複合Ruleを持つ。複合Ruleも condition に `ATTR_A AND ATTR_B` と書くデータであり、コード分岐ではない。

---

## 4. ★20カテゴリー比較表（10軸ミニ表）

> **共通注記（全カテゴリー適用）**: 以下の各表は**初期テンプレート（Pack V1のたたき台）であり、実案件では属性タグとQuality Tierで個別合成される**（§2）。記載の法規はすべて「候補」であり最終判断はREG（A6準拠）。具体的商品名・数値は例でありシステム仕様ではない。
>
> 10軸: ①Intake Questions（初回質問）②Must・Want・Optional（仕様の必須/推奨/任意）③Typical CTQ ④Common Defects（頻出不良）⑤Regulatory Candidates ⑥Factory Capability（工場能力要件）⑦Sample Tests ⑧Mass Production Tests ⑨Inspection Points（検品ポイント）⑩Packaging Risks（包装リスク）

### 4.1 CAT-001 ドリンクウェア（断熱）
デフォルト属性: `ATTR_FOOD_CONTACT / ATTR_LIQUID_SEAL / ATTR_HIGH_TEMP`

| 軸 | 内容 |
|---|---|
| ①Intake | 容量 / 保温・保冷目標 / フタ形式 / 印刷・刻印の有無 |
| ②M・W・O | Must: 材質・容量・食品衛生適合 / Want: 保温時間・重量 / Optional: 付属品・カラバリ |
| ③CTQ | 保温保冷性能 / 密閉性 / 溶出安全 / 塗装・印刷密着 |
| ④Defects | 漏れ / 真空不良 / 印刷剥がれ / 溶接ビード不良 / 凹み |
| ⑤Regulatory | 食品衛生法 / 家庭用品品質表示法 / 景品表示法（保温訴求） |
| ⑥Factory | 真空引き設備 / 食品グレードSUS管理 / 溶接・研磨品質 |
| ⑦Sample Tests | 保温試験 / 倒立漏れ / 落下 / 溶出 / 食洗機耐性 |
| ⑧Mass Tests | 漏れ全数or抜取 / 保温抜取 / ロット溶出（初回・材料変更時） |
| ⑨Inspection | 漏れ / A面外観 / 印刷位置 / パッキン装着 / 表示ラベル |
| ⑩Pkg Risks | 凹み・傷 / 個装潰れ / 匂い移り / 表示欠落 |

※初期テンプレート。実案件では属性×Tierで個別合成（§2）。

### 4.2 CAT-002 キッチン雑貨（食品接触）
デフォルト属性: `ATTR_FOOD_CONTACT`（＋刃物系は `ATTR_SHARP_EDGE`、耐熱系は `ATTR_HIGH_TEMP` を案件で付与）

| 軸 | 内容 |
|---|---|
| ①Intake | 用途（調理/保存/食卓）/ 材質希望 / 耐熱・レンジ・食洗機要否 |
| ②M・W・O | Must: 接触材質・耐熱温度 / Want: サイズ・重量 / Optional: デザイン・スタッキング |
| ③CTQ | 溶出安全 / 耐熱変形 / 割れ・欠け強度 / 匂い移り |
| ④Defects | バリ / 変形 / 異物混入 / 匂い残り / 印刷不良 |
| ⑤Regulatory | 食品衛生法（ポジティブリスト） / 家庭用品品質表示法 |
| ⑥Factory | 食品グレード樹脂・竹木の管理 / 成形条件管理 / 洗浄工程 |
| ⑦Sample Tests | 溶出 / 耐熱・耐冷 / レンジ・食洗機 / 落下 |
| ⑧Mass Tests | ロット溶出（材料変更時）/ 寸法抜取 / 耐熱抜取 |
| ⑨Inspection | 異物・バリ / 接触面外観 / 表示（材質・耐熱温度） |
| ⑩Pkg Risks | 割れ欠け / 湿気（竹木のカビ）/ 個装汚れ |

※初期テンプレート。実案件では属性×Tierで個別合成（§2）。

### 4.3 CAT-003 家具（荷重・大型）
デフォルト属性: `ATTR_LOAD_BEARING / ATTR_BULKY`

| 軸 | 内容 |
|---|---|
| ①Intake | 種類（椅子/棚/机）/ 最大荷重 / 組立式か / 搬入制約 |
| ②M・W・O | Must: 耐荷重・構造安全・サイズ / Want: 材質・仕上げ / Optional: 付加機能 |
| ③CTQ | 静的耐荷重 / 転倒安定性 / 接合部強度 / ぐらつき |
| ④Defects | ガタつき / ネジ穴不良 / 部品欠品 / 塗装ムラ / 輸送破損 |
| ⑤Regulatory | 消費生活用製品安全法（該当品目確認）/ 家庭用品品質表示法 / ホルムアルデヒド関連（有害物質含有家庭用品規制法） |
| ⑥Factory | 強度試験設備 / 木工・金属加工精度 / 梱包設計能力 |
| ⑦Sample Tests | 静荷重・動荷重 / 転倒 / 組立検証 / ISTA輸送 |
| ⑧Mass Tests | 荷重抜取 / 組立部品個数全数 / 輸送梱包ロット確認 |
| ⑨Inspection | 接合・溶接部 / 部品個数 / 説明書 / 大面積A面傷 |
| ⑩Pkg Risks | 角潰れ / 部品欠品 / 容積過大（運賃）/ 天地誤り |

※初期テンプレート。実案件では属性×Tierで個別合成（§2）。

### 4.4 CAT-004 電動昇降デスク
デフォルト属性: `ATTR_ELECTRIC / ATTR_LOAD_BEARING / ATTR_BULKY / ATTR_SHARP_EDGE`（挟み込み）

| 軸 | 内容 |
|---|---|
| ①Intake | 昇降範囲 / 耐荷重 / 天板サイズ・材質 / 障害物検知要否 |
| ②M・W・O | Must: 電気安全・耐荷重・昇降機構 / Want: 速度・静音・メモリ機能 / Optional: 配線トレー・USB |
| ③CTQ | 昇降耐久 / 挟み込み安全（障害物検知）/ モーター静音 / 天板水平 |
| ④Defects | 昇降不良・左右差 / 異音 / コントローラー不具合 / 天板傷 |
| ⑤Regulatory | 電気用品安全法（ACアダプタ等）/ 消費生活用製品安全法留意 / PL留意 |
| ⑥Factory | モーター・制御基板の調達管理 / 耐久試験機 / 通電検査ライン |
| ⑦Sample Tests | 昇降サイクル耐久 / 満載荷重昇降 / 障害物検知 / 絶縁耐圧 |
| ⑧Mass Tests | 全数昇降動作 / 通電・絶縁抜取 / 異音官能抜取 |
| ⑨Inspection | 動作・異音 / 配線処理 / 銘板表示 / 天板外観 / 部品個数 |
| ⑩Pkg Risks | 重量物落下 / 天板角潰れ / モーター部衝撃 / 2人作業表示欠落 |

※初期テンプレート。実案件では属性×Tierで個別合成（§2）。

### 4.5 CAT-005 小型家電（調理）
デフォルト属性: `ATTR_ELECTRIC / ATTR_FOOD_CONTACT / ATTR_HIGH_TEMP`（水使用機は `ATTR_WATER` 付与）

| 軸 | 内容 |
|---|---|
| ①Intake | 機能（加熱方式）/ 容量 / 使用電圧・国 / 接触部材質 |
| ②M・W・O | Must: 電気安全・食品接触材質・温度制御 / Want: 消費電力・容量 / Optional: レシピ・アプリ |
| ③CTQ | 温度制御精度 / 電気安全（絶縁・温度上昇）/ 溶出安全 / 空焚き保護 |
| ④Defects | 温度不良 / コーティング剥がれ / 異音・異臭 / コード不良 |
| ⑤Regulatory | 電気用品安全法（PSE）/ 食品衛生法 / 家庭用品品質表示法 / 景品表示法（調理性能訴求） |
| ⑥Factory | PSE対応工場（型式区分理解）/ 通電・耐圧検査ライン / 食品グレード材管理 |
| ⑦Sample Tests | 温度上昇 / 絶縁耐圧 / 異常時（空焚き）/ 溶出 / 寿命 |
| ⑧Mass Tests | 全数通電・耐圧 / 温度抜取 / ロット溶出（初回） |
| ⑨Inspection | 通電動作 / 銘板・警告表示 / 接触面外観 / コード・プラグ |
| ⑩Pkg Risks | ガラス部破損 / 付属品欠品 / 取説・保証書欠落 |

※初期テンプレート。実案件では属性×Tierで個別合成（§2）。

### 4.6 CAT-006 小型家電（美容）
デフォルト属性: `ATTR_ELECTRIC / ATTR_SKIN_CONTACT`（充電式は `ATTR_BATTERY`、防水品は `ATTR_WATER` 付与）

| 軸 | 内容 |
|---|---|
| ①Intake | 部位・用途 / 温熱・振動等の作用 / 防水要否 / 充電方式 |
| ②M・W・O | Must: 電気安全・肌接触材質・温度上限 / Want: 稼働時間・重量 / Optional: モード数・ケース |
| ③CTQ | 肌接触部の温度安全 / 材質安全（ニッケル等）/ 防水等級 / 振動・出力安定 |
| ④Defects | 発熱異常 / 充電不良 / 異音 / メッキ不良 / ボタン不良 |
| ⑤Regulatory | 電気用品安全法 / 薬機法（医療機器該当性の確認：効能訴求次第で該当）/ 景品表示法（効果訴求） |
| ⑥Factory | 肌接触材料の管理 / 防水組立・検査 / 充電回路検査 |
| ⑦Sample Tests | 温度上昇 / 皮膚接触部材質 / 防水（IPX）/ 充放電 / 落下 |
| ⑧Mass Tests | 全数動作・充電 / 防水抜取 / 温度抜取 |
| ⑨Inspection | 動作・発熱 / 肌接触面の仕上げ / 表示（医療機器と誤認させない表現） |
| ⑩Pkg Risks | 電池輸送区分 / 化粧箱潰れ（ギフト性）/ 訴求表現の刷り込み誤り |

※初期テンプレート。実案件では属性×Tierで個別合成（§2）。

### 4.7 CAT-007 無線ガジェット（BT/Wi-Fi）
デフォルト属性: `ATTR_ELECTRIC / ATTR_WIRELESS / ATTR_BATTERY`

| 軸 | 内容 |
|---|---|
| ①Intake | 通信方式 / 対応機器・OS / モジュール技適有無 / アプリ要否 |
| ②M・W・O | Must: 技適・接続安定 / Want: 通信距離・電池持ち / Optional: アプリ機能・多台数接続 |
| ③CTQ | 接続安定性 / ペアリング成功率 / 電池持続 / ファーム品質 |
| ④Defects | 接続切れ / ペアリング不良 / 充電不良 / ファームバグ |
| ⑤Regulatory | 電波法（技適）/ 電気用品安全法（充電器側）/ UN38.3（電池） |
| ⑥Factory | 技適取得済モジュール調達 / RF検査環境 / ファームウェア版管理 |
| ⑦Sample Tests | 接続・距離 / 干渉環境 / 充放電 / 落下 / OS別互換 |
| ⑧Mass Tests | 全数通信チェック / ファーム版全数照合 / 充電抜取 |
| ⑨Inspection | 技適マーク表示 / 通信動作 / 付属ケーブル / シリアル管理 |
| ⑩Pkg Risks | 電池輸送区分 / 技適表示欠落 / ブリスター破損 |

※初期テンプレート。実案件では属性×Tierで個別合成（§2）。

### 4.8 CAT-008 モバイルバッテリー機器
デフォルト属性: `ATTR_ELECTRIC / ATTR_BATTERY`

| 軸 | 内容 |
|---|---|
| ①Intake | 容量（mAh）/ 出力ポート・急速充電規格 / セルメーカー指定 |
| ②M・W・O | Must: PSE（リチウムイオン蓄電池）・保護回路 / Want: 容量実測値・サイズ / Optional: ケーブル内蔵・表示 |
| ③CTQ | 過充電・過放電・短絡保護 / 容量実測 / 発熱 / 外装強度 |
| ④Defects | 容量偽装（実測不足）/ 発熱 / 膨れ / ポート接触不良 |
| ⑤Regulatory | 電気用品安全法（PSE丸・届出）/ UN38.3 / 資源有効利用促進法（リサイクルマーク）/ 景品表示法（容量訴求） |
| ⑥Factory | PSE届出対応 / セル調達先の信頼性 / 保護回路全数検査設備 |
| ⑦Sample Tests | UN38.3確認 / 過充放電・短絡 / 容量実測 / 落下 / 高温放置 |
| ⑧Mass Tests | 全数充放電・保護動作 / 容量抜取実測 / セルロット照合 |
| ⑨Inspection | PSE表示・事業者名 / 容量表記と実測の整合 / 膨れ・傷 |
| ⑩Pkg Risks | 危険物輸送（IATA/IMDG区分）/ SOC30%管理 / 電池マーク欠落 |

※初期テンプレート。実案件では属性×Tierで個別合成（§2）。

### 4.9 CAT-009 照明器具
デフォルト属性: `ATTR_ELECTRIC / ATTR_HIGH_TEMP`（屋外用は `ATTR_OUTDOOR / ATTR_WATER` 付与）

| 軸 | 内容 |
|---|---|
| ①Intake | 設置場所（卓上/天井/屋外）/ 電源方式 / 明るさ・色温度 / 調光要否 |
| ②M・W・O | Must: 電気安全・光源仕様 / Want: 演色性・寿命 / Optional: 調光調色・リモコン |
| ③CTQ | 電気安全（絶縁）/ 光束・色温度の均一性 / フリッカー / 放熱 |
| ④Defects | 点灯不良 / ちらつき / 色ムラ / 異音（電源部）/ 樹脂黄変 |
| ⑤Regulatory | 電気用品安全法（LED電灯器具等）/ 電波法（リモコン無線時）/ 景品表示法（明るさ・寿命訴求） |
| ⑥Factory | LED・電源の調達管理 / 光学測定設備 / 通電エージング |
| ⑦Sample Tests | 絶縁耐圧 / 光束・色温度実測 / 温度上昇 / 寿命加速 / 点滅耐久 |
| ⑧Mass Tests | 全数点灯 / エージング抜取 / 色温度抜取 |
| ⑨Inspection | 点灯・ちらつき / 銘板 / レンズ・シェード外観 / 配線 |
| ⑩Pkg Risks | ガラス・シェード破損 / 光源部衝撃 / 取付部品欠品 |

※初期テンプレート。実案件では属性×Tierで個別合成（§2）。

### 4.10 CAT-010 玩具・子供用品
デフォルト属性: `ATTR_CHILD_USE`（電動玩具は `ATTR_ELECTRIC / ATTR_BATTERY` 付与）

| 軸 | 内容 |
|---|---|
| ①Intake | 対象年齢 / 口に入るサイズか / 電動か / 塗装の有無 |
| ②M・W・O | Must: 対象年齢別安全（小部品・有害物質）/ Want: 耐久・洗浄可否 / Optional: パッケージ演出 |
| ③CTQ | 誤飲防止（小部品）/ 有害物質不検出 / 鋭利部なし / 強度（引張・落下） |
| ④Defects | 小部品脱落 / バリ / 塗膜剥がれ / 縫製破れ（ぬいぐるみ） |
| ⑤Regulatory | 食品衛生法（乳幼児玩具規制）/ ST基準（任意）/ 消費生活用製品安全法 |
| ⑥Factory | 玩具製造実績（ICTI等監査歴）/ 塗料・材料の有害物質管理 / 金型バリ管理 |
| ⑦Sample Tests | 小部品・鋭利端部 / 重金属・フタル酸 / 引張・トルク / 落下 |
| ⑧Mass Tests | 有害物質ロット試験 / 引張抜取 / 目視全数（バリ） |
| ⑨Inspection | 小部品・バリ / 対象年齢・警告表示 / 縫製・接着強度 |
| ⑩Pkg Risks | 袋の窒息警告欠落 / 誤飲警告欠落 / 個装の尖り |

※初期テンプレート。実案件では属性×Tierで個別合成（§2）。

### 4.11 CAT-011 ベビー用品
デフォルト属性: `ATTR_CHILD_USE / ATTR_SKIN_CONTACT`（哺乳・食事系は `ATTR_FOOD_CONTACT`、チェア等は `ATTR_LOAD_BEARING` 付与）

| 軸 | 内容 |
|---|---|
| ①Intake | 月齢 / 用途（食事/寝具/移動）/ 消毒方法（煮沸・レンジ） |
| ②M・W・O | Must: 月齢別安全・材質安全・消毒耐性 / Want: 軽量・洗いやすさ / Optional: デザイン |
| ③CTQ | 有害物質不検出 / 誤飲・窒息防止 / 消毒耐久 / 落下・転倒安全 |
| ④Defects | 変形（消毒後）/ 部品脱落 / 縫製不良 / 匂い |
| ⑤Regulatory | 食品衛生法（乳幼児向け器具・玩具）/ 有害物質含有家庭用品規制法 / 消費生活用製品安全法 |
| ⑥Factory | ベビー用品製造実績 / クリーン度の高い組立環境 / 材料証明書管理 |
| ⑦Sample Tests | 溶出・有害物質 / 煮沸・レンジ消毒繰返し / 誤飲形状 / 強度 |
| ⑧Mass Tests | ロット溶出 / 消毒耐久抜取 / 目視全数 |
| ⑨Inspection | 異物・バリ / 部品固着 / 月齢・警告表示 / 清潔包装 |
| ⑩Pkg Risks | 衛生（内袋必須）/ 警告表示欠落 / 潰れによる形状不良 |

※初期テンプレート。実案件では属性×Tierで個別合成（§2）。

### 4.12 CAT-012 アパレル
デフォルト属性: `ATTR_SKIN_CONTACT`（子供服は `ATTR_CHILD_USE` 付与）

| 軸 | 内容 |
|---|---|
| ①Intake | アイテム・サイズ展開 / 生地（素材・混率）/ プリント・刺繍 / 洗濯想定 |
| ②M・W・O | Must: 混率表示・ホルムアルデヒド適合 / Want: 縫製仕様・色堅牢度 / Optional: 付属（タグ・刺繍） |
| ③CTQ | 寸法精度 / 色堅牢度（洗濯・摩擦）/ 縫製強度 / 混率整合 |
| ④Defects | 寸法ズレ / 色ブレ（ロット間）/ 縫製不良 / プリント剥がれ / 汚れ |
| ⑤Regulatory | 家庭用品品質表示法（繊維製品）/ 有害物質含有家庭用品規制法（ホルムアルデヒド等）/ 景品表示法（機能訴求） |
| ⑥Factory | 縫製工程管理 / 生地検反 / 検針設備（針混入防止） |
| ⑦Sample Tests | 寸法 / 色堅牢度 / 洗濯収縮 / ホルムアルデヒド / 引裂・破裂 |
| ⑧Mass Tests | 検針全数 / 寸法抜取 / 色ブレロット比較 |
| ⑨Inspection | 縫製・汚れ / 洗濯表示・混率タグ / サイズ仕分け / 針検出 |
| ⑩Pkg Risks | 湿気・カビ / 折りシワ / タグ付け違い / アソート誤り |

※初期テンプレート。実案件では属性×Tierで個別合成（§2）。

### 4.13 CAT-013 バッグ・革小物
デフォルト属性: `ATTR_SKIN_CONTACT`（アウトドア用途は `ATTR_OUTDOOR / ATTR_LOAD_BEARING` 付与）

| 軸 | 内容 |
|---|---|
| ①Intake | 種類・サイズ / 素材（本革/合皮/布）/ 金具仕様 / 耐荷重想定 |
| ②M・W・O | Must: 素材表示・持ち手強度 / Want: ファスナー品質・裏地 / Optional: 刻印・付属品 |
| ③CTQ | 持ち手・縫製強度 / ファスナー耐久 / 色移り / 金具メッキ品質 |
| ④Defects | 縫製不良 / 金具錆・剥がれ / 色移り / 匂い（接着剤）/ 型崩れ |
| ⑤Regulatory | 家庭用品品質表示法（雑貨工業品）/ 有害物質含有家庭用品規制法（クロム等の留意） |
| ⑥Factory | 革・合皮の調達品質 / 縫製・コバ処理技術 / 金具メーカー管理 |
| ⑦Sample Tests | 持ち手荷重 / ファスナー開閉耐久 / 色移り・摩擦 / 金具塩水噴霧 |
| ⑧Mass Tests | 縫製抜取 / 金具動作全数 / 匂い官能抜取 |
| ⑨Inspection | 縫製・接着 / 金具動作 / 傷・シワ（天然皮革の許容基準）/ 表示 |
| ⑩Pkg Risks | 型崩れ（詰め物）/ 湿気カビ / 金具の当たり傷 |

※初期テンプレート。実案件では属性×Tierで個別合成（§2）。

### 4.14 CAT-014 アクセサリー（肌接触）
デフォルト属性: `ATTR_SKIN_CONTACT`

| 軸 | 内容 |
|---|---|
| ①Intake | 素材（合金・メッキ種類）/ 着用部位 / アレルギー配慮要否 |
| ②M・W・O | Must: ニッケル等の溶出管理・強度 / Want: メッキ厚・石留め / Optional: 刻印・ギフト箱 |
| ③CTQ | 金属アレルギー物質管理（ニッケル溶出）/ メッキ密着・変色 / 留め具強度 |
| ④Defects | メッキ剥がれ・変色 / 石取れ / 留め具不良 / 傷 |
| ⑤Regulatory | 有害物質含有家庭用品規制法 / 景品表示法（「金属アレルギー対応」等の訴求根拠） |
| ⑥Factory | メッキ工程の自社/委託管理 / 素材成分証明 / 小物検品体制 |
| ⑦Sample Tests | ニッケル溶出 / 人工汗・変色 / 引張（チェーン・留め具）/ 石留め |
| ⑧Mass Tests | メッキ外観全数 / 引張抜取 / 成分ロット証明 |
| ⑨Inspection | 変色・メッキムラ / 留め具動作 / ペア・セット数量 |
| ⑩Pkg Risks | 絡まり / 変色（防湿・防硫黄）/ ギフト箱潰れ |

※初期テンプレート。実案件では属性×Tierで個別合成（§2）。

### 4.15 CAT-015 化粧品容器
デフォルト属性: `ATTR_LIQUID_SEAL / ATTR_SKIN_CONTACT`（内容物間接接触）

| 軸 | 内容 |
|---|---|
| ①Intake | 内容物の性状（油性/水性/粉）/ 容量 / ポンプ・ミスト等の機構 / 充填は誰が行うか |
| ②M・W・O | Must: 内容物適合性（相溶性）・密閉 / Want: 吐出量精度・加飾 / Optional: リフィル構造 |
| ③CTQ | 密閉性（漏れ・揮発）/ 内容物相溶性 / 吐出機構耐久 / 加飾密着 |
| ④Defects | 漏れ / ポンプ不動作 / 加飾剥がれ / 容器割れ / 異物 |
| ⑤Regulatory | 薬機法（化粧品の容器表示は充填者側義務：表示スペース設計に関与）/ 資源有効利用促進法（材質表示） |
| ⑥Factory | クリーン成形環境 / 相溶性試験データ保有 / 加飾（蒸着・印刷）品質 |
| ⑦Sample Tests | 漏れ（姿勢・温度差）/ 相溶性（内容物浸漬）/ ポンプ耐久 / 落下 |
| ⑧Mass Tests | 漏れ抜取 / 吐出量抜取 / 異物目視全数 |
| ⑨Inspection | 異物・成形不良 / 加飾位置 / ポンプ動作 / 嵌合トルク |
| ⑩Pkg Risks | 割れ / 加飾擦れ / 静電気による粉塵付着 |

※初期テンプレート。実案件では属性×Tierで個別合成（§2）。

### 4.16 CAT-016 アウトドア用品
デフォルト属性: `ATTR_OUTDOOR`（テント・チェア等は `ATTR_LOAD_BEARING`、バーナー系は `ATTR_HIGH_TEMP`、ランタンは `ATTR_ELECTRIC / ATTR_BATTERY` 付与）

| 軸 | 内容 |
|---|---|
| ①Intake | 品目 / 使用環境（山・海・積雪）/ 耐水圧・UV等の目標 / 収納サイズ |
| ②M・W・O | Must: 構造安全・耐候 / Want: 軽量・収納性 / Optional: カラー・ロゴ展開 |
| ③CTQ | 耐候（UV退色）/ 防水・耐水圧 / フレーム強度 / 縫製・シームテープ |
| ④Defects | 錆 / 撥水低下 / フレーム破損 / シーム剥がれ / 生地裂け |
| ⑤Regulatory | 家庭用品品質表示法 / 景品表示法（耐水圧・UVカット訴求の根拠）/ 燃焼器具は液化石油ガス法等の確認 |
| ⑥Factory | 耐候・防水試験設備 / 溶接・アルマイト処理 / 縫製+シーム加工 |
| ⑦Sample Tests | 耐水圧 / UV照射退色 / 荷重（チェア等）/ 開閉耐久 / 塩水噴霧 |
| ⑧Mass Tests | 撥水抜取 / 強度抜取 / 部品個数全数 |
| ⑨Inspection | 縫製・シーム / フレーム動作 / 付属品（ペグ・袋）/ 表示 |
| ⑩Pkg Risks | 収納袋破れ / 金属部の突き破り / 湿気（防カビ） |

※初期テンプレート。実案件では属性×Tierで個別合成（§2）。

### 4.17 CAT-017 ペット用品
デフォルト属性: なし（品目により付与: 食器系 `ATTR_FOOD_CONTACT`、噛むおもちゃは誤飲・材質留意、電動給水器は `ATTR_ELECTRIC / ATTR_WATER`）

| 軸 | 内容 |
|---|---|
| ①Intake | 対象動物・体格 / 用途（食事/遊び/移動）/ 噛む・引っ掻く想定 |
| ②M・W・O | Must: 誤飲・材質安全（動物用）/ Want: 耐久・洗浄性 / Optional: デザイン |
| ③CTQ | 材質安全（噛み・舐め）/ 部品脱落防止 / 洗浄耐久 / 強度（リード等は破断荷重） |
| ④Defects | 部品脱落 / 破れ / 匂い / バリ / 縫製不良 |
| ⑤Regulatory | ペットフード安全法（食品類のみ）/ 家庭用品品質表示法（雑貨）/ 電安法（電動品） |
| ⑥Factory | 材料の安全データ管理 / 縫製・成形品質 / 強度試験 |
| ⑦Sample Tests | 引張・破断（リード・ハーネス）/ 噛み耐久 / 洗浄繰返し / 溶出（食器） |
| ⑧Mass Tests | 強度抜取 / 目視全数（バリ・脱落） |
| ⑨Inspection | 縫製・金具 / バリ / 表示（対象動物・体重目安） |
| ⑩Pkg Risks | 匂い移り / 圧縮変形 / 警告表示欠落 |

※初期テンプレート。実案件では属性×Tierで個別合成（§2）。

### 4.18 CAT-018 フィットネス器具（荷重）
デフォルト属性: `ATTR_LOAD_BEARING`（電動品は `ATTR_ELECTRIC`、大型品は `ATTR_BULKY` 付与）

| 軸 | 内容 |
|---|---|
| ①Intake | 種目 / 最大使用者体重 / 負荷方式（ゴム・重り・電動）/ 設置環境 |
| ②M・W・O | Must: 耐荷重・破断安全率 / Want: 静音・床保護 / Optional: カウンター・アプリ |
| ③CTQ | 破断強度（安全率）/ 繰返し耐久 / 滑り止め / 挟み込み防止 |
| ④Defects | ゴム破断 / 溶接割れ / 異音 / 表面剥がれ（グリップ） |
| ⑤Regulatory | 消費生活用製品安全法留意 / PL留意 / 景品表示法（負荷値・効果訴求） |
| ⑥Factory | 強度・疲労試験設備 / ゴム・スチール材料管理 / 溶接品質 |
| ⑦Sample Tests | 静荷重（定格×安全率）/ 繰返し疲労 / ゴム引張・老化 / 転倒 |
| ⑧Mass Tests | 荷重抜取 / 溶接部抜取（必要時探傷）/ 目視全数 |
| ⑨Inspection | 溶接・締結 / グリップ接着 / 最大荷重表示 / 部品個数 |
| ⑩Pkg Risks | 重量物の梱包破れ / 部品欠品 / 床下敷き傷 |

※初期テンプレート。実案件では属性×Tierで個別合成（§2）。

### 4.19 CAT-019 ステーショナリー
デフォルト属性: なし（品目により付与: ハサミ・カッターは `ATTR_SHARP_EDGE`、子供向けは `ATTR_CHILD_USE`）

| 軸 | 内容 |
|---|---|
| ①Intake | 品目 / 使用者（一般/子供/オフィス）/ 印刷・名入れ / ロット数 |
| ②M・W・O | Must: 基本機能（書ける・切れる・貼れる）/ Want: 耐久・書き味 / Optional: パッケージ演出 |
| ③CTQ | 機能安定（インク出・切れ味・粘着力）/ 寸法精度 / 印刷品質 |
| ④Defects | インク不良 / 接着不良 / 印刷ズレ / バリ / 組付不良 |
| ⑤Regulatory | 家庭用品品質表示法（該当品目）/ 食品衛生法（子供が口にする文具の留意）/ 景品表示法 |
| ⑥Factory | 小物大量生産の工程能力 / 印刷精度 / 異物管理 |
| ⑦Sample Tests | 筆記・切断・粘着の機能試験 / 落下 / インク経時 |
| ⑧Mass Tests | 機能抜取 / 印刷見本照合 / 数量・アソート全数 |
| ⑨Inspection | 機能サンプルチェック / 印刷 / 個装・台紙 / 数量 |
| ⑩Pkg Risks | アソート誤り / 台紙折れ / インク漏れ |

※初期テンプレート。実案件では属性×Tierで個別合成（§2）。

### 4.20 CAT-020 収納・生活雑貨
デフォルト属性: なし（品目により付与: 大型ラックは `ATTR_LOAD_BEARING / ATTR_BULKY`、浴室用品は `ATTR_WATER`）

| 軸 | 内容 |
|---|---|
| ①Intake | 品目・サイズ / 設置場所（居室/水回り）/ 積載物・重量 / 組立式か |
| ②M・W・O | Must: 基本強度・寸法 / Want: 質感・可動部品質 / Optional: 連結・拡張性 |
| ③CTQ | 耐荷重（棚板等）/ 寸法・嵌合精度 / 表面仕上げ / 可動部（引出し）耐久 |
| ④Defects | 変形・反り / 嵌合不良 / 傷・汚れ / 部品欠品 |
| ⑤Regulatory | 家庭用品品質表示法（合成樹脂加工品等）/ 有害物質含有家庭用品規制法（留意） |
| ⑥Factory | 成形・板金の寸法管理 / 金型保守 / 梱包設計 |
| ⑦Sample Tests | 積載荷重 / 開閉耐久 / 落下 / 組立検証 |
| ⑧Mass Tests | 寸法抜取 / 嵌合抜取 / 目視全数 |
| ⑨Inspection | 反り・嵌合 / 傷 / 部品個数・説明書 / 表示 |
| ⑩Pkg Risks | 角潰れ / 反り（積み方）/ 容積効率 |

※初期テンプレート。実案件では属性×Tierで個別合成（§2）。

---

## 5. 属性合成のデモ — ウォーターサーバー（※例でありシステム仕様ではない）

> 本節は §2 パイプラインの動作を示す**説明用の例**であり、ウォーターサーバー向けの仕様・優先カテゴリー決定ではない（Governance §0-2）。

### 5.1 入力

- 顧客入力:「卓上型のウォーターサーバーを作りたい。温水と冷水が出るタイプ」
- Category推定: 最近似は CAT-005 小型家電（調理）※完全一致Packは不在と仮定
- 属性推定（AI_SUGGESTED）: `ATTR_ELECTRIC / ATTR_FOOD_CONTACT / ATTR_WATER / ATTR_HIGH_TEMP / ATTR_BULKY`（＋温水チャイルドロック要否から `ATTR_CHILD_USE` を確認質問）
- Quality Tier: Q2_STANDARD（仮）

### 5.2 「家電カテゴリー単独」では漏れるルールが属性で拾われる過程

| Step | 起きること | 家電Pack単独との差分（＝属性合成で拾われた漏れ） |
|---|---|---|
| (a) | CAT-005 Pack読込: 電安法候補・通電検査・温度上昇試験などのベースセット | — （ここまでは家電並み） |
| (b) ATTR_FOOD_CONTACT | 食品衛生法候補・接液部の溶出試験・接液材質質問・食品グレード材の工場適格要件を追加 | **家電Packだけでは接液部の溶出試験と材質証明が漏れる** |
| (b) ATTR_WATER | 漏水試験（全数推奨）・タンク衛生（カビ）・シール構造の工場実績要件・残水乾燥梱包を追加 | **漏水全数検査・水回り衛生の観点が漏れる** |
| (b) ATTR_HIGH_TEMP | 温水部の異常時（空焚き・サーモ故障）試験・高温注意表示・温度ヒューズ実装検品を追加。ATTR_CHILD_USE 確認質問（温水ロック）を自動追加（§2.2 B-3） | **温水×子供のやけどリスク（チャイルドロック）が漏れる** |
| (b) ATTR_BULKY | ISTA輸送試験・パレット設計・転倒安定性試験・積込立会（装柜监督）の中国側Taskを追加 | **大型物流要件（転倒・輸送破損）が漏れる** |
| (c) | Q2_STANDARD の外観AQL・検査条件を適用。ただし溶出・漏水・温度系は SAFETY/REGULATORY のため全Tier同値 | Tierで安全が緩まないことの確認 |
| (d) | 「温度上昇試験」（家電Pack由来）と「温水部異常時試験」（ATTR_HIGH_TEMP由来）を topic_key で統合、基準は厳しい方 | 二重試験の排除 |
| (e) | 質問リスト（接液材質・温水ロック・搬入経路等）/ 法規候補（電安法+食品衛生法+電波法非該当確認）/ 試験計画 / 検品計画（通電全数+漏水全数）/ 包装要件 を出力 | — |

### 5.3 例が示すこと

カテゴリー1軸のルール決定では「家電としては正しいが、水・食品・高温・大型の複合リスクが漏れる」。属性合成は**漏れの検出をカテゴリー定義の完成度に依存させない**ための機構であり、この動作自体は全カテゴリー共通の Layer 1 機能である。

---

## 6. 未知カテゴリー対応フロー（Rule Pack 不在時）

Governance §13「未対応カテゴリーのため受付不可という挙動は禁止」を実装するフロー。Status はすべて正準enum（§3）のみ使用。

| # | ステップ | 担当Role | 処理内容 | Status/記録 |
|---|---|---|---|---|
| U-1 | 入力受付 | SYSTEM | Category推定で一致Packなし→未知カテゴリーモードへ。受付は通常どおり継続 | Project=DRAFT→ACTIVE |
| U-2 | 属性推定 | AI | 商品説明・画像から `ATTR_*` を推定。近似Pack（最も属性構成が近いPack）があれば参考として併記 | 属性=AI_SUGGESTED |
| U-3 | 暫定Rule組立 | SYSTEM | §3 の属性ルールセットのみで暫定Ruleセットを合成（＝仮想Pack）。近似Packがある場合はその流用可否を人間判断に委ねる（自動流用しない） | Regulatory=CHECKING |
| U-4 | 人間レビュー・補正 | PM / QA / REG | 暫定Ruleセットを確認・補正（属性の確定/非該当化、質問・試験・検品の追加削除。削除は理由必須） | 属性=CONFIRMED、Regulatory=REVIEW_REQUIRED→REG判断、補正はAuditLogへ |
| U-5 | 案件遂行 | 各Role | 補正済みRuleセットで通常フロー進行。ProductRisk は保守側（PRISK_HIGH以上を初期値）とし、検品密度を増強（A1 R-08 と同思想） | 通常のGate運用（G-03/G-13/G-14等） |
| U-6 | 実績蓄積 | SYSTEM / PM | 案件完了時に実績（有効だった質問・発生不良・実施試験・検品結果・クレーム）を仮想Packに紐付けて保存 | source_projects に案件IDを記録 |
| U-7 | 新Pack起案 | PM | 同種案件が一定数（初期基準: 2件以上）または戦略判断で、仮想Pack+実績から新Rule Packドラフトを作成 | Pack=DRAFT |
| U-8 | レビュー・承認 | QA（品質系要素）+ REG（法規要素）→ MGR（最終） | §7 の承認手順で正式登録。以後は既知カテゴリーとして (a) から評価 | Pack=APPROVED（§9 提案-2 のenum） |

- U-3〜U-4 の Automation分類: U-3=`B_AI_DRAFT`、U-4=`C_HUMAN_DECISION`。
- 未知カテゴリー案件では G-14（法規未着手のRFQ先行に対するSoft Gate）の WARN 文言に「新規カテゴリーのため法規確認を強く推奨」を付加する（Gate自体の新設はしない）。

---

## 7. 新カテゴリー追加手順（コード修正なし）と版管理

### 7.1 追加手順（誰が・何を・どの承認で）

| # | 作業 | 実施者 | 承認 | 補足 |
|---|---|---|---|---|
| 1 | Packドラフト作成（9要素の記入。§4 の10軸テンプレートを雛形に使用） | PM（AI下書き可=`B_AI_DRAFT`） | — | 既存Packの複製から差分編集を推奨 |
| 2 | スキーマ検証 | SYSTEM | — （不合格は登録不可） | §1.4。DSL語彙・FIXED MINIMUM構造チェック |
| 3 | 品質系要素レビュー（CTQ / Test / Quality Standard / Inspection） | QA | QA承認 | 16番 A4 の外観・AQL体系との整合確認 |
| 4 | 法規要素レビュー（Regulatory Candidates） | REG | REG承認 | A6 チェックリスト（13番 §1.6）との相互参照登録 |
| 5 | 最終承認・有効化 | MGR | MGR承認 | 承認記録は Approval（PENDING→APPROVED）で管理 |
| 6 | 有効化後の再評価 | SYSTEM | — | 進行中案件への適用は差分提示のみ（自動適用しない。人間が適用可否を判断） |

**全工程で行われるのはデータ登録・レビュー・承認のみであり、コードのビルド・デプロイは発生しない。** 「このカテゴリーは特殊なのでコードで対応したい」という要求が出た場合、それは属性タグまたはPackスキーマの不足を意味するため、§9 の Governance変更提案（属性追加・スキーマ拡張）として起案する。ハードコードによる回避は禁止（Governance §13）。

### 7.2 版管理（Governance §7 準拠）

- Pack は V1, V2, … の版番号を持ち、**承認済み版はイミュータブル**。変更は新版作成のみ（旧版は `SUPERSEDED`。§9 提案-2）。
- 案件は評価時点の Pack版を `evaluated_against: RP-001-V2` として記録する（A6 の `checked_against` と同形式。監査時に「当時どのルールで判断したか」を再現可能にする）。
- 軽微修正（誤字・中国語訳）も新版とする（「最新版」上書きの禁止。Governance §7）。
- 属性ルールセット（AR-*）も同じ版管理に従う。属性レジストリ自体（ATTR_* の追加・削除）は Governance Pack の変更手続による（本書では変更できない）。

---

## 8. 既存設計との接続（A1 / A2 / A6）

各エンジンは**カテゴリー名を条件にした固有ロジックを持たず**、Rule Engine の出力ビュー（§2.5）だけを消費する。

### 8.1 A1 Task Generator（10番）との接続

| Rule Engine出力 | Task Generatorでの消費方法 |
|---|---|
| QuestionList | JP-REQ系Task（質問提示Task）の中身として添付。質問の存在有無・件数はPackデータ由来であり、Task Generator 側のルール（R-01〜R-14）は DNA・Entry Route のみを条件にする（現行のまま。カテゴリー条件は追加しない） |
| TestPlanView | stage=SAMPLE の試験→JP-SMP/QUAL系Taskとして生成。stage=MASS→JP-PROD/INSP系。試験ごとのTask実体は `{ProjectID}-TSK-xxxx` で起票し、payload の LT・費用を deadline_rule・見積に反映 |
| InspectionPlanView | JP-INSP系および中国側 CN-INSP系Task（12番 A5）の検査項目データとして受け渡し（中国語併記フィールドを使用） |
| FactoryQualView | JP-FACT系（工場選定）の評価条件・RFQ要求書類として添付。Factory Score Engine の推薦フィルタに使用 |
| PackagingView | JP-LOGI系Taskと中国語仕様書（包装シート）に反映 |

接続原則: A1 §4 の「全該当ルールを合成・矛盾時は厳しい方」と本書 §2.4 は同一原則であり、DNA由来の強度（R-08 検品密度増等）と Tier由来の強度（§2.3）が重なる場合も「厳しい方」で統一する。

### 8.2 A2 Minimum Question（11番）との接続

| 接続点 | 仕様 |
|---|---|
| 質問候補の供給 | Requirement Analyzer が生成する動的質問（Known/Missing分類由来）に加え、Rule Engine の QuestionList（カテゴリー・属性由来の定型必須質問）を質問プールに供給する。両者の重複は §2.4 の target_spec_field キーで排除 |
| question_class | Pack の question_class は A2 の `BLOCKER / IMPORTANT_LATER / OPTIONAL` と同一enum（新設なし）。G-10（BLOCKER未回答）の対象判定にそのまま使用 |
| 表示制御 | 表示順・3問ずつ・平易文体・「わからない→おすすめ」等のUI規則は A2 §3.3 が正。Pack は質問内容・理由一行・既定値のみを持つ（見せ方はUniversal Core側） |
| Just-in-Time表示 | display_stage フィールドが A2 の「必要になる工程の直前に表示」の工程キーとなる |
| 属性確定質問 | §2.2 B-3 で自動生成される属性確認質問（例: 「お子様も使いますか？」）は question_class=BLOCKER 相当で扱い、安全系属性の未確定を早期に解消する |

### 8.3 A6 Regulatory Engine（13番）との接続

| 接続点 | 仕様 |
|---|---|
| 候補の初期セット | Rule Engine の RegulatoryCandidateView（Pack由来+属性由来の法規候補）を、A6 処理フロー(2)「カテゴリ別チェックリスト照合」の入力候補として渡す。A6 のチェックリスト（人間初版・AI照合限定）が正であり、Pack候補はチェックリストの選定・照合を助ける前段データ |
| 語彙の統一 | applicability（HIGH/CONDITIONAL/LOW）・expert_check（REQUIRED等）は A6 §1.3 と同一語彙。二重定義しない |
| 逸脱検知との関係 | Pack候補にもチェックリストにも無い属性・材質・訴求を検知した場合の強制 REVIEW_REQUIRED（A6 フロー(4)）は従来どおり有効。Pack があることは逸脱検知を弱める理由にならない |
| 最終判断 | 法規の採否・NOT_APPLICABLE確定・BLOCKED解除は REG（+MGR）の人間判断（A6 §1.5）。Rule Pack / Rule Engine は候補提示までしか行わない |
| 版の相互記録 | Regulatory Assessment の `checked_against` にチェックリスト版、`evaluated_against` に Pack版を記録し、双方の版更新時に再照合（Status→CHECKING）をトリガーする |

### 8.4 その他エンジン（参照のみ）

- Quality Recommendation Engine（01番）: CtqList と Tier強度表（§2.3）を入力とし、「この項目を緩和すると−X円」の可視化は Rule Record の tier_scaling 差分から算出する。
- Translation/Doc Engine: InspectionPlanView / PackagingView の中国語併記フィールド（*_zh）を仕様書・検品基準の中国語出力に直接使用する（12番 A5 の13シート構成へ流し込み）。

---

## 9. Governance変更提案（2件・未裁定）

### 提案-1: Rule Pack の ID体系追加（Governance §2 への追記）

| 項目 | 内容 |
|---|---|
| 種別 | ID体系の新設（§2 は新設をGovernance変更手続に委ねているため起案） |
| 提案内容 | `RP-{NNN}`（Category Rule Pack）/ `RP-{NNN}-{要素略号}-{NN}`（Pack内Rule。要素略号: RQ/CTQ/RSK/REG/TST/QS/FQ/IT/PK）/ `AR-{属性略号}-{NN}`（属性ルールセット内Rule。属性略号は ATTR_ の後続部）を §2 のID表に追加 |
| 理由 | Rule単位の参照（案件の evaluated_against 記録、A1 TaskからのRule参照、監査）にIDが必須。既存TYPEコードに該当がない |
| 影響 | A3 データ設計（15番）のテーブル定義に rule_packs / rules / attribute_rules を追加。既存IDとの衝突なし |

### 提案-2: RulePack Status enum の追加（Governance §3 への追記）

| 項目 | 内容 |
|---|---|
| 種別 | Status enum の新設（§3 は新設禁止・提案制のため起案） |
| 提案内容 | RulePack: `DRAFT / REVIEW_REQUIRED / APPROVED / SUPERSEDED` を §3 の表に追加 |
| 理由 | Pack は運用データ（承認後イミュータブル・版管理対象）であり、設計docの Draft/Reviewed/Approved とも、ECR enum とも生命周期が異なる。REVIEW_REQUIRED はQA/REGレビュー中（§7.1 手順3〜4）を表し、Regulatory enum と同語だが対象エンティティが異なるため衝突しない。SUPERSEDED は GoldenSample enum と同運用（旧版格納） |
| 代替案 | Approval enum（PENDING/APPROVED/…）の流用も可能だが、SUPERSEDED（版失効）が表現できないため新設を提案する |
| 影響 | §7.2 の版管理、U-7〜U-8 の未知カテゴリー正式登録フローが本enumを使用 |

---

## Change Log

| 版 | 日付 | 変更 |
|---|---|---|
| v0.1 | 2026-08-10 | 初版作成（A8）。Rule Packデータモデル（9要素）/ Rule Engine評価パイプライン / 属性13種マッピング表 / 20カテゴリー×10軸比較表 / ウォーターサーバー属性合成デモ（例）/ 未知カテゴリーフロー / 新カテゴリー追加手順 / A1・A2・A6接続仕様 / Governance変更提案2件 |
