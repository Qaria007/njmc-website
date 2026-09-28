import type { Metadata } from 'next'
import Link from 'next/link'

import { CATEGORY_LABEL, matches, publishedProducts } from '@/lib/catalogue.ts'

// Read from the database on each request: the image is built in CI, which has no database.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Products we source: APIs and pharmaceutical colours',
  description:
    'Examples of active pharmaceutical ingredients and pharmaceutical colours NJMC Medical Supplies sources from manufacturers in China and India, each with a quotation request.',
  alternates: { canonical: '/catalogue/' },
}

type Search = Promise<{ q?: string }>

export default async function CataloguePage({ searchParams }: { searchParams: Search }) {
  const q = String((await searchParams).q ?? '').slice(0, 100)
  const all = await publishedProducts()
  const shown = all.filter((p) => matches(p, q))
  const groups = (['api', 'excipient', 'colour'] as const)
    .map((c) => ({ c, items: shown.filter((p) => p.category === c) }))
    .filter((g) => g.items.length)
  const present = (['api', 'excipient', 'colour'] as const).filter((c) => all.some((p) => p.category === c))
  const kinds = present.map((c) => CATEGORY_LABEL[c].toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' and $1') || 'products'

  return (
    <div className="legacy catalogue">
      <section className="page-hero">
        <div className="hero-inner">
          <div className="hero-badge">Products</div>
          <h1>Products we source</h1>
          <p className="hero-summary">
            Examples of {kinds} we source from manufacturers in China and India. It is a starting point, not a fixed catalogue: every order is
            still sourced to your specification.
          </p>
        </div>
      </section>
      <section>
        <div className="section-inner">
          <div className="prose">
            <div className="answer-box">
              <div className="answer-label">How to order</div>
              <p>
                Choose a product and send a request for quotation with the grade, quantity and destination market. The certificate of analysis
                and the quality documents the manufacturer holds (for example GMP, ISO, DMF or CEP) are discussed with you before any order. A
                product not listed here can still be requested.
              </p>
            </div>
          </div>
          <form className="cat-search" action="/catalogue/" method="get" role="search">
            <label htmlFor="cat-q">Search by name, CAS or C.I. number</label>
            <div className="cat-search-row">
              <input id="cat-q" name="q" defaultValue={q} maxLength={100} placeholder="e.g. mesalazine, tartrazine, 77891" />
              <button type="submit">Search</button>
              {q && <Link href="/catalogue/">Clear</Link>}
            </div>
          </form>
          <p className="cat-count">
            {shown.length} of {all.length} products{q ? ` match "${q}"` : ''}.
          </p>
          {groups.map(({ c, items }) => (
            <div key={c} className="cat-group">
              <h2>{CATEGORY_LABEL[c]}</h2>
              <div className="cat-table-wrap">
                <table className="cat-table">
                  <thead>
                    <tr>
                      <th scope="col">Product</th>
                      {c === 'colour' ? <th scope="col">C.I. number</th> : <th scope="col">Grade (as listed)</th>}
                      <th scope="col">{c === 'colour' ? 'Type' : 'Class'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p) => (
                      <tr key={p.slug}>
                        <td>
                          <Link href={`/catalogue/${p.slug}/`}>{p.name}</Link>
                          {p.otherNames && <span className="cat-alt">{p.otherNames}</span>}
                        </td>
                        <td>{c === 'colour' ? p.ciNumber : (p.grades ?? []).join(', ')}</td>
                        <td>{p.productClass}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {!shown.length && (
            <p>
              Nothing matches that search. <Link href={`/contact/?product=${encodeURIComponent(q)}#rfq`}>Ask us for it</Link> and we will check              with our manufacturers.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
