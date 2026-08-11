# 23. A11 Stress Test（オーナー指定20ケースの机上検証）

| 項目 | 値 |
|---|---|
| Status | **Reviewed** |
| 版 | v1.1 |
| 日付 | 2026-08-11 |
| 作成エージェント | A11 / Freeze前検証エージェント（§8） |
| 準拠 | 05-governance-pack.md v3.0（§0実商流原則 / §3 v3.0 enum / §13 Category-Agnostic / §16 Commercial Feasibility Loop / §17 Cost Architecture / §18 Profile分離 / §19 Feedback・Evolution）、01番 / 10番 / 11番 / 13番 / 15番 / 16番 / 18番 |
| 目的 | Governance Pack v3.0 のArchitecture（Universal Core + Category Rule Pack + Commercial Feasibility Loop + Cost Architecture + Profile分離）が、オーナー指定の20ケースを**Architecture変更なしに**処理できるかを机上検証する（DoD-10対応） |

---

## 0. 検証方法と判定基準

### 0.1 用語（初出定義・§14言語ルール準拠）

- MOQ（最小発注数量：工場が受けられる最低ロット）
- RFQ（見積依頼：工場に価格を依頼するプロセス）
- Quote（工場見積：工場→商社の見積。版管理対象）/ Quotation（顧客見積書：商社→顧客の見積）
- ODM（相手先ブランド設計製造：顧客ブランドで販売する商品の設計・製造受託）
- Entry Route（入口区分：A=相談 / B=商品確定 / C=CAD保有即見積 / D=リピートの4入口。01番§4）
- BudgetStatus（予算状態：予算情報の確定度を表す状態。UNKNOWNでも案件開始可。05番§3）
- QuantityStatus（数量状態：数量情報の確定度を表す状態。工場MOQを見て変更できる前提。05番§3）
- Commercial Feasibility Loop（商業成立性ループ：要求→工場回答→費用試算→顧客判断を成立まで周回させる中核Workflow。05番§16。以下「Loop」）
- CustomerDecision（顧客判断分岐：Loop各周回の顧客判断。ACCEPT/MODIFY/NEGOTIATE/RE_SOURCE/RE_RFQ/HOLD/REJECT）
- Cost Ledger（費用台帳：案件の全費用項目を状態・責任・根拠付きで管理する台帳。05番§17）
- Landed Cost（総原価：顧客指定納品地点までの総コスト。Estimated/Confirmed/Actualの3段階）
- Rule Pack（カテゴリールールパック：商品分類ごとの質問・品質・法規・検品ルールの設定データの束。18番）
- 属性タグ（ATTR_*：電気・食品接触等の商品属性コード。属性の組合せでルールを合成する。05番§13）
- Project DNA（案件DNA：案件の運営方針を決める8軸。05番§4）
- Profile分離（案件情報の分離管理：Product Attributes / DNA / Commercial / Quality / Regulatory / Factory の6面に分けて相互参照する原則。05番§18）
- Production Reference（量産基準セット：「何を正として量産するか」を構成する承認済み成果物の組合せ。G-02の判定対象。05番§9）
- Gate（ゲート：工程の進行判定。SOFT=警告付き進行可 / HARD=承認記録なしで突破不可）
- FIXED MINIMUM（絶対最低基準：安全・法令・重大機能に関わるためQuality Tierで緩和できない基準。16番§2）
- ECR（変更申請：承認済み仕様の変更手続き）/ CAPA（是正・予防処置：再発防止の処置管理）
- PSE（電気用品安全法適合：日本の電気製品安全規制への適合）
- ISTA（国際輸送包装試験規格：輸送中の落下・振動・圧縮を模擬する試験規格）

### 0.2 判定基準

| 判定 | 意味 |
|---|---|
| `PASS` | 既存Architectureと既存の初期テンプレート・enum・機構の範囲で処理可能（変更不要） |
| `PASS_WITH_CONFIG` | Architecture変更は不要だが、設定・Rule Pack・Cost Item・管理項目の**データ追加**（CONFIGURABLE_RULE / Custom Cost Item / Pack新版）が前提 |
| `GAP` | Universal Core・Gate・enum・Loop等の**構造変更**が必要（Architecture変更に該当） |

### 0.3 検証上の共通前提

- 各ケースの商品例は**すべて「例でありシステム仕様ではない」**（Governance §0-2）。
- オーナー未明示の条件は確定せず、`ASSUMPTION:` として明示するか `CONFIGURABLE` / `TBD` とする（Governance §0-9）。
- Loop周回数の記載は机上想定であり、KPI（Commercial Loop回数。05番§20-11）の実測で校正する `CALIBRATION_VALUE` である。

---

## 1. ケース検証（1〜4: 入力情報の欠落・偏り系）

### Case 1: 商品知識0・予算不明・数量不明

- **入力状態**: 自由文のみ（例:「オリジナルグッズを作りたい」※例でありシステム仕様ではない）。BudgetStatus=`UNKNOWN` / QuantityStatus=`UNKNOWN` / Entry Route=A（IDEA MODE）/ 属性タグ=AI推定（`AI_SUGGESTED`）/ DNA初期値=`EXP_BEGINNER × INT_EXPLORE`、他軸AI推定。
- **処理経路**: Entry(A) → Requirement Analyzer（Known/Missing分類）→ BLOCKER質問最大3問（11番§3）→ Proposal Engine が OPTION A/B/C 提示（概算レンジ・仮数量つき）→ 顧客選択 → Loop第1周（概算RFQ→工場回答→費用試算→顧客OPTION提示）。想定Loop=1〜2周。CustomerDecision=`ACCEPT`（提案受容）または `MODIFY`（数量・仕様調整）。数量・予算はG-12（数量未確定・SOFT）で概算進行。
- **使われる仕組み**: Commercial Profile（UNKNOWN許容）/ Rule Pack QuestionList＋属性合成 / Proposal Engine / Soft Gate G-10・G-12・G-13 / Cost Ledger（CostStatus=`AI_ESTIMATED`、推定表示必須）。
- **判定**: `PASS`。§0-6が「価格・MOQ・数量の事前確定を前提にするArchitectureの禁止」を明記し、BudgetStatus/QuantityStatusに`UNKNOWN`が正準値として存在。Vertical Slice（0知識顧客→提案→RFQ）で経路自体が検証済み。

