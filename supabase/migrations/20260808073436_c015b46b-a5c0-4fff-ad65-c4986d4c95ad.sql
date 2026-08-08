ALTER TABLE public.nodes
  ADD COLUMN IF NOT EXISTS daemon_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  ADD COLUMN IF NOT EXISTS behind_proxy boolean NOT NULL DEFAULT false;

UPDATE public.nodes SET daemon_token_id = COALESCE(daemon_token_id, encode(gen_random_bytes(8), 'hex'));

ALTER TABLE public.nodes ALTER COLUMN daemon_token_id SET DEFAULT encode(gen_random_bytes(8), 'hex');