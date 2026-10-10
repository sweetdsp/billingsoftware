#!/bin/sh
# Bill Maker backend entrypoint.
# Runs Alembic migrations when RUN_MIGRATIONS=true, then execs the container command.
set -e

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
    echo "[entrypoint] Running database migrations (alembic upgrade head)..."
    alembic upgrade head
    echo "[entrypoint] Migrations complete."
fi

mkdir -p "${UPLOAD_DIR:-/app/uploads}" 2>/dev/null || true

exec "$@"
