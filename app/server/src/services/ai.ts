import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { CATEGORIES, mockAnalyze, classify } from './mock-catalog.js';
import type { AiMode, EntryRoute } from '../../../shared/api-types.js';

// AIサービス（契約§4）
// - ANTHROPIC_API_KEY 未設定時は構造化モックへ自動フォールバック
// - 出力はtool useで強制JSON。失敗時1リトライ→モック
// - AI Data Scope: 当該projectの入力・回答のみをプロンプトへ渡す（他client/内部原価は渡さない）

const MODEL = 'claude-haiku-4-5'; // 高速・低コスト帯

export interface AnalyzedField {
  key: string;
  label: string;
  value: string;
  source: 'FROM_INPUT' | 'AI_INFERRED';
}
export interface AnalyzedQuestion {
  key: string;
  title: string;
  options: string[];
}
export interface AnalysisResult {
  aiMode: AiMode;
  categoryLabel: string;
  fields: AnalyzedField[];
  questions: AnalyzedQuestion[]; // ≤2
  dna: Record<string, string>;
  dnaRationale: string;
  attributes: string[];
}

export interface ProposalOptionResult {
  key: 'rec' | 'small' | 'price_first';
  title: string;
  concept: string;
  priceRangeJpy: string;
  qtyFrom: string;
  leadDays: string;
  pros: string[];
  tradeoff: string;
  recommended: boolean;
}
export interface ProposalsResult {
  aiMode: AiMode;
  options: ProposalOptionResult[];
}

export interface ProjectContext {
  entryRoute: EntryRoute;
  rawText: string;
  refUrl?: string | null;
  fields: { label: string; value: string; source: string }[];
  answers: { question: string; answer: string }[];
}

const client = config.anthropicApiKey ? new Anthropic({ apiKey: config.anthropicApiKey }) : null;

// ---------- mock ----------

export function mockAnalyzeRequirement(text: string): AnalysisResult {
  const a = mockAnalyze(text);
  return {
    aiMode: 'mock',
    categoryLabel: a.cat.label,
    fields: a.rows.map((r) => ({
      key: r.key,
      label: r.label,
      value: r.value,
      source: r.src === 'user' ? 'FROM_INPUT' : 'AI_INFERRED',
    })),
    questions: a.cat.questions.slice(0, 2).map((q) => ({ key: q.id, title: q.title, options: q.opts })),
    dna: {
      exp_level: 'FIRST_TIME',
      intent: 'ORIGINAL_PRODUCT',
      odm_level: 'SEMI_CUSTOM',
      product_risk: 'LOW',
      quality_level: 'STANDARD',
      brand_impact: 'MEDIUM',
      factory_risk: 'UNKNOWN',
      commercial_risk: a.qtyKnown && a.budgetKnown ? 'LOW' : 'MEDIUM',
    },
    dnaRationale: `モック推定: カテゴリ「${a.cat.label}」、数量${a.qtyKnown ? '明示' : '未定'}・予算${a.budgetKnown ? '明示' : '未定'}から推定`,
    attributes: [`ATTR_CATEGORY_${a.cat.id.toUpperCase()}`],
  };
}

export function mockGenerateProposals(ctx: ProjectContext): ProposalsResult {
  const cat = classify(ctx.rawText) || CATEGORIES[CATEGORIES.length - 1];
  return {
    aiMode: 'mock',
    options: cat.plans.map((p) => ({
      key: p.key,
      title: p.name,
      concept: p.concept,
      priceRangeJpy: `${p.price}（工場確認前の目安）`,
      qtyFrom: p.qty,
      leadDays: p.delivery,
      pros: [...p.good],
      tradeoff: p.tradeoff,
      recommended: p.key === 'rec',
    })),
  };
}

// ---------- live (Anthropic) ----------

const ANALYZE_TOOL: Anthropic.Tool = {
  name: 'record_analysis',
  description: '顧客相談文の分析結果を構造化して記録する',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['category_label', 'fields', 'questions', 'dna', 'dna_rationale', 'attributes'],
    properties: {
      category_label: { type: 'string', description: '商品カテゴリの日本語ラベル' },
      fields: {
        type: 'array',
        description: '理解カード項目。商品/用途/こだわり/数量/予算の5項目',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'label', 'value', 'source'],
          properties: {
            key: { type: 'string', enum: ['product', 'use', 'detail', 'qty', 'budget'] },
            label: { type: 'string' },
            value: { type: 'string' },
            source: {
              type: 'string',
              enum: ['FROM_INPUT', 'AI_INFERRED'],
              description: '顧客の記入に基づく=FROM_INPUT / AIの推測=AI_INFERRED',
            },
          },
        },
      },
      questions: {
        type: 'array',
        description: '不足情報を補う選択式質問。最大2問',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'title', 'options'],
          properties: {
            key: { type: 'string' },
            title: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      dna: {
        type: 'object',
        additionalProperties: false,
        required: ['exp_level', 'intent', 'odm_level', 'product_risk', 'quality_level', 'brand_impact', 'factory_risk', 'commercial_risk'],
        properties: {
          exp_level: { type: 'string' },
          intent: { type: 'string' },
          odm_level: { type: 'string' },
          product_risk: { type: 'string' },
          quality_level: { type: 'string' },
          brand_impact: { type: 'string' },
          factory_risk: { type: 'string' },
          commercial_risk: { type: 'string' },
        },
      },
      dna_rationale: { type: 'string' },
      attributes: { type: 'array', items: { type: 'string' }, description: 'ATTR_*形式の属性タグ' },
    },
  },
};

