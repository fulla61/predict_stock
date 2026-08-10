# 14. 統合レビュー報告書（Phase 0 成果物間矛盾の検出・裁定・反映記録）

| 項目 | 値 |
|---|---|
| Status | **Reviewed** |
| 版 | v1.1 |
| 日付 | 2026-08-10 |
| 作成 | 秘書AI（統合レビュー担当） |
| 対象 | 10-a1-business-workflow.md / 11-a2-customer-journey.md / 12-a5-china-ops.md / 13-a6-regulatory.md（いずれもv0.1 Draft時点を検査、裁定反映後v0.2 Reviewedへ更新） |
| 準拠 | 05-governance-pack.md v1.1（SoT優先順位: Governance Pack > 本書 > 各エージェント成果物、Governance §6-2） |

修正原則: **Governance Pack > 具体性の高い記述 > 抽象記述**。Vertical Sliceの実データは「**350mlステンレス真空断熱タンブラー・初回1,000個・OPTION B選択**」を正とした。設計判断を要する矛盾は修正せず Open Issue として記録し、A3/A4/A7へ引き継ぐ。

---

## 1. Governance変更提案 8件の裁定表

| # | 提案者 | 内容 | 採否 | 理由 | 反映先 |
|---|---|---|---|---|---|
| 1 | A1① | Soft Gate `G-14` 法規チェック未着手（condition=NOT_CHECKED、checkpoint=RFQ発行・Quotation送信） | **採用**（A6①と一本化） | 初期チェック未実施のまま商流が先行するケースへの早期警告が既存レジストリに無い。条件・checkpointが具体的なA1案を正とした | 05 v1.1 §9 G-14行 / 10番 JP-RFQ-030・JP-PROP-070 gates / 12番 CN-RFQ-010 gates |
| 2 | A1② | Soft Gate `G-15` 工場Quote未登録（checkpoint=Quotation承認、「概算」明記強制） | **採用** | 実績レンジのみの顧客見積が確定価格として送られるマージン毀損事故の防止。既存Gateに重複なし | 05 v1.1 §9 G-15行 / 10番 JP-PROP-060 gates |
| 3 | A2① | QuestionClass enum（`BLOCKER / IMPORTANT_LATER / OPTIONAL`）の正準化 | **採用** | G-10・Task定義票 `blocking_condition`・A3 questionsテーブルが参照する分類の正準enumが未定義だった | 05 v1.1 §3 QuestionClass行 / 11番 §3.1 |
| 4 | A2② | 教育文言（EducationCard）ライフサイクルStatus新設（TEMPLATE/AI_DRAFT/APPROVED/RETIRED） | **不採用** | Status新設禁止原則（Governance §3）。提案文中の代替案どおり既存 `Approval` enum（PENDING/APPROVED/REJECTED/CONDITIONAL）を流用すれば十分 | 11番 Governance変更提案節に流用方針を明記 |
| 5 | A5① | Canonical Glossary 4語追加（FactoryAudit / IPQC / Rework / LoadingSupervision） | **採用**（表記一部修正） | 中国側Taskの頻出語で正準表に欠落。正式表記は IPQC=制程检验（IPQC）、LoadingSupervision=積込立会（提案時の制程巡检・積込監督から修正） | 05 v1.1 §1 / 12番 CN-INSP-010・CN-LOGI-020 表記 |
| 6 | A5② | Factory付帯記録ID `FA-{NNNN}-{TYPE}-{NN}` 追加 | **採用**（TYPE修正） | 案件非依存の工場単位記録にID形式が無かった。正式TYPE=AUD/DOC/CAPA（提案時のQUAはDOCへ統合、SCRは不採用: スコア履歴は独立ID不要のDBレコード） | 05 v1.1 §2 / 12番 §10 |
| 7 | A6① | Soft Gate `G-14` Regulatory未確認（condition=NOT_CHECKED/CHECKING/REVIEW_REQUIRED、checkpoint=RFQ発行・サンプル発注） | **不採用（単独案として）→ A1①と統合採用** | A1①と同番・同趣旨の重複提案。条件の広いA6案はWARN過多（Soft Gate形骸化リスク）のため、Gateとしては NOT_CHECKED のみに限定。CHECKING/REVIEW_REQUIRED時の警告は13番 §4.2 のReadiness WARN表示として維持 | 05 v1.1 §9 G-14行（統合注記） / 13番 §7 |
| 8 | A6② | G-03条件補記（PRODUCTION_READY / SHIPMENT_READY は Regulatory=APPROVED or NOT_APPLICABLE が必須） | **採用** | 「BLOCKEDでなければ量産可」の誤読による抜け道を塞ぐ。13番 §4.2 の解釈をGovernance本文で二重防御 | 05 v1.1 §9 G-03行注記 / 13番 §4.1 |

