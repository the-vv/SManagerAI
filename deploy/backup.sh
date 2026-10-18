#!/usr/bin/env bash
# Consistent SQLite backup (online backup API; includes WAL content) + retention.
# Cron example (daily 03:15):  15 3 * * *  cd /opt/smanager && ./deploy/backup.sh >> backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="/backups/smanager-${STAMP}.db"

docker compose exec -T api node scripts/backup.mjs "$FILE"
gzip -f "./backups/smanager-${STAMP}.db"
find ./backups -name 'smanager-*.db.gz' -mtime +"$KEEP_DAYS" -delete
echo "Done: backups/smanager-${STAMP}.db.gz (keeping ${KEEP_DAYS} days). Copy it off this server too."
