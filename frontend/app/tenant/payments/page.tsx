"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard, Smartphone, Banknote, Loader2, CheckCircle, X,
  ArrowRight, AlertCircle, Home, LogOut, FileText, Wrench, Settings,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { formatKES, formatDate, getPaymentStatusBadge } from "@/lib/utils";
import { NotificationBell } from "@/components/NotificationBell";
import { MobileProfileButton } from "@/components/MobileProfileButton";
import type { Tenancy, Payment } from "@/types";

const NAV = [
  { href: "/tenant/dashboard",   label: "Dashboard",   icon: <Home size={17} />      },
  { href: "/tenant/payments",    label: "Payments",    icon: <CreditCard size={17} /> },
  { href: "/tenant/receipts",    label: "Receipts",    icon: <FileText size={17} />   },
  { href: "/tenant/maintenance", label: "Maintenance", icon: <Wrench size={17} />    },
  { href: "/tenant/settings",    label: "Settings",    icon: <Settings size={17} />   },
];

function getStatusStyle(status: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    paid:           { bg: "#EAF3DE", color: "#27500A", label: "Paid"          },
    paid_ahead:     { bg: "#E1F5EE", color: "#085041", label: "Paid ahead"    },
    partially_paid: { bg: "#FAEEDA", color: "#633806", label: "Partially paid" },
    unpaid:         { bg: "#FCEBEB", color: "#791F1F", label: "Unpaid"        },
  };
  return map[status] || { bg: "var(--lr-bg-page)", color: "var(--lr-text-muted)", label: status };
}

