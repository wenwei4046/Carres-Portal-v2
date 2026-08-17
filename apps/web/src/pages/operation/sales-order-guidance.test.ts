import { describe, expect, it } from "vitest";
import { missingDeliveryDateGuidance } from "./sales-order-guidance";

describe("missingDeliveryDateGuidance", () => {
  it("names the real order, customer, owner, required answer and next fact", () => {
    expect(missingDeliveryDateGuidance({
      so: 1303,
      customer: "Kimmy",
      salesperson: "Shasha",
      phone: "019-3478913",
    })).toEqual({
      problem: "No delivery date",
      action: "Confirm delivery date",
      detail: [
        "Shasha · Kimmy · 019-3478913",
        "Ask which delivery date the customer agrees to.",
        "Record the agreed Customer Delivery date.",
      ].join("\n"),
      why: "The customer delivery commitment is not recorded.",
      owner: "Shasha",
      contact: "Kimmy · 019-3478913",
      ask: "Ask which delivery date the customer agrees to.",
      use: "Use the customer delivery confirmation message.",
      record: "Record the agreed Customer Delivery date.",
      next: "Delivery can plan from the recorded customer date.",
    });
  });

  it("uses governed role fallbacks without inventing a person or phone", () => {
    const result = missingDeliveryDateGuidance({ so: 8, customer: "Aina", salesperson: null, phone: null });
    expect(result.contact).toBe("Aina · Phone not recorded");
    expect(result.detail).toContain("Sales · Aina · Phone not recorded");
  });

  /**
   * ⭐ THE DEFECT THIS FILE EXISTS TO STOP COMING BACK.
   *
   * The cell clause is printed in the 148px `Customer Delivery` column and it
   * must not grow with the data. Measured in the browser at the governed
   * `text-meta` size (12px Inter): 132px of ink after the engine's padding
   * fits 21 characters of this string with ~10px to spare, and every extra
   * name pushed it to 55–70 characters and a mid-word cut.
   */
  it("keeps the cell clause constant and short whatever the names are", () => {
    const short = missingDeliveryDateGuidance({ so: 1, customer: "Ho", salesperson: "Li", phone: "01" });
    const long = missingDeliveryDateGuidance({
      so: 2,
      customer: "Nurul Syafiqah binti Abdul Rahman",
      salesperson: "Muhammad Hafizuddin",
      phone: "019-347 8913",
    });
    expect(long.action).toBe(short.action);
    expect(long.action).toBe("Confirm delivery date");
    expect(long.action.length).toBeLessThanOrEqual(24);
    /* Nothing variable may leak into the cell — that is the whole fix. */
    expect(long.action).not.toContain("Nurul");
    expect(long.action).not.toContain("Muhammad");
    /* …but the facts are not lost; they ride the hover. */
    expect(long.detail).toContain("Muhammad Hafizuddin");
    expect(long.detail).toContain("Nurul Syafiqah binti Abdul Rahman · 019-347 8913");
  });
});
