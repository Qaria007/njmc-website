#!/usr/bin/env bash
# Every 10 minutes: pull ghcr.io/qaria007/njmc-website:latest and restart njmc-web only if
# the image changed. Touches nothing but the njmc compose project in /opt/njmc.
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
  docker image prune -f --filter "dangling=true" >/dev/null
fi
