import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { APIError, type FieldHook, type GlobalConfig, type Payload, type PayloadHandler, type PayloadRequest } from 'payload'

import { AI_MODELS, aiErrorMessage, AiReadError, DEFAULT_AI_MODEL, testAiKey } from '../lib/ai.ts'
import type { Rates } from '../lib/order-desk.ts'
import { fetchRates } from '../lib/rates.ts'
import { keyHint, open, seal } from '../lib/secret-box.ts'
import type { Seller } from '../lib/trade-docs.ts'
import { isOwner, ownerOnly } from './access.ts'

// Company details printed on enquiries, purchase orders, proforma invoices, invoices and packing
// lists, and used to sign the emails to suppliers. Private: bank details live here.
// A pasted key is encrypted into aiKeySealed and the plain text is never stored.
const storeKey: FieldHook = ({ value, siblingData }) => {
  // Spaces and line breaks picked up while copying are removed. Anything else that is not a plain
  // key character is refused; the message never repeats what was pasted.
  const k = String(value ?? '').replace(/\s+/g, '')
  if (k && !/^[A-Za-z0-9_-]{20,300}$/.test(k)) throw new APIError('That does not look like an API key. Copy it again from console.anthropic.com', 400, undefined, true)
  if (k) {
    siblingData.aiKeySealed = seal(k)
    siblingData.aiKeyHint = `${keyHint(k)} (saved ${new Date().toISOString().slice(0, 10)})`
  }
  return null
}
const dropKey: FieldHook = ({ value, siblingData }) => {
  if (value) {
    siblingData.aiKeySealed = null
    siblingData.aiKeyHint = null
  }
  return false
}

// The mailbox password (an app password): same handling as the API key.
const storeImapPass: FieldHook = ({ value, siblingData }) => {
  const k = String(value ?? '').replace(/\s+/g, '')
  if (k && !/^[\x21-\x7e]{8,200}$/.test(k)) throw new APIError('That does not look like a mailbox app password. Copy it again', 400, undefined, true)
  if (k) {
    siblingData.imapPassSealed = seal(k)
    siblingData.imapPassHint = `saved ${new Date().toISOString().slice(0, 10)}`
  }
  return null
}
const dropImapPass: FieldHook = ({ value, siblingData }) => {
  if (value) {
    siblingData.imapPassSealed = null
    siblingData.imapPassHint = null
    siblingData.inboxOn = false
  }
  return false
}

const admin = (req: PayloadRequest) => isOwner(req)

// POST { test? }: read the mailbox now (or only test the login).
const checkInboxEndpoint: PayloadHandler = async (req) => {
  if (!admin(req)) return Response.json({ error: 'Not allowed' }, { status: 403 })
  const body = (await req.json?.().catch(() => ({}))) as { test?: boolean } | undefined
  const { checkInbox, testInbox } = await import('./Inbox.ts')
  const r = body?.test ? await testInbox(req.payload) : await checkInbox(req.payload, true)
  return Response.json(r, { status: r.ok ? 200 : 400 })
}

// POST: fetch today's rates now (automatic mode, or once on request in manual mode too).
const refreshRatesEndpoint: PayloadHandler = async (req) => {
  if (!admin(req)) return Response.json({ error: 'Not allowed' }, { status: 403 })
  const r = await refreshRates(req.payload, true)
  return r ? Response.json(r) : Response.json({ error: 'The rates could not be fetched now. Try again later or type them yourself.' }, { status: 502 })
}

// POST: check that the saved key works with the chosen model (a free call: no tokens used).
const testAiEndpoint: PayloadHandler = async (req) => {
  if (!admin(req)) return Response.json({ error: 'Not allowed' }, { status: 403 })
  const ai = await loadAi(req.payload, req, true)
  if (!ai) return Response.json({ error: 'No API key is saved' }, { status: 400 })
  try {
    await testAiKey(ai.apiKey, ai.model)
    return Response.json({ ok: true, model: ai.model })
  } catch (e) {
    return Response.json({ error: e instanceof AiReadError ? e.message : aiErrorMessage(e) }, { status: 400 })
  }
}

