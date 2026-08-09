DROP POLICY IF EXISTS nodes_read ON public.nodes;

CREATE POLICY nodes_read_staff
ON public.nodes
FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

REVOKE SELECT ON public.nodes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nodes TO authenticated;
GRANT ALL ON public.nodes TO service_role;