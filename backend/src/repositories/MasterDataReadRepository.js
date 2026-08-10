import { Op } from "sequelize";
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
import { ApiError } from "../utils/errors.js";

function requireTenantId(tenantId) {
  const normalized = String(tenantId ?? "").trim();
  if (!normalized) {
    throw new ApiError(403, "TENANT_CONTEXT_REQUIRED", "Tenant context is required");
  }
  return normalized;
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeSearch(value) {
  return clean(value).toLowerCase();
}

function normalizeStatus(value) {
  const status = clean(value).toLowerCase();
  if (!status) return "";
  if (!["active", "inactive"].includes(status)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Status must be active or inactive");
  }
  return status;
}

function getPlain(row) {
  return row?.get ? row.get({ plain: true }) : row;
}

function getAssociation(source, names) {
  for (const name of names) {
    if (source?.[name]) return source[name];
  }
  return null;
}

function getAssociationArray(source, names) {
  const value = getAssociation(source, names);
  return Array.isArray(value) ? value : [];
}

function paginateRows(rows, page, pageSize) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const offset = (safePage - 1) * pageSize;
  return {
    rows: rows.slice(offset, offset + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}

function includesSearch(values, search) {
  if (!search) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(search));
}

function buildLocationCode(...parts) {
  return parts.filter(Boolean).join("-");
}

function activeFlag(row) {
  return row?.status === "active" || row?.is_active === true;
}

function mapSupplier(row) {
  if (!row) return null;
  return {
    ...row,
    contact_person: row.contact_person || null,
    is_active: row.status === "active",
  };
}

function mapCustomer(row) {
  if (!row) return null;
  const contact = row.contact || row.email || null;
  return {
    ...row,
    contact,
    email: row.email || contact,
  };
}

function mapSku(row) {
  if (!row) return null;
  return { ...row };
}

function mapWarehouse(row) {
  if (!row) return null;
  return {
    ...row,
    is_active: row.status === "active",
  };
}

function mapLocation(row) {
  if (!row) return null;
  const bin = getAssociation(row, ["warehouseBin", "WarehouseBin", "bin"]);
  const level = bin ? getAssociation(bin, ["level", "WarehouseLevel"]) : null;
  const bay = level ? getAssociation(level, ["bay", "WarehouseBay"]) : null;
  const aisle = bay ? getAssociation(bay, ["aisle", "WarehouseAisle"]) : null;
  const zone = aisle ? getAssociation(aisle, ["zone", "WarehouseZone"]) : null;
  const warehouse = zone ? getAssociation(zone, ["warehouse", "Warehouse"]) : null;
  const displayName = bin
    ? buildLocationCode(
      warehouse?.warehouse_code,
      zone?.zone_code,
      aisle?.aisle_code,
      bay?.bay_code,
      level?.level_code,
      bin?.bin_code,
    )
    : clean(row.location_code) || clean(row.label) || row.location_id;

  return {
    tenant_id: row.tenant_id,
    location_id: row.location_id,
    location_code: row.location_code || displayName,
    location_type: row.location_type,
    warehouse_id: row.warehouse_id,
    bin_id: row.bin_id || null,
    zone_id: row.zone || null,
    status: row.is_active ? "active" : "inactive",
    display_name: displayName,
  };
}

function buildLocationDisplayName(location, context) {
  if (!location?.bin_id) {
    return clean(location?.location_code) || clean(location?.label) || location?.location_id;
  }

  const bin = context.binsById.get(location.bin_id) || null;
  const level = bin ? context.levelsById.get(bin.level_id) || null : null;
  const bay = level ? context.baysById.get(level.bay_id) || null : null;
  const aisle = bay ? context.aislesById.get(bay.aisle_id) || null : null;
  const zone = aisle ? context.zonesById.get(aisle.zone_id) || null : null;
  const warehouse = zone ? context.warehousesById.get(zone.warehouse_id) || null : null;

  return buildLocationCode(
    warehouse?.warehouse_code,
    zone?.zone_code,
    aisle?.aisle_code,
    bay?.bay_code,
    level?.level_code,
    bin?.bin_code,
  ) || clean(location?.location_code) || clean(location?.label) || location?.location_id;
}

async function loadLocationContext(scopedTenantId, locationRows) {
  const binIds = [...new Set(locationRows.map((row) => row.bin_id).filter(Boolean))];
  const bins = binIds.length
    ? await WarehouseBin.findAll({
        where: {
          tenant_id: scopedTenantId,
          bin_id: { [Op.in]: binIds },
        },
        raw: true,
      })
    : [];

  const levelIds = [...new Set(bins.map((row) => row.level_id).filter(Boolean))];
  const levels = levelIds.length
    ? await WarehouseLevel.findAll({
        where: {
          tenant_id: scopedTenantId,
          level_id: { [Op.in]: levelIds },
        },
        raw: true,
      })
    : [];

  const bayIds = [...new Set(levels.map((row) => row.bay_id).filter(Boolean))];
  const bays = bayIds.length
    ? await WarehouseBay.findAll({
        where: {
          tenant_id: scopedTenantId,
          bay_id: { [Op.in]: bayIds },
        },
        raw: true,
      })
    : [];

  const aisleIds = [...new Set(bays.map((row) => row.aisle_id).filter(Boolean))];
  const aisles = aisleIds.length
    ? await WarehouseAisle.findAll({
        where: {
          tenant_id: scopedTenantId,
          aisle_id: { [Op.in]: aisleIds },
        },
        raw: true,
      })
    : [];

  const zoneIds = [...new Set(aisles.map((row) => row.zone_id).filter(Boolean))];
  const zones = zoneIds.length
    ? await WarehouseZone.findAll({
        where: {
          tenant_id: scopedTenantId,
          zone_id: { [Op.in]: zoneIds },
        },
        raw: true,
      })
    : [];

  const warehouseIds = [...new Set(zones.map((row) => row.warehouse_id).filter(Boolean))];
  const warehouses = warehouseIds.length
    ? await Warehouse.findAll({
        where: {
          tenant_id: scopedTenantId,
          warehouse_id: { [Op.in]: warehouseIds },
        },
        raw: true,
      })
    : [];

  return {
    binsById: new Map(bins.map((row) => [row.bin_id, row])),
    levelsById: new Map(levels.map((row) => [row.level_id, row])),
    baysById: new Map(bays.map((row) => [row.bay_id, row])),
    aislesById: new Map(aisles.map((row) => [row.aisle_id, row])),
    zonesById: new Map(zones.map((row) => [row.zone_id, row])),
    warehousesById: new Map(warehouses.map((row) => [row.warehouse_id, row])),
  };
}

async function loadTaxonomyContext(scopedTenantId, resource, rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const uniqueIds = (field) => [...new Set(safeRows.map((row) => row[field]).filter(Boolean))];

  if (resource === "zones") {
    const warehouseIds = uniqueIds("warehouse_id");
    const warehouses = warehouseIds.length
      ? await Warehouse.findAll({
          where: {
            tenant_id: scopedTenantId,
            warehouse_id: { [Op.in]: warehouseIds },
          },
          raw: true,
        })
      : [];
    return { warehousesById: new Map(warehouses.map((row) => [row.warehouse_id, row])) };
  }

  if (resource === "aisles") {
    const zoneIds = uniqueIds("zone_id");
    const zones = zoneIds.length
      ? await WarehouseZone.findAll({
          where: {
            tenant_id: scopedTenantId,
            zone_id: { [Op.in]: zoneIds },
          },
          raw: true,
        })
      : [];
    const warehouseIds = [...new Set(zones.map((row) => row.warehouse_id).filter(Boolean))];
    const warehouses = warehouseIds.length
      ? await Warehouse.findAll({
          where: {
            tenant_id: scopedTenantId,
            warehouse_id: { [Op.in]: warehouseIds },
          },
          raw: true,
        })
      : [];
    return {
      zonesById: new Map(zones.map((row) => [row.zone_id, row])),
      warehousesById: new Map(warehouses.map((row) => [row.warehouse_id, row])),
    };
  }

  if (resource === "bays") {
    const aisleIds = uniqueIds("aisle_id");
    const aisles = aisleIds.length
      ? await WarehouseAisle.findAll({
          where: {
            tenant_id: scopedTenantId,
            aisle_id: { [Op.in]: aisleIds },
          },
          raw: true,
        })
      : [];
    const zoneIds = [...new Set(aisles.map((row) => row.zone_id).filter(Boolean))];
    const zones = zoneIds.length
      ? await WarehouseZone.findAll({
          where: {
            tenant_id: scopedTenantId,
            zone_id: { [Op.in]: zoneIds },
          },
          raw: true,
        })
      : [];
    const warehouseIds = [...new Set(zones.map((row) => row.warehouse_id).filter(Boolean))];
    const warehouses = warehouseIds.length
      ? await Warehouse.findAll({
          where: {
            tenant_id: scopedTenantId,
            warehouse_id: { [Op.in]: warehouseIds },
          },
          raw: true,
        })
      : [];
    return {
      aislesById: new Map(aisles.map((row) => [row.aisle_id, row])),
      zonesById: new Map(zones.map((row) => [row.zone_id, row])),
      warehousesById: new Map(warehouses.map((row) => [row.warehouse_id, row])),
    };
  }

  if (resource === "levels") {
    const bayIds = uniqueIds("bay_id");
    const bays = bayIds.length
      ? await WarehouseBay.findAll({
          where: {
            tenant_id: scopedTenantId,
            bay_id: { [Op.in]: bayIds },
          },
          raw: true,
        })
      : [];
    const aisleIds = [...new Set(bays.map((row) => row.aisle_id).filter(Boolean))];
    const aisles = aisleIds.length
      ? await WarehouseAisle.findAll({
          where: {
            tenant_id: scopedTenantId,
            aisle_id: { [Op.in]: aisleIds },
          },
          raw: true,
        })
      : [];
    const zoneIds = [...new Set(aisles.map((row) => row.zone_id).filter(Boolean))];
    const zones = zoneIds.length
      ? await WarehouseZone.findAll({
          where: {
            tenant_id: scopedTenantId,
            zone_id: { [Op.in]: zoneIds },
          },
          raw: true,
        })
      : [];
    const warehouseIds = [...new Set(zones.map((row) => row.warehouse_id).filter(Boolean))];
    const warehouses = warehouseIds.length
      ? await Warehouse.findAll({
          where: {
            tenant_id: scopedTenantId,
            warehouse_id: { [Op.in]: warehouseIds },
          },
          raw: true,
        })
      : [];
    return {
      baysById: new Map(bays.map((row) => [row.bay_id, row])),
      aislesById: new Map(aisles.map((row) => [row.aisle_id, row])),
      zonesById: new Map(zones.map((row) => [row.zone_id, row])),
      warehousesById: new Map(warehouses.map((row) => [row.warehouse_id, row])),
    };
  }

  if (resource === "bins") {
    const levelIds = uniqueIds("level_id");
    const levels = levelIds.length
      ? await WarehouseLevel.findAll({
          where: {
            tenant_id: scopedTenantId,
            level_id: { [Op.in]: levelIds },
          },
          raw: true,
        })
      : [];
    const bayIds = [...new Set(levels.map((row) => row.bay_id).filter(Boolean))];
    const bays = bayIds.length
      ? await WarehouseBay.findAll({
          where: {
            tenant_id: scopedTenantId,
            bay_id: { [Op.in]: bayIds },
          },
          raw: true,
        })
      : [];
    const aisleIds = [...new Set(bays.map((row) => row.aisle_id).filter(Boolean))];
    const aisles = aisleIds.length
      ? await WarehouseAisle.findAll({
          where: {
            tenant_id: scopedTenantId,
            aisle_id: { [Op.in]: aisleIds },
          },
          raw: true,
        })
      : [];
    const zoneIds = [...new Set(aisles.map((row) => row.zone_id).filter(Boolean))];
    const zones = zoneIds.length
      ? await WarehouseZone.findAll({
          where: {
            tenant_id: scopedTenantId,
            zone_id: { [Op.in]: zoneIds },
          },
          raw: true,
        })
      : [];
    const warehouseIds = [...new Set(zones.map((row) => row.warehouse_id).filter(Boolean))];
    const warehouses = warehouseIds.length
      ? await Warehouse.findAll({
          where: {
            tenant_id: scopedTenantId,
            warehouse_id: { [Op.in]: warehouseIds },
          },
          raw: true,
        })
      : [];
    return {
      levelsById: new Map(levels.map((row) => [row.level_id, row])),
      baysById: new Map(bays.map((row) => [row.bay_id, row])),
      aislesById: new Map(aisles.map((row) => [row.aisle_id, row])),
      zonesById: new Map(zones.map((row) => [row.zone_id, row])),
      warehousesById: new Map(warehouses.map((row) => [row.warehouse_id, row])),
    };
  }

  return {};
}

function mapZoneRaw(row, context) {
  if (!row) return null;
  const warehouse = context.warehousesById?.get(row.warehouse_id) || null;
  return {
    ...row,
    warehouse_code: warehouse?.warehouse_code || null,
    warehouse_name: warehouse?.warehouse_name || null,
    location_code: buildLocationCode(warehouse?.warehouse_code, row.zone_code),
  };
}

function mapAisleRaw(row, context) {
  if (!row) return null;
  const zone = context.zonesById?.get(row.zone_id) || null;
  const warehouse = zone ? context.warehousesById?.get(zone.warehouse_id) || null : null;
  return {
    ...row,
    zone_name: zone?.zone_name || null,
    zone_code: zone?.zone_code || null,
    warehouse_id: zone?.warehouse_id || null,
    warehouse_code: warehouse?.warehouse_code || null,
    location_code: buildLocationCode(warehouse?.warehouse_code, zone?.zone_code, row.aisle_code),
  };
}

function mapBayRaw(row, context) {
  if (!row) return null;
  const aisle = context.aislesById?.get(row.aisle_id) || null;
  const zone = aisle ? context.zonesById?.get(aisle.zone_id) || null : null;
  const warehouse = zone ? context.warehousesById?.get(zone.warehouse_id) || null : null;
  return {
    ...row,
    aisle_name: aisle?.aisle_name || null,
    aisle_code: aisle?.aisle_code || null,
    zone_id: zone?.zone_id || null,
    zone_code: zone?.zone_code || null,
    zone_name: zone?.zone_name || null,
    warehouse_id: zone?.warehouse_id || null,
    warehouse_code: warehouse?.warehouse_code || null,
    location_code: buildLocationCode(warehouse?.warehouse_code, zone?.zone_code, aisle?.aisle_code, row.bay_code),
  };
}

function mapLevelRaw(row, context) {
  if (!row) return null;
  const bay = context.baysById?.get(row.bay_id) || null;
  const aisle = bay ? context.aislesById?.get(bay.aisle_id) || null : null;
  const zone = aisle ? context.zonesById?.get(aisle.zone_id) || null : null;
  const warehouse = zone ? context.warehousesById?.get(zone.warehouse_id) || null : null;
  return {
    ...row,
    bay_code: bay?.bay_code || null,
    bay_name: bay?.bay_name || null,
    aisle_id: aisle?.aisle_id || null,
    aisle_code: aisle?.aisle_code || null,
    aisle_name: aisle?.aisle_name || null,
    zone_id: zone?.zone_id || null,
    zone_code: zone?.zone_code || null,
    zone_name: zone?.zone_name || null,
    warehouse_id: zone?.warehouse_id || null,
    warehouse_code: warehouse?.warehouse_code || null,
    location_code: buildLocationCode(
      warehouse?.warehouse_code,
      zone?.zone_code,
      aisle?.aisle_code,
      bay?.bay_code,
      row.level_code,
    ),
  };
}

function mapBinRaw(row, context) {
  if (!row) return null;
  const level = context.levelsById?.get(row.level_id) || null;
  const bay = level ? context.baysById?.get(level.bay_id) || null : null;
  const aisle = bay ? context.aislesById?.get(bay.aisle_id) || null : null;
  const zone = aisle ? context.zonesById?.get(aisle.zone_id) || null : null;
  const warehouse = zone ? context.warehousesById?.get(zone.warehouse_id) || null : null;
  return {
    ...row,
    level_code: level?.level_code || null,
    bay_id: bay?.bay_id || null,
    bay_code: bay?.bay_code || null,
    bay_name: bay?.bay_name || null,
    aisle_id: aisle?.aisle_id || null,
    aisle_code: aisle?.aisle_code || null,
    aisle_name: aisle?.aisle_name || null,
    zone_id: zone?.zone_id || null,
    zone_code: zone?.zone_code || null,
    zone_name: zone?.zone_name || null,
    warehouse_id: zone?.warehouse_id || null,
    warehouse_code: warehouse?.warehouse_code || null,
    location_code: buildLocationCode(
      warehouse?.warehouse_code,
      zone?.zone_code,
      aisle?.aisle_code,
      bay?.bay_code,
      level?.level_code,
      row.bin_code,
    ),
  };
}

function mapZone(row) {
  const zone = getPlain(row);
  const warehouse = getAssociation(zone, ["Warehouse", "warehouse"]);
  const locationCode = buildLocationCode(warehouse?.warehouse_code, zone.zone_code);
  return {
    ...zone,
    warehouse_code: warehouse?.warehouse_code || null,
    warehouse_name: warehouse?.warehouse_name || null,
    location_code: locationCode,
  };
}

function mapAisle(row) {
  const aisle = getPlain(row);
  const zone = getAssociation(aisle, ["WarehouseZone", "zone"]);
  const warehouse = zone ? getAssociation(zone, ["Warehouse", "warehouse"]) : null;
  const locationCode = buildLocationCode(warehouse?.warehouse_code, zone?.zone_code, aisle.aisle_code);
  return {
    ...aisle,
    zone_name: zone?.zone_name || null,
    zone_code: zone?.zone_code || null,
    warehouse_id: zone?.warehouse_id || null,
    warehouse_code: warehouse?.warehouse_code || null,
    location_code: locationCode,
  };
}

function mapBay(row) {
  const bay = getPlain(row);
  const aisle = getAssociation(bay, ["WarehouseAisle", "aisle"]);
  const zone = aisle ? getAssociation(aisle, ["WarehouseZone", "zone"]) : null;
  const warehouse = zone ? getAssociation(zone, ["Warehouse", "warehouse"]) : null;
  const locationCode = buildLocationCode(warehouse?.warehouse_code, zone?.zone_code, aisle?.aisle_code, bay.bay_code);
  return {
    ...bay,
    aisle_name: aisle?.aisle_name || null,
    aisle_code: aisle?.aisle_code || null,
    zone_id: zone?.zone_id || null,
    zone_code: zone?.zone_code || null,
    zone_name: zone?.zone_name || null,
    warehouse_id: zone?.warehouse_id || null,
    warehouse_code: warehouse?.warehouse_code || null,
    location_code: locationCode,
  };
}

function mapLevel(row) {
  const level = getPlain(row);
  const bay = getAssociation(level, ["WarehouseBay", "bay"]);
  const aisle = bay ? getAssociation(bay, ["WarehouseAisle", "aisle"]) : null;
  const zone = aisle ? getAssociation(aisle, ["WarehouseZone", "zone"]) : null;
  const warehouse = zone ? getAssociation(zone, ["Warehouse", "warehouse"]) : null;
  const locationCode = buildLocationCode(
    warehouse?.warehouse_code,
    zone?.zone_code,
    aisle?.aisle_code,
    bay?.bay_code,
    level.level_code,
  );
  return {
    ...level,
    bay_name: bay?.bay_name || null,
    bay_code: bay?.bay_code || null,
    aisle_id: aisle?.aisle_id || null,
    aisle_code: aisle?.aisle_code || null,
    aisle_name: aisle?.aisle_name || null,
    zone_id: zone?.zone_id || null,
    zone_code: zone?.zone_code || null,
    zone_name: zone?.zone_name || null,
    warehouse_id: zone?.warehouse_id || null,
    warehouse_code: warehouse?.warehouse_code || null,
    location_code: locationCode,
  };
}

function mapBin(row) {
  const bin = getPlain(row);
  const level = getAssociation(bin, ["WarehouseLevel", "level"]);
  const bay = level ? getAssociation(level, ["WarehouseBay", "bay"]) : null;
  const aisle = bay ? getAssociation(bay, ["WarehouseAisle", "aisle"]) : null;
  const zone = aisle ? getAssociation(aisle, ["WarehouseZone", "zone"]) : null;
  const warehouse = zone ? getAssociation(zone, ["Warehouse", "warehouse"]) : null;
  const locationCode = buildLocationCode(
    warehouse?.warehouse_code,
    zone?.zone_code,
    aisle?.aisle_code,
    bay?.bay_code,
    level?.level_code,
    bin.bin_code,
  );
  return {
    ...bin,
    level_code: level?.level_code || null,
    bay_id: bay?.bay_id || null,
    bay_code: bay?.bay_code || null,
    bay_name: bay?.bay_name || null,
    aisle_id: aisle?.aisle_id || null,
    aisle_code: aisle?.aisle_code || null,
    aisle_name: aisle?.aisle_name || null,
    zone_id: zone?.zone_id || null,
    zone_code: zone?.zone_code || null,
    zone_name: zone?.zone_name || null,
    warehouse_id: zone?.warehouse_id || null,
    warehouse_code: warehouse?.warehouse_code || null,
    location_code: locationCode,
  };
}

function mapLovGroup(row) {
  if (!row) return null;
  const group = getPlain(row);
  const values = getAssociationArray(group, ["LovValues", "values", "LovValue"]);
  return {
    ...group,
    values: values
      .map((value) => {
        const plain = getPlain(value);
        return {
          ...plain,
          id: plain.lov_value_id,
        };
      })
      .sort((left, right) => {
        const leftSort = Number(left.sort_order ?? 0);
        const rightSort = Number(right.sort_order ?? 0);
        if (leftSort !== rightSort) return leftSort - rightSort;
        return String(left.value_label || "").localeCompare(String(right.value_label || ""));
      }),
    usedIn: Array.isArray(group.usedIn) ? group.usedIn : Array.isArray(group.used_in) ? group.used_in : [],
  };
}

function sortByCode(rows, codeField) {
  return [...rows].sort((left, right) => String(left?.[codeField] || "").localeCompare(String(right?.[codeField] || "")));
}

function sortTree(rows) {
  return [...rows].sort((left, right) => String(left.warehouse_code || left.warehouse_name || left.warehouse_id || "").localeCompare(String(right.warehouse_code || right.warehouse_name || right.warehouse_id || "")));
}

async function listSuppliers({ tenantId, search = "", page = 1, pageSize = 20 }) {
  const scopedTenantId = requireTenantId(tenantId);
  const normalizedSearch = normalizeSearch(search);
  const { rows, count } = await Supplier.findAndCountAll({
    where: {
      tenant_id: scopedTenantId,
      ...(normalizedSearch
        ? {
            [Op.or]: [
              { supplier_name: { [Op.iLike]: `%${normalizedSearch}%` } },
              { supplier_code: { [Op.iLike]: `%${normalizedSearch}%` } },
              { email: { [Op.iLike]: `%${normalizedSearch}%` } },
              { phone: { [Op.iLike]: `%${normalizedSearch}%` } },
            ],
          }
        : {}),
    },
    order: [["supplier_name", "ASC"]],
    offset: (page - 1) * pageSize,
    limit: pageSize,
    distinct: true,
  });
  return {
    rows: rows.map((row) => mapSupplier(getPlain(row))),
    total: count,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(count / pageSize)),
  };
}

