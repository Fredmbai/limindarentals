"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, CreditCard, Wrench, Home, Clock, X } from "lucide-react";
import api from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";

interface Notification {
  id:                string;
  title:             string;
  message:           string;
  notification_type: string;
  is_read:           boolean;
  created_at:        string;
}

function NotifIcon({ type }: { type: string }) {
  const map: Record<string, React.ReactNode> = {
    payment:     <CreditCard size={14} color="var(--lr-primary)" />,
    maintenance: <Wrench size={14} color="#BA7517" />,
    tenancy:     <Home size={14} color="#185FA5" />,
    reminder:    <Clock size={14} color="#A32D2D" />,
    general:     <Bell size={14} color="var(--lr-text-muted)" />,
  };
  return <>{map[type] || map.general}</>;
}

export function NotificationBell() {
  const [open, setOpen]   = useState(false);
  const ref               = useRef<HTMLDivElement>(null);
  const queryClient       = useQueryClient();
  const user              = useAuthStore((s) => s.user);

  // Unread count — polls every 30 seconds
  const { data: countData } = useQuery({
    queryKey:  ["unread-count", user?.id],
    queryFn:   () => api.get("/api/notifications/unread-count/").then((r) => r.data),
    refetchInterval: 30000,   // 30 second polling
    enabled: !!user,
  });

  // Notification list — fetches when bell is opened
  const { data: notifsData, isLoading } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn:  () => api.get("/api/notifications/").then((r) => r.data),
    enabled:  open && !!user,
    refetchInterval: open ? 30000 : false,
  });

  const notifications: Notification[] = notifsData?.results || notifsData || [];
  const unreadCount = countData?.count || 0;

  const { mutate: markRead } = useMutation({
    mutationFn: (id: string) => api.patch(`/api/notifications/${id}/read/`),
    onSuccess:  () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["unread-count",  user?.id] });
    },
  });

  const { mutate: markAllRead } = useMutation({
    mutationFn: () => api.patch("/api/notifications/read-all/"),
    onSuccess:  () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["unread-count",  user?.id] });
    },
  });

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "relative",
          background: open ? "var(--lr-primary-light)" : "#fff",
          border: `1px solid ${open ? "var(--lr-primary)" : "var(--lr-border)"}`,
          borderRadius: 10,
          padding: 10,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          transition: "all 0.15s",
          flexShrink: 0,
        }}
      >
        <Bell size={18} color={open ? "var(--lr-primary)" : "var(--lr-text-secondary)"} />
        {unreadCount > 0 && (
          <span style={{
            position: "absolute",
            top: 6, right: 6,
            minWidth: unreadCount > 9 ? 16 : 14,
            height: 14,
            background: "var(--lr-danger)",
            borderRadius: 99,
            border: "1.5px solid #fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.6rem",
            fontWeight: 700,
            color: "#fff",
            padding: "0 2px",
          }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Mobile backdrop */}
          <div className="notif-backdrop" onClick={() => setOpen(false)} />
          <div className="notif-dropdown animate-slide-up">

          {/* Header */}
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--lr-border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <p style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.9rem", color: "var(--lr-text-primary)" }}>Notifications</p>
              {unreadCount > 0 && (
                <span style={{ background: "var(--lr-danger)", color: "#fff", borderRadius: 99, padding: "1px 7px", fontSize: "0.68rem", fontWeight: 700 }}>
                  {unreadCount} new
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead()}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.75rem", color: "var(--lr-primary)", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}
                >
                  <CheckCheck size={13} /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                <X size={16} color="var(--lr-text-muted)" />
              </button>
            </div>
          </div>

          {/* Notifications list */}
          <div style={{ overflowY: "auto", flex: 1, WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
            {isLoading ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "var(--lr-text-muted)", fontSize: "0.875rem" }}>
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <Bell size={28} style={{ margin: "0 auto 8px", opacity: 0.2, display: "block" }} />
                <p style={{ fontSize: "0.875rem", color: "var(--lr-text-muted)" }}>No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => { if (!n.is_read) markRead(n.id); }}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--lr-border)",
                    background: n.is_read ? "#fff" : "var(--lr-primary-light)",
                    cursor: n.is_read ? "default" : "pointer",
                    transition: "background 0.15s",
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: 30, height: 30,
                    borderRadius: 8,
                    background: n.is_read ? "var(--lr-bg-page)" : "#fff",
                    border: "1px solid var(--lr-border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, marginTop: 1,
                  }}>
                    <NotifIcon type={n.notification_type} />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 3 }}>
                      <p style={{ fontSize: "0.82rem", fontWeight: n.is_read ? 400 : 600, color: "var(--lr-text-primary)", lineHeight: 1.3 }}>
                        {n.title}
                      </p>
                      {!n.is_read && (
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--lr-primary)", flexShrink: 0, marginTop: 4 }} />
                      )}
                    </div>
                    <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)", lineHeight: 1.5, marginBottom: 4 }}>
                      {n.message}
                    </p>
                    <p style={{ fontSize: "0.68rem", color: "var(--lr-text-muted)" }}>
                      {formatRelativeTime(n.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        </>
      )}

      <style>{`
        .notif-backdrop {
          display: none;
        }
        .notif-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          width: 360px;
          max-height: 480px;
          background: #fff;
          border: 1px solid var(--lr-border);
          border-radius: 14px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          z-index: 200;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        @media (max-width: 600px) {
          .notif-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.4);
            z-index: 198;
          }
          .notif-dropdown {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100%;
            max-height: 100%;
            border-radius: 0;
            z-index: 199;
            border: none;
            box-shadow: none;
          }
        }
      `}</style>
    </div>
  );
}