import { Op } from "sequelize";
import {
  InventoryBalance,
  InventoryTransaction,
  Location,
  Sku,
  Warehouse,
} from "../models/index.js";
import { ApiError } from "../utils/errors.js";

function clean(value) {
  const result = String(value ?? "").trim();
  return result || "";
}

function requireTenantId(tenantId) {
  const normalized = clean(tenantId);
  if (!normalized) {
    throw new ApiError(403, "TENANT_CONTEXT_REQUIRED", "Tenant context is required");
  }
  return normalized;
}

function pagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function like(value) {
  return { [Op.iLike]: value };
}

function wildcard(value) {
  return `%${clean(value)}%`;
}

function decimalDiff(left, right) {
  return Number(left || 0) - Number(right || 0);
}

function displayLocation(location) {
  if (!location) return null;
  return location.location_code || location.label || location.location_id;
}

function inventoryScopedBalancesFromSql(alias = "balance") {
  return `public.inventory_balances ${alias}
     JOIN public.skus sku
       ON sku.tenant_id = ${alias}.tenant_id
      AND sku.sku_id = ${alias}.sku_id
     JOIN public.locations location
       ON location.tenant_id = ${alias}.tenant_id
      AND location.location_id = ${alias}.location_id
     JOIN public.warehouses warehouse
      ON warehouse.tenant_id = ${alias}.tenant_id
     AND warehouse.warehouse_id = ${alias}.warehouse_id`;
}

const manualAdjustmentLocationTypes = ["storage", "picking", "adjustment", "quarantine"];

async function listAdjustmentLocations(client, { tenantId, warehouseId, skuId }) {
  const scopedTenantId = requireTenantId(tenantId);
  const scopedWarehouseId = clean(warehouseId);
  const scopedSkuId = clean(skuId);

  if (!scopedWarehouseId) {
    throw new ApiError(400, "WAREHOUSE_CONTEXT_REQUIRED", "Warehouse context is required");
  }

  if (!scopedSkuId) {
    throw new ApiError(400, "SKU_REQUIRED", "SKU is required");
  }

  const result = await client.query(
    `SELECT
       location.location_id,
       location.warehouse_id,
       location.location_code,
       location.location_type,
       location.bin_id,
       CASE
         WHEN location.bin_id IS NOT NULL THEN concat_ws(
           '-', warehouse.warehouse_code, zone.zone_code, aisle.aisle_code,
           bay.bay_code, level.level_code, bin.bin_code
         )
         ELSE coalesce(location.location_code, location.label, location.location_id)
       END AS display_name,
       coalesce(sum(balance.qty_on_hand), 0)::numeric AS qty_on_hand,
       coalesce(sum(balance.qty_reserved), 0)::numeric AS qty_reserved,
       coalesce(sum(balance.qty_quarantine), 0)::numeric AS qty_quarantine,
       coalesce(sum(balance.qty_on_hand - balance.qty_reserved), 0)::numeric AS qty_available,
       count(balance.inv_balance_id)::int AS balance_count
     FROM public.locations location
     JOIN public.warehouses warehouse
       ON warehouse.tenant_id = location.tenant_id
      AND warehouse.warehouse_id = location.warehouse_id
     LEFT JOIN public.warehouse_bins bin
       ON bin.tenant_id = location.tenant_id
      AND bin.bin_id = location.bin_id
     LEFT JOIN public.warehouse_levels level
       ON level.tenant_id = bin.tenant_id
      AND level.level_id = bin.level_id
     LEFT JOIN public.warehouse_bays bay
       ON bay.tenant_id = level.tenant_id
      AND bay.bay_id = level.bay_id
     LEFT JOIN public.warehouse_aisles aisle
       ON aisle.tenant_id = bay.tenant_id
      AND aisle.aisle_id = bay.aisle_id
     LEFT JOIN public.warehouse_zones zone
       ON zone.tenant_id = aisle.tenant_id
      AND zone.zone_id = aisle.zone_id
     LEFT JOIN public.inventory_balances balance
       ON balance.tenant_id = location.tenant_id
      AND balance.warehouse_id = location.warehouse_id
      AND balance.location_id = location.location_id
      AND balance.sku_id = $3
     WHERE location.tenant_id = $1
       AND location.warehouse_id = $2
       AND location.is_active = true
       AND location.location_type = ANY($4::text[])
       AND (location.location_type <> 'storage' OR location.bin_id IS NOT NULL)
     GROUP BY
       location.location_id,
       location.warehouse_id,
       location.location_code,
       location.location_type,
       location.bin_id,
       location.label,
       warehouse.warehouse_code,
       zone.zone_code,
       aisle.aisle_code,
       bay.bay_code,
       level.level_code,
       bin.bin_code
     HAVING coalesce(sum(balance.qty_on_hand), 0) > 0
     ORDER BY
       coalesce(sum(balance.qty_on_hand), 0) DESC,
       coalesce(
         CASE
           WHEN location.bin_id IS NOT NULL THEN concat_ws(
             '-', warehouse.warehouse_code, zone.zone_code, aisle.aisle_code,
             bay.bay_code, level.level_code, bin.bin_code
           )
           ELSE location.location_code
         END,
         location.location_id
       ) ASC,
       location.location_id ASC`,
    [scopedTenantId, scopedWarehouseId, scopedSkuId, manualAdjustmentLocationTypes]
  );

  return {
    data: result.rows.map((row) => ({
      ...row,
      on_hand_qty: row.qty_on_hand,
      reserved_qty: row.qty_reserved,
      quarantine_qty: row.qty_quarantine,
      available_qty: row.qty_available,
    })),
  };
}

