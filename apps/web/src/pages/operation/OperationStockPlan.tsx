// design-standard: not-a-list-page — a SECTIONED cycle page (plan header +
// coverage note + the plan grid + the approved PO list), not a single
// browsable register, so the ListPageShell single-list frame would tell the
// wrong story. Same idiom family as OperationRental / OperationReceiving, and
// it matches its two sibling Stock tabs.
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { ClipboardList, Check, X, TriangleAlert, Plus } from "lucide-react";
import { PLAN_STATUS_LABEL, type OpsStockPlanRow, type PlanStatus } from "@carres/shared";
import {
  useStockPlan,
  useOpenStockPlan,
  useProposeStockPlan,
  useConsolidateStockPlan,
  useSetStockPlanFinal,
  useDecideStockPlan,
} from "@/lib/queries";
import { fmtMonth } from "@/lib/fmt-date";
import StockTabs from "./StockTabs";
import UrgentRestockPanel from "./components/UrgentRestockPanel";
import PoolUsagePanel from "./components/PoolUsagePanel";
import StockHealthPanel from "./components/StockHealthPanel";

/**
 * Ready stock — the monthly plan (card K2, migration 0287).
 *
 * The lane Jess locked: people ask → the manager cuts → the COO approves →
 * Operations gets a list to order from. The system SUGGESTS; humans decide.
 *
 * WHY THE SYSTEM COLUMNS SAY WHAT THEY DO NOT KNOW
 * The screen would happily print "36 sold in 30 days" for the pillow today.
 * It would be wrong: every sales line that matches a warehouse SKU comes from
 * the AutoCount archive, whose `placed_at` is the day it was IMPORTED, so a
 * year of history dates to one afternoon (and, that afternoon being a
 * Thursday, weekend share would read a confident 0%). The engine excludes
 * those rows and states its coverage instead, and the suggestion + the
 * `⚠ well above average` warning stay silent until enough real days exist.
 * A blank that explains itself beats a number nobody can trust.
 *
 * State vocabulary law: no DB word reaches the screen — `PLAN_STATUS_LABEL` is
 * the one mapping, shared with the API.
 */

const STATUS_PILL: Record<PlanStatus, string> = {
  collecting: "pill-draft",
  review: "pill-sent",
  approved: "pill-confirmed",
  rejected: "pill-overdue",
};

/** Column geometry, declared once so header and rows can never drift. */
const GRID = "1fr 56px 60px 62px 62px 66px 72px 92px 78px 78px";

function thisMonth(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 7);
}

/**
 * The former Warehouse Ready-stock address is an alias onto Stock's canonical
 * availability filter. The monthly ordering cycle remains named and testable
 * below while its Purchasing destination is reconciled; no writer moves here.
 */
export default function OperationStockPlan() {
  return <Navigate to="/operation?tab=stock-onhand&availability=available" replace />;
}

