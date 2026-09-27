import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ContentPage } from '@/components/ContentPage.tsx'

import { contentKeys, getContent, pageMetadata } from './content.ts'
import type { Locale } from './site.ts'

type Params = Promise<{ slug: string }>

// Routes: '' = top-level pages (/about/), 'insights' and 'group' = nested (/insights/<slug>/).
export function contentRoute(locale: Locale, section: '' | 'insights' | 'group') {
  const toKey = (slug: string) => (section ? `${section}__${slug}` : slug)
  return {
    generateStaticParams: () =>
      contentKeys(locale)
        .filter((k) => (section ? k.startsWith(`${section}__`) : !k.includes('__') && !['home', '404', 'insights', 'group'].includes(k)))
        .map((k) => ({ slug: section ? k.slice(section.length + 2) : k })),
    generateMetadata: async ({ params }: { params: Params }): Promise<Metadata> => {
      const key = toKey((await params).slug)
      const c = await getContent(locale, key)
      return c ? pageMetadata(locale, key, c) : {}
    },
    Page: async function Page({ params }: { params: Params }) {
      const c = await getContent(locale, toKey((await params).slug))
      if (!c) notFound()
      return <ContentPage content={c} />
    },
  }
}

// A single fixed page (home, /insights/, /group/).
export function fixedRoute(locale: Locale, key: string) {
  return {
    generateMetadata: async (): Promise<Metadata> => {
      const c = await getContent(locale, key)
      return c ? pageMetadata(locale, key, c) : {}
    },
    Page: async function Page() {
      const c = await getContent(locale, key)
      if (!c) notFound()
      return <ContentPage content={c} />
    },
  }
}
