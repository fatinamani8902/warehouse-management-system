import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { buildSessionHeaders } from "@/utils/sessionHeaders";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
    "x-client-source": "MOBILE",
  },
  timeout: 30000,
});

// Auto-attach JWT token to every request
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const token = await SecureStore.getItemAsync("wms_token");
      if (token) {
        config.headers["Authorization"] = `Bearer ${token}`;
      }
    } catch (_) {}
    return config;
  },
  (error) => Promise.reject(error),
);

// Mask password in error logs
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.config?.data) {
      try {
        const body = JSON.parse(error.config.data);
        if (body.password) body.password = "***";
        error.config.data = JSON.stringify(body);
      } catch (_) {}
    }
    return Promise.reject(error);
  },
);

// Session headers (tenant, warehouse, user, role)
export const setSessionHeaders = (session: {
  tenant_id?: string;
  warehouse_id?: string;
  warehouse_ids?: string[];
  user_id?: string;
  role_id?: string;
}) => {
  const headers = buildSessionHeaders(session);
  apiClient.defaults.headers["x-tenant-id"] = headers["x-tenant-id"];
  apiClient.defaults.headers["x-warehouse-id"] = headers["x-warehouse-id"];
  apiClient.defaults.headers["x-user-id"] = headers["x-user-id"];
  apiClient.defaults.headers["x-roles"] = headers["x-roles"];
};

export const clearSessionHeaders = () => {
  delete apiClient.defaults.headers["x-tenant-id"];
  delete apiClient.defaults.headers["x-warehouse-id"];
  delete apiClient.defaults.headers["x-user-id"];
  delete apiClient.defaults.headers["x-roles"];
};

// ── INBOUND — ASN ─────────────────────────────────────────────────

export const fetchAsns = (params?: object) =>
  apiClient.get("/inbound/asn", { params });

export const createAsn = (payload: object) =>
  apiClient.post("/inbound/asn", payload);

export const transitionAsn = (asnId: string, action: string, payload?: object) =>
  apiClient.post(`/inbound/asn/${asnId}/${action}`, payload || {});

// ── INBOUND — GRN ─────────────────────────────────────────────────

export const fetchGrns = (params?: object) =>
  apiClient.get("/inbound/grn", { params });

export const fetchGrnById = (grnId: string) =>
  apiClient.get(`/inbound/grn/${grnId}`);

export const createGrn = (payload: object) =>
  apiClient.post("/inbound/grn", payload);

export const transitionGrn = (grnId: string, action: string, payload?: object) =>
  apiClient.post(`/inbound/grn/${grnId}/${action}`, payload || {});

export const updateGrnLines = (grnId: string, lines: object[]) =>
  apiClient.patch(`/inbound/grn/${grnId}/lines`, { lines });

// ── INBOUND — CANCEL ──────────────────────────────────────────────

export const cancelInboundDocument = (
  documentId: string,
  documentType: "asn" | "grn",
  cancellationReason: string,
) =>
  apiClient.post("/inbound/cancel", {
    document_id: documentId,
    document_type: documentType,
    cancellation_reason: cancellationReason,
  });

// ── MASTER DATA ───────────────────────────────────────────────────

export const fetchSuppliers = () =>
  apiClient.get("/master/suppliers");

// ── OTHER MODULES ─────────────────────────────────────────────────



export const fetchShipments = (params?: object) =>
  apiClient.get("/shipping", { params });

export const fetchAuditLogs = () =>
  apiClient.get("/audit/logs");

export const fetchDashboardSummary = () =>
  apiClient.get("/dashboard/summary");

// ── PUTAWAY ───────────────────────────────────────────────────────

export const fetchPutawayTasks = (params?: object) =>
  apiClient.get("/putaway-tasks", { params });

export const fetchPutawayTaskById = (taskId: string) =>
  apiClient.get(`/putaway-tasks/${taskId}`);

export const fetchPutawayOperators = () =>
  apiClient.get("/putaway-tasks/operators");

export const assignPutawayTask = (taskId: string, assignedToUserId: string) =>
  apiClient.post(`/putaway-tasks/${taskId}/assign`, { assignedToUserId });

export const recomputePutawayBin = (taskId: string) =>
  apiClient.post(`/putaway-tasks/${taskId}/recompute-bin`);

export const markPutawayException = (taskId: string, reason: string) =>
  apiClient.post(`/putaway-tasks/${taskId}/mark-exception`, { reason });

