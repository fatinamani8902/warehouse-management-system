import * as outboundService from "../services/outboundService.js";
import { sendSuccess } from "../utils/response.js";
import { parsePagination } from "../utils/pagination.js";
import { sendListResponse } from "./helpers.js";

function listOrders(req, res) {
  const result = outboundService.listOrders(req.context, parsePagination(req.query));
  return sendListResponse(res, req, result);
}

function getOrder(req, res) {
  const data = outboundService.getOrder(req.context, req.params.id);
  return sendSuccess(res, req, data);
}

function createOrder(req, res) {
  const data = outboundService.createOrder(req.context, req.body);
  return sendSuccess(res, req, data, 201);
}

function updateOrder(req, res) {
  const data = outboundService.updateOrder(req.context, req.params.id, req.body);
  return sendSuccess(res, req, data);
}

function deleteOrder(req, res) {
  const data = outboundService.deleteOrder(req.context, req.params.id);
  return sendSuccess(res, req, data);
}

/* ---------- RELEASE ORDER (NEW) ---------- */

function releaseOrder(req, res) {
  const data = outboundService.releaseOrder(req.context, req.params.id);
  return sendSuccess(res, req, data);
}

/* ---------- PICKING ---------- */

function listPickingTasks(req, res) {
  const result = outboundService.listPickingTasks(req.context, {
    ...parsePagination(req.query),
    status: req.query.status,
    assignee: req.query.assignee,
  });
  return sendListResponse(res, req, result);
}

function startPickingTask(req, res) {
  const data = outboundService.startPickingTask(req.context, req.params.id);
  return sendSuccess(res, req, data);
}

function processPickingScan(req, res) {
  const data = outboundService.processPickingScan(req.context, req.body);
  return sendSuccess(res, req, data);
}

function completePickingTask(req, res) {
  const data = outboundService.completePickingTask(req.context, req.params.id);
  return sendSuccess(res, req, data);
}

/* ---------- SHIPPING ---------- */

function confirmShipping(req, res) {
  const data = outboundService.confirmShipping(req.context, req.body);
  return sendSuccess(res, req, data);
}

export {
  listOrders,
  getOrder,
  createOrder,
  updateOrder,
  deleteOrder,
  releaseOrder, // ✅ NEW EXPORT
  listPickingTasks,
  startPickingTask,
  processPickingScan,
  completePickingTask,
  confirmShipping,
};