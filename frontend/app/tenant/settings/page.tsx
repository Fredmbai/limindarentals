"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Save, Loader2, Eye, EyeOff, X, Home,
  LogOut, AlertTriangle, AlertCircle, ArrowRight,
  FileText, Pen, Check, Loader, Building2,
  ChevronDown, RefreshCw, Trash2, StopCircle,
  CreditCard, Wrench, Settings,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { formatKES, formatDate, formatPhone } from "@/lib/utils";
import { NotificationBell } from "@/components/NotificationBell";
import { MobileProfileButton } from "@/components/MobileProfileButton";

const NAV = [
  { href: "/tenant/dashboard",   label: "Dashboard",   icon: <Home size={17} />        },
  { href: "/tenant/payments",    label: "Payments",    icon: <CreditCard size={17} />  },
  { href: "/tenant/receipts",    label: "Receipts",    icon: <FileText size={17} />    },
  { href: "/tenant/maintenance", label: "Maintenance", icon: <Wrench size={17} />      },
  { href: "/tenant/settings",    label: "Settings",    icon: <Settings size={17} />    },
];

// ── Tenancy Agreement Modal ───────────────────
function AgreementModal({ tenancy, onClose }: { tenancy: any; onClose: () => void }) {
  const agr = tenancy.agreement;

  const handleDownload = () => {
    if (agr?.agreement_pdf) { window.open(agr.agreement_pdf, "_blank"); return; }
    const content = `TENANCY AGREEMENT
=================
Property:      ${tenancy.property_name}
Unit:          Unit ${tenancy.unit.unit_number}
Tenant:        ${agr?.tenant_name || "—"}
Phone:         ${agr?.tenant_phone || "—"}
National ID:   ${agr?.tenant_id_number || "—"}
Monthly Rent:  KES ${tenancy.rent_snapshot}
Deposit:       KES ${tenancy.deposit_amount}
Lease Start:   ${formatDate(tenancy.lease_start_date)}
Signed By:     ${agr?.signed_name || "—"}
Signed At:     ${agr?.signed_at ? formatDate(agr.signed_at) : "—"}

Terms:
1. Monthly rent payable in advance on due date each month.
2. Security deposit refundable upon exit in good condition.
3. Payments via LumidahRentals platform (M-Pesa, card, or bank transfer).
4. 30 days written notice required for termination by either party.
5. Tenant must maintain unit in good condition and report issues promptly.
6. Governed by the laws of the Republic of Kenya.

This agreement was digitally signed on LumidahRentals.`.trim();
    const blob = new Blob([content], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `Agreement-Unit${tenancy.unit.unit_number}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} onClick={onClose} />
      <div style={{ position: "relative", background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "90vh", display: "flex", flexDirection: "column", zIndex: 101 }} className="animate-slide-up">
        {/* Header */}
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--lr-border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "1rem", color: "var(--lr-text-primary)", marginBottom: 2 }}>
              Tenancy Agreement
            </h3>
            <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>
              Unit {tenancy.unit.unit_number} · {tenancy.property_name}
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <X size={20} color="var(--lr-text-muted)" />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {/* Agreement document */}
          <div style={{ background: "var(--lr-bg-page)", border: "1px solid var(--lr-border)", borderRadius: 10, padding: "18px", fontSize: "0.82rem", color: "var(--lr-text-secondary)", lineHeight: 1.9, marginBottom: 20 }}>
            <p style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: "0.95rem", textAlign: "center", marginBottom: 16, color: "var(--lr-text-primary)" }}>
              TENANCY AGREEMENT
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              {[
                { label: "Property",     value: tenancy.property_name },
                { label: "Unit",         value: `Unit ${tenancy.unit.unit_number}` },
                { label: "Tenant",       value: agr?.tenant_name || "—" },
                { label: "Phone",        value: agr?.tenant_phone || "—" },
                { label: "National ID",  value: agr?.tenant_id_number || "—" },
                { label: "Monthly Rent", value: formatKES(tenancy.rent_snapshot) },
                { label: "Deposit",      value: formatKES(tenancy.deposit_amount) },
                { label: "Lease Start",  value: formatDate(tenancy.lease_start_date) },
              ].map((row) => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--lr-border)" }}>
                  <p style={{ color: "var(--lr-text-muted)", fontSize: "0.78rem" }}>{row.label}</p>
                  <p style={{ fontWeight: 500, color: "var(--lr-text-primary)", fontSize: "0.78rem" }}>{row.value}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14 }}>
              <p style={{ fontWeight: 600, marginBottom: 8, color: "var(--lr-text-primary)" }}>Terms and Conditions</p>
              {[
                "Monthly rent is payable in advance on or before the agreed due date.",
                "Security deposit is refundable upon exit subject to unit condition.",
                "All payments to be made via LumidahRentals (M-Pesa, card, or bank transfer).",
                "Either party may terminate with 30 days written notice.",
                "Tenant must maintain the unit in good condition and report issues promptly.",
                "Governed by the laws of the Republic of Kenya.",
              ].map((term, i) => (
                <p key={i} style={{ marginBottom: 4, fontSize: "0.78rem" }}>{i + 1}. {term}</p>
              ))}
            </div>
          </div>

          {/* Signature block */}
          {agr && (
            <div style={{ background: "#EAF3DE", border: "1px solid rgba(93,202,165,0.3)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Pen size={14} color="#639922" />
                <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#27500A" }}>Digitally signed</p>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <p style={{ fontSize: "0.78rem", color: "#27500A" }}>Signed by: <strong>{agr.signed_name}</strong></p>
                <p style={{ fontSize: "0.78rem", color: "#27500A" }}>{agr.signed_at ? formatDate(agr.signed_at) : "—"}</p>
              </div>
            </div>
          )}

          {/* Download button */}
          <button className="btn-secondary" onClick={handleDownload} style={{ width: "100%", justifyContent: "center" }}>
            <FileText size={14} /> Download Agreement
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Change Unit Modal ─────────────────────────
function ChangeUnitModal({ tenancy, onClose, onSuccess }: {
  tenancy:   any;
  onClose:   () => void;
  onSuccess: () => void;
}) {
  const [selectedUnit, setSelectedUnit] = useState<any>(null);
  const [confirming,   setConfirming]   = useState(false);
  const [error,        setError]        = useState("");

  // Fetch ALL vacant units under this landlord across all their properties
  const { data, isLoading } = useQuery({
    queryKey: ["landlord-vacant-units", tenancy.id],
    queryFn:  () => {
      // Get landlord id from tenancy
      const landlordId = tenancy.landlord_id || tenancy.unit?.property_landlord_id;
      // Fallback: search via tenancy endpoint
      return api.get(`/api/tenancies/${tenancy.id}/available-units/`)
        .then((r) => r.data)
        .catch(() => ({ results: [] }));
    },
  });

  const vacantUnits = (data?.results || data || []).filter(
    (u: any) => u.id !== tenancy.unit?.id
  );

  const { mutate: changeUnit, isPending } = useMutation({
    mutationFn: () => api.post(
      `/api/tenancies/${tenancy.id}/change-unit/`,
      { unit_id: selectedUnit.id }
    ),
    onSuccess: () => { onSuccess(); onClose(); },
    onError:   (err: any) => setError(
      err.response?.data?.detail || "Failed to change unit. Please try again."
    ),
  });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} onClick={onClose} />
      <div style={{ position: "relative", background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", zIndex: 101 }} className="animate-slide-up">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "1rem" }}>Change rental unit</h3>
            <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)", marginTop: 2 }}>
              Currently in: Unit {tenancy.unit?.unit_number} · {tenancy.property_name}
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <X size={20} color="var(--lr-text-muted)" />
          </button>
        </div>

        <div style={{ background: "var(--lr-primary-light)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: "0.78rem", color: "var(--lr-primary-dark)", lineHeight: 1.6 }}>
          Your payment history carries over. Only your unit changes.
        </div>

        {error && (
          <div style={{ background: "#FCEBEB", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: "0.8rem", color: "#791F1F", display: "flex", alignItems: "center", gap: 6 }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {isLoading ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "var(--lr-text-muted)" }}>
            <Loader2 size={20} style={{ animation: "spin 0.8s linear infinite", margin: "0 auto 8px", display: "block" }} />
            Loading available units...
          </div>
        ) : vacantUnits.length === 0 ? (
          <div style={{ textAlign: "center", padding: "28px 0" }}>
            <Building2 size={36} style={{ margin: "0 auto 10px", opacity: 0.2, display: "block" }} />
            <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--lr-text-primary)", marginBottom: 4 }}>
              No other vacant units available
            </p>
            <p style={{ fontSize: "0.78rem", color: "var(--lr-text-muted)" }}>
              There are no other vacant units under your landlord right now.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {vacantUnits.map((u: any) => (
              <div
                key={u.id}
                onClick={() => { setSelectedUnit(u); setConfirming(false); setError(""); }}
                style={{ padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${selectedUnit?.id === u.id ? "var(--lr-primary)" : "var(--lr-border)"}`, background: selectedUnit?.id === u.id ? "var(--lr-primary-light)" : "#fff", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "all 0.15s" }}
              >
                <div>
                  <p style={{ fontSize: "0.875rem", fontWeight: 600, color: selectedUnit?.id === u.id ? "var(--lr-primary)" : "var(--lr-text-primary)", marginBottom: 2 }}>
                    Unit {u.unit_number}
                    {u.property_name && u.property_name !== tenancy.property_name && (
                      <span style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", fontWeight: 400, marginLeft: 6 }}>
                        · {u.property_name}
                      </span>
                    )}
                  </p>
                  <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>
                    {u.unit_type?.replace("_", " ")}
                    {u.block_name ? ` · ${u.block_name}` : ""}
                  </p>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: "0.875rem", color: selectedUnit?.id === u.id ? "var(--lr-primary)" : "var(--lr-text-primary)" }}>
                    {formatKES(u.rent_amount)}
                  </p>
                  <p style={{ fontSize: "0.68rem", color: "var(--lr-text-muted)" }}>per month</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedUnit && !confirming && (
          <button
            className="btn-primary"
            onClick={() => setConfirming(true)}
            style={{ width: "100%", justifyContent: "center" }}
          >
            <ArrowRight size={14} /> Move to Unit {selectedUnit.unit_number}
          </button>
        )}

        {confirming && selectedUnit && (
          <div style={{ background: "#FAEEDA", border: "1px solid rgba(186,117,23,0.25)", borderRadius: 10, padding: "14px" }}>
            <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#633806", marginBottom: 8 }}>Confirm unit change</p>
            <p style={{ fontSize: "0.78rem", color: "#633806", marginBottom: 14, lineHeight: 1.6 }}>
              Move from <strong>Unit {tenancy.unit?.unit_number}</strong> → <strong>Unit {selectedUnit.unit_number}</strong> ({formatKES(selectedUnit.rent_amount)}/mo).
              Your old unit will be freed for other tenants.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-ghost" onClick={() => setConfirming(false)} style={{ flex: 1 }}>Back</button>
              <button
                className="btn-primary"
                onClick={() => changeUnit()}
                disabled={isPending}
                style={{ flex: 1, justifyContent: "center" }}
              >
                {isPending
                  ? <><Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> Moving...</>
                  : <><Check size={13} /> Confirm move</>
                }
              </button>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Main page ─────────────────────────────────
export default function TenantSettingsPage() {
  const user      = useAuthStore((s) => s.user);
  const setUser   = useAuthStore((s) => s.setUser);
  const logout    = useAuthStore((s) => s.logout);
  const router    = useRouter();
  const queryClient = useQueryClient();

  // Profile state
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [email,    setEmail]    = useState(user?.email     || "");
  const [profMsg,  setProfMsg]  = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Password state
  const [oldPass,  setOldPass]  = useState("");
  const [newPass,  setNewPass]  = useState("");
  const [showOld,  setShowOld]  = useState(false);
  const [showNew,  setShowNew]  = useState(false);
  const [passMsg,  setPassMsg]  = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Modal state
  const [agreementTenancy,   setAgreementTenancy]   = useState<any>(null);
  const [changeUnitTenancy,  setChangeUnitTenancy]  = useState<any>(null);
  const [endTenancyTarget,   setEndTenancyTarget]   = useState<any>(null);
  const [showDeleteAccount,  setShowDeleteAccount]  = useState(false);
  const [deleteConfirmText,  setDeleteConfirmText]  = useState("");

  const { data: profileData } = useQuery({
    queryKey: ["my-profile"],
    queryFn:  () => api.get("/api/auth/profile/").then((r) => r.data),
  });

  const { data: tenanciesData } = useQuery({
    queryKey: ["my-tenancies"],
    queryFn:  () => api.get("/api/tenancies/my/").then((r) => r.data),
  });

  const profile  = profileData || user;
  const tenancies = tenanciesData?.results || [];

  const msgStyle = (type: "success" | "error") => ({
    background: type === "success" ? "#EAF3DE" : "#FCEBEB",
    borderRadius: 8, padding: "10px 14px",
    fontSize: "0.875rem",
    color: type === "success" ? "#27500A" : "#791F1F",
    marginBottom: 16,
  });

  const { mutate: updateProfile, isPending: savingProf } = useMutation({
    mutationFn: () => api.patch("/api/auth/profile/", { full_name: fullName, email }),
    onSuccess:  (res) => { setUser(res.data); setProfMsg({ type: "success", text: "Profile updated." }); setTimeout(() => setProfMsg(null), 3000); },
    onError:    () => setProfMsg({ type: "error", text: "Failed to update profile." }),
  });

  const { mutate: changePassword, isPending: savingPass } = useMutation({
    mutationFn: () => api.post("/api/auth/change-password/", { old_password: oldPass, new_password: newPass }),
    onSuccess:  () => { setOldPass(""); setNewPass(""); setPassMsg({ type: "success", text: "Password changed." }); setTimeout(() => setPassMsg(null), 3000); },
    onError:    (err: any) => setPassMsg({ type: "error", text: err.response?.data?.old_password?.[0] || "Failed to change password." }),
  });

  const { mutate: endTenancy, isPending: endingTenancy } = useMutation({
    mutationFn: (id: string) => api.post(`/api/tenancies/${id}/end-self/`),
    onSuccess:  () => {
      setEndTenancyTarget(null);
      queryClient.invalidateQueries({ queryKey: ["my-tenancies"] });
    },
    onError:    (err: any) => alert(err.response?.data?.detail || "Failed to end tenancy."),
  });

  const { mutate: deleteAccount, isPending: deletingAccount } = useMutation({
    mutationFn: () => api.delete("/api/auth/delete-account/"),
    onSuccess:  async () => {
      await logout();
      router.push("/register");
    },
    onError:    (err: any) => alert(err.response?.data?.detail || "Failed to delete account."),
  });

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--lr-bg-page)" }}>

      {/* Desktop sidebar */}
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
            <Link key={item.href} href={item.href} className={`nav-item ${item.href === "/tenant/settings" ? "nav-item-active" : ""}`}>
              {item.icon} {item.label}
            </Link>
          ))}
        </nav>
        <div style={{ borderTop: "1px solid var(--lr-border)", paddingTop: 16, marginTop: 16 }}>
          <div style={{ padding: "8px", marginBottom: 4 }}>
            <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--lr-text-primary)" }}>{user?.full_name}</p>
            <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)", marginTop: 1 }}>Tenant</p>
          </div>
          <button onClick={async () => { await logout(); router.push("/login"); }} className="nav-item" style={{ width: "100%", border: "none", background: "none", cursor: "pointer", color: "var(--lr-danger)" }}>
            <LogOut size={17} /> Sign out
          </button>
        </div>
      </aside>

      <main className="tenant-main" style={{ flex: 1, overflowX: "hidden" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 className="page-title">Settings</h1>
            <p className="page-subtitle">Manage your account and tenancies</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NotificationBell />
            <MobileProfileButton role="tenant" />
          </div>
        </div>

        <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ── Profile ── */}
          <div className="card">
            <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem", marginBottom: 20 }}>Profile information</h3>
            {profMsg && <div style={msgStyle(profMsg.type)}>{profMsg.text}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }} className="settings-grid">
              <div>
                <label className="label">Full name</label>
                <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <label className="label">Phone number</label>
                <input className="input" value={formatPhone(profile?.phone || "")} disabled style={{ background: "var(--lr-bg-page)", cursor: "not-allowed" }} />
              </div>
              <div style={{ gridColumn: "span 2" }} className="full-col">
                <label className="label">Email address</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn-primary" onClick={() => updateProfile()} disabled={savingProf}>
                {savingProf ? <><Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Saving...</> : <><Save size={14} /> Save changes</>}
              </button>
            </div>
          </div>

          {/* ── Next of kin ── */}
          {profile?.next_of_kin && (
            <div className="card">
              <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem", marginBottom: 16 }}>Next of kin</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { label: "Full name",    value: profile.next_of_kin.full_name    },
                  { label: "Relationship", value: profile.next_of_kin.relationship },
                  { label: "Phone",        value: formatPhone(profile.next_of_kin.phone) },
                  { label: "Email",        value: profile.next_of_kin.email || "—" },
                ].map((item) => (
                  <div key={item.label}>
                    <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)", marginBottom: 3 }}>{item.label}</p>
                    <p style={{ fontSize: "0.875rem", color: "var(--lr-text-primary)", fontWeight: 500 }}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── My tenancies ── */}
<div className="card">
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
    <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem" }}>My tenancies</h3>
    <span style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>{tenancies.length} unit{tenancies.length !== 1 ? "s" : ""}</span>
  </div>

  {tenancies.length === 0 ? (
    <div style={{ textAlign: "center", padding: "24px 0" }}>
      <Building2 size={32} style={{ margin: "0 auto 8px", opacity: 0.2, display: "block" }} />
      <p style={{ fontSize: "0.875rem", color: "var(--lr-text-muted)", marginBottom: 4 }}>No tenancies yet</p>
      <p style={{ fontSize: "0.78rem", color: "var(--lr-text-muted)" }}>
        Go to <Link href="/tenant/dashboard" style={{ color: "var(--lr-primary)" }}>Dashboard</Link> to add a rental unit
      </p>
    </div>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {tenancies.map((t: any) => (
        <div key={t.id} style={{ border: "1px solid var(--lr-border)", borderRadius: 12, overflow: "hidden" }}>

          {/* Unit header — always visible */}
          <div style={{ padding: "14px 16px", background: "var(--lr-primary)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div>
              <p style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: "0.9rem", color: "#fff", marginBottom: 2 }}>
                Unit {t.unit?.unit_number || "—"} — {t.property_name || "—"}
              </p>
              <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.75)" }}>
                {formatKES(t.rent_snapshot)}/mo · Lease started {formatDate(t.lease_start_date)}
              </p>
            </div>
            <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: "0.7rem", fontWeight: 600, background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", textTransform: "capitalize" }}>
              {t.status}
            </span>
          </div>

          {/* Landlord info */}
          <div style={{ padding: "10px 16px", background: "var(--lr-bg-page)", borderBottom: "1px solid var(--lr-border)" }}>
            <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>
              Landlord: <span style={{ color: "var(--lr-text-secondary)", fontWeight: 500 }}>{t.landlord_name}</span>
              {t.landlord_phone && <> · {t.landlord_phone}</>}
            </p>
          </div>

          {/* Action buttons — always shown regardless of agreement */}
          <div style={{ padding: "12px 16px", display: "flex", gap: 8, flexWrap: "wrap", background: "#fff" }}>

            {/* View agreement — show if agreement exists */}
            <button
              className="btn-secondary"
              style={{ padding: "8px 14px", fontSize: "0.8rem" }}
              onClick={() => setAgreementTenancy(t)}
            >
              <FileText size={13} /> View agreement
            </button>

            {/* Change unit — active tenancies only */}
            {t.status === "active" && (
              <button
                className="btn-secondary"
                style={{ padding: "8px 14px", fontSize: "0.8rem" }}
                onClick={() => setChangeUnitTenancy(t)}
              >
                <RefreshCw size={13} /> Change unit
              </button>
            )}

            {/* End tenancy — active or pending */}
            {(t.status === "active" || t.status === "pending") && (
              <button
                className="btn-danger"
                style={{ padding: "8px 14px", fontSize: "0.8rem" }}
                onClick={() => setEndTenancyTarget(t)}
              >
                <StopCircle size={13} /> End tenancy
              </button>
            )}

          </div>
        </div>
      ))}
    </div>
  )}
