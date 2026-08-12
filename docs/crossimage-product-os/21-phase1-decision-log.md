# 21. Phase 1 引き継ぎ Decision Log

| 項目 | 値 |
|---|---|
| Status | Reviewed / v1.2 / 2026-08-11 / 秘書AI |
| 目的 | A7 Red Team の指摘事項・残余リスク・暫定判断を**消さずに**Phase 1へ引き継ぐ恒久記録。A7がPASS（承認）となっても本ログは削除・改変しない（追記のみ） |
| 運用 | Phase 1開始時に本ログをBacklog（対応予定リスト）化する。消し込みはオーナーまたはMGR承認+本ログへの消し込み記録を必須とする |

## 1. A7指摘事項の最終状態（詳細は 17-a7-red-team.md。同文書は恒久保存）

| 区分 | 件数 | 状態 |
|---|---|---|
| CRITICAL | 3 | 全件消化済み（claims表・sales_orders・IR-04整合。A7再検証OK） |
| MAJOR | 11 | 消化済み。ただし下記§3の運用系残置事項を含む |
| MINOR | 9 | 消化済み（軽微所見1件を§3-5に残置） |
| 条件 C-01〜C-07, C-09 | 8 | 消化済み・A7再検証で差戻し0件 |
| 条件 C-08 | 1 | **消化済み（v1.1更新・2026-08-11）**: 16点セット（22番§24）としてオーナー条件付き承認（承認記録=14番§8）。Phase 0 Freezeは同§8の11条件の是正パス完了+最終確認後に発効 |

## 2. 残余リスク（システムでは消せないもの — 17番の20ケースの要点、全文は17番参照）

Phase 1以降も存在し続けるリスク。仕組みではなく運用・契約・保険で対処する。

1. 為替・原材料・運賃変動によるマージン毀損（システムは警告まで。判断は人間）
2. 工場の意図的な隠蔽（下請け変更・材料変更）— 抜き打ち検品・実地監査が唯一の対策
3. 承認者の単一障害 — 代理ルールで緩和するが、実名割当と訓練は運用課題
4. AI出力（提案・翻訳・法規候補）の品質劣化 — 評価セット運用（C4 LLMOps）が未整備の間は人間承認で担保
5. 検品PASS後の市場不良の責任分界 — 契約テンプレート整備（Phase 1法務課題）
6. 現物ゴールデンサンプルとシステム記録の突合 — 3拠点保管の物理運用が前提
7. その他: 17番§残余リスク20ケースを正とする（本ログはインデックス）

## 3. 暫定判断事項（Phase 1で見直し・確定が必要なもの）

