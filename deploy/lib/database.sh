#!/usr/bin/env bash
# Database provisioning, migrations, seeding and administrator bootstrap.

psql_super() {
  # Run SQL as the local postgres superuser.
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -tAc "$1"
}

psql_app() {
  PGPASSWORD="$DB_PASSWORD" psql -v ON_ERROR_STOP=1 \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" "$@"
}

db_role_exists() { [[ "$(psql_super "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'")" == "1" ]]; }
db_exists()      { [[ "$(psql_super "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'")" == "1" ]]; }

provision_local_database() {
  step "Database provisioning"

  if db_role_exists; then
    psql_super "ALTER ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${DB_PASSWORD}'" >/dev/null
    check_row "Role" "${DB_USER} updated" ok
  else
    psql_super "CREATE ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${DB_PASSWORD}'" >/dev/null
    check_row "Role" "${DB_USER} created" ok
  fi

  if db_exists; then
    check_row "Database" "${DB_NAME} exists (reused)" ok
  else
    psql_super "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\" ENCODING 'UTF8' TEMPLATE template0" >/dev/null
    check_row "Database" "${DB_NAME} created" ok
  fi

  # Least-privilege: owner of its own schema, no rights anywhere else.
  psql_super "REVOKE ALL ON DATABASE \"${DB_NAME}\" FROM PUBLIC" >/dev/null
  psql_super "GRANT CONNECT, TEMPORARY ON DATABASE \"${DB_NAME}\" TO \"${DB_USER}\"" >/dev/null
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -tAc \
    "ALTER SCHEMA public OWNER TO \"${DB_USER}\"; REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT ALL ON SCHEMA public TO \"${DB_USER}\"; CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null
  check_row "Permissions" "scoped to ${DB_USER} only" ok
}

verify_database_connection() {
  local attempt
  for attempt in 1 2 3 4 5; do
    if psql_app -tAc 'SELECT 1' >/dev/null 2>&1; then
      check_row "Connection" "${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}" ok
      return 0
    fi
    sleep 2
  done
  die "cannot connect to the database as ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
}

run_migrations() {
  step "Database migrations"
  if [[ ! -d "$ORYZ_APP_DIR" ]]; then die "application directory missing: $ORYZ_APP_DIR"; fi

  # Applied in lexical order; every file runs inside a single transaction and is
  # recorded in schema_migrations, so re-running the installer is idempotent.
  psql_app -q <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     text PRIMARY KEY,
  checksum    text NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
SQL

  local dir="$ORYZ_APP_DIR/supabase/migrations" file version checksum applied=0 skipped=0
  [[ -d "$dir" ]] || dir="$ORYZ_APP_DIR/migrations"
  if [[ ! -d "$dir" ]]; then
    warn "no migrations directory found — skipping"
    return 0
  fi

  shopt -s nullglob
  for file in "$dir"/*.sql; do
    version="$(basename "$file" .sql)"
    checksum="$(sha256sum "$file" | cut -d' ' -f1)"
    local recorded
    recorded="$(psql_app -tAc "SELECT checksum FROM schema_migrations WHERE version='${version}'")"
    if [[ -n "$recorded" ]]; then
      [[ "$recorded" == "$checksum" ]] ||
        warn "migration ${version} changed since it was applied — the panel will not re-run it"
      ((skipped++)); continue
    fi
    log "applying ${version}…"
    psql_app -q --single-transaction -f "$file"
    psql_app -q -c "INSERT INTO schema_migrations (version, checksum) VALUES ('${version}', '${checksum}')"
    ((applied++))
  done
  shopt -u nullglob
  check_row "Migrations" "${applied} applied, ${skipped} already current" ok
}

seed_initial_data() {
  step "Seeding reference data"
  local seed="$ORYZ_APP_DIR/deploy/sql/seed.sql"
  if [[ -f "$seed" ]]; then
    psql_app -q --single-transaction -f "$seed"
    check_row "Seed data" "roles, permissions and defaults loaded" ok
  else
    warn "no seed file at $seed — skipping"
  fi
}

create_admin_account() {
  step "Administrator account"
  # Password hashing happens in the application so the algorithm stays in one
  # place; the plaintext is passed over stdin and never appears in argv or logs.
  if [[ -f "$ORYZ_APP_DIR/deploy/scripts/create-admin.mjs" ]]; then
    printf '%s' "$ADMIN_PASSWORD" | run_as_app \
      "node deploy/scripts/create-admin.mjs --email '${ADMIN_EMAIL}' --name '${ADMIN_NAME}' --password-stdin"
  else
    local hash
    hash="$(psql_app -tAc "SELECT crypt('$(printf '%s' "$ADMIN_PASSWORD" | sed "s/'/''/g")', gen_salt('bf', 12))")"
    psql_app -q -c "INSERT INTO admin_bootstrap (email, display_name, password_hash)
      VALUES ('${ADMIN_EMAIL}', '${ADMIN_NAME}', '${hash}')
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash" 2>/dev/null ||
      warn "admin bootstrap table not present — create the first account through the web wizard"
  fi
  check_row "Administrator" "${ADMIN_EMAIL}" ok
}
