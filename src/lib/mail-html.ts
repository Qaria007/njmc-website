// HTML version of the e-mails the site sends (enquiries, reminders, documents, server mail).
// The plain text stays as the alternative part; this makes the same text look like a company
// letter: a dark blue brand line on top, readable type, the first line and the list items set
// clearly, and the signature block with the brand name in dark blue. No images, so it renders
// the same everywhere and never looks like marketing mail.

export type MailBrand = { brand: string; legalName?: string | null; website?: string | null; phone?: string | null; email?: string | null; address?: string | null; signatoryName?: string | null; signatoryTitle?: string | null }

const NAVY = '#1F3A5F'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const link = (s: string) =>
  esc(s).replace(/(https?:\/\/[^\s<]+|www\.[a-z0-9.-]+\.[a-z]{2,}[^\s<]*)/gi, (m) => {
    // Trailing punctuation belongs to the sentence, not the address.
    const u = m.replace(/(&gt;|[.,;:)\]])+$/, '')
    return `<a href="${u.startsWith('http') ? u : `https://${u}`}" style="color:${NAVY};text-decoration:underline">${u}</a>${m.slice(u.length)}`
  })

const SIGN = /^(best regards|kind regards|regards|with kind regards|yours sincerely|sincerely|thank you and best regards),?$/i

// Plain text -> body HTML: paragraphs on blank lines, numbered or bulleted lines become a list,
// the greeting is kept on its own, and everything from "Best regards" on is the signature.
export function textToHtml(text: string, brand: MailBrand): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let signAt = lines.findIndex((l) => SIGN.test(l.trim()))
  if (signAt < 0) signAt = lines.length
  const body = lines.slice(0, signAt)
  const sig = lines.slice(signAt).map((l) => l.trim()).filter(Boolean)
  const out: string[] = []
  let list: string[] = []
  let listOrdered = false
  let listStart = 1
  const flush = () => {
    if (!list.length) return
    const tag = listOrdered ? 'ol' : 'ul'
    out.push(`<${tag}${listOrdered && listStart !== 1 ? ` start="${listStart}"` : ''} style="margin:0 0 14px 0;padding-left:22px">${list.map((i) => `<li dir="auto" style="margin:0 0 6px 0">${link(i)}</li>`).join('')}</${tag}>`)
    list = []
  }
  let para: string[] = []
  const flushPara = () => {
    if (!para.length) return
    out.push(`<p dir="auto" style="margin:0 0 14px 0">${para.map(link).join('<br>')}</p>`)
    para = []
  }
  for (let i = 0; i < body.length; i++) {
    const l = body[i].trim()
    const m = /^(\d+)[.)]\s+(.*)$/.exec(l)
    const b = /^[-*\u2022]\s+(.*)$/.exec(l)
    if (m || b) {
      flushPara()
      if (list.length && listOrdered !== Boolean(m)) flush()
      if (!list.length) listStart = m ? Number(m[1]) || 1 : 1
      listOrdered = Boolean(m)
      list.push(m?.[2] ?? b?.[1] ?? '')
      continue
    }
    if (!l) {
      // A blank line between two list items keeps one list (the numbering continues).
      const next = body.slice(i + 1).find((x) => x.trim())?.trim() ?? ''
      if (list.length && /^(\d+[.)]|[-*\u2022])\s+/.test(next)) continue
      flush()
      flushPara()
      continue
    }
    flush()
    para.push(l)
  }
  flushPara()
  flush()
  // Signature: the closing line from the text, then a designed block from the company settings:
  // an NJMC-style badge, the name (from the settings, else the first line of the typed signature),
  // the title, the brand in dark blue, the legal name, the address and the contact line.
  const typed = sig.slice(1).filter((l) => !/^(best|kind|with|yours|sincerely|thank)/i.test(l))
  const low = (x: string) => x.toLowerCase()
  const known = [brand.brand, brand.legalName, brand.website, brand.email, brand.phone, brand.address].filter(Boolean).map((x) => low(String(x)))
  const guessName = typed.find((l) => !known.some((k) => low(l).includes(k) || k.includes(low(l))) && !/@|www\.|https?:|\+?\d[\d\s-]{6,}/.test(l)) || ''
  const name = (brand.signatoryName || '').trim() || guessName
  const title = (brand.signatoryTitle || '').trim()
  const contact = [brand.phone ? `WhatsApp ${brand.phone}` : '', brand.email, brand.website].filter(Boolean).map((x) => link(String(x))).join(' &nbsp;|&nbsp; ')
  // Badge: the brand's own acronym when it starts with one ("NJMC Medical Supplies" -> NJMC), else the initials.
  const first = brand.brand.split(/\s+/)[0] || ''
  const initials = esc(/^[A-Z0-9]{2,5}$/.test(first) ? first : brand.brand.split(/\s+/).map((w) => w[0] || '').join('').slice(0, 4).toUpperCase() || 'NJMC')
  const sigHtml = sig.length
    ? `<p style="margin:18px 0 10px 0">${esc(sig[0])}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:4px"><tr>
<td valign="top" style="padding:0 14px 0 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" valign="middle" style="width:56px;height:56px;background:${NAVY};border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:${initials.length > 3 ? 15 : 18}px;font-weight:bold;color:#ffffff;letter-spacing:1px">${initials}</td></tr></table></td>
<td valign="top" style="border-left:2px solid ${NAVY};padding:0 0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#333">
${name ? `<div style="font-weight:bold;font-size:15px;color:#111">${esc(name)}</div>` : ''}${title ? `<div style="color:#555">${esc(title)}</div>` : ''}
<div style="font-weight:bold;color:${NAVY};margin-top:2px">${esc(brand.brand)}</div>
${brand.legalName && brand.legalName !== brand.brand ? `<div style="color:#666;font-size:13px">${esc(brand.legalName)}</div>` : ''}
${brand.address ? `<div style="color:#666;font-size:13px">${esc(brand.address)}</div>` : ''}
${contact ? `<div style="color:#444;font-size:13px;margin-top:4px">${contact}</div>` : ''}
</td></tr></table>`
    : ''
  return out.join('') + sigHtml
}

export function mailHtml(text: string, brand: MailBrand): string {
  const footer = [brand.legalName && brand.legalName !== brand.brand ? brand.legalName : '', brand.address, brand.website, brand.email, brand.phone ? `Tel ${brand.phone}` : ''].filter(Boolean).map((x) => esc(String(x))).join(' &nbsp;|&nbsp; ')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f3f5f8">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:6px;overflow:hidden">
<tr><td style="background:${NAVY};padding:16px 28px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#ffffff;letter-spacing:0.3px">${esc(brand.brand)}</td></tr>
<tr><td style="padding:28px 28px 20px 28px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;color:#222;word-break:break-word;overflow-wrap:anywhere">${textToHtml(text, brand)}</td></tr>
<tr><td style="padding:14px 28px 20px 28px;border-top:1px solid #e3e7ee;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b7280">${footer}</td></tr>
</table></td></tr></table></body></html>`
}
