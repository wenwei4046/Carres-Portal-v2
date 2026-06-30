import { useMemo, useState } from "react";
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
 * = soRef). When nothing auto-matches we show ALL free warehouse stock so the
 * operator can always pick manually (overridable default).
 *
 * UI (Jess critique): a proper Google-Sheet-style TABLE — one clean centered
 * surface (not a skinny side strip), columns + Category / Size filter chips +
 * search, dark-slate header + zebra, so a 70-row fallback is actually readable.
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

type Category = "Mattress" | "Bedframe" | "Sofa" | "Other";
type Size = "King" | "Queen" | "Other";

/** Derive a coarse category from the warehouse product NAME (best-effort — the
 *  catalog has no real rows to look it up, so we read keywords off the label). */
function unitCategory(sku: string): Category {
  const s = sku.toLowerCase();
  if (/\bbedframe\b|divan|\bframe\b/.test(s)) return "Bedframe";
  if (/seater|l ?shape|\bsofa\b|^sf\d/.test(s)) return "Sofa";
  if (/firmcare|softcloud|mattress|memory|sonic|\bm\d{3,}|\bl\d{3,}|\bb\d{3,}|\bh\d{3,}/.test(s))
    return "Mattress";
  return "Other";
}

/** Derive King / Queen from the product NAME (trailing size token). */
function unitSize(sku: string): Size {
  const s = sku.toLowerCase();
  if (/queen|[-(\s]q(\)|\b|$)/.test(s)) return "Queen";
  if (/king|[-(\s]k(\)|\b|$)/.test(s)) return "King";
  return "Other";
}

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
  // one click. When NOT matched (manual fallback), tick nothing.
  const [checked, setChecked] = useState<Set<string>>(
    () =>
      exact
        ? new Set(units.slice(0, Math.max(0, need)).map((u) => u.id))
        : new Set(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | "All">("All");
  const [size, setSize] = useState<Size | "All">("All");

  // Decorate once: derive category + size per unit, sort same products together.
  const rows = useMemo(
    () =>
      [...units]
        .map((u) => ({ ...u, cat: unitCategory(u.sku), size: unitSize(u.sku) }))
        .sort(
          (a, b) =>
            a.sku.localeCompare(b.sku) ||
            (a.dateIn ?? "").localeCompare(b.dateIn ?? ""),
        ),
    [units],
  );

  const catCounts = useMemo(() => {
    const m = new Map<Category, number>();
    for (const r of rows) m.set(r.cat, (m.get(r.cat) ?? 0) + 1);
    return m;
  }, [rows]);
  const sizeCounts = useMemo(() => {
    const m = new Map<Size, number>();
    for (const r of rows) m.set(r.size, (m.get(r.size) ?? 0) + 1);
    return m;
  }, [rows]);

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (cat !== "All" && r.cat !== cat) return false;
      if (size !== "All" && r.size !== size) return false;
      if (!needle) return true;
      return [r.sku, r.unitCode, r.poNo, r.sourceRef]
        .filter((s): s is string => Boolean(s))
        .some((s) => s.toLowerCase().includes(needle));
    });
  }, [rows, q, cat, size]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function reserve() {
    const ids = [...checked];
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
      toast.error(
        first?.reason instanceof ApiError
          ? first.reason.message
          : "Could not reserve — units may have been grabbed already",
      );
    }
    if (failed === 0) onClose();
  }

  return (
    <div
      onClick={onClose}
      role="presentation"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(34,31,32,0.55)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Reserve ready stock"
        className="bg-white border border-base-200 rounded-md flex flex-col max-h-[86vh] w-[880px] max-w-full"
        data-testid="reserve-stock-dialog"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-base-100">
          <div className="kicker">Reserve ready stock → {soRef}</div>
          <div className="t-h4 font-display mt-1 break-all">{sku}</div>
          <div className={`text-[12px] mt-0.5 ${exact ? "text-base-500" : "text-warning"}`}>
            {exact
              ? "Free units matching this item — tick which to use for this order."
              : "No exact match — showing all warehouse stock. Filter / search, then pick manually."}
          </div>
        </div>

        {/* Filter bar */}
        <div className="px-5 py-3 border-b border-base-100 flex flex-wrap items-center gap-x-5 gap-y-2">
          <FilterChips
            label="Category"
            value={cat}
            counts={catCounts}
            options={["Mattress", "Bedframe", "Sofa", "Other"]}
            onPick={(v) => setCat(v as Category | "All")}
          />
          <FilterChips
            label="Size"
            value={size}
            counts={sizeCounts}
            options={["King", "Queen", "Other"]}
            onPick={(v) => setSize(v as Size | "All")}
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name / PO / ref…"
            className="ml-auto w-[220px] px-3 py-1.5 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-primary"
            data-testid="reserve-stock-search"
          />
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-[13px] border-collapse [&_tbody_tr:nth-child(even)]:bg-base-100/70">
            <thead className="bg-base-700 border-b-2 border-primary text-white sticky top-0">
              <tr className="text-[11px] uppercase tracking-[0.02em]">
                <th className="px-3 py-2 w-9" />
                <th className="px-3 py-2 text-left font-bold">Item</th>
                <th className="px-3 py-2 text-left font-bold w-24">Category</th>
                <th className="px-3 py-2 text-left font-bold w-16">Size</th>
                <th className="px-3 py-2 text-left font-bold w-24">Condition</th>
                <th className="px-3 py-2 text-left font-bold w-32">PO</th>
                <th className="px-3 py-2 text-left font-bold w-24">Date in</th>
              </tr>
            </thead>
            <tbody>
              {view.map((u) => {
                const on = checked.has(u.id);
                return (
                  <tr
                    key={u.id}
                    onClick={() => toggle(u.id)}
                    className={`border-t border-base-100 cursor-pointer ${on ? "!bg-primary/15 shadow-[inset_3px_0_0_#C44D2B]" : "hover:bg-primary/5"}`}
                  >
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(u.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-primary w-4 h-4 align-middle"
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-[12px] text-base-900">
                      {u.sku}
                      {u.sourceRef ? (
                        <span className="text-base-400"> · {u.sourceRef}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-base-600">{u.cat}</td>
                    <td className="px-3 py-2 text-base-600">
                      {u.size === "Other" ? "—" : u.size}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`pill ${u.condition === "exhibition" ? "pill-warning" : "pill-confirmed"}`}
                      >
                        {CONDITION_LABEL[u.condition] ?? u.condition}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11px] font-mono text-base-600">
                      {u.poNo ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-base-500">
                      {u.dateIn ? fmtDate(u.dateIn) : "—"}
                    </td>
                  </tr>
                );
              })}
              {view.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-[12px] text-base-500">
                    {rows.length === 0
                      ? "No free stock in the warehouse right now."
                      : "No units match these filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-base-100 flex items-center justify-between gap-3">
          <div className="text-[12px] text-base-500">
            {view.length} of {rows.length} shown · {checked.size} selected
          </div>
          <div className="flex items-center gap-2">
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
              {submitting ? "Reserving…" : `Reserve ${checked.size} to ${soRef}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A labelled "All + options" ghost-pill chip row for a single filter dimension. */
function FilterChips<T extends string>({
  label,
  value,
  counts,
  options,
  onPick,
}: {
  label: string;
  value: T | "All";
  counts: Map<T, number>;
  options: T[];
  onPick: (v: T | "All") => void;
}) {
  // Only show options that actually have stock, so the bar stays tight.
  const present = options.filter((o) => (counts.get(o) ?? 0) > 0);
  const total = present.reduce((s, o) => s + (counts.get(o) ?? 0), 0);
  const chip = (key: T | "All", text: string, n: number) => {
    const active = value === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => onPick(key)}
        className={`px-2.5 py-1 rounded-full text-[12px] border transition-colors ${
          active
            ? "bg-primary text-white border-primary"
            : "bg-white text-base-600 border-base-200 hover:border-base-400"
        }`}
      >
        {text}
        <span className={`ml-1 ${active ? "text-white/70" : "text-base-400"}`}>{n}</span>
      </button>
    );
  };
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-base-400 mr-0.5">
        {label}
      </span>
      {chip("All", "All", total)}
      {present.map((o) => chip(o, o, counts.get(o) ?? 0))}
    </div>
  );
}
