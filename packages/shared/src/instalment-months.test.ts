import { describe, expect, it } from "vitest";
import { INSTALMENT_MONTHS } from "./constants";
import { installmentMonthsField, createOrderInputSchema } from "./schemas/orders";

/**
 * AN OFFER AND A LIMIT ARE DIFFERENT FACTS (YH, 2026-09-01).
 *
 * `INSTALMENT_MONTHS` is what the POS OFFERS — the standard plans a
 * salesperson taps. `installmentMonthsField` is what the system will HOLD.
 * They were the same thing until today, and collapsing them is what produced
 * the failure the ruling came from: a proposal of 9 months saved, travelled
 * through every layer, and died on `0007`'s CHECK at the PRINCIPAL's Approve
 * press — the shop's button list refusing a decision she had already made.
 *
 * ⚠️ 6 AND 12 WERE NEVER A RECORDED DECISION. Measured 2026-09-01: no ruling
 * from Jess, Chai or Loo anywhere in the repository, and `0007`'s own header
 * explains only why the COLUMN exists. Every "6/12" in the docs beside their
 * names is a DATE — 12 June, 6 December — not a month count.
 */
describe("instalment months — what is offered, and what is accepted", () => {
  it("accepts any whole number of months, one or more", () => {
    for (const m of [1, 3, 6, 9, 12, 18, 24, 36, 60]) {
      expect(installmentMonthsField.safeParse(m).success, `${m} months`).toBe(true);
    }
  });

  it("accepts null — no instalment, and how an amendment takes a plan off", () => {
    expect(installmentMonthsField.safeParse(null).success).toBe(true);
  });

  it("refuses the two values that cannot mean a plan, and any fraction", () => {
    for (const m of [0, -6, 1.5]) {
      expect(installmentMonthsField.safeParse(m).success, `${m} months`).toBe(false);
    }
  });

  it("still accepts every plan the POS offers", () => {
    /* The offered list must remain a subset of what the system holds, or a
       button on the shop floor dies at the database. */
    for (const m of INSTALMENT_MONTHS) {
      expect(installmentMonthsField.safeParse(m).success, `offered ${m}`).toBe(true);
    }
  });

  /* ⛔ AND THE CREATE DOOR IS DELIBERATELY NARROWER. `create_order` (0230:85)
     raises `installment_months must be 6 or 12` on its own, so a create schema
     that accepted 9 would only move the failure one layer deeper — which is
     exactly the shape this whole change removes from the amendment door. */
  it("keeps the create door at the offered plans, because the RPC refuses the rest", () => {
    const base = {
      customerName: "Kong Chai Yin",
      lines: [{ sku: "B1201S-K", qty: 1, unitPrice: 1890 }],
    } as Record<string, unknown>;
    const with9 = createOrderInputSchema.safeParse({
      ...base,
      paymentMethod: "installment",
      installmentMonths: 9,
    });
    expect(with9.success, "9 months is not a POS plan").toBe(false);
  });
});
