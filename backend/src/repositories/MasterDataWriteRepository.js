import { Sequelize } from "sequelize";
import {
  Customer,
  Location,
  LovGroup,
  LovValue,
  Sku,
  Supplier,
  Warehouse,
  WarehouseAisle,
  WarehouseBay,
  WarehouseBin,
  WarehouseLevel,
  WarehouseZone,
} from "../models/index.js";
import { sequelize } from "../models/index.js";
import { ApiError } from "../utils/errors.js";

function clean(value) {
  return String(value ?? "").trim();
}

function plain(row) {
  return row?.get ? row.get({ plain: true }) : row;
}

function normalizeStatus(value) {
  const status = clean(value).toLowerCase();
  if (!["active", "inactive"].includes(status)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Status must be active or inactive");
  }
  return status;
}

function requiredText(value, field) {
  const normalized = clean(value);
  if (!normalized) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} is required`);
  }
  return normalized;
}

function optionalText(value) {
  if (value === undefined || value === null) return null;
  const normalized = clean(value);
  return normalized || null;
}

function optionalNumber(value, field, { min = null, defaultValue = null } = {}) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || (min !== null && normalized < min)) {
    const suffix = min === null ? "a valid number" : `a number greater than or equal to ${min}`;
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be ${suffix}`);
  }
  return normalized;
}

function optionalBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  throw new ApiError(400, "VALIDATION_ERROR", "Value must be true or false");
}

function mapSupplier(row) {
  if (!row) return null;
  return { ...row, contact_person: row.contact_person || null, is_active: row.status === "active" };
}

function mapCustomer(row) {
  if (!row) return null;
  return { ...row };
}

function mapWarehouse(row) {
  if (!row) return null;
  return { ...row, is_active: row.status === "active" };
}

function mapSku(row) {
  if (!row) return null;
  return { ...row };
}

function mapLocation(row) {
  if (!row) return null;
  return { ...row, is_active: row.is_active === true };
}

function mapLovGroup(group) {
  if (!group) return null;
  const plainGroup = plain(group);
  const values = Array.isArray(plainGroup.LovValues)
    ? plainGroup.LovValues
    : Array.isArray(plainGroup.values)
      ? plainGroup.values
      : [];
  return {
    ...plainGroup,
    id: plainGroup.lov_group_id,
    values: values
      .map((value) => {
        const v = plain(value);
        return { ...v, id: v.lov_value_id };
      })
      .sort((left, right) => {
        const leftSort = Number(left.sort_order ?? 0);
        const rightSort = Number(right.sort_order ?? 0);
        if (leftSort !== rightSort) return leftSort - rightSort;
        return String(left.value_label || "").localeCompare(String(right.value_label || ""));
      }),
  };
}

function now() {
  return new Date();
}

async function generatePrefixedId(model, field, prefix, width = 6) {
  const rows = await model.findAll({ attributes: [field], raw: true });
  const next = rows.reduce((max, row) => {
    const value = String(row[field] ?? "");
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(value);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0) + 1;
  return `${prefix}${String(next).padStart(width, "0")}`;
}

async function generateNumericCode(model, where, field, width, transaction) {
  const rows = await model.findAll({ attributes: [field], where, raw: true, transaction });
  const next = rows.reduce((max, row) => {
    const value = String(row[field] ?? "");
    if (!/^\d+$/.test(value)) return max;
    return Math.max(max, Number(value));
  }, 0) + 1;
  return String(next).padStart(width, "0");
}

async function generateCodeWithPrefix(model, where, field, prefix, width, transaction) {
  const rows = await model.findAll({ attributes: [field], where, raw: true, transaction });
  const expression = new RegExp(`^${prefix}(\\d+)$`);
  const next = rows.reduce((max, row) => {
    const value = String(row[field] ?? "");
    const match = expression.exec(value);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0) + 1;
  return `${prefix}${String(next).padStart(width, "0")}`;
}

async function updateById(model, where, values, options = {}) {
  const payload = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined)
  );
  payload.updated_at = now();
  const [count, rows] = await model.update(payload, { where, returning: true, ...options });
  if (!count) return null;
  return plain(rows[0]);
}

