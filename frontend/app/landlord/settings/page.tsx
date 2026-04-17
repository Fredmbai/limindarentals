"use client";

import { useState, useCallback } from "react";
import {
  Save, Loader2, Eye, EyeOff, X,
  Menu, Bell, Home, Smartphone, Banknote,
  Settings, Shield, Building2, Check, AlertCircle,
  Users, UserPlus, ChevronDown, CheckCircle, Trash2, ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { formatDate, formatPhone } from "@/lib/utils";
import { NotificationBell } from "@/components/NotificationBell";
import { MobileProfileButton } from "@/components/MobileProfileButton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AddTenantModal } from "@/components/AddTenantModal";

const NAV = [
  { href: "/landlord/dashboard",   label: "Dashboard"   },
  { href: "/landlord/properties",  label: "Properties"  },
  { href: "/landlord/tenants",     label: "Tenants"     },
  { href: "/landlord/payments",    label: "Payments"    },
  { href: "/landlord/maintenance", label: "Maintenance" },
  { href: "/landlord/reports",     label: "Reports"     },
  { href: "/landlord/settings",    label: "Settings", active: true },
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
        <button onClick={async () => { await logout(); router.push("/login"); }} className="nav-item" style={{ width: "100%", border: "none", background: "none", cursor: "pointer", color: "var(--lr-danger)" }}>Sign out</button>
      </div>
    </aside>
  );
}

// ── Reusable payout method fields (used for global settings and per-property overrides) ──

interface PayoutMethodFieldsProps {
  mpesaType: "paybill" | "till" | "stk_push"; setMpesaType: (v: "paybill" | "till" | "stk_push") => void;
  paybill: string; setPaybill: (v: string) => void;
  till: string; setTill: (v: string) => void;
  mpesaAcc: string; setMpesaAcc: (v: string) => void;
  cardEnabled: boolean; setCardEnabled: (v: boolean) => void;
  bankAccName: string; setBankAccName: (v: string) => void;
  bankName: string; setBankName: (v: string) => void;
  bankAcc: string; setBankAcc: (v: string) => void;
  bankBranch: string; setBankBranch: (v: string) => void;
  rentDueDay?: string; setRentDueDay?: (v: string) => void;
  graceDays?: string; setGraceDays?: (v: string) => void;
}

