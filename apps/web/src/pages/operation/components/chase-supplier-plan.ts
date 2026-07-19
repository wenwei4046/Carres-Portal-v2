import { lineCategory, type CoreCat } from "@/lib/line-category";

/**
 * Chase-supplier plan (Remind / Chase over the SELECTED orders):
 * group EVERY core line by supplier — regardless of stock cover or PO status —
 * and collect the CR/TCF ref per order, so operation can nudge each supplier's
 * WhatsApp group with ONE message listing all its orders' refs.
 *
 * PURE — no fetching — so the grouping is unit-testable. Mirrors the supplier
 * resolution of `raise-po-plan.ts` (catalog `product_skus.supplier_id`, else the
 * UNIQUE supplier covering the category) but WITHOUT the stock/PO subtraction:
 * chasing is about pushing on made-to-order goods, so every core line counts.
 *  · only core goods (Mattress/Bedframe/Sofa) chase a supplier; acc/service skip;
 *  · supplier resolution: catalog supplierId, else the sole cat_covered match,
 *    else the order's line is unresolved (a wrong supplier chase is noise);
 *  · within a supplier, rows are grouped by ORDER (ref = order.refNo).
 */

export interface ChaseOrder {
  id: string;
  so: number | null;
  refNo: string | null;
  deliveryDate: string | null;
  lines: { sku: string; qty: number }[];
}

export interface ChaseCard {
  supplierId: string;
  rows: { ref: string | null; so: number | null; items: { sku: string; qty: number }[] }[];
  lineCount: number;
}

const CORE: readonly string[] = ["mattress", "bedframe", "sofa"];

export function buildChaseSupplierPlan(
  orders: ChaseOrder[],
  skuMeta: Map<string, { supplierId: string | null; category: string | null }>,
  suppliers: { id: string; cat_covered: string[] | null }[],
): { cards: ChaseCard[]; unresolved: number } {
  let unresolved = 0;
  // supplierId → (orderId → row)
  const bySupplier = new Map<
    string,
    Map<string, { ref: string | null; so: number | null; items: { sku: string; qty: number }[] }>
  >();

  for (const o of orders) {
    for (const l of o.lines) {
      const qty = Number(l.qty || 0);
      if (qty <= 0) continue;
      const meta = skuMeta.get(l.sku);
      const cat = (
        meta?.category && CORE.includes(meta.category) ? meta.category : lineCategory(l.sku)
      ) as CoreCat | "acc";
      if (cat === "acc" || (meta?.category && !CORE.includes(meta.category))) continue;

      const covering = suppliers.filter((s) => (s.cat_covered ?? []).includes(cat));
      const supplierId =
        meta?.supplierId ?? (covering.length === 1 ? covering[0].id : null);
      if (!supplierId) {
        unresolved += 1;
        continue;
      }
      let orderRows = bySupplier.get(supplierId);
      if (!orderRows) {
        orderRows = new Map();
        bySupplier.set(supplierId, orderRows);
      }
      const row = orderRows.get(o.id);
      if (row) {
        row.items.push({ sku: l.sku, qty });
      } else {
        orderRows.set(o.id, {
          ref: o.refNo,
          so: o.so,
          items: [{ sku: l.sku, qty }],
        });
      }
    }
  }

  const cards: ChaseCard[] = [...bySupplier.entries()]
    .map(([supplierId, orderRows]) => {
      const rows = [...orderRows.values()];
      return {
        supplierId,
        rows,
        lineCount: rows.reduce((t, r) => t + r.items.length, 0),
      };
    })
    .sort((a, b) => a.supplierId.localeCompare(b.supplierId));

  return { cards, unresolved };
}