export default function TenantPaymentsPage() {
  const router      = useRouter();
  const user        = useAuthStore((s) => s.user);
  const logout      = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();

  const [paymentTypes, setPaymentTypes] = useState<Record<string, string>>({});
  const [methods,      setMethods]      = useState<Record<string, string>>({});
  const [phones,       setPhones]       = useState<Record<string, string>>({});
  const [messages,     setMessages]     = useState<Record<string, { type: "success" | "error"; text: string } | null>>({});
  const [paying,       setPaying]       = useState<Record<string, boolean>>({});
  const [polling,      setPolling]      = useState<Record<string, boolean>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment")) {
      queryClient.invalidateQueries({ queryKey: ["my-tenancies"] });
      queryClient.invalidateQueries({ queryKey: ["my-payments"] });
      queryClient.invalidateQueries({ queryKey: ["my-receipts"] });
      window.history.replaceState({}, "", "/tenant/payments");
    }
  }, []);

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
  const recentPayments       = payments.filter((p) => p.status === "success").slice(0, 8);

  // Auto-select "balance" payment type for partially paid months
  useEffect(() => {
    const defaults: Record<string, string> = {};
    tenancies.forEach((t) => {
      const ps = (t as any).payment_status;
      if (ps?.status === "partially_paid" && ps?.balance > 0) {
        defaults[t.id] = "balance";
      }
    });
    if (Object.keys(defaults).length > 0) {
      setPaymentTypes((prev) => ({ ...defaults, ...prev }));
    }
  }, [tenancies.length]);

  const pollPaymentStatus = (paymentId: string, tenancyId: string) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res    = await api.get(`/api/payments/${paymentId}/status/`);
        const status = res.data.status;
        if (status === "success") {
          clearInterval(interval);
          setPolling((p)  => ({ ...p, [tenancyId]: false }));
          setMessages((m) => ({ ...m, [tenancyId]: { type: "success", text: `Payment confirmed! Receipt: ${res.data.receipt_number}` } }));
          queryClient.invalidateQueries({ queryKey: ["my-tenancies"] });
          queryClient.invalidateQueries({ queryKey: ["my-payments"]  });
          queryClient.invalidateQueries({ queryKey: ["my-receipts"]  });
        } else if (status === "failed" || attempts >= 20) {
          clearInterval(interval);
          setPolling((p)  => ({ ...p, [tenancyId]: false }));
          setMessages((m) => ({ ...m, [tenancyId]: { type: "error", text: status === "failed" ? "Payment failed or was cancelled." : "Payment timed out. Check payment history." } }));
        }
      } catch {
        if (attempts >= 20) { clearInterval(interval); setPolling((p) => ({ ...p, [tenancyId]: false })); }
      }
    }, 5000);
  };

  const { mutate: initiatePayment } = useMutation({
    mutationFn: (data: any) => api.post("/api/payments/initiate/", data),
    onSuccess: (res, variables) => {
      const tid  = variables.tenancy_id;
      const data = res.data;
      setPaying((p) => ({ ...p, [tid]: false }));
      if (data.payment_url) {
        window.location.href = data.payment_url;
      } else if (data.checkout_request_id) {
        setMessages((m) => ({ ...m, [tid]: { type: "success", text: "STK push sent. Enter your M-Pesa PIN." } }));
        setPolling((p)  => ({ ...p, [tid]: true }));
        pollPaymentStatus(data.payment_id, tid);
      } else {
        setMessages((m) => ({ ...m, [tid]: { type: "success", text: data.message } }));
        queryClient.invalidateQueries({ queryKey: ["my-tenancies"] });
        queryClient.invalidateQueries({ queryKey: ["my-payments"]  });
      }
    },
    onError: (err: any, variables) => {
      const tid = variables.tenancy_id;
      setPaying((p)  => ({ ...p, [tid]: false }));
      setMessages((m) => ({ ...m, [tid]: { type: "error", text: err.response?.data?.detail || "Payment failed. Please try again." } }));
    },
  });

  // Amount shown on pay button for each payment type
  function calcDisplayAmount(t: Tenancy, pType: string): number {
    const ps   = (t as any).payment_status;
    const rent = parseFloat(t.rent_snapshot as any);
    const now  = new Date();
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    switch (pType) {
      case "balance":  return ps?.balance || 0;
      case "monthly":  return rent;
      case "1_week":   return Math.ceil((rent / days) * 7);
      case "1_day":    return Math.ceil(rent / days);
      case "3_months": return rent * 3;
      case "6_months": return rent * 6;
      default:         return rent;
    }
  }

  // Month-by-month coverage summary
  // Shows previous unpaid/partial months (up to 3 back), current month, and paid-ahead future months
  function getMonthCoverage(paidUntil: string | null): Array<{ label: string; status: "paid" | "partially_paid" | "unpaid"; coveredUntil?: string }> {
    const months: Array<{ label: string; status: "paid" | "partially_paid" | "unpaid"; coveredUntil?: string }> = [];
    const now = new Date();
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

  const handlePay = (t: Tenancy) => {
    const tid         = t.id;
    const isInitial   = t.status === "pending";
    const paymentType = isInitial ? "initial" : (paymentTypes[tid] || "monthly");
    const method      = methods[tid] || "mpesa";
    const phone       = phones[tid];
    setMessages((m) => ({ ...m, [tid]: null }));
    setPaying((p)  => ({ ...p, [tid]: true }));
    const payload: any = { tenancy_id: tid, payment_type: paymentType, method };
    if (method === "mpesa" && phone) payload.phone = phone;
    initiatePayment(payload);
  };

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
            <Link key={item.href} href={item.href} className={`nav-item ${item.href === "/tenant/payments" ? "nav-item-active" : ""}`}>
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
            <h1 className="page-title">Payments</h1>
            <p className="page-subtitle">Manage rent for all your units</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NotificationBell />
            <MobileProfileButton role="tenant" />
          </div>
        </div>

        {/* Payment cards */}
        <div className="payment-grid" style={{ marginBottom: 32 }}>
          {tenancies.map((t) => {
            const ps        = (t as any).payment_status;
            const settings  = (t as any).landlord_settings || {};
            const isInitial = t.status === "pending";
            const sStyle    = getStatusStyle(ps?.status || "unpaid");
            const tid       = t.id;

            return (
              <div key={tid} style={{ background: "#fff", borderRadius: 14, border: "1px solid var(--lr-border)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>

                {/* Card header */}
                <div style={{ padding: "14px 18px", background: "var(--lr-primary)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <p style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: "0.95rem", color: "#fff", marginBottom: 2 }}>Unit {t.unit.unit_number}</p>
                    <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.7)" }}>{t.property_name} · {formatKES(t.rent_snapshot)}/mo</p>
                  </div>
                  <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: "0.7rem", fontWeight: 600, background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }}>
                    {isInitial ? "Activation required" : sStyle.label}
                  </span>
                </div>

                <div style={{ padding: "16px 18px" }}>

                  {/* Month-by-month coverage summary */}
                  {!isInitial && ps?.paid_until && (() => {
                    const coverage = getMonthCoverage(ps.paid_until);
                    if (coverage.length === 0) return null;
                    return (
                      <div style={{ marginBottom: 14 }}>
                        {coverage.map((m, i) => {
                          const cfg =
                            m.status === "paid"           ? { bg: "#EAF3DE", color: "#27500A", dot: "#639922",  label: i === 0 ? "Paid" : "Paid"                                    } :
                            m.status === "partially_paid" ? { bg: "#FAEEDA", color: "#633806", dot: "#BA7517",  label: `Partial — until ${formatDate(m.coveredUntil!)}` } :
                                                            { bg: "#FCEBEB", color: "#791F1F", dot: "#A32D2D",  label: "Unpaid"                                                      };
                          return (
                            <div key={m.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: cfg.bg, borderRadius: i === 0 ? "8px 8px 0 0" : i === coverage.length - 1 ? "0 0 8px 8px" : 0, padding: "7px 12px", borderBottom: i < coverage.length - 1 ? "1px solid rgba(0,0,0,0.05)" : undefined }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                <div style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
                                <p style={{ fontSize: "0.78rem", fontWeight: 500, color: cfg.color }}>
                                  {m.label}
                                </p>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <p style={{ fontSize: "0.75rem", fontWeight: 600, color: cfg.color }}>{cfg.label}</p>
                                {m.status === "partially_paid" && ps.balance > 0 && (
                                  <span style={{ fontSize: "0.68rem", background: "rgba(0,0,0,0.07)", borderRadius: 4, padding: "1px 6px", color: cfg.color, fontWeight: 600 }}>
                                    {formatKES(ps.balance)} due
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Paid until + paid-ahead info */}
                  {!isInitial && ps?.paid_until && (
                    <div style={{ background: ps.is_overdue ? "#FCEBEB" : sStyle.bg, borderRadius: 8, padding: "8px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <p style={{ fontSize: "0.65rem", color: "var(--lr-text-muted)", marginBottom: 1 }}>{ps.is_overdue ? `${ps.days_overdue} days overdue` : "Paid until"}</p>
                        <p style={{ fontSize: "0.82rem", fontWeight: 700, color: ps.is_overdue ? "#A32D2D" : sStyle.color }}>{formatDate(ps.paid_until)}</p>
                      </div>
                      {ps.balance > 0 && (
                        <div style={{ textAlign: "right" }}>
                          <p style={{ fontSize: "0.65rem", color: "var(--lr-text-muted)", marginBottom: 1 }}>Balance due</p>
                          <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "#A32D2D" }}>{formatKES(ps.balance)}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Amount */}
                  {(() => {
                    const selType = paymentTypes[tid] || "monthly";
                    const isBalance = selType === "balance";
                    return (
                  <div style={{ background: isBalance ? "#FAEEDA" : "var(--lr-primary-light)", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
                    <p style={{ fontSize: "0.65rem", color: isBalance ? "#633806" : "var(--lr-primary-dark)", marginBottom: 2 }}>
                      {isInitial ? "Initial payment (deposit + prorated rent)" : isBalance ? "Remaining balance to complete this month" : "Amount for selected period"}
                    </p>
                    <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.25rem", fontWeight: 700, color: isBalance ? "#633806" : "var(--lr-primary)" }}>
                      {isInitial
                        ? formatKES((t as any).initial_amount_due?.total || 0)
                        : formatKES(calcDisplayAmount(t, selType))}
                    </p>
                    {isInitial && (t as any).initial_amount_due && (
                      <p style={{ fontSize: "0.68rem", color: "var(--lr-primary-dark)", marginTop: 2 }}>
                        Deposit {formatKES((t as any).initial_amount_due.deposit)} + Prorated {formatKES((t as any).initial_amount_due.prorated_rent)}
                      </p>
                    )}
                    {isBalance && (
                      <p style={{ fontSize: "0.68rem", color: "#633806", marginTop: 4 }}>
                        Paying this settles the month fully — no further balance owed.
                      </p>
                    )}
                  </div>
                  );})()}

                  {/* Payment type */}
                  {!isInitial && (
                    <div style={{ marginBottom: 12 }}>
                      <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--lr-text-muted)", marginBottom: 6 }}>Payment period</p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5 }}>
                        {[
                          { value: "monthly",  label: "Full month" },
                          { value: "1_week",   label: "1 Week"     },
                          { value: "1_day",    label: "1 Day"      },
                          { value: "3_months", label: "3 Months"   },
                          { value: "6_months", label: "6 Months"   },
                          ...(ps?.balance > 0 ? [{ value: "balance", label: `Pay balance · ${formatKES(ps.balance)}` }] : []),
                        ].map((opt) => {
                          const sel = (paymentTypes[tid] || "monthly") === opt.value;
                          const isBalance = opt.value === "balance";
                          return (
                            <button key={opt.value} onClick={() => setPaymentTypes((p) => ({ ...p, [tid]: opt.value }))}
                              style={{ padding: "6px 4px", border: `1.5px solid ${sel ? (isBalance ? "#A32D2D" : "var(--lr-primary)") : "var(--lr-border)"}`, borderRadius: 7, background: sel ? (isBalance ? "#FCEBEB" : "var(--lr-primary-light)") : "#fff", color: sel ? (isBalance ? "#A32D2D" : "var(--lr-primary)") : "var(--lr-text-secondary)", fontSize: "0.72rem", fontWeight: 500, cursor: "pointer", transition: "all 0.15s" }}>
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Payment method */}
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--lr-text-muted)", marginBottom: 6 }}>Pay via</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {([
                        {
                          value: "mpesa", label: "M-Pesa",
                          detail: settings.mpesa_type === "till"
                            ? `Till No. ${settings.till_number} · STK push`
                            : settings.paybill_number
                            ? `Paybill ${settings.paybill_number}${settings.mpesa_account ? ` · Acc: ${settings.mpesa_account}` : ""} · STK push`
                            : "STK push to your phone",
                          icon: <Smartphone size={13} />,
                        },
                        ...((settings.card_enabled !== false) ? [{
                          value: "card", label: "Card",
                          detail: "Visa / Mastercard via Paystack",
                          icon: <CreditCard size={13} />,
                        }] : []),
                        {
                          value: "bank", label: "Bank transfer",
                          detail: settings.bank_name
                            ? `${settings.bank_name}${settings.bank_account ? ` · ${settings.bank_account}` : ""}`
                            : "Manual transfer",
                          icon: <Banknote size={13} />,
                        },
                      ] as { value: string; label: string; detail: string; icon: React.ReactNode }[]).map((opt) => {
                        const sel = (methods[tid] || "mpesa") === opt.value;
                        return (
                          <button key={opt.value} onClick={() => setMethods((m) => ({ ...m, [tid]: opt.value }))}
                            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: `1.5px solid ${sel ? "var(--lr-primary)" : "var(--lr-border)"}`, borderRadius: 8, background: sel ? "var(--lr-primary-light)" : "#fff", cursor: "pointer", transition: "all 0.15s", textAlign: "left" }}>
                            <span style={{ color: sel ? "var(--lr-primary)" : "var(--lr-text-muted)", flexShrink: 0 }}>{opt.icon}</span>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: "0.78rem", fontWeight: 500, color: sel ? "var(--lr-primary)" : "var(--lr-text-primary)" }}>{opt.label}</p>
                              <p style={{ fontSize: "0.65rem", color: "var(--lr-text-muted)" }}>{opt.detail}</p>
                            </div>
                            {sel && <CheckCircle size={13} color="var(--lr-primary)" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bank transfer details panel */}
                  {(methods[tid] || "mpesa") === "bank" && (settings.bank_name || settings.bank_account) && (
                    <div style={{ background: "#FAEEDA", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                      <p style={{ fontSize: "0.68rem", fontWeight: 600, color: "#633806", marginBottom: 6 }}>Transfer to this account</p>
                      {settings.bank_account_name && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}><p style={{ fontSize: "0.72rem", color: "#633806" }}>Account name</p><p style={{ fontSize: "0.72rem", fontWeight: 600, color: "#633806" }}>{settings.bank_account_name}</p></div>}
                      {settings.bank_name && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}><p style={{ fontSize: "0.72rem", color: "#633806" }}>Bank</p><p style={{ fontSize: "0.72rem", fontWeight: 600, color: "#633806" }}>{settings.bank_name}</p></div>}
                      {settings.bank_account && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}><p style={{ fontSize: "0.72rem", color: "#633806" }}>Account no.</p><p style={{ fontSize: "0.72rem", fontWeight: 600, color: "#633806" }}>{settings.bank_account}</p></div>}
                      {settings.bank_branch && <div style={{ display: "flex", justifyContent: "space-between" }}><p style={{ fontSize: "0.72rem", color: "#633806" }}>Branch</p><p style={{ fontSize: "0.72rem", fontWeight: 600, color: "#633806" }}>{settings.bank_branch}</p></div>}
                    </div>
                  )}

                  {/* M-Pesa phone */}
                  {(methods[tid] || "mpesa") === "mpesa" && (
                    <div style={{ marginBottom: 12 }}>
                      <input className="input" type="tel" placeholder="M-Pesa phone e.g. 0712345678"
                        value={phones[tid] || ""} onChange={(e) => setPhones((p) => ({ ...p, [tid]: e.target.value }))}
                        style={{ fontSize: "0.82rem" }} />
                    </div>
                  )}

                  {/* Message */}
                  {messages[tid] && (
                    <div style={{ background: messages[tid]!.type === "success" ? "#EAF3DE" : "#FCEBEB", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: "0.75rem", color: messages[tid]!.type === "success" ? "#27500A" : "#791F1F", display: "flex", alignItems: "center", gap: 6 }}>
                      {messages[tid]!.type === "success" ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
                      {messages[tid]!.text}
                    </div>
                  )}

                  {/* Polling */}
                  {polling[tid] && (
                    <div style={{ background: "var(--lr-primary-light)", borderRadius: 8, padding: "10px 12px", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                      <Loader2 size={14} color="var(--lr-primary)" style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                      <p style={{ fontSize: "0.75rem", color: "var(--lr-primary-dark)", fontWeight: 500 }}>Waiting for M-Pesa confirmation...</p>
                    </div>
                  )}

                  {/* Pay button */}
                  <button className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: "11px", fontSize: "0.875rem" }}
                    onClick={() => handlePay(t)} disabled={paying[tid] || polling[tid]}>
                    {paying[tid]
                      ? <><Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Processing...</>
                      : <>{(paymentTypes[tid] || "monthly") === "balance" ? "Pay remaining balance" : "Pay"} {isInitial
                          ? formatKES((t as any).initial_amount_due?.total || 0)
                          : formatKES(calcDisplayAmount(t, paymentTypes[tid] || "monthly"))}
                        <ArrowRight size={14} /></>
                    }
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Recent payments */}
        {recentPayments.length > 0 && (
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem", color: "var(--lr-text-primary)" }}>Recent payments</h3>
              <Link href="/tenant/receipts" style={{ fontSize: "0.78rem", color: "var(--lr-primary)", textDecoration: "none", fontWeight: 500 }}>View receipts →</Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {recentPayments.map((p) => {
                const badge = getPaymentStatusBadge(p.status);
                const methodIcons: Record<string, React.ReactNode> = {
                  mpesa: <Smartphone size={12} color="var(--lr-primary)" />,
                  card:  <CreditCard size={12} color="#185FA5" />,
                  bank:  <Banknote size={12} color="#BA7517" />,
                };
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--lr-border)", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--lr-bg-page)", border: "1px solid var(--lr-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {methodIcons[p.method]}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--lr-text-primary)", marginBottom: 1 }}>
                          {p.payment_type === "initial" ? "Initial payment" : p.payment_type === "monthly" ? "Monthly rent" : p.payment_type.replace("_", " ")}
                          {" · "}Unit {p.tenancy_unit}
                        </p>
                        <p style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)" }}>
                          {p.paid_at ? formatDate(p.paid_at) : formatDate(p.created_at)}
                          {p.receipt_number ? ` · ${p.receipt_number}` : ""}
                        </p>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <p style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--lr-text-primary)", marginBottom: 2 }}>{formatKES(p.amount_paid)}</p>
                      <span className={`badge ${badge.class}`}>{badge.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bottom-nav-spacer" />
      </main>

      {/* ── Bottom nav (mobile) ── */}
      <nav className="bottom-nav">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className={`bottom-nav-item ${item.href === "/tenant/payments" ? "bottom-nav-active" : ""}`}>
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
        .tenant-main { margin-left: 240px; flex: 1; padding: 32px; overflow-x: hidden; }
        .payment-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
        .bottom-nav { display: none; }
        .bottom-nav-spacer { display: none; }

        @media (max-width: 767px) {
          .tenant-sidebar { display: none; }
          .tenant-main { margin-left: 0; padding: 20px 16px; }
          .payment-grid { grid-template-columns: 1fr; }
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
