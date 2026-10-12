'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

// Cookie-free visitor counter: sends the page path (and, on the first page only, the referring
// website) to /track/. Also counts clicks on WhatsApp, email and phone links.
function send(p: string, k: string, r = '') {
  try {
    const body = JSON.stringify({ p, k, r })
    if (!navigator.sendBeacon?.('/track/', new Blob([body], { type: 'application/json' }))) {
      void fetch('/track/', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } })
    }
  } catch {
    /* never break the page */
  }
}

export function Track() {
  const path = usePathname() || '/'
  const last = useRef('')
  useEffect(() => {
    // Once per page: React may run this twice for the same page (development mode).
    if (last.current === path) return
    send(path, 'view', last.current ? location.origin : document.referrer)
    last.current = path
  }, [path])
  useEffect(() => {
    const on = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a')
      const h = a?.getAttribute('href') || ''
      const k = /wa\.me|whatsapp/i.test(h) ? 'whatsapp' : h.startsWith('mailto:') ? 'email' : h.startsWith('tel:') ? 'phone' : ''
      if (k) send(location.pathname, k)
    }
    document.addEventListener('click', on, { capture: true })
    return () => document.removeEventListener('click', on, { capture: true })
  }, [])
  return null
}
