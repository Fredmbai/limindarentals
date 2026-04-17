"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Home, Users, Wrench, FileText, Menu, X, LayoutDashboard,
  Building2, CheckCircle, AlertCircle, Clock,
  Phone, ChevronDown, Filter, Search, LogOut,
  TrendingUp, UserPlus,  Check, Trash2,
} from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import api from "@/lib/api";
import { formatKES, formatDate } from "@/lib/utils";
import { NotificationBell } from "@/components/NotificationBell";
import { AddTenantModal } from "@/components/AddTenantModal";
import { MobileProfileButton } from "@/components/MobileProfileButton";

const NAV = [
  { href: "/caretaker/dashboard",    label: "Dashboard",    key: "dashboard",    icon: <LayoutDashboard size={17} /> },
  { href: "/caretaker/tenants",      label: "Tenants",      key: "tenants",      icon: <Users size={17} />           },
  { href: "/caretaker/maintenance",  label: "Maintenance",  key: "maintenance",  icon: <Wrench size={17} />          },
  { href: "/caretaker/report",       label: "Report",       key: "report",       icon: <FileText size={17} />        },
];

function Sidebar({ active, onClose }: { active: string; onClose?: () => void }) {
  const user   = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  usePushNotifications();
  const { useRouter } = require("next/navigation");
  const router = useRouter();
  return (
    <aside style={{ width: 240, background: "#fff", borderRight: "1px solid var(--lr-border)", display: "flex", flexDirection: "column", padding: "24px 16px", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 32, height: 32, background: "var(--lr-primary)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Home size={16} color="#fff" />
          </div>
          <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, color: "var(--lr-primary)", fontSize: "0.95rem" }}>LumidahRentals</span>
        </div>
        {onClose && <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color="var(--lr-text-muted)" /></button>}
      </div>
      <div style={{ padding: "8px 8px 14px", marginBottom: 4 }}>
        <div style={{ background: "var(--lr-primary-light)", borderRadius: 8, padding: "8px 10px" }}>
          <p style={{ fontSize: "0.7rem", color: "var(--lr-primary-dark)", marginBottom: 1 }}>Logged in as</p>
          <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--lr-primary)" }}>Caretaker</p>
          <p style={{ fontSize: "0.75rem", color: "var(--lr-primary-dark)", opacity: 0.8 }}>{user?.full_name}</p>
        </div>
      </div>
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} onClick={onClose} className={`nav-item ${active === item.key ? "nav-item-active" : ""}`}>
            {item.label}
          </Link>
        ))}
      </nav>
      <div style={{ borderTop: "1px solid var(--lr-border)", paddingTop: 16 }}>
        <button onClick={async () => { await logout(); router.push("/login"); }} className="nav-item" style={{ width: "100%", border: "none", background: "none", cursor: "pointer", color: "var(--lr-danger)" }}>
          <LogOut size={17} /> Sign out
        </button>
      </div>
    </aside>
  );
}