### Case 2: 予算だけ決まっている

- **入力状態**: 総予算のみ（BudgetStatus=`TOTAL_PROJECT_BUDGET`。単価上限なら`MAX_UNIT_PRICE`）。QuantityStatus=`UNKNOWN` / Entry Route=AまたはB / DNA=`EXP_BEGINNER〜INTERMEDIATE`想定（ASSUMPTION: 予算起点の相談は初〜中級者が多い。確定はAI推定+人間確定）。
- **処理経路**: Requirement Structuring → COST SIMULATION が「予算 ÷ 概算Landed Cost」から成立しうる数量×仕様×品質の組合せを逆算 → OPTION提示（数量優先 / 品質優先 / オリジナル性優先）→ 顧客選択後にRFQ → Loop第2周で工場実回答に置換。想定Loop=2周。CustomerDecision=`MODIFY`（組合せ選択）→`ACCEPT`。
- **使われる仕組み**: Commercial Profile（Total Budget / Cost優先度）/ Cost Ledger（`AI_ESTIMATED`→`FACTORY_QUOTED`の置換追跡）/ Option型提案（§16。正式提案はHuman Approval）/ G-12・G-15（概算明示）。
- **判定**: `PASS`。予算は必須確定値ではなく「状態」として扱われ、Loopの費用試算→Option提示がこの逆算をそのまま担う。

### Case 3: 商品だけ決まっていて価格不明

- **入力状態**: 商品仕様の言及あり・価格情報なし。BudgetStatus=`UNKNOWN`（相場観がある場合は`BENCHMARK`）/ QuantityStatus=`TARGET_QUANTITY`または`UNKNOWN` / Entry Route=B（PRODUCT MODE）/ DNA=`EXP_INTERMEDIATE`想定（ASSUMPTION）。
- **処理経路**: Entry(B) → Requirement Structuring（BLOCKER質問のみ）→ FACTORY SEARCH → RFQ → FACTORY RESPONSE（Quote登録）→ COST SIMULATION（Landed Cost=Estimated）→ Quotation提示。想定Loop=1周（価格が想定外なら`NEGOTIATE`/`MODIFY`で+1周）。CustomerDecision=`ACCEPT`または`NEGOTIATE`。
- **使われる仕組み**: Quote Version（前提条件付き版管理）/ Cost Ledger → Crossimage Margin → Quotation の見積構造（§17）/ 情報遮断（工場原価・粗利を顧客に出さない）/ G-14・G-15。
- **判定**: `PASS`。「価格は工場回答で初めて判明する」がLoopの標準前提そのもの。

### Case 4: 希望価格と数量が両方ある

- **入力状態**: BudgetStatus=`TARGET_UNIT_PRICE` / QuantityStatus=`TARGET_QUANTITY` / Entry Route=B（CAD保有ならC）/ DNA=`EXP_INTERMEDIATE〜PROFESSIONAL × INT_READY`想定（ASSUMPTION）。
- **処理経路**: Requirement Structuring → RFQ（希望価格・数量を前提条件としてQuoteに記録）→ FEASIBILITY ANALYSIS が「希望価格×希望数量」の成立性を判定 → 成立なら想定Loop=1周で`ACCEPT`。不成立ならCase 5/6の経路へ分岐（`MODIFY`/`NEGOTIATE`）。
- **使われる仕組み**: Commercial Profile（Target Price / Target Quantity / Acceptable MOQ）/ FEASIBILITY ANALYSIS / Quote Version前提条件（数量・仕様版・為替・Incoterms（貿易条件：費用と危険の分岐点の国際規則））。
- **判定**: `PASS`。希望値は「あれば使う入力」であり、成立判定と分岐がLoopに内蔵されている。

---

## 2. ケース検証（5〜6: 商業成立しない系）

### Case 5: 希望MOQでは工場が見つからない

- **入力状態**: QuantityStatus=`MIN_DESIRED`（例: 小ロット希望）が候補工場のMOQ未満。BudgetStatus任意 / Entry Route=A/B。
- **処理経路**: FACTORY SEARCH → 全候補でMOQ不成立 → **「未対応のため受付不可」「できません」の単純回答は禁止**（§16）→ Option型提案生成: OPTION A=数量を工場MOQへ引上げ（数量優先）/ B=工法・材料・包装変更でMOQの低い構成（価格優先）/ C=既製品ベース（ODM_0/1）へ変更（成立優先）。→ CustomerDecision=`MODIFY`（QuantityStatus→`FLEXIBLE_BASED_ON_MOQ`へ更新）/ `RE_SOURCE`（別工場探索）/ `HOLD`。想定Loop=2〜3周。
- **使われる仕組み**: MOQを工場固定属性でなく `Factory × Requirement版 × Specification × Quote版` のCommercial Conditionとして管理（§16）/ MOQ次元（per Order/SKU/Color等）=CONFIGURABLE_RULE / Factory Profile（工場探索は最安検索でなく開発力・MOQ等の多軸評価）/ Knowledge資産化（§19: 実績からMOQ推定精度を向上）。
- **判定**: `PASS`。MOQ不成立はLoopの標準分岐（RE_SOURCE/MODIFY）として設計済みで、数量側を動かせる前提（QuantityStatus）もenum化済み。

### Case 6: 希望価格では成立しない

- **入力状態**: BudgetStatus=`TARGET_UNIT_PRICE`または`MAX_UNIT_PRICE` が工場Quote+Cost Ledger積算を下回る。他は任意。
- **処理経路**: FEASIBILITY ANALYSIS → 不成立判定 → Cost Ledgerの内訳（製造/物流/試験/関税等）で「なぜその価格になるか」を構造的に提示 → Option型提案: 数量増による単価低減 / 仕様・加飾の簡素化 / 品質Tier見直し（**FIXED MINIMUM項目は緩和候補から構造的に除外**。16番§5）/ 工場交渉。→ CustomerDecision=`NEGOTIATE`（工場交渉）/ `MODIFY`（条件変更→`RE_RFQ`）/ `REJECT`（終了・代替案）。想定Loop=2〜3周。
- **使われる仕組み**: Cost Ledger（費目別Evidence付きで価格根拠を追跡）/ 品質⇄コスト可視化（「この項目を緩和すると−X%」16番§5）/ Option型提案のHuman Approval / G-16（価格を下げるための未実証性能表現の抑止）。
- **判定**: `PASS`。「成立しない」はLoopの想定内状態であり、単純拒絶を禁止するOption型提案が正準動作。