未裁定の提案は残っていない（Governance §12 DoD-7 充足）。

---

## 2. 検出した矛盾の一覧（IR-01〜IR-13）

深刻度: 高=顧客約束・法規・SoTの破綻に直結 / 中=Slice整合・ID・数値の食い違い / 低=表記・参照範囲の揺れ。

| ID | 深刻度 | 該当文書 | 内容 | 裁定 | 状態 |
|---|---|---|---|---|---|
| IR-01 | 中 | 11 vs 12/13 | **容量不整合**: A2シナリオ・Dashboardが450ml、A5のRFQ/规格书とA6詳細マトリクスは350ml | Vertical Slice正（350ml）に合わせA2を修正（Dashboard・STEP 5選択・STEP 9確定画面） | **修正済み**（11番） |
| IR-02 | 中 | 11 vs 12 | **本体色不整合**: A2顧客決定=ネイビー（PANTONE 2767C近似・マット、単色）、A5 RFQ/规格书=深灰7540C+米白7527Cの2色（600/400） | 顧客決定（YOUR DECISION）が上流SoT。A5を深蓝Pantone 2767C単色1,000只へ修正。RFQはG-11 WARN中のため`暂定`表記 | **修正済み**（12番） |
| IR-03 | 中 | 11 vs 12 | **ロゴ加飾方式不整合**: A2顧客決定=シルク印刷1色、A5 RFQ/规格书=激光雕刻 | 顧客決定を正としA5を丝网印刷（1色）へ修正（规格书2.9・5.6 Logo耐久試験も印刷適用に修正） | **修正済み**（12番） |
| IR-04 | **高** | 11 vs 12 vs 13 | **フタ仕様の三文書不整合**: A2顧客決定=しっかり密閉タイプ（重点管理項目=フタ密閉性能、「バッグに入れても安心」と顧客表示）、A5=防溅推盖式・Tritan（「倒置不漏は非承諾・防漏表記禁止」を明記）、A6=フタPP樹脂前提で溶出試験・PL確認を設計 | **設計判断を要するため未修正**。密閉構造の採否はコスト・品質試験体系（倒置/横倒し試験）・顧客表示・法規試験対象樹脂（Tritan vs PP）に波及する。A5自身が§5注記でA2/A6連携事項と明示しており、Quality設計（A4）での構造確定とA2顧客文言の再整合が必要 | **Open Issue**（→A4/A7、SpecField定義はA3） |
| IR-05 | **高** | 12 vs 13 | **RFQ法規書類要求の欠落**: A6 §3.6が必須/強く推奨とする6項目のうち、A5 RFQテンプレート§七に「フタ樹脂・パッキン材質証明」「樹脂PL適合宣言」「塗装仕様（杯口回り込み有無）」が欠落（SUS304報告・告示370号・ISO9001・対日実績は充足） | A6（法規の具体要求）を正としA5 RFQ §七へ3項目追加、必須項目に★印+「無ければ『無』回答」ルールを明記 | **修正済み**（12番） |
| IR-06 | 中 | 11 vs 13 | **Early Warning数値不一致**: A2「検査に約2〜3週間」vs A6「3〜6週間・10〜30万円」（§3.2試験リスト合計・§5.2文言例） | 試験リストの積み上げを持つA6が具体性で優位。A2の§4.3・STEP 3の2箇所を3〜6週間（§4.3は費用目安10〜30万円も併記）へ修正 | **修正済み**（11番） |
| IR-07 | 中 | 11 vs 12 | **ID重複**: A2がProposalに `CI-2026-0001-DOC-01` を採番、A5が产品规格书の文件编号にも `CI-2026-0001-DOC-01` を使用（IDの再利用禁止違反）。付随: A5 RFQ表内の「项目编号:」ラベルにRFQ IDが記載される表記誤り | 先行採番（Proposal=DOC-01）を維持し、A5规格书を `DOC-02` へ変更。RFQ表内ラベルを「询价单编号:」へ修正 | **修正済み**（12番） |
| IR-08 | 中 | 10 vs 12 | **JP→CN RFQ発行の接続不整合**: A1 JP-RFQ-030（承認済みRFQのExcel生成・発行）とA5 CN-RFQ-010（询价单Excel生成・送付）で**Excel生成責務が重複**し、CN-RFQ-010のtriggerがJP側outputと接続されていなかった | 生成は日本側（JP-RFQ-010〜030）、中国側は検証・送付・記録と責務分担を明確化。CN-RFQ-010のtrigger/inputs/system_actionをJP-RFQ-030完了に接続。G-14採用に伴いgatesへG-14追記 | **修正済み**（12番） |
| IR-09 | 低 | 10 vs 11/13 | **Regulatory起動タイミングの記述齟齬**: A2/A6は案件作成〜Proposal段階で自動 `NOT_CHECKED→CHECKING`、A1 JP-REG-010（SPEC-010後）が「NOT_CHECKED→CHECKINGへ遷移」と記述し二重遷移に見える | A6 §1.5（案件作成時に自動遷移）を正とし、A1 JP-REG-010のsystem_actionを「遷移済みの場合は再照合」へ修正 | **修正済み**（10番） |
| IR-10 | 低 | 12 vs 05 v1.1 | **用語表記の揺れ**: A5本文が「IPQC（制程巡检）」「コンテナ積込監督」を使用。v1.1正準は「制程检验（IPQC）」「積込立会/装柜监督」 | 正準表記へ修正（CN-INSP-010・CN-LOGI-020） | **修正済み**（12番） |
| IR-11 | 低 | 10/11 vs 05 v1.1 | **Soft Gate参照範囲の旧版表記**: A1 §7「G-10〜G-13のみ参照」、A2 §1.2「Soft Gate（G-10〜G-13）」がv1.1レジストリ（G-10〜G-15）と不一致 | v1.1レジストリ表記へ更新（A1 §7参照マップにG-14/G-15行を追加） | **修正済み**（10番・11番） |
| IR-12 | 低 | 10 vs 12 | **产品规格书の版番号・ステージ整合**: A1 JP-RFQ-040はRFQ発行時に仕様書ドラフト「V1」を生成、A5 §5の实例は黄金样確定後・生产前确认時点の「V1」でPO-01・签样を参照。同一版番号で異なるステージの内容となり、SUPERSEDED運用（Governance §7）との対応が未定義 | 版運用（RFQ時ドラフトと量産前正式版の版番号関係、Approval時点）の確定はState Machine設計事項のため未修正 | **Open Issue**（→A3） |
| IR-13 | 中 | 10 vs 12 vs 05 | **Automation集計の帰属未定**: A1 Matrixは日本側89 Taskのみで A+B=80.9%。A5は中国側35 Task（A+B=77%）の正式集計を「A1のMatrixに委ねる」としたが、A1は取り込んでいない。**単純合算では A+B=99/124=79.8% となりDoD基準（≥80%）を割る** | v2.1で裁定（本節末尾「IR-13 裁定（v2.1追記）」参照）。集計単位=日本側+中国側の全Task合算と定義 | **裁定済み（v2.1）** |

