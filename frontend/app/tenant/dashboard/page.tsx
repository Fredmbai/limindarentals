"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Home, CreditCard, FileText, Wrench, Settings, LogOut, AlertCircle, CheckCircle, Clock, Building2, Plus } from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import api from "@/lib/api";
import { formatKES, formatDate, getPaymentStatusBadge } from "@/lib/utils";
import type { Tenancy, Payment } from "@/types";
import { AddRentalUnitModal } from "@/components/AddRentalUnitModal";
import { NotificationBell } from "@/components/NotificationBell";
import { MobileProfileButton } from "@/components/MobileProfileButton";

function getStatusStyle(status: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    paid:           { bg: "#EAF3DE", color: "#27500A", label: "Paid"          },
    paid_ahead:     { bg: "#E1F5EE", color: "#085041", label: "Paid ahead"    },
    partially_paid: { bg: "#FAEEDA", color: "#633806", label: "Partially paid" },
    unpaid:         { bg: "#FCEBEB", color: "#791F1F", label: "Unpaid"        },
  };
  return map[status] || { bg: "var(--lr-bg-page)", color: "var(--lr-text-muted)", label: status };
}

const NAV = [
  { href: "/tenant/dashboard",   label: "Dashboard",   icon: <Home size={17} />     },
  { href: "/tenant/payments",    label: "Payments",    icon: <CreditCard size={17} /> },
  { href: "/tenant/receipts",    label: "Receipts",    icon: <FileText size={17} />  },
  { href: "/tenant/maintenance", label: "Maintenance", icon: <Wrench size={17} />   },
  { href: "/tenant/settings",    label: "Settings",    icon: <Settings size={17} />  },
];

