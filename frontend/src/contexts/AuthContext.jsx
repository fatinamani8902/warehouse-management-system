import React, { createContext, useContext, useState, useEffect } from "react";
import { tenants, warehouses, users } from "@/data/mockData";

const AuthContext = createContext(null);
const STORAGE_KEY = "auth_session";
const emptyState = {
  isAuthenticated: false,
  currentUser: null,
  currentTenantId: null,
  currentWarehouseId: null,
  tokenExpiry: "",
};

function loadFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return emptyState;
    const parsed = JSON.parse(saved);
    if (parsed.tokenExpiry && new Date(parsed.tokenExpiry) < new Date()) {
      localStorage.removeItem(STORAGE_KEY);
      return emptyState;
    }
    return parsed;
  } catch {
    return emptyState;
  }
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [state, setState] = useState(() => loadFromStorage());

  useEffect(() => {
    if (state.isAuthenticated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [state]);

  const signIn = (email, _password) => {
    const user = users.find((u) => u.email === email);
    if (user) {
      setState({
        isAuthenticated: true,
        currentUser: user,
        currentTenantId: user.tenants.length === 1 ? user.tenants[0] : null,
        currentWarehouseId: null,
        tokenExpiry: new Date(Date.now() + 8 * 3600000).toISOString(),
      });
      return true;
    }
    return false;
  };

  const signOut = () => {
    localStorage.removeItem(STORAGE_KEY);
    setState(emptyState);
  };

  const selectTenant = (tenantId) =>
    setState((s) => ({ ...s, currentTenantId: tenantId, currentWarehouseId: null }));

  const selectWarehouse = (warehouseId) =>
    setState((s) => ({ ...s, currentWarehouseId: warehouseId }));

  const getTenantName = () =>
    tenants.find((t) => t.id === state.currentTenantId)?.name ?? "";

  const getWarehouseName = () =>
    warehouses.find((w) => w.id === state.currentWarehouseId)?.name ?? "";

  const getUserTenants = () =>
    tenants.filter((t) => state.currentUser?.tenants?.includes(t.id));

  const getUserWarehouses = () =>
    warehouses.filter(
      (w) =>
        w.tenantId === state.currentTenantId &&
        state.currentUser?.warehouses?.includes(w.id),
    );

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        signOut,
        selectTenant,
        selectWarehouse,
        getTenantName,
        getWarehouseName,
        getUserTenants,
        getUserWarehouses,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};