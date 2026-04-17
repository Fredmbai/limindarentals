"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Building2, Home, X, Loader2, ChevronDown,
  MapPin, Hash, DollarSign, Layers, Edit2, Trash2,
  Menu, Bell, Users, CheckCircle,
} from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { formatKES } from "@/lib/utils";
import type { Property, Unit, Block } from "@/types";
import { NotificationBell } from "@/components/NotificationBell";
import { MobileProfileButton } from "@/components/MobileProfileButton";

// ── Sidebar nav ──────────────────────────────
const NAV = [
  { href: "/landlord/dashboard",   label: "Dashboard"   },
  { href: "/landlord/properties",  label: "Properties", active: true },
  { href: "/landlord/tenants",     label: "Tenants"     },
  { href: "/landlord/payments",    label: "Payments"    },
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

// ── Modal wrapper ────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} onClick={onClose} />
      <div style={{ position: "relative", background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", zIndex: 101 }} className="animate-slide-up">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "1.05rem", color: "var(--lr-text-primary)" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><X size={20} color="var(--lr-text-muted)" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Unit type options ────────────────────────
const UNIT_TYPES = [
  { value: "bedsitter",  label: "Bedsitter"   },
  { value: "one_bed",    label: "1 Bedroom"   },
  { value: "two_bed",    label: "2 Bedroom"   },
  { value: "three_bed",  label: "3 Bedroom"   },
  { value: "studio",     label: "Studio"      },
  { value: "shop",       label: "Shop"        },
  { value: "other",      label: "Other"       },
];

// ── Unit card ────────────────────────────────
function UnitCard({ unit }: { unit: Unit }) {
  return (
    <div style={{
      padding: "10px 14px",
      background: "#fff",
      borderRadius: 8,
      border: "1px solid var(--lr-border)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div style={{
          width: 32, height: 32,
          background: unit.status === "occupied" ? "#EAF3DE" : "var(--lr-bg-page)",
          border: `1px solid ${unit.status === "occupied" ? "#5DCAA5" : "var(--lr-border)"}`,
          borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Hash size={13} color={unit.status === "occupied" ? "var(--lr-primary)" : "var(--lr-text-muted)"} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 1 }}>
            Unit {unit.unit_number}
          </p>
          <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>
            {UNIT_TYPES.find((t) => t.value === unit.unit_type)?.label || unit.unit_type}
          </p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "0.82rem", fontWeight: 600, color: "var(--lr-text-primary)" }}>
          {formatKES(unit.rent_amount)}
        </p>
        <span className={`badge ${unit.status === "occupied" ? "badge-success" : "badge-neutral"}`}>
          {unit.status}
        </span>
      </div>
    </div>
  );
}

// ── Block accordion ──────────────────────────
function BlockAccordion({ block, units }: { block: Block | { id: string; name: string; units_count: number }; units: Unit[] }) {
  const [open, setOpen] = useState(false);
  const occupied = units.filter((u) => u.status === "occupied").length;
  const vacant   = units.filter((u) => u.status === "vacant").length;

  return (
    <div style={{
      border: "1px solid var(--lr-border)",
      borderRadius: 10,
      overflow: "hidden",
      background: "#fff",
    }}>
      {/* Block header — clickable */}
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          background: open ? "var(--lr-primary-light)" : "#fff",
          transition: "background 0.15s",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div style={{
            width: 28, height: 28,
            background: open ? "var(--lr-primary)" : "var(--lr-bg-page)",
            borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            transition: "background 0.15s",
          }}>
            <Layers size={13} color={open ? "#fff" : "var(--lr-text-muted)"} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: "0.875rem", fontWeight: 600, color: open ? "var(--lr-primary)" : "var(--lr-text-primary)" }}>
              {block.name}
            </p>
            <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>
              {units.length} unit{units.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* Occupied / vacant summary */}
          <div style={{ display: "flex", gap: 5 }} className="block-badges">
            {occupied > 0 && <span className="badge badge-success">{occupied} occupied</span>}
            {vacant   > 0 && <span className="badge badge-neutral">{vacant} vacant</span>}
          </div>
          <ChevronDown
            size={15}
            color={open ? "var(--lr-primary)" : "var(--lr-text-muted)"}
            style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}
          />
        </div>
      </div>

      {/* Units list — shown when open */}
      {open && (
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--lr-border)", background: "var(--lr-bg-page)" }} className="animate-fade-in">
          {units.length === 0 ? (
            <p style={{ fontSize: "0.8rem", color: "var(--lr-text-muted)", textAlign: "center", padding: "12px 0" }}>
              No units in this block yet
            </p>
          ) : (
            units.map((unit) => <UnitCard key={unit.id} unit={unit} />)
          )}
        </div>
      )}
    </div>
  );
}

