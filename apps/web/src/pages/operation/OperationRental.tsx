// design-standard: not-a-list-page — dual registry (agreements + deployed
// units) with stat tiles on one page; not a single filterable list, so the
// ListPageShell single-list frame doesn't fit (same idiom family as
// OperationReceiving's sectioned tables).
import { useMemo } from "react";
import { useRentalAgreements, useRentalUnits } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import type { RentalAgreement, RentalStockUnit } from "@carres/shared/domain";

/**
 * OperationRental — the Rental + Service Plan base page (Loo 2026-07-25).
 *
 * Read-only registry over the 0249 living side: rent-to-own AGREEMENTS
 * (RA-1001…) and the rented-out asset registry of deployed UNITS (RU-1001…)
 * that have left the warehouse but are still Carres assets until ownership
 * transfers. DORMANT until the POS rental lane ships — nothing writes to these
 * tables yet, so the page reads empty in prod and the empty states say so.
 *
 * State vocabulary law: DB stage words NEVER leak — every status renders
 * through the display maps below (no underscores on screen).
 */

/** GET /api/rental/agreements enriches each agreement with the customer join. */
type AgreementListRow = RentalAgreement & {
  customerName: string | null;
  customerPhone: string | null;
};

/** DB agreement status → display word + v4 pill tone. Never leak raw words. */
const AGREEMENT_STATUS: Record<string, { label: string; pill: string }> = {
  active: { label: "Active", pill: "pill-confirmed" },
  buyout_pending: { label: "Buyout", pill: "pill-warning" },
  completed: { label: "Completed", pill: "pill-sent" },
  ownership_transferred: { label: "Owned", pill: "pill-collected" },
  defaulted: { label: "Defaulted", pill: "pill-overdue" },
  repossessed: { label: "Repossessed", pill: "pill-warning" },
  cancelled: { label: "Cancelled", pill: "pill-neutral" },
};

/** DB unit status → display word + v4 pill tone. */
const UNIT_STATUS: Record<string, { label: string; pill: string }> = {
  allocated: { label: "Allocated", pill: "pill-sent" },
  in_rental: { label: "In rental", pill: "pill-confirmed" },
  returned: { label: "Returned", pill: "pill-neutral" },
  refurbishing: { label: "Refurbishing", pill: "pill-warning" },
  transferred: { label: "Owned by customer", pill: "pill-collected" },
  retired: { label: "Retired", pill: "pill-neutral" },
};

/** Defensive fallback: an unmapped DB word still never shows underscores. */
function statusDisplay(
  map: Record<string, { label: string; pill: string }>,
  s: string,
): { label: string; pill: string } {
  return (
    map[s] ?? {
      label: s.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase()),
      pill: "pill-neutral",
    }
  );
}


