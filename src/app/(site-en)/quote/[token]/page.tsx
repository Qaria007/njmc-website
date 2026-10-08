import config from '@payload-config'
import type { Metadata } from 'next'
import { getPayload } from 'payload'

import { QuoteForm } from '@/components/QuoteForm.tsx'
import { CURRENCIES, enquiryByToken, INCOTERMS } from '@/collections/SupplierOrders.ts'
import { loadSeller } from '@/collections/TradeSettings.ts'

// The page a supplier opens from our enquiry email to type the prices. No login: the random key in
// the link is the access. It shows only what the enquiry PDF already shows (never the customer).
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Quotation', robots: { index: false, follow: false } }

const s = (v: unknown) => (v == null ? '' : String(v))

export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const payload = await getPayload({ config })
  const doc = await enquiryByToken(payload, token)
  if (!doc) {
    return (
      <div className="legacy">
        <section className="page-hero">
          <div className="hero-inner">
            <h1>This link is no longer active</h1>
            <p className="hero-summary">The enquiry was closed or the link is too old. Please reply to our email instead.</p>
          </div>
        </section>
      </div>
    )
  }
  const seller = await loadSeller(payload)
  const supplier = doc.supplier && typeof doc.supplier === 'object' ? s((doc.supplier as { name?: unknown }).name) : ''
  const items = ((doc.items as Record<string, unknown>[]) ?? []).map((i) => ({
    id: s(i.id), material: s(i.material), spec: s(i.spec), quantity: i.quantity == null ? '' : s(i.quantity), unit: s(i.unit),
    price: i.quotedPrice == null ? '' : s(i.quotedPrice), moq: s(i.moq), leadTime: s(i.leadTime), note: s(i.quoteNote),
  }))
  return (
    <div className="legacy">
      <section className="page-hero">
        <div className="hero-inner">
          <div className="hero-badge">{seller.companyName}</div>
          <h1>Quotation for enquiry {s(doc.number)}</h1>
          <p className="hero-summary">
            {supplier ? `For ${supplier}. ` : ''}Please enter your price per unit for each item you can supply, then press Send. Leave an item empty if you cannot
            supply it. You can open this page again and change your prices until we place the order.
          </p>
        </div>
      </section>
      <section>
        <div className="section-inner" style={{ maxWidth: 980, padding: '32px 16px 48px' }}>
          <QuoteForm
            token={token}
            items={items}
            currencies={CURRENCIES}
            incoterms={INCOTERMS}
            initial={{
              currency: s(doc.quoteCurrency) || s(doc.currency) || 'USD', incoterm: s(doc.quoteIncoterm) || s(doc.incoterm), incotermPlace: s(doc.quoteIncotermPlace) || s(doc.incotermPlace),
              validUntil: s(doc.quoteValidUntil).slice(0, 10), paymentTerms: s(doc.quotePaymentTerms), contactName: s(doc.quoteContact), notes: s(doc.quoteNotes),
            }}
            answered={s(doc.quoteReceivedAt).slice(0, 10)}
          />
        </div>
      </section>
    </div>
  )
}
