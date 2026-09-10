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
  type ReadyStockUnit,
} from "@carres/shared";
import { ApiError, apiFetch } from "@/lib/api";
import { toast } from "sonner";

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
 */

const CONDITION_WORDS: Record<string, string> = {
  new: "New",
  exhibition: "Display",
  old: "Fair (used)",
  refurbished: "Refurbished",
  damaged: "Damaged",
};

/** `Absence` is a FACT, not an apology — `docs/COPY-STANDARD.md`. */
function Absence({ children }: { children: React.ReactNode }) {
  return <span className="text-base-400">{children}</span>;
}

function conditionWord(c: string | null): string {
  if (!c) return "Not recorded";
  return CONDITION_WORDS[c] ?? c;
}

export default function ReadyStockPanel({ orderId, so }: { orderId: string; so: number | null }) {
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState<Map<string, string>>(new Map());
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

  const reserve = useMutation({
    mutationFn: () =>
      apiFetch<{ reserved: number }>(
        "/api/operation/purchase/demands/ready-stock/reserve",
        {
          method: "POST",
          body: JSON.stringify({
            orderId,
            picks: [...picks].map(([itemId, orderLineId]) => ({ itemId, orderLineId })),
          }),
        },
      ),
    onSuccess: (res) => {
      toast.success(
        `Reserved ${res.reserved} Unit${res.reserved === 1 ? "" : "s"}${so == null ? "" : ` to SO-${so}`}`,
      );
      setPicks(new Map());
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

  function toggle(unit: ReadyStockUnit, lineId: string) {
    setPicks((prev) => {
      const next = new Map(prev);
      if (next.get(unit.itemId) === lineId) next.delete(unit.itemId);
      else next.set(unit.itemId, lineId);
      return next;
    });
  }

  const chosen = picks.size;

  return (
    /* THE CARRES SECTION CONNECTOR — the light-grey rounded menu-style frame
       the expansion already uses between its sections. It sits BETWEEN the
       goods table and this one, not on every row. */
    <div
      className="mt-2 overflow-hidden rounded-control border border-base-200 bg-white"
      data-testid={`ready-stock-${orderId}`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        /* 36px, the section handle — the item rows below are the ruled 38px. */
        className="flex h-9 w-full items-center gap-2 bg-base-50 px-3 text-left text-body font-semibold text-base-900 hover:bg-base-100"
      >
        <span aria-hidden>{open ? "▾" : "▸"}</span>
        <span>Ready Stock</span>
      </button>

      {open ? (
        q.isPending ? (
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
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left" style={{ minWidth: 940 }}>
                <colgroup>
                  <col style={{ width: 36 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 170 }} />
                  <col />
                </colgroup>
                <thead className="border-y border-base-200 bg-base-50">
                  <tr className="divide-x divide-base-200">
                    <th className="px-2 py-1.5" aria-label="Choose Unit" />
                    {[
                      "Unit ID",
                      "Condition",
                      "Qty",
                      "Where",
                      "Owner",
                      "For item line",
                      "Item",
                    ].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        /* Long headings may wrap to two lines; the ruled row
                           height below is unaffected. */
                        className="px-2 py-1.5 text-label font-semibold uppercase text-base-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-200 text-body">
                  {q.data!.units.map((u) => {
                    const pickedLine = picks.get(u.itemId) ?? null;
                    const selected = pickedLine != null;
                    const defaultLine = u.matchingLineIds[0] ?? null;
                    return (
                      <tr
                        key={u.itemId}
                        data-testid={`ready-stock-unit-${u.itemId}`}
                        /* SELECTED UNIT: light-blue row with a thin blue rule
                           top and bottom — distinct from the purchasing
                           selection above, and from keyboard focus, which the
                           browser's own ring still draws. */
                        className={
                          selected
                            ? "divide-x divide-base-200 bg-kit-blue-3 shadow-[inset_0_1px_var(--kit-blue-9),inset_0_-1px_var(--kit-blue-9)]"
                            : "divide-x divide-base-200"
                        }
                        style={{ height: 38 }}
                      >
                        <td className="px-2 text-center">
                          {u.blocked == null && defaultLine ? (
                            <input
                              type="checkbox"
                              aria-label={`Choose ${u.unitCode ?? "Unit"}`}
                              checked={selected}
                              onChange={() => toggle(u, pickedLine ?? defaultLine)}
                            />
                          ) : (
                            <Absence>—</Absence>
                          )}
                        </td>
                        <td className="px-2">
                          {/* A counted row's key is NOT a Unit ID and never
                              prints under this heading as if it were. */}
                          {u.identityScope === "unit" && u.unitCode ? (
                            u.unitCode
                          ) : (
                            <Absence>Counted stock</Absence>
                          )}
                        </td>
                        <td className="px-2">{conditionWord(u.condition)}</td>
                        <td className="px-2 tabular-nums">{u.qty}</td>
                        <td className="px-2">
                          {u.siteName ?? <Absence>Not recorded</Absence>}
                        </td>
                        <td className="px-2">
                          {u.ownership === "supplier_consignment" ? (
                            <span title={u.supplier ?? undefined}>Supplier</span>
                          ) : (
                            "Carres"
                          )}
                        </td>
                        <td className="px-2">
                          {u.blocked ? (
                            <Absence>{READY_STOCK_BLOCKED_WORDS[u.blocked]}</Absence>
                          ) : u.matchingLineIds.length === 1 ? (
                            <span>{lineById.get(u.matchingLineIds[0]!)?.item ?? "—"}</span>
                          ) : (
                            /* TWO ITEM LINES OF ONE SKU is the case this whole
                               build exists for: the operator says WHICH, and
                               the server refuses to guess if they do not. */
                            <select
                              aria-label={`Item line for ${u.unitCode ?? "Unit"}`}
                              className="w-full rounded-control border border-base-300 bg-white px-1 py-0.5 text-body"
                              value={pickedLine ?? defaultLine ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPicks((prev) => {
                                  const next = new Map(prev);
                                  if (next.has(u.itemId)) next.set(u.itemId, v);
                                  return next;
                                });
                              }}
                            >
                              {u.matchingLineIds.map((id, i) => (
                                <option key={id} value={id}>
                                  {`Line ${i + 1} · ${lineById.get(id)?.item ?? id}`}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-2">{u.sku}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-3 border-t border-base-200 px-3 py-2">
              <span className="text-meta text-base-500">
                {chosen === 0 ? "No Unit chosen" : `${chosen} chosen`}
              </span>
              <button
                type="button"
                disabled={chosen === 0 || reserve.isPending}
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
        )
      ) : null}
    </div>
  );
}
