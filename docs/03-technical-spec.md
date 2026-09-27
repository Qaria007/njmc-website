# 03 Technical spec

## Architecture
- One Next.js app with Payload mounted at /admin. Public pages server-rendered
  (static where possible, revalidated on CMS publish).
- Payload collections (Phase 2): Pages, Services, ProductCategories, Certificates,
  TeamMembers, Testimonials (permissionOnFile required), Partners (permissionOnFile),
  Articles (author, lastReviewed), FAQs, Leads (RFQ and verification orders),
  Companies (name, relation "parent / sister company / product", one-line, region,
  url, logo, brand colours, status, order; drives /group/ and the home group strip),
  VerificationProducts (name, introductory price, standard price, what is checked,
  deliverable), Redirects, Media.
  Globals: SiteSettings (contact details, social links, boilerplate), Navigation.
- Localization: Payload localization en, ar. Routes /(en) and /ar with dir="rtl".
  Complete, bidirectional hreflang including x-default.
- Future-ready (do not build yet, just do not block): a Users collection with roles,
  so a client portal, manufacturer database or PharmaTrust API link can be added
  later in the same app.

## SEO / AEO (Phase 4)
- Unique title and meta description per page per language, from CMS fields with
  length validation (title 50 to 60, description 140 to 160).
- Self-referencing canonicals. Generated sitemap.xml. Clean status codes.
- robots.txt allows Googlebot, Bingbot and the main AI crawlers (GPTBot,
  OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended); disallows /admin and /api.
- llms.txt generated from CMS (boilerplate, service list, key pages).
- JSON-LD: Organization (type Organization, never Manufacturer; name, url, email,
  address Jianye District / Nanjing / Jiangsu / CN, founder Dr. Majid Qaria, sameAs the
  LinkedIn company page, subOrganization entries generated from the Companies
  collection; no areaServed restriction), Service per pillar and per verification
  product (with offers matching the page prices exactly), WebSite, Service per
  service page, FAQPage where FAQs exist, Article with author and dateModified,
  BreadcrumbList. Only real data; no fake reviews or ratings.
- Redirects: every old Hostinger URL from the Phase 0 inventory 301s to its best
  new match (Redirects collection + next.config / middleware). Zero 404s from old URLs.
- Performance budget (mobile): LCP under 2.5 s, CLS under 0.1, INP under 200 ms,
  Lighthouse Performance, SEO, Accessibility, Best Practices all 90 or more.

## Forms and CRM (Phase 5)
- One RFQ form: name, company, role, country, email, phone/WhatsApp, service
  (prefilled), message, file upload (optional, spec sheets), required free-text
  "How did you hear about us?", consent checkbox.
- Verification order form: product (prefilled), buyer details, supplier or product to
  check, documents upload, notes. Creates a Lead with type "verification order".
  No online payment at launch; NJMC replies with payment instructions. Payment
  provider is a later decision (not all providers work for a China-based company).
- WhatsApp: floating button on every page, links exactly https://wa.me/8613244536191,
  never without 86, no plus sign or spaces in the link.
- Spam protection: Cloudflare Turnstile (or equivalent, no CAPTCHA puzzles for users).
- On submit: save to Leads, send to HubSpot (Forms API or private app token from env),
  email notification to sale@njmcmedicsupp.com. UTM first and last touch
  stored on the lead.

## Analytics (Phase 4)
- GA4 with consent mode, tag on public pages only. Events: service_view, rfq_start,
  rfq_submit, verification_order_submit, whatsapp_click, email_click,
  group_outbound (LNJC, PharmaTrust).
- Search Console: domain property; verification via DNS or HTML file (owner click
  steps listed if DNS access is needed).

## Quality and CI (GitHub Actions)
- Typecheck, lint, unit tests, claims-lint, link check, Playwright smoke tests
  (home, each service page, RFQ submit in test mode, /ar renders RTL),
  axe accessibility check, Lighthouse CI against the preview URL with the budgets above.
- Branch per phase, preview deploy per PR, reviewer subagent before merge.

## DNS and email safety (critical at launch)
- The domain carries live email (info@, sale@) and the subdomain drqaria.njmcmedicsupp.com.
- Before any change, export and save every DNS record to docs/old-site/dns-before.txt.
- Change ONLY the apex and www records needed for Vercel. Never touch MX, SPF, DKIM,
  DMARC, or the drqaria record. Verify email delivery to info@ and sale@ right after.
- Never touch yedcoyemen.org.

## Security
- Secrets only in Vercel env vars. /admin behind Payload auth; owner account created
  by the owner (Claude sends the invite link steps). Rate limit the RFQ endpoint.
  Security headers (CSP, HSTS, X-Frame-Options). Dependabot on.
- Database backups: confirm the managed Postgres plan has point-in-time restore;
  record it in docs/DECISIONS.md.
