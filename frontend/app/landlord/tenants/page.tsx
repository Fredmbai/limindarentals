"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Search, X, Menu, Home, Phone,
  FileText, CheckCircle, Clock, Eye,
  StopCircle, CreditCard, Receipt,
  ChevronDown, Building2, AlertCircle,
  Smartphone, Banknote, Download, Loader2,
} from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { formatKES, formatDate, getTenancyStatusBadge, getPaymentStatusBadge } from "@/lib/utils";
import { NotificationBell } from "@/components/NotificationBell";
import { MobileProfileButton } from "@/components/MobileProfileButton";
import type { Tenancy, Payment, Property } from "@/types";

const NAV = [
  { href: "/landlord/dashboard",   label: "Dashboard"   },
  { href: "/landlord/properties",  label: "Properties"  },
  { href: "/landlord/tenants",     label: "Tenants", active: true },
  { href: "/landlord/payments",    label: "Payments"    },
  { href: "/landlord/maintenance", label: "Maintenance" },
  { href: "/landlord/reports",     label: "Reports"     },
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
          <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, color: "var(--lr-primary)", fontSize: "0.95rem" }}>LumidahRentals</span>
        </div>
        {onClose && <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color="var(--lr-text-muted)" /></button>}
      </div>
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} onClick={onClose} className={`nav-item ${(item as any).active ? "nav-item-active" : ""}`}>
            {item.label}
          </Link>
        ))}
      </nav>
      <div style={{ borderTop: "1px solid var(--lr-border)", paddingTop: 16 }}>
        <div style={{ padding: "8px", marginBottom: 4 }}>
          <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--lr-text-primary)" }}>{user?.full_name}</p>
          <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>Landlord</p>
        </div>
        <button onClick={async () => { await logout(); router.push("/login"); }} className="nav-item" style={{ width: "100%", border: "none", background: "none", cursor: "pointer", color: "var(--lr-danger)" }}>
          Sign out
        </button>
      </div>
    </aside>
  );
}

