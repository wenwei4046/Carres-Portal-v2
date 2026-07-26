import { describe, it, expect } from "vitest";
import { bookingConfirmGate, isSundayIso } from "./booking-gate";
import { stockMatchKey } from "./line-category";

// The D1 Stage-2 gate — goods ready + balance ready (frozen §7).

const MATTRESS = "mattress:FirmCare-K";
const PILLOW = "Memory Pillow";
const DISPOSAL = "Disposal Service";

describe("bookingConfirmGate", () => {
  it("passes when every goods line is reserved and balance is collected", () => {
    const r = bookingConfirmGate({
      lines: [{ sku: MATTRESS, qty: 1 }],
      lineReceived: { [MATTRESS]: 1 },
      reservedQtyByKey: {},
      orderTotal: 2500,
      collected: 2500,
    });
    expect(r.ok).toBe(true);
    expect(r.goodsReady).toBe(true);
    expect(r.balanceReady).toBe(true);
  });

  it("blocks on an unreserved core line and names the sku", () => {
    const r = bookingConfirmGate({
      lines: [{ sku: MATTRESS, qty: 1 }],
      lineReceived: null,
      reservedQtyByKey: {},
      orderTotal: 0,
      collected: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.goodsReady).toBe(false);
    expect(r.notReadySkus).toEqual([MATTRESS]);
  });

  it("counts the reserved-units ledger (stockMatchKey), not only line_received", () => {
    const r = bookingConfirmGate({
      lines: [{ sku: MATTRESS, qty: 2 }],
      lineReceived: { [MATTRESS]: 1 },
      reservedQtyByKey: { [stockMatchKey(MATTRESS)]: 2 },
      orderTotal: 0,
      collected: 0,
    });
    expect(r.goodsReady).toBe(true);
  });

  it("free shelf stock is NOT ready — reservation is the bar (SO-1153 parity)", () => {
    // No reservation at all: even though the drawer would show "to reserve",
    // the gate must refuse.
    const r = bookingConfirmGate({
      lines: [{ sku: MATTRESS, qty: 1 }],
      lineReceived: { [MATTRESS]: 0 },
      reservedQtyByKey: {},
      orderTotal: 0,
      collected: 0,
    });
    expect(r.goodsReady).toBe(false);
  });

  it("accessories auto-pass; service charges are skipped (invariant #7)", () => {
    const r = bookingConfirmGate({
      lines: [
        { sku: PILLOW, qty: 2 },
        { sku: DISPOSAL, qty: 1 },
      ],
      lineReceived: null,
      reservedQtyByKey: {},
      orderTotal: 0,
      collected: 0,
    });
    expect(r.goodsReady).toBe(true);
  });

  it("blocks on outstanding balance and reports the number", () => {
    const r = bookingConfirmGate({
      lines: [],
      lineReceived: null,
      reservedQtyByKey: {},
      orderTotal: 3000,
      collected: 1000,
    });
    expect(r.balanceReady).toBe(false);
    expect(r.outstanding).toBe(2000);
    expect(r.ok).toBe(false);
  });

  it("total-not-set does not block (AutoCount order with no keyed balance)", () => {
    const r = bookingConfirmGate({
      lines: [],
      lineReceived: null,
      reservedQtyByKey: {},
      orderTotal: 0,
      collected: 0,
    });
    expect(r.balanceReady).toBe(true);
    expect(r.ok).toBe(true);
  });
});

// ── T8 · delivery groups ────────────────────────────────────────────────────
// Jess: bed set never splits · sofa may take a second trip IF the customer says
// so · accessories never block. The gate answers per group; the trip's scope is
// passed in, never inferred.

const BEDFRAME = "bedframe:Jager/Fab3-King";
const SOFA = "sofa:Glano-3Seater";

/** Everything reserved except the skus named. */
function gate(
  lines: { sku: string; qty: number }[],
  shortSkus: string[],
  deliverGroups?: ("bed" | "sofa")[],
) {
  const lineReceived: Record<string, number> = {};
  for (const l of lines) {
    lineReceived[l.sku] = shortSkus.includes(l.sku) ? 0 : l.qty;
  }
  return bookingConfirmGate({
    lines,
    lineReceived,
    reservedQtyByKey: {},
    orderTotal: 0,
    collected: 0,
    deliverGroups,
  });
}

describe("bookingConfirmGate · delivery groups (T8)", () => {
  const FULL = [
    { sku: MATTRESS, qty: 1 },
    { sku: BEDFRAME, qty: 1 },
    { sku: SOFA, qty: 1 },
    { sku: PILLOW, qty: 2 },
  ];

  it("reports each group's own readiness, in trip order", () => {
    const r = gate(FULL, [SOFA]);
    expect(r.groups.map((g) => g.key)).toEqual(["bed", "sofa"]);
    expect(r.groups[0]).toMatchObject({ key: "bed", ready: true });
    expect(r.groups[1]).toMatchObject({ key: "sofa", ready: false });
    expect(r.groups[1].notReadySkus).toEqual([SOFA]);
  });

  it("HARD: a short bed frame fails the WHOLE bed set — the mattress can't go alone", () => {
    const r = gate(FULL, [BEDFRAME]);
    const bed = r.groups.find((g) => g.key === "bed");
    expect(bed?.ready).toBe(false);
    // ...and there is no scope that delivers the mattress without the frame:
    const tryBed = gate(FULL, [BEDFRAME], ["bed"]);
    expect(tryBed.goodsReady).toBe(false);
  });

  it("NEVER auto-splits: no scope means the whole order, so a short sofa still blocks", () => {
    const r = gate(FULL, [SOFA]);
    expect(r.goodsReady).toBe(false);
    expect(r.scope).toEqual(["bed", "sofa"]);
    expect(r.notReadySkus).toEqual([SOFA]);
  });

  it("SOFT: with the customer's yes, the ready bed set goes and the sofa waits", () => {
    const r = gate(FULL, [SOFA], ["bed"]);
    expect(r.goodsReady).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.scope).toEqual(["bed"]);
    expect(r.waitingGroups).toEqual(["sofa"]);
  });

  it("splits the other way too — a ready sofa may go while the bed set waits", () => {
    const r = gate(FULL, [MATTRESS], ["sofa"]);
    expect(r.ok).toBe(true);
    expect(r.waitingGroups).toEqual(["bed"]);
  });

  it("flags splitAvailable only when something is ready AND something is not", () => {
    expect(gate(FULL, [SOFA]).splitAvailable).toBe(true);
    expect(gate(FULL, []).splitAvailable).toBe(false); // all ready — one trip
    expect(gate(FULL, [MATTRESS, SOFA]).splitAvailable).toBe(false); // nothing ready
    // One group only: there is no second half to leave behind.
    expect(gate([{ sku: MATTRESS, qty: 1 }], []).splitAvailable).toBe(false);
  });

  it("a missing pillow never blocks the bed set (配件永不挡送货)", () => {
    const r = gate(FULL, [PILLOW, SOFA], ["bed"]);
    expect(r.ok).toBe(true);
    expect(r.notReadySkus).not.toContain(PILLOW);
    // ...and the pillow is not a group of its own, so it can never be a trip.
    expect(r.groups.map((g) => g.key)).toEqual(["bed", "sofa"]);
  });

  it("refuses a scope naming a group the order does not have", () => {
    const r = gate([{ sku: MATTRESS, qty: 1 }], [], ["sofa"]);
    expect(r.scopeValid).toBe(false);
    expect(r.goodsReady).toBe(false);
    expect(r.ok).toBe(false);
  });

  it("refuses an EMPTY scope — a trip carrying nothing is not a delivery", () => {
    const r = gate(FULL, [], []);
    expect(r.scopeValid).toBe(false);
    expect(r.ok).toBe(false);
  });

  it("balance still gates a split trip — a partial delivery is not a free pass", () => {
    const r = bookingConfirmGate({
      lines: [
        { sku: MATTRESS, qty: 1 },
        { sku: SOFA, qty: 1 },
      ],
      lineReceived: { [MATTRESS]: 1, [SOFA]: 0 },
      reservedQtyByKey: {},
      orderTotal: 5000,
      collected: 1000,
      deliverGroups: ["bed"],
    });
    expect(r.goodsReady).toBe(true);
    expect(r.balanceReady).toBe(false);
    expect(r.ok).toBe(false);
  });

  it("pre-T8 callers are unaffected — omitting the scope reproduces the old answer", () => {
    const r = bookingConfirmGate({
      lines: [{ sku: MATTRESS, qty: 1 }],
      lineReceived: { [MATTRESS]: 1 },
      reservedQtyByKey: {},
      orderTotal: 2500,
      collected: 2500,
    });
    expect(r.ok).toBe(true);
    expect(r.scope).toEqual(["bed"]);
    expect(r.waitingGroups).toEqual([]);
    expect(r.scopeValid).toBe(true);
  });

  it("an accessories-only order has no groups and stays deliverable", () => {
    const r = gate([{ sku: PILLOW, qty: 1 }], [PILLOW]);
    expect(r.groups).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe("isSundayIso", () => {
  it("flags a Sunday and passes the rest of the week", () => {
    expect(isSundayIso("2026-08-23")).toBe(true); // Sun
    expect(isSundayIso("2026-08-22")).toBe(false); // Sat
    expect(isSundayIso("2026-08-24")).toBe(false); // Mon
  });
});
