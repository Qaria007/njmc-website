#!/usr/bin/env bash
# Send one e-mail from the company's official address through the website's own mail setup.
# Usage on the server: /opt/njmc/send-mail.sh /root/njmc-import/<message>.json
# The JSON: {"to":["a@b.com"],"cc":[],"subject":"...","text":"...","supplier":"<supplier name in the admin>","test":false}
# With "test": true the message goes only to the company's own address (Company details > Email).
# Posted from inside njmc-web to its own /api/desk/send-mail/ with the token the container already
# has from /opt/njmc/.env, so the token never appears on a command line.
set -euo pipefail
file=${1:?usage: send-mail.sh <message.json>}
python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$file"
docker exec -i njmc-web node -e '
let body = ""
process.stdin.on("data", (d) => (body += d)).on("end", async () => {
  const r = await fetch("http://127.0.0.1:3000/api/desk/send-mail/", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Import " + process.env.CATALOGUE_IMPORT_TOKEN },
    body,
  })
  console.log(r.status, await r.text())
  process.exit(r.ok ? 0 : 1)
})' < "$file"
