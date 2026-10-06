import { describe, expect, it } from "vitest";
import { routeDeliveryScopesOf, type RouteScopeFacts } from "./sales-order-route-scopes";

const facts = (over: Partial<RouteScopeFacts> = {}): RouteScopeFacts => ({
  stops: [],
  arrangements: [],
  deliveryOrders: [],
  attempts: [],
  handoverEvents: [],
  photos: [],
  lines: [{ sku: "MS12 Firmcare 10inch Queen", qty: 1 }],
  fallbackPartnerName: null,
  fallbackConfirmedDate: null,
  fallbackConfirmedTime: null,
  ...over,
});

const doc = (over: Record<string, unknown> & { id: string; do_number: string }) => ({
  leg: 0,
  trip: 0,
  trip_groups: null,
  delivery_date: null,
  time_slot: null,
  logistics_partner: null,
  voided_at: null,
  ...over,
});

describe("an ordinary order is one scope", () => {
  it("reads Delivery's own arrangement before the order's fallback", () => {
    const [scope, ...rest] = routeDeliveryScopesOf(
      facts({
        arrangements: [{ leg: 0, partner_name: "NETS", confirmed_date: "2026-09-30", confirmed_time: null }],
        fallbackPartnerName: "AL",
        fallbackConfirmedDate: "2026-09-25",
      }),
    );
    expect(rest).toHaveLength(0);
    expect(scope).toMatchObject({
      leg: 0,
      trip: 0,
      plate: null,
      transfer: false,
      partnerName: "NETS",
      confirmedDate: "2026-09-30",
      deliveryOrder: null,
    });
  });

  it("falls back to the order's own fields when Delivery recorded nothing, and never invents", () => {
    expect(routeDeliveryScopesOf(facts({ fallbackPartnerName: "AL", fallbackConfirmedDate: "2026-09-25", fallbackConfirmedTime: "12pm–3pm" }))[0]).toMatchObject({
      partnerName: "AL",
      confirmedDate: "2026-09-25",
      confirmedTime: "12pm–3pm",
    });
    expect(routeDeliveryScopesOf(facts())[0]).toMatchObject({ partnerName: null, confirmedDate: null });
  });

  it("the live document wins the date, a voided one is not this scope's document", () => {
    const [scope] = routeDeliveryScopesOf(
      facts({
        arrangements: [{ leg: 0, partner_name: "NETS", confirmed_date: "2026-09-30", confirmed_time: null }],
        deliveryOrders: [
          doc({ id: "old", do_number: "DO2609-0001", delivery_date: "2026-09-20", voided_at: "2026-09-19T00:00:00Z" }),
          doc({ id: "live", do_number: "DO2609-4827", delivery_date: "2026-10-02", time_slot: "2 PM to 5 PM" }),
        ],
        attempts: [
          { do_number: "DO2609-0001", result: "failed", reason_key: "customer_not_home", recorded_at: "2026-09-20T05:00:00Z" },
          { do_number: "DO2609-4827", result: "delivered", reason_key: null, recorded_at: "2026-10-02T05:00:00Z" },
        ],
        handoverEvents: [{ delivery_order_id: "live", kind: "received_by_logistics", recorded_at: "2026-10-02T01:00:00Z" }],
        photos: [
          { at: "2026-10-02", by: "Ali", doNumber: "DO2609-4827" },
          { at: "2026-09-20", by: "Ali", doNumber: "DO2609-0001" },
        ],
      }),
    );
    expect(scope!.deliveryOrder).toEqual({ id: "live", number: "DO2609-4827" });
    expect(scope!.confirmedDate).toBe("2026-10-02");
    expect(scope!.confirmedTime).toBe("2 PM to 5 PM");
    expect(scope!.attempts.map((a) => a.result)).toEqual(["delivered"]);
    expect(scope!.handoverEvents).toEqual([{ kind: "received_by_logistics", recordedAt: "2026-10-02T01:00:00Z" }]);
    expect(scope!.photos).toEqual([{ at: "2026-10-02", by: "Ali" }]);
  });
});

