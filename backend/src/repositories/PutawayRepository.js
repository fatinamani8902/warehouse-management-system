import { Op } from "sequelize";
import {
  InventoryTransaction,
  Location,
  PutawayTask,
  PutawayTaskEvent,
  Sku,
  User,
  UserRole,
  UserWarehouse,
  sequelize,
} from "../models/index.js";
import { ApiError } from "../utils/errors.js";

const OPERATIONAL_ROLE_IDS = ["warehouseoperator", "storekeeper", "warehouseclerk"];
const ACTIVE_OPERATIONAL_STATUSES = ["open", "pending", "assigned", "in_progress"];

function visiblePutawayScopeCte(alias = "visible_putaway") {
  return `${alias} AS (
       SELECT task.*
       FROM public.putaway_tasks task
       LEFT JOIN public.locations source_location
         ON source_location.tenant_id = task.tenant_id
        AND source_location.location_id = coalesce(task.source_location_id, task.from_location_id)
       WHERE task.tenant_id = $1
         AND task.warehouse_id = $2
         AND (
           lower(task.status) NOT IN ('open', 'pending', 'assigned', 'in_progress')
           OR (
             source_location.location_id IS NOT NULL
             AND source_location.is_active = true
             AND source_location.warehouse_id = task.warehouse_id
           )
         )
     )`;
}

function clean(value) {
  return String(value ?? "").trim();
}

function parseDateOnly(value, label) {
  const raw = clean(value);
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) {
    throw new ApiError(400, "PUTAWAY_INVALID_DATE_FILTER", `${label} must be a valid date in YYYY-MM-DD format`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new ApiError(400, "PUTAWAY_INVALID_DATE_FILTER", `${label} must be a valid date`);
  }
  return date;
}

function nextDay(date) {
  const value = new Date(date);
  value.setDate(value.getDate() + 1);
  return value;
}

function nullableText(value) {
  const normalized = clean(value);
  return normalized || null;
}

function required(value, code, message, status = 400) {
  const normalized = clean(value);
  if (!normalized) throw new ApiError(status, code, message);
  return normalized;
}

function plain(row) {
  return row?.get ? row.get({ plain: true }) : row;
}

function priorityLabel(value) {
  const priority = Number(value);
  if (priority <= 2) return "high";
  if (priority >= 4) return "low";
  return "medium";
}

function userName(row) {
  return nullableText(row?.user_name)
    || nullableText(`${nullableText(row?.first_name) || ""} ${nullableText(row?.last_name) || ""}`)
    || nullableText(row?.email)
    || nullableText(row?.user_id);
}

function userDisplayName(name, userId) {
  const safeName = nullableText(name);
  const safeUserId = nullableText(userId);
  if (safeName && safeUserId) return `${safeName} (${safeUserId})`;
  return safeName || safeUserId || null;
}

function locationDisplay(row) {
  return nullableText(row?.display_name)
    || nullableText(row?.location_code)
    || nullableText(row?.label)
    || nullableText(row?.location_id);
}

async function loadLocations(tenantId, tasks, transaction) {
  const locationIds = [...new Set(tasks.flatMap((task) => [
    task.source_location_id || task.from_location_id,
    task.destination_location_id || task.to_location_id,
  ]).filter(Boolean))];
  if (!locationIds.length) return new Map();
  const rows = await Location.findAll({
    where: { tenant_id: tenantId, location_id: { [Op.in]: locationIds } },
    raw: true,
    transaction,
  });
  return new Map(rows.map((row) => [row.location_id, row]));
}

async function loadAssignedUsers(tenantId, tasks, transaction) {
  const userIds = [...new Set(tasks.map((task) => task.assigned_to_user_id).filter(Boolean))];
  if (!userIds.length) return new Map();
  const rows = await User.findAll({
    where: { tenant_id: tenantId, user_id: { [Op.in]: userIds } },
    raw: true,
    transaction,
  });
  return new Map(rows.map((row) => [row.user_id, row]));
}

async function loadSkus(tenantId, tasks, transaction) {
  const skuIds = [...new Set(tasks.map((task) => task.sku_id).filter(Boolean))];
  if (!skuIds.length) return new Map();
  const rows = await Sku.findAll({
    where: { tenant_id: tenantId, sku_id: { [Op.in]: skuIds } },
    raw: true,
    transaction,
  });
  return new Map(rows.map((row) => [row.sku_id, row]));
}

