import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * C1 — the drawer's banned-word guard.
 *
 * WHY IT IS A SOURCE SCAN AND NOT A RENDER TEST. `OrderDocuments`,
 * `BookingSpine` and `OrderJourneyHeader` each already ship a banned-word test,
 * and T1's `Unscheduled` still survived for a week in TWO places — because each
 * of those tests guards its OWN component and the badge sat outside all three.
 * A render test would have the same hole: it can only see the branches its
 * fixture happens to reach, and this file is 7,000 lines of branches. Reading
 * the source catches every branch, including the one nobody thought to mount.
 *
 * WHAT COUNTS AS A VISIBLE STRING. Every string literal and every JSX text node,
 * EXCEPT a single all-lowercase token with no spaces (`"chase"`, `"logistic"`,
 * `"remind"`) — those are internal keys, mode values and query fragments, which
 * COPY-STANDARD exempts by name. A word a human reads on screen is either
 * capitalised or has a space in it, so nothing visible escapes through that
 * door.
 */

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "OrderDetailDrawer.tsx"),
  "utf8",
);

/** Drop comments so a note ABOUT a banned word is not read as using one, and
 *  drop `className` values: a CSS class (`btn-chase`, `text-chase`) is an
 *  internal name that nobody reads, exactly like a DB column. */
function stripNonVisible(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/className=\{`[\s\S]*?`\}/g, "className={}")
    .replace(/className="[^"]*"/g, 'className=""')
    .replace(/className=\{"[^"]*"\}/g, "className={}");
}

