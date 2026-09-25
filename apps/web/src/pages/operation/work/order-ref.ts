import type { OperationWorkItem } from "@carres/shared";

/** The order a work item names, or null when it names several / none. */
export function orderRefOf(item: OperationWorkItem): { orderId?: string | null; soLabel?: string | null; doNumber?: string | null } | null {
  const kind = item.object.kind;
  if (kind === "sales_order" || kind === "delivery_scope") return { orderId: item.object.id };
  if (kind === "delivery_order") return { doNumber: item.object.id };
  if (/^SO-\d+/.test(item.object.label)) return { soLabel: item.object.label };
  return null;
}

