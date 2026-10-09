// Sharing by WhatsApp: a link that opens the sender's own WhatsApp with the message ready, and the
// private document link it carries. Nothing is sent by the server.

// "+86 132 4453 6191 / WeChat x" -> "8613244536191"; null when no usable international number.
export function waNumber(phone: unknown): string | null {
  const first = String(phone ?? '').split(/[/,;]| or /i)[0]
  const digits = first.replace(/[^\d]/g, '').replace(/^00/, '')
  return digits.length >= 8 && digits.length <= 15 ? digits : null
}

export function waLink(phone: unknown, text: string): string {
  const n = waNumber(phone)
  return `https://wa.me/${n ?? ''}?text=${encodeURIComponent(text)}`
}

// How long a shared document link works.
export const SHARE_DAYS = 90
