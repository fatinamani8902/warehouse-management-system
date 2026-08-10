import * as outboundService from "../services/outboundService.js";
import { sendSuccess } from "../utils/response.js";
import { parsePagination } from "../utils/pagination.js";
import { sendListResponse } from "./helpers.js";

async function listOrders(req, res) {
  const result = await outboundService.listOrders(req.context, { ...parsePagination(req.query), ...req.query });
  return sendListResponse(res, req, result);
}

async function getOrder(req, res) {
  const data = await outboundService.getOrder(req.context, req.params.id);
  return sendSuccess(res, req, data);
}

async function createOrder(req, res) {
  const data = await outboundService.createOrder(req.context, req.body);
  return sendSuccess(res, req, data, 201);
}

async function updateOrder(req, res) {
  const data = await outboundService.updateOrder(req.context, req.params.id, req.body);
  return sendSuccess(res, req, data);
}

async function deleteOrder(req, res) {
  const data = await outboundService.deleteOrder(req.context, req.params.id);
  return sendSuccess(res, req, data);
}

async function cancelOrder(req, res) {
  const data = await outboundService.cancelOrder(req.context, req.params.id, req.body?.reason);
  return sendSuccess(res, req, data);
}

async function addOrderLine(req, res, next) {
  try {
    const data = await outboundService.addOrderLine(req.context, req.params.id, req.body);
    return sendSuccess(res, req, data);
  } catch (err) {
    return next(err);
  }
}

/* ---------- PICKING ---------- */

async function listPickingTasks(req, res) {
  const result = await outboundService.listPickingTasks(req.context, {
    ...parsePagination(req.query),
    status: req.query.status,
    assignee: req.query.assignee,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
  });
  return sendListResponse(res, req, result);
}

async function startPickingTask(req, res) {
  const data = await outboundService.updatePickingStatus(req.context, req.params.id, "in_progress");
  return sendSuccess(res, req, data);
}

async function processPickingScan(req, res) {
  const data = await outboundService.updatePickLine(
    req.context,
    req.body.pick_list_id || req.body.taskId,
    req.body.line_id || req.body.taskId,
    req.body.qty
  );
  return sendSuccess(res, req, data);
}

async function completePickingTask(req, res) {
  const data = await outboundService.completePickingTask(req.context, req.params.id);
  return sendSuccess(res, req, data);
}

/* ---------- SHIPPING ---------- */

async function confirmShipping(req, res) {
  const data = await outboundService.dispatchShipment(
    req.context,
    req.body.shipmentId,
    { carrier: req.body.carrier, tracking_no: req.body.trackingNo }
  );
  return sendSuccess(res, req, data);
}

async function releaseOrder(req, res, next) {
  try {
    const data = await outboundService.releaseOrder(req.context, req.params.id);
    return sendSuccess(res, req, data);
  } catch (err) {
    return next(err);
  }
}

export {
  listOrders,
  getOrder,
  createOrder,
  updateOrder,
  deleteOrder,
  cancelOrder,
  addOrderLine,
  releaseOrder,
  listPickingTasks,
  startPickingTask,
  processPickingScan,
  completePickingTask,
  confirmShipping,
};