function PayBadge({ status }: { status: string }) {
  const m: Record<string, { cls: string; label: string }> = {
    paid:          { cls: "badge-success", label: "Paid"          },
    paid_ahead:    { cls: "badge-success", label: "Paid ahead"    },
    partially_paid:{ cls: "badge-warning", label: "Partial"       },
    unpaid:        { cls: "badge-danger",  label: "Unpaid"        },
  };
  const s = m[status] || { cls: "badge-neutral", label: status };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

function ResolveModal({ req, onClose, onResolve }: { req: any; onClose: () => void; onResolve: (id: string, notes: string) => void }) {
  const [notes, setNotes] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} onClick={onClose} />
      <div style={{ position: "relative", background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440, zIndex: 101 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem" }}>Mark as resolved</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color="var(--lr-text-muted)" /></button>
        </div>
        <div style={{ background: "var(--lr-bg-page)", borderRadius: 8, padding: "10px 12px", marginBottom: 14, fontSize: "0.8rem", color: "var(--lr-text-secondary)", lineHeight: 1.5 }}>
          {req.issue}
        </div>
        <div style={{ marginBottom: 16 }}>
          <label className="label">Resolution notes (optional)</label>
          <textarea className="input" rows={3} placeholder="What was done to fix this?" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ resize: "vertical" }} />
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => { onResolve(req.id, notes); onClose(); }}>
            <CheckCircle size={13} /> Resolve
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shared layout wrapper ─────────────────────
function Layout({ active, children }: { active: string; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const titles: Record<string, { title: string; sub: string }> = {
    dashboard:   { title: "Dashboard",   sub: "Overview of your assigned properties"        },
    tenants:     { title: "Tenants",     sub: "Track tenant payment status"                 },
    maintenance: { title: "Maintenance", sub: "View and resolve maintenance requests"        },
    report:      { title: "Report",      sub: "Monthly rent collection report"               },
  };
  const info = titles[active] || titles.dashboard;
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--lr-bg-page)" }}>
      <div style={{ display: "none", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 40, width: 240 }} className="desktop-sidebar">
        <Sidebar active={active} />
      </div>
      {sidebarOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} onClick={() => setSidebarOpen(false)} />
          <div style={{ position: "relative", width: 240, height: "100%", zIndex: 51 }}>
            <Sidebar active={active} onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}
      <main className="main-content" style={{ flex: 1, padding: "24px 20px", overflowX: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="hamburger" onClick={() => setSidebarOpen(true)} style={{ background: "#fff", border: "1px solid var(--lr-border)", borderRadius: 8, padding: 8, cursor: "pointer", display: "flex" }}>
              <Menu size={18} color="var(--lr-text-secondary)" />
            </button>
            <div>
              <h1 className="page-title" style={{ fontSize: "clamp(1.1rem, 3vw, 1.5rem)" }}>{info.title}</h1>
              <p className="page-subtitle">{info.sub}</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NotificationBell />
            <MobileProfileButton role="caretaker" />
          </div>
        </div>
        {children}
        <div className="bottom-nav-spacer" />
      </main>

      {/* ── Bottom nav (mobile) ── */}
      <nav className="bottom-nav">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className={`bottom-nav-item ${active === item.key ? "bottom-nav-active" : ""}`}>
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <style>{`
        @media (min-width: 768px) {
          .desktop-sidebar { display: block !important; }
          .main-content    { margin-left: 240px !important; padding: 32px !important; }
          .hamburger       { display: none !important; }
          .stats-grid      { grid-template-columns: repeat(4, 1fr) !important; }
        }
        @media (max-width: 767px) {
          .main-content { margin-left: 0 !important; padding: 16px !important; }
          .stats-grid   { grid-template-columns: repeat(2, 1fr) !important; }
        }
        .bottom-nav { display: none; }
        .bottom-nav-spacer { display: none; }
        @media (max-width: 767px) {
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
      `}</style>
    </div>
  );
}

