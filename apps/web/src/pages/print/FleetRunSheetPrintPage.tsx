// design-standard: not-a-list-page — a printed run sheet (one A4 sheet per lorry), not a Portal listing.
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { groupRuns } from "@carres/shared/fleet";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { FL, useFleet } from "@/pages/operation/fleet";

/**
 * /print/run-sheet?day=YYYY-MM-DD[&lorry=<id>|none] — Houzs FleetRunSheet:
 * one sheet per lorry (day, plate, driver, helper, stops, revenue) and the
 * ordered stop list the driver takes on the road. Weisiang's decision (Mr Lim,
 * WhatsApp 2026-10-22); Jess was not part of this decision. A snapshot read of
 * the delivery dates and confirmed crew, never a second goods record.
 */
export default function FleetRunSheetPrintPage() {
  const [params] = useSearchParams();
  const day = params.get("day") ?? "";
  const lorry = params.get("lorry");
  const q = useFleet(day);
  const runs = useMemo(
    () => groupRuns(q.data?.stops ?? []).filter((r) => !lorry || (lorry === "none" ? r.vehicleId === null : r.vehicleId === lorry)),
    [q.data, lorry],
  );
  if (q.isLoading) return <div className="p-8 text-body">Loading…</div>;
  if (q.isError || !q.data) return <div role="alert" className="p-8 text-body">{FL.failed}</div>;
  const crewName = (id: string | null | undefined) => q.data!.crew.find((c) => c.id === id)?.name ?? "";

  return (
    <>
      <style>{`
        @media print { @page { size: A4; margin: 12mm; } .no-print { display: none !important; } .sheet { page-break-after: always; } }
        .rs td, .rs th { border: 1px solid #d1d5db; padding: 4px 6px; text-align: left; vertical-align: top; }
        .rs { border-collapse: collapse; width: 100%; font-size: 11px; }
      `}</style>
      <div className="no-print" style={{ position: "fixed", top: 12, right: 12 }}>
        <button onClick={() => window.print()} style={{ padding: "6px 14px", border: "1px solid #1a1a1a", borderRadius: 6 }}>Print</button>
      </div>
      {runs.length === 0 ? <p style={{ padding: 32 }}>No stops on {fmtDate(day, { year: "always" })}.</p> : null}
      {runs.map((run) => {
        const crew = q.data!.crewDays.find((c) => c.day === day && c.vehicleId === run.vehicleId);
        return (
          <section key={run.vehicleId ?? "none"} className="sheet" style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px", fontSize: 12 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>{FL.runSheet} · {run.plate ?? FL.noLorryMatched}</h1>
            <p>
              {FL.day} {fmtDate(day, { year: "always" })} · {FL.driver} {crewName(crew?.driverId) || FL.noDriver} · {FL.helper}{" "}
              {crewName(crew?.helperId) || FL.noHelper} · {FL.stops} {run.stops.length} · {FL.revenue} {rm(run.revenue)}
            </p>
            <table className="rs" style={{ marginTop: 10 }}>
              <thead>
                <tr><th>No.</th><th>Sales Order</th><th>Customer</th><th>Address</th><th>Phone</th><th>Time</th><th>{FL.revenue}</th><th>Signed</th></tr>
              </thead>
              <tbody>
                {run.stops.map((s, i) => (
                  <tr key={`${s.orderId}-${s.leg}`}>
                    <td>{i + 1}</td>
                    <td>{s.so ? `SO-${s.so}` : ""}</td>
                    <td>{s.customerName}</td>
                    <td>{s.customerAddress ?? ""}</td>
                    <td>{s.customerPhone ?? ""}</td>
                    <td>{[s.confirmedTime, s.expectedArrival].filter(Boolean).join(" · ")}</td>
                    <td>{rm(s.revenue)}</td>
                    <td style={{ width: 90 }} />
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </>
  );
}