---

## 3. ケース検証（7〜9: ODMレベル系）

### Case 7: 金型が必要な完全ODM

- **入力状態**: OdmLevel=`ODM_4_FULL`。Entry Route=A（アイデアから）またはC（CAD保有）。BudgetStatus/QuantityStatus任意。ProductRisk=商品属性による。Tooling（金型：成形用の型。初期投資の主要素）が必要。
- **処理経路**: Requirement Structuring（構造・図面・BOM（部品表：構成部品・材料の一覧））→ RFQ（金型費・金型MOQ・金型製作LTを見積前提に含める）→ Loop第1周で金型費負担のOption提示（一括負担 / 単価上乗せ償却 / 分割等。方式はCONFIGURABLE）→ CustomerDecision=`NEGOTIATE`/`ACCEPT` → サンプルV1..Vn → GoldenSample承認 → G-02（Production Reference Set=Approved Drawing + Approved BOM + GoldenSample + Approved Artwork の組合せ。構成はDNA・Rule Packで決まるCONFIGURABLE_RULE）→ G-01（正式発注）→ 量産。想定Loop=2〜3周＋サンプル反復。
- **使われる仕組み**: Cost Ledger（金型費=CostClass `ONE_TIME`・カテゴリー「開発・初期」シード・CostResponsibility=`CLIENT`/`CROSSIMAGE`/`TBD`）/ MOQ次元「per Custom Mold」（§16で明記済み）/ G-01・G-02 Hard Gate / Sample・GoldenSample版管理 / ECR（金型修正の変更管理）。
- **判定**: `PASS_WITH_CONFIG`。Loop・Cost Ledger・G-02はそのまま適用可能。ただし①金型の**所有権・保管・移管の記録項目**、②償却方式の選択肢定義、③金型MOQ次元の具体設定は、Custom Cost Item属性とCONFIGURABLE_RULEの**データ追加**が前提（構造変更は不要。Cost Itemの属性拡張・Commercial Conditionの次元追加はいずれも§16/§17が「固定リスト化の禁止」として拡張可能に設計済み）。

### Case 8: 既製品Logo変更

- **入力状態**: OdmLevel=`ODM_1_LOGO`。Entry Route=B。BudgetStatus/QuantityStatus任意。既製品ベースのため仕様の大半は工場既存品から取り込み（`PROVISIONAL`）。
- **処理経路**: Entry(B) → Requirement Structuring（ロゴデータ・印刷方法・位置のみが主要質問。Rule Pack QuestionListの `display_stage` で絞り込み）→ RFQ（既製品単価+印刷版代+加工費）→ 想定Loop=1周・`ACCEPT` → アートワーク承認（JP-SPEC-060）→ G-02: Reference Set=**Previous/既製品Approved Sample + Approved Artwork**（Golden Sampleフル承認は不要な構成をCONFIGURABLE_RULEで選択。G-02 v3.0改訂の趣旨どおり「Golden Sampleは手段の一つ」）→ 量産。
- **使われる仕組み**: G-02のReference Set可変構成 / G-11（Pantone未確定・SOFT）/ Task Generator（ODM_1では構造設計系Taskを生成しない）/ Cost Ledger（版代=`ONE_TIME`）。
- **判定**: `PASS`。ODM_1はDNA正準値であり、軽量案件でGateが過剰にならない仕組み（Reference Set構成の可変化・Task動的生成）が入っている。

### Case 9: 包装のみ変更

- **入力状態**: OdmLevel=`ODM_2_COLOR_PKG`（包装変更）。Entry Route=B/D。商品本体仕様は既存のまま（`CONFIRMED`維持）。
- **処理経路**: Requirement差分解析（変更対象=Packagingのみ）→ Rule PackのPackaging Requirement要素（pack_level UNIT/INNER/OUTER/PALLET・輸送試験・表示要件）が適用ルールを供給 → RFQ（包材費・組立工数差分）→ 想定Loop=1周 → 包装仕様承認 → G-02: Reference Set=**Previous Approved Production + Approved Packaging** → 輸送試験（ISTA。Tier連動 QT-20）→ 量産。
- **使われる仕組み**: Rule Pack 9要素のPackaging Requirement / QT-19〜21（包装強化系Tierパラメータ）/ ECR（既存案件の包装変更なら変更申請経由）/ 法規表示連動（電池マーク・警告等はRegulatory Candidatesと連動）。
- **判定**: `PASS`。包装は独立したRule要素・Costカテゴリー・Reference Set構成要素として最初から分離されており、「包装のみ」の部分変更が構造的に表現できる。

---

## 4. ケース検証（10〜13: カテゴリー・リスク系）

### Case 10: 大型家具

- **入力状態**: 例=組立式シェルフ・チェア等（※例でありシステム仕様ではない）。Category=CAT-003（家具）/ 属性=`ATTR_LOAD_BEARING + ATTR_BULKY`（デフォルト属性として定義済み。18番§4.3）/ ProductRisk=`PRISK_MEDIUM`以上想定 / Entry Route=A/B。
- **処理経路**: Rule Engine (a)CAT-003読込 → (b)属性ルール加算（荷重: 静荷重・転倒・接合部検品 / 大型: ISTA輸送試験・パレット設計・搬入経路質問・積込立会）→ (c)Tier強度 → RFQ（容積重量・コンテナ効率をCost Ledgerに計上）→ Loop（運賃比率が高く、数量×コンテナ積載の組合せOptionを提示）→ CustomerDecision=`MODIFY`（数量をコンテナ単位に調整等）/`ACCEPT`。想定Loop=1〜2周。納品条件はDelivery Responsibility Point（納品責任分岐点：案件ごとに記録。§0-7）で確定。
- **使われる仕組み**: Rule Pack CAT-003＋属性合成 / Cost Ledger（国際物流・日本国内物流カテゴリー、大型品の特殊配送はCustom Cost Item）/ PackagingView→中国語仕様書 / 積込立会（LoadingSupervision）の中国側Task。
- **判定**: `PASS`。家具Packと`ATTR_BULKY`ルールセットが初期テンプレートとして存在し、物流費が支配的な商材もCost Ledgerの構造（Freight単純加算の禁止・Custom Item追加可）で表現できる。

