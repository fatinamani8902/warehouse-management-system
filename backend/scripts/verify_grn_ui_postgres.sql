\set ON_ERROR_STOP on
\set tenant_id 'TNT000001'
\set grn_id 'GRN000004'

-- Header values expected by Inbound > GRN list/detail.
SELECT
  g.grn_id,
  g.tenant_id,
  g.warehouse_id,
  g.asn_id,
  COALESCE(g.supplier_id, a.supplier_id) AS supplier_id,
  s.supplier_name,
  g.status,
  g.received_date,
  g.received_by,
  g.created_at,
  g.updated_at
FROM public.grns g
LEFT JOIN public.asns a
  ON a.tenant_id = g.tenant_id
 AND a.asn_id = g.asn_id
LEFT JOIN public.suppliers s
  ON s.tenant_id = g.tenant_id
 AND s.supplier_id = COALESCE(g.supplier_id, a.supplier_id)
WHERE g.tenant_id = :'tenant_id'
  AND g.grn_id = :'grn_id';

-- Lines expected by the GRN detail panel.
SELECT
  gl.grn_line_id,
  gl.asn_line_id,
  gl.line_no,
  gl.sku_id,
  sk.sku_code,
  sk.description,
  gl.expected_qty,
  gl.received_qty,
  gl.uom,
  gl.qc_status,
  gl.putaway_qty
FROM public.grn_lines gl
JOIN public.skus sk
  ON sk.tenant_id = gl.tenant_id
 AND sk.sku_id = gl.sku_id
WHERE gl.tenant_id = :'tenant_id'
  AND gl.grn_id = :'grn_id'
ORDER BY gl.line_no;

-- Proves the ASN handoff is unique for the tenant.
SELECT
  g.asn_id,
  count(*) AS grn_count
FROM public.grns g
WHERE g.tenant_id = :'tenant_id'
  AND g.asn_id = 'ASN000009'
GROUP BY g.asn_id;