const PROPOSE_TOOL: Anthropic.Tool = {
  name: 'record_proposals',
  description: '3つの進め方の提案を構造化して記録する',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['options'],
    properties: {
      options: {
        type: 'array',
        description: '必ず3案: rec(おすすめ)/small(小ロット優先)/cost(価格優先)',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'title', 'concept', 'price_range_jpy', 'qty_from', 'lead_days', 'pros', 'tradeoff', 'recommended'],
          properties: {
            key: { type: 'string', enum: ['rec', 'small', 'price_first'] },
            title: { type: 'string' },
            concept: { type: 'string' },
            price_range_jpy: {
              type: 'string',
              description: '概算価格レンジ。必ず「¥X〜Y（工場確認前の目安）」形式。断定価格は禁止',
            },
            qty_from: { type: 'string' },
            lead_days: { type: 'string' },
            pros: { type: 'array', items: { type: 'string' }, description: '良い点2つ' },
            tradeoff: { type: 'string' },
            recommended: { type: 'boolean' },
          },
        },
      },
    },
  },
};

const ANALYZE_SYSTEM = `あなたは日本の商社「Crossimage」のOEM/ODM相談を整理するアシスタントです。
顧客の相談文から理解カード（商品/用途/こだわり/数量/予算の5項目）を作成してください。
ルール:
- 顧客が明示的に書いた内容は source=FROM_INPUT、書いていないが推測した内容は source=AI_INFERRED とする。推測を顧客記入と偽らない。
- 数量・予算が未記入なら value は「未定（あとで決められます）」とし AI_INFERRED にする。未記入でも相談は成立する。
- 不足情報を補う選択式の質問を最大2問だけ作る（数量が未定なら数量の質問を優先）。
- 専門用語は「用語（かんたんな説明）」の形式で書く。
- 必ず record_analysis ツールで出力する。`;

const PROPOSE_SYSTEM = `あなたは日本の商社「Crossimage」のOEM/ODM提案を作るアシスタントです。
与えられた相談内容と回答から、進め方の3案を作ってください。
ルール:
- 3案は必ず key=rec（おすすめ・バランス型）/ small（小ロット優先）/ cost（価格優先）。recを recommended=true にする。
- 価格はすべて概算レンジとし「¥X〜Y（工場確認前の目安）」形式で書く。断定価格・確定価格の表現は禁止。
- 価格レンジは相場の「高め側」で提示する（工場確認前の安全側の見立て。後で下がるのは良いが上がるのは避ける）。
- 数量・納期も目安表現（「1,000個〜」「約60日」）にする。
- 各案に良い点2つ（pros）と正直なトレードオフ1つ（tradeoff）を書く。
- 日本語で、専門用語は「用語（かんたんな説明）」形式。
- 必ず record_proposals ツールで出力する。`;

async function callTool<T>(
  system: string,
  userText: string,
  tool: Anthropic.Tool
): Promise<T> {
  if (!client) throw new Error('no api key');
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system,
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: userText }],
  });
  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') throw new Error('no tool_use block');
  return block.input as T;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn(); // 失敗時1リトライ（それでも失敗なら呼び出し元でモックへ）
  }
}

export async function analyzeRequirement(
  text: string,
  entryRoute: EntryRoute,
  attachmentsMeta: string[] = [],
  // BI-3 リピート: 前回案件から引き継いだ項目。live時は差分だけ質問させる（mockは呼び出し側で除外）
  inheritedFields: { label: string; value: string }[] = []
): Promise<AnalysisResult> {
  if (!client) return mockAnalyzeRequirement(text);
  try {
    const userText = [
      `入力ルート: ${entryRoute}`,
      attachmentsMeta.length ? `添付ファイル: ${attachmentsMeta.join(', ')}` : '',
      inheritedFields.length
        ? [
            '--- 前回案件から引き継ぎ済みの項目（再質問しないこと。質問は差分のみ最大2問）---',
            ...inheritedFields.map((f) => `${f.label}: ${f.value}`),
          ].join('\n')
        : '',
      '--- 相談文 ---',
      text,
    ]
      .filter(Boolean)
      .join('\n');
    interface Raw {
      category_label: string;
      fields: { key: string; label: string; value: string; source: 'FROM_INPUT' | 'AI_INFERRED' }[];
      questions: { key: string; title: string; options: string[] }[];
      dna: Record<string, string>;
      dna_rationale: string;
      attributes: string[];
    }
    const raw = await withRetry(() => callTool<Raw>(ANALYZE_SYSTEM, userText, ANALYZE_TOOL));
    return {
      aiMode: 'live',
      categoryLabel: raw.category_label,
      fields: raw.fields.slice(0, 8),
      questions: raw.questions.slice(0, 2),
      dna: raw.dna,
      dnaRationale: raw.dna_rationale,
      attributes: raw.attributes.slice(0, 10),
    };
  } catch (err) {
    console.error('[ai] analyze fallback to mock:', (err as Error).message);
    return mockAnalyzeRequirement(text);
  }
}

// ============================================================
// BI-2: 中国語RFQドラフト生成 / Loop Option生成（CONTRACT-2 §2）
// 遮断: どちらの関数にも顧客販売価格・マージン・他工場情報を渡さない/生成させない。
// - RFQ: 呼び出し側で予算(budget)系フィールドを除外したctxを渡すこと。
// - Loop: 原価は渡さず、係数適用済みの顧客向け表示レンジのみを渡す。
// ============================================================

export interface RfqContext {
  projectPublicId: string;
  categoryLabel: string;
  fields: { label: string; value: string }[]; // 予算・販売価格系は含めない（呼び出し側で除外）
  answers: { question: string; answer: string }[];
  qtyTiers: string[]; // 数量シナリオ（例: ['500', '1,000', '3,000']）
}
export interface RfqResult {
  aiMode: AiMode;
  bodyZh: string;
}

