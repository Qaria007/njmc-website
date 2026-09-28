#!/usr/bin/env bash
# Load a catalogue JSON file (suppliers, certificates, products) into the NJMC database.
# Usage on the server: /opt/njmc/import-catalogue.sh /root/njmc-import/<file>.json
# The file is posted from inside njmc-web to its own /api/products/import/, with the token
# the container already has from /opt/njmc/.env, so the token never appears on a command line.
set -euo pipefail
file=${1:?usage: import-catalogue.sh <file.json>}
python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$file"
docker exec -i njmc-web node -e '
let body = ""
process.stdin.on("data", (d) => (body += d)).on("end", async () => {
  const r = await fetch("http://127.0.0.1:3000/api/products/import/", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Import " + process.env.CATALOGUE_IMPORT_TOKEN },
    body,
  })
  console.log(r.status, await r.text())
  process.exit(r.ok ? 0 : 1)
})' < "$file"
