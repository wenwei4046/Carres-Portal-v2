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

describe("describeActivity — governed operator field names", () => {
  it("translates the internal logistics date field into the UI Dictionary", () => {
    const d = describeActivity({
      kind: "activity",
      action: "order.field_changed",
      detail: { field: "logistic_eta", from: null, to: "2026-08-21" },
    });

    expect(d.title).toBe("Logistics' date changed");
  });

  it("translates the internal stock date field into the governed arrival fact", () => {
    const d = describeActivity({
      kind: "activity",
      action: "order.field_changed",
      detail: { field: "stock_eta", from: null, to: "2026-08-21" },
    });

    expect(d.title).toBe("Expected arrival changed");
  });
});

/**
 * NO INTERNAL ENUM · NO `— —` — owner rulings 2026-08-15 (Quick Rail).
 *
 * Measured on production the same day, this panel was rendering
 * `Status changed — place → proceed_order` (the database's own words) and
 * `Payment status changed — — → Follow Up` (a dash pretending to be a value).
 * Both are what these tests pin.
 */
describe("describeActivity — no internal enum reaches the screen", () => {
  it("translates every order status into its dictionary word", () => {
    const body = (from: unknown, to: unknown) =>
      describeActivity({
        kind: "activity",
        action: "order.field_changed",
        detail: { field: "status", from, to },
      }).body;

    expect(body("place", "proceed_order")).toBe("Placed → Proceed");
    expect(body("proceed_order", "place")).toBe("Proceed → Placed");
    expect(body("place", "delivered")).toBe("Placed → Delivered");
    expect(body("place", "cancelled")).toBe("Placed → Cancelled");
  });

  it("prints a business date the one ruled way, never the stored ISO", () => {
    const d = describeActivity({
      kind: "activity",
      action: "order.date_changed",
      detail: { field: "delivery_date", from: "2026-07-27", to: "2026-08-28" },
    });
    expect(d.body).toBe("Mon, 27 Jul 26 → Fri, 28 Aug 26");
  });

  it("prints money with its currency and its two decimals", () => {
    const d = describeActivity({
      kind: "activity",
      action: "order.field_changed",
      detail: { field: "balance", from: "1000.00", to: "0.00" },
    });
    expect(d.body).toBe("RM 1,000.00 → RM 0.00");
  });

  it("an undeclared action never prints its raw key", () => {
    const d = describeActivity({ kind: "activity", action: "some_new_thing", detail: null });
    expect(d.title).toBe("Activity");
    expect(d.title).not.toMatch(/some|new|thing|_/);
  });
});

describe("describeActivity — an absent value reads as words, never a dash", () => {
  it("names WHICH fact was missing, so two fields never read alike", () => {
    const payment = describeActivity({
      kind: "activity",
      action: "order.field_changed",
      detail: { field: "payment_status", from: null, to: "Paid" },
    });
    expect(payment.body).toBe("No payment status → Paid");

    const status = describeActivity({
      kind: "activity",
      action: "order.field_changed",
      detail: { field: "status", from: null, to: "place" },
    });
    expect(status.body).toBe("No status → Placed");
  });

  it("a value that was cleared says so on the right-hand side too", () => {
    const d = describeActivity({
      kind: "activity",
      action: "order.field_changed",
      detail: { field: "logistic_eta", from: "2026-07-21", to: null },
    });
    expect(d.body).toBe("Tue, 21 Jul 26 → No logistics' date");
  });

  it("no `—` survives on either side of the arrow", () => {
    const d = describeActivity({
      kind: "activity",
      action: "order.field_changed",
      detail: { field: "delivery_date", from: null, to: null },
    });
    expect(d.body).not.toContain("—");
  });
});
