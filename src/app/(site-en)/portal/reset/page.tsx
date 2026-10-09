import type { Metadata } from 'next'

import { PortalReset } from '@/components/ClientPortal.tsx'

export const metadata: Metadata = { title: 'Set your password', robots: { index: false, follow: false } }

export default function PortalResetPage() {
  return (
    <div className="legacy">
      <section className="page-hero">
        <div className="hero-inner">
          <h1>Set your password</h1>
          <p className="hero-summary">For the client portal.</p>
        </div>
      </section>
      <section>
        <div className="section-inner" style={{ maxWidth: 520, padding: '32px 16px 48px' }}>
          <PortalReset />
        </div>
      </section>
    </div>
  )
}
