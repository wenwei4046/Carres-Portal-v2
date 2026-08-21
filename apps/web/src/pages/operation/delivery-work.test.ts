/**
 * DELIVERY WORK — the arithmetic, held as tests.
 *
 * Five properties, and every one of them is something the page cannot check
 * for itself once the numbers reach the screen:
 *
 *  1. A scope is a scope; a JOURNEY LEG is its own row and keeps its own
 *     partner, its own day and its own status.
 *  2. `Confirmed Delivery` has ONE arithmetic — the document first, then the
 *     confirmed booking, and a carrier's provisional date is never confirmed.
 *  3. The DELIVERY DATE rail orders itself `No confirmed date` → `Date passed`
 *     → real ascending days, and prints no relative day word.
 *  4. The LOGISTICS rail keeps the seven governed partners visible at zero and
 *     admits an ungoverned one only while it is carrying something.
 *  5. The two filters COMBINE.
 */
import { describe, it, expect } from "vitest";
import type { DeliveryOrderRow, operationOrderListRow } from "@/lib/queries";
import {
  buildDateRail,
  buildDeliveryScopeRows,
  buildLogisticsRail,
  confirmedDeliveryOf,
  dateBucketOf,
  legStatusOf,
  matchesDate,
  matchesLogistics,
  scopeFooter,
  DATE_PASSED_KEY,
  DW,
  GOVERNED_LOGISTICS,
  NO_DATE_KEY,
  NO_LOGISTICS_KEY,
} from "./delivery-work";

const TODAY = "2026-08-21";

function order(
  over: Partial<operationOrderListRow> & { id: string; so: number },
): operationOrderListRow {
  return {
    status: "proceed_order",
    operation_stage: "ready_to_dispatch",
    warehouse_id: null,
    customer_name: "kong chai yin",
    customer_phone: null,
    customer_address: null,
    placed_at: "2026-08-01T00:00:00Z",
    delivery_date: "2026-08-30",
    delivery_date_tbd: false,
    source_system: null,
    source_ref: null,
    ops_assigned_logistic: null,
    order_lines: [],
    delivery_partner_id: null,
    request_for_delivery_at: null,
    partner_accepted_at: null,
    partner_rejected_at: null,
    partner_rejected_reason: null,
    delivery_partners: null,
    do_number: null,
    dispatched_at: null,
    delivered_at: null,
    outlet_id: null,
    dealer_id: "d-1",
    dealers: { name: "Carres KL" },
    order_supplier_threads: [],
    order_annotations: [],
    ...over,
  };
}

const NO_PARTNERS = new Map<string, string>();

function build(orders: operationOrderListRow[], deliveryOrders: DeliveryOrderRow[] = []) {
  return buildDeliveryScopeRows({
    orders,
    deliveryOrders,
    attempts: [],
    handoverEvents: [],
    partnerNameById: NO_PARTNERS,
  });
}

