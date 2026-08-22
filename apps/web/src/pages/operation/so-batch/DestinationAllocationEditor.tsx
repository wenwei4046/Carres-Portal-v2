import { useMemo, useState } from "react";
import {
  SO_BATCH_PURCHASE_WORDS as W,
  splitAllocation,
  validateAllocations,
  type DestinationAllocation,
  type PurchaseDemandRow,
  type PurchasingDestination,
} from "@carres/shared";

/**
 * `Deliver To` — WHERE THE SUPPLIER SENDS THESE GOODS
 * (CARD-2026-08-22-purchasing-02 §4; `docs/purchasing/MASTER.md` §5.4).
 *
 * Two acts, one cell, no dialog:
 *
 *   · CHANGE THE WHOLE ROW — a select. Most buys go one place, and the
 *     common act must not cost a modal.
 *   · SPLIT — an inline allocator that opens under the cell. It is not a
 *     second page because splitting eleven units across two warehouses is a
 *     thing you do WHILE looking at the row you are splitting.
 *
 * ── THE TOTAL IS THE ONLY RULE ──────────────────────────────────────────────
 *
 * The allocation must add back to the server's `Buy`. This component cannot
 * compute that number and does not try: it prints the target, prints the
 * running total, and refuses to close on a mismatch. The API repeats the whole
 * check after its own recomputation — if a refetch moved `Buy` between the
 * split and the issue, the server wins and says so.
 *
 * ── A CLOSED DESTINATION IS VISIBLE AND UNPICKABLE ──────────────────────────
 *
 * It stays in the list because history reads through the same list, and it is
 * disabled because a purchase order may not be sent to a yard that shut.
 */
export interface DestinationAllocationEditorProps {
  row: PurchaseDemandRow;
  destinations: readonly PurchasingDestination[];
  allocations: readonly DestinationAllocation[];
  onWholeRow: (destinationId: string) => void;
  onSplit: (allocations: DestinationAllocation[]) => void;
}

export default function DestinationAllocationEditor({
  row,
  destinations,
  allocations,
  onWholeRow,
  onSplit,
}: DestinationAllocationEditorProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const target = row.toBuy ?? 0;
  const active = useMemo(() => destinations.filter((d) => d.active), [destinations]);
  const single = allocations.length === 1 ? allocations[0]! : null;

  const draftAllocations = useMemo<DestinationAllocation[]>(
    () =>
      Object.entries(draft)
        .map(([destinationId, raw]) => ({ destinationId, qty: Number(raw) }))
        .filter((a) => Number.isFinite(a.qty) && a.qty > 0),
    [draft],
  );
  const draftTotal = draftAllocations.reduce((s, a) => s + a.qty, 0);
  const check = validateAllocations(row, draftAllocations, destinations);

  function openSplit() {
    const seed: Record<string, string> = {};
    for (const a of allocations) seed[a.destinationId] = String(a.qty);
    setDraft(seed);
    setOpen(true);
  }

  function apply() {
    if (!check.ok) return;
    onSplit(splitAllocation({ demandId: row.id, allocations: [] }, draftAllocations).allocations);
    setOpen(false);
  }

  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5">
        {single ? (
          <select
            className="min-w-0 flex-1 truncate rounded-control border border-kit-slate-6 bg-white px-1.5 py-0.5 text-meta"
            data-testid={`so-batch-deliver-to-select-${row.id}`}
            value={single.destinationId}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onWholeRow(e.target.value)}
          >
            {destinations.map((d) => (
              <option key={d.id} value={d.id} disabled={!d.active}>
                {d.name}
              </option>
            ))}
          </select>
        ) : (
          /* Already split — the cell states the arrangement rather than
             pretending one select could describe it. */
          <span className="min-w-0 flex-1 truncate text-meta">
            {allocations
              .map(
                (a) =>
                  `${destinations.find((d) => d.id === a.destinationId)?.name ?? ""} ${a.qty}`,
              )
              .join(" · ")}
          </span>
        )}
        {active.length > 1 ? (
          <button
            type="button"
            className="shrink-0 text-meta text-kit-blue-11 underline-offset-2 hover:underline"
            data-testid={`so-batch-split-${row.id}`}
            onClick={(e) => {
              e.stopPropagation();
              if (open) setOpen(false);
              else openSplit();
            }}
          >
            {W.split}
          </button>
        ) : null}
      </span>

      {open ? (
        <span
          className="flex flex-col gap-1 rounded-control border border-kit-slate-6 bg-white p-2"
          data-testid={`so-batch-split-editor-${row.id}`}
          onClick={(e) => e.stopPropagation()}
        >
          {active.map((d) => (
            <span key={d.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-meta">{d.name}</span>
              <input
                type="number"
                min={0}
                step={1}
                className="w-16 shrink-0 rounded-control border border-kit-slate-6 px-1 py-0.5 text-right text-meta tabular-nums"
                data-testid={`so-batch-split-qty-${row.id}-${d.id}`}
                value={draft[d.id] ?? ""}
                onChange={(e) => setDraft((prev) => ({ ...prev, [d.id]: e.target.value }))}
              />
            </span>
          ))}
          <span className="flex items-center justify-between gap-2 border-t border-kit-slate-5 pt-1">
            <span className="text-meta text-kit-slate-11">{W.splitTotal}</span>
            <span
              className="tabular-nums text-meta"
              data-testid={`so-batch-split-total-${row.id}`}
            >
              {draftTotal} / {target}
            </span>
          </span>
          {!check.ok ? (
            <span
              className="text-meta text-kit-red-11"
              data-testid={`so-batch-split-error-${row.id}`}
            >
              {check.message}
            </span>
          ) : null}
          <button
            type="button"
            className="mt-0.5 inline-flex h-6 items-center justify-center rounded-control bg-kit-blue-9 px-2 text-meta font-medium text-white disabled:bg-kit-slate-6"
            data-testid={`so-batch-split-apply-${row.id}`}
            disabled={!check.ok}
            onClick={apply}
          >
            {W.splitTotal} {target}
          </button>
        </span>
      ) : null}
    </span>
  );
}
