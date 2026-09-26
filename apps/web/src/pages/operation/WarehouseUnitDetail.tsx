import { Link, useParams, useNavigate } from "react-router-dom";
import {
  inventoryStatusOf,
  stockConditionOf,
  stockSiteVisits,
  UNIT_LIFECYCLE_OUTCOME_LABEL,
  UNIT_OWNERSHIP_LABEL,
  type UnitLifecycleOutcome,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import { useStockMovementEvidence, useStockUnit } from "@/lib/queries";
import ModuleHeader from "./components/ModuleHeader";

/**
 * THE UNIT — one exact physical thing Carres controls.
 * CARD-2026-08-20-stock-register §2 · Object Detail Template (UI MASTER §4.1).
 *
 * Titled by the Unit ID ALONE. It used to read `{unitCode} · {sku}`, which put two
 * facts in the one slot UI MASTER §6.7 rules is "one short identity, the word
 * alone" — and on a 390px canvas that identity took four lines and a 137px row.
 * The SKU is not lost: it is printed under Product in Connected records below,
 * beside the product name, which is where the rest of the object's facts live.
 *
 * ── ONLY FACT-PERMITTED ACTIONS APPEAR, AND TODAY THAT IS NONE ──────────────
 * There is no generic Edit, no status selector and no Delete (Card §2, Stock
 * MASTER §7). There is also no reservation control: binding and releasing an
 * exact Unit are the SALES ORDER's decisions and Stock exposes no second
 * reservation editor (Stock MASTER §4).
 *
 * 0366 shipped five governed doors that could legitimately live here — set site,
 * set holder, set ownership, verify, set condition. They are NOT wired in this
 * card, and that is a scope choice rather than an oversight: this card's
 * acceptance boundary is the Register replacing On hand, and every one of those
 * doors needs its own confirmation copy, permission surface and evidence rule.
 * Wiring them half-way would put five buttons on screen whose refusals nobody
 * had designed. They are recorded as the next Warehouse scope.
 */

/** The lineage's own words. Every one names a PHYSICAL change, because that is
 *  all `stock_unit_events` records (0366). */
const EVENT_LABEL: Record<string, string> = {
  unit_created: "Unit created",
  unit_born: "Unit created",
  status_changed: "Status changed",
  protection_changed: "Protection changed",
  verified: "Verified",
  availability_changed: "Availability changed",
  site_changed: "Moved site",
  holder_changed: "Handed over",
  condition_changed: "Condition changed",
  reservation_changed: "Reservation changed",
  ownership_changed: "Ownership changed",
};

export default function WarehouseUnitDetail({ unitCode: selectedCode, onBack }: {
  unitCode?: string;
  onBack?: () => void;
} = {}) {
  const { unitCode: routeCode } = useParams<{ unitCode: string }>();
  const unitCode = selectedCode ?? routeCode;
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useStockUnit(unitCode);

  const unit = data?.unit;
  const physical = useStockMovementEvidence(unit?.unitCode);
  const movement = stockSiteVisits(physical.data?.evidence ?? []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ModuleHeader
        testId="stock-unit-destination-header"
        word={unit?.unitCode ?? "Unit"}
        docTitle={unit ? `${unit.unitCode} · Warehouse — Carres` : "Unit · Warehouse — Carres"}
        destinationHeader
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-9 py-6" data-testid="stock-unit-detail">
        <button
          type="button"
          onClick={onBack ?? (() => navigate("/operation?tab=stock-onhand"))}
          className="mb-4 text-meta text-base-500 hover:text-base-800"
        >
          ← Inventory
        </button>

        {isLoading ? (
          <p className="text-body text-base-500">Loading…</p>
        ) : isError ? (
          <div className="rounded-md border border-base-200 bg-white p-6">
            <p className="text-body text-base-800">
              {(error as { status?: number } | undefined)?.status === 404
                ? "No Unit carries that ID."
                : "This Unit could not be loaded."}
            </p>
            {(error as Error | undefined)?.message ? (
              <p className="mt-1 text-meta text-base-500">{(error as Error).message}</p>
            ) : null}
          </div>
        ) : unit ? (
          <div className="space-y-4">
            {/* ── STOCK DETAILS — owner words 2026-09-25 ─────────────────── */}
            <section className="rounded-md border border-base-200 bg-white">
              <header className="border-b border-base-100 px-4 py-2.5">
                <h2 className="text-label font-semibold text-base-900">Stock Details</h2>
              </header>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-3 px-4 py-4 md:grid-cols-3">
                <Fact label="Inventory Status">
                  {inventoryStatusOf(unit) ??
                    UNIT_LIFECYCLE_OUTCOME_LABEL[unit.lifecycleOutcome as UnitLifecycleOutcome] ??
                    unit.lifecycleOutcome}
                </Fact>
                <Fact label="Stock Condition">{stockConditionOf(unit)}</Fact>
                <Fact label="Stock Location">{unit.siteName ?? <Absent>Not recorded</Absent>}</Fact>
                <Fact label="Ownership">
                  {UNIT_OWNERSHIP_LABEL[unit.ownership as keyof typeof UNIT_OWNERSHIP_LABEL] ?? unit.ownership}
                </Fact>
                <Fact label="Goods Received Date">
                  {unit.goodsReceivedDate ? fmtDate(unit.goodsReceivedDate) : <Absent>Not received</Absent>}
                </Fact>
                <Fact label="Item">
                  {unit.productName ?? unit.sku}
                  <div className="text-meta text-base-500">{unit.sku}{unit.category ? ` · ${unit.category}` : ""}</div>
                </Fact>
                {unit.shipDate ? (
                  <>
                    <Fact label="Ship Date">{fmtDate(unit.shipDate)}</Fact>
                    <Fact label="Pickup By">{unit.pickupBy ?? <Absent>Not recorded</Absent>}</Fact>
                    <Fact label="Delivery Location">{unit.deliveryLocation ?? <Absent>Not recorded</Absent>}</Fact>
                  </>
                ) : null}
                {unit.qty > 1 ? (
                  <Fact label="Pieces in this record" span>
                    <span className="text-kit-amber-11">
                      {unit.qty} pieces — this record stands for all of them, so no
                      Sales Order can promise one of them by itself.
                    </span>
                  </Fact>
                ) : null}
              </dl>
            </section>

            {/* ── DOCUMENTS ──────────────────────────────────────────────── */}
            <section className="rounded-md border border-base-200 bg-white">
              <header className="border-b border-base-100 px-4 py-2.5">
                <h2 className="text-label font-semibold text-base-900">Documents</h2>
              </header>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-3 px-4 py-4 md:grid-cols-3">
                <Fact label="PO No / Ref No">
                  {unit.poNo ? (
                    <Link className="font-mono text-kit-blue-11 hover:underline" to={`/operation/procurement?po=${encodeURIComponent(unit.poNo)}`}>{unit.poNo}</Link>
                  ) : (
                    <Absent>Not recorded</Absent>
                  )}
                </Fact>
                <Fact label="PO Doc Date">{unit.poDate ? fmtDate(unit.poDate) : <Absent>Not recorded</Absent>}</Fact>
                <Fact label="Supplier">{unit.supplier ?? <Absent>Not recorded</Absent>}</Fact>
                <Fact label="SO No">
                  {unit.reservedRef ? (
                    unit.soldOrderId ? <Link className="font-mono text-kit-blue-11 hover:underline" to={`/operation/orders/${encodeURIComponent(unit.soldOrderId)}`}>{unit.reservedRef}</Link> : <span className="font-mono">{unit.reservedRef}</span>
                  ) : (
                    <Absent>No SO</Absent>
                  )}
                </Fact>
                <Fact label="SO Date">{unit.soDate ? fmtDate(unit.soDate) : <Absent>No SO</Absent>}</Fact>
              </dl>
            </section>

            <section className="rounded-md border border-base-200 bg-white">
              <header className="border-b border-base-100 px-4 py-2.5">
                <h2 className="text-label font-semibold text-base-900">Site visits</h2>
              </header>
              {physical.isLoading ? <p className="px-4 py-4 text-meta text-base-500">Loading physical receipts and departures…</p> : physical.isError ? <div className="px-4 py-4 text-meta text-base-500">Physical receipt and departure evidence could not be loaded. <button className="text-kit-blue-11 hover:underline" onClick={() => void physical.refetch()}>Try again</button></div> : <>
                {movement.visits.length === 0 ? <p className="px-4 py-4 text-meta text-base-500">No physical receipt recorded. PO issue dates are not receipt dates.</p> : (
                  <ul className="divide-y divide-base-100">
                    {movement.visits.map(({ receipt, departure }) => (
                      <li key={receipt.id} className="space-y-2 px-4 py-4 text-meta">
                        <h3 className="font-semibold text-base-900">{receipt.siteName ?? "Site not recorded"}</h3>
                        <p>Received {fmtDate(receipt.at)} · <button className="text-kit-blue-11 hover:underline" onClick={() => navigate(receipt.href)}>{receipt.reference}</button></p>
                        <p>{departure ? <>Departed {fmtDate(departure.at, { time: true })} · <button className="text-kit-blue-11 hover:underline" onClick={() => navigate(departure.href)}>{departure.reference}</button></> : "Departure not paired with this receipt"}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {movement.unpairedDepartures.length > 0 && <div className="space-y-2 border-t border-base-100 px-4 py-4 text-meta">
                  <h3 className="font-semibold text-base-900">Departures without a matching Site receipt</h3>
                  <p className="text-base-500">These records do not establish a same-Site visit. The current Site cannot supply a missing historical Site.</p>
                  {movement.unpairedDepartures.map((departure) => <p key={departure.id}>{fmtDate(departure.at, { time: true })} · <button className="text-kit-blue-11 hover:underline" onClick={() => navigate(departure.href)}>{departure.reference}</button> · {departure.siteName ?? "Site not recorded"}</p>)}
                </div>}
              </>}
            </section>

            {/* ── HISTORY ────────────────────────────────────────────────── */}
            <section className="rounded-md border border-base-200 bg-white">
              <header className="border-b border-base-100 px-4 py-2.5">
                <h2 className="text-label font-semibold text-base-900">History</h2>
              </header>
              {data.events.length === 0 ? (
                <p className="px-4 py-4 text-meta text-base-500">
                  No changes recorded.
                </p>
              ) : (
                <ul className="divide-y divide-base-100">
                  {data.events.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-baseline gap-3 px-4 py-2.5">
                      <span className="w-44 shrink-0 text-meta text-base-500">
                        {fmtDate(e.eventAt, { time: true })}
                      </span>
                      <span className="text-meta text-base-900">
                        {EVENT_LABEL[e.event] ?? e.event}
                      </span>
                      {e.fromValue || e.toValue ? (
                        <span className="text-meta text-base-600">
                          {e.fromValue ?? "—"} → {e.toValue ?? "—"}
                        </span>
                      ) : null}
                      {e.note ? <span className="text-meta text-base-500">{e.note}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : (
          /* An operator who scans something we cannot resolve must be TOLD so.
             This branch is reached whenever the read settled with no Unit —
             an unknown code, and (since 0453) a counted row's technical key,
             which is deliberately not addressable because nothing was ever
             printed for it. A blank screen is not an answer. */
          <div
            className="rounded-md border border-base-200 bg-white p-6"
            data-testid="stock-unit-not-found"
          >
            <p className="text-body text-base-800">No Unit carries that ID.</p>
            <p className="mt-1 text-meta text-base-500">
              Check the label and search again from Inventory.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({
  label,
  children,
  span,
}: {
  label: string;
  children: React.ReactNode;
  span?: boolean;
}) {
  return (
    <div className={span ? "col-span-2 md:col-span-3" : undefined}>
      <dt className="text-[11px] uppercase tracking-wide text-base-500">{label}</dt>
      <dd className="mt-0.5 text-body text-base-900">{children}</dd>
    </div>
  );
}

/** A fact nobody has recorded is shown as absent, never as a plausible value. */
function Absent({ children }: { children: React.ReactNode }) {
  return <span className="text-base-400">{children}</span>;
}
