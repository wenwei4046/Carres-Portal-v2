/**
 * THE ORDER LIST'S DELIVERY FILTER (Orders MASTER §Left rail, owner approved
 * 2026-09-22): `Not delivered` · `Partially delivered` · `Fully delivered`.
 *
 * A read-only FACT filter, never a status. It asks the ONE goods arithmetic
 * (`resolveUnitAllocation`, Card 2 — the same one the completion reader and
 * the object page use): a committed unit is delivered when it is SOLD to the
 * order. A reserved unit is not delivered.
 *
 * An order with no physical goods (service only) has nothing to deliver, so
 * it answers `null` and falls under `All` only — unknown is never classified.
 */
import { lineKind } from "./line-category";
import { resolveUnitAllocation, type AllocationUnit } from "./sales-order-allocation";

export type RegisterDeliveryCondition = "not_delivered" | "partially_delivered" | "fully_delivered";

export const REGISTER_DELIVERY_CONDITIONS: ReadonlyArray<{ key: RegisterDeliveryCondition; label: string }> = [
  { key: "not_delivered", label: "Not delivered" },
  { key: "partially_delivered", label: "Partially delivered" },
  { key: "fully_delivered", label: "Fully delivered" },
];

export function registerDeliveryConditionOf(
  lines: ReadonlyArray<{ sku: string; qty: number | string }>,
  units: ReadonlyArray<{ sku: string; status: "reserved" | "sold"; qty: number }>,
): RegisterDeliveryCondition | null {
  const commitmentLines = lines
    .filter((l) => lineKind(l.sku) !== "service")
    .map((l) => ({ sku: l.sku, qty: Number(l.qty) || 0 }))
    .filter((l) => l.qty > 0);
  if (commitmentLines.length === 0) return null;
  const allocation = resolveUnitAllocation({
    orderId: "",
    soRef: "",
    commitmentLines,
    units: units.map(
      (u, i): AllocationUnit => ({
        id: String(i),
        unitCode: null,
        sku: u.sku,
        status: u.status,
        condition: "",
        warehouseId: null,
        poNo: null,
        qty: u.qty,
        dateIn: null,
      }),
    ),
  });
  /* Delivered = sold, counted per line and never past what the line
     committed (an extra sold unit does not deliver another line). */
  const { committedQty } = allocation.totals;
  const deliveredQty = allocation.lines.reduce((s, l) => s + Math.min(l.soldQty, l.committedQty), 0);
  if (committedQty <= 0) return null;
  if (deliveredQty === 0) return "not_delivered";
  if (deliveredQty >= committedQty) return "fully_delivered";
  return "partially_delivered";
}
