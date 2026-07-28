import { describe, expect, it } from "vitest";

import {
  ORDER_ACTION_QUEUES,
  collectPillLabel,
  orderActionButton,
  orderActionDone,
  orderActionForQueue,
  orderActionLine,
  orderActionQueue,
  type OrderActionKey,
} from "./order-action-words";

const EVERY_KEY: OrderActionKey[] = [
  "send_po",
  "confirm_ready_date",
  "delay_planning",
  "arrange_new_delivery_date",
  "assign_logistics",
  "confirm_delivery_date",
  "issue_delivery_order",
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
    expect(orderActionQueue("arrange_new_delivery_date")).toBe(
      "Arrange new delivery date",
    );
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
    expect(
      orderActionLine("arrange_new_delivery_date", { logistics: "NETS" }),
    ).toBe("Call NETS — arrange new delivery date");
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
    expect(orderActionLine("arrange_new_delivery_date", { logistics: null })).toBe(
      "Call logistics — arrange new delivery date",
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

  it("the party-less four read the same as their queue word", () => {
    // C7 adds `issue_delivery_order`: the SYSTEM produces the document, so
    // there is no outside party to name (COPY-STANDARD's action naming law
    // lists it beside `Assign logistics` and `Upload delivery photo`).
    // C8 adds `delay_planning`: an internal decision, nobody outside involved.
    for (const key of [
      "assign_logistics",
      "issue_delivery_order",
      "deliver_today",
      "upload_delivery_photo",
      "delay_planning",
    ] as const)
      expect(orderActionLine(key, { logistics: "NETS" })).toBe(orderActionQueue(key));
  });
});

describe("C8 · the delay words — the dictionary won, and rung 2 lost the customer", () => {
  it("spells both stages exactly as COPY-STANDARD's dictionary and vocabulary table", () => {
    // Stage 1 — the vocabulary table's own phrase for "working out what to do
    // about a delay, before anyone calls the customer".
    expect(orderActionQueue("delay_planning")).toBe("Delay planning");
    expect(orderActionLine("delay_planning")).toBe("Delay planning");
    expect(orderActionButton("delay_planning")).toBe("Record the delay decision");
    // Stage 2 — the dictionary row, verbatim.
    expect(orderActionQueue("arrange_new_delivery_date")).toBe(
      "Arrange new delivery date",
    );
    expect(
      orderActionLine("arrange_new_delivery_date", { logistics: "NETS Logistics" }),
    ).toBe("Call NETS Logistics — arrange new delivery date");
    expect(orderActionButton("arrange_new_delivery_date")).toBe("Record new date");
  });

  it("NO delay word opens a call to the customer — Law 4 rung 2, as a guard", () => {
    // `Rung 2 never names the customer. Carres does not phone a customer about
    // a delay — logistics carries that conversation. Any surface that opens a
    // customer call about a delay is wrong.` The customer's real name is fed in
    // deliberately: if either line ever reads it, this fails.
    for (const key of ["delay_planning", "arrange_new_delivery_date"] as const) {
      const line = orderActionLine(key, {
        customer: "John Tan",
        logistics: "NETS",
        supplier: "Ohana",
      });
      expect(line).not.toMatch(/John Tan/);
      expect(line).not.toMatch(/\bcustomer\b/i);
    }
  });

  it("the retired `Agree new delivery date` is gone, not merely unused", () => {
    expect(ORDER_ACTION_QUEUES).not.toContain("Agree new delivery date");
    expect(orderActionForQueue("Agree new delivery date")).toBeNull();
    for (const key of EVERY_KEY) {
      expect(orderActionQueue(key)).not.toMatch(/\bagree\b/i);
      expect(orderActionLine(key, { customer: "A", logistics: "B" })).not.toMatch(
        /\bagree\b/i,
      );
    }
  });

  it("`Recovery` — the banned word — appears nowhere (COPY-STANDARD)", () => {
    for (const key of EVERY_KEY) {
      expect(orderActionQueue(key)).not.toMatch(/\brecovery\b/i);
      expect(orderActionButton(key) ?? "").not.toMatch(/\brecovery\b/i);
    }
  });
});

describe("C7 · the delivery order's own words", () => {
  it("spells all three mirrored strings exactly as COPY-STANDARD's dictionary", () => {
    expect(orderActionQueue("issue_delivery_order")).toBe("Issue delivery order");
    expect(orderActionLine("issue_delivery_order")).toBe("Issue delivery order");
    expect(orderActionDone("issue_delivery_order")).toBe("Delivery order issued");
  });

  it("mirrors a DONE message only where a surface reads one", () => {
    // The other eight are locked in the dictionary and deliberately not copied
    // here: a mirrored string nothing renders is the dead code C10 spent a card
    // resurrecting. `null` means "not mirrored yet", never "records nothing".
    const mirrored = EVERY_KEY.filter((k) => orderActionDone(k) !== null);
    expect(mirrored).toEqual(["issue_delivery_order"]);
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