describe("a Delivery Journey is one scope per leg", () => {
  const stops = [
    { leg: 1, partner_name: "NETS", from_loc: "Carres Klang", to_loc: "JB transit warehouse", scheduled_at: "2026-09-15T02:00:00Z" },
    { leg: 2, partner_name: "AL", from_loc: "JB transit warehouse", to_loc: "Customer", scheduled_at: null },
  ];

  it("names each leg by its two places, marks the transfer, and gives each leg its own document", () => {
    const scopes = routeDeliveryScopesOf(
      facts({
        stops,
        arrangements: [{ leg: 2, partner_name: "AL", confirmed_date: "2026-09-17", confirmed_time: "2 PM to 5 PM" }],
        deliveryOrders: [
          doc({ id: "d1", do_number: "DO-130926-0842", leg: 1 }),
          doc({ id: "d2", do_number: "DO-130926-3223", leg: 2 }),
        ],
        attempts: [{ do_number: "DO-130926-0842", result: "delivered", reason_key: null, recorded_at: "2026-09-13T04:00:00Z" }],
      }),
    );
    expect(scopes.map((s) => s.plate)).toEqual([
      "Leg 1 · Carres Klang → JB transit warehouse",
      "Leg 2 · JB transit warehouse → customer",
    ]);
    expect(scopes.map((s) => s.transfer)).toEqual([true, false]);
    expect(scopes[0]).toMatchObject({ legStop: "JB transit warehouse", partnerName: "NETS", confirmedDate: "2026-09-15" });
    expect(scopes[1]).toMatchObject({ partnerName: "AL", confirmedDate: "2026-09-17", confirmedTime: "2 PM to 5 PM" });
    expect(scopes.map((s) => s.deliveryOrder?.number)).toEqual(["DO-130926-0842", "DO-130926-3223"]);
    expect(scopes[0]!.attempts).toHaveLength(1);
    expect(scopes[1]!.attempts).toHaveLength(0);
  });

  it("one recorded stop is not a Journey — the Delivery page's own rule", () => {
    expect(routeDeliveryScopesOf(facts({ stops: [stops[0]!] }))).toHaveLength(1);
    expect(routeDeliveryScopesOf(facts({ stops: [stops[0]!] }))[0]!.plate).toBeNull();
  });
});

describe("a split delivery is one scope per trip", () => {
  const lines = [
    { sku: "MS12 Firmcare 10inch Queen", qty: 1 },
    { sku: "SF03 Muro 2 Seater", qty: 2 },
  ];

  it("names what each trip carries, and the goods no trip carries yet are a trip not booked", () => {
    const scopes = routeDeliveryScopesOf(
      facts({
        lines,
        deliveryOrders: [
          doc({ id: "t1", do_number: "DO2609-1001", trip: 1, trip_groups: ["bed"], delivery_date: "2026-09-22", logistics_partner: "NETS" }),
        ],
      }),
    );
    expect(scopes.map((s) => s.plate)).toEqual(["Trip 1 · Bed set, 1 item", "Trip 2 · not booked yet"]);
    expect(scopes[0]).toMatchObject({ trip: 1, tripGroups: ["bed"], partnerName: "NETS", confirmedDate: "2026-09-22" });
    expect(scopes[1]).toMatchObject({ trip: 2, tripGroups: ["sofa"], partnerName: null, confirmedDate: null, deliveryOrder: null });
  });

  it("two booked trips leave no third lane", () => {
    const scopes = routeDeliveryScopesOf(
      facts({
        lines,
        deliveryOrders: [
          doc({ id: "t1", do_number: "DO2609-1001", trip: 1, trip_groups: ["bed"] }),
          doc({ id: "t2", do_number: "DO2609-1002", trip: 2, trip_groups: ["sofa"] }),
        ],
      }),
    );
    expect(scopes.map((s) => s.plate)).toEqual(["Trip 1 · Bed set, 1 item", "Trip 2 · Sofa, 2 items"]);
  });
});
