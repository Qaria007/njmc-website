#!/usr/bin/env bash
# Every 10 minutes: pull ghcr.io/qaria007/njmc-website:latest and restart njmc-web only if
# the image changed. Then every company installation under /opt/njmc/clients/*/ (same image, own
# database and settings, made by new-company.sh) is restarted too, and one request each makes
# Payload run the pending migrations. Touches nothing else.
set -euo pipefail
cd /opt/njmc
before=$(docker image inspect ghcr.io/qaria007/njmc-website:latest --format "{{.Id}}" 2>/dev/null || echo none)
docker compose pull -q web
after=$(docker image inspect ghcr.io/qaria007/njmc-website:latest --format "{{.Id}}")
if [ "$before" != "$after" ]; then
  docker compose up -d web
  sleep 20
  code=$(docker exec njmc-web wget -q -O /dev/null -S http://127.0.0.1:3000/ 2>&1 | awk "/HTTP\//{print \$2}" | tail -1)
  echo "$(date -u +%FT%TZ) deployed ${after:7:12} (was ${before:7:12}), home HTTP ${code:-?}"
  for d in /opt/njmc/clients/*/; do
    [ -f "$d/docker-compose.yml" ] || continue
    slug=$(basename "$d")
    (cd "$d" && docker compose up -d web) || { echo "$(date -u +%FT%TZ) client ${slug}: restart FAILED"; continue; }
    sleep 15
    ccode=$(docker exec "njmc-${slug}" wget -q -O /dev/null -S http://127.0.0.1:3000/api/users/me 2>&1 | awk "/HTTP\//{print \$2}" | tail -1 || true)
    echo "$(date -u +%FT%TZ) client ${slug} restarted, API HTTP ${ccode:-?}"
  done
  docker image prune -f --filter "dangling=true" >/dev/null
fi