async function destroyWithFallback({ model, where, onForeignKey }) {
  const row = await model.findOne({ where });
  if (!row) return null;
  try {
    await row.destroy();
    return { row: plain(row), deletionMode: "hard" };
  } catch (error) {
    if (error?.name !== "SequelizeForeignKeyConstraintError" && error?.parent?.code !== "23503") {
      throw error;
    }
    if (onForeignKey === "soft") {
      const updated = await updateById(model, where, { status: "inactive" });
      return { row: updated, deletionMode: "soft" };
    }
    throw new ApiError(409, "RESOURCE_IN_USE", onForeignKey || "Record is in use");
  }
}

async function skuHasReferences(tenantId, skuId) {
  const references = [
    ["adjustment_lines", "sku_id"],
    ["inventory_balances", "sku_id"],
    ["inventory_transactions", "sku_id"],
  ];
  for (const [table, column] of references) {
    const result = await sequelize.query(
      `SELECT 1 FROM public.${table}
       WHERE tenant_id = $1
         AND ${column} = $2
       LIMIT 1`,
      {
        bind: [tenantId, skuId],
        type: Sequelize.QueryTypes.SELECT,
      }
    );
    if (result.length > 0) return true;
  }
  return false;
}

async function createSupplier(tenantId, body) {
  const supplierId = await generatePrefixedId(Supplier, "supplier_id", "SUP");
  const row = await Supplier.create({
    tenant_id: tenantId,
    supplier_id: supplierId,
    supplier_name: requiredText(body?.supplier_name, "supplier_name"),
    supplier_code: optionalText(body?.supplier_code),
    contact_person: optionalText(body?.contact_person),
    email: optionalText(body?.email),
    phone: optionalText(body?.phone),
    address: optionalText(body?.address),
    status: body?.status ? normalizeStatus(body.status) : "active",
    created_at: now(),
    updated_at: now(),
  });
  return mapSupplier(plain(row));
}

async function updateSupplier(tenantId, supplierId, body) {
  const updated = await updateById(Supplier, { tenant_id: tenantId, supplier_id: supplierId }, {
    supplier_name: requiredText(body?.supplier_name, "supplier_name"),
    supplier_code: optionalText(body?.supplier_code),
    contact_person: optionalText(body?.contact_person),
    email: optionalText(body?.email),
    phone: optionalText(body?.phone),
    address: optionalText(body?.address),
    status: body?.status ? normalizeStatus(body.status) : "active",
  });
  return mapSupplier(updated);
}

async function deleteSupplier(tenantId, supplierId) {
  return destroyWithFallback({
    model: Supplier,
    where: { tenant_id: tenantId, supplier_id: supplierId },
    onForeignKey: "Supplier is in use",
  });
}

async function createCustomer(tenantId, body) {
  const customerId = await generatePrefixedId(Customer, "customer_id", "CUS");
  const row = await Customer.create({
    tenant_id: tenantId,
    customer_id: customerId,
    customer_name: requiredText(body?.customer_name, "customer_name"),
    customer_code: optionalText(body?.customer_code),
    email: optionalText(body?.email),
    phone: optionalText(body?.phone),
    address: optionalText(body?.address),
    status: body?.status ? normalizeStatus(body.status) : "active",
    created_at: now(),
    updated_at: now(),
  });
  return mapCustomer(plain(row));
}

async function updateCustomer(tenantId, customerId, body) {
  const updated = await updateById(Customer, { tenant_id: tenantId, customer_id: customerId }, {
    customer_name: requiredText(body?.customer_name, "customer_name"),
    customer_code: optionalText(body?.customer_code),
    email: optionalText(body?.email),
    phone: optionalText(body?.phone),
    address: optionalText(body?.address),
    status: body?.status ? normalizeStatus(body.status) : "active",
  });
  return mapCustomer(updated);
}

async function deleteCustomer(tenantId, customerId) {
  return destroyWithFallback({
    model: Customer,
    where: { tenant_id: tenantId, customer_id: customerId },
    onForeignKey: "Customer is in use",
  });
}

