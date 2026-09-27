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
- Postgres: a separate `njmc` database and `njmc` user inside the existing PharmaTrust
  container `pharmatrust-db-1` (Postgres 17), via the Payload Postgres adapter. No second Postgres.
- Hosting (changed 27 Sep 2026, docs/DECISIONS.md): the PharmaTrust Hostinger VPS
  (srv1625890, 187.127.158.97, Ubuntu 24.04), reached from the Mac as `ssh pharmatrust`.
  GitHub Actions builds the Docker image and pushes it to GHCR; the server only pulls and
  runs it. Never run the Next.js build on the server. The existing PharmaTrust Caddy serves
  njmcmedicsupp.com and www.
- Media: Payload local uploads on a named Docker volume on the VPS, included in the backup.
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
- You cannot create accounts or handle passwords. If an account (for example a
  HubSpot private app token) is missing, list the exact clicks for the owner.
- The repo is PUBLIC. Secrets live only in GitHub Actions secrets, the server file
  `/opt/njmc/.env` (root, chmod 600, never committed) and the password manager.
  Never commit confidential material either (docs/02 "Confidentiality").

## Shared server rules (PharmaTrust runs on the same VPS)
- PharmaTrust (pharmatrust-api-1, pharmatrust-caddy-1, pharmatrust-db-1) and the WhatsApp
  bot (Node, /root/suhaibi-bot, outside Docker) must stay up. Never stop, restart or
  change their containers, volumes or env files. Never edit PharmaTrust's backup script.
- Before any server change, copy the Caddyfile and both compose files to
  `/root/njmc-change-backups/<UTC timestamp>/`. If something breaks, roll back first,
  then tell the owner.
- Caddy: run `caddy validate` on the new file before `caddy reload`. Reload, never restart.
- Never reboot the server (the owner does reboots from hPanel).
- The DNS switch is the owner's step (C3).

## Model routing
- Default opus, effort high; xhigh for the Phase 1 and 2 build sessions.
- Run the `reviewer` subagent before every merge to main.
- `worker` (sonnet) for mechanical edits; `scout` (haiku) for read-only lookups.
- `expert` (fable) for the claims review of the verification and PharmaTrust pages
  (owner said yes on 27 Sep 2026). Not for other work.

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
