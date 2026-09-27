# STATUS

Updated 27 Sep 2026 (session 2, Claude Code on the Mac).

| Phase | State |
|---|---|
| 0 Setup and inventory | Done |
| 1 Foundation | Code done and merged (a568ce6). Not yet running on the server: waiting for the CI workflow push (owner step A below) |
| 2 to 9 | Not started |

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

## Blocked
- A. `.github/workflows/ci.yml` is written but not pushed: the Mac's GitHub login lacks the
  `workflow` scope. Owner runs once in Terminal: `gh auth refresh -h github.com -s workflow`.
- B. After the first image is built, the GHCR package must be public (the repo is public
  anyway) so the server can pull it without a password: GitHub > Qaria007 > Packages >
  njmc-website > Package settings > Change visibility > Public.

## Next
1. Push ci.yml, confirm the image builds, deploy to the preview hostname
   njmc.187-127-158-97.sslip.io (Caddy block in deploy/Caddyfile.njmc), open /admin once
   to run the migration, check EN/AR in the browser.
2. Phase 2: collections and globals from docs/03, templates, every sitemap page.
