/**
 * ONE ORDER'S DELIVERY MONITOR CARD, for surfaces outside Monitor (the Work
 * Logistics card, owner ruling 2026-09-24).
 *
 * It is NOT a second arithmetic (Law D): it runs the very builder Monitor
 * runs (`buildDeliveryMonitorCards`) over the very reads Monitor reads — all
 * cached app-wide — narrowed to one order. Whatever Monitor says about a
 * delivery, this says, word for word.
 */
import { useMemo } from "react";
import { deliveryQueueLeads, myHolidaySet, type DeliveryArrangementRow } from "@carres/shared";
import { appTodayIso } from "@/lib/fmt-date";
import {
  useCatalog,
  useDeliveryArrangements,
  useDeliveryOrdersRegister,
  useDeliveryPartners,
  useOperationOrders,
  usePurchasingSettings,
} from "@/lib/queries";
import { buildDeliveryMonitorCards, type DeliveryMonitorCard } from "./delivery-monitor";

export interface DeliveryScopeCardState {
  card: DeliveryMonitorCard | null;
  loading: boolean;
  failed: boolean;
}

/** Resolve an order from what a Work item carries: its id, or `SO-{n}`. */
export function useOrderIdFromRef(ref: { orderId?: string | null; soLabel?: string | null; doNumber?: string | null }): string | null {
  const ordersQ = useOperationOrders();
  const docsQ = useDeliveryOrdersRegister({ enabled: Boolean(ref.doNumber) && !ref.orderId });
  return useMemo(() => {
    if (ref.orderId) return ref.orderId;
    if (ref.doNumber) {
      const doc = (docsQ.data?.deliveryOrders ?? []).find((d) => d.do_number === ref.doNumber);
      if (doc) return doc.order_id;
    }
    const so = ref.soLabel?.match(/^SO-(\d+)/)?.[1];
    if (so) {
      const order = (ordersQ.data?.orders ?? []).find((o) => String(o.so) === so);
      if (order) return order.id;
    }
    return null;
  }, [ref.orderId, ref.soLabel, ref.doNumber, ordersQ.data, docsQ.data]);
}

export function useDeliveryScopeCard(orderId: string | null, leg = 0): DeliveryScopeCardState {
  const ordersQ = useOperationOrders();
  const partnersQ = useDeliveryPartners();
  const docsQ = useDeliveryOrdersRegister();
  const arrangementsQ = useDeliveryArrangements();
  const settingsQ = usePurchasingSettings();
  const catalogQ = useCatalog();
  const today = appTodayIso();

  const card = useMemo(() => {
    const order = (ordersQ.data?.orders ?? []).find((o) => o.id === orderId);
    if (!orderId || !order) return null;
    const arrangements = new Map<string, DeliveryArrangementRow>();
    for (const a of arrangementsQ.data?.arrangements ?? []) {
      if (a.order_id === orderId) arrangements.set(`${a.order_id}#${a.leg}`, a);
    }
    const partnerNameById = new Map<string, string>();
    for (const p of partnersQ.data?.partners ?? []) partnerNameById.set(p.id, p.name);
    const addonNameByKey = new Map<string, string>();
    for (const a of catalogQ.data?.addons ?? []) if (a.key && a.name) addonNameByKey.set(a.key, a.name);
    const cards = buildDeliveryMonitorCards({
      orders: [order],
      deliveryOrders: (docsQ.data?.deliveryOrders ?? []).filter((d) => d.order_id === orderId),
      attempts: docsQ.data?.attempts ?? [],
      contacts: (arrangementsQ.data?.contacts ?? []).filter((c) => c.order_id === orderId),
      handoverEvents: docsQ.data?.handoverEvents ?? [],
      proofReviews: docsQ.data?.proofReviews ?? [],
      attemptEvidence: docsQ.data?.attemptEvidence ?? [],
      partnerNameById,
      arrangements,
      queueLeads: settingsQ.data ? deliveryQueueLeads(settingsQ.data) : undefined,
      holidays: myHolidaySet(),
      addonNameByKey,
      todayIso: today,
    });
    return cards.find((c) => (c.leg ?? 0) === leg) ?? cards[0] ?? null;
  }, [orderId, leg, ordersQ.data, docsQ.data, arrangementsQ.data, partnersQ.data, settingsQ.data, catalogQ.data, today]);

  return {
    card,
    loading: ordersQ.isLoading || arrangementsQ.isLoading || docsQ.isLoading,
    failed: Boolean(ordersQ.isError || arrangementsQ.isError),
  };
}
