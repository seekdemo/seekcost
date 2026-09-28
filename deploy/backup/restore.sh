#!/usr/bin/env bash
set -Eeuo pipefail
snapshot="${1:-}"
target="${2:-}"
[[ "$snapshot" =~ ^[a-f0-9]{8,64}$ ]] || { echo "Supply an explicit successful snapshot ID, not latest" >&2; exit 2; }
[[ "$target" =~ ^seekcost_restore_[a-z0-9_]+$ && ${#target} -le 63 ]] || { echo "Use a NEW database name: seekcost_restore_NAME" >&2; exit 2; }
[[ "$target" != "${PGDATABASE:-seekcost}" ]] || { echo "Refusing the live database" >&2; exit 2; }
# createdb fails if the name exists. No --clean, DROP, or overwrite fallback.
createdb --owner=seekcost "$target"
trap 'echo "Restore failed. Original database untouched; recovery database retained for inspection." >&2' ERR
restic dump "$snapshot" seekcost.dump | pg_restore --exit-on-error --no-owner --no-acl --role=seekcost --dbname="$target"
PGDATABASE="$target" psql --no-psqlrc --set=ON_ERROR_STOP=1 --command='SELECT version_num FROM alembic_version; SELECT count(*) AS users FROM users;'
echo "Restored into $target only. Inspect application data before any manual switch. Live database unchanged."
