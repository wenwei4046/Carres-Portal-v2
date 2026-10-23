import { describe, expect, it } from "vitest";
import { fillTimeSlots, planRows, proposeDates, tripsOf, type PlanFeed } from "./delivery-planning";

// Weisiang's decision (Mr Lim, WhatsApp 2026-10-22): Delivery Planning,
// Auto-schedule and Trips the Houzs way. Jess was not part of this decision.

const order = (id: string, so: number, state: string, requested: string | null, building = "Condo") => ({
  id, so, customer_name: `C${so}`, customer_address: null, customer_address_line1: null,
  customer_address_city: null, customer_address_state: state, customer_address_postcode: null,
  delivery_date: requested, delivery_date_tbd: false, entry_data: { fields: { building_type: building } },
});

const feed: PlanFeed = {
  orders: [
    order("a", 1, "Selangor", "2030-01-07"),
    order("b", 2, "Selangor", "2030-01-07"),
    order("c", 3, "Johor", "2030-01-05", "Landed"),
    order("d", 4, "Selangor", null),
  ],
  arrangements: [
    { order_id: "d", leg: 0, partner_id: null, confirmed_date: "2030-01-07", planned_date: "2030-01-07", stop_seq: 1, time_slot: null, vehicle: "Lorry 1" },
    { order_id: "c", leg: 0, partner_id: "nets", confirmed_date: null, planned_date: null, stop_seq: null, time_slot: null, vehicle: null },
  ],
  deliveryOrders: [{ order_id: "a", leg: 0, do_number: "DO2601-0001" }],
  regions: [
    { state: "Selangor", region: "Klang Valley", per_day: 2 },
    { state: "Johor", region: "Southern", per_day: 5 },
  ],
  residenceRules: [{ building_type: "Condo", note: "Half-day slot only." }],
  companies: [{ id: "nets", name: "NETS" }],
};

describe("Delivery Planning rows", () => {
  it("names region, residence rule, DO and carrier for each delivery", () => {
    const rows = planRows(feed);
    const a = rows.find((r) => r.orderId === "a")!;
    expect(a).toMatchObject({ region: "Klang Valley", rule: "Half-day slot only.", doNumber: "DO2601-0001", day: null, carrier: "Own lorry" });
    expect(rows.find((r) => r.orderId === "c")).toMatchObject({ region: "Southern", rule: "", carrier: "NETS" });
    expect(rows.find((r) => r.orderId === "d")).toMatchObject({ carrier: "Own lorry · Lorry 1", day: "2030-01-07", scheduled: true });
  });
});

describe("Auto-schedule", () => {
  const sunday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 0;

  it("fills each region up to its deliveries a day, never before the requested date, skipping Sundays", () => {
    const rows = planRows(feed);
    const waiting = rows.filter((r) => !r.day);
    const p = proposeDates(waiting, rows, feed.regions, "2030-01-04", sunday);
    // Klang Valley takes 2 a day and Monday 7th already has order d: a gets the 7th, b the 8th.
    expect(p.get("a#0")).toBe("2030-01-07");
    expect(p.get("b#0")).toBe("2030-01-08");
    // Johor's requested 5th is a Saturday; the 6th is a Sunday.
    expect(p.get("c#0")).toBe("2030-01-05");
    expect(proposeDates(waiting, rows, feed.regions, "2030-01-06", sunday).get("c#0")).toBe("2030-01-07");
  });
});

describe("Trips", () => {
  it("one trip per day and carrier, stops in order, every stop gets a time slot", () => {
    const rows = planRows(feed).map((r) =>
      r.orderId === "a" ? { ...r, day: "2030-01-07", vehicle: "lorry 1", seq: 2, timeSlot: "13:00-15:00" } : r,
    );
    const trips = tripsOf(rows);
    expect(trips).toHaveLength(1);
    expect(trips[0]!.stops.map((s) => s.orderId)).toEqual(["d", "a"]);
    expect(fillTimeSlots(trips[0]!.stops).map((s) => [s.seq, s.timeSlot])).toEqual([[1, "09:00-11:00"], [2, "13:00-15:00"]]);
    const many = Array.from({ length: 7 }, () => ({ ...rows[0]!, timeSlot: null }));
    expect(fillTimeSlots(many).map((s) => s.timeSlot).slice(4)).toEqual(["17:00-19:00", "17:00-19:00", "17:00-19:00"]);
  });
});
