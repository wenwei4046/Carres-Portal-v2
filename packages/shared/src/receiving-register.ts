/**
 * The Receiving page's ONE register arithmetic (owner correction 2026-09-06).
 *
 * The GRN Register paginates on the SERVER — `Showing 1–50 of 10,000` must be
 * the truth about the whole filtered result set, and so must every rail count.
 * The Worker therefore stops handing the browser "everything under a cap" and
 * instead asks these two pure functions, which are also what the page's tests
 * exercise — the server and the test cannot hold two filtering rules.
 *
 *   buildGrnRegisterView   filters · facet counts · the page slice
 *   expectedArrivalCounts  the rail Calendar's markers, from the linked POs'
 *                          governed `Supplier Delivery Date`
 *
 * LAW D — one arithmetic. The `Supplier Delivery Date` here IS
 * `poSupplierDeliveryDateOf` (the evidenced supplier reply against the exact
 * PO version); the category word IS the shared ladder's word, already folded
 * per receipt by `receiptCategoryWords`. Nothing in this file re-derives
 * either fact.
 *
 * PURE — no I/O, no clock.
 */
import {
  poSupplierDeliveryDateOf,
  type PoDatePromise,
} from "./po-workspace";

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
   *  (actual site, else the PO's Deliver To). */
  siteName: string | null;
  /** The linked PO's governed `Supplier Delivery Date`, or null while the
   *  supplier has not evidenced one. */
  supplierDeliveryDateIso: string | null;
  /** What the Search box may match — the placeholder's own list: GRN, PO,
   *  supplier or DO number. Lower-cased by the builder, not the caller. */
  searchText: string;
}

export interface GrnRegisterSelection {
  category?: string | null;
  supplier?: string | null;
  site?: string | null;
  /** The rail Calendar's selected `Supplier Delivery Date` (ISO). */
  expected?: string | null;
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
   * show); the Calendar date and the search term narrow every section.
   */
  facets: {
    category: Record<string, number>;
    supplier: Record<string, number>;
    site: Record<string, number>;
  };
}

function matchesExcept(
  r: GrnRegisterFactRow,
  sel: GrnRegisterSelection,
  except: "category" | "supplier" | "site" | "",
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
  // The Calendar's pick and the typed search narrow EVERY section — they are
  // not rail sections themselves, so no facet is counted "without" them.
  if (sel.expected && r.supplierDeliveryDateIso !== sel.expected) return false;
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
  const filtered: GrnRegisterFactRow[] = [];
  for (const r of rows) {
    if (matchesExcept(r, sel, "category"))
      for (const w of r.categories) category[w] = (category[w] ?? 0) + 1;
    if (matchesExcept(r, sel, "supplier") && r.supplierName)
      supplier[r.supplierName] = (supplier[r.supplierName] ?? 0) + 1;
    if (matchesExcept(r, sel, "site") && r.siteName)
      site[r.siteName] = (site[r.siteName] ?? 0) + 1;
    if (matchesExcept(r, sel, "")) filtered.push(r);
  }
  const from = Math.max(0, Math.floor(offset));
  return {
    total: filtered.length,
    pageIds: filtered.slice(from, from + Math.max(1, limit)).map((r) => r.id),
    facets: { category, supplier, site },
  };
}

/**
 * The rail Calendar's markers: how many supplier arrivals are EXPECTED on
 * each date. A date is expected while a PO (or consignment CO) is open, still
 * owes goods, and its supplier has evidenced that `Supplier Delivery Date` —
 * a promise fully received stops being expected, and a date only WE computed
 * (`eta_date`) never marks the Calendar: nobody is arriving on our own guess.
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
