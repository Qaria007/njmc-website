#!/usr/bin/env bash
# One installation of the order software per company (Trade Manager, sold through phmnai.com).
# Runs on the PharmaTrust VPS as root. Server copy: /opt/njmc/new-company.sh. Nothing here is a
# secret: the database password, the Payload secret and the network token are generated on the
# server and written only to the company's .env (root, chmod 600). AI keys are never handled here:
# the company's owner pastes his own key in the admin (Company details > AI mode).
#
#   new-company.sh create <slug> <host[,host2]> <DOC_PREFIX> "<Admin title>" "<Sender name>" <owner e-mail> [plan] [mail-from]
#       mail-from: the address the installation sends from (default sale@njmcmedicsupp.com through
#       NJMC's Google relay, with the company's sender name and its own Reply-To). OWNER DECISION
#       before a paying client: a company's enquiries should not carry NJMC's address; the relay
#       only accepts NJMC's domains, so a client needs its own SMTP (a later feature) or an
#       address on a domain NJMC runs for it.
#       - database njmc_<slug> + role in pharmatrust-db-1, /opt/njmc/clients/<slug>/{.env,docker-compose.yml}
#       - container njmc-<slug> from the same image as njmc-web, migrations run, Caddy block for the hosts
#       - the first (owner) account is made for <owner e-mail> with a throw-away password:
#         the owner sets his own through "Forgot password" on /admin (the e-mail goes to him)
#       - the installation is registered on the NJMC master as a network client (plan starter|business)
#   new-company.sh hosts <slug> <host[,host2]>      replace the Caddy hosts (e.g. once a real DNS name exists)
#   new-company.sh register <slug> [plan]          (re)register on the master; safe to repeat
#   new-company.sh list                             every installation and whether it answers
#
# The image follows njmc-web: /opt/njmc/autodeploy.sh restarts every client container when the
# image changes, and /opt/njmc/backup_njmc.sh dumps every client database nightly.
set -euo pipefail

CLIENTS=/opt/njmc/clients
CADDY=/opt/pharmatrust-deploy/Caddyfile
IMAGE=ghcr.io/qaria007/njmc-website:latest
DB=pharmatrust-db-1
MASTER=njmc-web
BACKUPS=/root/njmc-change-backups

