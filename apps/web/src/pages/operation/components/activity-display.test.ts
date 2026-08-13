import { describe, it, expect } from "vitest";
import { describeActivity } from "./activity-display";

/**
 * SALES ORDER V2 · CARD 4 closing slice (0347) — money leaves a trace on the
 * order itself, and it states the FIGURE.
 *
 * `payment.received` and `payment.voided` were declared in the event taxonomy
 * on 2026-07-10 and no writer had ever stamped either: `payment_record` wrote
 * the portal-wide `audit_log` and nothing the order's own Activity shows, so
 * `orders.paid` could move with no event saying who moved it. The RPC now
 * writes both, and the timeline prints what the operator needs to read.
 */
describe("describeActivity — money events", () => {
  it("a recorded payment states the amount and its receipt", () => {
    const d = describeActivity({
      kind: "activity",
      action: "payment.received",
      detail: {
        amount: 3500,
        kind: "payment",
        method: "bank",
        receipt_no: "RC-130826-4821",
        counted_in_paid: true,
      },
    });
    expect(d.category).toBe("money");
    expect(d.title).toBe("Payment received");
    expect(d.body).toBe("RM 3,500.00 · RC-130826-4821");
  });

  it("a deposit says so", () => {
    const d = describeActivity({
      kind: "activity",
      action: "payment.received",
      detail: { amount: 1000, kind: "deposit", method: "cash", receipt_no: null },
    });
    expect(d.body).toBe("RM 1,000.00 · Deposit");
  });

  it("a void states the figure it reversed and why", () => {
    const d = describeActivity({
      kind: "activity",
      action: "payment.voided",
      detail: {
        amount: 3500,
        kind: "payment",
        receipt_no: "RC-130826-4821",
        reason: "Keyed against the wrong order",
      },
    });
    expect(d.category).toBe("money");
    expect(d.title).toBe("Payment voided");
    expect(d.body).toBe(
      "RM 3,500.00 · RC-130826-4821 · Keyed against the wrong order",
    );
  });

  it("an event with no figures falls back to its declared title, never a guess", () => {
    const d = describeActivity({ kind: "activity", action: "payment.received", detail: null });
    expect(d.title).toBe("Payment received");
    expect(d.body).toBeNull();
  });
});
