import { describe, expect, it } from "vitest";
import { orderBookingDay } from "./order-booking";

const untouchedOverlay = { booking_stage: null, confirmed_date: null, confirmed_time_slot: null, logistic_eta: null };

describe("orderBookingDay", () => {
  it("reads a day Delivery confirmed on its own arrangement when the legacy overlay was never touched", () => {
    const day = orderBookingDay({
      ops_order_control: untouchedOverlay,
      ops_delivery_arrangements: [
        { leg: 0, partner_id: "p1", confirmed_date: "2026-10-30", confirmed_time: "Morning (9am to 12pm)" },
      ],
    } as never);
    expect(day).toEqual({ kind: "confirmed", date: "2026-10-30", slot: "Morning (9am to 12pm)" });
  });

  it("prefers a live Delivery Order's own day, and ignores a voided one", () => {
    const base = {
      ops_order_control: untouchedOverlay,
      ops_delivery_arrangements: [{ leg: 0, partner_id: "p1", confirmed_date: "2026-10-30", confirmed_time: null }],
    };
    const live = orderBookingDay({
      ...base,
      ops_delivery_orders: [{ do_number: "D1", leg: 0, delivery_date: "2026-11-02", time_slot: "Afternoon", voided_at: null }],
    } as never);
    expect(live.date).toBe("2026-11-02");
    const voided = orderBookingDay({
      ...base,
      ops_delivery_orders: [{ do_number: "D1", leg: 0, delivery_date: "2026-11-02", time_slot: null, voided_at: "2026-10-29" }],
    } as never);
    expect(voided.date).toBe("2026-10-30");
  });

  it("on a multi-leg order reads the customer leg (the highest), not leg 0", () => {
    const day = orderBookingDay({
      ops_order_control: untouchedOverlay,
      ops_delivery_arrangements: [
        { leg: 0, partner_id: "p1", confirmed_date: "2026-10-28", confirmed_time: null },
        { leg: 2, partner_id: "p2", confirmed_date: "2026-11-03", confirmed_time: "Morning" },
      ],
    } as never);
    expect(day).toEqual({ kind: "confirmed", date: "2026-11-03", slot: "Morning" });
  });

  it("stays unconfirmed when neither Delivery nor the booking has a day", () => {
    expect(orderBookingDay({ ops_order_control: untouchedOverlay } as never).kind).toBe("none");
  });
});