export const TradeSettings: GlobalConfig = {
  slug: 'trade-settings',
  label: 'Company details for documents',
  admin: { group: 'Orders', description: 'Printed on every enquiry, purchase order, proforma invoice, invoice and packing list. Fill in once.' },
  access: { read: ownerOnly, update: ownerOnly },
  endpoints: [
    { path: '/refresh-rates', method: 'post', handler: refreshRatesEndpoint },
    { path: '/test-ai', method: 'post', handler: testAiEndpoint },
    { path: '/check-inbox', method: 'post', handler: checkInboxEndpoint },
  ],
  fields: [
    { name: 'logo', type: 'upload', relationTo: 'media', admin: { description: 'Optional. A PNG or JPG logo printed at the top of every document' } },
    { name: 'companyName', type: 'text', required: true, defaultValue: 'NJMC Medical Supplies Co., Ltd', admin: { description: 'The legal name of the company that buys and sells' } },
    { name: 'address', type: 'textarea', defaultValue: 'Jianye District, Nanjing, Jiangsu, China', admin: { description: 'Full registered address, as on the business licence' } },
    {
      type: 'row',
      fields: [
        { name: 'phone', type: 'text', defaultValue: '+86 132 4453 6191' },
        { name: 'email', type: 'text', defaultValue: 'sale@njmcmedicsupp.com', admin: { description: 'Suppliers reply to this address' } },
        { name: 'website', type: 'text', defaultValue: 'njmcmedicsupp.com' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'signatoryName', type: 'text', label: 'Signed by (name)' },
        { name: 'signatoryTitle', type: 'text', label: 'Title' },
      ],
    },
    { name: 'copyTo', type: 'text', label: 'Send me a copy of every supplier message at', admin: { description: 'One or more email addresses. Leave empty for no copy.' } },
    { name: 'bankDetails', type: 'textarea', admin: { rows: 6, description: 'Printed on the proforma invoice and the invoice: beneficiary, bank, account number, SWIFT, bank address' } },
    {
      type: 'row',
      fields: [
        { name: 'supplierPaymentTerms', type: 'text', label: 'Usual payment terms to suppliers', admin: { description: 'Pre-filled on new purchase orders' } },
        { name: 'buyerPaymentTerms', type: 'text', label: 'Usual payment terms for buyers', admin: { description: 'Pre-filled on new proforma invoices' } },
      ],
    },
    {
      type: 'collapsible',
      label: 'Exchange rates and markup',
      fields: [
        { name: 'ratesPanel', type: 'ui', admin: { components: { Field: '/components/admin/SettingsTools#RatesTools' } } },
        {
          type: 'row',
          fields: [
            {
              name: 'rateMode', type: 'select', defaultValue: 'auto', label: 'Exchange rates',
              options: [{ label: 'Automatic (updated every day)', value: 'auto' }, { label: 'I type them myself', value: 'manual' }],
            },
            { name: 'cnyPerUsd', type: 'number', min: 0, label: 'CNY for 1 USD', admin: { description: 'Automatic mode fills this in; switch to "I type them myself" to use your own rate' } },
            { name: 'usdPerEur', type: 'number', min: 0, label: 'USD for 1 EUR' },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'ratesDate', type: 'text', label: 'Rates of', admin: { readOnly: true } },
            { name: 'ratesSource', type: 'text', label: 'Source', admin: { readOnly: true } },
            { name: 'ratesCheckedAt', type: 'date', admin: { hidden: true } },
          ],
        },
        { name: 'defaultMargin', type: 'number', min: 0, label: 'Usual markup on cost (%)', admin: { description: 'Selling price = cost + this %. Pre-filled when a proforma invoice is made from the supplier prices; you can change it per item' } },
      ],
    },
    {
      type: 'collapsible',
      label: 'AI mode',
      fields: [
        { name: 'aiPanel', type: 'ui', admin: { components: { Field: '/components/admin/SettingsTools#AiTools' } } },
        {
          type: 'row',
          fields: [
            { name: 'aiMode', type: 'checkbox', defaultValue: false, label: 'AI mode on (off = simple mode, no AI and no AI cost)' },
            { name: 'aiModel', type: 'select', defaultValue: DEFAULT_AI_MODEL, label: 'AI model', options: AI_MODELS },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'newAiKey', type: 'text', label: 'Paste a new API key',
              admin: { description: 'A Claude key (console.anthropic.com) or an OpenAI key (platform.openai.com), matching the model above. Stored encrypted and never shown again. Leave empty to keep the current key' },
              hooks: { beforeChange: [storeKey] },
            },
            { name: 'aiKeyHint', type: 'text', label: 'Key in use', access: { create: () => false, update: () => false }, admin: { readOnly: true } },
            { name: 'removeAiKey', type: 'checkbox', defaultValue: false, label: 'Remove the saved key', hooks: { beforeChange: [dropKey] } },
          ],
        },
        // The encrypted key. Nobody can read it through the API or the admin, only the server.
        { name: 'aiKeySealed', type: 'text', access: { read: () => false, create: () => false, update: () => false }, admin: { hidden: true } },
      ],
    },
    {
      type: 'collapsible',
      label: 'Email inbox (replies attach themselves)',
      fields: [
        { name: 'inboxPanel', type: 'ui', admin: { components: { Field: '/components/admin/SettingsTools#InboxTools' } } },
        { name: 'inboxOn', type: 'checkbox', defaultValue: false, label: 'Read the sales mailbox every 10 minutes' },
        {
          type: 'row',
          fields: [
            { name: 'imapHost', type: 'text', defaultValue: 'imap.gmail.com', label: 'Mail server (IMAP)' },
            { name: 'imapUser', type: 'text', label: 'Mailbox login', admin: { description: 'The mailbox that receives replies, e.g. contact@optelux.com' } },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'newImapPassword', type: 'text', label: 'Paste the mailbox app password',
              admin: { description: 'Google account > Security > App passwords. Stored encrypted, never shown again' },
              hooks: { beforeChange: [storeImapPass] },
            },
            { name: 'imapPassHint', type: 'text', label: 'Password', access: { create: () => false, update: () => false }, admin: { readOnly: true } },
            { name: 'removeImapPassword', type: 'checkbox', defaultValue: false, label: 'Remove the saved password', hooks: { beforeChange: [dropImapPass] } },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'inboxCheckedAt', type: 'date', label: 'Last checked', access: { create: () => false, update: () => false }, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
            { name: 'inboxStatus', type: 'text', label: 'Result', access: { create: () => false, update: () => false }, admin: { readOnly: true } },
          ],
        },
        { name: 'imapPassSealed', type: 'text', access: { read: () => false, create: () => false, update: () => false }, admin: { hidden: true } },
        { name: 'inboxLastUid', type: 'number', access: { read: () => false, create: () => false, update: () => false }, admin: { hidden: true } },
        { name: 'inboxUidValidity', type: 'text', access: { read: () => false, create: () => false, update: () => false }, admin: { hidden: true } },
      ],
    },
    {
      name: 'documentsRequired',
      type: 'textarea',
      label: 'Documents required from the supplier',
      defaultValue: 'Certificate of analysis for each batch\nMSDS\nCommercial invoice and packing list\nCertificate of origin if requested',
      admin: { description: 'Pre-filled on new purchase orders' },
    },
  ],
}

