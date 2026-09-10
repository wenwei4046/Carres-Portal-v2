// design-standard: not-a-list-page — this is a SECTION inside an expanded
// Manual Purchase register row, not a page. The Register above owns the
// destination, the toolbar and the header; a second page chrome inside one
// table cell is the windows-inside-windows pattern the Constitution rejects.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  manualPurchaseReadyStockResponseSchema,
  type ManualPurchaseReadyStockResponse,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import ReadyStockTable, {
  ReadyStockDisclosure,
  type ReadyStockTableRow,
} from "./components/ReadyStockTable";

/**
 * ⭐ MANUAL PURCHASE · READY STOCK — the settled design, owner ruling
 * 2026-09-11.
 *
 * A separately collapsible table directly below the request's goods, grouped
 * by matching product/configuration, showing the real Unit ID, Condition and
 * location. It is a sibling SECTION, never a column and never a second goods
 * table: the goods table answers *what was asked for and which purchase order
 * carries it*, this one answers *what is already on the shelf*.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO, AND WHY ──────────────────────────────
 *
 *   NO `Choose Ready Unit`. The SO Batch sibling can commit a Unit because a
 *   customer item line is OWED goods. An internal replenishment is owed by
 *   nobody on the shelf, so there is no line to bind to and no act to press.
 *   Viewing inventory is neither purchasing selection nor reservation, and
 *   copying the reservation button across would be a write with no meaning.
 *
 *   NO NETTING. `Asked for 10 · 4 on the shelf` are printed side by side and
 *   the ask is never rewritten. An additional replenishment quantity is not
 *   automatically reduced by existing inventory: a specific internal need may
 *   be reduced only once an authoritative allocation, transfer or usage
 *   record actually covers it, and none of those is this read.
 *
 *   NO SKU-TEXT MATCHING. The group key is `stockMatchKey` — the portal's one
 *   configuration-aware rule, pinned to its SQL twin by a contract test — so
 *   a King never answers a Super King's request.
 *
 * `Condition` is a GRADE and is not availability: everything listed is
 * already free and sound (0371). A counted row shows with its key and no
 * Unit ID pretence (0453 · 0368); hiding bulk would make a full shelf read
 * as an empty one.
 *
 * The read is LAZY — only an opened row asks. The Register answers for every
 * request at once, and counting the whole warehouse for rows nobody expanded
 * would be work done for nothing.
 */
export default function ManualPurchaseReadyStock({ requestId }: { requestId: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery<ManualPurchaseReadyStockResponse>({
    queryKey: ["manual-purchase-ready-stock", requestId],
    enabled: open,
    staleTime: 15_000,
    queryFn: async () => {
      const raw = await apiFetch<unknown>(
        `/api/operation/purchasing/requests/${encodeURIComponent(requestId)}/ready-stock`,
      );
      /* Parsed, not trusted — a response that is not a Ready Stock read
         becomes the error state, never an empty table reading as "no stock". */
      return manualPurchaseReadyStockResponseSchema.parse(raw);
    },
  });

  const groups = q.data?.groups ?? [];
  const anyStock = groups.some((g) => g.units.length > 0);
  /**
   * ⭐ A GROUP HEADING THAT DOES NOT DISTINGUISH IS NOT A HEADING (production
   * walk, 2026-09-11).
   *
   * Grouping is by CONFIGURATION, which is the whole point — a live request
   * carries `5539-1A(LHF)` and `5539-1A(RHF)`, the left- and right-hand
   * halves of one sofa, and they are correctly two groups. But the Catalog
   * model name for both is `Booqit`, so the screen showed
   * `Booqit · Asked for 1 · 0 on the shelf` TWICE and the operator could not
   * tell which half was which — on exactly the pair that must never be
   * confused.
   *
   * So the SKU joins the heading ONLY where the model name fails to separate
   * two groups. Printing it on every group would be noise on the ordinary
   * case, which is one group and one name.
   */
  const ambiguous = new Set(
    groups
      .map((g) => g.item)
      .filter((item, i, all) => all.indexOf(item) !== i),
  );

  return (
    <ReadyStockDisclosure
      testId={`mp-ready-stock-${requestId}`}
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
      ) : !anyStock ? (
        <div className="px-3 py-2 text-meta text-base-500">
          No stock on the shelf matches this purchase.
        </div>
      ) : (
        <>
          <div className="px-3 py-2 text-meta text-base-500">
            What is already on the shelf. Viewing does not reserve, and it does not
            reduce what this purchase asks for.
          </div>
          {groups.map((group) => (
            <div key={group.matchKey} data-testid={`mp-ready-stock-group-${group.matchKey}`}>
              {/* THE GROUP STATES BOTH NUMBERS AND NETS NEITHER. */}
              <div className="flex flex-wrap items-baseline gap-x-2 border-t border-base-200 bg-base-50/60 px-3 py-1.5">
                <span className="text-body font-semibold text-base-900">{group.item}</span>
                {ambiguous.has(group.item) && group.skus.length > 0 ? (
                  <span className="text-meta text-base-600">{group.skus.join(" · ")}</span>
                ) : null}
                <span className="text-meta text-base-500">
                  {`Asked for ${group.requestedQty} · ${group.freeQty} on the shelf`}
                </span>
              </div>
              {group.units.length === 0 ? (
                <div className="px-3 py-2 text-meta text-base-500">
                  Nothing on the shelf matches this item.
                </div>
              ) : (
                <ReadyStockTable
                  label={`Ready Stock for ${group.item}`}
                  rows={group.units as ReadyStockTableRow[]}
                />
              )}
            </div>
          ))}
        </>
      )}
    </ReadyStockDisclosure>
  );
}
