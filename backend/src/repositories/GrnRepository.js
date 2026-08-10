import { Op, Sequelize } from "sequelize";
import {
  Asn,
  Grn,
  GrnLine,
  Sku,
  Supplier,
  User,
  sequelize,
} from "../models/index.js";
import { ApiError } from "../utils/errors.js";

function clean(value) {
  return String(value ?? "").trim();
}

function requireTenantId(tenantId) {
  const normalized = clean(tenantId);
  if (!normalized) {
    throw new ApiError(403, "TENANT_CONTEXT_REQUIRED", "Tenant context is required");
  }
  return normalized;
}

function plain(row) {
  return row?.get ? row.get({ plain: true }) : row;
}

function numberValue(value) {
  return Number(value ?? 0);
}

async function hydrateGrns(tenantId, grnRows, options = {}) {
  const rows = grnRows.map(plain).filter(Boolean);
  if (!rows.length) return [];

  const grnIds = rows.map((row) => row.grn_id);
  const asnIds = [...new Set(rows.map((row) => row.asn_id).filter(Boolean))];
  const supplierIds = [...new Set(rows.map((row) => row.supplier_id).filter(Boolean))];
  const userIds = [...new Set(rows.map((row) => row.received_by).filter(Boolean))];

  const [lines, asns, users] = await Promise.all([
    GrnLine.findAll({
      where: { tenant_id: tenantId, grn_id: { [Op.in]: grnIds } },
      order: [["line_no", "ASC"], ["grn_line_id", "ASC"]],
      raw: true,
      transaction: options.transaction,
    }),
    asnIds.length
      ? Asn.findAll({
          where: { tenant_id: tenantId, asn_id: { [Op.in]: asnIds } },
          raw: true,
          transaction: options.transaction,
        })
      : [],
    userIds.length
      ? User.findAll({
          where: { tenant_id: tenantId, user_id: { [Op.in]: userIds } },
          attributes: ["user_id", "user_name"],
          raw: true,
          transaction: options.transaction,
        })
      : [],
  ]);

  for (const asn of asns) {
    if (asn.supplier_id) supplierIds.push(asn.supplier_id);
  }

  const skuIds = [...new Set(lines.map((line) => line.sku_id).filter(Boolean))];
  const uniqueSupplierIds = [...new Set(supplierIds)];
  const [skus, suppliers] = await Promise.all([
    skuIds.length
      ? Sku.findAll({
          where: { tenant_id: tenantId, sku_id: { [Op.in]: skuIds } },
          raw: true,
          transaction: options.transaction,
        })
      : [],
    uniqueSupplierIds.length
      ? Supplier.findAll({
          where: { tenant_id: tenantId, supplier_id: { [Op.in]: uniqueSupplierIds } },
          raw: true,
          transaction: options.transaction,
        })
      : [],
  ]);

  const linesByGrn = new Map();
  for (const line of lines) {
    if (!linesByGrn.has(line.grn_id)) linesByGrn.set(line.grn_id, []);
    linesByGrn.get(line.grn_id).push(line);
  }
  const asnsById = new Map(asns.map((asn) => [asn.asn_id, asn]));
  const skusById = new Map(skus.map((sku) => [sku.sku_id, sku]));
  const suppliersById = new Map(suppliers.map((supplier) => [supplier.supplier_id, supplier]));
  const usersById = new Map(users.map((user) => [user.user_id, user]));

  return rows.map((row) => {
    const asn = row.asn_id ? asnsById.get(row.asn_id) || null : null;
    const supplierId = row.supplier_id || asn?.supplier_id || null;
    const supplier = supplierId ? suppliersById.get(supplierId) || null : null;
    const rowLines = linesByGrn.get(row.grn_id) || [];
    const receiverName = row.received_by ? usersById.get(row.received_by)?.user_name || null : null;
    const receiverDisplay = receiverName && row.received_by ? `${receiverName} (${row.received_by})` : row.received_by;
    return {
      grn_id: row.grn_id,
      tenant_id: row.tenant_id,
      warehouse_id: row.warehouse_id,
      asn_id: row.asn_id,
      supplier_id: supplierId,
      supplier_name: supplier?.supplier_name || null,
      received_date: row.received_date,
      status: row.status,
      received_by: row.received_by,
      created_by: row.received_by,
      created_by_name: receiverName,
      created_by_display: receiverDisplay,
      created_at: row.created_at,
      updated_at: row.updated_at,
      notes: row.notes || "",
      cancelled_at: row.cancelled_at,
      cancelled_by: row.cancelled_by,
      cancellation_reason: row.cancellation_reason,
      posted_at: row.posted_at,
      posted_by: row.posted_by,
      lines_count: rowLines.length,
      lines: rowLines.map((line) => {
        const sku = skusById.get(line.sku_id) || null;
        return {
          grn_line_id: line.grn_line_id,
          asn_line_id: line.asn_line_id,
          line_no: Number(line.line_no),
          sku_id: line.sku_id,
          sku_code: sku?.sku_code || null,
          sku_name: sku?.description || null,
          description: sku?.description || null,
          expected_qty: numberValue(line.expected_qty),
          received_qty: numberValue(line.received_qty),
          uom: line.uom,
          lot_no: line.lot_no,
          serial_no: line.serial_no,
          qc_status: line.qc_status,
          putaway_qty: numberValue(line.putaway_qty),
          notes: line.notes,
        };
      }),
    };
  });
}