async function getSupplier({ tenantId, supplierId }) {
  const scopedTenantId = requireTenantId(tenantId);
  const row = await Supplier.findOne({
    where: { tenant_id: scopedTenantId, supplier_id: supplierId },
  });
  return mapSupplier(getPlain(row));
}

async function listSkus({ tenantId, search = "", status = "", page = 1, pageSize = 20 }) {
  const scopedTenantId = requireTenantId(tenantId);
  const normalizedSearch = normalizeSearch(search);
  const normalizedStatus = normalizeStatus(status);
  const where = { tenant_id: scopedTenantId };
  if (normalizedStatus) where.status = normalizedStatus;
  if (normalizedSearch) {
    where[Op.or] = [
      { sku_code: { [Op.iLike]: `%${normalizedSearch}%` } },
      { description: { [Op.iLike]: `%${normalizedSearch}%` } },
    ];
  }
  const result = await Sku.findAndCountAll({
    where,
    order: [["sku_id", "ASC"]],
    offset: (page - 1) * pageSize,
    limit: pageSize,
    distinct: true,
  });
  return {
    rows: result.rows.map((row) => mapSku(getPlain(row))),
    total: result.count,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(result.count / pageSize)),
  };
}

async function lookupSkus({ tenantId, search = "" }) {
  const scopedTenantId = requireTenantId(tenantId);
  const normalizedSearch = normalizeSearch(search);
  const where = {
    tenant_id: scopedTenantId,
    status: "active",
  };
  if (normalizedSearch) {
    where[Op.or] = [
      { sku_code: { [Op.iLike]: `%${normalizedSearch}%` } },
      { description: { [Op.iLike]: `%${normalizedSearch}%` } },
    ];
  }
  const rows = await Sku.findAll({
    where,
    attributes: ["sku_id", "sku_code", "description", "uom", "status"],
    order: [["sku_code", "ASC"], ["description", "ASC"]],
    limit: 25,
  });
  return rows.map((row) => getPlain(row));
}