| # | 暫定判断 | 内容 | 見直し時期 |
|---|---|---|---|
| P-1 | **IR-04 テストケース裁定** | Vertical Sliceのフタ仕様を「完全密閉スクリュー式」に統一したのは**架空テストケースに対する設計フェーズの裁定**であり、実案件では密閉性能はClaim（性能主張）選択肢として顧客のC_HUMAN_DECISION（人間判断）。実装時にこの選択UIを必ず実装 | Phase 1実装時 |
| P-2 | **IR-13 自動化率の意味論** | A+B=81.0%（日中合算126Task）はDoD充足だが余裕わずか。中国側A分類に工場の物理作業が含まれる計数意味論は運用定義未了（C-f） | Phase 1初期 |
| P-3 | **Governanceのオーナー事後確認事項** — **消化済み（2026-08-11）** | v1.1（提案8件裁定）/ v2.1（A8/A9提案5件+IR-13裁定）/ v2.2（A3/A4提案裁定: Claim・G-16・Status enum群）/ v2.3（DoD-1範囲改訂）に**v3.0（実商流統合）を加えた全裁定**が、2026-08-11のオーナー条件付き承認（14番§8 付帯確認）で一括事後確認された。v3.1の正式化（TYPEコードLOOP/FB・PRD ID・CommercialLoop enum）も同承認に基づく。→ 消し込み記録表に記録 | 消化済み（C-08承認と同時） |
| P-4 | **B分類（暫定承認）項目** | 20番ブリーフの①②③⑤⑩はMVP検証後の見直しが約束されている。見直し実施はPhase 1のマイルストーンに組み込む | MVP検証後 |
| P-5 | **今決めない要素（C-a〜C-f）** | 20番ブリーフ§12の6件。決定条件（実測データ）が揃った時点でオーナー/MGRが決定し、本ログへ記録 | 各決定条件成立時 |
| P-6 | **軽微所見** — **消化済み（2026-08-11）** | 13番のヘッダ準拠欄が「05 v1.1」のまま（実害なし）→ 13番v0.5（是正パスR3・22番A-12のduty_assessments参照追記と同時）で「05 v3.1」へ是正済み。→ 消し込み記録表に記録 | 消化済み |
| P-7 | **物流順序の実装要件** | 出荷書類ドラフト・船腹予約（ブッキング）を出荷承認より先行させ、Hard Gateの停止対象は「船積み実行」のみとする是正が10番/15番に反映済み。実装時にこの順序を崩さない | Phase 1実装時 |
| P-8 | **G-16（未実証Claim表現）の運用** | 性能表現の根拠管理は新機構であり、Proposal送信・表現掲載Taskに配線済みだが、運用初期はWARN頻度の監視と表現辞書の整備が必要 | MVP初期 |
| P-9 | **Loop多周回の営業コスト増・失注**（v1.1追記・22番§23。収束しない案件に工数が溶ける） | 低減策: Loop回数KPI監視+HOLD/REJECT判断の基準づくり（人間判断のまま）。周回数閾値でMGRへ提示 | MVP初期〜（閾値=CALIBRATION_VALUE） |
| P-10 | **Cost Ledger入力負荷とAI推定依存**（v1.1追記・22番§23。Confidence低のまま受注する誤判断） | 低減策: Quotation承認画面にconfidence・ESTIMATED費目残数を強制表示。低confidence受注はMGR承認 | Phase 1実装時 |
| P-11 | **関税AI推定の誤り**（v1.1追記・22番§23。BROKER_CONFIRMED前の受注でLanded Cost乖離） | 低減策: DutyStatus（関税確度）をQuotation承認画面に表示。高税率リスク品はREVIEW_REQUIRED時点で通関業者確認をTask化 | Phase 1実装時 |
| P-12 | **Feedback収集率が上がらない**（v1.1追記・22番§23。顧客が報告しない＝賢くならない） | 低減策: 能動収集Task（納品後30/60日）+Repeat提案時のヒアリング統合。Feedback Rate KPI監視 | MVP初期〜 |
| P-13 | **Knowledge汚染**（v1.1追記・22番§23。誤った実績・例外的案件がAI推定を歪める） | 低減策: Knowledge行のsource_project追跡+basis区分（ACTUAL/CONFIRMED/AI_ESTIMATED）必須。異常値の還流はレビュー付き | Knowledge稼働時（Phase 1後半） |
| P-14 | **Reference Set構成ルールの初期不備**（v1.1追記・22番§23。G-02が緩すぎ→事故 / 厳しすぎ→Repeatの利点消滅） | 低減策: 初期ルールは保守側（現行GS必須相当）から開始し、実績による緩和方向の変更はMGR承認必須（18番§1.3(10)に反映済み） | MVP初期〜 |
| P-15 | **Commercial ProfileとSpecFieldの二重管理ズレ**（v1.1追記・22番§23。数量の置き場所移行期の不整合） | 低減策: 移行時に参照一本化を実装受入基準化（22番§5）。二重書込みをスキーマで禁止 | Phase 1実装時 |
| P-16 | **Loop概念の顧客過負荷**（v1.1追記・22番§23。選択肢が多すぎて決められない） | 低減策: 顧客表示は常に「おすすめ1+代替」の既存原則（16番§6.2）をLoop Optionにも適用。EXP_BEGINNERはOption数上限（10番JP-LOOP-020に反映済み） | MVP初期〜 |

## 3.1 Phase 0 Freeze後の運用ルール（v1.1追記・オーナー指定〔14番§8〕）