async function createWarehouse(tenantId, body) {
  const warehouseId = await generatePrefixedId(Warehouse, "warehouse_id", "WH");
  const row = await Warehouse.create({
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    warehouse_code: optionalText(body?.warehouse_code),
    warehouse_name: requiredText(body?.warehouse_name, "warehouse_name"),
    city: optionalText(body?.city),
    country: optionalText(body?.country),
    status: body?.status ? normalizeStatus(body.status) : "active",
    created_at: now(),
    updated_at: now(),
  });
  return mapWarehouse(plain(row));
}

async function updateWarehouse(tenantId, warehouseId, body) {
  const updated = await updateById(Warehouse, { tenant_id: tenantId, warehouse_id: warehouseId }, {
    warehouse_code: optionalText(body?.warehouse_code),
    warehouse_name: requiredText(body?.warehouse_name, "warehouse_name"),
    city: optionalText(body?.city),
    country: optionalText(body?.country),
    status: body?.status ? normalizeStatus(body.status) : "active",
  });
  return mapWarehouse(updated);
}

async function deleteWarehouse(tenantId, warehouseId) {
  return destroyWithFallback({
    model: Warehouse,
    where: { tenant_id: tenantId, warehouse_id: warehouseId },
    onForeignKey: "Warehouse is in use",
  });
}

async function createSku(tenantId, body) {
  const skuId = await generatePrefixedId(Sku, "sku_id", "SKU");
  const row = await Sku.create({
    tenant_id: tenantId,
    sku_id: skuId,
    sku_code: requiredText(body?.sku_code, "SKU code"),
    description: requiredText(body?.description, "Description"),
    uom: requiredText(body?.uom, "UOM"),
    category: optionalText(body?.category),
    hazardous: optionalBoolean(body?.hazardous, false),
    weight: optionalNumber(body?.weight, "weight", { min: 0 }),
    dimensions: optionalText(body?.dimensions),
    reorder_point: optionalNumber(body?.reorder_point, "reorder_point", { min: 0, defaultValue: 0 }),
    reorder_qty: optionalNumber(body?.reorder_qty, "reorder_qty", { min: 0, defaultValue: 0 }),
    status: normalizeStatus(requiredText(body?.status, "Status")),
    qr_payload: optionalText(body?.qr_payload),
    rfid_epc: optionalText(body?.rfid_epc),
    created_at: now(),
    updated_at: now(),
  });
  return mapSku(plain(row));
}

async function updateSku(tenantId, skuId, body) {
  const updated = await updateById(Sku, { tenant_id: tenantId, sku_id: skuId }, {
    sku_code: requiredText(body?.sku_code, "SKU code"),
    description: requiredText(body?.description, "Description"),
    uom: requiredText(body?.uom, "UOM"),
    category: optionalText(body?.category),
    hazardous: optionalBoolean(body?.hazardous, false),
    weight: optionalNumber(body?.weight, "weight", { min: 0 }),
    dimensions: optionalText(body?.dimensions),
    reorder_point: optionalNumber(body?.reorder_point, "reorder_point", { min: 0, defaultValue: 0 }),
    reorder_qty: optionalNumber(body?.reorder_qty, "reorder_qty", { min: 0, defaultValue: 0 }),
    status: normalizeStatus(requiredText(body?.status, "Status")),
    qr_payload: optionalText(body?.qr_payload),
    rfid_epc: optionalText(body?.rfid_epc),
  });
  return mapSku(updated);
}

async function deleteSku(tenantId, skuId) {
  const row = await Sku.findOne({ where: { tenant_id: tenantId, sku_id: skuId } });
  if (!row) return null;
  if (await skuHasReferences(tenantId, skuId)) {
    const updated = await updateById(Sku, { tenant_id: tenantId, sku_id: skuId }, { status: "inactive" });
    return { row: updated, deletionMode: "soft" };
  }
  try {
    await row.destroy();
    return { row: plain(row), deletionMode: "hard" };
  } catch (error) {
    if (error?.name === "SequelizeForeignKeyConstraintError" || error?.parent?.code === "23503") {
      const updated = await updateById(Sku, { tenant_id: tenantId, sku_id: skuId }, { status: "inactive" });
      return { row: updated, deletionMode: "soft" };
    }
    throw error;
  }
}

