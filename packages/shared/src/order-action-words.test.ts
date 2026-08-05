import { describe, expect, it } from "vitest";

import {
  ORDER_ACTION_QUEUES,
  PURCHASING_ACTION_QUEUES,
  collectPillLabel,
  orderActionButton,
  orderActionDone,
  orderActionForQueue,
  orderActionLine,
  orderActionQueue,
  purchasingActionButton,
  purchasingActionDone,
  purchasingActionEmpty,
  purchasingActionLine,
  purchasingActionQueue,
  tomorrowDeliveryAnswerLabel,
  type OrderActionKey,
  type PurchasingActionKey,
} from "./order-action-words";

const EVERY_KEY: OrderActionKey[] = [
  "issue_po",
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
    expect(orderActionQueue("issue_po")).toBe("Issue PO");
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
    expect(orderActionLine("issue_po", { supplier: "Ohana" })).toBe(
      "Issue PO to Ohana",
    );
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
    // C11 — the amount is a NUMBER and the module spells it, to the cent.
    expect(orderActionLine("collect", { amount: 2455, customer: "John Tan" })).toBe(
      "Collect RM 2,455.00 from John Tan",
    );
    expect(orderActionLine("collect", { customer: "John Tan" })).toBe(
      "Collect from John Tan",
    );
    expect(collectPillLabel(2455)).toBe("Collect RM 2,455.00");
    expect(collectPillLabel(null)).toBe("Collect");
    // The pill deliberately drops the customer — their name is on the same row.
    expect(collectPillLabel(2455)).not.toMatch(/from/);
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
        orderActionLine(key, { amount: 1000, customer: "A", supplier: "B", logistics: "C" }),
      ).not.toMatch(BANNED);
    }
    expect(collectPillLabel(1000)).not.toMatch(BANNED);
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

/**
 * The PURCHASING table — COPY-STANDARD's second dictionary, transcribed here so
 * a rename in one file fails in the other. It had no test until P3, which is
 * how `Confirm tomorrow's delivery` and `Confirm balance delivery date` could
 * sit locked in the law and absent from the mirror for a fortnight.
 */
