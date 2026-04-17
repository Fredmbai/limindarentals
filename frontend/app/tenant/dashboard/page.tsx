"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Home, CreditCard, FileText, Wrench, Settings, LogOut,
  AlertCircle, CheckCircle, Clock, Building2, Plus,
  Zap, PauseCircle, X, ChevronRight, Smartphone,
} from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import api from "@/lib/api";
import { formatKES, formatDate, getPaymentStatusBadge } from "@/lib/utils";
import type { Tenancy, Payment } from "@/types";
import { AddRentalUnitModal } from "@/components/AddRentalUnitModal";
import { NotificationBell } from "@/components/NotificationBell";
import { MobileProfileButton } from "@/components/MobileProfileButton";

// ── Types ──────────────────────────────────────────────────────────────────

interface AutoPayment {
  id: string;
  tenancy: string;
  tenancy_unit: string;
  property_name: string;
  rent_amount: string;
  payment_method: "MPESA" | "CARD";
  mpesa_number: string;
  card_last_four: string;
  due_day: number;
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
  next_due_date: string;
  last_triggered_at: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getStatusStyle(status: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    paid:           { bg: "#EAF3DE", color: "#27500A", label: "Paid"          },
    paid_ahead:     { bg: "#E1F5EE", color: "#085041", label: "Paid ahead"    },
    partially_paid: { bg: "#FAEEDA", color: "#633806", label: "Partially paid" },
    unpaid:         { bg: "#FCEBEB", color: "#791F1F", label: "Unpaid"        },
  };
  return map[status] || { bg: "var(--lr-bg-page)", color: "var(--lr-text-muted)", label: status };
}

function ordinal(n: number) {
  const s = ["th","st","nd","rd"], v = n % 100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}

// ── Auto-pay badge ─────────────────────────────────────────────────────────

function AutoPayBadge({
  ap,
  onManage,
}: {
  ap: AutoPayment | undefined;
  onManage: () => void;
}) {
  if (!ap || ap.status === "CANCELLED") {
    return (
      <button
        onClick={onManage}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "3px 10px", borderRadius: 99, fontSize: "0.72rem",
          fontWeight: 600, background: "var(--lr-bg-page)",
          border: "1px solid var(--lr-border)", color: "var(--lr-text-muted)",
          cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        Manual pay · Set up auto-pay
      </button>
    );
  }

  if (ap.status === "PAUSED") {
    return (
      <button
        onClick={onManage}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "3px 10px", borderRadius: 99, fontSize: "0.72rem",
          fontWeight: 600, background: "#FAEEDA",
          border: "none", color: "#633806",
          cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        <PauseCircle size={12} /> Auto-pay PAUSED · Resume
      </button>
    );
  }

  return (
    <button
      onClick={onManage}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 10px", borderRadius: 99, fontSize: "0.72rem",
        fontWeight: 600, background: "#E1F5EE",
        border: "none", color: "#085041",
        cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      <Zap size={12} /> Auto-pay ON · {ap.next_due_date} · Manage
    </button>
  );
}

// ── Setup modal ────────────────────────────────────────────────────────────

