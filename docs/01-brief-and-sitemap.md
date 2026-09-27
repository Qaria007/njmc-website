# 01 Brief and sitemap

## Starting point
- Live site since 12 Aug 2026: static HTML on Hostinger, about 32 pages EN/AR (22 interior
  pages, five pillars, author bylines, insights pages), shared CSS /assets/njmc-home.css
  and /assets/njmc-pages.css. Inventory every URL in Phase 0; every one gets a 301.
- Built but never uploaded (look for them in Drive NJMC folders and recent Work Log notes,
  reuse the content): rebuilt verification page EN/AR (answer block, 6 FAQs, FAQPage
  schema), WhatsApp button, 24 Aug draft article "Impurity profiles in APIs" EN/AR.
- The owner calls the current site messy and untailored. It must read as a real,
  authentic company.

## Problems this site fixes
- Two buyers mixed into one general message; services unclear.
- Long, duplicated titles; typo "competiive"; "disposals" for "disposables"; "etc...".
- Generic "highly educated medical experts" with no names.
- No contact form, no payment path, mailto links only.
- "NJMC" search results are dominated by New Jersey sites: always "NJMC Medical Supplies".

## Sitemap (trailing slashes; /ar/ mirrors everything)
| URL | Page | Notes |
|---|---|---|
| / | Home | H1 = positioning. Two buyer paths: "For hospitals and clinics", "For pharmaceutical buyers". Verification strip with the three prices. Group strip (LNJC, PharmaTrust). Proof, RFQ. |
| /apis/ | Pillar | APIs from China and India |
| /excipients/ | Pillar | |
| /medical-consumables/ | Pillar | Certification is the product's, never NJMC's |
| /medical-devices/ | Pillar | Incl. minimally invasive surgical visualisation equipment |
| /consultancy/ | Pillar | Procurement, compliance, facility project studies |
| /verification/ | Service | Three products with prices, what is checked, process, deliverable sample (redacted), independence rules, disclaimer, FAQ, order form |
| /group/ | Our companies | Cards from the Companies collection: NJMC, LNJC, PharmaTrust, future entries |
| /group/lnjc/ | LNJC | Yemen pharmaceutical company under NJMC, links to its site |
| /group/pharmatrust/ | PharmaTrust | "PharmaTrust COA Validator by NJMC", tagline verbatim, links to pharmatrust.tech |
| /about/ | About | Founder & Technical Director, credentials, team (photos allowed, retouched), head office Jianye District |
| /trust/ | Due diligence | How suppliers are qualified, confidentiality policy, certificates on request |
| /insights/ + articles | Insights | Existing articles migrated; queue continues after launch |
| /contact/ | Contact | RFQ form, WhatsApp buttons, WeChat, emails, office |
| /privacy/, /terms/ | Legal | Owner-approved text only |
| robots.txt, sitemap.xml, llms.txt, 404 | Technical | 404 bilingual |

Pillar URLs above are proposals: if the live site already uses different slugs that rank,
KEEP the live slugs and adjust this table (record in docs/DECISIONS.md). Never break a live URL.

## Page rules
- Pillar page order: who it is for, what we supply (categories, [OPEN] until the owner gives lists),
  certification (product, not NJMC), how it works (numbered, no invented timeframes),
  international supply, FAQ, one RFQ call to action, links to verification and one article.
- Verification CTA on every pillar page: "Not sure about a supplier? Get it verified."
- Floating WhatsApp button on every page (primary number), exact wa.me format.
- Group section: every company card comes from the CMS; adding a new product = one new CMS entry.
- Reuse the owner's existing sentences wherever they work.

## Design direction
Clinical, calm, credible. Keep the NJMC mark (Drive: njmc > NJMC-mark.svg, ID
1VpU8a5bwUkfb9p3aX-FEX2UpsR_5JS3V: navy-to-teal tile, white caduceus, gold dot) and the
navy/teal palette of the business card. Real photos from orders and exhibitions, retouched,
third-party names cropped out. Typography with a matching Arabic cut (for example IBM Plex
Sans + IBM Plex Sans Arabic). Use the frontend-design skill if available.
Each group company keeps its own brand inside its card (PharmaTrust Brand Manual v3 colours
only inside the PharmaTrust card and page).

## Assets in Drive (Claude shared drive > NJMC)
njmc > NJMC-mark.svg, njmc assets (39 images; supplier PDFs inside are CONFIDENTIAL),
njmc > China Medical fair (exhibition media), NJMC PHOTOS, Media, NJMC business card.
Suppliers files and "02 CPHI Shenzhen 2026 trip": internal only.
