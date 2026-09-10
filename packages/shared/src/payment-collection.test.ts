import { describe, expect, it } from "vitest";
import { paymentCollectionReadiness } from "./payment-collection";

describe("payment collection — goods before customer contact", () => {
  const waiting = {
    completed: false,
    goodsReady: false,
    stockEtaIso: null,
  };

  it("waits when goods are not ready and arrival has not been confirmed", () => {
    expect(paymentCollectionReadiness(waiting)).toBe("wait");
  });

  it.each([null, "", "TBD", "2026-13-01", "2026-02-30"])(
    "does not treat an unusable arrival %s as permission to collect",
    (stockEtaIso) => {
      expect(paymentCollectionReadiness({ ...waiting, stockEtaIso })).toBe("wait");
    },
  );

  it("allows collection when goods are ready without requiring an arrival date", () => {
    expect(paymentCollectionReadiness({ ...waiting, goodsReady: true })).toBe("ready");
  });

  it("allows collection when goods have a real arrival date", () => {
    expect(paymentCollectionReadiness({ ...waiting, stockEtaIso: "2026-09-07" })).toBe("ready");
  });

  it("keeps collection available after delivery even when stock is no longer reserved", () => {
    expect(paymentCollectionReadiness({ ...waiting, completed: true })).toBe("ready");
  });
});
