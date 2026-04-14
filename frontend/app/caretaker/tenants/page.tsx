"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import {
  Search, X, ChevronDown, Building2, Phone,
  Eye, CreditCard, Users, CheckCircle,
  AlertCircle, Smartphone, Banknote,
} from "lucide-react";
import { CaretakerLayout } from "@/components/CaretakerLayout";
import api from "@/lib/api";
import { formatKES, formatDate } from "@/lib/utils";

function PayBadge({ status }: { status: string }) {
  const m: Record<string, { cls: string; label: string }> = {
    paid:          { cls: "badge-success", label: "Paid"      },
    paid_ahead:    { cls: "badge-success", label: "Paid ahead"},
    partially_paid:{ cls: "badge-warning", label: "Partial"   },
    unpaid:        { cls: "badge-danger",  label: "Unpaid"    },
  };
  const s = m[status] || { cls: "badge-neutral", label: status };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

// ── Tenant detail drawer (read-only for caretaker) ──
function TenantDrawer({ tenant, onClose }: { tenant: any; onClose: () => void }) {
  const [tab, setTab] = useState<"details" | "payments">("details");

  const { data: paymentsData, isLoading } = useQuery({
    queryKey: ["caretaker-tenant-payments", tenant.id],
    queryFn:  () => api.get(`/api/payments/tenancy/${tenant.id}/`).then((r) => r.data),
    enabled:  tab === "payments",
  });

  const payments = paymentsData?.results || paymentsData || [];
  const totalPaid = payments
    .filter((p: any) => p.status === "success")
    .reduce((s: number, p: any) => s + parseFloat(p.amount_paid), 0);

  const methodIcons: Record<string, React.ReactNode> = {
    mpesa: <Smartphone size={12} color="var(--lr-primary)" />,
    card:  <CreditCard size={12} color="#185FA5" />,
    bank:  <Banknote size={12} color="#BA7517" />,
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} onClick={onClose} />
      <div style={{ position: "relative", zIndex: 61, width: "100%", maxWidth: 420, background: "#fff", height: "100%", display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.1)" }} className="animate-slide-in">

        {/* Header */}
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--lr-border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--lr-primary-light)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: "1rem", color: "var(--lr-primary)" }}>
                  {tenant.tenant_name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem", color: "var(--lr-text-primary)", marginBottom: 3 }}>
                  {tenant.tenant_name}
                </p>
                <PayBadge status={tenant.pay_status} />
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              <X size={20} color="var(--lr-text-muted)" />
            </button>
          </div>

          {/* Quick stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div style={{ background: "var(--lr-bg-page)", borderRadius: 8, padding: "8px 10px" }}>
              <p style={{ fontSize: "0.65rem", color: "var(--lr-text-muted)", marginBottom: 1 }}>Unit</p>
              <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--lr-text-primary)" }}>{tenant.unit}</p>
            </div>
            <div style={{ background: "var(--lr-bg-page)", borderRadius: 8, padding: "8px 10px" }}>
              <p style={{ fontSize: "0.65rem", color: "var(--lr-text-muted)", marginBottom: 1 }}>Rent</p>
              <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--lr-text-primary)" }}>{formatKES(tenant.rent)}</p>
            </div>
            <div style={{ background: tenant.is_overdue ? "#FCEBEB" : tenant.pay_status === "paid" || tenant.pay_status === "paid_ahead" ? "#EAF3DE" : "#FAEEDA", borderRadius: 8, padding: "8px 10px" }}>
              <p style={{ fontSize: "0.65rem", color: "var(--lr-text-muted)", marginBottom: 1 }}>Status</p>
              <p style={{ fontSize: "0.75rem", fontWeight: 600, color: tenant.is_overdue ? "#A32D2D" : tenant.pay_status === "paid" || tenant.pay_status === "paid_ahead" ? "#639922" : "#BA7517" }}>
                {tenant.is_overdue ? `${tenant.days_overdue}d overdue` : tenant.pay_status === "paid" || tenant.pay_status === "paid_ahead" ? "Paid" : "Partial"}
              </p>
            </div>
          </div>

          {/* Paid until strip */}
          {tenant.paid_until && (
            <div style={{ marginTop: 10, padding: "7px 12px", background: "var(--lr-primary-light)", borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
              <p style={{ fontSize: "0.72rem", color: "var(--lr-primary-dark)" }}>Paid until</p>
              <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--lr-primary)" }}>{formatDate(tenant.paid_until)}</p>
            </div>
          )}
          {tenant.balance > 0 && (
            <div style={{ marginTop: 6, padding: "7px 12px", background: "#FCEBEB", borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
              <p style={{ fontSize: "0.72rem", color: "#791F1F" }}>Balance due</p>
              <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "#A32D2D" }}>{formatKES(tenant.balance)}</p>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--lr-border)", flexShrink: 0 }}>
          {[
            { key: "details",  label: "Details",  icon: <Users size={13} />     },
            { key: "payments", label: "Payments", icon: <CreditCard size={13} /> },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as any)} style={{ flex: 1, padding: "11px 8px", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: "0.8rem", fontWeight: 500, border: "none", background: "none", cursor: "pointer", borderBottom: `2px solid ${tab === t.key ? "var(--lr-primary)" : "transparent"}`, color: tab === t.key ? "var(--lr-primary)" : "var(--lr-text-muted)", transition: "all 0.15s" }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>

          {/* Details tab */}
          {tab === "details" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <p className="section-label">Tenant information</p>
                {[
                  { label: "Full name", value: tenant.tenant_name },
                  { label: "Phone",     value: tenant.tenant_phone },
                  { label: "Property",  value: tenant.property },
                  { label: "Unit",      value: `Unit ${tenant.unit}` },
                  { label: "Lease start", value: formatDate(tenant.lease_start) },
                ].map((row) => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--lr-border)" }}>
                    <p style={{ fontSize: "0.78rem", color: "var(--lr-text-muted)" }}>{row.label}</p>
                    <p style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--lr-text-primary)" }}>{row.value || "—"}</p>
                  </div>
                ))}
              </div>

              {/* Contact actions */}
              <div>
                <p className="section-label">Contact tenant</p>
                <a 
                  href={`tel:${tenant.tenant_phone}`}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--lr-primary-light)", borderRadius: 10, textDecoration: "none", color: "var(--lr-primary)", fontWeight: 500, fontSize: "0.875rem" }}
                >
                  <Phone size={15} /> 
                  <span>Call {tenant.tenant_name.split(" ")[0]}</span>
                </a>
              </div>
            </div>
          )}

          {/* Payments tab */}
          {tab === "payments" && (
            <div>
              {payments.length > 0 && (
                <div style={{ background: "var(--lr-primary-light)", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
                  <p style={{ fontSize: "0.68rem", color: "var(--lr-primary-dark)", marginBottom: 2 }}>Total paid</p>
                  <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.1rem", fontWeight: 700, color: "var(--lr-primary)" }}>
                    {formatKES(totalPaid)}
                  </p>
                </div>
              )}

              {isLoading ? (
                <div style={{ textAlign: "center", padding: "28px 0", color: "var(--lr-text-muted)", fontSize: "0.875rem" }}>Loading...</div>
              ) : payments.length === 0 ? (
                <div style={{ textAlign: "center", padding: "28px 0" }}>
                  <CreditCard size={28} style={{ margin: "0 auto 8px", opacity: 0.2, display: "block" }} />
                  <p style={{ fontSize: "0.875rem", color: "var(--lr-text-muted)" }}>No payments yet</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {payments.map((p: any) => {
                    const statusMap: Record<string, string> = { success: "badge-success", pending: "badge-warning", failed: "badge-danger" };
                    return (
                      <div key={p.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--lr-border)", display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div>
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
                          <span className={`badge ${statusMap[p.status] || "badge-neutral"}`} style={{ textTransform: "capitalize" }}>
                            {p.status === "success" ? "Paid" : p.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
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
export default function CaretakerTenantsPage() {
  const searchParams  = useSearchParams();
  const [propertyFilter, setPropertyFilter] = useState(searchParams.get("property_id") || "all");
  const [search,         setSearch]         = useState("");
  const [selectedTenant, setSelectedTenant] = useState<any>(null);

  const { data: ctxData } = useQuery({
    queryKey: ["caretaker-context"],
    queryFn:  () => api.get("/api/caretaker/context/").then((r) => r.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["caretaker-tenants", propertyFilter],
    queryFn:  () => api.get(`/api/caretaker/tenants/${propertyFilter !== "all" ? `?property_id=${propertyFilter}` : ""}`).then((r) => r.data),
  });

  const properties = ctxData?.properties || [];
  const allTenants = data?.results || [];
  const tenants    = allTenants.filter((t: any) => {
    const q = search.toLowerCase();
    return !q || t.tenant_name.toLowerCase().includes(q) || t.unit.toLowerCase().includes(q);
  });

  const paid    = tenants.filter((t: any) => ["paid","paid_ahead"].includes(t.pay_status)).length;
  const partial = tenants.filter((t: any) => t.pay_status === "partially_paid").length;
  const unpaid  = tenants.filter((t: any) => t.pay_status === "unpaid").length;

  return (
    <CaretakerLayout active="tenants">
      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <Building2 size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--lr-text-muted)", pointerEvents: "none" }} />
          <select className="input" value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)} style={{ appearance: "none", paddingLeft: 26, paddingRight: 24, fontSize: "0.8rem", width: "auto", minWidth: 160 }}>
            <option value="all">All properties</option>
            {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={11} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--lr-text-muted)" }} />
        </div>
        <div style={{ position: "relative", flex: 1, maxWidth: 280 }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--lr-text-muted)", pointerEvents: "none" }} />
          <input className="input" placeholder="Search tenant or unit..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 34 }} />
          {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer" }}><X size={13} color="var(--lr-text-muted)" /></button>}
        </div>
      </div>

      {/* Summary pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { label: `${paid} Paid`,    bg: "#EAF3DE", color: "#27500A" },
          { label: `${partial} Partial`, bg: "#FAEEDA", color: "#633806" },
          { label: `${unpaid} Unpaid`,   bg: "#FCEBEB", color: "#791F1F" },
        ].map((p) => (
          <span key={p.label} style={{ padding: "4px 12px", borderRadius: 99, background: p.bg, color: p.color, fontSize: "0.78rem", fontWeight: 600 }}>{p.label}</span>
        ))}
      </div>

      {/* Tenants list */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--lr-text-muted)" }}>Loading...</div>
      ) : tenants.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px 0" }}>
          <Users size={32} style={{ margin: "0 auto 10px", opacity: 0.2, display: "block" }} />
          <p style={{ color: "var(--lr-text-muted)", fontSize: "0.875rem" }}>No tenants found</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tenants.map((t: any) => (
            <div
              key={t.id}
              style={{ background: "#fff", borderRadius: 12, border: `1px solid ${t.is_overdue ? "rgba(162,45,45,0.3)" : "var(--lr-border)"}`, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: "pointer", transition: "box-shadow 0.15s" }}
              onClick={() => setSelectedTenant(t)}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)")}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
            >
              {/* Left — tenant info */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--lr-primary-light)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: "0.875rem", color: "var(--lr-primary)" }}>
                    {t.tenant_name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {t.tenant_name}
                  </p>
                  <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>
                    {t.property} · Unit {t.unit} · {formatKES(t.rent)}/mo
                  </p>
                  {t.is_overdue && (
                    <p style={{ fontSize: "0.7rem", color: "var(--lr-danger)", fontWeight: 600, marginTop: 2 }}>
                      {t.days_overdue} days overdue
                    </p>
                  )}
                </div>
              </div>

              {/* Right — status + view */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <div style={{ textAlign: "right" }}>
                  <PayBadge status={t.pay_status} />
                  {t.paid_until && (
                    <p style={{ fontSize: "0.68rem", color: "var(--lr-text-muted)", marginTop: 3 }}>
                      Until {formatDate(t.paid_until)}
                    </p>
                  )}
                </div>
                <div style={{ padding: "6px 10px", background: "var(--lr-bg-page)", borderRadius: 7, display: "flex", alignItems: "center", gap: 4, fontSize: "0.75rem", color: "var(--lr-primary)", fontWeight: 500, flexShrink: 0 }}>
                  <Eye size={13} /> View
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tenant drawer */}
      {selectedTenant && (
        <TenantDrawer
          tenant={selectedTenant}
          onClose={() => setSelectedTenant(null)}
        />
      )}
    </CaretakerLayout>
  );
}