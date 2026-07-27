import { describe, expect, it } from "vitest";
import { storageHold } from "./storage-hold";

const MSBF = ["MATTRESS:KING", "BEDFRAME:KING"];
const TODAY = "2026-07-27";

describe("storageHold — the fee, through ONE ladder", () => {
  it("no storage declared and nothing imported ⇒ no fee, however late", () => {
    const h = storageHold({
      storageFrom: null,
      override: null,
      skus: MSBF,
      asOf: TODAY,
    });
    expect(h.fee).toBe(0);
    expect(h.owing).toBe(0);
  });

  it("the operator's start date makes the fee accrue", () => {
    const h = storageHold({
      storageFrom: "2026-05-27",
      override: null,
      skus: MSBF,
      asOf: TODAY,
    });
    expect(h.fee).toBeGreaterThan(0);
    expect(h.owing).toBe(h.fee);
  });

  it("the Master-imported fee counts even with no start date (the hole in the dispatch gate)", () => {
    // storageBlock read the override and the computed fee only, so an order
    // carrying Jess's keyed Master figure and no storage_from was waved
    // through while the Orders row counted it.
    const h = storageHold({
      storageFrom: null,
      override: null,
      importedMsbf: 150,
      skus: MSBF,
      asOf: TODAY,
    });
    expect(h.fee).toBe(150);
    expect(h.owing).toBe(150);
  });

  it("the override beats the imported figure (the hole in the Orders ladder)", () => {
    const h = storageHold({
      storageFrom: "2026-05-27",
      override: 80,
      importedMsbf: 150,
      skus: MSBF,
      asOf: TODAY,
    });
    expect(h.fee).toBe(80);
  });

  it("override 0 is a value, not an absence — it is the write-off", () => {
    const h = storageHold({
      storageFrom: "2026-05-27",
      override: 0,
      importedMsbf: 150,
      skus: MSBF,
      asOf: TODAY,
    });
    expect(h.fee).toBe(0);
    expect(h.owing).toBe(0);
  });

  it("collected clears the money", () => {
    const h = storageHold({
      storageFrom: null,
      override: null,
      importedMsbf: 150,
      skus: MSBF,
      asOf: TODAY,
      collectedAt: "2026-07-20T02:00:00Z",
    });
    expect(h.fee).toBe(150);
    expect(h.owing).toBe(0);
    expect(h.released).toBe(false);
  });
});

describe("storageHold — the manager's release", () => {
  const held = {
    storageFrom: null,
    override: null,
    importedMsbf: 150,
    skus: MSBF,
    asOf: TODAY,
  } as const;

  it("no decision ⇒ held, and the money is owed", () => {
    const h = storageHold({ ...held, waiverStatus: "none" });
    expect(h.released).toBe(false);
    expect(h.owing).toBe(150);
    expect(h.requested).toBe(false);
  });

  it("requested is not released — the goods stay until the manager decides", () => {
    const h = storageHold({ ...held, waiverStatus: "requested" });
    expect(h.released).toBe(false);
    expect(h.requested).toBe(true);
    expect(h.owing).toBe(150);
  });

  it("refused is not released", () => {
    const h = storageHold({ ...held, waiverStatus: "rejected" });
    expect(h.released).toBe(false);
    expect(h.owing).toBe(150);
  });

  it("RELEASED, fee still owed — the hold lifts and the money does not", () => {
    // Jess's default outcome. This is the whole point of the card: an override
    // must never quietly forgive money.
    const h = storageHold({ ...held, waiverStatus: "approved" });
    expect(h.released).toBe(true);
    expect(h.owing).toBe(150);
    expect(h.waived).toBe(false);
  });

  it("RELEASED AND WAIVED — the decision writes the override to 0", () => {
    const h = storageHold({ ...held, override: 0, waiverStatus: "approved" });
    expect(h.released).toBe(true);
    expect(h.owing).toBe(0);
    expect(h.waived).toBe(true);
    // The keyed Master figure survives, so the record still says what was
    // written off.
    expect(held.importedMsbf).toBe(150);
  });
});
