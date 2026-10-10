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

## 2026-10-08 Order desk: supplier prices, margin to PI, client sending, accounts, documents (owner request)
The owner asked for the whole order cycle in one place, sellable later as a product, with all trade
documents in English only ("I use English everywhere for formal documents"). Built on the Orders group:
- Supplier price page: every enquiry gets a random 32-character key (`quoteToken`). The email and
  the PDF carry https://njmcmedicsupp.com/quote/<key>; the supplier types prices, MOQ, lead time,
  validity and terms without a login. The key is the only access; the page shows what the enquiry
  PDF already shows (never the customer) and can only write the quotation fields of that enquiry.
  It closes when the enquiry is cancelled or confirmed, or 120 days after its date. Not indexed
  (robots + noindex). We get an email when prices arrive.
- Why a form and not AI reading of emails first: exact numbers, no paid model call, works for every
  buyer of the software without an API key. Reading free-form supplier emails with AI is phase 2
  (needs inbox access and the owner's choice of model key).
- Price comparison on the order: every quoted price per order line, cheapest first, converted to
  the PI currency with the rates typed in Company details (never guessed: a missing rate blocks).
  Margin per line (default in Company details) makes the selling price; "Make the proforma invoice"
  creates a draft PI. Each PI item keeps the cost and the supplier in fields that are never printed.
- Clients collection: details typed once, copied onto PIs. PI, invoice and packing list can be sent
  to the client (PDF, Excel optional) only after a confirm panel, or as a test to oneself.
  The Excel is built from the same layout as the PDF, so the two always match.
- Accounts (group "Accounts"): Money in and out (received from clients, paid to suppliers, costs),
  kept in USD at the rate used, void instead of delete. Accounts overview: period totals, what
  clients still owe, what we owe suppliers, profit per sale, Excel for the accountant. A management
  view, not bookkeeping for tax: the accountant keeps the statutory books.
- Documents (`trade-files`): any paper of a deal, private, in the orders volume sub-folder
  `documents` (not under public media), listed on the client, supplier, order and sale.
- Optional logo in Company details, printed on every PDF (the logo is public anyway; the stamp
  still is not uploaded, see 2026-10-02).

## 2026-10-08 Exchange rates, AI mode, API key in the admin (owner request)
- Rates: "Automatic" fetches the ECB reference rates (api.frankfurter.dev, free, no key) at most
  every 12 hours; "I type them myself" keeps typed rates. Existing rows with typed rates were set
  to manual by the migration, so nothing the owner typed is overwritten.
- AI mode switch (off = simple mode: no AI, no AI cost). Model choice: Opus 5.5 (default),
  Sonnet 5.5, Haiku 5.5. First AI feature: read a pasted supplier reply into the quotation; the
  result is only a proposal, saved after the user checks it.
- The API key is pasted in Company details and stored encrypted (AES-256-GCM, key derived from
  PAYLOAD_SECRET); it is never readable through the API or the admin, never logged, and only the
  last 4 characters are shown. Rotating PAYLOAD_SECRET makes the saved key unreadable: paste it again.

## 2026-10-09 Dashboard, mailbox, WhatsApp, portal, roles (owner request: "finish all of it")
- Home dashboard (admin first page): search, quick actions, money (owner only), to-do lists built from
  the records; reminders always shown and confirmed before sending. Price history and supplier
  scorecard computed from enquiries, purchase orders and sales.
- AI: Claude or OpenAI, the provider follows the chosen model; the owner's existing key is OpenAI.
- Mailbox: IMAP with an app password stored encrypted. Only emails carrying one of our numbers are
  read; only senders matching the supplier or client (same address, or same company domain but never
  a free-mail domain) change a record; anything else is listed as "Unknown sender".
- WhatsApp: no API account. A wa.me link opens the user's own WhatsApp with the text and a private
  document link (random key, 90 days, only the documents shared, never an invoice before it exists).
- PharmaTrust check is a manual handoff for now (download, upload at pharmatrust.tech, note the
  result). A direct API link needs a scoped partner token in PharmaTrust itself: separate change.
- Roles: owner / staff / importer; an account without a role is an owner (accounts made before
  roles); the last owner cannot be demoted. Activity log of admin changes.
- Client portal: separate login collection (portal-users), made only by staff invitation; no
  self-registration (first-register closed, create refused for non-staff).
- Selling to other companies: one installation per company (own database and settings), document
  prefix DOC_PREFIX, ORDER_DESK_ONLY=1 switches the public website off, ADMIN_TITLE, MAIL_FROM_NAME.
- Backups: database and order files copied nightly to the private GCS bucket (versioning on) via
  pharmatrust-api-1, replacing the Drive copy that failed with 403.

## 2026-10-09 Certificates on our letterhead (owner request)
- Distributor certificates always name the original manufacturer (name, address, telephone), refer to
  the manufacturer's certificate by number and attach it (ICH Q7 11.43/11.44, WHO good trade and
  distribution practices). The tool has no way to print one without them.
- Admin group "Certificates". (1) Certificate on our letterhead: NJMC or a partner (Letterhead
  companies, owner-managed) issues the CoA as distributor, number PREFIX-COA-YYYY-<record id>, the
  original attached page by page on A4 under a band, the statement that the issuer did not perform
  the tests (or the independent laboratory of our own retest, with its address and telephone), and
  whether the goods were repacked (confirmed by the user). Printing is refused while anything is
  missing, for a protected or damaged original, a placeholder or the issuer's own name as
  manufacturer, or a supplier file changed after the AI reading. Previews carry a DRAFT mark;
  "Issue" locks the record (a correction is a duplicate with a new number). (2) Specification sheet
  for quoting: tests, limits, methods only, no batch, no results, no manufacturer.
- AI reads the uploaded PDF or photo (Claude or OpenAI, the file itself is sent) into the fields;
  fields the AI leaves empty keep what was typed; the reading (tests, identity fields, file) is kept
  and every later change shows as a warning. No delete.
- PDF fonts are Latin only: <=, >=, degree C, alpha, beta, gamma, micro and ~ replace their symbols
  (also on other trade documents); any other non-Latin text blocks the PDF until translated.
- 2026-10-10: "Our companies" (owner request): one admin place per company (NJMC and partners) with
  letterhead, signatory, bank details (owner-only field) and licences (type, number, authority,
  validity, product kinds covered). A certificate must name the releasing company ("Released by"),
  and that company must hold a licence valid on the day of issue, of a kind allowed for the product
  (API/excipient/medicine: drug distribution, pharma import/export or GDP/GMP; device: device
  distribution; chemicals: chemicals or business licence). The licence is printed unless switched off.
  A sale (PI, invoice, packing list) can be issued by one of Our companies (its letterhead and bank);
  only the owner can set or change that choice.
- 2026-10-10 (2): new licence type "Business licence with import/export scope and customs
  registration (export only)". A Chinese trading company exports non-controlled APIs, excipients and
  chemicals under 货物进出口 in its business scope plus its customs registration; owner confirmed
  this is how NJMC has exported. It releases certificates for API, excipient and chemical only;
  finished medicines still need a drug licence, devices a device licence or filing.
