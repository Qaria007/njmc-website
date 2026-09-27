# Deploy (PharmaTrust VPS, srv1625890)

Copies of what runs on the server, without secrets. Rules: CLAUDE.md "Shared server rules".

| Server path | Repo copy | Purpose |
|---|---|---|
| /opt/njmc/docker-compose.yml | deploy/docker-compose.yml | The `njmc-web` container (own compose project) |
| /opt/njmc/.env | (never committed) | DATABASE_URI, PAYLOAD_SECRET, MEDIA_DIR |
| /opt/njmc/backup_njmc.sh | deploy/backup_njmc.sh | Nightly dump of the `njmc` database, cron 02:35 UTC |
| /opt/pharmatrust-deploy/Caddyfile (appended) | deploy/Caddyfile.njmc | Preview hostname now, domain at C3 |
| /root/njmc-change-backups/<UTC>/ | | Caddyfile, compose files and crontab copied before each change |

Release (from the Mac, after CI pushed the image):

    ssh pharmatrust 'cd /opt/njmc && docker compose pull && docker compose up -d && docker compose ps'

Then request /admin once so Payload runs any pending migrations. Rollback: set the image
tag in /opt/njmc/docker-compose.yml to the previous commit SHA and run `docker compose up -d`.
