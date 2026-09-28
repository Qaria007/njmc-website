import type { MetadataRoute } from 'next'

import { publishedProducts } from '@/lib/catalogue.ts'
import { contentKeys, pathFor } from '@/lib/content.ts'
import { SITE_URL } from '@/lib/site.ts'

// Built per request: the catalogue lives in the database, which the CI build cannot reach.
export const dynamic = 'force-dynamic'

// Only pages that exist; Arabic pages only where reviewed Arabic exists (docs/04 Phase 8).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const out: MetadataRoute.Sitemap = []
  for (const locale of ['en', 'ar'] as const) {
    const other = locale === 'en' ? 'ar' : 'en'
    const otherKeys = new Set(contentKeys(other))
    for (const key of contentKeys(locale)) {
      if (key === '404') continue
      const languages: Record<string, string> = { [locale]: SITE_URL + pathFor(locale, key) }
      if (otherKeys.has(key)) languages[other] = SITE_URL + pathFor(other, key)
      out.push({ url: SITE_URL + pathFor(locale, key), alternates: { languages } })
    }
  }
  try {
    const products = await publishedProducts()
    out.push({ url: `${SITE_URL}/catalogue/` })
    for (const p of products) out.push({ url: `${SITE_URL}/catalogue/${p.slug}/`, lastModified: p.updatedAt })
  } catch {
    // Database unreachable: the static pages above still make a valid sitemap.
  }
  return out
}