async function listGrns({ tenantId, filters = {} }) {
  const scopedTenantId = requireTenantId(tenantId);
  const status = clean(filters.status).toLowerCase();
  const where = { tenant_id: scopedTenantId };
  if (status === "open") {
    where.status = { [Op.notIn]: ["posted", "cancelled"] };
  } else if (status) {
    where.status = status;
  }
  if (clean(filters.date).toLowerCase() === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    where.created_at = {
      [Op.gte]: start,
      [Op.lt]: end,
    };
  }

  const rows = await Grn.findAll({
    where,
    order: [["created_at", "DESC"], ["grn_id", "DESC"]],
    raw: true,
  });
  return hydrateGrns(scopedTenantId, rows);
}

async function getGrnById({ tenantId, grnId, warehouseId = "" }, options = {}) {
  const scopedTenantId = requireTenantId(tenantId);
  const where = {
    tenant_id: scopedTenantId,
    grn_id: grnId,
    ...(clean(warehouseId) ? { warehouse_id: clean(warehouseId) } : {}),
  };
  const row = await Grn.findOne({
    where,
    raw: true,
    transaction: options.transaction,
    lock: options.transaction ? options.transaction.LOCK.UPDATE : undefined,
  });
  const mapped = await hydrateGrns(scopedTenantId, row ? [row] : [], options);
  return mapped[0] || null;
}

async function listEligibleGrnAsns({ tenantId, warehouseId }) {
  const scopedTenantId = requireTenantId(tenantId);
  const scopedWarehouseId = clean(warehouseId);
  if (!scopedWarehouseId) {
    throw new ApiError(400, "GRN_VALIDATION_ERROR", "Warehouse is required");
  }

  const asns = await Asn.findAll({
    where: {
      tenant_id: scopedTenantId,
      warehouse_id: scopedWarehouseId,
      status: "arrived",
    },
    raw: true,
    order: [["created_at", "DESC"], ["asn_id", "DESC"]],
  });
  if (!asns.length) return [];

  const asnIds = asns.map((asn) => asn.asn_id);
  const linked = await Grn.findAll({
    attributes: ["asn_id"],
    where: {
      tenant_id: scopedTenantId,
      asn_id: { [Op.in]: asnIds },
    },
    raw: true,
  });
  const linkedAsnIds = new Set(linked.map((row) => row.asn_id).filter(Boolean));
  const supplierIds = [...new Set(asns.map((asn) => asn.supplier_id).filter(Boolean))];
  const suppliers = supplierIds.length
    ? await Supplier.findAll({
        where: { tenant_id: scopedTenantId, supplier_id: { [Op.in]: supplierIds } },
        raw: true,
      })
    : [];
  const suppliersById = new Map(suppliers.map((supplier) => [supplier.supplier_id, supplier]));

  return asns
    .filter((asn) => !linkedAsnIds.has(asn.asn_id))
    .map((asn) => ({
      asn_id: asn.asn_id,
      tenant_id: asn.tenant_id,
      warehouse_id: asn.warehouse_id,
      supplier_id: asn.supplier_id,
      supplier_name: suppliersById.get(asn.supplier_id)?.supplier_name || null,
      status: asn.status,
      eta: asn.eta,
      created_at: asn.created_at,
    }));
}

