"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Clock, AlertCircle, X, Loader2 } from "lucide-react";
import { CaretakerLayout } from "@/components/CaretakerLayout";
import api from "@/lib/api";
import { formatDate } from "@/lib/utils";

function ResolveModal({ req, onClose, onResolve }: { req: any; onClose: () => void; onResolve: (id: string, notes: string) => void }) {
  const [notes, setNotes] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} onClick={onClose} />
      <div style={{ position: "relative", background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440, zIndex: 101 }} className="animate-slide-up">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.95rem" }}>Resolve request</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color="var(--lr-text-muted)" /></button>
        </div>
        <div style={{ background: "var(--lr-bg-page)", borderRadius: 8, padding: "10px 12px", marginBottom: 14, fontSize: "0.8rem", color: "var(--lr-text-secondary)", lineHeight: 1.5 }}>{req.issue}</div>
        <div style={{ marginBottom: 16 }}>
          <label className="label">Resolution notes (optional)</label>
          <textarea className="input" rows={3} placeholder="What was done to fix this?" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ resize: "vertical" }} />
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => { onResolve(req.id, notes); onClose(); }}>
            <CheckCircle size={13} /> Mark resolved
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CaretakerMaintenancePage() {
  const queryClient   = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [resolveReq,   setResolveReq]  = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["caretaker-maintenance", statusFilter],
    queryFn:  () => api.get(`/api/caretaker/maintenance/${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`).then((r) => r.data),
  });

  const { mutate: updateReq } = useMutation({
    mutationFn: ({ id, status, notes }: any) =>
      api.patch(`/api/caretaker/maintenance/${id}/`, { status, resolution_notes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["caretaker-maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["landlord-maintenance"] });
    },
  });

  const requests = data?.results || [];
  const openCount      = requests.filter((r: any) => r.status === "open").length;
  const inProgressCount = requests.filter((r: any) => r.status === "in_progress").length;
  const resolvedCount  = requests.filter((r: any) => r.status === "resolved").length;

  const statusColor: Record<string, string>  = { open: "badge-danger", in_progress: "badge-warning", resolved: "badge-success" };
  const priorityColor: Record<string, string> = { low: "badge-neutral", medium: "badge-warning", high: "badge-danger" };

  return (
    <CaretakerLayout active="maintenance">
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Open",        value: openCount,       bg: "#FCEBEB", color: "#A32D2D" },
          { label: "In progress", value: inProgressCount, bg: "#FAEEDA", color: "#BA7517" },
          { label: "Resolved",    value: resolvedCount,   bg: "#EAF3DE", color: "#639922" },
        ].map((s) => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: "12px", textAlign: "center" }}>
            <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.3rem", fontWeight: 700, color: s.color }}>{s.value}</p>
            <p style={{ fontSize: "0.72rem", color: s.color, opacity: 0.8 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Status filter pills */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { label: "All",         value: "all"         },
          { label: "Open",        value: "open"        },
          { label: "In progress", value: "in_progress" },
          { label: "Resolved",    value: "resolved"    },
        ].map((tab) => (
          <button key={tab.value} onClick={() => setStatusFilter(tab.value)} style={{ padding: "6px 12px", borderRadius: 99, border: `1.5px solid ${statusFilter === tab.value ? "var(--lr-primary)" : "var(--lr-border)"}`, background: statusFilter === tab.value ? "var(--lr-primary-light)" : "#fff", color: statusFilter === tab.value ? "var(--lr-primary)" : "var(--lr-text-muted)", fontSize: "0.78rem", fontWeight: 500, cursor: "pointer" }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Requests */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--lr-text-muted)" }}>Loading...</div>
      ) : requests.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px 0" }}>
          <p style={{ color: "var(--lr-text-muted)", fontSize: "0.875rem" }}>No maintenance requests</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {requests.map((r: any) => (
            <div key={r.id} className="card" style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                    <span className={`badge ${priorityColor[r.priority]}`} style={{ textTransform: "capitalize" }}>{r.priority} priority</span>
                    <span className={`badge ${statusColor[r.status]}`} style={{ textTransform: "capitalize" }}>{r.status.replace("_", " ")}</span>
                  </div>
                  <p style={{ fontSize: "0.875rem", color: "var(--lr-text-primary)", lineHeight: 1.5, marginBottom: 6 }}>{r.issue}</p>
                  <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>
                    {r.tenant_name} · {r.property} · Unit {r.unit} · {formatDate(r.created_at)}
                  </p>
                  {r.resolution_notes && (
                    <div style={{ marginTop: 8, background: "#EAF3DE", borderRadius: 8, padding: "6px 10px" }}>
                      <p style={{ fontSize: "0.75rem", color: "#27500A" }}>Resolution: {r.resolution_notes}</p>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                  {r.status === "open" && (
                    <button className="btn-secondary" style={{ padding: "5px 10px", fontSize: "0.75rem" }} onClick={() => updateReq({ id: r.id, status: "in_progress", notes: "" })}>
                      <Clock size={12} /> Start
                    </button>
                  )}
                  {r.status !== "resolved" && (
                    <button className="btn-primary" style={{ padding: "5px 10px", fontSize: "0.75rem" }} onClick={() => setResolveReq(r)}>
                      <CheckCircle size={12} /> Resolve
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {resolveReq && (
        <ResolveModal
          req={resolveReq}
          onClose={() => setResolveReq(null)}
          onResolve={(id, notes) => updateReq({ id, status: "resolved", notes })}
        />
      )}
    </CaretakerLayout>
  );
}