#!/usr/bin/env sh
# Restore a backup produced by scripts/backup.sh into the Docker deployment.
#   ./scripts/restore.sh backups/educentr-20261007-021500.dump [backups/educentr-files-20261007-021500.tar.gz]
# WARNING: replaces the current database contents. Take a fresh backup first.
set -eu

cd "$(dirname "$0")/.."
DUMP=${1:?usage: restore.sh <dump> [files.tar.gz]}
FILES=${2:-}

# shellcheck disable=SC1091
. ./.env

printf 'This will OVERWRITE database "%s". Type YES to continue: ' "${POSTGRES_DB:-educentr}"
read -r answer
[ "$answer" = "YES" ] || { echo "Aborted."; exit 1; }

docker compose stop backend
docker compose exec -T db pg_restore -U "${POSTGRES_USER:-educentr}" -d "${POSTGRES_DB:-educentr}" \
    --clean --if-exists --no-owner < "$DUMP"
if [ -n "$FILES" ]; then
    docker compose run --rm -T --entrypoint "" backend tar -C /app -xzf - < "$FILES"
fi
docker compose start backend
echo "Restore finished."
