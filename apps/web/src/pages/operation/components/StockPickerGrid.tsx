import { useMemo, useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import type { ReserveFreeUnit } from "./ReserveStockDialog";

/**
 * StockPickerGrid — the EMBEDDED stock-reserve grid (Jess 2026-06-30) that lives
 * in the right pane of the order's "Items & stock" work area. The operator picks
 * a line on the left; this grid shows the warehouse's free units, ranked so the
 * ones most like that line surface first, with a per-column filter row. Tick the
 * physical unit(s) → reserve to the order's SO (POST /api/ops/stock/reserve-item).
 *
 * The product NAME is the only shared key (the catalog is empty — see
 * project-catalog-empty-sku-naming), so "best matches first" = a token-overlap
 * score between the order line sku and each unit sku.
 */

const CONDITION_LABEL: Record<string, string> = {
  new: "New",
  exhibition: "Exhibition",
  old: "Old",
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
/** Split on punctuation AND letter/digit boundaries so "1013Jager/Fab2-Queen"
 *  → ["1013","jager","fab","queen"]. */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

interface Props {
  /** The order line sku being fulfilled — for the title + relevance ranking. */
  sku: string;
  /** What gets written to reserved_ref, e.g. "SO-1234". */
  soRef: string;
  /** Line qty — used only to pre-tick that many of the top units. */
  need: number;
  /** ALL free warehouse units (the grid ranks + filters them). */
  units: ReserveFreeUnit[];
  /** Called after a successful reserve so the parent can invalidate. */
  onReserved: () => void;
}

// ☐ · Date in · Category · Item · Size · PO · Old ref · Condition
const GRID = "30px 78px 88px minmax(160px,1fr) 56px 104px 84px 92px";

export default function StockPickerGrid({ sku, soRef, need, units, onReserved }: Props) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [f, setF] = useState<Record<string, string>>({});
  const setFilter = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Rank by token-overlap with the order line (best matches first), then name.
  const rows = useMemo(() => {
    const want = new Set(tokenize(sku));
    return [...units]
      .map((u) => {
        const ut = tokenize(u.sku);
        let score = 0;
        for (const t of ut) if (want.has(t)) score += 1;
        return {
          ...u,
          cat: unitCategory(u.sku),
          size: unitSize(u.sku),
          cond: CONDITION_LABEL[u.condition] ?? u.condition,
          dateLabel: u.dateIn ? fmtDate(u.dateIn) : "",
          score,
        };
      })
      .sort((a, b) => b.score - a.score || a.sku.localeCompare(b.sku));
  }, [units, sku]);

  const opts = useMemo(() => {
    const uniq = (xs: string[]) => [...new Set(xs)].sort();
    return {
      cat: uniq(rows.map((r) => r.cat)),
      size: uniq(rows.map((r) => r.size)),
      cond: uniq(rows.map((r) => r.cond)),
    };
  }, [rows]);

  const view = useMemo(() => {
    const has = (val: string, q: string) => val.toLowerCase().includes(q.trim().toLowerCase());
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
      setChecked(new Set());
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
  }

  // Pre-tick the top `need` rows once, only the first time a line's units load.
  // (Kept simple: tick on mount via a derived initial set would re-run on filter
  // change, so we leave ticking to the operator here — relevance puts the right
  // units on top.)

  return (
    <div className="flex flex-col h-full min-h-0 border border-base-200 rounded-[4px] overflow-hidden bg-white">
      <div className="px-3 py-2 border-b border-base-100 flex items-center justify-between gap-2">
        <div className="t-tiny text-base-600 truncate">
          Stock · <span className="font-mono text-base-900">{sku}</span>
          <span className="text-base-400"> — best matches first</span>
        </div>
        <div className="t-tiny text-base-400">
          {view.length}/{rows.length} · {checked.size} picked
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        <div className="min-w-[640px]">
          {/* header */}
          <div
            className="grid sticky top-0 z-20 bg-base-700 border-b-2 border-primary text-white text-[10px] uppercase tracking-[0.02em] font-bold"
            style={{ gridTemplateColumns: GRID }}
          >
            <div className="px-1.5 py-1.5" />
            <div className="px-2 py-1.5">Date</div>
            <div className="px-2 py-1.5">Category</div>
            <div className="px-2 py-1.5">Item</div>
            <div className="px-2 py-1.5">Size</div>
            <div className="px-2 py-1.5">PO</div>
            <div className="px-2 py-1.5">Old ref</div>
            <div className="px-2 py-1.5">Cond</div>
          </div>
          {/* filter row */}
          <div
            className="grid sticky top-[27px] z-10 bg-base-50 border-b border-base-200"
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
          {/* body */}
          {view.map((r, i) => {
            const on = checked.has(r.id);
            return (
              <div
                key={r.id}
                onClick={() => toggle(r.id)}
                className={`grid items-center border-b border-base-100 cursor-pointer text-[11px] ${
                  on
                    ? "bg-primary/15 shadow-[inset_3px_0_0_#C44D2B]"
                    : i % 2
                      ? "bg-base-100/60 hover:bg-primary/5"
                      : "bg-white hover:bg-primary/5"
                }`}
                style={{ gridTemplateColumns: GRID }}
              >
                <div className="px-1.5 py-1 flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(r.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="accent-primary w-3.5 h-3.5"
                  />
                </div>
                <div className="px-2 py-1 text-base-500 truncate">{r.dateLabel || "—"}</div>
                <div className="px-2 py-1 text-base-600 truncate">{r.cat}</div>
                <div className="px-2 py-1 font-mono text-base-900 truncate" title={r.sku}>
                  {r.sku}
                </div>
                <div className="px-2 py-1 text-base-600">{r.size === "Other" ? "—" : r.size}</div>
                <div className="px-2 py-1 font-mono text-base-600 truncate" title={r.poNo ?? ""}>
                  {r.poNo ?? "—"}
                </div>
                <div className="px-2 py-1 font-mono text-base-500 truncate" title={r.sourceRef ?? ""}>
                  {r.sourceRef ?? "—"}
                </div>
                <div className="px-2 py-1">
                  <span className={`pill ${r.condition === "exhibition" ? "pill-warning" : "pill-confirmed"}`}>
                    {r.cond}
                  </span>
                </div>
              </div>
            );
          })}
          {view.length === 0 && (
            <div className="px-3 py-8 text-center t-tiny text-base-400">
              {rows.length === 0 ? "No free stock for this item." : "No units match these filters."}
            </div>
          )}
        </div>
      </div>

      <div className="px-3 py-2 border-t border-base-200 bg-base-50/50 flex items-center justify-end gap-2">
        <span className="t-tiny text-base-500 mr-auto">
          need {need} · {checked.size} picked
        </span>
        <button
          type="button"
          onClick={reserve}
          disabled={submitting || checked.size === 0}
          className="btn-primary t-tiny py-1.5 px-4"
        >
          {submitting ? "Reserving…" : `Reserve ${checked.size} to ${soRef}`}
        </button>
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
        className="w-full px-1.5 py-0.5 text-[11px] border border-base-200 rounded bg-white outline-none focus:border-primary"
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
        className="w-full px-1 py-0.5 text-[11px] border border-base-200 rounded bg-white outline-none focus:border-primary"
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
