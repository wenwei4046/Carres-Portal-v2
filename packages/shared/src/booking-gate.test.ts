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

describe("isSundayIso", () => {
  it("flags a Sunday and passes the rest of the week", () => {
    expect(isSundayIso("2026-08-23")).toBe(true); // Sun
    expect(isSundayIso("2026-08-22")).toBe(false); // Sat
    expect(isSundayIso("2026-08-24")).toBe(false); // Mon
  });
});
