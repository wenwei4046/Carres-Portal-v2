import { describe, expect, it } from "vitest";

import {
  HELD_STOCK_STATUS,
  OPS_STOCK_STATUS_LABEL,
  RETURNED_STOCK_STATUS,
  SELLABLE_STOCK_STATUSES,
  STOCK_HOLD_OUTCOMES,
  STOCK_HOLD_OUTCOME_KEYS,
  STOCK_HOLD_OUTCOME_STATUS,
  STOCK_HOLD_REASONS,
  STOCK_HOLD_RESOLVE_PROBLEM_TEXT,
  TERMINAL_STOCK_STATUSES,
  WRITTEN_OFF_STOCK_STATUS,
  heldUnitsLine,
  holdOutcomeNeedsNote,
  holdResolveProblems,
  isHeldStockStatus,
  isSellableStockStatus,
  opsStockStatusLabel,
  stockHoldOutcomeLabel,
  stockHoldReasonLabel,
} from "./stock-hold";
import { opsStockStatusSchema } from "./schemas/ops-stock";

/**
 * R4 · Problem stock is quarantined
 * (docs/receiving-claim-execution-queue.md, locked with Jess 2026-07-27).
 *
 * The card's done-when is "a held unit is invisible to every sell/reserve/
 * deliver path, provably", and the proof has two halves that must not drift:
 * the DATABASE half (a trigger in 0299 refuses `on_hold → reserved|sold|
 * transferred`, dry-run-asserted against live before apply) and the shape
 * asserted here — that exactly one status is sellable, and it is not the held
 * one.
 */

describe("R4 · which statuses can be sold", () => {
  it("exactly one status is sellable, and it is `free`", () => {
    // Stated as an equality rather than a membership check on purpose: a future
    // card that quietly widens this list should fail here and have to argue for
    // it, not slip through because `free` is still in the array.
    expect([...SELLABLE_STOCK_STATUSES]).toEqual(["free"]);
  });

  it("a held unit is not sellable", () => {
    expect(isSellableStockStatus(HELD_STOCK_STATUS)).toBe(false);
    expect(isHeldStockStatus(HELD_STOCK_STATUS)).toBe(true);
  });

  it("neither is a unit that physically left", () => {
    for (const s of TERMINAL_STOCK_STATUSES) {
      expect(isSellableStockStatus(s)).toBe(false);
      // Terminal is not the same thing as held: nothing is left to decide.
      expect(isHeldStockStatus(s)).toBe(false);
    }
  });

  it("null and unknown statuses are never sellable", () => {
    expect(isSellableStockStatus(null)).toBe(false);
    expect(isSellableStockStatus(undefined)).toBe(false);
    expect(isSellableStockStatus("nonsense")).toBe(false);
  });

  it("the zod contract accepts all three new statuses", () => {
    // The API's list endpoints parse rows against this schema; a status the DB
    // can store but the contract rejects would 500 the register the first time
    // a unit is held.
    for (const s of [
      HELD_STOCK_STATUS,
      RETURNED_STOCK_STATUS,
      WRITTEN_OFF_STOCK_STATUS,
    ]) {
      expect(opsStockStatusSchema.safeParse(s).success).toBe(true);
    }
  });

  it("every status the contract allows has a label", () => {
    // The register printed the raw column value before R4, which is how
    // `written_off` would have reached the screen reading "written_off".
    for (const s of opsStockStatusSchema.options) {
      expect(OPS_STOCK_STATUS_LABEL[s]).toBeTruthy();
      expect(opsStockStatusLabel(s)).not.toBe(s);
    }
  });

  it("an unknown status prints itself rather than a blank", () => {
    expect(opsStockStatusLabel("brand_new_thing")).toBe("brand_new_thing");
    expect(opsStockStatusLabel(null)).toBe("—");
  });
});