async function createLocation(tenantId, warehouseId, body) {
  const locationType = requiredText(body?.location_type || "storage", "location_type").toLowerCase();
  const binId = optionalText(body?.bin_id);
  if (locationType === "storage" && !binId) {
    throw new ApiError(400, "VALIDATION_ERROR", "bin_id is required for storage locations");
  }
  if (binId) {
    const bin = await WarehouseBin.findOne({
      where: { tenant_id: tenantId, bin_id: binId },
      raw: true,
    });
    if (!bin) {
      throw new ApiError(400, "VALIDATION_ERROR", "Selected bin does not exist for this tenant");
    }
    const level = await requireLevel(tenantId, bin.level_id);
    const bay = await requireBay(tenantId, level.bay_id);
    const aisle = await requireAisle(tenantId, bay.aisle_id);
    const zone = await requireZone(tenantId, aisle.zone_id);
    if (zone.warehouse_id !== warehouseId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Selected bin does not belong to the current warehouse");
    }
    const existing = await Location.findOne({
      where: { tenant_id: tenantId, bin_id: binId },
      raw: true,
    });
    if (existing) {
      throw new ApiError(409, "DUPLICATE_STORAGE_LOCATION", "A storage location already exists for this bin.");
    }
  }
  const locationId = await generatePrefixedId(Location, "location_id", "LOC");
  const row = await Location.create({
    tenant_id: tenantId,
    location_id: locationId,
    warehouse_id: warehouseId,
    location_code: requiredText(body?.location_code, "location_code"),
    location_type: locationType,
    label: requiredText(body?.label || body?.location_code, "label"),
    zone: optionalText(body?.zone_id),
    aisle: optionalText(body?.aisle),
    rack: optionalText(body?.rack),
    bin: optionalText(body?.bin),
    bin_id: binId,
    is_default_receiving: optionalBoolean(body?.is_default_receiving, false),
    is_active: optionalBoolean(body?.is_active, true),
    created_at: now(),
    updated_at: now(),
  });
  return mapLocation(plain(row));
}

async function updateLocation(tenantId, locationId, warehouseId, body) {
  const updated = await updateById(Location, { tenant_id: tenantId, location_id: locationId }, {
    warehouse_id: warehouseId,
    location_code: body?.location_code !== undefined ? requiredText(body?.location_code, "location_code") : undefined,
    location_type: body?.location_type !== undefined ? requiredText(body?.location_type, "location_type").toLowerCase() : undefined,
    label: body?.label !== undefined ? requiredText(body?.label, "label") : undefined,
    zone: body?.zone_id !== undefined ? optionalText(body?.zone_id) : undefined,
    aisle: body?.aisle !== undefined ? optionalText(body?.aisle) : undefined,
    rack: body?.rack !== undefined ? optionalText(body?.rack) : undefined,
    bin: body?.bin !== undefined ? optionalText(body?.bin) : undefined,
    bin_id: body?.bin_id !== undefined ? optionalText(body?.bin_id) : undefined,
    is_default_receiving: body?.is_default_receiving !== undefined ? optionalBoolean(body?.is_default_receiving, false) : undefined,
    is_active: body?.is_active !== undefined ? optionalBoolean(body?.is_active, true) : undefined,
  });
  return mapLocation(updated);
}

async function deleteLocation(tenantId, locationId) {
  return destroyWithFallback({
    model: Location,
    where: { tenant_id: tenantId, location_id: locationId },
    onForeignKey: "Location is in use",
  });
}

async function lovGroupWithValues(tenantId, lovGroupId) {
  const row = await LovGroup.findOne({
    where: { tenant_id: tenantId, lov_group_id: lovGroupId },
    include: [{ model: LovValue, required: false }],
  });
  return mapLovGroup(row);
}

