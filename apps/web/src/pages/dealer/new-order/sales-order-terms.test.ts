/**
 * THE CUSTOMER SIGNS WHAT THE CUSTOMER RECEIVES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT HAPPENED
 *
 * The T&C clauses exist on TWO surfaces: the POS signature screen
 * (`Step3SignaturePayment.tsx`) where the customer reads and signs them, and
 * `sales-order-template.tsx` which prints them on the PDF they receive. Since
 * 2026-05-22 that file has carried the instruction, in prose:
 *
 *     "wording mirrors sales-order-template.tsx … Any future edit must touch
 *      both files together."
 *
 * Card 3.0-FIX corrected clause 1 to the owner's approved wording on the PDF
 * and did not touch the screen. For a day, the customer SIGNED "this sales
 * order becomes a binding tax invoice" and RECEIVED "the sales invoice is a
 * separate document issued upon delivery". Caught by grepping the built
 * bundle before a deploy — not by any test, because the regression sweep only
 * ever looked at the PDF template.
 *
 * A sentence in a comment is not a guard. This is.
 *
 * ── WHY IT COMPARES SOURCE TEXT ──
 *
 * The two surfaces render through different engines — react-pdf `<Text>` and
 * DOM `<p>` — so there is no shared runtime value to assert on. What CAN be
 * compared is the sentence itself, read out of each file, normalised for the
 * line wrapping each formatter imposes. If a future edit changes one side, the
 * sentences stop matching and this fails, naming both.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = import.meta.dirname ?? __dirname;
const SCREEN = join(HERE, "Step3SignaturePayment.tsx");
const PDF = join(HERE, "../../../lib/pdf/sales-order-template.tsx");

/** Collapse the whitespace each file's formatter introduced. */
const flat = (s: string) => s.replace(/\s+/g, " ").trim();

/** Clause 1 as the PDF prints it — the first string in its T&C array. */
function pdfClauseOne(): string {
  const src = readFileSync(PDF, "utf8");
  const block = src.slice(src.indexOf("<Text style={{ fontSize: 7.5"));
  const m = block.match(/"(This sales order[^"]+)"/);
  expect(m, "the PDF's T&C clause 1 must still be a literal this test can read").toBeTruthy();
  return flat(m![1]!);
}

/**
 * Clause 1 as the signature screen shows it — the `1. …` paragraph.
 *
 * Anchored on the number and closed on `</p>`, NOT on the preceding `>`: a JSX
 * comment may sit between the tag and the text (one does), and the first draft
 * of this matcher broke on exactly that.
 */
function screenClauseOne(): string {
  const src = readFileSync(SCREEN, "utf8");
  const block = src.slice(src.indexOf("Terms & conditions"));
  const m = block.match(/\n\s*1\.\s([\s\S]*?)<\/p>/);
  expect(m, "the screen's clause 1 must still be a plain numbered paragraph").toBeTruthy();
  return flat(m![1]!);
}

describe("T&C clause 1 — signed on screen, printed on paper", () => {
  it("is the SAME sentence on both surfaces", () => {
    const pdf = pdfClauseOne();
    const screen = screenClauseOne();
    expect(
      screen,
      `the signature screen and the PDF disagree.\n  screen: ${screen}\n  pdf   : ${pdf}`,
    ).toBe(pdf);
  });

  it("is the OWNER-APPROVED wording, on both", () => {
    /* The sentence is law in docs/pdf/SO-PDF-STANDARD.md §T&C. Asserting it
     * literally means "they agree" cannot be satisfied by both drifting to the
     * rejected wording together. */
    const approved =
      "This sales order records your purchase agreement with Carres. " +
      "The sales invoice is a separate document issued upon delivery.";
    expect(pdfClauseOne()).toBe(approved);
    expect(screenClauseOne()).toBe(approved);
  });

  it("neither surface claims the sales order becomes a tax invoice", () => {
    /* The owner rejected this on 2026-08-09. A Sales Order and a Sales Invoice
     * are separate lifecycle documents; the SO does not talk tax. */
    for (const [name, path] of [["screen", SCREEN], ["pdf", PDF]] as const) {
      const src = readFileSync(path, "utf8");
      const offending = src.match(/becomes a binding tax invoice/g) ?? [];
      expect(offending, `${name} still carries the rejected sentence`).toEqual([]);
    }
  });
});
