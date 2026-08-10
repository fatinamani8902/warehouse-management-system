import { Op } from "sequelize";
import { Location } from "../models/index.js";
import {
  findExistingPutawayCompletion,
  getRawPutawayTask,
  markPutawayTaskCompleted,
} from "../repositories/PutawayRepository.js";
import { ApiError } from "../utils/errors.js";
import { postInventoryMovement } from "./inventoryPostingService.js";

function clean(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function modelValue(model, plainTask, key) {
  return model?.getDataValue?.(key) ?? plainTask?.[key];
}

async function completePutawayInventory({
  tenantId,
  warehouseId,
  taskId,
  destinationLocationId = null,
  userId = null,
}) {
  const safeTenantId = clean(tenantId);
  const safeTaskId = clean(taskId);
  const safeWarehouseId = clean(warehouseId);
  if (!safeTenantId) throw new ApiError(403, "TENANT_CONTEXT_REQUIRED", "Tenant context is required");
  if (!safeTaskId) throw new ApiError(400, "PUTAWAY_VALIDATION_ERROR", "Putaway task ID is required");
  if (!safeWarehouseId) {
    throw new ApiError(403, "WAREHOUSE_CONTEXT_REQUIRED", "Warehouse context is required");
  }

  const taskModel = await getRawPutawayTask(
    { tenantId: safeTenantId, warehouseId: safeWarehouseId },
    safeTaskId,
  );
  if (!taskModel) {
    throw new ApiError(404, "PUTAWAY_TASK_NOT_FOUND", "Putaway task not found");
  }
  const task = taskModel.get({ plain: true });
  const assignedToUserId = clean(
    modelValue(taskModel, task, "assigned_to_user_id") ?? task.assignedToUserId
  );
  if (!assignedToUserId) {
    throw new ApiError(
      400,
      "PUTAWAY_NOT_ASSIGNED",
      "Putaway task must be assigned before completion."
    );
  }

  const existing = await findExistingPutawayCompletion(safeTenantId, task.putaway_task_id);
  if (task.status === "completed" || existing) {
    const reconciledDestinationId = clean(
      destinationLocationId || task.destination_location_id || task.to_location_id
    );
    const reconciledDestination = reconciledDestinationId
      ? await Location.findOne({
          where: { tenant_id: safeTenantId, location_id: reconciledDestinationId },
          raw: true,
        })
      : null;
    const reconciledTask = task.status === "completed"
      ? task
      : await markPutawayTaskCompleted({
          tenantId: safeTenantId,
          putawayTaskId: task.putaway_task_id,
          destinationLocationId: reconciledDestinationId,
          actualBinCode: task.actual_bin_code || reconciledDestination?.location_code || null,
          userId,
        });
    return {
      task: reconciledTask,
      transaction: existing || null,
      balances: [],
      idempotent: true,
    };
  }

  if (!["pending", "assigned", "in_progress"].includes(task.status)) {
    throw new ApiError(
      400,
      "PUTAWAY_STATUS_INVALID",
      "Putaway task must be pending, assigned, or in progress before completion"
    );
  }

  const sourceLocationId = clean(task.source_location_id || task.from_location_id);
  const resolvedDestinationId = clean(
    destinationLocationId || task.destination_location_id || task.to_location_id
  );
  const qty = Number(task.qty);

  if (!task.sku_id) throw new ApiError(400, "PUTAWAY_VALIDATION_ERROR", "Putaway task SKU is required");
  if (!task.warehouse_id) throw new ApiError(400, "PUTAWAY_VALIDATION_ERROR", "Putaway task warehouse is required");
  if (!sourceLocationId) throw new ApiError(400, "PUTAWAY_VALIDATION_ERROR", "Putaway source location is required");
  if (!resolvedDestinationId) {
    throw new ApiError(400, "PUTAWAY_DESTINATION_REQUIRED", "Destination storage location is required");
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new ApiError(400, "PUTAWAY_VALIDATION_ERROR", "Putaway quantity must be greater than 0");
  }

  const locations = await Location.findAll({
    where: {
      tenant_id: safeTenantId,
      location_id: { [Op.in]: [sourceLocationId, resolvedDestinationId] },
    },
    raw: true,
  });
  const byId = new Map(locations.map((row) => [row.location_id, row]));
  const source = byId.get(sourceLocationId);
  const destination = byId.get(resolvedDestinationId);

  if (!source || !["receiving", "staging"].includes(source.location_type)) {
    throw new ApiError(
      400,
      "PUTAWAY_SOURCE_INVALID",
      "Putaway source must be a receiving or staging location"
    );
  }
  if (
    !destination
    || destination.location_type !== "storage"
    || destination.is_active !== true
    || !destination.bin_id
  ) {
    throw new ApiError(
      400,
      "PUTAWAY_DESTINATION_INVALID",
      "Destination must be an active bin-backed storage location"
    );
  }
  if (
    source.warehouse_id !== task.warehouse_id
    || destination.warehouse_id !== task.warehouse_id
  ) {
    throw new ApiError(
      400,
      "PUTAWAY_WAREHOUSE_MISMATCH",
      "Putaway locations must belong to the task warehouse"
    );
  }

  const posting = await postInventoryMovement({
    tenantId: safeTenantId,
    warehouseId: task.warehouse_id,
    skuId: task.sku_id,
    fromLocationId: sourceLocationId,
    toLocationId: resolvedDestinationId,
    lotNo: task.lot_no,
    serialNo: task.serial_no,
    qty,
    transactionType: "putaway",
    referenceType: "putaway_task",
    referenceId: task.putaway_task_id,
    postingKey: `${task.putaway_task_id}:complete`,
    userId,
    notes: `Putaway task ${task.putaway_task_id} completed`,
  });

  const updated = await markPutawayTaskCompleted({
    tenantId: safeTenantId,
    putawayTaskId: task.putaway_task_id,
    destinationLocationId: resolvedDestinationId,
    actualBinCode: destination.location_code,
    userId,
  });

  return {
    task: updated,
    transaction: posting.transaction,
    balances: posting.balances,
    idempotent: posting.idempotent,
  };
}

export { completePutawayInventory };
