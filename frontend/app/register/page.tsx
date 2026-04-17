"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Home, Eye, EyeOff, ArrowRight, ArrowLeft,
  CheckCircle, Loader2, User, Building2,
  Phone, Mail, CreditCard, Users, Lock,
  AlertCircle, Check, X as XIcon, Clock,
    Search, FileText, Pen,
} from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { formatKES, formatDate } from "@/lib/utils";

// ── Reusable components (same as before) ─────
function PasswordStrength({ password, isLandlord }: { password: string; isLandlord: boolean }) {
  const checks = [
    { label: "At least 8 characters",               pass: password.length >= 8         },
    { label: "Contains a number",                    pass: /\d/.test(password)          },
    { label: "Contains a letter",                    pass: /[a-zA-Z]/.test(password)    },
    ...(isLandlord ? [
      { label: "Contains uppercase letter",          pass: /[A-Z]/.test(password)       },
      { label: "Contains special character (!@#$)", pass: /[!@#$%^&*]/.test(password)  },
      { label: "At least 10 characters",             pass: password.length >= 10        },
    ] : []),
  ];
  const passed   = checks.filter((c) => c.pass).length;
  const strength = passed / checks.length;
  const label    = strength < 0.4 ? "Weak" : strength < 0.7 ? "Fair" : strength < 1 ? "Good" : "Strong";
  const color    = strength < 0.4 ? "#A32D2D" : strength < 0.7 ? "#BA7517" : strength < 1 ? "#185FA5" : "#639922";
  if (!password) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, height: 4, background: "var(--lr-border)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${strength * 100}%`, background: color, borderRadius: 99, transition: "width 0.3s" }} />
        </div>
        <span style={{ fontSize: "0.72rem", fontWeight: 600, color, minWidth: 40 }}>{label}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {checks.map((c) => (
          <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 14, height: 14, borderRadius: "50%", background: c.pass ? "#EAF3DE" : "var(--lr-bg-page)", border: `1px solid ${c.pass ? "#5DCAA5" : "var(--lr-border)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {c.pass && <Check size={8} color="#639922" strokeWidth={3} />}
            </div>
            <span style={{ fontSize: "0.72rem", color: c.pass ? "#27500A" : "var(--lr-text-muted)" }}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepIndicator({ current, total, labels }: { current: number; total: number; labels: string[] }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 8 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: i < current ? "var(--lr-primary)" : i === current ? "var(--lr-primary)" : "var(--lr-border)", border: `2px solid ${i <= current ? "var(--lr-primary)" : "var(--lr-border)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}>
              {i < current
                ? <Check size={12} color="#fff" strokeWidth={2.5} />
                : <span style={{ fontSize: "0.68rem", fontWeight: 600, color: i === current ? "#fff" : "var(--lr-text-muted)" }}>{i + 1}</span>
              }
            </div>
            {i < total - 1 && <div style={{ width: 28, height: 2, background: i < current ? "var(--lr-primary)" : "var(--lr-border)", transition: "background 0.2s" }} />}
          </div>
        ))}
      </div>
      <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>
        Step {current + 1} of {total} — <span style={{ color: "var(--lr-primary)", fontWeight: 500 }}>{labels[current]}</span>
      </p>
    </div>
  );
}

function Field({ label, error, children, hint }: { label: string; error?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <label className="label">{label}</label>
      {children}
      {hint  && !error && <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", marginTop: 4 }}>{hint}</p>}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

function PasswordInput({ value, onChange, placeholder, name }: any) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input name={name} type={show ? "text" : "password"} placeholder={placeholder} className="input" style={{ paddingRight: 44 }} value={value} onChange={onChange} autoComplete="new-password" />
      <button type="button" onClick={() => setShow((v) => !v)} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 44, background: "none", border: "none", cursor: "pointer", color: "var(--lr-text-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

// ── Step 3: Unit selection ────────────────────
function UnitSelectionStep({ onSelect, tenantName }: {
  onSelect: (data: { landlordId: string; propertyId: string; unitId: string; landlordName: string; companyName: string; propertyName: string; unitNumber: string; rentAmount: string; }) => void;
  tenantName: string;
}) {
  const [companySearch, setCompanySearch] = useState("");
  const [searching,     setSearching]     = useState(false);
  const [landlords,     setLandlords]     = useState<any[]>([]);
  const [selectedLandlord, setSelectedLandlord] = useState<any>(null);
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [unitNumber,    setUnitNumber]    = useState("");
  const [checkingUnit,  setCheckingUnit]  = useState(false);
  const [unitResult,    setUnitResult]    = useState<any>(null);
  const [unitError,     setUnitError]     = useState("");
  const [error,         setError]         = useState("");
  const [vacantUnits,  setVacantUnits]  = useState<any[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);

  const handleSearch = async () => {
    if (companySearch.trim().length < 2) return setError("Enter at least 2 characters");
    setSearching(true); setError(""); setLandlords([]);
    try {
      const res = await api.get(`/api/auth/landlord-search/?company_name=${encodeURIComponent(companySearch)}`);
      setLandlords(res.data);
      if (res.data.length === 0) setError("No landlord found with that company name.");
    } catch {
      setError("No landlord found. Check the company name and try again.");
    } finally {
      setSearching(false);
    }
  };

  const handleProceed = () => {
  if (!unitResult || !selectedLandlord || !selectedProperty) return;
  onSelect({
    landlordId:   selectedLandlord.landlord_id,
    propertyId:   selectedProperty.id,
    unitId:       unitResult.id,
    landlordName: selectedLandlord.landlord_name,
    companyName:  selectedLandlord.company_name,
    propertyName: selectedProperty.name,
    unitNumber:   unitResult.unit_number,
    rentAmount:   unitResult.rent_amount,
  });
};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }} className="animate-fade-in">

      {error && (
        <div style={{ background: "#FCEBEB", borderRadius: 8, padding: "10px 14px", fontSize: "0.8rem", color: "#791F1F", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Step 1 — Verify landlord */}
      <div style={{ background: "var(--lr-bg-page)", borderRadius: 12, padding: "16px" }}>
        <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 20, height: 20, borderRadius: "50%", background: selectedLandlord ? "var(--lr-primary)" : "var(--lr-border)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, color: selectedLandlord ? "#fff" : "var(--lr-text-muted)", flexShrink: 0 }}>
            {selectedLandlord ? <Check size={10} color="#fff" strokeWidth={3} /> : "1"}
          </span>
          Verify your landlord
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            placeholder="Enter company / business name"
            value={companySearch}
            onChange={(e) => setCompanySearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            style={{ flex: 1 }}
          />
          <button className="btn-primary" onClick={handleSearch} disabled={searching} style={{ flexShrink: 0, padding: "10px 14px" }}>
            {searching ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : <Search size={14} />}
          </button>
        </div>

        {/* Landlord results */}
        {landlords.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {landlords.map((l) => (
              <div
                key={l.landlord_id}
                onClick={() => { setSelectedLandlord(l); setSelectedProperty(null); setUnitResult(null); setError(""); }}
                style={{ padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${selectedLandlord?.landlord_id === l.landlord_id ? "var(--lr-primary)" : "var(--lr-border)"}`, background: selectedLandlord?.landlord_id === l.landlord_id ? "var(--lr-primary-light)" : "#fff", cursor: "pointer", transition: "all 0.15s" }}
              >
                <p style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--lr-text-primary)", marginBottom: 2 }}>{l.company_name}</p>
                <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>{l.landlord_name} · {l.properties?.length || 0} properties</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Step 2 — Select property */}
      {selectedLandlord && (
        <div style={{ background: "var(--lr-bg-page)", borderRadius: 12, padding: "16px" }} className="animate-fade-in">
          <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", background: selectedProperty ? "var(--lr-primary)" : "var(--lr-border)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, color: selectedProperty ? "#fff" : "var(--lr-text-muted)", flexShrink: 0 }}>
              {selectedProperty ? <Check size={10} color="#fff" strokeWidth={3} /> : "2"}
            </span>
            Select property
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(selectedLandlord.properties || []).map((p: any) => (
              <div
                key={p.id}
                onClick={() => {
                  setSelectedProperty(p);
                  setUnitResult(null);
                  setUnitError("");
                  // Auto-fetch vacant units for this property
                  setLoadingUnits(true);
                  setVacantUnits([]);
                  api.get(`/api/properties/${p.id}/vacant-units/`)
                   .then((res) => {
                   const units = res.data?.results || res.data || [];
                   setVacantUnits(units);
              })
                  .catch(() => setUnitError("Could not load units."))
                  .finally(() => setLoadingUnits(false));
            }}
                style={{ padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${selectedProperty?.id === p.id ? "var(--lr-primary)" : "var(--lr-border)"}`, background: selectedProperty?.id === p.id ? "var(--lr-primary-light)" : "#fff", cursor: "pointer", transition: "all 0.15s" }}
              >
                <p style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--lr-text-primary)", marginBottom: 2 }}>{p.name}</p>
                <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>{p.address}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 3 — Enter unit number */}
      {/* Step 3 — Pick from vacant units */}
{selectedProperty && (
  <div style={{ background: "var(--lr-bg-page)", borderRadius: 12, padding: "16px" }} className="animate-fade-in">
    <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 20, height: 20, borderRadius: "50%", background: unitResult ? "var(--lr-primary)" : "var(--lr-border)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, color: unitResult ? "#fff" : "var(--lr-text-muted)", flexShrink: 0 }}>
        {unitResult ? <Check size={10} color="#fff" strokeWidth={3} /> : "3"}
      </span>
      Select your unit
    </p>

    {loadingUnits ? (
      <div style={{ textAlign: "center", padding: "16px 0", color: "var(--lr-text-muted)", fontSize: "0.8rem" }}>
        <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite", margin: "0 auto 6px", display: "block" }} />
        Loading available units...
      </div>
    ) : vacantUnits.length === 0 ? (
      <div style={{ textAlign: "center", padding: "16px 0" }}>
        <p style={{ fontSize: "0.8rem", color: "var(--lr-danger)" }}>No vacant units in this property.</p>
        <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)", marginTop: 4 }}>Please contact your landlord or select a different property.</p>
      </div>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {vacantUnits.map((u: any) => (
          <div
            key={u.id}
            onClick={() => setUnitResult(u)}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: `1.5px solid ${unitResult?.id === u.id ? "var(--lr-primary)" : "var(--lr-border)"}`,
              background: unitResult?.id === u.id ? "var(--lr-primary-light)" : "#fff",
              cursor: "pointer",
              transition: "all 0.15s",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <p style={{ fontSize: "0.875rem", fontWeight: 600, color: unitResult?.id === u.id ? "var(--lr-primary)" : "var(--lr-text-primary)", marginBottom: 2 }}>
                Unit {u.unit_number}
              </p>
              <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>
                {u.unit_type?.replace("_", " ")}
                {u.block_name ? ` · ${u.block_name}` : ""}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: "0.875rem", fontWeight: 700, color: unitResult?.id === u.id ? "var(--lr-primary)" : "var(--lr-text-primary)" }}>
                {formatKES(u.rent_amount)}
              </p>
              <p style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)" }}>per month</p>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}

      {/* Proceed button */}
      {unitResult && (
        <button className="btn-primary animate-slide-up" onClick={handleProceed} style={{ width: "100%", justifyContent: "center" }}>
          <ArrowRight size={15} /> Proceed to agreement
        </button>
      )}
    </div>
  );
}

// ── Step 4: Digital agreement ─────────────────
function AgreementStep({ data, onSign }: {
  data: {
    landlordName: string; companyName: string;
    propertyName: string; unitNumber: string;
    rentAmount: string; tenantName: string;
    tenantPhone: string; leaseStart: string;
    depositAmount: string;
  };
  onSign: (signedName: string, leaseStart: string, deposit: string) => void;
}) {
  const [signedName,   setSignedName]   = useState("");
  const [leaseStart,   setLeaseStart]   = useState(data.leaseStart);
  const [depositAmount, setDepositAmount] = useState(data.depositAmount || data.rentAmount);
  const [agreed,       setAgreed]       = useState(false);
  const [error,        setError]        = useState("");

  const handleSign = () => {
    if (!signedName.trim()) return setError("Please type your full name to sign.");
    if (signedName.trim().toLowerCase() !== data.tenantName.trim().toLowerCase())
      return setError("Signed name must match your registered full name exactly.");
    if (!leaseStart) return setError("Please select a lease start date.");
    if (!agreed) return setError("Please confirm you have read and agree to the agreement.");
    onSign(signedName, leaseStart, depositAmount);
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="animate-fade-in">

      {/* Agreement document */}
      <div style={{ background: "#fff", border: "1px solid var(--lr-border)", borderRadius: 12, padding: "20px", fontSize: "0.8rem", color: "var(--lr-text-secondary)", lineHeight: 1.8, maxHeight: 280, overflowY: "auto" }}>
        <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "0.95rem", fontWeight: 700, color: "var(--lr-text-primary)", textAlign: "center", marginBottom: 16 }}>
          TENANCY AGREEMENT
        </p>
        <p><strong>Property:</strong> {data.propertyName}</p>
        <p><strong>Unit:</strong> {data.unitNumber}</p>
        <p><strong>Landlord:</strong> {data.landlordName} — {data.companyName}</p>
        <p><strong>Tenant:</strong> {data.tenantName}</p>
        <p><strong>Tenant phone:</strong> {data.tenantPhone}</p>
        <div style={{ margin: "12px 0", height: 1, background: "var(--lr-border)" }} />
        <p style={{ marginBottom: 8 }}>This tenancy agreement is entered into between the landlord and tenant named above for the rental of the specified unit under the following terms:</p>
        <p>1. The monthly rent is <strong>{formatKES(data.rentAmount)}</strong> payable in advance on or before the agreed due date each month.</p>
        <p>2. A refundable security deposit of <strong>{formatKES(depositAmount || data.rentAmount)}</strong> is required before move-in.</p>
        <p>3. The tenancy commences on the lease start date selected below.</p>
        <p>4. Rent payments shall be made via the LumidahRentals platform using M-Pesa, card, or bank transfer.</p>
        <p>5. The tenant agrees to maintain the unit in good condition and report maintenance issues promptly.</p>
        <p>6. Either party may terminate this agreement with 30 days written notice.</p>
        <p>7. This agreement is governed by the laws of the Republic of Kenya.</p>
        <div style={{ margin: "12px 0", height: 1, background: "var(--lr-border)" }} />
        <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>
          By signing below, the tenant confirms they have read, understood, and agree to all terms of this tenancy agreement.
        </p>
      </div>

      {/* Editable fields */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Lease start date *">
          <input className="input" type="date" min={today} value={leaseStart} onChange={(e) => setLeaseStart(e.target.value)} />
        </Field>
        <Field label="Security deposit (KES)" hint="Usually equal to one month's rent">
          <input className="input" type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
        </Field>
      </div>

      {error && (
        <div style={{ background: "#FCEBEB", borderRadius: 8, padding: "10px 14px", fontSize: "0.8rem", color: "#791F1F", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Digital signature */}
      <Field label="Digital signature — type your full name *" hint={`Must match: ${data.tenantName}`}>
        <div style={{ position: "relative" }}>
          <Pen size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--lr-text-muted)", pointerEvents: "none" }} />
          <input
            className="input"
            placeholder={`Type "${data.tenantName}" to sign`}
            value={signedName}
            onChange={(e) => { setSignedName(e.target.value); setError(""); }}
            style={{ paddingLeft: 34, fontStyle: "italic" }}
          />
        </div>
      </Field>

      {/* Agreement checkbox */}
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
        <div
          onClick={() => setAgreed((v) => !v)}
          style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${agreed ? "var(--lr-primary)" : "var(--lr-border)"}`, background: agreed ? "var(--lr-primary)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", marginTop: 1 }}
        >
          {agreed && <Check size={11} color="#fff" strokeWidth={3} />}
        </div>
        <span style={{ fontSize: "0.78rem", color: "var(--lr-text-secondary)", lineHeight: 1.5 }}>
          I confirm I have read and fully understand the tenancy agreement above, and I agree to all its terms and conditions.
        </span>
      </label>

      <button
        className="btn-primary"
        onClick={handleSign}
        disabled={!signedName || !agreed}
        style={{ width: "100%", justifyContent: "center" }}
      >
        <FileText size={15} /> Sign agreement & continue
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════
// TENANT REGISTRATION — 5 step wizard
// ══════════════════════════════════════════════
function TenantRegistration({ onSuccess, resume }: { onSuccess: () => void; resume?: boolean }) {
  const existingUser = useAuthStore((s) => s.user);
  // If resuming (already logged in), jump straight to unit selection (step 2)
  const [step,    setStep]    = useState(resume && existingUser ? 2 : 0);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  // Step 1 data — pre-fill from existing user if resuming
  const [fullName,   setFullName]   = useState(existingUser?.full_name || "");
  const [phone,      setPhone]      = useState(existingUser?.phone || "");
  const [email,      setEmail]      = useState(existingUser?.email || "");
  const [nationalId, setNationalId] = useState("");

  // Step 2 data
  const [kinName,  setKinName]  = useState("");
  const [kinRel,   setKinRel]   = useState("");
  const [kinPhone, setKinPhone] = useState("");
  const [kinEmail, setKinEmail] = useState("");

  // Step 3 data — unit selection
  const [unitData, setUnitData] = useState<any>(null);

  // Step 4 data — agreement
  const [agreementData, setAgreementData] = useState<{
    signedName: string; leaseStart: string; depositAmount: string;
  } | null>(null);

  // Step 5 data — password
  const [password,   setPassword]   = useState("");
  const [confirm,    setConfirm]    = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  const login  = useAuthStore((s) => s.login);
  const router = useRouter();

  const stepLabels = ["Personal info", "Next of kin", "Select unit", "Sign agreement", "Set password"];

  const validateStep = () => {
    setError("");
    if (step === 0) {
      if (!fullName.trim())   return setError("Full name is required"), false;
      if (!phone.trim())      return setError("Phone number is required"), false;
      if (!nationalId.trim()) return setError("National ID is required"), false;
    }
    if (step === 1) {
      if (!kinName.trim())  return setError("Next of kin name is required"), false;
      if (!kinRel.trim())   return setError("Relationship is required"), false;
      if (!kinPhone.trim()) return setError("Next of kin phone is required"), false;
    }
    if (step === 4) {
      if (password.length < 8)  return setError("Password must be at least 8 characters"), false;
      if (password !== confirm)  return setError("Passwords do not match"), false;
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    // Steps 3 and 4 handle their own navigation
    if (step === 0 || step === 1) setStep((s) => s + 1);
    if (step === 4) handleSubmit();
  };

  const handleUnitSelected = (data: any) => {
    setUnitData(data);
    setStep(3);
  };

  const handleAgreementSigned = (signedName: string, leaseStart: string, depositAmount: string) => {
    setAgreementData({ signedName, leaseStart, depositAmount });
    setStep(4);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      if (!resume) {
        // Step 1: Register user account
        // If phone is already taken we get a 400 — catch it below
        try {
          await api.post("/api/auth/register/tenant/", {
            full_name:        fullName,
            phone,
            email:            email || undefined,
            national_id:      nationalId,
            password,
            kin_name:         kinName,
            kin_relationship: kinRel,
            kin_phone:        kinPhone,
            kin_email:        kinEmail || undefined,
          });
        } catch (regErr: any) {
          const d = regErr.response?.data;
          // If the phone is already registered that means a previous attempt
          // created the account but failed at tenancy creation.
          // Log the user in and continue to tenancy creation.
          if (!d?.phone && !d?.full_name) throw regErr;
          // else: account already exists — fall through to login
        }

        // Step 2: Login to get token
        await login(fullName, password, rememberMe);
      }

      // Step 3: Create tenancy + agreement
      if (unitData && agreementData) {
        try {
          await api.post("/api/tenancies/create/", {
            unit_id:          unitData.unitId,
            deposit_amount:   agreementData.depositAmount,
            lease_start_date: agreementData.leaseStart,
            signed_name:      agreementData.signedName,
          });
        } catch (tenancyErr: any) {
          const d = tenancyErr.response?.data;
          const detail = d?.unit_id || d?.detail || d?.non_field_errors?.[0];
          if (detail?.includes("no longer available") || detail?.includes("unique")) {
            setError("That unit is no longer available. Please go back to step 3 and select a different unit.");
            setStep(2); // send back to unit selection
          } else {
            setError(detail || "Failed to create tenancy. Please try again.");
            setStep(2);
          }
          return;
        }
      }

      onSuccess();
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.full_name)  setError("A user with this name already exists.");
      else if (data?.phone) setError("This phone number is already registered. Please log in instead.");
      else                  setError(data?.detail || "Registration failed. Please try again.");
      setStep(4);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <StepIndicator current={step} total={5} labels={stepLabels} />

      {error && (
        <div className="animate-slide-up" style={{ background: "#FCEBEB", border: "1px solid rgba(162,45,45,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", color: "#791F1F" }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Step 0 */}
      {step === 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="animate-fade-in">
          <Field label="Full name *"><input className="input" placeholder="e.g. John Kamau" value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
          <Field label="Phone number *" hint="Used for M-Pesa payments"><input className="input" type="tel" placeholder="e.g. 0712345678" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Email address" hint="Optional but very important for account recovery and receipts"><input className="input" type="email" placeholder="john@email.com" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="National ID number *"><input className="input" placeholder="e.g. 12345678" value={nationalId} onChange={(e) => setNationalId(e.target.value)} /></Field>
        </div>
      )}

      {/* Step 1 */}
      {step === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="animate-fade-in">
          <div style={{ background: "var(--lr-primary-light)", borderRadius: 10, padding: "10px 14px", fontSize: "0.78rem", color: "var(--lr-primary-dark)", lineHeight: 1.6 }}>
            Next of kin details are required for emergency contact purposes.
          </div>
          <Field label="Full name *"><input className="input" placeholder="e.g. Mary Kamau" value={kinName} onChange={(e) => setKinName(e.target.value)} /></Field>
          <Field label="Relationship *">
            <select className="input" value={kinRel} onChange={(e) => setKinRel(e.target.value)} style={{ appearance: "none" }}>
              <option value="">Select relationship</option>
              {["Parent","Sibling","Spouse","Child","Relative","Friend","Other"].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Phone number *"><input className="input" type="tel" placeholder="e.g. 0798765432" value={kinPhone} onChange={(e) => setKinPhone(e.target.value)} /></Field>
          <Field label="Email address" hint="Optional"><input className="input" type="email" placeholder="mary@email.com" value={kinEmail} onChange={(e) => setKinEmail(e.target.value)} /></Field>
        </div>
      )}

      {/* Step 2 — Unit selection (handles own navigation) */}
      {step === 2 && (
        <UnitSelectionStep
          onSelect={handleUnitSelected}
          tenantName={fullName}
        />
      )}

      {/* Step 3 — Agreement (handles own navigation) */}
      {step === 3 && unitData && (
        <AgreementStep
          data={{
            landlordName: unitData.landlordName,
            companyName:  unitData.companyName,
            propertyName: unitData.propertyName,
            unitNumber:   unitData.unitNumber,
            rentAmount:   unitData.rentAmount,
            tenantName:   fullName,
            tenantPhone:  phone,
            leaseStart:   new Date(Date.now() + 86400000).toISOString().split("T")[0],
            depositAmount: unitData.rentAmount,
          }}
          onSign={handleAgreementSigned}
        />
      )}

      {/* Step 4 — Password */}
      {step === 4 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="animate-fade-in">
          {/* Summary of what was selected */}
          {unitData && (
            <div style={{ background: "var(--lr-primary-light)", borderRadius: 10, padding: "12px 14px" }}>
              <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--lr-primary-dark)", marginBottom: 6 }}>Almost done!</p>
              <p style={{ fontSize: "0.8rem", color: "var(--lr-primary-dark)" }}>
                {unitData.propertyName} · Unit {unitData.unitNumber} · {formatKES(unitData.rentAmount)}/month
              </p>
              <p style={{ fontSize: "0.75rem", color: "var(--lr-primary)", marginTop: 2 }}>
                Lease starts: {agreementData?.leaseStart}
              </p>
            </div>
          )}
          <Field label="Create password *" hint="Minimum 8 characters">
            <PasswordInput name="password" value={password} onChange={(e: any) => setPassword(e.target.value)} placeholder="Create a password" />
            <PasswordStrength password={password} isLandlord={false} />
          </Field>
          <Field label="Confirm password *">
            <PasswordInput name="confirm" value={confirm} onChange={(e: any) => setConfirm(e.target.value)} placeholder="Repeat your password" />
            {confirm && password !== confirm && <p style={{ fontSize: "0.72rem", color: "var(--lr-danger)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}><XIcon size={11} /> Passwords do not match</p>}
            {confirm && password === confirm && confirm.length > 0 && <p style={{ fontSize: "0.72rem", color: "#639922", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}><Check size={11} /> Passwords match</p>}
          </Field>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <div onClick={() => setRememberMe((v) => !v)} style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${rememberMe ? "var(--lr-primary)" : "var(--lr-border)"}`, background: rememberMe ? "var(--lr-primary)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}>
              {rememberMe && <Check size={11} color="#fff" strokeWidth={3} />}
            </div>
            <span style={{ fontSize: "0.82rem", color: "var(--lr-text-secondary)" }}>Remember me on this device</span>
          </label>
        </div>
      )}

      {/* Navigation buttons — only for steps 0, 1, 4 */}
      {(step === 0 || step === 1 || step === 4) && (
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          {step > 0 && (
            <button className="btn-ghost" onClick={() => { setStep((s) => s - 1); setError(""); }} style={{ flex: "0 0 auto" }}>
              <ArrowLeft size={15} /> Back
            </button>
          )}
          <button className="btn-primary" onClick={handleNext} disabled={loading} style={{ flex: 1, justifyContent: "center" }}>
            {loading
              ? <><Loader2 size={15} style={{ animation: "spin 0.8s linear infinite" }} /> Creating account...</>
              : step === 4
              ? <><CheckCircle size={15} /> Create account</>
              : <>Next <ArrowRight size={15} /></>
            }
          </button>
        </div>
      )}

      {/* Back button for steps 2 and 3 */}
      {(step === 2 || step === 3) && (
        <button className="btn-ghost" onClick={() => setStep((s) => s - 1)} style={{ marginTop: 12, width: "100%", justifyContent: "center" }}>
          <ArrowLeft size={15} /> Back
        </button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// REST OF THE PAGE (landlord + success screens)
// Keep exact same LandlordRegistration, PendingApproval,
// RegistrationSuccess, ForgotPassword, and main RegisterPage
// components from the previous version — they are unchanged.
// ══════════════════════════════════════════════

// ══════════════════════════════════════════════
// LANDLORD REGISTRATION — 2 step wizard
// ══════════════════════════════════════════════
function LandlordRegistration({ onPending }: { onPending: (name: string) => void }) {
  const [step, setStep]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  // Step 1 — Personal + company
  const [fullName,     setFullName]     = useState("");
  const [phone,        setPhone]        = useState("");
  const [email,        setEmail]        = useState("");
  const [companyName,  setCompanyName]  = useState("");
  const [kraPin,       setKraPin]       = useState("");

  // Step 2 — Password
  const [password,     setPassword]     = useState("");
  const [confirm,      setConfirm]      = useState("");

  const stepLabels = ["Business details", "Secure password"];

  const isPasswordStrong = (p: string) =>
    p.length >= 10 && /[A-Z]/.test(p) && /[0-9]/.test(p) && /[!@#$%^&*]/.test(p);

  const validateStep = () => {
    setError("");
    if (step === 0) {
      if (!fullName.trim())    return setError("Full name is required"), false;
      if (!phone.trim())       return setError("Phone number is required"), false;
      if (!companyName.trim()) return setError("Company / business name is required"), false;
    }
    if (step === 1) {
      if (!isPasswordStrong(password)) return setError("Password does not meet the strength requirements."), false;
      if (password !== confirm)        return setError("Passwords do not match."), false;
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    if (step < 1) { setStep((s) => s + 1); return; }
    handleSubmit();
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      await api.post("/api/auth/register/landlord/", {
        full_name:    fullName,
        phone,
        email:        email || undefined,
        password,
        company_name: companyName,
        kra_pin:      kraPin || undefined,
      });
      onPending(fullName);
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.full_name) setError("A user with this name already exists.");
      else if (data?.phone) setError("This phone number is already registered.");
      else setError(data?.detail || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <StepIndicator current={step} total={2} labels={stepLabels} />

      {error && (
        <div className="animate-slide-up" style={{ background: "#FCEBEB", border: "1px solid rgba(162,45,45,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", color: "#791F1F" }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Step 0 — Business details */}
      {step === 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="animate-fade-in">
          <Field label="Full name *">
            <input className="input" placeholder="e.g. James Mwangi" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Phone number *" hint="Your primary contact number">
            <input className="input" type="tel" placeholder="e.g. 0722000001" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Email address" hint="Recommended — used for important notifications">
            <input className="input" type="email" placeholder="james@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Company / business name *" hint="This is how tenants will find you">
            <input className="input" placeholder="e.g. Mwangi Properties Ltd" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </Field>
          <Field label="KRA PIN" hint="Optional — required for official receipts">
            <input className="input" placeholder="e.g. A123456789Z" value={kraPin} onChange={(e) => setKraPin(e.target.value)} />
          </Field>
        </div>
      )}

      {/* Step 1 — Password */}
      {step === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="animate-fade-in">
          <div style={{ background: "#FAEEDA", border: "1px solid rgba(186,117,23,0.2)", borderRadius: 10, padding: "12px 14px", fontSize: "0.8rem", color: "#633806", lineHeight: 1.6 }}>
            As a landlord managing financial data, your account requires a strong password to protect your tenants and property information.
          </div>
          <Field label="Create password *">
            <PasswordInput name="password" value={password} onChange={(e: any) => setPassword(e.target.value)} placeholder="Create a strong password" />
            <PasswordStrength password={password} isLandlord={true} />
          </Field>
          <Field label="Confirm password *">
            <PasswordInput name="confirm" value={confirm} onChange={(e: any) => setConfirm(e.target.value)} placeholder="Repeat your password" />
            {confirm && password !== confirm && (
              <p style={{ fontSize: "0.72rem", color: "var(--lr-danger)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                <XIcon size={11} /> Passwords do not match
              </p>
            )}
            {confirm && password === confirm && confirm.length > 0 && (
              <p style={{ fontSize: "0.72rem", color: "#639922", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                <Check size={11} /> Passwords match
              </p>
            )}
          </Field>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
        {step > 0 && (
          <button className="btn-ghost" onClick={() => { setStep((s) => s - 1); setError(""); }} style={{ flex: "0 0 auto" }}>
            <ArrowLeft size={15} /> Back
          </button>
        )}
        <button className="btn-primary" onClick={handleNext} disabled={loading} style={{ flex: 1, justifyContent: "center" }}>
          {loading
            ? <><Loader2 size={15} style={{ animation: "spin 0.8s linear infinite" }} /> Submitting...</>
            : step === 1
            ? <><CheckCircle size={15} /> Submit for approval</>
            : <>Next <ArrowRight size={15} /></>
          }
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// PENDING APPROVAL SCREEN
// ══════════════════════════════════════════════
function PendingApproval({ name }: { name: string }) {
  return (
    <div style={{ textAlign: "center", padding: "8px 0" }} className="animate-fade-in">
      <div style={{ width: 64, height: 64, background: "#FAEEDA", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
        <Clock size={28} color="#BA7517" />
      </div>
      <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.4rem", fontWeight: 700, color: "var(--lr-text-primary)", marginBottom: 8 }}>
        Application submitted
      </h2>
      <p style={{ fontSize: "0.875rem", color: "var(--lr-text-muted)", marginBottom: 24, lineHeight: 1.7 }}>
        Thank you, <strong>{name}</strong>. Your landlord account is under review. Our team will verify your details and approve your account within <strong>24–48 hours</strong>.
      </p>
      <div style={{ background: "var(--lr-bg-page)", borderRadius: 12, padding: "16px 20px", marginBottom: 24, textAlign: "left" }}>
        <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 12 }}>What happens next</p>
        {[
          "Your details are reviewed by our team",
          "You receive a notification once approved",
          "Log in and start adding your properties",
        ].map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--lr-primary-light)", border: "1px solid var(--lr-mint)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
              <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--lr-primary)" }}>{i + 1}</span>
            </div>
            <p style={{ fontSize: "0.82rem", color: "var(--lr-text-secondary)", lineHeight: 1.5 }}>{step}</p>
          </div>
        ))}
      </div>
      <Link href="/login" className="btn-primary" style={{ textDecoration: "none", display: "inline-flex", justifyContent: "center", width: "100%" }}>
        Back to login
      </Link>
    </div>
  );
}

// ══════════════════════════════════════════════
// SUCCESS SCREEN — tenant
// ══════════════════════════════════════════════
function RegistrationSuccess({ name }: { name: string }) {
  const router = useRouter();
  return (
    <div style={{ textAlign: "center", padding: "8px 0" }} className="animate-fade-in">
      <div style={{ width: 64, height: 64, background: "#EAF3DE", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
        <CheckCircle size={28} color="#639922" />
      </div>
      <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.4rem", fontWeight: 700, color: "var(--lr-text-primary)", marginBottom: 8 }}>
        Welcome to LumidahRentals!
      </h2>
      <p style={{ fontSize: "0.875rem", color: "var(--lr-text-muted)", marginBottom: 24, lineHeight: 1.7 }}>
        Your account is ready, <strong>{name}</strong>. You're being redirected to your dashboard.
      </p>
      <Loader2 size={20} color="var(--lr-primary)" style={{ animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
    </div>
  );
}

// ══════════════════════════════════════════════
// FORGOT PASSWORD
// ══════════════════════════════════════════════
function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [phone,   setPhone]   = useState("");
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");

  // Since we don't have OTP, we do a name-based reset for now
  // In production this would send an SMS OTP
  const handleReset = async () => {
    if (!phone.trim()) return setError("Phone number is required");
    if (newPass.length < 8) return setError("Password must be at least 8 characters");
    if (newPass !== confirm) return setError("Passwords do not match");

    setLoading(true);
    setError("");
    try {
      // This endpoint would be built out with OTP in production
      // For now shows a success message directing to admin contact
      await new Promise((r) => setTimeout(r, 1000));
      setSuccess("Password reset request sent. Please contact support if you need immediate assistance.");
    } catch {
      setError("Unable to process request. Please contact support.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.4rem", fontWeight: 700, color: "var(--lr-text-primary)", marginBottom: 6 }}>
          Reset password
        </h2>
        <p style={{ fontSize: "0.875rem", color: "var(--lr-text-muted)" }}>
          Enter your registered phone number and new password
        </p>
      </div>

      {error && (
        <div style={{ background: "#FCEBEB", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: "0.8rem", color: "#791F1F", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {success ? (
        <div style={{ textAlign: "center", padding: "16px 0" }}>
          <CheckCircle size={40} color="#639922" style={{ margin: "0 auto 12px", display: "block" }} />
          <p style={{ fontSize: "0.875rem", color: "var(--lr-text-secondary)", marginBottom: 20, lineHeight: 1.6 }}>{success}</p>
          <button className="btn-primary" onClick={onBack} style={{ width: "100%", justifyContent: "center" }}>
            Back to login
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Registered phone number *">
            <input className="input" type="tel" placeholder="e.g. 0712345678" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="New password *">
            <PasswordInput name="new-password" value={newPass} onChange={(e: any) => setNewPass(e.target.value)} placeholder="Enter new password" />
            <PasswordStrength password={newPass} isLandlord={false} />
          </Field>
          <Field label="Confirm new password *">
            <PasswordInput name="confirm-password" value={confirm} onChange={(e: any) => setConfirm(e.target.value)} placeholder="Repeat new password" />
          </Field>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-ghost" onClick={onBack}>
              <ArrowLeft size={14} /> Back
            </button>
            <button className="btn-primary" onClick={handleReset} disabled={loading} style={{ flex: 1, justifyContent: "center" }}>
              {loading ? <><Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Processing...</> : "Reset password"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// MAIN REGISTER PAGE
// ══════════════════════════════════════════════
export default function RegisterPage() {
  const router = useRouter();
  const searchParams = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : null;
  const isResume = searchParams?.get("resume") === "1";

  const [role,         setRole]         = useState<"tenant" | "landlord">("tenant");
  const [screen,       setScreen]       = useState<"register" | "pending" | "success" | "forgot">("register");
  const [pendingName,  setPendingName]  = useState("");
  const [successName,  setSuccessName]  = useState("");

  const handleTenantSuccess = () => {
    const name = useAuthStore.getState().user?.full_name || "";
    setSuccessName(name);
    setScreen("success");
    setTimeout(() => router.push("/tenant/dashboard"), 2000);
  };

  const handleLandlordPending = (name: string) => {
    setPendingName(name);
    setScreen("pending");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "var(--lr-bg-page)" }}>

      {/* Left panel */}
      <div style={{ display: "none", width: "42%", background: "linear-gradient(150deg, #0F6E56 0%, #085041 60%, #063D30 100%)", flexDirection: "column", justifyContent: "space-between", padding: "48px" }} className="reg-left">
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 36, height: 36, background: "rgba(255,255,255,0.15)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.2)" }}>
            <Home size={18} color="#fff" />
          </div>
          <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, color: "#fff", fontSize: "1.1rem" }}>LumidahRentals</span>
        </div>

        {/* Content */}
        <div>
          <h1 style={{ fontFamily: "'Sora', sans-serif", fontSize: "2rem", fontWeight: 700, color: "#fff", lineHeight: 1.25, letterSpacing: "-0.03em", marginBottom: 16 }}>
            {role === "tenant"
              ? "Find your home.\nPay rent online."
              : "Manage your\nproperties smarter."
            }
          </h1>
          <p style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.65)", lineHeight: 1.7, marginBottom: 32 }}>
            {role === "tenant"
              ? "Pay rent via M-Pesa or card, get instant receipts, and track every payment — all from your phone."
              : "Track payments, manage tenants, and get real-time insights across all your properties."
            }
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(role === "tenant"
              ? ["M-Pesa payments", "Instant receipts", "Maintenance requests", "Digital agreements"]
              : ["Payment tracking", "Tenant management", "Monthly reports", "Multi-property support"]
            ).map((f) => (
              <span key={f} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 99, fontSize: "0.78rem", color: "rgba(255,255,255,0.8)" }}>{f}</span>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>
          © {new Date().getFullYear()} LumidahRentals · Kenya
        </p>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
        <div style={{ width: "100%", maxWidth: 460 }}>

          {/* Mobile logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 32 }} className="mobile-logo">
            <div style={{ width: 30, height: 30, background: "var(--lr-primary)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Home size={15} color="#fff" />
            </div>
            <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, color: "var(--lr-primary)", fontSize: "0.95rem" }}>LumidahRentals</span>
          </div>

          {screen === "forgot" ? (
            <ForgotPassword onBack={() => setScreen("register")} />
          ) : screen === "pending" ? (
            <PendingApproval name={pendingName} />
          ) : screen === "success" ? (
            <RegistrationSuccess name={successName} />
          ) : (
            <>
              {/* Header */}
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.6rem", fontWeight: 700, color: "var(--lr-text-primary)", letterSpacing: "-0.03em", marginBottom: 6 }}>
                  {isResume ? "Complete your setup" : "Create your account"}
                </h2>
                <p style={{ fontSize: "0.875rem", color: "var(--lr-text-muted)" }}>
                  {isResume
                    ? "Select your unit and sign the tenancy agreement to get started."
                    : <>Already have an account?{" "}<Link href="/login" style={{ color: "var(--lr-primary)", fontWeight: 500, textDecoration: "none" }}>Sign in</Link></>
                  }
                </p>
              </div>

              {/* Role selector — hidden when resuming */}
              {!isResume && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 28 }}>
                {[
                  { value: "tenant",   label: "I'm a tenant",   icon: <User size={18} />,     desc: "Looking to rent a unit"       },
                  { value: "landlord", label: "I'm a landlord",  icon: <Building2 size={18} />, desc: "I own / manage properties"   },
                ].map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setRole(r.value as any)}
                    style={{
                      padding: "14px 12px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                      border: `2px solid ${role === r.value ? "var(--lr-primary)" : "var(--lr-border)"}`,
                      background: role === r.value ? "var(--lr-primary-light)" : "#fff",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ color: role === r.value ? "var(--lr-primary)" : "var(--lr-text-muted)", marginBottom: 6 }}>{r.icon}</div>
                    <p style={{ fontSize: "0.82rem", fontWeight: 600, color: role === r.value ? "var(--lr-primary)" : "var(--lr-text-primary)", marginBottom: 2 }}>{r.label}</p>
                    <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>{r.desc}</p>
                  </button>
                ))}
              </div>}

              {/* Form */}
              {role === "tenant"
                ? <TenantRegistration onSuccess={handleTenantSuccess} resume={isResume} />
                : <LandlordRegistration onPending={handleLandlordPending} />
              }

              {/* Forgot password link */}
              <div style={{ textAlign: "center", marginTop: 20 }}>
                <button onClick={() => setScreen("forgot")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.82rem", color: "var(--lr-text-muted)", textDecoration: "underline" }}>
                  Forgot your password?
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (min-width: 1024px) {
          .reg-left    { display: flex !important; }
          .mobile-logo { display: none !important; }
        }
      `}</style>
    </div>
  );
}