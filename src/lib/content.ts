import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import type { Metadata } from 'next'

import type { Locale } from './site.ts'

// Page bodies imported from the live site (scripts/import-old-site.py) plus the new pages
// written for the rebuild. Keys: `<slug>` for top-level pages, `insights__<slug>` for
// articles, `group__<slug>` for group company pages, `home`, `404`.
// Every page is prerendered at build time, so the directory listing below only runs then.
export type PageContent = { title: string; description: string; html: string; jsonld: string[] }

const CONTENT_DIR = join(process.cwd(), 'src', 'content')

export function contentKeys(locale: Locale): string[] {
  return readdirSync(join(CONTENT_DIR, locale))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
}

export async function getContent(locale: Locale, key: string): Promise<PageContent | null> {
  if (!/^[a-z0-9_-]+$/.test(key)) return null
  try {
    return (await import(`../content/${locale}/${key}.json`)).default as PageContent
  } catch {
    return null
  }
}

// URL path for a content key, in the trailing-slash form (docs/01).
export function pathFor(locale: Locale, key: string): string {
  const prefix = locale === 'ar' ? '/ar' : ''
  if (key === 'home') return prefix + '/'
  return `${prefix}/${key.replace('__', '/')}/`
}

// hreflang only for pairs that exist in both languages (docs/04 Phase 8: no half pairs).
export function pageMetadata(locale: Locale, key: string, c: PageContent): Metadata {
  const other: Locale = locale === 'en' ? 'ar' : 'en'
  const hasPair = contentKeys(other).includes(key)
  const self = pathFor(locale, key)
  const languages: Record<string, string> = { [locale]: self }
  if (hasPair) languages[other] = pathFor(other, key)
  languages['x-default'] = locale === 'en' ? self : hasPair ? pathFor('en', key) : self
  return {
    title: { absolute: c.title },
    description: c.description,
    alternates: { canonical: self, languages },
    openGraph: { title: c.title, description: c.description, url: self, siteName: 'NJMC Medical Supplies Co., Ltd', type: 'website' },
  }
}
