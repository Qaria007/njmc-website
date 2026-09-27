import Link from 'next/link'

import { contact, type Locale } from '@/lib/site.ts'

export function SiteFooter({ locale }: { locale: Locale }) {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <p className="footer-name" dir="ltr">{contact.legalName}</p>
          <p>{contact.address[locale]}</p>
          {locale === 'en' && (
            <ul className="footer-contact">
              <li><Link href="/group/">Our companies</Link></li>
              <li><Link href="/trust/">Due diligence and confidentiality</Link></li>
            </ul>
          )}
        </div>
        <ul className="footer-contact" dir="ltr">
          <li><a href={`mailto:${contact.emailGeneral}`}>{contact.emailGeneral}</a></li>
          <li><a href={`mailto:${contact.emailSales}`}>{contact.emailSales}</a></li>
          <li><a href={contact.whatsappPrimary.href} rel="noopener">WhatsApp {contact.whatsappPrimary.label}</a></li>
          <li><a href={contact.whatsappSecondary.href} rel="noopener">WhatsApp {contact.whatsappSecondary.label}</a></li>
          <li><a href={contact.wechat} rel="noopener">WeChat</a></li>
          <li><a href={contact.linkedin} rel="noopener">LinkedIn</a></li>
        </ul>
      </div>
      <p className="container footer-copy" dir="ltr">© {new Date().getFullYear()} {contact.legalName}</p>
    </footer>
  )
}
