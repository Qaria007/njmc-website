# 04 Phases and acceptance criteria

One phase per nightly run where possible. A phase is done only when every
acceptance box is true. Record progress in STATUS.md (phase, done, blocked-on, next).

## Phase 0: Setup and old-site inventory (session 1)
- [ ] Private repo Qaria007/njmc-website exists with this pack committed.
- [ ] `docs/old-site/inventory.md` lists every URL of the current site (crawl it;
  the site blocks some bots, so use a normal browser user agent or ask the
  owner for a Hostinger export if blocked), with title, meta description and
  a text snapshot saved in `docs/old-site/pages/`.
- [ ] Check whether any of the Aug 2026 spec was already implemented (robots.txt,
  /drug-apis/ etc.) and record the live state in inventory.md.
- [ ] Copy all existing Arabic text into docs/old-site/pages/ for reuse.
- [ ] Find the built-but-never-uploaded assets (verification page EN/AR with 6 FAQs,
  WhatsApp button, "Impurity profiles in APIs" draft) in Drive and the Work Log;
  save them under docs/old-site/unpublished/.
- [ ] `docs/old-site/redirect-map.csv` maps every old URL to a new URL from docs/01.
- [ ] STATUS.md (repo), STATUS.docx and OWNER-QUESTIONS.docx (Drive), docs/DECISIONS.md created.
- [ ] Nightly scheduled task running and backed up (docs/07).

## Phase 1: Foundation
- [ ] Next.js + Payload + Postgres running locally and on a Vercel preview URL.
- [ ] /admin login works; en and ar locales configured; /ar renders dir="rtl".
- [ ] Design tokens, typography (Latin + Arabic), header, footer, layout shell.
- [ ] CI pipeline green (typecheck, lint, tests, claims-lint stub).
- Blocked if: Vercel or database account missing. Then list the owner's exact
  clicks in OWNER-QUESTIONS.docx and continue Phase 2 work locally.

## Phase 2: Content model and templates
- [ ] All collections and globals from docs/03 exist with validation.
- [ ] Templates: home, pillar, verification, group hub, company page (LNJC,
  PharmaTrust, future), about, trust, article, contact, legal.
- [ ] Every page in the docs/01 sitemap exists (with [OPEN] placeholders allowed
  in draft, not in published state).

## Phase 3: Copy (English)
- [ ] English copy for every page, written only from BRAND.md and docs/05.
- [ ] claims-lint complete and passing; zero dashes, zero forbidden words.
- [ ] Old-copy fixes from docs/02 applied.
- [ ] Verification and PharmaTrust pages checked against the PharmaTrust repo gates
  (expert subagent only if the owner said yes).
- [ ] Remaining [OPEN] items listed in OWNER-QUESTIONS.docx.

## Phase 4: SEO, AEO, analytics
- [ ] Everything in docs/03 "SEO / AEO" and "Analytics" done.
- [ ] Redirect map implemented; test proves every old URL returns 301 to a 200.
- [ ] Lighthouse budgets met on the preview URL (mobile).

## Phase 5: Forms and integrations
- [ ] RFQ form saves to Leads, reaches HubSpot, emails the owner (verified with a
  test submission clearly marked TEST, then deleted from HubSpot by the owner
  or left tagged TEST).
- [ ] Turnstile working; rate limit in place; UTM captured.

## Phase 6: QA and checkpoint C2
- [ ] Playwright, axe and link checks green. Manual read-through by reviewer.
- [ ] Owner receives ONE message: preview link + 5-line summary. Work continues
  without waiting; he replies only if he wants changes.

## Phase 7: Go-live (hard stop only at the DNS switch)
- [ ] Boilerplate and verification disclaimer approved (C1 question 5).
- [ ] DNS records exported first; only apex and www changed (docs/03 "DNS and email
  safety"). Cutover steps given to the owner, or done via API only if he explicitly
  allows it. Old Hostinger site kept untouched for 30 days as fallback.
- [ ] Email to info@ and sale@ verified working after cutover; drqaria subdomain still resolves.
- [ ] Production checks: HTTPS, redirects, sitemap submitted to Search Console,
  GA4 receiving events, RFQ works in production.
- [ ] 14-day watch in the nightly task: 404s, form failures, Core Web Vitals.

## Phase 8: Arabic mirror
- At launch: Arabic pages whose text comes from the existing owner-written Arabic
  go live; any page without reviewed Arabic stays unpublished and is excluded from
  hreflang and the sitemap (no half-translated pages).
- Trigger for the rest: the owner or a named native reviewer supplies or approves text.
- [ ] Arabic keyword research done from scratch (not translated from English).
- [ ] Every Arabic page reviewed before publish; hreflang reciprocal for every pair.

## Phase 9: Insights cycle on the new site (after launch)
- [ ] The growth-engine blog cycle publishes Insights articles through the Payload API
  (EN; AR per Phase 8 rules), continuing the 20-topic queue. No approval gate;
  report what went out.

## Skipped growth-engine chunks (on purpose, for now)
Email lifecycle (06), outbound and PR (07), and authority and links (10) start
after launch (blog automation is Phase 9). The weekly cycle (08) starts once GA4 has 2 weeks
of data. LinkedIn is owned by the linkedin-growth skill.
