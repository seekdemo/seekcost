#!/usr/bin/env bash
set -euo pipefail
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 --set=app_password="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE seekcost LOGIN PASSWORD :'app_password';
ALTER DATABASE seekcost OWNER TO seekcost;
GRANT ALL ON SCHEMA public TO seekcost;
SQL
