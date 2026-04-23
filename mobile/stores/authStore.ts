import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "wms_token";
const USER_KEY = "wms_user";

interface User {
  user_id: string;
  email: string;
  full_name?: string;
  role_id: string;
  tenant_id: string;
  warehouse_id?: string;
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

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  hydrated: false,

  setAuth: async (user: User, session: Session) => {
    const token = session?.token;
    await SecureStore.setItemAsync(TOKEN_KEY, token || "");
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    set({ token, user });
  },

  hydrate: async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const userJson = await SecureStore.getItemAsync(USER_KEY);
      if (token && userJson) {
        const user: User = JSON.parse(userJson);
        set({ token, user });
      }
    } catch (_) {
      // silently ignore — user will be redirected to login
    } finally {
      set({ hydrated: true });
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    set({ token: null, user: null });
  },

  isAuthenticated: () => Boolean(get().token),
}));