describe("delivery scopes and journey legs", () => {
  it("gives a single-leg order exactly one row", () => {
    const rows = build([order({ id: "a", so: 1301 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.leg).toBeNull();
    expect(rows[0]!.key).toBe("a");
  });

  it("gives a Singapore Journey ONE ROW PER LEG, each with its own partner and day", () => {
    const rows = build([
      order({
        id: "b",
        so: 1302,
        delivery_stops: [
          {
            leg: 1,
            partner_id: "p-teow",
            partner_name: "TEOW",
            from_loc: "Klang WH",
            to_loc: "JB transit",
            scheduled_at: "2026-08-25T04:00:00.000Z",
            status: "picked_up",
          },
          {
            leg: 2,
            partner_id: "p-ssy",
            partner_name: "SSY",
            from_loc: "JB transit",
            to_loc: "Singapore customer",
            scheduled_at: "2026-08-27T04:00:00.000Z",
            status: "pending",
          },
        ],
      }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.leg)).toEqual([1, 2]);
    expect(rows.map((r) => r.logisticsName)).toEqual(["TEOW", "SSY"]);
    expect(rows.map((r) => r.confirmedIso)).toEqual(["2026-08-25", "2026-08-27"]);
    expect(rows[0]!.legRoute).toBe("Klang WH → JB transit");
    // Two rows of one order must never read as a duplicate.
    expect(rows[0]!.key).not.toBe(rows[1]!.key);
  });

  it("speaks a leg's status in the DOCUMENT's five words, never `Pending`", () => {
    expect(legStatusOf({ status: "pending" }).label).toBe(DW.noDeliveryOrder);
    expect(legStatusOf({ status: "picked_up" }).label).toBe("Out for delivery");
    // Leg 1 handing over at the named JB warehouse IS that leg's delivery.
    expect(legStatusOf({ status: "handed_off" }).label).toBe("Delivered");
    expect(legStatusOf({ status: "delivered" }).label).toBe("Delivered");
    expect(legStatusOf({ status: "issue" }).label).toBe("Delivery exception");
  });

  it("leaves a delivered order out — that is history, not planning", () => {
    const rows = build([
      order({ id: "c", so: 1303, status: "delivered", delivered_at: "2026-08-10T00:00:00Z" }),
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe("Confirmed Delivery has one arithmetic", () => {
  const doc = (over: Partial<DeliveryOrderRow>): DeliveryOrderRow => ({
    id: "do-1",
    do_number: "DO-210826-0001",
    issued_at: "2026-08-20T00:00:00Z",
    trip_groups: null,
    delivery_date: "2026-08-26",
    time_slot: "12pm–3pm",
    logistics_partner: "NETS",
    voided_at: null,
    void_reason: null,
    orders: { id: "a", so: 1301, customer_name: "x" },
    ...over,
  });

  it("prefers the DOCUMENT — that is what the warehouse and the partner work to", () => {
    const o = order({
      id: "a",
      so: 1301,
      ops_order_control: { booking_stage: "confirmed", confirmed_date: "2026-08-24" },
    });
    expect(confirmedDeliveryOf(o, doc({}))).toEqual({
      iso: "2026-08-26",
      time: "12pm–3pm",
    });
  });

  it("falls back to the CONFIRMED booking when no document exists", () => {
    const o = order({
      id: "a",
      so: 1301,
      ops_order_control: {
        booking_stage: "confirmed",
        confirmed_date: "2026-08-24",
        confirmed_time_slot: "9am–12pm",
      },
    });
    expect(confirmedDeliveryOf(o, null)).toEqual({ iso: "2026-08-24", time: "9am–12pm" });
  });

  it("never treats a carrier's provisional date as confirmed", () => {
    const o = order({
      id: "a",
      so: 1301,
      ops_order_control: { booking_stage: "provisional", logistic_eta: "2026-08-24" },
    });
    expect(confirmedDeliveryOf(o, null)).toEqual({ iso: null, time: null });
  });
});

describe("the DELIVERY DATE rail", () => {
  const rows = build([
    order({ id: "a", so: 1301 }),
    order({
      id: "b",
      so: 1302,
      ops_order_control: { booking_stage: "confirmed", confirmed_date: "2026-08-19" },
    }),
    order({
      id: "c",
      so: 1303,
      ops_order_control: { booking_stage: "confirmed", confirmed_date: "2026-08-25" },
    }),
    order({
      id: "d",
      so: 1304,
      ops_order_control: { booking_stage: "confirmed", confirmed_date: "2026-08-22" },
    }),
  ]);

  it("buckets a scope by its confirmed date, and a past date is `Date passed`", () => {
    expect(dateBucketOf(rows.find((r) => r.so === 1301)!, TODAY)).toBe(NO_DATE_KEY);
    expect(dateBucketOf(rows.find((r) => r.so === 1302)!, TODAY)).toBe(DATE_PASSED_KEY);
    expect(dateBucketOf(rows.find((r) => r.so === 1303)!, TODAY)).toBe("2026-08-25");
  });

  it("orders itself: no date, then passed, then real days ascending", () => {
    const rail = buildDateRail(rows, TODAY, (iso) => `printed:${iso}`);
    expect(rail.map((r) => r.label)).toEqual([
      DW.noConfirmedDate,
      DW.datePassed,
      "printed:2026-08-22",
      "printed:2026-08-25",
    ]);
    expect(rail.map((r) => r.count)).toEqual([1, 1, 1, 1]);
  });

  it("never prints a relative day word", () => {
    const rail = buildDateRail(rows, TODAY, (iso) => `printed:${iso}`);
    for (const item of rail) {
      expect(item.label).not.toMatch(/\bToday\b|\bTomorrow\b/i);
    }
  });
});

describe("the LOGISTICS rail", () => {
  it("keeps every governed partner visible at zero, in the ruled order", () => {
    const rail = buildLogisticsRail(build([order({ id: "a", so: 1301 })]), []);
    expect(rail.slice(0, 7).map((r) => r.label)).toEqual([...GOVERNED_LOGISTICS]);
    expect(rail.slice(0, 7).every((r) => r.count === 0)).toBe(true);
  });

  it("names the scopes nobody is carrying rather than hiding them under All", () => {
    const rail = buildLogisticsRail(build([order({ id: "a", so: 1301 })]), []);
    const none = rail.find((r) => r.key === NO_LOGISTICS_KEY);
    expect(none?.label).toBe(DW.noLogistics);
    expect(none?.count).toBe(1);
  });

  it("admits an ungoverned partner only while it is carrying something", () => {
    const partners = [
      { id: "p-tsdd", name: "TSDD" },
      { id: "p-quiet", name: "QUIET CO" },
    ];
    const rows = build([
      order({ id: "a", so: 1301, delivery_partners: { id: "p-tsdd", name: "TSDD" } }),
    ]);
    const rail = buildLogisticsRail(rows, partners);
    expect(rail.find((r) => r.label === "TSDD")?.count).toBe(1);
    expect(rail.find((r) => r.label === "QUIET CO")).toBeUndefined();
  });

  it("counts the NETS scopes assigned through triage, not only the formal ones", () => {
    const rows = buildDeliveryScopeRows({
      orders: [order({ id: "a", so: 1301, ops_assigned_logistic: "p-nets" })],
      deliveryOrders: [],
      attempts: [],
      handoverEvents: [],
      partnerNameById: new Map([["p-nets", "NETS"]]),
    });
    expect(buildLogisticsRail(rows, []).find((r) => r.label === "NETS")?.count).toBe(1);
  });
});

describe("the two filters combine", () => {
  const rows = build([
    order({
      id: "a",
      so: 1301,
      delivery_partners: { id: "p-nets", name: "NETS" },
      ops_order_control: { booking_stage: "confirmed", confirmed_date: "2026-08-25" },
    }),
    order({
      id: "b",
      so: 1302,
      delivery_partners: { id: "p-al", name: "AL" },
      ops_order_control: { booking_stage: "confirmed", confirmed_date: "2026-08-25" },
    }),
    order({
      id: "c",
      so: 1303,
      delivery_partners: { id: "p-nets", name: "NETS" },
      ops_order_control: { booking_stage: "confirmed", confirmed_date: "2026-08-26" },
    }),
  ]);

  it("asks ONE question of the date and the partner together", () => {
    const date = new Set(["2026-08-25"]);
    const logistics = new Set(["NETS"]);
    const shown = rows.filter(
      (r) => matchesDate(r, date, TODAY) && matchesLogistics(r, logistics),
    );
    expect(shown.map((r) => r.so)).toEqual([1301]);
  });

  it("treats an empty pick as every value, on both rails", () => {
    const none = new Set<string>();
    expect(rows.filter((r) => matchesDate(r, none, TODAY))).toHaveLength(3);
    expect(rows.filter((r) => matchesLogistics(r, none))).toHaveLength(3);
  });
});

describe("the footer counts scopes, never orders", () => {
  it("says so in the plural the number earns", () => {
    expect(scopeFooter(1, 1)).toBe("1 delivery scope");
    expect(scopeFooter(3, 3)).toBe("3 delivery scopes");
    expect(scopeFooter(2, 9)).toBe("2 of 9 delivery scopes");
  });
});