### Case 11: 電気製品

- **入力状態**: 属性=`ATTR_ELECTRIC`（＋製品により`ATTR_BATTERY`/`ATTR_WIRELESS`等）。Category=CAT-004〜009系。ProductRisk=`PRISK_HIGH`想定 / Regulatory=`NOT_CHECKED`→`CHECKING`。
- **処理経路**: Rule Engine → PSE候補・通電/絶縁耐圧試験・全数通電検品・銘板表示ルールが属性から発火 → G-14（法規未確認・SOFT）WARN付きでRFQ可 → RFQに工場適格要件（PSE対応・通電検査ライン）と要求書類を添付 → Loop（試験費・認証費をCost Ledger「品質・試験」に計上した総原価で判断）→ JP-REG-040（法規最終判断=人間）→ Regulatory=`APPROVED`が`PRODUCTION_READY`の必須条件（G-03 Hard）。想定Loop=1〜2周。
- **使われる仕組み**: `ATTR_ELECTRIC`属性ルールセット / Regulatory Profile＋Regulatory Engine（候補提示まで。最終判断はREG）/ G-03（BLOCKED時はProduction/Shipment停止・Hard）/ G-14 / FIXED MINIMUM（電気安全試験は全Tier同値）/ Factory Qualification（RFQ段階の資質書類要求）。
- **判定**: `PASS`。電気安全は属性→法規候補→Hard Gateの連鎖が13番・18番で設計済み。カテゴリー固有コードなしで処理できる。

### Case 12: 食品接触商品

- **入力状態**: 属性=`ATTR_FOOD_CONTACT`（＋`ATTR_LIQUID_SEAL`/`ATTR_HIGH_TEMP`等）。Category=CAT-001/002系。Regulatory=食品衛生法（器具・容器包装）候補が必ず発火。
- **処理経路**: Rule Engine → 溶出試験・材質証明・接触面検品・清潔包装ルール発火 → Early Warning（検査費用・期間を提案段階で顧客に予告。11番§4.3）→ RFQ（材質証明書要求を含む）→ Loop（試験費・期間込みの総原価と納期で判断。属性連動の納期文言=E-08変形）→ 試験合格→Regulatory=`APPROVED`→G-03解消。想定Loop=1〜2周。
- **使われる仕組み**: `ATTR_FOOD_CONTACT`ルールセット / Regulatory Engine＋輸入手続フロー（13番§3.4）/ FIXED MINIMUM（溶出試験はTierで省略不可を構造強制）/ G-06（材質無断変更検知）/ 材質証明ロット照合（QT-23の全Tier必須部分）。
- **判定**: `PASS`。Vertical Slice第1号（タンブラー=食品接触）で入口から中国語仕様書出力まで通し検証済みの経路そのもの。

### Case 13: 複合リスク商品

- **入力状態**: 例=卓上ウォーターサーバー（電気×食品接触×水×高温×大型。※例でありシステム仕様ではない。18番§5のデモと同一想定）。完全一致するRule Packが存在しない場合を含む。属性=`ATTR_ELECTRIC + ATTR_FOOD_CONTACT + ATTR_WATER + ATTR_HIGH_TEMP + ATTR_BULKY`（AI_SUGGESTED）＋`ATTR_CHILD_USE`確認質問が自動発火。
- **処理経路**: Rule Engine (a)近似Pack読込（不在なら未知カテゴリーフローU-1〜U-5）→ (b)**属性ルールの加算合成**（単一カテゴリーでは漏れる溶出・漏水全数・チャイルドロック・大型物流を属性が拾う）→ (d)重複統合・矛盾は「厳しい方優先」、両立不能の完全矛盾のみ人間裁定（REVIEW_REQUIRED相当）→ RFQ → Loop（試験項目が多く費用・LTが嵩むため、リスク・コスト内訳つきOption提示）。想定Loop=2〜3周。CustomerDecision=`MODIFY`（機能削減で属性を減らす選択を含む）/`ACCEPT`/`HOLD`。
- **使われる仕組み**: Rule生成式 `f(Category + Product Attributes + Risk Attributes + Tier)` / 属性合成の加算原則（B-1: 属性でルールは増えるだけで緩和不可）/ 未知カテゴリーフロー（受付不可の禁止・保守側PRISK初期値）/ 矛盾解決決定表（18番§2.4）。
- **判定**: `PASS`。複合リスクはこのArchitectureの設計動機そのものであり、18番§5で同型の机上デモが成立している。

---

## 5. ケース検証（14〜15: 品質Tier両極）

### Case 14: 高級ブランド品質

- **入力状態**: QualityLevel=`Q4_LUXURY` / BrandImpact=`BIMP_HIGH`〜`CRITICAL` / 顧客4択では「プレミアム」選択。BudgetStatus=`FLEXIBLE`想定（ASSUMPTION: 品質優先案件）。
- **処理経路**: Quality Recommendation Engine（価格ポジション上位＋ギフト/百貨店チャネル→Q4推奨。BIMP_CRITICALはQ3下限クランプ）→ Tier確定（C_HUMAN_DECISION）→ Q4パラメータ展開（AQL 0.65/1.5・検査水準III・限度見本必須＋A面写真基準書・PilotRun必須・第三者検品二重確認・開封体験検査・D65色確認）→ RFQ（品質コスト増をCost Ledgerに反映し顧客に+X%で可視化）→ Loop=1〜2周 → GoldenSample＋LimitSample双方签封 → G-02。
- **使われる仕組み**: QT-01〜26のQ4列（16番§1.2）/ 品質⇄コスト可視化 / GoldenSample・LimitSampleの版管理・LOCKED運用 / QT-26（写真50枚＋動画の検品報告）。
- **判定**: `PASS`。Q4はTierパラメータの正準列であり、追加機構なしで最上位品質運用に到達する。

