/** The Chase list's `daysLate` counts on the caller's (stored Office) week. */
import { describe, expect, it } from "vitest";
import { buildPurchaseChaseReceive } from "./purchase-report";

const po = {
  poId: "PO-1", supplierId: "s-1", supStatus: "in_production", status: "open",
  expectedReadyDate: "2026-10-09", etaDate: null,
  lines: [{ sku: "SOFA-1", qty: 1, receivedQty: 0 }], linkedOrders: [],
};

describe("buildPurchaseChaseReceive honours the Office week", () => {
  it("a Friday promise seen on Monday is 1 Office working day late, not 2", () => {
    // Fri 9 Oct 2026 → Mon 12 Oct: Saturday is not an Office day.
    const office = buildPurchaseChaseReceive([po], { today: "2026-10-12", holidays: new Set(), offDays: [0, 6] });
    expect(office.chase[0]?.daysLate).toBe(1);
    // Without an Office week the engine default (Mon–Sat) would count Saturday.
    const engine = buildPurchaseChaseReceive([po], { today: "2026-10-12", holidays: new Set() });
    expect(engine.chase[0]?.daysLate).toBe(2);
  });

  it("a stored Office holiday is not counted", () => {
    const r = buildPurchaseChaseReceive([po], { today: "2026-10-13", holidays: new Set(["2026-10-12"]), offDays: [0, 6] });
    expect(r.chase[0]?.daysLate).toBe(1);
  });
});