async function updateGrnLines({ tenantId, warehouseId, grnId, lines }) {
  const scopedTenantId = requireTenantId(tenantId);
  if (!Array.isArray(lines)) {
    throw new ApiError(400, "GRN_VALIDATION_ERROR", "lines must be an array");
  }

  return sequelize.transaction(async (transaction) => {
    const current = await Grn.findOne({
      where: {
        tenant_id: scopedTenantId,
        grn_id: grnId,
        ...(clean(warehouseId) ? { warehouse_id: clean(warehouseId) } : {}),
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!current) throw new ApiError(404, "GRN_NOT_FOUND", "GRN not found");
    if (current.status !== "receiving") {
      throw new ApiError(400, "GRN_NOT_RECEIVING", "GRN must be in receiving status to update lines");
    }

    for (const line of lines) {
      const lineNo = Number(line?.line_no);
      const receivedQty = Number(line?.received_qty);
      if (!Number.isInteger(lineNo) || lineNo <= 0 || !Number.isFinite(receivedQty) || receivedQty < 0) {
        throw new ApiError(400, "GRN_VALIDATION_ERROR", "Line number and received quantity are invalid");
      }
      await GrnLine.update(
        { received_qty: receivedQty },
        {
          where: { tenant_id: scopedTenantId, grn_id: grnId, line_no: lineNo },
          transaction,
        },
      );
    }

    await current.update({ updated_at: new Date() }, { transaction });
    return getGrnById({ tenantId: scopedTenantId, grnId }, { transaction });
  });
}

async function transitionGrn({ tenantId, warehouseId, grnId, transition, action, userId }) {
  const scopedTenantId = requireTenantId(tenantId);
  return sequelize.transaction(async (transaction) => {
    const current = await Grn.findOne({
      where: {
        tenant_id: scopedTenantId,
        grn_id: grnId,
        ...(clean(warehouseId) ? { warehouse_id: clean(warehouseId) } : {}),
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!current) throw new ApiError(404, "GRN_NOT_FOUND", "GRN not found");
    if (!transition.from.includes(current.status)) {
      throw new ApiError(
        400,
        "INVALID_GRN_TRANSITION",
        `Cannot ${action} GRN with status '${current.status}'`,
      );
    }

    if (action === "complete") {
      const incomplete = await GrnLine.findOne({
        where: {
          tenant_id: scopedTenantId,
          grn_id: grnId,
          [Op.and]: Sequelize.where(
            Sequelize.col("received_qty"),
            Op.lt,
            Sequelize.col("expected_qty"),
          ),
        },
        transaction,
      });
      if (incomplete) {
        throw new ApiError(400, "GRN_QUANTITY_INCOMPLETE", "All received quantities must meet expected quantities");
      }
    }

    await current.update({
      status: transition.to,
      updated_at: new Date(),
    }, { transaction });
    return getGrnById({ tenantId: scopedTenantId, grnId }, { transaction });
  });
}

async function markGrnPosted({ tenantId, grnId, userId }) {
  const scopedTenantId = requireTenantId(tenantId);
  return sequelize.transaction(async (transaction) => {
    const current = await Grn.findOne({
      where: { tenant_id: scopedTenantId, grn_id: grnId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!current) return null;
    await current.update({
      status: "posted",
      posted_at: current.posted_at || new Date(),
      posted_by: current.posted_by || clean(userId) || null,
      updated_at: new Date(),
    }, { transaction });
    return getGrnById({ tenantId: scopedTenantId, grnId }, { transaction });
  });
}

export {
  getGrnById,
  listEligibleGrnAsns,
  listGrns,
  markGrnPosted,
  transitionGrn,
  updateGrnLines,
};
