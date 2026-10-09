import { ImapFlow } from 'imapflow'
import { type ParsedMail, simpleParser } from 'mailparser'
import type { CollectionConfig, Payload } from 'payload'

import { readQuoteWithAi } from '../lib/ai.ts'
import { attachmentKind, docRefIn, fromUs, isAutoReply, replyText } from '../lib/inbox.ts'
import { open } from '../lib/secret-box.ts'
import { emailsIn } from '../lib/trade-docs.ts'
import { signedIn } from './access.ts'
import { loadAi, loadSeller } from './TradeSettings.ts'

// Replies from suppliers and clients, read from the sales mailbox (Company details > Email inbox).
// Only emails whose subject or text carries one of our document numbers (NJMC-RFQ-, -PO-, -PI-,
// -INV-) are read; every other email in the mailbox is left alone. Each matched email is recorded
// here once, its text is added to the enquiry or sale, and its attachments go to Documents.

type Doc = Record<string, unknown> & { id: number | string }
const s = (v: unknown) => (v == null ? '' : String(v))
const idOf = (r: unknown) => (r && typeof r === 'object' ? (r as Doc).id : (r as number | string | null | undefined))

export const InboxMessages: CollectionConfig = {
  slug: 'inbox-messages',
  labels: { singular: 'Email received', plural: 'Emails received' },
  admin: {
    group: 'Orders',
    useAsTitle: 'subject',
    defaultColumns: ['receivedAt', 'from', 'subject', 'docNumber', 'done'],
    description: 'Replies about our enquiries, purchase orders and invoices, read from the sales mailbox. Tick Done when handled.',
  },
  access: { read: signedIn, create: () => false, update: signedIn, delete: () => false },
  timestamps: true,
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'receivedAt', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'from', type: 'text', admin: { readOnly: true } },
        { name: 'docNumber', type: 'text', label: 'About', admin: { readOnly: true } },
        { name: 'done', type: 'checkbox', defaultValue: false, label: 'Done' },
      ],
    },
    { name: 'subject', type: 'text', admin: { readOnly: true } },
    {
      type: 'row',
      fields: [
        { name: 'supplierOrder', type: 'relationship', relationTo: 'supplier-orders', admin: { readOnly: true } },
        { name: 'buyerDocument', type: 'relationship', relationTo: 'buyer-documents', admin: { readOnly: true } },
      ],
    },
    { name: 'text', type: 'textarea', label: 'Reply', admin: { readOnly: true, rows: 10 } },
    { name: 'attachments', type: 'relationship', relationTo: 'trade-files', hasMany: true, admin: { readOnly: true } },
    { name: 'aiNote', type: 'text', label: 'AI', admin: { readOnly: true } },
    // Message-ID of the email: an email is never recorded twice.
    { name: 'messageId', type: 'text', unique: true, index: true, admin: { hidden: true } },
  ],
}

type InboxSettings = { inboxOn?: boolean; imapHost?: string; imapUser?: string; imapPassSealed?: string; inboxLastUid?: number; inboxUidValidity?: string }

async function settings(payload: Payload) {
  return (await payload.findGlobal({ slug: 'trade-settings', depth: 0, overrideAccess: true, showHiddenFields: true })) as unknown as InboxSettings
}

function client(st: InboxSettings): ImapFlow | null {
  const pass = open(st.imapPassSealed)
  if (!pass || !s(st.imapUser) || !s(st.imapHost)) return null
  return new ImapFlow({ host: s(st.imapHost), port: 993, secure: true, auth: { user: s(st.imapUser), pass }, logger: false, socketTimeout: 60_000 })
}

// Never pass the raw error on: it can quote the login.
const safeError = (e: unknown) => {
  const x = e as { authenticationFailed?: boolean; code?: string; responseText?: string }
  if (x?.authenticationFailed) return 'The mailbox refused the login: check the login and paste a new app password'
  if (x?.code === 'ENOTFOUND' || x?.code === 'ECONNREFUSED' || x?.code === 'ETIMEDOUT') return 'The mail server could not be reached'
  return 'The mailbox could not be read'
}

