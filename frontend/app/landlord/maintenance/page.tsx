"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wrench, X, Menu, Bell, Home, ChevronDown,
  Building2, CheckCircle, Clock, AlertCircle,
  MessageSquare, Loader2, Filter,
} from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Property } from "@/types";
import { NotificationBell } from "@/components/NotificationBell";
import { MobileProfileButton } from "@/components/MobileProfileButton";

const NAV = [
  { href: "/landlord/dashboard",   label: "Dashboard"   },
  { href: "/landlord/properties",  label: "Properties"  },
  { href: "/landlord/tenants",     label: "Tenants"     },
  { href: "/landlord/payments",    label: "Payments"    },
  { href: "/landlord/maintenance", label: "Maintenance", active: true },
  { href: "/landlord/reports", label: "Reports" },
  { href: "/landlord/settings",    label: "Settings"    },
];

function Sidebar({ onClose }: { onClose?: () => void }) {
  const user   = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { useRouter } = require("next/navigation");
  const router = useRouter();
  return (
    <aside style={{ width: 240, background: "#fff", borderRight: "1px solid var(--lr-border)", display: "flex", flexDirection: "column", padding: "24px 16px", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 32, height: 32, background: "var(--lr-primary)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Home size={16} color="#fff" />
          </div>
          <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, color: "var(--lr-primary)", fontSize: "0.95rem" }}>LumindaRentals</span>
        </div>
        {onClose && <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color="var(--lr-text-muted)" /></button>}
      </div>
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} onClick={onClose} className={`nav-item ${item.active ? "nav-item-active" : ""}`}>
            {item.label}
          </Link>
        ))}
      </nav>
      <div style={{ borderTop: "1px solid var(--lr-border)", paddingTop: 16 }}>
        <div style={{ padding: "8px", marginBottom: 4 }}>
          <p style={{ fontSize: "0.875rem", fontWeight: 500 }}>{user?.full_name}</p>
          <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>Landlord</p>
        </div>
        <button onClick={async () => { await logout(); router.push("/login"); }} className="nav-item" style={{ width: "100%", border: "none", background: "none", cursor: "pointer", color: "var(--lr-danger)" }}>Sign out</button>
      </div>
    </aside>
  );
}

