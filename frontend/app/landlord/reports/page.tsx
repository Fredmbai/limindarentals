"use client";

import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileText, TrendingUp, Building2, Clock,
  CheckCircle, AlertCircle, X, Menu, Bell,
  Home, Download, ChevronDown, Calendar,
  CreditCard, Smartphone, Banknote, Filter,
} from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { formatKES, formatDate } from "@/lib/utils";
import type { Property, Payment, Tenancy, Unit } from "@/types";
import { NotificationBell } from "@/components/NotificationBell";
import { MobileProfileButton } from "@/components/MobileProfileButton";

const NAV = [
  { href: "/landlord/dashboard",   label: "Dashboard"   },
  { href: "/landlord/properties",  label: "Properties"  },
  { href: "/landlord/tenants",     label: "Tenants"     },
  { href: "/landlord/payments",    label: "Payments"    },
  { href: "/landlord/maintenance", label: "Maintenance" },
  { href: "/landlord/reports",     label: "Reports", active: true },
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
        <button onClick={async () => { await logout(); router.push("/login"); }} className="nav-item" style={{ width: "100%", border: "none", background: "none", cursor: "pointer", color: "var(--lr-danger)" }}>
          Sign out
        </button>
      </div>
    </aside>
  );
}

// ── Helpers ──────────────────────────────────
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function getMonthOptions() {
  const opts = [];
  const now  = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({ label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` });
  }
  return opts;
}

function downloadCSV(filename: string, rows: string[][], headers: string[]) {
  const csv  = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadHTML(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function SectionHeader({ icon, title, count, color }: { icon: React.ReactNode; title: string; count: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: color, borderRadius: 8, marginBottom: 8 }}>
      {icon}
      <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{title}</span>
      <span style={{ marginLeft: "auto", fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: "0.95rem" }}>{count}</span>
    </div>
  );
}

// ════════════════════════════════════════════
// REPORT 1 — Monthly Rent Collection
// ════════════════════════════════════════════
function RentCollectionReport({ properties, payments, tenancies, selectedMonth, selectedProperty }: {
  properties: Property[];
  payments:   Payment[];
  tenancies:  Tenancy[];
  selectedMonth:    string;
  selectedProperty: string;
}) {
  const [year, month] = selectedMonth.split("-").map(Number);

  // Filter payments for selected month
  const monthPayments = payments.filter((p) => {
    if (p.status !== "success") return false;
    const d = new Date(p.paid_at || p.created_at);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });

  // Build per-unit collection status
  const activeTenancies = tenancies.filter((t) => t.status === "active");

  const unitRows = activeTenancies
    .filter((t) => selectedProperty === "all" || t.property_name === properties.find((p) => p.id === selectedProperty)?.name)
    .map((t) => {
      const unitPayments = monthPayments.filter((p) => p.tenancy === t.id);
      const totalPaid    = unitPayments.reduce((s, p) => s + parseFloat(p.amount_paid), 0);
      const rentDue      = parseFloat(t.rent_snapshot);
      const status       = totalPaid >= rentDue ? "paid" : totalPaid > 0 ? "partial" : "unpaid";
      return {
        tenant:      t.agreement?.tenant_name || "—",
        phone:       t.agreement?.tenant_phone || "—",
        property:    t.property_name,
        unit:        t.unit.unit_number,
        rentDue,
        totalPaid,
        balance:     Math.max(rentDue - totalPaid, 0),
        status,
        payments:    unitPayments,
      };
    });

  const paid    = unitRows.filter((r) => r.status === "paid");
  const partial = unitRows.filter((r) => r.status === "partial");
  const unpaid  = unitRows.filter((r) => r.status === "unpaid");

  const totalExpected = unitRows.reduce((s, r) => s + r.rentDue, 0);
  const totalCollected = unitRows.reduce((s, r) => s + r.totalPaid, 0);
  const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

  const handleDownload = () => {
    const rows = unitRows.map((r) => [
      r.property, `Unit ${r.unit}`, r.tenant, r.phone,
      String(r.rentDue), String(r.totalPaid), String(r.balance),
      r.status.toUpperCase(),
    ]);
    downloadCSV(
      `rent-collection-${selectedMonth}.csv`,
      rows,
      ["Property", "Unit", "Tenant", "Phone", "Rent Due (KES)", "Paid (KES)", "Balance (KES)", "Status"],
    );
  };

  return (
    <div>
      {/* Summary cards */}
      <div className="report-stats" style={{ display: "grid", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Collection rate", value: `${collectionRate}%`,         color: collectionRate >= 80 ? "#639922" : "#BA7517", bg: collectionRate >= 80 ? "#EAF3DE" : "#FAEEDA" },
          { label: "Total collected", value: formatKES(totalCollected),    color: "var(--lr-primary)", bg: "var(--lr-primary-light)" },
          { label: "Outstanding",     value: formatKES(totalExpected - totalCollected), color: "#A32D2D", bg: "#FCEBEB" },
          { label: "Total expected",  value: formatKES(totalExpected),     color: "var(--lr-text-primary)", bg: "var(--lr-bg-page)" },
        ].map((s) => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: "12px 16px" }}>
            <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", marginBottom: 4 }}>{s.label}</p>
            <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.1rem", fontWeight: 700, color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <p style={{ fontSize: "0.78rem", color: "var(--lr-text-muted)" }}>Collection progress</p>
          <p style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--lr-primary)" }}>{collectionRate}%</p>
        </div>
        <div style={{ height: 8, background: "var(--lr-border)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${collectionRate}%`, background: collectionRate >= 80 ? "var(--lr-primary)" : "#BA7517", borderRadius: 99, transition: "width 0.5s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <p style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)" }}>{paid.length} fully paid · {partial.length} partial · {unpaid.length} unpaid</p>
          <p style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)" }}>{unitRows.length} total units</p>
        </div>
      </div>

      {/* Paid section */}
      {paid.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionHeader icon={<CheckCircle size={14} color="#27500A" />} title="Fully paid" count={paid.length} color="#EAF3DE" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {paid.map((r, i) => (
              <div key={i} style={{ display: "grid", gap: 8, padding: "10px 14px", background: "#fff", borderRadius: 8, border: "1px solid var(--lr-border)", alignItems: "center" }} className="report-row">
                <div>
                  <p style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--lr-text-primary)" }}>{r.tenant}</p>
                  <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>{r.phone}</p>
                </div>
                <p style={{ fontSize: "0.78rem", color: "var(--lr-text-secondary)" }}>{r.property} · Unit {r.unit}</p>
                <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#639922", textAlign: "right" }}>{formatKES(r.totalPaid)}</p>
                <span className="badge badge-success" style={{ justifySelf: "end" }}>Paid</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Partial section */}
      {partial.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionHeader icon={<Clock size={14} color="#633806" />} title="Partially paid" count={partial.length} color="#FAEEDA" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {partial.map((r, i) => (
              <div key={i} style={{ display: "grid", gap: 8, padding: "10px 14px", background: "#fff", borderRadius: 8, border: "1px solid rgba(186,117,23,0.2)", alignItems: "center" }} className="report-row">
                <div>
                  <p style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--lr-text-primary)" }}>{r.tenant}</p>
                  <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>{r.phone}</p>
                </div>
                <p style={{ fontSize: "0.78rem", color: "var(--lr-text-secondary)" }}>{r.property} · Unit {r.unit}</p>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#BA7517" }}>{formatKES(r.totalPaid)} paid</p>
                  <p style={{ fontSize: "0.7rem", color: "var(--lr-danger)" }}>Balance: {formatKES(r.balance)}</p>
                </div>
                <span className="badge badge-warning" style={{ justifySelf: "end" }}>Partial</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unpaid section */}
      {unpaid.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionHeader icon={<AlertCircle size={14} color="#791F1F" />} title="Not paid" count={unpaid.length} color="#FCEBEB" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {unpaid.map((r, i) => (
              <div key={i} style={{ display: "grid", gap: 8, padding: "10px 14px", background: "#fff", borderRadius: 8, border: "1px solid rgba(162,45,45,0.2)", alignItems: "center" }} className="report-row">
                <div>
                  <p style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--lr-text-primary)" }}>{r.tenant}</p>
                  <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>{r.phone}</p>
                </div>
                <p style={{ fontSize: "0.78rem", color: "var(--lr-text-secondary)" }}>{r.property} · Unit {r.unit}</p>
                <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--lr-danger)", textAlign: "right" }}>{formatKES(r.rentDue)} due</p>
                <span className="badge badge-danger" style={{ justifySelf: "end" }}>Unpaid</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {unitRows.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--lr-text-muted)" }}>
          <FileText size={32} style={{ margin: "0 auto 8px", opacity: 0.2, display: "block" }} />
          <p style={{ fontSize: "0.875rem" }}>No active tenancies found for this period</p>
        </div>
      )}

      <button className="btn-secondary" onClick={handleDownload} style={{ marginTop: 8 }}>
        <Download size={14} /> Download CSV
      </button>
    </div>
  );
}

// ════════════════════════════════════════════
// REPORT 2 — Occupancy & Vacancy
// ════════════════════════════════════════════
function OccupancyReport({ properties, tenancies }: { properties: Property[]; tenancies: Tenancy[] }) {
  const now = new Date();

  const propertyRows = properties.map((prop) => {
    const propTenancies = tenancies.filter((t) =>
      t.property_name === prop.name && t.status === "active"
    );
    const occupied      = prop.occupied_count || 0;
    const vacant        = prop.vacant_count   || 0;
    const total         = prop.units_count    || 0;
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;
    const potentialLoss = vacant * (propTenancies[0] ? parseFloat(propTenancies[0].rent_snapshot) : 0);

    // Get vacant units with their details
    const occupiedUnitIds  = propTenancies.map((t) => t.unit.unit_number);
    const allUnits: any[]  = prop.units || [];
    const vacantUnits      = allUnits.filter((u) => u.status === "vacant");
    const occupiedUnits    = allUnits.filter((u) => u.status === "occupied");

    return { prop, occupied, vacant, total, occupancyRate, vacantUnits, occupiedUnits, potentialLoss };
  });

  const totalUnits    = propertyRows.reduce((s, r) => s + r.total, 0);
  const totalOccupied = propertyRows.reduce((s, r) => s + r.occupied, 0);
  const totalVacant   = propertyRows.reduce((s, r) => s + r.vacant, 0);
  const overallRate   = totalUnits > 0 ? Math.round((totalOccupied / totalUnits) * 100) : 0;

  const handleDownload = () => {
    const rows = propertyRows.flatMap((r) => [
      ...r.occupiedUnits.map((u: any) => [r.prop.name, `Unit ${u.unit_number}`, u.unit_type, "Occupied", "—", "—"]),
      ...r.vacantUnits.map((u: any)   => [r.prop.name, `Unit ${u.unit_number}`, u.unit_type, "Vacant",   formatKES(u.rent_amount), "Potential loss per month"]),
    ]);
    downloadCSV(
      `occupancy-report-${now.toISOString().slice(0, 10)}.csv`,
      rows,
      ["Property", "Unit", "Type", "Status", "Rent (KES)", "Notes"],
    );
  };

  return (
    <div>
      {/* Overall summary */}
      <div className="report-stats" style={{ display: "grid", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Overall occupancy", value: `${overallRate}%`,       color: overallRate >= 80 ? "#639922" : "#BA7517", bg: overallRate >= 80 ? "#EAF3DE" : "#FAEEDA" },
          { label: "Occupied units",    value: String(totalOccupied),   color: "var(--lr-primary)", bg: "var(--lr-primary-light)" },
          { label: "Vacant units",      value: String(totalVacant),     color: "#A32D2D", bg: "#FCEBEB" },
          { label: "Total units",       value: String(totalUnits),      color: "var(--lr-text-primary)", bg: "var(--lr-bg-page)" },
        ].map((s) => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: "12px 16px" }}>
            <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", marginBottom: 4 }}>{s.label}</p>
            <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.1rem", fontWeight: 700, color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Per property breakdown */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {propertyRows.map(({ prop, occupied, vacant, total, occupancyRate, vacantUnits, occupiedUnits }) => (
          <div key={prop.id} className="card" style={{ padding: "16px 20px" }}>
            {/* Property header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
              <div>
                <p style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem", color: "var(--lr-text-primary)", marginBottom: 3 }}>{prop.name}</p>
                <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>{prop.address}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.2rem", fontWeight: 700, color: occupancyRate >= 80 ? "var(--lr-primary)" : "#BA7517" }}>{occupancyRate}%</p>
                <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>occupancy</p>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ height: 6, background: "var(--lr-border)", borderRadius: 99, overflow: "hidden", display: "flex" }}>
                <div style={{ height: "100%", width: `${occupancyRate}%`, background: occupancyRate >= 80 ? "var(--lr-primary)" : "#BA7517", borderRadius: 99 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <p style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)" }}>{occupied} occupied · {vacant} vacant · {total} total</p>
              </div>
            </div>

            {/* Vacant units list */}
            {vacantUnits.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "#791F1F", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  Vacant units ({vacantUnits.length})
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {vacantUnits.map((u: any) => (
                    <div key={u.id} style={{ padding: "6px 12px", background: "#FCEBEB", borderRadius: 8, border: "1px solid rgba(162,45,45,0.15)" }}>
                      <p style={{ fontSize: "0.78rem", fontWeight: 500, color: "#791F1F" }}>Unit {u.unit_number}</p>
                      <p style={{ fontSize: "0.68rem", color: "#A32D2D" }}>{formatKES(u.rent_amount)}/mo</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Occupied units list */}
            {occupiedUnits.length > 0 && (
              <div>
                <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "#27500A", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  Occupied units ({occupiedUnits.length})
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {occupiedUnits.map((u: any) => (
                    <div key={u.id} style={{ padding: "6px 12px", background: "#EAF3DE", borderRadius: 8, border: "1px solid rgba(99,153,34,0.15)" }}>
                      <p style={{ fontSize: "0.78rem", fontWeight: 500, color: "#27500A" }}>Unit {u.unit_number}</p>
                      <p style={{ fontSize: "0.68rem", color: "#639922" }}>{formatKES(u.rent_amount)}/mo</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {properties.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--lr-text-muted)" }}>
          <Building2 size={32} style={{ margin: "0 auto 8px", opacity: 0.2, display: "block" }} />
          <p style={{ fontSize: "0.875rem" }}>No properties found</p>
        </div>
      )}

      <button className="btn-secondary" onClick={handleDownload} style={{ marginTop: 16 }}>
        <Download size={14} /> Download CSV
      </button>
    </div>
  );
}

// ════════════════════════════════════════════
// REPORT 3 — Payment History / Audit Trail
// ════════════════════════════════════════════
function AuditTrailReport({ payments, properties, selectedProperty }: {
  payments:         Payment[];
  properties:       Property[];
  selectedProperty: string;
}) {
  const [methodFilter, setMethodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = payments.filter((p) => {
    const matchMethod   = methodFilter === "all"   || p.method === methodFilter;
    const matchStatus   = statusFilter === "all"   || p.status === statusFilter;
    return matchMethod && matchStatus;
  });

  const totalVolume    = filtered.filter((p) => p.status === "success").reduce((s, p) => s + parseFloat(p.amount_paid), 0);
  const mpesaTotal     = filtered.filter((p) => p.status === "success" && p.method === "mpesa").reduce((s, p) => s + parseFloat(p.amount_paid), 0);
  const cardTotal      = filtered.filter((p) => p.status === "success" && p.method === "card").reduce((s, p)  => s + parseFloat(p.amount_paid), 0);
  const bankTotal      = filtered.filter((p) => p.status === "success" && p.method === "bank").reduce((s, p)  => s + parseFloat(p.amount_paid), 0);

  const methodIcon: Record<string, React.ReactNode> = {
    mpesa: <Smartphone size={12} color="var(--lr-primary)" />,
    card:  <CreditCard size={12} color="#185FA5" />,
    bank:  <Banknote size={12} color="#BA7517" />,
  };

  const handleDownload = () => {
    const rows = filtered.map((p) => [
      p.receipt_number || "—",
      p.tenant_name,
      `Unit ${p.tenancy_unit}`,
      p.payment_type,
      p.method.toUpperCase(),
      p.status.toUpperCase(),
      String(p.amount_due),
      String(p.amount_paid),
      p.transaction_id || "—",
      p.paid_at ? formatDate(p.paid_at) : formatDate(p.created_at),
    ]);
    downloadCSV(
      `payment-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`,
      rows,
      ["Receipt No.", "Tenant", "Unit", "Type", "Method", "Status", "Amount Due (KES)", "Amount Paid (KES)", "Transaction ID", "Date"],
    );
  };

  return (
    <div>
      {/* Method breakdown */}
      <div className="report-stats" style={{ display: "grid", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total volume",  value: formatKES(totalVolume), icon: <TrendingUp size={14} color="var(--lr-primary)" />, bg: "var(--lr-primary-light)" },
          { label: "M-Pesa",        value: formatKES(mpesaTotal),  icon: <Smartphone size={14} color="var(--lr-primary)" />, bg: "var(--lr-primary-light)" },
          { label: "Card",          value: formatKES(cardTotal),   icon: <CreditCard size={14} color="#185FA5" />,           bg: "#E6F1FB" },
          { label: "Bank transfer", value: formatKES(bankTotal),   icon: <Banknote size={14} color="#BA7517" />,             bg: "#FAEEDA" },
        ].map((s) => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              {s.icon}
              <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>{s.label}</p>
            </div>
            <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "1rem", fontWeight: 700, color: "var(--lr-text-primary)" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <Filter size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--lr-text-muted)", pointerEvents: "none" }} />
          <select className="input" value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} style={{ appearance: "none", paddingLeft: 26, paddingRight: 26, fontSize: "0.78rem", width: "auto" }}>
            <option value="all">All methods</option>
            <option value="mpesa">M-Pesa</option>
            <option value="card">Card</option>
            <option value="bank">Bank</option>
          </select>
          <ChevronDown size={11} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--lr-text-muted)" }} />
        </div>
        <div style={{ position: "relative" }}>
          <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ appearance: "none", paddingLeft: 12, paddingRight: 26, fontSize: "0.78rem", width: "auto" }}>
            <option value="all">All statuses</option>
            <option value="success">Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
          <ChevronDown size={11} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--lr-text-muted)" }} />
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--lr-text-muted)", alignSelf: "center" }}>
          {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.8fr 0.8fr 1fr 0.7fr", borderBottom: "1px solid var(--lr-border)", background: "var(--lr-bg-page)" }} className="audit-header">
          {["Tenant / Unit", "Receipt no.", "Method", "Type", "Amount", "Status"].map((h) => (
            <span key={h} className="table-header">{h}</span>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--lr-text-muted)" }}>
            <CreditCard size={28} style={{ margin: "0 auto 8px", opacity: 0.2, display: "block" }} />
            <p style={{ fontSize: "0.875rem" }}>No transactions match your filters</p>
          </div>
        ) : (
          filtered.map((p) => {
            const statusBg: Record<string, string> = { success: "badge-success", pending: "badge-warning", failed: "badge-danger" };
            return (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.8fr 0.8fr 1fr 0.7fr", borderBottom: "1px solid var(--lr-border)" }} className="table-row audit-row">
                <div className="table-cell">
                  <p style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--lr-text-primary)", marginBottom: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.tenant_name}</p>
                  <p style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)" }}>Unit {p.tenancy_unit} · {p.paid_at ? formatDate(p.paid_at) : formatDate(p.created_at)}</p>
                </div>
                <div className="table-cell">
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem", color: "var(--lr-primary)", fontWeight: 500 }}>
                    {p.receipt_number || "—"}
                  </p>
                  {p.transaction_id && (
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: "var(--lr-text-muted)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.transaction_id}
                    </p>
                  )}
                </div>
                <div className="table-cell">
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {methodIcon[p.method]}
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--lr-text-secondary)" }}>{p.method}</span>
                  </div>
                </div>
                <div className="table-cell">
                  <p style={{ fontSize: "0.75rem", color: "var(--lr-text-secondary)", textTransform: "capitalize" }}>
                    {p.payment_type === "initial" ? "Initial" : p.payment_type === "monthly" ? "Monthly" : "Custom"}
                  </p>
                </div>
                <div className="table-cell">
                  <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--lr-text-primary)" }}>
                    {formatKES(p.status === "success" ? p.amount_paid : p.amount_due)}
                  </p>
                  {p.balance > 0 && (
                    <p style={{ fontSize: "0.68rem", color: "var(--lr-danger)", marginTop: 1 }}>-{formatKES(p.balance)} balance</p>
                  )}
                </div>
                <div className="table-cell">
                  <span className={`badge ${statusBg[p.status] || "badge-neutral"}`} style={{ textTransform: "capitalize" }}>
                    {p.status === "success" ? "Paid" : p.status}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <button className="btn-secondary" onClick={handleDownload} style={{ marginTop: 16 }}>
        <Download size={14} /> Download CSV
      </button>
    </div>
  );
}

// ════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════
export default function ReportsPage() {
  const user = useAuthStore((s) => s.user);
  const [sidebarOpen,     setSidebarOpen]     = useState(false);
  const [activeReport,    setActiveReport]    = useState<"collection" | "occupancy" | "audit">("collection");
  const [selectedMonth,   setSelectedMonth]   = useState(getMonthOptions()[0].value);
  const [selectedProperty, setSelectedProperty] = useState("all");

  const monthOptions = getMonthOptions();

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

  const properties: Property[] = propertiesData?.results || [];
  const tenancies:  Tenancy[]  = tenanciesData?.results  || [];
  const payments:   Payment[]  = paymentsData?.results   || [];

  const REPORTS = [
    {
      key:         "collection",
      label:       "Rent collection",
      description: "Who paid, partial, and unpaid per month",
      icon:        <FileText size={18} />,
      color:       "var(--lr-primary)",
      bg:          "var(--lr-primary-light)",
    },
    {
      key:         "occupancy",
      label:       "Occupancy & vacancy",
      description: "Unit status and potential lost revenue",
      icon:        <Building2 size={18} />,
      color:       "#185FA5",
      bg:          "#E6F1FB",
    },
    {
      key:         "audit",
      label:       "Payment audit trail",
      description: "Full transaction history for reconciliation",
      icon:        <TrendingUp size={18} />,
      color:       "#BA7517",
      bg:          "#FAEEDA",
    },
  ];

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
              <h1 className="page-title" style={{ fontSize: "clamp(1.2rem, 3vw, 1.5rem)" }}>Reports</h1>
              <p className="page-subtitle">Data-driven insights for your properties</p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NotificationBell />
            <MobileProfileButton role="landlord" />
          </div>
        </div>

        {/* Report selector cards */}
        <div className="report-selector" style={{ display: "grid", gap: 12, marginBottom: 24 }}>
          {REPORTS.map((r) => (
            <button
              key={r.key}
              onClick={() => setActiveReport(r.key as any)}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 18px",
                background: activeReport === r.key ? "#fff" : "var(--lr-bg-page)",
                border: `2px solid ${activeReport === r.key ? r.color : "var(--lr-border)"}`,
                borderRadius: 12, cursor: "pointer", textAlign: "left",
                transition: "all 0.15s", boxShadow: activeReport === r.key ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
              }}
            >
              <div style={{ width: 40, height: 40, background: activeReport === r.key ? r.bg : "var(--lr-border)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: activeReport === r.key ? r.color : "var(--lr-text-muted)", transition: "all 0.15s" }}>
                {r.icon}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: "0.875rem", fontWeight: 600, color: activeReport === r.key ? r.color : "var(--lr-text-primary)", marginBottom: 2 }}>{r.label}</p>
                <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.description}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Global filters — month and property */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          {/* Month picker — only for collection report */}
          {activeReport === "collection" && (
            <div style={{ position: "relative" }}>
              <Calendar size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--lr-text-muted)", pointerEvents: "none" }} />
              <select className="input" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ appearance: "none", paddingLeft: 28, paddingRight: 28, fontSize: "0.82rem", width: "auto", minWidth: 160 }}>
                {monthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <ChevronDown size={12} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--lr-text-muted)" }} />
            </div>
          )}

          {/* Property filter */}
          {activeReport !== "occupancy" && (
            <div style={{ position: "relative" }}>
              <Building2 size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--lr-text-muted)", pointerEvents: "none" }} />
              <select className="input" value={selectedProperty} onChange={(e) => setSelectedProperty(e.target.value)} style={{ appearance: "none", paddingLeft: 28, paddingRight: 28, fontSize: "0.82rem", width: "auto", minWidth: 160 }}>
                <option value="all">All properties</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown size={12} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--lr-text-muted)" }} />
            </div>
          )}

          <p style={{ fontSize: "0.78rem", color: "var(--lr-text-muted)", alignSelf: "center" }}>
            Generated {new Date().toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>

        {/* Report content */}
        <div className="card">
          {/* Report title */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--lr-border)" }}>
            <div style={{ width: 36, height: 36, background: REPORTS.find((r) => r.key === activeReport)?.bg, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: REPORTS.find((r) => r.key === activeReport)?.color }}>
              {REPORTS.find((r) => r.key === activeReport)?.icon}
            </div>
            <div>
              <h2 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "1rem", color: "var(--lr-text-primary)", marginBottom: 2 }}>
                {REPORTS.find((r) => r.key === activeReport)?.label}
              </h2>
              <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>
                {activeReport === "collection" && `${MONTHS[parseInt(selectedMonth.split("-")[1]) - 1]} ${selectedMonth.split("-")[0]} · ${selectedProperty === "all" ? "All properties" : properties.find((p) => p.id === selectedProperty)?.name}`}
                {activeReport === "occupancy" && `As of ${new Date().toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}`}
                {activeReport === "audit"     && `All time · ${selectedProperty === "all" ? "All properties" : properties.find((p) => p.id === selectedProperty)?.name}`}
              </p>
            </div>
          </div>

          {activeReport === "collection" && (
            <RentCollectionReport
              properties={properties}
              payments={payments}
              tenancies={tenancies}
              selectedMonth={selectedMonth}
              selectedProperty={selectedProperty}
            />
          )}
          {activeReport === "occupancy" && (
            <OccupancyReport
              properties={properties}
              tenancies={tenancies}
            />
          )}
          {activeReport === "audit" && (
            <AuditTrailReport
              payments={payments}
              properties={properties}
              selectedProperty={selectedProperty}
            />
          )}
        </div>

      </main>

      <style>{`
        @media (min-width: 1024px) {
          .desktop-sidebar  { display: block !important; }
          .main-content     { margin-left: 240px !important; padding: 32px !important; }
          .hamburger        { display: none !important; }
          .report-selector  { grid-template-columns: repeat(3, 1fr) !important; }
          .report-stats     { grid-template-columns: repeat(4, 1fr) !important; }
          .report-row       { grid-template-columns: 1.5fr 1.2fr 1fr 0.8fr !important; }
          .audit-header     { display: grid !important; }
          .audit-row        { display: grid !important; }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .desktop-sidebar  { display: block !important; }
          .main-content     { margin-left: 240px !important; padding: 24px !important; }
          .hamburger        { display: none !important; }
          .report-selector  { grid-template-columns: 1fr !important; }
          .report-stats     { grid-template-columns: repeat(2, 1fr) !important; }
          .report-row       { grid-template-columns: 1.5fr 1.2fr 1fr 0.8fr !important; }
        }
        @media (max-width: 767px) {
          .main-content     { margin-left: 0 !important; padding: 16px !important; }
          .report-selector  { grid-template-columns: 1fr !important; }
          .report-stats     { grid-template-columns: repeat(2, 1fr) !important; }
          .report-row       { grid-template-columns: 1fr auto !important; }
          .audit-header     { display: none !important; }
          .audit-row        { grid-template-columns: 1fr auto !important; }
          .audit-row .table-cell:nth-child(2),
          .audit-row .table-cell:nth-child(3),
          .audit-row .table-cell:nth-child(4) { display: none; }
        }
      `}</style>
    </div>
  );
}