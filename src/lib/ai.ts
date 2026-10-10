// AI mode: reads supplier replies and other free text into fields. Off unless the owner switches AI
// mode on and saves an API key in Company details. Works with Claude (Anthropic) or OpenAI; the
// provider follows the chosen model. Results are proposals: the user checks them before saving.
import Anthropic from '@anthropic-ai/sdk'

export const AI_MODELS = [
  { label: 'Claude Opus 5.5 (Anthropic, best)', value: 'claude-opus-5-5' },
  { label: 'Claude Sonnet 5.5 (Anthropic, cheaper)', value: 'claude-sonnet-5-5' },
  { label: 'Claude Haiku 5.5 (Anthropic, cheapest)', value: 'claude-haiku-5-5' },
  { label: 'GPT-5 (OpenAI)', value: 'gpt-5' },
  { label: 'GPT-5 mini (OpenAI, cheaper)', value: 'gpt-5-mini' },
]
export const DEFAULT_AI_MODEL = 'claude-opus-5-5'
export const providerOf = (model: string): 'anthropic' | 'openai' => (model.startsWith('gpt') ? 'openai' : 'anthropic')

// The key and the model must belong to the same company: an Anthropic key starts with sk-ant-.
export function keyModelMismatch(apiKey: string, model: string): string | null {
  const anthropicKey = apiKey.startsWith('sk-ant-')
  if (providerOf(model) === 'openai' && anthropicKey) return 'The saved key is a Claude (Anthropic) key: choose a Claude model, or paste an OpenAI key.'
  if (providerOf(model) === 'anthropic' && !anthropicKey) return 'The saved key is not a Claude (Anthropic) key: choose an OpenAI model (GPT-5), or paste an Anthropic key.'
  return null
}

// An HTTP failure from OpenAI, with only the status kept (never the request or headers).
export class AiHttpError extends Error {
  status: number
  constructor(status: number) {
    super(`AI service answered ${status}`)
    this.status = status
  }
}

export type QuoteItemRef = { id: string; material: string; spec?: string | null; quantity?: number | null; unit?: string | null }
export type AiQuote = {
  currency: string; incoterm: string; incotermPlace: string; validUntil: string; paymentTerms: string; contactName: string; notes: string
  items: { id: string; price: string; moq: string; leadTime: string; note: string }[]
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['currency', 'incoterm', 'incotermPlace', 'validUntil', 'paymentTerms', 'contactName', 'notes', 'items'],
  properties: {
    currency: { type: 'string', description: 'USD, CNY or EUR; empty if not stated' },
    incoterm: { type: 'string', description: 'EXW, FCA, FOB, CFR, CIF, CPT, CIP, DAP or DDP; empty if not stated' },
    incotermPlace: { type: 'string' },
    validUntil: { type: 'string', description: 'YYYY-MM-DD, or empty' },
    paymentTerms: { type: 'string' },
    contactName: { type: 'string' },
    notes: { type: 'string', description: 'Anything else the supplier said that matters to the buyer (packing, documents, DMF, CEP), in English' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'price', 'moq', 'leadTime', 'note'],
        properties: {
          id: { type: 'string', description: 'The id of the enquiry item this price is for' },
          price: { type: 'string', description: 'Price per unit of the enquiry item, digits and a dot only, e.g. 12.50; empty if no price for this item' },
          moq: { type: 'string' },
          leadTime: { type: 'string' },
          note: { type: 'string', description: 'Grade, packing or condition for this item, in English' },
        },
      },
    },
  },
} as const

const SYSTEM = `You read a supplier's reply to a pharmaceutical purchase enquiry and copy the quotation into fields.
Copy only what the supplier wrote. Never estimate, convert or calculate a price, and never fill a field the reply does not state: leave it empty.
If a price is per a different unit than the enquiry item (for example per ton when the item is in kg), leave the price empty and say so in that item's note.
Write notes in English even when the reply is in Chinese.`

// A problem with the answer itself (refused, too long, not readable). Its message is safe to show.
export class AiReadError extends Error {}

