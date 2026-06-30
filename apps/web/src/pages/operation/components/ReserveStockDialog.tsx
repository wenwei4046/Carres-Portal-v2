import { useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";

/**
 * ReserveStockDialog — the order-drawer "Ready" picker (Jess 2026-06-30).
 *
 * The catalog (product_skus) is empty, so an order line and the warehouse's
 * per-unit stock both carry the product NAME as their sku and match only under
 * `normalizeSkuKey` (see project-catalog-empty-sku-naming). The drawer matches
 * each line to the free units and opens this dialog; the operator ticks the
 * exact physical unit(s) to use for THIS order, and we reserve each to the
 * order's SO via POST /api/ops/stock/reserve-item (free→reserved, reserved_ref
 * = soRef). Picking the specific unit — not auto-oldest — is deliberate: an
 * Exhibition piece must not silently fill a "new" order
 * ([[feedback-automation-overridable-default]]).
 */

export interface ReserveFreeUnit {
  id: string;
  unitCode: string | null;
  sku: string;
  condition: "new" | "exhibition" | "old" | "damaged";
  poNo: string | null;
  sourceRef: string | null;
  dateIn: string | null;
}

interface Props {
  /** The order line sku (for the dialog title). */
  sku: string;
  /** What gets written to reserved_ref, e.g. "SO-1234". */
  soRef: string;
  /** Line qty — used only to pre-tick that many of the oldest units. */
  need: number;
  /** Units to show. When `exact`, these are the units matched to this line by
   *  normalizeSkuKey; otherwise it's ALL free warehouse stock (manual fallback). */
  units: ReserveFreeUnit[];
  /** true = `units` auto-matched this item; false = nothing matched, so we show
   *  all warehouse stock for a manual pick (operator override). */
  exact: boolean;
  onClose: () => void;
  /** Called after a successful reserve so the parent can invalidate. */
  onReserved: () => void;
}

const CONDITION_LABEL: Record<string, string> = {
  new: "New",
  exhibition: "Exhibition",
  old: "Old",
  damaged: "Damaged",
};

export default function ReserveStockDialog({
  sku,
  soRef,
  need,
  units,
  exact,
  onClose,
  onReserved,
}: Props) {
  // When auto-matched, pre-tick the oldest `need` units so the common case is
  // one click. When NOT matched (manual fallback over all warehouse stock), tick
  // nothing — the operator must deliberately choose, since these aren't a known
  // match for the item.
  const [checked, setChecked] = useState<Set<string>>(
    () =>
      exact
        ? new Set(units.slice(0, Math.max(0, need)).map((u) => u.id))
        : new Set(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [q, setQ] = useState("");

  // Same products grouped together; the search box narrows a long fallback list
  // (e.g. all 70 warehouse units) down to the few that matter.
  const view = (() => {
    const sorted = [...units].sort(
      (a, b) =>
        a.sku.localeCompare(b.sku) ||
        (a.dateIn ?? "").localeCompare(b.dateIn ?? ""),
    );
    const needle = q.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter((u) =>
      [u.sku, u.unitCode, u.poNo, u.sourceRef]
        .filter((s): s is string => Boolean(s))
        .some((s) => s.toLowerCase().includes(needle)),
    );
  })();

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function reserve() {
    const ids = units.filter((u) => checked.has(u.id)).map((u) => u.id);
    if (ids.length === 0) return;
    setSubmitting(true);
    const results = await Promise.allSettled(
      ids.map((itemId) =>
        apiFetch("/api/ops/stock/reserve-item", {
          method: "POST",
          body: JSON.stringify({ itemId, ref: soRef }),
        }),
      ),
    );
    setSubmitting(false);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - ok;
    if (ok > 0) {
      toast.success(
        `Reserved ${ok} unit${ok === 1 ? "" : "s"} to ${soRef}` +
          (failed ? ` · ${failed} could not be reserved` : ""),
      );
      onReserved();
    }
    if (failed > 0 && ok === 0) {
      const first = results.find((r) => r.status === "rejected") as
        | PromiseRejectedResult
        | undefined;
      const msg =
        first?.reason instanceof ApiError
          ? first.reason.message
          : "Could not reserve — units may have been grabbed already";
      toast.error(msg);
    }
    if (failed === 0) onClose();
  }

  return (
    <>
      {/* Transparent catcher: closes on an outside click but keeps the order
          drawer visible behind, so the operator can cross-check the order. */}
      <div onClick={onClose} role="presentation" className="fixed inset-0 z-[60]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reserve ready stock"
        className="fixed inset-y-0 left-0 z-[61] w-[460px] max-w-full bg-white border-r border-base-200 shadow-2xl flex flex-col"
        data-testid="reserve-stock-dialog"
      >
        <div className="px-5 py-3.5 border-b border-base-100">
          <div className="kicker">Reserve ready stock → {soRef}</div>
          <div className="t-h4 font-display mt-1 break-all">{sku}</div>
          {exact ? (
            <div className="text-[12px] text-base-500 mt-0.5">
              {view.length} of {units.length} free unit
              {units.length === 1 ? "" : "s"} match this item
            </div>
          ) : (
            <div className="text-[12px] text-warning mt-0.5">
              No exact match — {view.length} of {units.length} warehouse unit
              {units.length === 1 ? "" : "s"}. Search to narrow, then pick manually.
            </div>
          )}
        </div>

        {units.length > 6 && (
          <div className="px-4 pt-3">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name / PO / ref…"
              className="w-full px-3 py-2 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-primary"
              data-testid="reserve-stock-search"
            />
          </div>
        )}

        <div className="flex-1 overflow-auto px-2 py-2">
          {view.map((u) => {
            const on = checked.has(u.id);
            const isExhibition = u.condition === "exhibition";
            return (
              <label
                key={u.id}
                className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer ${
                  on ? "bg-primary/10" : "hover:bg-base-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(u.id)}
                  className="accent-primary w-4 h-4"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[12px] text-base-900 truncate">
                    {u.unitCode ?? u.sku}
                  </div>
                  <div className="text-[11px] text-base-500 truncate">
                    {u.poNo ? `PO ${u.poNo}` : "no PO"}
                    {u.sourceRef ? ` · ${u.sourceRef}` : ""}
                    {u.dateIn ? ` · in ${fmtDate(u.dateIn)}` : ""}
                  </div>
                </div>
                <span
                  className={`pill ${isExhibition ? "pill-warning" : "pill-confirmed"}`}
                >
                  {CONDITION_LABEL[u.condition] ?? u.condition}
                </span>
              </label>
            );
          })}
          {view.length === 0 && (
            <div className="p-8 text-center text-[12px] text-base-500">
              {units.length === 0
                ? "No free stock in the warehouse right now."
                : "No units match your search."}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-base-100 flex items-center justify-between gap-3">
          <button type="button" onClick={onClose} className="btn-ghost text-[12px] py-1.5 px-3">
            Cancel
          </button>
          <button
            type="button"
            onClick={reserve}
            disabled={submitting || checked.size === 0}
            className="btn-primary text-[12px] py-1.5 px-4"
            data-testid="reserve-stock-confirm"
          >
            {submitting
              ? "Reserving…"
              : `Reserve ${checked.size} to ${soRef}`}
          </button>
        </div>
      </div>
    </>
  );
}
