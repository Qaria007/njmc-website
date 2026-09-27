# CLAUDE.md: NJMC website (njmcmedicsupp.com)

Shared Brain rules apply on top of this file (start of task, Drive filing,
Work Log note at end, model routing, never delete, never write secrets).

## Read first
BRAND.md is the fact authority. The Aug 2026 spec (njmcsitebuildspec.md, Drive NJMC >
Docs, ID 1c22Jjd55N6SLz2i6pcI4M-RI_eQM6UHxjqsnpfqOkWI) keeps its style and
no-invention rules, but its address, "no phone", market list and "no framework" rules
are superseded (docs/DECISIONS.md).
The owner cannot open .md files: anything he must read or answer is a Word file.

## Mission
Replace the current static Hostinger site with a fast, trustworthy B2B site
that makes NJMC's services instantly clear to two buyers:
1. Hospitals and medical facilities (equipment, consumables, consultancy).
2. Pharmaceutical buyers and manufacturers (API and excipient sourcing from
   China and India, and manufacturer verification).
NJMC is a sourcing, trading, verification and consultancy company, never a manufacturer.
NJMC is the parent: LNJC (Yemen), PharmaTrust (software) and every future product are
presented under it, from a Companies collection in the CMS.

## Stack (decided; do not re-litigate unless blocked)
- Next.js (App Router, TypeScript, server rendering for all public pages).
- Payload CMS embedded in the same Next.js app (content + future backend:
  auth, access control, custom collections for a later client portal).
- Postgres (managed, e.g. Neon) via the Payload Postgres adapter.
- Hosting: Vercel (preview deploy per branch, production on main).
- Media: Vercel Blob or Cloudflare R2 via Payload storage adapter.
- Languages: English (en) and Arabic (ar, right to left) as a full mirror.
  Arabic text reuses the owner's existing Arabic; new Arabic publishes only after review.
- Before pinning versions: check the current stable Next.js and Payload releases
  and their documented compatibility. If Payload blocks on something real,
  fall back to Sanity + Next.js, record why in `docs/DECISIONS.md`, carry on.

## Autonomy
- Routine work (code, content drafts, config, tests, preview deploys): just do it.
- Owner decisions only (write them to OWNER-QUESTIONS.docx, never guess):
  accounts and payments, DNS / domain changes, production launch, any public
  claim not already in BRAND.md, naming a third party (client, partner, person),
  prices, legal text, new Arabic text.
- Never touch: drqaria.njmcmedicsupp.com, yedcoyemen.org, MX/SPF/DKIM/DMARC records.
- You cannot create accounts or handle passwords. If an account (Vercel, Neon,
  HubSpot private app token) is missing, list the exact clicks for the owner.
  Secrets live only in Vercel environment variables and the password manager.

## Model routing
- Default opus, effort high; xhigh for the Phase 1 and 2 build sessions.
- Run the `reviewer` subagent before every merge to main.
- `worker` (sonnet) for mechanical edits; `scout` (haiku) for read-only lookups.
- `expert` (fable) only for the claims review of the verification and PharmaTrust
  pages, and only if the owner answered yes to that question.

## Content rules (hard gates; the build must fail if broken)
- Every fact comes from `BRAND.md` or `docs/05-facts-registry.md`. Never invent
  facts, names, numbers, certifications, clients or testimonials.
- Unknowns stay as `[OPEN: ...]`. A CI check fails any published page that
  still contains `[OPEN`.
- No em dashes or en dashes anywhere, in any language. No exclamation marks,
  no hype words, no fake urgency. Every statistic shows its source and year.
- Forbidden words and claims: see `docs/02-content-and-claims.md`. Enforce with
  `scripts/claims-lint` in CI.

## Definition of done for any task
Acceptance criteria in `docs/04-phases-and-acceptance.md` met, CI green,
reviewer passed, STATUS.md updated, pushed.
