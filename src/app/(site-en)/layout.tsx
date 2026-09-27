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
}

export default function EnglishLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell locale="en">{children}</SiteShell>
}
