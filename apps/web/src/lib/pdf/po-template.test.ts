import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// PO-PDF-STANDARD guard (2026-08-02). A render test only sees the branches its
// fixture reaches; a SOURCE scan holds every branch of the template to the
// Law. Two directions:
//  1. money words may not exist at all — the payload is money-free (0307) and
//     the template must stay incapable of printing a figure;
//  2. the Law's load-bearing strings must exist — if a refactor renames them,
//     the standard changed without Jess and this fails.

const SRC = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "po-template.tsx"),
  "utf8",
);

// Strip comments before the money scan — the D0.5b lesson: a scan that reads
// comments fails on the very sentence explaining why the rule exists.
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("po-template obeys docs/pdf/PO-PDF-STANDARD.md", () => {
  it("never mentions money — no price, no total, no RM, no currency", () => {
    expect(CODE).not.toMatch(/unit_price|line_total|grand_total|currency|formatMoney/);
    expect(CODE).not.toMatch(/\bRM\b/);
    expect(CODE).not.toMatch(/fabric_surcharge/);
  });

  it("carries the Law's fixed strings", () => {
    for (const s of [
      "Deliver by",
      "PURCHASE ORDER",
      "Computer-generated document · No signature required.",
      "SO No",
      "Item ID",
      "TOTAL",
      "Top view. Back at the top. TV in front.",
    ]) {
      expect(SRC, s).toContain(s);
    }
  });

  it("has no signature block and no End-of-PO line (both rejected by Loo)", () => {
    expect(SRC).not.toMatch(/[Ss]ignature required\. —|End of PO|Authorised Signature|Acknowledgement/);
  });

  it("items never split across pages — every row is wrap={false}", () => {
    expect(SRC).toMatch(/wrap=\{false\}/);
  });
});
