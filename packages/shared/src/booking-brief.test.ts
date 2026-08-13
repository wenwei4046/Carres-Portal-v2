/**
 * CARD 3 — the booking brief. Every test below pins one sentence of the
 * 2026-08-13 ruling, and the two that matter most are the ones that prove the
 * brief does NOT wait for the goods.
 */

import { describe, expect, it } from "vitest";
import { resolveBookingBrief } from "./booking-brief";
import type { SalesOrderAllocation } from "./sales-order-allocation";

const SOFA = "sofa:velvet-3s";
const MATTRESS = "mattress:queen-01";

function allocation(
  lines: { sku: string; committedQty: number; reservedQty?: number; soldQty?: number }[],
): SalesOrderAllocation {
  const full = lines.map((l) => ({
    sku: l.sku,
    committedQty: l.committedQty,
    reservedUnits: [],
    soldUnits: [],
    reservedQty: l.reservedQty ?? 0,
    soldQty: l.soldQty ?? 0,
    outstandingQty: Math.max(
      0,
      l.committedQty - (l.reservedQty ?? 0) - (l.soldQty ?? 0),
    ),
  }));
  return {
    orderId: "order-1",
    soRef: "SO-1318",
    lines: full,
    unmatchedUnits: [],
    totals: {
      committedQty: full.reduce((s, l) => s + l.committedQty, 0),
      reservedQty: full.reduce((s, l) => s + l.reservedQty, 0),
      soldQty: full.reduce((s, l) => s + l.soldQty, 0),
      outstandingQty: full.reduce((s, l) => s + l.outstandingQty, 0),
    },
  };
}

const base = {
  orderId: "order-1",
  soRef: "SO-1318",
  promisedDateIso: "2026-08-20",
  allocation: allocation([{ sku: MATTRESS, committedQty: 1 }]),
  assignedLogistics: { partnerId: "p-nets", partnerName: "NETS" },
};

// 2026-08-20 is a Thursday. Mon–Sat week, no holidays injected:
// T−3 working days = Mon 17 Aug.
const T_MINUS_3 = "2026-08-17";

describe("CARD 3 · the T−3 contact window", () => {
  it("opens three working days before the promised deadline", () => {
    const b = resolveBookingBrief(base, "2026-08-01");
    expect(b.contactDueIso).toBe(T_MINUS_3);
    expect(b.contactWindow).toBe("upcoming");
  });

  it("is OPEN on the T−3 day itself and not yet late", () => {
    const b = resolveBookingBrief(base, T_MINUS_3);
    expect(b.contactWindow).toBe("open");
    expect(b.contactOverdue).toBe(false);
  });

  it("is late strictly after T−3", () => {
    const b = resolveBookingBrief(base, "2026-08-18");
    expect(b.contactWindow).toBe("late");
    expect(b.contactOverdue).toBe(true);
  });

  it("takes the settings lead, never a second copy of it", () => {
    const b = resolveBookingBrief(base, "2026-08-01", {}, { chase: 5 });
    // 5 working days before Thu 20 Aug on a Mon–Sat week = Fri 14 Aug.
    expect(b.contactDueIso).toBe("2026-08-14");
  });

  it("a TBD promised date has no anchor, so the call is never late", () => {
    const b = resolveBookingBrief(
      { ...base, promisedDateIso: "2026-08-20", promisedIsTbd: true },
      "2026-12-31",
    );
    expect(b.promisedDateIso).toBeNull();
    expect(b.contactDueIso).toBeNull();
    expect(b.contactWindow).toBe("no_anchor");
    expect(b.contactOverdue).toBe(false);
  });

  it("a recorded appointment closes the window — the call was made", () => {
    const b = resolveBookingBrief(
      {
        ...base,
        booking: {
          stage: "confirmed",
          confirmedDateIso: "2026-08-21",
          slot: "Morning (9am–12pm)",
          carrier: { partnerId: "p-nets", partnerName: "NETS" },
        },
      },
      "2026-08-25",
    );
    expect(b.contactWindow).toBe("done");
    expect(b.contactOverdue).toBe(false);
  });
});

describe("CARD 3 · Rule 3 — Stock ETA informs the call, it never gates it", () => {
  it("produces a full brief with NOTHING allocated and the goods still coming", () => {
    const b = resolveBookingBrief(
      {
        ...base,
        allocation: allocation([{ sku: MATTRESS, committedQty: 2 }]),
        lineEtas: { [MATTRESS]: "2026-08-26" },
      },
      T_MINUS_3,
    );
    // The conversation happens.
    expect(b.contactWindow).toBe("open");
    // And it carries the facts: the deadline, the supplier's date, and the
    // plain answer to "what is not in".
    expect(b.promisedDateIso).toBe("2026-08-20");
    expect(b.stockEtaIso).toBe("2026-08-26");
    expect(b.goodsIn).toHaveLength(0);
    expect(b.goodsNotIn.map((l) => l.sku)).toEqual([MATTRESS]);
    expect(b.goodsNotIn[0]!.shortQty).toBe(2);
  });

  it("reports what IS in beside what is not — partial allocation", () => {
    const b = resolveBookingBrief(
      {
        ...base,
        allocation: allocation([
          { sku: MATTRESS, committedQty: 1, reservedQty: 1 },
          { sku: SOFA, committedQty: 1 },
        ]),
        lineEtas: { [SOFA]: "2026-09-02" },
      },
      T_MINUS_3,
    );
    expect(b.goodsIn.map((l) => l.sku)).toEqual([MATTRESS]);
    expect(b.goodsNotIn.map((l) => l.sku)).toEqual([SOFA]);
    // The ETA of a line already in the warehouse tells the customer nothing.
    expect(b.stockEtaIso).toBe("2026-09-02");
  });

  it("a fully allocated order carries no Stock ETA at all", () => {
    const b = resolveBookingBrief(
      {
        ...base,
        allocation: allocation([{ sku: MATTRESS, committedQty: 1, soldQty: 1 }]),
        lineEtas: { [MATTRESS]: "2026-08-26" },
        orderStockEtaIso: "2026-08-30",
      },
      T_MINUS_3,
    );
    expect(b.stockEtaIso).toBeNull();
    expect(b.goodsNotIn).toHaveLength(0);
  });

  it("falls back to the order-level ETA when no per-line date is on file", () => {
    const b = resolveBookingBrief(
      { ...base, orderStockEtaIso: "2026-08-28" },
      T_MINUS_3,
    );
    expect(b.stockEtaIso).toBe("2026-08-28");
  });
});

