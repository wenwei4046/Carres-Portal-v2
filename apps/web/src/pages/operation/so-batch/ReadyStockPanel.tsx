// design-standard: not-a-list-page — this is a SECTION inside an expanded SO
// Batch Purchase row, not a page. It has no route, no shell and no page
// header: the Register above already owns all three, and wrapping a nested
// disclosure in a second ListPageShell would draw a page inside a page —
// exactly the windows-inside-windows AutoCount pattern the Constitution
// rejects (§2). Its table follows GoodsMiniTable's grammar, its sibling.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  READY_STOCK_BLOCKED_WORDS,
  readyStockRefusalWord,
  readyStockResponseSchema,
  type ReadyStockResponse,
} from "@carres/shared";
import { ApiError, apiFetch } from "@/lib/api";
import { toast } from "sonner";
import ReadyStockTable, {
  ReadyStockDisclosure,
  type ReadyStockTableRow,
} from "../components/ReadyStockTable";

/**
 * ⭐ READY STOCK — the collapsible table directly under a Sales Order's goods
 * (owner-accepted design, 2026-09-10).
 *
 * ONE QUESTION: *is this order's goods already on our shelf, and which exact
 * Unit answers which item line?*
 *
 * ── FOUR THINGS THAT ARE DELIBERATELY DISTINCT HERE ─────────────────────────
 *
 *   VIEWING      opening this section reads. It reserves nothing, ever.
 *   SELECTING    a checkbox marks a Unit for the act. Still no write.
 *   RESERVING    `Choose Ready Unit` — one act, one transaction, real.
 *   PURCHASING   the goods table's OWN checkboxes, above. A different act, a
 *                different column, and the two selections never share state.
 *
 * ── THREE THINGS THIS TABLE REFUSES TO PRETEND ──────────────────────────────
 *
 *   · CONDITION IS NOT AVAILABILITY. An `Exhibition` Unit is fully available;
 *     the grade is a separate fact and gets its own column rather than being
 *     folded into a single "status" word.
 *   · A COUNTED ROW IS NOT A UNIT (0453 · 0368). Bulk stock shows — hiding 893
 *     pillows would make a full shelf read empty — with its key, no Unit ID
 *     pretence, and no checkbox.
 *   · THE ORIGINAL DEMAND SURVIVES. After reserving, the summary states
 *     `Requested N = Ready Stock n (Unit IDs) + On PO n + To purchase n`. The
 *     ordered quantity is never quietly rewritten.
 *
 * ⭐ THE BOX ITSELF IS SHARED (owner ruling 2026-09-11). The disclosure frame,
 * the ruled columns and the condition vocabulary live in
 * `../components/ReadyStockTable`, so the settled Manual Purchase section is
 * the SAME table minus the capabilities it has no business owning — never a
 * second copy that starts identical and drifts. What stays here is what is
 * genuinely this page's: the item-line binding, and the one act that writes.
 */

