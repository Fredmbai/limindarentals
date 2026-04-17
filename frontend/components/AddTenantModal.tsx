"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X, ChevronDown, CheckCircle, Loader2,
  ArrowRight, ArrowLeft, Check, AlertCircle,
  User, Building2, FileText, Pen, Calendar,
  Eye, EyeOff,
} from "lucide-react";
import api from "@/lib/api";
import { formatKES, formatDate } from "@/lib/utils";

const STEPS = [
  "Personal info",
  "Next of kin",
  "Select unit",
  "Agreement",
  "Payment status",
];

interface Props {
  onClose:          () => void;
  onSuccess:        () => void;
  landlordId?:      string;
  restrictToProps?: string[];  // caretaker: only show their properties
}

export function AddTenantModal({ onClose, onSuccess, restrictToProps }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");

  // Step 1 — Personal info
  const [fullName,   setFullName]   = useState("");
  const [phone,      setPhone]      = useState("");
  const [email,      setEmail]      = useState("");
  const [nationalId, setNationalId] = useState("");

  // Step 2 — Next of kin (optional)
  const [skipKin,   setSkipKin]   = useState(false);
  const [kinName,   setKinName]   = useState("");
  const [kinRel,    setKinRel]    = useState("");
  const [kinPhone,  setKinPhone]  = useState("");
  const [kinEmail,  setKinEmail]  = useState("");

  // Step 3 — Unit selection
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [selectedUnit,     setSelectedUnit]     = useState<any>(null);
  const [vacantUnits,      setVacantUnits]      = useState<any[]>([]);
  const [loadingUnits,     setLoadingUnits]     = useState(false);

  // Step 4 — Agreement
  const [leaseStart,    setLeaseStart]    = useState(new Date().toISOString().split("T")[0]);
  const [depositAmount, setDepositAmount] = useState("");
  const [signedName,    setSignedName]    = useState("");
  const [agreed,        setAgreed]        = useState(false);
  // -password
  const [password,    setPassword]    = useState("");
  const [showPass,    setShowPass]    = useState(false);
  const [useAutoPass, setUseAutoPass] = useState(true);

  // Step 5 — Payment status
  const [hasPaidInitial, setHasPaidInitial] = useState(false);
  const [paidUntil,      setPaidUntil]      = useState("");

  const today = new Date().toISOString().split("T")[0];

  // Fetch properties
  const { data: propsData } = useQuery({
    queryKey: ["add-tenant-properties"],
    queryFn:  () => api.get("/api/properties/").then((r) => r.data),
  });

  const allProperties = propsData?.results || [];
  const properties    = restrictToProps
    ? allProperties.filter((p: any) => restrictToProps.includes(p.id))
    : allProperties;

  const handleSelectProperty = async (p: any) => {
    setSelectedProperty(p);
    setSelectedUnit(null);
    setLoadingUnits(true);
    try {
      const res   = await api.get(`/api/properties/${p.id}/vacant-units/`);
      const units = res.data?.results || res.data || [];
      setVacantUnits(units);
    } catch {
      setError("Could not load vacant units.");
    } finally {
      setLoadingUnits(false);
    }
  };

  const validateStep = () => {
    setError("");
    if (step === 0) {
      if (!fullName.trim())   return setError("Full name is required."), false;
      if (!phone.trim())      return setError("Phone number is required."), false;
     if (!nationalId.trim()) return setError("National ID is required."), false;
     if (!useAutoPass && password.length < 8)
       return setError("Password must be at least 8 characters."), false;
    }
    if (step === 1) {
      if (!skipKin) {
        if (!kinName.trim())  return setError("Next of kin name is required."), false;
        if (!kinRel.trim())   return setError("Relationship is required."), false;
        if (!kinPhone.trim()) return setError("Next of kin phone is required."), false;
      }
    }
    if (step === 2) {
      if (!selectedUnit) return setError("Please select a unit."), false;
    }
    if (step === 3) {
      if (!leaseStart)           return setError("Lease start date is required."), false;
      if (!depositAmount)        return setError("Deposit amount is required."), false;
      if (!signedName.trim())    return setError("Digital signature is required."), false;
      if (signedName.trim().toLowerCase() !== fullName.trim().toLowerCase())
        return setError(`Signed name must match tenant's full name: "${fullName}"`), false;
      if (!agreed)               return setError("Please confirm agreement acceptance."), false;
    }
    return true;
  };

  const { mutate: submit, isPending } = useMutation({
  mutationFn: () => {
    const payload = {
      full_name:        fullName.trim(),
      phone:            phone.trim(),
      email:            email.trim() || undefined,
      national_id:      nationalId.trim(),
      password:         (!useAutoPass && password.length >= 8) ? password : undefined,
      unit_id:          selectedUnit?.id,
      deposit_amount:   String(depositAmount),
      lease_start_date: leaseStart,
      signed_name:      signedName.trim(),
      has_paid_initial: hasPaidInitial,
      paid_until:       (hasPaidInitial && paidUntil) ? paidUntil : undefined,
      ...(!skipKin && kinName.trim() ? {
        kin_name:         kinName.trim(),
        kin_relationship: kinRel.trim(),
        kin_phone:        kinPhone.trim(),
        kin_email:        kinEmail.trim() || undefined,
      } : {}),
    };
    console.log("Submitting payload:", payload);
    return api.post("/api/tenancies/add-tenant/", payload);
  },
  onSuccess: (res) => {
    console.log("Success response:", res.data);
    queryClient.invalidateQueries({ queryKey: ["landlord-tenancies"] });
    queryClient.invalidateQueries({ queryKey: ["landlord-properties"] });
    queryClient.invalidateQueries({ queryKey: ["caretaker-context"] });
    queryClient.invalidateQueries({ queryKey: ["caretaker-tenants"] });

    if (res.data.is_new_user && res.data.login_credentials) {
      setCreatedCredentials({
        name:     fullName,
        phone:    res.data.login_credentials.phone,
        password: res.data.login_credentials.password,
      });
    } else {
      onSuccess();
    }
  },
  onError: (err: any) => {
    console.error("Add tenant error:", err.response?.data);
    const data = err.response?.data;
    const msg  = data?.detail || data?.non_field_errors?.[0] || JSON.stringify(data) || "Failed to add tenant.";
    setError(msg);
    // Go back to relevant step if validation error
  },
});
  
  const [createdCredentials, setCreatedCredentials] = useState<{
    name: string; phone: string; password: string;
  } | null>(null);

  const handleNext = () => {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      setError("");
      return;
    }
    // Last step — submit
    submit();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={onClose} />
      <div style={{ position: "relative", background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "92vh", display: "flex", flexDirection: "column", zIndex: 101, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} className="animate-slide-up">
        {/* Credentials success screen */}
{createdCredentials && (
  <div style={{ position: "absolute", inset: 0, background: "#fff", borderRadius: 16, zIndex: 10, display: "flex", flexDirection: "column", padding: 28, justifyContent: "center" }}>
    <div style={{ textAlign: "center", marginBottom: 24 }}>
      <div style={{ width: 60, height: 60, background: "#EAF3DE", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
        <CheckCircle size={30} color="#639922" />
      </div>
      <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: "1.1rem", color: "var(--lr-text-primary)", marginBottom: 6 }}>
        Tenant added!
      </h3>
      <p style={{ fontSize: "0.82rem", color: "var(--lr-text-muted)" }}>
        Share these login credentials with the tenant
      </p>
    </div>

    <div style={{ background: "var(--lr-bg-page)", borderRadius: 12, padding: "16px", marginBottom: 16 }}>
      <p style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--lr-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Login credentials</p>
      {[
        { label: "Full name (login)", value: createdCredentials.name     },
        { label: "Phone number",      value: createdCredentials.phone    },
        { label: "Password",          value: createdCredentials.password },
      ].map((row) => (
        <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--lr-border)" }}>
          <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>{row.label}</p>
          <p style={{ fontFamily: row.label === "Password" ? "'JetBrains Mono', monospace" : "inherit", fontSize: "0.82rem", fontWeight: 600, color: row.label === "Password" ? "var(--lr-primary)" : "var(--lr-text-primary)" }}>
            {row.value}
          </p>
        </div>
      ))}
    </div>

    <div style={{ background: "#FAEEDA", borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: "0.78rem", color: "#633806", lineHeight: 1.6 }}>
      Save these now. The password will not be shown again after closing. Tenant can change it in Settings.
    </div>

    <button
      className="btn-primary"
      style={{ width: "100%", justifyContent: "center" }}
      onClick={() => {
        setCreatedCredentials(null);
        queryClient.invalidateQueries({ queryKey: ["landlord-tenancies"] });
        queryClient.invalidateQueries({ queryKey: ["caretaker-context"] });
        onSuccess();
      }}
    >
      <CheckCircle size={14} /> Done
    </button>
  </div>
)}
        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--lr-border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "1rem", color: "var(--lr-text-primary)" }}>
              Add tenant
            </h3>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}>
              <X size={20} color="var(--lr-text-muted)" />
            </button>
          </div>

          {/* Step indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {STEPS.map((label, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: i < step ? "var(--lr-primary)" : i === step ? "var(--lr-primary)" : "var(--lr-border)", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", flexShrink: 0 }}>
                    {i < step
                      ? <Check size={12} color="#fff" strokeWidth={2.5} />
                      : <span style={{ fontSize: "0.65rem", fontWeight: 600, color: i === step ? "#fff" : "var(--lr-text-muted)" }}>{i + 1}</span>
                    }
                  </div>
                  <span style={{ fontSize: "0.6rem", color: i === step ? "var(--lr-primary)" : "var(--lr-text-muted)", fontWeight: i === step ? 600 : 400, whiteSpace: "nowrap" }}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: i < step ? "var(--lr-primary)" : "var(--lr-border)", margin: "0 4px 16px", transition: "background 0.2s" }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>

          {error && (
            <div style={{ background: "#FCEBEB", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: "0.8rem", color: "#791F1F", display: "flex", alignItems: "center", gap: 8 }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {/* ── Step 0: Personal info ── */}
          {step === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }} className="animate-fade-in">
              <div>
                <label className="label">Full name *</label>
                <input className="input" placeholder="e.g. John Kamau" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label className="label">Phone number *</label>
                  <input className="input" type="tel" placeholder="e.g. 0712345678" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div>
                  <label className="label">National ID *</label>
                  <input className="input" placeholder="e.g. 12345678" value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Email (optional)</label>
                <input className="input" type="email" placeholder="john@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {/* Password */}
              <div style={{ background: "var(--lr-bg-page)", borderRadius: 10, padding: "12px 14px" }}>
  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: useAutoPass ? 0 : 14 }}>
    <div
      onClick={() => setUseAutoPass((v) => !v)}
      style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${useAutoPass ? "var(--lr-primary)" : "var(--lr-border)"}`, background: useAutoPass ? "var(--lr-primary)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", transition: "all 0.15s" }}
    >
      {useAutoPass && <Check size={11} color="#fff" strokeWidth={3} />}
    </div>
    <div>
      <p style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--lr-text-primary)" }}>
        Auto-generate password
      </p>
      <p style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)" }}>
        Format: NR{"{last 4 of phone}"}@2024 — tenant changes in settings
      </p>
    </div>
  </label>

  {!useAutoPass && (
    <div className="animate-fade-in">
      <label className="label">Set password *</label>
      <div style={{ position: "relative" }}>
        <input
          className="input"
          type={showPass ? "text" : "password"}
          placeholder="Minimum 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ paddingRight: 44 }}
        />
        <button
          type="button"
          onClick={() => setShowPass((v) => !v)}
          style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--lr-text-muted)" }}
        >
          {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {password && password.length < 8 && (
        <p style={{ fontSize: "0.72rem", color: "var(--lr-danger)", marginTop: 4 }}>
          Must be at least 8 characters
        </p>
      )}
    </div>
  )}
              </div>
            </div>
          )}

          {/* ── Step 1: Next of kin ── */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }} className="animate-fade-in">
              {/* Skip option */}
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 14px", background: skipKin ? "var(--lr-primary-light)" : "var(--lr-bg-page)", border: `1.5px solid ${skipKin ? "var(--lr-primary)" : "var(--lr-border)"}`, borderRadius: 8, transition: "all 0.15s" }}>
                <div
                  onClick={() => setSkipKin((v) => !v)}
                  style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${skipKin ? "var(--lr-primary)" : "var(--lr-border)"}`, background: skipKin ? "var(--lr-primary)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}
                >
                  {skipKin && <Check size={11} color="#fff" strokeWidth={3} />}
                </div>
                <div>
                  <p style={{ fontSize: "0.82rem", fontWeight: 500, color: skipKin ? "var(--lr-primary)" : "var(--lr-text-primary)" }}>Skip next of kin</p>
                  <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>Can be added later from tenant settings</p>
                </div>
              </label>

              {!skipKin && (
                <>
                  <div>
                    <label className="label">Full name *</label>
                    <input className="input" placeholder="e.g. Mary Kamau" value={kinName} onChange={(e) => setKinName(e.target.value)} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label className="label">Relationship *</label>
                      <div style={{ position: "relative" }}>
                        <select className="input" value={kinRel} onChange={(e) => setKinRel(e.target.value)} style={{ appearance: "none" }}>
                          <option value="">Select</option>
                          {["Parent","Sibling","Spouse","Child","Relative","Friend","Other"].map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                        <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--lr-text-muted)" }} />
                      </div>
                    </div>
                    <div>
                      <label className="label">Phone *</label>
                      <input className="input" type="tel" placeholder="0798..." value={kinPhone} onChange={(e) => setKinPhone(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="label">Email (optional)</label>
                    <input className="input" type="email" placeholder="mary@email.com" value={kinEmail} onChange={(e) => setKinEmail(e.target.value)} />
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Step 2: Unit selection ── */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }} className="animate-fade-in">

              {/* Property select */}
              <div style={{ background: "var(--lr-bg-page)", borderRadius: 10, padding: 14 }}>
                <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 10 }}>
                  Select property
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {properties.map((p: any) => (
                    <div
                      key={p.id}
                      onClick={() => handleSelectProperty(p)}
                      style={{ padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${selectedProperty?.id === p.id ? "var(--lr-primary)" : "var(--lr-border)"}`, background: selectedProperty?.id === p.id ? "var(--lr-primary-light)" : "#fff", cursor: "pointer", transition: "all 0.15s" }}
                    >
                      <p style={{ fontSize: "0.82rem", fontWeight: 500, color: selectedProperty?.id === p.id ? "var(--lr-primary)" : "var(--lr-text-primary)", marginBottom: 2 }}>{p.name}</p>
                      <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>{p.address} · {p.vacant_count} vacant</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Unit select */}
              {selectedProperty && (
                <div style={{ background: "var(--lr-bg-page)", borderRadius: 10, padding: 14 }} className="animate-fade-in">
                  <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 10 }}>
                    Select unit
                  </p>
                  {loadingUnits ? (
                    <div style={{ textAlign: "center", padding: "16px 0", color: "var(--lr-text-muted)", fontSize: "0.8rem" }}>
                      <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite", margin: "0 auto 4px", display: "block" }} />
                      Loading units...
                    </div>
                  ) : vacantUnits.length === 0 ? (
                    <p style={{ fontSize: "0.8rem", color: "var(--lr-danger)", textAlign: "center", padding: "10px 0" }}>
                      No vacant units in this property.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {vacantUnits.map((u: any) => (
                        <div
                          key={u.id}
                          onClick={() => { setSelectedUnit(u); setDepositAmount(u.rent_amount); }}
                          style={{ padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${selectedUnit?.id === u.id ? "var(--lr-primary)" : "var(--lr-border)"}`, background: selectedUnit?.id === u.id ? "var(--lr-primary-light)" : "#fff", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "all 0.15s" }}
                        >
                          <div>
                            <p style={{ fontSize: "0.82rem", fontWeight: 600, color: selectedUnit?.id === u.id ? "var(--lr-primary)" : "var(--lr-text-primary)", marginBottom: 2 }}>
                              Unit {u.unit_number}
                            </p>
                            <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>
                              {u.unit_type?.replace("_", " ")}{u.block_name ? ` · ${u.block_name}` : ""}
                            </p>
                          </div>
                          <p style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: "0.875rem", color: selectedUnit?.id === u.id ? "var(--lr-primary)" : "var(--lr-text-primary)" }}>
                            {formatKES(u.rent_amount)}/mo
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Agreement ── */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }} className="animate-fade-in">
              {/* Agreement doc */}
              <div style={{ background: "var(--lr-bg-page)", border: "1px solid var(--lr-border)", borderRadius: 10, padding: "14px", fontSize: "0.78rem", color: "var(--lr-text-secondary)", lineHeight: 1.8, maxHeight: 200, overflowY: "auto" }}>
                <p style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, textAlign: "center", marginBottom: 10, color: "var(--lr-text-primary)" }}>TENANCY AGREEMENT</p>
                <p><strong>Tenant:</strong> {fullName}</p>
                <p><strong>Phone:</strong> {phone}</p>
                <p><strong>Property:</strong> {selectedProperty?.name}</p>
                <p><strong>Unit:</strong> {selectedUnit?.unit_number}</p>
                <p><strong>Monthly rent:</strong> {formatKES(selectedUnit?.rent_amount)}</p>
                <div style={{ height: 1, background: "var(--lr-border)", margin: "8px 0" }} />
                <p>1. Monthly rent payable in advance on due date.</p>
                <p>2. Security deposit refundable upon exit in good condition.</p>
                <p>3. Payments via LumidahRentals platform.</p>
                <p>4. 30 days written notice to terminate.</p>
                <p>5. Governed by the laws of Kenya.</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label className="label">Lease start date *</label>
                  <input className="input" type="date" min={today} value={leaseStart} onChange={(e) => setLeaseStart(e.target.value)} />
                </div>
                <div>
                  <label className="label">Deposit amount (KES) *</label>
                  <input className="input" type="number" placeholder={selectedUnit?.rent_amount} value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="label">Digital signature — tenant's full name *</label>
                <div style={{ position: "relative" }}>
                  <Pen size={13} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--lr-text-muted)", pointerEvents: "none" }} />
                  <input className="input" placeholder={`Type "${fullName}" to sign`} value={signedName} onChange={(e) => { setSignedName(e.target.value); setError(""); }} style={{ paddingLeft: 32, fontStyle: "italic" }} />
                </div>
                <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", marginTop: 4 }}>Must match: <strong>{fullName}</strong></p>
              </div>

              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <div onClick={() => setAgreed((v) => !v)} style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${agreed ? "var(--lr-primary)" : "var(--lr-border)"}`, background: agreed ? "var(--lr-primary)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, cursor: "pointer" }}>
                  {agreed && <Check size={11} color="#fff" strokeWidth={3} />}
                </div>
                <span style={{ fontSize: "0.78rem", color: "var(--lr-text-secondary)", lineHeight: 1.5 }}>
                  I confirm the tenant has read and agreed to all terms of this tenancy agreement.
                </span>
              </label>
            </div>
          )}

          {/* ── Step 4: Payment status ── */}
          {step === 4 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="animate-fade-in">
              <div style={{ background: "var(--lr-bg-page)", borderRadius: 10, padding: "12px 14px", fontSize: "0.8rem", color: "var(--lr-text-secondary)", lineHeight: 1.6 }}>
                If the tenant has already paid (e.g. they are an existing tenant being onboarded), record their payment here so the system tracks it correctly from day one.
              </div>

              {/* Has paid initial? */}
              <div>
                <label className="label">Initial payment (deposit + prorated rent)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { value: true,  label: "Already paid",     desc: "Tenant paid before onboarding" },
                    { value: false, label: "Not yet paid",     desc: "Tenant will pay via platform"   },
                  ].map((opt) => (
                    <button
                      key={String(opt.value)}
                      onClick={() => setHasPaidInitial(opt.value)}
                      style={{ flex: 1, padding: "12px", border: `1.5px solid ${hasPaidInitial === opt.value ? "var(--lr-primary)" : "var(--lr-border)"}`, borderRadius: 10, background: hasPaidInitial === opt.value ? "var(--lr-primary-light)" : "#fff", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}
                    >
                      <p style={{ fontSize: "0.82rem", fontWeight: 600, color: hasPaidInitial === opt.value ? "var(--lr-primary)" : "var(--lr-text-primary)", marginBottom: 3 }}>
                        {opt.label}
                      </p>
                      <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Paid until — if already paid */}
              {hasPaidInitial && (
                <div className="animate-fade-in">
                  <div style={{ background: "#EAF3DE", borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
                    <p style={{ fontSize: "0.78rem", color: "#27500A", lineHeight: 1.5 }}>
                      <strong>Initial payment</strong> covers deposit + prorated rent for the lease start month.
                      If the tenant has paid beyond that (e.g. paid 2 months), set "Paid until" below.
                    </p>
                  </div>
                  <label className="label">Paid until (optional — leave blank if only initial paid)</label>
                  <input
                    className="input"
                    type="date"
                    min={today}
                    value={paidUntil}
                    onChange={(e) => setPaidUntil(e.target.value)}
                  />
                  <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", marginTop: 4 }}>
                    Set this if tenant paid beyond the initial month. The system will track from this date forward.
                  </p>
                </div>
              )}

              {/* Summary */}
              <div style={{ background: "var(--lr-bg-page)", borderRadius: 10, padding: "14px 16px" }}>
                <p style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 10 }}>Summary</p>
                {[
                  { label: "Tenant",      value: fullName },
                  { label: "Unit",        value: `Unit ${selectedUnit?.unit_number} · ${selectedProperty?.name}` },
                  { label: "Lease start", value: leaseStart },
                  { label: "Deposit",     value: formatKES(depositAmount) },
                  { label: "Rent",        value: `${formatKES(selectedUnit?.rent_amount)}/month` },
                  { label: "Initial payment", value: hasPaidInitial ? "Recorded as paid" : "Pending" },
                  ...(hasPaidInitial && paidUntil ? [{ label: "Paid until", value: formatDate(paidUntil) }] : []),
                ].map((row) => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--lr-border)" }}>
                    <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>{row.label}</p>
                    <p style={{ fontSize: "0.78rem", fontWeight: 500, color: "var(--lr-text-primary)" }}>{row.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--lr-border)", display: "flex", gap: 10, flexShrink: 0 }}>
          {step > 0 && (
            <button
              className="btn-ghost"
              onClick={() => { setStep((s) => s - 1); setError(""); }}
              style={{ flexShrink: 0 }}
            >
              <ArrowLeft size={14} /> Back
            </button>
          )}
          <button
            className="btn-primary"
            onClick={handleNext}
            disabled={isPending}
            style={{ flex: 1, justifyContent: "center" }}
          >
            {isPending
              ? <><Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Adding tenant...</>
              : step === STEPS.length - 1
              ? <><CheckCircle size={14} /> Add tenant</>
              : <>Next <ArrowRight size={14} /></>
            }
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}