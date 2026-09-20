/**
 * The Receiving page's ONE register arithmetic (owner correction 2026-09-06,
 * rail overwritten by the owner ruling 2026-09-17 and PURCHASING CARD 12).
 *
 * The GRN Register paginates on the SERVER — `Showing 1–50 of 10,000` must be
 * the truth about the whole filtered result set, and so must every rail count.
 * The Worker therefore stops handing the browser "everything under a cap" and
 * instead asks these two pure functions, which are also what the page's tests
 * exercise — the server and the test cannot hold two filtering rules.
 *
 *   buildGrnRegisterView   filters · facet counts · the page slice
 *   expectedArrivalCounts  expected supplier arrivals per date, read by the
 *                          Warehouse Arrival Schedule (Receiving's own month
 *                          calendar is RETIRED — §9.4, 2026-09-17)
 *
 * LAW D — one arithmetic. The category word IS the shared ladder's word,
 * already folded per receipt by `receiptCategoryWords`; the exception flags
 * ARE the receipt's own stored quantities, already reduced by the caller
 * through `warehouseReceiptTotals` / `receivingExtraQty`. Nothing in this file
 * re-derives either fact.
 *
 * ⭐ THE RAIL'S SIX GROUPS (§9.4, owner ruling 2026-09-17):
 *
 * ```
 * GRN date          a day, a week, a month or Choose dates — the GRN's
 *                   CREATION date, never the physical arrival date
 * Received with     Damaged goods · Wrong items · Extra goods.  A GRN may
 *                   carry more than one, so THESE COUNTS OVERLAP and may
 *                   never be added into a total
 * Category · Goods arrived at · Supplier      the facts present in the set
 * Cancelled GRNs    the last row
 * ```
 *
 * PURE — no I/O, no clock.
 */
import {
  poSupplierDeliveryDateOf,
  type PoDatePromise,
} from "./po-workspace";

/** The three `Received with` rows. A record of what was FOUND at receiving,
 *  never a to-do list, and never additive with one another. */
export type GrnReceivedWith = "damaged" | "wrong_item" | "extra";

export const GRN_RECEIVED_WITH_ROWS: readonly GrnReceivedWith[] = [
  "damaged",
  "wrong_item",
  "extra",
];

/** One GRN record, reduced to the facts filtering reads. The caller (the
 *  Worker's scan, or a test fixture) resolves names and categories first —
 *  this module never sees a SKU or a jsonb line. */
export interface GrnRegisterFactRow {
  id: string;
  /** The governed category words this receiving answers to
   *  (`receiptCategoryWords` — the ONE ladder, already folded). */
  categories: readonly string[];
  supplierName: string | null;
  /** `Goods arrived at` — the physical location fact
   *  (actual site, else the PO's Supplier Deliver To). */
  siteName: string | null;
  /**
   * `GRN date` — the business day the GRN was CREATED (ISO `yyyy-mm-dd` in
   * `Asia/Kuala_Lumpur`, resolved by the caller). It is never inferred from
   * `Goods Received Date`, and a record without one is filtered out by any
   * date pick rather than being given a date it does not have.
   */
  grnDateIso: string | null;
  /** What this receiving FOUND — the stored quantities, already totalled. */
  damaged: boolean;
  wrongItem: boolean;
  extra: boolean;
  /** A cancelled (voided) GRN. It keeps its row and its number forever. */
  cancelled: boolean;
  /** What the Search box may match — the placeholder's own list: GRN, PO,
   *  supplier or DO number. Lower-cased by the builder, not the caller. */
  searchText: string;
}

export interface GrnRegisterSelection {
  category?: string | null;
  supplier?: string | null;
  site?: string | null;
  /** One of the three `Received with` rows. */
  receivedWith?: GrnReceivedWith | null;
  /** The `GRN date` pick, as an INCLUSIVE ISO range — one day, a week, a
   *  month or `Choose dates…` all arrive here as the same two facts. */
  from?: string | null;
  to?: string | null;
  /** `Cancelled GRNs` — true narrows to them. Absent lists both. */
  cancelled?: boolean | null;
  q?: string | null;
}