1. **新たな改善案・追加アイデアは、重大なArchitecture欠陥でない限りPhase 1 Backlog（本ログ）へ登録する。Phase 0の再拡張は禁止**（オーナー指定。Phase 0成果物への追記は、Freeze条件の是正パスで指示された反映と重大構造矛盾の是正のみ許される）。
2. Phase 1はVertical Slice（**Loop最低2周**のテストケースを必須に含む。22番§18）を最優先する。
3. 判断に迷う場合（「これは重大なArchitecture欠陥か、改善アイデアか」）は、オーナー/MGRへ提示して裁定を仰ぎ、裁定結果を本ログへ追記する（勝手なPhase 0編入をしない）。
4. **Visual Effect（Ambient Particle / WebGL / Audio等の視覚・聴覚演出）を将来実装する場合は、Security / Performance / Accessibility のGateを通す構造とし、Business Logicと分離する**（v1.2追記・オーナー指定〔2026-08-11承認の付帯〕。Backlogルールとして記録）。
5. **Presentation Layer分離原則（v1.3追記・オーナー指定〔2026-08-11〕）**: 粒子・流体・水面・光・Glass・Ripple・Soundは、Business Architectureと分離した **UI/UX内の Visual Design / Motion Design / Interaction Design / Sound Design Layer（Presentation Layer）** として扱う。**Phase 0 ARCHITECTURE_LOCKの対象にせず、後から継続的に変更可能**とする。Visual EffectはBusiness Logic・State Machine・Data Modelと直接密結合させず、**業務State→Visual LayerへのEvent渡し**（抽象State名のみ。機微データ不可=25番§9.4整合）とし、Visual Effectの変更・削除がBusiness Functionに影響しない構造を必須とする。
6. **Visual実装順（v1.3追記・オーナー指定）**: (1)本体Frontend Architecture確定 → (2)Visual PoC専用ページ作成〔完了・poc/visual-poc.html〕 → (3)Particle/Flow/Ripple/Orb/Glass/Soundの個別確認〔完了・26番〕 → (4)Visual DirectionのOwner Review → (5)承認後に Design Token / Motion Token 化 → (6)Dashboard・Project等へ段階的展開。**最初のVertical Sliceでは業務機能完成を優先し、Visual PoCは並行レーンで実施する**。

## 4. Phase 1開始の前提条件（再掲）

1. C-08（オーナー承認10点セット）の承認記録が 14-integration-review.md に追記されていること
2. 本ログがPhase 1のBacklogに登録されていること
3. 実装順序は 03-roadmap.md および Governance §0 を正とする（A7承認までコード実装禁止の制約は、C-08消化をもって解除される）

## 消し込み記録（追記専用）

