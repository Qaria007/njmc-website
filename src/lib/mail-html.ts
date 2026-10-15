// HTML version of the e-mails the site sends (enquiries, reminders, documents, server mail).
// The plain text stays as the alternative part; this makes the same text look like a company
// letter: a dark blue brand line on top, readable type, the first line and the list items set
// clearly, and the signature block with the brand name in dark blue. No images, so it renders
// the same everywhere and never looks like marketing mail.

export type MailBrand = { brand: string; legalName?: string | null; website?: string | null; phone?: string | null; email?: string | null; address?: string | null }

const NAVY = '#1F3A5F'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const link = (s: string) =>
  esc(s).replace(/(https?:\/\/[^\s<]+|www\.[a-z0-9.-]+\.[a-z]{2,}[^\s<]*)/gi, (m) => `<a href="${m.startsWith('http') ? m : `https://${m}`}" style="color:${NAVY};text-decoration:underline">${m}</a>`)

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
  const flush = () => {
    if (!list.length) return
    const tag = listOrdered ? 'ol' : 'ul'
    out.push(`<${tag} style="margin:0 0 14px 0;padding-left:22px">${list.map((i) => `<li style="margin:0 0 6px 0">${link(i)}</li>`).join('')}</${tag}>`)
    list = []
  }
  let para: string[] = []
  const flushPara = () => {
    if (!para.length) return
    out.push(`<p style="margin:0 0 14px 0">${para.map(link).join('<br>')}</p>`)
    para = []
  }
  for (const raw of body) {
    const l = raw.trim()
    const m = /^(\d+)[.)]\s+(.*)$/.exec(l)
    const b = /^[-*•]\s+(.*)$/.exec(l)
    if (m || b) {
      flushPara()
      if (list.length && listOrdered !== Boolean(m)) flush()
      listOrdered = Boolean(m)
      list.push(m?.[2] ?? b?.[1] ?? '')
      continue
    }
    flush()
    if (!l) {
      flushPara()
      continue
    }
    para.push(l)
  }
  flushPara()
  flush()
  // Signature: the closing line, then the name in bold, the brand in dark blue, the rest muted.
  const sigHtml = sig.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px;border-top:2px solid ${NAVY};padding-top:12px"><tr><td style="padding-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#333">${sig
        .map((l, i) => {
          if (i === 0) return `<div style="margin-bottom:10px">${esc(l)}</div>`
          if (i === 1) return `<div style="font-weight:bold;color:#111">${esc(l)}</div>`
          if (l.toLowerCase().startsWith(brand.brand.toLowerCase())) return `<div style="font-weight:bold;color:${NAVY}">${esc(l)}</div>`
          return `<div style="color:#555">${link(l)}</div>`
        })
        .join('')}</td></tr></table>`
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
<tr><td style="padding:28px 28px 20px 28px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;color:#222">${textToHtml(text, brand)}</td></tr>
<tr><td style="padding:14px 28px 20px 28px;border-top:1px solid #e3e7ee;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b7280">${footer}</td></tr>
</table></td></tr></table></body></html>`
}
