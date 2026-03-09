const API_BASE = `${import.meta.env.VITE_API_URL}/api/v1`;

function toSessionContext(authState) {
  return {
    tenant_id:
      authState?.currentTenantId ||
      authState?.tenant_id ||
      "TEN001",
    warehouse_id: authState?.currentWarehouseId || "WH001",
    user_id: authState?.currentUser?.id || "USER001",
    role_id: authState?.currentUser?.role || "warehousemanager",
    token: authState?.clerkToken || authState?.currentUser?.token || null,
  };
}

async function apiRequest(path, { method = "GET", body, session, signal } = {}) {
  if (!session?.tenant_id) {
    throw new Error("Missing tenant context. Select a tenant before making API calls.");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": session.tenant_id,
      "x-user-id": session.user_id || "",
      "x-role-id": session.role_id || "readonly",
      "x-warehouse-id": session.warehouse_id || "",
      "x-client-source": "PORTAL",
      ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function fetchSuppliers(session) {
  const response = await apiRequest("/master/suppliers", { session });
  return response.data;
}

async function createSupplier(session, payload) {
  const response = await apiRequest("/master/suppliers", {
    method: "POST",
    session,
    body: payload,
  });

  return response.data;
}

async function updateSupplier(session, supplierId, payload) {
  const response = await apiRequest(`/master/suppliers/${supplierId}`, {
    method: "PUT",
    session,
    body: payload,
  });

  return response.data;
}

function deleteSupplier(session, supplierId) {
  return apiRequest(`/master/suppliers/${supplierId}`, { method: "DELETE", session });
}

async function fetchAsns(session, params) {
  const response = await apiRequest(`/inbound/asn${toQueryString(params)}`, { session });
  return response.data;
}

function createAsn(session, payload) {
  return apiRequest("/inbound/asn", { method: "POST", session, body: payload });
}

function transitionAsn(session, asnId, action, payload) {
  return apiRequest(`/inbound/asn/${asnId}/${action}`, {
    method: "POST",
    session,
    body: payload,
  });
}

function fetchGrns(session, params) {
  return apiRequest(`/inbound/grn${toQueryString(params)}`, { session });
}

async function createGrn(session, payload) {
  const response = await apiRequest("/inbound/grn", {
    method: "POST",
    session,
    body: payload,
  });

  return response.data;
}

function transitionGrn(session, grnId, action, payload) {
  return apiRequest(`/inbound/grn/${grnId}/${action}`, {
    method: "POST",
    session,
    body: payload,
  });
}

function cancelInboundDocument(session, payload) {
  return apiRequest("/inbound/cancel", {
    method: "POST",
    session,
    body: payload,
  });
}

function fetchTraceTimeline(session, params) {
  return apiRequest(`/trace/events${toQueryString(params)}`, { session });
}

function fetchTraceEvents(session, params) {
  return fetchTraceTimeline(session, params);
}

function searchTraceEvents(session, params) {
  return apiRequest(`/trace/search${toQueryString(params)}`, { session });
}

function fetchReturns(session) {
  return apiRequest("/returns", { session });
}

function fetchReturnById(session, returnId) {
  return apiRequest(`/returns/${returnId}`, { session });
}

function createReturn(session, payload) {
  return apiRequest("/returns", { method: "POST", session, body: payload });
}

function cancelReturn(session, returnId, payload) {
  return apiRequest(`/returns/${returnId}/cancel`, {
    method: "PATCH",
    session,
    body: payload,
  });
}

function createRmaFromReturn(session, returnId, payload) {
  return apiRequest(`/returns/${returnId}/rma`, {
    method: "POST",
    session,
    body: payload,
  });
}

function fetchRmas(session) {
  return apiRequest("/rma", { session });
}

function fetchRmaById(session, rmaId) {
  return apiRequest(`/rma/${rmaId}`, { session });
}

function cancelRma(session, rmaId, payload) {
  return apiRequest(`/rma/${rmaId}/cancel`, {
    method: "PATCH",
    session,
    body: payload,
  });
}

function toQueryString(params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    query.set(key, String(value));
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

function fetchPutawayTasks(session, params) {
  return apiRequest(`/putaway-tasks${toQueryString(params)}`, { session });
}

function fetchPutawayTask(session, taskId) {
  return apiRequest(`/putaway-tasks/${taskId}`, { session });
}

function fetchPutawayTaskHistory(session, taskId) {
  return apiRequest(`/putaway-tasks/${taskId}/history`, { session });
}

function fetchPutawayOperators(session) {
  return apiRequest("/putaway-tasks/operators", { session });
}

function assignPutawayTask(session, taskId, assignedToUserId) {
  return apiRequest(`/putaway-tasks/${taskId}/assign`, {
    method: "POST",
    session,
    body: { assignedToUserId },
  });
}

function recomputePutawayBin(session, taskId) {
  return apiRequest(`/putaway-tasks/${taskId}/recompute-bin`, {
    method: "POST",
    session,
  });
}

function markPutawayTaskException(session, taskId, reason) {
  return apiRequest(`/putaway-tasks/${taskId}/mark-exception`, {
    method: "POST",
    session,
    body: { reason },
  });
}

function fetchPickLists(session, params) {
  return apiRequest(`/picking/pick-lists${toQueryString(params)}`, { session });
}

function fetchPickListById(session, pickListId) {
  return apiRequest(`/picking/pick-lists/${pickListId}`, { session });
}

function fetchPackingOrders(session, params) {
  return apiRequest(`/packing/orders${toQueryString(params)}`, { session });
}

function fetchPackingOrderById(session, packId) {
  return apiRequest(`/packing/orders/${packId}`, { session });
}

function fetchPackingOptions(session) {
  return apiRequest("/packing/options", { session });
}

function fetchShipments(session, params) {
  return apiRequest(`/shipping${toQueryString(params)}`, { session });
}

function createPackingCarton(session, packId, payload) {
  return apiRequest(`/packing/orders/${packId}/create-carton`, {
    method: "POST",
    session,
    body: payload,
  });
}

function generatePackingLabel(session, packId, payload) {
  return apiRequest(`/packing/orders/${packId}/generate-label`, {
    method: "POST",
    session,
    body: payload,
  });
}

function confirmPacking(session, packId, payload) {
  return apiRequest(`/packing/orders/${packId}/confirm-pack`, {
    method: "POST",
    session,
    body: payload,
  });
}

function fetchInventoryOptions(session) {
  return apiRequest("/inventory/options", { session });
}

function fetchInventorySummary(session, params) {
  return apiRequest(`/inventory/summary${toQueryString(params)}`, { session });
}

function fetchInventoryTransactions(session, params) {
  return apiRequest(`/inventory/transactions${toQueryString(params)}`, { session });
}

function fetchCountPlans(session, params) {
  return apiRequest(`/inventory/count-plans${toQueryString(params)}`, { session });
}

function fetchCountPlanById(session, countId) {
  return apiRequest(`/inventory/count-plans/${countId}`, { session });
}

function createCountPlan(session, payload) {
  return apiRequest("/inventory/count-plans", {
    method: "POST",
    session,
    body: payload,
  });
}

function addCountPlanEntry(session, countId, payload) {
  return apiRequest(`/inventory/count-plans/${countId}/entries`, {
    method: "POST",
    session,
    body: payload,
  });
}

function submitCountPlan(session, countId) {
  return apiRequest(`/inventory/count-plans/${countId}/submit`, {
    method: "POST",
    session,
  });
}

function approveCountPlan(session, countId, payload) {
  return apiRequest(`/inventory/count-plans/${countId}/approve`, {
    method: "POST",
    session,
    body: payload,
  });
}

function rejectCountPlan(session, countId, payload) {
  return apiRequest(`/inventory/count-plans/${countId}/reject`, {
    method: "POST",
    session,
    body: payload,
  });
}

function cancelCountPlan(session, countId, payload) {
  return apiRequest(`/inventory/count-plans/${countId}/cancel`, {
    method: "POST",
    session,
    body: payload,
  });
}

function fetchAdjustmentRequests(session, params) {
  return apiRequest(`/inventory/adjustments${toQueryString(params)}`, { session });
}

function createAdjustmentRequest(session, payload) {
  return apiRequest("/inventory/adjustments", {
    method: "POST",
    session,
    body: payload,
  });
}

function submitAdjustmentRequest(session, adjId) {
  return apiRequest(`/inventory/adjustments/${adjId}/submit`, {
    method: "POST",
    session,
  });
}

function approveAdjustmentRequest(session, adjId, payload) {
  return apiRequest(`/inventory/adjustments/${adjId}/approve`, {
    method: "POST",
    session,
    body: payload,
  });
}

function rejectAdjustmentRequest(session, adjId, payload) {
  return apiRequest(`/inventory/adjustments/${adjId}/reject`, {
    method: "POST",
    session,
    body: payload,
  });
}

function cancelAdjustmentRequest(session, adjId, payload) {
  return apiRequest(`/inventory/adjustments/${adjId}/cancel`, {
    method: "POST",
    session,
    body: payload,
  });
}

export {
  addCountPlanEntry,
  approveAdjustmentRequest,
  approveCountPlan,
  assignPutawayTask,
  cancelAdjustmentRequest,
  cancelCountPlan,
  cancelReturn,
  cancelRma,
  cancelInboundDocument,
  createAdjustmentRequest,
  createAsn,
  createCountPlan,
  createGrn,
  createReturn,
  createRmaFromReturn,
  createSupplier,
  deleteSupplier,
  fetchAsns,
  fetchAdjustmentRequests,
  fetchCountPlanById,
  fetchCountPlans,
  fetchGrns,
  fetchInventoryOptions,
  fetchInventorySummary,
  fetchInventoryTransactions,
  fetchReturnById,
  fetchReturns,
  fetchPutawayOperators,
  fetchPutawayTask,
  fetchPutawayTaskHistory,
  fetchPutawayTasks,
  fetchPickLists,
  fetchPickListById,
  fetchPackingOrders,
  fetchPackingOrderById,
  fetchPackingOptions,
  fetchShipments,
  fetchRmaById,
  fetchRmas,
  fetchSuppliers,
  fetchTraceTimeline,
  fetchTraceEvents,
  searchTraceEvents,
  createPackingCarton,
  generatePackingLabel,
  confirmPacking,
  markPutawayTaskException,
  rejectAdjustmentRequest,
  rejectCountPlan,
  recomputePutawayBin,
  submitAdjustmentRequest,
  submitCountPlan,
  toSessionContext,
  transitionAsn,
  transitionGrn,
  updateSupplier,
};
