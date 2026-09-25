import { describe, it, expect } from "vitest";
import {
  DELIVERY_CONTACT_PURPOSES,
  DELIVERY_CONTACT_RESULTS,
  deliveryContactInputSchema,
  latestDeliveryContactOf,
  laterThanRequested,
} from "./delivery-contact";

describe("the customer contact record — Delivery MASTER §5.1", () => {
  it("every purpose names its job — never `Contact Customer` or `Follow Up`", () => {
    const labels = DELIVERY_CONTACT_PURPOSES.map((p) => p.label);
    expect(labels).toContain("Confirm Delivery Date");
    expect(labels).toContain("Confirm New Delivery Date after Failed Delivery");
    expect(labels).not.toContain("Contact Customer");
    expect(labels).not.toContain("Follow Up");
  });

  it("the seven results are the ruled words, and silence is not one of them", () => {
    expect(DELIVERY_CONTACT_RESULTS.map((r) => r.label)).toEqual([
      "Confirmed",
      "No Answer",
      "Asked to Call Again",
      "Requested Another Date",
      "Contact Details Incorrect",
      "Customer Refused Delivery",
      "Waiting for Customer Reply",
    ]);
  });

  it("the door refuses an unknown purpose, channel or result", () => {
    expect(
      deliveryContactInputSchema.safeParse({
        purpose: "follow_up",
        channel: "whatsapp",
        contactedPerson: "customer",
        result: "confirmed",
      }).success,
    ).toBe(false);
    expect(
      deliveryContactInputSchema.safeParse({
        purpose: "confirm_delivery_date",
        channel: "fax",
        contactedPerson: "customer",
        result: "confirmed",
      }).success,
    ).toBe(false);
    expect(
      deliveryContactInputSchema.safeParse({
        purpose: "confirm_delivery_date",
        channel: "call",
        contactedPerson: "customer",
        result: "silence",
      }).success,
    ).toBe(false);
    expect(
      deliveryContactInputSchema.safeParse({
        purpose: "confirm_delivery_date",
        channel: "call",
        contactedPerson: "partner",
        result: "waiting_for_customer_reply",
        onBehalfOfPartnerId: "00000000-0000-0000-0000-0000000b0001",
      }).success,
    ).toBe(true);
  });

  it("the latest contact decides — by its own clock, whatever order the rows arrive in", () => {
    const latest = latestDeliveryContactOf([
      { contacted_at: "2026-09-10T02:00:00Z", result_key: "no_answer" },
      { contacted_at: "2026-09-12T02:00:00Z", result_key: "waiting_for_customer_reply" },
      { contacted_at: "2026-09-11T02:00:00Z", result_key: "asked_to_call_again" },
    ]);
    expect(latest?.result_key).toBe("waiting_for_customer_reply");
    expect(latestDeliveryContactOf([])).toBeNull();
  });

  it("⭐ the later-date rule: only a day AFTER the requested day needs the reply", () => {
    expect(laterThanRequested("2026-09-20", "2026-09-15")).toBe(true);
    expect(laterThanRequested("2026-09-15", "2026-09-15")).toBe(false);
    expect(laterThanRequested("2026-09-10", "2026-09-15")).toBe(false);
    /* No requested day (the customer answered `not yet`) — nothing to be later than. */
    expect(laterThanRequested("2026-09-20", null)).toBe(false);
    expect(laterThanRequested(null, "2026-09-15")).toBe(false);
  });
});