/** Every quoted literal + every JSX text node, minus the internal-key door. */
function visibleStrings(src: string): string[] {
  const out: string[] = [];
  const body = stripNonVisible(src);
  // "…" and '…' literals.
  for (const m of body.matchAll(/"([^"\\\n]{2,})"|'([^'\\\n]{2,})'/g))
    out.push(m[1] ?? m[2]);
  // JSX text: between > and < with no braces (an interpolated child is code).
  // Newlines are allowed inside the chunk — a label on its own indented line is
  // the common shape — and each line is then trimmed on its own.
  for (const m of body.matchAll(/>([^<>{}]{2,})</g)) out.push(...m[1].split("\n"));
  // Backtick fragments — the literal words around an ${…} interpolation.
  for (const m of body.matchAll(/`([^`\\]{2,})`/g)) out.push(...m[1].split("\n"));
  return out
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    // Internal keys: one all-lowercase token, no spaces (`chase`, `logistic`).
    .filter((s) => !/^[a-z0-9_.:/[\]-]+$/.test(s));
}

/** Each entry: the banned word, and why it is banned (COPY-STANDARD). */
const BANNED: [RegExp, string][] = [
  [/\bPOD\b/, "POD → delivery photo"],
  [/proof of delivery/i, "Proof of Delivery → delivery photo"],
  [/\bunscheduled\b/i, "Unscheduled → the action that closes the gap"],
  [/\bnot booked\b/i, "Not booked → no date confirmed"],
  [/\bneed booking\b/i, "need booking → a to-do hidden inside a fact"],
  [/\bchase[ds]?\b/i, "Chase → Call {party} — {measurable outcome}"],
  [/\bchasing\b/i, "Chase → Call {party} — {measurable outcome}"],
  // A logistics company: `Carrier` / `Partner` / `logistic` (no s) are banned
  // UI words; DB columns and internal keys keep theirs.
  [/\bcarriers?\b/i, "Carrier → Logistics"],
  [/\blogistic\b/i, "logistic → Logistics (with the s)"],
  // Moods and gaps instead of work.
  [/\bat risk\b/i, "At Risk → say what is late and by how much"],
  [/\bneeds attention\b/i, "Attention → Due soon / Overdue"],
  [/\bpending\b/i, "Pending → the state it actually selects"],
];

describe("OrderDetailDrawer — no banned word reaches the screen (C1)", () => {
  const strings = visibleStrings(SRC);

  it("finds strings to check at all (the scan itself must not silently pass)", () => {
    // A regex change that matched nothing would make every assertion below
    // vacuously true — the failure mode a guard must not have.
    expect(strings.length).toBeGreaterThan(200);
    expect(strings.some((s) => s.includes("Logistics"))).toBe(true);
  });

  for (const [re, why] of BANNED) {
    it(`never says ${re.source} — ${why}`, () => {
      expect(strings.filter((s) => re.test(s))).toEqual([]);
    });
  }
});

/**
 * T2 — the UI-KIT §1.4 Information Hierarchy, guarded.
 *
 * WHY A SOURCE SCAN AGAIN. Same reason as C1 above, plus one specific to this
 * card: the rules being guarded are about what happens when the rail is
 * COLLAPSED and when the issue list is EMPTY. A render test proves those only
 * for the branches its fixture reaches, and the bug §1.4 rule 1 exists to fix
 * — Current Action vanishing with the rail — survived precisely because the
 * collapsed branch is the one nobody mounts.
 *
 * These four assertions are the difference between a hierarchy that is written
 * down and one that a future edit cannot quietly undo.
 */
describe("OrderDetailDrawer — Information Hierarchy (UI-KIT §1.4)", () => {
  const at = (needle: string) => SRC.indexOf(needle);

  it("orders the left rail Identity → Current Action → Current Issues → Progress", () => {
    const identity = at("<CustomerIdentityCard");
    const action = at("<CallsPanel");
    const issues = at("<CurrentIssuesPanel");
    const progress = at("<JourneyCard");
    // Negative control: every block must actually be rendered, or the
    // ascending check below passes on a file that renders none of them.
    for (const [name, i] of [
      ["CustomerIdentityCard", identity],
      ["CallsPanel", action],
      ["CurrentIssuesPanel", issues],
      ["JourneyCard", progress],
    ] as const) {
      expect(i, `${name} is not rendered`).toBeGreaterThan(-1);
    }
    expect(identity).toBeLessThan(action);
    expect(action).toBeLessThan(issues);
    expect(issues).toBeLessThan(progress);
  });

  it("rule 1 — Current Action is never hidden by the collapsed rail", () => {
    const i = at("<CallsPanel");
    // Nothing may gate the render site on the rail being open. This is the
    // exact shape that used to sit here: `{!railCollapsed && (`.
    const before = SRC.slice(Math.max(0, i - 400), i);
    expect(before).not.toMatch(/!railCollapsed\s*&&\s*\(?\s*$/);
    // It must instead be TOLD it is collapsed, so it can render in icon form.
    const site = SRC.slice(i, i + 400);
    expect(site).toContain("collapsed={railCollapsed}");
  });

  it("rule 2 — Current Issues renders nothing when there is nothing wrong", () => {
    const i = SRC.indexOf("function CurrentIssuesPanel(");
    expect(i, "CurrentIssuesPanel is missing").toBeGreaterThan(-1);
    const body = SRC.slice(i, i + 900);
    expect(body).toMatch(/if\s*\(rows\.length === 0\)\s*return null;/);
    // No consolation card: an ERP says where today is NOT normal.
    expect(SRC).not.toMatch(/No (current )?issues/i);
  });

  it("rule 4 — issues use the SAME three categories as the list row's dots", () => {
    // The type is the enforcement: a fourth category does not compile.
    expect(SRC).toMatch(/track:\s*OrderActionTrack;/);
    expect(SRC).toMatch(/type OrderActionTrack,?\s*\n?\s*\}?\s*from "@carres\/shared"|type OrderActionTrack,/);
    // Law 6 order — goods · delivery · money, the order the dots render in.
    expect(SRC).toMatch(
      /ISSUE_TRACK_ORDER[^=]*=\s*\[\s*"goods",\s*"delivery",\s*"money",?\s*\]/,
    );
  });
});

/**
 * C7 — the delivery order issues itself, and the gate moves onto issuing.
 *
 * Same source-scan reasoning as above: these are facts about which branch
 * exists at all, and the drawer is 7,000 lines of branches.
 */
describe("OrderDetailDrawer — C7, the delivery order", () => {
  it("renders a delivery-order row, and spells its verb from the dictionary", () => {
    expect(SRC).toContain("<DeliveryOrderRow");
    // The button word is READ, never typed here — so a rename in
    // COPY-STANDARD's mirror reaches this screen without touching this file.
    expect(SRC).toMatch(/orderActionButton\("issue_delivery_order"\)/);
    // Nor is the DONE message typed: the toast asks the same mirror.
    expect(SRC).toMatch(/orderActionDone\("issue_delivery_order"\)/);
  });

  it("the row shows the number as a FACT once it exists — no second press", () => {
    const i = SRC.indexOf("function DeliveryOrderRow(");
    expect(i, "DeliveryOrderRow is missing").toBeGreaterThan(-1);
    const body = SRC.slice(i, i + 1600);
    // The issued branch has no Btn at all: the document already exists.
    expect(body).toMatch(/doNumber \?/);
  });

  it("goods and money no longer disable the Confirm button (§5)", () => {
    // The date can be agreed while both are still coming; the PAPER is what
    // refuses to exist. What still disables it: date, slot, Sunday.
    expect(SRC).toContain("disabled={!date || !slot || sunday || confirm.isPending}");
    expect(SRC).not.toContain("!tripReady || confirm.isPending");
  });

  it("the hint line names the step that actually refuses", () => {
    expect(SRC).toContain("the delivery order cannot");
    // The old sentence pointed at a refusal that no longer happens.
    expect(SRC).not.toMatch(/system refuses to\s*\n?\s*confirm/);
  });

  it("the kebab no longer says `Confirm delivery` — the door it opens marks delivered", () => {
    // C3 reported this rename as C7's and read it as `Issue delivery order`;
    // the modal it opens attaches the customer's SIGNED DO and delivers, so the
    // word is `Deliver today`'s BUTTON string.
    const strings = visibleStrings(SRC);
    expect(strings.filter((s) => /^Confirm delivery$/.test(s))).toEqual([]);
    expect(SRC).toMatch(/orderActionButton\("deliver_today"\)/);
  });

  it("the DO print no longer recomputes its own number", () => {
    // Two printers in this file used to disagree, and a reprint on another day
    // printed a different number than the copy the customer signed.
    const i = SRC.indexOf("async function openDoPdf(");
    const body = SRC.slice(i, i + 900);
    expect(body).not.toContain("docNumber(");
    expect(body).toContain("renderDoPdf(data)");
  });
});
