import { describe, expect, it } from "vitest";
import { INSTALMENT_MONTHS } from "./constants";
import { installmentMonthsField } from "./schemas/orders";

/**
 * THE TERMS ON SCREEN AND THE TERMS EVERY DOOR ACCEPTS ARE ONE LIST.
 *
 * THE FAILURE THIS CLOSES. A proposal of 9 instalment months saved, travelled
 * through every layer, and died on `0007`'s CHECK at the PRINCIPAL's Approve
 * press — raw constraint text on the screen of the person who had just decided
 * the change was fine. The union was typed out inline in three places and the
 * amendment route declared its own weaker rule, `z.number().int().min(0)`.
 *
 * ⚠️ THE FIX WENT THE OTHER WAY FIRST, AND THE OWNER REVERSED IT. Widening the
 * database to any whole number was written as `0411` and withdrawn unapplied.
 * The owner's answer: if the POS sells 6 and 12, keep 6 and 12 — and widen only
 * if the principal can still hit that error. She cannot. The error existed
 * because the amendment form was a free number box; a picker of the same two
 * plans makes the failure structurally impossible rather than refused earlier.
 * Keeping that reasoning here is the point — the next reader will find `0411`
 * in the history and should know why it is not in the tree.
 *
 * ⚠️ AND 6 AND 12 ARE STILL NOT A WRITTEN-DOWN DECISION. Measured 2026-09-01:
 * no ruling from Jess, Chai or Loo anywhere in the repository, and `0007`'s own
 * header explains only why the COLUMN exists. Every "6/12" in the docs beside
 * their names is a DATE — 12 June, 6 December — not a month count. The owner
 * has now decided to keep them; that is the ruling, and it is dated here.
 */
describe("instalment months — one list, every door", () => {
  it("accepts every term the pickers offer", () => {
    for (const m of INSTALMENT_MONTHS) {
      expect(installmentMonthsField.safeParse(m).success, `${m} months`).toBe(true);
    }
  });

  it("accepts null — no instalment, and how an amendment takes a plan off", () => {
    expect(installmentMonthsField.safeParse(null).success).toBe(true);
  });

  it("refuses a term no picker offers — including the 9 that started this", () => {
    for (const m of [0, 1, 5, 9, 18, 24, 36, -6, 1.5]) {
      expect(installmentMonthsField.safeParse(m).success, `${m} months`).toBe(false);
    }
  });

  it("offers nothing any door would refuse", () => {
    /* The other direction, and the one that fails silently: a term added to
       the offered list without the schema is a button that dies at the
       database — which is the shape of the original defect. */
    const orphaned = INSTALMENT_MONTHS.filter((m) => !installmentMonthsField.safeParse(m).success);
    expect(orphaned, "every offered term parses").toEqual([]);
  });
});
