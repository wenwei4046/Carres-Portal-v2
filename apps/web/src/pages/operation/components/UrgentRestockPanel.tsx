import { useState } from "react";
import { Zap, Check, X, TriangleAlert, Plus, ShoppingCart } from "lucide-react";
import {
  EMERGENCY_REASONS,
  EMERGENCY_REASON_LABEL,
  EMERGENCY_STATUS_LABEL,
  emergencyDraftProblem,
  type EmergencyReason,
  type EmergencyStatus,
  type OpsStockEmergencyRow,
} from "@carres/shared";
import {
  useUrgentStock,
  useRaiseUrgentStock,
  useDecideUrgentStock,
  useMarkUrgentStockOrdered,
} from "@/lib/queries";

/**
 * Urgent restock — card K3 (migration 0290).
 *
 * "A viral-product weekend can be restocked without waiting for month-end."
 * Anyone raises an ask with a reason; the COO answers it in one click (there is
 * no manager step — this lane skips consolidation by design); whoever raises
 * purchase orders ticks it off, which is what takes it off the worklist.
 *
 * WHY THIS SITS BELOW THE MONTHLY PLAN AND NOT IN ITS OWN TAB
 * The queue doc allows exactly ONE new menu item across all five lines, and it
 * is spoken for. More to the point: an urgent ask and a monthly ask are the
 * same question asked at different speeds, and a person who cannot find the
 * fast lane will type into the slow one. Same page, separate numbers.
 *
 * WHAT IS DELIBERATELY NOT HERE: a suggested quantity. An emergency is by
 * definition demand the sales history does not contain, so a run rate scaled
 * off it would be the fabrication the monthly plan already refuses to print.
 * The screen states facts — free now, spoken for, on the water — and lets the
 * human decide.
 *
 * State vocabulary law: no DB word reaches the screen. `EMERGENCY_STATUS_LABEL`
 * and `EMERGENCY_REASON_LABEL` are the one mapping, shared with the API.
 */

const STATUS_PILL: Record<EmergencyStatus, string> = {
  pending: "pill-sent",
  approved: "pill-confirmed",
  rejected: "pill-overdue",
  ordered: "pill-collected",
};

