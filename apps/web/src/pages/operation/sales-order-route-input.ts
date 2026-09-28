/**
 * THE SALES ORDER ROUTE INPUT — built in ONE place (Law D).
 *
 * The Sales Order page's Order Route and the Work page's route stops
 * (Workspace MASTER §5.10: "stops = the Sales Order Order Route nodes") read
 * the same owners' facts through this one function, so the two screens can
 * never draw two different routes for one order. The Sales Order page adds the
 * change-request band; Work draws no band and passes none.
 */
import {
  deliveryReasonLabel,
  lineKind,
  myHolidaySet,
  receivingRecordNo,
  routeDeliveryScopesOf,
  routeGoodsLinesOf,
  supplierClaimStatusLabel,
  type SalesOrderRouteInput,
} from "@carres/shared";
import { appTodayIso } from "@/lib/fmt-date";
import { displayCustomerName } from "@/lib/customer-name";
import type { SalesOrderRouteFactsResponse, useOperationOrder, useSalesOrderExpansion } from "@/lib/queries";

export type RouteOrderDetail = NonNullable<ReturnType<typeof useOperationOrder>["data"]> & {
  order: NonNullable<NonNullable<ReturnType<typeof useOperationOrder>["data"]>["order"]>;
};

export interface SalesOrderRouteInputArgs {
  orderId: string;
  detail: RouteOrderDetail;
  facts: SalesOrderRouteFactsResponse;
  /** Service's own translated status word per case id. */
  caseStatus: Map<string, string | null>;
  /** Purchasing's Deliver To per SKU (`useSalesOrderExpansion` lines). */
  deliverToLines: NonNullable<ReturnType<typeof useSalesOrderExpansion>["data"]>["lines"] | undefined;
  cancelledLines: NonNullable<SalesOrderRouteInput["cancelledLines"]>;
  money: { known: boolean; outstanding: number };
  /** The assigned company is not a Klang Valley default. */
  outstation: boolean;
  amendment: SalesOrderRouteInput["amendment"];
  amendmentFailed: boolean;
}

