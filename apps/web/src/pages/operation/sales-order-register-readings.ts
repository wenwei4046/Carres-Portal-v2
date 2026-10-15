/**
 * The Sales Order list's shared readings: the catalog name of a SKU, and the
 * receipt and payment state of one order. One copy, read by Sales Order
 * Outright (its cells and its `Group by`) and the earlier register.
 */
import { useMemo } from "react";
import { useCatalog } from "@/lib/queries";
import type { RegisterRow } from "./sales-order-columns";

/** One SKU spelling for a catalog lookup — trimmed, case-folded. */
export function skuKey(sku: string): string {
  return sku.trim().toUpperCase();
}

/**
 * SKU → the product's NAME and its recorded variant, from the one catalog
 * read (`useCatalog`). The expansion's `Item` and the Register's `Items`
 * both read it, so a product is named once and never by its code when the
 * catalog knows it (orders MASTER, 2026-09-21: `Cody` / `Super King`).
 */
export function useCatalogNames(): Map<string, { name: string; variant: string }> {
  const catalogQ = useCatalog();
  return useMemo(() => {
    const modelName = new Map((catalogQ.data?.models ?? []).map((m) => [m.id, m.name]));
    const out = new Map<string, { name: string; variant: string }>();
    for (const sku of catalogQ.data?.skus ?? []) {
      const name = modelName.get(sku.modelId);
      if (name) out.set(skuKey(sku.sku), { name, variant: sku.variant });
    }
    return out;
  }, [catalogQ.data]);
}


export const STOCK_STATUSES = [
  { key: "pending", label: "Awaiting receipt" },
  { key: "partial", label: "Partially received" },
  { key: "received", label: "Fully received" },
  { key: "issue", label: "Received with issue" },
  { key: "unknown", label: "Receipt unconfirmed" },
] as const;
export function stockStatusOf(row: RegisterRow, sku?: string): string {
  const facts = row.stockFacts;
  const keys = [...new Set((row.o.order_lines ?? []).filter(line => !sku || line.sku === sku).map(line => line.sku))];
  const values = keys.map(key => facts?.[key] ?? "unknown");
  if (!values.length) return "unknown";
  if (values.includes("issue")) return "issue";
  if (values.includes("unknown")) return "unknown";
  if (values.every(v => v === "received")) return "received";
  if (values.some(v => v === "received" || v === "partial")) return "partial";
  return "pending";
}

export const PAYMENT_STATUSES = [
  { key: "unpaid", label: "Unpaid" },
  { key: "partial", label: "Partially paid" },
  { key: "paid", label: "Paid in full" },
  { key: "unknown", label: "Amount unconfirmed" },
] as const;
export function paymentStatusOf(row: RegisterRow): string {
  if (row.balance.kind === "settled") return "paid";
  if (row.balance.kind !== "amount" || row.total.kind !== "amount") return "unknown";
  if (row.balance.value <= 0) return "paid";
  return row.paid.kind === "amount" && row.paid.value > 0 ? "partial" : "unpaid";
}