### Case 15: 低価格ノベルティ

- **入力状態**: QualityLevel=`Q1_ESSENTIAL`（顧客4択「コスト重視」）/ BrandImpact=`BIMP_LOW` / BudgetStatus=`MAX_UNIT_PRICE`想定（配布予算）/ QuantityStatus=`TARGET_QUANTITY`（配布数）。
- **処理経路**: Quality Recommendation Engine（無償配布=価格ポジション最下位→Q1推奨）→ Q1パラメータ（AQL 4.0/6.5・水準I・LimitSample不要・工場自検＋書類確認）で検品コストを単価に対して非過大化 → **ただしFIXED MINIMUM（安全・法規・重大機能）は全Tier同値**: 溶出・電気安全等は省略不可、CRITICAL不良=Ac0固定 → RFQ → Loop=1周想定・`ACCEPT`。Q1運用時はクレーム期待損+1〜3%を内部原価に計上（16番§5.1）。
- **使われる仕組み**: Q1列パラメータ / FIXED MINIMUMの構造強制（「Q1だから安全試験を省く」設定は登録拒否）/ 顧客文言「どのレベルでも安全と法律は同じ厳しさ」固定表示 / G-12（数量概算進行）。
- **判定**: `PASS`。低価格側への緩和は外観・検品密度に限定され、安全の緩和はデータ構造上作れない。両極ともTierという同一機構で処理される。

---

## 6. ケース検証（16〜20: ライフサイクル系）

### Case 16: Repeat Order

- **入力状態**: Entry Route=D（REPEAT ORDER）。前回Projectの承認済みデータ（Specification/QualityStandard/GoldenSample/PO）が存在。顧客入力は数量・納期のみ。QuantityStatus=`TARGET_QUANTITY`。
- **処理経路**: 前回Approved Dataをコピー（全SpecField `CONFIRMED`維持・仕様再入力ゼロ）→ **再確認項目のみ自動チェック**（工場価格 / MOQ / 材料 / 納期 / 運賃 / 為替 / 法規改正 / 部品供給可否。§19）→ 差分なし: Loop=0〜1周（Repeat見積依頼=A_FULL_AUTO）→ `ACCEPT` → G-02はReference Set=**Previous Approved Production**で即充足 → PO。差分あり（値上げ・材料変更等）: 通常Loopへ（`NEGOTIATE`/`RE_SOURCE`）。仕様変更希望が出た場合はECRフローへ分岐（11番 D-2）。
- **使われる仕組み**: §19 Repeat Order機構 / Quote Version（前回版と新版の価格差追跡）/ G-02のPrevious Approved Production構成 / 人間工数=初回の20%以下（01番§4）。
- **判定**: `PASS`。リピートは第4のEntry Routeとして初期設計から組み込まれ、v3.0で再確認項目が明文化済み。

### Case 17: V1→V2改良

- **入力状態**: 納品済みProduct V1に対する改良要望（FeedbackType=`IMPROVEMENT_REQUEST`/`NEW_FEATURE_REQUEST`等が起点）。Entry Route=D起点で仕様変更あり、または新Project起票。OdmLevel=変更範囲による。
- **処理経路**: V1のFeedback集約 → 改良Requirement差分解析 → V2仕様策定（V1 Specificationを親とした新版。旧版`SUPERSEDED`）→ RFQ（変更部分の金型改修・追加試験費）→ Loop=1〜2周 → V2用Reference Set再構成（変更部のGoldenSample/図面再承認。G-02）→ 量産。**Version系譜管理**: V1→V2間で仕様差分/BOM差分/品質差分/工場差分/コスト差分/対応Feedback/変更理由を比較可能に保持（§19 Product Evolution）。
- **使われる仕組み**: ProductFeedback（FeedbackType/FeedbackCause）/ Product Evolution版系譜 / ECR（承認済み仕様の変更手続き）/ イミュータブル版管理（§7）/ Knowledge資産化（V1の不良実績をV2の検品重点に反映）。
- **判定**: `PASS_WITH_CONFIG`。機構は§19に規定済みで構造変更は不要。ただし15番データ設計（v0.x）には `product_feedback` / Product Version系譜のエンティティが未反映であり、**§19規定内容のテーブル追補**（既定義アーキテクチャの実装反映であり、新構造の発明ではない）が前提。

### Case 18: 前商品とは別カテゴリーの新商品

- **入力状態**: 既存Clientから別カテゴリーの新規相談（例: タンブラー実績顧客がアパレルを相談。※例でありシステム仕様ではない）。Entry Route=A/B（Repeatではない）。新カテゴリーのRule Packは存在する場合（CAT-001〜020）と不在の場合の両方を想定。
- **処理経路**: 新Project起票 → **Client Profileの引き継ぎ**（ブランド期待 / 品質嗜好 / 承認傾向 / 商流履歴 / 過去問題。§19 Next Product）→ DNA再推定（ExperienceLevelは商品開発経験として引き継ぎ候補、ProductRisk等は商品ごとに再評価）→ Rule Engineが新カテゴリーPack＋属性で適用ルールを再合成（前商品のルールは持ち込まない）→ 以降は通常Loop。Pack不在なら未知カテゴリーフロー（U-1〜U-8: 属性ベース暫定Rule→人間補正→実績蓄積→新Pack登録）。想定Loop=1〜2周。
- **使われる仕組み**: Profile分離（Client知識とProduct Attributesを分離しているため「顧客は既知・商品は新規」が矛盾なく表現できる）/ 未知カテゴリー対応（受付不可の禁止）/ Knowledge資産化（Client Knowledge再利用）。
- **判定**: `PASS`。Profile分離の設計意図（DNAに全部を詰めない）がまさにこのケースを成立させる。カテゴリー追加はコード修正なし（18番§7）。

### Case 19: 納品後に不良Feedback発生

