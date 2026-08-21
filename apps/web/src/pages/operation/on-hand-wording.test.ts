import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * `On hand` IS NOT AN OPERATOR WORD ANY MORE — CARD-2026-08-20-stock-register §6.
 *
 * ── WHY THIS TEST EXISTS, AND WHY THE OBVIOUS ONE WAS NOT ENOUGH ────────────
 * The card's §6 line is "the old On hand wording is absent FROM THE OPERATOR
 * SURFACE". That was asserted on the new Register page, it passed, and it was
 * not enough: grepping the SERVED PRODUCTION BUNDLE after deploy returned TWO
 * live `On hand` strings the page test could never see —
 *
 *   · `StockTabs` PAGE_WORD, the fallback for an unrecognised `?tab=`;
 *   · `StockHealthPanel`, rendered on the LIVE Ready stock page, telling the
 *     operator to "set the number on the Reorder card under On hand" — a
 *     destination that no longer existed and had just become unreachable.
 *
 * A per-page test asks "is the word on MY page". This one asks the question the
 * card actually posed: "is the word anywhere an operator can read it".
 *
 * SCOPE, deliberately narrow: only strings a human sees. Comments and file
 * paths are excluded — `OperationStockOnHand.tsx` is a real filename and its
 * header comment explains the de-routing, which is documentation, not UI.
 */

const WEB_SRC = join(__dirname, "..", "..");

/**
 * The superseded destination word, in the spellings a page might PRINT.
 *
 * The route key `"on-hand"` is deliberately NOT banned: the card kept
 * `?tab=stock-onhand` so no bookmark moved, and a URL fragment is not something
 * an operator reads as a page name. Banning it would have forced a pointless
 * address change — the first draft of this test did exactly that.
 */
const BANNED = [/\bOn hand\b/, /\bOn Hand\b/];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** Strip comments so documentation about the rename does not trip the rule. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

describe("the superseded `On hand` wording is gone from every operator surface", () => {
  it("no page, component or nav entry prints it", () => {
    const offenders: string[] = [];
    for (const file of walk(WEB_SRC)) {
      // The de-routed page itself is unreachable and is documented as such;
      // it is excluded by PATH, explicitly, rather than by accident.
      const rel = relative(WEB_SRC, file).split(sep).join("/");
      if (rel === "pages/operation/OperationStockOnHand.tsx") continue;

      const code = codeOnly(readFileSync(file, "utf8"));
      if (BANNED.some((re) => re.test(code))) offenders.push(rel);
    }
    expect(
      offenders,
      `these files still print the superseded word:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("the one excluded file is excluded because it is DE-ROUTED, and says so", () => {
    // If someone re-routes it, this test should stop granting the exemption.
    const src = readFileSync(
      join(WEB_SRC, "pages", "operation", "OperationStockOnHand.tsx"),
      "utf8",
    );
    expect(src).toMatch(/DE-ROUTED/);

    const app = codeOnly(
      readFileSync(join(WEB_SRC, "pages", "operation", "OperationApp.tsx"), "utf8"),
    );
    // Comments stripped: the router's header comment explains the de-routing,
    // and documentation of a removal is not the removal being undone.
    expect(app).not.toMatch(/OperationStockOnHand/);
  });
});
