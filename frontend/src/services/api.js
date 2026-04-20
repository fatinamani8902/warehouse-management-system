const API_BASE = `${import.meta.env.VITE_API_URL}/api/v1`;

function toSessionContext(authState) {
  return {
    tenant_id: authState?.currentTenantId || authState?.tenant_id || "TNT000001",
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
      "x-roles": session.role_id || "superadmin",
      "x-warehouse-id": session.warehouse_id || "",
      "x-client-source": "PORTAL",
      ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function toQueryString(params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

// ─── SUPPLIERS ────────────────────────────────────────────────────────────────

async function fetchSuppliers(session) {
  const response = await apiRequest("/master/suppliers", { session });
  return response.data;
}

async function createSupplier(session, payload) {
  const response = await apiRequest("/master/suppliers", { method: "POST", session, body: payload });
  return response.data;
}

async function updateSupplier(session, supplierId, payload) {
  const response = await apiRequest(`/master/suppliers/${supplierId}`, { method: "PUT", session, body: payload });
  return response.data;
}

function deleteSupplier(session, supplierId) {
  return apiRequest(`/master/suppliers/${supplierId}`, { method: "DELETE", session });
}

// ─── SKU MASTER ───────────────────────────────────────────────────────────────

async function fetchSkus(session, params) {
  const response = await apiRequest(`/master/skus${toQueryString(params)}`, { session });
  return response;
}

async function createSkuApi(session, payload) {
  const response = await apiRequest("/master/skus", { method: "POST", session, body: payload });
  return response;
}

async function updateSkuApi(session, skuId, payload) {
  const response = await apiRequest(`/master/skus/${skuId}`, { method: "PUT", session, body: payload });
  return response;
}

function deleteSkuApi(session, skuId) {
  return apiRequest(`/master/skus/${skuId}`, { method: "DELETE", session });
}

// ─── LOCATIONS ────────────────────────────────────────────────────────────────

async function fetchLocations(session, params) {
  const response = await apiRequest(`/master/locations${toQueryString(params)}`, { session });
  return response;
}

async function createLocationApi(session, payload) {
  const response = await apiRequest("/master/locations", { method: "POST", session, body: payload });
  return response;
}

async function updateLocationApi(session, locationId, payload) {
  const response = await apiRequest(`/master/locations/${locationId}`, { method: "PUT", session, body: payload });
  return response;
}

function deleteLocationApi(session, locationId) {
  return apiRequest(`/master/locations/${locationId}`, { method: "DELETE", session });
}

// ─── WAREHOUSES ───────────────────────────────────────────────────────────────

async function fetchWarehouses(session, params) {
  const response = await apiRequest(`/master/warehouses${toQueryString(params)}`, { session });
  return response;
}

async function createWarehouseApi(session, payload) {
  const response = await apiRequest("/master/warehouses", { method: "POST", session, body: payload });
  return response;
}

async function updateWarehouseApi(session, warehouseId, payload) {
  const response = await apiRequest(`/master/warehouses/${warehouseId}`, { method: "PUT", session, body: payload });
  return response;
}

function deleteWarehouseApi(session, warehouseId) {
  return apiRequest(`/master/warehouses/${warehouseId}`, { method: "DELETE", session });
}

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────

async function fetchCustomers(session, params) {
  const response = await apiRequest(`/master/customers${toQueryString(params)}`, { session });
  return response;
}

async function createCustomerApi(session, payload) {
  const response = await apiRequest("/master/customers", { method: "POST", session, body: payload });
  return response;
}

async function updateCustomerApi(session, customerId, payload) {
  const response = await apiRequest(`/master/customers/${customerId}`, { method: "PUT", session, body: payload });
  return response;
}

function deleteCustomerApi(session, customerId) {
  return apiRequest(`/master/customers/${customerId}`, { method: "DELETE", session });
}

// ─── INBOUND ──────────────────────────────────────────────────────────────────

async function fetchAsns(session, params) {
  const response = await apiRequest(`/inbound/asn${toQueryString(params)}`, { session });
  return response.data;
}

function createAsn(session, payload) {
  return apiRequest("/inbound/asn", { method: "POST", session, body: payload });
}

function transitionAsn(session, asnId, action, payload) {
  return apiRequest(`/inbound/asn/${asnId}/${action}`, { method: "POST", session, body: payload });
}

function fetchGrns(session, params) {
  return apiRequest(`/inbound/grn${toQueryString(params)}`, { session });
}

async function createGrn(session, payload) {
  const response = await apiRequest("/inbound/grn", { method: "POST", session, body: payload });
  return response.data;
}

function transitionGrn(session, grnId, action, payload) {
  return apiRequest(`/inbound/grn/${grnId}/${action}`, { method: "POST", session, body: payload });
}

function cancelInboundDocument(session, payload) {
  return apiRequest("/inbound/cancel", { method: "POST", session, body: payload });
}

function updateGrnLines(session, grnId, lines) {
  return apiRequest(`/inbound/grn/${grnId}/lines`, {
    method: "PATCH",
    session,
    body: { lines },
  });
}

// ─── TRACE ────────────────────────────────────────────────────────────────────

function fetchTraceTimeline(session, params) {
  return apiRequest(`/trace/events${toQueryString(params)}`, { session });
}

function fetchTraceEvents(session, params) {
  return fetchTraceTimeline(session, params);
}

function searchTraceEvents(session, params) {
  return apiRequest(`/trace/search${toQueryString(params)}`, { session });
}

// ─── RETURNS ──────────────────────────────────────────────────────────────────

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
  return apiRequest(`/returns/${returnId}/cancel`, { method: "PATCH", session, body: payload });
}

function createRmaFromReturn(session, returnId, payload) {
  return apiRequest(`/returns/${returnId}/rma`, { method: "POST", session, body: payload });
}

function fetchRmas(session) {
  return apiRequest("/rma", { session });
}

function fetchRmaById(session, rmaId) {
  return apiRequest(`/rma/${rmaId}`, { session });
}

function cancelRma(session, rmaId, payload) {
  return apiRequest(`/rma/${rmaId}/cancel`, { method: "PATCH", session, body: payload });
}

// ─── PUTAWAY ──────────────────────────────────────────────────────────────────

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
  return apiRequest(`/putaway-tasks/${taskId}/assign`, { method: "POST", session, body: { assignedToUserId } });
}

function recomputePutawayBin(session, taskId) {
  return apiRequest(`/putaway-tasks/${taskId}/recompute-bin`, { method: "POST", session });
}

function markPutawayTaskException(session, taskId, reason) {
  return apiRequest(`/putaway-tasks/${taskId}/mark-exception`, { method: "POST", session, body: { reason } });
}

function completePutawayTask(session, taskId, payload) {
  return apiRequest(`/putaway-tasks/${taskId}/complete`, { method: "POST", session, body: payload });
}

// ─── PICKING ──────────────────────────────────────────────────────────────────

function fetchPickLists(session, params) {
  return apiRequest(`/picking/pick-lists${toQueryString(params)}`, { session });
}

async function fetchPickListById(session, pickListId) {
  const res = await apiRequest(`/picking/pick-lists/${pickListId}`, { session });
  return res?.data ?? null;
}

// ─── PACKING ──────────────────────────────────────────────────────────────────

function fetchPackingOrders(session, params) {
  return apiRequest(`/packing/orders${toQueryString(params)}`, { session });
}

function fetchPackingOrderById(session, packId) {
  return apiRequest(`/packing/orders/${packId}`, { session });
}

function fetchPackingOptions(session) {
  return apiRequest("/packing/options", { session });
}

function confirmPacking(session, packId, payload) {
  return apiRequest(`/packing/orders/${packId}/confirm-pack`, { method: "POST", session, body: payload });
}

// ─── SHIPPING ─────────────────────────────────────────────────────────────────

function fetchShipments(session, params) {
  return apiRequest(`/shipping${toQueryString(params)}`, { session });
}

// ─── INVENTORY ────────────────────────────────────────────────────────────────

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
  return apiRequest("/inventory/count-plans", { method: "POST", session, body: payload });
}

