# Deploy (PharmaTrust VPS, srv1625890)

Copies of what runs on the server, without secrets. Rules: CLAUDE.md "Shared server rules".

| Server path | Repo copy | Purpose |
|---|---|---|
| /opt/njmc/docker-compose.yml | deploy/docker-compose.yml | The `njmc-web` container (own compose project) |
| volume njmc_orders -> /app/private-orders | deploy/docker-compose.yml | Customer order files for Order matching (private; not under media) |
| /opt/njmc/.env | (never committed) | DATABASE_URI, PAYLOAD_SECRET, MEDIA_DIR, CATALOGUE_IMPORT_TOKEN |
| /opt/njmc/backup_njmc.sh | deploy/backup_njmc.sh | Nightly dump of the `njmc` database, cron 02:35 UTC |
| /opt/njmc/import-catalogue.sh | deploy/import-catalogue.sh | Load a catalogue JSON file (see below) |
| /opt/njmc/send-mail.sh | deploy/send-mail.sh | Send one e-mail from the official address (sale@njmcmedicsupp.com) through the site's mail relay; JSON file with to, subject, text, supplier; "test": true sends to the company's own address |
| /opt/njmc/autodeploy.sh | deploy/autodeploy.sh | Cron every 10 min: pull the latest image, restart only if it changed; then restart every company installation under /opt/njmc/clients/ |
| /opt/njmc/new-company.sh | deploy/new-company.sh | One installation of the order software per company (Trade Manager): `create`, `hosts`, `register`, `list`. See below |
| /opt/njmc/clients/<slug>/ | (never committed) | A company installation: its .env (own database, Payload secret, network token), its compose file; container njmc-<slug> |
| /opt/pharmatrust-deploy/Caddyfile (appended) | deploy/Caddyfile.njmc | Preview hostname now, domain at C3 |
| /root/njmc-change-backups/<UTC>/ | | Caddyfile, compose files and crontab copied before each change |

Release: automatic. Push to main -> ci.yml builds the image -> autodeploy.sh installs it
within 10 minutes (log: /root/njmc-deploy.log). By hand, from the Mac:

    ssh pharmatrust 'cd /opt/njmc && docker compose pull && docker compose up -d && docker compose ps'

Then request /admin once so Payload runs any pending migrations. Rollback: set the image
tag in /opt/njmc/docker-compose.yml to the previous commit SHA and run `docker compose up -d`.

Company installations (Trade Manager, sold through phmnai.com): one per company, same image, own
database njmc_<slug> in pharmatrust-db-1, own media and order volumes, ORDER_DESK_ONLY=1 (no public
website), own document prefix and admin title. Made on the server by

    ssh pharmatrust '/opt/njmc/new-company.sh create <slug> <host> <PREFIX> "<Admin title>" "<Sender name>" <owner e-mail> [starter|business]'

The host is a Caddy block appended to the shared Caddyfile (validate, reload). Without a DNS name
yet, use <slug>.187-127-158-97.sslip.io; once the owner adds a DNS record (for example
<slug>.phmnai.com -> 187.127.158.97), run `new-company.sh hosts <slug> <slug>.phmnai.com`. The first
account is made for the owner e-mail with a throw-away password: the owner sets his own through
"Forgot password" on /admin. AI keys are pasted by the company in the admin, never by a script.
The installation is registered on the NJMC master as a network client (Admin > Settings > Network
clients): the master keeps only the SHA-256 of the installation's token, the token itself lives in
the installation's .env. Caps per plan (src/lib/network.ts): Starter up to 3 suppliers per product
and 20 products a month, Business 5 and 60. Demo installation made 17 Oct 2026: slug `demo`,
https://demo.187-127-158-97.sslip.io/admin, plan business.

Articles: the weekly writer still publishes to Qaria007/njmc-site-public; .github/workflows/
sync-articles.yml imports that repo daily at 02:30 UTC and ships any change.

Catalogue import: the product catalogue (/catalogue/, admin group "Catalogue") is filled from
JSON files built from the supplier documents in Drive (NJMC > Suppliers files >
_Catalogue database (import files); builder script build.py there). Those files name
suppliers, so they never enter this public repo. To load one, copy it to the server
(/root/njmc-import/, root only) and run:

    ssh pharmatrust '/opt/njmc/import-catalogue.sh /root/njmc-import/<file>.json'

Re-running a file is safe (upsert). New products keep the "published" value from the file;
existing ones keep whatever was set in the admin.