type Settings = Record<string, string | null | undefined> & {
  logo?: { filename?: string | null } | number | null; defaultMargin?: number | null; cnyPerUsd?: number | null; usdPerEur?: number | null; aiMode?: boolean | null
}

// Automatic rates: fetched at most every 12 hours, and after a failure not again for 30 minutes.
let lastTry = 0
export async function refreshRates(payload: Payload, force = false): Promise<{ cnyPerUsd: number; usdPerEur: number; date: string } | null> {
  if (!force && Date.now() - lastTry < 30 * 60_000) return null
  lastTry = Date.now()
  const r = await fetchRates()
  if (!r || !r.cnyPerUsd || !r.usdPerEur) return null
  await payload.updateGlobal({
    slug: 'trade-settings', overrideAccess: true, depth: 0,
    data: { cnyPerUsd: r.cnyPerUsd, usdPerEur: r.usdPerEur, ratesDate: r.date, ratesSource: r.source, ratesCheckedAt: new Date().toISOString() } as never,
  })
  return { cnyPerUsd: r.cnyPerUsd, usdPerEur: r.usdPerEur, date: r.date }
}

// The AI settings with the decrypted key, or null in simple mode or without a key.
export async function loadAi(payload: Payload, req?: PayloadRequest, ignoreMode = false): Promise<{ apiKey: string; model: string } | null> {
  const g = (await payload.findGlobal({ slug: 'trade-settings', depth: 0, overrideAccess: true, showHiddenFields: true, req })) as unknown as Settings
  if (!ignoreMode && !g.aiMode) return null
  const apiKey = open(g.aiKeySealed)
  return apiKey ? { apiKey, model: g.aiModel || DEFAULT_AI_MODEL } : null
}