function PayoutMethodFields({
  mpesaType, setMpesaType, paybill, setPaybill, till, setTill, mpesaAcc, setMpesaAcc,
  cardEnabled, setCardEnabled, bankAccName, setBankAccName, bankName, setBankName,
  bankAcc, setBankAcc, bankBranch, setBankBranch,
  rentDueDay, setRentDueDay, graceDays, setGraceDays,
}: PayoutMethodFieldsProps) {
  return (
    <>
      {/* ── M-Pesa ── */}
      <div style={{ marginTop: 18, border: "1px solid var(--lr-border)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ background: "#F0FBF4", padding: "11px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--lr-border)" }}>
          <Smartphone size={14} color="#27500A" />
          <p style={{ fontWeight: 600, fontSize: "0.875rem", color: "#27500A" }}>M-Pesa</p>
          <span style={{ marginLeft: "auto", fontSize: "0.68rem", background: "#C3E6CB", color: "#27500A", borderRadius: 4, padding: "2px 7px", fontWeight: 500 }}>STK push always used</span>
        </div>
        <div style={{ padding: "14px 16px" }}>
          <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", marginBottom: 10 }}>
            Tenants pay by entering their M-Pesa PIN on a system-sent prompt. Choose where their payment is deposited:
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {([
              { value: "paybill" as const, label: "Paybill",     desc: "Lipa na M-Pesa → Paybill" },
              { value: "till"    as const, label: "Till Number", desc: "Lipa na M-Pesa → Buy Goods" },
            ]).map((opt) => {
              const sel = mpesaType === opt.value;
              return (
                <button key={opt.value} onClick={() => setMpesaType(opt.value)}
                  style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1.5px solid ${sel ? "var(--lr-primary)" : "var(--lr-border)"}`, borderRadius: 8, background: sel ? "var(--lr-primary-light)" : "#fff", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${sel ? "var(--lr-primary)" : "var(--lr-border)"}`, background: sel ? "var(--lr-primary)" : "#fff", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {sel && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                  </div>
                  <div>
                    <p style={{ fontSize: "0.82rem", fontWeight: 600, color: sel ? "var(--lr-primary)" : "var(--lr-text-primary)", marginBottom: 1 }}>{opt.label}</p>
                    <p style={{ fontSize: "0.68rem", color: "var(--lr-text-muted)" }}>{opt.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {mpesaType === "paybill" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} className="settings-grid">
              <div>
                <label className="label">Paybill number</label>
                <input className="input" placeholder="e.g. 247247" value={paybill} onChange={(e) => setPaybill(e.target.value)} />
              </div>
              <div>
                <label className="label">Account reference</label>
                <input className="input" placeholder="e.g. RENT" value={mpesaAcc} onChange={(e) => setMpesaAcc(e.target.value)} />
                <p style={{ fontSize: "0.68rem", color: "var(--lr-text-muted)", marginTop: 2 }}>What the tenant types as the account number</p>
              </div>
            </div>
          )}
          {mpesaType === "till" && (
            <div>
              <label className="label">Till number</label>
              <input className="input" placeholder="e.g. 5123456" value={till} onChange={(e) => setTill(e.target.value)} style={{ maxWidth: 220 }} />
            </div>
          )}
        </div>
      </div>

      {/* ── Card ── */}
      <div style={{ marginTop: 10, border: "1px solid var(--lr-border)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ background: "#EFF6FF", padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Shield size={14} color="#185FA5" />
            <p style={{ fontWeight: 600, fontSize: "0.875rem", color: "#185FA5" }}>Card (Visa / Mastercard)</p>
          </div>
          <button onClick={() => setCardEnabled(!cardEnabled)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <div style={{ width: 34, height: 18, borderRadius: 9, background: cardEnabled ? "var(--lr-primary)" : "#CBD5E0", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
              <div style={{ position: "absolute", top: 2, left: cardEnabled ? 16 : 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
            </div>
            <span style={{ fontSize: "0.72rem", color: cardEnabled ? "var(--lr-primary)" : "var(--lr-text-muted)", fontWeight: 500 }}>{cardEnabled ? "Enabled" : "Disabled"}</span>
          </button>
        </div>
        <div style={{ padding: "10px 16px" }}>
          <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>
            Processed via Paystack — funds settle to your Paystack account. No extra config needed.
            {!cardEnabled && <span style={{ color: "#A32D2D", fontWeight: 500 }}> Hidden from tenants.</span>}
          </p>
        </div>
      </div>

      {/* ── Bank transfer ── */}
      <div style={{ marginTop: 10, border: "1px solid var(--lr-border)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ background: "#FAEEDA", padding: "11px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--lr-border)" }}>
          <Banknote size={14} color="#633806" />
          <p style={{ fontWeight: 600, fontSize: "0.875rem", color: "#633806" }}>Bank transfer</p>
        </div>
        <div style={{ padding: "14px 16px" }}>
          <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", marginBottom: 12 }}>Tenant transfers manually and uploads proof. You verify.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} className="settings-grid">
            <div>
              <label className="label">Bank name</label>
              <input className="input" placeholder="e.g. KCB, Equity" value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </div>
            <div>
              <label className="label">Account name</label>
              <input className="input" placeholder="Name on the account" value={bankAccName} onChange={(e) => setBankAccName(e.target.value)} />
            </div>
            <div>
              <label className="label">Account number</label>
              <input className="input" placeholder="e.g. 1234567890" value={bankAcc} onChange={(e) => setBankAcc(e.target.value)} />
            </div>
            <div>
              <label className="label">Branch (optional)</label>
              <input className="input" placeholder="e.g. Nairobi CBD" value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Rent rules (global only) ── */}
      {rentDueDay !== undefined && setRentDueDay && setGraceDays && (
        <div style={{ marginTop: 10, border: "1px solid var(--lr-border)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Building2 size={14} color="var(--lr-text-muted)" />
            <p style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--lr-text-secondary)" }}>Rent rules</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} className="settings-grid">
            <div>
              <label className="label">Rent due day (1–28)</label>
              <input className="input" type="number" min="1" max="28" value={rentDueDay} onChange={(e) => setRentDueDay(e.target.value)} />
              <p style={{ fontSize: "0.68rem", color: "var(--lr-text-muted)", marginTop: 2 }}>Day of month rent is due</p>
            </div>
            <div>
              <label className="label">Grace period (days)</label>
              <input className="input" type="number" min="0" max="30" value={graceDays || ""} onChange={(e) => setGraceDays(e.target.value)} />
              <p style={{ fontSize: "0.68rem", color: "var(--lr-text-muted)", marginTop: 2 }}>Days after due date before overdue</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


// ── Per-property payout overrides ──

function PropertyPayoutOverrides({ properties }: { properties: any[] }) {
  const [openId,   setOpenId]   = useState<string | null>(null);
  const [saving,   setSaving]   = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [msgs,     setMsgs]     = useState<Record<string, { type: "success"|"error"; text: string }>>({});
  const [overrides, setOverrides] = useState<Record<string, any>>({});

  // Load override when a property is expanded
  const loadOverride = useCallback(async (propId: string) => {
    try {
      const res = await api.get(`/api/properties/${propId}/payout/`);
      setOverrides((o) => ({ ...o, [propId]: res.data || {} }));
    } catch {
      setOverrides((o) => ({ ...o, [propId]: {} }));
    }
  }, []);

  const toggle = (propId: string) => {
    if (openId === propId) { setOpenId(null); return; }
    setOpenId(propId);
    loadOverride(propId);
  };

  const setField = (propId: string, field: string, value: any) => {
    setOverrides((o) => ({ ...o, [propId]: { ...o[propId], [field]: value } }));
  };

  const save = async (propId: string) => {
    setSaving(propId);
    setMsgs((m) => ({ ...m, [propId]: undefined as any }));
    try {
      await api.patch(`/api/properties/${propId}/payout/`, overrides[propId] || {});
      setMsgs((m) => ({ ...m, [propId]: { type: "success", text: "Override saved." } }));
    } catch {
      setMsgs((m) => ({ ...m, [propId]: { type: "error", text: "Failed to save." } }));
    } finally {
      setSaving(null);
      setTimeout(() => setMsgs((m) => ({ ...m, [propId]: undefined as any })), 3000);
    }
  };

  const remove = async (propId: string) => {
    setRemoving(propId);
    try {
      await api.delete(`/api/properties/${propId}/payout/`);
      setOverrides((o) => ({ ...o, [propId]: {} }));
      setMsgs((m) => ({ ...m, [propId]: { type: "success", text: "Override removed. Using global settings." } }));
      setOpenId(null);
    } catch {
      setMsgs((m) => ({ ...m, [propId]: { type: "error", text: "Failed to remove." } }));
    } finally {
      setRemoving(null);
      setTimeout(() => setMsgs((m) => ({ ...m, [propId]: undefined as any })), 3000);
    }
  };

  if (!properties.length) return null;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <div style={{ width: 32, height: 32, background: "#FFF3E0", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Building2 size={15} color="#BA7517" />
        </div>
        <div>
          <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem" }}>Per-property payout overrides</h3>
          <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)", marginTop: 1 }}>
            Set different M-Pesa / bank accounts for specific properties. Tenants in that property will see these instead of the default.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16 }}>
        {properties.map((prop) => {
          const isOpen = openId === prop.id;
          const ov     = overrides[prop.id] || {};
          const hasOv  = ov.mpesa_type || ov.paybill_number || ov.till_number || ov.bank_name;
          const msg    = msgs[prop.id];
          return (
            <div key={prop.id} style={{ border: "1px solid var(--lr-border)", borderRadius: 10, overflow: "hidden" }}>
              {/* Row header */}
              <button onClick={() => toggle(prop.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: isOpen ? "var(--lr-primary-light)" : "#fff", border: "none", cursor: "pointer", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Building2 size={14} color={isOpen ? "var(--lr-primary)" : "var(--lr-text-muted)"} />
                  <p style={{ fontSize: "0.875rem", fontWeight: 500, color: isOpen ? "var(--lr-primary)" : "var(--lr-text-primary)" }}>{prop.name}</p>
                  {hasOv && (
                    <span style={{ fontSize: "0.65rem", background: "var(--lr-primary-light)", color: "var(--lr-primary)", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>Custom</span>
                  )}
                </div>
                <ChevronRight size={15} color="var(--lr-text-muted)" style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
              </button>

              {/* Expanded override form */}
              {isOpen && (
                <div style={{ padding: "16px", borderTop: "1px solid var(--lr-border)", background: "var(--lr-bg-page)" }}>
                  {msg && (
                    <div style={{ background: msg.type === "success" ? "#EAF3DE" : "#FCEBEB", borderRadius: 7, padding: "8px 12px", marginBottom: 12, fontSize: "0.78rem", color: msg.type === "success" ? "#27500A" : "#791F1F" }}>
                      {msg.text}
                    </div>
                  )}
                  <PayoutMethodFields
                    mpesaType={ov.mpesa_type || "paybill"}
                    setMpesaType={(v) => setField(prop.id, "mpesa_type", v)}
                    paybill={ov.paybill_number || ""}
                    setPaybill={(v) => setField(prop.id, "paybill_number", v)}
                    till={ov.till_number || ""}
                    setTill={(v) => setField(prop.id, "till_number", v)}
                    mpesaAcc={ov.mpesa_account || ""}
                    setMpesaAcc={(v) => setField(prop.id, "mpesa_account", v)}
                    cardEnabled={ov.card_enabled !== false}
                    setCardEnabled={(v) => setField(prop.id, "card_enabled", v)}
                    bankAccName={ov.bank_account_name || ""}
                    setBankAccName={(v) => setField(prop.id, "bank_account_name", v)}
                    bankName={ov.bank_name || ""}
                    setBankName={(v) => setField(prop.id, "bank_name", v)}
                    bankAcc={ov.bank_account || ""}
                    setBankAcc={(v) => setField(prop.id, "bank_account", v)}
                    bankBranch={ov.bank_branch || ""}
                    setBankBranch={(v) => setField(prop.id, "bank_branch", v)}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
                    <button onClick={() => remove(prop.id)} disabled={removing === prop.id}
                      style={{ fontSize: "0.75rem", color: "#A32D2D", background: "none", border: "1px solid #A32D2D", borderRadius: 6, padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                      {removing === prop.id ? <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite" }} /> : <Trash2 size={12} />}
                      Remove override
                    </button>
                    <button onClick={() => save(prop.id)} disabled={saving === prop.id} className="btn-primary" style={{ padding: "7px 16px" }}>
                      {saving === prop.id ? <><Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> Saving...</> : <><Save size={13} /> Save for {prop.name}</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


export default function LandlordSettingsPage() {
  const user    = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Profile state
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [email,    setEmail]    = useState(user?.email     || "");
  const [profMsg,  setProfMsg]  = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showAddTenant, setShowAddTenant] = useState(false);

  // Payment settings state
  const [mpesaType,      setMpesaType]      = useState<"stk_push" | "paybill" | "till">("stk_push");
  const [paybill,        setPaybill]        = useState("");
  const [till,           setTill]           = useState("");
  const [mpesaAcc,       setMpesaAcc]       = useState("");
  const [cardEnabled,    setCardEnabled]    = useState(true);
  const [bankAccName,    setBankAccName]    = useState("");
  const [bankName,       setBankName]       = useState("");
  const [bankAcc,        setBankAcc]        = useState("");
  const [bankBranch,     setBankBranch]     = useState("");
  const [rentDueDay,     setRentDueDay]     = useState("1");
  const [graceDays,      setGraceDays]      = useState("5");
  const [payMsg,         setPayMsg]         = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Password state
  const [oldPass,  setOldPass]  = useState("");
  const [newPass,  setNewPass]  = useState("");
  const [showOld,  setShowOld]  = useState(false);
  const [showNew,  setShowNew]  = useState(false);
  const [passMsg,  setPassMsg]  = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Caretaker state
  const [ctName,       setCtName]       = useState("");
  const [ctPhone,      setCtPhone]      = useState("");
  const [ctEmail,      setCtEmail]      = useState("");
  const [ctPropertyIds, setCtPropertyIds] = useState<string[]>([]);
  const [caretakerMsg, setCaretakerMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [newCaretaker, setNewCaretaker] = useState<any>(null);

  // Notification state
  const [showNotifyModal,  setShowNotifyModal]  = useState(false);
  const [notifyScope,      setNotifyScope]      = useState<"all" | "property" | "specific">("all");
  const [notifyPropertyId, setNotifyPropertyId] = useState("");
  const [notifyTenants,    setNotifyTenants]    = useState<any[]>([]);
  const [selectedTenants,  setSelectedTenants]  = useState<string[]>([]);
  const [notifyTitle,      setNotifyTitle]      = useState("");
  const [notifyMessage,    setNotifyMessage]    = useState("");
  const [notifySms,        setNotifySms]        = useState(false);
  const [notifyMsg,        setNotifyMsg]        = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loadingTenants,   setLoadingTenants]   = useState(false);

  // Add these queries:
  const { data: propertiesData } = useQuery({
    queryKey: ["landlord-properties"],
    queryFn:  () => api.get("/api/properties/").then((r) => r.data),
  });
  const { data: caretakersData } = useQuery({
    queryKey: ["landlord-caretakers"],
    queryFn:  () => api.get("/api/auth/caretakers/").then((r) => r.data),
  });

  const properties = propertiesData?.results || [];
  const caretakers = caretakersData?.results || caretakersData || [];
  const queryClient = useQueryClient();

  const loadPropertyTenants = async (propId: string) => {
    if (!propId) return;
    setLoadingTenants(true);
    setNotifyTenants([]);
    setSelectedTenants([]);
    try {
      const res = await api.get(`/api/tenancies/property/${propId}/tenants/`);
      setNotifyTenants(res.data?.results || []);
    } catch {
      setNotifyMsg({ type: "error", text: "Failed to load tenants." });
    } finally {
      setLoadingTenants(false);
    }
  };

  const { mutate: sendNotification, isPending: sendingNotif } = useMutation({
    mutationFn: () => api.post("/api/landlord/notify/", {
      title:       notifyTitle,
      message:     notifyMessage,
      property_id: notifyScope === "all" ? undefined : notifyPropertyId || undefined,
      tenant_ids:  notifyScope === "specific" ? selectedTenants : [],
      send_sms:    notifySms,
    }),
    onSuccess: (res) => {
      setNotifyMsg({ type: "success", text: res.data.detail });
      setNotifyTitle("");
      setNotifyMessage("");
      setSelectedTenants([]);
      setNotifyScope("all");
      setTimeout(() => {
        setNotifyMsg(null);
        setShowNotifyModal(false);
      }, 3000);
    },
    onError: (err: any) => {
      setNotifyMsg({
        type: "error",
        text: err.response?.data?.detail || "Failed to send notification.",
      });
    },
  });

  const { mutate: createCaretaker, isPending: creatingCt } = useMutation({
    mutationFn: () => api.post("/api/auth/create-caretaker/", {
      full_name:    ctName,
      phone:        ctPhone,
      email:        ctEmail || undefined,
      property_ids: ctPropertyIds,
    }),
    onSuccess: (res) => {
      const data = res.data;
      setNewCaretaker(data);
      setCtName(""); setCtPhone(""); setCtEmail(""); setCtPropertyIds([]);
      setCaretakerMsg({ type: "success", text: `Caretaker "${data.full_name}" created successfully.` });
      queryClient.invalidateQueries({ queryKey: ["landlord-caretakers"] });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || err.message || "Failed to create caretaker.";
      setCaretakerMsg({ type: "error", text: msg });
      console.error("Caretaker creation error:", err.response?.data);
    },
  });

  const { data: profileData } = useQuery({
    queryKey: ["my-profile"],
    queryFn:  () => api.get("/api/auth/profile/").then((r) => r.data),
  });

  const { data: settingsData } = useQuery({
    queryKey: ["landlord-settings"],
    queryFn:  () => api.get("/api/landlord/settings/").then((r) => {
      const d = r.data;
      setMpesaType(d.mpesa_type || "stk_push");
      setPaybill(d.paybill_number || "");
      setTill(d.till_number || "");
      setMpesaAcc(d.mpesa_account || "");
      setCardEnabled(d.card_enabled !== false);
      setBankAccName(d.bank_account_name || "");
      setBankName(d.bank_name || "");
      setBankAcc(d.bank_account || "");
      setBankBranch(d.bank_branch || "");
      setRentDueDay(String(d.rent_due_day || "1"));
      setGraceDays(String(d.grace_period_days || "5"));
      return d;
    }),
  });

  const profile = profileData || user;

  const { mutate: updateProfile, isPending: savingProf } = useMutation({
    mutationFn: () => api.patch("/api/auth/profile/", { full_name: fullName, email }),
    onSuccess:  (res) => { setUser(res.data); setProfMsg({ type: "success", text: "Profile updated." }); setTimeout(() => setProfMsg(null), 3000); },
    onError:    () => setProfMsg({ type: "error", text: "Failed to update profile." }),
  });

  const { mutate: savePaymentSettings, isPending: savingPay } = useMutation({
    mutationFn: () => api.patch("/api/landlord/settings/", {
      mpesa_type: mpesaType, paybill_number: paybill, till_number: till, mpesa_account: mpesaAcc,
      card_enabled: cardEnabled,
      bank_account_name: bankAccName, bank_name: bankName, bank_account: bankAcc, bank_branch: bankBranch,
      rent_due_day: parseInt(rentDueDay), grace_period_days: parseInt(graceDays),
    }),
    onSuccess: (res) => {
      // Sync local state with what the server saved
      const d = res.data;
      setMpesaType(d.mpesa_type || "paybill");
      setPaybill(d.paybill_number || "");
      setTill(d.till_number || "");
      setMpesaAcc(d.mpesa_account || "");
      setCardEnabled(d.card_enabled !== false);
      setBankAccName(d.bank_account_name || "");
      setBankName(d.bank_name || "");
      setBankAcc(d.bank_account || "");
      setBankBranch(d.bank_branch || "");
      setRentDueDay(String(d.rent_due_day || "1"));
      setGraceDays(String(d.grace_period_days || "5"));
      queryClient.invalidateQueries({ queryKey: ["landlord-settings"] });
      setPayMsg({ type: "success", text: "Payment settings saved." });
      setTimeout(() => setPayMsg(null), 3000);
    },
    onError: () => setPayMsg({ type: "error", text: "Failed to save settings." }),
  });

  const { mutate: changePassword, isPending: savingPass } = useMutation({
    mutationFn: () => api.post("/api/auth/change-password/", { old_password: oldPass, new_password: newPass }),
    onSuccess:  () => { setOldPass(""); setNewPass(""); setPassMsg({ type: "success", text: "Password changed." }); setTimeout(() => setPassMsg(null), 3000); },
    onError:    (err: any) => setPassMsg({ type: "error", text: err.response?.data?.old_password?.[0] || "Failed to change password." }),
  });

  const msgStyle = (type: "success" | "error") => ({
    background: type === "success" ? "#EAF3DE" : "#FCEBEB",
    borderRadius: 8, padding: "10px 14px", marginBottom: 16,
    fontSize: "0.875rem",
    color: type === "success" ? "#27500A" : "#791F1F",
  });
  const { mutate: removeCaretaker } = useMutation({
    mutationFn: (id: string) => api.delete(`/api/auth/caretakers/${id}/`),
    onSuccess:  () => {
     queryClient.invalidateQueries({ queryKey: ["landlord-caretakers"] });
      setCaretakerMsg({ type: "success", text: "Caretaker removed successfully." });
     setTimeout(() => setCaretakerMsg(null), 3000);
   },
   onError: () => setCaretakerMsg({ type: "error", text: "Failed to remove caretaker." }),
  });

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
              <h1 className="page-title" style={{ fontSize: "clamp(1.2rem, 3vw, 1.5rem)" }}>Settings</h1>
              <p className="page-subtitle">Manage your account and payment configuration</p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NotificationBell />
            <MobileProfileButton role="landlord" />
          </div>
        </div>

        <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Profile */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ width: 32, height: 32, background: "var(--lr-primary-light)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Settings size={15} color="var(--lr-primary)" />
              </div>
              <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem" }}>Profile information</h3>
            </div>
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
              <div>
                <label className="label">Email address</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" />
              </div>
              <div>
                <label className="label">Company name</label>
                <input className="input" value={profile?.landlord_profile?.company_name || ""} disabled style={{ background: "var(--lr-bg-page)", cursor: "not-allowed" }} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)" }}>
                Member since {profile?.created_at ? formatDate(profile.created_at) : "—"}
              </p>
              <button className="btn-primary" onClick={() => updateProfile()} disabled={savingProf}>
                {savingProf ? <><Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Saving...</> : <><Save size={14} /> Save changes</>}
              </button>
            </div>
          </div>

          {/* Payment methods — global defaults */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 32, height: 32, background: "var(--lr-primary-light)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Banknote size={15} color="var(--lr-primary)" />
              </div>
              <div>
                <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem" }}>Payment methods — default (all properties)</h3>
                <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)", marginTop: 1 }}>Default payout details shown to tenants. You can override these per property below.</p>
              </div>
            </div>
            {payMsg && <div style={{ ...msgStyle(payMsg.type), marginTop: 14 }}>{payMsg.text}</div>}

            <PayoutMethodFields
              mpesaType={mpesaType} setMpesaType={setMpesaType}
              paybill={paybill} setPaybill={setPaybill}
              till={till} setTill={setTill}
              mpesaAcc={mpesaAcc} setMpesaAcc={setMpesaAcc}
              cardEnabled={cardEnabled} setCardEnabled={setCardEnabled}
              bankAccName={bankAccName} setBankAccName={setBankAccName}
              bankName={bankName} setBankName={setBankName}
              bankAcc={bankAcc} setBankAcc={setBankAcc}
              bankBranch={bankBranch} setBankBranch={setBankBranch}
              rentDueDay={rentDueDay} setRentDueDay={setRentDueDay}
              graceDays={graceDays} setGraceDays={setGraceDays}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn-primary" onClick={() => savePaymentSettings()} disabled={savingPay}>
                {savingPay ? <><Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Saving...</> : <><Save size={14} /> Save default settings</>}
              </button>
            </div>
          </div>

          {/* Per-property payout overrides */}
          <PropertyPayoutOverrides properties={properties} />

          {/* Change password */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ width: 32, height: 32, background: "#FAEEDA", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Shield size={15} color="#BA7517" />
              </div>
              <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem" }}>Change password</h3>
            </div>
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

          {/* Add tenant */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, background: "var(--lr-primary-light)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Users size={15} color="var(--lr-primary)" />
          </div>
          <div>
          <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem" }}>Add tenant</h3>
          <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)", marginTop: 1 }}>
          Onboard existing tenants or add new ones directly
         </p>
         </div>
        </div>
          <button
          className="btn-primary"
          onClick={() => setShowAddTenant(true)}
        >
          <UserPlus size={14} /> Add tenant
        </button>
        </div>
        </div>

{/* ── Manual Notifications ── */}
<div className="card">
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 32, height: 32, background: "#E6F1FB", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Bell size={15} color="#185FA5" />
      </div>
      <div>
        <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem" }}>
          Notify tenants
        </h3>
        <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)", marginTop: 1 }}>
          Send messages or reminders to your tenants
        </p>
      </div>
    </div>
    <button
      className="btn-primary"
      style={{ background: "#185FA5", flexShrink: 0 }}
      onClick={() => {
        setNotifyMsg(null);
        setNotifyScope("all");
        setNotifyPropertyId("");
        setNotifyTenants([]);
        setSelectedTenants([]);
        setNotifyTitle("");
        setNotifyMessage("");
        setNotifySms(false);
        setShowNotifyModal(true);
      }}
    >
      <Bell size={14} /> Send notification
    </button>
  </div>
</div>

          {/* Caretaker management */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ width: 32, height: 32, background: "var(--lr-primary-light)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Users size={15} color="var(--lr-primary)" />
              </div>
              <div>
                <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem" }}>Caretakers</h3>
                <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)", marginTop: 1 }}>Add caretakers to manage specific properties</p>
              </div>
            </div>

            {caretakerMsg && (
              <div style={{ ...msgStyle(caretakerMsg.type), marginBottom: 16 }}>{caretakerMsg.text}</div>
            )}

            {/* Add caretaker form */}
            <div style={{ background: "var(--lr-bg-page)", borderRadius: 10, padding: "16px", marginBottom: 16 }}>
              <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 14 }}>Add new caretaker</p>
              <div style={{ display: "grid", gap: 12 }} className="settings-grid">
                <div>
                  <label className="label">Full name *</label>
                  <input className="input" placeholder="e.g. Peter Njoroge" value={ctName} onChange={(e) => setCtName(e.target.value)} />
                </div>
                <div>
                  <label className="label">Phone number *</label>
                  <input className="input" type="tel" placeholder="e.g. 0712345678" value={ctPhone} onChange={(e) => setCtPhone(e.target.value)} />
                </div>
                <div>
                  <label className="label">Email (optional)</label>
                  <input className="input" type="email" placeholder="peter@email.com" value={ctEmail} onChange={(e) => setCtEmail(e.target.value)} />
                </div>
                <div>
                  <label className="label">Assign to properties * (select all that apply)</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                    {properties.map((p: any) => {
                      const checked = ctPropertyIds.includes(p.id);
                      return (
                        <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 12px", background: checked ? "var(--lr-primary-light)" : "#fff", border: `1.5px solid ${checked ? "var(--lr-primary)" : "var(--lr-border)"}`, borderRadius: 8, transition: "all 0.15s" }}>
                          <div
                            onClick={() => setCtPropertyIds((prev) =>
                              prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                            )}
                            style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${checked ? "var(--lr-primary)" : "var(--lr-border)"}`, background: checked ? "var(--lr-primary)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", transition: "all 0.15s" }}
                          >
                            {checked && <Check size={11} color="#fff" strokeWidth={3} />}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: "0.82rem", fontWeight: 500, color: checked ? "var(--lr-primary)" : "var(--lr-text-primary)" }}>{p.name}</p>
                            <p style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)" }}>{p.address}</p>
                          </div>
                        </label>
                      );
                    })}
                    {properties.length === 0 && (
                      <p style={{ fontSize: "0.8rem", color: "var(--lr-text-muted)", fontStyle: "italic" }}>Add properties first before assigning caretakers.</p>
                    )}
                  </div>
                </div>
              </div>
              <button
                className="btn-primary"
                style={{ marginTop: 14 }}
                onClick={() => createCaretaker()}
                disabled={creatingCt || !ctName || !ctPhone || ctPropertyIds.length === 0}
              >
                {creatingCt ? <><Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Creating...</> : <><UserPlus size={14} /> Add caretaker</>}
              </button>
            </div>

            {/* Credentials display */}
            {newCaretaker && (
              <div style={{ background: "#EAF3DE", border: "1px solid rgba(99,153,34,0.25)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }} className="animate-slide-up">
                <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#27500A", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle size={14} color="#639922" /> Caretaker account created
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    { label: "Login name",  value: newCaretaker.username  },
                    { label: "Password",    value: newCaretaker.password  },
                    { label: "Properties", value: Array.isArray(newCaretaker.properties) ? newCaretaker.properties.join(", ") : newCaretaker.property },
                    { label: "Phone",       value: newCaretaker.phone     },
                  ].map((row) => (
                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between" }}>
                      <p style={{ fontSize: "0.75rem", color: "#27500A", opacity: 0.7 }}>{row.label}</p>
                      <p style={{ fontFamily: row.label === "Password" || row.label === "Login name" ? "'JetBrains Mono', monospace" : "inherit", fontSize: "0.82rem", fontWeight: 600, color: "#27500A" }}>{row.value}</p>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: "0.72rem", color: "#27500A", marginTop: 10, opacity: 0.8, lineHeight: 1.5 }}>
                  Share these credentials with the caretaker. They can change their password after first login.
                </p>
              </div>
            )}

            {/* Existing caretakers list */}
            <div>
              <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--lr-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                Your caretakers ({caretakers.length})
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {caretakers.map((c: any) => {
                  const assignment = c.caretaker_assignments?.[0];
                  return (
                    <div key={c.id} style={{ background: "var(--lr-bg-page)", borderRadius: 10, border: "1px solid var(--lr-border)", overflow: "hidden" }}>
                      {/* Header */}
                      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--lr-primary-light)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--lr-primary)" }}>
                              {c.full_name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 1 }}>{c.full_name}</p>
                            <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>{c.phone}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (confirm(`Remove ${c.full_name} as caretaker? This will delete their account.`)) {
                              removeCaretaker(c.id);
                            }
                          }}
                          style={{ background: "#FCEBEB", border: "1px solid rgba(162,45,45,0.2)", borderRadius: 8, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: "0.75rem", color: "#A32D2D", fontWeight: 500 }}
                        >
                          <Trash2 size={12} /> Remove
                        </button>
                      </div>

                      {/* Credentials */}
                      <div style={{ padding: "10px 14px", borderTop: "1px solid var(--lr-border)", background: "#fff", display: "grid", gap: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>Login name</p>
                          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem", fontWeight: 600, color: "var(--lr-text-primary)" }}>
                            {c.full_name}
                          </p>
                        </div>
                        {c.raw_password ? (
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>Password</p>
                          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem", fontWeight: 600, color: "var(--lr-primary)" }}>
                            {c.raw_password}
                          </p>
                          </div>
                        ) : (
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>Password</p>
                          <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", fontStyle: "italic" }}>
                          Shown only at creation
                          </p>
                          </div>
                        )}
                        {assignment && (
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>Assigned to</p>
                            <p style={{ fontSize: "0.78rem", fontWeight: 500, color: "var(--lr-text-primary)" }}>
                              {assignment.property_name || "—"}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

      {/* ── Notify Modal ── */}
{showNotifyModal && (
  <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} onClick={() => setShowNotifyModal(false)} />
    <div style={{ position: "relative", background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", zIndex: 101 }} className="animate-slide-up">

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "1rem", color: "var(--lr-text-primary)" }}>
            Send notification
          </h3>
          <p style={{ fontSize: "0.75rem", color: "var(--lr-text-muted)", marginTop: 2 }}>
            Notify your tenants via in-app and optionally SMS
          </p>
        </div>
        <button onClick={() => setShowNotifyModal(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>
          <X size={20} color="var(--lr-text-muted)" />
        </button>
      </div>

      {notifyMsg && (
        <div style={{ background: notifyMsg.type === "success" ? "#EAF3DE" : "#FCEBEB", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: "0.82rem", color: notifyMsg.type === "success" ? "#27500A" : "#791F1F", display: "flex", alignItems: "center", gap: 8 }}>
          {notifyMsg.type === "success" ? <CheckCircle size={14} color="#639922" /> : <AlertCircle size={14} color="#A32D2D" />}
          {notifyMsg.text}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

        {/* ── Step 1: Scope ── */}
        <div>
          <label className="label" style={{ marginBottom: 8 }}>Who should receive this?</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { value: "all",      label: "All my tenants",          desc: "Sends to every active tenant across all properties"         },
              { value: "property", label: "All tenants in a property", desc: "Select one property — all active tenants there"             },
              { value: "specific", label: "Specific tenants",         desc: "Choose individual tenants from a property"                  },
            ].map((opt) => (
              <label
                key={opt.value}
                style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px", border: `1.5px solid ${notifyScope === opt.value ? "#185FA5" : "var(--lr-border)"}`, borderRadius: 10, background: notifyScope === opt.value ? "#E6F1FB" : "#fff", cursor: "pointer", transition: "all 0.15s" }}
              >
                <div
                  onClick={() => {
                    setNotifyScope(opt.value as any);
                    setNotifyPropertyId("");
                    setNotifyTenants([]);
                    setSelectedTenants([]);
                  }}
                  style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${notifyScope === opt.value ? "#185FA5" : "var(--lr-border)"}`, background: notifyScope === opt.value ? "#185FA5" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, cursor: "pointer", transition: "all 0.15s" }}
                >
                  {notifyScope === opt.value && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                </div>
                <div>
                  <p style={{ fontSize: "0.82rem", fontWeight: 600, color: notifyScope === opt.value ? "#185FA5" : "var(--lr-text-primary)", marginBottom: 2 }}>
                    {opt.label}
                  </p>
                  <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* ── Step 2: Property selector ── */}
        {(notifyScope === "property" || notifyScope === "specific") && (
          <div className="animate-fade-in">
            <label className="label">Select property</label>
            <div style={{ position: "relative" }}>
              <Building2 size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--lr-text-muted)", pointerEvents: "none" }} />
              <select
                className="input"
                value={notifyPropertyId}
                onChange={(e) => {
                  setNotifyPropertyId(e.target.value);
                  setSelectedTenants([]);
                  if (notifyScope === "specific" && e.target.value) {
                    loadPropertyTenants(e.target.value);
                  }
                }}
                style={{ appearance: "none", paddingLeft: 28, paddingRight: 28 }}
              >
                <option value="">Choose a property...</option>
                {properties.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--lr-text-muted)" }} />
            </div>
          </div>
        )}

        {/* ── Step 3: Tenant checkboxes ── */}
        {notifyScope === "specific" && notifyPropertyId && (
          <div className="animate-fade-in">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label className="label" style={{ margin: 0 }}>Select tenants</label>
              {notifyTenants.length > 0 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setSelectedTenants(notifyTenants.map((t) => t.tenancy_id))}
                    style={{ fontSize: "0.72rem", color: "#185FA5", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTenants([])}
                    style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", background: "none", border: "none", cursor: "pointer" }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {loadingTenants ? (
              <div style={{ textAlign: "center", padding: "16px 0", color: "var(--lr-text-muted)", fontSize: "0.82rem" }}>
                <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite", margin: "0 auto 4px", display: "block" }} />
                Loading tenants...
              </div>
            ) : notifyTenants.length === 0 ? (
              <p style={{ fontSize: "0.8rem", color: "var(--lr-text-muted)", padding: "12px 0" }}>
                No active tenants in this property.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto", paddingRight: 4 }}>
                {notifyTenants.map((t: any) => {
                  const checked = selectedTenants.includes(t.tenancy_id);
                  return (
                    <label
                      key={t.tenancy_id}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: `1.5px solid ${checked ? "#185FA5" : "var(--lr-border)"}`, borderRadius: 8, background: checked ? "#E6F1FB" : "#fff", cursor: "pointer", transition: "all 0.15s" }}
                    >
                      <div
                        onClick={() => setSelectedTenants((prev) =>
                          prev.includes(t.tenancy_id)
                            ? prev.filter((id) => id !== t.tenancy_id)
                            : [...prev, t.tenancy_id]
                        )}
                        style={{ width: 17, height: 17, borderRadius: 4, border: `2px solid ${checked ? "#185FA5" : "var(--lr-border)"}`, background: checked ? "#185FA5" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", transition: "all 0.15s" }}
                      >
                        {checked && <Check size={10} color="#fff" strokeWidth={3} />}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: "0.82rem", fontWeight: 500, color: checked ? "#185FA5" : "var(--lr-text-primary)", marginBottom: 1 }}>
                          {t.tenant_name}
                        </p>
                        <p style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)" }}>
                          Unit {t.unit} · {t.tenant_phone}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {selectedTenants.length > 0 && (
              <p style={{ fontSize: "0.72rem", color: "#185FA5", marginTop: 6, fontWeight: 500 }}>
                {selectedTenants.length} tenant{selectedTenants.length !== 1 ? "s" : ""} selected
              </p>
            )}
          </div>
        )}

        {/* ── Message ── */}
        <div style={{ borderTop: "1px solid var(--lr-border)", paddingTop: 16 }}>
          <div style={{ marginBottom: 14 }}>
            <label className="label">Notification title *</label>
            <input
              className="input"
              placeholder="e.g. Rent reminder, Water outage notice, Maintenance scheduled..."
              value={notifyTitle}
              onChange={(e) => setNotifyTitle(e.target.value)}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label className="label">Message *</label>
            <textarea
              className="input"
              placeholder="Type your message here..."
              rows={4}
              value={notifyMessage}
              onChange={(e) => setNotifyMessage(e.target.value)}
              style={{ resize: "vertical" }}
            />
            <p style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)", marginTop: 4 }}>
              {notifyMessage.length} characters
            </p>
          </div>

          {/* SMS toggle */}
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 14px", background: notifySms ? "#FAEEDA" : "var(--lr-bg-page)", borderRadius: 8, border: `1px solid ${notifySms ? "rgba(186,117,23,0.3)" : "var(--lr-border)"}`, marginBottom: 4 }}>
            <div
              onClick={() => setNotifySms((v) => !v)}
              style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${notifySms ? "#BA7517" : "var(--lr-border)"}`, background: notifySms ? "#BA7517" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", transition: "all 0.15s" }}
            >
              {notifySms && <Check size={11} color="#fff" strokeWidth={3} />}
            </div>
            <div>
              <p style={{ fontSize: "0.82rem", fontWeight: 500, color: notifySms ? "#633806" : "var(--lr-text-primary)" }}>
                Also send as SMS
              </p>
              <p style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)" }}>
                Sends via Africa's Talking to tenant's phone number (charges may apply)
              </p>
            </div>
          </label>
        </div>

        {/* ── Preview ── */}
        {(notifyTitle || notifyMessage) && (
          <div style={{ background: "var(--lr-bg-page)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--lr-border)" }}>
            <p style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--lr-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Preview
            </p>
            <div style={{ background: "#fff", borderRadius: 8, padding: "10px 14px", border: "1px solid var(--lr-border)" }}>
              <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 4 }}>
                {notifyTitle || "Notification title"}
              </p>
              <p style={{ fontSize: "0.78rem", color: "var(--lr-text-secondary)", lineHeight: 1.5 }}>
                {notifyMessage || "Your message will appear here..."}
              </p>
            </div>
            <p style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)", marginTop: 8 }}>
              Recipients:{" "}
              <strong>
                {notifyScope === "all" && "All active tenants"}
                {notifyScope === "property" && (notifyPropertyId ? `All tenants in ${properties.find((p: any) => p.id === notifyPropertyId)?.name}` : "Select a property")}
                {notifyScope === "specific" && (selectedTenants.length > 0 ? `${selectedTenants.length} selected tenant${selectedTenants.length !== 1 ? "s" : ""}` : "No tenants selected")}
              </strong>
              {notifySms && " · via in-app + SMS"}
              {!notifySms && " · via in-app only"}
            </p>
          </div>
        )}

        {/* ── Send button ── */}
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn-ghost" onClick={() => setShowNotifyModal(false)}>
            Cancel
          </button>
          <button
            className="btn-primary"
            style={{ flex: 1, justifyContent: "center", background: "#185FA5" }}
            onClick={() => sendNotification()}
            disabled={
              sendingNotif ||
              !notifyTitle.trim() ||
              !notifyMessage.trim() ||
              (notifyScope !== "all" && !notifyPropertyId) ||
              (notifyScope === "specific" && selectedTenants.length === 0)
            }
          >
            {sendingNotif
              ? <><Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Sending...</>
              : <><Bell size={14} /> Send notification</>
            }
          </button>
        </div>
      </div>
    </div>
  </div>
)}
      </main>

{showAddTenant && (
  <AddTenantModal
    onClose={() => setShowAddTenant(false)}
    onSuccess={() => {
      setShowAddTenant(false);
      queryClient.invalidateQueries({ queryKey: ["landlord-tenancies"] });
    }}
  />
)}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (min-width: 768px) {
          .desktop-sidebar { display: block !important; }
          .main-content    { margin-left: 240px !important; padding: 32px !important; }
          .hamburger       { display: none !important; }
        }
        @media (max-width: 767px) {
          .main-content  { margin-left: 0 !important; padding: 16px !important; }
          .settings-grid { grid-template-columns: 1fr !important; }
          .settings-grid > [style*="span 2"] { grid-column: span 1 !important; }
        }
      `}</style>
    </div>
  );
}