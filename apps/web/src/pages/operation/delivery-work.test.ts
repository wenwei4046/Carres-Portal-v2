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
  isOpenDeliveryScope,
  requiredSalesFactsMissing,
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
    /* The required Sales facts (owner ruling 2026-09-13) — carried by the
       default fixture so each test is about the ONE thing it names. */
    delivery_floor: 0,
    delivery_has_lift: true,
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
    expect(rows.map((r) => r.location)).toEqual(["JB transit", "Singapore customer"]);
    // Two rows of one order must never read as a duplicate.
    expect(rows[0]!.key).not.toBe(rows[1]!.key);
  });

  it("does not substitute the customer address for an unnamed transfer destination", () => {
    const rows = build([order({ id: "missing-stop", so: 1303, delivery_stops: [
      { leg: 1, partner_id: "p-teow", partner_name: "TEOW", from_loc: "Klang WH", to_loc: "", status: "pending" },
      { leg: 2, partner_id: "p-ssy", partner_name: "SSY", from_loc: "", to_loc: "Customer", status: "pending" },
    ] })]);
    expect(rows[0]!.location).toBe("");
    expect(rows[1]!.location).toBe("Customer");
  });

  it("0491 — a leg with its OWN document takes the document's number, id and the shared ladder", () => {
    const stops = [
      { leg: 1, partner_id: "p-teow", partner_name: "TEOW", from_loc: "Klang WH", to_loc: "JB transit", scheduled_at: "2026-08-25T04:00:00.000Z", status: "pending" as const },
      { leg: 2, partner_id: "p-ssy", partner_name: "SSY", from_loc: "JB transit", to_loc: "Singapore customer", scheduled_at: "2026-08-27T04:00:00.000Z", status: "pending" as const },
    ];
    const legDoc: DeliveryOrderRow = {
      id: "do-leg-1",
      order_id: "b",
      do_number: "DO-250826-0001",
      leg: 1,
      issued_at: "2026-08-24T02:00:00Z",
      trip_groups: null,
      delivery_date: "2026-08-25",
      time_slot: null,
      logistics_partner: "TEOW",
      voided_at: null,
      void_reason: null,
      orders: { id: "b", so: 1302, customer_name: "kong chai yin" },
    };
    const rows = buildDeliveryScopeRows({
      orders: [order({ id: "b", so: 1302, delivery_stops: stops })],
      deliveryOrders: [legDoc],
      attempts: [],
      handoverEvents: [{ delivery_order_id: "do-leg-1", kind: "received_by_logistics", recorded_at: "2026-08-25T03:00:00Z" }],
      partnerNameById: NO_PARTNERS,
    });
    expect(rows.map((r) => r.doNumber)).toEqual(["DO-250826-0001", null]);
    expect(rows[0]!.deliveryOrderId).toBe("do-leg-1");
    /* The document's own handover facts speak: the partner collected. */
    expect(rows[0]!.status.kind).toBe("collected");
    expect(rows[0]!.receivedAt).toBe("2026-08-25T03:00:00Z");
    /* Leg 2, no document yet: the chain's own words. Its day is scheduled and
       no window is agreed, so the rung is the one that asks for the TIME
       (owner ruling 2026-09-14) — never the one that re-opens the day. */
    expect(rows[1]!.status.kind).toBe("confirm_time");
    expect(rows[1]!.status.label).toBe("Confirm delivery time");
  });

  it("speaks a leg's status in the shared ACTOR-FIRST words (§8.4), never `Pending`", () => {
    // One vocabulary across the workspace: a leg and a whole-order scope must
    // not be readable on two different scales.
    expect(legWorkStatusOf({ status: "pending" }, null).label).toBe("Operation must assign logistics");
    /* The ACT, never the actor (owner ruling 2026-09-14): the party is the
       row's Logistics field, and a leg speaks the same words as a scope. */
    expect(legWorkStatusOf({ status: "pending" }, null, "TEOW").label).toBe("Call customer");
    /* A day alone is still contact work — and it names the missing HALF. */
    expect(legWorkStatusOf({ status: "pending" }, "2026-08-25", "TEOW").label).toBe(
      "Confirm delivery time",
    );
    const booked = legWorkStatusOf({ status: "pending" }, "2026-08-25", "TEOW", "9am–12pm");
    expect(booked.label).toBe("Confirmed for Tue, 25 Aug");
    expect(booked.second).toBe("9am–12pm");
    expect(legWorkStatusOf({ status: "picked_up" }, null, "TEOW").label).toBe("Goods collected by TEOW");
    /* Leg 1 handing over at the named JB warehouse is that leg's ARRIVAL —
       the goods reached the stop, never the customer (Card 20). */
    const arrived = legWorkStatusOf({ status: "handed_off", to_loc: "JB transit warehouse" }, null);
    expect(arrived.kind).toBe("arrived");
    expect(arrived.label).toBe("Arrived");
    expect(arrived.second).toBe("JB transit warehouse");
    expect(arrived.tone).toBe("green");
    expect(legWorkStatusOf({ status: "handed_off" }, null).label).toBe("Arrived");
    expect(legWorkStatusOf({ status: "delivered" }, null).label).toBe("Delivered");
    expect(legWorkStatusOf({ status: "issue" }, null).label).toBe("Failed Delivery");
  });

  it("⭐ never prints the DOCUMENT's `Created` on a leg or a scope", () => {
    const rows = build([order({ id: "a", so: 1301 })]);
    expect(rows[0]!.status.label).not.toBe("Created");
    expect(rows[0]!.status.label).toBe("Operation must assign logistics");
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

  it("⭐ a scope with no building facts ENTERS as a data problem (owner ruling 2026-09-13)", () => {
    /* Only a missing ADDRESS keeps an order out of Monitor. Every other
       required Sales fact that is missing is named on the row: the status
       reads `Order details incomplete` and the brief names the fact. */
    const o = order({ id: "a", so: 1301, building_type: null, delivery_floor: null, delivery_has_lift: null });
    expect(entersDeliveryWork(o)).toBe(true);
    expect(deliveryEntryBlockers(o)).toContain(DW.blockerNoBuilding);
    expect(requiredSalesFactsMissing(o)).toEqual([
      DW.buildingNotRecorded,
      DW.floorNotRecorded,
      DW.liftNotRecorded,
    ]);
    const rows = build([o]);
    expect(rows[0]!.status.label).toBe("Order details incomplete");
    expect(rows[0]!.status.second).toBe(DW.buildingNotRecorded);
    expect(rows[0]!.missingFacts).toContain(DW.floorNotRecorded);
  });

  it("a complete row lacks nothing — the requested-date answer `not yet` counts as recorded", () => {
    expect(requiredSalesFactsMissing(order({ id: "a", so: 1301 }))).toEqual([]);
    expect(
      requiredSalesFactsMissing(order({ id: "a", so: 1301, delivery_date: null, delivery_date_tbd: true })),
    ).toEqual([]);
    expect(
      requiredSalesFactsMissing(order({ id: "a", so: 1301, delivery_date: null, delivery_date_tbd: false })),
    ).toContain(DW.requestedDateNotRecorded);
  });

  it("⭐ CARD 23 · refuses a CANCELLED order — the entry rule always said so", () => {
    /* Delivery MASTER §8.3's entry rule has named cancelled orders since
       2026-08-24. `isOpenDeliveryScope` only ever tested `delivered`, so
       every cancelled order carrying an address and goods walked in.
       Measured on production 2026-09-14: three of them, one a two-leg
       Journey contributing two rows. */
    const cancelled = order({ id: "x", so: 1399, status: "cancelled" });
    expect(isOpenDeliveryScope(cancelled)).toBe(false);
    expect(entersDeliveryWork(cancelled)).toBe(false);
  });

  it("⭐ CARD 23 · a delivered scope stays out, and an open one stays in", () => {
    expect(isOpenDeliveryScope(order({ id: "d", so: 1398, status: "delivered" }))).toBe(false);
    expect(
      isOpenDeliveryScope(
        order({ id: "d2", so: 1397, delivered_at: "2026-09-01T00:00:00Z" }),
      ),
    ).toBe(false);
    /* A trip still owing proof is NOT delivered-and-gone: the order stays
       open until its result is recorded, and the proof queues own it. */
    expect(isOpenDeliveryScope(order({ id: "o", so: 1396 }))).toBe(true);
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
      delivery_floor: null,
      delivery_has_lift: null,
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
    expect(rows[0]!.status.label).toBe("Confirmed for Fri, 28 Aug");
    expect(rows[0]!.status.second).toBe("9am–12pm");
    expect(rows[0]!.status.tone).toBe("green");
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

/* ── ⭐ ONE ADDRESS, ONE READING — owner correction 2026-09-14 ──────────────
 *
 * THE VERIFIED DEFECT, on production SO-1217 / TCF0541: one row said its
 * delivery location was `Not recorded`, said it was going to `Selangor`, said
 * `State not recorded` as its status, and carried a full Puchong address that
 * Operations could read in the brief below it. Four answers, one question,
 * three readers of the same address.
 *
 * Measured the same day over the 99 open scopes: 43 carry the structured
 * state, 46 carry only a written address (every AutoCount and rental order),
 * 10 carry no address at all. So 46 of the 89 addressed rows were warning
 * about a state their own `State` column was printing.
 *
 * All four now run `resolveDeliveryLocality`, and the STATE rail's population
 * is unchanged: replaying the old `customerRegionOf` against every one of the
 * 99 rows moved no row to a different bucket.
 */
describe("the location, the State and the warning read ONE address", () => {
  /** SO-1217 / TCF0541 exactly as production holds it. */
  const so1217 = () =>
    order({
      id: "tcf0541",
      so: 1217,
      source_ref: ["TCF0541"] as never,
      source_system: "autocount",
      customer_address:
        "31,JALAN BK8/2B,ANGGUN, RESIDENCE,BANDAR KINRARA,, 43300 PUCHONG,SELANGOR, Puchong, Selangor",
      customer_address_line1: null,
      customer_address_city: null,
      customer_address_state: null,
      customer_address_postcode: null,
      /* Building type is genuinely absent on this order; floor and lift are
         recorded, which is why it is delivery work at all. */
      building_type: null,
      delivery_floor: 1,
      delivery_has_lift: false,
      delivery_date: "2026-07-20",
      delivery_date_tbd: false,
    });

  it("⭐ SO-1217 no longer says Selangor and `State not recorded` at once", () => {
    const o = so1217();
    const row = build([o])[0]!;
    expect(row.location).toBe("Puchong, Selangor");
    expect(regionBucketOf(row)).toBe("Selangor");
    expect(requiredSalesFactsMissing(o)).not.toContain(DW.stateNotRecorded);
    expect(row.missingFacts).not.toContain(DW.stateNotRecorded);
  });

  it("⭐ SO-1217's genuinely missing Building type still warns", () => {
    /* Reading the state must not mark the whole order complete. The row stays
       `Order details incomplete`, now naming the fact that IS missing. */
    const o = so1217();
    const row = build([o])[0]!;
    expect(requiredSalesFactsMissing(o)).toEqual([DW.buildingNotRecorded]);
    expect(row.status.label).toBe("Order details incomplete");
    expect(row.status.second).toBe(DW.buildingNotRecorded);
  });

  it("the written address stays reachable behind the row", () => {
    /* The brief prints `row.o.customer_address` when no structured line
       exists; resolving a locality never replaces or rewrites it. */
    const o = so1217();
    expect(build([o])[0]!.o.customer_address).toBe(o.customer_address);
  });

  it("an address nothing resolves out of still warns, and is not called absent", () => {
    /* SO-1246 on production: `Tuai Timur, Setia Alam` names a township, not a
       state. Nothing is guessed, the warning survives — and the cell prints
       the address rather than the false word `Not recorded`. */
    const o = order({
      id: "ambiguous",
      so: 1246,
      customer_address: "Tuai Timur, Setia Alam",
      customer_address_city: null,
      customer_address_state: null,
    });
    const row = build([o])[0]!;
    expect(requiredSalesFactsMissing(o)).toContain(DW.stateNotRecorded);
    expect(regionBucketOf(row)).toBeNull();
    expect(row.location).toBe("Tuai Timur, Setia Alam");
    expect(row.location).not.toBe(DW.notRecorded);
  });

  it("a structured address is printed and bucketed from its own columns", () => {
    const o = order({ id: "structured", so: 1209 }); // Klang, Selangor fixture
    const row = build([o])[0]!;
    expect(row.location).toBe("Klang, Selangor");
    expect(regionBucketOf(row)).toBe("Selangor");
    expect(requiredSalesFactsMissing(o)).not.toContain(DW.stateNotRecorded);
  });

  it("conflicting fields: the recorded column wins over the written address", () => {
    /* SO-1319's shape — the written address still carries an older Selangor
       address while the columns say Kuala Lumpur. Location, bucket and
       warning all follow the explicit answer, so no two of them disagree. */
    const o = order({
      id: "conflict",
      so: 1319,
      customer_address:
        "21 Laksjlkaet, ARA DAMANSARA 47301 PJ, Petaling Jaya, Selangor, Kuala Lumpur 50200, Kuala Lumpur",
      customer_address_city: "Kuala Lumpur",
      customer_address_state: "Kuala Lumpur",
    });
    const row = build([o])[0]!;
    expect(row.location).toBe("Kuala Lumpur");
    expect(regionBucketOf(row)).toBe("Kuala Lumpur");
    expect(requiredSalesFactsMissing(o)).not.toContain(DW.stateNotRecorded);
  });

  it("an order with NO address at all is still Sales work, never a Monitor row", () => {
    /* The entry rule is untouched: reading an address that exists never
       admits an order that has none. */
    const o = order({
      id: "nothing",
      so: 1255,
      customer_address: null,
      customer_address_line1: null,
      customer_address_city: null,
      customer_address_state: null,
    });
    expect(entersDeliveryWork(o)).toBe(false);
    expect(deliveryEntryBlockers(o)).toContain(DW.blockerNoLocation);
    expect(build([o])).toEqual([]);
  });
});

/* ── 【DELIVERY】 CARD 20 — a Journey leg's arrival on Monitor ──────────────
   `Delivered` is the customer's word. Leg 1's `delivered` result on its own
   document is the goods reaching the JB warehouse: `Arrived` over the stop,
   green, no `Delivery photo not uploaded` line, no proof queue. */
describe("an intermediate leg's arrival reads Arrived on Monitor (Card 20)", () => {
  const stops = [
    { leg: 1, partner_id: "p-nets", partner_name: "NETS", from_loc: "Carres Klang Warehouse", to_loc: "JB transit warehouse", scheduled_at: "2026-09-15T02:00:00.000Z", status: "handed_off" },
    { leg: 2, partner_id: "p-al", partner_name: "AL", from_loc: "JB transit warehouse", to_loc: "Customer (Singapore)", scheduled_at: "2026-09-17T06:00:00.000Z", status: "pending" },
  ] as never;
  const legDoc: DeliveryOrderRow = {
    id: "do-leg-1",
    order_id: "sg",
    do_number: "DO-130926-0842",
    leg: 1,
    issued_at: "2026-09-13T02:00:00Z",
    trip_groups: null,
    delivery_date: "2026-09-15",
    time_slot: "10 AM to 1 PM",
    logistics_partner: "NETS",
    voided_at: null,
    void_reason: null,
    orders: { id: "sg", so: 1362, customer_name: "kong chai yin", ops_order_control: { delivery_photos: [] } },
  } as unknown as DeliveryOrderRow;
  const chain = ["ready_for_handover", "handed_over", "received_by_logistics"].map((kind) => ({
    delivery_order_id: "do-leg-1",
    kind,
    recorded_at: "2026-09-13T03:00:00Z",
  })) as never;

  it("with its own document and a delivered result, leg 1 is Arrived over the JB warehouse; leg 2 keeps its own word", () => {
    const rows = buildDeliveryScopeRows({
      orders: [order({ id: "sg", so: 1362, delivery_stops: stops })],
      deliveryOrders: [legDoc],
      attempts: [{ do_number: "DO-130926-0842", leg: 1, result: "delivered", reason_key: null, recorded_at: "2026-09-13T04:23:00Z" }],
      handoverEvents: chain,
      partnerNameById: NO_PARTNERS,
    });
    expect(rows[0]!.status.kind).toBe("arrived");
    expect(rows[0]!.status.label).toBe("Arrived");
    expect(rows[0]!.status.second).toBe("JB transit warehouse");
    expect(rows[0]!.status.tone).toBe("green");
    expect(rows[0]!.missingProof).toEqual({ photo: false, signedDo: false });
    expect(rows[0]!.proofReview.state).toBe("none");
    expect(rows[1]!.status.kind).not.toBe("arrived");
    expect(rows[1]!.status.kind).not.toBe("delivered");
  });

  it("without a document, a chain stop already handed off reads Arrived over its stop too", () => {
    const rows = build([order({ id: "sg", so: 1362, delivery_stops: stops })]);
    expect(rows[0]!.status.kind).toBe("arrived");
    expect(rows[0]!.status.second).toBe("JB transit warehouse");
  });
});