**集計: 検出13件 = 修正済み10件 / 裁定済み1件（IR-13、v2.1） / Open Issue 2件（IR-04, IR-12）**

検査観点の網羅記録: Vertical Slice整合（IR-01〜05）、Task ID・プロセス整合（IR-07/08）、用語・Status準拠（IR-10。4文書のStatus値・enum新設違反は上記以外に検出なし。A2②の新設提案は不採用裁定で回避）、Gate参照整合（IR-11。G-01〜G-06/G-10〜G-15以外への参照なし）、チャネル前提整合（A1のExcel+WeChatDigest標準動作とA5 §2チャネル・マトリクスは整合。IR-08の責務重複のみ検出）、顧客表示整合（IR-06。A2 §4.3とA6 §5.2の食品接触文言は数値統一後、A2文言集を正・A6は数値/根拠の供給元として役割分担が明確）。

### IR-13 裁定（v2.1追記・是正パス）

**裁定（v2.1）**: Automation A+B比率のDoD集計単位は**日本側+中国側の全Task合算**と定義。現状79.8%。無理な再分類は禁止。A1/A5のC分類Taskのうち、承認行為を伴わない定型判断が混入していないか再点検し、正当な再分類がなければ未達としてA7/オーナー判断事項に記録する。

**再点検結果（是正パスで実施）**:

