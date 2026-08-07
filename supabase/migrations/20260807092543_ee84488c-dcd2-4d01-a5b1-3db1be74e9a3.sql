-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('owner','super_admin','admin','moderator','support','user','guest');
CREATE TYPE public.node_status AS ENUM ('online','offline','maintenance','degraded','unknown');
CREATE TYPE public.server_status AS ENUM ('installing','install_failed','suspended','running','starting','stopping','offline','restoring','transferring','error');
CREATE TYPE public.backup_status AS ENUM ('pending','running','completed','failed','deleted');
CREATE TYPE public.schedule_task_action AS ENUM ('power','command','backup','http','webhook');
CREATE TYPE public.api_key_scope AS ENUM ('read','write','admin');
CREATE TYPE public.notification_channel AS ENUM ('in_app','email','discord','slack','telegram','push');

-- ============ SHARED HELPERS ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  language TEXT NOT NULL DEFAULT 'en',
  two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  last_login_at TIMESTAMPTZ,
  last_login_ip TEXT,
  suspended BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ ROLES / PERMISSIONS ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.permissions (
  key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT
);
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  permission_key TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  UNIQUE (role, permission_key)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner','super_admin','admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _user_id AND rp.permission_key = _permission
  );
$$;

CREATE POLICY "profiles_select_own_or_staff" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own_or_staff" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_staff(auth.uid()));

CREATE POLICY "user_roles_select_own_or_staff" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "permissions_select_all" ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "role_permissions_select_all" ON public.role_permissions FOR SELECT TO authenticated USING (true);

-- ============ AUTH TRIGGER ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email,'user'), '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    split_part(COALESCE(NEW.email, NEW.id::text), '@', 1) || '_' || substr(NEW.id::text, 1, 6)
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN (SELECT count(*) FROM public.user_roles WHERE role = 'owner') = 0 THEN 'owner'::public.app_role ELSE 'user'::public.app_role END)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ INFRASTRUCTURE ============
CREATE TABLE public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  country TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated;
GRANT ALL ON public.locations TO service_role;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "locations_read" ON public.locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "locations_write" ON public.locations FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER locations_updated BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  fqdn TEXT NOT NULL,
  scheme TEXT NOT NULL DEFAULT 'https',
  daemon_port INTEGER NOT NULL DEFAULT 8080,
  daemon_sftp_port INTEGER NOT NULL DEFAULT 2022,
  daemon_token_id TEXT,
  status public.node_status NOT NULL DEFAULT 'unknown',
  maintenance_mode BOOLEAN NOT NULL DEFAULT false,
  public_node BOOLEAN NOT NULL DEFAULT true,
  memory_mb BIGINT NOT NULL DEFAULT 0,
  memory_overallocate INTEGER NOT NULL DEFAULT 0,
  disk_mb BIGINT NOT NULL DEFAULT 0,
  disk_overallocate INTEGER NOT NULL DEFAULT 0,
  cpu_cores NUMERIC NOT NULL DEFAULT 0,
  upload_limit_mb INTEGER NOT NULL DEFAULT 512,
  docker_version TEXT,
  kernel TEXT,
  os_info TEXT,
  last_heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nodes TO authenticated;