function AutoPayModal({
  tenancy,
  existingAp,
  tenantPhone,
  onClose,
  onSuccess,
}: {
  tenancy: Tenancy;
  existingAp: AutoPayment | undefined;
  tenantPhone: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<"choose" | "mpesa" | "card" | "manage">(
    existingAp && existingAp.status !== "CANCELLED" ? "manage" : "choose"
  );
  const [method, setMethod] = useState<"MPESA" | "CARD">("MPESA");
  const [mpesaNumber, setMpesaNumber] = useState(existingAp?.mpesa_number || tenantPhone);
  const [cardToken, setCardToken]     = useState("");
  const [cardLast4, setCardLast4]     = useState(existingAp?.card_last_four || "");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [success, setSuccess]         = useState("");

  const ap = existingAp;

  // ── Actions ──────────────────────────────────────────────────────────────

  async function subscribe() {
    setLoading(true); setError("");
    try {
      const payload: Record<string, string> = {
        tenancy_id:     tenancy.id,
        payment_method: method,
      };
      if (method === "MPESA") payload.mpesa_number = mpesaNumber;
      if (method === "CARD")  { payload.card_token = cardToken; payload.card_last_four = cardLast4; }
      await api.post("/api/tenant/auto-payments/", payload);
      setSuccess("Auto-payment set up successfully!");
      setTimeout(onSuccess, 1200);
    } catch (e: any) {
      setError(e?.response?.data?.detail || JSON.stringify(e?.response?.data) || "Setup failed.");
    } finally {
      setLoading(false);
    }
  }

  async function pause() {
    if (!ap) return;
    setLoading(true); setError("");
    try {
      await api.patch(`/api/tenant/auto-payments/${ap.id}/pause/`);
      setSuccess("Auto-payment paused.");
      setTimeout(onSuccess, 1200);
    } catch { setError("Could not pause auto-payment."); } finally { setLoading(false); }
  }

  async function resume() {
    if (!ap) return;
    setLoading(true); setError("");
    try {
      await api.patch(`/api/tenant/auto-payments/${ap.id}/resume/`);
      setSuccess("Auto-payment resumed.");
      setTimeout(onSuccess, 1200);
    } catch { setError("Could not resume auto-payment."); } finally { setLoading(false); }
  }

  async function cancel() {
    if (!ap) return;
    if (!confirm("Cancel auto-payment? You will need to pay manually each month.")) return;
    setLoading(true); setError("");
    try {
      await api.patch(`/api/tenant/auto-payments/${ap.id}/cancel/`);
      setSuccess("Auto-payment cancelled.");
      setTimeout(onSuccess, 1200);
    } catch { setError("Could not cancel auto-payment."); } finally { setLoading(false); }
  }

  async function updateMpesa() {
    if (!ap) return;
    setLoading(true); setError("");
    try {
      await api.patch(`/api/tenant/auto-payments/${ap.id}/update-mpesa/`, { mpesa_number: mpesaNumber });
      setSuccess("M-Pesa number updated.");
      setTimeout(onSuccess, 1200);
    } catch { setError("Could not update M-Pesa number."); } finally { setLoading(false); }
  }

  const dueDay = ap?.due_day ?? (tenancy as any).due_day ?? 5;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.4)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440,
        padding: 28, position: "relative", boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
      }}>
        <button
          onClick={onClose}
          style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", color: "var(--lr-text-muted)" }}
        ><X size={20} /></button>

        {success ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <CheckCircle size={40} color="#639922" style={{ margin: "0 auto 12px", display: "block" }} />
            <p style={{ fontWeight: 600, color: "var(--lr-text-primary)" }}>{success}</p>
          </div>
        ) : step === "manage" && ap ? (
          <>
            <h2 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: "1.05rem", marginBottom: 4 }}>Manage auto-payment</h2>
            <p style={{ fontSize: "0.8rem", color: "var(--lr-text-muted)", marginBottom: 20 }}>
              Unit {tenancy.unit?.unit_number} · {(tenancy as any).property_name}
            </p>

            <div style={{ background: "var(--lr-bg-page)", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: "0.8rem", color: "var(--lr-text-muted)" }}>Method</span>
                <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                  {ap.payment_method === "MPESA"
                    ? `M-Pesa · ${ap.mpesa_number}`
                    : `Card ending ····${ap.card_last_four}`}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: "0.8rem", color: "var(--lr-text-muted)" }}>Status</span>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: ap.status === "ACTIVE" ? "#085041" : "#633806" }}>
                  {ap.status}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: "0.8rem", color: "var(--lr-text-muted)" }}>Next charge</span>
                <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>{ap.next_due_date}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--lr-text-muted)" }}>Amount</span>
                <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>{formatKES(parseFloat(ap.rent_amount))}</span>
              </div>
            </div>

            {ap.payment_method === "MPESA" && ap.status !== "CANCELLED" && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: 6 }}>Update M-Pesa number</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={mpesaNumber}
                    onChange={e => setMpesaNumber(e.target.value)}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--lr-border)", fontSize: "0.875rem" }}
                    placeholder="07XXXXXXXX"
                  />
                  <button className="btn-secondary" onClick={updateMpesa} disabled={loading} style={{ padding: "8px 14px", fontSize: "0.8rem" }}>
                    Update
                  </button>
                </div>
              </div>
            )}

            {error && <p style={{ color: "var(--lr-danger)", fontSize: "0.8rem", marginBottom: 12 }}>{error}</p>}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {ap.status === "ACTIVE" && (
                <button className="btn-secondary" onClick={pause} disabled={loading} style={{ flex: 1, minWidth: 120 }}>
                  <PauseCircle size={14} /> Pause
                </button>
              )}
              {ap.status === "PAUSED" && (
                <button className="btn-primary" onClick={resume} disabled={loading} style={{ flex: 1, minWidth: 120 }}>
                  <Zap size={14} /> Resume
                </button>
              )}
              <button onClick={cancel} disabled={loading} style={{
                flex: 1, minWidth: 120, padding: "9px 16px", borderRadius: 8,
                border: "1px solid var(--lr-danger)", background: "none",
                color: "var(--lr-danger)", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
              }}>
                Cancel auto-pay
              </button>
            </div>
          </>
        ) : step === "choose" ? (
          <>
            <h2 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: "1.05rem", marginBottom: 4 }}>Set up automatic payments</h2>
            <p style={{ fontSize: "0.8rem", color: "var(--lr-text-muted)", marginBottom: 24 }}>
              Unit {tenancy.unit?.unit_number} · Rent will be paid on the {ordinal(dueDay)} of each month
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
              {/* M-Pesa option */}
              <button
                onClick={() => { setMethod("MPESA"); setStep("mpesa"); }}
                style={{
                  padding: "16px", borderRadius: 12, textAlign: "left",
                  border: "2px solid #E1F5EE", background: "#F5FFFD", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, background: "#4CAF50", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Smartphone size={18} color="#fff" />
                  </div>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--lr-text-primary)" }}>M-Pesa <span style={{ background: "#E1F5EE", color: "#085041", padding: "1px 7px", borderRadius: 99, fontSize: "0.68rem", marginLeft: 4 }}>Recommended</span></p>
                    <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)", marginTop: 2 }}>No extra charges · STK push to your phone</p>
                  </div>
                </div>
                <ChevronRight size={18} color="var(--lr-text-muted)" />
              </button>

              {/* Card option */}
              <button
                onClick={() => { setMethod("CARD"); setStep("card"); }}
                style={{
                  padding: "16px", borderRadius: 12, textAlign: "left",
                  border: "2px solid var(--lr-border)", background: "#fff", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, background: "#3b5bdb", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CreditCard size={18} color="#fff" />
                  </div>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--lr-text-primary)" }}>Card (Visa / Mastercard)</p>
                    <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)", marginTop: 2 }}>2.6% processing fee applies</p>
                  </div>
                </div>
                <ChevronRight size={18} color="var(--lr-text-muted)" />
              </button>
            </div>
          </>
        ) : step === "mpesa" ? (
          <>
            <button onClick={() => setStep("choose")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "var(--lr-primary)", marginBottom: 16 }}>← Back</button>
            <h2 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: "1.05rem", marginBottom: 4 }}>M-Pesa auto-payment</h2>
            <p style={{ fontSize: "0.8rem", color: "var(--lr-text-muted)", marginBottom: 20 }}>
              On the {ordinal(dueDay)} of every month you will receive an STK push on this number for {formatKES(parseFloat(String(tenancy.rent_snapshot)))}.
            </p>

            <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: 6 }}>M-Pesa number</label>
            <input
              value={mpesaNumber}
              onChange={e => setMpesaNumber(e.target.value)}
              placeholder="07XXXXXXXX"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--lr-border)", fontSize: "0.9rem", marginBottom: 20, boxSizing: "border-box" }}
            />

            {error && <p style={{ color: "var(--lr-danger)", fontSize: "0.8rem", marginBottom: 12 }}>{error}</p>}

            <button className="btn-primary" onClick={subscribe} disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
              {loading ? "Setting up…" : "Confirm auto-pay"}
            </button>
          </>
        ) : (
          /* step === "card" */
          <>
            <button onClick={() => setStep("choose")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "var(--lr-primary)", marginBottom: 16 }}>← Back</button>
            <h2 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: "1.05rem", marginBottom: 4 }}>Card auto-payment</h2>
            <p style={{ fontSize: "0.8rem", color: "var(--lr-text-muted)", marginBottom: 20 }}>
              Your card will be charged automatically on the {ordinal(dueDay)} of each month. A 2.6% processing fee applies.
            </p>

            <div style={{ background: "#FAEEDA", border: "1px solid rgba(186,117,23,0.2)", borderRadius: 10, padding: "12px 14px", marginBottom: 20, fontSize: "0.8rem", color: "#633806" }}>
              To complete card setup, first make a one-time card payment on the{" "}
              <Link href="/tenant/payments" style={{ color: "var(--lr-primary)", fontWeight: 600 }}>Payments page</Link>.
              After payment, Paystack issues an authorization code. Paste it here.
            </div>

            <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: 6 }}>Paystack authorization code</label>
            <input
              value={cardToken}
              onChange={e => setCardToken(e.target.value)}
              placeholder="AUTH_xxxxxxxxxx"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--lr-border)", fontSize: "0.9rem", marginBottom: 12, boxSizing: "border-box" }}
            />

            <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: 6 }}>Last 4 digits of card</label>
            <input
              value={cardLast4}
              onChange={e => setCardLast4(e.target.value.replace(/\D/, "").slice(0, 4))}
              placeholder="1234"
              maxLength={4}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--lr-border)", fontSize: "0.9rem", marginBottom: 20, boxSizing: "border-box" }}
            />

            <p style={{ fontSize: "0.73rem", color: "var(--lr-text-muted)", marginBottom: 16 }}>
              We never store your full card number, CVV, or expiry date — only the secure Paystack authorization token.
            </p>

            {error && <p style={{ color: "var(--lr-danger)", fontSize: "0.8rem", marginBottom: 12 }}>{error}</p>}

            <button className="btn-primary" onClick={subscribe} disabled={loading || !cardToken || cardLast4.length !== 4} style={{ width: "100%", justifyContent: "center" }}>
              {loading ? "Setting up…" : "Confirm card auto-pay"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Nav ────────────────────────────────────────────────────────────────────

const NAV = [
  { href: "/tenant/dashboard",   label: "Dashboard",   icon: <Home size={17} />      },
  { href: "/tenant/payments",    label: "Payments",    icon: <CreditCard size={17} /> },
  { href: "/tenant/receipts",    label: "Receipts",    icon: <FileText size={17} />   },
  { href: "/tenant/maintenance", label: "Maintenance", icon: <Wrench size={17} />    },
  { href: "/tenant/settings",    label: "Settings",    icon: <Settings size={17} />   },
];

// ── Page ───────────────────────────────────────────────────────────────────

export default function TenantDashboard() {
  const router       = useRouter();
  const user         = useAuthStore((s) => s.user);
  const hydrated     = useAuthStore((s) => s._hasHydrated);
  const logout       = useAuthStore((s) => s.logout);
  usePushNotifications();
  const queryClient  = useQueryClient();
  const [showAddUnit, setShowAddUnit]                 = useState(false);
  const [autoPayModal, setAutoPayModal]               = useState<Tenancy | null>(null);

  useEffect(() => {
    if (!hydrated) return;
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
  const { data: autoPayData, refetch: refetchAutoPay } = useQuery({
    queryKey: ["auto-payments", user?.id],
    queryFn:  () => api.get("/api/tenant/auto-payments/").then((r) => r.data),
    enabled:  !!user,
  });

  const tenancies: Tenancy[]     = tenanciesData?.results || [];
  const payments:  Payment[]     = paymentsData?.results  || [];
  const autoPays:  AutoPayment[] = Array.isArray(autoPayData) ? autoPayData : [];

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

  const getAutoPayForTenancy = useCallback(
    (tenancyId: string) =>
      autoPays.find(
        (ap) => ap.tenancy === tenancyId && ap.status !== "CANCELLED"
      ),
    [autoPays]
  );

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
                  const ap        = getAutoPayForTenancy(t.id);
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

                      {/* Auto-pay badge — shown for active tenancies only */}
                      {!isInitial && (
                        <div style={{ marginTop: 10 }}>
                          <AutoPayBadge
                            ap={ap}
                            onManage={() => setAutoPayModal(t)}
                          />
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

      {autoPayModal && (
        <AutoPayModal
          tenancy={autoPayModal}
          existingAp={getAutoPayForTenancy(autoPayModal.id)}
          tenantPhone={user?.phone || ""}
          onClose={() => setAutoPayModal(null)}
          onSuccess={() => {
            setAutoPayModal(null);
            refetchAutoPay();
            queryClient.invalidateQueries({ queryKey: ["auto-payments"] });
          }}
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