async function getSku({ tenantId, skuId }) {
  const scopedTenantId = requireTenantId(tenantId);
  const row = await Sku.findOne({
    where: { tenant_id: scopedTenantId, sku_id: skuId },
  });
  return mapSku(getPlain(row));
}

async function listWarehouses({ tenantId, search = "" }) {
  const scopedTenantId = requireTenantId(tenantId);
  const normalizedSearch = normalizeSearch(search);
  const rows = await Warehouse.findAll({
    where: {
      tenant_id: scopedTenantId,
      ...(normalizedSearch
        ? {
            [Op.or]: [
              { warehouse_id: { [Op.iLike]: `%${normalizedSearch}%` } },
              { warehouse_code: { [Op.iLike]: `%${normalizedSearch}%` } },
              { warehouse_name: { [Op.iLike]: `%${normalizedSearch}%` } },
              { city: { [Op.iLike]: `%${normalizedSearch}%` } },
              { country: { [Op.iLike]: `%${normalizedSearch}%` } },
            ],
          }
        : {}),
    },
    order: [["warehouse_name", "ASC"]],
  });
  return rows.map((row) => mapWarehouse(getPlain(row)));
}

async function getWarehouse({ tenantId, warehouseId }) {
  const scopedTenantId = requireTenantId(tenantId);
  const row = await Warehouse.findOne({
    where: { tenant_id: scopedTenantId, warehouse_id: warehouseId },
  });
  return mapWarehouse(getPlain(row));
}