export const completePutawayTask = (taskId: string, actualBinCode: string) =>
  apiClient.post(`/putaway-tasks/${taskId}/complete`, { actual_bin_code: actualBinCode });

export const fetchPutawayHistory = (taskId: string) =>
  apiClient.get(`/putaway-tasks/${taskId}/history`);

// ── INVENTORY ─────────────────────────────────────────────────────

export const fetchInventoryOptions = () =>
  apiClient.get("/inventory/options");

export const fetchInventorySummary = (params?: object) =>
  apiClient.get("/inventory/summary", { params });

// Count Plans
export const fetchCountPlans = (params?: object) =>
  apiClient.get("/inventory/count-plans", { params });

export const fetchCountPlanById = (id: string) =>
  apiClient.get(`/inventory/count-plans/${id}`);

export const createCountPlan = (payload: object) =>
  apiClient.post("/inventory/count-plans", payload);

export const addCountEntry = (id: string, payload: object) =>
  apiClient.post(`/inventory/count-plans/${id}/entries`, payload);

export const submitCountPlan = (id: string) =>
  apiClient.post(`/inventory/count-plans/${id}/submit`);

export const approveCountPlan = (id: string, payload: object) =>
  apiClient.post(`/inventory/count-plans/${id}/approve`, payload);

export const rejectCountPlan = (id: string, payload: object) =>
  apiClient.post(`/inventory/count-plans/${id}/reject`, payload);

export const cancelCountPlan = (id: string, payload: object) =>
  apiClient.post(`/inventory/count-plans/${id}/cancel`, payload);

// Adjustments
export const fetchAdjustments = (params?: object) =>
  apiClient.get("/inventory/adjustments", { params });

export const fetchAdjustmentById = (id: string) =>
  apiClient.get(`/inventory/adjustments/${id}`);

export const createAdjustment = (payload: object) =>
  apiClient.post("/inventory/adjustments", payload);

export const submitAdjustment = (id: string) =>
  apiClient.post(`/inventory/adjustments/${id}/submit`);

export const approveAdjustment = (id: string, payload: object) =>
  apiClient.post(`/inventory/adjustments/${id}/approve`, payload);

export const rejectAdjustment = (id: string, payload: object) =>
  apiClient.post(`/inventory/adjustments/${id}/reject`, payload);

export const cancelAdjustment = (id: string, payload: object) =>
  apiClient.post(`/inventory/adjustments/${id}/cancel`, payload);

// ── PICKING ───────────────────────────────────────────────────────

export const fetchPickLists = (params?: object) =>
  apiClient.get("/picking/pick-lists", { params });

export const fetchPickListById = (pickListId: string) =>
  apiClient.get(`/picking/pick-lists/${pickListId}`);

export const validatePickScan = (pickListId: string, payload: { qr_payload: string; line_id?: string }) =>
  apiClient.post(`/picking/pick-lists/${pickListId}/scan`, payload);

export const confirmPickLine = (pickListId: string, lineId: string, payload: { qty_picked: number; scan_mode: string; qr_payload?: string; notes?: string }) =>
  apiClient.post(`/picking/pick-lists/${pickListId}/lines/${lineId}/confirm`, payload);

export const completePickList = (pickListId: string) =>
  apiClient.post(`/picking/pick-lists/${pickListId}/complete`, { source: "MOBILE" });

export const scanPickListUnit = (pickListId: string, lineId: string, qrPayload: string) =>
  apiClient.post(`/picking/pick-lists/${pickListId}/lines/${lineId}/scan-unit`, {
    qr_payload: qrPayload,
  });

// Undo last scan for a specific line
export const undoPickListScan = (pickListId: string, lineId: string) =>
  apiClient.post(`/picking/pick-lists/${pickListId}/lines/${lineId}/undo-scan`);

export const manualPickLine = (pickListId: string, lineId: string, qty: number) =>
  apiClient.post(`/picking/pick-lists/${pickListId}/lines/${lineId}/manual-pick`, {
    qty_picked: qty,
    scan_mode: "MANUAL",
  });

export const fetchPickingOperators = () =>
  apiClient.get("/picking/operators");

export const assignPickList = (pickListId: string, assignedToUserId: string) =>
  apiClient.post(`/picking/pick-lists/${pickListId}/assign`, { assignedToUserId });