// ══════════════════════════════════════════════
// DASHBOARD PAGE
// ══════════════════════════════════════════════
export default function CaretakerDashboard() {
  const queryClient = useQueryClient();
  const [showAddTenant, setShowAddTenant] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["caretaker-context"],
    queryFn:  () => api.get("/api/caretaker/context/").then((r) => r.data),
  });

  const properties: any[] = data?.properties || [];
  const totalPaid    = properties.reduce((s, p) => s + p.paid_count, 0);
  const totalPartial = properties.reduce((s, p) => s + p.partial_count, 0);
  const totalUnpaid  = properties.reduce((s, p) => s + p.unpaid_count, 0);
  const totalOverdue = properties.reduce((s, p) => s + p.overdue_count, 0);
  
  return (
    <Layout active="dashboard">
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--lr-text-muted)" }}>Loading...</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="stats-grid" style={{ display: "grid", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Fully paid",    value: totalPaid,    bg: "#EAF3DE", color: "#27500A", icon: <CheckCircle size={14} color="#639922" /> },
              { label: "Partially paid",value: totalPartial, bg: "#FAEEDA", color: "#633806", icon: <Clock size={14} color="#BA7517" /> },
              { label: "Unpaid",        value: totalUnpaid,  bg: "#FCEBEB", color: "#791F1F", icon: <AlertCircle size={14} color="#A32D2D" /> },
              { label: "Overdue",       value: totalOverdue, bg: "#FCEBEB", color: "#791F1F", icon: <AlertCircle size={14} color="#A32D2D" /> },
            ].map((s, i) => (
              <div key={s.label} className="stat-card animate-slide-up" style={{ animationDelay: `${i * 0.05}s` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <p className="stat-label">{s.label}</p>
                  <div style={{ width: 28, height: 28, background: s.bg, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>{s.icon}</div>
                </div>
                <p className="stat-value" style={{ fontSize: "clamp(1.2rem, 3vw, 1.5rem)", color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Property cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {properties.map((prop) => {
              const rate = prop.occupied > 0
                ? Math.round((prop.paid_count / prop.occupied) * 100)
                : 0;
              return (
                <div key={prop.id} className="card">
                  {/* Property header */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 40, height: 40, background: "var(--lr-primary-light)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Building2 size={18} color="var(--lr-primary)" />
                      </div>
                      <div>
                        <p style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem", color: "var(--lr-text-primary)", marginBottom: 2 }}>{prop.name}</p>
                        <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>{prop.address}</p>
                        <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", marginTop: 2 }}>
                          Landlord: <span style={{ color: "var(--lr-text-secondary)", fontWeight: 500 }}>{prop.landlord_name}</span> · {prop.landlord_phone}
                        </p>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.3rem", fontWeight: 700, color: rate >= 80 ? "var(--lr-primary)" : "#BA7517" }}>{rate}%</p>
                      <p style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)" }}>collection rate</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ height: 6, background: "var(--lr-border)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${rate}%`, background: rate >= 80 ? "var(--lr-primary)" : "#BA7517", borderRadius: 99, transition: "width 0.5s" }} />
                    </div>
                  </div>

                  {/* Stats row */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    {[
                      { label: "Paid",    value: prop.paid_count,    bg: "#EAF3DE", color: "#27500A" },
                      { label: "Partial", value: prop.partial_count, bg: "#FAEEDA", color: "#633806" },
                      { label: "Unpaid",  value: prop.unpaid_count,  bg: "#FCEBEB", color: "#791F1F" },
                      { label: "Vacant",  value: prop.vacant,        bg: "var(--lr-bg-page)", color: "var(--lr-text-muted)" },
                    ].map((s) => (
                      <div key={s.label} style={{ background: s.bg, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                        <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.1rem", fontWeight: 700, color: s.color }}>{s.value}</p>
                        <p style={{ fontSize: "0.68rem", color: s.color, opacity: 0.8 }}>{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Quick links */}
                  <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                    <Link href={`/caretaker/tenants?property_id=${prop.id}`} className="btn-secondary" style={{ textDecoration: "none", padding: "7px 12px", fontSize: "0.78rem" }}>
                      <Users size={13} /> View tenants
                    </Link>
                    <button 
                      className="btn-primary" 
                      style={{ textDecoration: "none", padding: "7px 12px", fontSize: "0.78rem" }} 
                      onClick={() => setShowAddTenant(true)}
                    >
                      <UserPlus size={13} /> Add tenant
                    </button>
                    <Link href={`/caretaker/report?property_id=${prop.id}`} className="btn-secondary" style={{ textDecoration: "none", padding: "7px 12px", fontSize: "0.78rem" }}>
                      <FileText size={13} /> View report
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Add Tenant Modal */}
      {showAddTenant && (
        <AddTenantModal
          onClose={() => setShowAddTenant(false)}
          onSuccess={() => {
            setShowAddTenant(false);
            queryClient.invalidateQueries({ queryKey: ["caretaker-context"] });
            queryClient.invalidateQueries({ queryKey: ["caretaker-tenants"] });
          }}
          restrictToProps={properties.map((p: any) => p.id)}
        />
      )}
    </Layout>
  );
}