function mapTask(row, context = {}) {
  if (!row) return null;
  const task = plain(row);
  const sourceId = task.source_location_id || task.from_location_id || null;
  const destinationId = task.destination_location_id || task.to_location_id || null;
  const source = sourceId ? context.locationsById?.get(sourceId) || null : null;
  const destination = destinationId ? context.locationsById?.get(destinationId) || null : null;
  const assignedUser = task.assigned_to_user_id
    ? context.usersById?.get(task.assigned_to_user_id) || null
    : null;
  const assignedToName = userName(assignedUser);
  const assignedToDisplay = userDisplayName(assignedToName, task.assigned_to_user_id);
  const sourceDisplay = locationDisplay(source) || sourceId;
  const destinationDisplay = locationDisplay(destination) || destinationId;
  const sku = task.sku_id ? context.skusById?.get(task.sku_id) || null : null;
  const skuName = nullableText(sku?.sku_name) || nullableText(sku?.name) || nullableText(sku?.description);
  const skuDescription = nullableText(sku?.description);

  return {
    ...task,
    task_id: task.putaway_task_id,
    sku_name: skuName,
    sku_description: skuDescription,
    source_location: sourceDisplay,
    suggested_bin: destinationDisplay,
    priority: priorityLabel(task.priority),
    assigned_to_user_name: assignedToName,
    assigned_to_user_display: assignedToDisplay,
    actual_bin_code: task.actual_bin_code || destinationDisplay || null,
    updated_at: task.completed_at || task.started_at || task.updated_at || task.created_at,
    execution: {
      assigned_to: assignedToDisplay || "Unassigned",
      started_at: task.started_at,
      completed_at: task.completed_at,
      actual_bin: task.actual_bin_code || destinationDisplay || null,
      device_type: null,
    },
    evidence_summary: {
      scan_method: null,
      epc_expected_count: null,
      epc_confirmed_count: null,
      validation_result: task.validation_result || (task.status === "completed" ? "passed" : null),
      exception_reason: task.exception_reason || null,
    },
  };
}

async function mapTasks(tenantId, rows, transaction) {
  const tasks = rows.map(plain).filter(Boolean);
  const [locationsById, usersById, skusById] = await Promise.all([
    loadLocations(tenantId, tasks, transaction),
    loadAssignedUsers(tenantId, tasks, transaction),
    loadSkus(tenantId, tasks, transaction),
  ]);
  return tasks.map((task) => mapTask(task, { locationsById, usersById, skusById }));
}

function taskWhere({ tenantId, warehouseId, taskId }) {
  return {
    tenant_id: tenantId,
    ...(warehouseId ? { warehouse_id: warehouseId } : {}),
    ...(taskId
      ? { [Op.or]: [{ putaway_task_id: taskId }, { task_id: taskId }] }
      : {}),
  };
}

async function getPutawayTask(context, taskId, options = {}) {
  const tenantId = required(context?.tenantId, "TENANT_CONTEXT_REQUIRED", "Tenant context is required", 403);
  const warehouseId = clean(context?.warehouseId);
  const safeTaskId = required(taskId, "PUTAWAY_VALIDATION_ERROR", "Putaway task ID is required");
  const row = await PutawayTask.findOne({
    where: taskWhere({ tenantId, warehouseId, taskId: safeTaskId }),
    raw: true,
    transaction: options.transaction,
    lock: options.lock,
  });
  const mapped = await mapTasks(tenantId, row ? [row] : [], options.transaction);
  return mapped[0] || null;
}

async function getRawPutawayTask(context, taskId, options = {}) {
  const tenantId = required(context?.tenantId, "TENANT_CONTEXT_REQUIRED", "Tenant context is required", 403);
  const warehouseId = clean(context?.warehouseId);
  const safeTaskId = required(taskId, "PUTAWAY_VALIDATION_ERROR", "Putaway task ID is required");
  return PutawayTask.findOne({
    where: taskWhere({ tenantId, warehouseId, taskId: safeTaskId }),
    transaction: options.transaction,
    lock: options.lock,
  });
}

