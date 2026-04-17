"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Home, Users, CreditCard, Building2, TrendingUp,
  AlertCircle, LogOut, Bell, Menu, X,
} from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import api from "@/lib/api";
import { formatKES, formatDate, getPaymentStatusBadge, getTenancyStatusBadge } from "@/lib/utils";
import type { Payment, Tenancy } from "@/types";
import { NotificationBell } from "@/components/NotificationBell";
import { MobileProfileButton } from "@/components/MobileProfileButton";

// ── Reusable sidebar nav links ───────────────
const NAV = [
  { href: "/landlord/dashboard",   label: "Dashboard"   },
  { href: "/landlord/properties",  label: "Properties"  },
  { href: "/landlord/tenants",     label: "Tenants"     },
  { href: "/landlord/payments",    label: "Payments"    },
  { href: "/landlord/maintenance", label: "Maintenance" },
  { href: "/landlord/reports", label: "Reports" },
  { href: "/landlord/settings",    label: "Settings"    },
  ];

function Sidebar({ active, onClose }: { active: string; onClose?: () => void }) {
  const user   = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <aside style={{
      width: 240,
      background: "#fff",
      borderRight: "1px solid var(--lr-border)",
      display: "flex",
      flexDirection: "column",
      padding: "24px 16px",
      height: "100%",
    }}>
      {/* Logo + close on mobile */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 32, height: 32, background: "var(--lr-primary)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Home size={16} color="#fff" />
          </div>
          <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, color: "var(--lr-primary)", fontSize: "0.95rem" }}>LumidahRentals</span>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={20} color="var(--lr-text-muted)" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <p style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--lr-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 8px", marginBottom: 4 }}>Menu</p>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className={`nav-item ${active === item.href ? "nav-item-active" : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* User + logout */}
      <div style={{ borderTop: "1px solid var(--lr-border)", paddingTop: 16 }}>
        <div style={{ padding: "8px", marginBottom: 4 }}>
          <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--lr-text-primary)" }}>{user?.full_name}</p>
          <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)", marginTop: 1 }}>Landlord</p>
        </div>
        <button onClick={handleLogout} className="nav-item" style={{ width: "100%", border: "none", background: "none", cursor: "pointer", color: "var(--lr-danger)" }}>
          <LogOut size={17} /> Sign out
        </button>
      </div>
    </aside>
  );
}

