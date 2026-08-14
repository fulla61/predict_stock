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
  key: 'rec' | 'small' | 'cost';
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
            key: { type: 'string', enum: ['rec', 'small', 'cost'] },
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
        key: 'rec' | 'small' | 'cost';
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