export function mockGenerateRfq(ctx: RfqContext): RfqResult {
  const today = new Date().toISOString().slice(0, 10);
  const specLines = ctx.fields.map((f) => `- ${f.label}：${f.value}`).join('\n');
  const answerLines = ctx.answers.length
    ? ctx.answers.map((a) => `- ${a.question}：${a.answer}`).join('\n')
    : '';
  const tierLabels = ['方案A', '方案B', '方案C', '方案D'];
  const tierLines = ctx.qtyTiers
    .slice(0, 4)
    .map((q, i) => `- ${tierLabels[i]}：${q} 件（请分别报价）`)
    .join('\n');
  const bodyZh = `询价单（RFQ）
编号：${ctx.projectPublicId}
日期：${today}
致：供应商 报价担当

一、产品概述
- 品类：${ctx.categoryLabel}
${specLines}
${answerLines ? `\n（补充确认事项）\n${answerLines}\n` : ''}
二、规格要求
- 以上为当前已确认/推定的要求。未确定项目请在报价时注明贵司的建议方案。
- 面向日本市场销售，需符合日本相关法规及品质要求。

三、数量方案
${tierLines || '- 方案A：请按贵司MOQ报价'}

四、品质要求
- 品质标准：日本市场零售品质
- 量产前需提供确认样品（请注明样品费与样品交期）
- 如有不良品，请说明贵司的对应方针

五、需提供资料
- 材质证明（材质成分表）
- 测试报告（如有第三方检测报告请一并提供）
- 工厂资质（营业执照、ISO等认证复印件）
- 产品实物照片或规格书

六、报价格式（请按以下项目分别填写）
1. 单价（请注明币种及贸易条件 FOB/EXW）
2. 起订量（MOQ）
3. 模具费/版费（如适用）
4. 样品费
5. 量产交期（天）
6. 报价有效期

※ 本询价单仅包含产品规格与采购条件的确认事项。
如有疑问，请联系 Crossimage 采购担当。`;
  return { aiMode: 'mock', bodyZh };
}

const RFQ_TOOL: Anthropic.Tool = {
  name: 'record_rfq',
  description: '中国語の询价单（RFQ）本文を記録する',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['body_zh'],
    properties: {
      body_zh: {
        type: 'string',
        description:
          '简体中文の询价单全文。構成: 产品概述/规格要求/数量方案/品质要求/需提供资料（材质证明・测试报告等）/报价格式',
      },
    },
  },
};

const RFQ_SYSTEM = `あなたは日本の商社「Crossimage」の中国工場向け調達アシスタントです。
与えられた案件の理解データから、工場へ送る询价单（RFQ）を简体中文で作成してください。
構成: 产品概述 / 规格要求 / 数量方案（複数数量で分别报价を依頼）/ 品质要求（日本市場品質・確認样品）/ 需提供资料（材质证明・测试报告・工厂资质等）/ 报价格式（单价・MOQ・模具费・样品费・交期・有效期）。
絶対的な禁止事項（遮断）:
- 顧客（最終販売者）の販売価格・予算・目標価格を一切含めない。
- Crossimageのマージン・手数料・利益率に関する情報を一切含めない。
- 他の工場・他のサプライヤーに関する情報（相見積の相手など）を一切含めない。
- 顧客企業名・顧客の内部情報を含めない。
未確定の仕様は「请在报价时注明贵司建议」と依頼する形にする。
必ず record_rfq ツールで出力する。`;

export async function generateRfqDraft(ctx: RfqContext): Promise<RfqResult> {
  if (!client) return mockGenerateRfq(ctx);
  try {
    const userText = [
      `案件番号: ${ctx.projectPublicId}`,
      `品類: ${ctx.categoryLabel}`,
      '--- 理解済みの仕様 ---',
      ...ctx.fields.map((f) => `${f.label}: ${f.value}`),
      ctx.answers.length ? '--- 顧客回答 ---' : '',
      ...ctx.answers.map((a) => `Q: ${a.question} → A: ${a.answer}`),
      `--- 数量シナリオ ---`,
      ctx.qtyTiers.join(' / '),
    ]
      .filter(Boolean)
      .join('\n');
    const raw = await withRetry(() => callTool<{ body_zh: string }>(RFQ_SYSTEM, userText, RFQ_TOOL));
    if (!raw.body_zh || raw.body_zh.length < 50) throw new Error('rfq body too short');
    return { aiMode: 'live', bodyZh: raw.body_zh };
  } catch (err) {
    console.error('[ai] rfq fallback to mock:', (err as Error).message);
    return mockGenerateRfq(ctx);
  }
}

// ---- Loop Option生成 ----

export interface LoopCandidate {
  index: number; // 内部quoteへの対応付け（呼び出し側で保持）
  customerPriceRange: string; // 係数適用済みの顧客向け表示レンジ（原価は渡さない）
  moq: number;
  leadDays: number;
  qtyHint: string; // 例: '1,000個〜'
}
export interface LoopGenContext {
  understanding: { label: string; value: string }[];
  desiredQty: string | null;
  selectedPlanTitle: string | null;
  modifyNote: string | null; // 2周目: 顧客の変更要望
  candidates: LoopCandidate[];
}
export interface LoopOptionGen {
  key: string;
  title: string;
  concept: string;
  customerPriceRange: string;
  qtyFrom: string;
  leadDays: string;
  pros: string[];
  tradeoff: string;
  recommended: boolean;
  basedOnIndex: number | null;
  internalNote: string | null;
}
export interface LoopOptionsResult {
  aiMode: AiMode;
  options: LoopOptionGen[];
}

