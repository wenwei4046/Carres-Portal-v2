import { describe, expect, it } from "vitest";
import { INSTALMENT_MONTHS } from "./constants";
import { installmentMonthsField } from "./schemas/orders";

/**
 * THE TERMS ON SCREEN AND THE TERMS THE SCHEMA ACCEPTS ARE ONE LIST.
 *
 * The union was typed out inline in three places and a FOURTH door — the
 * amendment route — declared its own weaker rule, `z.number().int().min(0)`.
 * So a proposal of 9 months passed every layer above the database and failed
 * on `0007`'s CHECK at the PRINCIPAL's Approve press, as raw constraint text,
 * on the screen of the one person who could not fix it.
 *
 * `INSTALMENT_MONTHS` is what the pickers render and `installmentMonthsField`
 * is what every door parses. These pin them level, because the failure mode is
 * silent in both directions: a term offered that the schema refuses is a dead
 * button, and a term the schema accepts that no picker offers is a value only a
 * curl can produce.
 *
 * ⚠️ 6 AND 12 ARE NOT A RECORDED DECISION. Nobody wrote down why. Measured
 * 2026-09-01: no ruling from Jess, Chai or Loo anywhere in the repository, and
 * `0007`'s own header explains only why the COLUMN exists. Every "6/12" in the
 * docs beside their names is a DATE — 12 June, 6 December — not a month count.
 * This test pins the layers to each other, never the business rule to 6 and 12.
 */
describe("instalment months — one list, every door", () => {
  it("accepts every term the pickers offer", () => {
    for (const m of INSTALMENT_MONTHS) {
      expect(installmentMonthsField.safeParse(m).success, `${m} months`).toBe(true);
    }
  });

  it("accepts null — an order with no instalment plan, and an amendment taking one off", () => {
    expect(installmentMonthsField.safeParse(null).success).toBe(true);
  });

  it("refuses a term no picker offers, which is the defect this closes", () => {
    for (const m of [0, 1, 5, 9, 24, 36, -6]) {
      expect(installmentMonthsField.safeParse(m).success, `${m} months`).toBe(false);
    }
  });

  it("offers nothing the schema would refuse", () => {
    /* The other direction. A term added to the list without the schema is a
       button that dies at the database. */
    const offered = INSTALMENT_MONTHS.filter((m) => !installmentMonthsField.safeParse(m).success);
    expect(offered, "every offered term parses").toEqual([]);
  });
});
