import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  PO_REPORT_WORDS as W,
  buildPoReport,
  poReportCategoryLabel,
  poReportEmpty,
  poReportRowDetail,
  type PoReportFilters,
  type PoReportRow,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import EmptyState from "@/components/kit/EmptyState";
import { usePoReport } from "@/lib/queries";
import { fmtMonth } from "@/lib/fmt-date";
import PurchasingTabs from "./PurchasingTabs";
import { RailGroup, RailItem } from "./components/workspace-rail";

/**
 * Purchasing → Report — card Q3 (Loo, 2026-08-04).
 *
 * The first "look at the numbers" screen Purchasing has ever had. Every other
 * tab answers *"what do I do with THIS document?"*; this one answers *"how many
 * mattresses did we buy this month?"*.
 *
 * Three rules make it a report and not a second source of truth:
 *
 *  1. **It stores nothing.** No table, no RPC, no cached figure — one read of
 *     the same `purchase_order_lines` the register reads, and `buildPoReport`
 *     computes at read time.
 *  2. **Every number is a DOOR.** A row unfolds into exactly the purchase
 *     orders its own count was made of (`poReportRowDetail`, the same filters
 *     and the same exclusion), and each of those is a link into the register at
 *     that document. This is the thing AutoCount cannot do — its answer to
 *     every analysis is *export to Excel*, and a number in Excel has left the
 *     system.
 *  3. **Cancelled purchase orders are excluded, and the exclusion is stated on
 *     screen.** A silent filter is how two people get two answers from one
 *     report.
 *
 * **NO MONEY** (Loo, 2026-08-04: *"i dont show costing — due to supplier have
 * own, finance will deal with it"*). It is structural rather than remembered:
 * the wire has no cost field, so this page could not print one if it tried.
 *
 * **Six words and no seventh.** `Report` (singular — his own spelling, and
 * AutoCount's own menu word) · `POs` · `Ordered` · `Received` · `Outstanding` ·
 * `Total`. Everything else on this page is a word already on a Carres screen;
 * they live in `PO_REPORT_WORDS`, each one naming where it came from.
 *
 * **The frame is Receiving's, not a new one** — the same Workspace shell and
 * the same 200px rail through the shared `workspace-rail` recipe (§6.1: the
 * second occurrence is a full stop, and that extraction already happened on
 * 2026-08-03). A third hand-rolled rail is the thing this page most easily
 * could have become.
 *
 * **There is no Refresh button** — a report recomputes itself and states when
 * it did. The stamp rides the shell's own page-meta slot, so it costs the page
 * no height at all.
 */

// design-standard: not-a-list-page — this is a REPORT (grouped figures, no
// records). It renders through the kit `DataTable` and sits under the
// Purchasing module tab bar, so §8.3's module-tab law gives it no title band.

