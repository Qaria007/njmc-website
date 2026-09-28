# STATUS

Updated 27 Sep 2026 (session 2, Claude Code on the Mac).

| Phase | State |
|---|---|
| 0 Setup and inventory | Done |
| 1 Foundation | Done. Live on the preview https://njmc.187-127-158-97.sslip.io/ (EN, /ar/ rtl), image from CI, migration applied |
| LAUNCH | njmcmedicsupp.com LIVE on the new site since 27 Sep 2026 (all old pages + group + trust). www still on Hostinger until the owner edits the CNAME |
| 28 Sep | Owner admin account qaria@njmcmedicsupp.com created; /admin open on the domain (login only). Forms live (RFQ on /contact/, order on /verification/). Articles sync daily from the weekly writer; server auto-deploys |
| 28 Sep (2) | Product catalogue: /catalogue/ + one page per product (EN only), admin group "Catalogue" (Products, Suppliers, Supplier certificates with expiry state). Pilot data from Drive NJMC > Suppliers files: 2 suppliers, 7 certificates, 99 products (63 published: 12 pharmacopoeial APIs, 51 colours; in-house and R&D APIs stay unpublished pending patent check). Import: deploy/README.md |
| 29 Sep | Catalogue: every file in Suppliers files loaded: 30 suppliers, 69 certificates, 517 products, 209 public. Grades labelled as listed by the manufacturer |
| Next | Catalogue: Arabic after review; owner decision on in-house/R&D molecules. Two-buyer home, Arabic for new pages and forms, Drive copy of backups (parked) |

## Done this session
- Public-repo check: no secrets in history. One client name removed from the current files
  (d395c51); still in the first 3 commits pending owner question 2.
- Hosting moved to the PharmaTrust VPS (docs/DECISIONS.md 27 Sep). CLAUDE.md, docs/03, 04,
  06, 07 updated. Owner answers moved into BRAND.md, docs/05, docs/02.
- Server: `njmc` database and login inside pharmatrust-db-1 (cannot open the pharmatrust
  database); /opt/njmc/.env (root, 600); /opt/njmc/docker-compose.yml; nightly
  /opt/njmc/backup_njmc.sh at 02:35 UTC, first dump /root/backups/njmc-20260927T082011Z.dump.gz
  (482 bytes, empty database). PharmaTrust untouched and verified up after each change.
  Config backups in /root/njmc-change-backups/20260927T081918Z/ and crontab copy.
- DNS snapshot: docs/old-site/dns-before.txt (no SPF, no DMARC found).
- Phase 1 code: Next.js 16.3.6 + Payload 3.90.2, /admin, en/ar root layouts (ar is rtl),
  header/footer/WhatsApp button, self-hosted fonts, claims-lint, tests, Dockerfile.
  Reviewer run; its fixes applied.

## Open
- /admin and /api are closed (403) on the preview in Caddy: no admin account exists yet and
  the first visitor to /admin could create one. The owner's account gets created in a guided
  step (open /admin to his IP only for a few minutes), then the block is lifted.
- CI workflow pushed after the owner added the `workflow` scope. The GHCR package is already
  public (the server pulls without login).

## Next
1. Phase 2: collections and globals from docs/03, templates, every sitemap page.
