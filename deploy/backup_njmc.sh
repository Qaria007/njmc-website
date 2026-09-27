#!/usr/bin/env bash
# Nightly dump of the NJMC website database (njmc, inside pharmatrust-db-1).
# PharmaTrust has its own backup (backend/scripts/backup_db.sh, 02:20); this
# script never touches it. Keeps the newest 14 local dumps in /root/backups.
set -euo pipefail
DIR=/root/backups
OUT="$DIR/njmc-$(date -u +%Y%m%dT%H%M%SZ).dump.gz"
mkdir -p "$DIR"; chmod 700 "$DIR"
docker exec pharmatrust-db-1 sh -c "pg_dump -U \$POSTGRES_USER -d njmc --format=custom" | gzip > "$OUT"
SIZE=$(stat -c %s "$OUT")
if [ "$SIZE" -lt 200 ]; then echo "NJMC BACKUP FAILED: $OUT is $SIZE bytes" >&2; exit 1; fi
ls -1t "$DIR"/njmc-*.dump.gz 2>/dev/null | tail -n +15 | while read -r old; do rm -f "$old"; done
echo "$(date -u +%FT%TZ) njmc backup ok: $OUT ($SIZE bytes)"
