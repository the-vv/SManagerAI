#!/usr/bin/env bash
# Restore a backup made by backup.sh.  Usage: ./deploy/restore.sh backups/smanager-XXXX.db.gz
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${1:?usage: restore.sh <backup.db.gz|backup.db>}"
[ -f "$SRC" ] || { echo "No such file: $SRC"; exit 1; }

read -r -p "This REPLACES the live database with $SRC. Continue? [y/N] " ok
[ "$ok" = "y" ] || exit 1

# Whatever happens below, bring the stack back up at the end.
trap 'docker compose up -d' EXIT

docker compose stop api web
mkdir -p data
if [ -f data/smanager.db ]; then
  mv data/smanager.db "data/smanager.db.before-restore-$(date -u +%Y%m%dT%H%M%SZ)"
fi
rm -f data/smanager.db-wal data/smanager.db-shm   # stale journal files must not be applied to the restored file
case "$SRC" in
  *.gz) gunzip -c "$SRC" > data/smanager.db ;;
  *)    cp "$SRC" data/smanager.db ;;
esac
# the API container runs as the unprivileged 'node' user (uid 1000); fix ownership from inside a root container
docker compose run --rm --no-deps -u root --entrypoint sh api -c 'chown -R node:node /data && chmod 600 /data/smanager.db'
echo "Restored. Check: docker compose ps && curl -s http://127.0.0.1:\${WEB_PORT:-8080}/api/health"
