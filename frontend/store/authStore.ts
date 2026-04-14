import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import api from "@/lib/api";

// ── Types ───────────────────────────────────────────────
export interface AuthUser {
  id:        string;
  full_name: string;
  phone:     string;
  email:     string | null;
  role:      "landlord" | "tenant" | "caretaker";
}

interface AuthState {
  user:         AuthUser | null;
  accessToken:  string | null;
  refreshToken: string | null;
  isLoading:    boolean;

  // True once the persist middleware has finished reading from storage.
  // Auth guards must wait for this before deciding to redirect.
  _hasHydrated: boolean;

  // Actions
  login:           (full_name: string, password: string, rememberMe?: boolean) => Promise<AuthUser>;
  logout:          () => Promise<void>;
  setUser:         (user: AuthUser) => void;
  _setHasHydrated: (v: boolean) => void;
}

// ── Storage that delegates to localStorage or sessionStorage ─────────────────
// rememberMe flag is stored in localStorage so it survives store rehydration.
const REMEMBER_KEY = "nr-remember-me";

const delegatingStorage = createJSONStorage(() => ({
  getItem: (name: string) => {
    return localStorage.getItem(name) ?? sessionStorage.getItem(name);
  },
  setItem: (name: string, value: string) => {
    const remember = localStorage.getItem(REMEMBER_KEY) !== "false";
    if (remember) {
      localStorage.setItem(name, value);
      sessionStorage.removeItem(name);
    } else {
      sessionStorage.setItem(name, value);
      localStorage.removeItem(name);
    }
  },
  removeItem: (name: string) => {
    localStorage.removeItem(name);
    sessionStorage.removeItem(name);
  },
}));

// ── Store ────────────────────────────────────────────────────────────────────
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:            null,
      accessToken:     null,
      refreshToken:    null,
      isLoading:       false,
      _hasHydrated:    false,
      _setHasHydrated: (v) => set({ _hasHydrated: v }),

      login: async (full_name: string, password: string, rememberMe = true) => {
        set({ isLoading: true });
        localStorage.setItem(REMEMBER_KEY, String(rememberMe));
        try {
          const res = await api.post("/api/auth/login/", { full_name, password });
          const { access, refresh, user } = res.data;
          set({
            user,
            accessToken:  access,
            refreshToken: refresh,
            isLoading:    false,
          });
          return user;
        } catch (err: any) {
          set({ isLoading: false });
          const detail = err.response?.data?.detail || "Login failed.";
          throw new Error(detail);
        }
      },

      logout: async () => {
        try {
          const refresh = get().refreshToken;
          if (refresh) await api.post("/api/auth/logout/", { refresh });
        } catch {
          // Always clear local state even if the API call fails
        } finally {
          localStorage.removeItem(REMEMBER_KEY);
          set({ user: null, accessToken: null, refreshToken: null });
        }
      },

      setUser: (user) => set({ user }),
    }),
    {
      name:    "nestrentals-auth",
      storage: delegatingStorage,
      // Only persist auth data — never persist loading/hydration flags
      partialize: (state) => ({
        user:         state.user,
        accessToken:  state.accessToken,
        refreshToken: state.refreshToken,
      }),
      // Called once rehydration from storage is complete.
      // This is the signal all auth guards wait for before redirecting.
      onRehydrateStorage: () => (state) => {
        state?._setHasHydrated(true);
      },
    }
  )
);

// ── Convenience hooks ────────────────────────────────────────────────────────
export const useUser       = () => useAuthStore((s) => s.user);
export const useIsLandlord = () => useAuthStore((s) => s.user?.role === "landlord");
export const useIsTenant   = () => useAuthStore((s) => s.user?.role === "tenant");