export function PurchasingReplenishmentPlan() {
  const [period, setPeriod] = useState<string>(() => thisMonth());
  const { data, isLoading, isError } = useStockPlan(period);
  const openM = useOpenStockPlan();

  const planId = data?.plan?.id ?? "";
  const status = data?.plan?.status ?? null;

  // The periods the switcher offers: every cycle on file, plus this month even
  // when nobody has opened it yet (that is how the first one gets created).
  const periods = useMemo(() => {
    const set = new Set<string>(data?.periods ?? []);
    set.add(thisMonth());
    set.add(period);
    return [...set].sort().reverse();
  }, [data?.periods, period]);

  return (
    <>
      {/* The destination header draws the page word (壳画头); the month
          selector and status pill live in its right slot. */}
      <StockTabs
        right={
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="rounded border border-base-300 px-3 py-2 text-body focus:border-primary focus:outline-none"
              aria-label="Plan month"
              data-testid="plan-period"
            >
              {periods.map((p) => (
                <option key={p} value={p}>
                  {fmtMonth(p)}
                </option>
              ))}
            </select>
            {status ? (
              <span
                className={`pill ${STATUS_PILL[status]}`}
                data-testid="plan-status"
              >
                {PLAN_STATUS_LABEL[status]}
              </span>
            ) : null}
          </div>
        }
      />
      <div className="px-9 py-8 pb-14" data-testid="operation-stock-plan">

        {/* K5 — the review layer, FIRST on the tab. The card's Done-when is
            "the COO opens one tab and knows what needs attention today", so
            the digest sits above the month's work rather than under it, and
            renders outside the plan's loading and error branches for the same
            reason the urgent lane does: it must still answer on a day the
            monthly cycle fails to load. */}
        <StockHealthPanel />

        {isLoading ? (
          <p className="text-body text-base-500">Loading…</p>
        ) : isError ? (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-body">
            <div className="text-destructive font-semibold mb-1">
              Couldn&rsquo;t load the plan
            </div>
            <div className="text-meta text-base-700">
              Try again. If it still fails, ask the system owner to check Purchasing.
            </div>
          </div>
        ) : !data?.plan ? (
          <NoPlanYet
            period={period}
            pending={openM.isPending}
            failed={openM.isError}
            onOpen={() => openM.mutate({ period, title: null })}
          />
        ) : (
          <>
            <PlanTrail plan={data.plan} />
            <CoverageNote coverage={data.coverage} />
            <PlanGrid data={data} planId={planId} />
            {status === "review" ? (
              <DecisionBar planId={planId} canApprove={data.canApprove} />
            ) : null}
            {status === "approved" ? <PoList rows={data.poList} /> : null}
          </>
        )}

        {/* K3 — the urgent lane. Rendered OUTSIDE the monthly plan's loading
            and error branches on purpose: an emergency must be reachable even
            on a day the monthly cycle fails to load, which is exactly the kind
            of day somebody needs it. */}
        <UrgentRestockPanel />

        {/* K4 — where the pool actually went, and how low it may go. It reads
            the SAME month the plan header selects: one month control on the
            page, so "July" means July everywhere on it. Outside the plan's
            branches for the same reason as the urgent lane. */}
        <PoolUsagePanel period={period} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function NoPlanYet({
  period,
  pending,
  failed,
  onOpen,
}: {
  period: string;
  pending: boolean;
  failed: boolean;
  onOpen: () => void;
}) {
  return (
    <div
      className="rounded border border-base-200 bg-white px-6 py-10 text-center"
      data-testid="plan-empty"
    >
      <ClipboardList size={18} strokeWidth={2} className="mx-auto text-base-300" />
      <div className="text-strong text-base-900 mt-2">
        No plan for {fmtMonth(period)} yet
      </div>
      <div className="text-body text-base-600 mt-1 max-w-md mx-auto">
        Open the month and the team can start asking for what they want on the
        floor. One plan per month — opening it twice lands on the same one.
      </div>
      <button
        type="button"
        onClick={onOpen}
        disabled={pending}
        className="btn-primary mt-4 disabled:opacity-50"
        data-testid="plan-open"
      >
        {pending ? "Opening…" : `Open ${fmtMonth(period)}`}
      </button>
      {failed ? (
        <div className="text-meta text-danger mt-2" data-testid="plan-open-error">
          Couldn&rsquo;t open the month.
        </div>
      ) : null}
    </div>
  );
}

/** Who asked, who cut, who approved — the card's own Done-when, on screen. */
function PlanTrail({
  plan,
}: {
  plan: NonNullable<ReturnType<typeof useStockPlan>["data"]>["plan"];
}) {
  if (!plan) return null;
  const steps = [
    { label: "Opened", who: plan.openedByName },
    { label: "Consolidated", who: plan.consolidatedByName },
    {
      label: plan.status === "rejected" ? "Sent back" : "Approved",
      who: plan.decidedByName,
    },
  ];
  return (
    <div
      className="rounded border border-base-200 bg-white px-4 py-3 mb-3 flex flex-wrap items-center gap-x-6 gap-y-1"
      data-testid="plan-trail"
    >
      {steps.map((s) => (
        <div key={s.label} className="text-meta">
          <span className="text-base-500">{s.label}: </span>
          <span className={s.who ? "text-base-900" : "text-base-400"}>
            {s.who ?? "—"}
          </span>
        </div>
      ))}
      {plan.decisionRemark ? (
        <div className="text-meta text-base-700 basis-full">
          <span className="text-base-500">Remark: </span>
          {plan.decisionRemark}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The honest line about the history behind the system columns. It is not an
 * error state and not a warning — it is the screen saying how much it knows,
 * and it disappears by itself once enough real days accumulate.
 */
function CoverageNote({
  coverage,
}: {
  coverage: NonNullable<ReturnType<typeof useStockPlan>["data"]>["coverage"];
}) {
  if (coverage.canSuggest && coverage.archiveLinesExcluded === 0) return null;
  return (
    <div
      className="rounded border border-base-200 bg-base-50 px-4 py-2.5 mb-3 text-meta text-base-700"
      data-testid="plan-coverage"
    >
      {coverage.canSuggest ? (
        <>Sales history: {coverage.days} days. </>
      ) : (
        <>
          <span className="text-base-900 font-semibold">
            Not enough sales history to suggest quantities yet
          </span>{" "}
          — {coverage.days} {coverage.days === 1 ? "day" : "days"} on record. The
          suggestion appears by itself once there is enough.{" "}
        </>
      )}
      {coverage.archiveLinesExcluded > 0 ? (
        <>
          {coverage.archiveLinesExcluded} imported AutoCount{" "}
          {coverage.archiveLinesExcluded === 1 ? "line is" : "lines are"} not
          counted: those carry the date they were imported, not the day they
          sold.
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PlanGrid({
  data,
  planId,
}: {
  data: NonNullable<ReturnType<typeof useStockPlan>["data"]>;
  planId: string;
}) {
  const status = data.plan?.status ?? "collecting";
  return (
    <div className="rounded border border-base-200 bg-white" data-testid="plan-grid">
      <div
        className="grid items-center gap-3 px-4 py-2 text-label font-semibold uppercase tracking-[0.03em] text-base-400 border-b border-base-100"
        style={{ gridTemplateColumns: GRID }}
      >
        <span>Item</span>
        <span className="text-right">Now</span>
        <span className="text-right">Coming</span>
        <span className="text-right">30d</span>
        <span className="text-right">90d</span>
        <span className="text-right">Weekend</span>
        <span className="text-right">Suggest</span>
        <span className="text-right">Asked</span>
        <span className="text-right">Cut</span>
        <span className="text-right">Final</span>
      </div>

      {data.rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-body text-base-500">
          Nobody has asked for anything yet.
        </div>
      ) : (
        data.rows.map((row) => (
          <PlanRow
            key={row.sku}
            row={row}
            planId={planId}
            status={status}
            canConsolidate={data.canConsolidate}
            canApprove={data.canApprove}
          />
        ))
      )}

      {data.canPropose ? <ProposeRow planId={planId} skus={data.skus} /> : null}
    </div>
  );
}

function PlanRow({
  row,
  planId,
  status,
  canConsolidate,
  canApprove,
}: {
  row: OpsStockPlanRow;
  planId: string;
  status: PlanStatus;
  canConsolidate: boolean;
  canApprove: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-base-100" data-testid={`plan-row-${row.sku}`}>
      <div
        className="grid items-center gap-3 px-4 py-2"
        style={{ gridTemplateColumns: GRID }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 text-left"
          aria-expanded={open}
          data-testid={`plan-row-toggle-${row.sku}`}
        >
          <div className="text-body text-base-900 truncate" title={row.sku}>
            {row.sku}
          </div>
          <div className="text-label text-base-500">
            {row.proposerCount === 0
              ? "added by the manager"
              : `${row.proposerCount} ${row.proposerCount === 1 ? "person" : "people"} asked`}
            {row.overSuggestion ? (
              <span className="text-danger ml-1.5 inline-flex items-center gap-0.5">
                <TriangleAlert size={14} strokeWidth={2} />
                well above the 3-month average
              </span>
            ) : null}
          </div>
        </button>

        <Num v={row.onHand} />
        <Num v={row.incoming} dim={row.incoming === 0} />
        <Num v={row.sold30} dim={row.sold30 === 0} />
        <Num v={row.sold90} dim={row.sold90 === 0} />
        <span className="text-right font-mono text-body text-base-500">
          {row.weekendShare == null ? "—" : `${Math.round(row.weekendShare * 100)}%`}
        </span>
        <span className="text-right font-mono text-body text-base-700">
          {row.suggestedQty == null ? "—" : row.suggestedQty}
        </span>
        <Num v={row.proposedQty} strong />

        <QtyCell
          value={row.consolidatedQty}
          editable={
            canConsolidate && (status === "collecting" || status === "review")
          }
          planId={planId}
          sku={row.sku}
          kind="consolidate"
          fallback={row.proposedQty}
        />
        <QtyCell
          value={row.approvedQty}
          editable={canApprove && status === "review" && row.consolidatedQty != null}
          planId={planId}
          sku={row.sku}
          kind="final"
          fallback={row.consolidatedQty ?? 0}
        />
      </div>

      {open ? (
        <div className="px-4 pb-2.5 -mt-1" data-testid={`plan-asks-${row.sku}`}>
          {row.proposals.length === 0 ? (
            <div className="text-meta text-base-500">
              No individual asks — this line was added at consolidation.
            </div>
          ) : (
            row.proposals.map((p) => (
              <div
                key={`${p.proposedBy}`}
                className="text-meta text-base-700 flex items-baseline gap-2"
              >
                <span className="text-base-900">{p.proposedByName ?? "Someone"}</span>
                <span className="font-mono">{p.qty}</span>
                {p.note ? <span className="text-base-500">· {p.note}</span> : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function Num({ v, dim, strong }: { v: number; dim?: boolean; strong?: boolean }) {
  return (
    <span
      className={`text-right font-mono text-body ${
        dim ? "text-base-400" : strong ? "text-base-900 font-semibold" : "text-base-900"
      }`}
    >
      {v}
    </span>
  );
}

/** One editable number — the manager's cut, or the COO's final. */
function QtyCell({
  value,
  editable,
  planId,
  sku,
  kind,
  fallback,
}: {
  value: number | null;
  editable: boolean;
  planId: string;
  sku: string;
  kind: "consolidate" | "final";
  fallback: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const consolidate = useConsolidateStockPlan(planId);
  const final = useSetStockPlanFinal(planId);
  const m = kind === "consolidate" ? consolidate : final;

  if (!editable) {
    return (
      <span
        className="text-right font-mono text-body text-base-700"
        data-testid={`plan-${kind}-${sku}`}
      >
        {value == null ? "—" : value}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(String(value ?? fallback));
          setEditing(true);
        }}
        className="text-right font-mono text-body text-base-900 hover:text-primary"
        data-testid={`plan-${kind}-edit-${sku}`}
      >
        {value == null ? "set" : value}
      </button>
    );
  }

  const n = Number(draft);
  const valid = draft.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= 100000;
  function save() {
    if (!valid || m.isPending) return;
    m.mutate({ sku, qty: n }, { onSuccess: () => setEditing(false) });
  }

  return (
    <span className="flex items-center justify-end gap-0.5">
      <input
        autoFocus
        value={draft}
        inputMode="numeric"
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-[46px] rounded border border-base-300 px-1 py-0.5 text-body font-mono text-right focus:border-primary focus:outline-none"
        aria-label={`${kind === "consolidate" ? "Consolidated" : "Final"} quantity for ${sku}`}
        data-testid={`plan-${kind}-input-${sku}`}
      />
      <button
        type="button"
        onClick={save}
        disabled={!valid || m.isPending}
        className="text-success-700 disabled:text-base-300"
        aria-label="Save quantity"
        data-testid={`plan-${kind}-save-${sku}`}
      >
        <Check size={14} strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-base-400 hover:text-base-700"
        aria-label="Cancel"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </span>
  );
}

/** The ask box. Free text on purpose — a not-yet-stocked item can be asked for. */
function ProposeRow({ planId, skus }: { planId: string; skus: string[] }) {
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const propose = useProposeStockPlan(planId);

  const n = Number(qty);
  const valid = sku.trim() !== "" && Number.isInteger(n) && n > 0 && n <= 100000;

  function submit() {
    if (!valid || propose.isPending) return;
    propose.mutate(
      { sku: sku.trim(), qty: n, note: note.trim() || null },
      {
        onSuccess: () => {
          setSku("");
          setQty("");
          setNote("");
        },
      },
    );
  }

  return (
    <div
      className="border-t border-base-100 px-4 py-2.5 flex items-center gap-2"
      data-testid="plan-propose"
    >
      <Plus size={14} strokeWidth={2} className="text-base-400 shrink-0" />
      <input
        value={sku}
        onChange={(e) => setSku(e.target.value)}
        list="ready-stock-skus"
        placeholder="Item / SKU"
        className="flex-1 min-w-0 rounded border border-base-300 px-2 py-1 text-body focus:border-primary focus:outline-none"
        aria-label="Item to ask for"
        data-testid="plan-propose-sku"
      />
      <datalist id="ready-stock-skus">
        {skus.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <input
        value={qty}
        inputMode="numeric"
        onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Qty"
        className="w-[70px] rounded border border-base-300 px-2 py-1 text-body font-mono text-right focus:border-primary focus:outline-none"
        aria-label="Quantity wanted"
        data-testid="plan-propose-qty"
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Why (optional)"
        className="w-[200px] rounded border border-base-300 px-2 py-1 text-body focus:border-primary focus:outline-none"
        aria-label="Why you want it"
        data-testid="plan-propose-note"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!valid || propose.isPending}
        className="btn-secondary text-meta py-1 disabled:opacity-50"
        data-testid="plan-propose-save"
      >
        {propose.isPending ? "Adding…" : "Add"}
      </button>
      {propose.isError ? (
        <span className="text-label text-danger" data-testid="plan-propose-error">
          Not saved
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function DecisionBar({
  planId,
  canApprove,
}: {
  planId: string;
  canApprove: boolean;
}) {
  const [remark, setRemark] = useState("");
  const decide = useDecideStockPlan(planId);

  if (!canApprove) {
    return (
      <div
        className="mt-3 text-meta text-base-500"
        data-testid="plan-awaiting-coo"
      >
        Waiting for the COO to approve.
      </div>
    );
  }

  return (
    <div
      className="mt-3 rounded border border-base-200 bg-white px-4 py-3 flex items-center gap-2 flex-wrap"
      data-testid="plan-decide"
    >
      <input
        value={remark}
        onChange={(e) => setRemark(e.target.value)}
        placeholder="Remark (required to send back)"
        className="flex-1 min-w-[220px] rounded border border-base-300 px-2 py-1.5 text-body focus:border-primary focus:outline-none"
        aria-label="Decision remark"
        data-testid="plan-decide-remark"
      />
      <button
        type="button"
        onClick={() =>
          decide.mutate({ decision: "approve", remark: remark.trim() || null })
        }
        disabled={decide.isPending}
        className="btn-primary text-body py-1.5 disabled:opacity-50"
        data-testid="plan-approve"
      >
        Approve plan
      </button>
      <button
        type="button"
        onClick={() => decide.mutate({ decision: "reject", remark: remark.trim() })}
        disabled={decide.isPending || remark.trim() === ""}
        className="btn-danger text-body py-1.5 disabled:opacity-40"
        title={remark.trim() === "" ? "Say why before sending it back" : undefined}
        data-testid="plan-reject"
      >
        Send back
      </button>
      {decide.isError ? (
        <span className="text-meta text-danger" data-testid="plan-decide-error">
          Not saved. Try again.
        </span>
      ) : null}
    </div>
  );
}

/**
 * The handover. Reads the APPROVED number only — never the manager's cut — so
 * every unit Operations orders traces to a decision somebody made.
 *
 * Deliberately a LIST, not an auto-created PO (the queue doc's LATER section:
 * auto-create only after the flow proves itself live).
 */
function PoList({ rows }: { rows: { sku: string; qty: number }[] }) {
  const copy = rows.map((r) => `${r.sku}\t${r.qty}`).join("\n");
  return (
    <div
      className="mt-4 rounded border border-base-200 bg-white"
      data-testid="plan-po-list"
    >
      <header className="px-4 py-3 border-b border-base-100 flex items-center justify-between gap-3">
        <div>
          <div className="text-strong text-base-900">Order this</div>
          <div className="text-meta text-base-600 mt-0.5">
            Approved quantities. Raise the purchase orders from this list.
          </div>
        </div>
        {rows.length > 0 ? (
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(copy)}
            className="btn-secondary text-meta py-1.5 shrink-0"
            data-testid="plan-po-copy"
          >
            Copy list
          </button>
        ) : null}
      </header>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-body text-base-500">
          Every line was cut to zero — nothing to order.
        </div>
      ) : (
        rows.map((r) => (
          <div
            key={r.sku}
            className="px-4 py-2 border-t border-base-100 flex items-center justify-between gap-3"
            data-testid={`plan-po-${r.sku}`}
          >
            <span className="text-body text-base-900 truncate" title={r.sku}>
              {r.sku}
            </span>
            <span className="font-mono text-body text-base-900 font-semibold shrink-0">
              {r.qty}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
