/**
 * THE CUSTOMER SIGNS WHAT THE CUSTOMER RECEIVES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT HAPPENED
 *
 * The T&C clauses appear on TWO surfaces: the POS signature screen
 * (`Step3SignaturePayment.tsx`) where the customer reads and signs them, and
 * `sales-order-template.tsx` which prints them on the PDF they receive. For a
 * year each file held its own copy of the sentences, under a comment asking
 * future editors to "touch both files together". Twice that failed:
 *
 *   - 2026-08-09: clause 1 was corrected on the PDF only. For a day the
 *     customer SIGNED "becomes a binding tax invoice" and RECEIVED "the sales
 *     invoice is a separate document issued upon delivery".
 *   - 2026-09-21: clause 4 was dropped from the PDF only. A signed five-clause
 *     agreement printed as four.
 *
 * #1493 ended it. The sentences now live once, in `lib/order-terms.ts`, and
 * both surfaces map that array. Drift is impossible by construction.
 *
 * ── WHAT THIS TEST GUARDS NOW ──
 *
 * Not "do the two copies agree" — there is one copy, and comparing it to
 * itself proves nothing. Two things instead: that the wording is still the
 * owner-approved sentence, and that neither surface has quietly grown a copy
 * of its own again. The second is what brings the old bug back.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ORDER_TERMS } from "@/lib/order-terms";

const HERE = import.meta.dirname ?? __dirname;
const SURFACES = [
  ["screen", join(HERE, "Step3SignaturePayment.tsx")],
  ["pdf", join(HERE, "../../../lib/pdf/sales-order-template.tsx")],
] as const;

describe("T&C clauses — signed on screen, printed on paper", () => {
  it("come from ORDER_TERMS on both surfaces, neither keeping its own copy", () => {
    for (const [name, path] of SURFACES) {
      const src = readFileSync(path, "utf8");
      expect(src, `${name} no longer renders ORDER_TERMS`).toContain("ORDER_TERMS");
      /* A clause typed back into a surface file is exactly how both earlier
         regressions started. One copy or none — never two. */
      const own = ORDER_TERMS.filter((t) => src.includes(t.slice(0, 40)));
      expect(own, `${name} has grown its own copy of a clause`).toEqual([]);
    }
  });

  it("open with the OWNER-APPROVED clause 1", () => {
    /* The sentence is law in docs/pdf/SO-PDF-STANDARD.md §7.1. Asserting it
     * literally is what stops a rewrite of the rejected wording landing in the
     * shared array and reaching both surfaces at once. */
    expect(ORDER_TERMS[0]).toBe(
      "This sales order records your purchase agreement with Carres. " +
        "The sales invoice is a separate document issued upon delivery.",
    );
  });

  it("never claim the sales order becomes a tax invoice", () => {
    /* The owner rejected this on 2026-08-09. A Sales Order and a Sales Invoice
     * are separate lifecycle documents; the SO does not talk tax. */
    for (const [name, path] of [...SURFACES, ["terms", join(HERE, "../../../lib/order-terms.ts")]] as const) {
      const src = readFileSync(path, "utf8");
      const offending = src.match(/becomes a binding tax invoice/g) ?? [];
      expect(offending, `${name} still carries the rejected sentence`).toEqual([]);
    }
  });
});
