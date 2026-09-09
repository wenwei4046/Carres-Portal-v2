import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BANNED, itSaysNoBannedWord, visibleStrings } from "./banned-words";

/**
 * C12 — the banned-word scanner runs on every page it is supposed to run on.
 *
 * **The hole this file closes.** C1 wrote the scan INSIDE
 * `OrderDetailDrawer.test.tsx`, so it guarded exactly one file. Payments had no
 * test file at all and was never scanned once; To Order's own lane suite
 * (`purchasing-words.test.ts`) scans for `Chase` and four other Purchasing
 * words, but not for the portal-wide list. So on 2026-08-05 the desk that
 * collects money still said `Ready to chase`, `Chased today`, `Not chased yet`
 * and eleven more, under a green suite.
 *
 * **The card's own count was 21 and the real number was 16.** ②'s five
 * Purchase-page strings died with the file: `OperationPurchase.tsx` was deleted
 * whole on 2026-08-01 when To Order was rebuilt from the Golden Template
 * (#534). `OperationToOrder.tsx` takes its place in the list below and passes
 * all twelve rules today, which is why adding it costs nothing and is worth
 * doing: it is the page an operator reaches by the same click.
 */
const PAGES = join(dirname(fileURLToPath(import.meta.url)), "..", "pages");

describe("no banned word reaches the screen (C12 · portal-wide)", () => {
  /* THE COLLECTIONS DESK IS THE REGISTER PAIR NOW (2026-09-09). The scan
     followed the CLICK, not the filename: `OperationPayments.tsx` was the page
     the everyday `Payments` row opened, and on 2026-09-09 that row started
     opening `/finance/payments` instead. The desk was deleted in the same
     change, so its guard moves here rather than disappearing — a retired
     surface must never take a live word-scan with it.

     The floors are non-vacuity guards, not targets: measured 107 and 169
     visible strings, set below the real count so an unrelated edit does not
     trip them and far above zero so a matcher that stopped matching cannot
     make every assertion below vacuously true. */
  describe("the collections desk — the Payments Register", () => {
    itSaysNoBannedWord(join(PAGES, "finance", "PaymentRegister.tsx"), {
      minStrings: 70,
      expectString: "Back to Payments",
    });
  });

  describe("the collections desk — the Invoices Register", () => {
    itSaysNoBannedWord(join(PAGES, "finance", "InvoiceRegister.tsx"), {
      minStrings: 110,
      expectString: "Goods ready",
    });
  });

  describe("the order drawer", () => {
    itSaysNoBannedWord(
      join(PAGES, "operation", "components", "OrderDetailDrawer.tsx"),
      { minStrings: 800, expectString: "Logistics" },
    );
  });

  /**
   * SO BATCH PURCHASE (CARD-2026-08-22-purchasing-02). `OperationToOrder.tsx`
   * is a thin orchestrator now — it owns data and mode and spells almost no
   * words — so the scan follows the WORDS to the two files that hold them. A
   * floor left on the orchestrator would pass vacuously forever.
   */
  describe("SO Batch Purchase", () => {
    itSaysNoBannedWord(
      join(PAGES, "operation", "so-batch", "SoBatchRegister.tsx"),
      /* Card 02-B — `Not counted yet` left with the retired Stock column; the
         coverage absence is the string the file is now known to contain. */
      { minStrings: 40, expectString: "Not ordered yet" },
    );
    itSaysNoBannedWord(
      join(PAGES, "operation", "so-batch", "SoBatchIssueWorkspace.tsx"),
      { minStrings: 20, expectString: "Goods must arrive" },
    );
    itSaysNoBannedWord(
      join(PAGES, "operation", "components", "PoIssueEvidence.tsx"),
      { minStrings: 20, expectString: "Record the PDF sent" },
    );
  });

  /**
   * Added when layer ③ landed (2026-08-05). The Claims TABLE is scanned by the
   * Purchasing lane suite; the PANEL inside its expanded row never was, and the
   * panel is where every claim decision is actually worded — what we asked, what
   * the supplier answered, what happens to the item, and now what we are doing
   * for the customer. A guard that stops at the page and not at the panel is the
   * same hole this file exists to close, one level down.
   */
  describe("the claim panel", () => {
    itSaysNoBannedWord(
      join(PAGES, "operation", "components", "SupplierClaimPanel.tsx"),
      { minStrings: 40, expectString: "Customer Resolution" },
    );
  });
});

/**
 * The scanner's own behaviour, asserted on fixtures rather than on a page.
 *
 * A guard is only as good as its matcher, and this card exists because a
 * matcher silently skipped a whole shape for eight days. These four cases are
 * that matcher's contract.
 */
describe("the scanner reads what a human reads", () => {
  it("reads a JSX text node that carries an interpolation", () => {
    // The exact shape that hid `Last chased {date}` from C1's guard.
    const found = visibleStrings("<div>Last chased {fmtDate(at)}</div>");
    expect(found.some((s) => /Last chased/.test(s))).toBe(true);
  });

  it("does not read the CODE inside the interpolation", () => {
    // `fmtDate` and `at` are identifiers; a scanner that reported them would
    // fail on variable names and be deleted by the next chat.
    const found = visibleStrings("<div>Hello {chasedAgo(at)}</div>");
    expect(found.filter((s) => /chasedAgo/.test(s))).toEqual([]);
  });

  it("does not report a banned word out of a code block — measured on the real drawer", () => {
    // The regression this pins is a REAL one, caught during C12 and thrown
    // away rather than shipped. The obvious fix for the interpolation hole is
    // to blank every `{…}` in the file and then match `>([^<>]+)<`. It was
    // written, run, and measured: with the braces gone a capture runs straight
    // through code, and it reported FOUR false positives in this one file —
    // `logistic: chasePartnerName,` (an object property, tripping the
    // `logistic` rule) and three `pending` variable declarations.
    //
    // A guard that flags variable names is a guard the next chat deletes, so
    // the shipped matcher keeps braces as boundaries. This asserts it on the
    // real 7,000-line file, not on a fixture: a contrived two-liner cannot
    // reproduce the shapes that actually broke it.
    const drawer = readFileSync(
      join(PAGES, "operation", "components", "OrderDetailDrawer.tsx"),
      "utf8",
    );
    const found = visibleStrings(drawer);
    expect(found.filter((s) => /logistic: chasePartnerName/.test(s))).toEqual([]);
    expect(found.filter((s) => /^const \[pending/.test(s))).toEqual([]);
  });

  it("still reads text inside a conditional child element", () => {
    // `{cond && <b>…</b>}` is a CHILD, not an expression. Swallowing it would
    // trade one blind spot for another.
    const found = visibleStrings("<div>{late && <b>Chased today</b>}</div>");
    expect(found.some((s) => /Chased today/.test(s))).toBe(true);
  });

  it("keeps the internal-key door open — a lone lowercase token is not a word", () => {
    expect(visibleStrings('const tone = "chase";').filter((s) => s === "chase")).toEqual(
      [],
    );
  });

  it("carries the whole banned list, so a rule cannot be quietly dropped", () => {
    expect(BANNED.length).toBe(12);
    expect(BANNED.map(([re]) => re.source)).toContain("\\bchase[ds]?\\b");
  });
});
