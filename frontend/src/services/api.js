const API_BASE = `${import.meta.env.VITE_API_URL}/api/v1`;

function isPutawayCompleteDebugEnabled() {
  return typeof window !== "undefined" && window.localStorage?.getItem("wms.debug.putawayComplete") === "1";
}

function resolveWarehouseId(authState) {
  const warehouses = authState?.currentUser?.warehouse_ids;
  const defaultWarehouse = Array.isArray(warehouses) && warehouses.length > 0 ? warehouses[0] : "";
  return (
    authState?.currentWarehouseId
    || authState?.warehouse_id
    || authState?.currentUser?.warehouse_id
    || authState?.currentUser?.default_warehouse_id
    || defaultWarehouse
    || ""
  );
}

function toSessionContext(authState) {
  const currentUser = authState?.currentUser || {};
  return {
    tenant_id: authState?.currentTenantId || authState?.tenant_id || currentUser.tenant_id || "",
    warehouse_id: resolveWarehouseId(authState),
    user_id: authState?.user_id || currentUser.user_id || currentUser.id || currentUser.userId || "",
    role_id: authState?.role_id || currentUser.role_id || currentUser.role || "",
    token: authState?.clerkToken || authState?.currentToken || currentUser.token || null,
  };
}

async function apiRequest(path, { method = "GET", body, session, signal } = {}) {
  if (!session?.tenant_id) {
    throw new Error("Missing tenant context. Select a tenant before making API calls.");
  }
  if (path.startsWith("/inventory/count-plans") && !session?.warehouse_id) {
    throw new Error("Warehouse context is required.");
  }

  const url = `${API_BASE}${path}`;
  if (isPutawayCompleteDebugEnabled() && path.includes("/putaway-tasks/") && path.endsWith("/complete")) {
    console.info("[WMS Putaway Complete] request", {
      url,
      method,
      tenant_id: session.tenant_id,
      warehouse_id: session.warehouse_id,
      user_id: session.user_id,
      role_id: session.role_id,
      body,
    });
  }

  const headers = {
    "Content-Type": "application/json",
    "x-tenant-id": session.tenant_id,
    "x-user-id": session.user_id || "",
    "x-roles": session.role_id || "superadmin",
    "x-warehouse-id": session.warehouse_id || "",
    "x-client-source": "PORTAL",
    ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
  };
  const requestOptions = {
    method,
    headers,
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  };

  let response;
  try {
    response = await fetch(url, requestOptions);
  } catch (error) {
    if (isPutawayCompleteDebugEnabled() && path.includes("/putaway-tasks/") && path.endsWith("/complete")) {
      console.error("[WMS Putaway Complete] fetch failed before backend", {
        errorName: error?.name,
        errorMessage: error?.message,
        errorStack: error?.stack,
        url,
        method,
        headers,
        body,
        apiBase: API_BASE,
        viteApiUrl: import.meta.env.VITE_API_URL,
      });
    }
    throw error;
  }

  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);
  if (isPutawayCompleteDebugEnabled() && path.includes("/putaway-tasks/") && path.endsWith("/complete")) {
    console.info("[WMS Putaway Complete] response", {
      url: response.url,
      status: response.status,
      headers: {
        build: response.headers.get("x-wms-build"),
        processId: response.headers.get("x-wms-process-id"),
        completionServiceVersion: response.headers.get("x-wms-completion-service-version"),
      },
      body: data,
    });
  }
  if (!response.ok) {
    const message = data?.message || data?.error?.message || `Request failed with status ${response.status}`;
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
  return apiRequest(`/master/suppliers/${supplierId}`, {
    method: "DELETE",
    session,
    body: { confirmDelete: true },
  });
}

// ─── SKU MASTER ───────────────────────────────────────────────────────────────

async function listSkus(session, params) {
  const response = await apiRequest(`/master/skus${toQueryString(params)}`, { session });
  return response;
}

async function getSku(session, skuId) {
  const response = await apiRequest(`/master/skus/${skuId}`, { session });
  return response.data;
}

async function lookupSkus(session, search = "") {
  const response = await apiRequest(`/master/skus/lookup${toQueryString({ search })}`, { session });
  return Array.isArray(response?.data) ? response.data : [];
}

