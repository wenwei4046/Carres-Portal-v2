/**
 * THE ONE Sales Order card builder (UI MASTER §4.3, owner 2026-10-05).
 *
 * The standalone Register quick view (`SalesOrderCompactView`) and the embedded
 * `Sales Order` tab (`EmbeddedSalesOrders`) draw the same order through the same
 * kit `CompactModuleCard`. Every SO fact the card shows — identity, saved PDF
 * door, sales facts, address and access facts, the customer's original requested
 * date with its day count, and Info's money summary — is mapped HERE once, so the
 * two presentations cannot drift. Presentation rules stay in the kit.
 */
import { LIFT_OPTIONS } from "@carres/shared";
import type { CardFact, CompactModuleCardProps } from "@/components/kit/CompactModuleCard";
import { fmtDate } from "@/lib/fmt-date";
import type { RegisterRow } from "../sales-order-columns";
import SalesOrderCardDocument from "./SalesOrderCardDocument";

/** Calendar-date duration, independent of today and actual handoff time. */
export function originalRequestDays(proceed: string | null | undefined, requested: string | null | undefined): number | null {
  if (!proceed || !requested) return null;
  const parse = (date: string) => { const key = date.slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return NaN; const value = Date.parse(`${key}T00:00:00Z`); return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === key ? value : NaN; };
  const days = (parse(requested) - parse(proceed)) / 86400000;
  return Number.isInteger(days) && days >= 0 ? days : null;
}

export type SalesOrderCardHeader = Pick<CompactModuleCardProps, "name" | "reference" | "phone" | "document" | "sales" | "address" | "target">;

/** The shared identity, sales facts, address and original-request date of one SO. */
export function salesOrderCardHeader(row: RegisterRow, salesLocation: string): SalesOrderCardHeader {
  const requested = row.customerDelivery;
  const days = originalRequestDays(row.o.proceed_date, requested);
  return {
    name: row.customer,
    reference: `SO-${row.so}`,
    phone: row.phone,
    document: { label: `Sales Order SO-${row.so}`, preview: (onClose) => <SalesOrderCardDocument orderId={row.id} reference={`SO-${row.so}`} onClose={onClose} /> },
    sales: { orderDate: fmtDate(row.ordered), proceedDate: row.o.proceed_date ? fmtDate(row.o.proceed_date) : "Not recorded", salesLocation, salesperson: row.o.salespersons?.name ?? "Not recorded" },
    address: { area: row.deliveryLocation || "Not recorded", hideArea: true, full: row.o.customer_address || "Not recorded", facts: [
      { kind: "building", label: "Building type", value: row.o.building_type || "Building type: Not recorded" },
      { kind: "building", label: "Floor", value: row.o.delivery_floor == null ? "Floor: Not recorded" : `Floor ${row.o.delivery_floor}` },
      { kind: "access", label: "Lift", value: row.o.delivery_has_lift == null ? "Lift: Not recorded" : LIFT_OPTIONS[row.o.delivery_has_lift ? 1 : 0] },
      ...(row.o.delivery_stair_items && row.o.delivery_stair_items > 0 ? [{ kind: "access" as const, label: "Stair carry", value: `Stair carry: ${row.o.delivery_stair_items} items` }] : []),
    ] },
    target: { date: requested ? fmtDate(requested) : "Not recorded", badge: days === null ? undefined : `${days}d`, label: "Customer’s original requested delivery", labelLines: ["Customer’s original", "requested delivery"] },
  };
}

/** Info's money facts, matching the saved PDF: Total payable · Paid to date · Balance due. */
export function salesOrderMoneySummary(row: RegisterRow): CardFact[] {
  const money = (fact: RegisterRow["total"]) => fact.kind === "amount" ? new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", maximumFractionDigits: 2 }).format(fact.value) : fact.kind === "settled" ? "Paid in full" : "No price yet";
  return [{ key: "total", label: "Total payable", value: money(row.total) }, { key: "paid", label: "Paid to date", value: money(row.paid) }, { key: "outstanding", label: "Balance due", value: money(row.balance) }];
}
