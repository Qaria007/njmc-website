'use server'

import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

export type EnquiryState = { ok: boolean; message: string } | null

const MAX = { short: 200, long: 5000 }
const hits = new Map<string, number[]>()

// 5 submissions per IP per hour (docs/03: rate limit the RFQ endpoint).
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > 5
}

function field(form: FormData, name: string, max = MAX.short): string {
  return String(form.get(name) ?? '').trim().slice(0, max)
}

export async function submitEnquiry(_prev: EnquiryState, form: FormData): Promise<EnquiryState> {
  // Honeypot: people never see this field; bots fill it.
  if (field(form, 'website')) return { ok: true, message: 'Thank you. We will reply by email.' }

  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  if (rateLimited(ip)) return { ok: false, message: 'Too many requests from this connection. Please email sale@njmcmedicsupp.com.' }

  const type = field(form, 'type') === 'verification' ? 'verification' : 'rfq'
  const data = {
    type,
    name: field(form, 'name'),
    company: field(form, 'company'),
    role: field(form, 'role'),
    country: field(form, 'country'),
    email: field(form, 'email'),
    phone: field(form, 'phone'),
    service: field(form, 'service'),
    supplier: field(form, 'supplier'),
    message: field(form, 'message', MAX.long),
    heardAbout: field(form, 'heardAbout'),
    consent: form.get('consent') === 'on',
    page: field(form, 'page'),
    utmFirst: field(form, 'utmFirst', 500),
    utmLast: field(form, 'utmLast', 500),
  }
  if (!data.name || !data.country || !data.message || !data.heardAbout || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) {
    return { ok: false, message: 'Please fill in your name, email, country, message and how you heard about us.' }
  }
  if (!data.consent) return { ok: false, message: 'Please tick the consent box so we can reply to you.' }

  const payload = await getPayload({ config })
  const lead = await payload.create({ collection: 'leads', data: { ...data, type: type as 'rfq' | 'verification' }, overrideAccess: true })

  const label = type === 'verification' ? 'Verification order' : 'Request for quotation'
  const lines = Object.entries(data)
    .filter(([k, v]) => v && k !== 'consent')
    .map(([k, v]) => `${k}: ${v}`)
  let emailed = false
  try {
    await payload.sendEmail({
      to: process.env.LEADS_TO || 'sale@njmcmedicsupp.com',
      replyTo: data.email,
      subject: `${label} from ${data.name}${data.company ? ', ' + data.company : ''} (${data.country})`,
      text: `${label} received on the website.\n\n${lines.join('\n')}\n\nSaved in the admin: /admin/collections/leads/${lead.id}\n`,
    })
    emailed = true
  } catch (err) {
    payload.logger.error({ err }, 'lead notification email failed')
  }
  await payload.update({ collection: 'leads', id: lead.id, data: { emailed }, overrideAccess: true })

  return { ok: true, message: 'Thank you. Your request has reached NJMC. We will reply by email.' }
}
