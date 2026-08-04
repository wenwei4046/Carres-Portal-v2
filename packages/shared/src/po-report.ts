/**
 * Purchasing → Report — the "look at the numbers" layer (card Q3, Loo 2026-08-04).
 *
 * Every other Purchasing tab answers *"what do I do with THIS document?"*. This
 * one answers *"how many mattresses did we buy this month?"*, and nothing in the
 * portal answered it before.
 *
 * **It stores nothing.** No table, no RPC, no cached figure — the api hands over
 * the same `purchase_order_lines` the register reads and this module computes at
 * read time. A report with its own store is a second number that will eventually
 * disagree with the first (`ops_order_control.balance`'s disease).
 *
 * **QUANTITY ONLY. No money reaches this module, by construction** — there is no
 * cost field on `PoReportLine`, so nothing downstream can print one even by
 * accident (Loo, 2026-08-04: *"i dont show costing — due to supplier have own,
 * finance will deal with it"*). Measured the same day: `purchase_order_lines.cost`
 * is 0.00 on all 35 live lines, so a value column would print RM 0.00 for
 * everything.
 *
 * **Every number is a DOOR.** A group row carries `poIds` — exactly the purchase
 * orders its own count produced — so the click can never show a different set
 * from the one the number was made of. *"A number its own click cannot produce is
 * the first count in this portal that lies"* (P2-Claims' rule).
 *
 * **`pos` is a DISTINCT count at every level, including the Total.** One purchase
 * order may carry two categories, and summing the group counts would then report
 * it twice. Today no live PO does (measured 2026-08-04: July 5+1+1 = 7 distinct,
 * August 8+3+3 = 14 distinct), which is exactly why the rule has to be written
 * into the arithmetic rather than left to agree by accident.
 *
 * **Q4 imports this.** A dashboard tile is a report figure made large; a tile
 * computing its own count is the same number computed twice, and the two WILL
 * disagree.
 */

import { categoryLabel } from "./to-order";

// ── The words ───────────────────────────────────────────────────────────────

/**
 * Every fixed string the Report tab shows. **Six words were ruled by Loo on
 * 2026-08-04 and this page may use no seventh** — `Report` (singular, his own
 * spelling and AutoCount's own menu word) · `POs` · `Ordered` · `Received` ·
 * `Outstanding` · `Total`. The four new ones are written into
 * `docs/COPY-STANDARD.md` by the same card; the dictionary is the canonical
 * home and this is its mirror.
 *
 * Everything else here is a word that is ALREADY on a Carres screen, and each
 * one names where it comes from. Nothing is invented.
 */
export const PO_REPORT_WORDS = {
  /** The tab. Singular — `Reports` and `Reporting` are both wrong. */
  tab: "Report",

  // ── The grid's five columns ───────────────────────────────────────────────
  /** COPY-STANDARD's facet-group heading `Category`. */
  colCategory: "Category",
  /** NEW, ruled by Loo 2026-08-04 — the plural of the document's own name. */
  colPos: "POs",
  /** NEW — the quantity we asked the factory for. */
  colOrdered: "Ordered",
  /** Already ruled — the Receiving Workspace's own word. */
  colReceived: "Received",
  /**
   * Already ruled — the Receiving Workspace's own word, and its rule binds
   * here too: it is PRINTED, never left as `19 − 0` for the reader to subtract.
   */
  colOutstanding: "Outstanding",
  /** NEW — the last row. */
  total: "Total",

  // ── The rail ──────────────────────────────────────────────────────────────
  /**
   * NOT in COPY-STANDARD, and reused rather than invented: `Month` is already a
   * visible word in this portal (`HrCommissionRunPanel`'s column header and
   * `FinanceReports`' picker). Reported by this card, not smuggled in.
   */
  month: "Month",
  /** COPY-STANDARD's facet-group heading. */
  supplier: "Supplier",
  /** COPY-STANDARD's facet-group heading. */
  category: "Category",
  /** To Order's rail word, verbatim. */
  all: "All",

  // ── The footer, the empty state, the door ─────────────────────────────────
  /**
   * The exclusion, stated on screen. A silent filter is how two people get two
   * answers from one report. `Cancelled` is a ruled Operation Status label.
   */
  cancelledNote: "Cancelled purchase orders are not counted.",
  /** To Order's own freshness stamp — a report recomputes itself, so there is
   *  no Refresh button anywhere on this page. */
  updated: "Updated",
  /** The register's own column word (Jess's frozen listing, 2026-08-02). */
  poNo: "PO No.",
  /** To Order's live strings, verbatim (rule 8: one business, one word). */
  filtersEmpty: "No rows match the filters.",
  clearFilters: "Clear filters",
  /** What the whole table is, for a screen reader. */
  tableLabel: "Report",
} as const;

