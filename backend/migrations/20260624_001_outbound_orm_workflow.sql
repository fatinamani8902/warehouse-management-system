BEGIN;

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.sales_orders
  DROP CONSTRAINT IF EXISTS sales_orders_status_check;
ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_status_check
  CHECK (status IN (
    'draft', 'open', 'released', 'allocated', 'picking',
    'packed', 'shipped', 'completed', 'cancelled'
  ));

ALTER TABLE public.pick_tasks
  ADD COLUMN IF NOT EXISTS picked_qty numeric(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lot_no text,
  ADD COLUMN IF NOT EXISTS serial_no text,
  ADD COLUMN IF NOT EXISTS picked_by text REFERENCES public.users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.pick_tasks
  DROP CONSTRAINT IF EXISTS pick_tasks_status_check;
ALTER TABLE public.pick_tasks
  ADD CONSTRAINT pick_tasks_status_check
  CHECK (status IN (
    'open', 'pending', 'assigned', 'in_progress', 'picking',
    'picked', 'done', 'completed', 'exception', 'cancelled'
  ));

ALTER TABLE public.packing_tasks
  ADD COLUMN IF NOT EXISTS wave_id text REFERENCES public.pick_waves(wave_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS carton_id text,
  ADD COLUMN IF NOT EXISTS packaging_type text,
  ADD COLUMN IF NOT EXISTS weight_kg numeric(12,4),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.packing_tasks
  DROP CONSTRAINT IF EXISTS packing_tasks_status_check;
ALTER TABLE public.packing_tasks
  ADD CONSTRAINT packing_tasks_status_check
  CHECK (status IN (
    'pending', 'in_progress', 'carton_generated',
    'packed', 'shipped', 'exception', 'cancelled'
  ));

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS pack_task_id text REFERENCES public.packing_tasks(pack_task_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_by text REFERENCES public.users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.shipments
  DROP CONSTRAINT IF EXISTS shipments_status_check;
ALTER TABLE public.shipments
  ADD CONSTRAINT shipments_status_check
  CHECK (status IN (
    'planned', 'pending', 'packed', 'carton_generated',
    'dispatched', 'picked_up', 'in_transit', 'delivered',
    'closed', 'cancelled'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS ux_pick_waves_tenant_order
  ON public.pick_waves (tenant_id, warehouse_id, wave_id);
CREATE INDEX IF NOT EXISTS ix_pick_tasks_scope_wave
  ON public.pick_tasks (tenant_id, warehouse_id, wave_id);
CREATE INDEX IF NOT EXISTS ix_pick_tasks_scope_order
  ON public.pick_tasks (tenant_id, warehouse_id, so_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_packing_tasks_scope_order
  ON public.packing_tasks (tenant_id, warehouse_id, so_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_shipments_scope_order
  ON public.shipments (tenant_id, warehouse_id, so_id);

COMMIT;
