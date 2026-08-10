BEGIN;

ALTER TABLE public.returns
  ADD COLUMN IF NOT EXISTS shipment_id text,
  ADD COLUMN IF NOT EXISTS customer_name text;

ALTER TABLE public.return_items
  ADD COLUMN IF NOT EXISTS reason_code text;

CREATE INDEX IF NOT EXISTS idx_returns_scope_shipment
  ON public.returns (tenant_id, warehouse_id, shipment_id);

CREATE INDEX IF NOT EXISTS idx_return_items_scope_return
  ON public.return_items (tenant_id, return_id);

COMMIT;