export interface GrnRegisterView {
  /** Rows in the WHOLE filtered result — what `of {total}` prints. */
  total: number;
  /** The requested page, in the caller's (already sorted) order. */
  pageIds: string[];
  /**
   * Rail counts over the COMPLETE filtered result set — never the loaded
   * page. Each section is counted against the OTHER selected sections (the
   * register's own law: a number never lies about what clicking it would
   * show); the search term narrows every section.
   */
  facets: {
    category: Record<string, number>;
    supplier: Record<string, number>;
    site: Record<string, number>;
    /** GRN creation days, ISO → count. The rail folds them into weeks and
     *  months; only days that HAVE GRNs are ever listed. */
    grnDate: Record<string, number>;
    /** Overlapping by construction — never summed into a total. */
    receivedWith: Record<GrnReceivedWith, number>;
    cancelled: number;
  };
}

type FacetKey =
  | "category"
  | "supplier"
  | "site"
  | "receivedWith"
  | "grnDate"
  | "cancelled"
  | "";

function hasReceivedWith(r: GrnRegisterFactRow, kind: GrnReceivedWith): boolean {
  return kind === "damaged"
    ? r.damaged
    : kind === "wrong_item"
      ? r.wrongItem
      : r.extra;
}

function matchesExcept(
  r: GrnRegisterFactRow,
  sel: GrnRegisterSelection,
  except: FacetKey,
): boolean {
  if (
    except !== "category" &&
    sel.category &&
    !r.categories.includes(sel.category)
  )
    return false;
  if (except !== "supplier" && sel.supplier && (r.supplierName ?? "") !== sel.supplier)
    return false;
  if (except !== "site" && sel.site && (r.siteName ?? "") !== sel.site)
    return false;
  if (
    except !== "receivedWith" &&
    sel.receivedWith &&
    !hasReceivedWith(r, sel.receivedWith)
  )
    return false;
  if (except !== "cancelled" && sel.cancelled === true && !r.cancelled)
    return false;
  if (except !== "grnDate") {
    // A record with no creation date on file is not given one: it simply is
    // not in any dated answer.
    if (sel.from && (r.grnDateIso === null || r.grnDateIso < sel.from)) return false;
    if (sel.to && (r.grnDateIso === null || r.grnDateIso > sel.to)) return false;
  }
  // The typed search narrows EVERY section — it is not a rail section itself,
  // so no facet is counted "without" it.
  const q = (sel.q ?? "").trim().toLowerCase();
  if (q && !r.searchText.toLowerCase().includes(q)) return false;
  return true;
}

export function buildGrnRegisterView(
  rows: readonly GrnRegisterFactRow[],
  sel: GrnRegisterSelection,
  offset: number,
  limit: number,
): GrnRegisterView {
  const category: Record<string, number> = {};
  const supplier: Record<string, number> = {};
  const site: Record<string, number> = {};
  const grnDate: Record<string, number> = {};
  const receivedWith: Record<GrnReceivedWith, number> = {
    damaged: 0,
    wrong_item: 0,
    extra: 0,
  };
  let cancelled = 0;
  const filtered: GrnRegisterFactRow[] = [];
  for (const r of rows) {
    if (matchesExcept(r, sel, "category"))
      for (const w of r.categories) category[w] = (category[w] ?? 0) + 1;
    if (matchesExcept(r, sel, "supplier") && r.supplierName)
      supplier[r.supplierName] = (supplier[r.supplierName] ?? 0) + 1;
    if (matchesExcept(r, sel, "site") && r.siteName)
      site[r.siteName] = (site[r.siteName] ?? 0) + 1;
    if (matchesExcept(r, sel, "grnDate") && r.grnDateIso)
      grnDate[r.grnDateIso] = (grnDate[r.grnDateIso] ?? 0) + 1;
    if (matchesExcept(r, sel, "receivedWith")) {
      // One GRN can answer two of these rows — that is the point of them, and
      // it is why the three counts may never be added together.
      if (r.damaged) receivedWith.damaged += 1;
      if (r.wrongItem) receivedWith.wrong_item += 1;
      if (r.extra) receivedWith.extra += 1;
    }
    if (matchesExcept(r, sel, "cancelled") && r.cancelled) cancelled += 1;
    if (matchesExcept(r, sel, "")) filtered.push(r);
  }
  const from = Math.max(0, Math.floor(offset));
  return {
    total: filtered.length,
    pageIds: filtered.slice(from, from + Math.max(1, limit)).map((r) => r.id),
    facets: { category, supplier, site, grnDate, receivedWith, cancelled },
  };
}

