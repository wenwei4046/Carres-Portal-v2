import { describe, it, expect } from "vitest";
import {
  POOL_USE_REASONS,
  POOL_USE_REASON_LABEL,
  poolUseNeedsNote,
  poolDrawProblem,
  computeReserveLevelRows,
  reserveLevelWarning,
  summarisePoolUsage,
  type PoolUsageEntry,
} from "./pool-usage";

/**
 * Ready-stock pool usage + reserve levels — card K4.
 *
 * The rules under test are the ones a later card could quietly break: the
 * warning must never become a block, `Other` must never be filable without
 * words, the split must sum to 100, and a released draw must still count as a
 * reason the pool was used.
 */

const entry = (e: Partial<PoolUsageEntry> & { qty: number }): PoolUsageEntry => ({
  id: e.id ?? Math.random().toString(36).slice(2),
  sku: e.sku ?? "Pillow",
  reason: e.reason ?? "sales_urgent",
  takenAt: e.takenAt ?? "2026-07-10T02:00:00Z",
  ...e,
});

describe("the locked reason list", () => {
  it("is the card's five, in the card's order", () => {
    expect([...POOL_USE_REASONS]).toEqual([
      "sales_urgent",
      "supplier_delay",
      "warranty_exchange",
      "vip",
      "other",
    ]);
  });

  it("gives every key a screen word (no DB word reaches the UI)", () => {
    for (const r of POOL_USE_REASONS) {
      expect(POOL_USE_REASON_LABEL[r]).toBeTruthy();
      expect(POOL_USE_REASON_LABEL[r]).not.toContain("_");
    }
  });

  it("only `Other` demands words", () => {
    expect(poolUseNeedsNote("other")).toBe(true);
    for (const r of POOL_USE_REASONS.filter((x) => x !== "other")) {
      expect(poolUseNeedsNote(r)).toBe(false);
    }
  });
});

describe("poolDrawProblem — the one rule the button and the server share", () => {
  it("refuses a draw with no reason", () => {
    expect(poolDrawProblem({ reason: "" })).toBe("Why is this unit being taken?");
  });

  it("refuses a reason that is not on the list", () => {
    expect(poolDrawProblem({ reason: "whatever" as never })).toBe(
      "Why is this unit being taken?",
    );
  });

  it("refuses `Other` with no words — the hole in the answer K3 closed", () => {
    expect(poolDrawProblem({ reason: "other" })).toBe("Say what the reason is");
    expect(poolDrawProblem({ reason: "other", note: "   " })).toBe(
      "Say what the reason is",
    );
    expect(poolDrawProblem({ reason: "other", note: "showroom display swap" })).toBeNull();
  });

  it("accepts the four listed reasons with no note", () => {
    for (const r of POOL_USE_REASONS.filter((x) => x !== "other")) {
      expect(poolDrawProblem({ reason: r })).toBeNull();
    }
  });

  it("refuses a note longer than the column holds", () => {
    expect(poolDrawProblem({ reason: "vip", note: "x".repeat(301) })).toBe(
      "That note is too long",
    );
  });
});

describe("reserveLevelWarning — warns, never blocks", () => {
  it("says nothing when no level is set", () => {
    expect(reserveLevelWarning({ free: 1, taking: 1, reserveLevel: null })).toBeNull();
    expect(reserveLevelWarning({ free: 1, taking: 1, reserveLevel: undefined })).toBeNull();
  });

  it("treats 0 as the OFF switch, not as a floor everything is below", () => {
    expect(reserveLevelWarning({ free: 0, taking: 0, reserveLevel: 0 })).toBeNull();
  });

  it("warns when the draw would land ON the level", () => {
    expect(reserveLevelWarning({ free: 8, taking: 3, reserveLevel: 5 })).toEqual({
      freeAfter: 5,
      reserveLevel: 5,
    });
  });

  it("warns when the draw would land below it", () => {
    expect(reserveLevelWarning({ free: 6, taking: 3, reserveLevel: 5 })).toEqual({
      freeAfter: 3,
      reserveLevel: 5,
    });
  });

  it("stays quiet while the draw leaves the level intact", () => {
    expect(reserveLevelWarning({ free: 20, taking: 3, reserveLevel: 5 })).toBeNull();
  });

  it("never reports negative stock — it is a reminder, not a ledger", () => {
    expect(reserveLevelWarning({ free: 2, taking: 9, reserveLevel: 5 })?.freeAfter).toBe(0);
  });
});

