"use client";

import { useQuery } from "@tanstack/react-query";
import { Home, CreditCard, FileText, Wrench, Settings, LogOut, Download } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { formatKES, formatDate } from "@/lib/utils";
import type { Receipt } from "@/types";
import { NotificationBell } from "@/components/NotificationBell";
import { MobileProfileButton } from "@/components/MobileProfileButton";

const NAV = [
  { href: "/tenant/dashboard",   label: "Dashboard",   icon: <Home size={17} />      },
  { href: "/tenant/payments",    label: "Payments",    icon: <CreditCard size={17} /> },
  { href: "/tenant/receipts",    label: "Receipts",    icon: <FileText size={17} />   },
  { href: "/tenant/maintenance", label: "Maintenance", icon: <Wrench size={17} />    },
  { href: "/tenant/settings",    label: "Settings",    icon: <Settings size={17} />   },
];

export default function ReceiptsPage() {
  const router = useRouter();
  const user   = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const { data, isLoading } = useQuery({
    queryKey: ["my-receipts", user?.id],
    queryFn:  () => api.get("/api/payments/receipts/").then((r) => r.data),
  });

  const receipts: Receipt[] = data?.results || [];

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
          <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, color: "var(--lr-primary)", fontSize: "0.95rem" }}>LumidahRentals</span>
        </div>

        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <p style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--lr-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 8px", marginBottom: 4 }}>Menu</p>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={`nav-item ${item.href === "/tenant/receipts" ? "nav-item-active" : ""}`}>
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 className="page-title">Receipts</h1>
            <p className="page-subtitle">Download and view your payment receipts</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NotificationBell />
            <MobileProfileButton role="tenant" />
          </div>
        </div>

        <div className="card">
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "var(--lr-text-muted)" }}>Loading receipts...</div>
          ) : receipts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <FileText size={40} style={{ margin: "0 auto 12px", opacity: 0.25, display: "block" }} />
              <p style={{ fontSize: "0.95rem", fontWeight: 500, color: "var(--lr-text-primary)", marginBottom: 4 }}>No receipts yet</p>
              <p style={{ fontSize: "0.875rem", color: "var(--lr-text-muted)" }}>Receipts are generated automatically after each successful payment</p>
            </div>
          ) : (
            <>
              {/* ── Desktop table ── */}
              <div className="receipts-table-wrap">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--lr-border)" }}>
                      <th className="table-header">Receipt no.</th>
                      <th className="table-header">Unit</th>
                      <th className="table-header">Property</th>
                      <th className="table-header">Amount</th>
                      <th className="table-header">Method</th>
                      <th className="table-header">Date</th>
                      <th className="table-header"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map((r) => (
                      <tr key={r.id} className="table-row">
                        <td className="table-cell">
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem", color: "var(--lr-primary)", fontWeight: 500 }}>
                            {r.receipt_number}
                          </span>
                        </td>
                        <td className="table-cell">Unit {r.unit_number}</td>
                        <td className="table-cell">{r.property_name}</td>
                        <td className="table-cell" style={{ fontWeight: 600, color: "var(--lr-text-primary)" }}>{formatKES(r.amount_paid)}</td>
                        <td className="table-cell"><span className="badge badge-neutral">{r.payment_method.toUpperCase()}</span></td>
                        <td className="table-cell">{formatDate(r.generated_at)}</td>
                        <td className="table-cell">
                          {r.receipt_pdf ? (
                            <a href={r.receipt_pdf} download className="btn-secondary" style={{ padding: "6px 12px", textDecoration: "none", fontSize: "0.8rem" }}>
                              <Download size={13} /> PDF
                            </a>
                          ) : <span style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Mobile cards ── */}
              <div className="receipts-cards">
                {receipts.map((r) => (
                  <div key={r.id} style={{ padding: "14px 0", borderBottom: "1px solid var(--lr-border)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem", color: "var(--lr-primary)", fontWeight: 500 }}>
                        {r.receipt_number}
                      </span>
                      <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--lr-text-primary)" }}>
                        {formatKES(r.amount_paid)}
                      </span>
                    </div>
                    <p style={{ fontSize: "0.8rem", color: "var(--lr-text-secondary)", marginBottom: 2 }}>
                      Unit {r.unit_number} · {r.property_name}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 8 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span className="badge badge-neutral">{r.payment_method.toUpperCase()}</span>
                        <span style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>{formatDate(r.generated_at)}</span>
                      </div>
                      {r.receipt_pdf ? (
                        <a href={r.receipt_pdf} download className="btn-secondary" style={{ padding: "6px 12px", textDecoration: "none", fontSize: "0.78rem" }}>
                          <Download size={12} /> PDF
                        </a>
                      ) : <span style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>—</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="bottom-nav-spacer" />
      </main>

      {/* ── Bottom nav (mobile) ── */}
      <nav className="bottom-nav">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className={`bottom-nav-item ${item.href === "/tenant/receipts" ? "bottom-nav-active" : ""}`}>
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
        .receipts-table-wrap { display: block; }
        .receipts-cards { display: none; }
        .bottom-nav { display: none; }
        .bottom-nav-spacer { display: none; }

        @media (max-width: 767px) {
          .tenant-sidebar { display: none; }
          .tenant-main { margin-left: 0; padding: 20px 16px; }
          .receipts-table-wrap { display: none; }
          .receipts-cards { display: block; }
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