async function createSku(session, payload) {
  const response = await apiRequest("/master/skus", { method: "POST", session, body: payload });
  return response.data;
}

async function updateSku(session, skuId, payload) {
  const response = await apiRequest(`/master/skus/${skuId}`, { method: "PUT", session, body: payload });
  return response.data;
}

function deleteSku(session, skuId) {
  return apiRequest(`/master/skus/${skuId}`, {
    method: "DELETE",
    session,
    body: { confirmDelete: true },
  });
}

const fetchSkus = listSkus;

// ─── LOCATIONS ────────────────────────────────────────────────────────────────

async function fetchLocations(session, params) {
  const response = await apiRequest(`/master/locations${toQueryString(params)}`, { session });
  return response;
}

async function listLocations(session, params) {
  return apiRequest(`/locations${toQueryString(params)}`, { session });
}

async function lookupLocations(session, params) {
  const response = await apiRequest(`/locations/lookup${toQueryString(params)}`, { session });
  return Array.isArray(response?.data) ? response.data : [];
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

async function fetchEligibleGrnAsns(session) {
  const response = await apiRequest("/inbound/grn/eligible-asns", { session });
  return Array.isArray(response.data) ? response.data : [];
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

function fetchReturnAuditTrail(session, returnId, params) {
  return apiRequest(`/returns/${returnId}/audit-trail${toQueryString(params)}`, { session });
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

function fetchRmaAuditTrail(session, rmaId, params) {
  return apiRequest(`/rmas/${rmaId}/audit-trail${toQueryString(params)}`, { session });
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

function fetchPickingOperators(session) {
  return apiRequest("/picking/operators", { session });
}

function assignPickList(session, pickListId, assignedToUserId) {
  return apiRequest(`/picking/pick-lists/${pickListId}/assign`, {
    method: "POST",
    session,
    body: { assignedToUserId },
  });
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

function generatePackingCarton(session, packId) {
  return apiRequest(`/packing/orders/${packId}/carton`, { method: "POST", session });
}

function confirmPacking(session, packId, payload) {
  return apiRequest(`/packing/orders/${packId}/confirm-pack`, { method: "POST", session, body: payload });
}

// ─── SHIPPING ─────────────────────────────────────────────────────────────────

function fetchShipments(session, params) {
  return apiRequest(`/shipping${toQueryString(params)}`, { session });
}

function dispatchShipment(session, shipmentId, payload) {
  return apiRequest(`/shipping/${shipmentId}/dispatch`, { method: "POST", session, body: payload });
}

function closeShipment(session, shipmentId) {
  return apiRequest(`/shipping/${shipmentId}/close`, { method: "POST", session });
}

function cancelShipment(session, shipmentId, reason) {
  return apiRequest(`/shipping/${shipmentId}/cancel`, { method: "POST", session, body: { reason } });
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

function fetchDashboardSummary(session, options = {}) {
  return apiRequest("/dashboard/summary", { session, signal: options.signal });
}

// ─── INVENTORY ────────────────────────────────────────────────────────────────

function fetchInventoryOptions(session) {
  return apiRequest("/inventory/options", { session });
}

function fetchInventorySummary(session, params) {
  return apiRequest(`/inventory/summary${toQueryString(params)}`, { session });
}

function fetchInventoryBalances(session, params) {
  return apiRequest(`/inventory/balances${toQueryString(params)}`, { session });
}

function fetchAdjustmentLocations(session, params) {
  return apiRequest(`/inventory/adjustment-locations${toQueryString(params)}`, { session });
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

function updateCountPlan(session, countId, payload) {
  return apiRequest(`/inventory/count-plans/${countId}`, { method: "PATCH", session, body: payload });
}

function fetchCountPlanOperators(session) {
  return apiRequest("/inventory/count-plans/operators", { session });
}

function assignCountPlan(session, countId, payload) {
  return apiRequest(`/inventory/count-plans/${countId}/assign`, { method: "POST", session, body: payload });
}

function startCountPlan(session, countId) {
  return apiRequest(`/inventory/count-plans/${countId}/start`, { method: "POST", session });
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

function cancelOrder(session, orderId, reason) {
  return apiRequest(`/outbound/orders/${orderId}/cancel`, { method: "POST", session, body: { reason } });
}

function releaseOrder(session, orderId) {
  return apiRequest(`/outbound/orders/${orderId}/release`, { method: "POST", session });
}

function addOrderLine(session, orderId, payload) {
  return apiRequest(`/outbound/orders/${orderId}/lines`, { method: "POST", session, body: payload });
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

function deleteLovGroup(session, groupId) {
  return apiRequest(`/lov/groups/${groupId}`, {
    method: "DELETE",
    session,
    body: { confirmDelete: true },
  });
}

function addLovValue(session, groupId, payload) {
  return apiRequest(`/lov/groups/${groupId}/values`, { method: "POST", session, body: payload });
}

function updateLovValue(session, groupId, lovValueId, payload) {
  return apiRequest(`/lov/groups/${groupId}/values/${lovValueId}`, { method: "PUT", session, body: payload });
}

function deleteLovValue(session, groupId, lovValueId) {
  return apiRequest(`/lov/groups/${groupId}/values/${lovValueId}`, {
    method: "DELETE",
    session,
    body: { confirmDelete: true },
  });
}

// ─── AUDIT ────────────────────────────────────────────────────────────────────

function fetchAuditOptions(session) {
  return apiRequest("/audit/options", { session });
}

function fetchAuditLogs(session, params) {
  return apiRequest(`/audit/logs${toQueryString(params)}`, { session });
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

// ─── TAXONOMY ZONES ───────────────────────────────────────────────────────────

function fetchLocationTaxonomyTree(session, params) {
  return apiRequest(`/master/taxonomy/tree${toQueryString(params)}`, { session });
}

function listLocationTaxonomy(session, resource, params) {
  return apiRequest(`/master/taxonomy/${resource}${toQueryString(params)}`, { session });
}

function createLocationTaxonomy(session, resource, payload) {
  return apiRequest(`/master/taxonomy/${resource}`, { method: "POST", session, body: payload });
}

function updateLocationTaxonomy(session, resource, id, payload) {
  return apiRequest(`/master/taxonomy/${resource}/${id}`, { method: "PUT", session, body: payload });
}

function deleteLocationTaxonomy(session, resource, id) {
  return apiRequest(`/master/taxonomy/${resource}/${id}`, {
    method: "DELETE",
    session,
    body: { confirmDelete: true },
  });
}

function fetchTaxonomyZones(session, params) {
  return apiRequest(`/master/taxonomy/zones${toQueryString(params)}`, { session });
}
function createTaxonomyZone(session, payload) {
  return apiRequest("/master/taxonomy/zones", { method: "POST", session, body: payload });
}
function updateTaxonomyZone(session, zoneId, payload) {
  return apiRequest(`/master/taxonomy/zones/${zoneId}`, { method: "PUT", session, body: payload });
}
function deleteTaxonomyZone(session, zoneId) {
  return apiRequest(`/master/taxonomy/zones/${zoneId}`, {
    method: "DELETE", session, body: { confirmDelete: true },
  });
}

// ─── TAXONOMY AISLES ──────────────────────────────────────────────────────────

function fetchAisles(session, params) {
  return apiRequest(`/master/taxonomy/aisles${toQueryString(params)}`, { session });
}
function createAisle(session, payload) {
  return apiRequest("/master/taxonomy/aisles", { method: "POST", session, body: payload });
}
function updateAisle(session, aisleId, payload) {
  return apiRequest(`/master/taxonomy/aisles/${aisleId}`, { method: "PUT", session, body: payload });
}
function deleteAisle(session, aisleId) {
  return apiRequest(`/master/taxonomy/aisles/${aisleId}`, {
    method: "DELETE", session, body: { confirmDelete: true },
  });
}

// ─── TAXONOMY BAYS ────────────────────────────────────────────────────────────

function fetchBays(session, params) {
  return apiRequest(`/master/taxonomy/bays${toQueryString(params)}`, { session });
}
function createBay(session, payload) {
  return apiRequest("/master/taxonomy/bays", { method: "POST", session, body: payload });
}
function updateBay(session, bayId, payload) {
  return apiRequest(`/master/taxonomy/bays/${bayId}`, { method: "PUT", session, body: payload });
}
function deleteBay(session, bayId) {
  return apiRequest(`/master/taxonomy/bays/${bayId}`, {
    method: "DELETE", session, body: { confirmDelete: true },
  });
}

// ─── TAXONOMY LEVELS ──────────────────────────────────────────────────────────

function fetchLevels(session, params) {
  return apiRequest(`/master/taxonomy/levels${toQueryString(params)}`, { session });
}
function createLevel(session, payload) {
  return apiRequest("/master/taxonomy/levels", { method: "POST", session, body: payload });
}
function updateLevel(session, levelId, payload) {
  return apiRequest(`/master/taxonomy/levels/${levelId}`, { method: "PUT", session, body: payload });
}
function deleteLevel(session, levelId) {
  return apiRequest(`/master/taxonomy/levels/${levelId}`, {
    method: "DELETE", session, body: { confirmDelete: true },
  });
}

// ─── TAXONOMY BINS ────────────────────────────────────────────────────────────

function fetchBins(session, params) {
  return apiRequest(`/master/taxonomy/bins${toQueryString(params)}`, { session });
}
function createBin(session, payload) {
  return apiRequest("/master/taxonomy/bins", { method: "POST", session, body: payload });
}
function updateBin(session, binId, payload) {
  return apiRequest(`/master/taxonomy/bins/${binId}`, { method: "PUT", session, body: payload });
}
function deleteBin(session, binId) {
  return apiRequest(`/master/taxonomy/bins/${binId}`, {
    method: "DELETE", session, body: { confirmDelete: true },
  });
}

// ─── SHELF DIMENSION CALCULATOR ───────────────────────────────────────────────

function calcShelfDimension(session, payload) {
  return apiRequest("/master/taxonomy/shelf-calc", { method: "POST", session, body: payload });
}


export {
  toSessionContext,
  // Suppliers
  fetchSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  // SKU
  listSkus,
  getSku,
  lookupSkus,
  createSku,
  updateSku,
  deleteSku,
  fetchSkus,
  // Locations
  fetchLocations,
  listLocations,
  lookupLocations,
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
  fetchEligibleGrnAsns,
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
  fetchReturnAuditTrail,
  createRmaFromReturn,
  fetchRmas,
  fetchRmaById,
  cancelRma,
  fetchRmaAuditTrail,
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
  fetchPickingOperators,
  assignPickList,
  // Packing
  fetchPackingOrders,
  fetchPackingOrderById,
  fetchPackingOptions,
  generatePackingCarton,
  confirmPacking,
  // Shipping
  fetchShipments,
  dispatchShipment,
  closeShipment,
  cancelShipment,
  // Dashboard
  fetchDashboardSummary,
  // Inventory
  fetchInventoryOptions,
  fetchAdjustmentLocations,
  fetchInventoryBalances,
  fetchInventorySummary,
  fetchInventoryTransactions,
  fetchCountPlans,
  fetchCountPlanById,
  createCountPlan,
  updateCountPlan,
  fetchCountPlanOperators,
  assignCountPlan,
  startCountPlan,
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
  cancelOrder,
  releaseOrder,
  addOrderLine,
  // LOV
  fetchLovGroups,
fetchLovGroupById,
createLovGroup,
deleteLovGroup,
addLovValue,
updateLovValue,
deleteLovValue,
// Audit
fetchAuditOptions,
fetchAuditLogs,
  // Taxonomy
  fetchLocationTaxonomyTree, listLocationTaxonomy,
  createLocationTaxonomy, updateLocationTaxonomy, deleteLocationTaxonomy,
  fetchTaxonomyZones, createTaxonomyZone, updateTaxonomyZone, deleteTaxonomyZone,
  fetchAisles, createAisle, updateAisle, deleteAisle,
  fetchBays, createBay, updateBay, deleteBay,
  fetchLevels, createLevel, updateLevel, deleteLevel,
  fetchBins, createBin, updateBin, deleteBin,
  calcShelfDimension,
};
