import type { Metadata } from 'next'

import { ClientPortal } from '@/components/ClientPortal.tsx'

export const metadata: Metadata = { title: 'Client portal', robots: { index: false, follow: false } }

export default function PortalPage() {
  return (
    <div className="legacy">
      <section className="page-hero">
        <div className="hero-inner">
          <h1>Client portal</h1>
          <p className="hero-summary">Your proforma invoices, invoices, payments and shipments in one place.</p>
        </div>
      </section>
      <section>
        <div className="section-inner" style={{ maxWidth: 980, padding: '32px 16px 48px' }}>
          <ClientPortal />
        </div>
      </section>
    </div>
  )
}