describe("CARD 3 · Rule 4 — three separate truths, never collapsed", () => {
  it("keeps assignment, Stock ETA and the appointment as three fields", () => {
    const b = resolveBookingBrief(
      {
        ...base,
        allocation: allocation([{ sku: MATTRESS, committedQty: 1 }]),
        lineEtas: { [MATTRESS]: "2026-08-19" },
        booking: {
          stage: "confirmed",
          confirmedDateIso: "2026-08-22",
          slot: "Afternoon (12pm–3pm)",
          carrier: { partnerId: "p-nets", partnerName: "NETS" },
        },
      },
      T_MINUS_3,
    );
    expect(b.assignedLogistics?.partnerName).toBe("NETS");
    expect(b.stockEtaIso).toBe("2026-08-19");
    expect(b.appointment?.dateIso).toBe("2026-08-22");
    // Rule 5 — and the promised deadline is a fourth, distinct date.
    expect(b.promisedDateIso).toBe("2026-08-20");
  });

  it("the appointment names the carrier it was AGREED WITH, and drift is shown", () => {
    const b = resolveBookingBrief(
      {
        ...base,
        assignedLogistics: { partnerId: "p-houzs", partnerName: "HOUZS" },
        booking: {
          stage: "confirmed",
          confirmedDateIso: "2026-08-22",
          slot: "Morning (9am–12pm)",
          carrier: { partnerId: "p-nets", partnerName: "NETS" },
        },
      },
      T_MINUS_3,
    );
    expect(b.appointment?.carrier.partnerName).toBe("NETS");
    expect(b.assignedLogistics?.partnerName).toBe("HOUZS");
    expect(b.carrierDrift).toBe(true);
  });

  it("an appointment with no carrier on file is not a drift", () => {
    const b = resolveBookingBrief(
      {
        ...base,
        booking: {
          stage: "confirmed",
          confirmedDateIso: "2026-08-22",
          slot: "Morning (9am–12pm)",
          carrier: null,
        },
      },
      T_MINUS_3,
    );
    expect(b.carrierDrift).toBe(false);
  });

  it("a date with no slot is not an appointment — 0277's invariant, honoured", () => {
    const b = resolveBookingBrief(
      {
        ...base,
        booking: {
          stage: "confirmed",
          confirmedDateIso: "2026-08-22",
          slot: "   ",
          carrier: { partnerId: "p-nets", partnerName: "NETS" },
        },
      },
      T_MINUS_3,
    );
    expect(b.appointment).toBeNull();
    expect(b.contactWindow).toBe("open");
  });

  it("a provisional carrier date is not the customer's yes", () => {
    const b = resolveBookingBrief(
      {
        ...base,
        booking: {
          stage: "provisional",
          confirmedDateIso: "2026-08-22",
          slot: "Morning (9am–12pm)",
        },
      },
      T_MINUS_3,
    );
    expect(b.appointment).toBeNull();
  });
});

describe("CARD 3 · the delivery scope", () => {
  it("states the expected scope from the committed lines", () => {
    const b = resolveBookingBrief(
      {
        ...base,
        allocation: allocation([
          { sku: MATTRESS, committedQty: 1 },
          { sku: SOFA, committedQty: 1 },
        ]),
      },
      T_MINUS_3,
    );
    expect(b.expectedScope).toEqual(["bed", "sofa"]);
    expect(b.expectedScopeLabel).toBe("Bed set + Sofa");
  });

  it("a stored scope narrows the appointment; a null scope means the whole order", () => {
    const input = {
      ...base,
      allocation: allocation([
        { sku: MATTRESS, committedQty: 1 },
        { sku: SOFA, committedQty: 1 },
      ]),
      booking: {
        stage: "confirmed",
        confirmedDateIso: "2026-08-22",
        slot: "Morning (9am–12pm)",
        carrier: { partnerId: "p-nets", partnerName: "NETS" },
      },
    };
    const whole = resolveBookingBrief(input, T_MINUS_3);
    expect(whole.appointment?.scope).toEqual(["bed", "sofa"]);
    expect(whole.appointment?.scopeLabel).toBe("Bed set + Sofa");

    const split = resolveBookingBrief(
      { ...input, booking: { ...input.booking, scope: ["bed"] } },
      T_MINUS_3,
    );
    expect(split.appointment?.scope).toEqual(["bed"]);
    expect(split.appointment?.scopeLabel).toBe("Bed set");
    // The order still EXPECTS both — the brief never rewrites what was sold.
    expect(split.expectedScope).toEqual(["bed", "sofa"]);
  });
});
