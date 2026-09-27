import type { Metadata } from 'next'

import { boilerplate } from '@/lib/site.ts'

// Phase 1 shell. The two-buyer homepage (docs/01) replaces this in Phase 2/3.
export const metadata: Metadata = {
  alternates: { canonical: '/', languages: { en: '/', ar: '/ar/', 'x-default': '/' } },
  robots: { index: false, follow: false },
}

export default function HomePage() {
  return (
    <section className="hero">
      <div className="container">
        <h1>NJMC Medical Supplies</h1>
        <p>{boilerplate}</p>
      </div>
    </section>
  )
}