async function listCustomers({ tenantId, search = "", page = 1, pageSize = 20 }) {
  const scopedTenantId = requireTenantId(tenantId);
  const normalizedSearch = normalizeSearch(search);
  const result = await Customer.findAndCountAll({
    where: {
      tenant_id: scopedTenantId,
      ...(normalizedSearch
        ? {
            [Op.or]: [
              { customer_name: { [Op.iLike]: `%${normalizedSearch}%` } },
              { customer_code: { [Op.iLike]: `%${normalizedSearch}%` } },
              { email: { [Op.iLike]: `%${normalizedSearch}%` } },
              { phone: { [Op.iLike]: `%${normalizedSearch}%` } },
            ],
          }
        : {}),
    },
    order: [["customer_name", "ASC"]],
    offset: (page - 1) * pageSize,
    limit: pageSize,
    distinct: true,
  });
  return {
    rows: result.rows.map((row) => mapCustomer(getPlain(row))),
    total: result.count,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(result.count / pageSize)),
  };
}

async function getCustomer({ tenantId, customerId }) {
  const scopedTenantId = requireTenantId(tenantId);
  const row = await Customer.findOne({
    where: { tenant_id: scopedTenantId, customer_id: customerId },
  });
  return mapCustomer(getPlain(row));
}

async function loadLocations({ tenantId, warehouseId = "", search = "", activeOnly = false }) {
  const scopedTenantId = requireTenantId(tenantId);
  const normalizedWarehouseId = clean(warehouseId);
  const normalizedSearch = normalizeSearch(search);

  const rows = await Location.findAll({
    where: {
      tenant_id: scopedTenantId,
      ...(normalizedWarehouseId ? { warehouse_id: normalizedWarehouseId } : {}),
      ...(activeOnly ? { is_active: true } : {}),
    },
    order: [["location_code", "ASC"], ["location_id", "ASC"]],
    raw: true,
  });

  const context = await loadLocationContext(scopedTenantId, rows);
  const mapped = rows.map((row) => ({
    tenant_id: row.tenant_id,
    location_id: row.location_id,
    location_code: row.location_code || null,
    location_type: row.location_type,
    warehouse_id: row.warehouse_id,
    bin_id: row.bin_id || null,
    zone_id: row.zone || null,
    status: row.is_active ? "active" : "inactive",
    display_name: buildLocationDisplayName(row, context),
  }));
  const filtered = normalizedSearch
    ? mapped.filter((row) => includesSearch([
        row.location_id,
        row.location_code,
        row.display_name,
        row.location_type,
      ], normalizedSearch))
    : mapped;

  return sortByCode(filtered, "location_code");
}

