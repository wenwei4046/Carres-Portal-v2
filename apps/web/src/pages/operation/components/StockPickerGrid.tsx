import { useEffect, useMemo, useRef, useState } from "react";
import { Filter, X, Handshake } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { lineCategory, stockMatchKey } from "@/lib/line-category";
import type { ReserveFreeUnit } from "./ReserveStockDialog";

/**
 * StockPickerGrid — the EMBEDDED stock-reserve grid (Jess 2026-06-30) that lives
 * in the right pane of the order's "Items & stock" work area. The operator picks
 * a line on the left; this grid shows the warehouse's free units for THAT line,
 * with a Google-sheets-style funnel filter in each header cell. Tick the physical
 * unit(s) → reserve to the order's SO (POST /api/ops/stock/reserve-item).
 *
 * Scope (Jess 2026-07-01 locked): the panel lists ONLY the units that match the
 * order line — same model + size via `stockMatchKey`, the SAME rule the readiness
 * badge counts by, so "N free" here always equals the badge. Unrelated stock
 * lives in Stock · On Hand, not here. For a sofa line, a "Loan any sofa" toggle
 * widens the view to EVERY free sofa (any model/fabric) so the operator can pick
 * a loaner when the exact model isn't ready.
 *
 * The product NAME is the only shared key (the catalog is empty — see
 * project-catalog-empty-sku-naming); within the loan view, a token-overlap score
 * surfaces the closest sofas first.
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
  /** ALL free warehouse units (the grid scopes them to the line / loan set). */
  units: ReserveFreeUnit[];
  /** True when the active line is a sofa — enables the "Loan any sofa" toggle. */
  isSofa: boolean;
  /** Called after a successful reserve so the parent can invalidate. */
  onReserved: () => void;
}

// ☐ · Date in · Category · Item · Size · PO · Old ref · Condition
const GRID = "30px 78px 88px minmax(160px,1fr) 56px 104px 84px 92px";

/** Filterable columns (the ☐ checkbox column has no filter). `kind` picks the
 *  funnel menu: `text` = a contains-box, `select` = a distinct-value list whose
 *  options come from `optKey` on the computed `opts`. */
type FilterKind = "text" | "select";
const COLS: {
  key: string;
  label: string;
  kind: FilterKind;
  optKey?: "cat" | "size" | "cond";
  placeholder?: string;
}[] = [
  { key: "dateIn", label: "Date", kind: "text", placeholder: "date…" },
  { key: "cat", label: "Category", kind: "select", optKey: "cat" },
  { key: "sku", label: "Item", kind: "text", placeholder: "name…" },
  { key: "size", label: "Size", kind: "select", optKey: "size" },
  { key: "poNo", label: "PO", kind: "text", placeholder: "PO…" },
  { key: "sourceRef", label: "Old ref", kind: "text", placeholder: "ref…" },
  { key: "cond", label: "Cond", kind: "select", optKey: "cond" },
];