describe("R4 · why a unit is held", () => {
  it("the two reasons are R2's disjoint domains and nothing else", () => {
    expect(STOCK_HOLD_REASONS.map((r) => r.key)).toEqual([
      "damaged",
      "wrong_item",
    ]);
  });

  it("labels are words, not keys", () => {
    expect(stockHoldReasonLabel("damaged")).toBe("Arrived damaged");
    expect(stockHoldReasonLabel("wrong_item")).toBe("Wrong item");
    expect(stockHoldReasonLabel(null)).toBe("—");
  });
});

describe("R4 · how a hold ends", () => {
  it("there are exactly the card's three outcomes", () => {
    expect([...STOCK_HOLD_OUTCOME_KEYS]).toEqual([
      "back_to_stock",
      "returned",
      "written_off",
    ]);
  });

  it("only `back_to_stock` lands a unit somewhere sellable", () => {
    expect(STOCK_HOLD_OUTCOME_STATUS.back_to_stock).toBe("free");
    expect(isSellableStockStatus(STOCK_HOLD_OUTCOME_STATUS.back_to_stock)).toBe(
      true,
    );
    expect(isSellableStockStatus(STOCK_HOLD_OUTCOME_STATUS.returned)).toBe(false);
    expect(isSellableStockStatus(STOCK_HOLD_OUTCOME_STATUS.written_off)).toBe(
      false,
    );
  });

  it("only a write-off must say why", () => {
    expect(holdOutcomeNeedsNote("written_off")).toBe(true);
    expect(holdOutcomeNeedsNote("back_to_stock")).toBe(false);
    expect(holdOutcomeNeedsNote("returned")).toBe(false);
    expect(holdOutcomeNeedsNote(null)).toBe(false);
  });

  it("every outcome has a label", () => {
    for (const o of STOCK_HOLD_OUTCOMES) {
      expect(stockHoldOutcomeLabel(o.key)).toBe(o.label);
    }
    expect(stockHoldOutcomeLabel(null)).toBe("—");
  });
});

describe("R4 · what blocks the resolution", () => {
  it("a clean back-to-stock with units on hold is ready", () => {
    expect(
      holdResolveProblems({ heldUnits: 2, outcome: "back_to_stock", note: "" }),
    ).toEqual([]);
  });

  it("nothing on hold means nothing to resolve", () => {
    expect(
      holdResolveProblems({ heldUnits: 0, outcome: "returned", note: "" }),
    ).toContain("no_held_units");
  });

  it("an outcome must be picked", () => {
    expect(
      holdResolveProblems({ heldUnits: 1, outcome: null, note: "" }),
    ).toEqual(["outcome_required"]);
  });

  it("a write-off with no words is refused, whitespace included", () => {
    expect(
      holdResolveProblems({ heldUnits: 1, outcome: "written_off", note: "   " }),
    ).toEqual(["note_required"]);
    expect(
      holdResolveProblems({
        heldUnits: 1,
        outcome: "written_off",
        note: "crushed in transit, unsellable",
      }),
    ).toEqual([]);
  });

  it("every problem has plain words for the operator", () => {
    const problems = holdResolveProblems({
      heldUnits: 0,
      outcome: null,
      note: "",
    });
    for (const p of problems) {
      expect(STOCK_HOLD_RESOLVE_PROBLEM_TEXT[p]).toBeTruthy();
    }
  });
});

describe("R4 · the sentence the panel shows", () => {
  it("says the units cannot be sold — the point of the card, out loud", () => {
    const line = heldUnitsLine(2, "damaged");
    expect(line).toContain("2 units on hold");
    expect(line).toContain("Arrived damaged");
    expect(line).toContain("cannot be sold, reserved or delivered");
  });

  it("counts one unit as one unit", () => {
    expect(heldUnitsLine(1, "wrong_item")).toContain("1 unit on hold");
    expect(heldUnitsLine(1, "wrong_item")).not.toContain("1 units");
  });

  it("nothing held is a real answer, not a blank", () => {
    // A late-delivery claim, or a partner warehouse that keeps no per-unit
    // register: 0 means "there is nothing here", never "still loading".
    expect(heldUnitsLine(0)).toBe(
      "Nothing on hold — these units are not in the register.",
    );
  });
});
