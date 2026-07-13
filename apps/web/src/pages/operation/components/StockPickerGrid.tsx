import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Search, X, Handshake } from "lucide-react";
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
  /** When provided, the loan view's action LOANS the picked sofa (issue a DO +
   *  on-loan tracking) via the parent instead of a plain reserve (migration 0209). */
  onLoan?: (itemId: string, itemSku: string) => void;
  /** The panel header ⋮ (Jess 2026-07-11 per-panel ⋮) — rendered at the header's
   *  right edge so the Warehouse-stock panel matches the others. */
  actions?: ReactNode;
}

// ☐ · Date in · Category · Item · Size · PO · Old ref · Condition
const GRID = "30px 78px 88px minmax(160px,1fr) 56px 104px 84px 92px";

// Header labels only — the 7 per-column funnel filters were replaced by ONE
// search box (Jess 2026-07-13); the header is plain again.
const COL_LABELS = ["Date", "Category", "Item", "Size", "PO", "Old ref", "Cond"];

export default function StockPickerGrid({ sku, soRef, need, units, isSofa, onReserved, onLoan, actions }: Props) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  // ONE search box (Jess 2026-07-13, replaces the 7 per-column funnels) — every
  // typed token must match SOMEWHERE across model / size / category / PO /
  // old ref / date-in / condition (AND across tokens, OR across fields).
  const [q, setQ] = useState("");
  // Loan view (Jess 2026-07-01): a sofa line can loan ANY free sofa, so this
  // toggle drops the same-model filter and shows every free sofa instead.
  const [loanMode, setLoanMode] = useState(false);

  // Reset the picker whenever the operator switches to a different order line —
  // ticks, the search, and the loan view all belong to the previous line.
  useEffect(() => {
    setChecked(new Set());
    setQ("");
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
      .sort((a, b) => {
        // Loan view (Jess): prefer Exhibition, then Old, then New — spare the new
        // stock; a loaner is temporary.
        if (loanMode) {
          const rank = (cond: string) =>
            cond === "exhibition" ? 0 : cond === "old" ? 1 : 2;
          const r = rank(a.condition) - rank(b.condition);
          if (r !== 0) return r;
        }
        return b.score - a.score || a.sku.localeCompare(b.sku);
      });
  }, [units, sku, matchKey, loanMode]);

  const view = useMemo(() => {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return rows;
    return rows.filter((r) => {
      const hay =
        `${r.sku} ${r.cat} ${r.size} ${r.poNo ?? ""} ${r.sourceRef ?? ""} ${r.dateLabel} ${r.cond}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [rows, q]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Loan the FIRST picked sofa (a loan is one unit + one DO) — the parent opens
  // the DO prompt + issues the loan (migration 0209).
  function loanOne() {
    const firstId = [...checked][0];
    if (!firstId || !onLoan) return;
    const row = rows.find((r) => r.id === firstId);
    onLoan(firstId, row?.sku ?? sku);
  }
  const loaning = loanMode && !!onLoan;

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
            {q.trim() ? ` · ${view.length} shown` : ""}
          </span>
          {actions}
        </div>
      </div>

      {/* ONE search box (Jess 2026-07-13) — replaces the 7 per-column funnels.
          Matches model / size / category / PO / old ref / date / condition. */}
      <div className="px-3 py-1.5 border-b border-base-100 shrink-0 relative">
        <Search
          size={13}
          className="absolute left-5 top-1/2 -translate-y-1/2 text-base-400 pointer-events-none"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search model / size / PO / old ref…"
          className="w-full pl-7 pr-2 py-1 text-[12px] border border-base-200 rounded-md bg-white outline-none focus:border-primary"
        />
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        <div className="min-w-[640px]">
          {/* header — plain labels (the funnels are gone; the search box above
              is the one filter). */}
          <div
            className="grid sticky top-0 z-20 bg-[#F1EDE6] border-b border-[#DDD8CE] text-[#8C877D] text-[10px] uppercase tracking-[0.02em] font-bold"
            style={{ gridTemplateColumns: GRID }}
          >
            <div className="px-1.5 py-1.5" />
            {COL_LABELS.map((label) => (
              <div key={label} className="px-2 py-1.5 truncate">
                {label}
              </div>
            ))}
          </div>
          {/* body */}
          {view.map((r, i) => {
            const on = checked.has(r.id);
            return (
              <div
                key={r.id}
                onClick={() => toggle(r.id)}
                className={`grid items-center min-h-[40px] border-b border-base-100 cursor-pointer text-[11px] ${
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
                ? "No units match this search."
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
        {loaning ? (
          <button
            type="button"
            onClick={loanOne}
            disabled={checked.size === 0}
            title="Issue a loan DO + mark this sofa on-loan to the order"
            className="btn-primary t-tiny py-1.5 px-4"
          >
            Loan to {soRef}
          </button>
        ) : (
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
        )}
      </div>

    </div>
  );
}
