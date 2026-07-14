import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Search, X, Handshake } from "lucide-react";
import { SectionCard, SectionBand } from "@/components/SectionPanel";
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
  /** UI-KIT §5.1 — render as a SECTION (band + body, no own SectionCard) so the
   *  grid stacks inside the column's ONE shared white card like every other
   *  section. Omit for the standalone-card layout. */
  bare?: boolean;
}

// §7.8 columns (2026-07-13): ☐ · Item (model) · Size · Location · Cond ·
// Age (days in) · PO · a per-row Reserve action. One grid for both the
// same-model view and the loan view (the Item column shows the model either
// way; old-ref stays searchable but is no longer a column).
const GRID = "26px minmax(120px,1.5fr) 58px 90px 84px 50px 90px 72px";
const COL_LABELS = ["Item", "Size", "Location", "Cond", "Age", "PO", ""];

/** `bare` wrapper — a plain section stack slot (band + body) inside the
 *  caller's shared SectionCard. Module-level so its identity is stable across
 *  renders (an inline component would remount the grid every keystroke). */
function BareSection({ children }: { children: ReactNode }) {
  return <div className="mb-1 flex flex-col min-h-0 shrink-0">{children}</div>;
}

export default function StockPickerGrid({ sku, soRef, need, units, isSofa, onReserved, onLoan, actions, bare }: Props) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  // ONE search box (Jess 2026-07-13, replaces the 7 per-column funnels) — every
  // typed token must match SOMEWHERE across model / size / category / PO /
  // old ref / date-in / condition (AND across tokens, OR across fields).
  const [q, setQ] = useState("");
  // Loan view (Jess 2026-07-01): a sofa line can loan ANY free sofa, so this
  // toggle drops the same-model filter and shows every free sofa instead.
  const [loanMode, setLoanMode] = useState(false);
  // Whole-card accordion — same band behaviour as every other section.
  const [collapsedCard, setCollapsedCard] = useState(false);

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
        // Age = whole days since the unit came in (§7.8 "days in").
        const ageDays = u.dateIn
          ? Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(`${u.dateIn.slice(0, 10)}T00:00:00`).getTime()) /
                  86_400_000,
              ),
            )
          : null;
        return {
          ...u,
          cat: unitCategory(u.sku),
          size: unitSize(u.sku),
          cond: CONDITION_LABEL[u.condition] ?? u.condition,
          dateLabel: u.dateIn ? fmtDate(u.dateIn) : "",
          ageDays,
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

  async function reserveIds(ids: string[]) {
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

  function reserve() {
    void reserveIds([...checked]);
  }

  // Auto-match & reserve (§7.8): pick the OLDEST matching free unit(s) — FIFO,
  // covering the line's remaining need — and reserve them in one click.
  function autoMatch() {
    if (submitting || loanMode) return;
    const oldest = [...rows].sort((a, b) => {
      if (!a.dateIn && !b.dateIn) return 0;
      if (!a.dateIn) return 1;
      if (!b.dateIn) return -1;
      return a.dateIn.localeCompare(b.dateIn);
    });
    const picked = oldest.slice(0, Math.max(1, need)).map((r) => r.id);
    if (picked.length === 0) {
      toast.info("No matching free unit to reserve");
      return;
    }
    void reserveIds(picked);
  }

  // Pre-tick the top `need` rows once, only the first time a line's units load.
  // (Kept simple: tick on mount via a derived initial set would re-run on filter
  // change, so we leave ticking to the operator here — relevance puts the right
  // units on top.)

  // THE shared section chrome (components/SectionPanel.tsx) — same cream band
  // as the list facet + every drawer panel (Jess 2026-07-13; no bespoke card
  // styling). `bare` = band + body only, stacked inside the caller's ONE shared
  // SectionCard (UI-KIT §5.1); else the standalone white card. Natural height;
  // the row area caps at ~6 rows and scrolls inside itself.
  const Wrapper = bare ? BareSection : SectionCard;
  return (
    <Wrapper>
      <SectionBand
        title="Warehouse stock"
        collapsed={collapsedCard}
        onToggle={() => setCollapsedCard((v) => !v)}
        right={
          <span className="shrink-0 flex items-center gap-1.5 text-[11px] text-base-500">
            <span className="whitespace-nowrap">
              {rows.length} free · {checked.size} picked
              {q.trim() ? ` · ${view.length} shown` : ""}
            </span>
            {actions}
          </span>
        }
      />
      {!collapsedCard && (
      <>
      {/* Scope row — the same-model note + the sofa loan toggle. */}
      <div className="px-1.5 pt-1.5 pb-1 flex items-center justify-between gap-2 shrink-0">
        <span className="t-tiny text-base-400 truncate">
          {loanMode ? "any sofa — loan" : "same model + size"}
        </span>
        {isSofa && (
          <button
            type="button"
            onClick={() => setLoanMode((v) => !v)}
            title={
              loanMode
                ? "Back to this line's exact model + size"
                : "Show every free sofa so you can loan one (any model / fabric)"
            }
            className={`inline-flex items-center gap-1 rounded-[5px] border px-2 py-0.5 t-tiny transition-colors ${
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
      </div>

      {/* ONE search box (Jess 2026-07-13) — replaces the 7 per-column funnels.
          Matches model / size / category / PO / old ref / date / condition. */}
      <div className="px-1.5 pb-1.5 shrink-0 relative">
        <Search
          size={13}
          className="absolute left-3.5 top-1/2 -translate-y-[calc(50%+3px)] text-base-400 pointer-events-none"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search model / size / PO / old ref…"
          className="w-full pl-7 pr-2 py-1 text-[12px] border border-base-200 rounded-md bg-white outline-none focus:border-primary"
        />
      </div>

      <div className="overflow-auto" style={{ maxHeight: 268 }}>
        <div className="min-w-[560px]">
          {/* header — §7.8 columns; neutral base-50 (the cream is the band's). */}
          <div
            className="grid sticky top-0 z-20 bg-base-50 border-b border-base-200 text-base-500 text-[10px] font-bold"
            style={{ gridTemplateColumns: GRID }}
          >
            <div className="px-1.5 py-1.5" />
            {COL_LABELS.map((label, i) => (
              <div key={i} className="px-2 py-1.5 truncate">
                {label}
              </div>
            ))}
          </div>
          {/* body — 40px rows */}
          {view.map((r, i) => {
            const on = checked.has(r.id);
            return (
              <div
                key={r.id}
                onClick={() => toggle(r.id)}
                title={r.sku}
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
                <div className="px-2 py-1 font-mono text-base-900 truncate">
                  {r.sku}
                </div>
                <div className="px-2 py-1 text-base-600 truncate">{r.size}</div>
                <div
                  className="px-2 py-1 text-base-500 truncate"
                  title={r.location ?? ""}
                >
                  {r.location ?? "—"}
                </div>
                <div className="px-2 py-1">
                  <span className={`pill ${r.condition === "exhibition" ? "pill-warning" : "pill-confirmed"}`}>
                    {r.cond}
                  </span>
                </div>
                <div
                  className="px-2 py-1 text-base-500 tabular-nums truncate"
                  title={r.dateLabel ? `in since ${r.dateLabel}` : ""}
                >
                  {r.ageDays != null ? `${r.ageDays}d` : "—"}
                </div>
                <div className="px-2 py-1 font-mono text-base-600 truncate" title={r.poNo ?? ""}>
                  {r.poNo ?? "—"}
                </div>
                <div className="px-1 py-1 text-right">
                  {loaning ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onLoan?.(r.id, r.sku);
                      }}
                      title="Issue a loan DO + mark this unit on-loan to the order"
                      className="text-[10px] font-semibold text-primary hover:underline whitespace-nowrap"
                    >
                      Lend
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={(e) => {
                        e.stopPropagation();
                        void reserveIds([r.id]);
                      }}
                      title={`Reserve this unit to ${soRef}`}
                      className="text-[10px] font-semibold text-primary hover:underline whitespace-nowrap disabled:opacity-40"
                    >
                      Reserve
                    </button>
                  )}
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

      <div className="px-1.5 py-2 border-t border-base-100 flex items-center justify-end gap-2">
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
          <>
            {/* §7.8 — FIFO shortcut: reserve the oldest matching unit(s). */}
            <button
              type="button"
              onClick={autoMatch}
              disabled={submitting || rows.length === 0}
              title="Reserve the oldest matching free unit(s) covering this line"
              className="btn-secondary t-tiny py-1.5 px-3 disabled:opacity-40"
            >
              Auto-match & reserve
            </button>
            <button
              type="button"
              onClick={reserve}
              disabled={submitting || checked.size === 0}
              className="btn-primary t-tiny py-1.5 px-4"
            >
              {submitting
                ? "Reserving…"
                : checked.size === 0
                  ? "Select stock to reserve"
                  : `Reserve ${checked.size} to ${soRef}`}
            </button>
          </>
        )}
      </div>
      </>
      )}
    </Wrapper>
  );
}