/** `No purchase orders in Aug 2026.` — the ruled `No purchase orders to issue.`
 *  shape, naming the scope so an empty month says WHY rather than printing
 *  zeros with no explanation. The month is spelled by the caller's `fmtMonth`,
 *  the portal's ONE month spelling. */
export function poReportEmpty(monthLabel: string | null): string {
  return monthLabel ? `No purchase orders in ${monthLabel}.` : "No purchase orders.";
}

// ── What the api hands over ─────────────────────────────────────────────────

/**
 * ONE purchase-order LINE, flattened. There is deliberately no cost, no price
 * and no currency field: the money is absent from the payload, so no consumer
 * can print what it never receives (0307's own discipline, applied to a wire).
 */
export interface PoReportLine {
  /** `PO-2038` — the register's own id, and the door's target. */
  poId: string;
  supplierId: string;
  supplierName: string;
  /** `YYYY-MM`, resolved in MYT by the api — the portal's zone, never the
   *  browser's. */
  month: string;
  /** `sofa` · `bedframe` · `mattress` … or null when the SKU resolves to no
   *  catalog model. A null is COUNTED, never dropped: a line the report hides
   *  makes the Total lie. */
  category: string | null;
  cancelled: boolean;
  ordered: number;
  received: number;
}

/** `GET /api/operation/pos/report`. One contract, two consumers. */
export interface PoReportResponse {
  lines: PoReportLine[];
}

export interface PoReportFilters {
  /** `YYYY-MM`, or null for every month. */
  month?: string | null;
  supplierId?: string | null;
  category?: string | null;
}

/** One row of the grid, and one row of the rail — both are a count of DISTINCT
 *  purchase orders over a set of lines. */
export interface PoReportRow {
  /** The group's stable value — the raw category, or `""` when unresolved. */
  key: string;
  /** What the row prints. */
  label: string;
  /** DISTINCT purchase orders. */
  pos: number;
  ordered: number;
  received: number;
  /** PRINTED, never left as `ordered − received` for the reader to subtract. */
  outstanding: number;
  /** Exactly the purchase orders this row's own numbers were made of — the
   *  door. Sorted, so the drill-down order never depends on read order. */
  poIds: string[];
}

export interface PoReportFacetOption {
  value: string;
  /** DISTINCT purchase orders, counted with every OTHER filter applied and
   *  never with its own — so a visible row's click always returns at least
   *  that many, and picking one option never removes the way back. */
  pos: number;
}

/**
 * One group of the rail.
 *
 * **`all` is the count the `All` row's own click produces** — this group's
 * filter CLEARED, every other filter kept. It is deliberately not the report's
 * filtered total: with August picked, a month rail reading `All 14` says *all
 * months hold 14 purchase orders*, and 21 of them do. Found on production,
 * 2026-08-04, before anybody read it as a business figure.
 */
export interface PoReportFacet<T = PoReportFacetOption> {
  all: number;
  options: T[];
}

export interface PoReport {
  rows: PoReportRow[];
  total: PoReportRow;
  months: PoReportFacet;
  suppliers: PoReportFacet<PoReportFacetOption & { name: string }>;
  categories: PoReportFacet;
}

// ── The computation ─────────────────────────────────────────────────────────

/**
 * The ONE exclusion, in one place so a test can remove it and watch the report
 * change. A cancelled purchase order is not work anybody did — counting it
 * would overstate every figure on the page, and the screen states the rule.
 */
function counts(line: PoReportLine): boolean {
  return !line.cancelled;
}

function matches(line: PoReportLine, f: PoReportFilters): boolean {
  if (f.month != null && line.month !== f.month) return false;
  if (f.supplierId != null && line.supplierId !== f.supplierId) return false;
  if (f.category != null && (line.category ?? "") !== f.category) return false;
  return true;
}

/** The em dash the portal already prints for "no value" (`fmtDate` returns it).
 *  A category nobody can resolve gets no invented word — it gets the glyph the
 *  portal already uses, and it is still counted. */
const NO_CATEGORY_LABEL = "—";

function blankRow(key: string, label: string): PoReportRow {
  return { key, label, pos: 0, ordered: 0, received: 0, outstanding: 0, poIds: [] };
}

function accumulate(target: PoReportRow, line: PoReportLine, seen: Set<string>) {
  target.ordered += line.ordered;
  target.received += line.received;
  target.outstanding = target.ordered - target.received;
  if (!seen.has(line.poId)) {
    seen.add(line.poId);
    target.poIds.push(line.poId);
    target.pos = target.poIds.length;
  }
}