export default function OperationRental() {
  const agreementsQ = useRentalAgreements();
  const unitsQ = useRentalUnits();

  const agreements = useMemo<AgreementListRow[]>(
    () => agreementsQ.data?.agreements ?? [],
    [agreementsQ.data],
  );
  const units = useMemo<RentalStockUnit[]>(
    () => unitsQ.data?.units ?? [],
    [unitsQ.data],
  );

  /** Resolve a unit's linked agreement number from the agreements payload. */
  const agreementNoById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agreements) m.set(a.id, a.agreementNo);
    return m;
  }, [agreements]);

  const activeAgreements = agreements.filter((a) => a.status === "active").length;
  const unitsInRental = units.filter((u) => u.status === "in_rental").length;

  const isPending = agreementsQ.isPending || unitsQ.isPending;
  const loadError = agreementsQ.error ?? unitsQ.error;

  if (isPending) {
    return (
      <div className="px-9 py-8 pb-14">
        <div data-testid="operation-rental-skeleton">
          <div className="h-9 w-1/3 bg-base-100 rounded animate-pulse mb-6" />
          <div className="bg-white border border-base-200 rounded">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-11 border-b border-base-100 animate-pulse bg-base-50/40"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="px-9 py-8 pb-14">
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm">
          <div className="text-destructive font-semibold mb-2">
            Couldn&rsquo;t load rental data
          </div>
          <div className="text-[12px] text-base-700">
            {(loadError as Error | undefined)?.message ?? "Unknown error"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-9 py-8 pb-14" data-testid="operation-rental">
      {/* Header */}
      <div className="mb-[18px]">
        <div className="kicker">Operations</div>
        <h1 className="t-h1 font-display mt-1.5">Rental</h1>
        <div className="text-[13px] text-base-600 mt-1.5">
          Rent-to-own agreements and the deployed units Carres still owns.
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-3 gap-3 mb-7 max-w-[680px]">
        <StatTile label="Active agreements" value={String(activeAgreements)} />
        <StatTile label="Units in rental" value={String(unitsInRental)} />
        <StatTile label="Visits due" value="—" />
      </div>

      {/* AGREEMENTS */}
      <section className="mb-8" data-testid="rental-agreements-section">
        <div className="flex items-baseline gap-2 mb-2.5">
          <h2 className="t-h3">Agreements</h2>
          <span className="text-[12px] text-base-500">{agreements.length}</span>
        </div>
        <div className="bg-white border border-base-200 rounded overflow-auto">
          <table
            className="w-full border-collapse text-[13px]"
            style={{ minWidth: 880 }}
          >
            <thead className="bg-base-700 border-b-2 border-primary text-white">
              <tr>
                <Th>Agreement</Th>
                <Th>Customer</Th>
                <Th>SKU</Th>
                <Th>Monthly</Th>
                <Th>Start</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {agreements.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-12 text-center text-[12px] text-base-500"
                  >
                    No rental agreements yet — the POS rental lane ships next.
                  </td>
                </tr>
              )}
              {agreements.map((a) => {
                const st = statusDisplay(AGREEMENT_STATUS, a.status);
                return (
                  <tr
                    key={a.id}
                    className="border-t border-base-100 align-top hover:bg-hovertint"
                    data-testid="rental-agreement-row"
                  >
                    <td className="px-4 py-3 whitespace-nowrap font-mono font-semibold text-base-900">
                      {a.agreementNo}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-base-800">
                        {a.customerName ?? <span className="text-base-400">—</span>}
                      </div>
                      {a.customerPhone && (
                        <div className="text-[12px] font-mono text-base-500 mt-0.5">
                          {a.customerPhone}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-base-700">
                      {a.sku}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap t-num text-base-800">
                      {`${rm(a.monthlyFee)}/mo · ${a.termMonths} mo`}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-base-700">
                      {fmtDate(a.startDate)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`pill ${st.pill}`}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* UNITS */}
      <section data-testid="rental-units-section">
        <div className="flex items-baseline gap-2 mb-2.5">
          <h2 className="t-h3">Units</h2>
          <span className="text-[12px] text-base-500">{units.length}</span>
        </div>
        <div className="bg-white border border-base-200 rounded overflow-auto">
          <table
            className="w-full border-collapse text-[13px]"
            style={{ minWidth: 880 }}
          >
            <thead className="bg-base-700 border-b-2 border-primary text-white">
              <tr>
                <Th>Unit</Th>
                <Th>SKU</Th>
                <Th>Status</Th>
                <Th>Deployed</Th>
                <Th>Warranty until</Th>
                <Th>Agreement</Th>
              </tr>
            </thead>
            <tbody>
              {units.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-12 text-center text-[12px] text-base-500"
                  >
                    No rental units yet — units are registered here when the
                    first agreement deploys.
                  </td>
                </tr>
              )}
              {units.map((u) => {
                const st = statusDisplay(UNIT_STATUS, u.status);
                const linkedNo = u.agreementId
                  ? agreementNoById.get(u.agreementId) ?? null
                  : null;
                return (
                  <tr
                    key={u.id}
                    className="border-t border-base-100 align-top hover:bg-hovertint"
                    data-testid="rental-unit-row"
                  >
                    <td className="px-4 py-3 whitespace-nowrap font-mono font-semibold text-base-900">
                      {u.unitCode}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-base-700">
                      {u.sku}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`pill ${st.pill}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-base-700">
                      {fmtDate(u.deployedAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-base-700">
                      {fmtDate(u.warrantyUntil)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-base-700">
                      {linkedNo ?? <span className="text-base-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi-box" data-testid={`rental-tile-${label}`}>
      <div className="label text-base-500">{label}</div>
      <div className="text-[18px] font-bold t-num text-base-900 mt-1">
        {value}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.02em] text-white text-left">
      {children}
    </th>
  );
}
