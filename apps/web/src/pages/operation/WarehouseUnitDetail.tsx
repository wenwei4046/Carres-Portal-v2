import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  inventoryStatusOf,
  makeAvailableChecks,
  stockConditionOf,
  stockSiteVisits,
  UNIT_LIFECYCLE_OUTCOME_LABEL,
  UNIT_OWNERSHIP_LABEL,
  type StockRegisterUnit,
  type UnitLifecycleOutcome,
  goodsReceivedAbsence,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import { ApiError, apiFetch } from "@/lib/api";
import { useStockMovementEvidence, useStockUnit } from "@/lib/queries";
import Button from "@/components/kit/Button";
import Modal from "@/components/kit/Modal";
import SalesOrderTabs from "./SalesOrderTabs";
import { Block } from "./SalesOrderWorkspace";
import WarehouseUnitProblemReport from "./WarehouseUnitProblemReport";

/**
 * THE UNIT — one exact physical thing Carres controls.
 * Object Detail Template (UI MASTER §4.1) in the Sales Order page's grammar —
 * owner ruling 2026-09-26: the same header (`← Inventory | {Unit ID} · {Item}
 * | ⋮`) and the same blue-titled blocks, because a second lookalike header
 * is exactly what Law C forbids.
 *
 * Four sections, the owner's words (Stock MASTER §7, 2026-09-25):
 *   Stock Details · Documents · Current work · History
 * and the header `⋮` holds exactly three acts:
 *   Report a problem                     always
 *   Make available for sale              only while the Unit is `Cannot sell`
 *   Count again                          only after a `Not found` report
 * No Edit, no status selector, no Delete, no reservation control — binding an
 * exact Unit is the Sales Order's decision (Stock MASTER §4).
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

export interface UnitIssue {
  id: string;
  issueNo: string;
  status: string;
  observedProblem: string;
  officialEnglish: string;
  observedOn: string;
  currentAction: {
    id: string;
    trigger: string;
    ownerRule: string;
    action: string;
    recipient: string;
    requiredResult: string;
    dueOn: string;
  } | null;
}

const OWNER_RULE_WORD: Record<string, string> = {
  grn_duty: "GRN Duty",
  issue_triage_duty: "Issue Triage Duty",
  issue_review_approver: "Issue Review Approver",
};

export function useUnitOpenIssues(unitCode: string | undefined) {
  return useQuery<{ issues: UnitIssue[] }, ApiError>({
    queryKey: ["operation", "stock-unit-issues", unitCode ?? ""],
    queryFn: () => apiFetch(`/api/ops/stock/register/${encodeURIComponent(unitCode!)}/issues`),
    enabled: Boolean(unitCode),
    staleTime: 15_000,
  });
}

export default function WarehouseUnitDetail({ unitCode: selectedCode, onBack }: {
  unitCode?: string;
  onBack?: () => void;
} = {}) {
  const { unitCode: routeCode } = useParams<{ unitCode: string }>();
  const unitCode = selectedCode ?? routeCode;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useStockUnit(unitCode);

  const unit = data?.unit;
  const physical = useStockMovementEvidence(unit?.unitCode);
  const movement = stockSiteVisits(physical.data?.evidence ?? []);
  const issuesQ = useUnitOpenIssues(unit?.unitCode);
  const openIssues = issuesQ.data?.issues ?? [];
  const notFoundOpen = openIssues.some((i) => i.observedProblem === "missing" && i.currentAction);

  const [problemOpen, setProblemOpen] = useState(false);
  const [availableOpen, setAvailableOpen] = useState(false);
  const [countOpen, setCountOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["operation", "stock-unit", unitCode ?? ""] });
    void qc.invalidateQueries({ queryKey: ["operation", "stock-unit-issues", unitCode ?? ""] });
    void qc.invalidateQueries({ queryKey: ["operation", "stock-register"] });
  };

  const item = unit ? unit.productName ?? unit.sku : null;
  const status = unit
    ? inventoryStatusOf(unit) ?? UNIT_LIFECYCLE_OUTCOME_LABEL[unit.lifecycleOutcome as UnitLifecycleOutcome] ?? unit.lifecycleOutcome
    : null;
  const cannotSell = status === "Cannot sell";

  const back = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (onBack) {
      event.preventDefault();
      onBack();
    }
  };

  /* `⋮` LAST, ICON ONLY — its accessible name and tooltip are `More actions`
     (owner ruling 2026-09-21, the Sales Order page). Only fact-permitted acts
     appear: a door that would refuse is not drawn. */
  const menu = unit ? (
    <details className="relative" data-testid="unit-more-actions">
      <summary className="btn-ghost cursor-pointer list-none px-2 text-body" aria-label="More actions" title="More actions">⋮</summary>
      <div className="absolute right-0 top-full z-20 mt-1 w-60 rounded-control border border-kit-slate-5 bg-white p-1 shadow-lg">
        <MenuItem testId="unit-report-problem" onClick={() => setProblemOpen(true)}>Report a problem</MenuItem>
        {cannotSell ? <MenuItem testId="unit-make-available" onClick={() => setAvailableOpen(true)}>Make available for sale</MenuItem> : null}
        {notFoundOpen ? <MenuItem testId="unit-count-again" onClick={() => setCountOpen(true)}>Count again</MenuItem> : null}
      </div>
    </details>
  ) : null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <SalesOrderTabs
        identity={unit?.unitCode ?? unitCode ?? "Unit"}
        customer={item}
        backTo="/operation?tab=stock-onhand"
        backLabel="Inventory"
        onBack={back}
        docTitle={unit ? `${unit.unitCode} · Warehouse — Carres` : "Unit · Warehouse — Carres"}
        right={menu}
      />
      <div className="min-h-0 flex-1 overflow-y-auto bg-kit-slate-3 px-4 py-4" data-testid="stock-unit-detail">
        {done ? (
          <p role="status" className="mb-4 rounded-control border border-kit-slate-5 bg-kit-green-3 px-3 py-2 text-body text-kit-green-11" data-testid="unit-action-done">
            {done}
          </p>
        ) : null}

        {isLoading ? (
          <p className="text-body text-base-500">Loading…</p>
        ) : isError ? (
          <div className="rounded-card border border-kit-slate-5 bg-white p-6">
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
          <div className="flex flex-col gap-6">
            {/* ── STOCK DETAILS — owner words 2026-09-25 ─────────────────── */}
            <Block titleTone="sales-order" title="Stock Details">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Fact label="Inventory Status">{status}</Fact>
                <Fact label="Stock Condition">{stockConditionOf(unit)}</Fact>
                <Fact label="Stock Location">{unit.siteName ?? <Absent>Not recorded</Absent>}</Fact>
                <Fact label="Goods Received Date">
                  {unit.goodsReceivedDate ? fmtDate(unit.goodsReceivedDate) : <Absent>{goodsReceivedAbsence(unit)}</Absent>}
                </Fact>
                <Fact label="Item">
                  {unit.productName ?? unit.sku}
                  <div className="text-meta text-base-500">{unit.sku}{unit.category ? ` · ${unit.category}` : ""}</div>
                </Fact>
                <Fact label="Ownership">
                  {UNIT_OWNERSHIP_LABEL[unit.ownership as keyof typeof UNIT_OWNERSHIP_LABEL] ?? unit.ownership}
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
                      {unit.qty} pieces. This record stands for all of them, so no
                      Sales Order can promise one of them by itself.
                    </span>
                  </Fact>
                ) : null}
              </div>
            </Block>

            {/* ── DOCUMENTS ──────────────────────────────────────────────── */}
            <Block titleTone="sales-order" title="Documents">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                    unit.soldOrderId ? (
                      <Link className="font-mono text-kit-blue-11 hover:underline" to={`/operation/orders/${encodeURIComponent(unit.soldOrderId)}`}>{unit.reservedRef}</Link>
                    ) : (
                      /* An old reference (CR/TCF/DL) names an order this portal
                         never held — say so instead of pretending it is absent. */
                      <span className="font-mono">{unit.reservedRef} <span className="font-sans text-base-500">· not in this portal</span></span>
                    )
                  ) : (
                    <Absent>No SO</Absent>
                  )}
                </Fact>
                <Fact label="SO Date">
                  {unit.soDate ? fmtDate(unit.soDate) : unit.reservedRef ? <Absent>Not recorded</Absent> : <Absent>No SO</Absent>}
                </Fact>
              </div>
            </Block>

            {/* ── CURRENT WORK — the one shared Work contract for this Unit ── */}
            <Block titleTone="sales-order" title="Current work">
              {issuesQ.isLoading ? (
                <p className="text-meta text-base-500">Loading…</p>
              ) : issuesQ.isError ? (
                <p className="text-meta text-base-500">
                  Work for this Unit could not be loaded.{" "}
                  <button type="button" className="text-kit-blue-11 hover:underline" onClick={() => void issuesQ.refetch()}>Try again</button>
                </p>
              ) : openIssues.length === 0 ? (
                <p className="text-body text-base-600" data-testid="unit-no-work">Nothing to do for this Unit.</p>
              ) : (
                <ul className="divide-y divide-kit-slate-5" data-testid="unit-current-work">
                  {openIssues.map((issue) => (
                    <li key={issue.id} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
                      <p className="text-body text-base-900">{issue.officialEnglish}</p>
                      {issue.currentAction ? (
                        <p className="text-meta text-base-700">
                          <span className="font-semibold text-base-900">{issue.currentAction.action}</span>
                          {" · "}{OWNER_RULE_WORD[issue.currentAction.ownerRule] ?? issue.currentAction.ownerRule}
                          {" · by "}{fmtDate(issue.currentAction.dueOn)}
                        </p>
                      ) : (
                        <p className="text-meta text-base-500">Waiting for review</p>
                      )}
                      <Link className="text-meta text-kit-blue-11 hover:underline" to={`/operation/issues?issue=${encodeURIComponent(issue.id)}`}>
                        {issue.issueNo}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Block>

            {/* ── HISTORY — append-only: receipts, departures, every change ── */}
            <Block titleTone="sales-order" title="History">
              <div className="flex flex-col gap-4">
                <section>
                  <h3 className="text-label text-kit-slate-11">Site visits</h3>
                  {physical.isLoading ? (
                    <p className="mt-1 text-meta text-base-500">Loading physical receipts and departures…</p>
                  ) : physical.isError ? (
                    <p className="mt-1 text-meta text-base-500">
                      Physical receipt and departure evidence could not be loaded.{" "}
                      <button type="button" className="text-kit-blue-11 hover:underline" onClick={() => void physical.refetch()}>Try again</button>
                    </p>
                  ) : (
                    <>
                      {movement.visits.length === 0 ? (
                        <p className="mt-1 text-meta text-base-500">No physical receipt recorded. PO issue dates are not receipt dates.</p>
                      ) : (
                        <ul className="mt-1 divide-y divide-kit-slate-5">
                          {movement.visits.map(({ receipt, departure }) => (
                            <li key={receipt.id} className="space-y-1 py-2 text-meta">
                              <p className="font-semibold text-base-900">{receipt.siteName ?? "Site not recorded"}</p>
                              <p>Received {fmtDate(receipt.at)} · <button type="button" className="text-kit-blue-11 hover:underline" onClick={() => navigate(receipt.href)}>{receipt.reference}</button></p>
                              <p>{departure ? <>Departed {fmtDate(departure.at, { time: true })} · <button type="button" className="text-kit-blue-11 hover:underline" onClick={() => navigate(departure.href)}>{departure.reference}</button></> : "Departure not paired with this receipt"}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                      {movement.unpairedDepartures.length > 0 && (
                        <div className="mt-2 space-y-1 text-meta">
                          <p className="font-semibold text-base-900">Departures without a matching Site receipt</p>
                          <p className="text-base-500">These records do not establish a same-Site visit. The current Site cannot supply a missing historical Site.</p>
                          {movement.unpairedDepartures.map((departure) => (
                            <p key={departure.id}>{fmtDate(departure.at, { time: true })} · <button type="button" className="text-kit-blue-11 hover:underline" onClick={() => navigate(departure.href)}>{departure.reference}</button> · {departure.siteName ?? "Site not recorded"}</p>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </section>

                <section>
                  <h3 className="text-label text-kit-slate-11">Changes</h3>
                  {data.events.length === 0 ? (
                    <p className="mt-1 text-meta text-base-500">No changes recorded.</p>
                  ) : (
                    <ul className="mt-1 divide-y divide-kit-slate-5">
                      {data.events.map((e) => (
                        <li key={e.id} className="flex flex-wrap items-baseline gap-3 py-2">
                          <span className="w-44 shrink-0 text-meta text-base-500">{fmtDate(e.eventAt, { time: true })}</span>
                          <span className="text-meta text-base-900">{EVENT_LABEL[e.event] ?? e.event}</span>
                          {/* No dash stands in for a value (owner ruling 2026-09-26):
                              a change with only a new value prints that value alone. */}
                          {e.fromValue && e.toValue ? (
                            <span className="text-meta text-base-600">{e.fromValue} → {e.toValue}</span>
                          ) : e.toValue ? (
                            <span className="text-meta text-base-600">{e.toValue}</span>
                          ) : e.fromValue ? (
                            <span className="text-meta text-base-600">was {e.fromValue}</span>
                          ) : null}
                          {e.note ? <span className="text-meta text-base-500">{e.note}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </Block>
          </div>
        ) : (
          /* An operator who scans something we cannot resolve must be TOLD so.
             This branch is reached whenever the read settled with no Unit —
             an unknown code, and (since 0453) a counted row's technical key,
             which is deliberately not addressable because nothing was ever
             printed for it. A blank screen is not an answer. */
          <div className="rounded-card border border-kit-slate-5 bg-white p-6" data-testid="stock-unit-not-found">
            <p className="text-body text-base-800">No Unit carries that ID.</p>
            <p className="mt-1 text-meta text-base-500">Check the label and search again from Inventory.</p>
          </div>
        )}
      </div>

      {unit && problemOpen ? (
        <WarehouseUnitProblemReport
          unit={unit}
          open={problemOpen}
          onOpenChange={setProblemOpen}
          onRecorded={(r) => {
            invalidate();
            setDone(
              r.protection === "held"
                ? `Problem recorded as ${r.issueNo}. ${unit.unitCode} now reads Cannot sell · Waiting inspection.`
                : `Problem recorded as ${r.issueNo}.`,
            );
          }}
        />
      ) : null}
      {unit && availableOpen ? (
        <MakeAvailableDialog
          unit={unit}
          openProblems={openIssues.length}
          open={availableOpen}
          onOpenChange={setAvailableOpen}
          onDone={() => {
            invalidate();
            setDone(`${unit.unitCode} is Available again. Sales sees its Stock Condition beside it.`);
          }}
        />
      ) : null}
      {unit && countOpen ? (
        <CountAgainDialog
          unit={unit}
          open={countOpen}
          onOpenChange={setCountOpen}
          onDone={(dueOn) => {
            invalidate();
            setDone(`${unit.siteName ?? "The Site"} will look for ${unit.unitCode} and scan it again by ${fmtDate(dueOn)}.`);
          }}
        />
      ) : null}
    </div>
  );
}

function MenuItem({ children, onClick, testId }: { children: React.ReactNode; onClick: () => void; testId: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // Close the `<details>` menu before the dialog takes over.
        (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
        onClick();
      }}
      data-testid={testId}
      className="w-full rounded-control px-2 py-1.5 text-left text-meta text-base-700 hover:bg-hovertint"
    >
      {children}
    </button>
  );
}

/** Make available for sale — every check is printed, and the one that fails
 *  says why (Stock MASTER §7). Confirm only when all of them pass. */
function MakeAvailableDialog({ unit, openProblems, open, onOpenChange, onDone }: {
  unit: StockRegisterUnit;
  openProblems: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [failure, setFailure] = useState<string | null>(null);
  const checks = makeAvailableChecks(unit, openProblems);
  const allPass = checks.every((c) => c.pass);
  const save = useMutation({
    mutationFn: () => apiFetch(`/api/ops/stock/register/${encodeURIComponent(unit.unitCode)}/make-available`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      setFailure(null);
      onOpenChange(false);
      onDone();
    },
    onError: (error) => setFailure(error instanceof ApiError && error.status === 409 ? error.message : "Not confirmed · Try again"),
  });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Make available for sale"
      description={`${unit.unitCode} · ${unit.productName ?? unit.sku} · Stock Condition ${stockConditionOf(unit)}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="neutral" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" disabled={!allPass} loading={save.isPending} onClick={() => save.mutate()} data-testid="unit-make-available-confirm">Confirm</Button>
        </div>
      }
    >
      {failure ? <p role="alert" className="mb-3 rounded-control border border-kit-red-9 bg-kit-red-3 px-3 py-2 text-body text-kit-red-11">{failure}</p> : null}
      <ul className="grid gap-2" data-testid="unit-make-available-checks">
        {checks.map((check) => (
          <li key={check.key} className="flex items-baseline gap-2 text-body">
            <span aria-hidden="true" className={check.pass ? "text-kit-green-11" : "text-kit-red-11"}>{check.pass ? "✓" : "✕"}</span>
            <span className="text-base-900">{check.label}</span>
            {!check.pass ? <span className="text-meta text-kit-red-11">· {check.why}</span> : null}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-meta text-base-600">
        Inventory Status returns to Available. Stock Condition stays {stockConditionOf(unit)}, so Sales sees exactly what it sells.
      </p>
    </Modal>
  );
}

/** Count again — a repeat look for a Unit an open `Not found` report names. */
function CountAgainDialog({ unit, open, onOpenChange, onDone }: {
  unit: StockRegisterUnit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (dueOn: string) => void;
}) {
  const [failure, setFailure] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => apiFetch<{ action: { dueOn: string } }>(`/api/ops/stock/register/${encodeURIComponent(unit.unitCode)}/count-again`, { method: "POST", body: "{}" }),
    onSuccess: (r) => {
      setFailure(null);
      onOpenChange(false);
      onDone(r.action.dueOn);
    },
    onError: (error) => setFailure(error instanceof ApiError && error.status === 409 ? error.message : "Not confirmed · Try again"),
  });
  const site = unit.siteName ?? "the Site";
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Count again"
      description={`${unit.unitCode} · ${unit.productName ?? unit.sku}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="neutral" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()} data-testid="unit-count-again-confirm">Count again</Button>
        </div>
      }
    >
      {failure ? <p role="alert" className="mb-3 rounded-control border border-kit-red-9 bg-kit-red-3 px-3 py-2 text-body text-kit-red-11">{failure}</p> : null}
      <p className="text-body text-base-800">
        {site} gets the work again: <span className="font-semibold">Look for {unit.unitCode} at {site} and scan it again</span>, due the next working day.
        Finding it closes the work; not finding it becomes a difference for GRN Duty to check.
      </p>
    </Modal>
  );
}

function Fact({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 ${span ? "sm:col-span-3" : ""}`}>
      <span className="text-label text-kit-slate-11">{label}</span>
      <div className="flex min-h-8 min-w-0 items-center break-words py-1 text-body text-base-900" data-kit="plain-fact">
        <span className="min-w-0">{children}</span>
      </div>
    </div>
  );
}

/** A fact nobody has recorded is shown as absent, never as a plausible value. */
function Absent({ children }: { children: React.ReactNode }) {
  return <span className="text-kit-slate-9">{children}</span>;
}
