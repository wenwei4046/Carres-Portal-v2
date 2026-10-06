import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * ⭐ A PDF PRINTS WHAT THE SCREEN PRINTS — owner ruling 2026-08-15.
 *
 * The customer name reaches every document through `displayCustomerName`, and
 * it is applied in the TEMPLATE rather than in the payload each caller
 * assembles. That placement is the whole point: there are many doors into a
 * document — the workspace, Payments, a regenerated historical PDF — and a rule
 * applied at each door is a rule that one new door will miss. Applied at the
 * render, every door and every regeneration passes through it.
 *
 * A SOURCE scan rather than a render test, for the reason `po-template.test.ts`
 * gives: a render test only sees the branches its fixture reaches, and a
 * signature caption or an agreement party line is exactly the branch a fixture
 * forgets.
 *
 * The scan asks ONE question — does a customer name reach a render unwrapped —
 * and deliberately does not hunt for `toLowerCase`/`toUpperCase` pairs in
 * general. A first draft of this file did, and failed on `sales-order-template`
 * for casing a DATE. A guard that fires on code it has no opinion about teaches
 * the next reader to weaken it, which is worse than not having it.
 */
const DIR = path.dirname(fileURLToPath(import.meta.url));

/** Strip comments first — a scan that reads them fails on the sentence that
 *  explains the rule (the D0.5b lesson). */
const codeOf = (file: string) =>
  readFileSync(path.join(DIR, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const TEMPLATES = readdirSync(DIR).filter(
  (f) => f.endsWith("-template.tsx") && !f.endsWith(".test.tsx"),
);

describe("every PDF template names the customer through the ONE display rule", () => {
  it("finds the templates at all — an empty sweep must not read as a pass", () => {
    expect(TEMPLATES.length).toBeGreaterThan(5);
  });

  it.each(TEMPLATES)("%s renders no raw customer name", (file) => {
    const code = codeOf(file);
    // Every JSX/array read of a customer name must be wrapped. A bare
    // `customer.name` or `t.customer_name` reaching a render is the defect.
    const raw = [...code.matchAll(/(?<!displayCustomerName\()([\w.]*\bcustomer(?:\.name|_name)\b)/g)]
      .map((m) => m[1])
      .filter((hit) => !/^\s*$/.test(hit));
    const unwrapped = raw.filter((hit) => {
      const i = code.indexOf(hit);
      return !code.slice(Math.max(0, i - 22), i).includes("displayCustomerName(");
    });
    expect(unwrapped).toEqual([]);
  });

  it("imports the shared helper wherever it names a customer", () => {
    for (const file of TEMPLATES) {
      const code = codeOf(file);
      if (!/\bcustomer(?:\.name|_name)\b/.test(code)) continue;
      expect(code, file).toContain('from "@/lib/customer-name"');
    }
  });
});