async function createLovGroup(tenantId, body) {
  const lovGroupId = await generatePrefixedId(LovGroup, "lov_group_id", "LVG");
  const row = await LovGroup.create({
    tenant_id: tenantId,
    lov_group_id: lovGroupId,
    group_code: requiredText(body?.group_code ?? body?.id, "group_code"),
    group_name: requiredText(body?.group_name ?? body?.name, "group_name"),
    description: optionalText(body?.description),
    is_system: body?.is_system === true,
    created_at: now(),
    updated_at: now(),
  });
  return lovGroupWithValues(tenantId, row.lov_group_id);
}

async function updateLovGroup(tenantId, lovGroupId, body) {
  const updated = await updateById(LovGroup, { tenant_id: tenantId, lov_group_id: lovGroupId }, {
    group_code: requiredText(body?.group_code ?? body?.id, "group_code"),
    group_name: requiredText(body?.group_name ?? body?.name, "group_name"),
    description: optionalText(body?.description),
  });
  if (!updated) return null;
  return lovGroupWithValues(tenantId, lovGroupId);
}

async function deleteLovGroup(tenantId, lovGroupId) {
  return destroyWithFallback({
    model: LovGroup,
    where: { tenant_id: tenantId, lov_group_id: lovGroupId },
    onForeignKey: "Lov group is in use",
  });
}

async function createLovValue(tenantId, lovGroupId, body) {
  const group = await LovGroup.findOne({ where: { tenant_id: tenantId, lov_group_id: lovGroupId } });
  if (!group) throw new ApiError(404, "LOV_GROUP_NOT_FOUND", "LOV group not found");
  const lovValueId = await generatePrefixedId(LovValue, "lov_value_id", "LVV");
  const row = await LovValue.create({
    tenant_id: tenantId,
    lov_value_id: lovValueId,
    lov_group_id: lovGroupId,
    value_code: requiredText(body?.value_code ?? body?.value, "value_code"),
    value_label: requiredText(body?.value_label ?? body?.label ?? body?.value, "value_label"),
    sort_order: Number.isInteger(body?.sort_order) ? body.sort_order : 0,
    is_active: body?.is_active !== false,
    created_at: now(),
    updated_at: now(),
  });
  return { ...plain(row), id: row.lov_value_id };
}

async function updateLovValue(tenantId, lovGroupId, lovValueId, body) {
  const updated = await updateById(LovValue, {
    tenant_id: tenantId,
    lov_group_id: lovGroupId,
    lov_value_id: lovValueId,
  }, {
    value_code: requiredText(body?.value_code ?? body?.value, "value_code"),
    value_label: requiredText(body?.value_label ?? body?.label ?? body?.value, "value_label"),
    sort_order: Number.isInteger(body?.sort_order) ? body.sort_order : 0,
    is_active: body?.is_active !== false,
  });
  if (!updated) return null;
  return { ...updated, id: updated.lov_value_id };
}

async function deleteLovValue(tenantId, lovGroupId, lovValueId) {
  const result = await destroyWithFallback({
    model: LovValue,
    where: { tenant_id: tenantId, lov_group_id: lovGroupId, lov_value_id: lovValueId },
    onForeignKey: "Lov value is in use",
  });
  if (!result) return null;
  return { ...result, row: { ...result.row, id: result.row.lov_value_id } };
}

async function requireWarehouse(tenantId, warehouseId, transaction) {
  const warehouse = await Warehouse.findOne({
    where: { tenant_id: tenantId, warehouse_id: warehouseId },
    transaction,
  });
  if (!warehouse) {
    throw new ApiError(400, "VALIDATION_ERROR", "Warehouse not found for this tenant");
  }
  return warehouse;
}

async function requireZone(tenantId, zoneId, transaction) {
  const zone = await WarehouseZone.findOne({
    where: { tenant_id: tenantId, zone_id: zoneId },
    transaction,
  });
  if (!zone) {
    throw new ApiError(400, "VALIDATION_ERROR", "Zone not found for this tenant");
  }
  return zone;
}

