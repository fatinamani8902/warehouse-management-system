-- Migration: Standardize tenant session variable
-- Purpose: Replace legacy tenant session variable usage with app.current_tenant_id in database views.
-- Note: Forward migration is executable. Rollback SQL is commented at the bottom.

BEGIN;

-- Identified existing legacy tenant session variable usage:
-- - public.v_dashboard_kpis in backend/db/wms_postgres_schema_public_view.sql
--
-- Existing RLS migrations already use app.current_tenant_id.

CREATE OR REPLACE VIEW public.v_dashboard_kpis AS
WITH ctx AS (
  SELECT
    current_setting('app.current_tenant_id'::text, true) AS tenant_id,
    current_setting('app.warehouse_id'::text, true) AS warehouse_id
),
today_inbound AS (
  SELECT
    a.tenant_id,
    a.warehouse_id,
    count(*) AS inbound_asn_due
  FROM public.asns a
  WHERE a.eta = CURRENT_DATE
  GROUP BY a.tenant_id, a.warehouse_id
),
today_grn AS (
  SELECT
    g.tenant_id,
    g.warehouse_id,
    count(*) AS grn_today
  FROM public.grns g
  WHERE g.received_date = CURRENT_DATE
  GROUP BY g.tenant_id, g.warehouse_id
),
today_ship AS (
  SELECT
    sh.tenant_id,
    sh.warehouse_id,
    count(*) AS shipments_today
  FROM public.shipments sh
  WHERE sh.ship_date = CURRENT_DATE
  GROUP BY sh.tenant_id, sh.warehouse_id
),
low_stock AS (
  SELECT
    v.tenant_id,
    v.warehouse_id,
    count(*) AS low_stock_skus
  FROM public.v_inventory_low_stock v
  GROUP BY v.tenant_id, v.warehouse_id
)
SELECT
  COALESCE(c.tenant_id, t.tenant_id) AS tenant_id,
  COALESCE(c.warehouse_id, t.warehouse_id) AS warehouse_id,
  COALESCE(t.inbound_asn_due, 0::bigint) AS inbound_asn_due_today,
  COALESCE(g.grn_today, 0::bigint) AS grns_received_today,
  COALESCE(p.putaway_open, 0::bigint) AS putaway_open,
  COALESCE(o.pick_open, 0::bigint) AS picks_open,
  COALESCE(s.shipments_today, 0::bigint) AS shipments_today,
  COALESCE(ls.low_stock_skus, 0::bigint) AS low_stock_skus
FROM ctx c
LEFT JOIN today_inbound t
  ON t.tenant_id = c.tenant_id
 AND (c.warehouse_id IS NULL OR t.warehouse_id = c.warehouse_id)
LEFT JOIN today_grn g
  ON g.tenant_id = c.tenant_id
 AND (c.warehouse_id IS NULL OR g.warehouse_id = c.warehouse_id)
LEFT JOIN public.v_putaway_workload p
  ON p.tenant_id = c.tenant_id
 AND (c.warehouse_id IS NULL OR p.warehouse_id = c.warehouse_id)
LEFT JOIN public.v_outbound_workload o
  ON o.tenant_id = c.tenant_id
 AND (c.warehouse_id IS NULL OR o.warehouse_id = c.warehouse_id)
LEFT JOIN today_ship s
  ON s.tenant_id = c.tenant_id
 AND (c.warehouse_id IS NULL OR s.warehouse_id = c.warehouse_id)
LEFT JOIN low_stock ls
  ON ls.tenant_id = c.tenant_id
 AND (c.warehouse_id IS NULL OR ls.warehouse_id = c.warehouse_id);

COMMIT;

-- Risk notes:
-- - Backend must set app.current_tenant_id before this view is relied on.
-- - This migration intentionally does not introduce the legacy tenant session variable anywhere new.
-- - This should run before Phase 1 RLS.

-- Rollback SQL:
-- Rollback is intentionally a no-op because reintroducing the legacy tenant
-- session variable is prohibited for new migration files.
-- BEGIN;
--
-- COMMIT;
