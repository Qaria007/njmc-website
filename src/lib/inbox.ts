// Reading replies from the sales mailbox: which of our documents an email answers, and the new text
// of the reply without the quoted history. Pure functions so they can be tested.

const t = (v: unknown) => (v == null ? '' : String(v))

export type DocRef = { prefix: 'RFQ' | 'PO' | 'PI' | 'INV'; number: string }

// "Re: Enquiry NJMC-RFQ-2026-0012: 3 items" -> RFQ NJMC-RFQ-2026-0012. The first number wins.
export function docRefIn(subject: unknown, body?: unknown): DocRef | null {
  for (const text of [t(subject), t(body).slice(0, 4000)]) {
    const m = /NJMC-(RFQ|PO|PI|INV)-(\d{4})-(\d{4})/i.exec(text)
    if (m) return { prefix: m[1].toUpperCase() as DocRef['prefix'], number: `NJMC-${m[1].toUpperCase()}-${m[2]}-${m[3]}` }
  }
  return null
}

// The new part of a reply: everything above the first quoted-history marker ("On ... wrote:",
// "-----Original Message-----", "From: ...", Chinese mail clients' markers, or ">" lines).
export function replyText(body: unknown): string {
  const lines = t(body).replace(/\r\n/g, '\n').split('\n')
  const stop = lines.findIndex(
    (l) =>
      /^\s*(On .{4,200} wrote:|-{2,}\s*(Original Message|原始邮件|Forwarded message)\s*-{2,}|在 .{4,80} 写道[:：])\s*$/i.test(l) || /^\s*(From:\s|发件人[:：])/i.test(l) || /^\s*>/.test(l),
  )
  const kept = (stop >= 0 ? lines.slice(0, stop) : lines).join('\n').trim()
  return (kept || t(body).trim()).slice(0, 20000)
}

// Mail we sent ourselves (copies, auto-replies of our own) is not a reply.
export function fromUs(from: unknown, ours: string[]): boolean {
  const f = t(from).toLowerCase()
  return ours.some((o) => o && f.includes(o.toLowerCase()))
}

export function isAutoReply(subject: unknown, headers: Record<string, unknown>): boolean {
  const h = (k: string) => t(headers[k]).toLowerCase()
  return /^(auto|out of office|automatic reply|自动回复)/i.test(t(subject)) || ['auto-replied', 'auto-generated'].some((v) => h('auto-submitted').includes(v)) || h('precedence') === 'bulk'
}

// What kind of paper an attachment is, from its file name.
export function attachmentKind(name: unknown): string {
  const n = t(name).toLowerCase()
  if (/\bcoa\b|certificate of analysis|analysis cert|检验报告|分析证书/.test(n)) return 'coa'
  if (/\bpi\b|proforma|pro-forma|形式发票/.test(n)) return 'pi'
  if (/invoice|发票/.test(n)) return 'invoice'
  if (/packing/.test(n)) return 'packing-list'
  if (/quot|offer|price|报价/.test(n)) return 'quotation'
  if (/slip|payment|swift|tt copy|remittance|水单/.test(n)) return 'payment'
  if (/\bb\/?l\b|bill of lading|awb/.test(n)) return 'bl'
  if (/\.(jpe?g|png|heic|webp)$/.test(n)) return 'photo'
  return 'correspondence'
}