export function salesOrderRouteInputOf(a: SalesOrderRouteInputArgs): SalesOrderRouteInput {
  return {
      order: {
        id: a.orderId,
        so: a.detail.order.so,
        customerName: displayCustomerName(a.detail.order.customer_name),
        placedAt: a.detail.order.placed_at,
        deliveryDate: a.detail.order.delivery_date,
        deliveredAt: a.detail.order.delivered_at,
      },
      lineLabels: Object.fromEntries(a.detail.lines.map((line) => [line.sku, line.label?.trim() || line.sku])),
      /* Deliver To is PURCHASING's answer, quantity split included. Sales
         Order stores neither the destination nor its split, so the Route
         reads it and never infers one. */
      lineDestinations: Object.fromEntries(
        (a.deliverToLines ?? []).map((line) => [line.sku, line.deliverTo]),
      ),
      cancelledLines: a.cancelledLines,
      /* ⭐ THE GOODS CHAIN READS ITS OWNERS (owner ruling 2026-09-26): the
         `po_line_sources` lineage, the supplier's newest evidenced answer, the
         posted receipts and the Units bound to each line — arranged by the
         shared `routeGoodsLinesOf`. A service line moves no Unit and draws no
         goods lane. */
      goods: a.facts.goods
        ? routeGoodsLinesOf({
            ...a.facts.goods,
            todayIso: appTodayIso(),
            holidays: myHolidaySet(),
            lines: a.facts.goods.lines
              .filter((line) => lineKind(line.sku) !== "service")
              .map((line) => ({
                ...line,
                qty: Number(line.qty),
                label:
                  a.detail.lines.find((row) => row.id === line.id)?.label?.trim() ||
                  a.detail.lines.find((row) => row.sku === line.sku)?.label?.trim() ||
                  line.sku,
              })),
          })
        : undefined,
      allocation: a.facts.allocation,
      purchaseOrders: a.detail.pos.map((po) => ({
        id: po.id,
        issuedAt: po.placed_at ? po.placed_at.slice(0, 10) : null,
        expectedReadyDate: po.expected_ready_date ?? null,
        lines: po.lines.map((line) => ({
          sku: line.sku,
          qty: Number(line.qty),
          receivedQty: Number(line.received_qty),
        })),
      })),
      receivingRecords: a.facts.receiving.map((record) => ({
        id: record.id,
        recordNo: receivingRecordNo({
          id: record.id,
          goods_received_at: record.goods_received_at ?? undefined,
          submitted_at: record.submitted_at,
        }),
        poId: record.po_id,
        receivedAt: record.goods_received_at,
      })),
      delivery: {
        /* ⭐ DELIVERY'S OWN RECORDS, ONE SCOPE PER LANE (owner ruling
           2026-09-26). The arrangement, the live Delivery Order, its attempts,
           its handover facts and the photos bound to its number — arranged by
           the shared `routeDeliveryScopesOf`. The V1 booking fields below are
           only the fallback for an order Delivery has recorded nothing on. */
        scopes: a.facts.delivery
          ? routeDeliveryScopesOf({
              stops: a.detail.order.delivery_stops ?? [],
              arrangements: a.facts.delivery.arrangements,
              deliveryOrders: a.facts.delivery.deliveryOrders,
              attempts: a.facts.delivery.attempts,
              handoverEvents: a.facts.delivery.handoverEvents,
              photos: a.detail.control?.delivery_photos ?? [],
              lines: a.detail.lines.map((line) => ({ sku: line.sku, qty: Number(line.qty) })),
              fallbackPartnerName: a.facts.brief?.assignedLogistics?.partnerName ?? null,
              fallbackConfirmedDate: a.facts.brief?.appointment?.dateIso ?? null,
              fallbackConfirmedTime: a.facts.brief?.appointment?.slot ?? null,
            })
          : undefined,
        /* Payment must be complete 3 working days before an outstation
           delivery, 2 in the Klang Valley — the Work panel's own reading of
           the partner (Law D). */
        outstation: a.outstation,
        /* The document's own number (0356/Law D) — the gate stops depending on
           an attempt existing before it can print the number the system
           already minted. */
        doNumber: a.detail.order.do_number ?? null,
        /* Delivery's own answer about who carries this order — the LOGISTICS
           node never infers a company from the region default. */
        logistics: a.facts.brief?.assignedLogistics
          ? { partnerName: a.facts.brief.assignedLogistics.partnerName }
          : null,
        booking: a.facts.brief?.appointment
          ? {
              confirmedDate: a.facts.brief.appointment.dateIso,
              slot: a.facts.brief.appointment.slot,
              scope: a.facts.brief.appointment.scope,
            }
          : null,
        /* `ops_order_control.delivery_photos` (0280) — the ledger the
           `Upload delivery photo` queue already counts. */
        photos: (a.detail.control?.delivery_photos ?? []).map((photo) => ({
          at: photo.at ?? null,
          by: photo.by ?? null,
        })),
        attempts: a.facts.attempts.map((attempt) => ({
          id: attempt.id,
          attemptNo: attempt.attempt_no,
          result: attempt.result,
          reason: attempt.reason_key ? deliveryReasonLabel(attempt.reason_key) : attempt.note,
          doNumber: attempt.do_number,
          scheduledDate: attempt.scheduled_date,
          recordedAt: attempt.recorded_at,
        })),
      },
      /* Straight from the ONE arithmetic (§8): what is known and what is owed.
         Under the 2026-08-19 ruling the outstanding figure is a GATE input
         again — money in full before delivery, or an approved COD. */
      money: {
        known: a.money.known,
        outstanding: a.money.outstanding,
      },
      /* The two money records (0355 + 0362) — the same tables the server-side
         gate reads, so the canvas cannot lie about the refusal. */
      financeExceptions: (a.facts.financeExceptions ?? []).map((row) => ({
        id: row.id,
        status: row.status,
        reason: row.reason,
      })),
      paymentApprovals: (a.facts.paymentApprovals ?? []).map((row) => ({
        id: row.id,
        status: row.status,
      })),
      cases: a.facts.cases.map((item) => ({
        id: item.id,
        caseNo: item.caseNo,
        statusLabel: a.caseStatus.get(item.id) ?? null,
        closed: item.statusIsClosed,
      })),
      claims: a.facts.claims.map((item) => ({
        id: item.id,
        claimNo: item.claim_no,
        statusLabel: supplierClaimStatusLabel(item.status),
        closed: item.status === "closed",
      })),
      /* Card 6 — an INDEPENDENT obligation. It renders only while an item is
         out, and it never blocks the delivery. */
      loans: a.facts.loans.map((loan) => ({
        id: loan.id,
        label: loan.borrowed_label?.trim() || loan.item_sku || loan.borrowed_sku || "item",
        qty: 1,
        returned: loan.status === "returned",
        unitId: loan.item_unit_code ?? null,
      })),
      /* 0492 (Card 15) — the offer conversation; the map prints the current
         state, the drawer keeps the history. */
      loanOffers: (a.facts.loanOffers ?? []).map((offer) => ({
        id: offer.id,
        seq: offer.seq,
        event: offer.event,
        label: offer.label,
        reason: offer.reason,
        recordedAt: offer.recorded_at,
      })),
      /* Sunday and Malaysian public holidays are the two days no company runs
         (§8) — the gate names the refused day instead of failing silently. */
      publicHolidays: [...myHolidaySet()],
      /* ⭐ A FAILED READ IS `unreadable`, NEVER A BUSINESS SENTENCE (owner
         ruling 2026-09-26). The group whose owner could not be read says so;
         every other group draws from its own read. */
      unreadable: {
        delivery: a.facts.failed.delivery,
        payments: a.facts.failed.payments,
        purchasing: a.facts.failed.purchasing,
        amendment: a.amendmentFailed,
      },
      /* `PROPOSED CHANGE` — the caller's own read; Work passes none. */
      amendment: a.amendment,
    };
}
