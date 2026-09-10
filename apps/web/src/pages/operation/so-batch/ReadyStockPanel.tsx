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
  readyStockReserveResultSchema,
  readyStockResponseSchema,
  type ReadyStockResponse,
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

/**
 * WHAT THE ACT DID, IN UNITS.
 *
 * The door is atomic, so there are exactly two outcomes and the screen says
 * which: every chosen Unit went in, or none did and ONE of them is the reason.
 * A count alone is not enough — an operator who chose five and is told
 * "someone else took that Unit" would otherwise untick them one at a time to
 * find out which, and every attempt is another race.
 */
type ActResult =
  | { ok: true; count: number; unitCodes: string[] }
  | { ok: false; sentence: string; unitId: string | null; unitCode: string | null };

export default function ReadyStockPanel({
  orderId,
  so,
  onReserved,
}: {
  orderId: string;
  so: number | null;
  /**
   * The item lines this act answered. The Register drops every purchasing tick
   * standing on them, because the `To buy` those ticks were arranged against
   * has just changed — and `Issue PO` is one click, while the recomputed read
   * is a round trip away.
   */
  onReserved?: (orderId: string, orderLineIds: readonly string[]) => void;
}) {
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
  const [act, setAct] = useState<ActResult | null>(null);
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
      apiFetch<unknown>(
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
    onSuccess: (raw) => {
      /* Parsed, not trusted — and what came back is what the DOOR committed,
         never what the browser asked for. */
      const parsed = readyStockReserveResultSchema.safeParse(raw);
      const committed = parsed.success ? parsed.data.units : [];
      const count = parsed.success ? parsed.data.reserved : chosen.size;
      toast.success(
        `Reserved ${count} Unit${count === 1 ? "" : "s"}${so == null ? "" : ` to SO-${so}`}`,
      );
      setAct({
        ok: true,
        count,
        unitCodes: committed
          .map((u) => codeOf(u.itemId))
          .filter((codeWord): codeWord is string => codeWord != null),
      });
      setChosen(new Set());
      /* The item lines the goods now answer — the Register's ticks on them were
         arranged against a `To buy` that has just changed. */
      onReserved?.(orderId, [...new Set(committed.map((u) => u.orderLineId))]);
      /* The server's own recomputation decides what still needs buying — the
         Register is invalidated rather than edited in place. */
      void queryClient.invalidateQueries({ queryKey: ["so-batch-ready-stock", orderId] });
      void queryClient.invalidateQueries({ queryKey: ["so-batch-purchase"] });
      void queryClient.invalidateQueries({ queryKey: ["operation", "orders", orderId, "expansion"] });
    },
    onError: (e: Error) => {
      const body = e instanceof ApiError ? (e.body as { code?: string; itemId?: string } | null) : null;
      const sentence = readyStockRefusalWord(body?.code ?? null);
      toast.error(sentence);
      /* 0473 names the Unit the act stopped on. The choice is LEFT ALONE, so
         the operator unticks that one and presses again rather than rebuilding
         a selection the refusal never touched. */
      setAct({
        ok: false,
        sentence,
        unitId: body?.itemId ?? null,
        unitCode: body?.itemId ? codeOf(body.itemId) : null,
      });
    },
  });

  /** A Unit's own ID, for a sentence that has to name it. */
  function codeOf(itemId: string): string | null {
    return (q.data?.units ?? []).find((u) => u.itemId === itemId)?.unitCode ?? null;
  }

  /** The line this Unit answers: the operator's pick, else its only match. */
  function lineFor(itemId: string): string {
    const explicit = lineChoice.get(itemId);
    if (explicit) return explicit;
    const unit = (q.data?.units ?? []).find((u) => u.itemId === itemId);
    return unit?.matchingLineIds[0] ?? "";
  }

  function toggle(itemId: string) {
    /* A result is about the act that produced it. The moment the choice moves,
       last act's sentence is history and stops being shown beside a new one. */
    setAct(null);
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  const chosenCount = chosen.size;

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
                    const selected = chosen.has(u.itemId);
                    /* THE UNIT THE LAST ACT STOPPED ON. Amber, because it is an
                       exception to fix, not a failure of the goods (§ tokens). */
                    const refused = act != null && !act.ok && act.unitId === u.itemId;
                    const defaultLine = u.matchingLineIds[0] ?? null;
                    const pickedLine = lineChoice.get(u.itemId) ?? defaultLine;
                    return (
                      <tr
                        key={u.itemId}
                        data-testid={`ready-stock-unit-${u.itemId}`}
                        /* SELECTED UNIT: light-blue row with a thin blue rule
                           top and bottom — distinct from the purchasing
                           selection above, and from keyboard focus, which the
                           browser's own ring still draws. */
                        /* ⚠️ `var(--kit-blue-9)` shipped here on 2026-09-10 and
                           drew NOTHING: the kit palette is a Tailwind colour
                           scale, and no stylesheet defines that custom
                           property — an invalid box-shadow is dropped whole, so
                           the selected row had its fill and no rule. The token
                           is read from the theme instead, which is the same
                           locked value and actually resolves. Amber has only
                           steps 3 and 11 by law, so the refused row carries the
                           fill alone rather than inventing a step. */
                        className={
                          refused
                            ? "divide-x divide-base-200 bg-kit-amber-3"
                            : selected
                              ? "divide-x divide-base-200 bg-kit-blue-3 shadow-[inset_0_1px_theme(colors.kit.blue.9),inset_0_-1px_theme(colors.kit.blue.9)]"
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
                              onChange={() => toggle(u.itemId)}
                            />
                          ) : (
                            <Absence>—</Absence>
                          )}
                        </td>
                        <td className="px-2">
                          {/* A counted row's key is NOT a Unit ID and never
                              prints under this heading as if it were. The
                              governed answer for a quantity-scoped goods line
                              is the absence dash — `No Unit ID` would imply
                              one is owed (`docs/COPY-STANDARD.md`). */}
                          {u.identityScope === "unit" && u.unitCode ? (
                            u.unitCode
                          ) : (
                            <Absence>—</Absence>
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
                              value={pickedLine ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setLineChoice((prev) => new Map(prev).set(u.itemId, v));
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

            {/* WHAT THE ACT DID, IN UNITS — never a bare count.
                The door commits every chosen Unit or none, so this says which
                Units went in, or which one stopped the act and that nothing
                went in. */}
            {act ? (
              <div
                data-testid={`ready-stock-act-${orderId}`}
                className={`border-t border-base-200 px-3 py-2 text-body ${
                  act.ok ? "bg-kit-blue-3" : "bg-kit-amber-3"
                }`}
              >
                {act.ok ? (
                  <>
                    <div>
                      {`Reserved ${act.count} Unit${act.count === 1 ? "" : "s"}`}
                      {so == null ? "" : ` to SO-${so}`}
                    </div>
                    {act.unitCodes.length > 0 ? (
                      <div className="text-meta text-base-600">
                        {`Unit ID · ${act.unitCodes.join(" · ")}`}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div>{act.sentence}</div>
                    <div className="text-meta text-base-600">
                      {act.unitCode ? `Unit ID · ${act.unitCode} · ` : ""}
                      No Unit was reserved.
                    </div>
                  </>
                )}
              </div>
            ) : null}

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