GRANT ALL ON public.nodes TO service_role;
ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nodes_read" ON public.nodes FOR SELECT TO authenticated USING (true);
CREATE POLICY "nodes_write" ON public.nodes FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER nodes_updated BEFORE UPDATE ON public.nodes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.node_metrics (
  id BIGSERIAL PRIMARY KEY,
  node_id UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cpu_percent NUMERIC NOT NULL DEFAULT 0,
  memory_used_mb BIGINT NOT NULL DEFAULT 0,
  disk_used_mb BIGINT NOT NULL DEFAULT 0,
  network_rx_bytes BIGINT NOT NULL DEFAULT 0,
  network_tx_bytes BIGINT NOT NULL DEFAULT 0,
  container_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX node_metrics_node_time ON public.node_metrics (node_id, recorded_at DESC);
GRANT SELECT ON public.node_metrics TO authenticated;
GRANT ALL ON public.node_metrics TO service_role;
ALTER TABLE public.node_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "node_metrics_read_staff" ON public.node_metrics FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- ============ NESTS / EGGS ============
CREATE TABLE public.nests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  author TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nests TO authenticated;
GRANT ALL ON public.nests TO service_role;
ALTER TABLE public.nests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nests_read" ON public.nests FOR SELECT TO authenticated USING (true);
CREATE POLICY "nests_write" ON public.nests FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.eggs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nest_id UUID NOT NULL REFERENCES public.nests(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  docker_images JSONB NOT NULL DEFAULT '{}'::jsonb,
  startup TEXT NOT NULL DEFAULT '',
  stop_command TEXT NOT NULL DEFAULT 'stop',
  config_files JSONB NOT NULL DEFAULT '{}'::jsonb,
  config_startup JSONB NOT NULL DEFAULT '{}'::jsonb,
  install_script TEXT,
  script_container TEXT DEFAULT 'alpine:3.19',
  script_entry TEXT DEFAULT 'ash',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nest_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eggs TO authenticated;
GRANT ALL ON public.eggs TO service_role;
ALTER TABLE public.eggs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eggs_read" ON public.eggs FOR SELECT TO authenticated USING (true);
CREATE POLICY "eggs_write" ON public.eggs FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.egg_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  egg_id UUID NOT NULL REFERENCES public.eggs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  env_variable TEXT NOT NULL,
  default_value TEXT,
  user_viewable BOOLEAN NOT NULL DEFAULT true,
  user_editable BOOLEAN NOT NULL DEFAULT true,
  rules TEXT NOT NULL DEFAULT 'required|string',
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (egg_id, env_variable)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.egg_variables TO authenticated;
GRANT ALL ON public.egg_variables TO service_role;
ALTER TABLE public.egg_variables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "egg_variables_read" ON public.egg_variables FOR SELECT TO authenticated USING (true);
CREATE POLICY "egg_variables_write" ON public.egg_variables FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ SERVERS ============
CREATE TABLE public.servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL UNIQUE DEFAULT substr(replace(gen_random_uuid()::text,'-',''), 1, 8),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id UUID REFERENCES public.nodes(id) ON DELETE SET NULL,
  egg_id UUID REFERENCES public.eggs(id) ON DELETE SET NULL,
  status public.server_status NOT NULL DEFAULT 'installing',
  suspended BOOLEAN NOT NULL DEFAULT false,
  docker_image TEXT,
  startup_command TEXT,
  memory_mb INTEGER NOT NULL DEFAULT 1024,
  swap_mb INTEGER NOT NULL DEFAULT 0,
  disk_mb INTEGER NOT NULL DEFAULT 5120,
  cpu_percent INTEGER NOT NULL DEFAULT 100,
  io_weight INTEGER NOT NULL DEFAULT 500,
  oom_killer BOOLEAN NOT NULL DEFAULT false,
  database_limit INTEGER NOT NULL DEFAULT 2,
  allocation_limit INTEGER NOT NULL DEFAULT 2,
  backup_limit INTEGER NOT NULL DEFAULT 5,
  installed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servers TO authenticated;
GRANT ALL ON public.servers TO service_role;
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER servers_updated BEFORE UPDATE ON public.servers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.can_access_server(_user_id UUID, _server_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.servers s
    WHERE s.id = _server_id AND (s.owner_id = _user_id OR public.is_staff(_user_id))
  );
$$;

CREATE POLICY "servers_read" ON public.servers FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "servers_insert" ON public.servers FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "servers_update" ON public.servers FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "servers_delete" ON public.servers FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE TABLE public.allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  server_id UUID REFERENCES public.servers(id) ON DELETE SET NULL,
  ip TEXT NOT NULL,
  ip_alias TEXT,
  port INTEGER NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (node_id, ip, port)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allocations TO authenticated;
GRANT ALL ON public.allocations TO service_role;
ALTER TABLE public.allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allocations_read" ON public.allocations FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR (server_id IS NOT NULL AND public.can_access_server(auth.uid(), server_id)));
CREATE POLICY "allocations_write" ON public.allocations FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.server_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  env_variable TEXT NOT NULL,
  value TEXT,
  UNIQUE (server_id, env_variable)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.server_variables TO authenticated;
GRANT ALL ON public.server_variables TO service_role;
ALTER TABLE public.server_variables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "server_variables_all" ON public.server_variables FOR ALL TO authenticated
  USING (public.can_access_server(auth.uid(), server_id))
  WITH CHECK (public.can_access_server(auth.uid(), server_id));

CREATE TABLE public.server_databases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  engine TEXT NOT NULL DEFAULT 'mysql',
  host TEXT NOT NULL DEFAULT 'localhost',
  port INTEGER NOT NULL DEFAULT 3306,
  username TEXT NOT NULL,
  remote_access TEXT NOT NULL DEFAULT '%',
  max_connections INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.server_databases TO authenticated;
GRANT ALL ON public.server_databases TO service_role;
ALTER TABLE public.server_databases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "server_databases_all" ON public.server_databases FOR ALL TO authenticated
  USING (public.can_access_server(auth.uid(), server_id))
  WITH CHECK (public.can_access_server(auth.uid(), server_id));

CREATE TABLE public.backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status public.backup_status NOT NULL DEFAULT 'pending',
  storage_driver TEXT NOT NULL DEFAULT 'local',
  bytes BIGINT NOT NULL DEFAULT 0,
  checksum TEXT,
  ignored_files TEXT,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  encrypted BOOLEAN NOT NULL DEFAULT false,
  progress INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backups TO authenticated;
GRANT ALL ON public.backups TO service_role;
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backups_all" ON public.backups FOR ALL TO authenticated
  USING (public.can_access_server(auth.uid(), server_id))
  WITH CHECK (public.can_access_server(auth.uid(), server_id));

CREATE TABLE public.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cron_expression TEXT NOT NULL DEFAULT '0 * * * *',
  is_active BOOLEAN NOT NULL DEFAULT true,
  only_when_online BOOLEAN NOT NULL DEFAULT false,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedules TO authenticated;
GRANT ALL ON public.schedules TO service_role;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedules_all" ON public.schedules FOR ALL TO authenticated
  USING (public.can_access_server(auth.uid(), server_id))
  WITH CHECK (public.can_access_server(auth.uid(), server_id));

CREATE TABLE public.schedule_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  action public.schedule_task_action NOT NULL,
  payload TEXT,
  time_offset INTEGER NOT NULL DEFAULT 0,
  continue_on_failure BOOLEAN NOT NULL DEFAULT false,
  max_retries INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_tasks TO authenticated;
GRANT ALL ON public.schedule_tasks TO service_role;
ALTER TABLE public.schedule_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedule_tasks_all" ON public.schedule_tasks FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.schedules s WHERE s.id = schedule_id AND public.can_access_server(auth.uid(), s.server_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.schedules s WHERE s.id = schedule_id AND public.can_access_server(auth.uid(), s.server_id)));

CREATE TABLE public.schedule_runs (
  id BIGSERIAL PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  success BOOLEAN,
  output TEXT
);
GRANT SELECT ON public.schedule_runs TO authenticated;
GRANT ALL ON public.schedule_runs TO service_role;
ALTER TABLE public.schedule_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedule_runs_read" ON public.schedule_runs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.schedules s WHERE s.id = schedule_id AND public.can_access_server(auth.uid(), s.server_id)));

-- ============ ACCOUNT TOOLING ============
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scope public.api_key_scope NOT NULL DEFAULT 'read',
  allowed_ips TEXT[],
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_keys_own" ON public.api_keys FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  device_label TEXT,
  location TEXT,
  is_current BOOLEAN NOT NULL DEFAULT false,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_sessions_own" ON public.user_sessions FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (user_id = auth.uid());

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  level TEXT NOT NULL DEFAULT 'info',
  channel public.notification_channel NOT NULL DEFAULT 'in_app',
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_own" ON public.notifications FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  secret_hint TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_delivery_at TIMESTAMPTZ,
  last_status INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhooks TO authenticated;
GRANT ALL ON public.webhooks TO service_role;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhooks_staff" ON public.webhooks FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ PLATFORM ============
CREATE TABLE public.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_label TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created ON public.audit_logs (created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.audit_logs_id_seq TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_read" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR actor_id = auth.uid());
CREATE POLICY "audit_logs_insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

CREATE TABLE public.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  category TEXT NOT NULL DEFAULT 'general',
  label TEXT,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT SELECT ON public.settings TO anon;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_read_public" ON public.settings FOR SELECT TO anon USING (is_public);
CREATE POLICY "settings_read_auth" ON public.settings FOR SELECT TO authenticated
  USING (is_public OR public.is_staff(auth.uid()));
CREATE POLICY "settings_write_staff" ON public.settings FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ SEED: PERMISSIONS ============
INSERT INTO public.permissions (key, category, label, description) VALUES
  ('server.view','Servers','View servers','See servers assigned to the account'),
  ('server.create','Servers','Create servers','Provision new servers'),
  ('server.update','Servers','Edit servers','Change server settings and build limits'),
  ('server.delete','Servers','Delete servers','Permanently remove servers'),
  ('server.power','Servers','Power controls','Start, stop, restart and kill servers'),
  ('server.console','Servers','Console access','Read and write to the live console'),
  ('server.files','Servers','File manager','Browse, edit and upload server files'),
  ('server.backups','Servers','Backups','Create, restore and delete backups'),
  ('server.schedules','Servers','Schedules','Manage automated tasks'),
  ('server.databases','Servers','Databases','Manage server databases'),
  ('server.network','Servers','Network','Manage allocations and ports'),
  ('node.view','Infrastructure','View nodes','See node inventory and health'),
  ('node.manage','Infrastructure','Manage nodes','Create, edit and delete nodes'),
  ('location.manage','Infrastructure','Manage locations','Create and edit locations'),
  ('allocation.manage','Infrastructure','Manage allocations','Create and assign IP/port allocations'),
  ('egg.manage','Templates','Manage eggs and nests','Create and edit game templates'),
  ('user.view','Users','View users','Browse the user directory'),
  ('user.manage','Users','Manage users','Create, edit and suspend users'),
  ('role.manage','Users','Manage roles','Assign roles and permissions'),
  ('audit.view','Platform','View audit logs','Read the platform audit trail'),
  ('settings.manage','Platform','Manage settings','Change platform configuration'),
  ('webhook.manage','Platform','Manage webhooks','Create and edit outbound webhooks'),
  ('apikey.manage','Platform','Manage API keys','Create and revoke API keys')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT r.role, p.key
FROM (VALUES ('owner'::public.app_role), ('super_admin'::public.app_role)) AS r(role)
CROSS JOIN public.permissions p
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'admin'::public.app_role, key FROM public.permissions
WHERE key NOT IN ('settings.manage','role.manage')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'moderator'::public.app_role, key FROM public.permissions
WHERE key IN ('server.view','server.power','server.console','user.view','node.view','audit.view')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'support'::public.app_role, key FROM public.permissions
WHERE key IN ('server.view','server.console','user.view','node.view')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'user'::public.app_role, key FROM public.permissions
WHERE key IN ('server.view','server.power','server.console','server.files','server.backups','server.schedules','server.databases','server.network','apikey.manage')
ON CONFLICT DO NOTHING;

-- ============ SEED: SETTINGS ============
INSERT INTO public.settings (key, value, category, label, description, is_public) VALUES
  ('panel.name','"Oryz"','branding','Panel name','Displayed in the sidebar and page titles',true),
  ('panel.tagline','"Game server control, reimagined"','branding','Tagline','Short description used on auth screens',true),
  ('panel.maintenance_mode','false','platform','Maintenance mode','Blocks non-staff access to the panel',true),
  ('panel.default_theme','"dark"','appearance','Default theme','Theme used before a user picks one',true),
  ('security.registration_open','true','security','Open registration','Allow anyone to create an account',true),
  ('security.require_2fa_staff','false','security','Require 2FA for staff','Force staff accounts to enroll in 2FA',false),
  ('security.session_timeout_minutes','1440','security','Session timeout','Minutes of inactivity before sign-out',false),
  ('mail.from_address','"no-reply@example.com"','mail','From address','Sender address for outbound email',false),
  ('daemon.heartbeat_interval_seconds','15','daemon','Heartbeat interval','How often nodes report health',false),
  ('daemon.request_timeout_ms','10000','daemon','Request timeout','Timeout for panel to daemon requests',false),
  ('backups.default_driver','"local"','backups','Default backup driver','Where new backups are stored',false)
ON CONFLICT (key) DO NOTHING;