# Deploy (PharmaTrust VPS, srv1625890)

Copies of what runs on the server, without secrets. Rules: CLAUDE.md "Shared server rules".

| Server path | Repo copy | Purpose |
|---|---|---|
| /opt/njmc/docker-compose.yml | deploy/docker-compose.yml | The `njmc-web` container (own compose project) |
| volume njmc_orders -> /app/private-orders | deploy/docker-compose.yml | Customer order files for Order matching (private; not under media) |
| /opt/njmc/.env | (never committed) | DATABASE_URI, PAYLOAD_SECRET, MEDIA_DIR, CATALOGUE_IMPORT_TOKEN |
| /opt/njmc/backup_njmc.sh | deploy/backup_njmc.sh | Nightly dump of the `njmc` database, cron 02:35 UTC |
| /opt/njmc/import-catalogue.sh | deploy/import-catalogue.sh | Load a catalogue JSON file (see below) |
| /opt/njmc/autodeploy.sh | deploy/autodeploy.sh | Cron every 10 min: pull the latest image, restart only if it changed |
| /opt/pharmatrust-deploy/Caddyfile (appended) | deploy/Caddyfile.njmc | Preview hostname now, domain at C3 |
| /root/njmc-change-backups/<UTC>/ | | Caddyfile, compose files and crontab copied before each change |

Release: automatic. Push to main -> ci.yml builds the image -> autodeploy.sh installs it
within 10 minutes (log: /root/njmc-deploy.log). By hand, from the Mac:

    ssh pharmatrust 'cd /opt/njmc && docker compose pull && docker compose up -d && docker compose ps'

Then request /admin once so Payload runs any pending migrations. Rollback: set the image
tag in /opt/njmc/docker-compose.yml to the previous commit SHA and run `docker compose up -d`.

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
