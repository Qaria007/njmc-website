import type { Metadata } from 'next'
import type React from 'react'

import { SiteShell } from '@/components/SiteShell.tsx'
import { SITE_URL } from '@/lib/site.ts'

import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-700.css'
import '../legacy.css'
import '../site.css'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'NJMC Medical Supplies', template: '%s | NJMC Medical Supplies' },
  icons: { icon: '/njmc-mark.svg', apple: '/apple-touch-icon.png' },
  // Bing Webmaster Tools ownership (majidqaria@gmail.com account, 16 Oct 2026). Keep it:
  // Bing re-checks the tag, and removing it unverifies the site.
  verification: { other: { 'msvalidate.01': '26E6678872E95CEBA9C2D414EE38D31F' } },
}

export default function EnglishLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell locale="en">{children}</SiteShell>
}
