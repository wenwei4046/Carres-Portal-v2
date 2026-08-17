import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";

/** ⭐ A PRINTED DOCUMENT ALWAYS CARRIES ITS YEAR — owner ruling 2026-08-15.
 *  THE YEAR RULE drops the year from a current-year date because a SCREEN is
 *  read today and the reader already knows which year that is. A service note
 *  is printed, filed, and re-read by a customer or a technician in a later
 *  year with no such context, so `Request Date: Wed, 12 Aug` would have lost a
 *  fact the document exists to carry. Same formatter, document mode. */
const DOC_DATE = { year: "always" } as const;
import type { ServiceNote } from "@carres/shared";

/**
 * /print/service-note/:id — printable SN document.
 * Matches the format of Carres_Service Note_ SN2605-03.pdf.
 * Opens in a new tab; auto-prints after data loads.
 */
export default function ServiceNotePrintPage() {
  const { id } = useParams<{ id: string }>();

  const q = useQuery<ServiceNote>({
    queryKey: ["print", "service-note", id],
    queryFn: () => apiFetch(`/api/ops/service-notes/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (q.data) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [q.data]);

  if (q.isLoading) return <div className="p-8 text-sm text-gray-500">Loading…</div>;
  if (!q.data) return <div className="p-8 text-sm text-red-600">Service note not found.</div>;

  const sn = q.data;

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        body { font-family: 'DM Sans', Arial, sans-serif; font-size: 11px; color: #1a1a1a; }
        .sn-table td, .sn-table th { border: 1px solid #d1d5db; padding: 4px 6px; }
        .sn-table { border-collapse: collapse; width: 100%; font-size: 11px; }
      `}</style>

      {/* Print button — hidden when printing */}
      <div className="no-print fixed top-3 right-3 flex gap-2 z-10">
        <button
          onClick={() => window.print()}
          className="rounded bg-gray-900 text-white px-4 py-1.5 text-sm font-medium hover:bg-gray-700"
        >
          Print PDF
        </button>
        <button
          onClick={() => window.close()}
          className="rounded border border-gray-300 bg-white text-gray-600 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Close
        </button>
      </div>

      <div style={{ maxWidth: 740, margin: "0 auto", padding: "20px 16px" }}>
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Logo text fallback */}
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.5px", color: "#1a1a1a" }}>
              Carres
            </div>
            <div style={{ fontSize: 9, color: "#6b7280", lineHeight: 1.4, maxWidth: 200 }}>
              CARRES SDN. BHD. (1434019335) | No 7, Gateway 2-1, Gateway, No 2, Jalan Hamlin Bertam, Bertam Industrial Estate, 68000 Kepong, Kuala Lumpur
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#D64F20", letterSpacing: "0.5px" }}>SERVICE NOTE</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#1a1a1a", marginTop: 2 }}>
              Service Note No: <span style={{ fontFamily: "monospace" }}>{sn.snNo}</span>
            </div>
          </div>
        </div>

        <hr style={{ borderColor: "#d1d5db", margin: "8px 0" }} />

        {/* ── Customer info row ────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
          <div>
            <InfoRow label="Customer Name" value={sn.customerName} />
            <InfoRow label="HP" value={sn.customerPhone} />
            <InfoRow label="Ref No" value={sn.refNo} />
            <InfoRow label="Address" value={sn.customerAddress} multiline />
          </div>
          <div>
            <InfoRow label="Request Date" value={fmtDate(sn.requestDate, DOC_DATE)} />
            <InfoRow label="Deadline" value={fmtDate(sn.deadline, DOC_DATE)} />
            <InfoRow label="Delivered Date" value={fmtDate(sn.deliveredDate, DOC_DATE)} />
            <InfoRow label="Category" value={sn.category} />
            <InfoRow label="Status" value={sn.status === "ongoing" ? "Ongoing" : "Closed"} />
            <InfoRow label="Type" value={sn.type} />
          </div>
        </div>

        {/* ── What Happened ────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>What Happened</div>
          <div style={{ border: "1px solid #d1d5db", borderRadius: 3, padding: "4px 6px", minHeight: 28, fontSize: 11 }}>
            {sn.whatHappened || "—"}
          </div>
        </div>

        {/* ── Items table ──────────────────────────────────────────────────── */}
        {sn.items && sn.items.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <table className="sn-table">
              <thead style={{ background: "#f9fafb" }}>
                <tr>
                  <th style={{ width: 28, textAlign: "center" }}>NO</th>
                  <th>ITEM</th>
                  <th style={{ width: 90 }}>PO NO</th>
                  <th style={{ width: 40, textAlign: "center" }}>QTY</th>
                  <th>REMARK</th>
                </tr>
              </thead>
              <tbody>
                {sn.items.map((it) => (
                  <tr key={it.no}>
                    <td style={{ textAlign: "center" }}>{it.no}</td>
                    <td>{it.item}</td>
                    <td style={{ fontFamily: "monospace" }}>{it.poNo ?? "—"}</td>
                    <td style={{ textAlign: "center" }}>{it.qty}</td>
                    <td>{it.remark ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Section A — Logistics ────────────────────────────────────────── */}
        {sn.sectionA && (
          <SectionBlock title="SECTION A - LOGISTIC" bgColor="#eff6ff" borderColor="#bfdbfe">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <InfoRow label="Logistic Instructions" value={(sn.sectionA as { task?: string }).task} />
              </div>
              <InfoRow label="Customer Name" value={sn.customerName} />
              <InfoRow label="HP" value={sn.customerPhone} />
              <div style={{ gridColumn: "1 / -1" }}>
                <InfoRow label="Address" value={sn.customerAddress} multiline />
              </div>
              <InfoRow label="Deliver Date" value={fmtDate((sn.sectionA as { deliverDate?: string }).deliverDate, DOC_DATE)} />
              <InfoRow label="Logistic" value={(sn.sectionA as { logisticCompany?: string }).logisticCompany} />
              {(sn.sectionA as { note?: string }).note && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <InfoRow label="Customer Request" value={(sn.sectionA as { note?: string }).note} />
                </div>
              )}
            </div>
          </SectionBlock>
        )}

        {/* ── Section B — Supplier ─────────────────────────────────────────── */}
        {sn.sectionB && (
          <SectionBlock title="SECTION B - SUPPLIER" bgColor="#fff7ed" borderColor="#fed7aa">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <InfoRow label="Supplier Instructions" value={(sn.sectionB as { task?: string }).task} />
              </div>
              <InfoRow label="Deliver Date" value={fmtDate((sn.sectionB as { deliverDate?: string }).deliverDate, DOC_DATE)} />
              <InfoRow label="Supplier" value={(sn.sectionB as { supplierName?: string }).supplierName} />
            </div>
          </SectionBlock>
        )}

        {/* ── Section C — Warehouse ────────────────────────────────────────── */}
        {sn.sectionC && (
          <SectionBlock title="SECTION C - WAREHOUSE" bgColor="#f9fafb" borderColor="#d1d5db">
            <InfoRow label="Note 1" value={(sn.sectionC as { note1?: string }).note1} />
            <div style={{ marginTop: 4 }}>
              <InfoRow label="Note 2" value={(sn.sectionC as { note2?: string }).note2} />
            </div>
          </SectionBlock>
        )}

        {/* ── Signature ────────────────────────────────────────────────────── */}
        <div style={{ marginTop: 24, display: "flex", gap: 40 }}>
          <SignatureLine label="Warehouse received by" />
          <SignatureLine label="Date" />
        </div>
      </div>
    </>
  );
}

function InfoRow({ label, value, multiline }: { label: string; value?: string | null; multiline?: boolean }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <span style={{ fontSize: 9, color: "#6b7280", marginRight: 4 }}>{label}:</span>
      <span style={{ fontSize: 11, whiteSpace: multiline ? "pre-wrap" : undefined }}>
        {value || "—"}
      </span>
    </div>
  );
}

function SectionBlock({
  title, bgColor, borderColor, children,
}: { title: string; bgColor: string; borderColor: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: 4,
      padding: "8px 10px",
      marginBottom: 10,
    }}>
      <div style={{ fontWeight: 700, fontSize: 10, letterSpacing: "0.08em", marginBottom: 6, color: "#374151" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function SignatureLine({ label }: { label: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ borderBottom: "1px solid #9ca3af", marginBottom: 4, height: 32 }} />
      <div style={{ fontSize: 10, color: "#6b7280" }}>{label}</div>
    </div>
  );
}
