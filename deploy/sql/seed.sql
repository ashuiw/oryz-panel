-- Oryz Panel — reference data seed.
--
-- Permissions, role_permissions and default settings ship inside the schema
-- migrations, so this file only fills in deployment-time defaults that are
-- safe to re-apply on every install and upgrade.

INSERT INTO public.locations (short_code, name, country, description)
VALUES ('default', 'Default', NULL, 'Created by the installer')
ON CONFLICT (short_code) DO NOTHING;

INSERT INTO public.settings (key, value, category, label, description, is_public)
VALUES ('install.completed_at', to_jsonb(now()::text), 'system', 'Installed at', 'Timestamp of the last successful installer run', false)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
