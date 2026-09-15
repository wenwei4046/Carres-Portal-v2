import { describe, expect, it } from "vitest";
import { stockSiteVisits, type StockMovementEvidence } from "./stock-site-visits";

const event = (id: string, direction: "in" | "out", siteId: string | null, at: string): StockMovementEvidence => ({
  id, direction, siteId, at, unitId: "unit-1", siteName: siteId, reference: id, href: "/evidence", actorId: "actor-1",
});

describe("same-Site physical visits", () => {
  it("pairs transfer departure at its originating Site and starts a new visit on return", () => {
    const result = stockSiteVisits([
      event("receipt-1", "in", "A", "2026-09-01"),
      event("transfer-1", "out", "A", "2026-09-02"),
      event("receipt-2", "in", "B", "2026-09-03"),
      event("return-1", "out", "B", "2026-09-04"),
      event("receipt-3", "in", "A", "2026-09-05"),
    ]);
    expect(result.visits.map((v) => [v.receipt.id, v.departure?.id ?? null])).toEqual([
      ["receipt-1", "transfer-1"], ["receipt-2", "return-1"], ["receipt-3", null],
    ]);
  });
  it("does not use current Site, PO dates or an unlocated DO to invent a visit", () => {
    const result = stockSiteVisits([event("receipt", "in", "A", "2026-09-01"), event("DO", "out", null, "2026-09-02")]);
    expect(result.visits[0].departure).toBeNull();
    expect(result.unpairedDepartures.map((e) => e.id)).toEqual(["DO"]);
    expect(stockSiteVisits([]).visits).toEqual([]);
  });
  it("does not pair another Unit or Site, or choose between overlapping receipts", () => {
    const result = stockSiteVisits([
      event("r1", "in", "A", "2026-09-01"), event("r2", "in", "A", "2026-09-02"),
      event("wrong-site", "out", "B", "2026-09-03"),
      { ...event("wrong-unit", "out", "A", "2026-09-03"), unitId: "unit-2" },
      event("ambiguous", "out", "A", "2026-09-04"),
    ]);
    expect(result.visits.every((v) => v.departure === null)).toBe(true);
    expect(result.unpairedDepartures).toHaveLength(3);
  });
  it("orders evidence and deduplicates receipt joins", () => {
    const receipt = event("r", "in", "A", "2026-09-01");
    const result = stockSiteVisits([event("d", "out", "A", "2026-09-02"), receipt, receipt]);
    expect(result.visits).toHaveLength(1);
    expect(result.visits[0].departure?.id).toBe("d");
  });
});