export async function testInbox(payload: Payload): Promise<{ ok: boolean; message: string }> {
  const c = client(await settings(payload))
  if (!c) return { ok: false, message: 'Fill in the mail server, the login and the app password, then Save' }
  try {
    await c.connect()
    await c.logout()
    return { ok: true, message: 'The login works' }
  } catch (e) {
    return { ok: false, message: safeError(e) }
  }
}

const ALLOWED = /\.(pdf|xlsx|xls|docx|doc|csv|txt|jpe?g|png|webp)$/i
let running = false

// Reads new emails about our documents. `manual` runs even when the automatic reading is off.
export async function checkInbox(payload: Payload, manual = false): Promise<{ ok: boolean; message: string }> {
  if (running) return { ok: false, message: 'Already reading the mailbox' }
  const st = await settings(payload)
  if (!manual && !st.inboxOn) return { ok: true, message: 'Off' }
  const c = client(st)
  if (!c) return { ok: false, message: 'Fill in the mail server, the login and the app password, then Save' }
  running = true
  let found = 0
  let matched = 0
  let lastUid = Number(st.inboxLastUid) || 0
  let validity = s(st.inboxUidValidity)
  let status = ''
  try {
    await c.connect()
    const lock = await c.getMailboxLock('INBOX')
    try {
      const box = c.mailbox && typeof c.mailbox === 'object' ? c.mailbox : null
      const nowValidity = s(box?.uidValidity)
      // A new mailbox (or a reset one): start from the last 14 days instead of old UIDs.
      if (nowValidity !== validity) {
        lastUid = 0
        validity = nowValidity
      }
      const since = new Date(Date.now() - 14 * 86_400_000)
      const uids = ((await c.search({ subject: 'NJMC-', since }, { uid: true })) || []).filter((u) => u > lastUid).sort((a, b) => a - b).slice(0, 50)
      found = uids.length
      const seller = await loadSeller(payload)
      const ours = [...emailsIn([seller.email, seller.copyTo, process.env.MAIL_FROM, st.imapUser].join(','))]
      for (const uid of uids) {
        const msg = await c.fetchOne(String(uid), { source: true }, { uid: true })
        lastUid = Math.max(lastUid, uid)
        if (!msg || !msg.source) continue
        const mail = await simpleParser(msg.source)
        if (await handleMail(payload, mail, ours)) matched++
      }
    } finally {
      lock.release()
    }
    await c.logout()
    status = `${found} new email${found === 1 ? '' : 's'} about our documents, ${matched} added`
    return { ok: true, message: status }
  } catch (e) {
    status = safeError(e)
    payload.logger.error({ code: (e as { code?: string })?.code }, 'inbox reading failed')
    return { ok: false, message: status }
  } finally {
    running = false
    await payload.updateGlobal({
      slug: 'trade-settings', overrideAccess: true, depth: 0,
      data: { inboxLastUid: lastUid, inboxUidValidity: validity, inboxCheckedAt: new Date().toISOString(), inboxStatus: status } as never,
    }).catch(() => undefined)
  }
}