export default function StockPickerGrid({ sku, soRef, need, units, isSofa, onReserved }: Props) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [f, setF] = useState<Record<string, string>>({});
  const setFilter = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  // Which column's funnel menu is open + where to anchor it (fixed-positioned so
  // it isn't clipped by the grid's own scroll container).
  const [menu, setMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  // Loan view (Jess 2026-07-01): a sofa line can loan ANY free sofa, so this
  // toggle drops the same-model filter and shows every free sofa instead.
  const [loanMode, setLoanMode] = useState(false);
  const activeFilters = Object.values(f).filter((v) => v && v.trim()).length;

  // Reset the picker whenever the operator switches to a different order line —
  // ticks, column filters, and the loan view all belong to the previous line.
  useEffect(() => {
    setChecked(new Set());
    setF({});
    setMenu(null);
    setLoanMode(false);
  }, [sku]);

  const matchKey = stockMatchKey(sku);

  // Scope to this line: default = same model + size (stockMatchKey, the rule the
  // readiness badge counts by). Loan view = every free sofa, ranked by
  // token-overlap so the closest models surface first.
  const rows = useMemo(() => {
    const want = new Set(tokenize(sku));
    return units
      .filter((u) =>
        loanMode ? lineCategory(u.sku) === "sofa" : stockMatchKey(u.sku) === matchKey,
      )
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
  }, [units, sku, matchKey, loanMode]);

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
        `${loanMode ? "Loaned" : "Reserved"} ${ok} unit${ok === 1 ? "" : "s"} to ${soRef}` +
          (failed ? ` · ${failed} could not be ${loanMode ? "loaned" : "reserved"}` : ""),
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
    <div className="flex flex-col h-full min-h-0 border border-base-200 rounded-[12px] overflow-hidden bg-white">
      <div className="px-3 py-2 border-b border-base-100 flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <span className="t-h4 text-base-900">Warehouse stock</span>
          <span className="ml-1.5 t-tiny text-base-400 truncate">
            {loanMode ? "· any sofa — loan" : "· same model + size"}
          </span>
        </div>
        <div className="t-tiny text-base-500 flex items-center gap-2 shrink-0">
          {isSofa && (
            <button
              type="button"
              onClick={() => setLoanMode((v) => !v)}
              title={
                loanMode
                  ? "Back to this line's exact model + size"
                  : "Show every free sofa so you can loan one (any model / fabric)"
              }
              className={`inline-flex items-center gap-1 rounded-[5px] border px-2 py-0.5 transition-colors ${
                loanMode
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-base-200 text-base-600 hover:border-primary hover:text-primary"
              }`}
            >
              {loanMode ? (
                <>
                  <X size={11} strokeWidth={2.5} /> Same model only
                </>
              ) : (
                <>
                  <Handshake size={11} strokeWidth={2.5} /> Loan any sofa
                </>
              )}
            </button>
          )}
          <span className="whitespace-nowrap">
            {rows.length} free · {checked.size} picked
            {activeFilters > 0 ? ` · ${view.length} shown` : ""}
          </span>
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => setF({})}
              title="Clear all column filters"
              className="text-primary hover:underline inline-flex items-center gap-0.5"
            >
              <X size={11} strokeWidth={2.5} /> clear
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        <div className="min-w-[640px]">
          {/* header — Google-sheets funnel filter per column (no filter row) */}
          <div
            className="grid sticky top-0 z-20 bg-base-700 border-b-2 border-primary text-white text-[10px] uppercase tracking-[0.02em] font-bold"
            style={{ gridTemplateColumns: GRID }}
          >
            <div className="px-1.5 py-1.5" />
            {COLS.map((col) => {
              const active = !!f[col.key]?.trim();
              return (
                <button
                  key={col.key}
                  type="button"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setMenu((m) =>
                      m?.key === col.key
                        ? null
                        : { key: col.key, x: Math.min(r.left, window.innerWidth - 194), y: r.bottom },
                    );
                  }}
                  title={active ? `Filtering: ${f[col.key]}` : `Filter ${col.label}`}
                  className="px-2 py-1.5 flex items-center justify-between gap-1 text-left hover:bg-base-600 transition-colors"
                >
                  <span className="truncate">{col.label}</span>
                  <Filter
                    size={11}
                    strokeWidth={2.5}
                    className={active ? "text-primary fill-primary shrink-0" : "text-white/40 shrink-0"}
                  />
                </button>
              );
            })}
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
              {rows.length > 0
                ? "No units match these filters."
                : loanMode
                  ? "No free sofas in stock to loan."
                  : isSofa
                    ? "No same-model sofa ready — try “Loan any sofa”."
                    : "No same-model free stock — raise a PO."}
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
          {submitting
            ? loanMode
              ? "Loaning…"
              : "Reserving…"
            : `${loanMode ? "Loan" : "Reserve"} ${checked.size} to ${soRef}`}
        </button>
      </div>

      {/* Funnel filter menu (fixed-positioned so the grid's scroll never clips it) */}
      {menu &&
        (() => {
          const col = COLS.find((c) => c.key === menu.key);
          if (!col) return null;
          const options = col.optKey ? opts[col.optKey] : [];
          return (
            <FilterMenu
              col={col}
              value={f[col.key]}
              options={options}
              x={menu.x}
              y={menu.y}
              onChange={(v) => setFilter(col.key, v)}
              onClose={() => setMenu(null)}
            />
          );
        })()}
    </div>
  );
}

/** The per-column funnel menu (Google-sheets style): a contains-box for text
 *  columns, a distinct-value list for select columns. Fixed-positioned at the
 *  funnel; a transparent backdrop + Esc close it. */
function FilterMenu({
  col,
  value,
  options,
  x,
  y,
  onChange,
  onClose,
}: {
  col: { key: string; label: string; kind: FilterKind; placeholder?: string };
  value: string | undefined;
  options: string[];
  x: number;
  y: number;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-[184px] bg-white border border-base-200 rounded-[5px] shadow-lg overflow-hidden"
        style={{ left: x, top: y + 2 }}
      >
        <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-base-100 bg-base-50">
          <span className="t-micro text-base-500">{col.label}</span>
          {value?.trim() ? (
            <button
              type="button"
              onClick={() => {
                onChange("");
                onClose();
              }}
              className="t-micro text-primary hover:underline inline-flex items-center gap-0.5"
            >
              <X size={10} strokeWidth={2.5} /> Clear
            </button>
          ) : null}
        </div>

        {col.kind === "text" ? (
          <div className="p-2">
            <input
              ref={inputRef}
              value={value ?? ""}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onClose()}
              placeholder={col.placeholder ?? "contains…"}
              className="w-full px-2 py-1 text-[12px] border border-base-200 rounded bg-white outline-none focus:border-primary"
            />
          </div>
        ) : (
          <div className="max-h-[220px] overflow-auto py-1">
            <MenuOption label="All" selected={!value} onClick={() => { onChange(""); onClose(); }} />
            {options.map((o) => (
              <MenuOption
                key={o}
                label={o}
                selected={value === o}
                onClick={() => { onChange(o); onClose(); }}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function MenuOption({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-2.5 py-1 text-[12px] hover:bg-primary/5 ${
        selected ? "text-primary font-semibold bg-primary/10" : "text-base-700"
      }`}
    >
      {label}
    </button>
  );
}