function buildBalanceQuery({ tenantId, warehouseId, filters = {} }) {
  const balanceWhere = { tenant_id: tenantId };
  const skuWhere = {};
  const locationWhere = {};

  const effectiveWarehouseId = clean(filters.warehouse_id) || clean(warehouseId);
  if (effectiveWarehouseId) balanceWhere.warehouse_id = effectiveWarehouseId;
  if (clean(filters.sku_id)) balanceWhere.sku_id = clean(filters.sku_id);
  if (clean(filters.location_id)) balanceWhere.location_id = clean(filters.location_id);
  if (clean(filters.lot_no || filters.lot)) balanceWhere.lot_no = like(wildcard(filters.lot_no || filters.lot));
  if (clean(filters.serial_no || filters.serial)) balanceWhere.serial_no = like(wildcard(filters.serial_no || filters.serial));

  if (clean(filters.sku_code)) skuWhere.sku_code = like(wildcard(filters.sku_code));
  if (clean(filters.status)) skuWhere.status = clean(filters.status);
  if (clean(filters.location_type)) locationWhere.location_type = clean(filters.location_type);
  if (clean(filters.zone_id)) locationWhere.zone = clean(filters.zone_id);

  const search = clean(filters.search);
  if (search) {
    balanceWhere[Op.or] = [
      { sku_id: like(wildcard(search)) },
      { location_id: like(wildcard(search)) },
      { "$Sku.sku_code$": like(wildcard(search)) },
      { "$Sku.description$": like(wildcard(search)) },
      { "$Location.location_code$": like(wildcard(search)) },
      { "$Location.label$": like(wildcard(search)) },
    ];
  }

  return {
    where: balanceWhere,
    include: [
      { model: Sku, required: true, where: skuWhere },
      { model: Location, required: true, where: locationWhere },
      { model: Warehouse, required: true },
    ],
  };
}

function mapBalance(row) {
  const balance = row.get({ plain: true });
  const sku = balance.Sku || {};
  const location = balance.Location || {};
  const warehouse = balance.Warehouse || {};
  const locationCode = displayLocation(location);
  const availableQty = decimalDiff(balance.qty_on_hand, balance.qty_reserved);

  return {
    inv_balance_id: balance.inv_balance_id,
    inventory_id: balance.inv_balance_id,
    warehouse_id: balance.warehouse_id,
    warehouse_code: warehouse.warehouse_code,
    warehouse_name: warehouse.warehouse_name,
    sku_id: balance.sku_id,
    sku_code: sku.sku_code,
    description: sku.description,
    sku_description: sku.description,
    category: sku.category,
    uom: sku.uom,
    status: sku.status,
    location_id: balance.location_id,
    location_code: locationCode,
    stored_location_code: location.location_code,
    location_type: location.location_type,
    bin_id: location.bin_id,
    zone_id: location.zone || null,
    zone_code: location.zone || null,
    zone_name: location.zone || null,
    display_name: locationCode,
    lot_no: balance.lot_no,
    serial_no: balance.serial_no,
    qty_on_hand: balance.qty_on_hand,
    qty_reserved: balance.qty_reserved,
    qty_quarantine: balance.qty_quarantine,
    qty_available: availableQty,
    on_hand_qty: balance.qty_on_hand,
    reserved_qty: balance.qty_reserved,
    quarantine_qty: balance.qty_quarantine,
    available_qty: availableQty,
    updated_at: balance.updated_at,
  };
}