async function requireAisle(tenantId, aisleId, transaction) {
  const aisle = await WarehouseAisle.findOne({
    where: { tenant_id: tenantId, aisle_id: aisleId },
    transaction,
  });
  if (!aisle) {
    throw new ApiError(400, "VALIDATION_ERROR", "Aisle not found for this tenant");
  }
  return aisle;
}

async function requireBay(tenantId, bayId, transaction) {
  const bay = await WarehouseBay.findOne({
    where: { tenant_id: tenantId, bay_id: bayId },
    transaction,
  });
  if (!bay) {
    throw new ApiError(400, "VALIDATION_ERROR", "Bay not found for this tenant");
  }
  return bay;
}

async function requireLevel(tenantId, levelId, transaction) {
  const level = await WarehouseLevel.findOne({
    where: { tenant_id: tenantId, level_id: levelId },
    transaction,
  });
  if (!level) {
    throw new ApiError(400, "VALIDATION_ERROR", "Level not found for this tenant");
  }
  return level;
}

function validTaxonomyResource(resource) {
  return ["zones", "aisles", "bays", "levels", "bins"].includes(resource);
}

async function createTaxonomyResource(resource, tenantId, body) {
  if (!validTaxonomyResource(resource)) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Unknown taxonomy resource");
  }

  return sequelize.transaction(async (transaction) => {
    if (resource === "zones") {
      const warehouseId = requiredText(body?.warehouse_id, "Warehouse");
      await requireWarehouse(tenantId, warehouseId, transaction);
      const row = await WarehouseZone.create({
        tenant_id: tenantId,
        zone_id: await generatePrefixedId(WarehouseZone, "zone_id", "ZON"),
        warehouse_id: warehouseId,
        zone_code: requiredText(body?.zone_code, "Zone code"),
        zone_name: requiredText(body?.zone_name, "Zone name"),
        zone_type: requiredText(body?.zone_type || "storage", "Zone type"),
        status: normalizeStatus(requiredText(body?.status, "Status")),
        created_at: now(),
        updated_at: now(),
      }, { transaction });
      return plain(row);
    }

    if (resource === "aisles") {
      const zoneId = requiredText(body?.zone_id, "Zone");
      await requireZone(tenantId, zoneId, transaction);
      const row = await WarehouseAisle.create({
        tenant_id: tenantId,
        aisle_id: await generatePrefixedId(WarehouseAisle, "aisle_id", "AIS"),
        zone_id: zoneId,
        aisle_code: body?.aisle_code
          ? requiredText(body.aisle_code, "Aisle code")
          : await generateNumericCode(WarehouseAisle, { tenant_id: tenantId, zone_id: zoneId }, "aisle_code", 2, transaction),
        aisle_name: requiredText(body?.aisle_name, "Aisle name"),
        status: normalizeStatus(requiredText(body?.status, "Status")),
        created_at: now(),
        updated_at: now(),
      }, { transaction });
      return plain(row);
    }

    if (resource === "bays") {
      const aisleId = requiredText(body?.aisle_id, "Aisle");
      const aisle = await requireAisle(tenantId, aisleId, transaction);
      if (body?.zone_id && aisle.zone_id !== clean(body.zone_id)) {
        throw new ApiError(400, "VALIDATION_ERROR", "Aisle does not belong to the selected zone");
      }
      const row = await WarehouseBay.create({
        tenant_id: tenantId,
        bay_id: await generatePrefixedId(WarehouseBay, "bay_id", "BAY"),
        aisle_id: aisleId,
        bay_code: body?.bay_code
          ? requiredText(body.bay_code, "Bay code")
          : await generateNumericCode(WarehouseBay, { tenant_id: tenantId, aisle_id: aisleId }, "bay_code", 3, transaction),
        bay_name: requiredText(body?.bay_name, "Bay name"),
        width_cm: optionalNumber(body?.width_cm, "width_cm", { min: 0, defaultValue: 200 }),
        depth_cm: optionalNumber(body?.depth_cm, "depth_cm", { min: 0, defaultValue: 50 }),
        level_height_cm: optionalNumber(body?.level_height_cm, "level_height_cm", { min: 0, defaultValue: 50 }),
        level_count: optionalNumber(body?.level_count, "level_count", { min: 1, defaultValue: 4 }),
        max_weight_kg: optionalNumber(body?.max_weight_kg, "max_weight_kg", { min: 0, defaultValue: 500 }),
        status: normalizeStatus(requiredText(body?.status, "Status")),
        created_at: now(),
        updated_at: now(),
      }, { transaction });
      return plain(row);
    }

    if (resource === "levels") {
      const bayId = requiredText(body?.bay_id, "Bay");
      await requireBay(tenantId, bayId, transaction);
      const row = await WarehouseLevel.create({
        tenant_id: tenantId,
        level_id: await generatePrefixedId(WarehouseLevel, "level_id", "LVL"),
        bay_id: bayId,
        level_code: await generateCodeWithPrefix(WarehouseLevel, { tenant_id: tenantId, bay_id: bayId }, "level_code", "L", 2, transaction),
        status: normalizeStatus(requiredText(body?.status, "Status")),
        created_at: now(),
        updated_at: now(),
      }, { transaction });
      return plain(row);
    }

    const levelId = requiredText(body?.level_id, "Level");
    await requireLevel(tenantId, levelId, transaction);
    const row = await WarehouseBin.create({
      tenant_id: tenantId,
      bin_id: await generatePrefixedId(WarehouseBin, "bin_id", "BIN"),
      level_id: levelId,
      bin_code: await generateCodeWithPrefix(WarehouseBin, { tenant_id: tenantId, level_id: levelId }, "bin_code", "B", 3, transaction),
      max_weight: optionalNumber(body?.max_weight, "max_weight", { min: 0 }),
      max_volume: optionalNumber(body?.max_volume, "max_volume", { min: 0 }),
      status: normalizeStatus(requiredText(body?.status, "Status")),
      created_at: now(),
      updated_at: now(),
    }, { transaction });
    return plain(row);
  });
}

