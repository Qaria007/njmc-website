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

## 2026-09-27 Keep the live slug stems (docs/01 rule "never break a live URL")
The live site uses `/drug-apis.html` and `/medical-equipment.html`, not the proposed
`/apis/` and `/medical-devices/`. New URLs keep the live stems in the docs/01 trailing-slash
form: `/drug-apis/`, `/excipients/`, `/medical-consumables/`, `/medical-equipment/`,
`/consultancy/`, `/verification/`, `/about/`, `/contact/`, `/insights/`, and articles move
from `/insights-<slug>.html` to `/insights/<slug>/`. The medical-equipment page covers the
devices pillar (its H1 and copy say "medical devices and equipment"). Every old `.html` URL
301s per `docs/old-site/redirect-map.csv`. Why: continuity with the live site and the Aug
2026 spec's target titles; Search Console data is not available yet to prove either slug ranks.

## 2026-09-27 LNJC facts found in the LNJC project (not asked from scratch)
LNJC project (Mac: ~/Downloads/LNJC Claude Project) gives the English legal name
"LNJC Pharmaceuticals and Medical Supplies Co., Ltd.", main site landcarenj.com, and the
approved logo `brand/lnjc-logo-horizontal-colour-verified.png` (inside LNJC-Brand-Kit.zip).
One older source says "Land Nanjing Care Co. Ltd.", so the owner confirms the name (question 2).

## 2026-09-27 Hosting moves to the PharmaTrust Hostinger VPS (Vercel and Neon dropped)
Owner decision (OWNER-QUESTIONS 3 "use hostinger", then written instructions the same day).
The site runs on the VPS that already runs PharmaTrust (srv1625890, 187.127.158.97,
Ubuntu 24.04; 7.8 GB RAM with 5.6 GB available, 2 GB swap, 95 GB disk at 41%).
- Build: GitHub Actions builds the Docker image and pushes it to GHCR. The server never
  builds Next.js (it would compete with PharmaTrust for memory).
- Database: separate `njmc` database and `njmc` login inside pharmatrust-db-1. Created
  27 Sep 2026. CONNECT on `njmc` is revoked from PUBLIC; CONNECT on `pharmatrust` is also
  revoked from PUBLIC, so the njmc login cannot open the PharmaTrust database (tested).
  Credentials live only in /opt/njmc/.env on the server.
- Web: the existing PharmaTrust Caddy gets njmcmedicsupp.com and www blocks, `caddy
  validate` before `caddy reload`, never a restart. The NJMC container joins the
  `pharmatrust_internal` network.
- Backups: PharmaTrust already has a nightly dump (02:20, 14 local, 30 off-site in Google
  Cloud Storage, weekly restore drill). NJMC gets its own script /opt/njmc/backup_njmc.sh,
  cron 02:35, 14 local dumps in /root/backups. Off-site copy is an owner question.
- Trade-offs accepted: no automatic preview per branch (a preview hostname on the VPS
  replaces it), shared blast radius with PharmaTrust (mitigated by the shared server rules
  in CLAUDE.md), no managed point-in-time restore (nightly dumps instead).
- Vercel/Neon mentions in docs/03, 04, 06 and 07 are superseded.

## 2026-09-27 Owner answers to OWNER-QUESTIONS (first batch)
1 Product lists: none; sourced to client requirements. 2 LNJC: "LNJC Pharmaceuticals and
Medical Supplies" (Co., Ltd.). 3 Hosting: Hostinger VPS. 4 Boilerplate and disclaimer:
approved. 5 Arabic for new pages: Claude drafts, pages stay unpublished until reviewed.
6 Fable expert claims review: yes. 7 August verification page file: answered "yes" but no
file was added to the folder; the page is written from the live page (default).
8 Nightly build: "for now no need, later on can be done", so the build advances only in
owner-started sessions until he says otherwise.

## 2026-09-27 Repo made public by the owner; history checked
No secrets in any commit. One client name (old homepage testimonial) was in docs/05 and
the homepage snapshot; removed from the current files in d395c51. It remains in the three
earlier commits until the owner decides on a history rewrite (OWNER-QUESTIONS).

