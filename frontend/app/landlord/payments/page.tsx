"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard, Search, X, Menu, Bell, Home,
  CheckCircle, Clock, AlertCircle, ChevronDown,
  Building2, Filter, Download, TrendingUp,
  Smartphone, Banknote, RefreshCw, FileText,
  Loader2, Receipt,
} from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { formatKES, formatDate, getPaymentStatusBadge } from "@/lib/utils";
import type { Payment, Property } from "@/types";
import { NotificationBell } from "@/components/NotificationBell";
import { MobileProfileButton } from "@/components/MobileProfileButton";

const NAV = [
  { href: "/landlord/dashboard",   label: "Dashboard"   },
  { href: "/landlord/properties",  label: "Properties"  },
  { href: "/landlord/tenants",     label: "Tenants"     },
  { href: "/landlord/payments",    label: "Payments", active: true },
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

function ReceiptDownloadButton({ paymentId, receiptNumber }: { paymentId: string; receiptNumber: string }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      // Fetch receipt detail to get PDF URL
      const res  = await api.get(`/api/payments/receipts/`);
      const list = res.data?.results || [];
      const receipt = list.find((r: any) => r.receipt_number === receiptNumber);

      if (receipt?.receipt_pdf) {
        // PDF exists — download directly
        const link    = document.createElement("a");
        link.href     = receipt.receipt_pdf;
        link.download = `${receiptNumber}.pdf`;
        link.click();
      } else {
        // No PDF yet — download as JSON summary
        const summary = {
          receipt_number: receiptNumber,
          tenant:         receipt?.tenant_name,
          unit:           receipt?.unit_number,
          property:       receipt?.property_name,
          amount:         receipt?.amount_paid,
          method:         receipt?.payment_method,
          date:           receipt?.generated_at,
        };
        const blob    = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
        const url     = URL.createObjectURL(blob);
        const link    = document.createElement("a");
        link.href     = url;
        link.download = `${receiptNumber}.json`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      alert("Could not download receipt. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      className="btn-secondary"
      style={{ padding: "7px 12px", fontSize: "0.8rem" }}
      onClick={handleDownload}
      disabled={loading}
    >
      {loading
        ? <><Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> Downloading...</>
        : <><Download size={13} /> Download receipt</>
      }
    </button>
  );
}

// ── Payment detail drawer ────────────────────
function PaymentDrawer({ payment, onClose, onVerifyBank }: {
  payment: Payment;
  onClose: () => void;
  onVerifyBank: (id: string) => void;
}) {
  const badge = getPaymentStatusBadge(payment.status);

  const methodIcon: Record<string, React.ReactNode> = {
    mpesa: <Smartphone size={16} color="var(--lr-primary)" />,
    card:  <CreditCard size={16} color="#185FA5" />,
    bank:  <Banknote size={16} color="#BA7517" />,
  };

  const methodLabel: Record<string, string> = {
    mpesa: "M-Pesa",
    card:  "Card payment",
    bank:  "Bank transfer",
  };

  const typeLabel: Record<string, string> = {
    initial: "Initial payment",
    monthly: "Monthly rent",
    custom:  "Custom payment",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} onClick={onClose} />
      <div style={{
        position: "relative", zIndex: 61,
        width: "100%", maxWidth: 420,
        background: "#fff",
        height: "100%",
        overflowY: "auto",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.1)",
      }} className="animate-slide-in">

        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--lr-border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <div>
            <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "1rem", color: "var(--lr-text-primary)", marginBottom: 6 }}>
              Payment details
            </h3>
            <span className={`badge ${badge.class}`}>{badge.label}</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={20} color="var(--lr-text-muted)" />
          </button>
        </div>

        <div style={{ padding: "24px" }}>

          {/* Amount hero */}
          <div style={{
            background: payment.status === "success"
              ? "linear-gradient(135deg, #0F6E56, #1D9E75)"
              : payment.status === "pending"
              ? "linear-gradient(135deg, #BA7517, #EF9F27)"
              : "linear-gradient(135deg, #A32D2D, #E24B4A)",
            borderRadius: 14,
            padding: "24px",
            marginBottom: 24,
            textAlign: "center",
          }}>
            <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.75)", marginBottom: 6 }}>
              {typeLabel[payment.payment_type] || payment.payment_type}
            </p>
            <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "2rem", fontWeight: 700, color: "#fff", marginBottom: 4 }}>
              {formatKES(payment.status === "success" ? payment.amount_paid : payment.amount_due)}
            </p>
            <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.75)" }}>
              {payment.status === "success" && payment.paid_at
                ? `Paid on ${formatDate(payment.paid_at)}`
                : payment.status === "pending"
                ? "Awaiting confirmation"
                : "Payment failed"
              }
            </p>
          </div>

          {/* Details grid */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: 24 }}>
            <p className="section-label">Transaction details</p>
            {[
              { label: "Tenant",         value: payment.tenant_name },
              { label: "Unit",           value: `Unit ${payment.tenancy_unit}` },
              { label: "Payment method", value: methodLabel[payment.method] || payment.method },
              { label: "Payment type",   value: typeLabel[payment.payment_type] || payment.payment_type },
              { label: "Amount due",     value: formatKES(payment.amount_due) },
              { label: "Amount paid",    value: formatKES(payment.amount_paid) },
              ...(payment.balance > 0 ? [{ label: "Balance remaining", value: formatKES(payment.balance) }] : []),
              ...(payment.transaction_id ? [{ label: "Transaction ID", value: payment.transaction_id }] : []),
              ...(payment.receipt_number ? [{ label: "Receipt number", value: payment.receipt_number }] : []),
              { label: "Date created",   value: formatDate(payment.created_at) },
              ...(payment.paid_at ? [{ label: "Date paid", value: formatDate(payment.paid_at) }] : []),
            ].map((row) => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--lr-border)" }}>
                <p style={{ fontSize: "0.8rem", color: "var(--lr-text-muted)" }}>{row.label}</p>
                <p style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--lr-text-primary)", textAlign: "right", maxWidth: "55%", wordBreak: "break-all", fontFamily: row.label === "Transaction ID" || row.label === "Receipt number" ? "'JetBrains Mono', monospace" : "inherit" }}>
                  {row.value}
                </p>
              </div>
            ))}
          </div>

          {/* Method icon */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "var(--lr-bg-page)", borderRadius: 10, marginBottom: 20 }}>
            {methodIcon[payment.method]}
            <div>
              <p style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--lr-text-primary)" }}>{methodLabel[payment.method]}</p>
              <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>
                {payment.method === "mpesa" && "Safaricom Daraja STK push"}
                {payment.method === "card"  && "Paystack — Visa / Mastercard"}
                {payment.method === "bank"  && "Manual bank transfer"}
              </p>
            </div>
          </div>

          {/* Bank proof upload preview */}
          {payment.method === "bank" && payment.bank_proof && (
            <div style={{ marginBottom: 20 }}>
              <p className="section-label">Bank transfer proof</p>
              <a href={payment.bank_proof} target="_blank" rel="noreferrer" className="btn-secondary" style={{ textDecoration: "none", display: "inline-flex" }}>
                <FileText size={14} /> View proof document
              </a>
            </div>
          )}

          {/* Verify bank transfer */}
          {payment.method === "bank" && payment.status === "pending" && (
            <div style={{ background: "#FAEEDA", border: "1px solid rgba(186,117,23,0.25)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <AlertCircle size={16} color="#BA7517" />
                <p style={{ fontSize: "0.82rem", fontWeight: 500, color: "#633806" }}>Bank transfer pending verification</p>
              </div>
              <p style={{ fontSize: "0.78rem", color: "#633806", marginBottom: 12, lineHeight: 1.5 }}>
                Review the proof of payment above, then confirm if the transfer was received in your bank account.
              </p>
              <button
                className="btn-primary"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => { onVerifyBank(payment.id); onClose(); }}
              >
                <CheckCircle size={14} /> Confirm payment received
              </button>
            </div>
          )}

          {/* Download receipt — shows after successful payment */}
{payment.status === "success" && payment.receipt_number && (
  <div style={{ marginTop: 16 }}>
    <p className="section-label">Receipt</p>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "var(--lr-bg-page)", borderRadius: 10, marginBottom: 10 }}>
      <div>
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.82rem", fontWeight: 600, color: "var(--lr-primary)", marginBottom: 2 }}>
          {payment.receipt_number}
        </p>
        <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>
          {payment.paid_at ? formatDate(payment.paid_at) : "—"}
        </p>
      </div>
      <ReceiptDownloadButton paymentId={payment.id} receiptNumber={payment.receipt_number} />
    </div>
  </div>
)}
        </div>
      </div>
    </div>
  );
}

