import axios from "axios";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
    "x-client-source": "MOBILE",
  },
  timeout: 15000,
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
  user_id?: string;
  role_id?: string;
}) => {
  apiClient.defaults.headers["x-tenant-id"]    = session.tenant_id    || "";
  apiClient.defaults.headers["x-warehouse-id"] = session.warehouse_id || "";
  apiClient.defaults.headers["x-user-id"]      = session.user_id      || "";
  apiClient.defaults.headers["x-roles"]        = session.role_id      || "";
};

// ── API calls ────────────────────────────────────────────────────

export const fetchAsns = (params?: object) =>
  apiClient.get("/inbound/asn", { params });

export const fetchGrns = (params?: object) =>
  apiClient.get("/inbound/grn", { params });

export const fetchPutawayTasks = (params?: object) =>
  apiClient.get("/putaway", { params });

export const fetchShipments = (params?: object) =>
  apiClient.get("/shipping", { params });

export const fetchAuditLogs = () =>
  apiClient.get("/audit/logs");