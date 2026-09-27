// Site-wide facts and navigation. Every value comes from BRAND.md or the owner's existing
// wording on the live site (docs/old-site). Phase 2 moves these into the SiteSettings and
// Navigation globals; until then this file is the single source.

export type Locale = 'en' | 'ar'

export const SITE_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'https://njmcmedicsupp.com'

export const contact = {
  legalName: 'NJMC Medical Supplies Co., Ltd',
  emailGeneral: 'info@njmcmedicsupp.com',
  emailSales: 'sale@njmcmedicsupp.com',
  whatsappPrimary: { href: 'https://wa.me/8613244536191', label: '+86 132 4453 6191' },
  whatsappSecondary: { href: 'https://wa.me/8618860876679', label: '+86 188 6087 6679' },
  wechat: 'https://u.wechat.com/MJTUpQoMvV9_Hlk_pr26EbE',
  linkedin: 'https://www.linkedin.com/company/105923818/',
  address: {
    en: 'Jianye District, Nanjing, Jiangsu, China',
    // Owner's existing Arabic (live footer) names the city only; the district waits for reviewed Arabic.
    ar: 'نانجينغ، الصين',
  },
}

export type NavItem = { href: string; label: string; children?: NavItem[] }

// Labels are the live site's own wording (docs/old-site/pages), EN and AR.
export const nav: Record<Locale, NavItem[]> = {
  en: [
    {
      href: '/drug-apis/',
      label: 'What we source',
      children: [
        { href: '/drug-apis/', label: 'Active Pharmaceutical Ingredients' },
        { href: '/excipients/', label: 'Pharmaceutical Excipients' },
        { href: '/medical-consumables/', label: 'Medical Consumables' },
        { href: '/medical-equipment/', label: 'Medical Devices and Equipment' },
        { href: '/consultancy/', label: 'Sourcing Consultancy' },
      ],
    },
    { href: '/verification/', label: 'Independent Verification' },
    { href: '/insights/', label: 'Insights' },
    { href: '/about/', label: 'About' },
    { href: '/contact/', label: 'Contact Us' },
  ],
  ar: [
    {
      href: '/ar/drug-apis/',
      label: 'ما نقوم بتوريده',
      children: [
        { href: '/ar/drug-apis/', label: 'المواد الفعالة الدوائية' },
        { href: '/ar/excipients/', label: 'السواغات الدوائية' },
        { href: '/ar/medical-consumables/', label: 'المستلزمات الطبية' },
        { href: '/ar/medical-equipment/', label: 'الأجهزة والمعدات الطبية' },
        { href: '/ar/consultancy/', label: 'استشارات التوريد' },
      ],
    },
    { href: '/ar/verification/', label: 'التحقق المستقل' },
    { href: '/ar/insights/', label: 'مقالات' },
    { href: '/ar/about/', label: 'من نحن' },
    { href: '/ar/contact/', label: 'اتصل بنا' },
  ],
}

export const ui: Record<Locale, { home: string; switchLabel: string; switchHref: string; whatsapp: string }> = {
  en: { home: 'Home', switchLabel: 'العربية', switchHref: '/ar/', whatsapp: 'WhatsApp' },
  ar: { home: 'الرئيسية', switchLabel: 'English', switchHref: '/', whatsapp: 'WhatsApp' },
}

// Approved by the owner 27 Sep 2026 (BRAND.md). English only until reviewed Arabic exists.
export const boilerplate =
  'NJMC Medical Supplies is a sourcing, verification and consultancy company in Nanjing, China, serving hospitals and pharmaceutical buyers worldwide. The NJMC group also includes LNJC, a pharmaceutical company in Yemen, and PharmaTrust, a software product for certificate of analysis review.'
