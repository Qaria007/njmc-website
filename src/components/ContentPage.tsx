import type { PageContent } from '@/lib/content.ts'

// Renders a page body. The HTML comes only from this repo (imported live-site pages and
// pages written for the rebuild), never from visitors, so it is trusted markup.
export function ContentPage({ content }: { content: PageContent }) {
  return (
    <>
      {content.jsonld.map((ld, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      ))}
      <div className="legacy" dangerouslySetInnerHTML={{ __html: content.html }} />
    </>
  )
}
