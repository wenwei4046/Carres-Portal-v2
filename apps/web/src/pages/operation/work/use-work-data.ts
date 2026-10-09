/**
 * The reads behind the Work page (Workspace MASTER §5.10). Every read is an
 * owning module's existing door; nothing here derives a business fact.
 *
 *   useWorkOrderIndex   SO Batch lineage (which orders a PO serves) and the
 *                       PO windows — the same read and arithmetic the Work
 *                       feed and its PO window card use (Law D)
 *   useWorkOrderRoute   the Sales Order Order Route, through the ONE input
 *                       builder the Sales Order page uses
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  isOutstation,
  orderMoney,
  poWindowWorkFromSoBatch,
  resolveSalesOrderRoute,
  soBatchPurchaseResponseSchema,
  type SalesOrderRouteMap,
  type SoBatchPurchaseResponse,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import {
  useLogisticsCardFacts,
  useOperationOrder,
  useOperationOrders,
  useOperationSuppliers,
  useSalesOrderExpansion,
  useSalesOrderRouteFacts,
} from "@/lib/queries";
import { useDeliveryDays, useDeliveryLeads, useOrderCollectionTiming } from "@/lib/deadline-queries";
import { salesOrderRouteInputOf, type RouteOrderDetail } from "../sales-order-route-input";
import type { WorkOrderIndex } from "./work-orders";

export function useWorkOrderIndex(): { index: WorkOrderIndex; loading: boolean } {
  /* The same query key the PO window card reads, so one fetch serves both. */
  const demands = useQuery<SoBatchPurchaseResponse>({
    queryKey: ["so-batch-purchase", null],
    queryFn: async () =>
      soBatchPurchaseResponseSchema.parse(await apiFetch<unknown>("/api/operation/purchase/demands")) as SoBatchPurchaseResponse,
    staleTime: 15_000,
  });
  const suppliers = useOperationSuppliers();
  const orders = useOperationOrders();
  const index = useMemo<WorkOrderIndex>(() => {
    const poOrders = new Map<string, string[]>();
    for (const reg of demands.data?.registerRows ?? []) {
      for (const po of reg.pos) {
        const list = poOrders.get(po.poId) ?? [];
        if (!list.includes(reg.orderId)) list.push(reg.orderId);
        poOrders.set(po.poId, list);
      }
    }
    let windows: WorkOrderIndex["windows"] = [];
    if (demands.data && suppliers.data) {
      try {
        windows = poWindowWorkFromSoBatch(demands.data, (suppliers.data.suppliers ?? []) as never, { keepClosed: true });
      } catch {
        windows = [];
      }
    }
    const orderBySo = new Map<number, string>();
    const soByOrder = new Map<string, number>();
    for (const o of orders.data?.orders ?? []) {
      if (o.so == null) continue;
      orderBySo.set(Number(o.so), o.id);
      soByOrder.set(o.id, Number(o.so));
    }
    const orderFacts = new Map<string, { so: number | null; customer: string | null; requested: string | null }>();
    for (const reg of demands.data?.registerRows ?? []) {
      orderFacts.set(reg.orderId, { so: reg.so, customer: reg.customer, requested: reg.requestedDeliveryDate });
      if (reg.so != null && !soByOrder.has(reg.orderId)) {
        soByOrder.set(reg.orderId, reg.so);
        orderBySo.set(reg.so, reg.orderId);
      }
    }
    return { poOrders, orderBySo, soByOrder, orderFacts, windows };
  }, [demands.data, suppliers.data, orders.data]);
  return { index, loading: demands.isLoading || suppliers.isLoading || orders.isLoading };
}

export interface WorkOrderRoute {
  route: SalesOrderRouteMap | null;
  detail: RouteOrderDetail | null;
  loading: boolean;
  failed: boolean;
}

export function useWorkOrderRoute(orderId: string | null): WorkOrderRoute {
  const detailQ = useOperationOrder(orderId);
  const poIds = (detailQ.data?.pos ?? []).map((po) => po.id);
  const factsQ = useSalesOrderRouteFacts(orderId, Boolean(orderId) && Boolean(detailQ.data), poIds);
  const goodsTruthQ = useSalesOrderExpansion(orderId);
  const stops = detailQ.data?.order?.delivery_stops ?? [];
  const customerLeg = stops.length >= 2 ? Math.max(...stops.map((stop) => Number(stop.leg) || 0)) : 0;
  const partnerQ = useLogisticsCardFacts(orderId, customerLeg);
  /* The stored deadline settings the route's dates read (9 Oct 2026). */
  const collectionTiming = useOrderCollectionTiming(orderId);
  const deliveryDays = useDeliveryDays();
  const leads = useDeliveryLeads();
  const route = useMemo(() => {
    const detail = detailQ.data;
    const facts = factsQ.data;
    if (!orderId || !detail?.order || !facts) return null;
    /* The Sales Order page's object-mode money, the same two sums (Law D). */
    const price = (r: { unit_price?: number | string | null; qty?: number | string | null }) =>
      Number(r.unit_price ?? 0) * Number(r.qty ?? 0);
    const money = orderMoney({
      lineSum: detail.lines.reduce((s, l) => s + price(l), 0),
      addonSum: (detail.addons ?? []).reduce((s, a) => s + price(a), 0),
      paid: detail.order.paid,
      controlBalance: null,
    });
    return resolveSalesOrderRoute(
      salesOrderRouteInputOf({
        orderId,
        detail: detail as RouteOrderDetail,
        facts,
        caseStatus: new Map(),
        deliverToLines: goodsTruthQ.data?.lines,
        /* Work draws no cancelled-line lane and no change band. */
        cancelledLines: [],
        money: { known: money.known, outstanding: money.outstanding },
        outstation: isOutstation(partnerQ.data?.partner),
        paymentTiming: collectionTiming,
        deliveryHolidays: deliveryDays.holidays,
        assignLeadWorkingDays: leads.assignmentLeadWorkingDays,
        amendment: null,
        amendmentFailed: false,
      }),
    );
  }, [orderId, detailQ.data, factsQ.data, goodsTruthQ.data, partnerQ.data, collectionTiming, deliveryDays, leads]);
  return {
    route,
    detail: (detailQ.data?.order ? detailQ.data : null) as RouteOrderDetail | null,
    loading: detailQ.isLoading || factsQ.isLoading,
    failed: detailQ.isError || factsQ.isError,
  };
}
