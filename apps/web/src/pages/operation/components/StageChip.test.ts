import { describe, expect, it } from "vitest";

import { displayStageOf, stageOf } from "./StageChip";

/**
 * D3 — TWO QUESTIONS, ONE SPELLING EACH (docs/orders/MASTER.md §12).
 *
 * §12 recorded this as "two spellings of one derivation, in two files". The
 * measurement says otherwise, and the difference is the whole finding: the
 * list's copy and the drawer's copy answered two DIFFERENT questions, and
 * nothing in either file named the difference.
 *
 * Merging them is the obvious move and it is wrong — `controlTabOf` ends with
 * `return "proceed"; // confirmed OR autocount-placed`, so an imported order
 * has to REACH `placed` for that fall-through to route it. Six tests in the
 * control suite caught that when it was tried.
 *
 * So the questions get two names, one spelling each, in the module that owns
 * the type.
 */
describe("stageOf — where the order sits in the pipeline (raw)", () => {
  it("`place` is a real slot, and imports reach it too", () => {
    // Load-bearing: `controlTabOf` routes an imported `placed` row to `proceed`
    // by falling past every branch. Teaching this rule about `source_system`
    // moves those rows to the wrong tab.
    expect(stageOf({ status: "place" })).toBe("placed");
  });

  it("an explicit operation_stage answers when the status is not `place`", () => {
    expect(stageOf({ status: "proceed", operation_stage: "dispatched" })).toBe("dispatched");
  });

  it("`place` outranks operation_stage", () => {
    // Both retired copies tested `status === "place"` FIRST. `place` means "not
    // yet proceeded", and a stage written before proceeding does not change it.
    expect(stageOf({ status: "place", operation_stage: "ready_to_dispatch" })).toBe("placed");
  });

  it("delivered, then in production, and never a bogus default", () => {
    expect(stageOf({ status: "delivered" })).toBe("delivered");
    expect(stageOf({})).toBe("in_production");
  });
});

describe("displayStageOf — what the operator is told", () => {
  it("an AutoCount import is NEVER shown as `placed`", () => {
    // Jess, 2026-07-02: an import arrives ALREADY proceeded and carries a PO,
    // so "waiting for the dealer to push" is wrong copy for it. The drawer
    // obeyed this; nothing named it, so it read as an accidental divergence.
    expect(displayStageOf({ status: "place", source_system: "autocount" })).toBe("in_production");
  });

  it("an import's real stage is read once the `place` branch lets go", () => {
    expect(
      displayStageOf({
        status: "place",
        operation_stage: "dispatched",
        source_system: "autocount",
      }),
    ).toBe("dispatched");
  });

  it("a native order is untouched — display and pipeline agree", () => {
    expect(displayStageOf({ status: "place", source_system: "pos" })).toBe("placed");
    expect(displayStageOf({ status: "place", source_system: "pos" })).toBe(
      stageOf({ status: "place" }),
    );
  });

  it("the two rules differ on exactly one case, and only that one", () => {
    const imported = { status: "place", source_system: "autocount" };
    // The one divergence, stated as a test so nobody "tidies" it away.
    expect(displayStageOf(imported)).not.toBe(stageOf(imported));
    // Everything else agrees.
    for (const o of [
      { status: "delivered", source_system: "autocount" },
      { status: "proceed", operation_stage: "ready_to_dispatch", source_system: "autocount" },
      { status: "place", source_system: "pos" },
      {},
    ]) {
      expect(displayStageOf(o)).toBe(stageOf(o));
    }
  });
});
