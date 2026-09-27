#!/usr/bin/env bash
# Nightly dump of the NJMC website database (njmc, inside pharmatrust-db-1).
# PharmaTrust has its own backup (backend/scripts/backup_db.sh, 02:20); this
# script never touches it. Keeps the newest 14 local dumps in /root/backups and
# uploads each dump to Google Drive: Claude shared drive > NJMC >
# "04 Website database backups (automatic)" (owner choice 27 Sep 2026).
# The upload runs inside pharmatrust-api-1 only because that is where the Google
# service-account key is mounted (the same way PharmaTrust uploads its own
# backups); the key never leaves that container and nothing in it is changed.
set -euo pipefail
DIR=/root/backups
DRIVE_FOLDER=1tF12YMQUXjVHlNNhIFoutxMne0uOeuI2
OUT="$DIR/njmc-$(date -u +%Y%m%dT%H%M%SZ).dump.gz"
mkdir -p "$DIR"; chmod 700 "$DIR"
docker exec pharmatrust-db-1 sh -c "pg_dump -U \$POSTGRES_USER -d njmc --format=custom" | gzip > "$OUT"
SIZE=$(stat -c %s "$OUT")
if [ "$SIZE" -lt 200 ]; then echo "NJMC BACKUP FAILED: $OUT is $SIZE bytes" >&2; exit 1; fi
ls -1t "$DIR"/njmc-*.dump.gz 2>/dev/null | tail -n +15 | while read -r old; do rm -f "$old"; done
echo "$(date -u +%FT%TZ) njmc backup ok: $OUT ($SIZE bytes)"

UPLOAD_PY="
import json, sys
import google.auth
from google.auth.transport.requests import AuthorizedSession
name, folder = sys.argv[1], sys.argv[2]
data = sys.stdin.buffer.read()
creds, _ = google.auth.default(scopes=[\"https://www.googleapis.com/auth/drive\"])
s = AuthorizedSession(creds)
meta = json.dumps({\"name\": name, \"parents\": [folder]})
boundary = \"njmcbackupboundary\"
body = (b\"--\" + boundary.encode() + b\"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n\" + meta.encode()
        + b\"\r\n--\" + boundary.encode() + b\"\r\nContent-Type: application/gzip\r\n\r\n\" + data
        + b\"\r\n--\" + boundary.encode() + b\"--\")
r = s.post(\"https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,size\",
           data=body, headers={\"Content-Type\": \"multipart/related; boundary=\" + boundary})
r.raise_for_status()
f = r.json()
print(\"drive ok: %s (%s bytes, id %s)\" % (f[\"name\"], f.get(\"size\"), f[\"id\"]))
"
if docker exec -i pharmatrust-api-1 python -c "$UPLOAD_PY" "$(basename "$OUT")" "$DRIVE_FOLDER" < "$OUT"; then
  echo "drive copy complete"
else
  echo "DRIVE COPY FAILED for $OUT (the local backup is fine, the Drive copy is NOT)" >&2
  exit 1
fi
