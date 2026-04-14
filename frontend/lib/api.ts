import axios from "axios";
import { useAuthStore } from "@/store/authStore";

// ── API base instance ────────────────────────────────────────────────────────
// baseURL is intentionally empty so every request uses the SAME origin as the
// page (e.g. the ngrok URL, LAN IP, or production domain).
// Next.js rewrites in next.config.ts proxy /api/* → Django and /media/* → Django.
// This means real phones, desktop browsers, and production all work identically
// without any hardcoded IP or URL changes.
const api = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

// ── Request interceptor — attach auth token ──────────────────────────────────
api.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = useAuthStore.getState().accessToken;
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor — auto-refresh on 401 ──────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      try {
        const refresh = useAuthStore.getState().refreshToken;
        if (!refresh) throw new Error("No refresh token");

        // Use a plain axios call (not the intercepted `api` instance) to avoid
        // infinite recursion if the refresh endpoint itself returns 401.
        // The relative URL is proxied through Next.js just like every other call.
        const { data } = await axios.post("/api/auth/token/refresh/", { refresh });

        useAuthStore.setState({ accessToken: data.access });
        original.headers.Authorization = `Bearer ${data.access}`;
        return api(original);

      } catch {
        // Refresh failed — log out and redirect to login
        useAuthStore.setState({ user: null, accessToken: null, refreshToken: null });
        if (typeof window !== "undefined") window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default api;