export default function PropertiesPage() {
  const user         = useAuthStore((s) => s.user);
  const queryClient  = useQueryClient();
  const [sidebarOpen, setSidebarOpen]           = useState(false);
  const [showAddProperty, setShowAddProperty]   = useState(false);
  const [showAddUnit, setShowAddUnit]           = useState(false);
  const [showAddBlock, setShowAddBlock]         = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [expandedProperty, setExpandedProperty] = useState<string | null>(null);

  // Property form state
  const [propName,    setPropName]    = useState("");
  const [propAddress, setPropAddress] = useState("");

  // Unit form state
  const [unitNumber,   setUnitNumber]   = useState("");
  const [unitType,     setUnitType]     = useState("one_bed");
  const [unitRent,     setUnitRent]     = useState("");
  const [unitBlock,    setUnitBlock]    = useState("");

  // Block form state
  const [blockName, setBlockName] = useState("");
  const [blockUnitCount, setBlockUnitCount] = useState("");
  const [blockUnitRent,  setBlockUnitRent]  = useState("");
  const [blockUnitType,  setBlockUnitType]  = useState("one_bed");
  const [formError, setFormError] = useState("");

  // ── Queries ──────────────────────────────
  const { data: propertiesData, isLoading } = useQuery({
    queryKey: ["landlord-properties"],
    queryFn:  () => api.get("/api/properties/").then((r) => r.data),
  });

  const properties: Property[] = propertiesData?.results || [];

  // ── Mutations ────────────────────────────
  const { mutate: createProperty, isPending: creatingProp } = useMutation({
    mutationFn: () => api.post("/api/properties/", { name: propName, address: propAddress }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["landlord-properties"] });
      setShowAddProperty(false);
      setPropName(""); setPropAddress(""); setFormError("");
    },
    onError: (err: any) => setFormError(err.response?.data?.name?.[0] || "Failed to create property."),
  });

  const { mutate: deleteProperty, isPending: deletingProp } = useMutation({
    mutationFn: (id: string) => api.delete(`/api/properties/${id}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["landlord-properties"] }),
  });

  const { mutate: createUnit, isPending: creatingUnit } = useMutation({
    mutationFn: () => api.post(`/api/properties/${selectedProperty?.id}/units/`, {
      unit_number: unitNumber,
      unit_type:   unitType,
      rent_amount: unitRent,
      ...(unitBlock ? { block: unitBlock } : {}),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["landlord-properties"] });
      queryClient.invalidateQueries({ queryKey: ["property-units", selectedProperty?.id] });
      setShowAddUnit(false);
      setUnitNumber(""); setUnitType("one_bed"); setUnitRent(""); setUnitBlock(""); setFormError("");
    },
    onError: (err: any) => setFormError(err.response?.data?.unit_number?.[0] || "Failed to create unit."),
  });

  const { mutate: createBlock, isPending: creatingBlock } = useMutation({
  mutationFn: async () => {
    // Step 1 — create the block
    const blockRes = await api.post(
      `/api/properties/${selectedProperty?.id}/blocks/`,
      { name: blockName }
    );
    const block = blockRes.data;

    // Step 2 — create all units in parallel
    const count    = parseInt(blockUnitCount);
    const prefix   = blockName.replace(/\s+/g, "").slice(0, 2).toUpperCase();
    const unitJobs = Array.from({ length: count }, (_, i) =>
      api.post(`/api/properties/${selectedProperty?.id}/units/`, {
        unit_number: `${prefix}${i + 1}`,
        unit_type:   blockUnitType,
        rent_amount: blockUnitRent,
        block:       block.id,
      })
    );
    await Promise.all(unitJobs);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["landlord-properties"] });
    queryClient.invalidateQueries({ queryKey: ["property-units",  selectedProperty?.id] });
    queryClient.invalidateQueries({ queryKey: ["property-blocks", selectedProperty?.id] });
    setShowAddBlock(false);
    setBlockName(""); setBlockUnitCount(""); setBlockUnitRent(""); setBlockUnitType("one_bed");
    setFormError("");
  },
  onError: () => setFormError("Failed to create block. Please try again."),
});

  // Per-property units query — only fetches when property is expanded
  const { data: unitsData } = useQuery({
    queryKey: ["property-units", expandedProperty],
    queryFn:  () => api.get(`/api/properties/${expandedProperty}/units/`).then((r) => r.data),
    enabled:  !!expandedProperty,
  });

  const { data: blocksData } = useQuery({
    queryKey: ["property-blocks", expandedProperty],
    queryFn:  () => api.get(`/api/properties/${expandedProperty}/blocks/`).then((r) => r.data),
    enabled:  !!expandedProperty,
  });

  const expandedUnits:  Unit[]  = unitsData?.results  || unitsData  || [];
  const expandedBlocks: Block[] = blocksData?.results || blocksData || [];

  const openAddUnit = (property: Property) => {
    setSelectedProperty(property);
    setExpandedProperty(property.id);
    setFormError("");
    setShowAddUnit(true);
  };

  const openAddBlock = (property: Property) => {
    setSelectedProperty(property);
    setExpandedProperty(property.id);
    setFormError("");
    setShowAddBlock(true);
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--lr-bg-page)" }}>

      {/* Desktop sidebar */}
      <div style={{ display: "none", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 40, width: 240 }} className="desktop-sidebar">
        <Sidebar />
      </div>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} onClick={() => setSidebarOpen(false)} />
          <div style={{ position: "relative", width: 240, height: "100%", zIndex: 51 }}>
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <main className="main-content" style={{ flex: 1, padding: "24px 20px", overflowX: "hidden" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="hamburger" onClick={() => setSidebarOpen(true)} style={{ background: "#fff", border: "1px solid var(--lr-border)", borderRadius: 8, padding: 8, cursor: "pointer", display: "flex", alignItems: "center" }}>
              <Menu size={18} color="var(--lr-text-secondary)" />
            </button>
            <div>
              <h1 className="page-title" style={{ fontSize: "clamp(1.2rem, 3vw, 1.5rem)" }}>Properties</h1>
              <p className="page-subtitle">Manage your properties and units</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>

            <NotificationBell />
            <MobileProfileButton role="landlord" />
            <button className="btn-primary" onClick={() => { setFormError(""); setShowAddProperty(true); }} style={{ whiteSpace: "nowrap" }}>
              <Plus size={15} /> Add property
            </button>
          </div>
        </div>

        {/* Empty state */}
        {!isLoading && properties.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: "60px 24px" }}>
            <Building2 size={48} style={{ margin: "0 auto 16px", opacity: 0.2, display: "block" }} />
            <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "1.1rem", marginBottom: 8 }}>No properties yet</h3>
            <p style={{ color: "var(--lr-text-muted)", fontSize: "0.875rem", marginBottom: 24 }}>Add your first property to start managing tenants and payments</p>
            <button className="btn-primary" onClick={() => setShowAddProperty(true)} style={{ margin: "0 auto" }}>
              <Plus size={15} /> Add first property
            </button>
          </div>
        )}

        {/* Properties list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {properties.map((property) => {
            const isExpanded = expandedProperty === property.id;
            return (
              <div key={property.id} className="card" style={{ padding: 0, overflow: "hidden" }}>

                {/* Property header */}
                <div
                  style={{ padding: "18px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                  onClick={() => {
                    setExpandedProperty(isExpanded ? null : property.id);
                    setSelectedProperty(property);
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                    <div style={{ width: 40, height: 40, background: "var(--lr-primary-light)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Building2 size={18} color="var(--lr-primary)" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem", color: "var(--lr-text-primary)", marginBottom: 3 }}>{property.name}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <MapPin size={11} color="var(--lr-text-muted)" />
                        <p style={{ fontSize: "0.78rem", color: "var(--lr-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{property.address}</p>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <div style={{ display: "flex", gap: 6 }} className="prop-badges">
                      <span className="badge badge-success">{property.occupied_count} occupied</span>
                      <span className="badge badge-neutral">{property.vacant_count} vacant</span>
                    </div>
                    <ChevronDown size={16} color="var(--lr-text-muted)" style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                  </div>
                </div>

                {/* Expanded units */}
                {isExpanded && (
                  <div style={{ borderTop: "1px solid var(--lr-border)", padding: "16px 20px" }} className="animate-fade-in">

                    {/* Actions row */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                      <button className="btn-primary" style={{ padding: "7px 12px", fontSize: "0.8rem" }} onClick={() => openAddUnit(property)}>
                        <Plus size={13} /> Add unit
                      </button>
                      <button className="btn-secondary" style={{ padding: "7px 12px", fontSize: "0.8rem" }} onClick={() => openAddBlock(property)}>
                        <Layers size={13} /> Add block
                      </button>
                      <button
                        className="btn-danger"
                        style={{ padding: "7px 12px", fontSize: "0.8rem", marginLeft: "auto" }}
                        onClick={() => { if (confirm(`Delete ${property.name}?`)) deleteProperty(property.id); }}
                        disabled={deletingProp}
                      >
                        <Trash2 size={13} /> Delete property
                      </button>
                    </div>

                    {/* Units grid */}
                    {/* Units display — structured by block */}
{expandedUnits.length === 0 ? (
  <div style={{ textAlign: "center", padding: "24px", background: "var(--lr-bg-page)", borderRadius: 10 }}>
    <p style={{ fontSize: "0.8rem", color: "var(--lr-text-muted)" }}>No units yet — add your first unit above</p>
  </div>
) : expandedBlocks.length > 0 ? (
  // ── Blocks view — units grouped under their block ──
  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    {expandedBlocks.map((block) => {
      const blockUnits = expandedUnits.filter((u) => u.block === block.id);
      return (
        <BlockAccordion
          key={block.id}
          block={block}
          units={blockUnits}
        />
      );
    })}

    {/* Units with no block assigned */}
    {expandedUnits.filter((u) => !u.block).length > 0 && (
      <BlockAccordion
        block={{ id: "unassigned", name: "Unassigned units", units_count: 0 }}
        units={expandedUnits.filter((u) => !u.block)}
      />
    )}
  </div>
) : (
  // ── No blocks — flat list ──
  <div style={{ display: "grid", gap: 10 }} className="units-grid">
    {expandedUnits.map((unit) => (
      <UnitCard key={unit.id} unit={unit} />
    ))}
  </div>
)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </main>

      {/* ── Add Property Modal ── */}
      {showAddProperty && (
        <Modal title="Add new property" onClose={() => setShowAddProperty(false)}>
          {formError && (
            <div style={{ background: "#FCEBEB", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: "0.8rem", color: "#791F1F" }}>{formError}</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label className="label">Property name</label>
              <input className="input" placeholder="e.g. Sunrise Apartments" value={propName} onChange={(e) => setPropName(e.target.value)} />
            </div>
            <div>
              <label className="label">Address</label>
              <textarea className="input" placeholder="e.g. 123 Ngong Road, Nairobi" rows={3} value={propAddress} onChange={(e) => setPropAddress(e.target.value)} style={{ resize: "vertical" }} />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-ghost" onClick={() => setShowAddProperty(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => createProperty()} disabled={creatingProp || !propName || !propAddress}>
                {creatingProp ? <><Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Creating...</> : <><CheckCircle size={14} /> Create property</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Add Unit Modal ── */}
      {showAddUnit && selectedProperty && (
        <Modal title={`Add unit — ${selectedProperty.name}`} onClose={() => setShowAddUnit(false)}>
          {formError && (
            <div style={{ background: "#FCEBEB", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: "0.8rem", color: "#791F1F" }}>{formError}</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="label">Unit number</label>
                <input className="input" placeholder="e.g. A1, 101" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} />
              </div>
              <div>
                <label className="label">Monthly rent (KES)</label>
                <input className="input" type="number" placeholder="e.g. 15000" value={unitRent} onChange={(e) => setUnitRent(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Unit type</label>
              <div style={{ position: "relative" }}>
                <select className="input" value={unitType} onChange={(e) => setUnitType(e.target.value)} style={{ appearance: "none", paddingRight: 36 }}>
                  {UNIT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--lr-text-muted)" }} />
              </div>
            </div>
            {expandedBlocks.length > 0 && (
              <div>
                <label className="label">Block / Floor (optional)</label>
                <div style={{ position: "relative" }}>
                  <select className="input" value={unitBlock} onChange={(e) => setUnitBlock(e.target.value)} style={{ appearance: "none", paddingRight: 36 }}>
                    <option value="">No block</option>
                    {expandedBlocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <ChevronDown size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--lr-text-muted)" }} />
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-ghost" onClick={() => setShowAddUnit(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => createUnit()} disabled={creatingUnit || !unitNumber || !unitRent}>
                {creatingUnit ? <><Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Creating...</> : <><Plus size={14} /> Add unit</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Add Block Modal ── */}
{showAddBlock && selectedProperty && (
  <Modal title={`Add block — ${selectedProperty.name}`} onClose={() => setShowAddBlock(false)}>
    {formError && (
      <div style={{ background: "#FCEBEB", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: "0.8rem", color: "#791F1F" }}>{formError}</div>
    )}
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Block name */}
      <div>
        <label className="label">Block / Floor name</label>
        <input
          className="input"
          placeholder="e.g. Block A, Floor 1, Wing East"
          value={blockName}
          onChange={(e) => setBlockName(e.target.value)}
        />
      </div>

      {/* Units in this block */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label className="label">Number of units</label>
          <input
            className="input"
            type="number"
            min="1"
            placeholder="e.g. 10"
            value={blockUnitCount}
            onChange={(e) => setBlockUnitCount(e.target.value)}
          />
          <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)", marginTop: 4 }}>
            Units will be named A1, A2... automatically
          </p>
        </div>
        <div>
          <label className="label">Rent per unit (KES)</label>
          <input
            className="input"
            type="number"
            placeholder="e.g. 15000"
            value={blockUnitRent}
            onChange={(e) => setBlockUnitRent(e.target.value)}
          />
        </div>
      </div>

      {/* Unit type for this block */}
      <div>
        <label className="label">Unit type</label>
        <div style={{ position: "relative" }}>
          <select
            className="input"
            value={blockUnitType}
            onChange={(e) => setBlockUnitType(e.target.value)}
            style={{ appearance: "none", paddingRight: 36 }}
          >
            {UNIT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <ChevronDown size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--lr-text-muted)" }} />
        </div>
      </div>

      {/* Preview */}
      {blockName && blockUnitCount && parseInt(blockUnitCount) > 0 && (
        <div style={{ background: "var(--lr-primary-light)", borderRadius: 10, padding: "12px 16px" }}>
          <p style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--lr-primary-dark)", marginBottom: 6 }}>Preview</p>
          <p style={{ fontSize: "0.8rem", color: "var(--lr-primary-dark)" }}>
            Will create <strong>{blockName}</strong> with <strong>{blockUnitCount} units</strong>
            {blockUnitRent ? ` at ${formatKES(blockUnitRent)} each` : ""}
          </p>
          <p style={{ fontSize: "0.75rem", color: "var(--lr-primary)", marginTop: 4 }}>
            Unit names: {blockName.replace(/\s+/g, "").slice(0, 2).toUpperCase()}1
            {parseInt(blockUnitCount) > 1 ? `, ${blockName.replace(/\s+/g, "").slice(0, 2).toUpperCase()}2` : ""}
            {parseInt(blockUnitCount) > 2 ? ` ... ${blockName.replace(/\s+/g, "").slice(0, 2).toUpperCase()}${blockUnitCount}` : ""}
          </p>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button className="btn-ghost" onClick={() => setShowAddBlock(false)}>Cancel</button>
        <button
          className="btn-primary"
          onClick={() => createBlock()}
          disabled={creatingBlock || !blockName || !blockUnitCount || !blockUnitRent}
        >
          {creatingBlock
            ? <><Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Creating...</>
            : <><CheckCircle size={14} /> Create block + units</>
          }
        </button>
      </div>
    </div>
  </Modal>
)}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (min-width: 768px) {
          .desktop-sidebar { display: block !important; }
          .main-content    { margin-left: 240px !important; padding: 32px !important; }
          .hamburger       { display: none !important; }
          .units-grid      { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 767px) {
          .main-content  { margin-left: 0 !important; padding: 16px !important; }
          .units-grid    { grid-template-columns: 1fr !important; }
          .prop-badges   { display: none; }
        }
      `}</style>
    </div>
  );
}