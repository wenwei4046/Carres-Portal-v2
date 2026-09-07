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
 *  3. The DELIVERY DATE rail orders itself `No confirmed date` → `Overdue`
 *     → real ascending days, and prints no relative day word.
 *  4. The LOGISTICS rail keeps the seven governed partners visible at zero and
 *     admits an ungoverned one only while it is carrying something.
 *  5. The two filters COMBINE.
 */
import { describe, it, expect } from "vitest";
import type { DeliveryOrderRow, operationOrderListRow } from "@/lib/queries";
import {
  buildDeliveryScopeRows,
  confirmedDeliveryOf,
  legWorkStatusOf,
  entersDeliveryWork,
  deliveryEntryBlockers,
  regionBucketOf,
  SINGAPORE_KEY,
  DW,
  } from "./delivery-work";

function order(
  over: Partial<operationOrderListRow> & { id: string; so: number },
): operationOrderListRow {
  return {
    status: "proceed_order",
    operation_stage: "ready_to_dispatch",
    warehouse_id: null,
    customer_name: "kong chai yin",
    customer_phone: null,
    /* THE ENTRY RULE (owner ruling 2026-08-24) — a scope needs a place, the
       building facts and goods before it is delivery work at all. The default
       fixture carries all three so each test below is about the ONE thing it
       names; the entry-rule suite overrides them deliberately. */
    customer_address: "12 Jalan Sekolah, 41000 Klang, Selangor",
    customer_address_city: "Klang",
    customer_address_state: "Selangor",
    building_type: "Landed",
    placed_at: "2026-08-01T00:00:00Z",
    delivery_date: "2026-08-30",
    delivery_date_tbd: false,
    source_system: null,
    source_ref: null,
    ops_assigned_logistic: null,
    order_lines: [{ id: "l-1", sku: "mattress:M1401F-K", qty: 1 }],
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

  it("speaks a leg's status in the SEVEN OPERATIONAL words, never `Pending`", () => {
    // One vocabulary across the workspace: a leg and a whole-order scope must
    // not be readable on two different scales.
    expect(legWorkStatusOf({ status: "pending" }, null).label).toBe("Waiting for customer date");
    expect(legWorkStatusOf({ status: "pending" }, "2026-08-25").label).toBe("Delivery confirmed");
    expect(legWorkStatusOf({ status: "picked_up" }, null).label).toBe("Out for delivery");
    // Leg 1 handing over at the named JB warehouse IS that leg's delivery.
    expect(legWorkStatusOf({ status: "handed_off" }, null).label).toBe("Delivered");
    expect(legWorkStatusOf({ status: "delivered" }, null).label).toBe("Delivered");
    expect(legWorkStatusOf({ status: "issue" }, null).label).toBe("Failed Delivery");
  });

  it("⭐ never prints the DOCUMENT's `Created` on a leg or a scope", () => {
    const rows = build([order({ id: "a", so: 1301 })]);
    expect(rows[0]!.status.label).not.toBe("Created");
    expect(rows[0]!.status.label).toBe("Waiting for customer date");
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

describe("the entry rule keeps Sales work out of Delivery Work", () => {
  it("admits a scope carrying a place, the building facts and goods", () => {
    expect(entersDeliveryWork(order({ id: "a", so: 1301 }))).toBe(true);
    expect(build([order({ id: "a", so: 1301 })])).toHaveLength(1);
  });

  it("refuses a scope with NO delivery address — that is Sales work", () => {
    const o = order({
      id: "a",
      so: 1301,
      customer_address: null,
      customer_address_city: null,
      customer_address_state: null,
      customer_address_line1: null,
    });
    expect(entersDeliveryWork(o)).toBe(false);
    expect(build([o])).toHaveLength(0);
    expect(deliveryEntryBlockers(o)).toContain(DW.blockerNoLocation);
  });

  it("accepts a written address even when the structured locality is empty", () => {
    // An AutoCount order often carries only the free-text address; refusing it
    // would throw away real delivery work over a data-entry shape.
    const o = order({
      id: "a",
      so: 1301,
      customer_address_city: null,
      customer_address_state: null,
      customer_address: "12 Jalan Sekolah, 41000 Klang",
    });
    expect(entersDeliveryWork(o)).toBe(true);
  });

  it("refuses a scope with no building or access facts", () => {
    const o = order({ id: "a", so: 1301, building_type: null });
    expect(entersDeliveryWork(o)).toBe(false);
    expect(deliveryEntryBlockers(o)).toContain(DW.blockerNoBuilding);
  });

  it("accepts floor or lift as the building facts when `building_type` predates the field", () => {
    expect(entersDeliveryWork(order({ id: "a", so: 1301, building_type: null, delivery_floor: 3 })))
      .toBe(true);
    expect(
      entersDeliveryWork(
        order({ id: "a", so: 1301, building_type: null, delivery_has_lift: false }),
      ),
    ).toBe(true);
  });

  it("⭐ refuses an order whose only line is a SERVICE — a truck carries goods", () => {
    const o = order({
      id: "a",
      so: 1301,
      order_lines: [{ id: "l-1", sku: "DELIVERY", qty: 1 }],
    });
    expect(entersDeliveryWork(o)).toBe(false);
    expect(deliveryEntryBlockers(o)).toContain(DW.blockerNoGoods);
  });

  it("admits an order carrying goods AND a service", () => {
    expect(
      entersDeliveryWork(
        order({
          id: "a",
          so: 1301,
          order_lines: [
            { id: "l-1", sku: "DELIVERY", qty: 1 },
            { id: "l-2", sku: "mattress:M1401F-K", qty: 1 },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("names every missing fact at once rather than one per visit", () => {
    const o = order({
      id: "a",
      so: 1301,
      customer_address: null,
      customer_address_city: null,
      customer_address_state: null,
      building_type: null,
      order_lines: [],
    });
    expect(deliveryEntryBlockers(o)).toHaveLength(3);
  });
});

/**
 * ⭐ DELIVERY'S OWN ARRANGEMENT (0379) OUTRANKS THE SALES COLUMN.
 */
describe("the arrangement is what Delivery wrote", () => {
  const arrangement = (over: Partial<import("@carres/shared").DeliveryArrangementRow> = {}) => ({
    id: "arr-1",
    order_id: "a",
    leg: 0,
    partner_id: "p-al",
    partner_name: "AL",
    confirmed_date: null,
    confirmed_time: null,
    expected_arrival: null,
    logistics_note: null,
    reply_proof_path: null,
    driver_name: null,
    vehicle: null,
    updated_at: "2026-08-24T00:00:00Z",
    updated_by: null,
    ...over,
  });

  it("prefers the arrangement's partner over the order's column", () => {
    const rows = buildDeliveryScopeRows({
      orders: [order({ id: "a", so: 1301, delivery_partners: { id: "p-nets", name: "NETS" } })],
      deliveryOrders: [],
      attempts: [],
      handoverEvents: [],
      partnerNameById: NO_PARTNERS,
      arrangements: new Map([["a#0", arrangement()]]),
    });
    expect(rows[0]!.logisticsName).toBe("AL");
    expect(rows[0]!.hasArrangement).toBe(true);
  });

  it("falls back to the order's column while no arrangement exists — nothing vanishes on day one", () => {
    const rows = build([
      order({ id: "a", so: 1301, delivery_partners: { id: "p-nets", name: "NETS" } }),
    ]);
    expect(rows[0]!.logisticsName).toBe("NETS");
    expect(rows[0]!.hasArrangement).toBe(false);
  });

  it("takes the arrangement's confirmed date and time", () => {
    const rows = buildDeliveryScopeRows({
      orders: [order({ id: "a", so: 1301 })],
      deliveryOrders: [],
      attempts: [],
      handoverEvents: [],
      partnerNameById: NO_PARTNERS,
      arrangements: new Map([
        ["a#0", arrangement({ confirmed_date: "2026-08-28", confirmed_time: "9am–12pm" })],
      ]),
    });
    expect(rows[0]!.confirmedIso).toBe("2026-08-28");
    expect(rows[0]!.confirmedTime).toBe("9am–12pm");
    expect(rows[0]!.status.label).toBe("Delivery confirmed");
  });

  it("gives each Journey LEG its own arrangement", () => {
    const rows = buildDeliveryScopeRows({
      orders: [
        order({
          id: "a",
          so: 1301,
          delivery_stops: [
            { leg: 1, partner_id: "p-1", partner_name: "TEOW", from_loc: "Klang", to_loc: "JB", status: "pending" },
            { leg: 2, partner_id: "p-2", partner_name: "SSY", from_loc: "JB", to_loc: "SG", status: "pending" },
          ],
        }),
      ],
      deliveryOrders: [],
      attempts: [],
      handoverEvents: [],
      partnerNameById: NO_PARTNERS,
      arrangements: new Map([["a#2", arrangement({ leg: 2, partner_name: "EU", partner_id: "p-eu" })]]),
    });
    // Leg 1 keeps the chain's own carrier; only leg 2 was re-arranged.
    expect(rows.map((r) => r.logisticsName)).toEqual(["TEOW", "EU"]);
  });
});


describe("REGION classification — direct state names (owner correction 2026-09-06)", () => {
  it("classifies a whole-order scope by its address state", () => {
    const rows = build([order({ id: "a", so: 1301 })]); // Selangor fixture
    expect(regionBucketOf(rows[0]!)).toBe("Selangor");
  });

  it("a Singapore journey: leg 1 counts under Johor, leg 2 under Singapore", () => {
    const rows = build([
      order({
        id: "sg",
        so: 1400,
        customer_address: "1 Orchard Rd, Singapore",
        customer_address_city: "Singapore",
        customer_address_state: null as never,
        delivery_stops: [
          {
            leg: 1,
            partner_id: "p-teow",
            partner_name: "TEOW",
            from_loc: "Klang WH",
            to_loc: "JB transit",
            scheduled_at: "2026-08-25T04:00:00.000Z",
            status: "pending",
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
        ] as never,
      }),
    ]);
    const leg1 = rows.find((r) => r.leg === 1)!;
    const leg2 = rows.find((r) => r.leg === 2)!;
    expect(regionBucketOf(leg1)).toBe("Johor");
    expect(regionBucketOf(leg2)).toBe(SINGAPORE_KEY);
  });


});