die() { echo "ERROR: $*" >&2; exit 1; }
need_slug() { [[ "${1:-}" =~ ^[a-z][a-z0-9]{1,19}$ ]] || die "slug must be 2-20 lower-case letters or digits, starting with a letter"; }
need_hosts() { [[ "${1:-}" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(,[a-z0-9]([a-z0-9.-]*[a-z0-9])?)*$ ]] || die "hosts must be DNS names, comma separated, no spaces"; }
rand() { openssl rand -hex "$1"; }
psql_master() { docker exec -i "$DB" sh -c 'psql -U "$POSTGRES_USER" -d njmc -v ON_ERROR_STOP=1 -At'; }
psql_admin() { docker exec -i "$DB" sh -c 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -At'; }

backup_shared() {
  local b="$BACKUPS/$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$b"
  cp -a "$CADDY" /opt/njmc/docker-compose.yml "$b/"
  crontab -l > "$b/crontab.txt" 2>/dev/null || true
  echo "backup of the shared files: $b"
}

# Rewrites the Caddy block of one company between its markers, keeping the file's inode (bind mount).
write_caddy_block() {
  local slug="$1" hosts="$2"
  local block
  block=$(
    echo "# >>> njmc client ${slug} (written by /opt/njmc/new-company.sh; do not edit by hand)"
    echo "${hosts//,/, } {"
    echo "	encode zstd gzip"
    echo "	header X-Robots-Tag \"noindex, nofollow\""
    echo "	request_body {"
    echo "		max_size 20MB"
    echo "	}"
    echo "	reverse_proxy njmc-${slug}:3000"
    echo "	log {"
    echo "		output file /data/access-njmc-${slug}.log {"
    echo "			roll_size 20MiB"
    echo "			roll_keep 5"
    echo "		}"
    echo "	}"
    echo "}"
    echo "# <<< njmc client ${slug}"
  )
  BLOCK="$block" SLUG="$slug" python3 - "$CADDY" <<'PY'
import os, re, sys
path = sys.argv[1]
slug, block = os.environ["SLUG"], os.environ["BLOCK"]
text = open(path, encoding="utf-8").read()
pat = re.compile(r"# >>> njmc client %s .*?# <<< njmc client %s\n" % (re.escape(slug), re.escape(slug)), re.S)
new = pat.sub(lambda m: block + "\n", text) if pat.search(text) else text.rstrip("\n") + "\n\n" + block + "\n"
with open(path, "w", encoding="utf-8") as f:  # same inode
    f.write(new)
PY
  if docker exec pharmatrust-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | grep -q "Valid configuration"; then
    docker exec pharmatrust-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile --force >/dev/null 2>&1
    echo "Caddy: ${hosts} -> njmc-${slug}"
  else
    # Put the last backup copy back (same inode) so the next reload by anyone still works.
    local last
    last=$(ls -1d "$BACKUPS"/*/ 2>/dev/null | tail -1)
    [ -n "$last" ] && [ -f "$last/Caddyfile" ] && cat "$last/Caddyfile" > "$CADDY"
    die "Caddy validation failed; the Caddyfile was restored from ${last:-nowhere} and NOT reloaded. Look at the block for ${slug}"
  fi
}

# One Payload request so pending migrations run; waits for the container to answer.
init_app() {
  local slug="$1" i code
  for i in $(seq 1 40); do
    code=$(docker exec "njmc-${slug}" wget -q -O /dev/null -S "http://127.0.0.1:3000/api/users/me" 2>&1 | awk '/HTTP\//{print $2}' | tail -1 || true)
    if [ -n "$code" ]; then echo "njmc-${slug} answers (HTTP ${code} on /api/users/me)"; return 0; fi
    sleep 3
  done
  die "njmc-${slug} did not answer within 2 minutes: docker logs njmc-${slug}"
}

cmd_create() {
  local slug="$1" hosts="$2" prefix="$3" title="$4" sender="$5" owner="$6" plan="${7:-starter}" mailfrom="${8:-sale@njmcmedicsupp.com}"
  need_slug "$slug"; need_hosts "$hosts"
  [[ "$prefix" =~ ^[A-Z0-9]{2,8}$ ]] || die "DOC_PREFIX must be 2-8 capital letters or digits"
  [[ "$owner" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "owner e-mail does not look like an address"
  [ -d "$CLIENTS/$slug" ] && die "$CLIENTS/$slug exists already (use hosts/register)"
  local first="${hosts%%,*}"
  backup_shared
  mkdir -p "$CLIENTS/$slug"; chmod 700 "$CLIENTS"
  local dbpass secret token
  dbpass=$(rand 24); secret=$(rand 32); token=$(rand 32)

  printf "CREATE ROLE njmc_%s LOGIN PASSWORD '%s';\nCREATE DATABASE njmc_%s OWNER njmc_%s;\n" "$slug" "$dbpass" "$slug" "$slug" | psql_admin
  echo "database njmc_${slug} created"

  umask 077
  cat > "$CLIENTS/$slug/.env" <<EOF
# Trade Manager installation "${slug}" (made $(date -u +%FT%TZ) by new-company.sh). Root only.
DATABASE_URI=postgres://njmc_${slug}:${dbpass}@${DB}:5432/njmc_${slug}
PAYLOAD_SECRET=${secret}
MEDIA_DIR=/app/media
SMTP_HOST=smtp-relay.gmail.com
SMTP_PORT=587
MAIL_FROM=${mailfrom}
LEADS_TO=${mailfrom}
NEXT_PUBLIC_SERVER_URL=https://${first}
ORDER_DESK_ONLY=1
DOC_PREFIX=${prefix}
ADMIN_TITLE=${title}
MAIL_FROM_NAME=${sender}
# Supplier network (NJMC master, reached inside the Docker network; the token identifies this company)
NETWORK_URL=http://${MASTER}:3000
NETWORK_TOKEN=${token}
EOF
  cat > "$CLIENTS/$slug/docker-compose.yml" <<EOF
# Trade Manager installation "${slug}": same image as njmc-web, own database, files and settings.
name: njmc-${slug}
services:
  web:
    image: ${IMAGE}
    container_name: njmc-${slug}
    restart: unless-stopped
    env_file: ${CLIENTS}/${slug}/.env
    volumes:
      - njmc_${slug}_media:/app/media
      - njmc_${slug}_orders:/app/private-orders
    networks: [pharmatrust_internal]
    mem_limit: 512m
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
volumes:
  njmc_${slug}_media:
  njmc_${slug}_orders:
networks:
  pharmatrust_internal:
    external: true
EOF
  umask 022
  (cd "$CLIENTS/$slug" && docker compose up -d)
  init_app "$slug"

  # The owner account, with a throw-away password: he sets his own through "Forgot password".
  local pw body code
  pw=$(rand 18)
  body=$(printf '{"email":"%s","password":"%s","name":"Owner"}' "$owner" "$pw")
  code=$(docker exec "njmc-${slug}" wget -q -O /dev/null -S --header='Content-Type: application/json' --post-data="$body" "http://127.0.0.1:3000/api/users/first-register" 2>&1 | awk '/HTTP\//{print $2}' | tail -1 || true)
  unset pw body
  if [ "$code" = "201" ] || [ "$code" = "200" ]; then
    echo "owner account made for ${owner}; the owner sets his password with Forgot password on https://${first}/admin/forgot"
  else
    echo "WARNING: the owner account was not made (HTTP ${code:-none}); /admin/create-first-user is open until someone registers" >&2
  fi

  write_caddy_block "$slug" "$hosts"
  cmd_register "$slug" "$plan" || true
  echo
  echo "DONE: https://${first}/admin  (container njmc-${slug}, database njmc_${slug}, prefix ${prefix})"
}

cmd_hosts() {
  local slug="$1" hosts="$2"; need_slug "$slug"; need_hosts "$hosts"
  [ -f "$CLIENTS/$slug/.env" ] || die "no installation ${slug}"
  backup_shared
  local first="${hosts%%,*}"
  sed -i -E "s#^NEXT_PUBLIC_SERVER_URL=.*#NEXT_PUBLIC_SERVER_URL=https://${first}#" "$CLIENTS/$slug/.env"
  write_caddy_block "$slug" "$hosts"
  (cd "$CLIENTS/$slug" && docker compose up -d)
  init_app "$slug"
}

# Registers (or updates) the company on the master's Network clients list. Only the SHA-256 of the
# token is stored there. Does nothing until the master runs a version with that table.
cmd_register() {
  local slug="$1" plan="${2:-starter}"; need_slug "$slug"
  [ -f "$CLIENTS/$slug/.env" ] || die "no installation ${slug}"
  [[ "$plan" =~ ^(starter|business)$ ]] || die "plan must be starter or business"
  local token hash title per month
  token=$(sed -n -E 's/^NETWORK_TOKEN=//p' "$CLIENTS/$slug/.env")
  [ -n "$token" ] || die "no NETWORK_TOKEN in the .env"
  hash=$(printf '%s' "$token" | sha256sum | cut -d' ' -f1)
  title=$(sed -n -E 's/^ADMIN_TITLE=//p' "$CLIENTS/$slug/.env")
  if [ "$plan" = business ]; then per=5; month=60; else per=3; month=20; fi
  local t
  t=$(printf '%s' "$title" | sed "s/'/''/g")
  if ! echo "select 1 from information_schema.tables where table_name='network_clients'" | psql_master | grep -q 1; then
    echo "master has no network_clients table yet (old version): run 'new-company.sh register ${slug} ${plan}' after the next deploy"
    return 1
  fi
  cat <<EOF | psql_master
INSERT INTO network_clients (name, slug, plan, suppliers_per_product, products_per_month, token_hash, active, updated_at, created_at)
VALUES ('${t}', '${slug}', '${plan}', ${per}, ${month}, '${hash}', true, now(), now())
ON CONFLICT (slug) DO UPDATE SET token_hash = EXCLUDED.token_hash, plan = EXCLUDED.plan,
  suppliers_per_product = EXCLUDED.suppliers_per_product, products_per_month = EXCLUDED.products_per_month, active = true, updated_at = now();
EOF
  echo "registered on the master: ${slug} (${plan}: up to ${per} suppliers per product, ${month} products a month)"
}

cmd_list() {
  local d slug code
  for d in "$CLIENTS"/*/; do
    [ -d "$d" ] || continue
    slug=$(basename "$d")
    code=$(docker exec "njmc-${slug}" wget -q -O /dev/null -S "http://127.0.0.1:3000/api/users/me" 2>&1 | awk '/HTTP\//{print $2}' | tail -1 || true)
    printf '%-12s %-12s %s\n' "$slug" "${code:+HTTP $code}" "$(sed -n -E 's/^NEXT_PUBLIC_SERVER_URL=//p' "$d/.env")"
  done
}

case "${1:-}" in
  create) shift; [ $# -ge 6 ] || die "create <slug> <hosts> <DOC_PREFIX> \"<Admin title>\" \"<Sender name>\" <owner e-mail> [plan] [mail-from]"; cmd_create "$@" ;;
  hosts) shift; [ $# -eq 2 ] || die "hosts <slug> <host[,host2]>"; cmd_hosts "$@" ;;
  register) shift; [ $# -ge 1 ] || die "register <slug> [plan]"; cmd_register "$@" ;;
  list) cmd_list ;;
  *) sed -n 2,20p "$0"; exit 1 ;;
esac
