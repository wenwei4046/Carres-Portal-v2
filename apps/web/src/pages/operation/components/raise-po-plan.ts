import { poUrgentBypass } from "@carres/shared";
import { lineCategory, type CoreCat } from "@/lib/line-category";

/**
 * Consolidated Raise-PO plan (Jess Option A, locked 2026-07-18 night):
 * 人分单,货合买 — take the SELECTED orders' outstanding core lines, subtract
 * free stock and lines already covered by a PO, and group what's left into
 * ONE card per supplier (rows = SKU totals + the SO chips they serve).
 *
 * PURE — no fetching, no dates beyond the injected `now` — so the grouping
 * rules are unit-testable:
 *  · only core goods (Mattress/Bedframe/Sofa) are procurable here; acc/service
 *    lines are counted + skipped;
 *  · a line with `source_po` is already ordered (AutoCount PO) → skipped;
 *  · free stock is allocated SO-ascending (earliest order absorbs shelf stock
 *    first) — only the uncovered remainder lands on a PO;
 *  · supplier resolution: user override > catalog `product_skus.supplier_id`
 *    > the UNIQUE supplier covering the category (ambiguous categories stay
 *    unresolved — a wrong supplier on a PO is worse than one extra click);
 *  · urgency: the order's deadline is inside the stock lead window
 *    (MS/BF 7d · sofa 5d) — these must not wait for PO day.
 */

export interface RaisePoOrder {
  id: string;
  so: number | null;
  deliveryDate: string | null;
  lines: {
    sku: string;
    qty: number;
    sourcePo?: string | null;
    attrs?: Record<string, unknown> | null;
  }[];
}

export interface RaisePoSkuMeta {
  supplierId: string | null;
  category: string | null;
  cost: number | null;
}

export interface RaisePoLine {
  sku: string;
  qty: number;
  /** SOs this line serves (sorted asc) — the card's "为哪几张 SO" chips. */
  sos: number[];
  category: CoreCat;
  attrs: Record<string, unknown> | null;
  /** Catalog cost when the SKU is a catalog row; null = operator keys it. */
  cost: number | null;
  fromCatalog: boolean;
  urgent: boolean;
  /** How the supplier was decided: 'catalog' = authoritative
   *  product_skus.supplier_id (fixed); 'override' = the operator picked it;
   *  'category' = GUESSED via the unique covering supplier — shown editable
   *  in the card so a wrong guess never becomes a wrong PO. */
  resolvedBy: "catalog" | "override" | "category" | null;
}

export interface RaisePoCard {
  supplierId: string;
  lines: RaisePoLine[];
}

export interface RaisePoPlan {
  cards: RaisePoCard[];
  /** Shortage lines whose supplier couldn't be resolved — need a human pick. */
  unresolved: RaisePoLine[];
  /** Lines skipped because an (AutoCount) PO already covers them. */
  alreadyOnPo: number;
  /** Units satisfied straight from free stock (no PO needed). */
  coveredUnits: number;
  /** Accessory / service lines skipped (not procurable here). */
  nonCore: number;
}

const CORE: readonly string[] = ["mattress", "bedframe", "sofa"];

function canonAttrs(attrs: Record<string, unknown> | null | undefined): string {
  if (!attrs || Object.keys(attrs).length === 0) return "";
  return JSON.stringify(
    Object.fromEntries(Object.entries(attrs).sort(([a], [b]) => a.localeCompare(b))),
  );
}

export function buildRaisePoPlan(
  orders: RaisePoOrder[],
  availableBySku: Map<string, number> | undefined,
  skuMeta: Map<string, RaisePoSkuMeta>,
  suppliers: { id: string; cat_covered: string[] }[],
  supplierOverride: Map<string, string>,
  now: Date = new Date(),
): RaisePoPlan {
  // Free stock pool, allocated earliest-SO-first below.
  const remaining = new Map<string, number>();
  if (availableBySku)
    for (const [sku, avail] of availableBySku) remaining.set(sku, Math.max(0, avail));

  let alreadyOnPo = 0;
  let coveredUnits = 0;
  let nonCore = 0;

  const agg = new Map<string, RaisePoLine>();
  const sorted = [...orders].sort(
    (a, b) => (a.so ?? Number.MAX_SAFE_INTEGER) - (b.so ?? Number.MAX_SAFE_INTEGER),
  );
  for (const o of sorted) {
    for (const l of o.lines) {
      const qty = Number(l.qty || 0);
      if (qty <= 0) continue;
      const meta = skuMeta.get(l.sku);
      const cat = (
        meta?.category && CORE.includes(meta.category) ? meta.category : lineCategory(l.sku)
      ) as CoreCat | "acc";
      if (cat === "acc" || (meta?.category && !CORE.includes(meta.category))) {
        nonCore += 1;
        continue;
      }
      if (l.sourcePo) {
        alreadyOnPo += 1;
        continue;
      }
      const avail = remaining.get(l.sku) ?? 0;
      const taken = Math.min(avail, qty);
      if (taken > 0) remaining.set(l.sku, avail - taken);
      coveredUnits += taken;
      const short = qty - taken;
      if (short <= 0) continue;

      const key = `${l.sku}|${canonAttrs(l.attrs)}`;
      const urgent = poUrgentBypass(o.deliveryDate, [cat], now);
      const cur = agg.get(key);
      if (cur) {
        cur.qty += short;
        if (o.so != null && !cur.sos.includes(o.so)) cur.sos.push(o.so);
        cur.urgent = cur.urgent || urgent;
      } else {
        agg.set(key, {
          sku: l.sku,
          qty: short,
          sos: o.so != null ? [o.so] : [],
          category: cat,
          attrs: l.attrs ?? null,
          cost: meta?.cost ?? null,
          fromCatalog: !!meta,
          urgent,
          resolvedBy: null,
        });
      }
    }
  }

  // Supplier resolution → cards.
  const bySupplier = new Map<string, RaisePoLine[]>();
  const unresolved: RaisePoLine[] = [];
  for (const line of agg.values()) {
    line.sos.sort((a, b) => a - b);
    const meta = skuMeta.get(line.sku);
    const covering = suppliers.filter((s) => (s.cat_covered ?? []).includes(line.category));
    const override = supplierOverride.get(line.sku);
    const supplierId =
      override ?? meta?.supplierId ?? (covering.length === 1 ? covering[0].id : null);
    line.resolvedBy = override
      ? "override"
      : meta?.supplierId
        ? "catalog"
        : supplierId
          ? "category"
          : null;
    if (!supplierId) {
      unresolved.push(line);
      continue;
    }
    const arr = bySupplier.get(supplierId);
    if (arr) arr.push(line);
    else bySupplier.set(supplierId, [line]);
  }

  const cards: RaisePoCard[] = [...bySupplier.entries()]
    .map(([supplierId, lines]) => ({
      supplierId,
      lines: lines.sort((a, b) => a.sku.localeCompare(b.sku)),
    }))
    .sort((a, b) => a.supplierId.localeCompare(b.supplierId));
  unresolved.sort((a, b) => a.sku.localeCompare(b.sku));

  return { cards, unresolved, alreadyOnPo, coveredUnits, nonCore };
}
