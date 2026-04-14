"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";

export function MobileProfileButton({ role }: { role?: string }) {
  const user   = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const initials = (user?.full_name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const displayRole = role || user?.role || "User";
  const capitalised = displayRole.charAt(0).toUpperCase() + displayRole.slice(1);

  return (
    <div className="mobile-profile" style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 34, height: 34, borderRadius: "50%",
          background: "var(--lr-primary)", border: "none",
          cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "center", color: "#fff",
          fontSize: "0.72rem", fontWeight: 600, flexShrink: 0,
        }}
      >
        {initials}
      </button>

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 58 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 8px)",
            background: "#fff", borderRadius: 10, border: "1px solid var(--lr-border)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.10)", minWidth: 180, zIndex: 59, overflow: "hidden",
          }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--lr-border)" }}>
              <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 2 }}>{user?.full_name}</p>
              <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>{capitalised}</p>
            </div>
            <button
              onClick={async () => { setOpen(false); await logout(); router.push("/login"); }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "10px 14px",
                background: "none", border: "none", cursor: "pointer",
                fontSize: "0.82rem", color: "var(--lr-danger)", fontWeight: 500,
              }}
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