1. **10番（A1）C分類15件**: 全件が承認（Proposal/RFQ/PO/GoldenSample/ECR/Repeat発注/ShipmentRelease）・確定判断（DNA/Requirement/Quality Tier/工場選定/法規最終判断）・人的営業（商談・価格交渉）であり、承認行為を伴わない定型判断の混入なし。**再分類0件**。
2. **12番（A5）C分類**: §1.2表の実数は CN-FACT-040（工場実地監査）/ CN-SMP-040（黄金样確認・G-02）/ CN-SPEC-040（ECR・G-06）/ CN-QUAL-020（限度見本確定）/ CN-PROD-020（首件確認・G-02/G-06）/ CN-INSP-060（出荷検品・G-05）/ CN-LOGI-030（出荷承認申請・G-04/05/06）の**7件**。全件がGate直結の承認・合否判定または現地監査（重要判断）であり、**再分類0件**（出荷検品の合否判定はG-05停止条件に直結するためCを維持）。
3. **計数誤りの訂正（再分類ではない）**: 12番 §1.2 の旧集計行「A=3/B=24/C=8（A+B=27/35=77%）」は同節のTask表の実数「A=3/B=25/C=7/D=0（A+B=28/35=80.0%）」と不一致であり、**表を正として集計行を訂正**した（12番 v0.3。分類値の変更は一切行っていない）。上記IR-13本文の「79.8%」はこの訂正前の集計行に基づく値。

**最終合算比率**: A+B = (72+28)/(89+35) = **100/124 = 80.6% ≥ 80%（DoD-6充足）**。再分類は日中とも0件であり、比率改善は12番集計行の計数訂正のみによる。A7 Red Team はオーナー承認10点セットのAutomation Matrix承認時に、集計単位（日中全Task合算）と本計数訂正（12番§1.2表との突合）を明示・再確認すること。

---

## 3. A3（データ設計）への引き継ぎ事項

**確定（v1.1・統合レビューで固定済み。ERD/State Machineはこれに準拠すること）**