/**
 * How many supplier arrivals are EXPECTED on each date — the Warehouse
 * Arrival Schedule's markers. A date is expected while a PO (or consignment
 * CO) is open, still owes goods, and its supplier has evidenced that
 * `Supplier Confirmed Delivery Date`; a promise fully received stops being
 * expected, and a date only WE computed (`eta_date`) never marks a day:
 * nobody is arriving on our own guess.
 */
export function expectedArrivalCounts(
  pos: readonly {
    status: string;
    version?: number | null;
    promises?: readonly PoDatePromise[] | null;
    purchase_order_lines?:
      | readonly { qty: number | null; received_qty: number | null }[]
      | null;
  }[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const po of pos) {
    if (po.status !== "open") continue;
    const lines = po.purchase_order_lines ?? [];
    const owes = lines.some((l) => (l.received_qty ?? 0) < (l.qty ?? 0));
    if (!owes) continue;
    const date = poSupplierDeliveryDateOf(po.promises, po.version ?? 1);
    if (!date) continue;
    counts[date] = (counts[date] ?? 0) + 1;
  }
  return counts;
}

/* ── The rail's GRN-date ladder ─────────────────────────────────────────────
   Weeks run Monday–Sunday (the example the owner wrote is `14 – 20 Sep`, a
   Monday to a Sunday) and ONLY days that have GRNs are ever listed — Sunday
   included, because a GRN can be created on one. Folding happens here, over
   the SERVER's complete day counts, so a week's number is the truth about the
   whole filtered set and not about the loaded page. */

export interface GrnDateDay {
  iso: string;
  count: number;
}
export interface GrnDateWeek {
  /** The Monday, ISO. */
  from: string;
  /** The Sunday, ISO. */
  to: string;
  count: number;
  days: GrnDateDay[];
}
export interface GrnDateMonth {
  /** `yyyy-mm`. */
  period: string;
  from: string;
  to: string;
  count: number;
}

function isoAddDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Monday of the week an ISO day falls in. */
export function grnWeekStart(iso: string): string {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  // getUTCDay: 0 = Sunday. Monday-first means Sunday is six days after it.
  return isoAddDays(iso, dow === 0 ? -6 : 1 - dow);
}

/** The last ISO day of the month an ISO day falls in. */
export function grnMonthEnd(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
}

/** Newest first — the register's own order, so the rail reads the way the
 *  table does. */
export function grnDateWeeks(counts: Record<string, number>): GrnDateWeek[] {
  const byWeek = new Map<string, GrnDateDay[]>();
  for (const [iso, count] of Object.entries(counts)) {
    if (count <= 0) continue;
    const key = grnWeekStart(iso);
    const days = byWeek.get(key) ?? [];
    days.push({ iso, count });
    byWeek.set(key, days);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([from, days]) => ({
      from,
      to: isoAddDays(from, 6),
      count: days.reduce((n, d) => n + d.count, 0),
      days: days.sort((a, b) => b.iso.localeCompare(a.iso)),
    }));
}

export function grnDateMonths(counts: Record<string, number>): GrnDateMonth[] {
  const byMonth = new Map<string, number>();
  for (const [iso, count] of Object.entries(counts)) {
    if (count <= 0) continue;
    const period = iso.slice(0, 7);
    byMonth.set(period, (byMonth.get(period) ?? 0) + count);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([period, count]) => ({
      period,
      from: `${period}-01`,
      to: grnMonthEnd(`${period}-01`),
      count,
    }));
}