async function listPutawayTasks(context, query = {}) {
  const tenantId = required(context?.tenantId, "TENANT_CONTEXT_REQUIRED", "Tenant context is required", 403);
  const warehouseId = clean(context?.warehouseId);
  const dateFrom = parseDateOnly(query.dateFrom, "dateFrom");
  const dateTo = parseDateOnly(query.dateTo, "dateTo");
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new ApiError(400, "PUTAWAY_INVALID_DATE_FILTER", "dateFrom cannot be later than dateTo");
  }
  const where = taskWhere({ tenantId, warehouseId });
  if (dateFrom || dateTo) {
    where.created_at = {
      ...(dateFrom ? { [Op.gte]: dateFrom } : {}),
      ...(dateTo ? { [Op.lt]: nextDay(dateTo) } : {}),
    };
  }
  const rows = (await PutawayTask.findAll({
    where,
    raw: true,
    order: [["created_at", "DESC"], ["putaway_task_id", "DESC"]],
  })).map(plain).filter(Boolean);
  const [locationsById, usersById, skusById] = await Promise.all([
    loadLocations(tenantId, rows),
    loadAssignedUsers(tenantId, rows),
    loadSkus(tenantId, rows),
  ]);
  const mapped = rows.map((task) => mapTask(task, { locationsById, usersById, skusById }));
  const filteredOperational = mapped.filter((row) => {
    const status = clean(row.status).toLowerCase();
    if (!ACTIVE_OPERATIONAL_STATUSES.includes(status)) return true;
    const sourceId = row.source_location_id || row.from_location_id;
    const sourceLocation = sourceId ? locationsById.get(sourceId) : null;
    return Boolean(
      sourceLocation
        && sourceLocation.is_active
        && (!warehouseId || sourceLocation.warehouse_id === row.warehouse_id)
    );
  });

  const search = clean(query.search).toLowerCase();
  const status = clean(query.status).toLowerCase();
  const priority = clean(query.priority).toLowerCase();
  const source = clean(query.source).toLowerCase();
  const suggestedBin = clean(query.suggestedBin).toLowerCase();
  const grn = clean(query.grn).toLowerCase();
  const sku = clean(query.sku).toLowerCase();
  let result = filteredOperational;
  if (status) result = result.filter((row) => clean(row.status).toLowerCase() === status);
  if (priority) result = result.filter((row) => clean(row.priority).toLowerCase() === priority);
  if (source) result = result.filter((row) => clean(row.source_location).toLowerCase().includes(source));
  if (suggestedBin) result = result.filter((row) => clean(row.suggested_bin).toLowerCase().includes(suggestedBin));
  if (grn) result = result.filter((row) => clean(row.grn_id).toLowerCase().includes(grn));
  if (sku) result = result.filter((row) => clean(row.sku_id).toLowerCase().includes(sku));
  if (search) {
    result = result.filter((row) => [
      row.task_id,
      row.grn_id,
      row.sku_id,
      row.source_location,
      row.suggested_bin,
    ].some((value) => clean(value).toLowerCase().includes(search)));
  }

  const page = Math.min(100000, Math.max(1, Number.parseInt(query.page, 10) || 1));
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 10));
  const total = result.length;
  const offset = (page - 1) * pageSize;
  return { items: result.slice(offset, offset + pageSize), total, page, pageSize };
}

async function listAssignablePutawayOperators(context) {
  const tenantId = required(context?.tenantId, "TENANT_CONTEXT_REQUIRED", "Tenant context is required", 403);
  const warehouseId = required(context?.warehouseId, "WAREHOUSE_CONTEXT_REQUIRED", "Warehouse context is required", 403);
  const [links, roles] = await Promise.all([
    UserWarehouse.findAll({ where: { tenant_id: tenantId, warehouse_id: warehouseId }, raw: true }),
    UserRole.findAll({ where: { tenant_id: tenantId, role_id: { [Op.in]: OPERATIONAL_ROLE_IDS } }, raw: true }),
  ]);
  const warehouseUserIds = new Set(links.map((row) => row.user_id));
  const roleByUserId = new Map();
  for (const row of roles) {
    if (!roleByUserId.has(row.user_id)) roleByUserId.set(row.user_id, row.role_id);
  }
  const userIds = [...roleByUserId.keys()].filter((userId) => warehouseUserIds.has(userId));
  if (!userIds.length) return [];
  const users = await User.findAll({
    where: { tenant_id: tenantId, user_id: { [Op.in]: userIds }, is_active: true },
    raw: true,
  });
  return users
    .map((user) => ({
      user_id: user.user_id,
      user_name: userName(user),
      email: user.email,
      role_id: roleByUserId.get(user.user_id),
    }))
    .sort((left, right) => `${left.user_name}${left.user_id}`.localeCompare(`${right.user_name}${right.user_id}`));
}

