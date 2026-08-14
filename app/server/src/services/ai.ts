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
  attachmentsMeta: string[] = []
): Promise<AnalysisResult> {
  if (!client) return mockAnalyzeRequirement(text);
  try {
    const userText = [
      `入力ルート: ${entryRoute}`,
      attachmentsMeta.length ? `添付ファイル: ${attachmentsMeta.join(', ')}` : '',
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