</div>

          {/* ── Change password ── */}
          <div className="card">
            <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem", marginBottom: 20 }}>Change password</h3>
            {passMsg && <div style={msgStyle(passMsg.type)}>{passMsg.text}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
              <div>
                <label className="label">Current password</label>
                <div style={{ position: "relative" }}>
                  <input className="input" type={showOld ? "text" : "password"} value={oldPass} onChange={(e) => setOldPass(e.target.value)} style={{ paddingRight: 44 }} />
                  <button type="button" onClick={() => setShowOld((v) => !v)} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 44, background: "none", border: "none", cursor: "pointer", color: "var(--lr-text-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {showOld ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="label">New password</label>
                <div style={{ position: "relative" }}>
                  <input className="input" type={showNew ? "text" : "password"} value={newPass} onChange={(e) => setNewPass(e.target.value)} style={{ paddingRight: 44 }} />
                  <button type="button" onClick={() => setShowNew((v) => !v)} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 44, background: "none", border: "none", cursor: "pointer", color: "var(--lr-text-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            </div>
            <button className="btn-primary" onClick={() => changePassword()} disabled={savingPass || !oldPass || !newPass}>
              {savingPass ? <><Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Saving...</> : "Update password"}
            </button>
          </div>

          {/* ── Danger zone ── */}
          <div className="card" style={{ border: "1px solid rgba(162,45,45,0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 32, height: 32, background: "#FCEBEB", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <AlertTriangle size={15} color="#A32D2D" />
              </div>
              <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem", color: "#A32D2D" }}>Danger zone</h3>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--lr-text-muted)", marginBottom: 16, lineHeight: 1.6 }}>
              Deleting your account is permanent and cannot be undone. All your tenancies will be ended, and your payment history will be removed.
            </p>
            <button
              className="btn-danger"
              onClick={() => setShowDeleteAccount(true)}
              style={{ padding: "9px 16px", fontSize: "0.82rem" }}
            >
              <Trash2 size={14} /> Delete my account
            </button>
          </div>

        </div>

        {/* Bottom nav spacer on mobile */}
        <div className="bottom-nav-spacer" />
      </main>

      {/* ── Bottom nav (mobile) ── */}
      <nav className="bottom-nav">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className={`bottom-nav-item ${item.href === "/tenant/settings" ? "bottom-nav-active" : ""}`}>
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* ── Agreement Modal ── */}
      {agreementTenancy && (
        <AgreementModal
          tenancy={agreementTenancy}
          onClose={() => setAgreementTenancy(null)}
        />
      )}

      {/* ── Change Unit Modal ── */}
      {changeUnitTenancy && (
        <ChangeUnitModal
          tenancy={changeUnitTenancy}
          onClose={() => setChangeUnitTenancy(null)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["my-tenancies"] })}
        />
      )}

      {/* ── End Tenancy Confirm ── */}
      {endTenancyTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} onClick={() => setEndTenancyTarget(null)} />
          <div style={{ position: "relative", background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420, zIndex: 101 }} className="animate-slide-up">
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, background: "#FCEBEB", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <StopCircle size={20} color="#A32D2D" />
              </div>
              <div>
                <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "1rem" }}>End tenancy</h3>
                <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>Unit {endTenancyTarget.unit.unit_number} · {endTenancyTarget.property_name}</p>
              </div>
            </div>
            <p style={{ fontSize: "0.82rem", color: "var(--lr-text-secondary)", marginBottom: 20, lineHeight: 1.6 }}>
              Are you sure you want to end your tenancy for <strong>Unit {endTenancyTarget.unit.unit_number}</strong>? This will notify your landlord and cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-ghost" onClick={() => setEndTenancyTarget(null)} style={{ flex: 1 }}>Cancel</button>
              <button
                className="btn-danger"
                onClick={() => endTenancy(endTenancyTarget.id)}
                disabled={endingTenancy}
                style={{ flex: 1, justifyContent: "center" }}
              >
                {endingTenancy ? <><Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> Ending...</> : <><StopCircle size={13} /> End tenancy</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Account Confirm ── */}
      {showDeleteAccount && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} onClick={() => setShowDeleteAccount(false)} />
          <div style={{ position: "relative", background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420, zIndex: 101 }} className="animate-slide-up">
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, background: "#FCEBEB", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Trash2 size={20} color="#A32D2D" />
              </div>
              <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "1rem", color: "#A32D2D" }}>Delete account</h3>
            </div>
            <p style={{ fontSize: "0.82rem", color: "var(--lr-text-secondary)", marginBottom: 16, lineHeight: 1.6 }}>
              This will permanently delete your account and end all active tenancies. This action <strong>cannot be undone</strong>.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label className="label">Type your full name to confirm</label>
              <input
                className="input"
                placeholder={user?.full_name}
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
              />
              <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", marginTop: 4 }}>
                Must match exactly: <strong>{user?.full_name}</strong>
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-ghost" onClick={() => { setShowDeleteAccount(false); setDeleteConfirmText(""); }} style={{ flex: 1 }}>
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={() => deleteAccount()}
                disabled={deletingAccount || deleteConfirmText.trim() !== user?.full_name?.trim()}
                style={{ flex: 1, justifyContent: "center" }}
              >
                {deletingAccount ? <><Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> Deleting...</> : <><Trash2 size={13} /> Delete account</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .tenant-sidebar {
          width: 240px; background: #fff; border-right: 1px solid var(--lr-border);
          display: flex; flex-direction: column; padding: 24px 16px;
          position: fixed; top: 0; left: 0; bottom: 0; z-index: 40;
        }
        .tenant-main {
          margin-left: 240px; flex: 1; padding: 32px;
        }
        .bottom-nav { display: none; }
        .bottom-nav-spacer { display: none; }
        @media (max-width: 767px) {
          .tenant-sidebar { display: none; }
          .tenant-main { margin-left: 0; padding: 20px 16px; }
          .settings-grid { grid-template-columns: 1fr !important; }
          .full-col { grid-column: span 1 !important; }
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