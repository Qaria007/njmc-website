#!/usr/bin/env bash
# Nightly dump of the NJMC website database (njmc, inside pharmatrust-db-1).
# PharmaTrust has its own backup (backend/scripts/backup_db.sh, 02:20); this
# script never touches it. Keeps the newest 14 local dumps (and order-file archives) in
# /root/backups and copies both off the server to Google Cloud Storage (see below; the
# Drive copy chosen on 27 Sep failed with 403 every night and was replaced on 9 Oct 2026).
set -euo pipefail
DIR=/root/backups

OUT="$DIR/njmc-$(date -u +%Y%m%dT%H%M%SZ).dump.gz"
mkdir -p "$DIR"; chmod 700 "$DIR"
docker exec pharmatrust-db-1 sh -c "pg_dump -U \$POSTGRES_USER -d njmc --format=custom" | gzip > "$OUT"
SIZE=$(stat -c %s "$OUT")
if [ "$SIZE" -lt 200 ]; then echo "NJMC BACKUP FAILED: $OUT is $SIZE bytes" >&2; exit 1; fi
ls -1t "$DIR"/njmc-*.dump.gz 2>/dev/null | tail -n +15 | while read -r old; do rm -f "$old"; done
echo "$(date -u +%FT%TZ) njmc backup ok: $OUT ($SIZE bytes)"

# Private order files and deal documents (volume njmc_orders: customer orders, contracts, payment
# slips). Read through the running container; a failure here does not stop the database backup.
ORD="$DIR/njmc-orders-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
if docker exec njmc-web tar czf - -C /app/private-orders . > "$ORD" && [ -s "$ORD" ]; then
  chmod 600 "$ORD"
  echo "$(date -u +%FT%TZ) njmc order files ok: $ORD ($(stat -c %s "$ORD") bytes)"
  ls -1t "$DIR"/njmc-orders-*.tar.gz 2>/dev/null | tail -n +15 | while read -r old; do rm -f "$old"; done
else
  rm -f "$ORD"
  echo "NJMC ORDER FILES BACKUP FAILED" >&2
fi

# Off-site copies: the private Google Cloud Storage bucket PharmaTrust already backs up to
# (gs://$BUCKET_NAME/njmc-backups/), uploaded from inside pharmatrust-api-1 because that is the only
# place with the storage credentials; nothing in that container is changed. Replaces the Drive copy,
# which the Drive API refused (403) every night. Newest 30 of each kind are kept; the bucket keeps
# versions of deleted objects.
UPLOAD_PY='
import os, sys
from google.cloud import storage
name, keep, prefix = sys.argv[1], int(sys.argv[2]), sys.argv[3]
data = sys.stdin.buffer.read()
client = storage.Client()
bucket = client.bucket(os.environ["BUCKET_NAME"])
blob = bucket.blob("njmc-backups/" + name)
blob.upload_from_string(data, content_type="application/gzip")
print("off-site ok: gs://%s/%s (%d bytes)" % (bucket.name, blob.name, len(data)))
names = sorted(b.name for b in client.list_blobs(bucket, prefix="njmc-backups/" + prefix))
for old in names[:-keep]:
    bucket.blob(old).delete()
'
FAILED=0
for F in "$OUT" "${ORD:-}"; do
  [ -n "$F" ] && [ -s "$F" ] || continue
  PREFIX=$(basename "$F" | sed -E 's/-[0-9]{8}T.*//')
  if ! docker exec -i pharmatrust-api-1 python -c "$UPLOAD_PY" "$(basename "$F")" 30 "$PREFIX-2" < "$F"; then
    echo "OFF-SITE COPY FAILED for $F (the local backup is fine, the cloud copy is NOT)" >&2
    FAILED=1
  fi
done
exit $FAILED
