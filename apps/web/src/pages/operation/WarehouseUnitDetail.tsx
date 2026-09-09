import { useParams, useNavigate } from "react-router-dom";
import {
  availabilityLabel,
  UNIT_LIFECYCLE_OUTCOME_LABEL,
  UNIT_OWNERSHIP_LABEL,
  type UnitAvailability,
  type UnitLifecycleOutcome,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import { useStockUnit } from "@/lib/queries";
import ModuleHeader from "./components/ModuleHeader";

/**
 * THE UNIT — one exact physical thing Carres controls.
 * CARD-2026-08-20-stock-register §2 · Object Detail Template (UI MASTER §4.1).
 *
 * Titled by the Unit ID and the product, because that is what is printed on the
 * supplier's label and what the operator has in their hand.
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

const CONDITION_LABEL: Record<string, string> = {
  new: "New",
  exhibition: "Display",
  old: "Fair (used)",
  refurbished: "Refurbished",
  damaged: "Damaged",
};

const AVAILABILITY_DOT: Record<UnitAvailability, string> = {
  available: "bg-kit-green-11",
  reserved: "bg-kit-blue-9",
  incoming: "bg-kit-slate-9",
  in_transit: "bg-kit-amber-11",
  not_available: "bg-kit-red-9",
  ended: "bg-kit-slate-5",
};

/** The lineage's own words. Every one names a PHYSICAL change, because that is
 *  all `stock_unit_events` records (0366). */
const EVENT_LABEL: Record<string, string> = {
  unit_created: "Unit created",
  availability_changed: "Availability changed",
  site_changed: "Moved site",
  holder_changed: "Handed over",
  condition_changed: "Condition changed",
  reservation_changed: "Reservation changed",
  ownership_changed: "Ownership changed",
};

export default function WarehouseUnitDetail() {
  const { unitCode } = useParams<{ unitCode: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useStockUnit(unitCode);

  const unit = data?.unit;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ModuleHeader
        testId="stock-unit-destination-header"
        word={unit ? `${unit.unitCode} · ${unit.sku}` : "Unit"}
        docTitle={unit ? `${unit.unitCode} · Warehouse — Carres` : "Unit · Warehouse — Carres"}
        destinationHeader
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-9 py-6" data-testid="stock-unit-detail">
        <button
          type="button"
          onClick={() => navigate("/operation/stock")}
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
            {/* ── CURRENT FACTS ──────────────────────────────────────────── */}
            <section className="rounded-md border border-base-200 bg-white">
              <header className="border-b border-base-100 px-4 py-2.5">
                <h2 className="text-label font-semibold text-base-900">Where it is now</h2>
              </header>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-3 px-4 py-4 md:grid-cols-3">
                <Fact label="Availability">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${AVAILABILITY_DOT[unit.availability]}`} />
                    {availabilityLabel(unit.availability)}
                  </span>
                </Fact>
                <Fact label="Where">{unit.siteName ?? "—"}</Fact>
                <Fact label="Who has it">
                  {unit.holderName ?? <Absent>Not recorded</Absent>}
                </Fact>
                <Fact label="Ownership">
                  {UNIT_OWNERSHIP_LABEL[unit.ownership as keyof typeof UNIT_OWNERSHIP_LABEL] ?? unit.ownership}
                </Fact>
                <Fact label="Condition">
                  {CONDITION_LABEL[unit.condition] ?? unit.condition}
                  {unit.needsRepair ? " · in repair" : ""}
                </Fact>
                <Fact label="Last verified">
                  {unit.lastVerifiedAt ? (
                    fmtDate(unit.lastVerifiedAt, { time: true })
                  ) : (
                    <Absent>Never verified</Absent>
                  )}
                </Fact>
                {unit.qty > 1 ? (
                  <Fact label="Pieces in this record" span>
                    <span className="text-kit-amber-11">
                      {unit.qty} pieces — this record stands for all of them, so no
                      Sales Order can promise one of them by itself.
                    </span>
                  </Fact>
                ) : null}
                {unit.lifecycleOutcome !== "active" ? (
                  <Fact label="How its life ended" span>
                    {UNIT_LIFECYCLE_OUTCOME_LABEL[unit.lifecycleOutcome as UnitLifecycleOutcome] ??
                      unit.lifecycleOutcome}
                  </Fact>
                ) : null}
              </dl>
            </section>

            {/* ── WHERE IT CAME FROM, AND WHO IT IS FOR ──────────────────── */}
            <section className="rounded-md border border-base-200 bg-white">
              <header className="border-b border-base-100 px-4 py-2.5">
                <h2 className="text-label font-semibold text-base-900">Connected records</h2>
              </header>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-3 px-4 py-4 md:grid-cols-3">
                <Fact label="Product">{unit.sku}</Fact>
                <Fact label="Category">
                  {unit.category ?? <Absent>Not in catalog</Absent>}
                </Fact>
                <Fact label="Supplier">{unit.supplier ?? <Absent>—</Absent>}</Fact>
                <Fact label="Source order">
                  {unit.poNo ? (
                    <span className="font-mono">{unit.poNo}</span>
                  ) : (
                    <Absent>No purchase order</Absent>
                  )}
                </Fact>
                <Fact label="Came in">{unit.dateIn ?? <Absent>—</Absent>}</Fact>
                <Fact label="Promised to">
                  {unit.reservedRef ? (
                    <span className="font-mono">{unit.reservedRef}</span>
                  ) : (
                    <Absent>Not promised</Absent>
                  )}
                </Fact>
              </dl>
            </section>

            {/* ── IN & OUT ───────────────────────────────────────────────── */}
            <section className="rounded-md border border-base-200 bg-white">
              <header className="border-b border-base-100 px-4 py-2.5">
                <h2 className="text-label font-semibold text-base-900">In &amp; out</h2>
              </header>
              {data.events.length === 0 ? (
                <p className="px-4 py-4 text-meta text-base-500">
                  Nothing recorded yet. Every physical change — received, moved,
                  handed over, counted, inspected — is written here and can never
                  be edited or deleted.
                </p>
              ) : (
                <ul className="divide-y divide-base-100">
                  {data.events.map((e) => (
                    <li key={e.id} className="flex items-baseline gap-3 px-4 py-2.5">
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
