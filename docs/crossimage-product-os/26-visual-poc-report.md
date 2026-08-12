# 26. Visual Direction PoC 報告書

| 項目 | 値 |
|---|---|
| Status | Reviewed / v1.0 / 2026-08-11 / 秘書AI |
| 対象 | `poc/visual-poc.html`（1,520行・完全自己完結の単一HTML・素のWebGL・外部依存ゼロ） |
| 閲覧 | https://claude.ai/code/artifact/e925c8aa-4cdb-4277-9132-bfe01760bbb3 （プライベート。リポジトリのHTMLを直接開いても同一） |
| 制約遵守 | 本番Portal・Dashboard・Business Logic未着手。Mock Dataのみ。Visual EngineはBusiness機微データへアクセスしない（抽象State名のみ）。オーナーVisual Approvalまで Design System・本番画面へ展開しない |

## 1. 実装した Visual Components

| Phase | Component | 内容 |
|---|---|---|
| A | Ambient Particle | Stateless GPU方式（seed属性のみ、頂点シェーダー内flow fieldで位置算出。CPUで毎フレーム更新しない）。白/Ice Blue/Pale Cyan、opacity 0.15〜0.35、画面横断30秒超の超低速。コンテンツ背後は自動1/3減光 |
| A | Cursor Interaction | 遅延追従（lerp 0.05）+半径150pxのGentle Repel。即応なし・ゆっくり戻る |
| A | Glass Card | Decision CardとFlag Drawerのみ（乱用禁止遵守。Typography/Tableは白面） |
| A | Quality Governor | FPS移動平均で high/med/low 自動段階調整（DPR・粒子数・noise複雑度）。手動切替可 |
| B | Click Ripple | Primary Action（Option選択・承認）のみ。最大4同時、0.5〜1.2秒で自然減衰 |
| B | Meaningful Motion | 5種（FACTORY_RESPONSE_RECEIVED / DECISION_REQUIRED / APPROVED / PROJECT_COMPLETED / COMMERCIAL_LOOP=3点間循環）。全て10秒以内に終了、**Text/Statusチップを必ず同時更新** |
| C | Particle Morph | Free Flow→円環/菱形へ集合→Hold→Dissolve（対象粒子45%、easing付き。ロゴは未固定） |
| C | Liquid Orb | 別canvas・SDF+fbmシェーダー。5 State切替+テキストState常時併置 |
| C | Audio | WebAudio合成のみ（水滴2種+微かなガラス共鳴、gain≦0.045、Default OFF、ユーザー操作後にContext生成） |

## 2. Feature Flag 一覧

個別7: `ambientParticles / cursorInteraction / clickRipple / meaningfulMotion / particleMorph / liquidOrb / sound` ＋ 全Effect OFFマスター ＋ Debug表示 ＋ Quality（auto/high/med/low）。localStorage永続化。OFF時はcanvas非表示+描画ループ停止（GPU解放）。

## 3. Performance 結果（Chromium実測）

| モード | FPS | エラー |
|---|---|---|
| 通常（全Effect ON） | 19〜24（Quality Governorが自動でlow・粒子7,000へ降格動作を確認） | 0件 |
| Reduced Motion | 17〜24 | 0件 |
| **全Effect OFF** | **60.7** | 0件 |

**重要な注記**: 本環境のWebGLはSwiftShader（ソフトウェアレンダリング：GPUなしのCPU描画）であり、通常のGPU搭載PC・スマートフォンでは大幅に高速になる見込み。ソフトウェア描画でもAdaptive調整が正しく発火し操作可能を維持したこと、**Effect OFFで60fps＝業務UIがVisualの犠牲にならないこと**が検証の要点。実GPU・実スマートフォンでの最終確認はオーナー閲覧時の実測を推奨。

## 4. Reduced Motion 時の挙動（実測確認済み）

粒子数1/4・Cursor Interaction停止・Morph停止・Rippleは透明度変化のみ・Orb脈動1/10。「Reduced Motionモード適用中」を画面に表示。UI操作・情報は全て維持。

## 5. Effect OFF 時の画面（実測確認済み）

白面+カード+タイポグラフィのみの完全な業務UIとして成立（スクリーンショットで目視確認）。判断・入力・表示のすべてが影響なし。60fps。

## 6. Red Team 結果（7問）

| 問 | 回答 |
|---|---|
| Particleは本当に必要か？ | 常時表示の必然性はない。価値があるのは顧客Portalの入口・待機状態・完了演出。**社内Portal・中国側は既定OFFを推奨** |
| Glassを減らした方が読みやすくないか？ | 既にDecision Card+Drawerの2箇所限定でTable/本文は白面。現状で可読性影響なし。本番でも判断カード限定を維持 |
| Motionが無くても価値があるUIか？ | **Yes（実証済み）**。Effect OFFで60fps・完全成立 |
| 安っぽい未来感になっていないか？ | ネオン・黒背景・強Glowの排除で回避。ただしOrbは使い所を誤ると装飾化するため採用保留 |
| 8時間見て疲れないか？ | opacity 0.15〜0.35の極低コントラスト+超低速で負荷は小さい設計。ただし長時間実証は不能のため、**社内Portalは既定OFF+個人設定でON**が安全 |
| 日本のB2B顧客が不信感を持たないか？ | 白基調・控えめ・清潔で信頼性を損なわない判断。派手さはない |
| 中国側実務担当者には不要な装飾か？ | **Yes**。CN_OFFICE画面・工場向け出力はEffect既定OFF（Excel/WeChatには元々無関係） |