export async function handleMail(payload: Payload, mail: ParsedMail, ours: string[]): Promise<boolean> {
  const from = s(mail.from?.text)
  const subject = s(mail.subject)
  if (fromUs(from, ours) || isAutoReply(subject, Object.fromEntries(mail.headers))) return false
  const ref = docRefIn(subject, mail.text)
  if (!ref) return false
  const messageId = s(mail.messageId) || `${from}|${subject}|${mail.date?.toISOString()}`
  const dup = await payload.find({ collection: 'inbox-messages', where: { messageId: { equals: messageId } }, limit: 1, depth: 0, overrideAccess: true })
  if (dup.docs.length) return false

  const isSupplierDoc = ref.prefix === 'RFQ' || ref.prefix === 'PO'
  const found = isSupplierDoc
    ? await payload.find({ collection: 'supplier-orders', where: { number: { equals: ref.number } }, limit: 1, depth: 0, overrideAccess: true })
    : await payload.find({ collection: 'buyer-documents', where: { or: [{ piNumber: { equals: ref.number } }, { invoiceNumber: { equals: ref.number } }] }, limit: 1, depth: 0, overrideAccess: true })
  const doc = found.docs[0] as unknown as Doc | undefined
  if (!doc) return false

  const text = replyText(mail.text)
  const when = (mail.date ?? new Date()).toISOString()
  const files: (number | string)[] = []
  for (const a of mail.attachments ?? []) {
    if (!a.filename || !ALLOWED.test(a.filename) || a.size > 10_000_000 || a.contentDisposition === 'inline') continue
    try {
      const f = await payload.create({
        collection: 'trade-files', overrideAccess: true, depth: 0,
        data: {
          title: `${a.filename} (email from ${from.slice(0, 80)})`, kind: attachmentKind(a.filename), date: when,
          ...(isSupplierDoc ? { supplier: idOf(doc.supplier), supplierOrder: doc.id } : { client: idOf(doc.client), buyerDocument: doc.id }),
          ...(idOf(doc.order) ? { order: idOf(doc.order) } : {}),
        } as never,
        file: { data: a.content, mimetype: a.contentType, name: a.filename.replace(/[^\w. -]+/g, '_'), size: a.size },
      })
      files.push(f.id)
    } catch (e) {
      payload.logger.error({ name: (e as Error)?.name }, 'inbox attachment not saved')
    }
  }

  const block = `--- Email from ${from} on ${when.slice(0, 16).replace('T', ' ')} UTC ---\n${text}`
  let aiNote = ''
  if (isSupplierDoc) {
    const data: Record<string, unknown> = { supplierReply: [s(doc.supplierReply).trim(), block].filter(Boolean).join('\n\n'), replyArrivedAt: when }
    if (doc.status === 'sent' || doc.status === 'draft') data.status = 'supplier replied'
    // AI mode: read the prices now, for the user to check (never saved as the quotation by itself).
    if (ref.prefix === 'RFQ') {
      const ai = await loadAi(payload)
      if (ai) {
        try {
          const items = ((doc.items as Doc[]) ?? []).map((i) => ({ id: s(i.id), material: s(i.material), spec: s(i.spec), quantity: i.quantity as number | null, unit: s(i.unit) }))
          data.aiProposal = { quote: await readQuoteWithAi(ai.apiKey, ai.model, text, items), text }
          data.aiProposalAt = new Date().toISOString()
          aiNote = 'Prices read by AI: check them on the enquiry'
        } catch {
          aiNote = 'AI could not read this reply'
        }
      }
    }
    await payload.update({ collection: 'supplier-orders', id: doc.id, depth: 0, overrideAccess: true, data: data as never })
  } else {
    await payload.update({ collection: 'buyer-documents', id: doc.id, depth: 0, overrideAccess: true, data: { clientReplyAt: when, followUp: [s(doc.followUp).trim(), block].filter(Boolean).join('\n\n') } as never })
  }
  await payload.create({
    collection: 'inbox-messages', overrideAccess: true, depth: 0,
    data: {
      messageId, receivedAt: when, from: from.slice(0, 300), subject: subject.slice(0, 300), docNumber: ref.number, text,
      ...(isSupplierDoc ? { supplierOrder: doc.id } : { buyerDocument: doc.id }), attachments: files, aiNote,
    } as never,
  })
  return true
}

// Every 10 minutes in production, when switched on in Company details.
export function startInboxReader(payload: Payload) {
  if (process.env.NODE_ENV !== 'production' || process.env.INBOX_READER === 'off') return
  const tick = () => checkInbox(payload).catch(() => undefined)
  setTimeout(tick, 60_000)
  setInterval(tick, 10 * 60_000)
}