export function aiErrorMessage(e: unknown): string {
  if (e instanceof AiHttpError) {
    if (e.status === 401) return 'The AI key was refused (wrong or expired). Paste a new key in Company details.'
    if (e.status === 403) return 'The AI service refused access: the key has no access to this model, or this server\'s country is not supported.'
    if (e.status === 429) return 'The AI service is busy or the account has no credit left. Try again later or check the billing page.'
    if (e.status === 404) return 'This AI model is not available for the key. Choose another model.'
    return `The AI service failed (${e.status}). Try again.`
  }
  if (e instanceof Anthropic.AuthenticationError) return 'The AI key was refused (wrong or expired). Paste a new key in Company details.'
  if (e instanceof Anthropic.PermissionDeniedError) return 'The AI service refused access: the key has no access to this model, or this server\'s country is not supported.'
  if (e instanceof Anthropic.RateLimitError) return 'The AI service is busy or the account has no credit left. Try again later or check the billing page.'
  if (e instanceof Anthropic.BadRequestError) return `The AI service refused the request: ${e.message}`.slice(0, 300)
  if (e instanceof Anthropic.APIError) return `The AI service failed (${e.status ?? 'no answer'}). Try again.`
  return 'The AI service could not be reached. Try again.'
}

// A document sent with the request (a PDF or a picture), base64 encoded.
export type AiFile = { name: string; mediaType: 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp'; data: string }

// One request, one JSON answer that follows the schema, from whichever provider the model belongs to.
export async function aiJson<T>(apiKey: string, model: string, system: string, user: string, schema: object, name = 'answer', files: AiFile[] = []): Promise<T> {
  const mismatch = keyModelMismatch(apiKey, model)
  if (mismatch) throw new AiReadError(mismatch)
  let text = ''
  if (providerOf(model) === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: files.length
              ? [
                  ...files.map((f) =>
                    f.mediaType === 'application/pdf'
                      ? { type: 'file', file: { filename: f.name, file_data: `data:${f.mediaType};base64,${f.data}` } }
                      : { type: 'image_url', image_url: { url: `data:${f.mediaType};base64,${f.data}` } },
                  ),
                  { type: 'text', text: user },
                ]
              : user,
          },
        ],
        response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } },
      }),
      signal: AbortSignal.timeout(180_000),
    })
    if (!res.ok) throw new AiHttpError(res.status)
    const j = (await res.json()) as { choices?: { message?: { content?: string; refusal?: string }; finish_reason?: string }[] }
    const c = j.choices?.[0]
    if (c?.message?.refusal) throw new AiReadError('The AI declined to read this text.')
    if (c?.finish_reason === 'length') throw new AiReadError('The text is too long for one reading.')
    text = c?.message?.content ?? ''
  } else {
    const client = new Anthropic({ apiKey, timeout: 180_000, maxRetries: 1 })
    const res = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      system,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schema as Record<string, unknown> } },
      messages: [
        {
          role: 'user',
          content: [
            ...files.map((f) =>
              f.mediaType === 'application/pdf'
                ? { type: 'document' as const, source: { type: 'base64' as const, media_type: f.mediaType, data: f.data } }
                : { type: 'image' as const, source: { type: 'base64' as const, media_type: f.mediaType, data: f.data } },
            ),
            { type: 'text' as const, text: user },
          ],
        },
      ],
    })
    if (res.stop_reason === 'refusal') throw new AiReadError('The AI declined to read this text.')
    if (res.stop_reason === 'max_tokens') throw new AiReadError('The text is too long for one reading.')
    text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new AiReadError('The AI answer could not be read. Try again.')
  }
}

export async function readQuoteWithAi(apiKey: string, model: string, reply: string, items: QuoteItemRef[]): Promise<AiQuote> {
  const list = items.map((i) => `- id ${i.id}: ${i.material}${i.spec ? `, ${i.spec}` : ''}${i.quantity != null ? `, ${i.quantity} ${i.unit || 'kg'}` : ''}`).join('\n')
  const out = await aiJson<AiQuote>(apiKey, model, SYSTEM, `Enquiry items:\n${list}\n\nSupplier's reply:\n<reply>\n${reply.slice(0, 60000)}\n</reply>`, SCHEMA, 'quotation')
  const ids = new Set(items.map((i) => i.id))
  out.items = (out.items ?? []).filter((i) => ids.has(i.id))
  return out
}

// A small call to check that a newly pasted key works.
export async function testAiKey(apiKey: string, model: string): Promise<void> {
  const mismatch = keyModelMismatch(apiKey, model)
  if (mismatch) throw new AiReadError(mismatch)
  if (providerOf(model) === 'openai') {
    const res = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new AiHttpError(res.status)
    return
  }
  const client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 0 })
  await client.models.retrieve(model)
}