export function mockGenerateLoopOptions(ctx: LoopGenContext): LoopOptionsResult {
  const keys = ['a', 'b', 'c'];
  const sortedByMoq = [...ctx.candidates].sort((x, y) => x.moq - y.moq);
  const picks: { cand: LoopCandidate; title: string; concept: string; pros: string[]; tradeoff: string }[] = [];
  if (sortedByMoq.length > 0) {
    const low = sortedByMoq[0];
    picks.push({
      cand: low,
      title: '小ロットで始める案',
      concept: 'まず少量から市場の反応を確かめる進め方です。',
      pros: ['初期数量を抑えて在庫リスクを小さくできます', '販売結果を見てから増産を判断できます'],
      tradeoff: '1個あたりの価格は数量が多い案より高めになります',
    });
  }
  if (sortedByMoq.length > 1) {
    const high = sortedByMoq[sortedByMoq.length - 1];
    picks.push({
      cand: high,
      title: 'まとめて作ってコストを抑える案',
      concept: '数量をまとめることで1個あたりの価格を抑える進め方です。',
      pros: ['1個あたりの価格を抑えられます', '継続販売の計画が立てやすくなります'],
      tradeoff: '初回の必要数量が多くなります',
    });
  }
  if (sortedByMoq.length > 2) {
    const mid = sortedByMoq[Math.floor(sortedByMoq.length / 2)];
    picks.splice(1, 0, {
      cand: mid,
      title: 'バランス重視の案',
      concept: '数量・価格・納期のバランスをとった進め方です。',
      pros: ['数量と価格のバランスが良い構成です', '納期も標準的で計画しやすいです'],
      tradeoff: '最安・最小ロットのどちらにも特化していません',
    });
  }
  if (picks.length === 1) {
    // 見積が1件のみ: 同一見積から数量違いの2案を作る
    const c = picks[0].cand;
    picks.push({
      cand: c,
      title: '数量を増やして単価を抑える案',
      concept: '同じ条件で数量を増やし、1個あたりのコストを下げる進め方です。',
      pros: ['1個あたりの価格が下がる余地があります', '再発注の手間を減らせます'],
      tradeoff: '初期費用と在庫は増えます',
    });
  }
  const options: LoopOptionGen[] = picks.slice(0, 3).map((p, i) => ({
    key: keys[i],
    title: p.title,
    concept: p.concept,
    customerPriceRange: p.cand.customerPriceRange,
    qtyFrom: p.cand.qtyHint,
    leadDays: `約${p.cand.leadDays}日`,
    pros: p.pros,
    tradeoff: p.tradeoff,
    recommended: i === (picks.length > 2 ? 1 : 0),
    basedOnIndex: p.cand.index,
    internalNote: `モック生成: 候補${p.cand.index}（MOQ ${p.cand.moq} / ${p.cand.leadDays}日）に基づく`,
  }));
  return { aiMode: 'mock', options };
}

const LOOP_TOOL: Anthropic.Tool = {
  name: 'record_loop_options',
  description: '顧客向けの「選べる進め方」Option案を構造化して記録する',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['options'],
    properties: {
      options: {
        type: 'array',
        description: '2〜3案。keyは a/b/c',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'key',
            'title',
            'concept',
            'customer_price_range',
            'qty_from',
            'lead_days',
            'pros',
            'tradeoff',
            'recommended',
            'based_on_index',
          ],
          properties: {
            key: { type: 'string', enum: ['a', 'b', 'c'] },
            title: { type: 'string', description: '顧客向けの案タイトル（日本語・工場名を含めない）' },
            concept: { type: 'string' },
            customer_price_range: {
              type: 'string',
              description: '与えられた候補の表示価格レンジをそのまま使う。新しい価格を作らない',
            },
            qty_from: { type: 'string' },
            lead_days: { type: 'string' },
            pros: { type: 'array', items: { type: 'string' }, description: '良い点2つ' },
            tradeoff: { type: 'string' },
            recommended: { type: 'boolean' },
            based_on_index: { type: 'integer', description: '基にした候補のindex' },
          },
        },
      },
    },
  },
};

const LOOP_SYSTEM = `あなたは日本の商社「Crossimage」のアシスタントです。
工場見積の分析結果（匿名化済みの候補一覧）から、顧客向けの「選べる進め方」2〜3案を日本語で作ってください。
ルール:
- 価格は候補ごとに与えられた customer_price_range（表示用レンジ）をそのまま使う。新しい価格・値引き・原価・仕入価格を書かない。
- 工場名・産地・サプライヤー情報・原価・マージン・手数料に関する記述を一切含めない。
- 各案は与えられた候補（index）のどれかに基づき based_on_index で示す。
- 顧客の希望（数量・変更要望）に最も合う案を recommended=true にする（1案のみ）。
- 専門用語は「用語（かんたんな説明）」形式。数量・納期は目安表現にする。
- 必ず record_loop_options ツールで出力する。`;

