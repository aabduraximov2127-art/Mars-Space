#!/bin/sh
# Wait for PostgreSQL, optionally apply migrations, then run the given command.
set -e

python - <<'PY'
import os, sys, time
import psycopg
import environ

url = environ.Env.db_url_config(os.environ["DATABASE_URL"])
for attempt in range(60):
    try:
        psycopg.connect(
            dbname=url["NAME"], user=url["USER"], password=url["PASSWORD"],
            host=url["HOST"], port=url["PORT"] or 5432, connect_timeout=3,
        ).close()
        break
    except psycopg.OperationalError:
        print("Waiting for database...", flush=True)
        time.sleep(2)
else:
    sys.exit("Database is not reachable")
PY

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
    python manage.py migrate --noinput
fi

exec "$@"