export default function TenantDashboard() {
  const router       = useRouter();
  const user         = useAuthStore((s) => s.user);
  const hydrated     = useAuthStore((s) => s._hasHydrated);
  const logout       = useAuthStore((s) => s.logout);
  usePushNotifications();
  const queryClient  = useQueryClient();
  const [showAddUnit, setShowAddUnit] = useState(false);

  useEffect(() => {
    if (!hydrated) return;  // wait for Zustand to finish reading from storage
    if (user && user.role !== "tenant") router.replace("/landlord/dashboard");
    if (!user) router.replace("/login");
  }, [user, hydrated, router]);

  const { data: tenanciesData } = useQuery({
    queryKey: ["my-tenancies", user?.id],
    queryFn:  () => api.get("/api/tenancies/my/").then((r) => r.data),
  });
  const { data: paymentsData } = useQuery({
    queryKey: ["my-payments", user?.id],
    queryFn:  () => api.get("/api/payments/").then((r) => r.data),
  });

  const tenancies: Tenancy[] = tenanciesData?.results || [];
  const payments:  Payment[] = paymentsData?.results  || [];

  const activeTenancies  = tenancies.filter((t) => t.status === "active");
  const pendingTenancies = tenancies.filter((t) => t.status === "pending");
  const recentPayments   = payments.slice(0, 5);
  const totalPaid        = payments
    .filter((p) => p.status === "success")
    .reduce((sum, p) => sum + parseFloat(p.amount_paid), 0);

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
            <Link key={item.href} href={item.href} className={`nav-item ${item.href === "/tenant/dashboard" ? "nav-item-active" : ""}`}>
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

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">Good day, {user?.full_name?.split(" ")[0]} 👋</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NotificationBell />
            <MobileProfileButton role="tenant" />
          </div>
        </div>

        {/* Pending alert */}
        {pendingTenancies.length > 0 && (
          <div className="animate-slide-up" style={{ background: "#FAEEDA", border: "1px solid rgba(186,117,23,0.25)", borderRadius: 12, padding: "14px 18px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AlertCircle size={18} color="#BA7517" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: "0.875rem", color: "#633806", fontWeight: 500 }}>
                You have {pendingTenancies.length} pending tenancy — initial payment required
              </span>
            </div>
            <Link href="/tenant/payments" style={{ fontSize: "0.8rem", fontWeight: 600, color: "#BA7517", textDecoration: "none", whiteSpace: "nowrap" }}>
              Pay now →
            </Link>
          </div>
        )}

        {/* Stat cards */}
        <div className="stat-grid" style={{ marginBottom: 28 }}>
          <div className="stat-card animate-slide-up">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p className="stat-label">Active units</p>
              <div style={{ width: 32, height: 32, background: "var(--lr-primary-light)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Building2 size={16} color="var(--lr-primary)" />
              </div>
            </div>
            <p className="stat-value">{activeTenancies.length}</p>
            <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)", marginTop: 2 }}>{tenancies.length} total</p>
          </div>

          <div className="stat-card animate-slide-up" style={{ animationDelay: "0.05s" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p className="stat-label">Total paid</p>
              <div style={{ width: 32, height: 32, background: "#EAF3DE", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CheckCircle size={16} color="#639922" />
              </div>
            </div>
            <p className="stat-value">{formatKES(totalPaid)}</p>
            <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)", marginTop: 2 }}>{payments.filter((p) => p.status === "success").length} payments</p>
          </div>

          <div className="stat-card animate-slide-up" style={{ animationDelay: "0.1s" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p className="stat-label">Pending</p>
              <div style={{ width: 32, height: 32, background: "#FAEEDA", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Clock size={16} color="#BA7517" />
              </div>
            </div>
            <p className="stat-value">{payments.filter((p) => p.status === "pending").length}</p>
            <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)", marginTop: 2 }}>Awaiting confirmation</p>
          </div>
        </div>

        {/* Two-column content */}
        <div className="content-grid" style={{ marginBottom: 24 }}>

          {/* My units */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
              <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem", color: "var(--lr-text-primary)" }}>My units</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-secondary" style={{ padding: "6px 12px", fontSize: "0.78rem" }} onClick={() => setShowAddUnit(true)}>
                  <Plus size={13} /> Add unit
                </button>
                <Link href="/tenant/payments" style={{ fontSize: "0.8rem", color: "var(--lr-primary)", textDecoration: "none", fontWeight: 500, alignSelf: "center" }}>
                  Pay rent →
                </Link>
              </div>
            </div>

            {tenancies.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--lr-text-muted)" }}>
                <Building2 size={32} style={{ margin: "0 auto 8px", opacity: 0.4, display: "block" }} />
                <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 6 }}>No unit linked yet</p>
                <p style={{ fontSize: "0.8rem", marginBottom: 16 }}>Your account is ready — you just need to select your unit and sign the tenancy agreement.</p>
                <a href="/register?resume=1" className="btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
                  <Building2 size={14} /> Complete setup
                </a>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {tenancies.map((t) => {
                  const ps        = t.payment_status;
                  const style     = getStatusStyle(ps?.status || "unpaid");
                  const isInitial = t.status === "pending";
                  return (
                    <div key={t.id} style={{ padding: "14px", background: "var(--lr-bg-page)", borderRadius: 10, border: `1px solid ${ps?.is_overdue ? "rgba(162,45,45,0.3)" : "transparent"}` }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 2 }}>Unit {t.unit.unit_number}</p>
                          <p style={{ fontSize: "0.78rem", color: "var(--lr-text-muted)" }}>{t.property_name} · {formatKES(t.rent_snapshot)}/mo</p>
                        </div>
                        <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: "0.72rem", fontWeight: 600, whiteSpace: "nowrap", background: isInitial ? "#FAEEDA" : style.bg, color: isInitial ? "#633806" : style.color }}>
                          {isInitial ? "Payment required" : style.label}
                        </span>
                      </div>
                      {!isInitial && ps && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                          {ps.paid_until && (
                            <p style={{ fontSize: "0.72rem", color: ps.status === "paid_ahead" ? "#085041" : "var(--lr-text-muted)" }}>
                              Paid until: <strong>{formatDate(ps.paid_until)}</strong>
                            </p>
                          )}
                          {ps.balance > 0 && (
                            <p style={{ fontSize: "0.72rem", color: "var(--lr-danger)" }}>Balance: <strong>{formatKES(ps.balance)}</strong></p>
                          )}
                          {ps.is_overdue && (
                            <p style={{ fontSize: "0.72rem", color: "var(--lr-danger)", fontWeight: 600 }}>{ps.days_overdue} days overdue</p>
                          )}
                        </div>
                      )}
                      <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", marginTop: 8 }}>
                        Landlord: {t.landlord_name} · {t.landlord_phone}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent payments */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem", color: "var(--lr-text-primary)" }}>Recent payments</h3>
              <Link href="/tenant/payments" style={{ fontSize: "0.8rem", color: "var(--lr-primary)", textDecoration: "none", fontWeight: 500 }}>View all →</Link>
            </div>

            {recentPayments.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "var(--lr-text-muted)" }}>
                <CreditCard size={32} style={{ margin: "0 auto 8px", opacity: 0.4, display: "block" }} />
                <p style={{ fontSize: "0.875rem" }}>No payments yet</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {recentPayments.map((p) => {
                  const badge = getPaymentStatusBadge(p.status);
                  return (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--lr-border)", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--lr-text-primary)", marginBottom: 2 }}>
                          {p.payment_type === "initial" ? "Initial payment" : p.payment_type === "monthly" ? "Monthly rent" : "Custom payment"}
                        </p>
                        <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>
                          {p.paid_at ? formatDate(p.paid_at) : formatDate(p.created_at)} · Unit {p.tenancy_unit}
                        </p>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 3 }}>{formatKES(p.amount_paid)}</p>
                        <span className={`badge ${badge.class}`}>{badge.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="card">
          <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem", color: "var(--lr-text-primary)", marginBottom: 16 }}>Quick actions</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/tenant/payments"    className="btn-primary"    style={{ textDecoration: "none" }}><CreditCard size={15} /> Pay rent</Link>
            <Link href="/tenant/maintenance" className="btn-secondary"  style={{ textDecoration: "none" }}><Wrench size={15} /> Report issue</Link>
            <Link href="/tenant/receipts"    className="btn-secondary"  style={{ textDecoration: "none" }}><FileText size={15} /> View receipts</Link>
          </div>
        </div>

        {/* Bottom nav spacer on mobile */}
        <div className="bottom-nav-spacer" />
      </main>

      {/* ── Bottom nav (mobile) ── */}
      <nav className="bottom-nav">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className={`bottom-nav-item ${item.href === "/tenant/dashboard" ? "bottom-nav-active" : ""}`}>
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {showAddUnit && (
        <AddRentalUnitModal
          onClose={() => setShowAddUnit(false)}
          onSuccess={() => {
            setShowAddUnit(false);
            queryClient.invalidateQueries({ queryKey: ["my-tenancies"] });
          }}
          tenantName={user?.full_name || ""}
        />
      )}

      <style>{`
        .tenant-sidebar {
          width: 240px; background: #fff; border-right: 1px solid var(--lr-border);
          display: flex; flex-direction: column; padding: 24px 16px;
          position: fixed; top: 0; left: 0; bottom: 0; z-index: 40;
        }
        .tenant-main {
          margin-left: 240px; flex: 1; padding: 32px;
        }
        .stat-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
        }
        .content-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 24px;
        }
        .bottom-nav { display: none; }
        .bottom-nav-spacer { display: none; }

        @media (max-width: 1024px) {
          .stat-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 767px) {
          .tenant-sidebar { display: none; }
          .tenant-main { margin-left: 0; padding: 20px 16px; }
          .stat-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
          .content-grid { grid-template-columns: 1fr; gap: 16px; }
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