describe("computeReserveLevelRows", () => {
  const units = [
    { sku: "Pillow", status: "free", qty: 555 },
    { sku: "Protector-K", status: "free", qty: 15 },
    { sku: "Protector-K", status: "reserved", qty: 4 },
    { sku: "Sofa 3-seater", status: "free", qty: 1 },
    { sku: "Gone", status: "sold", qty: 3 },
  ];

  it("sums qty, never counts records (the 0218 bulk-row law)", () => {
    const rows = computeReserveLevelRows(units, []);
    expect(rows.find((r) => r.sku === "Pillow")!.free).toBe(555);
  });

  it("asks for a number instead of claiming everything is fine", () => {
    const rows = computeReserveLevelRows(units, []);
    expect(rows.every((r) => r.state === "unset")).toBe(true);
  });

  it("marks a SKU low when free is at or below the level", () => {
    const rows = computeReserveLevelRows(units, [
      { sku: "Protector-K", reserveLevel: 20 },
      { sku: "Pillow", reserveLevel: 200 },
    ]);
    const prot = rows.find((r) => r.sku === "Protector-K")!;
    expect(prot.state).toBe("low");
    expect(prot.shortfall).toBe(5);
    expect(rows.find((r) => r.sku === "Pillow")!.state).toBe("ok");
  });

  it("does not count reserved units as cover", () => {
    const rows = computeReserveLevelRows(units, [
      { sku: "Protector-K", reserveLevel: 16 },
    ]);
    // free 15 + reserved 4 would read 19 and hide the warning.
    expect(rows.find((r) => r.sku === "Protector-K")!.state).toBe("low");
  });

  it("keeps a level after the last unit leaves — that is when it matters most", () => {
    const rows = computeReserveLevelRows(
      [{ sku: "Gone", status: "sold", qty: 3 }],
      [{ sku: "Gone", reserveLevel: 4 }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ free: 0, state: "low", shortfall: 4 });
  });

  it("puts the ones needing attention first, deepest gap on top", () => {
    const rows = computeReserveLevelRows(units, [
      { sku: "Protector-K", reserveLevel: 20 },
      { sku: "Sofa 3-seater", reserveLevel: 6 },
      { sku: "Pillow", reserveLevel: 100 },
    ]);
    expect(rows.map((r) => r.sku)).toEqual([
      "Protector-K", // short by 5
      "Sofa 3-seater", // short by 5 too — ties break alphabetically
      "Pillow", // healthy, so last whatever its name
    ]);
  });
});

describe("summarisePoolUsage — the answer to 为什么一直缺货", () => {
  it("returns an honest empty answer, not a divide by zero", () => {
    expect(summarisePoolUsage([])).toEqual({
      totalUnits: 0,
      totalDraws: 0,
      byReason: [],
      bySku: [],
    });
  });

  it("splits by units and states the draw count beside it", () => {
    const s = summarisePoolUsage([
      entry({ qty: 6, reason: "sales_urgent" }),
      entry({ qty: 2, reason: "sales_urgent" }),
      entry({ qty: 2, reason: "supplier_delay" }),
    ]);
    expect(s.totalUnits).toBe(10);
    expect(s.totalDraws).toBe(3);
    expect(s.byReason).toEqual([
      { reason: "sales_urgent", label: "Sales urgent", units: 8, draws: 2, share: 80 },
      { reason: "supplier_delay", label: "Supplier delay", units: 2, draws: 1, share: 20 },
    ]);
  });

  it("keeps the card's order rather than re-sorting itself every month", () => {
    const s = summarisePoolUsage([
      entry({ qty: 1, reason: "vip" }),
      entry({ qty: 9, reason: "supplier_delay" }),
    ]);
    expect(s.byReason.map((r) => r.reason)).toEqual(["supplier_delay", "vip"]);
  });

  it("prints shares that add up to 100 even when thirds do not", () => {
    const s = summarisePoolUsage([
      entry({ qty: 1, reason: "sales_urgent" }),
      entry({ qty: 1, reason: "supplier_delay" }),
      entry({ qty: 1, reason: "vip" }),
    ]);
    expect(s.byReason.map((r) => r.share)).toEqual([34, 33, 33]);
    expect(s.byReason.reduce((a, b) => a + b.share, 0)).toBe(100);
  });

  it("counts one bulk record as ONE draw of many units", () => {
    const s = summarisePoolUsage([entry({ qty: 555, sku: "Pillow" })]);
    expect(s.bySku[0]).toMatchObject({ sku: "Pillow", units: 555, draws: 1 });
  });

  it("names the reason a SKU mostly leaves for", () => {
    const s = summarisePoolUsage([
      entry({ qty: 1, sku: "Sofa", reason: "vip" }),
      entry({ qty: 4, sku: "Sofa", reason: "supplier_delay" }),
      entry({ qty: 3, sku: "Pillow", reason: "warranty_exchange" }),
    ]);
    expect(s.bySku).toEqual([
      {
        sku: "Sofa",
        units: 5,
        draws: 2,
        topReason: "supplier_delay",
        topReasonLabel: "Supplier delay",
      },
      {
        sku: "Pillow",
        units: 3,
        draws: 1,
        topReason: "warranty_exchange",
        topReasonLabel: "Warranty exchange",
      },
    ]);
  });

  it("ignores a nonsense quantity instead of poisoning the split", () => {
    const s = summarisePoolUsage([
      entry({ qty: 0 }),
      entry({ qty: -5 }),
      entry({ qty: 4 }),
    ]);
    expect(s.totalUnits).toBe(4);
    // The bad rows still happened — they are draws somebody made.
    expect(s.totalDraws).toBe(3);
  });
});