/** DISTINCT purchase orders over a set of lines. */
function distinctPos(lines: readonly PoReportLine[]): number {
  const s = new Set<string>();
  for (const l of lines) s.add(l.poId);
  return s.size;
}

/**
 * The whole report, grouped by CATEGORY.
 *
 * Sorted MOST FIRST (by ordered quantity, then by label) — the card's own
 * `sort most first`, as a default rather than a control: a sort control needs a
 * word, and no word for one has been ruled.
 */
export function buildPoReport(
  lines: readonly PoReportLine[],
  filters: PoReportFilters = {},
): PoReport {
  const live = lines.filter(counts);
  const shown = live.filter((l) => matches(l, filters));

  const byKey = new Map<string, { row: PoReportRow; seen: Set<string> }>();
  const totalRow = blankRow("total", PO_REPORT_WORDS.total);
  const totalSeen = new Set<string>();

  for (const l of shown) {
    const key = l.category ?? "";
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        row: blankRow(key, key === "" ? NO_CATEGORY_LABEL : categoryLabel(key)),
        seen: new Set<string>(),
      };
      byKey.set(key, entry);
    }
    accumulate(entry.row, l, entry.seen);
    accumulate(totalRow, l, totalSeen);
  }

  const rows = [...byKey.values()].map((e) => {
    e.row.poIds.sort();
    return e.row;
  });
  rows.sort((a, b) => b.ordered - a.ordered || a.label.localeCompare(b.label));
  totalRow.poIds.sort();

  // ── The rail. Each facet is counted with every OTHER filter applied and
  // never with its own, so picking `Ohana` does not make `Nice Future`
  // disappear — the portal's own facet law (P2-Claims).
  const monthKeys = [...new Set(live.map((l) => l.month))].sort().reverse();
  const months: PoReportFacet = {
    all: distinctPos(live.filter((l) => matches(l, { ...filters, month: null }))),
    options: monthKeys.map((value) => ({
      value,
      pos: distinctPos(live.filter((l) => matches(l, { ...filters, month: value }))),
    })),
  };

  const supplierNames = new Map<string, string>();
  for (const l of live) supplierNames.set(l.supplierId, l.supplierName);
  const suppliers: PoReportFacet<PoReportFacetOption & { name: string }> = {
    all: distinctPos(live.filter((l) => matches(l, { ...filters, supplierId: null }))),
    options: [...supplierNames.entries()]
      .map(([value, name]) => ({
        value,
        name,
        pos: distinctPos(live.filter((l) => matches(l, { ...filters, supplierId: value }))),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };

  const categoryKeys = [...new Set(live.map((l) => l.category ?? ""))].sort();
  const categories: PoReportFacet = {
    all: distinctPos(live.filter((l) => matches(l, { ...filters, category: null }))),
    options: categoryKeys.map((value) => ({
      value,
      pos: distinctPos(live.filter((l) => matches(l, { ...filters, category: value }))),
    })),
  };

  return { rows, total: totalRow, months, suppliers, categories };
}

/** What a category value PRINTS. The rail and the grid read the same function,
 *  so one category can never be spelled two ways on one screen. */
export function poReportCategoryLabel(value: string): string {
  return value === "" ? NO_CATEGORY_LABEL : categoryLabel(value);
}

/** One purchase order behind a group's number. */
export interface PoReportPo {
  poId: string;
  supplierName: string;
  ordered: number;
  received: number;
  outstanding: number;
}

/**
 * THE DOOR. The purchase orders a group row's numbers were made of — the same
 * lines, the same filters, the same exclusion, so the list can never show a
 * different set from the count above it. `buildPoReport` and this function are
 * the only two readers of the filter rules, and a test asserts they agree row
 * by row.
 */
export function poReportRowDetail(
  lines: readonly PoReportLine[],
  filters: PoReportFilters,
  key: string,
): PoReportPo[] {
  const scoped = lines
    .filter(counts)
    .filter((l) => matches(l, filters))
    .filter((l) => (l.category ?? "") === key);

  const byPo = new Map<string, PoReportPo>();
  for (const l of scoped) {
    let po = byPo.get(l.poId);
    if (!po) {
      po = {
        poId: l.poId,
        supplierName: l.supplierName,
        ordered: 0,
        received: 0,
        outstanding: 0,
      };
      byPo.set(l.poId, po);
    }
    po.ordered += l.ordered;
    po.received += l.received;
    po.outstanding = po.ordered - po.received;
  }
  return [...byPo.values()].sort((a, b) => a.poId.localeCompare(b.poId));
}