async function updateTaxonomyResource(resource, id, tenantId, body) {
  if (!validTaxonomyResource(resource)) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Unknown taxonomy resource");
  }

  return sequelize.transaction(async (transaction) => {
    if (resource === "zones") {
      const warehouseId = requiredText(body?.warehouse_id, "Warehouse");
      await requireWarehouse(tenantId, warehouseId, transaction);
      return updateById(WarehouseZone, { tenant_id: tenantId, zone_id: id }, {
        warehouse_id: warehouseId,
        zone_code: requiredText(body?.zone_code, "Zone code"),
        zone_name: requiredText(body?.zone_name, "Zone name"),
        zone_type: requiredText(body?.zone_type || "storage", "Zone type"),
        status: normalizeStatus(requiredText(body?.status, "Status")),
      }, { transaction });
    }

    if (resource === "aisles") {
      const zoneId = requiredText(body?.zone_id, "Zone");
      await requireZone(tenantId, zoneId, transaction);
      return updateById(WarehouseAisle, { tenant_id: tenantId, aisle_id: id }, {
        zone_id: zoneId,
        aisle_code: requiredText(body?.aisle_code, "Aisle code"),
        aisle_name: requiredText(body?.aisle_name, "Aisle name"),
        status: normalizeStatus(requiredText(body?.status, "Status")),
      }, { transaction });
    }

    if (resource === "bays") {
      const aisleId = requiredText(body?.aisle_id, "Aisle");
      const aisle = await requireAisle(tenantId, aisleId, transaction);
      if (body?.zone_id && aisle.zone_id !== clean(body.zone_id)) {
        throw new ApiError(400, "VALIDATION_ERROR", "Aisle does not belong to the selected zone");
      }
      return updateById(WarehouseBay, { tenant_id: tenantId, bay_id: id }, {
        aisle_id: aisleId,
        bay_code: requiredText(body?.bay_code, "Bay code"),
        bay_name: requiredText(body?.bay_name, "Bay name"),
        width_cm: optionalNumber(body?.width_cm, "width_cm", { min: 0, defaultValue: 200 }),
        depth_cm: optionalNumber(body?.depth_cm, "depth_cm", { min: 0, defaultValue: 50 }),
        level_height_cm: optionalNumber(body?.level_height_cm, "level_height_cm", { min: 0, defaultValue: 50 }),
        level_count: optionalNumber(body?.level_count, "level_count", { min: 1, defaultValue: 4 }),
        max_weight_kg: optionalNumber(body?.max_weight_kg, "max_weight_kg", { min: 0, defaultValue: 500 }),
        status: normalizeStatus(requiredText(body?.status, "Status")),
      }, { transaction });
    }

    if (resource === "levels") {
      const bayId = requiredText(body?.bay_id, "Bay");
      await requireBay(tenantId, bayId, transaction);
      return updateById(WarehouseLevel, { tenant_id: tenantId, level_id: id }, {
        bay_id: bayId,
        status: normalizeStatus(requiredText(body?.status, "Status")),
      }, { transaction });
    }

    const levelId = requiredText(body?.level_id, "Level");
    await requireLevel(tenantId, levelId, transaction);
    return updateById(WarehouseBin, { tenant_id: tenantId, bin_id: id }, {
      level_id: levelId,
      max_weight: optionalNumber(body?.max_weight, "max_weight", { min: 0 }),
      max_volume: optionalNumber(body?.max_volume, "max_volume", { min: 0 }),
      status: normalizeStatus(requiredText(body?.status, "Status")),
    }, { transaction });
  });
}

