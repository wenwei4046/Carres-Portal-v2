import { describe, expect, it } from "vitest";
import { resolveOrderCompletion } from "./sales-order-completion";

const base = {
  cancelled: false,
  allocation: { totals: { committedQty: 2, reservedQty: 0, soldQty: 2, outstandingQty: 0 } },
  money: { outstanding: 0, known: true },
  refunds: [] as { status: "requested" | "approved" | "rejected" | "paid" }[],
  loans: [] as {
    status: "on_loan" | "returned";
    source: "warehouse" | "supplier";
    returned_to_supplier_at: string | null;
  }[],
};

describe("resolveOrderCompletion — Card 8's one arithmetic", () => {
  it("all four tracks clear → No Action Required", () => {
    const c = resolveOrderCompletion(base);
    expect(c.noActionRequired).toBe(true);
    expect(c.openTracks).toEqual([]);
  });

  it("DELIVERED ≠ COMPLETE — goods clear but money owing keeps the SO open", () => {
    const c = resolveOrderCompletion({ ...base, money: { outstanding: 500, known: true } });
    expect(c.noActionRequired).toBe(false);
    expect(c.openTracks).toEqual(["money_in"]);
    expect(c.tracks.find((t) => t.key === "money_in")!.why).toContain("500.00");
  });

  it("CANCELLED ≠ COMPLETE — an approved unpaid refund keeps the SO open", () => {
    const c = resolveOrderCompletion({
      ...base,
      cancelled: true,
      allocation: { totals: { committedQty: 2, reservedQty: 0, soldQty: 0, outstandingQty: 2 } },
      refunds: [{ status: "approved" }],
    });
    expect(c.noActionRequired).toBe(false);
    expect(c.openTracks).toEqual(["money_out"]);
    expect(c.tracks.find((t) => t.key === "money_out")!.why).toContain("Carres still owes");
  });

  it("a cancelled order owes no goods — but a unit still reserved to it keeps goods open", () => {
    const open = resolveOrderCompletion({
      ...base,
      cancelled: true,
      allocation: { totals: { committedQty: 2, reservedQty: 1, soldQty: 0, outstandingQty: 1 } },
    });
    expect(open.openTracks).toEqual(["goods"]);
    const clear = resolveOrderCompletion({
      ...base,
      cancelled: true,
      allocation: { totals: { committedQty: 2, reservedQty: 0, soldQty: 0, outstandingQty: 2 } },
    });
    expect(clear.noActionRequired).toBe(true);
  });

  it("a reserved-but-undelivered unit keeps goods open on a live order", () => {
    const c = resolveOrderCompletion({
      ...base,
      allocation: { totals: { committedQty: 2, reservedQty: 1, soldQty: 1, outstandingQty: 0 } },
    });
    expect(c.openTracks).toEqual(["goods"]);
    expect(c.tracks.find((t) => t.key === "goods")!.why).toContain("1 of 2");
  });

  it("LOAN keeps the SO open even when goods and money are clear — both halves", () => {
    const unrecovered = resolveOrderCompletion({
      ...base,
      loans: [{ status: "on_loan", source: "warehouse", returned_to_supplier_at: null }],
    });
    expect(unrecovered.openTracks).toEqual(["loan"]);
    // Recovered from the customer but NOT yet returned to the supplier — the
    // second fact alone keeps it open.
    const unreturned = resolveOrderCompletion({
      ...base,
      loans: [{ status: "returned", source: "supplier", returned_to_supplier_at: null }],
    });
    expect(unreturned.openTracks).toEqual(["loan"]);
    expect(unreturned.tracks.find((t) => t.key === "loan")!.why).toContain("supplier");
  });

  it("a rejected or paid refund does not hold completion", () => {
    const c = resolveOrderCompletion({
      ...base,
      refunds: [{ status: "rejected" }, { status: "paid" }],
    });
    expect(c.noActionRequired).toBe(true);
  });

  it("UNKNOWN money never blocks — the gates' own rule, applied", () => {
    const c = resolveOrderCompletion({
      ...base,
      money: { outstanding: 0, known: false },
    });
    expect(c.noActionRequired).toBe(true);
  });

  it("several open tracks are all reported — one never hides another", () => {
    const c = resolveOrderCompletion({
      ...base,
      allocation: { totals: { committedQty: 2, reservedQty: 0, soldQty: 1, outstandingQty: 1 } },
      money: { outstanding: 100, known: true },
      refunds: [{ status: "requested" }],
      loans: [{ status: "on_loan", source: "warehouse", returned_to_supplier_at: null }],
    });
    expect(c.openTracks).toEqual(["goods", "money_in", "money_out", "loan"]);
  });
});