async function listBalances({ tenantId, warehouseId, filters = {} }) {
  const scopedTenantId = requireTenantId(tenantId);
  const { page, pageSize, offset } = pagination(filters);
  const query = buildBalanceQuery({ tenantId: scopedTenantId, warehouseId, filters });

  const result = await InventoryBalance.findAndCountAll({
    ...query,
    distinct: true,
    col: "inv_balance_id",
    subQuery: false,
    order: [
      [Sku, "sku_code", "ASC"],
      [Location, "location_code", "ASC"],
      ["lot_no", "ASC"],
      ["serial_no", "ASC"],
    ],
    offset,
    limit: pageSize,
  });
  const total = result.count;

  return {
    data: result.rows.map(mapBalance),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

function buildTransactionQuery({ tenantId, warehouseId, filters = {} }) {
  const transactionWhere = { tenant_id: tenantId };
  const skuWhere = {};
  const fromLocationWhere = {};
  const toLocationWhere = {};

  const effectiveWarehouseId = clean(filters.warehouse_id) || clean(warehouseId);
  if (effectiveWarehouseId) transactionWhere.warehouse_id = effectiveWarehouseId;
  if (clean(filters.sku_id)) transactionWhere.sku_id = clean(filters.sku_id);
  if (clean(filters.sku_code)) skuWhere.sku_code = like(wildcard(filters.sku_code));

  const locationId = clean(filters.location_id);
  if (locationId) {
    transactionWhere[Op.or] = [
      { from_location_id: locationId },
      { to_location_id: locationId },
    ];
  }

  const locationType = clean(filters.location_type);
  if (locationType) {
    transactionWhere[Op.and] = [
      ...(transactionWhere[Op.and] || []),
      {
        [Op.or]: [
          { "$fromLocation.location_type$": locationType },
          { "$toLocation.location_type$": locationType },
        ],
      },
    ];
  }

  const txType = clean(filters.status || filters.tx_type || filters.txn_type);
  if (txType) {
    transactionWhere[Op.and] = [
      ...(transactionWhere[Op.and] || []),
      {
        [Op.or]: [
          { tx_type: like(wildcard(txType)) },
          { txn_type: like(wildcard(txType)) },
        ],
      },
    ];
  }

  const search = clean(filters.search);
  if (search) {
    transactionWhere[Op.and] = [
      ...(transactionWhere[Op.and] || []),
      {
        [Op.or]: [
          { itx_id: like(wildcard(search)) },
          { txn_id: like(wildcard(search)) },
          { ref_id: like(wildcard(search)) },
          { reference_id: like(wildcard(search)) },
          { notes: like(wildcard(search)) },
          { sku_id: like(wildcard(search)) },
          { "$Sku.sku_code$": like(wildcard(search)) },
          { "$Sku.description$": like(wildcard(search)) },
          { "$fromLocation.location_code$": like(wildcard(search)) },
          { "$toLocation.location_code$": like(wildcard(search)) },
        ],
      },
    ];
  }

  return {
    where: transactionWhere,
    include: [
      { model: Sku, required: true, where: skuWhere },
      { model: Warehouse, required: true },
      { model: Location, as: "fromLocation", required: false, where: fromLocationWhere },
      { model: Location, as: "toLocation", required: false, where: toLocationWhere },
    ],
  };
}

function mapTransaction(row) {
  const transaction = row.get({ plain: true });
  const sku = transaction.Sku || {};
  const warehouse = transaction.Warehouse || {};
  const fromLocation = transaction.fromLocation || {};
  const toLocation = transaction.toLocation || {};

  return {
    itx_id: transaction.itx_id,
    txn_id: transaction.txn_id || transaction.itx_id,
    warehouse_id: transaction.warehouse_id,
    warehouse_code: warehouse.warehouse_code,
    warehouse_name: warehouse.warehouse_name,
    sku_id: transaction.sku_id,
    sku_code: sku.sku_code,
    sku_name: sku.description,
    product_name: sku.description,
    description: sku.description,
    sku_description: sku.description,
    uom: sku.uom,
    from_location_id: transaction.from_location_id,
    from_location_code: fromLocation.location_code,
    from_location_type: fromLocation.location_type,
    from_bin_id: fromLocation.bin_id,
    from_display_name: displayLocation(fromLocation),
    to_location_id: transaction.to_location_id,
    to_location_code: toLocation.location_code,
    to_location_type: toLocation.location_type,
    to_bin_id: toLocation.bin_id,
    to_display_name: displayLocation(toLocation),
    qty: transaction.qty,
    tx_type: transaction.tx_type || transaction.txn_type,
    reference_type: transaction.ref_type || transaction.reference_type,
    reference_id: transaction.ref_id || transaction.reference_id,
    reason_code: transaction.reason_code,
    notes: transaction.notes,
    created_by: transaction.created_by,
    created_at: transaction.created_at || transaction.tx_at,
    tx_at: transaction.tx_at,
  };
}

async function listTransactions({ tenantId, warehouseId, filters = {} }) {
  const scopedTenantId = requireTenantId(tenantId);
  const { page, pageSize, offset } = pagination(filters);
  const query = buildTransactionQuery({ tenantId: scopedTenantId, warehouseId, filters });

  const result = await InventoryTransaction.findAndCountAll({
    ...query,
    distinct: true,
    col: "itx_id",
    subQuery: false,
    order: [
      ["tx_at", "DESC"],
      ["itx_id", "DESC"],
    ],
    offset,
    limit: pageSize,
  });
  const total = result.count;

  return {
    data: result.rows.map(mapTransaction),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export {
  inventoryScopedBalancesFromSql,
  listAdjustmentLocations,
  listBalances,
  listTransactions,
};
