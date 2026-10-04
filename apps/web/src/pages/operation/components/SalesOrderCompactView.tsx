/** Real register quick view. Presentation only; Delivery's existing forms own writes. */
import type { ReactNode } from "react";
import { LIFT_OPTIONS } from "@carres/shared";
import CompactModuleCard, { CardChecklist, type CardFact } from "@/components/kit/CompactModuleCard";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { renderPaymentTemplate, type PaymentTemplateRow } from "@carres/shared/payment-templates";
import { useAuth } from "@/lib/auth";
import { useDeliveryPartners, useDeliverySettings, useOrderTimeline } from "@/lib/queries";
import { appTodayIso, fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { useDeliveryScopeCard } from "../delivery-scope-card";
import { describeActivity } from "./activity-display";
import { DeliveryDatesEdit, LogisticsDetailsEdit } from "./DeliveryBrief";
import SalesOrderCardDocument from "./SalesOrderCardDocument";
import { buildCustomerReminder, buildCustomerChase, salutationOf } from "@/lib/wa-templates";
import { chaseMessageFor } from "../delivery-chase";
import { useGoodsName } from "../work/goods-name";
import type { RegisterRow } from "../sales-order-columns";

export default function SalesOrderCompactView({ row, salesLocation, items, documents, statuses, onOpen, onClose }: {
  row: RegisterRow; salesLocation: string; items: ReactNode; documents: ReactNode; statuses: ReactNode; onOpen: () => void; onClose: () => void;
}) {
  // Customer is only the final receiver, never an intermediate warehouse.
  const leg = Math.max(0, ...(row.o.delivery_stops ?? []).map(stop => stop.leg));
  const delivery = useDeliveryScopeCard(row.id, leg, row.o);
  const timeline = useOrderTimeline(row.id);
  const settings = useDeliverySettings();
  const partners = useDeliveryPartners();
  const nameOf = useGoodsName();
  const role = useAuth(s => s.role);
  const paymentTemplates = useQuery<{ templates: PaymentTemplateRow[] }>({
    queryKey: ["finance", "payment-templates"],
    queryFn: () => apiFetch("/api/finance/payment-settings/templates"),
    staleTime: 60_000,
    enabled: ["operation", "finance", "principal"].includes(role ?? "") && row.balance.kind === "amount" && row.balance.value > 0,
  });
  const card = delivery.failed || delivery.loading || (delivery.card && (delivery.card.leg ?? 0) !== leg) ? null : delivery.card;
  const mayEdit = (role === "operation" || role === "principal") && !!card && !card.settled && row.o.status !== "cancelled" && row.o.status !== "delivered" && !row.o.delivered_at;
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
  const goodsLines = (row.o.order_lines ?? []).map(line => ({ sku: nameOf(line.sku), qty: line.qty }));
  const reference = (row.o.source_ref ?? []).filter(Boolean).join(" · ") || `SO-${row.so}`;
  const customerInput = { salutation: salutationOf(null, row.customer), ref: reference, outstanding: row.balance.kind === "amount" ? row.balance.value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "", lines: goodsLines };
  const builtInCustomerTemplates = row.balance.kind === "amount" && row.balance.value > 0 ? [
    { key: "reminder", label: "Payment reminder", body: buildCustomerReminder(customerInput) },
    { key: "followup", label: "Payment follow-up", body: buildCustomerChase(customerInput) },
  ] : [];
  const paymentFacts = { customer: customerInput.salutation, ref: reference, outstanding: customerInput.outstanding, items: goodsLines.map(line => `${line.qty}× ${line.sku}`).join("\n") };
  const activePaymentTemplates = row.balance.kind === "amount" && row.balance.value > 0 ? (paymentTemplates.data?.templates ?? []).filter(template => template.active && template.is_head && ["gentle_reminder", "should_have_been_received"].includes(template.purpose)).sort((a, b) => Number(b.is_default) - Number(a.is_default)).map(template => ({ key: template.id, label: template.name, body: renderPaymentTemplate(template.body, paymentFacts) })) : [];
  const customerTemplates = activePaymentTemplates.length ? activePaymentTemplates : builtInCustomerTemplates;
  const partner = (partners.data?.partners ?? []).find(partner => partner.id === card?.logisticsPartnerId);
  const deliveryFacts = { customer: row.customer, so: reference, address: row.o.customer_address, goods: goodsLines.map(line => `${line.qty}× ${line.sku}`).join("\n"), requested_date: row.customerDelivery ? fmtDate(row.customerDelivery) : null, confirmed_date: card?.confirmedDate ? fmtDate(card.confirmedDate) : null, confirmed_time: card?.confirmedTime, partner: card?.logisticsPartnerName };
  const deliveryTemplates = (settings.data?.templates ?? []).filter(template => template.active && template.is_head && template.purpose === "ask_partner_for_date" && template.channel === "whatsapp").sort((a, b) => Number(b.is_default) - Number(a.is_default)).map(template => ({ key: template.id, label: template.name, body: renderPaymentTemplate(template.body, deliveryFacts) }));
  // The same approved Delivery message as its Monitor; templates are drafts, never confirmation.
  const detailsTemplate = { key: "details", label: "Delivery details", body: chaseMessageFor({ reference, customer: row.customer, address: row.o.customer_address || null, building: row.o.building_type || null, goods: goodsLines.map(line => `${line.qty}× ${line.sku}`), requestedDate: row.customerDelivery ? fmtDate(row.customerDelivery) : null }) };
  const deliveryCommunication = card?.logisticsPartnerId && card.logisticsPartnerName ? { recipients: [{ value: card.logisticsPartnerName, label: card.logisticsPartnerName, whatsappUrl: partner?.whatsapp_group_url || undefined }], templates: deliveryTemplates.length ? deliveryTemplates : [detailsTemplate] } : null;
  const details = <div className="flex flex-col gap-3"><dl className="grid grid-cols-2 gap-3 text-body">
    <div><dt>Email</dt><dd className="break-words">{row.o.customer_email || "Not given"}</dd></div>
    <div><dt>Dealer</dt><dd>{row.o.dealers?.name || "Not recorded"}</dd></div>
    <div><dt>Proceed Date</dt><dd>{row.proceeded ? fmtDate(row.proceeded) : "Not recorded"}</dd></div>

  </dl>{statuses}{documents}</div>;
  return <div data-testid="sales-order-quick-view"><CompactModuleCard
    key={row.id} name={row.customer} reference={`SO-${row.so}`} phone={row.phone}
    document={{ label: `Sales Order SO-${row.so}`, preview: <SalesOrderCardDocument orderId={row.id} reference={`SO-${row.so}`} /> }}
    sales={{ orderDate: fmtDate(row.ordered), salesLocation, salesperson: row.o.salespersons?.name ?? "Not recorded" }}
    address={{ area: row.deliveryLocation || "Not recorded", full: row.o.customer_address || "Not recorded", facts: [
      { kind: "building", label: "Building type", value: row.o.building_type || "Building type: Not recorded" },
      { kind: "building", label: "Floor", value: row.o.delivery_floor == null ? "Floor: Not recorded" : `Floor ${row.o.delivery_floor}` },
      { kind: "access", label: "Lift", value: row.o.delivery_has_lift == null ? "Lift: Not recorded" : LIFT_OPTIONS[row.o.delivery_has_lift ? 1 : 0] },
      { kind: "access", label: "Items needing stair carry", value: `Items needing stair carry: ${row.o.delivery_stair_items ?? "Not recorded"}` },
    ] }}
    target={row.customerDelivery ? { date: fmtDateShort(row.customerDelivery), badge: `${Math.round((Date.parse(row.customerDelivery.slice(0, 10)) - Date.parse(appTodayIso())) / 86400000)}d` } : undefined}
    openLabel="Open full page" onOpen={onOpen} onClose={onClose}
    initialModule="info" modules={[
      { key: "info", label: "Info", opensHeaderDetails: true, summary: [{ key: "total", label: "Total", value: money(row.total) }, { key: "paid", label: "Paid", value: money(row.paid) }, { key: "outstanding", label: "Balance due", value: money(row.balance) }], items, details },
      { key: "delivery", label: "Delivery", summary: [stock, logistics, customer, doFact], items, communication: deliveryCommunication },
    ]}
    communication={{ recipients: [{ value: row.phone, label: row.customer, phone: row.phone }], templates: customerTemplates }}
    timelineStatus={timeline.isError ? "Unavailable" : timeline.isLoading ? "Loading…" : undefined}
    timeline={timeline.data?.map(entry => { const description = describeActivity(entry); const actor = entry.actor_name || "Staff identity not recorded"; return { id: entry.id, actorName: actor, actorInitial: actor.slice(0, 1), summary: description.title, result: description.body || undefined, at: entry.occurred_at }; }) ?? []}
  /></div>;
}