function addCountPlanEntry(session, countId, payload) {
  return apiRequest(`/inventory/count-plans/${countId}/entries`, { method: "POST", session, body: payload });
}

function submitCountPlan(session, countId) {
  return apiRequest(`/inventory/count-plans/${countId}/submit`, { method: "POST", session });
}

function approveCountPlan(session, countId, payload) {
  return apiRequest(`/inventory/count-plans/${countId}/approve`, { method: "POST", session, body: payload });
}

function rejectCountPlan(session, countId, payload) {
  return apiRequest(`/inventory/count-plans/${countId}/reject`, { method: "POST", session, body: payload });
}

function cancelCountPlan(session, countId, payload) {
  return apiRequest(`/inventory/count-plans/${countId}/cancel`, { method: "POST", session, body: payload });
}

function fetchAdjustmentRequests(session, params) {
  return apiRequest(`/inventory/adjustments${toQueryString(params)}`, { session });
}

function createAdjustmentRequest(session, payload) {
  return apiRequest("/inventory/adjustments", { method: "POST", session, body: payload });
}

function submitAdjustmentRequest(session, adjId) {
  return apiRequest(`/inventory/adjustments/${adjId}/submit`, { method: "POST", session });
}

function approveAdjustmentRequest(session, adjId, payload) {
  return apiRequest(`/inventory/adjustments/${adjId}/approve`, { method: "POST", session, body: payload });
}

function rejectAdjustmentRequest(session, adjId, payload) {
  return apiRequest(`/inventory/adjustments/${adjId}/reject`, { method: "POST", session, body: payload });
}