async function deleteTaxonomyResource(resource, id, tenantId) {
  if (!validTaxonomyResource(resource)) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Unknown taxonomy resource");
  }

  const config = {
    zones: {
      model: WarehouseZone,
      idField: "zone_id",
      label: "Zone",
      referenced: () => WarehouseAisle.count({ where: { tenant_id: tenantId, zone_id: id } }),
    },
    aisles: {
      model: WarehouseAisle,
      idField: "aisle_id",
      label: "Aisle",
      referenced: () => WarehouseBay.count({ where: { tenant_id: tenantId, aisle_id: id } }),
    },
    bays: {
      model: WarehouseBay,
      idField: "bay_id",
      label: "Bay",
      referenced: () => WarehouseLevel.count({ where: { tenant_id: tenantId, bay_id: id } }),
    },
    levels: {
      model: WarehouseLevel,
      idField: "level_id",
      label: "Level",
      referenced: () => WarehouseBin.count({ where: { tenant_id: tenantId, level_id: id } }),
    },
    bins: {
      model: WarehouseBin,
      idField: "bin_id",
      label: "Bin",
      referenced: () => Location.count({ where: { tenant_id: tenantId, bin_id: id } }),
    },
  }[resource];

  return sequelize.transaction(async (transaction) => {
    const row = await config.model.findOne({
      where: { tenant_id: tenantId, [config.idField]: id },
      transaction,
    });
    if (!row) return null;

    const rowData = plain(row);
    const referenceCount = await config.referenced();
    if (referenceCount > 0) {
      await row.update({ status: "inactive", updated_at: now() }, { transaction });
      return {
        row: { ...rowData, status: "inactive", updated_at: row.updated_at },
        deletionMode: "soft",
        label: config.label,
      };
    }

    try {
      await row.destroy({ transaction });
      return { row: rowData, deletionMode: "hard", label: config.label };
    } catch (error) {
      if (error?.name !== "SequelizeForeignKeyConstraintError" && error?.parent?.code !== "23503") {
        throw error;
      }
      await row.update({ status: "inactive", updated_at: now() }, { transaction });
      return {
        row: { ...rowData, status: "inactive", updated_at: row.updated_at },
        deletionMode: "soft",
        label: config.label,
      };
    }
  });
}

export {
  createSupplier,
  updateSupplier,
  deleteSupplier,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  createSku,
  updateSku,
  deleteSku,
  createLocation,
  updateLocation,
  deleteLocation,
  createLovGroup,
  updateLovGroup,
  deleteLovGroup,
  createLovValue,
  updateLovValue,
  deleteLovValue,
  lovGroupWithValues,
  createTaxonomyResource,
  updateTaxonomyResource,
  deleteTaxonomyResource,
};