// ── Payment status helper ─────────────────────
function PayStatusBadge({ ps, tenancyStatus }: { ps: any; tenancyStatus: string }) {
  if (tenancyStatus === "pending") return <span className="badge badge-warning">Awaiting initial payment</span>;
  if (!ps) return <span className="badge badge-neutral">—</span>;
  const map: Record<string, { cls: string; label: string }> = {
    paid:          { cls: "badge-success", label: "Paid"          },
    paid_ahead:    { cls: "badge-success", label: "Paid ahead"    },
    partially_paid:{ cls: "badge-warning", label: "Partially paid" },
    unpaid:        { cls: "badge-danger",  label: "Unpaid"        },
  };
  const s = map[ps.status] || { cls: "badge-neutral", label: ps.status };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

// ── Tenant detail drawer ──────────────────────
function TenancyDrawer({ tenancy, onClose, onEnd }: {
  tenancy: Tenancy;
  onClose: () => void;
  onEnd:   (id: string) => void;
}) {
  const [tab, setTab] = useState<"details" | "payments" | "receipts">("details");
  const badge = getTenancyStatusBadge(tenancy.status);
  const ps    = (tenancy as any).payment_status;

  const { data: paymentsData, isLoading: loadingPay } = useQuery({
    queryKey: ["tenancy-payments-landlord", tenancy.id],
    queryFn:  () => api.get(`/api/payments/tenancy/${tenancy.id}/`).then((r) => r.data),
    enabled:  tab === "payments",
  });

  const { data: receiptsData, isLoading: loadingRec } = useQuery({
    queryKey: ["tenancy-receipts-landlord", tenancy.id],
    queryFn:  () => api.get(`/api/payments/tenancy/${tenancy.id}/receipts/`).then((r) => r.data),
    enabled:  tab === "receipts",
  });

  const payments: Payment[] = paymentsData?.results || paymentsData || [];
  const receipts: any[]     = receiptsData?.results || receiptsData || [];

  const totalPaid  = payments.filter((p) => p.status === "success").reduce((s, p) => s + parseFloat(p.amount_paid), 0);
  const lastPay    = payments.find((p) => p.status === "success");

  // Determine if current month is covered using paid_until (always available, no tab dependency)
  const now = new Date();
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const paidUntilDate  = ps?.paid_until ? new Date(ps.paid_until) : null;
  const currentMonthCovered = tenancy.status === "active" && paidUntilDate !== null && paidUntilDate >= lastDayOfMonth;

  // Build month-by-month coverage summary
  // Shows previous unpaid/partial months (up to 3 back), current month, and paid-ahead future months
  function getMonthCoverage(paidUntil: string | null): Array<{ label: string; status: "paid" | "partially_paid" | "unpaid"; coveredUntil?: string }> {
    const months: Array<{ label: string; status: "paid" | "partially_paid" | "unpaid"; coveredUntil?: string }> = [];
    // Parse date string as local time to avoid UTC off-by-one
    const until = paidUntil
      ? (() => { const [y, m, d] = paidUntil.split("-").map(Number); return new Date(y, m - 1, d); })()
      : null;

    // Find earliest uncovered month (look up to 3 months back)
    let startOffset = 0;
    for (let i = -3; i < 0; i++) {
      const d    = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      if (!until || until < mEnd) { startOffset = i; break; }
    }

    for (let i = startOffset; i <= 3; i++) {
      const d     = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const mEnd  = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const mName = d.toLocaleString("default", { month: "long", year: "numeric" });
      const label = i === 0  ? `This month · ${mName}`
                  : i === -1 ? `Last month · ${mName}`
                  : i < -1  ? `${Math.abs(i)} months ago · ${mName}`
                  : mName;

      const status: "paid" | "partially_paid" | "unpaid" =
        (!until || until < d) ? "unpaid"
        : until >= mEnd       ? "paid"
        :                       "partially_paid";

      // Don't show future months that aren't yet paid
      if (i > 0 && status === "unpaid") break;

      months.push({ label, status, coveredUntil: status === "partially_paid" ? paidUntil! : undefined });

      // Stop after current month unless paid ahead into future
      if (i >= 0 && status !== "paid") break;
    }
    return months;
  }

  const monthCoverage = getMonthCoverage(ps?.paid_until || null);

  const handleDownloadAgreement = () => {
    const agr = (tenancy as any).agreement;
    if (agr?.agreement_pdf) {
      window.open(agr.agreement_pdf, "_blank");
      return;
    }
    // Generate a text version if no PDF
    const content = `
TENANCY AGREEMENT
=================
Property:      ${tenancy.property_name}
Unit:          Unit ${tenancy.unit.unit_number}
Landlord:      ${tenancy.landlord_name}
Tenant:        ${(tenancy as any).agreement?.tenant_name || "—"}
Phone:         ${(tenancy as any).agreement?.tenant_phone || "—"}
National ID:   ${(tenancy as any).agreement?.tenant_id_number || "—"}
Monthly Rent:  KES ${tenancy.rent_snapshot}
Deposit:       KES ${tenancy.deposit_amount}
Lease Start:   ${formatDate(tenancy.lease_start_date)}
Signed By:     ${(tenancy as any).agreement?.signed_name || "—"}
Signed At:     ${(tenancy as any).agreement?.signed_at ? formatDate((tenancy as any).agreement.signed_at) : "—"}

Terms:
1. Monthly rent payable in advance on due date each month.
2. Security deposit refundable upon exit in good condition.
3. Payments via LumidahRentals platform.
4. 30 days written notice required for termination.
5. Governed by the laws of Kenya.

This is a digitally signed tenancy agreement.
    `.trim();
    const blob = new Blob([content], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `Agreement-Unit${tenancy.unit.unit_number}-${(tenancy as any).agreement?.tenant_name || "Tenant"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} onClick={onClose} />
      <div style={{ position: "relative", zIndex: 61, width: "100%", maxWidth: 480, background: "#fff", height: "100%", display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.1)" }} className="animate-slide-in">

        {/* Header */}
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--lr-border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--lr-primary-light)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: "1rem", fontWeight: 700, color: "var(--lr-primary)" }}>
                  {((tenancy as any).agreement?.tenant_name || "T").charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem", color: "var(--lr-text-primary)", marginBottom: 3 }}>
                  {(tenancy as any).agreement?.tenant_name || "Tenant"}
                </p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span className={`badge ${badge.class}`}>{badge.label}</span>
                  <PayStatusBadge ps={ps} tenancyStatus={tenancy.status} />
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              <X size={20} color="var(--lr-text-muted)" />
            </button>
          </div>

          {/* Quick stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div style={{ background: "var(--lr-bg-page)", borderRadius: 8, padding: "8px 10px" }}>
              <p style={{ fontSize: "0.65rem", color: "var(--lr-text-muted)", marginBottom: 2 }}>Unit</p>
              <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--lr-text-primary)" }}>
                {tenancy.unit.unit_number}
              </p>
            </div>
            <div style={{ background: "var(--lr-bg-page)", borderRadius: 8, padding: "8px 10px" }}>
              <p style={{ fontSize: "0.65rem", color: "var(--lr-text-muted)", marginBottom: 2 }}>Rent</p>
              <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--lr-text-primary)" }}>
                {formatKES(tenancy.rent_snapshot)}
              </p>
            </div>
            <div style={{ background: tenancy.status !== "active" ? "var(--lr-bg-page)" : currentMonthCovered ? "#EAF3DE" : ps?.status === "partially_paid" ? "#FAEEDA" : "#FCEBEB", borderRadius: 8, padding: "8px 10px" }}>
              <p style={{ fontSize: "0.65rem", color: tenancy.status !== "active" ? "var(--lr-text-muted)" : currentMonthCovered ? "#27500A" : ps?.status === "partially_paid" ? "#633806" : "#791F1F", marginBottom: 2 }}>This month</p>
              <p style={{ fontSize: "0.82rem", fontWeight: 600, color: tenancy.status !== "active" ? "var(--lr-text-muted)" : currentMonthCovered ? "#639922" : ps?.status === "partially_paid" ? "#BA7517" : "#A32D2D" }}>
                {tenancy.status !== "active" ? "—" : currentMonthCovered ? "Paid" : ps?.status === "partially_paid" ? "Partial" : "Unpaid"}
              </p>
            </div>
          </div>

          {/* Paid until */}
          {ps?.paid_until && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: ps.is_overdue ? "#FCEBEB" : "var(--lr-primary-light)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ fontSize: "0.75rem", color: ps.is_overdue ? "#791F1F" : "var(--lr-primary-dark)", fontWeight: 500 }}>
                {ps.is_overdue ? `${ps.days_overdue} days overdue` : "Paid until"}
              </p>
              <p style={{ fontSize: "0.82rem", fontWeight: 700, color: ps.is_overdue ? "#A32D2D" : "var(--lr-primary)" }}>
                {formatDate(ps.paid_until)}
              </p>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--lr-border)", flexShrink: 0 }}>
          {[
            { key: "details",  label: "Details",  icon: <Users size={13} />     },
            { key: "payments", label: "Payments", icon: <CreditCard size={13} /> },
            { key: "receipts", label: "Receipts", icon: <Receipt size={13} />    },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as any)} style={{ flex: 1, padding: "11px 8px", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: "0.8rem", fontWeight: 500, border: "none", background: "none", cursor: "pointer", borderBottom: `2px solid ${tab === t.key ? "var(--lr-primary)" : "transparent"}`, color: tab === t.key ? "var(--lr-primary)" : "var(--lr-text-muted)", transition: "all 0.15s" }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>

          {/* ── Details ── */}
          {tab === "details" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

              {/* Month-by-month payment coverage */}
              {tenancy.status === "active" && monthCoverage.length > 0 && (
                <div>
                  <p className="section-label">Payment coverage</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {monthCoverage.map((m, i) => {
                      const cfg =
                        m.status === "paid"           ? { bg: "#EAF3DE", color: "#27500A", dot: "#639922", label: i === 0 ? "Fully paid" : "Paid"                } :
                        m.status === "partially_paid" ? { bg: "#FAEEDA", color: "#633806", dot: "#BA7517", label: `Partial — until ${formatDate(m.coveredUntil!)}` } :
                                                        { bg: "#FCEBEB", color: "#791F1F", dot: "#A32D2D", label: "Unpaid"                                         };
                      return (
                        <div key={m.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: cfg.bg, borderRadius: 8, padding: "8px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
                            <p style={{ fontSize: "0.8rem", fontWeight: 500, color: cfg.color }}>
                              {m.label}
                            </p>
                          </div>
                          <p style={{ fontSize: "0.78rem", fontWeight: 600, color: cfg.color }}>{cfg.label}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tenant info */}
              <div>
                <p className="section-label">Tenant information</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { label: "Full name",    value: (tenancy as any).agreement?.tenant_name  || "—" },
                    { label: "Phone",        value: (tenancy as any).agreement?.tenant_phone || "—" },
                    { label: "National ID",  value: (tenancy as any).agreement?.tenant_id_number || "—" },
                  ].map((row) => (
                    <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--lr-border)" }}>
                      <p style={{ fontSize: "0.78rem", color: "var(--lr-text-muted)" }}>{row.label}</p>
                      <p style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--lr-text-primary)" }}>{row.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Unit details */}
              <div>
                <p className="section-label">Unit details</p>
                <div style={{ background: "var(--lr-bg-page)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { label: "Property",     value: tenancy.property_name },
                    { label: "Unit",         value: `Unit ${tenancy.unit.unit_number}` },
                    { label: "Type",         value: tenancy.unit.unit_type.replace("_", " ") },
                    { label: "Monthly rent", value: formatKES(tenancy.rent_snapshot) },
                    { label: "Deposit paid", value: formatKES(tenancy.deposit_amount) },
                    { label: "Lease start",  value: formatDate(tenancy.lease_start_date) },
                  ].map((row) => (
                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between" }}>
                      <p style={{ fontSize: "0.78rem", color: "var(--lr-text-muted)" }}>{row.label}</p>
                      <p style={{ fontSize: "0.78rem", fontWeight: 500, color: "var(--lr-text-primary)", textTransform: "capitalize" }}>{row.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Initial payment */}
              <div>
                <p className="section-label">Initial payment</p>
                <div style={{ background: tenancy.status === "active" ? "#EAF3DE" : "#FAEEDA", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  {tenancy.status === "active" ? <CheckCircle size={16} color="#639922" /> : <Clock size={16} color="#BA7517" />}
                  <div>
                    <p style={{ fontSize: "0.82rem", fontWeight: 500, color: tenancy.status === "active" ? "#27500A" : "#633806" }}>
                      {tenancy.status === "active" ? "Initial payment received" : "Awaiting initial payment"}
                    </p>
                    <p style={{ fontSize: "0.72rem", color: tenancy.status === "active" ? "#27500A" : "#633806", marginTop: 2, opacity: 0.8 }}>
                      Total: {formatKES((tenancy as any).initial_amount_due?.total || 0)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tenancy agreement */}
              {(tenancy as any).agreement && (
                <div>
                  <p className="section-label">Tenancy agreement</p>
                  <div style={{ background: "var(--lr-bg-page)", borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <p style={{ fontSize: "0.78rem", color: "var(--lr-text-muted)" }}>Signed by</p>
                      <p style={{ fontSize: "0.78rem", fontWeight: 500, color: "var(--lr-text-primary)" }}>{(tenancy as any).agreement.signed_name}</p>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <p style={{ fontSize: "0.78rem", color: "var(--lr-text-muted)" }}>Date signed</p>
                      <p style={{ fontSize: "0.78rem", fontWeight: 500, color: "var(--lr-text-primary)" }}>{formatDate((tenancy as any).agreement.signed_at)}</p>
                    </div>
                    <button
                      className="btn-secondary"
                      style={{ width: "100%", justifyContent: "center", padding: "8px" }}
                      onClick={handleDownloadAgreement}
                    >
                      <Download size={13} /> View / Download Agreement
                    </button>
                  </div>
                </div>
              )}

              {/* End tenancy */}
              {tenancy.status === "active" && (
                <button
                  className="btn-danger"
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={() => {
                    if (confirm(`End tenancy for ${(tenancy as any).agreement?.tenant_name}? Unit will be marked vacant.`)) {
                      onEnd(tenancy.id);
                      onClose();
                    }
                  }}
                >
                  <StopCircle size={14} /> End tenancy
                </button>
              )}
            </div>
          )}

          {/* ── Payments ── */}
          {tab === "payments" && (
            <div>
              {/* Summary */}
              {payments.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                  <div style={{ background: "var(--lr-primary-light)", borderRadius: 10, padding: "10px 12px" }}>
                    <p style={{ fontSize: "0.65rem", color: "var(--lr-primary-dark)", marginBottom: 2 }}>Total paid</p>
                    <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "1rem", fontWeight: 700, color: "var(--lr-primary)" }}>{formatKES(totalPaid)}</p>
                  </div>
                  <div style={{ background: lastPay ? "#EAF3DE" : "#FAEEDA", borderRadius: 10, padding: "10px 12px" }}>
                    <p style={{ fontSize: "0.65rem", color: lastPay ? "#27500A" : "#633806", marginBottom: 2 }}>Last payment</p>
                    <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "0.85rem", fontWeight: 600, color: lastPay ? "#27500A" : "#633806" }}>
                      {lastPay ? formatDate(lastPay.paid_at || lastPay.created_at) : "None yet"}
                    </p>
                  </div>
                </div>
              )}

              {/* This month status */}
              {tenancy.status === "active" && (
                <div style={{ background: currentMonthCovered ? "#EAF3DE" : "#FCEBEB", border: `1px solid ${currentMonthCovered ? "rgba(99,153,34,0.2)" : "rgba(162,45,45,0.2)"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                  {currentMonthCovered ? <CheckCircle size={15} color="#639922" /> : <AlertCircle size={15} color="#A32D2D" />}
                  <div>
                    <p style={{ fontSize: "0.8rem", fontWeight: 500, color: currentMonthCovered ? "#27500A" : "#791F1F" }}>
                      {currentMonthCovered ? "This month's rent has been paid" : "This month's rent has NOT been paid"}
                    </p>
                    {ps?.paid_until && (
                      <p style={{ fontSize: "0.7rem", color: currentMonthCovered ? "#27500A" : "#A32D2D", marginTop: 1 }}>
                        Paid until: {formatDate(ps.paid_until)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {loadingPay ? (
                <div style={{ textAlign: "center", padding: "28px 0", color: "var(--lr-text-muted)", fontSize: "0.875rem" }}>Loading...</div>
              ) : payments.length === 0 ? (
                <div style={{ textAlign: "center", padding: "28px 0" }}>
                  <CreditCard size={28} style={{ margin: "0 auto 8px", opacity: 0.2, display: "block" }} />
                  <p style={{ fontSize: "0.875rem", color: "var(--lr-text-muted)" }}>No payments yet</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {payments.map((p) => {
                    const pbadge = getPaymentStatusBadge(p.status);
                    const methodIcons: Record<string, React.ReactNode> = {
                      mpesa: <Smartphone size={12} color="var(--lr-primary)" />,
                      card:  <CreditCard size={12} color="#185FA5" />,
                      bank:  <Banknote size={12} color="#BA7517" />,
                    };
                    return (
                      <div key={p.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--lr-border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                            {methodIcons[p.method]}
                            <p style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--lr-text-primary)" }}>
                              {p.payment_type === "initial" ? "Initial" : p.payment_type === "monthly" ? "Monthly" : p.payment_type.replace("_", " ")}
                            </p>
                          </div>
                          <p style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)" }}>
                            {p.paid_at ? formatDate(p.paid_at) : formatDate(p.created_at)}
                            {p.receipt_number ? ` · ${p.receipt_number}` : ""}
                          </p>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--lr-text-primary)", marginBottom: 2 }}>
                            {formatKES(p.amount_paid || p.amount_due)}
                          </p>
                          <span className={`badge ${pbadge.class}`}>{pbadge.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Receipts ── */}
          {tab === "receipts" && (
            <div>
              {loadingRec ? (
                <div style={{ textAlign: "center", padding: "28px 0", color: "var(--lr-text-muted)", fontSize: "0.875rem" }}>Loading...</div>
              ) : receipts.length === 0 ? (
                <div style={{ textAlign: "center", padding: "28px 0" }}>
                  <Receipt size={28} style={{ margin: "0 auto 8px", opacity: 0.2, display: "block" }} />
                  <p style={{ fontSize: "0.875rem", color: "var(--lr-text-muted)" }}>No receipts yet</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {receipts.map((r: any) => (
                    <div key={r.id} style={{ padding: "10px 14px", background: "var(--lr-bg-page)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem", fontWeight: 600, color: "var(--lr-primary)", marginBottom: 2 }}>
                          {r.receipt_number}
                        </p>
                        <p style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)" }}>
                          {formatDate(r.generated_at)} · {r.payment_method?.toUpperCase()}
                        </p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--lr-text-primary)" }}>
                          {formatKES(r.amount_paid)}
                        </p>
                        {r.receipt_pdf ? (
                          <a href={r.receipt_pdf} download style={{ fontSize: "0.72rem", color: "var(--lr-primary)", fontWeight: 500, textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}>
                            <Download size={12} /> PDF
                          </a>
                        ) : (
                          <span style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)" }}>—</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────
export default function TenantsPage() {
  const user        = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [sidebarOpen,     setSidebarOpen]     = useState(false);
  const [search,          setSearch]          = useState("");
  const [statusFilter,    setStatusFilter]    = useState("all");
  const [propertyFilter,  setPropertyFilter]  = useState("all");
  const [selectedTenancy, setSelectedTenancy] = useState<Tenancy | null>(null);

  const { data: propertiesData } = useQuery({
    queryKey: ["landlord-properties"],
    queryFn:  () => api.get("/api/properties/").then((r) => r.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["landlord-tenancies"],
    queryFn:  () => api.get("/api/tenancies/landlord/").then((r) => r.data),
  });

  const properties: Property[] = propertiesData?.results || [];
  const tenancies:  Tenancy[]  = data?.results           || [];

  const { mutate: endTenancy } = useMutation({
    mutationFn: (id: string) => api.post(`/api/tenancies/${id}/end/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["landlord-tenancies"] });
      queryClient.invalidateQueries({ queryKey: ["landlord-properties"] }); // unit status changes to vacant
    },
    onError: (err: any) => alert(err.response?.data?.detail || "Failed to end tenancy. Please try again."),
  });

  const filtered = tenancies.filter((t) => {
    const name     = ((t as any).agreement?.tenant_name || "").toLowerCase();
    const unit     = t.unit.unit_number.toLowerCase();
    const property = t.property_name.toLowerCase();
    const q        = search.toLowerCase();
    const matchSearch   = !q || name.includes(q) || unit.includes(q) || property.includes(q);
    const matchStatus   = statusFilter === "all"   || t.status === statusFilter;
    const matchProperty = propertyFilter === "all" || t.property_name === properties.find((p) => p.id === propertyFilter)?.name;
    return matchSearch && matchStatus && matchProperty;
  });

  const activeCount  = tenancies.filter((t) => t.status === "active").length;
  const pendingCount = tenancies.filter((t) => t.status === "pending").length;
  const endedCount   = tenancies.filter((t) => t.status === "ended").length;

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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div>
              <h1 className="page-title" style={{ fontSize: "clamp(1.2rem, 3vw, 1.5rem)" }}>Tenants</h1>
              <p className="page-subtitle">Track and manage all tenancies</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NotificationBell />
            <MobileProfileButton role="landlord" />
          </div>
        </div>

        {/* Filters */}
        <div className="tenants-filter-bar" style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          {/* Property filter */}
          <div style={{ position: "relative" }} className="filter-select-wrap">
            <Building2 size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--lr-text-muted)", pointerEvents: "none" }} />
            <select className="input filter-select" value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)} style={{ appearance: "none", paddingLeft: 28, paddingRight: 26, fontSize: "0.82rem" }}>
              <option value="all">All properties</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown size={12} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--lr-text-muted)" }} />
          </div>

          {/* Status pills */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { label: "All",     value: "all",     count: tenancies.length },
              { label: "Active",  value: "active",  count: activeCount      },
              { label: "Pending", value: "pending", count: pendingCount     },
              { label: "Ended",   value: "ended",   count: endedCount       },
            ].map((tab) => (
              <button key={tab.value} onClick={() => setStatusFilter(tab.value)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 99, border: `1.5px solid ${statusFilter === tab.value ? "var(--lr-primary)" : "var(--lr-border)"}`, background: statusFilter === tab.value ? "var(--lr-primary-light)" : "#fff", color: statusFilter === tab.value ? "var(--lr-primary)" : "var(--lr-text-muted)", fontSize: "0.78rem", fontWeight: 500, cursor: "pointer", transition: "all 0.15s" }}>
                {tab.label}
                <span style={{ background: statusFilter === tab.value ? "var(--lr-primary)" : "var(--lr-border)", color: statusFilter === tab.value ? "#fff" : "var(--lr-text-muted)", borderRadius: 99, padding: "0 5px", fontSize: "0.68rem", fontWeight: 600 }}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 18 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--lr-text-muted)", pointerEvents: "none" }} />
          <input className="input" placeholder="Search name, unit, property..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 38 }} />
          {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer" }}><X size={14} color="var(--lr-text-muted)" /></button>}
        </div>

        {/* Table */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--lr-text-muted)" }}>Loading tenants...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 24px" }}>
              <Users size={36} style={{ margin: "0 auto 10px", opacity: 0.2, display: "block" }} />
              <p style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--lr-text-primary)", marginBottom: 4 }}>
                {search || statusFilter !== "all" || propertyFilter !== "all" ? "No tenants match your filters" : "No tenants yet"}
              </p>
            </div>
          ) : (
            <>
              <div className="tenant-table-header" style={{ display: "grid", borderBottom: "1px solid var(--lr-border)", background: "var(--lr-bg-page)" }}>
                <span className="table-header">Tenant</span>
                <span className="table-header">Property / Unit</span>
                <span className="table-header">Rent</span>
                <span className="table-header">Payment status</span>
                <span className="table-header">Tenancy</span>
                <span className="table-header"></span>
              </div>
              {filtered.map((t) => {
                const badge = getTenancyStatusBadge(t.status);
                const ps    = (t as any).payment_status;
                return (
                  <div key={t.id} className="table-row tenant-table-row" style={{ display: "grid", cursor: "pointer" }} onClick={() => setSelectedTenancy(t)}>
                    <div className="table-cell" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--lr-primary-light)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--lr-primary)" }}>
                          {((t as any).agreement?.tenant_name || "T").charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--lr-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {(t as any).agreement?.tenant_name || "Tenant"}
                        </p>
                        <p style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)" }}>{(t as any).agreement?.tenant_phone || "—"}</p>
                      </div>
                    </div>
                    <div className="table-cell">
                      <p style={{ fontSize: "0.82rem", color: "var(--lr-text-primary)", marginBottom: 1 }}>{t.property_name}</p>
                      <p style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)" }}>Unit {t.unit.unit_number}</p>
                    </div>
                    <div className="table-cell">
                      <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--lr-text-primary)" }}>{formatKES(t.rent_snapshot)}/mo</p>
                    </div>
                    <div className="table-cell">
                      <PayStatusBadge ps={ps} tenancyStatus={t.status} />
                      {ps?.paid_until && (
                        <p style={{ fontSize: "0.68rem", color: "var(--lr-text-muted)", marginTop: 2 }}>
                          Until {formatDate(ps.paid_until)}
                        </p>
                      )}
                    </div>
                    <div className="table-cell">
                      <span className={`badge ${badge.class}`}>{badge.label}</span>
                    </div>
                    <div className="table-cell" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                      <div style={{ padding: "5px 10px", background: "var(--lr-bg-page)", borderRadius: 6, display: "flex", alignItems: "center", gap: 4, fontSize: "0.75rem", color: "var(--lr-primary)", fontWeight: 500 }}>
                        <Eye size={12} /> View
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </main>

      {selectedTenancy && (
        <TenancyDrawer
          tenancy={selectedTenancy}
          onClose={() => setSelectedTenancy(null)}
          onEnd={(id) => endTenancy(id)}
        />
      )}

      <style>{`
        .tenant-table-header { grid-template-columns: 2fr 1.5fr 0.8fr 1fr 0.8fr 0.4fr; }
        .tenant-table-row    { grid-template-columns: 2fr 1.5fr 0.8fr 1fr 0.8fr 0.4fr; }
        @media (min-width: 768px) {
          .desktop-sidebar { display: block !important; }
          .main-content    { margin-left: 240px !important; padding: 32px !important; }
          .hamburger       { display: none !important; }
        }
        @media (max-width: 767px) {
          .main-content        { margin-left: 0 !important; padding: 16px !important; }
          .tenant-table-header { display: none !important; }
          .tenant-table-row    { grid-template-columns: 1fr auto !important; }
          .tenant-table-row .table-cell:nth-child(3),
          .tenant-table-row .table-cell:nth-child(4),
          .tenant-table-row .table-cell:nth-child(5) { display: none; }
          .tenants-filter-bar  { flex-direction: column; align-items: stretch !important; }
          .filter-select-wrap  { width: 100%; }
          .filter-select       { width: 100% !important; min-width: unset !important; }
        }
      `}</style>
    </div>
  );
}