export default function LandlordDashboard() {
  const router     = useRouter();
  const user       = useAuthStore((s) => s.user);
  const hydrated   = useAuthStore((s) => s._hasHydrated);
  usePushNotifications();
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [feeBannerDismissed, setFeeBannerDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setFeeBannerDismissed(localStorage.getItem("lr_fee_banner_dismissed") === "1");
    }
  }, []);

  const dismissFeeBanner = () => {
    localStorage.setItem("lr_fee_banner_dismissed", "1");
    setFeeBannerDismissed(true);
  };

  useEffect(() => {
    if (!hydrated) return;  // wait for Zustand to finish reading from storage
    if (user && user.role !== "landlord") router.replace("/tenant/dashboard");
    if (!user) router.replace("/login");
  }, [user, hydrated, router]);

  const { data: propertiesData } = useQuery({
    queryKey: ["landlord-properties"],
    queryFn:  () => api.get("/api/properties/").then((r) => r.data),
  });
  const { data: tenanciesData } = useQuery({
    queryKey: ["landlord-tenancies"],
    queryFn:  () => api.get("/api/tenancies/landlord/").then((r) => r.data),
  });
  const { data: paymentsData } = useQuery({
    queryKey: ["landlord-payments"],
    queryFn:  () => api.get("/api/payments/landlord/").then((r) => r.data),
  });

  const properties = propertiesData?.results || [];
  const tenancies: Tenancy[] = tenanciesData?.results || [];
  const payments:  Payment[]  = paymentsData?.results  || [];

  const activeTenancies  = tenancies.filter((t) => t.status === "active");
  const pendingTenancies = tenancies.filter((t) => t.status === "pending");
  const successPayments  = payments.filter((p)  => p.status === "success");
  const pendingBankPays  = payments.filter((p)  => p.method === "bank" && p.status === "pending");
  const totalRevenue     = successPayments.reduce((sum, p) => sum + parseFloat(p.amount_paid), 0);
  const totalUnits       = properties.reduce((s: number, p: any) => s + (p.units_count  || 0), 0);
  const vacantUnits      = properties.reduce((s: number, p: any) => s + (p.vacant_count || 0), 0);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--lr-bg-page)" }}>

      {/* Desktop sidebar — fixed */}
      <div style={{ display: "none", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 40, width: 240 }} className="desktop-sidebar">
        <Sidebar active="/landlord/dashboard" />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} onClick={() => setSidebarOpen(false)} />
          <div style={{ position: "relative", width: 240, height: "100%", zIndex: 51 }}>
            <Sidebar active="/landlord/dashboard" onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <main className="main-content" style={{ flex: 1, padding: "24px 20px", overflowX: "hidden" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Hamburger — visible on mobile */}
            <button
              className="hamburger"
              onClick={() => setSidebarOpen(true)}
              style={{ background: "#fff", border: "1px solid var(--lr-border)", borderRadius: 8, padding: 8, cursor: "pointer", display: "flex", alignItems: "center" }}
            >
              <Menu size={18} color="var(--lr-text-secondary)" />
            </button>
            <div>
              <h1 className="page-title" style={{ fontSize: "clamp(1.2rem, 3vw, 1.5rem)" }}>Dashboard</h1>
              <p className="page-subtitle">Welcome back, {user?.full_name?.split(" ")[0]}</p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NotificationBell />
            <MobileProfileButton role="landlord" />
          </div>
        </div>

        {/* Bank transfer alert */}
        {pendingBankPays.length > 0 && (
          <div className="animate-slide-up" style={{ background: "#FAEEDA", border: "1px solid rgba(186,117,23,0.25)", borderRadius: 12, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AlertCircle size={16} color="#BA7517" />
              <span style={{ fontSize: "0.8rem", color: "#633806", fontWeight: 500 }}>
                {pendingBankPays.length} bank transfer{pendingBankPays.length > 1 ? "s" : ""} awaiting verification
              </span>
            </div>
            <Link href="/landlord/payments" style={{ fontSize: "0.8rem", fontWeight: 600, color: "#BA7517", textDecoration: "none" }}>Review →</Link>
          </div>
        )}

        {/* Platform fee transparency banner (dismissible) */}
        {!feeBannerDismissed && (
          <div className="animate-slide-up" style={{ background: "linear-gradient(135deg, #E1F5EE, #D0F0E4)", border: "1px solid rgba(15,110,86,0.2)", borderRadius: 12, padding: "16px 18px", marginBottom: 20, position: "relative" }}>
            <button
              onClick={dismissFeeBanner}
              style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--lr-primary-dark)" }}
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
            <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--lr-primary-dark)", marginBottom: 8 }}>
              About platform fees
            </p>
            <p style={{ fontSize: "0.76rem", color: "#085041", lineHeight: 1.65, marginBottom: 8 }}>
              LumidahRentals charges a <strong>2% platform fee</strong> on each rent collection to keep the platform running. A small <strong>Safaricom B2B transfer fee</strong> (KES 12–152 depending on amount) also applies per transaction. These fees ensure fast, secure, and automated rent collection — saving you time, reducing late payments, and giving your tenants a seamless payment experience.
            </p>
            <p style={{ fontSize: "0.76rem", color: "#085041", lineHeight: 1.65 }}>
              You always know exactly what you receive before tenants pay. The full fee breakdown is visible on every payment in the{" "}
              <Link href="/landlord/payments" style={{ color: "var(--lr-primary)", fontWeight: 600, textDecoration: "underline" }}>Payments page</Link>.
            </p>
          </div>
        )}

        {/* Stat cards */}
        <div className="stats-grid" style={{ display: "grid", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total revenue",   value: formatKES(totalRevenue),     sub: `${successPayments.length} payments`,   bg: "var(--lr-primary-light)", color: "var(--lr-primary)",  icon: <TrendingUp size={15} color="var(--lr-primary)" /> },
            { label: "Active tenants",  value: activeTenancies.length,      sub: `${pendingTenancies.length} pending`,   bg: "#EAF3DE",                color: "#639922",             icon: <Users size={15} color="#639922" /> },
            { label: "Total units",     value: totalUnits,                  sub: `${vacantUnits} vacant`,               bg: "#E6F1FB",                color: "#185FA5",             icon: <Building2 size={15} color="#185FA5" /> },
            { label: "Properties",      value: properties.length,           sub: "all locations",                       bg: "#FAEEDA",                color: "#BA7517",             icon: <Home size={15} color="#BA7517" /> },
          ].map((s, i) => (
            <div key={s.label} className="stat-card animate-slide-up" style={{ animationDelay: `${i * 0.05}s` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <p className="stat-label">{s.label}</p>
                <div style={{ width: 30, height: 30, background: s.bg, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {s.icon}
                </div>
              </div>
              <p className="stat-value" style={{ fontSize: "clamp(1.2rem, 3vw, 1.5rem)" }}>{s.value}</p>
              <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", marginTop: 2 }}>{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Two column — stacks on mobile */}
        <div className="two-col" style={{ display: "grid", gap: 20, marginBottom: 20 }}>

          {/* Recent tenancies */}
          <div className="card" style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.9rem" }}>Recent tenancies</h3>
              <Link href="/landlord/tenants" style={{ fontSize: "0.78rem", color: "var(--lr-primary)", textDecoration: "none", fontWeight: 500, flexShrink: 0 }}>View all →</Link>
            </div>
            {tenancies.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "var(--lr-text-muted)" }}>
                <Users size={28} style={{ margin: "0 auto 6px", opacity: 0.3, display: "block" }} />
                <p style={{ fontSize: "0.8rem" }}>No tenancies yet</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {tenancies.slice(0, 5).map((t) => {
                  const badge = getTenancyStatusBadge(t.status);
                  return (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "var(--lr-bg-page)", borderRadius: 8, gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--lr-text-primary)", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {t.agreement?.tenant_name || "Tenant"}
                        </p>
                        <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          Unit {t.unit.unit_number} · {t.property_name}
                        </p>
                      </div>
                      <span className={`badge ${badge.class}`} style={{ flexShrink: 0 }}>{badge.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent payments */}
          <div className="card" style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.9rem" }}>Recent payments</h3>
              <Link href="/landlord/payments" style={{ fontSize: "0.78rem", color: "var(--lr-primary)", textDecoration: "none", fontWeight: 500, flexShrink: 0 }}>View all →</Link>
            </div>
            {payments.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "var(--lr-text-muted)" }}>
                <CreditCard size={28} style={{ margin: "0 auto 6px", opacity: 0.3, display: "block" }} />
                <p style={{ fontSize: "0.8rem" }}>No payments yet</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {payments.slice(0, 5).map((p) => {
                  const badge = getPaymentStatusBadge(p.status);
                  return (
                    <div key={p.id} className="table-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--lr-text-primary)", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {p.tenant_name}
                        </p>
                        <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>
                          Unit {p.tenancy_unit} · {p.method.toUpperCase()}
                        </p>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 3 }}>
                          {formatKES(p.amount_paid || p.amount_due)}
                        </p>
                        <span className={`badge ${badge.class}`}>{badge.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Properties */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.9rem" }}>Properties</h3>
            <Link href="/landlord/properties" className="btn-primary" style={{ textDecoration: "none", padding: "7px 12px", fontSize: "0.78rem" }}>
              Manage
            </Link>
          </div>
          {properties.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "var(--lr-text-muted)" }}>
              <Building2 size={28} style={{ margin: "0 auto 6px", opacity: 0.3, display: "block" }} />
              <p style={{ fontSize: "0.8rem" }}>No properties yet</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {properties.map((p: any) => (
                <div key={p.id} style={{ padding: "12px 14px", background: "var(--lr-bg-page)", borderRadius: 10 }}>
                  <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 3 }}>{p.name}</p>
                  <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", marginBottom: 8 }}>{p.address}</p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span className="badge badge-success">{p.occupied_count} occupied</span>
                    <span className="badge badge-neutral">{p.vacant_count} vacant</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Desktop: show fixed sidebar, hide hamburger */
        @media (min-width: 768px) {
          .desktop-sidebar { display: block !important; }
          .main-content    { margin-left: 240px !important; padding: 32px !important; }
          .hamburger       { display: none !important; }
          .stats-grid      { grid-template-columns: repeat(4, 1fr) !important; }
          .two-col         { grid-template-columns: 1fr 1fr !important; }
        }

        /* Mobile: full width, 2-col stats */
        @media (max-width: 767px) {
          .main-content { margin-left: 0 !important; padding: 16px !important; }
          .stats-grid   { grid-template-columns: repeat(2, 1fr) !important; }
          .two-col      { grid-template-columns: 1fr !important; }
        }

        /* Very small screens: 1-col stats */
        @media (max-width: 400px) {
          .stats-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}