export async function generateLoopOptions(ctx: LoopGenContext): Promise<LoopOptionsResult> {
  if (!client) return mockGenerateLoopOptions(ctx);
  try {
    const userText = [
      '--- 案件の理解（抜粋） ---',
      ...ctx.understanding.map((f) => `${f.label}: ${f.value}`),
      ctx.selectedPlanTitle ? `顧客が選択済みのプラン: ${ctx.selectedPlanTitle}` : '',
      ctx.desiredQty ? `顧客の希望数量: ${ctx.desiredQty}` : '顧客の希望数量: 未定',
      ctx.modifyNote ? `顧客からの変更要望: ${ctx.modifyNote}` : '',
      '--- 候補一覧（匿名化済み） ---',
      ...ctx.candidates.map(
        (c) =>
          `候補${c.index}: 表示価格レンジ=${c.customerPriceRange} / 最小数量=${c.moq}個 / 納期=約${c.leadDays}日 / 数量目安=${c.qtyHint}`
      ),
    ]
      .filter(Boolean)
      .join('\n');
    interface Raw {
      options: {
        key: string;
        title: string;
        concept: string;
        customer_price_range: string;
        qty_from: string;
        lead_days: string;
        pros: string[];
        tradeoff: string;
        recommended: boolean;
        based_on_index: number;
      }[];
    }
    const raw = await withRetry(() => callTool<Raw>(LOOP_SYSTEM, userText, LOOP_TOOL));
    if (!raw.options || raw.options.length < 2 || raw.options.length > 3) {
      throw new Error('expected 2-3 options');
    }
    const validIdx = new Set(ctx.candidates.map((c) => c.index));
    return {
      aiMode: 'live',
      options: raw.options.map((o) => ({
        key: o.key,
        title: o.title,
        concept: o.concept,
        // 価格は候補のレンジのみ許可（AIが新しい価格を作った場合は候補側で上書き）
        customerPriceRange: validIdx.has(o.based_on_index)
          ? ctx.candidates.find((c) => c.index === o.based_on_index)!.customerPriceRange
          : o.customer_price_range,
        qtyFrom: o.qty_from,
        leadDays: o.lead_days,
        pros: o.pros.slice(0, 2),
        tradeoff: o.tradeoff,
        recommended: o.recommended,
        basedOnIndex: validIdx.has(o.based_on_index) ? o.based_on_index : null,
        internalNote: null,
      })),
    };
  } catch (err) {
    console.error('[ai] loop options fallback to mock:', (err as Error).message);
    return mockGenerateLoopOptions(ctx);
  }
}

export async function generateProposals(ctx: ProjectContext): Promise<ProposalsResult> {
  if (!client) return mockGenerateProposals(ctx);
  try {
    const userText = [
      `入力ルート: ${ctx.entryRoute}`,
      '--- 相談文 ---',
      ctx.rawText,
      ctx.refUrl ? `参考URL: ${ctx.refUrl}` : '',
      '--- 現在の理解 ---',
      ...ctx.fields.map((f) => `${f.label}: ${f.value}（${f.source === 'FROM_INPUT' ? 'ご記入' : 'AI推測'}）`),
      ctx.answers.length ? '--- 質問への回答 ---' : '',
      ...ctx.answers.map((a) => `Q: ${a.question} → A: ${a.answer}`),
    ]
      .filter(Boolean)
      .join('\n');
    interface Raw {
      options: {
        key: 'rec' | 'small' | 'price_first';
        title: string;
        concept: string;
        price_range_jpy: string;
        qty_from: string;
        lead_days: string;
        pros: string[];
        tradeoff: string;
        recommended: boolean;
      }[];
    }
    const raw = await withRetry(() => callTool<Raw>(PROPOSE_SYSTEM, userText, PROPOSE_TOOL));
    if (!raw.options || raw.options.length !== 3) throw new Error('expected 3 options');
    return {
      aiMode: 'live',
      options: raw.options.map((o) => ({
        key: o.key,
        title: o.title,
        concept: o.concept,
        priceRangeJpy: o.price_range_jpy,
        qtyFrom: o.qty_from,
        leadDays: o.lead_days,
        pros: o.pros.slice(0, 2),
        tradeoff: o.tradeoff,
        recommended: o.recommended,
      })),
    };
  } catch (err) {
    console.error('[ai] proposals fallback to mock:', (err as Error).message);
    return mockGenerateProposals(ctx);
  }
}

// ============================================================
// BI-3: 量産合意書AI（CONTRACT-3 §2）
// - generateAgreementDraft: 仕様からチェック項目3〜7件（測れる文）+ 許容条件の下書き
// - vagueCheck: 曖昧語（「綺麗」「しっかり」等）の検出と書き直し案
// - generateAgreementZh: 工場向け中文版（顧客名・JPY販売価格・マージンの混入禁止）
// すべて ANTHROPIC_API_KEY 未設定時は構造化モックへ自動フォールバック。
// ============================================================

export interface AgreementCheckItemGen {
  name: string;
  criteriaJa: string;
  criteriaZh: string;
  method: string;
}
export interface AgreementToleranceGen {
  defectRatePct: number;
  spareQty: string;
  note: string;
}
export interface AgreementDraftContext {
  categoryLabel: string;
  fields: { label: string; value: string }[]; // 予算・販売価格系は呼び出し側で除外
  selectedPlanTitle: string | null;
  rawText: string;
}
export interface AgreementDraftResult {
  aiMode: AiMode;
  checkItems: AgreementCheckItemGen[];
  tolerance: AgreementToleranceGen;
}

