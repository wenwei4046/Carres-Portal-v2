import { describe, expect, it } from "vitest";

import { orderActionChecklist } from "./order-action-checklist";
import { orderActionButton, type OrderActionKey } from "./order-action-words";
import {
  openOrderActions,
  type OrderActionSignals,
} from "./order-actions";

/**
 * C6 — the steps that close an action.
 *
 * The card's DONE WHEN is two sentences: "every built action closes itself from
 * a real signal; no tick-box in the portal records only an assertion". The
 * second is structural (there is no writer in the module or its renderer, and
 * the component test asserts that); these tests hold the first, plus the one
 * invariant that keeps the screen honest: **an action that is open always has at
 * least one step that is not ticked.** A fully-ticked list beside a live action
 * is the screen contradicting itself, and it is the only way this feature can
 * lie.
 */

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

/** A neutral order: nothing ordered, nothing arranged, nothing owed. */
const BASE: OrderActionSignals = {
  completed: false,
  goodsReady: false,
  goodsUnordered: true,
  stockEtaIso: null,
  promisedDateIso: "2026-08-20",
  daysToDue: 24,
  stockWindowDays: 7,
  hasLogistics: false,
  bookingConfirmed: false,
  confirmedDateIso: null,
  todayIso: "2026-07-27",
  photoOnFile: null,
  moneyOwing: false,
};
const sig = (over: Partial<OrderActionSignals> = {}): OrderActionSignals => ({
  ...BASE,
  ...over,
});

describe("C6 · the checklist's shape", () => {
  it("ends with the action's own outcome, and that step is never ticked", () => {
    for (const key of EVERY_KEY) {
      const steps = orderActionChecklist(key, sig());
      if (steps.length === 0) continue;
      const last = steps[steps.length - 1];
      expect(last.key).toBe(key);
      expect(last.state).toBe("open");
    }
  });

  it("gives `deliver_today` no sub-steps — nobody records loading or departure", () => {
    expect(orderActionChecklist("deliver_today", sig())).toEqual([]);
  });

  it("gives the two FACTS no steps — there is nothing to close", () => {
    expect(orderActionChecklist("delivering", sig())).toEqual([]);
    expect(orderActionChecklist("done", sig())).toEqual([]);
  });

  it("never runs past four steps (COPY-STANDARD's step-block template)", () => {
    for (const key of EVERY_KEY)
      expect(orderActionChecklist(key, sig()).length).toBeLessThanOrEqual(4);
  });

  it("every step is one of the portal's own actions, so every step has a button word", () => {
    for (const key of EVERY_KEY)
      for (const st of orderActionChecklist(key, sig()))
        expect(orderActionButton(st.key)).toBeTruthy();
  });
});

