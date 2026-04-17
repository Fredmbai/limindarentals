"use client";

import { useState } from "react";
import {
  X, Search, Loader2, CheckCircle,
  ArrowRight, Check, FileText, Pen, AlertCircle,
} from "lucide-react";
import api from "@/lib/api";
import { formatKES, formatDate } from "@/lib/utils";

export function AddRentalUnitModal({ onClose, onSuccess, tenantName }: {
  onClose:    () => void;
  onSuccess:  () => void;
  tenantName: string;
}) {
  const [step,           setStep]           = useState(0);
  const [companySearch,  setCompanySearch]  = useState("");
  const [searching,      setSearching]      = useState(false);
  const [landlords,      setLandlords]      = useState<any[]>([]);
  const [selectedLandlord, setSelectedLandlord] = useState<any>(null);
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [vacantUnits,    setVacantUnits]    = useState<any[]>([]);
  const [loadingUnits,   setLoadingUnits]   = useState(false);
  const [selectedUnit,   setSelectedUnit]   = useState<any>(null);
  const [leaseStart,     setLeaseStart]     = useState(new Date().toISOString().split("T")[0]);
  const [depositAmount,  setDepositAmount]  = useState("");
  const [signedName,     setSignedName]     = useState("");
  const [agreed,         setAgreed]         = useState(false);
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState("");

  const today = new Date().toISOString().split("T")[0];

  const handleSearch = async () => {
    if (companySearch.trim().length < 2) return setError("Enter at least 2 characters");
    setSearching(true); setError(""); setLandlords([]);
    try {
      const res = await api.get(`/api/auth/landlord-search/?company_name=${encodeURIComponent(companySearch)}`);
      setLandlords(res.data);
      if (!res.data.length) setError("No landlord found with that name.");
    } catch {
      setError("No landlord found. Check the name and try again.");
    } finally {
      setSearching(false);
    }
  };

  const handleSelectProperty = async (p: any) => {
    setSelectedProperty(p);
    setSelectedUnit(null);
    setLoadingUnits(true);
    try {
      const res   = await api.get(`/api/properties/${p.id}/vacant-units/`);
      const units = res.data?.results || res.data || [];
      setVacantUnits(units);
    } catch {
      setError("Could not load units.");
    } finally {
      setLoadingUnits(false);
    }
  };

  const handleSubmit = async () => {
    if (!signedName.trim()) return setError("Type your full name to sign.");
    if (signedName.trim().toLowerCase() !== tenantName.trim().toLowerCase())
      return setError("Signed name must match your full name exactly.");
    if (!agreed) return setError("Please confirm you agree to the terms.");
    setSubmitting(true); setError("");
    try {
      await api.post("/api/tenancies/create/", {
        unit_id:          selectedUnit.id,
        deposit_amount:   depositAmount || selectedUnit.rent_amount,
        lease_start_date: leaseStart,
        signed_name:      signedName,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to add unit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} onClick={onClose} />
      <div style={{ position: "relative", background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto", zIndex: 101 }} className="animate-slide-up">

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "1rem", color: "var(--lr-text-primary)" }}>
            {step === 0 ? "Add a rental unit" : "Sign tenancy agreement"}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <X size={20} color="var(--lr-text-muted)" />
          </button>
        </div>

        {error && (
          <div style={{ background: "#FCEBEB", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: "0.8rem", color: "#791F1F", display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {/* Step 0 — Unit selection */}
        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Landlord search */}
            <div style={{ background: "var(--lr-bg-page)", borderRadius: 10, padding: 14 }}>
              <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 10 }}>
                1. Find your landlord
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="input" placeholder="Company / business name" value={companySearch} onChange={(e) => setCompanySearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} style={{ flex: 1 }} />
                <button className="btn-primary" onClick={handleSearch} disabled={searching} style={{ flexShrink: 0, padding: "10px 14px" }}>
                  {searching ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : <Search size={14} />}
                </button>
              </div>
              {landlords.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {landlords.map((l) => (
                    <div key={l.landlord_id} onClick={() => { setSelectedLandlord(l); setSelectedProperty(null); setSelectedUnit(null); }} style={{ padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${selectedLandlord?.landlord_id === l.landlord_id ? "var(--lr-primary)" : "var(--lr-border)"}`, background: selectedLandlord?.landlord_id === l.landlord_id ? "var(--lr-primary-light)" : "#fff", cursor: "pointer" }}>
                      <p style={{ fontSize: "0.82rem", fontWeight: 500 }}>{l.company_name}</p>
                      <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>{l.landlord_name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Property selection */}
            {selectedLandlord && (
              <div style={{ background: "var(--lr-bg-page)", borderRadius: 10, padding: 14 }} className="animate-fade-in">
                <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 10 }}>2. Select property</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(selectedLandlord.properties || []).map((p: any) => (
                    <div key={p.id} onClick={() => handleSelectProperty(p)} style={{ padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${selectedProperty?.id === p.id ? "var(--lr-primary)" : "var(--lr-border)"}`, background: selectedProperty?.id === p.id ? "var(--lr-primary-light)" : "#fff", cursor: "pointer" }}>
                      <p style={{ fontSize: "0.82rem", fontWeight: 500 }}>{p.name}</p>
                      <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>{p.address}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Unit selection */}
            {selectedProperty && (
              <div style={{ background: "var(--lr-bg-page)", borderRadius: 10, padding: 14 }} className="animate-fade-in">
                <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 10 }}>3. Choose your unit</p>
                {loadingUnits ? (
                  <div style={{ textAlign: "center", padding: "12px 0", color: "var(--lr-text-muted)", fontSize: "0.8rem" }}>
                    <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite", margin: "0 auto 4px", display: "block" }} />
                    Loading units...
                  </div>
                ) : vacantUnits.length === 0 ? (
                  <p style={{ fontSize: "0.8rem", color: "var(--lr-danger)", textAlign: "center", padding: "10px 0" }}>No vacant units available.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {vacantUnits.map((u: any) => (
                      <div key={u.id} onClick={() => { setSelectedUnit(u); setDepositAmount(u.rent_amount); }} style={{ padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${selectedUnit?.id === u.id ? "var(--lr-primary)" : "var(--lr-border)"}`, background: selectedUnit?.id === u.id ? "var(--lr-primary-light)" : "#fff", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <p style={{ fontSize: "0.82rem", fontWeight: 600, color: selectedUnit?.id === u.id ? "var(--lr-primary)" : "var(--lr-text-primary)" }}>Unit {u.unit_number}</p>
                          <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>{u.unit_type?.replace("_", " ")}{u.block_name ? ` · ${u.block_name}` : ""}</p>
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

            {/* Proceed */}
            {selectedUnit && (
              <button className="btn-primary" onClick={() => { setError(""); setStep(1); }} style={{ width: "100%", justifyContent: "center" }}>
                <ArrowRight size={15} /> Proceed to agreement
              </button>
            )}
          </div>
        )}

        {/* Step 1 — Agreement */}
        {step === 1 && selectedUnit && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Agreement doc */}
            <div style={{ background: "#fff", border: "1px solid var(--lr-border)", borderRadius: 10, padding: "16px", fontSize: "0.78rem", color: "var(--lr-text-secondary)", lineHeight: 1.8, maxHeight: 220, overflowY: "auto" }}>
              <p style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, textAlign: "center", marginBottom: 12, color: "var(--lr-text-primary)" }}>TENANCY AGREEMENT</p>
              <p><strong>Property:</strong> {selectedProperty?.name}</p>
              <p><strong>Unit:</strong> {selectedUnit?.unit_number}</p>
              <p><strong>Landlord:</strong> {selectedLandlord?.landlord_name} — {selectedLandlord?.company_name}</p>
              <p><strong>Tenant:</strong> {tenantName}</p>
              <div style={{ height: 1, background: "var(--lr-border)", margin: "8px 0" }} />
              <p>1. Monthly rent: <strong>{formatKES(selectedUnit?.rent_amount)}</strong>, payable in advance.</p>
              <p>2. Security deposit: <strong>{formatKES(depositAmount)}</strong>, refundable upon exit.</p>
              <p>3. Lease commences on the date selected below.</p>
              <p>4. Payments via LumidahRentals platform (M-Pesa, card, or bank transfer).</p>
              <p>5. Either party may terminate with 30 days written notice.</p>
              <p>6. Governed by the laws of Kenya.</p>
            </div>

            {/* Editable fields */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label className="label">Lease start date</label>
                <input className="input" type="date" min={today} value={leaseStart} onChange={(e) => setLeaseStart(e.target.value)} />
              </div>
              <div>
                <label className="label">Security deposit (KES)</label>
                <input className="input" type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
              </div>
            </div>

            {/* Signature */}
            <div>
              <label className="label">Digital signature — type your full name</label>
              <div style={{ position: "relative" }}>
                <Pen size={13} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--lr-text-muted)", pointerEvents: "none" }} />
                <input className="input" placeholder={`Type "${tenantName}" to sign`} value={signedName} onChange={(e) => { setSignedName(e.target.value); setError(""); }} style={{ paddingLeft: 32, fontStyle: "italic" }} />
              </div>
            </div>

            {/* Agree checkbox */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <div onClick={() => setAgreed((v) => !v)} style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${agreed ? "var(--lr-primary)" : "var(--lr-border)"}`, background: agreed ? "var(--lr-primary)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, cursor: "pointer" }}>
                {agreed && <Check size={11} color="#fff" strokeWidth={3} />}
              </div>
              <span style={{ fontSize: "0.78rem", color: "var(--lr-text-secondary)", lineHeight: 1.5 }}>I confirm I have read and agree to all terms of this tenancy agreement.</span>
            </label>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-ghost" onClick={() => setStep(0)}>Back</button>
              <button className="btn-primary" onClick={handleSubmit} disabled={submitting || !signedName || !agreed} style={{ flex: 1, justifyContent: "center" }}>
                {submitting
                  ? <><Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Adding unit...</>
                  : <><FileText size={14} /> Sign & add unit</>
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