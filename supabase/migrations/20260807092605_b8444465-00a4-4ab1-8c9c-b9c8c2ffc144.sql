REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_server(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;