import { describe, expect, it } from "vitest";
import { missingDeliveryDateGuidance } from "./sales-order-guidance";

/**
 * OWNER RULING 2026-08-18 — the guidance is the FACT and its hover, nothing
 * more. The register cell prints `problem` alone (a register lists documents;
 * the action lives in My Work / Team Work / the Order Route), and the
 * workspace's seven-answer banner is DELETED — it lectured instead of working
 * and said one thing in three places. These tests hold the trimmed shape so
 * neither the action clause nor the banner fields quietly return.
 */
describe("missingDeliveryDateGuidance", () => {
  it("is the FACT plus its hover detail — nothing else", () => {
    expect(missingDeliveryDateGuidance({
      so: 1303,
      customer: "Kimmy",
      salesperson: "Shasha",
      phone: "019-3478913",
    })).toEqual({
      problem: "No delivery date",
      detail: [
        "Shasha · Kimmy · 019-3478913",
        "Ask which delivery date the customer agrees to.",
        "Record the agreed Customer Delivery date.",
      ].join("\n"),
    });
  });

  it("uses governed role fallbacks without inventing a person or phone", () => {
    const result = missingDeliveryDateGuidance({ so: 8, customer: "Aina", salesperson: null, phone: null });
    expect(result.detail).toContain("Sales · Aina · Phone not recorded");
  });

  it("the retired action clause and banner fields are gone, not merely unused", () => {
    const g = missingDeliveryDateGuidance({ so: 1, customer: "Ho", salesperson: "Li", phone: "01" });
    for (const retired of ["action", "why", "owner", "contact", "ask", "use", "record", "next"]) {
      expect(g).not.toHaveProperty(retired);
    }
  });
});
