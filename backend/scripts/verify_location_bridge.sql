SELECT
  location.tenant_id,
  location.location_id,
  location.location_code,
  location.location_type,
  location.warehouse_id,
  location.bin_id,
  CASE WHEN location.is_active THEN 'active' ELSE 'inactive' END AS status
FROM public.locations location
ORDER BY location.tenant_id, location.location_code;

SELECT
  bin.tenant_id,
  bin.bin_id,
  count(location.location_id) AS linked_location_count
FROM public.warehouse_bins bin
LEFT JOIN public.locations location
  ON location.tenant_id = bin.tenant_id
 AND location.bin_id = bin.bin_id
GROUP BY bin.tenant_id, bin.bin_id
HAVING count(location.location_id) <> 1;

SELECT tenant_id, bin_id, count(*) AS duplicate_count
FROM public.locations
WHERE bin_id IS NOT NULL
GROUP BY tenant_id, bin_id
HAVING count(*) > 1;

SELECT tenant_id, location_id, location_code
FROM public.locations
WHERE location_type = 'storage'
  AND bin_id IS NULL
ORDER BY tenant_id, location_id;
