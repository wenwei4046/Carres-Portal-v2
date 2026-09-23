/**
 * THE QUANTITY RULE, ENFORCED AT THE SOURCE — owner ruling 2026-09-22,
 * `docs/pdf/DOCUMENT-KIT.md` §3 rule 5:
 *
 *   A quantity is a COUNT: centred, one weight. Money is right-aligned.
 *
 * It regressed silently once already. The rule was ruled on 2026-09-22, the PO
 * was built to it, and the Sales Order, Delivery Order, Tax Invoice AND the GRN
 * carried on printing `textAlign: "right"` with `qty > 1` in bold — the kit
 * itself carried the gap as a 🔴 note instead of a failing test, and the GRN was
 * missing from that note entirely. A note does not stop a regression; this does.
 *
 * Modelled on `po-template.test.ts`'s money scan: read the SOURCE, strip the
 * comments (a scan that reads its own prose passes for the wrong reason), and
 * assert on what actually renders.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** Every document that prints goods. The PO is here as the control: it has
 *  obeyed the rule since 2026-09-22 and must keep obeying it. */
const GOODS_DOCUMENTS = [
  "po-template.tsx",
  "sales-order-template.tsx",
  "do-template.tsx",
  "grn-template.tsx",
  "invoice-template.tsx",
] as const;

/** Comments quote the rule and name the retired one; a scan that reads them
 *  would pass on the prose instead of the code. */
function codeOf(file: string): string {
  const src = fs.readFileSync(path.resolve(__dirname, file), "utf8");
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("a quantity is a count — centred, one weight", () => {
  it.each(GOODS_DOCUMENTS)("%s centres its quantity column", (file) => {
    const code = codeOf(file);
    const qtyStyles = code.match(/(?:col|cell)Qty:\s*\{[^}]*\}/g) ?? [];
    expect(qtyStyles.length).toBeGreaterThan(0);
    for (const style of qtyStyles) {
      expect(style).toContain('textAlign: "center"');
      expect(style).not.toContain('textAlign: "right"');
    }
  });

  it.each(GOODS_DOCUMENTS)("%s gives every body quantity ONE weight", (file) => {
    const code = codeOf(file);
    // `qty > 1 ? [styles.cellQty, { fontWeight: 700 }] : styles.cellQty` — the
    // exact shape that shipped on the SO, the DO and the Invoice.
    expect(code).not.toMatch(/qty\s*>\s*1\s*\?[^;]*cellQty/);
    expect(code).not.toMatch(/Number\([^)]*qty[^)]*\)\s*>\s*1\s*\?[^;]*cellQty/);
  });

  it("money stays right-aligned — the rule moves quantities, not amounts", () => {
    for (const file of ["sales-order-template.tsx", "invoice-template.tsx"]) {
      const money = codeOf(file).match(/cellMoney:\s*\{[^}]*\}/g) ?? [];
      expect(money.length).toBeGreaterThan(0);
      for (const style of money) expect(style).toContain('textAlign: "right"');
    }
  });
});