// ── Resolve modal ────────────────────────────
function ResolveModal({ request, onClose, onResolve }: {
  request: any;
  onClose: () => void;
  onResolve: (id: string, notes: string) => void;
}) {
  const [notes, setNotes] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} onClick={onClose} />
      <div style={{ position: "relative", background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 440, zIndex: 101 }} className="animate-slide-up">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "1rem" }}>Resolve request</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color="var(--lr-text-muted)" /></button>
        </div>
        <div style={{ background: "var(--lr-bg-page)", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
          <p style={{ fontSize: "0.82rem", color: "var(--lr-text-secondary)", lineHeight: 1.5 }}>{request.issue}</p>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label className="label">Resolution notes (optional)</label>
          <textarea
            className="input"
            placeholder="Describe what was done to resolve this issue..."
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ resize: "vertical" }}
          />
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => { onResolve(request.id, notes); onClose(); }}>
            <CheckCircle size={14} /> Mark as resolved
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LandlordMaintenancePage() {
  const user        = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [statusFilter,   setStatusFilter]   = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [resolveRequest, setResolveRequest] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["landlord-maintenance"],
    queryFn:  () => api.get("/api/maintenance/landlord/").then((r) => r.data),
  });

  const requests = data?.results || [];

  const { mutate: updateStatus } = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      api.patch(`/api/maintenance/${id}/`, { status, ...(notes ? { resolution_notes: notes } : {}) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["landlord-maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["caretaker-maintenance"] });
    },
  });

  const filtered = requests.filter((r: any) => {
    const matchStatus   = statusFilter   === "all" || r.status   === statusFilter;
    const matchPriority = priorityFilter === "all" || r.priority === priorityFilter;
    return matchStatus && matchPriority;
  });

  const openCount       = requests.filter((r: any) => r.status === "open").length;
  const inProgressCount = requests.filter((r: any) => r.status === "in_progress").length;
  const resolvedCount   = requests.filter((r: any) => r.status === "resolved").length;

  const statusColor: Record<string, string>  = { open: "badge-danger", in_progress: "badge-warning", resolved: "badge-success" };
  const priorityColor: Record<string, string> = { low: "badge-neutral", medium: "badge-warning", high: "badge-danger" };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--lr-bg-page)" }}>
      <div style={{ display: "none", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 40, width: 240 }} className="desktop-sidebar">
        <Sidebar />
      </div>
      {sidebarOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} onClick={() => setSidebarOpen(false)} />
          <div style={{ position: "relative", width: 240, height: "100%", zIndex: 51 }}>
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <main className="main-content" style={{ flex: 1, padding: "24px 20px", overflowX: "hidden" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="hamburger" onClick={() => setSidebarOpen(true)} style={{ background: "#fff", border: "1px solid var(--lr-border)", borderRadius: 8, padding: 8, cursor: "pointer", display: "flex" }}>
              <Menu size={18} color="var(--lr-text-secondary)" />
            </button>
            <div>
              <h1 className="page-title" style={{ fontSize: "clamp(1.2rem, 3vw, 1.5rem)" }}>Maintenance</h1>
              <p className="page-subtitle">Track and resolve tenant maintenance requests</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NotificationBell />
            <MobileProfileButton role="landlord" />
          </div>
        </div>

        {/* Stat cards */}
        <div className="stats-grid" style={{ display: "grid", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Open",        value: openCount,       bg: "#FCEBEB", color: "#A32D2D", icon: <AlertCircle size={14} color="#A32D2D" /> },
            { label: "In progress", value: inProgressCount, bg: "#FAEEDA", color: "#BA7517", icon: <Clock size={14} color="#BA7517" /> },
            { label: "Resolved",    value: resolvedCount,   bg: "#EAF3DE", color: "#639922", icon: <CheckCircle size={14} color="#639922" /> },
            { label: "Total",       value: requests.length, bg: "var(--lr-primary-light)", color: "var(--lr-primary)", icon: <Wrench size={14} color="var(--lr-primary)" /> },
          ].map((s, i) => (
            <div key={s.label} className="stat-card animate-slide-up" style={{ animationDelay: `${i * 0.05}s` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <p className="stat-label">{s.label}</p>
                <div style={{ width: 30, height: 30, background: s.bg, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {s.icon}
                </div>
              </div>
              <p className="stat-value" style={{ fontSize: "clamp(1.2rem, 3vw, 1.5rem)", color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Open requests alert */}
        {openCount > 0 && (
          <div style={{ background: "#FCEBEB", border: "1px solid rgba(162,45,45,0.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AlertCircle size={16} color="#A32D2D" />
              <span style={{ fontSize: "0.82rem", color: "#791F1F", fontWeight: 500 }}>
                {openCount} open request{openCount > 1 ? "s" : ""} need attention
              </span>
            </div>
            <button onClick={() => setStatusFilter("open")} style={{ fontSize: "0.8rem", fontWeight: 600, color: "#A32D2D", background: "none", border: "none", cursor: "pointer" }}>
              Show open →
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="maint-filter-bar" style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          {/* Status pills */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { label: "All",         value: "all"         },
              { label: "Open",        value: "open"        },
              { label: "In progress", value: "in_progress" },
              { label: "Resolved",    value: "resolved"    },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                style={{ padding: "6px 12px", borderRadius: 99, border: `1.5px solid ${statusFilter === tab.value ? "var(--lr-primary)" : "var(--lr-border)"}`, background: statusFilter === tab.value ? "var(--lr-primary-light)" : "#fff", color: statusFilter === tab.value ? "var(--lr-primary)" : "var(--lr-text-muted)", fontSize: "0.78rem", fontWeight: 500, cursor: "pointer", transition: "all 0.15s" }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Priority */}
          <div style={{ position: "relative" }} className="filter-select-wrap">
            <Filter size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--lr-text-muted)", pointerEvents: "none" }} />
            <select className="input filter-select" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} style={{ appearance: "none", paddingLeft: 28, paddingRight: 28, fontSize: "0.82rem" }}>
              <option value="all">All priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <ChevronDown size={12} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--lr-text-muted)" }} />
          </div>
        </div>

        {/* Requests list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {isLoading ? (
            <div className="card" style={{ textAlign: "center", padding: "48px 0", color: "var(--lr-text-muted)" }}>Loading requests...</div>
          ) : filtered.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
              <Wrench size={40} style={{ margin: "0 auto 12px", opacity: 0.2, display: "block" }} />
              <p style={{ fontSize: "0.95rem", fontWeight: 500, color: "var(--lr-text-primary)", marginBottom: 4 }}>No requests found</p>
              <p style={{ fontSize: "0.8rem", color: "var(--lr-text-muted)" }}>
                {statusFilter !== "all" ? "Try changing your filters" : "Maintenance requests from tenants will appear here"}
              </p>
            </div>
          ) : (
            filtered.map((r: any) => (
              <div key={r.id} className="card" style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span className={`badge ${priorityColor[r.priority] || "badge-neutral"}`} style={{ textTransform: "capitalize" }}>
                        {r.priority} priority
                      </span>
                      <span className={`badge ${statusColor[r.status] || "badge-neutral"}`} style={{ textTransform: "capitalize" }}>
                        {r.status.replace("_", " ")}
                      </span>
                    </div>
                    {/* Issue */}
                    <p style={{ fontSize: "0.875rem", color: "var(--lr-text-primary)", lineHeight: 1.5, marginBottom: 6 }}>
                      {r.issue}
                    </p>
                    {/* Meta */}
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>
                        Tenant: <span style={{ color: "var(--lr-text-secondary)", fontWeight: 500 }}>{r.tenancy?.tenant_name || "—"}</span>
                      </p>
                      <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>
                        Unit: <span style={{ color: "var(--lr-text-secondary)", fontWeight: 500 }}>Unit {r.tenancy?.unit_number || "—"}</span>
                      </p>
                      <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>
                        Submitted: <span style={{ color: "var(--lr-text-secondary)" }}>{formatDate(r.created_at)}</span>
                      </p>
                    </div>
                    {/* Resolution notes */}
                    {r.resolution_notes && (
                      <div style={{ marginTop: 10, background: "#EAF3DE", borderRadius: 8, padding: "8px 12px" }}>
                        <p style={{ fontSize: "0.75rem", color: "#27500A", fontWeight: 500, marginBottom: 2 }}>Resolution</p>
                        <p style={{ fontSize: "0.8rem", color: "#27500A" }}>{r.resolution_notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                    {r.status === "open" && (
                      <button
                        className="btn-secondary"
                        style={{ padding: "6px 12px", fontSize: "0.78rem", whiteSpace: "nowrap" }}
                        onClick={() => updateStatus({ id: r.id, status: "in_progress" })}
                      >
                        <Clock size={12} /> Start
                      </button>
                    )}
                    {(r.status === "open" || r.status === "in_progress") && (
                      <button
                        className="btn-primary"
                        style={{ padding: "6px 12px", fontSize: "0.78rem", whiteSpace: "nowrap" }}
                        onClick={() => setResolveRequest(r)}
                      >
                        <CheckCircle size={12} /> Resolve
                      </button>
                    )}
                    {r.status === "resolved" && r.resolved_at && (
                      <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", textAlign: "right" }}>
                        Resolved<br />{formatDate(r.resolved_at)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {resolveRequest && (
        <ResolveModal
          request={resolveRequest}
          onClose={() => setResolveRequest(null)}
          onResolve={(id, notes) => updateStatus({ id, status: "resolved", notes })}
        />
      )}

      <style>{`
        @media (min-width: 768px) {
          .desktop-sidebar { display: block !important; }
          .main-content    { margin-left: 240px !important; padding: 32px !important; }
          .hamburger       { display: none !important; }
          .stats-grid      { grid-template-columns: repeat(4, 1fr) !important; }
        }
        @media (max-width: 767px) {
          .main-content       { margin-left: 0 !important; padding: 16px !important; }
          .stats-grid         { grid-template-columns: repeat(2, 1fr) !important; }
          .maint-filter-bar   { flex-direction: column; align-items: stretch !important; }
          .filter-select-wrap { width: 100%; }
          .filter-select      { width: 100% !important; min-width: unset !important; }
        }
      `}</style>
    </div>
  );
}