\set ON_ERROR_STOP on
\set asn_id 'ASN000009'
\set tenant_id 'TNT000001'

SELECT
  a.asn_id,
  a.tenant_id,
  a.warehouse_id,
  a.status AS asn_status,
  a.created_by,
  g.grn_id,
  g.status AS grn_status,
  g.received_by,
  g.received_date,
  g.created_at AS grn_created_at
FROM public.asns a
LEFT JOIN public.grns g
  ON g.tenant_id = a.tenant_id
 AND g.asn_id = a.asn_id
WHERE a.tenant_id = :'tenant_id'
  AND a.asn_id = :'asn_id';

SELECT
  gl.grn_line_id,
  gl.grn_id,
  gl.asn_line_id,
  gl.line_no,
  gl.sku_id,
  sk.sku_code,
  sk.description,
  gl.expected_qty,
  gl.received_qty,
  gl.uom,
  gl.qc_status
FROM public.grns g
JOIN public.grn_lines gl
  ON gl.tenant_id = g.tenant_id
 AND gl.grn_id = g.grn_id
JOIN public.skus sk
  ON sk.tenant_id = gl.tenant_id
 AND sk.sku_id = gl.sku_id
WHERE g.tenant_id = :'tenant_id'
  AND g.asn_id = :'asn_id'
ORDER BY gl.line_no;

SELECT
  count(DISTINCT g.grn_id) AS grn_count,
  count(gl.grn_line_id) AS grn_line_count
FROM public.grns g
LEFT JOIN public.grn_lines gl
  ON gl.tenant_id = g.tenant_id
 AND gl.grn_id = g.grn_id
WHERE g.tenant_id = :'tenant_id'
  AND g.asn_id = :'asn_id';
