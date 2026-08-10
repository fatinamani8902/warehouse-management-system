ALTER TABLE IF EXISTS public.suppliers
  ADD COLUMN IF NOT EXISTS contact_person text NULL;