describe("purchasing action words — the dictionary, verbatim", () => {
  const EVERY_PURCHASING_KEY: PurchasingActionKey[] = [
    "issue_po",
    "confirm_ready_date",
    "confirm_tomorrows_delivery",
    "check_in",
    "confirm_balance_delivery_date",
    "confirm_what_happens_next",
  ];

  it("spells all six queue words exactly as COPY-STANDARD does", () => {
    expect(EVERY_PURCHASING_KEY.map(purchasingActionQueue)).toEqual([
      "Issue PO",
      "Confirm ready date",
      "Confirm tomorrow's delivery",
      "Check in",
      "Confirm balance delivery date",
      "Confirm what happens next",
    ]);
    expect([...PURCHASING_ACTION_QUEUES]).toEqual(
      EVERY_PURCHASING_KEY.map(purchasingActionQueue),
    );
  });

  it("P3's two rows carry all five strings", () => {
    expect(purchasingActionLine("confirm_tomorrows_delivery", { supplier: "Ohana" }))
      .toBe("Call Ohana — confirm tomorrow's delivery");
    expect(purchasingActionButton("confirm_tomorrows_delivery")).toBe("Record answer");
    expect(purchasingActionDone("confirm_tomorrows_delivery")).toBe("Answer recorded");
    expect(purchasingActionEmpty("confirm_tomorrows_delivery"))
      .toBe("Nothing arriving tomorrow.");

    expect(purchasingActionLine("confirm_balance_delivery_date", { supplier: "Ohana" }))
      .toBe("Call Ohana — confirm balance delivery date");
    expect(purchasingActionButton("confirm_balance_delivery_date"))
      .toBe("Record balance date");
    expect(purchasingActionDone("confirm_balance_delivery_date"))
      .toBe("Balance date recorded");
    expect(purchasingActionEmpty("confirm_balance_delivery_date"))
      .toBe("Nothing short today.");
  });

  it("falls back to the role word, never to an empty gap", () => {
    expect(purchasingActionLine("confirm_tomorrows_delivery"))
      .toBe("Call supplier — confirm tomorrow's delivery");
    expect(purchasingActionLine("confirm_balance_delivery_date", { supplier: "  " }))
      .toBe("Call supplier — confirm balance delivery date");
  });

  it("the two shared rows are read back, never respelt", () => {
    // COPY-STANDARD: the PURCHASING table is the canonical home for `Issue PO`
    // and `Confirm ready date`; the Orders ladder DISPLAYS them and does not
    // respell them. One string, read twice.
    expect(purchasingActionQueue("issue_po")).toBe(orderActionQueue("issue_po"));
    expect(purchasingActionButton("issue_po"))
      .toBe(orderActionButton("issue_po"));
    expect(purchasingActionButton("confirm_ready_date"))
      .toBe(orderActionButton("confirm_ready_date"));
  });

  // P7A · `Send PO` is RETIRED, and so is the verb `Send`. A rename card proves
  // itself in BOTH directions: the new word present, the old one gone.
  it("no surface can say `Send PO`, and no action verb is `Send`", () => {
    for (const q of ORDER_ACTION_QUEUES) expect(q).not.toMatch(/\bSend\b/);
    for (const q of PURCHASING_ACTION_QUEUES) expect(q).not.toMatch(/\bSend\b/);
    for (const key of EVERY_KEY) {
      expect(orderActionLine(key, { supplier: "Ohana" })).not.toMatch(/\bSend\b/);
      expect(orderActionButton(key) ?? "").not.toMatch(/\bSend\b/);
    }
    for (const key of EVERY_PURCHASING_KEY) {
      expect(purchasingActionLine(key, { supplier: "Ohana" })).not.toMatch(
        /\bSend\b/,
      );
      expect(purchasingActionButton(key)).not.toMatch(/\bSend\b/);
    }
    expect(orderActionForQueue("Send PO")).toBeNull();
  });

  it("the purchasing act carries the strings COPY-STANDARD can hold here", () => {
    expect(purchasingActionLine("issue_po", { supplier: "Ohana" }))
      .toBe("Issue PO to Ohana");
    expect(purchasingActionButton("issue_po")).toBe("Issue PO");
    // The role word, never an empty gap.
    expect(purchasingActionLine("issue_po")).toBe("Issue PO to supplier");
    expect(purchasingActionLine("issue_po", { supplier: "  " }))
      .toBe("Issue PO to supplier");
  });

  it("the two answers name the DATE, so they stay true however late they are read", () => {
    // Loo's own reason for ruling them (2026-07-29). A relative word would be a
    // sentence about a day that has already passed.
    expect(tomorrowDeliveryAnswerLabel("shipping", "Wed, 5 Aug 26"))
      .toBe("It ships on Wed, 5 Aug 26");
    expect(tomorrowDeliveryAnswerLabel("delayed", "Wed, 5 Aug 26"))
      .toBe("It ships later than Wed, 5 Aug 26");
    for (const a of ["shipping", "delayed"] as const) {
      expect(tomorrowDeliveryAnswerLabel(a, "Wed, 5 Aug 26")).not.toMatch(
        /\b(tomorrow|today|yesterday|now|soon)\b/i,
      );
    }
  });

  it("no banned word reaches a purchasing queue word or row line", () => {
    const BANNED =
      /\b(chase|chased|POD|proof of delivery|unscheduled|not booked|need booking|pending|processing|in progress|at risk|attention|inventory|movements)\b/i;
    for (const key of EVERY_PURCHASING_KEY) {
      expect(purchasingActionQueue(key)).not.toMatch(BANNED);
      expect(purchasingActionLine(key, { supplier: "Ohana" })).not.toMatch(BANNED);
      expect(purchasingActionButton(key)).not.toMatch(BANNED);
    }
  });
});
