/** Real register quick view. Presentation only; Delivery's existing forms own writes. */
import type { ReactNode } from "react";
import CompactModuleCard, { CardChecklist, type CardFact } from "@/components/kit/CompactModuleCard";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { renderPaymentTemplate, type PaymentTemplateRow } from "@carres/shared/payment-templates";
import { useAuth } from "@/lib/auth";
import { useDeliveryPartners, useDeliverySettings, useOrderTimeline } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import { useDeliveryScopeCard } from "../delivery-scope-card";
import { describeActivity } from "./activity-display";
import { DeliveryDatesEdit, LogisticsDetailsEdit } from "./DeliveryBrief";
import { salesOrderCardHeader, salesOrderMoneySummary } from "./sales-order-card";
import { buildCustomerReminder, buildCustomerChase, salutationOf } from "@/lib/wa-templates";
import { chaseMessageFor } from "../delivery-chase";
import { useGoodsName } from "../work/goods-name";
import type { RegisterRow } from "../sales-order-columns";

export { originalRequestDays } from "./sales-order-card";
export default function SalesOrderCompactView({ row, salesLocation, items, onOpen, onClose, initialModule = "info" }: {
  row: RegisterRow; salesLocation: string; items: ReactNode; onOpen: () => void; onClose: () => void;
  /** The module tab that opens first: `delivery` when a Delivery task opens the card (Tasks, LOCAL PROPOSAL). */
  initialModule?: "info" | "delivery";
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
  return <div data-testid="sales-order-quick-view"><CompactModuleCard
    key={row.id} {...salesOrderCardHeader(row, salesLocation)}
    closeLabel="Close order" openLabel="Open full page" onOpen={onOpen} onClose={onClose}
    initialModule={initialModule} modules={[
      { key: "info", label: "Info", opensHeaderDetails: true, summary: salesOrderMoneySummary(row), items },
      { key: "delivery", label: "Delivery", summary: [stock, logistics, customer, doFact], items, communication: deliveryCommunication },
    ]}
    communication={{ recipients: [{ value: row.phone, label: row.customer, phone: row.phone }], templates: customerTemplates }}
    timelineStatus={timeline.isError ? "Unavailable" : timeline.isLoading ? "Loading…" : undefined}
    timeline={timeline.data?.map(entry => { const description = describeActivity(entry); const actor = entry.actor_name || "Staff identity not recorded"; return { id: entry.id, actorName: actor, actorInitial: actor.slice(0, 1), summary: description.title, result: description.body || undefined, at: entry.occurred_at }; }) ?? []}
  /></div>;
}