export default function ReadyStockPanel({ orderId, so }: { orderId: string; so: number | null }) {
  const [open, setOpen] = useState(false);
  /**
   * TWO STATES, because they are two decisions. `chosen` is whether this
   * Unit is part of the act; `lineChoice` is which item line it answers.
   * Held apart so an operator can set the line BEFORE ticking the box —
   * folded into one map, changing the dropdown on an unticked row did
   * nothing at all, which reads as a broken control.
   */
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [lineChoice, setLineChoice] = useState<Map<string, string>>(new Map());
  const queryClient = useQueryClient();

  /**
   * READ ONLY WHEN OPENED. The Register answers for every Sales Order at once;
   * counting the whole warehouse for a section nobody expanded would be work
   * done for nothing — the same reason the Unit ID disclosure is lazy.
   */
  const q = useQuery<ReadyStockResponse>({
    queryKey: ["so-batch-ready-stock", orderId],
    enabled: open,
    staleTime: 15_000,
    queryFn: async () => {
      const raw = await apiFetch<unknown>(
        `/api/operation/purchase/demands/${encodeURIComponent(orderId)}/ready-stock`,
      );
      /* Parsed, not trusted — a response that is not a Ready Stock read becomes
         the error state, never an empty table that reads as "no stock". */
      return readyStockResponseSchema.parse(raw);
    },
  });

  const lineById = useMemo(
    () => new Map((q.data?.lines ?? []).map((l) => [l.orderLineId, l])),
    [q.data],
  );
  /* The shared table prints the GOODS; the item-line binding is this page's
     own fact, so the cells that need it look the Unit back up here. */
  const unitById = useMemo(
    () => new Map((q.data?.units ?? []).map((u) => [u.itemId, u])),
    [q.data],
  );

  const reserve = useMutation({
    mutationFn: () =>
      apiFetch<{ reserved: number }>(
        "/api/operation/purchase/demands/ready-stock/reserve",
        {
          method: "POST",
          body: JSON.stringify({
            orderId,
            picks: [...chosen].map((itemId) => ({
              itemId,
              orderLineId: lineFor(itemId),
            })),
          }),
        },
      ),
    onSuccess: (res) => {
      toast.success(
        `Reserved ${res.reserved} Unit${res.reserved === 1 ? "" : "s"}${so == null ? "" : ` to SO-${so}`}`,
      );
      setChosen(new Set());
      /* The server's own recomputation decides what still needs buying — the
         Register is invalidated rather than edited in place. */
      void queryClient.invalidateQueries({ queryKey: ["so-batch-ready-stock", orderId] });
      void queryClient.invalidateQueries({ queryKey: ["so-batch-purchase"] });
      void queryClient.invalidateQueries({ queryKey: ["operation", "orders", orderId, "expansion"] });
    },
    onError: (e: Error) => {
      const code = e instanceof ApiError ? ((e.body as { code?: string } | null)?.code ?? null) : null;
      toast.error(readyStockRefusalWord(code));
    },
  });

  /** The line this Unit answers: the operator's pick, else its only match. */
  function lineFor(itemId: string): string {
    const explicit = lineChoice.get(itemId);
    if (explicit) return explicit;
    const unit = (q.data?.units ?? []).find((u) => u.itemId === itemId);
    return unit?.matchingLineIds[0] ?? "";
  }

  function toggle(itemId: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  const chosenCount = chosen.size;

  return (
    <ReadyStockDisclosure
      testId={`ready-stock-${orderId}`}
      open={open}
      onToggle={() => setOpen((v) => !v)}
    >
      {q.isPending ? (
        <div className="px-3 py-2 text-meta text-base-500">Reading the stock register…</div>
      ) : q.isError ? (
        <div className="px-3 py-2 text-meta">
          <button
            type="button"
            className="text-kit-blue-11 hover:underline"
            onClick={() => void q.refetch()}
          >
            Ready Stock could not be read. Try again
          </button>
        </div>
      ) : (q.data?.units.length ?? 0) === 0 ? (
        <div className="px-3 py-2 text-meta text-base-500">
          No stock on the shelf matches this order.
        </div>
      ) : (
        <>
          <div className="px-3 py-2 text-meta text-base-500">
            Choose the Unit that answers an item line. Viewing does not reserve.
          </div>
          <ReadyStockTable
            label={so == null ? "Ready Stock for this order" : `Ready Stock for SO-${so}`}
            rows={q.data!.units as ReadyStockTableRow[]}
            selection={{
              isChosen: (itemId) => chosen.has(itemId),
              onToggle: toggle,
              blockedWord: (row) => {
                const unit = unitById.get(row.itemId);
                if (unit?.blocked) return READY_STOCK_BLOCKED_WORDS[unit.blocked];
                /* A Unit whose only matching line has gone is not choosable
                   even though the server sent no code for it. */
                return unit && unit.matchingLineIds.length > 0 ? null : "—";
              },
            }}
            extraColumn={{
              header: "For item line",
              width: 170,
              cell: (row) => {
                const unit = unitById.get(row.itemId);
                if (!unit) return null;
                if (unit.matchingLineIds.length === 1) {
                  return <span>{lineById.get(unit.matchingLineIds[0]!)?.item ?? "—"}</span>;
                }
                /* TWO ITEM LINES OF ONE SKU is the case this whole build
                   exists for: the operator says WHICH, and the server refuses
                   to guess if they do not. */
                const picked = lineChoice.get(unit.itemId) ?? unit.matchingLineIds[0] ?? "";
                return (
                  <select
                    aria-label={`Item line for ${unit.unitCode ?? "Unit"}`}
                    className="w-full rounded-control border border-base-300 bg-white px-1 py-0.5 text-body"
                    value={picked}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLineChoice((prev) => new Map(prev).set(unit.itemId, v));
                    }}
                  >
                    {unit.matchingLineIds.map((id, i) => (
                      <option key={id} value={id}>
                        {`Line ${i + 1} · ${lineById.get(id)?.item ?? id}`}
                      </option>
                    ))}
                  </select>
                );
              },
            }}
          />

          <div className="flex items-center gap-3 border-t border-base-200 px-3 py-2">
            <span className="text-meta text-base-500">
              {chosenCount === 0 ? "No Unit chosen" : `${chosenCount} chosen`}
            </span>
            <button
              type="button"
              disabled={chosenCount === 0 || reserve.isPending}
              onClick={() => reserve.mutate()}
              className="rounded-control bg-kit-blue-9 px-3 py-1.5 text-body font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {reserve.isPending ? "Reserving…" : "Choose Ready Unit"}
            </button>
          </div>

          {/* WHAT THE ORDER NOW STANDS AT — real facts from the server's own
              read, never a demo sentence. Only lines that Ready Stock has
              actually answered appear. */}
            {q.data!.lines.some((l) => l.reservedQty > 0) ? (
              <div className="border-t border-base-200 bg-kit-blue-3 px-3 py-2 text-body">
                {q.data!.lines
                  .filter((l) => l.reservedQty > 0)
                  .map((l) => (
                    <div key={l.orderLineId} className="leading-6">
                      <span className="font-semibold">{l.item}</span>
                      {` · Requested ${l.qty} = Ready Stock ${l.reservedQty}`}
                      {l.onPoQty > 0 ? ` + On PO ${l.onPoQty}` : ""}
                      {` + To purchase ${l.remainingQty}`}
                      {l.reservedUnitCodes.length > 0 ? (
                        <div className="text-meta text-base-600">
                          {`Unit ID · ${l.reservedUnitCodes.join(" · ")}`}
                        </div>
                      ) : null}
                    </div>
                  ))}
              </div>
          ) : null}
        </>
      )}
    </ReadyStockDisclosure>
  );
}