// ---- mock: カテゴリ/仕様キーワードからのテンプレート組み立て ----
export function mockGenerateAgreementDraft(ctx: AgreementDraftContext): AgreementDraftResult {
  const text = `${ctx.rawText} ${ctx.fields.map((f) => `${f.label}${f.value}`).join(' ')}`;
  const items: AgreementCheckItemGen[] = [
    {
      name: '外観（傷・汚れ）',
      criteriaJa: '正面から30cmの距離で目視し、1mm以上の傷・汚れ・打痕が1箇所もないこと',
      criteriaZh: '距离30cm目视检查，不得有1mm以上的划痕、污渍或压痕',
      method: '目視（全数）',
    },
    {
      name: '寸法',
      criteriaJa: '主要寸法（幅・高さ・奥行）が仕様値に対して±2mm以内であること',
      criteriaZh: '主要尺寸（宽·高·深）与规格值的公差在±2mm以内',
      method: 'ノギス測定（抜取 n=10/ロット）',
    },
    {
      name: '色・質感',
      criteriaJa: '承認サンプルと並べて比較し、通常室内光で色差が判別できないこと（ΔE≦3目安）',
      criteriaZh: '与确认样品并排对比，在正常室内光下无可辨色差（参考ΔE≤3）',
      method: '承認サンプル比較（抜取 n=5/ロット）',
    },
  ];
  if (/ロゴ|印刷|名入れ|プリント|刻印|箔押し/.test(text)) {
    items.push({
      name: '印刷・ロゴ',
      criteriaJa: 'ロゴ・印刷の位置ずれが指定位置から±1mm以内で、かすれ・にじみ・欠けがないこと',
      criteriaZh: '标志·印刷位置偏差在指定位置±1mm以内，无模糊、渗墨、缺损',
      method: '限度見本と比較（抜取 n=10/ロット）',
    });
  }
  if (/保温|保冷|タンブラー|マグ|ボトル|水筒/.test(text)) {
    items.push({
      name: '保温性能',
      criteriaJa: '95℃の湯を満量入れて蓋をし、室温25℃で6時間放置後に60℃以上を保つこと',
      criteriaZh: '注满95℃热水盖上盖子，在室温25℃放置6小时后水温保持60℃以上',
      method: '温度計測定（抜取 n=3/ロット）',
    });
  } else if (/バッグ|ポーチ|トート|縫製|巾着|かばん|鞄/.test(text)) {
    items.push({
      name: '縫製強度',
      criteriaJa: '持ち手・ストラップの縫製部が10kgの荷重に30秒耐え、ほつれ・裂けが生じないこと',
      criteriaZh: '提手·背带缝制部位承受10kg载荷30秒，无脱线、撕裂',
      method: '荷重試験（抜取 n=3/ロット）',
    });
  } else if (/ペット|犬|猫|首輪|リード/.test(text)) {
    items.push({
      name: '安全性（誤飲・素材）',
      criteriaJa: '直径3cm未満の分離可能な部品がなく、部品の取付部が5kgの引張に耐えること',
      criteriaZh: '不得有直径3cm以下的可分离部件，部件安装处承受5kg拉力不脱落',
      method: '引張試験（抜取 n=3/ロット）',
    });
  }
  items.push({
    name: '梱包・表示',
    criteriaJa: '個装箱に潰れ・破れ・汚れがなく、指定ラベル（品番・数量）が正しい位置に貼付されていること',
    criteriaZh: '单品包装盒无压坏、破损、污渍，指定标签（货号·数量）粘贴在正确位置',
    method: '目視（抜取 n=10/ロット）',
  });
  return {
    aiMode: 'mock',
    checkItems: items.slice(0, 7),
    tolerance: {
      defectRatePct: 1.0,
      spareQty: '発注数の2%を予備として無償同梱',
      note: '軽微な外観のばらつきは限度見本（OK側）の範囲内で許容とする',
    },
  };
}

// ---- mock: 曖昧語検出（正規表現辞書 + 定型書き直し案）----
const VAGUE_DICT: { pattern: RegExp; phrase: string; suggestion: string }[] = [
  { pattern: /綺麗|きれい|キレイ/, phrase: '綺麗', suggestion: '「30cm離れて目視した際に1mm以上の傷・汚れがないこと」のように、距離・大きさ・個数で表現してください' },
  { pattern: /しっかり/, phrase: 'しっかり', suggestion: '「10kgの荷重に30秒耐えること」のように、荷重・時間・回数などの数値条件で表現してください' },
  { pattern: /ちゃんと/, phrase: 'ちゃんと', suggestion: '判定者によって結果が変わらないよう、測定方法と合否のしきい値（例: ±1mm以内）を明記してください' },
  { pattern: /きちんと/, phrase: 'きちんと', suggestion: '「指定位置から±1mm以内」のように、基準位置と許容差で表現してください' },
  { pattern: /高品質|高い品質/, phrase: '高品質', suggestion: '品質の中身を分解し、「表面粗さRa1.6以下」「色差ΔE≦3」など測定可能な基準に置き換えてください' },
  { pattern: /問題ない|問題がない|問題無/, phrase: '問題ない', suggestion: '何をもって合格とするかを明記してください（例: 「通電試験で全数点灯すること」）' },
  { pattern: /良い感じ|いい感じ/, phrase: '良い感じ', suggestion: '承認サンプル・限度見本との比較基準（例: 「OK限度見本の範囲内」）に置き換えてください' },
  { pattern: /丈夫/, phrase: '丈夫', suggestion: '「1mの高さから3回落下させて割れ・欠けがないこと」のように、試験条件と回数で表現してください' },
  { pattern: /なるべく|できるだけ|出来るだけ/, phrase: 'なるべく', suggestion: '努力目標ではなく合否基準になるよう、許容範囲を数値で確定してください' },
  { pattern: /おおむね|概ね|だいたい/, phrase: 'おおむね', suggestion: '「±5%以内」のように許容範囲を数値で明記してください' },
  { pattern: /適切|適当に/, phrase: '適切', suggestion: '何が適切かは人によって異なります。具体的な条件（数値・位置・方法）を明記してください' },
  { pattern: /目立たない|目立つ/, phrase: '目立たない', suggestion: '「30cm離れて3秒の目視で確認できないこと」のように、観察距離と時間で定義してください' },
  { pattern: /速やか|早め/, phrase: '速やかに', suggestion: '「3営業日以内」のように期限を数値で明記してください' },
];

export interface VagueFindingGen {
  itemIndex: number;
  phrase: string;
  suggestion: string;
}
export interface VagueCheckResult {
  aiMode: AiMode;
  findings: VagueFindingGen[];
}

export function mockVagueCheck(checkItems: AgreementCheckItemGen[]): VagueCheckResult {
  const findings: VagueFindingGen[] = [];
  checkItems.forEach((item, idx) => {
    const target = `${item.name} ${item.criteriaJa}`;
    for (const d of VAGUE_DICT) {
      if (d.pattern.test(target)) {
        findings.push({ itemIndex: idx, phrase: d.phrase, suggestion: d.suggestion });
      }
    }
  });
  return { aiMode: 'mock', findings };
}

