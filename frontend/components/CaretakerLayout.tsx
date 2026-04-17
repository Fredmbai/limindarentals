"use client";

import { useState } from "react";
import { Home, Menu, X, LogOut, Users, Wrench, FileText, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { NotificationBell } from "./NotificationBell";
import { MobileProfileButton } from "./MobileProfileButton";

const NAV = [
  { href: "/caretaker/dashboard",   label: "Dashboard",   key: "dashboard",   icon: <LayoutDashboard size={17} /> },
  { href: "/caretaker/tenants",     label: "Tenants",     key: "tenants",     icon: <Users size={17} />           },
  { href: "/caretaker/maintenance", label: "Maintenance", key: "maintenance", icon: <Wrench size={17} />          },
  { href: "/caretaker/report",      label: "Report",      key: "report",      icon: <FileText size={17} />        },
];

const PAGE_INFO: Record<string, { title: string; sub: string }> = {
  dashboard:   { title: "Dashboard",   sub: "Overview of your assigned properties"  },
  tenants:     { title: "Tenants",     sub: "Track tenant payment status"           },
  maintenance: { title: "Maintenance", sub: "View and resolve maintenance requests" },
  report:      { title: "Report",      sub: "Monthly rent collection report"        },
};

function Sidebar({ active, onClose }: { active: string; onClose?: () => void }) {
  const user   = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  return (
    <aside style={{ width: 240, background: "#fff", borderRight: "1px solid var(--lr-border)", display: "flex", flexDirection: "column", padding: "24px 16px", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 32, height: 32, background: "var(--lr-primary)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Home size={16} color="#fff" />
          </div>
          <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, color: "var(--lr-primary)", fontSize: "0.95rem" }}>LumidahRentals</span>
        </div>
        {onClose && <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color="var(--lr-text-muted)" /></button>}
      </div>
      <div style={{ padding: "8px", marginBottom: 14 }}>
        <div style={{ background: "var(--lr-primary-light)", borderRadius: 8, padding: "8px 10px" }}>
          <p style={{ fontSize: "0.68rem", color: "var(--lr-primary-dark)", marginBottom: 1 }}>Caretaker</p>
          <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--lr-primary)" }}>{user?.full_name}</p>
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

export function CaretakerLayout({ active, children }: { active: string; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const info = PAGE_INFO[active] || PAGE_INFO.dashboard;
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
              <h1 className="page-title" style={{ fontSize: "clamp(1.1rem, 3vw, 1.4rem)" }}>{info.title}</h1>
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