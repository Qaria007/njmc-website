import type React from 'react'

import type { Locale } from '@/lib/site.ts'

import { SiteFooter } from './SiteFooter.tsx'
import { SiteHeader } from './SiteHeader.tsx'
import { WhatsAppButton } from './WhatsAppButton.tsx'

// Root <html> for one locale. English and Arabic each have their own root layout
// (route groups (site-en) and (site-ar)) so /ar renders dir="rtl" from the server.
export function SiteShell({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <body>
        <a className="skip-link" href="#main">{/* Arabic label waits for review (docs/arabic-review.md) */}Skip to content</a>
        <SiteHeader locale={locale} />
        <main id="main">{children}</main>
        <SiteFooter locale={locale} />
        <WhatsAppButton locale={locale} />
      </body>
    </html>
  )
}