export default function UrgentRestockPanel() {
  const { data, isLoading, isError, error } = useUrgentStock();
  const [raising, setRaising] = useState(false);

  return (
    <section className="mt-8" data-testid="urgent-restock">
      <header className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Zap size={16} strokeWidth={2} className="text-primary" />
            <h2 className="t-h3 text-base-900">Urgent restock</h2>
            {data && data.pendingCount > 0 ? (
              <span className="pill pill-sent" data-testid="urgent-pending-count">
                {data.pendingCount} waiting
              </span>
            ) : null}
          </div>
          <div className="text-[13px] text-base-600 mt-1">
            Can&rsquo;t wait for next month. Ask any time, say why — the COO
            answers it directly. These numbers stay out of the monthly plan.
          </div>
        </div>
        {data?.canRaise && !raising ? (
          <button
            type="button"
            onClick={() => setRaising(true)}
            className="btn-secondary text-[13px] py-1.5 shrink-0"
            data-testid="urgent-new"
          >
            <Plus size={14} strokeWidth={2} className="inline -mt-0.5 mr-1" />
            Ask for stock now
          </button>
        ) : null}
      </header>

      {raising ? (
        <RaiseForm skus={data?.skus ?? []} onDone={() => setRaising(false)} />
      ) : null}

      {isLoading ? (
        <p className="text-sm text-base-500">Loading…</p>
      ) : isError ? (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm">
          <div className="text-destructive font-semibold mb-1">
            Couldn&rsquo;t load the urgent list
          </div>
          <div className="text-[12px] text-base-700">
            {(error as Error | undefined)?.message ?? "Unknown error"}
          </div>
        </div>
      ) : (
        <>
          <div
            className="rounded border border-base-200 bg-white"
            data-testid="urgent-list"
          >
            {(data?.rows.length ?? 0) === 0 ? (
              <div
                className="px-4 py-8 text-center text-[13px] text-base-500"
                data-testid="urgent-empty"
              >
                Nothing urgent right now.
              </div>
            ) : (
              data!.rows.map((row) => (
                <UrgentRow
                  key={row.id}
                  row={row}
                  canDecide={data!.canDecide}
                  canMarkOrdered={data!.canMarkOrdered}
                />
              ))
            )}
          </div>
          {(data?.poList.length ?? 0) > 0 ? <UrgentPoList rows={data!.poList} /> : null}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function RaiseForm({ skus, onDone }: { skus: string[]; onDone: () => void }) {
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<EmergencyReason | "">("");
  const [note, setNote] = useState("");
  const raise = useRaiseUrgentStock();

  const draft = { sku, qty: Number(qty), reason, note };
  // The SAME rule the server enforces — one function, so a dark button and a
  // refusal can never disagree about why.
  const problem = emergencyDraftProblem(draft);

  function submit() {
    if (problem || raise.isPending) return;
    raise.mutate(
      {
        sku: sku.trim(),
        qty: Number(qty),
        reason: reason as EmergencyReason,
        note: note.trim() || null,
      },
      { onSuccess: onDone },
    );
  }

  return (
    <div
      className="rounded border border-base-200 bg-white px-4 py-3 mb-3"
      data-testid="urgent-form"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          list="urgent-restock-skus"
          placeholder="Item / SKU"
          className="flex-1 min-w-[180px] rounded border border-base-300 px-2 py-1.5 text-[13px] focus:border-primary focus:outline-none"
          aria-label="Item you need"
          data-testid="urgent-sku"
        />
        <datalist id="urgent-restock-skus">
          {skus.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <input
          value={qty}
          inputMode="numeric"
          onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="How many"
          className="w-[92px] rounded border border-base-300 px-2 py-1.5 text-[13px] font-mono text-right focus:border-primary focus:outline-none"
          aria-label="How many you need"
          data-testid="urgent-qty"
        />
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as EmergencyReason | "")}
          className="rounded border border-base-300 px-2 py-1.5 text-[13px] focus:border-primary focus:outline-none"
          aria-label="Why it is urgent"
          data-testid="urgent-reason"
        >
          <option value="">Why urgent?</option>
          {EMERGENCY_REASONS.map((r) => (
            <option key={r} value={r}>
              {EMERGENCY_REASON_LABEL[r]}
            </option>
          ))}
        </select>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={reason === "other" ? "Say what happened" : "More detail (optional)"}
          className="flex-1 min-w-[180px] rounded border border-base-300 px-2 py-1.5 text-[13px] focus:border-primary focus:outline-none"
          aria-label="More detail"
          data-testid="urgent-note"
        />
      </div>
      <div className="flex items-center gap-2 mt-2.5">
        <button
          type="button"
          onClick={submit}
          disabled={!!problem || raise.isPending}
          className="btn-primary text-[13px] py-1.5 disabled:opacity-40"
          data-testid="urgent-submit"
        >
          {raise.isPending ? "Sending…" : "Send to the COO"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="btn-ghost text-[13px] py-1.5"
          data-testid="urgent-cancel"
        >
          Cancel
        </button>
        {problem ? (
          <span className="text-[12px] text-base-500" data-testid="urgent-problem">
            {problem}
          </span>
        ) : null}
        {raise.isError ? (
          <span className="text-[12px] text-danger" data-testid="urgent-raise-error">
            {(raise.error as Error | undefined)?.message ?? "Not sent"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function UrgentRow({
  row,
  canDecide,
  canMarkOrdered,
}: {
  row: OpsStockEmergencyRow;
  canDecide: boolean;
  canMarkOrdered: boolean;
}) {
  return (
    <div
      className="border-t border-base-100 first:border-t-0 px-4 py-3"
      data-testid={`urgent-row-${row.id}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] text-base-900 truncate" title={row.sku}>
              {row.sku}
            </span>
            <span className="font-mono text-[13px] text-base-900 font-semibold">
              &times;{row.status === "pending" ? row.qty : (row.approvedQty ?? row.qty)}
            </span>
            <span className="pill pill-neutral">{row.reasonLabel}</span>
            <span
              className={`pill ${STATUS_PILL[row.status]}`}
              data-testid={`urgent-status-${row.id}`}
            >
              {EMERGENCY_STATUS_LABEL[row.status]}
            </span>
          </div>

          <div className="text-[12px] text-base-600 mt-1">
            {row.requestedByName ?? "Someone"} asked
            {row.waitingDays != null
              ? row.waitingDays === 0
                ? " today"
                : ` ${row.waitingDays} ${row.waitingDays === 1 ? "day" : "days"} ago`
              : null}
            {row.status === "approved" && row.approvedQty !== row.qty
              ? ` · asked for ${row.qty}`
              : null}
            {row.note ? <span className="text-base-500"> · {row.note}</span> : null}
          </div>

          {/* Facts about the warehouse, never a suggestion — see the header. */}
          <div className="text-[12px] text-base-500 mt-1 flex flex-wrap gap-x-4">
            <span>
              Free now{" "}
              <span className="font-mono text-base-900">{row.onHand}</span>
            </span>
            <span>
              Spoken for <span className="font-mono">{row.reserved}</span>
            </span>
            <span>
              On the way <span className="font-mono">{row.incoming}</span>
            </span>
          </div>

          {row.coveredByFreeStock && row.status === "pending" ? (
            <div
              className="text-[12px] text-warning-700 mt-1 inline-flex items-center gap-1"
              data-testid={`urgent-covered-${row.id}`}
            >
              <TriangleAlert size={14} strokeWidth={2} />
              The warehouse already has enough free — check before ordering more.
            </div>
          ) : null}

          {row.decisionRemark ? (
            <div className="text-[12px] text-base-700 mt-1">
              <span className="text-base-500">
                {row.decidedByName ?? "The COO"} said:{" "}
              </span>
              {row.decisionRemark}
            </div>
          ) : null}
          {row.status === "ordered" && row.orderedByName ? (
            <div className="text-[12px] text-base-500 mt-1">
              Purchase order raised by {row.orderedByName}.
            </div>
          ) : null}
        </div>

        <div className="shrink-0">
          {row.status === "pending" ? (
            canDecide ? (
              <DecideBox row={row} />
            ) : (
              <span
                className="text-[12px] text-base-500"
                data-testid={`urgent-awaiting-${row.id}`}
              >
                Waiting for the COO
              </span>
            )
          ) : row.status === "approved" && canMarkOrdered ? (
            <MarkOrderedButton id={row.id} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * One box, one click. Cutting the number and approving it are the SAME act
 * because this lane skips consolidation — asking the COO to save a quantity and
 * then press Approve would rebuild the step the card removed.
 */
function DecideBox({ row }: { row: OpsStockEmergencyRow }) {
  const [qty, setQty] = useState(String(row.qty));
  const [remark, setRemark] = useState("");
  const decide = useDecideUrgentStock();

  const n = Number(qty);
  const qtyValid = qty.trim() !== "" && Number.isInteger(n) && n > 0 && n <= 100000;

  return (
    <div className="flex items-center gap-1.5" data-testid={`urgent-decide-${row.id}`}>
      <input
        value={remark}
        onChange={(e) => setRemark(e.target.value)}
        placeholder="Remark (needed to turn down)"
        className="w-[180px] rounded border border-base-300 px-2 py-1 text-[12px] focus:border-primary focus:outline-none"
        aria-label={`Remark for ${row.sku}`}
        data-testid={`urgent-remark-${row.id}`}
      />
      <input
        value={qty}
        inputMode="numeric"
        onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ""))}
        className="w-[56px] rounded border border-base-300 px-1 py-1 text-[13px] font-mono text-right focus:border-primary focus:outline-none"
        aria-label={`Quantity to approve for ${row.sku}`}
        data-testid={`urgent-approve-qty-${row.id}`}
      />
      <button
        type="button"
        onClick={() =>
          decide.mutate({
            id: row.id,
            decision: "approve",
            qty: n,
            remark: remark.trim() || null,
          })
        }
        disabled={!qtyValid || decide.isPending}
        className="btn-primary text-[12px] py-1 px-2 disabled:opacity-40"
        data-testid={`urgent-approve-${row.id}`}
      >
        <Check size={14} strokeWidth={2} className="inline -mt-0.5 mr-0.5" />
        Approve
      </button>
      <button
        type="button"
        onClick={() =>
          decide.mutate({
            id: row.id,
            decision: "reject",
            qty: null,
            remark: remark.trim(),
          })
        }
        disabled={decide.isPending || remark.trim() === ""}
        className="btn-danger text-[12px] py-1 px-2 disabled:opacity-40"
        title={remark.trim() === "" ? "Say why before turning it down" : undefined}
        data-testid={`urgent-reject-${row.id}`}
      >
        <X size={14} strokeWidth={2} className="inline -mt-0.5" />
      </button>
      {decide.isError ? (
        <span
          className="text-[11px] text-danger"
          data-testid={`urgent-decide-error-${row.id}`}
        >
          Not saved
        </span>
      ) : null}
    </div>
  );
}

/** The tick that takes an approved ask off the worklist. */
function MarkOrderedButton({ id }: { id: string }) {
  const m = useMarkUrgentStockOrdered();
  return (
    <button
      type="button"
      onClick={() => m.mutate({ id })}
      disabled={m.isPending}
      className="btn-secondary text-[12px] py-1 disabled:opacity-50"
      data-testid={`urgent-ordered-${id}`}
    >
      {m.isPending ? "Saving…" : "I ordered it"}
    </button>
  );
}

// ---------------------------------------------------------------------------

/**
 * The urgent handover. Reads the APPROVED number only, and a line disappears
 * once somebody ticks "I ordered it" — that is what keeps a continuous lane
 * readable, unlike the monthly list which clears with its month.
 */
function UrgentPoList({
  rows,
}: {
  rows: { sku: string; qty: number; requestCount: number }[];
}) {
  const copy = rows.map((r) => `${r.sku}\t${r.qty}`).join("\n");
  return (
    <div
      className="mt-3 rounded border border-base-200 bg-white"
      data-testid="urgent-po-list"
    >
      <header className="px-4 py-3 border-b border-base-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShoppingCart size={16} strokeWidth={2} className="text-base-400" />
          <div>
            <div className="t-h4 text-base-900">Order these now</div>
            <div className="text-[12px] text-base-600 mt-0.5">
              Approved and not ordered yet. Tick each one off above once the
              purchase order is raised.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(copy)}
          className="btn-secondary text-[12px] py-1.5 shrink-0"
          data-testid="urgent-po-copy"
        >
          Copy list
        </button>
      </header>
      {rows.map((r) => (
        <div
          key={r.sku}
          className="px-4 py-2 border-t border-base-100 flex items-center justify-between gap-3"
          data-testid={`urgent-po-${r.sku}`}
        >
          <span className="text-[13px] text-base-900 truncate" title={r.sku}>
            {r.sku}
            {r.requestCount > 1 ? (
              <span className="text-[12px] text-base-500">
                {" "}
                · {r.requestCount} asks
              </span>
            ) : null}
          </span>
          <span className="font-mono text-[13px] text-base-900 font-semibold shrink-0">
            {r.qty}
          </span>
        </div>
      ))}
    </div>
  );
}
