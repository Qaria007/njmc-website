import { contentKeys, getContent, pathFor } from '@/lib/content.ts'
import { boilerplate, contact, SITE_URL } from '@/lib/site.ts'

export const dynamic = 'force-static'

// llms.txt (docs/03): the approved boilerplate, contacts and the English pages.
export async function GET() {
  const lines = ['# NJMC Medical Supplies Co., Ltd', '', `> ${boilerplate}`, '']
  lines.push(`Contact: ${contact.emailGeneral}, ${contact.emailSales}, WhatsApp ${contact.whatsappPrimary.label}`, '', '## Pages', '')
  for (const key of contentKeys('en').filter((k) => k !== '404').sort()) {
    const c = await getContent('en', key)
    if (c) lines.push(`- [${c.title}](${SITE_URL}${pathFor('en', key)}): ${c.description}`)
  }
  return new Response(lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
