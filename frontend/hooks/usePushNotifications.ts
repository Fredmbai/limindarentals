import { useEffect } from "react";
import api from "@/lib/api";

/** Convert a URL-safe base64 string to Uint8Array (required by pushManager.subscribe). */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64     = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * usePushNotifications
 *
 * Call this hook once inside any authenticated dashboard page.
 * It will:
 *   1. Ask for notification permission (browser prompt).
 *   2. Subscribe the device to Web Push via the service worker.
 *   3. POST the subscription to /api/notifications/push/subscribe/ so the
 *      backend can deliver pushes to this device.
 *
 * Only runs in production (service worker is only registered in prod).
 * Silent on any error — never breaks the page.
 */
export function usePushNotifications() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    async function subscribe() {
      try {
        // 1. Fetch VAPID public key from backend
        const { data } = await api.get("/api/notifications/push/vapid-key/");
        const vapidKey: string = data.vapid_public_key;
        if (!vapidKey) return;

        // 2. Ask permission (no-op if already granted)
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        // 3. Wait for service worker to be ready
        const reg = await navigator.serviceWorker.ready;

        // 4. Get existing subscription or create a new one
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly:      true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
          });
        }

        // 5. Send subscription to backend
        const json = sub.toJSON();
        await api.post("/api/notifications/push/subscribe/", {
          endpoint: json.endpoint,
          keys:     json.keys,
        });
      } catch {
        // Permission denied, SW not ready, network error — all ignored silently.
      }
    }

    subscribe();
  }, []);
}