// ---- mock: 中文版（质检标准）テンプレート組み立て ----
// 遮断: コンテキストに顧客企業名・JPY販売価格・マージンをそもそも渡さない設計。
export interface AgreementZhContext {
  agreementPublicId: string;
  checkItems: AgreementCheckItemGen[];
  limitSampleCount: { ok: number; ng: number };
  tolerance: AgreementToleranceGen | null;
  responsibility: { inspectionPass: string; marketDefect: string; compensation: string } | null;
}
export interface AgreementZhResult {
  aiMode: AiMode;
  bodyZh: string;
}

export function mockGenerateAgreementZh(ctx: AgreementZhContext): AgreementZhResult {
  const today = new Date().toISOString().slice(0, 10);
  const itemLines = ctx.checkItems
    .map((it, i) => `| ${i + 1} | ${it.name} | ${it.criteriaZh} | ${it.method} |`)
    .join('\n');
  const defectRate = ctx.tolerance?.defectRatePct ?? 1.0;
  const bodyZh = `质检标准（量产合意书）
编号：${ctx.agreementPublicId}
日期：${today}
致：生产工厂 品质担当

一、检验项目表
| 序号 | 检验项目 | 允收标准 | 检验方法 |
|---|---|---|---|
${itemLines}

二、限度样品说明
- 确认样品（签样）为量产品质的基准。量产品与确认样品保持一致。
- OK限度样品：${ctx.limitSampleCount.ok}件（可允收的最差状态。此范围内视为合格）
- NG样品：${ctx.limitSampleCount.ng}件（不可允收的示例。出现同等或更差状态判为不合格）
- 限度样品照片另附。判定有争议时以限度样品为准。

三、允收标准（AQL）
- 致命缺陷（安全隐患·功能丧失）：不允收（AQL 0）
- 重缺陷：AQL 1.0
- 轻缺陷（外观轻微差异）：允收上限 ${defectRate}%
- 预备品：${ctx.tolerance?.spareQty ? '按约定随货附上预备品' : '如有约定按约定执行'}

四、责任划分
- 出货检验合格后的处理：${ctx.responsibility?.inspectionPass || '按双方另行约定执行'}
- 市场不良的处理：${ctx.responsibility?.marketDefect || '按双方另行约定执行'}
- 补偿方式：${ctx.responsibility?.compensation || '按双方另行约定执行'}

五、其他
- 量产前请提交产前样（PP样）确认。
- 如需变更材料·工艺·产地，请务必事前书面确认。
- 本标准自双方确认之日起适用于本项目全部量产批次。`;
  return { aiMode: 'mock', bodyZh };
}

// ---- live tools ----

const AGREEMENT_TOOL: Anthropic.Tool = {
  name: 'record_agreement_draft',
  description: '量産合意書のチェック項目と許容条件の下書きを構造化して記録する',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['check_items', 'tolerance'],
    properties: {
      check_items: {
        type: 'array',
        description: '検品チェック項目 3〜7件。criteria_jaは必ず数値・距離・回数で測れる文にする',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'criteria_ja', 'criteria_zh', 'method'],
          properties: {
            name: { type: 'string' },
            criteria_ja: { type: 'string', description: '測定可能な日本語基準（例: ±1mm以内、10kgに30秒耐える）' },
            criteria_zh: { type: 'string', description: '同内容の简体中文' },
            method: { type: 'string', description: '検査方法（目視/ノギス/荷重試験 等と抜取数）' },
          },
        },
      },
      tolerance: {
        type: 'object',
        additionalProperties: false,
        required: ['defect_rate_pct', 'spare_qty', 'note'],
        properties: {
          defect_rate_pct: { type: 'number', description: '軽微不良の許容率（%）' },
          spare_qty: { type: 'string', description: '予備数量の考え方' },
          note: { type: 'string' },
        },
      },
    },
  },
};

const AGREEMENT_SYSTEM = `あなたは日本の商社「Crossimage」の品質管理アシスタントです。
案件の仕様から、量産合意書（生産開始前に顧客と合意する検品基準）のチェック項目下書きを作ってください。
ルール:
- チェック項目は3〜7件。外観・寸法・色・機能・梱包の観点から商品に合うものを選ぶ。
- criteria_ja は必ず「測れる文」にする（距離・大きさ・数量・荷重・時間・温度などの数値を含める）。
  「綺麗」「しっかり」「ちゃんと」「高品質」などの曖昧語を使わない。
- criteria_zh は criteria_ja と同内容の简体中文。
- method には検査方法と抜取数（例: 目視（全数）/ ノギス測定（抜取 n=10））を書く。
- 価格・金額・マージンに関する記述は一切含めない。
- 必ず record_agreement_draft ツールで出力する。`;

export async function generateAgreementDraft(ctx: AgreementDraftContext): Promise<AgreementDraftResult> {
  if (!client) return mockGenerateAgreementDraft(ctx);
  try {
    const userText = [
      `品類: ${ctx.categoryLabel}`,
      ctx.selectedPlanTitle ? `顧客が選択したプラン: ${ctx.selectedPlanTitle}` : '',
      '--- 仕様（理解済み） ---',
      ...ctx.fields.map((f) => `${f.label}: ${f.value}`),
      '--- 相談原文 ---',
      ctx.rawText,
    ]
      .filter(Boolean)
      .join('\n');
    interface Raw {
      check_items: { name: string; criteria_ja: string; criteria_zh: string; method: string }[];
      tolerance: { defect_rate_pct: number; spare_qty: string; note: string };
    }
    const raw = await withRetry(() => callTool<Raw>(AGREEMENT_SYSTEM, userText, AGREEMENT_TOOL));
    if (!raw.check_items || raw.check_items.length < 3 || raw.check_items.length > 7) {
      throw new Error('expected 3-7 check items');
    }
    return {
      aiMode: 'live',
      checkItems: raw.check_items.map((c) => ({
        name: c.name,
        criteriaJa: c.criteria_ja,
        criteriaZh: c.criteria_zh,
        method: c.method,
      })),
      tolerance: {
        defectRatePct: raw.tolerance.defect_rate_pct,
        spareQty: raw.tolerance.spare_qty,
        note: raw.tolerance.note,
      },
    };
  } catch (err) {
    console.error('[ai] agreement draft fallback to mock:', (err as Error).message);
    return mockGenerateAgreementDraft(ctx);
  }
}

