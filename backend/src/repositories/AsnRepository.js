import {
  Asn,
  AsnLine,
  Sku,
  Supplier,
  User,
  Warehouse,
  sequelize,
} from "../models/index.js";
import { ApiError } from "../utils/errors.js";

function clean(value) {
  return String(value ?? "").trim();
}

function plain(row) {
  return row?.get ? row.get({ plain: true }) : row;
}

function requireTenantId(tenantId) {
  const value = clean(tenantId);
  if (!value) throw new ApiError(403, "TENANT_CONTEXT_REQUIRED", "Tenant context is required");
  return value;
}

function now() {
  return new Date();
}

async function generatePrefixedId(model, field, prefix, width = 6, transaction) {
  const rows = await model.findAll({ attributes: [field], raw: true, transaction });
  const next = rows.reduce((max, row) => {
    const value = String(row[field] ?? "");
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(value);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0) + 1;
  return `${prefix}${String(next).padStart(width, "0")}`;
}

function mapAsnRow(row) {
  if (!row) return null;
  const supplier = row.supplier || row.Supplier || {};
  const creator = row.creator || row.User || {};
  const lines = Array.isArray(row.lines) ? row.lines : [];
  const createdByName = creator.user_name || null;
  const createdByDisplay = createdByName && row.created_by
    ? `${createdByName} (${row.created_by})`
    : row.created_by;

  return {
    asn_id: row.asn_id,
    tenant_id: row.tenant_id,
    warehouse_id: row.warehouse_id,
    supplier_id: row.supplier_id,
    supplier_name: supplier.supplier_name,
    eta: row.eta,
    status: row.status,
    notes: row.notes || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    created_by_name: createdByName,
    created_by_display: createdByDisplay,
    cancelled_at: row.cancelled_at,
    cancelled_by: row.cancelled_by,
    cancellation_reason: row.cancellation_reason,
    lines_count: lines.length,
    lines: lines
      .slice()
      .sort((left, right) => Number(left.line_no) - Number(right.line_no))
      .map((line) => {
        const sku = line.sku || line.Sku || {};
        return {
          asn_line_id: line.asn_line_id,
          line_no: Number(line.line_no),
          sku_id: line.sku_id,
          sku_code: sku.sku_code,
          sku_name: sku.description,
          description: sku.description,
          expected_qty: Number(line.expected_qty),
          uom: line.uom,
          lot_no: line.lot_no,
          serial_no: line.serial_no,
          notes: line.notes,
        };
      }),
  };
}

function asnInclude() {
  return [
    {
      model: Supplier,
      as: "supplier",
      attributes: ["supplier_id", "supplier_name"],
      required: true,
    },
    {
      model: User,
      as: "creator",
      attributes: ["user_id", "user_name"],
      required: false,
    },
    {
      model: AsnLine,
      as: "lines",
      required: false,
      include: [{
        model: Sku,
        as: "sku",
        attributes: ["sku_id", "sku_code", "description"],
        required: false,
      }],
    },
  ];
}

async function getAsnById(tenantId, asnId, options = {}) {
  const scopedTenantId = requireTenantId(tenantId);
  const row = await Asn.findOne({
    where: { tenant_id: scopedTenantId, asn_id: asnId },
    include: asnInclude(),
    order: [[{ model: AsnLine, as: "lines" }, "line_no", "ASC"]],
    ...options,
  });
  return mapAsnRow(plain(row));
}

async function listAsns(tenantId) {
  const scopedTenantId = requireTenantId(tenantId);
  const rows = await Asn.findAll({
    where: { tenant_id: scopedTenantId },
    include: asnInclude(),
    order: [
      ["created_at", "DESC"],
      ["asn_id", "DESC"],
      [{ model: AsnLine, as: "lines" }, "line_no", "ASC"],
    ],
  });
  return rows.map((row) => mapAsnRow(plain(row)));
}

async function validateCreateMasters({ tenantId, warehouseId, userId, supplierId, lines, transaction }) {
  const [warehouse, user, supplier, skus] = await Promise.all([
    Warehouse.findOne({ where: { tenant_id: tenantId, warehouse_id: warehouseId }, transaction }),
    User.findOne({ where: { tenant_id: tenantId, user_id: userId }, transaction }),
    Supplier.findOne({
      where: { tenant_id: tenantId, supplier_id: supplierId, status: "active" },
      transaction,
    }),
    Sku.findAll({
      where: {
        tenant_id: tenantId,
        sku_id: lines.map((line) => line.skuId),
        status: "active",
      },
      raw: true,
      transaction,
    }),
  ]);

  if (!warehouse) throw new ApiError(400, "INVALID_WAREHOUSE", "Warehouse is invalid for this tenant");
  if (!user) throw new ApiError(400, "INVALID_USER", "Created by user is invalid for this tenant");
  if (!supplier) throw new ApiError(400, "INVALID_SUPPLIER", "Select an active supplier");
  if (skus.length !== lines.length) {
    throw new ApiError(400, "INVALID_SKU", "One or more SKUs are invalid or inactive");
  }

  return new Map(skus.map((sku) => [sku.sku_id, sku.uom || "EA"]));
}

async function createAsn({ tenantId, warehouseId, userId, supplierId, eta, notes, lines }) {
  const scopedTenantId = requireTenantId(tenantId);
  return sequelize.transaction(async (transaction) => {
    const uomBySku = await validateCreateMasters({
      tenantId: scopedTenantId,
      warehouseId,
      userId,
      supplierId,
      lines,
      transaction,
    });

    const asnId = await generatePrefixedId(Asn, "asn_id", "ASN", 6, transaction);
    await Asn.create({
      tenant_id: scopedTenantId,
      asn_id: asnId,
      warehouse_id: warehouseId,
      supplier_id: supplierId,
      eta,
      status: "draft",
      notes,
      created_by: userId,
      created_at: now(),
      updated_at: now(),
    }, { transaction });

    let nextLineSequence = Number((await generatePrefixedId(
      AsnLine,
      "asn_line_id",
      "ASL",
      6,
      transaction,
    )).slice(3));

    for (const line of lines) {
      const asnLineId = `ASL${String(nextLineSequence).padStart(6, "0")}`;
      nextLineSequence += 1;
      await AsnLine.create({
        tenant_id: scopedTenantId,
        asn_line_id: asnLineId,
        asn_id: asnId,
        line_no: line.lineNo,
        sku_id: line.skuId,
        expected_qty: line.expectedQty,
        uom: uomBySku.get(line.skuId),
      }, { transaction });
    }

    return getAsnById(scopedTenantId, asnId, { transaction });
  });
}

async function getAsnForUpdate(tenantId, asnId, transaction) {
  return Asn.findOne({
    where: { tenant_id: requireTenantId(tenantId), asn_id: asnId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
}

async function updateAsnStatus({
  tenantId,
  asnId,
  status,
  userId,
  cancellationReason = null,
  allowedFrom = [],
  action = "update",
}) {
  const scopedTenantId = requireTenantId(tenantId);
  return sequelize.transaction(async (transaction) => {
    const row = await getAsnForUpdate(scopedTenantId, asnId, transaction);
    if (!row) throw new ApiError(404, "ASN_NOT_FOUND", "ASN not found");
    if (allowedFrom.length > 0 && !allowedFrom.includes(row.status)) {
      throw new ApiError(
        400,
        "INVALID_ASN_TRANSITION",
        `Cannot ${action} ASN with status '${row.status}'`,
      );
    }

    await row.update({
      status,
      updated_at: now(),
      ...(status === "cancelled"
        ? {
            cancellation_reason: cancellationReason,
            cancelled_by: userId,
            cancelled_at: now(),
          }
        : {}),
    }, { transaction });

    return getAsnById(scopedTenantId, asnId, { transaction });
  });
}

export {
  createAsn,
  getAsnById,
  getAsnForUpdate,
  listAsns,
  updateAsnStatus,
};
