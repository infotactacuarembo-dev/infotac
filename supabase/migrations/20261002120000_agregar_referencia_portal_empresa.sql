ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS portal_empresa_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS empresas_portal_empresa_id_key
  ON public.empresas (portal_empresa_id)
  WHERE portal_empresa_id IS NOT NULL;