export default function LandlordPaymentsPage() {
  const user        = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [search,         setSearch]         = useState("");
  const [statusFilter,   setStatusFilter]   = useState("all");
  const [methodFilter,   setMethodFilter]   = useState("all");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

  const { data: propertiesData } = useQuery({
    queryKey: ["landlord-properties"],
    queryFn:  () => api.get("/api/properties/").then((r) => r.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["landlord-payments"],
    queryFn:  () => api.get("/api/payments/landlord/").then((r) => r.data),
  });

  const properties: Property[] = propertiesData?.results || [];
  const payments:   Payment[]  = data?.results           || [];

  const { mutate: verifyBank } = useMutation({
    mutationFn: (id: string) => api.post(`/api/payments/${id}/verify-bank/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["landlord-payments"] });
      queryClient.invalidateQueries({ queryKey: ["landlord-tenancies"] });
      // Refresh any open tenant drawer payment/receipt tabs
      queryClient.invalidateQueries({ queryKey: ["tenancy-payments-landlord"] });
      queryClient.invalidateQueries({ queryKey: ["tenancy-receipts-landlord"] });
    },
  });

  // ── Stats ────────────────────────────────
  const successPayments = payments.filter((p) => p.status === "success");
  const pendingPayments = payments.filter((p) => p.status === "pending");
  const failedPayments  = payments.filter((p) => p.status === "failed");
  const pendingBank     = payments.filter((p) => p.method === "bank" && p.status === "pending");
  const totalRevenue    = successPayments.reduce((s, p) => s + parseFloat(p.amount_paid), 0);
  const totalPending    = pendingPayments.reduce((s, p) => s + parseFloat(p.amount_due), 0);

  // ── Filter ───────────────────────────────
  const filtered = payments.filter((p) => {
    const tenant = p.tenant_name?.toLowerCase() || "";
    const unit   = p.tenancy_unit?.toLowerCase() || "";
    const txid   = p.transaction_id?.toLowerCase() || "";
    const q      = search.toLowerCase();
    const matchSearch   = !q || tenant.includes(q) || unit.includes(q) || txid.includes(q);
    const matchStatus   = statusFilter   === "all" || p.status === statusFilter;
    const matchMethod   = methodFilter   === "all" || p.method === methodFilter;
    const matchProperty = propertyFilter === "all"; // extend when API supports property filter
    return matchSearch && matchStatus && matchMethod && matchProperty;
  });

  // ── Current month stats ──────────────────
  const now        = new Date();
  const thisMonth  = successPayments.filter((p) => {
    const d = new Date(p.paid_at || p.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const thisMonthRevenue = thisMonth.reduce((s, p) => s + parseFloat(p.amount_paid), 0);

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
            <button className="hamburger" onClick={() => setSidebarOpen(true)} style={{ background: "#fff", border: "1px solid var(--lr-border)", borderRadius: 8, padding: 8, cursor: "pointer", display: "flex", alignItems: "center" }}>
              <Menu size={18} color="var(--lr-text-secondary)" />
            </button>
            <div>
              <h1 className="page-title" style={{ fontSize: "clamp(1.2rem, 3vw, 1.5rem)" }}>Payments</h1>
              <p className="page-subtitle">Track all rent payments across your properties</p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NotificationBell />
            <MobileProfileButton role="landlord" />
          </div>
        </div>

        {/* Bank transfer alert */}
        {pendingBank.length > 0 && (
          <div className="animate-slide-up" style={{ background: "#FAEEDA", border: "1px solid rgba(186,117,23,0.25)", borderRadius: 12, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AlertCircle size={16} color="#BA7517" />
              <span style={{ fontSize: "0.82rem", color: "#633806", fontWeight: 500 }}>
                {pendingBank.length} bank transfer{pendingBank.length > 1 ? "s" : ""} need your verification
              </span>
            </div>
            <button
              onClick={() => { setMethodFilter("bank"); setStatusFilter("pending"); }}
              style={{ fontSize: "0.8rem", fontWeight: 600, color: "#BA7517", background: "none", border: "none", cursor: "pointer" }}
            >
              Show transfers →
            </button>
          </div>
        )}

        {/* Stat cards */}
        <div className="stats-grid" style={{ display: "grid", gap: 12, marginBottom: 24 }}>
          <div className="stat-card animate-slide-up">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p className="stat-label">Total revenue</p>
              <div style={{ width: 30, height: 30, background: "var(--lr-primary-light)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <TrendingUp size={14} color="var(--lr-primary)" />
              </div>
            </div>
            <p className="stat-value" style={{ fontSize: "clamp(1.1rem, 2.5vw, 1.5rem)" }}>{formatKES(totalRevenue)}</p>
            <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", marginTop: 2 }}>{successPayments.length} successful payments</p>
          </div>

          <div className="stat-card animate-slide-up" style={{ animationDelay: "0.05s" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p className="stat-label">This month</p>
              <div style={{ width: 30, height: 30, background: "#EAF3DE", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CheckCircle size={14} color="#639922" />
              </div>
            </div>
            <p className="stat-value" style={{ fontSize: "clamp(1.1rem, 2.5vw, 1.5rem)" }}>{formatKES(thisMonthRevenue)}</p>
            <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", marginTop: 2 }}>{thisMonth.length} payments received</p>
          </div>

          <div className="stat-card animate-slide-up" style={{ animationDelay: "0.1s" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p className="stat-label">Pending</p>
              <div style={{ width: 30, height: 30, background: "#FAEEDA", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Clock size={14} color="#BA7517" />
              </div>
            </div>
            <p className="stat-value" style={{ fontSize: "clamp(1.1rem, 2.5vw, 1.5rem)" }}>{formatKES(totalPending)}</p>
            <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", marginTop: 2 }}>{pendingPayments.length} awaiting confirmation</p>
          </div>

          <div className="stat-card animate-slide-up" style={{ animationDelay: "0.15s" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p className="stat-label">Failed</p>
              <div style={{ width: 30, height: 30, background: "#FCEBEB", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <AlertCircle size={14} color="#A32D2D" />
              </div>
            </div>
            <p className="stat-value" style={{ fontSize: "clamp(1.1rem, 2.5vw, 1.5rem)" }}>{failedPayments.length}</p>
            <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", marginTop: 2 }}>Failed or cancelled</p>
          </div>
        </div>

        {/* Filters */}
        <div className="payments-filter-bar" style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>

          {/* Property + Method selects row */}
          <div className="pay-selects-row" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {/* Property filter */}
            <div style={{ position: "relative" }} className="filter-select-wrap">
              <Building2 size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--lr-text-muted)", pointerEvents: "none" }} />
              <select className="input filter-select" value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)} style={{ appearance: "none", paddingLeft: 28, paddingRight: 28, fontSize: "0.82rem" }}>
                <option value="all">All properties</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown size={12} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--lr-text-muted)" }} />
            </div>

            {/* Method filter */}
            <div style={{ position: "relative" }} className="filter-select-wrap">
              <Filter size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--lr-text-muted)", pointerEvents: "none" }} />
              <select className="input filter-select" value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} style={{ appearance: "none", paddingLeft: 28, paddingRight: 28, fontSize: "0.82rem" }}>
                <option value="all">All methods</option>
                <option value="mpesa">M-Pesa</option>
                <option value="card">Card</option>
                <option value="bank">Bank transfer</option>
              </select>
              <ChevronDown size={12} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--lr-text-muted)" }} />
            </div>
          </div>

          {/* Status pills */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { label: "All",     value: "all",     count: payments.length,          color: "var(--lr-text-muted)" },
              { label: "Paid",    value: "success", count: successPayments.length,   color: "#27500A"              },
              { label: "Pending", value: "pending", count: pendingPayments.length,   color: "#633806"              },
              { label: "Failed",  value: "failed",  count: failedPayments.length,    color: "#791F1F"              },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 12px", borderRadius: 99,
                  border: `1.5px solid ${statusFilter === tab.value ? "var(--lr-primary)" : "var(--lr-border)"}`,
                  background: statusFilter === tab.value ? "var(--lr-primary-light)" : "#fff",
                  color: statusFilter === tab.value ? "var(--lr-primary)" : tab.color,
                  fontSize: "0.78rem", fontWeight: 500, cursor: "pointer", transition: "all 0.15s",
                }}
              >
                {tab.label}
                <span style={{ background: statusFilter === tab.value ? "var(--lr-primary)" : "var(--lr-border)", color: statusFilter === tab.value ? "#fff" : "var(--lr-text-muted)", borderRadius: 99, padding: "0 5px", fontSize: "0.68rem", fontWeight: 600 }}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 20 }}>
          <Search size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--lr-text-muted)", pointerEvents: "none" }} />
          <input
            className="input"
            placeholder="Search tenant name, unit, transaction ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 42 }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer" }}>
              <X size={14} color="var(--lr-text-muted)" />
            </button>
          )}
        </div>

        {search && (
          <p style={{ fontSize: "0.8rem", color: "var(--lr-text-muted)", marginBottom: 12 }}>
            {filtered.length} result{filtered.length !== 1 ? "s" : ""} for &quot;{search}&quot;
          </p>
        )}

        {/* Payments table */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "var(--lr-text-muted)" }}>Loading payments...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px" }}>
              <CreditCard size={40} style={{ margin: "0 auto 12px", opacity: 0.2, display: "block" }} />
              <p style={{ fontSize: "0.95rem", fontWeight: 500, color: "var(--lr-text-primary)", marginBottom: 4 }}>
                {search || statusFilter !== "all" || methodFilter !== "all" ? "No payments match your filters" : "No payments yet"}
              </p>
              <p style={{ fontSize: "0.8rem", color: "var(--lr-text-muted)" }}>
                {search || statusFilter !== "all" || methodFilter !== "all" ? "Try adjusting your filters" : "Payments will appear here once tenants start paying rent"}
              </p>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="pay-table-header" style={{ display: "grid", borderBottom: "1px solid var(--lr-border)", background: "var(--lr-bg-page)" }}>
                <span className="table-header">Tenant</span>
                <span className="table-header">Type</span>
                <span className="table-header">Method</span>
                <span className="table-header">Amount</span>
                <span className="table-header">Date</span>
                <span className="table-header">Status</span>
                <span className="table-header"></span>
              </div>

              {filtered.map((p) => {
                const badge = getPaymentStatusBadge(p.status);
                const methodIcons: Record<string, React.ReactNode> = {
                  mpesa: <Smartphone size={13} color="var(--lr-primary)" />,
                  card:  <CreditCard size={13} color="#185FA5" />,
                  bank:  <Banknote size={13} color="#BA7517" />,
                };
                return (
                  <div
                    key={p.id}
                    className="table-row pay-table-row"
                    style={{ display: "grid", cursor: "pointer" }}
                    onClick={() => setSelectedPayment(p)}
                  >
                    {/* Tenant */}
                    <div className="table-cell">
                      <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--lr-text-primary)", marginBottom: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.tenant_name}
                      </p>
                      <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>Unit {p.tenancy_unit}</p>
                    </div>

                    {/* Type */}
                    <div className="table-cell">
                      <p style={{ fontSize: "0.8rem", color: "var(--lr-text-primary)", textTransform: "capitalize" }}>
                        {p.payment_type === "initial" ? "Initial" : p.payment_type === "monthly" ? "Monthly" : "Custom"}
                      </p>
                    </div>

                    {/* Method */}
                    <div className="table-cell">
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        {methodIcons[p.method]}
                        <span style={{ fontSize: "0.8rem", color: "var(--lr-text-secondary)", textTransform: "uppercase" }}>
                          {p.method}
                        </span>
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="table-cell">
                      <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--lr-text-primary)" }}>
                        {formatKES(p.status === "success" ? p.amount_paid : p.amount_due)}
                      </p>
                      {p.balance > 0 && (
                        <p style={{ fontSize: "0.7rem", color: "var(--lr-danger)" }}>
                          -{formatKES(p.balance)} balance
                        </p>
                      )}
                    </div>

                    {/* Date */}
                    <div className="table-cell">
                      <p style={{ fontSize: "0.8rem", color: "var(--lr-text-primary)" }}>
                        {p.paid_at ? formatDate(p.paid_at) : formatDate(p.created_at)}
                      </p>
                    </div>

                    {/* Status */}
                    <div className="table-cell">
                      <span className={`badge ${badge.class}`}>{badge.label}</span>
                      {p.method === "bank" && p.status === "pending" && (
                        <p style={{ fontSize: "0.68rem", color: "#BA7517", marginTop: 3 }}>Needs review</p>
                      )}
                    </div>

                    {/* View */}
                    <div className="table-cell" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                      <div style={{ padding: "5px 9px", background: "var(--lr-bg-page)", borderRadius: 6, fontSize: "0.75rem", color: "var(--lr-primary)", fontWeight: 500 }}>
                        View
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

      </main>

      {selectedPayment && (
        <PaymentDrawer
          payment={selectedPayment}
          onClose={() => setSelectedPayment(null)}
          onVerifyBank={(id) => verifyBank(id)}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .pay-table-header { grid-template-columns: 1.8fr 0.9fr 1fr 1fr 1fr 0.9fr 0.4fr; }
        .pay-table-row    { grid-template-columns: 1.8fr 0.9fr 1fr 1fr 1fr 0.9fr 0.4fr; }
        @media (min-width: 768px) {
          .desktop-sidebar { display: block !important; }
          .main-content    { margin-left: 240px !important; padding: 32px !important; }
          .hamburger       { display: none !important; }
          .stats-grid      { grid-template-columns: repeat(4, 1fr) !important; }
        }
        @media (max-width: 767px) {
          .main-content       { margin-left: 0 !important; padding: 16px !important; }
          .stats-grid         { grid-template-columns: repeat(2, 1fr) !important; }
          .pay-table-header   { display: none !important; }
          .pay-table-row      { grid-template-columns: 1fr auto !important; }
          .pay-table-row .table-cell:nth-child(2),
          .pay-table-row .table-cell:nth-child(3),
          .pay-table-row .table-cell:nth-child(5) { display: none; }
          .payments-filter-bar { flex-direction: column; align-items: stretch !important; }
          .pay-selects-row     { flex-direction: column; }
          .filter-select-wrap  { width: 100%; }
          .filter-select       { width: 100% !important; min-width: unset !important; }
        }
      `}</style>
    </div>
  );
}