## 7. 削除した Effect

PoCからの削除は0件（全てFlagで個別無効化可能なため、判断材料として全機能を残置）。ただし§8のとおり**本番採用は絞る**。

## 8. 本番へ採用推奨する Effect

1. **ambientParticles** — 顧客Portalのみ・低密度（本PoCの50〜70%）・既定ON、社内/中国側は既定OFF
2. **clickRipple** — Primary Action限定（現仕様のまま）
3. **meaningfulMotion** — 5種中3種に絞る: APPROVED / PROJECT_COMPLETED / COMMERCIAL_LOOP（顧客の「進んでいる」実感に直結）。FACTORY_RESPONSE_RECEIVED/DECISION_REQUIREDは通知・チップで十分
4. **Glass Card** — 判断カード限定
5. **基盤系（全部採用）** — Feature Flag / Reduced Motion / Quality Governor / WebGL fallback / 抽象StateのみのVisual API

## 9. 本番へ採用しない方がよい / 保留の Effect

1. **liquidOrb — 保留**: メタファー価値（AI・案件状態の象徴）が未確立で、現状は装飾。Design System Phaseで用途が確定しない限り不採用
2. **sound — 保留（採用する場合もDefault OFF恒久）**: B2B業務では不快リスク > 価値。承認演出の1音のみ将来検討
3. **particleMorph — Phase 2以降へ**: ロゴ未確定のため本番価値が出ない。ブランド確定後に再評価
4. **cursorInteraction（社内Portal）** — 不採用: 8時間業務では無意味な負荷。顧客Portalのみ

## 10. 自己評価（各10点）

| 項目 | 点 | 根拠 |
|---|---|---|
| Readability | 9 | 本文#1C2733 on #FBFCFE、コンテンツ背後の粒子自動減光、Table/本文は白面 |
| Business Usability | 8 | 判断カード1画面完結・Option選択→承認の2アクション。Effect OFFで60fps |
| Visual Originality | 7 | 「水と空気」の独自方向は成立。ただしフォント未確定のため識別性はDesign Systemで上積みが必要 |
| Calmness | 9 | 全Motion超低速・10秒以内終了・Idle回帰 |
| Premium Feeling | 7 | 清潔・精密は達成。プレミアム感の残りはタイポグラフィ（次Phase）に依存 |
| Performance | 7 | Effect OFF 60fps実証。Effect ONは実GPU未計測（ソフトウェア描画でも操作可能+自動降格を確認） |
| Accessibility | 8 | reduced-motion/キーボード/focus-visible/コントラスト/aria-hidden実装。スクリーンリーダー詳細検証は未了 |
| Distraction Level（低いほど良い） | 9(低) | 極低opacity・超低速・UI背後減光。業務の邪魔をしない |
| Mobile Compatibility | 6 | レスポンシブCSS+タップ対応はあるが実機未検証。Cursor系はモバイル非適用 |
| Maintainability | 8 | Phase A/B/C独立コンポーネント+Flag。単一ファイルはPoC用であり本番では分割前提 |

## 11. 判定

**READY_FOR_VISUAL_APPROVAL**

根拠: ①白基調業務SaaSとParticleの共存を実測で確認（可読性・60fps業務UI・自動品質調整）②Effect OFFでも100%成立 ③採用/不採用の切り分けまで完了し、Design System Phaseへの入力が揃った。
残余確認事項（オーナー閲覧時に自然に確認可能）: 実GPU環境でのFPS体感、スマートフォン実機、Orb/Soundの好み。

**オーナーのVisual Approvalまで、Design System・本番9画面への展開・Business Logic実装は行わない。**

## 12. 追補（v1.1・2026-08-11）: オーナー参考イメージ受領と雰囲気強度プリセット

- オーナーよりVisual参考4点（水面調フロストのダッシュボードモック、Particle Love、USTA、Active Theory XR）を受領。ダーク系参考は「動きの質」の参照に留め、白基調は不変。
- Owner Review（実装順の手順4）で「控えめ⇔豊か」を比較できるよう、PoCへ**雰囲気強度プリセット3段階**を追加（+179行）: `subtle`=v1.0と同一 / `standard`=粒子1.3倍+弱い水面ウォッシュ / `rich`=参考モック方向（水面ウォッシュ+Soft Bokeh Orbs 7個・白〜Ice Blueのみ）。既定は `standard`。
- 3プリセットすべてで可読性原則（コンテンツ背後1/3減光）・Reduced Motion・Quality Governor・全Effect OFFを維持（Chromium再検証: エラー0件）。ソフトウェア描画FPSは subtle 19 / standard 11 / rich 9（ウォッシュパス追加分。実GPUでは問題ない見込み、richはlow品質時Bokeh半減で自動緩和）。
- Presentation Layer分離原則・実装順6段階（21番§3.1第5・6項）に基づき、本プリセットもARCHITECTURE_LOCK対象外の継続変更可パラメータである。
