import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { visibleStrings } from "@/test/banned-words";

/**
 * C1's banned-word guard MOVED on 2026-08-05 (card **C12**) to
 * `src/test/banned-words.ts`, and it now runs on three pages instead of one.
 *
 * It is recorded here rather than silently deleted, because the shape of the
 * hole is the lesson: the scanner lived inside THIS file, so it guarded THIS
 * file — and `OperationPayments.tsx`, which has no test file of its own, was
 * never read by it once. Fifteen banned strings sat live on the collections
 * desk for eight days while this suite was green.
 *
 * Its matcher also skipped any JSX text node containing an interpolation, which
 * is how `Last chased {date}` survived HERE, in the file the guard was written
 * for, under a banned list that already held `/chase[ds]?/`.
 *
 * The drawer is still scanned, by every rule it was scanned by before —
 * see `src/test/banned-words.test.ts`.
 */

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "OrderDetailDrawer.tsx"),
  "utf8",
);

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
 * ⭐ CARD 4B · SINGLE PO CREATION AUTHORITY (2026-08-11).
 *
 * Card 3 asserted that every PO action here sat behind an explicit
 * `allowIssuePO` capability. That guard is SUPERSEDED, and by something
 * stronger: the capability itself is gone. The drawer no longer has a Purchase
 * Order creation door to gate — not on Delivery, not anywhere — and the flag
 * that used to gate it does not exist to be flipped back on.
 *
 * A capability that can be re-enabled with `allowIssuePO` is not the same
 * safety as a capability that is not in the file.
 */
