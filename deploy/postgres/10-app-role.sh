#!/bin/sh
# Runs once, when the PostgreSQL data volume is initialised (/docker-entrypoint-initdb.d).
#
# Creates the role the API and the worker connect with. It reads and writes rows, owns nothing
# and cannot create, alter or drop anything. Migrations run as POSTGRES_USER, which owns the
# schema (docs/SECURITY.md section 6). Tables created later by migrations are covered by the
# default privileges below.
set -eu

psql --set ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set owner="$POSTGRES_USER" --set db="$POSTGRES_DB" \
  --set app_user="$APP_DB_USER" --set app_password="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO :"app_user";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
SQL
