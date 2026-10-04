/** Real register quick view. Presentation only; Delivery's existing forms own writes. */
import type { ReactNode } from "react";
import CompactModuleCard, { CardChecklist, type CardFact } from "@/components/kit/CompactModuleCard";
import { useAuth } from "@/lib/auth";
import { useOrderTimeline } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import { useDeliveryScopeCard } from "../delivery-scope-card";
import { describeActivity } from "./activity-display";
import { DeliveryDatesEdit, LogisticsDetailsEdit } from "./DeliveryBrief";
import SalesOrderCardDocument from "./SalesOrderCardDocument";
import type { RegisterRow } from "../sales-order-columns";

export default function SalesOrderCompactView({ row, salesLocation, items, documents, statuses, onOpen, onClose }: {
  row: RegisterRow; salesLocation: string; items: ReactNode; documents: ReactNode; statuses: ReactNode; onOpen: () => void; onClose: () => void;
}) {
  // Customer is only the final receiver, never an intermediate warehouse.
  const leg = Math.max(0, ...(row.o.delivery_stops ?? []).map(stop => stop.leg));
  const delivery = useDeliveryScopeCard(row.id, leg, row.o);
  const timeline = useOrderTimeline(row.id);
  const role = useAuth(s => s.role);
  const card = delivery.failed || delivery.loading || (delivery.card && (delivery.card.leg ?? 0) !== leg) ? null : delivery.card;
  const mayEdit = (role === "operation" || role === "principal") && !!card && !card.settled && row.o.status !== "cancelled";
  const unavailable = delivery.failed ? "Unavailable" : delivery.loading ? "Loading…" : "Not recorded";
  const money = (fact: RegisterRow["total"]) => fact.kind === "amount" ? new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", maximumFractionDigits: 2 }).format(fact.value) : fact.kind === "settled" ? "Paid in full" : "No price yet";
  const goods = card ? [...card.items, ...card.extras.filter(item => item.kind === "accessory")].reduce((sum, item) => sum + item.qty, 0) : 0;
  const stock: CardFact = { key: "stock", label: "Stock", value: card && goods ? `${Math.max(0, goods - card.readiness.shortQty)}/${goods}` : unavailable, status: card && goods && card.readiness.ready ? "Ready" : undefined, opensItems: true };
  const customer: CardFact = { key: "customer", label: "Customer", value: card ? card.confirmedDate ? `${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${card.confirmedDate.slice(0, 10)}T00:00:00Z`))}${card.confirmedTime ? ` · ${card.confirmedTime}` : ""}` : "Date not confirmed" : unavailable, status: card?.confirmedDate ? "Date confirmed" : undefined, editable: mayEdit, editor: mayEdit && card ? close => <DeliveryDatesEdit card={card} compact layout="grid" onDone={close} /> : undefined };
  const logistics: CardFact = { key: "logistics", label: "Logistics", value: card ? card.logisticsPartnerName ?? "Not assigned" : unavailable, editable: mayEdit, editor: mayEdit && card ? close => <LogisticsDetailsEdit card={card} compact onDone={close} /> : undefined };
  const doFact: CardFact = { key: "do", label: "DO", value: card ? card.doNumber ?? "No DO yet" : unavailable, editor: () => card ? <CardChecklist label="Delivery Order" items={[
    { text: "Stock ready", done: card.readiness.ready },
    { text: "Payment cleared", done: card.payment.line1 === "Paid" },
    { text: "Customer confirmed date", done: !!card.confirmedDate },
  ]} /> : <p role="status">{unavailable}</p> };
  const details = <div className="flex flex-col gap-3"><dl className="grid grid-cols-2 gap-3 text-body">
    <div><dt>Email</dt><dd className="break-words">{row.o.customer_email || "Not given"}</dd></div>
    <div><dt>Dealer</dt><dd>{row.o.dealers?.name || "Not recorded"}</dd></div>
    <div><dt>Proceed Date</dt><dd>{row.proceeded ? fmtDate(row.proceeded) : "Not recorded"}</dd></div>
    <div><dt>Customer Requested Delivery Date</dt><dd>{row.customerDelivery ? fmtDate(row.customerDelivery) : "Not recorded"}</dd></div>

  </dl>{statuses}{items}{documents}</div>;
  return <div data-testid="sales-order-quick-view"><CompactModuleCard
    key={row.id} name={row.customer} reference={`SO-${row.so}`} phone={row.phone}
    document={{ label: `Sales Order SO-${row.so}`, preview: <SalesOrderCardDocument orderId={row.id} reference={`SO-${row.so}`} /> }}
    sales={{ orderDate: fmtDate(row.ordered), salesLocation, salesperson: row.o.salespersons?.name ?? "Not recorded" }}
    address={{ area: row.deliveryLocation || "Not recorded", full: row.o.customer_address || "Not recorded", facts: [
      { kind: "building", label: "Floor", value: String(row.o.delivery_floor ?? "Not recorded") },
      { kind: "access", label: "Lift", value: row.o.delivery_has_lift == null ? "Not recorded" : row.o.delivery_has_lift ? "Yes" : "No" },
      { kind: "access", label: "Stair carry items", value: String(row.o.delivery_stair_items ?? "Not recorded") },
    ] }}
    target={row.customerDelivery ? { date: fmtDate(row.customerDelivery) } : undefined}
    openLabel="Open full page" onOpen={onOpen} onClose={onClose}
    initialModule="info" modules={[
      { key: "info", label: "Info", opensHeaderDetails: true, summary: [{ key: "total", label: "Total", value: money(row.total) }, { key: "paid", label: "Paid", value: money(row.paid) }, { key: "outstanding", label: "Outstanding", value: money(row.balance) }], items: details },
      { key: "delivery", label: "Delivery", summary: [stock, logistics, customer, doFact], items: details },
    ]}
    communication={{ recipients: [{ value: row.phone, label: row.customer, phone: row.phone }], templates: [] }}
    timelineStatus={timeline.isError ? "Unavailable" : timeline.isLoading ? "Loading…" : undefined}
    timeline={timeline.data?.map(entry => { const description = describeActivity(entry); const actor = entry.actor_name || "System"; return { id: entry.id, actorName: actor, actorInitial: actor.slice(0, 1), summary: description.title, result: description.body || undefined, at: entry.occurred_at }; }) ?? []}
  /></div>;
}