async function lookupLocations({ tenantId, warehouseId = "", search = "", type = "" }) {
  const locations = await loadLocations({ tenantId, warehouseId, search, activeOnly: true });
  const normalizedType = clean(type).toLowerCase();
  const filtered = normalizedType
    ? locations.filter((row) => row.location_type === normalizedType)
    : locations;
  return filtered.slice(0, 100);
}

async function listPortalLocations({ tenantId, warehouseId = "", search = "", type = "", page = 1, pageSize = 20 }) {
  const locations = await loadLocations({ tenantId, warehouseId, search });
  const normalizedType = clean(type).toLowerCase();
  const filtered = normalizedType
    ? locations.filter((row) => row.location_type === normalizedType)
    : locations;
  return paginateRows(filtered, page, pageSize);
}

async function listMasterLocations({ tenantId, warehouseId = "" }) {
  const locations = await loadLocations({ tenantId, warehouseId });
  return locations;
}

async function listWarehouseTree({ tenantId, search = "", page = 1, pageSize = 10 }) {
  const scopedTenantId = requireTenantId(tenantId);
  const normalizedSearch = normalizeSearch(search);
  const [warehouses, zones, aisles, bays, levels, bins] = await Promise.all([
    Warehouse.findAll({
      where: { tenant_id: scopedTenantId },
      raw: true,
      order: [["warehouse_code", "ASC"], ["warehouse_id", "ASC"]],
    }),
    WarehouseZone.findAll({
      where: { tenant_id: scopedTenantId },
      raw: true,
      order: [["zone_code", "ASC"], ["zone_id", "ASC"]],
    }),
    WarehouseAisle.findAll({
      where: { tenant_id: scopedTenantId },
      raw: true,
      order: [["aisle_code", "ASC"], ["aisle_id", "ASC"]],
    }),
    WarehouseBay.findAll({
      where: { tenant_id: scopedTenantId },
      raw: true,
      order: [["bay_code", "ASC"], ["bay_id", "ASC"]],
    }),
    WarehouseLevel.findAll({
      where: { tenant_id: scopedTenantId },
      raw: true,
      order: [["level_code", "ASC"], ["level_id", "ASC"]],
    }),
    WarehouseBin.findAll({
      where: { tenant_id: scopedTenantId },
      raw: true,
      order: [["bin_code", "ASC"], ["bin_id", "ASC"]],
    }),
  ]);

  const warehousesById = new Map(warehouses.map((row) => [row.warehouse_id, row]));
  const zonesByWarehouse = new Map();
  for (const row of zones) {
    if (!zonesByWarehouse.has(row.warehouse_id)) zonesByWarehouse.set(row.warehouse_id, []);
    zonesByWarehouse.get(row.warehouse_id).push({
      ...row,
      warehouse_code: warehousesById.get(row.warehouse_id)?.warehouse_code || null,
      warehouse_name: warehousesById.get(row.warehouse_id)?.warehouse_name || null,
      location_code: buildLocationCode(warehousesById.get(row.warehouse_id)?.warehouse_code, row.zone_code),
    });
  }

  const aislesByZone = new Map();
  for (const row of aisles) {
    const zone = zones.find((candidate) => candidate.zone_id === row.zone_id) || null;
    const warehouse = zone ? warehousesById.get(zone.warehouse_id) || null : null;
    if (!aislesByZone.has(row.zone_id)) aislesByZone.set(row.zone_id, []);
    aislesByZone.get(row.zone_id).push({
      ...row,
      zone_name: zone?.zone_name || null,
      zone_code: zone?.zone_code || null,
      warehouse_id: zone?.warehouse_id || null,
      warehouse_code: warehouse?.warehouse_code || null,
      location_code: buildLocationCode(warehouse?.warehouse_code, zone?.zone_code, row.aisle_code),
    });
  }

  const baysByAisle = new Map();
  for (const row of bays) {
    const aisle = aisles.find((candidate) => candidate.aisle_id === row.aisle_id) || null;
    const zone = aisle ? zones.find((candidate) => candidate.zone_id === aisle.zone_id) || null : null;
    const warehouse = zone ? warehousesById.get(zone.warehouse_id) || null : null;
    if (!baysByAisle.has(row.aisle_id)) baysByAisle.set(row.aisle_id, []);
    baysByAisle.get(row.aisle_id).push({
      ...row,
      aisle_name: aisle?.aisle_name || null,
      aisle_code: aisle?.aisle_code || null,
      zone_id: zone?.zone_id || null,
      zone_code: zone?.zone_code || null,
      zone_name: zone?.zone_name || null,
      warehouse_id: zone?.warehouse_id || null,
      warehouse_code: warehouse?.warehouse_code || null,
      location_code: buildLocationCode(warehouse?.warehouse_code, zone?.zone_code, aisle?.aisle_code, row.bay_code),
    });
  }

  const levelsByBay = new Map();
  for (const row of levels) {
    const bay = bays.find((candidate) => candidate.bay_id === row.bay_id) || null;
    const aisle = bay ? aisles.find((candidate) => candidate.aisle_id === bay.aisle_id) || null : null;
    const zone = aisle ? zones.find((candidate) => candidate.zone_id === aisle.zone_id) || null : null;
    const warehouse = zone ? warehousesById.get(zone.warehouse_id) || null : null;
    if (!levelsByBay.has(row.bay_id)) levelsByBay.set(row.bay_id, []);
    levelsByBay.get(row.bay_id).push({
      ...row,
      bay_code: bay?.bay_code || null,
      bay_name: bay?.bay_name || null,
      aisle_id: aisle?.aisle_id || null,
      aisle_code: aisle?.aisle_code || null,
      aisle_name: aisle?.aisle_name || null,
      zone_id: zone?.zone_id || null,
      zone_code: zone?.zone_code || null,
      zone_name: zone?.zone_name || null,
      warehouse_id: zone?.warehouse_id || null,
      warehouse_code: warehouse?.warehouse_code || null,
      location_code: buildLocationCode(
        warehouse?.warehouse_code,
        zone?.zone_code,
        aisle?.aisle_code,
        bay?.bay_code,
        row.level_code,
      ),
    });
  }

  const binsByLevel = new Map();
  for (const row of bins) {
    const level = levels.find((candidate) => candidate.level_id === row.level_id) || null;
    const bay = level ? bays.find((candidate) => candidate.bay_id === level.bay_id) || null : null;
    const aisle = bay ? aisles.find((candidate) => candidate.aisle_id === bay.aisle_id) || null : null;
    const zone = aisle ? zones.find((candidate) => candidate.zone_id === aisle.zone_id) || null : null;
    const warehouse = zone ? warehousesById.get(zone.warehouse_id) || null : null;
    if (!binsByLevel.has(row.level_id)) binsByLevel.set(row.level_id, []);
    binsByLevel.get(row.level_id).push({
      ...row,
      level_code: level?.level_code || null,
      bay_id: bay?.bay_id || null,
      bay_code: bay?.bay_code || null,
      bay_name: bay?.bay_name || null,
      aisle_id: aisle?.aisle_id || null,
      aisle_code: aisle?.aisle_code || null,
      aisle_name: aisle?.aisle_name || null,
      zone_id: zone?.zone_id || null,
      zone_code: zone?.zone_code || null,
      zone_name: zone?.zone_name || null,
      warehouse_id: zone?.warehouse_id || null,
      warehouse_code: warehouse?.warehouse_code || null,
      location_code: buildLocationCode(
        warehouse?.warehouse_code,
        zone?.zone_code,
        aisle?.aisle_code,
        bay?.bay_code,
        level?.level_code,
        row.bin_code,
      ),
    });
  }

  const mapped = warehouses.map((warehouse) => ({
    ...warehouse,
    zones: sortByCode(
      (zonesByWarehouse.get(warehouse.warehouse_id) || []).map((zone) => ({
        ...zone,
        aisles: sortByCode(
          (aislesByZone.get(zone.zone_id) || []).map((aisle) => ({
            ...aisle,
            bays: sortByCode(
              (baysByAisle.get(aisle.aisle_id) || []).map((bay) => ({
                ...bay,
                levels: sortByCode(
                  (levelsByBay.get(bay.bay_id) || []).map((level) => ({
                    ...level,
                    bins: sortByCode(binsByLevel.get(level.level_id) || [], "bin_code"),
                  })),
                  "level_code",
                ),
              })),
              "bay_code",
            ),
          })),
          "aisle_code",
        ),
      })),
      "zone_code",
    ),
  }));

  const filtered = normalizedSearch
    ? mapped.filter((warehouse) => includesSearch([
        warehouse.warehouse_id,
        warehouse.warehouse_code,
        warehouse.warehouse_name,
        warehouse.status,
        JSON.stringify(warehouse.zones || []),
      ], normalizedSearch))
    : mapped;

  return paginateRows(sortTree(filtered), page, pageSize);
}

