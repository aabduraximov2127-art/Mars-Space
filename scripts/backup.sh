#!/usr/bin/env sh
# Back up the Docker deployment: PostgreSQL (custom-format dump) + uploaded files.
#   ./scripts/backup.sh            -> backups/educentr-<timestamp>.dump + media archive
# Schedule with cron, e.g.:  15 2 * * *  cd /srv/educentr && ./scripts/backup.sh >> backups/backup.log 2>&1
set -eu

cd "$(dirname "$0")/.."
STAMP=$(date +%Y%m%d-%H%M%S)
OUT=backups
KEEP_DAYS=${KEEP_DAYS:-14}
mkdir -p "$OUT"

# shellcheck disable=SC1091
. ./.env

docker compose exec -T db pg_dump -U "${POSTGRES_USER:-educentr}" -d "${POSTGRES_DB:-educentr}" -Fc \
    > "$OUT/educentr-$STAMP.dump"

docker compose exec -T backend tar -C /app -czf - media private_media > "$OUT/educentr-files-$STAMP.tar.gz"

find "$OUT" -name 'educentr-*' -mtime +"$KEEP_DAYS" -delete
echo "Backup written: $OUT/educentr-$STAMP.dump and $OUT/educentr-files-$STAMP.tar.gz"