const VAGUE_TOOL: Anthropic.Tool = {
  name: 'record_vague_findings',
  description: 'チェック項目内の曖昧語の指摘と書き直し案を構造化して記録する',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['findings'],
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['item_index', 'phrase', 'suggestion'],
          properties: {
            item_index: { type: 'integer', description: '対象チェック項目のindex（0始まり）' },
            phrase: { type: 'string', description: '検出した曖昧語' },
            suggestion: { type: 'string', description: '測定可能な表現への書き直し案' },
          },
        },
      },
    },
  },
};

const VAGUE_SYSTEM = `あなたは検品基準のレビュアーです。
与えられた量産合意書のチェック項目から、判定者によって結果が変わりうる曖昧な日本語表現
（例: 綺麗・しっかり・ちゃんと・きちんと・高品質・問題ない・良い感じ・丈夫・おおむね・適切 など）を検出し、
数値・距離・回数・荷重・時間で測れる表現への具体的な書き直し案を出してください。
曖昧語が無い項目は指摘しない。必ず record_vague_findings ツールで出力する。`;

export async function vagueCheck(checkItems: AgreementCheckItemGen[]): Promise<VagueCheckResult> {
  if (!client) return mockVagueCheck(checkItems);
  try {
    const userText = checkItems
      .map((c, i) => `[${i}] ${c.name}: ${c.criteriaJa}（方法: ${c.method}）`)
      .join('\n');
    interface Raw {
      findings: { item_index: number; phrase: string; suggestion: string }[];
    }
    const raw = await withRetry(() => callTool<Raw>(VAGUE_SYSTEM, userText, VAGUE_TOOL));
    return {
      aiMode: 'live',
      findings: (raw.findings ?? [])
        .filter((f) => f.item_index >= 0 && f.item_index < checkItems.length)
        .map((f) => ({ itemIndex: f.item_index, phrase: f.phrase, suggestion: f.suggestion })),
    };
  } catch (err) {
    console.error('[ai] vague check fallback to mock:', (err as Error).message);
    return mockVagueCheck(checkItems);
  }
}

const AGREEMENT_ZH_TOOL: Anthropic.Tool = {
  name: 'record_agreement_zh',
  description: '工場向けの质检标准（简体中文）本文を記録する',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['body_zh'],
    properties: {
      body_zh: {
        type: 'string',
        description: '简体中文の质检标准全文。構成: 编号/检验项目表/限度样品说明/允收标准（AQL）/责任划分',
      },
    },
  },
};

const AGREEMENT_ZH_SYSTEM = `あなたは日本の商社「Crossimage」の中国工場向け品質文書アシスタントです。
与えられた量産合意書の内容から、工場へ送る质检标准を简体中文で作成してください。
構成: 编号 / 检验项目表（序号・检验项目・允收标准・检验方法の表）/ 限度样品说明 / 允收标准（AQL方式）/ 责任划分。
絶対的な禁止事項（遮断）:
- 顧客（最終販売者）の企業名・担当者名を一切含めない。
- 日本円の販売価格・仕入価格・予算・金額情報を一切含めない。
- Crossimageのマージン・手数料・利益率に関する情報を一切含めない。
必ず record_agreement_zh ツールで出力する。`;

export async function generateAgreementZh(ctx: AgreementZhContext): Promise<AgreementZhResult> {
  if (!client) return mockGenerateAgreementZh(ctx);
  try {
    const userText = [
      `合意書番号: ${ctx.agreementPublicId}`,
      '--- チェック項目 ---',
      ...ctx.checkItems.map(
        (c, i) => `${i + 1}. ${c.name} / 基準(ja): ${c.criteriaJa} / 基準(zh): ${c.criteriaZh} / 方法: ${c.method}`
      ),
      `限度見本: OK ${ctx.limitSampleCount.ok}件 / NG ${ctx.limitSampleCount.ng}件`,
      ctx.tolerance
        ? `許容: 軽微不良 ${ctx.tolerance.defectRatePct}% / 予備 ${ctx.tolerance.spareQty} / ${ctx.tolerance.note}`
        : '許容: 未設定（AQL標準で提案）',
      ctx.responsibility
        ? `責任分界: 検品合格後=${ctx.responsibility.inspectionPass} / 市場不良=${ctx.responsibility.marketDefect} / 補償=${ctx.responsibility.compensation}`
        : '責任分界: 未設定（標準的な条項で提案）',
    ].join('\n');
    const raw = await withRetry(() =>
      callTool<{ body_zh: string }>(AGREEMENT_ZH_SYSTEM, userText, AGREEMENT_ZH_TOOL)
    );
    if (!raw.body_zh || raw.body_zh.length < 50) throw new Error('agreement zh body too short');
    return { aiMode: 'live', bodyZh: raw.body_zh };
  } catch (err) {
    console.error('[ai] agreement zh fallback to mock:', (err as Error).message);
    return mockGenerateAgreementZh(ctx);
  }
}
