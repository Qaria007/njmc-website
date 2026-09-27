# Decisions log

## 2026-09-26 Custom build replaces the static-edit plan
Owner decision in Claude chat: move off Hostinger's builder / static pages to a
custom build (Next.js + Payload CMS + Postgres on Vercel) so the site can grow into
an application without another platform change. Consequences:
- Supersedes section 0.3 ("do not redesign, no framework") of njmcsitebuildspec.md (11 Aug 2026).
- Everything else in that spec stays in force: no invented facts, not a manufacturer,
  product vs company certification, writing style, Arabic mirror rules, URL plan,
  per-page SEO rules, verification checklist, out-of-scope list.
- Visual continuity: keep the NJMC mark (Drive: njmc > NJMC-mark.svg) and the current
  palette as the starting point; the layout may be redesigned.
- Site structure adds a two-buyer homepage, manufacturer verification, PharmaTrust,
  and a trust page (docs/01).

## 2026-09-26 Markets: international, no country limit
Owner correction: NJMC supplies buyers in any country. The Aug 2026 spec's list
(China, Yemen, the Middle East, the UK) is withdrawn. Consequences: no areaServed
restriction in schema, no country list on pages, "international" wording allowed.
Do not invent country counts or client countries. LNJC (sister company) operates
only in Yemen and stays a separate brand.

## 2026-09-26 NJMC is the parent of the group
Owner: LNJC, PharmaTrust and any future product sit under NJMC. The site gets a
"Our companies" section driven by a Companies collection in the CMS, so new products
are added without code. This replaces the earlier note to keep LNJC off the site.

## 2026-09-26 Facts from the owner's records supersede the Aug 2026 spec
Head office is Jianye District (not Pukou). WhatsApp numbers are published (the "no
phone" rule is withdrawn). Five pillars include excipients and devices. Verification
service has fixed introductory prices. Owner documents are Word files, never .md.

## 2026-09-26 Name and domain stay
Owner: keep the NJMC name and njmcmedicsupp.com. "Nova Ascentis" dropped ("Ascentis"
is a Merck KGaA registered trademark for HPLC columns used in pharma QC). Shorter
domains checked were taken or not wanted. No rename work in any phase.