- **入力状態**: Project=`CLOSED_WON`後（納品はProjectの終了ではない。§0-10）。顧客から不良報告（FeedbackType=`DEFECT`、Complaint起票）。Lot・写真・数量が入力。
- **処理経路**: Complaint受付（`RECEIVED`）→ 調査（`INVESTIGATING`: Traceability（トレーサビリティ：材料・工程・ロットを遡る記録体系）でLot→検品記録→材料ロットを遡及）→ 根本原因判定（`FACTORY / TRADING_COMPANY / CLIENT / LOGISTICS / END_USER / UNKNOWN`。**UNKNOWN≠商社責任**）→ CAPA発行（`REQUESTED`→…→`CLOSED`）→ 是正確認。同一Lot起因が疑われる未出荷在庫は100%検査へ切替（16番§4.4-(5)）。重大案件はD_MANUAL_EXCEPTION（P-14）。並行してProductFeedbackへ記録し、次Version・次ロットの検品重点とFactory Scoreに反映。
- **使われる仕組み**: Complaint/CAPAのStatus機構（v2.2 enum）/ FeedbackCause証跡設計（原因区分＋証拠必須で「問題発生=Crossimage責任」にしない）/ 100%検査切替・厳格検査切替 / CAPA→Rule Pack次版反映（不良実績のKnowledge化）。
- **判定**: `PASS`。納品後継続はv3.0の明文原則で、クレーム〜CAPA〜再発防止の機構はLayer 1に完備。

### Case 20: エンドユーザーの誤使用が疑われる案件

- **入力状態**: 納品後のトラブル報告だが、症状・状況から誤使用の可能性（例: 指定外の使い方による破損。※例でありシステム仕様ではない）。FeedbackCause初期値=`UNKNOWN`（推測確定しない）。
- **処理経路**: Complaint受付 → 調査: 現品・写真・使用状況ヒアリング＋Traceability照合（同Lotの検品記録・試験成績で「出荷時は基準内」を立証できるか）→ 原因判定はEvidence必須: 誤使用が立証できれば FeedbackCause=`END_USER_MISUSE` / Complaint根本原因=`END_USER`、立証できなければ`UNKNOWN`のまま（**UNKNOWN≠商社責任を正準定義**）→ 対応Action: 取扱説明の改善（FeedbackType=`INSTRUCTION`/ FeedbackCause=`INSTRUCTION_GAP`として別記録）・注意表示追加・次VersionでのMisuse対策（フールプルーフ化）を提案。責任交渉が必要な場合はD_MANUAL_EXCEPTION。
- **使われる仕組み**: FeedbackCause enum（`END_USER_MISUSE` / `INSTRUCTION_GAP` / `UNKNOWN`が正準値として存在）/ 証跡設計（原因区分と証拠の必須化。§19）/ 検品報告・試験成績書のDocument保存（出荷時品質の立証材料）/ Product Evolution（誤使用知見の次版反映）。
- **判定**: `PASS`。「誤使用の疑い」を推測で確定せず、証拠付きで原因区分するためのenum・証跡・免責構造がv3.0で正準化されている。

---

## 7. 集計と総合判定

### 7.1 集計表

| 判定 | 件数 | 該当ケース |
|---|---|---|
| `PASS` | **18** | 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20 |
| `PASS_WITH_CONFIG` | **2** | 7（完全ODM: 金型の所有権・償却方式・金型MOQ次元の設定追加）、17（V1→V2: §19規定エンティティの15番データ設計への追補） |
| `GAP` | **0** | なし |

### 7.2 総合判定

**Architecture変更は不要（GAP 0件）。** 20ケースすべてが、Universal Core + Category Rule Pack + Commercial Feasibility Loop + Cost Architecture + Profile分離 の既存Architectureで処理可能である。判定根拠の要約:

1. **情報不足系（1〜4）**: BudgetStatus/QuantityStatusの状態化と§0-6（事前確定前提の禁止）により、「何が決まっていて何が不明か」の全組合せがLoopの入力として正準表現できる。
2. **不成立系（5〜6）**: MOQのCommercial Condition化・Option型提案・CustomerDecision 7分岐が、不成立をエラーではなくLoopの標準状態として吸収する。
3. **ODMレベル系（7〜9）**: G-02のReference Set可変化（v3.0改訂）により、フルODMから包装のみ変更まで同一Gateで強度だけが変わる。
4. **カテゴリー・リスク系（10〜13）**: 属性合成（加算のみ・厳しい方優先・未知カテゴリー受付不可の禁止）が、単一カテゴリー分類では漏れる複合リスクを拾う。
5. **品質両極（14〜15）**: TierはツマミでありFIXED MINIMUMは構造強制のため、最上位も最下位も同一機構・同一安全水準で成立する。
6. **ライフサイクル系（16〜20）**: §19（納品後継続・Evolution・Knowledge資産化）とFeedbackType/FeedbackCauseのenum化により、納品後の全分岐（リピート・改良・別商品・不良・誤使用疑い）が第一級の商流として表現できる。

### 7.3 フォローアップ所見（GAPではない実装反映事項）

以下はArchitecture変更ではなく、既定義内容の下位文書への反映・設定整備であり、Phase 1移行時の作業項目として記録する。

| # | 所見 | 種別 | 対応先 |
|---|---|---|---|
| F-1 | 15番データ設計に v3.0エンティティ（CommercialLoop `{ProjectID}-LOOP-{NN}` / Cost Ledger / ProductFeedback / Product Version系譜 / Commercial Profile）が未反映 | §16・§17・§19既定義の実装追補 | 15番 次版 |
| F-2 | 金型（Tooling）のCustom Cost Item属性セット（所有権・保管場所・償却方式・金型寿命ショット数）の初期シード定義 | CONFIGURABLE_RULE整備（Case 7） | 17章Cost Ledger初期シード / 15番 |
| F-3 | Loop周回数・Quote Acceptance Rate・MOQ Acceptance Rate等のKPI計測定義（§20-11）とLoopレコードの紐付け | CALIBRATION_VALUE計測設計 | 15番 / 実装フェーズ |
| F-4 | ケース18の「ExperienceLevel引き継ぎ」の既定（別カテゴリーでも経験値を引き継ぐか）は未確定のため `TBD`（AI推定+人間確定の現行運用で開始可） | TBD | 運用ルール |