async function insertPutawayTaskEvent({ tenantId, taskId, eventType, eventPayload = {}, createdBy = null }, transaction = null) {
  return PutawayTaskEvent.create({
    tenant_id: tenantId,
    task_id: taskId,
    event_type: eventType,
    event_payload: eventPayload,
    created_by: createdBy || null,
    created_at: new Date(),
  }, { transaction });
}

async function assignPutawayTask(context, taskId, assignedToUserId) {
  const tenantId = required(context?.tenantId, "TENANT_CONTEXT_REQUIRED", "Tenant context is required", 403);
  const warehouseId = required(context?.warehouseId, "WAREHOUSE_CONTEXT_REQUIRED", "Warehouse context is required", 403);
  const safeTaskId = required(taskId, "PUTAWAY_VALIDATION_ERROR", "Putaway task ID is required");
  const operatorId = required(assignedToUserId, "PUTAWAY_OPERATOR_REQUIRED", "An operator is required");

  return sequelize.transaction(async (transaction) => {
    const task = await getRawPutawayTask({ tenantId, warehouseId }, safeTaskId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!task) {
      throw new ApiError(404, "PUTAWAY_TASK_NOT_FOUND", "Putaway task was not found for the selected tenant and warehouse");
    }
    const taskData = plain(task);
    if (!["open", "pending", "assigned", "in_progress"].includes(taskData.status)) {
      throw new ApiError(409, "PUTAWAY_STATUS_INVALID", `Putaway task cannot be assigned from status '${taskData.status}'`);
    }
    const sourceLocationId = taskData.source_location_id || taskData.from_location_id;
    if (!sourceLocationId) {
      throw new ApiError(400, "PUTAWAY_SOURCE_LOCATION_REQUIRED", "Putaway task must have a valid source location before assignment");
    }
    const sourceLocation = await Location.findOne({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, location_id: sourceLocationId, is_active: true },
      transaction,
    });
    if (!sourceLocation) {
      throw new ApiError(400, "PUTAWAY_SOURCE_LOCATION_INVALID", "Putaway task source location is invalid for this warehouse");
    }

    const operator = await User.findOne({ where: { tenant_id: tenantId, user_id: operatorId }, raw: true, transaction });
    if (!operator) throw new ApiError(400, "PUTAWAY_OPERATOR_INVALID", "Selected operator does not belong to this tenant");
    if (!operator.is_active) throw new ApiError(400, "PUTAWAY_OPERATOR_INACTIVE", "Selected operator is inactive");
    const [warehouseAllowed, roleAllowed] = await Promise.all([
      UserWarehouse.count({ where: { tenant_id: tenantId, user_id: operatorId, warehouse_id: warehouseId }, transaction }),
      UserRole.count({ where: { tenant_id: tenantId, user_id: operatorId, role_id: { [Op.in]: OPERATIONAL_ROLE_IDS } }, transaction }),
    ]);
    if (!warehouseAllowed) {
      throw new ApiError(400, "PUTAWAY_OPERATOR_WAREHOUSE_INVALID", "Selected operator is not assigned to this warehouse");
    }
    if (!roleAllowed) {
      throw new ApiError(400, "PUTAWAY_OPERATOR_ROLE_INVALID", "Selected user must be an operational warehouse user.");
    }

    await task.update({
      assigned_to_user_id: operatorId,
      status: ["open", "pending"].includes(task.status) ? "assigned" : task.status,
    }, { transaction });
    const operatorName = userName(operator);
    await insertPutawayTaskEvent({
      tenantId,
      taskId: task.putaway_task_id,
      eventType: "assigned",
      eventPayload: {
        assigned_to_user_id: operator.user_id,
        assigned_to_user_name: operatorName,
      },
      createdBy: context?.userId || null,
    }, transaction);
    return {
      putawayTaskId: task.putaway_task_id,
      operator: { ...operator, user_name: operatorName },
    };
  });
}

async function listPutawayTaskHistory(context, taskId) {
  const tenantId = required(context?.tenantId, "TENANT_CONTEXT_REQUIRED", "Tenant context is required", 403);
  const task = await getRawPutawayTask(context, taskId);
  if (!task) throw new ApiError(404, "PUTAWAY_TASK_NOT_FOUND", "Putaway task not found");
  return PutawayTaskEvent.findAll({
    where: { tenant_id: tenantId, task_id: task.putaway_task_id },
    raw: true,
    order: [["created_at", "ASC"], ["event_id", "ASC"]],
  });
}