async function listTaxonomyResource(resource, { tenantId, warehouseId = "", zoneId = "", aisleId = "", bayId = "", levelId = "", search = "", status = "", page = 1, pageSize = 20 }) {
  const scopedTenantId = requireTenantId(tenantId);
  const normalizedSearch = normalizeSearch(search);
  const normalizedStatus = clean(status) ? normalizeStatus(status) : "";
  const configs = {
    zones: {
      fetchRows: () => WarehouseZone.findAll({
        where: {
          tenant_id: scopedTenantId,
          ...(clean(warehouseId) ? { warehouse_id: clean(warehouseId) } : {}),
          ...(normalizedStatus ? { status: normalizedStatus } : {}),
        },
        raw: true,
        order: [["zone_code", "ASC"], ["zone_id", "ASC"]],
      }),
      loadContext: async (rows) => loadTaxonomyContext(scopedTenantId, "zones", rows),
      map: mapZoneRaw,
      searchFields: (row) => [
        row.zone_id,
        row.zone_code,
        row.zone_name,
        row.zone_type,
        row.status,
        row.warehouse_code,
        row.location_code,
      ],
      sortField: "zone_code",
    },
    aisles: {
      fetchRows: () => WarehouseAisle.findAll({
        where: {
          tenant_id: scopedTenantId,
          ...(clean(zoneId) ? { zone_id: clean(zoneId) } : {}),
          ...(normalizedStatus ? { status: normalizedStatus } : {}),
        },
        raw: true,
        order: [["aisle_code", "ASC"], ["aisle_id", "ASC"]],
      }),
      loadContext: async (rows) => loadTaxonomyContext(scopedTenantId, "aisles", rows),
      map: mapAisleRaw,
      searchFields: (row) => [
        row.aisle_id,
        row.aisle_code,
        row.aisle_name,
        row.status,
        row.zone_name,
        row.location_code,
      ],
      sortField: "aisle_code",
    },
    bays: {
      fetchRows: () => WarehouseBay.findAll({
        where: {
          tenant_id: scopedTenantId,
          ...(clean(aisleId) ? { aisle_id: clean(aisleId) } : {}),
          ...(normalizedStatus ? { status: normalizedStatus } : {}),
        },
        raw: true,
        order: [["bay_code", "ASC"], ["bay_id", "ASC"]],
      }),
      loadContext: async (rows) => loadTaxonomyContext(scopedTenantId, "bays", rows),
      map: mapBayRaw,
      searchFields: (row) => [
        row.bay_id,
        row.bay_code,
        row.bay_name,
        row.status,
        row.aisle_name,
        row.zone_name,
        row.location_code,
      ],
      sortField: "bay_code",
    },
    levels: {
      fetchRows: () => WarehouseLevel.findAll({
        where: {
          tenant_id: scopedTenantId,
          ...(clean(bayId) ? { bay_id: clean(bayId) } : {}),
          ...(normalizedStatus ? { status: normalizedStatus } : {}),
        },
        raw: true,
        order: [["level_code", "ASC"], ["level_id", "ASC"]],
      }),
      loadContext: async (rows) => loadTaxonomyContext(scopedTenantId, "levels", rows),
      map: mapLevelRaw,
      searchFields: (row) => [
        row.level_id,
        row.level_code,
        row.status,
        row.bay_name,
        row.aisle_name,
        row.zone_name,
        row.location_code,
      ],
      sortField: "level_code",
    },
    bins: {
      fetchRows: () => WarehouseBin.findAll({
        where: {
          tenant_id: scopedTenantId,
          ...(clean(levelId) ? { level_id: clean(levelId) } : {}),
          ...(normalizedStatus ? { status: normalizedStatus } : {}),
        },
        raw: true,
        order: [["bin_code", "ASC"], ["bin_id", "ASC"]],
      }),
      loadContext: async (rows) => loadTaxonomyContext(scopedTenantId, "bins", rows),
      map: mapBinRaw,
      searchFields: (row) => [
        row.bin_id,
        row.bin_code,
        row.status,
        row.level_code,
        row.bay_name,
        row.aisle_name,
        row.zone_name,
        row.location_code,
      ],
      sortField: "bin_code",
    },
  };

  const config = configs[resource];
  if (!config) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Unknown taxonomy resource");
  }

  let rows = await config.fetchRows();

  const context = await config.loadContext(rows);
  const mapped = rows.map((row) => config.map(row, context)).filter(Boolean);
  const scoped = mapped.filter((row) => {
    if (resource === "zones") {
      if (clean(warehouseId) && row.warehouse_id !== clean(warehouseId)) return false;
    }
    if (resource === "aisles") {
      if (clean(zoneId) && row.zone_id !== clean(zoneId)) return false;
      if (clean(warehouseId) && row.warehouse_id !== clean(warehouseId)) return false;
    }
    if (resource === "bays") {
      if (clean(aisleId) && row.aisle_id !== clean(aisleId)) return false;
      if (clean(zoneId) && row.zone_id !== clean(zoneId)) return false;
      if (clean(warehouseId) && row.warehouse_id !== clean(warehouseId)) return false;
    }
    if (resource === "levels") {
      if (clean(bayId) && row.bay_id !== clean(bayId)) return false;
      if (clean(aisleId) && row.aisle_id !== clean(aisleId)) return false;
      if (clean(zoneId) && row.zone_id !== clean(zoneId)) return false;
      if (clean(warehouseId) && row.warehouse_id !== clean(warehouseId)) return false;
    }
    if (resource === "bins") {
      if (clean(levelId) && row.level_id !== clean(levelId)) return false;
      if (clean(bayId) && row.bay_id !== clean(bayId)) return false;
      if (clean(aisleId) && row.aisle_id !== clean(aisleId)) return false;
      if (clean(zoneId) && row.zone_id !== clean(zoneId)) return false;
      if (clean(warehouseId) && row.warehouse_id !== clean(warehouseId)) return false;
    }
    return true;
  });
  const filtered = normalizedSearch
    ? scoped.filter((row) => includesSearch(config.searchFields(row), normalizedSearch))
    : scoped;

  return paginateRows(sortByCode(filtered, config.sortField), page, pageSize);
}