以上により、DoD-10「20ケースStress TestでArchitecture変更なしに処理可能なことの確認」を**充足**と判定する。

---

## 8. 再確認（v1.1・2026-08-11・Freeze前検証）

オーナー条件付き承認（14番§8）のFreeze条件(1)〜(5)のうち、是正パスR1/R2/R3による22番§1必要変更16件（A-01〜A-16）の実反映完了後、本書の20ケース判定が維持されるかを実文書突合で再確認した。方法: 判定根拠に是正が及ぶケースの再点検 + その他ケースへの影響なし確認（全件再実行ではない）。

### 8.1 A-01〜A-16の実反映確認（Freeze条件(1)(2)）

全16件を反映先文書の該当箇所で確認し、**16件全件が反映済み**（不足0・逸脱0）。既存構造の破棄はなく全件が追加・条件書換え・注記で吸収されている（Freeze条件(2)充足）。要点: A-01=15番§2.15（v3.0テーブル群18表+TBD骨子2表・最終89表）/ A-02=11番§10+STEP12〜16 / A-03=15番§2.4（quotes版連鎖・前提条件9点・quote_conditions/moq_dimensions）/ A-04=10番§3.2（JP-LOOP-010/020/030・15項目完全形）/ A-05=10番§8（KPI16指標）/ A-06=15番§4.1 gate_definitions・10番JP-PROD-005/020+JP-SMP-050/060・16番QT-12の3箇所で「Approved Production Reference Set / required_components全行APPROVED / GS要否は構成ルールによる」の同一概念に整合（05 v3.1 §9・18番§1.3(10)とも一致）/ A-07=01番v1.1 / A-08=18番§1.3(10)第10要素REFERENCE_SET+RS略号+cost_item_seed_refs+MOQ次元候補 / A-09=20番v1.1（16点セットへの改訂・承認済みの注記方式。差替えでなく経緯記録保存＝目的達成の軽微な実装差として容認）/ A-10=11番STEP3/8ほか「工場確認前の目安」注記 / A-11=12番v0.5（RFQ§四第9〜12項+回収Excel同列）/ A-12=15番duty_assessments+imports注記・13番v0.5 / A-13=16番6 Dimension化 / A-14=19番#43〜52 / A-15=21番P-9〜P-16 / A-16=03番v1.1。

### 8.2 20ケース再判定サマリー（Freeze条件(4): GAP 0維持）

| ケース | 影響する是正 | 再確認結果 |
|---|---|---|
| 1〜6（情報欠落・不成立系） | A-01/A-03（commercial_profiles・commercial_loops・quote_conditionsが15番に実装定義） | 判定根拠が「Governance規定」から「スキーマ実装定義済み」へ強化。`PASS`維持 |
| 7（金型ODM） | A-01/A-03/A-08/A-11（費目シード・MOQ次元マスタ・RFQ回収列が定義済み） | `PASS_WITH_CONFIG`維持。必要設定は§8.3で確定 |
| 8〜9（ODM_1/包装のみ） | A-06/A-08（Reference Set可変構成が15番・18番§1.3(10)に着地。ODM_0/1構成例明記） | `PASS`維持 |
| 10〜15（カテゴリー・リスク・Tier両極） | A-13（QT-19〜21の帰属変更のみ・パラメータ値/26項目/FIXED MINIMUM不変） | 構造影響なし。`PASS`維持 |
| 16（Repeat） | A-04（JP-RPT-020の8項目チェックリスト化が10番に実装） | `PASS`維持 |
| 17（V1→V2） | A-01（products/product_versions/product_feedbacksが15番§2.15.5に着地=F-1消化） | `PASS_WITH_CONFIG`維持。前提だった「15番へのテーブル追補」は完了、残りは初期データ設定のみ（§8.3） |
| 18〜20（別カテゴリー・不良・誤使用） | 影響なし（Complaint/CAPA/Traceability/FeedbackCause機構は無変更） | `PASS`維持 |

**再判定結果: PASS 18 / PASS_WITH_CONFIG 2 / GAP 0（維持）**。DoD-10充足の判定は変わらない。

### 8.3 PASS_WITH_CONFIG 2件の必要設定データと初期設定方針（Freeze条件(5)）

**Case 7（金型が必要な完全ODM）** — 構造の受け皿は全て定義済み。必要なのは以下のCONFIGURABLEデータ整備のみ:

| # | 必要設定データ | 受け皿（定義済み構造） | 初期設定方針 |
|---|---|---|---|
| 1 | 金型関連Cost Itemシード | `cost_item_catalog`「開発・初期」分類（金型（Tooling）/ 治具 / 印刷版・版下。15番§2.15.3費目シード対応表#4） | Phase 1データ整備で投入。金型費は `cost_class=ONE_TIME`・`cost_responsibility`初期値=`TBD`（負担者はLoop内のOption提示・顧客合意で確定し、確定時に新行） |
| 2 | 金型MOQ次元 | `moq_dimensions`初期シード「Custom Mold起工数量」（15番§2.4）+ `quote_conditions.condition_type=TOOLING` | 初期シード7次元に含めて投入。取得列は12番v0.5 RFQ§四第9〜10項（回収Excel同列）→取込時にquote_conditionsへ構造化登録 |
| 3 | 金型の所有権・保管・移管の記録項目 | Custom Cost Item属性セット（所有権者 / 保管場所 / 移管条件 / 金型寿命ショット数=F-2）。記録先は `cost_items.assumption`+`evidence_document_id`、移管・精算はECR/精算Task（15番§3.7 PO取消副作用）で証跡化 | 初期値方針: 顧客負担時=CLIENT所有・工場保管（保管場所・返却条件を受注時に明記）、Crossimage負担時=CROSSIMAGE所有。属性セットのシード定義をPhase 1データ整備の受入基準に含める（F-2の消化先。構造変更不要） |
| 4 | 償却方式の選択肢定義 | Loop Option提示の選択肢データ（22番§6.1 options_presented）+ quote_conditions（TOOLING行）への記録 | 初期3方式=一括負担 / 単価上乗せ償却 / 分割（CONFIGURABLE。Case 7本文どおり）。選択結果と償却前提はcost_items.assumptionに必須記載 |

