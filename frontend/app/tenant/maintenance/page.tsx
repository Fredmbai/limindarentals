"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Home, CreditCard, FileText, Wrench, Settings, LogOut, Plus, X, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { MaintenanceRequest, Tenancy } from "@/types";
import { NotificationBell } from "@/components/NotificationBell";
import { MobileProfileButton } from "@/components/MobileProfileButton";

const NAV = [
  { href: "/tenant/dashboard",   label: "Dashboard",   icon: <Home size={17} />      },
  { href: "/tenant/payments",    label: "Payments",    icon: <CreditCard size={17} /> },
  { href: "/tenant/receipts",    label: "Receipts",    icon: <FileText size={17} />   },
  { href: "/tenant/maintenance", label: "Maintenance", icon: <Wrench size={17} />    },
  { href: "/tenant/settings",    label: "Settings",    icon: <Settings size={17} />   },
];

const statusColor: Record<string, string> = {
  open:        "badge-warning",
  in_progress: "badge-info",
  resolved:    "badge-success",
};
const priorityColor: Record<string, string> = {
  low:    "badge-neutral",
  medium: "badge-warning",
  high:   "badge-danger",
};

export default function MaintenancePage() {
  const router      = useRouter();
  const user        = useAuthStore((s) => s.user);
  const logout      = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();

  const [showForm, setShowForm]   = useState(false);
  const [issue, setIssue]         = useState("");
  const [priority, setPriority]   = useState("medium");
  const [tenancyId, setTenancyId] = useState("");
  const [success, setSuccess]     = useState("");

  const { data: tenanciesData } = useQuery({
    queryKey: ["my-tenancies", user?.id],
    queryFn:  () => api.get("/api/tenancies/my/").then((r) => r.data),
  });
  const { data, isLoading } = useQuery({
    queryKey: ["my-maintenance", user?.id],
    queryFn:  () => api.get("/api/maintenance/").then((r) => r.data),
  });

  const tenancies: Tenancy[]           = tenanciesData?.results || [];
  const requests:  MaintenanceRequest[] = data?.results          || [];

  const { mutate: submitRequest, isPending } = useMutation({
    mutationFn: (payload: any) => api.post("/api/maintenance/", payload),
    onSuccess: () => {
      setShowForm(false);
      setIssue("");
      setSuccess("Maintenance request submitted successfully.");
      queryClient.invalidateQueries({ queryKey: ["my-maintenance"] });
      setTimeout(() => setSuccess(""), 4000);
    },
  });

  const handleSubmit = () => {
    if (!issue.trim()) return;
    const tid = tenancyId || tenancies[0]?.id;
    if (!tid) return;
    submitRequest({ tenancy_id: tid, issue, priority });
  };

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--lr-bg-page)" }}>

      {/* ── Sidebar (desktop) ── */}
      <aside className="tenant-sidebar">
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px", marginBottom: 32 }}>
          <div style={{ width: 32, height: 32, background: "var(--lr-primary)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Home size={16} color="#fff" />
          </div>
          <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, color: "var(--lr-primary)", fontSize: "0.95rem" }}>LumindaRentals</span>
        </div>

        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <p style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--lr-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 8px", marginBottom: 4 }}>Menu</p>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={`nav-item ${item.href === "/tenant/maintenance" ? "nav-item-active" : ""}`}>
              {item.icon} {item.label}
            </Link>
          ))}
        </nav>

        <div style={{ borderTop: "1px solid var(--lr-border)", paddingTop: 16, marginTop: 16 }}>
          <div style={{ padding: "8px", marginBottom: 4 }}>
            <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--lr-text-primary)" }}>{user?.full_name}</p>
            <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)", marginTop: 1 }}>Tenant</p>
          </div>
          <button onClick={handleLogout} className="nav-item" style={{ width: "100%", border: "none", background: "none", cursor: "pointer", color: "var(--lr-danger)" }}>
            <LogOut size={17} /> Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="tenant-main">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, gap: 12 }}>
          <div>
            <h1 className="page-title">Maintenance</h1>
            <p className="page-subtitle">Report and track maintenance issues</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <NotificationBell />
            <MobileProfileButton role="tenant" />
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={15} /> <span className="btn-label">New request</span>
            </button>
          </div>
        </div>

        {success && (
          <div className="animate-slide-up" style={{ background: "#EAF3DE", border: "1px solid rgba(99,153,34,0.2)", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: "0.875rem", color: "#27500A" }}>
            {success}
          </div>
        )}

        {/* New request form */}
        {showForm && (
          <div className="card animate-slide-up" style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem" }}>New maintenance request</h3>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={18} color="var(--lr-text-muted)" />
              </button>
            </div>

            {tenancies.length > 1 && (
              <div style={{ marginBottom: 14 }}>
                <label className="label">Unit</label>
                <select className="input" value={tenancyId} onChange={(e) => setTenancyId(e.target.value)}>
                  {tenancies.map((t) => (
                    <option key={t.id} value={t.id}>Unit {t.unit.unit_number} — {t.property_name}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label className="label">Issue description</label>
              <textarea
                className="input"
                placeholder="Describe the issue in detail..."
                rows={4}
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
                style={{ resize: "vertical" }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label className="label">Priority</label>
              <div style={{ display: "flex", gap: 8 }}>
                {["low", "medium", "high"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    style={{
                      flex: 1, padding: "8px",
                      border: `1.5px solid ${priority === p ? "var(--lr-primary)" : "var(--lr-border)"}`,
                      borderRadius: 8,
                      background: priority === p ? "var(--lr-primary-light)" : "#fff",
                      color: priority === p ? "var(--lr-primary)" : "var(--lr-text-secondary)",
                      fontSize: "0.8rem", fontWeight: 500, cursor: "pointer", textTransform: "capitalize",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <button className="btn-primary" onClick={handleSubmit} disabled={isPending || !issue.trim()}>
              {isPending ? <><Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Submitting...</> : "Submit request"}
            </button>
          </div>
        )}

        {/* Requests list */}
        <div className="card">
          <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem", marginBottom: 20 }}>Your requests</h3>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--lr-text-muted)" }}>Loading...</div>
          ) : requests.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <Wrench size={36} style={{ margin: "0 auto 10px", opacity: 0.25, display: "block" }} />
              <p style={{ fontSize: "0.875rem", color: "var(--lr-text-muted)" }}>No maintenance requests yet</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {requests.map((r) => (
                <div key={r.id} style={{ padding: "14px 16px", background: "var(--lr-bg-page)", borderRadius: 10 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--lr-text-primary)", marginBottom: 6 }}>{r.issue}</p>
                      <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>Submitted {formatDate(r.created_at)}</p>
                      {r.resolution_notes && (
                        <p style={{ fontSize: "0.8rem", color: "var(--lr-primary-dark)", marginTop: 6, background: "var(--lr-primary-light)", padding: "6px 10px", borderRadius: 6 }}>
                          Resolution: {r.resolution_notes}
                        </p>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                      <span className={`badge ${statusColor[r.status] || "badge-neutral"}`} style={{ textTransform: "capitalize" }}>
                        {r.status.replace("_", " ")}
                      </span>
                      <span className={`badge ${priorityColor[r.priority] || "badge-neutral"}`} style={{ textTransform: "capitalize" }}>
                        {r.priority}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bottom-nav-spacer" />
      </main>

      {/* ── Bottom nav (mobile) ── */}
      <nav className="bottom-nav">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className={`bottom-nav-item ${item.href === "/tenant/maintenance" ? "bottom-nav-active" : ""}`}>
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <style>{`
        .tenant-sidebar {
          width: 240px; background: #fff; border-right: 1px solid var(--lr-border);
          display: flex; flex-direction: column; padding: 24px 16px;
          position: fixed; top: 0; left: 0; bottom: 0; z-index: 40;
        }
        .tenant-main { margin-left: 240px; flex: 1; padding: 32px; }
        .bottom-nav { display: none; }
        .bottom-nav-spacer { display: none; }
        .btn-label { display: inline; }

        @media (max-width: 767px) {
          .tenant-sidebar { display: none; }
          .tenant-main { margin-left: 0; padding: 20px 16px; }
          .btn-label { display: none; }
          .bottom-nav {
            display: flex; position: fixed; bottom: 0; left: 0; right: 0;
            background: #fff; border-top: 1px solid var(--lr-border);
            z-index: 50; padding: 6px 0 calc(6px + env(safe-area-inset-bottom));
          }
          .bottom-nav-item {
            flex: 1; display: flex; flex-direction: column; align-items: center;
            gap: 3px; padding: 6px 4px; text-decoration: none;
            color: var(--lr-text-muted); font-size: 0.65rem; font-weight: 500;
            transition: color 0.15s;
          }
          .bottom-nav-active { color: var(--lr-primary) !important; }
          .bottom-nav-spacer { display: block; height: 72px; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
