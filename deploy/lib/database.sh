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

bootstrap_auth_schema() {
  # The panel's migrations are Supabase-shaped: they expect an `auth` schema,
  # `auth.users`, `auth.uid()` and the anon/authenticated/service_role roles.
  # A vanilla PostgreSQL server has none of those, so create them first.
  step "Auth schema bootstrap"
  local sql="$ORYZ_APP_DIR/deploy/sql/00-bootstrap.sql"
  [[ -f "$sql" ]] || sql="${SCRIPT_DIR:-}/sql/00-bootstrap.sql"
  [[ -f "$sql" ]] || die "bootstrap SQL not found (expected deploy/sql/00-bootstrap.sql)"

  if [[ "${DB_MODE}" == "local" ]]; then
    # Superuser: can create the shared roles. Ownership is then handed to the
    # panel role so later migrations may add triggers on auth.users. Feed SQL
    # over stdin: /opt/oryz is intentionally private, so the postgres OS user
    # must never need filesystem access to the application source tree.
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -q <"$sql"
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -q -c "
      ALTER SCHEMA auth OWNER TO \"${DB_USER}\";
      ALTER TABLE auth.users OWNER TO \"${DB_USER}\";
      ALTER TABLE auth.sessions OWNER TO \"${DB_USER}\";
      GRANT \"anon\", \"authenticated\", \"service_role\" TO \"${DB_USER}\";
      DO \$\$ DECLARE f record; BEGIN
        FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
                 JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'auth'
        LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO %I', f.sig, '${DB_USER}'); END LOOP;
      END \$\$;"
  else
    # Remote/managed Postgres: the panel role must already be allowed to create
    # schemas. Role creation is skipped gracefully by the SQL itself.
    psql_app -q -f "$sql"
  fi
  check_row "Auth compatibility" "auth schema, helpers and roles ready" ok
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
      ((skipped += 1)); continue
    fi
    log "applying ${version}…"
    psql_app -q --single-transaction -f "$file"
    psql_app -q -c "INSERT INTO schema_migrations (version, checksum) VALUES ('${version}', '${checksum}')"
    ((applied += 1))
  done
  shopt -u nullglob
  check_row "Migrations" "${applied} applied, ${skipped} already current" ok
}

seed_initial_data() {
  step "Seeding reference data"
  local seed="$ORYZ_APP_DIR/deploy/sql/seed.sql"
  [[ -f "$seed" ]] || seed="${SCRIPT_DIR:-}/sql/seed.sql"
  if [[ -f "$seed" ]]; then
    psql_app -q --single-transaction -f "$seed"
    check_row "Seed data" "defaults loaded" ok
  else
    warn "no seed file found — skipping"
  fi
}

create_admin_account() {
  step "Administrator account"
  # The password is passed as a psql variable, never interpolated into SQL text
  # and never written to argv of another process; hashing uses pgcrypto bcrypt.
  local sql; sql="$(mktemp)"; chmod 0600 "$sql"
  cat >"$sql" <<'SQL'
\set ON_ERROR_STOP on
WITH upserted AS (
  INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
  VALUES (
    :'admin_email',
    crypt(:'admin_password', gen_salt('bf', 12)),
    now(),
    jsonb_build_object('display_name', :'admin_name')
  )
  ON CONFLICT (email) DO UPDATE
    SET encrypted_password = crypt(:'admin_password', gen_salt('bf', 12)),
        email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
        raw_user_meta_data = auth.users.raw_user_meta_data || jsonb_build_object('display_name', :'admin_name')
  RETURNING id, email
)
INSERT INTO public.profiles (id, email, display_name, username)
SELECT u.id, u.email, :'admin_name', split_part(u.email, '@', 1) || '_' || substr(u.id::text, 1, 6)
FROM upserted u
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, email = EXCLUDED.email;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'owner'::public.app_role FROM auth.users WHERE email = :'admin_email'
ON CONFLICT (user_id, role) DO NOTHING;
SQL
  PGPASSWORD="$DB_PASSWORD" psql -v ON_ERROR_STOP=1 \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -q \
    -v admin_email="$ADMIN_EMAIL" \
    -v admin_name="${ADMIN_NAME:-Administrator}" \
    -v admin_password="$ADMIN_PASSWORD" \
    -f "$sql" || { rm -f "$sql"; die "could not create the administrator account"; }
  rm -f "$sql"
  check_row "Administrator" "${ADMIN_EMAIL} (owner)" ok
}