**Case 17（V1→V2改良）** — 前提条件だった「§19規定エンティティの15番追補」は15番v0.3で完了（F-1消化）。残る設定データ:

| # | 必要設定データ | 受け皿（定義済み構造） | 初期設定方針 |
|---|---|---|---|
| 1 | Product / ProductVersion / ProductFeedbackの実装 | 15番§2.15.5（`PRD-{NNNN}`グローバル採番・parent_version_id系譜・addressed_feedback_ids・`{ProjectID}-FB-{NN}`） | Phase 1 Minimum Schema「納品後」群3表として実装（15番§10.2）。TYPEコードFB/PRDは05 v3.1採用済み＝追加のGovernance変更不要 |
| 2 | FeedbackType / FeedbackCause enum | 05 v3.0 §3正準enum | 正準値をそのまま使用（新設不要）。原因確定前は`UNKNOWN`保持（UNKNOWN≠商社責任） |
| 3 | Feedback source区分マスタ | 15番§2.15.5（CONFIGURABLE） | 初期5区分=CLIENT / END_USER / EC_REVIEW / CN_OFFICE / INTERNAL で開始 |
| 4 | Complaint昇格条件・収集タイミング | 昇格条件=CONFIGURABLE_RULE、収集タイミング=CALIBRATION_VALUE（22番§21） | 昇格条件初期値=「責任・是正・賠償を伴う事案」（判断は人間。Feedback登録自体は承認不要の軽量運用）。能動収集Taskは納品後30/60日で開始し実測で校正 |
| 5 | V1→V2差分比較 | 導出ビュー `v_product_version_diff`（15番§2.15.5。§19の7比較軸） | FK済みデータからの機械生成のみ（人間の資料作成ゼロ）を実装受入基準とする |

### 8.4 検出した不整合と是正（Freeze条件(3)）

| # | 内容 | 種別 | 処置 |
|---|---|---|---|
| 1 | 01番§6「Quality Dimension 5分類」がA-13（Packaging第6 Dimension正式化=16番v0.3）と不一致 | 軽微（数値の食い違い） | **是正済み**: 01番v1.2で6分類へ更新（16番v0.3.1で読み替え注記も解消） |
| 2 | 01番§5のHard Gate例示「Golden Sample未承認→量産不可」がG-02 v3.0改訂前の表現のまま残置 | 軽微（表現ズレ） | **是正済み**: 01番v1.2で「Approved Production Reference Set未確定→量産不可（Golden Sampleは構成要素の一つ）」へ更新 |
| 3 | 15番§2.15末尾の22番§17引用が22番の実記載（「既存64」「v3.0追加15表+マスタ」）と字句不一致 | 軽微（参照ズレ） | **是正済み**: 15番v0.3.1で実記載に即した記述へ修正。22番の「既存64」は15番v0.2時点の旧集計値（実数69へ是正済み）、「15表」はcost_categories/cost_item_catalogの2参照マスタを表数に含めない数え方で15番の17表と同内容＝**算術矛盾なし**（22番§17の群別集計〔合計79表〕は正しい）。22番本文はレビュー時点の記録として不変更 |
| 4 | 22番§24-②の「91Task+Loop系3Task」（=94）に対し、最終Task数は95（Loop系3件+JP-PROD-005=A-06由来の1件） | 記録のみ（構造矛盾ではない。JP-PROD-005は22番⑥⑬の承認範囲内） | 10番v0.5に達成計算明記済み: 日本側A+B=77/95=**81.1%**、日中合算=(77+28)/(95+35)=105/130=**80.8%**（≥80%維持。22番§24-⑩の承認条件充足。検算一致を本検証で確認） |

**新たな重大構造矛盾: なし**。横断確認の結果: (a)Task数・Automation比率は10番v0.5の集計と検算一致（95件/130件・81.1%/80.8%）。(b)テーブル数集計（最終89表=実数69+追加20〔うちTBD骨子2〕、Phase 1 Minimum約79表=62+17+moq_dimensionsマスタ）は15番内・22番§17群別集計と算術整合。(c)G-02は05 v3.1/10番/15番/16番/18番の5文書で同一概念。(d)11番STEP12〜16 ⇄ 10番JP-LOOP-010/020/030 ⇄ 15番commercial_loops State Machine（OPEN→ANALYZING→OPTIONS_PRESENTED→DECIDED→CLOSED・NEGOTIATEのみ同Loop内戻り・Loop各周回の顧客操作3画面以内）は3者整合。(e)新規追記部分に言語ルール（§14）違反の英語単独出現なし。

**結論: Freeze条件(1)〜(5)の検証項目はすべて充足（判定=PASS）。GAP 0維持・PASS_WITH_CONFIG 2件の必要設定データと初期設定方針は§8.3のとおり明文化済み。**

---

## Change Log

| 版 | 日付 | 変更 |
|---|---|---|
| v1.0 | 2026-08-10 | 初版作成（A11）。オーナー指定20ケースの机上検証。結果: PASS 18 / PASS_WITH_CONFIG 2 / GAP 0、Architecture変更不要。フォローアップ所見4件（F-1〜F-4）を記録 |
| v1.1 | 2026-08-11 | §8「再確認（Freeze前検証）」を追加。是正パスR1/R2/R3完了後の検証: A-01〜A-16全16件の実反映を確認（不足0・逸脱0）、20ケース再判定=PASS 18 / PASS_WITH_CONFIG 2 / **GAP 0維持**、PASS_WITH_CONFIG 2件（Case 7金型ODM / Case 17 V1→V2）の必要設定データ・初期設定方針を明文化（§8.3。F-1消化確認・F-2の消化先指定）、軽微不整合3件を是正（01番v1.2・15番v0.3.1・16番v0.3.1）+記録1件。新たな重大構造矛盾なし。Statusヘッダをv1.1へ |