1. **enum**: QuestionClass（BLOCKER/IMPORTANT_LATER/OPTIONAL）を questions テーブルの正準分類に。教育文言のライフサイクルは既存 Approval enum を流用（新テーブルStatusを作らない）。
2. **Regulatory State Machine**: 13番 §1.5 の遷移表（トリガ・実行者・自動差戻し）と、G-03明文化条件（PRODUCTION_READY/SHIPMENT_READY は APPROVED/NOT_APPLICABLE 必須、SpecField変更でCHECKINGへ自動差戻り→Readiness false）をそのまま実装要件とする（13番 §4.3）。
3. **SpecField Statusマッピング**: 顧客回答フロー（Known→PROVISIONAL / Assumption→AI_SUGGESTED / Missing→UNKNOWN、確定操作でCONFIRMED）は11番 §3.1 が正。
4. **ID**: Project配下DOCは通番共有（DOC-01=Proposal、DOC-02=产品规格书 — IR-07裁定）。Factory付帯記録は `FA-{NNNN}-{TYPE}-{NN}`（AUD/DOC/CAPA）。
5. **Excel往復のデータ要件**: 12番 §2.2/§2.4 の `_meta`（ProjectID/DocType/Version/出力日時/生成元レコードID/SHA-256）、返信原本のDocument保存（上書き禁止）、旧版回答フラグ。
6. **Factory Score**: 案件別スナップショットと累積スコアの分離保存、減点イベントの非対称性（12番 §7.1）。

**未確定（A3で設計判断が必要）**

- IR-12: Specificationの版番号運用（RFQ時ドラフト↔量産前正式版）とSUPERSEDED遷移の対応。
- TYPEコードに `PROP` が無くProposalをDOCで採番する現運用の妥当性（DOC通番の混雑リスク。TYPE追加はGovernance変更提案が必要）。
- テーブル名の正準化: A1は `audit_logs`、A5は `audit_log` と表記揺れ。両文書とも related_tables はA3確定後に整合させる前提と明記済みのため、A3の定義を正として一括整合すること。
- questions と spec_fields の関係（質問→Field対応付け、回答済み質問の全Route共有 — 11番 §3.2-4）。
- IR-04確定後の SpecField 定義（lid_type / lid_material の選択肢体系）。

---

## 4. A4（品質設計）への引き継ぎ事項

4文書に散在する品質前提。A4はこれらを単一の Quality Tier 体系に統合すること。

1. **A2の品質4択表示**（11番 STEP 6）: 顧客表示「コスト重視/標準/ブランド重視/プレミアム」→内部 Q1〜Q4 変換。**FIXED MINIMUM（安全・法規）はTier非連動**である旨を顧客文言で明示済み（「どのレベルでも、安全と法律に関わる項目は同じ厳しさで必ず確認します」）。Tier確定はC_HUMAN_DECISION（JP-QUAL-020）。プロ顧客にはTier詳細基準を開示（11番 §9）。
2. **A5の外観限度標準・AQL引用**(12番 §5-4/8): 検査条件（視距300mm・600-800lux・目視5秒/面）、A/B/C面区定義と欠陥限度、限度样3点セット（OK/限度/NG・双方保管）、GB/T 2828.1（≒ISO 2859-1/JIS Z 9015）一般検査水平II・CRITICAL 0 / MAJOR AQL 1.0 / MINOR AQL 2.5（批量1,000→样本80、Ac/Re付き）。R-08（PRISK_HIGH時のAQL厳格化）・FRISK連動検品密度表（12番 §7.2）との整合はA4が確定。
3. **A6のFIXED MINIMUM該当項目**（13番）: 食品衛生法適合（告示370号溶出・樹脂PL適合・器具一般規格）、気密100%全検（泄漏=CRITICAL、12番 §5-5.1）、禁用物質（重金属・回収料不使用、12番 §5-6.3）、家品法該当時の表示義務項目。これらはQualityLevelに依らず必須（Tier緩和の対象外）としてQuality Tier表に固定行で組み込むこと。
4. **試験条件の重複定義の一本化**: 保温性能試験がA5（95±1℃・6h・≥55℃、GB/T 29606参照）とA6（保温効力試験・家品法表示様式準拠）の2箇所にあり数値は整合しているが、家品法表示値の測定方法（規程準拠）と工場出荷試験の関係をA4で一本化すること。
5. **IR-04（フタ仕様）**: 密閉タイプ採用時は倒置/横倒し漏れ試験の新設が必要（A5 5.3は防溅前提で「倒置不漏は非承諾」）。構造確定とセットで密封試験体系を設計すること。
6. サンプル発注数量への試験用サンプル織り込み（13番 §3.2注記、A5/A1のTask連動事項）。