| 日付 | 項目 | 消し込み内容 | 承認者 |
|---|---|---|---|
| 2026-08-11 | P-3 | Governance v1.1〜v3.0の秘書AI裁定は、オーナー条件付き承認（14番§8 付帯確認）で一括事後確認済み。v3.1正式化（TYPEコードLOOP/FB・PRD ID・CommercialLoop enum）も同承認に基づく | オーナー（14番§8・2026-08-11承認記録） |
| 2026-08-11 | P-6 | 13番v0.5でヘッダ準拠欄を「05 v1.1」→「05 v3.1」へ是正（是正パスR3・22番A-12反映と同時消化） | オーナー（14番§8 Freeze条件(1)〔22番§1必要変更の実反映〕の範囲内として承認済み） |
| 2026-08-11 | ACR-SEC-01（25番） | **承認（ARCHITECTURE_LOCK扱い）**: AI Data Scope Contract。AI/LLMの全Project・全Clientデータ包括アクセス設計を禁止し、Task/Role/Project/Data Type/Purposeの5軸Least Privilege+各AI TaskのAllowed Data/Denied Data/Allowed Tools/Allowed Output Destination明示構造を正式仕様化。反映先: 25番v1.0 §9.4・05番v3.2 §13-B | オーナー（2026-08-11） |
| 2026-08-11 | ACR-SEC-02（25番） | **承認（ARCHITECTURE_LOCK扱い）**: AI Output Security Gate。AI生成物の外部送信・Exportは共通経路（AI Generated Content→Output Security Gate→Role/Destination Policy Check→必要に応じHuman Approval→External Send/Export）を必須通過。対象10チャネル（Email/PDF/Excel/CSV/API/Notification/WeChat/Client Portal/Factory Document/CN_OFFICE Output）、Factory/CN_OFFICE向け6項目混入禁止、allowlist方式優先。反映先: 25番v1.0 §9.7/§10・05番v3.2 §13-B | オーナー（2026-08-11） |
| 2026-08-11 | QuestionClass AI_INFERABLE（24番§18提案①） | **条件付き承認**: QuestionClassを4分類（BLOCKER/IMPORTANT_LATER/OPTIONAL/AI_INFERABLE）へ拡張。条件: AI_INFERABLE≠CONFIRMED・AI_INFERRED等のStatus保持必須・確認/証跡なき正式条件への自動昇格禁止・重要8領域（Safety/Regulatory/Material/Critical Function/Production Reference/Price Commitment/MOQ Commitment/Legal・Compliance）はAI推定のみを最終根拠にしない。反映先: 05番v3.2 §3・24番v1.1 §7.1/§18 | オーナー（2026-08-11） |
| 2026-08-11 | Security Baseline（25番§18.1） | **承認（3階層再分類の条件付き）**: Phase 1 Minimum Security RequirementsをSecurity Baselineとして承認。SECURITY_ARCHITECTURE_LOCK（11件）/ SECURITY_IMPLEMENTATION_REQUIREMENT（13件）/ SECURITY_CALIBRATION（6件）へ再分類し、数値・閾値のARCHITECTURE_LOCK固定を禁止。これによりACR 2件承認と合わせ25番の判定はREADY_FOR_SECURE_IMPLEMENTATIONへ更新（Business Logic本実装は未開始のまま）。反映先: 25番v1.0 §18.1/判定 | オーナー（2026-08-11） |

## Change Log

| 版 | 日付 | 変更 |
|---|---|---|
| v1.0 | 2026-08-10 | 初版（秘書AI）。A7指摘の最終状態・残余リスク・暫定判断P-1〜P-8・Phase 1前提条件・消し込み記録表 |
| v1.1 | 2026-08-11 | 是正パスR3（22番§1 A-15+オーナー条件(6)〔14番§8〕）。§3へP-9〜P-16（22番§23の残余リスク8件・低減策付き）を追記。P-3を消化済みへ更新（2026-08-11オーナー承認〔14番§8〕による一括事後確認）、P-6を消化済みへ更新（13番v0.5是正と同時）、両件を消し込み記録表へ記入。§3.1「Phase 0 Freeze後の運用ルール」（新アイデアはPhase 1 Backlogへ・Phase 0再拡張禁止=オーナー指定）を追記 |
| v1.2 | 2026-08-11 | **2026-08-11オーナー承認4件（Security/UX Governance承認3件+Security Baseline承認）を消し込み記録表へ追記**: ACR-SEC-01（AI Data Scope Contract・ARCHITECTURE_LOCK）/ ACR-SEC-02（AI Output Security Gate・ARCHITECTURE_LOCK）/ QuestionClass AI_INFERABLE（条件付き）/ Security Baseline（3階層再分類条件付き。25番判定=READY_FOR_SECURE_IMPLEMENTATION）。§3.1へ第4項（Visual Effect〔Ambient Particle/WebGL/Audio等〕は将来実装時にSecurity/Performance/AccessibilityのGateを通しBusiness Logicと分離する=オーナー指定Backlogルール）を追記 |
| v1.3 | 2026-08-11 | オーナー指示（Visual参考イメージ4点提示と同時）を§3.1へ追記: 第5項 Presentation Layer分離原則（Visual/Motion/Interaction/Sound LayerはARCHITECTURE_LOCK対象外・継続変更可・Event渡しで疎結合）、第6項 Visual実装順6段階（(2)(3)は完了、現在(4)Owner Review待ち。Vertical Sliceでは業務機能優先・Visualは並行レーン） |
