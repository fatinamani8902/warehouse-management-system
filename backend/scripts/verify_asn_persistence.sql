\set ON_ERROR_STOP on

-- Latest ASN headers, including supplier and creator as separate fields.
SELECT
  a.asn_id,
  a.tenant_id,
  a.warehouse_id,
  a.supplier_id,
  s.supplier_name,
  a.status,
  a.eta,
  a.created_by,
  a.created_at,
  a.updated_at
FROM public.asns a
JOIN public.suppliers s
  ON s.tenant_id = a.tenant_id
 AND s.supplier_id = a.supplier_id
WHERE a.tenant_id = 'TNT000001'
ORDER BY a.created_at DESC
LIMIT 10;

-- Replace ASN000009 with the ASN ID returned by the UI/API.
\set asn_id 'ASN000009'

SELECT
  a.asn_id,
  a.supplier_id,
  s.supplier_name,
  a.created_by,
  a.status,
  a.eta,
  a.notes
FROM public.asns a
JOIN public.suppliers s
  ON s.tenant_id = a.tenant_id
 AND s.supplier_id = a.supplier_id
WHERE a.tenant_id = 'TNT000001'
  AND a.asn_id = :'asn_id';

SELECT
  al.asn_line_id,
  al.line_no,
  al.sku_id,
  sk.sku_code,
  sk.description,
  al.expected_qty,
  al.uom
FROM public.asn_lines al
JOIN public.skus sk
  ON sk.tenant_id = al.tenant_id
 AND sk.sku_id = al.sku_id
WHERE al.tenant_id = 'TNT000001'
  AND al.asn_id = :'asn_id'
ORDER BY al.line_no;

-- Arrived ASN to PostgreSQL GRN handoff.
SELECT
  g.grn_id,
  g.tenant_id,
  g.warehouse_id,
  g.asn_id,
  g.status,
  g.received_by,
  g.received_date,
  g.created_at
FROM public.grns g
WHERE g.tenant_id = 'TNT000001'
  AND g.asn_id = :'asn_id';

SELECT
  gl.grn_line_id,
  gl.grn_id,
  gl.asn_line_id,
  gl.line_no,
  gl.sku_id,
  sk.sku_code,
  gl.expected_qty,
  gl.received_qty,
  gl.uom,
  gl.qc_status
FROM public.grn_lines gl
JOIN public.grns g
  ON g.tenant_id = gl.tenant_id
 AND g.grn_id = gl.grn_id
JOIN public.skus sk
  ON sk.tenant_id = gl.tenant_id
 AND sk.sku_id = gl.sku_id
WHERE gl.tenant_id = 'TNT000001'
  AND g.asn_id = :'asn_id'
ORDER BY gl.line_no;
