import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { clearSessionHeaders, setSessionHeaders } from "@/services/api";
import { mobileDebug } from "@/utils/debug";

const TOKEN_KEY = "wms_token";
const USER_KEY = "wms_user";
const AUTH_VERSION_KEY = "wms_auth_version";
const AUTH_VERSION = "2";
const LEGACY_SESSION_KEYS = ["currentUser", "current_user", "session", "wms_session"];
let authRevision = 0;

interface User {
  user_id: string;
  email: string;
  full_name?: string;
  role_id: string;
  role_name?: string;
  tenant_id: string;
  warehouse_id?: string;
  warehouse_ids?: string[];
  warehouse_name?: string;
}

interface Session {
  token: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  hydrated: boolean;
  setAuth: (user: User, session: Session) => Promise<void>;
  hydrate: () => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: () => boolean;
}

function identity(user: User | null) {
  return user ? {
    user_id: user.user_id,
    role_id: user.role_id,
    tenant_id: user.tenant_id,
    warehouse_id: user.warehouse_id || user.warehouse_ids?.[0] || null,
  } : null;
}

function resolveWarehouseId(user: User) {
  return user.warehouse_id || user.warehouse_ids?.[0] || null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  hydrated: false,

  setAuth: async (user: User, session: Session) => {
    const revision = ++authRevision;
    const token = session?.token;
    const normalizedUser: User = {
      ...user,
      warehouse_id: resolveWarehouseId(user) || undefined,
    };

    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(normalizedUser));
    await SecureStore.setItemAsync(TOKEN_KEY, token || "");
    await SecureStore.setItemAsync(AUTH_VERSION_KEY, AUTH_VERSION);

    const storedUserJson = await SecureStore.getItemAsync(USER_KEY);
    const storedUser = storedUserJson ? JSON.parse(storedUserJson) as User : null;
    mobileDebug("[Auth storage] setAuth", {
      revision,
      responseUser: identity(normalizedUser),
      storedUser: identity(storedUser),
      keys: { user: USER_KEY, token: TOKEN_KEY, version: AUTH_VERSION_KEY },
    });

    if (!storedUser || storedUser.user_id !== normalizedUser.user_id || storedUser.role_id !== normalizedUser.role_id) {
      throw new Error("Stored mobile session does not match the authenticated user.");
    }

    setSessionHeaders({
      tenant_id: normalizedUser.tenant_id,
      warehouse_id: normalizedUser.warehouse_id,
      warehouse_ids: normalizedUser.warehouse_ids,
      user_id: normalizedUser.user_id,
      role_id: normalizedUser.role_id,
    });
    if (revision === authRevision) {
      set({ token, user: normalizedUser, hydrated: true });
    }
  },

  hydrate: async () => {
    const revision = authRevision;
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const userJson = await SecureStore.getItemAsync(USER_KEY);
      const authVersion = await SecureStore.getItemAsync(AUTH_VERSION_KEY);
      if ((token || userJson) && authVersion !== AUTH_VERSION) {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        await SecureStore.deleteItemAsync(USER_KEY);
        await SecureStore.setItemAsync(AUTH_VERSION_KEY, AUTH_VERSION);
        clearSessionHeaders();
        mobileDebug("[Auth storage] stale session cleared", {
          storedVersion: authVersion,
          requiredVersion: AUTH_VERSION,
          clearedKeys: [TOKEN_KEY, USER_KEY],
        });
        return;
      }
      if (token && userJson) {
        const rawUser: User = JSON.parse(userJson);
        const user: User = {
          ...rawUser,
          warehouse_id: resolveWarehouseId(rawUser) || undefined,
        };
        mobileDebug("[Auth storage] hydrate", {
          revision,
          restoredUser: identity(user),
          keys: { user: USER_KEY, token: TOKEN_KEY, version: AUTH_VERSION_KEY },
          ignoredAsStale: revision !== authRevision,
        });
        if (revision !== authRevision) return;
        setSessionHeaders({
          tenant_id: user.tenant_id,
          warehouse_id: user.warehouse_id,
          warehouse_ids: user.warehouse_ids,
          user_id: user.user_id,
          role_id: user.role_id,
        });
        set({ token, user });
      }
    } catch (error) {
      mobileDebug("[Auth storage] hydrate failed", {
        message: error instanceof Error ? error.message : String(error),
        keys: { user: USER_KEY, token: TOKEN_KEY, version: AUTH_VERSION_KEY },
      });
    } finally {
      if (revision === authRevision) set({ hydrated: true });
    }
  },

  logout: async () => {
    const revision = ++authRevision;
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    await SecureStore.deleteItemAsync(AUTH_VERSION_KEY);
    await Promise.all(LEGACY_SESSION_KEYS.map(async (key) => {
      await SecureStore.deleteItemAsync(key).catch(() => undefined);
      await AsyncStorage.removeItem(key).catch(() => undefined);
    }));
    clearSessionHeaders();
    mobileDebug("[Auth storage] logout", {
      revision,
      clearedSecureStoreKeys: [TOKEN_KEY, USER_KEY, AUTH_VERSION_KEY, ...LEGACY_SESSION_KEYS],
      clearedAsyncStorageKeys: LEGACY_SESSION_KEYS,
    });
    set({ token: null, user: null, hydrated: true });
  },

  isAuthenticated: () => Boolean(get().token),
}));
