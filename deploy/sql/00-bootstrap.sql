-- Oryz Panel — Postgres bootstrap for self-hosted installs.
--
-- The panel's migrations are written against a Supabase-shaped database:
-- they reference the `auth` schema, `auth.users`, `auth.uid()` and the
-- `anon` / `authenticated` / `service_role` roles. A plain PostgreSQL server
-- has none of those, so this file creates the compatible surface before any
-- migration runs. It is idempotent — running it twice changes nothing.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Roles used by GRANT statements and RLS policies
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'skipping role creation — the current user cannot create roles';
END $$;

-- ---------------------------------------------------------------------------
-- auth schema and a minimal, GoTrue-compatible users table
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aud                 text DEFAULT 'authenticated',
  role                text DEFAULT 'authenticated',
  email               text UNIQUE,
  encrypted_password  text,
  email_confirmed_at  timestamptz,
  invited_at          timestamptz,
  confirmation_token  text,
  recovery_token      text,
  last_sign_in_at     timestamptz,
  raw_app_meta_data   jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_user_meta_data  jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_super_admin      boolean NOT NULL DEFAULT false,
  phone               text,
  banned_until        timestamptz,
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  not_after   timestamptz
);

-- ---------------------------------------------------------------------------
-- Request-scoped identity helpers (same contract as Supabase / PostgREST)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(
    COALESCE(
      current_setting('request.jwt.claim.sub', true),
      (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), ''
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    'anon'
  );
$$;

CREATE OR REPLACE FUNCTION auth.email()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.email', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  );
$$;

CREATE OR REPLACE FUNCTION auth.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS users_updated ON auth.users;
CREATE TRIGGER users_updated BEFORE UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION auth.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access: the panel role must own the schema so migrations can add triggers.
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
