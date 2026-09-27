import Link from 'next/link'

import { type Locale, nav, ui } from '@/lib/site.ts'

export function SiteHeader({ locale }: { locale: Locale }) {
  const t = ui[locale]
  return (
    <header className="site-header">
      <div className="container header-row">
        <Link href={locale === 'ar' ? '/ar/' : '/'} className="brand" aria-label={t.home}>
          <img src="/njmc-mark.svg" alt="" width={40} height={40} />
          <span className="brand-text" dir="ltr">
            <span className="brand-name">NJMC</span>
            <span className="brand-sub">MEDICAL SUPPLIES CO., LTD</span>
          </span>
        </Link>
        <nav aria-label="Main">
          <ul className="nav-list">
            {nav[locale].map((item) => (
              <li key={item.label} className={item.children ? 'has-children' : undefined}>
                <Link href={item.href}>{item.label}</Link>
                {item.children && (
                  <ul className="sub-list">
                    {item.children.map((c) => (
                      <li key={c.href}>
                        <Link href={c.href}>{c.label}</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            <li>
              <Link href={t.switchHref} hrefLang={locale === 'ar' ? 'en' : 'ar'} lang={locale === 'ar' ? 'en' : 'ar'}>
                {t.switchLabel}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  )
}