describe("C6 · a step reads a real signal, never an assertion", () => {
  it("`Issue PO` ticks once a formal PO covers the goods", () => {
    expect(
      orderActionChecklist("confirm_ready_date", sig({ goodsUnordered: true }))[0],
    ).toEqual({ key: "issue_po", state: "open" });
    expect(
      orderActionChecklist("confirm_ready_date", sig({ goodsUnordered: false }))[0],
    ).toEqual({ key: "issue_po", state: "done" });
  });

  it("`Issue PO` is where the goods track starts — no earlier step", () => {
    expect(orderActionChecklist("issue_po", sig())).toEqual([
      { key: "issue_po", state: "open" },
    ]);
  });

  it("`Record ready date` ticks once a supplier date is on file", () => {
    expect(
      orderActionChecklist("delay_planning", sig({ stockEtaIso: null }))[0].state,
    ).toBe("open");
    expect(
      orderActionChecklist("delay_planning", sig({ stockEtaIso: "2026-09-01" }))[0]
        .state,
    ).toBe("done");
  });

  it("C8 · `Record the delay decision` ticks once a decision exists — the GATE, on screen", () => {
    // §3's third invariant made visible: stage 2 cannot be reached with an
    // un-ticked decision above it.
    expect(
      orderActionChecklist(
        "arrange_new_delivery_date",
        sig({ delayDecision: null }),
      )[0],
    ).toEqual({ key: "delay_planning", state: "open" });
    expect(
      orderActionChecklist(
        "arrange_new_delivery_date",
        sig({ delayDecision: "new_date" }),
      )[0],
    ).toEqual({ key: "delay_planning", state: "done" });
  });

  it("`Assign logistics` ticks once a company is picked", () => {
    expect(
      orderActionChecklist("confirm_delivery_date", sig({ hasLogistics: false }))[0]
        .state,
    ).toBe("open");
    expect(
      orderActionChecklist("confirm_delivery_date", sig({ hasLogistics: true }))[0],
    ).toEqual({ key: "assign_logistics", state: "done" });
  });

  it("`Confirm booking` ticks once the customer confirmed — C7's one measured step", () => {
    expect(
      orderActionChecklist(
        "issue_delivery_order",
        sig({ bookingConfirmed: false }),
      )[0],
    ).toEqual({ key: "confirm_delivery_date", state: "open" });
    expect(
      orderActionChecklist(
        "issue_delivery_order",
        sig({ bookingConfirmed: true }),
      )[0],
    ).toEqual({ key: "confirm_delivery_date", state: "done" });
  });

  it("`Mark delivered` ticks once the order reached the customer", () => {
    expect(
      orderActionChecklist("upload_delivery_photo", sig({ completed: true }))[0],
    ).toEqual({ key: "deliver_today", state: "done" });
  });

  it("the goods and delivery tracks are not steps of collecting money", () => {
    // Money survives delivery (working flow §3) — nothing upstream closes it.
    expect(
      orderActionChecklist(
        "collect",
        sig({ completed: true, goodsReady: true, hasLogistics: true }),
      ),
    ).toEqual([{ key: "collect", state: "open" }]);
  });
});

describe("C6 · the invariant — an open action is never a fully ticked list", () => {
  // A matrix over every boolean signal the checklist can read, plus the two
  // dates that decide the goods rungs, plus C7's three-way "is the delivery
  // order issued?", plus C8's three-way delay decision. 2^6 × 3 × 3 × 3 × 3
  // combinations, each run through LAYER 1 and then through its own checklist.
  const BOOLS = [false, true];
  it("holds for every open action the engine can raise", () => {
    let checked = 0;
    for (const completed of BOOLS)
      for (const goodsReady of BOOLS)
        for (const goodsUnordered of BOOLS)
          for (const hasLogistics of BOOLS)
            for (const bookingConfirmed of BOOLS)
              for (const moneyOwing of BOOLS)
                for (const stockEtaIso of [null, "2026-08-01", "2026-09-30"])
                  for (const daysToDue of [24, 0, -3])
                    for (const deliveryOrderIssued of [null, false, true])
                      for (const delayDecision of [
                        null,
                        "keep",
                        "new_date",
                      ] as const) {
                        const s = sig({
                          completed,
                          goodsReady,
                          goodsUnordered,
                          hasLogistics,
                          bookingConfirmed,
                          moneyOwing,
                          stockEtaIso,
                          daysToDue,
                          deliveryOrderIssued,
                          delayDecision,
                          // The decision points AT the current supplier date, so
                          // the matrix exercises the decided branch rather than
                          // the stale-decision one (which has its own tests).
                          delayDecisionEtaIso: stockEtaIso,
                          photoOnFile: false,
                          confirmedDateIso: bookingConfirmed ? "2026-08-20" : null,
                        });
                        for (const a of openOrderActions(s)) {
                          const steps = orderActionChecklist(a.key, s);
                          checked += 1;
                          if (steps.length === 0) continue;
                          expect(steps.some((st) => st.state === "open")).toBe(true);
                        }
                      }
    // A guard on the guard: if the loop ever stops raising actions, the
    // assertion above passes vacuously and proves nothing.
    expect(checked).toBeGreaterThan(200);
  });
});