async function recomputePutawayBin(context, taskId) {
  const tenantId = required(context?.tenantId, "TENANT_CONTEXT_REQUIRED", "Tenant context is required", 403);
  const warehouseId = required(context?.warehouseId, "WAREHOUSE_CONTEXT_REQUIRED", "Warehouse context is required", 403);
  return sequelize.transaction(async (transaction) => {
    const task = await getRawPutawayTask({ tenantId, warehouseId }, taskId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!task) throw new ApiError(404, "PUTAWAY_TASK_NOT_FOUND", "Putaway task not found");
    if (!["pending", "assigned", "in_progress"].includes(task.status)) {
      throw new ApiError(409, "PUTAWAY_STATUS_INVALID", `Putaway bin cannot be recomputed from status '${task.status}'`);
    }
    const destination = await Location.findOne({
      where: {
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        location_type: "storage",
        is_active: true,
        bin_id: { [Op.ne]: null },
      },
      raw: true,
      transaction,
      order: [["location_id", "ASC"]],
    });
    if (!destination) {
      throw new ApiError(400, "PUTAWAY_DESTINATION_UNAVAILABLE", "No active storage location is available for this warehouse");
    }
    const previous = task.destination_location_id || task.to_location_id;
    await task.update({
      destination_location_id: destination.location_id,
      to_location_id: destination.location_id,
    }, { transaction });
    await insertPutawayTaskEvent({
      tenantId,
      taskId: task.putaway_task_id,
      eventType: "recompute_bin",
      eventPayload: {
        old_destination_location_id: previous,
        new_destination_location_id: destination.location_id,
      },
      createdBy: context?.userId || null,
    }, transaction);
    return task.putaway_task_id;
  });
}

async function markPutawayTaskException(context, taskId, reason) {
  const tenantId = required(context?.tenantId, "TENANT_CONTEXT_REQUIRED", "Tenant context is required", 403);
  const warehouseId = required(context?.warehouseId, "WAREHOUSE_CONTEXT_REQUIRED", "Warehouse context is required", 403);
  return sequelize.transaction(async (transaction) => {
    const task = await getRawPutawayTask({ tenantId, warehouseId }, taskId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!task) throw new ApiError(404, "PUTAWAY_TASK_NOT_FOUND", "Putaway task not found");
    if (!["pending", "assigned", "in_progress"].includes(task.status)) {
      throw new ApiError(409, "PUTAWAY_STATUS_INVALID", `Putaway task cannot be marked as exception from status '${task.status}'`);
    }
    await task.update({
      status: "exception",
      exception_reason: reason,
      validation_result: "failed",
    }, { transaction });
    await insertPutawayTaskEvent({
      tenantId,
      taskId: task.putaway_task_id,
      eventType: "exception",
      eventPayload: { reason },
      createdBy: context?.userId || null,
    }, transaction);
    return task.putaway_task_id;
  });
}

async function findExistingPutawayCompletion(tenantId, putawayTaskId) {
  return InventoryTransaction.findOne({
    where: {
      tenant_id: tenantId,
      reference_type: "putaway_task",
      reference_id: putawayTaskId,
      posting_key: `${putawayTaskId}:complete`,
    },
    raw: true,
  });
}

async function markPutawayTaskCompleted({ tenantId, putawayTaskId, destinationLocationId, actualBinCode, userId }) {
  const task = await PutawayTask.findOne({ where: { tenant_id: tenantId, putaway_task_id: putawayTaskId } });
  if (!task) throw new ApiError(404, "PUTAWAY_TASK_NOT_FOUND", "Putaway task not found");
  await task.update({
    status: "completed",
    destination_location_id: destinationLocationId,
    to_location_id: destinationLocationId,
    actual_bin_code: actualBinCode,
    completed_at: new Date(),
    completed_by: nullableText(userId),
  });
  await insertPutawayTaskEvent({
    tenantId,
    taskId: putawayTaskId,
    eventType: "completed",
    eventPayload: { destination_location_id: destinationLocationId, actual_bin_code: actualBinCode },
    createdBy: userId,
  });
  return plain(task);
}

export {
  OPERATIONAL_ROLE_IDS,
  assignPutawayTask,
  findExistingPutawayCompletion,
  getPutawayTask,
  getRawPutawayTask,
  insertPutawayTaskEvent,
  listAssignablePutawayOperators,
  listPutawayTaskHistory,
  listPutawayTasks,
  mapTask,
  markPutawayTaskException,
  markPutawayTaskCompleted,
  recomputePutawayBin,
  visiblePutawayScopeCte,
};