## 2026-09-27 Owner answers, second batch
1 Off-site copy of the NJMC database: Google Drive, not Google Cloud Storage. Each nightly
dump is uploaded to Claude shared drive > NJMC > "04 Website database backups (automatic)"
(folder 1tF12YMQUXjVHlNNhIFoutxMne0uOeuI2), shared as writer with PharmaTrust's own service
account cloud-storage-ptai@pharmatrust-ai.iam.gserviceaccount.com. The upload runs inside
pharmatrust-api-1 (where that key is mounted), like PharmaTrust's own off-site upload; no new
secret was created. Writer on a shared-drive folder cannot trash files, so Drive keeps every
dump (they are small); the server keeps 14. Blocked until the owner enables the Google Drive
API in the pharmatrust-ai Cloud project (one click).
2 Client name in the first 3 commits: owner said no need to remove. History stays as is.
3 SPF and DMARC: default. At C3 Claude gives the owner the exact records to add in hPanel.

## 2026-09-27 LAUNCH (C3): njmcmedicsupp.com serves the new site
Owner asked to publish directly without further preview rounds. Content = the 43 live pages
imported with BRAND.md corrections plus /group/, /group/lnjc/, /group/pharmatrust/, /trust/,
after a Fable claims review (5 blockers fixed). DNS in hPanel: ALIAS @ -> Hostinger CDN deleted
(by Claude), A @ 187.127.158.97, TXT @ SPF (include:_spf.google.com ~all) and TXT _dmarc
(p=none) added (by the owner; Claude's DNS edits were blocked by the safety check after the
delete, which left the apex without a record for a few minutes). www CNAME still points to the
Hostinger CDN until the owner edits it to njmcmedicsupp.com. MX, DKIM, drqaria, ftp untouched.
Let's Encrypt certificate for njmcmedicsupp.com issued 27 Sep, expires 26 Dec 2026 (Caddy renews).
Rollback: docs/old-site/dns-before.txt. The Hostinger site stays for 30 days.
Not yet done: RFQ and verification forms (Phase 5), owner admin account, two-buyer home page.

## 2026-09-28 Public product pages (owner)
Asked whether to publish the product catalogue despite the 27 Sep "no product lists" answer,
the owner chose "Publish the product pages". /catalogue/ lists examples of products NJMC
sources (framed as a starting point, not a fixed catalogue). Published: pharmacopoeial APIs
(EP/USP/JP) and pharmaceutical colours. Kept unpublished: in-house specification and R&D
molecules until their patent status is checked. API pages say supply depends on the patent
status in the destination country. Supplier names, prices and documents stay private
(admin-only fields). Data is imported from Drive NJMC > Suppliers files, never committed.

## 2026-10-02 Orders: supplier enquiries, purchase orders, buyer documents (owner request)
The owner asked for Order matching to go on to the paperwork: prepare a PO, message the suppliers
after one confirmation click, then prepare the PI, invoice and packing list for the buyer.
Built as admin group "Orders" (all private, admin login only):
- Supplier enquiries and purchase orders (`supplier-orders`): one record per supplier, numbered
  NJMC-RFQ-yyyy-nnnn / NJMC-PO-yyyy-nnnn, PDF from pdf-lib, message written from the items.
  A real PO needs a price, so the first message is an enquiry; "Make a purchase order from this
  enquiry" copies it into a PO once the supplier has quoted.
- Sending: only through POST /api/supplier-orders/:id/send with {confirm:true} from a signed-in
  admin, after a panel that shows every recipient. Mail goes through the existing SMTP relay as
  sale@njmcmedicsupp.com, reply-to the address in Company details. A sent record is not sent
  twice unless the user ticks it again. "Send a test to myself" mails only the signed-in user.
  The customer name is never put in a supplier message. WeChat cannot be automated: suppliers
  without an email are listed with their phone and WeChat for the owner to contact by hand.
- Buyer documents (`buyer-documents`): one record prints three PDFs (proforma invoice,
  commercial invoice, packing list), numbered NJMC-PI-yyyy-nnnn and NJMC-INV-yyyy-nnnn.
- Company details for documents (global `trade-settings`): legal name, address, signatory,
  bank details, usual payment terms. Bank details are typed by the owner, never by Claude, and
  never enter this repo.
- PDFs are English only (built-in Latin fonts); Chinese or Arabic text is left out of the PDF.
- No company stamp image: Media is public, so the stamp is added by hand after printing.