function cancelAdjustmentRequest(session, adjId, payload) {
  return apiRequest(`/inventory/adjustments/${adjId}/cancel`, { method: "POST", session, body: payload });
}

// ─── OUTBOUND ORDERS ──────────────────────────────────────────────────────────

function fetchOrders(session, params) {
  return apiRequest(`/outbound/orders${toQueryString(params)}`, { session });
}

function fetchOrderById(session, orderId) {
  return apiRequest(`/outbound/orders/${orderId}`, { session });
}

function createOrder(session, payload) {
  return apiRequest("/outbound/orders", { method: "POST", session, body: payload });
}

function updateOrder(session, orderId, payload) {
  return apiRequest(`/outbound/orders/${orderId}`, { method: "PUT", session, body: payload });
}

function deleteOrder(session, orderId) {
  return apiRequest(`/outbound/orders/${orderId}`, { method: "DELETE", session });
}

function releaseOrder(session, orderId) {
  return apiRequest(`/outbound/orders/${orderId}/release`, { method: "POST", session });
}

// ─── LOV ──────────────────────────────────────────────────────────────────────

function fetchLovGroups(session, params) {
  return apiRequest(`/lov/groups${toQueryString(params)}`, { session });
}

function fetchLovGroupById(session, groupId) {
  return apiRequest(`/lov/groups/${groupId}`, { session });
}

function createLovGroup(session, payload) {
  return apiRequest("/lov/groups", { method: "POST", session, body: payload });
}

function addLovValue(session, groupId, value) {
  return apiRequest(`/lov/groups/${groupId}/values`, { method: "POST", session, body: { value } });
}

function updateLovValue(session, groupId, valueIndex, value) {
  return apiRequest(`/lov/groups/${groupId}/values/${valueIndex}`, { method: "PUT", session, body: { value } });
}

function deleteLovValue(session, groupId, valueIndex) {
  return apiRequest(`/lov/groups/${groupId}/values/${valueIndex}`, { method: "DELETE", session });
}

// ─── AUDIT ────────────────────────────────────────────────────────────────────

function fetchAuditOptions(session) {
  return apiRequest("/audit/options", { session });
}

function fetchAuditLogs(session, params) {
  return apiRequest(`/audit/logs${toQueryString(params)}`, { session });
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

export {
  toSessionContext,
  // Suppliers
  fetchSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  // SKU
  fetchSkus,
  createSkuApi,
  updateSkuApi,
  deleteSkuApi,
  // Locations
  fetchLocations,
  createLocationApi,
  updateLocationApi,
  deleteLocationApi,
  // Warehouses
  fetchWarehouses,
  createWarehouseApi,
  updateWarehouseApi,
  deleteWarehouseApi,
  // Customers
  fetchCustomers,
  createCustomerApi,
  updateCustomerApi,
  deleteCustomerApi,
  // Inbound
  fetchAsns,
  createAsn,
  transitionAsn,
  fetchGrns,
  createGrn,
  updateGrnLines,
  transitionGrn,
  cancelInboundDocument,
  // Trace
  fetchTraceTimeline,
  fetchTraceEvents,
  searchTraceEvents,
  // Returns
  fetchReturns,
  fetchReturnById,
  createReturn,
  cancelReturn,
  createRmaFromReturn,
  fetchRmas,
  fetchRmaById,
  cancelRma,
  // Putaway
  fetchPutawayTasks,
  fetchPutawayTask,
  fetchPutawayTaskHistory,
  fetchPutawayOperators,
  assignPutawayTask,
  recomputePutawayBin,
  markPutawayTaskException,
  completePutawayTask,
  // Picking
  fetchPickLists,
  fetchPickListById,
  // Packing
  fetchPackingOrders,
  fetchPackingOrderById,
  fetchPackingOptions,
  confirmPacking,
  // Shipping
  fetchShipments,
  // Inventory
  fetchInventoryOptions,
  fetchInventorySummary,
  fetchInventoryTransactions,
  fetchCountPlans,
  fetchCountPlanById,
  createCountPlan,
  addCountPlanEntry,
  submitCountPlan,
  approveCountPlan,
  rejectCountPlan,
  cancelCountPlan,
  fetchAdjustmentRequests,
  createAdjustmentRequest,
  submitAdjustmentRequest,
  approveAdjustmentRequest,
  rejectAdjustmentRequest,
  cancelAdjustmentRequest,
  // Outbound
  fetchOrders,
  fetchOrderById,
  createOrder,
  updateOrder,
  deleteOrder,
  releaseOrder,
  // LOV
  fetchLovGroups,
fetchLovGroupById,
createLovGroup,
addLovValue,
updateLovValue,
deleteLovValue,
// Audit
fetchAuditOptions,
fetchAuditLogs,
};