/** `Updated 10:32` — To Order's own stamp, in the shell's page-meta slot. */
function updatedAt(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${W.updated} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

export default function OperationPurchasingReport() {
  const q = usePoReport();
  const lines = useMemo(() => q.data?.lines ?? [], [q.data]);

  const [month, setMonth] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const filters: PoReportFilters = { month, supplierId, category };
  const report = useMemo(
    () => buildPoReport(lines, { month, supplierId, category }),
    [lines, month, supplierId, category],
  );

  const filtering = month != null || supplierId != null || category != null;

  /** §8.2 — clicking the row you are already on CLEARS it. All three groups
   *  are FILTERS (there is a legal nothing-selected view: `All`), so all three
   *  toggle. */
  const toggle =
    <T,>(cur: T | null, set: (v: T | null) => void) =>
    (v: T) =>
      set(cur === v ? null : v);

  const clearAll = () => {
    setMonth(null);
    setSupplierId(null);
    setCategory(null);
  };

  /**
   * ── P20.3 · THE PERCENTAGES GO, AND THE NUMBERS ARE MEASURED ──────────────
   *
   * This was the last grid in the module still declaring `37/15/15/15/15 %`,
   * and `DataTable`'s own doc warns about exactly that recipe BY NAME: *"a
   * number = percentage of the table width … percentage columns inflate on wide
   * monitors and open holes between neighbours"* (Jess, 2026-08-01). It is not
   * a theoretical warning here — 37% of a 1,040px pane is 385px of column for
   * the word `Mattress`, so the report's own figures sat a third of a screen
   * away from the thing they describe, and the gap GREW with the monitor.
   *
   * MEASURED in a real browser against the app's own stylesheet, like every
   * other width in this module (13px Inter · the kit cell's `px-2` = 16 · P17's
   * column rule = 1 more of the BOX). These columns are not sortable and carry
   * no filter, so a header is plain text — no arrow, no ▼:
   *
   *   Category     header 48.6 · widest label `Accessory` 65.3  →  83
   *   POs          header 21.4                                  →  60
   *   Ordered      header 43.0                                  →  61
   *   Received     header 48.4                                  →  66
   *   Outstanding  header 64.3                                  →  82
   *
   * **THE FOUR NUMBER COLUMNS CARRY A STATED FIVE-DIGIT GUARD (42.2), AND THAT
   * IS AN ALLOWANCE RATHER THAN A MEASUREMENT — so it is said out loud.** Every
   * row in the database today is TEST data (§6), so today's counts measure
   * whether the code works and say nothing about volume; a report row
   * aggregates a whole month of units, and a column that clips a figure with
   * `text-overflow: clip` gives the reader a WRONG NUMBER with nothing on
   * screen to say so. Three of the four are set by their header anyway; only
   * `POs` is set by the guard.
   *
   * The slack goes to the kit's filler (`sizing="content"` below), never
   * BETWEEN two figures — which is the whole of Loo's rule ①.
   */
  const columns: Column<PoReportRow>[] = [
    {
      key: "category",
      label: W.colCategory,
      width: "83px",
      cell: (r) => <span className="truncate">{r.label}</span>,
    },
    {
      key: "pos",
      label: W.colPos,
      width: "60px",
      align: "right",
      numeric: true,
      cell: (r) => r.pos,
    },
    {
      key: "ordered",
      label: W.colOrdered,
      width: "61px",
      align: "right",
      numeric: true,
      cell: (r) => r.ordered,
    },
    {
      key: "received",
      label: W.colReceived,
      width: "66px",
      align: "right",
      numeric: true,
      cell: (r) => r.received,
    },
    {
      key: "outstanding",
      label: W.colOutstanding,
      width: "82px",
      align: "right",
      numeric: true,
      // PRINTED, never left as `19 − 0` for the reader to subtract — the
      // Receiving Workspace's own rule for this word.
      cell: (r) => r.outstanding,
    },
  ];

  /**
   * A blank table must name its own cause. A month picked ALONE is the one
   * case where the honest sentence is about the month; the moment a second
   * facet is narrowing, `No purchase orders in Aug 2026.` would be a lie —
   * there ARE purchase orders in August, just none of that supplier's.
   */
  const emptyLine =
    month != null && supplierId == null && category == null
      ? poReportEmpty(fmtMonth(month))
      : filtering
        ? W.filtersEmpty
        : poReportEmpty(null);

  return (
    <div className="h-full min-h-0 flex flex-col bg-kit-canvas" data-testid="po-report-page">
      {/* SHELL LAW: the shell draws the header, pages never do. The freshness
          stamp goes in its page-meta slot — zero height on this page, and
          never a Refresh button. */}
      <PurchasingTabs
        right={
          <span className="text-meta text-kit-slate-11" data-testid="po-report-updated">
            {updatedAt(q.dataUpdatedAt)}
          </span>
        }
      />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <nav
          className="w-[200px] shrink-0 min-h-0 overflow-y-auto border-r border-kit-slate-5 px-3 py-3 flex flex-col gap-4 bg-white"
          aria-label={W.tableLabel}
          data-testid="po-report-nav"
        >
          <RailGroup title={W.month}>
            <RailItem
              label={W.all}
              count={report.months.all}
              active={month == null}
              onClick={() => setMonth(null)}
              testId="po-report-month-all"
            />
            {report.months.options.map((m) => (
              <RailItem
                key={m.value}
                label={fmtMonth(m.value)}
                count={m.pos}
                active={month === m.value}
                onClick={() => toggle(month, setMonth)(m.value)}
                testId={`po-report-month-${m.value}`}
              />
            ))}
          </RailGroup>

          <RailGroup title={W.supplier}>
            <RailItem
              label={W.all}
              count={report.suppliers.all}
              active={supplierId == null}
              onClick={() => setSupplierId(null)}
              testId="po-report-supplier-all"
            />
            {report.suppliers.options.map((s) => (
              <RailItem
                key={s.value}
                label={s.name}
                count={s.pos}
                active={supplierId === s.value}
                onClick={() => toggle(supplierId, setSupplierId)(s.value)}
                testId={`po-report-supplier-${s.value}`}
              />
            ))}
          </RailGroup>

          <RailGroup title={W.category}>
            <RailItem
              label={W.all}
              count={report.categories.all}
              active={category == null}
              onClick={() => setCategory(null)}
              testId="po-report-category-all"
            />
            {report.categories.options.map((c) => (
              <RailItem
                key={c.value || "none"}
                label={poReportCategoryLabel(c.value)}
                count={c.pos}
                active={category === c.value}
                onClick={() => toggle(category, setCategory)(c.value)}
                testId={`po-report-category-${c.value || "none"}`}
              />
            ))}
          </RailGroup>
        </nav>

        <div className="flex-1 min-w-0 flex flex-col min-h-0 px-4 pt-3 pb-3">
          <DataTable<PoReportRow>
            rows={report.rows}
            columns={columns}
            /* P20.3 — the fifth and last Purchasing grid onto the ONE width
               mechanism. Without this the measured pixels above are spent as
               SHARES and the report is back to percentages under another
               name. The leftover goes to the kit's filler, which holds no
               word and no figure. */
            sizing="content"
            rowId={(r) => r.key || "none"}
            label={W.tableLabel}
            loading={q.isLoading}
            empty={
              <EmptyState
                title={emptyLine}
                action={
                  filtering ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAll}
                      data-testid="po-report-clear"
                    >
                      {W.clearFilters}
                    </Button>
                  ) : undefined
                }
              />
            }
            /* THE DOOR. It opens on exactly the purchase orders the row's own
             * numbers were made of — same lines, same filters, same exclusion
             * — so the click can never produce a different set from the count
             * above it. */
            expansion={{
              expanded: open,
              onToggle: (id) =>
                setOpen((prev) => {
                  const n = new Set(prev);
                  if (n.has(id)) n.delete(id);
                  else n.add(id);
                  return n;
                }),
              label: (r) => r.label,
              render: (r) => {
                const pos = poReportRowDetail(lines, filters, r.key);
                return (
                  <div
                    className="flex flex-col gap-1"
                    data-testid={`po-report-detail-${r.key || "none"}`}
                  >
                    {pos.map((p) => (
                      <Link
                        key={p.poId}
                        to={`/operation/procurement?po=${encodeURIComponent(p.poId)}`}
                        data-testid={`po-report-po-${p.poId}`}
                        className="flex items-center gap-3 rounded-control px-2 py-1 text-body hover:bg-kit-slate-3"
                      >
                        <span className="w-24 shrink-0 tabular-nums">{p.poId}</span>
                        <span className="min-w-0 flex-1 truncate">{p.supplierName}</span>
                        <span className="w-16 shrink-0 text-right tabular-nums">{p.ordered}</span>
                        <span className="w-16 shrink-0 text-right tabular-nums">{p.received}</span>
                        <span className="w-16 shrink-0 text-right tabular-nums">
                          {p.outstanding}
                        </span>
                      </Link>
                    ))}
                  </div>
                );
              },
            }}
            totals={{
              label: W.total,
              cell: (c) =>
                c.key === "category"
                  ? W.total
                  : c.key === "pos"
                    ? report.total.pos
                    : c.key === "ordered"
                      ? report.total.ordered
                      : c.key === "received"
                        ? report.total.received
                        : report.total.outstanding,
            }}
          />

          {/* The exclusion, stated. A caption rather than a band: the sentence
              never changes, so it may not spend a permanent 36px of §1.3's
              budget saying the same thing forever. */}
          <p className="pt-2 text-meta text-kit-slate-11" data-testid="po-report-footer">
            {W.cancelledNote}
          </p>
        </div>
      </div>
    </div>
  );
}