---

## 5. A7（Red Team）への引き継ぎ事項（Open Issue全件）

| ID | 要点 | A7への論点 |
|---|---|---|
| IR-04 | フタ仕様（A2密閉約束 vs A5防溅盖・非承諾 vs A6のPP前提試験）の三文書不整合 | 顧客への「バッグに入れても安心」表示と工場の「防漏表記禁止」が併存したまま量産に至った場合のクレーム・表示法規（景表法優良誤認）リスクを攻撃シナリオ化すること。構造確定プロセス（誰がいつ決めるか）の欠落を検証 |
| IR-12 | 产品规格书の版番号・ステージ運用未定義 | 「工場がRFQ時ドラフトV1で生産準備を始める」事故（A5 §2.4の透かし対策で足りるか）をトラブルケースに含めること |
| IR-13 | 日中統合のAutomation集計でA+B=79.8%となりDoD 80%を割る可能性 → **v2.1で裁定済み**（集計単位=全Task合算、再分類0件、12番集計行の計数訂正後は100/124=80.6%。§2末尾の裁定追記参照） | DoD判定の集計単位の恣意性（日本側のみ80.9%で合格とする解釈）を検証し、オーナー承認10点セットのAutomation Matrix承認時に集計単位と計数訂正の妥当性を明示すること |

補足（Open Issueではないが検証推奨）: A5現実性メモ M1〜M8（特にM4 Factory Score初期データ不足、M8 工場Portal最小化）、A6 §1.1の「見落とし防止」設計（チェックリスト外カテゴリの強制REVIEW_REQUIRED）の突破口探索。

---

## 6. Statusヘッダ更新記録

検査した4文書のStatusヘッダを `Draft / v0.1` → **`Reviewed / v0.2 / 2026-08-10`** に更新した（作成エージェント名は維持、各文書のChange Logに反映内容を追記済み）。

| 文書 | 更新後Status | 反映したIR |
|---|---|---|
| 10-a1-business-workflow.md | Reviewed / v0.2 / 2026-08-10 / A1 | IR-08(相手側), IR-09, IR-11 + G-14/G-15 gates反映 |
| 11-a2-customer-journey.md | Reviewed / v0.2 / 2026-08-10 / A2 | IR-01, IR-06, IR-11 + QuestionClass正準化反映 |
| 12-a5-china-ops.md | Reviewed / v0.2 / 2026-08-10 / A5 | IR-02, IR-03, IR-05, IR-07, IR-08, IR-10 + Glossary/ID裁定反映 |
| 13-a6-regulatory.md | Reviewed / v0.2 / 2026-08-10 / A6 | G-14一本化注記, G-03明文化参照更新 |

05-governance-pack.md は v1.1 確定済みのため変更していない。

## Change Log

| 版 | 日付 | 変更 |
|---|---|---|
| v1.0 | 2026-08-10 | 初版（秘書AI）。Governance変更提案8件の裁定記録、矛盾13件（修正済み10 / Open Issue 3）の検出・裁定・反映、A3/A4/A7への引き継ぎ事項、4文書のReviewed昇格 |
| v1.1 | 2026-08-10 | 是正パス（Governance v2.1）反映。IR-13裁定を追記（集計単位=日中全Task合算と定義、A1/A5のC分類再点検で再分類0件、12番§1.2集計行の計数訂正〔表実数A=3/B=25/C=7〕により最終合算A+B=100/124=80.6%でDoD-6充足）、IR-13をOpen Issue→裁定済みへ更新。是正対象4文書（10/11/12/13）はv0.3へ更新済み |
