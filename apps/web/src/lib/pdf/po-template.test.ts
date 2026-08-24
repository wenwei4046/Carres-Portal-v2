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

  /**
   * ⭐ 0377 — THE DOCUMENT PRINTS ITS OWN VERSION, INCLUDING VERSION 1.
   *
   * A supplier holding two papers with one number and no version cannot tell
   * which to build from. (`Version 1 prints nothing` is the internal REVISIONS
   * PANEL's rule — `docs/COPY-STANDARD.md` — and this is paper that leaves the
   * building; the panel rule is untouched.)
   */
  it("prints its version, and takes it from the document payload", () => {
    expect(SRC).toContain("versionLabel");
    expect(SRC).toMatch(/Version \$\{version \?\? 1\}/);
    // It comes off the official payload, not from a prop somebody could pass.
    expect(SRC).toMatch(/const \{ po_number, version,/);
    // It appears on the first-page identity block AND the continuation header.
    expect(SRC).toMatch(/docTitle[^\n]*>\{versionLabel\}/);
    expect(SRC).toContain("{versionLabel}");
    // And as its own PO DETAILS row.
    expect(SRC).toMatch(/\["Version",/);
  });

  it("never invents a version — a payload without one reads Version 1", () => {
    // `version ?? 1` and nothing else; no counting, no lookup, no default prop.
    expect(CODE).not.toMatch(/version\s*\+\+|version\s*\+\s*1/);
  });

  it("carries the Law's fixed strings", () => {
    for (const s of [
      "Deliver by",
      "Version",
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