async function getTaxonomyResource(resource, id, { tenantId }) {
  const scopedTenantId = requireTenantId(tenantId);
  if (resource === "warehouses") {
    return getWarehouse({ tenantId: scopedTenantId, warehouseId: id });
  }

  const configs = {
    zones: {
      model: WarehouseZone,
      idField: "zone_id",
      loadContext: async (rows) => loadTaxonomyContext(scopedTenantId, "zones", rows),
      map: mapZoneRaw,
    },
    aisles: {
      model: WarehouseAisle,
      idField: "aisle_id",
      loadContext: async (rows) => loadTaxonomyContext(scopedTenantId, "aisles", rows),
      map: mapAisleRaw,
    },
    bays: {
      model: WarehouseBay,
      idField: "bay_id",
      loadContext: async (rows) => loadTaxonomyContext(scopedTenantId, "bays", rows),
      map: mapBayRaw,
    },
    levels: {
      model: WarehouseLevel,
      idField: "level_id",
      loadContext: async (rows) => loadTaxonomyContext(scopedTenantId, "levels", rows),
      map: mapLevelRaw,
    },
    bins: {
      model: WarehouseBin,
      idField: "bin_id",
      loadContext: async (rows) => loadTaxonomyContext(scopedTenantId, "bins", rows),
      map: mapBinRaw,
    },
  };

  const config = configs[resource];
  if (!config) {
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "Unknown taxonomy resource");
  }

  const row = await config.model.findOne({
    where: { tenant_id: scopedTenantId, [config.idField]: id },
    raw: true,
  });

  if (!row) return null;
  const context = await config.loadContext([row]);
  return config.map(row, context);
}

