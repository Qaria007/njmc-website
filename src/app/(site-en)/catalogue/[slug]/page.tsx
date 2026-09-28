import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CATEGORY_SINGULAR, productBySlug } from '@/lib/catalogue.ts'

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

const valid = (slug: string) => /^[a-z0-9-]{1,120}$/.test(slug)

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const p = valid(slug) ? await productBySlug(slug) : null
  if (!p) return {}
  const kind = p.category === 'api' ? 'API' : p.category === 'colour' ? 'pharmaceutical colour' : 'excipient'
  return {
    title: `${p.name} ${kind}`,
    description: `Request a quotation for ${p.name}${p.cas ? ` (CAS ${p.cas})` : ''}${p.ciNumber ? ` (C.I. ${p.ciNumber})` : ''}${p.grades?.length ? `, ${p.grades.join(', ')} grade` : ''}, sourced through NJMC Medical Supplies.`,
    alternates: { canonical: `/catalogue/${p.slug}/` },
  }
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params
  const p = valid(slug) ? await productBySlug(slug) : null
  if (!p) notFound()

  const rows: [string, string | null | undefined][] = [
    ['Category', CATEGORY_SINGULAR[p.category]],
    [p.category === 'colour' ? 'Type' : 'Class', p.productClass],
    ['Other names', p.otherNames],
    ['CAS number', p.cas],
    ['C.I. number', p.ciNumber],
    ['Grades listed by the manufacturer', p.grades?.length ? p.grades.join(', ') : null],
  ]
  const rfq = `/contact/?product=${encodeURIComponent(p.name)}#rfq`

  return (
    <div className="legacy catalogue">
      <section className="page-hero">
        <div className="hero-inner">
          <div className="hero-badge">
            <Link href="/catalogue/">Products</Link>
          </div>
          <h1>{p.name}</h1>
          <p className="hero-summary">{CATEGORY_SINGULAR[p.category]}, sourced to your specification.</p>
        </div>
      </section>
      <section>
        <div className="section-inner">
          <div className="prose">
            <dl className="cat-facts">
              {rows
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
            <h2>Request a quotation</h2>
            <p>
              Tell us the grade or specification, the quantity and the destination market. We reply with availability, lead time and the
              documents that come with the material: the certificate of analysis and the quality documents the manufacturer holds (for
              example GMP, ISO, DMF or CEP).
            </p>
            {p.category === 'api' && <p>Supply depends on the patent status of the molecule in your country.</p>}
            <p>
              <Link className="cat-button" href={rfq}>
                Request a quotation for {p.name}
              </Link>
            </p>
            <p>
              <Link href="/catalogue/">Back to all products</Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