describe("OrderDetailDrawer — no Purchase Order creation door", () => {
  /* Scan CODE, not comments. The removal notes left in the file name the things
     they removed — that is the record — and a guard a reworded comment can trip
     is a guard that gets worked around instead of obeyed. */
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("carries no PO creation capability, not even a disabled one", () => {
    expect(CODE).not.toContain("allowIssuePO");
    expect(CODE).not.toContain("onIssuePOsClick");
    expect(CODE).not.toContain("gotoProcurementWithPrefill");
  });

  it("offers no menu item that creates a Purchase Order", () => {
    // These were the two live doors: the ⋮ stage action and the stock panel's
    // overflow item. Both label strings must be gone from the JSX.
    expect(CODE).not.toMatch(/label=\{?"Issue PO"/);
    expect(CODE).not.toMatch(/label:\s*"Raise PO for shortages"/);
  });

  it("never reaches a legacy creation path", () => {
    expect(CODE).not.toContain("CreatePOModal");
    expect(CODE).not.toContain("CreatePoPrefill");
    // The prefill hand-off to /operation/procurement is what made this drawer a
    // creation surface without owning a form.
    expect(CODE).not.toMatch(/state:\s*\{\s*\n?\s*prefill/);
    expect(CODE).not.toContain("/api/operation/pos/batch");
    expect(CODE).not.toMatch(/apiFetch<[^>]*>\("\/api\/operation\/pos"/);
  });
});

/**
 * C7 — the delivery order issues itself, and the gate moves onto issuing.
 *
 * Same source-scan reasoning as above: these are facts about which branch
 * exists at all, and the drawer is 7,000 lines of branches.
 */
describe("OrderDetailDrawer — C7 → Slice 2, the delivery order", () => {
  it("⭐ renders a delivery-order row with NO issue control in any state (Slice 2)", () => {
    // `docs/orders/MASTER.md` §8: the SYSTEM issues the DO when every
    // requirement is met — no Release button, no Approve button, no manual
    // bypass. The row is a fact in both states, so the PRESS is gone. The one
    // click the row keeps is a READ door: the number navigates to the DO
    // object page (§0.1: a document number opens its authoritative object) —
    // navigation is not an act, and there is nothing to press before the
    // number exists.
    expect(SRC).toContain("<DeliveryOrderRow");
    expect(SRC).not.toMatch(/orderActionButton\("issue_delivery_order"\)/);
    expect(SRC).not.toMatch(/useIssueDeliveryOrder/);
    const i = SRC.indexOf("function DeliveryOrderRow(");
    expect(i, "DeliveryOrderRow is missing").toBeGreaterThan(-1);
    const body = SRC.slice(i, SRC.indexOf("\n}", i));
    expect(body).not.toContain("<Btn");
    // (the governed absence sentence SAYS "the system issues it", so the scan
    // bans control surface, not the word)
    expect(body).not.toMatch(/useIssueDeliveryOrder|mutate|useMutation/);
    // the only onClick is the navigation door to the document's page
    expect(body).toContain("/operation/delivery-orders/");
  });

  it("the row shows the number as a FACT once it exists — no second press", () => {
    const i = SRC.indexOf("function DeliveryOrderRow(");
    expect(i, "DeliveryOrderRow is missing").toBeGreaterThan(-1);
    const body = SRC.slice(i, i + 1600);
    // The issued branch prints the number as the door to its page; the
    // unissued branch reads the governed absence SENTENCE (COPY-STANDARD:
    // an absent value reads as words, never a dash).
    expect(body).toMatch(/doNumber \?/);
    expect(body).toContain("No delivery order yet");
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

  it("⭐ money never rides the goods refusal sentence — decision A (2026-08-16)", () => {
    /* Found in the Slice 3 production walk: the booking hint lumped the
       outstanding balance into "the delivery order cannot be issued until
       these are cleared" — a refusal that no longer happens. Goods still
       block; money warns on its own line and says so. */
    // The balance is no longer pushed into the blocking gateHints list…
    expect(SRC).not.toMatch(/gateHints\.push\(`RM /);
    // …it has its own sentence, in the server warning's own voice…
    expect(SRC).toContain(
      "collection is still open; it does not block the delivery order",
    );
    // …and the blocking sentence survives for the thing that DOES refuse.
    expect(SRC).toContain("be issued until these are cleared");
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

/**
 * SALES ORDER V2 · CARD 4 closing slice (0347) — **a voided payment is not
 * money.**
 *
 * 0343 turned VOID from a DELETE into a STAMP, which is right: money history is
 * never erased. Every reader in this file was written when a void deleted the
 * row, so a reversed payment would have been summed into the storage
 * collection, listed as a document on file, offered as a printable receipt and
 * shown in the history as if it still stood. The ledger holds zero rows on
 * production, so nothing was wrong on screen — all of it would have gone wrong
 * on the first void.
 *
 * Source scan, in this file's established method: the branches only exist once
 * a principal has voided something, which is exactly the state no fixture
 * mounts.
 */
describe("OrderDetailDrawer — a voided payment is not money (CARD 4, 0347)", () => {
  it("every sum over the ledger asks the ONE predicate", () => {
    // The storage-collected roll-up feeds `balanceDue`; without the filter a
    // reversed storage collection makes the order read as owing less.
    expect(SRC).toContain('p.kind === "storage" && isLivePayment(p)');
    // …and the predicate comes from shared — no local `voided_at` spelling.
    expect(SRC).toMatch(/^\s*isLivePayment,\s*$/m);
    // …and it never reads the column itself: a second spelling of "is this
    // reversed?" is how the four readers drifted apart in the first place.
    const spellings = SRC.match(/\.voided_at\b/g) ?? [];
    expect(spellings, "the drawer must not read `voided_at` directly").toEqual([]);
  });

  it("a voided receipt is not a document on file", () => {
    expect(SRC).toContain("payments: ledger.filter(isLivePayment).map((p) => ({");
  });

  it("`Print receipt` means the latest payment that still stands", () => {
    expect(SRC).toContain("const latestLivePayment = ledger.find(isLivePayment) ?? null;");
    // The old form took ledger[0] — the newest row, voided or not.
    expect(SRC).not.toContain("openReceipt(ledger[0]");
  });

  it("a voided row reads as reversed and offers neither receipt nor a second void", () => {
    expect(SRC).toContain("const voided = !isLivePayment(p);");
    expect(SRC).toContain("{!voided && (");
    expect(SRC).toContain("{isPrincipal && !voided && (");
    // It stays visible: the history is the point of keeping the row.
    expect(SRC).toContain("Voided");
  });
});