// The logo file from the public media folder, when it is a PNG or a JPG.
async function logoOf(g: Settings): Promise<Seller['logo']> {
  const name = g.logo && typeof g.logo === 'object' ? path.basename(String(g.logo.filename ?? '')) : ''
  const type = /\.png$/i.test(name) ? 'png' : /\.jpe?g$/i.test(name) ? 'jpg' : null
  if (!type) return null
  try {
    return { data: new Uint8Array(await readFile(path.resolve(process.env.MEDIA_DIR || 'media', name))), type }
  } catch {
    return null
  }
}

// The company on a document: Company details for documents, or one of Our companies when the
// document names one (its name, letterhead, signatory and bank details replace NJMC's; the terms,
// rates and email copy settings stay).
export async function loadSeller(payload: Payload, req?: PayloadRequest, companyId?: number | string | null): Promise<Seller & { copyTo: string; supplierPaymentTerms: string; buyerPaymentTerms: string; documentsRequired: string; defaultMargin: number | null; rates: Rates; aiMode: boolean }> {
  const base = await loadCompanyDetails(payload, req)
  if (!companyId) return base
  const c = (await payload.findByID({ collection: 'issuing-companies', id: companyId, depth: 1, overrideAccess: true, req }).catch(() => null)) as unknown as Settings | null
  if (!c) return base
  const v = (k: string) => (c[k] == null ? '' : String(c[k]).trim())
  return {
    ...base,
    logo: (await logoOf(c)) ?? null,
    companyName: v('companyName') || base.companyName,
    address: v('address'),
    phone: v('phone'),
    email: v('email'),
    website: v('website'),
    signatoryName: v('signatoryName'),
    signatoryTitle: v('signatoryTitle'),
    bankDetails: v('bankDetails'),
  }
}

async function loadCompanyDetails(payload: Payload, req?: PayloadRequest): Promise<Seller & { copyTo: string; supplierPaymentTerms: string; buyerPaymentTerms: string; documentsRequired: string; defaultMargin: number | null; rates: Rates; aiMode: boolean }> {
  let g = (await payload.findGlobal({ slug: 'trade-settings', depth: 1, overrideAccess: true, req })) as unknown as Settings
  if (g.rateMode !== 'manual' && Date.now() - Date.parse(g.ratesCheckedAt || '1970-01-01') > 12 * 3600_000) {
    const r = await refreshRates(payload).catch(() => null)
    if (r) g = { ...g, cnyPerUsd: r.cnyPerUsd, usdPerEur: r.usdPerEur } as Settings
  }
  return {
    logo: await logoOf(g),
    defaultMargin: g.defaultMargin ?? null,
    aiMode: Boolean(g.aiMode),
    rates: { cnyPerUsd: g.cnyPerUsd ?? null, usdPerEur: g.usdPerEur ?? null },
    companyName: g.companyName || 'NJMC Medical Supplies Co., Ltd',
    address: g.address,
    phone: g.phone,
    email: g.email || 'sale@njmcmedicsupp.com',
    website: g.website,
    signatoryName: g.signatoryName,
    signatoryTitle: g.signatoryTitle,
    bankDetails: g.bankDetails,
    copyTo: g.copyTo || '',
    supplierPaymentTerms: g.supplierPaymentTerms || '',
    buyerPaymentTerms: g.buyerPaymentTerms || '',
    documentsRequired: g.documentsRequired || '',
  }
}
