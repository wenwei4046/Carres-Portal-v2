import { useMemo, useRef, useState } from "react";
import { GripVertical, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import PoolReasonPicker, { usePoolDrawReason } from "./PoolReasonPicker";

/**
 * ReserveStockDialog — the order-drawer "Ready" picker (Jess 2026-06-30).
 *
 * The catalog (product_skus) is empty, so an order line and the warehouse's
 * per-unit stock both carry the product NAME as their sku and match only under
 * `normalizeSkuKey` (project-catalog-empty-sku-naming). The drawer matches each
 * line to the free units and opens this dialog; the operator ticks the exact
 * physical unit(s) and we reserve each to the order's SO via POST
 * /api/ops/stock/reserve-item. When nothing auto-matches we show ALL free
 * warehouse stock so the operator can always pick manually.
 *
 * UI = the approved AutoCount/DataGrid look (Jess critique): fixed column-by-
 * column layout, a per-column filter row (type to narrow, no scrolling), v17
 * type scale, dark-slate header + zebra, Lucide icons (no emoji), draggable.
 * Columns: ☐ · Date in · Category · Item · Size · PO · Old ref · Condition.
 */

export interface ReserveFreeUnit {
  id: string;
  unitCode: string | null;
  sku: string;
  condition: "new" | "exhibition" | "old" | "refurbished" | "damaged";
  poNo: string | null;
  sourceRef: string | null;
  dateIn: string | null;
  /** Warehouse location (§7.8 Location column) — optional: older API builds
   *  don't return it; the grid shows "—" until they do. */
  location?: string | null;
  /** Units this record represents (0218 bulk rows). Optional for the same
   *  reason as `location`; absent reads as 1, which under-states a reserve
   *  level warning rather than inventing one. */
  qty?: number | null;
}

interface Props {
  sku: string;
  soRef: string;
  need: number;
  units: ReserveFreeUnit[];
  exact: boolean;
  onClose: () => void;
  onReserved: () => void;
}

const CONDITION_LABEL: Record<string, string> = {
  new: "New",
  exhibition: "Display",
  old: "Fair (used)",
  refurbished: "Refurbished",
  damaged: "Damaged",
};

type Category = "Mattress" | "Bedframe" | "Sofa" | "Other";
type Size = "King" | "Queen" | "Other";

function unitCategory(sku: string): Category {
  const s = sku.toLowerCase();
  if (/\bbedframe\b|divan|\bframe\b/.test(s)) return "Bedframe";
  if (/seater|l ?shape|\bsofa\b|^sf\d/.test(s)) return "Sofa";
  if (/firmcare|softcloud|mattress|memory|sonic|\bm\d{3,}|\bl\d{3,}|\bb\d{3,}|\bh\d{3,}/.test(s))
    return "Mattress";
  return "Other";
}
function unitSize(sku: string): Size {
  const s = sku.toLowerCase();
  if (/queen|[-(\s]q(\)|\b|$)/.test(s)) return "Queen";
  if (/king|[-(\s]k(\)|\b|$)/.test(s)) return "King";
  return "Other";
}

// ☐ · Date in · Category · Item · Size · PO · Old ref · Condition
const GRID = "34px 86px 96px minmax(200px,1fr) 62px 116px 96px 104px";

interface Row extends ReserveFreeUnit {
  cat: Category;
  size: Size;
  cond: string;
  dateLabel: string;
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
  const [checked, setChecked] = useState<Set<string>>(
    () =>
      exact
        ? new Set(units.slice(0, Math.max(0, need)).map((u) => u.id))
        : new Set(),
  );
  const [submitting, setSubmitting] = useState(false);
  // K4 — a ready-stock unit does not leave the shelf without a reason.
  const draw = usePoolDrawReason();
  // Per-column filter values (empty string = no filter on that column).
  const [f, setF] = useState<Record<string, string>>({});
  const setFilter = (k: string, v: string) =>
    setF((p) => ({ ...p, [k]: v }));

  // Drag-to-move by the header (Jess).
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  const rows: Row[] = useMemo(
    () =>
      [...units]
        .map((u) => ({
          ...u,
          cat: unitCategory(u.sku),
          size: unitSize(u.sku),
          cond: CONDITION_LABEL[u.condition] ?? u.condition,
          dateLabel: u.dateIn ? fmtDate(u.dateIn) : "",
        }))
        .sort(
          (a, b) =>
            a.sku.localeCompare(b.sku) ||
            (a.dateIn ?? "").localeCompare(b.dateIn ?? ""),
        ),
    [units],
  );

  const opts = useMemo(() => {
    const uniq = (xs: string[]) => [...new Set(xs)].sort();
    return {
      cat: uniq(rows.map((r) => r.cat)),
      size: uniq(rows.map((r) => r.size)),
      cond: uniq(rows.map((r) => r.cond)),
    };
  }, [rows]);

  const view = useMemo(() => {
    const has = (val: string, q: string) =>
      val.toLowerCase().includes(q.trim().toLowerCase());
    return rows.filter(
      (r) =>
        (!f.dateIn || has(r.dateLabel, f.dateIn)) &&
        (!f.cat || r.cat === f.cat) &&
        (!f.sku || has(r.sku, f.sku)) &&
        (!f.size || r.size === f.size) &&
        (!f.poNo || has(r.poNo ?? "", f.poNo)) &&
        (!f.sourceRef || has(r.sourceRef ?? "", f.sourceRef)) &&
        (!f.cond || r.cond === f.cond),
    );
  }, [rows, f]);

  const allViewChecked = view.length > 0 && view.every((r) => checked.has(r.id));

  // What the ticked units would leave on the shelf, per SKU. A bulk accessory
  // record is one row of N units, so this sums `qty` rather than counting rows.
  const warnings = useMemo(() => {
    const perSku = new Map<string, number>();
    for (const r of rows) {
      if (!checked.has(r.id)) continue;
      perSku.set(r.sku, (perSku.get(r.sku) ?? 0) + (r.qty ?? 1));
    }
    return draw.warningsFor(
      [...perSku].map(([sku, qty]) => ({ sku, qty })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, checked, draw.warningsFor]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllView() {
    setChecked((prev) => {
      const next = new Set(prev);
      if (allViewChecked) view.forEach((r) => next.delete(r.id));
      else view.forEach((r) => next.add(r.id));
      return next;
    });
  }

  async function reserve() {
    const ids = [...checked];
    if (ids.length === 0 || draw.problem) return;
    setSubmitting(true);
    const results = await Promise.allSettled(
      ids.map((itemId) =>
        apiFetch("/api/ops/stock/reserve-item", {
          method: "POST",
          body: JSON.stringify({ itemId, ref: soRef, ...draw.body }),
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
      style={{ background: "rgba(34,31,32,0.25)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Reserve ready stock"
        className="bg-white border border-base-200 rounded-md shadow-2xl flex flex-col max-h-[86vh] w-[940px] max-w-full"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
        data-testid="reserve-stock-dialog"
      >
        {/* Header — drag handle */}
        <div
          onPointerDown={(e) => {
            drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            setPos({
              x: drag.current.ox + (e.clientX - drag.current.sx),
              y: drag.current.oy + (e.clientY - drag.current.sy),
            });
          }}
          onPointerUp={(e) => {
            drag.current = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          className="flex items-start gap-2 px-4 py-3 border-b border-base-100 cursor-move select-none touch-none"
        >
          <GripVertical className="w-4 h-4 text-base-300 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-label uppercase tracking-[0.05em] text-base-400">Reserve ready stock → {soRef}</div>
            <div className="text-strong font-display mt-0.5 truncate">{sku}</div>
          </div>
          {!exact && (
            <span className="pill pill-warning shrink-0 mt-0.5">No exact match</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-base-400 hover:text-base-700 shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto">
          <div className="min-w-[760px]">
            {/* Header row */}
            <div
              className="grid sticky top-0 z-20 bg-base-700 border-b-2 border-primary text-white"
              style={{ gridTemplateColumns: GRID }}
            >
              <div className="px-2 py-2 flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={allViewChecked}
                  onChange={toggleAllView}
                  className="accent-primary w-3.5 h-3.5"
                  aria-label="Select all shown"
                />
              </div>
              {(
                [
                  ["Date in", "left"],
                  ["Category", "left"],
                  ["Item", "left"],
                  ["Size", "left"],
                  ["PO", "left"],
                  ["Old ref", "left"],
                  ["Condition", "left"],
                ] as const
              ).map(([label]) => (
                <div
                  key={label}
                  className="px-2.5 py-2 text-label font-semibold uppercase tracking-[0.02em] truncate"
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Filter row */}
            <div
              className="grid sticky top-[33px] z-10 bg-base-50 border-b border-base-200"
              style={{ gridTemplateColumns: GRID }}
            >
              <div className="px-1 py-1" />
              <FilterText value={f.dateIn} onChange={(v) => setFilter("dateIn", v)} />
              <FilterSelect value={f.cat} options={opts.cat} onChange={(v) => setFilter("cat", v)} />
              <FilterText value={f.sku} onChange={(v) => setFilter("sku", v)} placeholder="name…" />
              <FilterSelect value={f.size} options={opts.size} onChange={(v) => setFilter("size", v)} />
              <FilterText value={f.poNo} onChange={(v) => setFilter("poNo", v)} />
              <FilterText value={f.sourceRef} onChange={(v) => setFilter("sourceRef", v)} />
              <FilterSelect value={f.cond} options={opts.cond} onChange={(v) => setFilter("cond", v)} />
            </div>

            {/* Body */}
            {view.map((r, i) => {
              const on = checked.has(r.id);
              return (
                <div
                  key={r.id}
                  onClick={() => toggle(r.id)}
                  className={`grid items-center border-b border-base-100 cursor-pointer ${
                    on
                      ? "bg-primary/15 shadow-[inset_3px_0_0_#C44D2B]"
                      : i % 2
                        ? "bg-base-100/60 hover:bg-primary/5"
                        : "bg-white hover:bg-primary/5"
                  }`}
                  style={{ gridTemplateColumns: GRID }}
                  data-testid="reserve-stock-row"
                >
                  <div className="px-2 py-1.5 flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(r.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="accent-primary w-3.5 h-3.5"
                    />
                  </div>
                  <div className="px-2.5 py-1.5 text-meta text-base-500 truncate">
                    {r.dateLabel || "—"}
                  </div>
                  <div className="px-2.5 py-1.5 text-meta text-base-600 truncate">{r.cat}</div>
                  <div
                    className="px-2.5 py-1.5 font-mono text-meta text-base-900 truncate"
                    title={r.sku}
                  >
                    {r.sku}
                  </div>
                  <div className="px-2.5 py-1.5 text-meta text-base-600">
                    {r.size === "Other" ? "—" : r.size}
                  </div>
                  <div className="px-2.5 py-1.5 text-meta font-mono text-base-600 truncate" title={r.poNo ?? ""}>
                    {r.poNo ?? "—"}
                  </div>
                  <div className="px-2.5 py-1.5 text-meta font-mono text-base-500 truncate" title={r.sourceRef ?? ""}>
                    {r.sourceRef ?? "—"}
                  </div>
                  <div className="px-2.5 py-1.5">
                    <span
                      className={`pill ${r.condition === "exhibition" ? "pill-warning" : "pill-confirmed"}`}
                    >
                      {r.cond}
                    </span>
                  </div>
                </div>
              );
            })}
            {view.length === 0 && (
              <div className="px-3 py-10 text-center text-body text-base-400">
                {rows.length === 0
                  ? "No free stock in the warehouse right now."
                  : "No units match these filters."}
              </div>
            )}
          </div>
        </div>

        {/* Footer — K4: the reason rides with the draw, never after it. */}
        <div className="px-4 py-2.5 border-t border-base-200 bg-base-50/50 flex flex-col gap-2">
          <PoolReasonPicker state={draw} warnings={warnings} />
          <div className="flex items-center justify-between gap-3">
            <span className="text-meta text-base-500">
              {view.length} of {rows.length} shown · {checked.size} selected
              {draw.problem && checked.size > 0 ? (
                <span className="ml-2 text-base-600" data-testid="reserve-stock-problem">
                  {draw.problem}
                </span>
              ) : null}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="btn-ghost text-meta py-1.5 px-3">
                Cancel
              </button>
              <button
                type="button"
                onClick={reserve}
                disabled={submitting || checked.size === 0 || !!draw.problem}
                className="btn-primary text-meta py-1.5 px-4 disabled:opacity-40"
                data-testid="reserve-stock-confirm"
              >
                {submitting ? "Reserving…" : `Reserve ${checked.size} to ${soRef}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterText({
  value,
  onChange,
  placeholder = "filter…",
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="px-1 py-1">
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-1.5 py-1 text-meta border border-base-200 rounded bg-white outline-none focus:border-primary"
      />
    </div>
  );
}

function FilterSelect({
  value,
  options,
  onChange,
}: {
  value: string | undefined;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="px-1 py-1">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-1 py-1 text-meta border border-base-200 rounded bg-white outline-none focus:border-primary"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