async function listWarehouseTaxonomyTree({ tenantId, search = "", page = 1, pageSize = 10 }) {
  return listWarehouseTree({ tenantId, search, page, pageSize });
}

async function listLovGroups({ tenantId, search = "", page = 1, pageSize = 20 }) {
  const scopedTenantId = requireTenantId(tenantId);
  const normalizedSearch = normalizeSearch(search);
  const result = await LovGroup.findAndCountAll({
    where: {
      tenant_id: scopedTenantId,
      ...(normalizedSearch
        ? {
            [Op.or]: [
              { group_code: { [Op.iLike]: `%${normalizedSearch}%` } },
              { group_name: { [Op.iLike]: `%${normalizedSearch}%` } },
              { description: { [Op.iLike]: `%${normalizedSearch}%` } },
            ],
          }
        : {}),
    },
    include: [{ model: LovValue, required: false }],
    order: [["group_code", "ASC"]],
    offset: (page - 1) * pageSize,
    limit: pageSize,
    distinct: true,
    col: "lov_group_id",
  });

  return {
    rows: result.rows.map((row) => mapLovGroup(row)),
    total: result.count,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(result.count / pageSize)),
  };
}

async function getLovGroup({ tenantId, lovGroupId }) {
  const scopedTenantId = requireTenantId(tenantId);
  const row = await LovGroup.findOne({
    where: { tenant_id: scopedTenantId, lov_group_id: lovGroupId },
    include: [{ model: LovValue, required: false }],
  });
  return mapLovGroup(row);
}

export {
  listSuppliers,
  getSupplier,
  listSkus,
  lookupSkus,
  getSku,
  listWarehouses,
  getWarehouse,
  listCustomers,
  getCustomer,
  listMasterLocations,
  listPortalLocations,
  lookupLocations,
  listWarehouseTaxonomyTree,
  listTaxonomyResource,
  getTaxonomyResource,
  listLovGroups,
  getLovGroup,
};
