"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Building2, Download, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { CaretakerLayout } from "@/components/CaretakerLayout";
import api from "@/lib/api";
import { formatKES, formatDate } from "@/lib/utils";

export default function CaretakerReportPage() {
  const searchParams  = useSearchParams();
  const [propertyFilter, setPropertyFilter] = useState(searchParams.get("property_id") || "all");

  const { data: ctxData } = useQuery({
    queryKey: ["caretaker-context"],
    queryFn:  () => api.get("/api/caretaker/context/").then((r) => r.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["caretaker-report", propertyFilter],
    queryFn:  () => api.get(`/api/caretaker/report/${propertyFilter !== "all" ? `?property_id=${propertyFilter}` : ""}`).then((r) => r.data),
  });

  const properties = ctxData?.properties || [];
  const report     = data;

  const downloadCSV = () => {
    if (!report) return;
    const rows = [
      ...report.paid.map((e: any)           => [e.property, `Unit ${e.unit}`, e.tenant_name, e.tenant_phone, String(e.rent), "0", e.paid_until || "—", "PAID"]),
      ...report.partially_paid.map((e: any) => [e.property, `Unit ${e.unit}`, e.tenant_name, e.tenant_phone, String(e.rent), String(e.balance), e.paid_until || "—", "PARTIAL"]),
      ...report.unpaid.map((e: any)         => [e.property, `Unit ${e.unit}`, e.tenant_name, e.tenant_phone, String(e.rent), String(e.rent), "—", "UNPAID"]),
    ];
    const headers = ["Property", "Unit", "Tenant", "Phone", "Rent (KES)", "Balance (KES)", "Paid Until", "Status"];
    const csv     = [headers, ...rows].map((r) => r.map((c: string) => `"${c}"`).join(",")).join("\n");
    const blob    = new Blob([csv], { type: "text/csv" });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement("a");
    a.href        = url;
    a.download    = `rent-collection-${report.month?.replace(" ", "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  function SectionHeader({ icon, title, count, color, bg }: any) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: bg, borderRadius: 8, marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: "0.8rem", fontWeight: 600, color }}>{title}</span>
        <span style={{ marginLeft: "auto", fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: "0.95rem", color }}>{count}</span>
      </div>
    );
  }

  return (
    <CaretakerLayout active="report">
      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          <Building2 size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--lr-text-muted)", pointerEvents: "none" }} />
          <select className="input" value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)} style={{ appearance: "none", paddingLeft: 26, paddingRight: 24, fontSize: "0.8rem", width: "auto", minWidth: 160 }}>
            <option value="all">All properties</option>
            {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={11} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--lr-text-muted)" }} />
        </div>
        {report && (
          <p style={{ fontSize: "0.78rem", color: "var(--lr-text-muted)", alignSelf: "center" }}>
            {report.month}
          </p>
        )}
        <button className="btn-secondary" onClick={downloadCSV} style={{ marginLeft: "auto" }}>
          <Download size={13} /> Download CSV
        </button>
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--lr-text-muted)" }}>Loading report...</div>
      ) : !report ? null : (
        <>
          {/* Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 20 }} className="report-summary">
            {[
              { label: "Collection rate", value: `${report.collection_rate}%`, bg: report.collection_rate >= 80 ? "#EAF3DE" : "#FAEEDA", color: report.collection_rate >= 80 ? "#27500A" : "#633806" },
              { label: "Total collected", value: formatKES(report.total_collected), bg: "var(--lr-primary-light)", color: "var(--lr-primary)" },
              { label: "Outstanding",     value: formatKES(report.total_expected - report.total_collected), bg: "#FCEBEB", color: "#A32D2D" },
              { label: "Total expected",  value: formatKES(report.total_expected), bg: "var(--lr-bg-page)", color: "var(--lr-text-primary)" },
            ].map((s) => (
              <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: "12px 14px" }}>
                <p style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)", marginBottom: 4 }}>{s.label}</p>
                <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.1rem", fontWeight: 700, color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ height: 8, background: "var(--lr-border)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${report.collection_rate}%`, background: report.collection_rate >= 80 ? "var(--lr-primary)" : "#BA7517", borderRadius: 99, transition: "width 0.5s" }} />
            </div>
          </div>

          {/* Paid */}
          {report.paid.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <SectionHeader icon={<CheckCircle size={14} color="#27500A" />} title="Fully paid" count={report.paid.length} color="#27500A" bg="#EAF3DE" />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {report.paid.map((e: any, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#fff", borderRadius: 8, border: "1px solid var(--lr-border)", gap: 8, flexWrap: "wrap" }}>
                    <div>
                      <p style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--lr-text-primary)", marginBottom: 2 }}>{e.tenant_name}</p>
                      <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>{e.property} · Unit {e.unit} · {e.tenant_phone}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#639922" }}>{formatKES(e.rent)}</p>
                      {e.paid_until && <p style={{ fontSize: "0.68rem", color: "var(--lr-text-muted)" }}>Until {formatDate(e.paid_until)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Partial */}
          {report.partially_paid.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <SectionHeader icon={<Clock size={14} color="#633806" />} title="Partially paid" count={report.partially_paid.length} color="#633806" bg="#FAEEDA" />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {report.partially_paid.map((e: any, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#fff", borderRadius: 8, border: "1px solid rgba(186,117,23,0.2)", gap: 8, flexWrap: "wrap" }}>
                    <div>
                      <p style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--lr-text-primary)", marginBottom: 2 }}>{e.tenant_name}</p>
                      <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>{e.property} · Unit {e.unit} · {e.tenant_phone}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#BA7517" }}>Balance: {formatKES(e.balance)}</p>
                      {e.paid_until && <p style={{ fontSize: "0.68rem", color: "var(--lr-text-muted)" }}>Until {formatDate(e.paid_until)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unpaid */}
          {report.unpaid.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <SectionHeader icon={<AlertCircle size={14} color="#791F1F" />} title="Not paid" count={report.unpaid.length} color="#791F1F" bg="#FCEBEB" />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {report.unpaid.map((e: any, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#fff", borderRadius: 8, border: "1px solid rgba(162,45,45,0.2)", gap: 8, flexWrap: "wrap" }}>
                    <div>
                      <p style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--lr-text-primary)", marginBottom: 2 }}>{e.tenant_name}</p>
                      <p style={{ fontSize: "0.72rem", color: "var(--lr-text-muted)" }}>{e.property} · Unit {e.unit} · {e.tenant_phone}</p>
                    </div>
                    <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--lr-danger)" }}>{formatKES(e.rent)} due</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        @media (min-width: 600px) {
          .report-summary { grid-template-columns: repeat(4, 1fr) !important; }
        }
      `}</style>
    </CaretakerLayout>
  );
}