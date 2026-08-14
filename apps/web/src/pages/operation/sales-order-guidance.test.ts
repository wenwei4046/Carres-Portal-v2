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
      action: "Shasha · Confirm the date with Kimmy · Record the agreed date",
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
    expect(result.action).toBe("Sales · Confirm the date with Aina · Record the agreed date");
    expect(result.contact).toBe("Aina · Phone not recorded");
  });
});
