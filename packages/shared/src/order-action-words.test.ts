import { describe, expect, it } from "vitest";

import {
  ORDER_ACTION_QUEUES,
  collectPillLabel,
  orderActionForQueue,
  orderActionLine,
  orderActionQueue,
  type OrderActionKey,
} from "./order-action-words";

const EVERY_KEY: OrderActionKey[] = [
  "send_po",
  "confirm_ready_date",
  "agree_new_delivery_date",
  "assign_logistics",
  "confirm_delivery_date",
  "deliver_today",
  "upload_delivery_photo",
  "delivering",
  "collect",
  "done",
];

describe("order action words — the queue word", () => {
  it("carries no party (a queue holds many suppliers)", () => {
    expect(orderActionQueue("send_po")).toBe("Send PO");
    expect(orderActionQueue("confirm_ready_date")).toBe("Confirm ready date");
    expect(orderActionQueue("confirm_delivery_date")).toBe("Confirm delivery date");
    expect(orderActionQueue("agree_new_delivery_date")).toBe("Agree new delivery date");
  });

  it("keeps the three party-less actions exactly as COPY-STANDARD leaves them", () => {
    expect(orderActionQueue("assign_logistics")).toBe("Assign logistics");
    expect(orderActionQueue("deliver_today")).toBe("Deliver today");
    expect(orderActionQueue("upload_delivery_photo")).toBe("Upload delivery photo");
  });

  it("round-trips through orderActionForQueue", () => {
    for (const key of EVERY_KEY)
      expect(orderActionForQueue(orderActionQueue(key))).toBe(key);
    expect(orderActionForQueue("Chase logistic")).toBeNull();
    expect(orderActionForQueue("")).toBeNull();
  });
});

describe("order action words — the row line", () => {
  it("names the real party when the system knows it", () => {
    expect(orderActionLine("send_po", { supplier: "Ohana" })).toBe("Send PO to Ohana");
    expect(orderActionLine("confirm_ready_date", { supplier: "Ohana" })).toBe(
      "Call Ohana — confirm ready date",
    );
    expect(orderActionLine("confirm_delivery_date", { logistics: "NETS" })).toBe(
      "Call NETS — confirm delivery date",
    );
    expect(orderActionLine("agree_new_delivery_date", { customer: "John Tan" })).toBe(
      "Call John Tan — agree new delivery date",
    );
  });

  // C3 — the FACT that replaced `Confirm delivery with {customer}`. Two forms
  // on purpose: the full sentence where nothing else on screen carries the day
  // (the drawer's journey strip), the bare queue word where a neighbouring cell
  // already prints it (the Orders row, the Delivery detail pane).
  it("the delivering FACT states the day, and shortens to one word without it", () => {
    expect(
      orderActionLine("delivering", {
        deliveryDate: "27 Jul",
        deliverySlot: "12pm–3pm",
      }),
    ).toBe("Delivering 27 Jul · 12pm–3pm");
    expect(orderActionLine("delivering", { deliveryDate: "27 Jul" })).toBe(
      "Delivering 27 Jul",
    );
    // No slot dangling on its own, and no half-sentence when neither is known.
    expect(orderActionLine("delivering", { deliverySlot: "12pm–3pm" })).toBe(
      "Delivering",
    );
    expect(orderActionLine("delivering")).toBe(orderActionQueue("delivering"));
    // It carries NO verb a human could act on — that is the whole ruling.
    expect(orderActionLine("delivering", { customer: "John Tan" })).not.toMatch(
      /confirm/i,
    );
  });

  it("falls back to the ROLE word, never to an empty gap", () => {
    expect(orderActionLine("confirm_ready_date")).toBe(
      "Call supplier — confirm ready date",
    );
    expect(orderActionLine("confirm_delivery_date", { logistics: "   " })).toBe(
      "Call logistics — confirm delivery date",
    );
    expect(orderActionLine("agree_new_delivery_date", { customer: null })).toBe(
      "Call customer — agree new delivery date",
    );
    // No label may ever contain a double space or a dangling dash.
    for (const key of EVERY_KEY) {
      const line = orderActionLine(key);
      expect(line).not.toMatch(/ {2}/);
      expect(line).not.toMatch(/—\s*$/);
      expect(line.trim()).toBe(line);
    }
  });

  it("money reads RM {amount} from {customer}, and never invents a figure", () => {
    expect(orderActionLine("collect", { amount: "2,455", customer: "John Tan" })).toBe(
      "Collect RM 2,455 from John Tan",
    );
    expect(orderActionLine("collect", { customer: "John Tan" })).toBe(
      "Collect from John Tan",
    );
    expect(collectPillLabel("2,455")).toBe("Collect RM 2,455");
    expect(collectPillLabel(null)).toBe("Collect");
    // The pill deliberately drops the customer — their name is on the same row.
    expect(collectPillLabel("2,455")).not.toMatch(/from/);
  });

  it("the party-less three read the same as their queue word", () => {
    for (const key of ["assign_logistics", "deliver_today", "upload_delivery_photo"] as const)
      expect(orderActionLine(key, { logistics: "NETS" })).toBe(orderActionQueue(key));
  });
});

describe("order action words — the banned words", () => {
  const BANNED =
    /\b(chase|chased|POD|proof of delivery|unscheduled|not booked|need booking|pending|processing|in progress|waiting|at risk|attention|carrier|partner|logistic(?!s))\b/i;

  it("never appear in a queue word or a row line", () => {
    for (const key of EVERY_KEY) {
      expect(orderActionQueue(key)).not.toMatch(BANNED);
      expect(orderActionLine(key)).not.toMatch(BANNED);
      expect(
        orderActionLine(key, { amount: "1,000", customer: "A", supplier: "B", logistics: "C" }),
      ).not.toMatch(BANNED);
    }
    expect(collectPillLabel("1,000")).not.toMatch(BANNED);
  });

  it("exposes every queue word so a caller can guard the whole set", () => {
    expect(ORDER_ACTION_QUEUES).toHaveLength(EVERY_KEY.length);
    expect(new Set(ORDER_ACTION_QUEUES).size).toBe(EVERY_KEY.length);
  });

  it("the retired `Confirm delivery` is gone, not merely unused (C3)", () => {
    // Exact match, never a substring: `Confirm delivery date` is a live action
    // and shares its opening words.
    expect(ORDER_ACTION_QUEUES).not.toContain("Confirm delivery");
    expect(orderActionForQueue("Confirm delivery")).toBeNull();
  });
});
