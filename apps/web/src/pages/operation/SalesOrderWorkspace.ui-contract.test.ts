import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { POS_FORM_BUILTINS } from "@carres/shared";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = readFileSync(join(here, "SalesOrderWorkspace.tsx"), "utf8");
const header = readFileSync(join(here, "SalesOrderTabs.tsx"), "utf8");
const attribution = readFileSync(join(here, "SalesOrderAttribution.tsx"), "utf8");
const addons = readFileSync(join(here, "SalesOrderAddons.tsx"), "utf8");
const queries = readFileSync(join(here, "../../lib/queries.ts"), "utf8");
const amendDate = readFileSync(join(here, "SalesOrderAmendDeliveryDate.tsx"), "utf8");
const amendment = readFileSync(join(here, "SalesOrderAmendment.tsx"), "utf8");
const render = readFileSync(join(here, "../../lib/pdf/render.ts"), "utf8");
const route = readFileSync(
  join(here, "../../../../../packages/shared/src/sales-order-route.ts"),
  "utf8",
);
/* The POS half of the parity contract (owner ruling 2026-08-26). A fact both
   surfaces ask for must offer the same answers, so the list lives in shared and
   BOTH files are read here — a POS that stopped importing it would pass its own
   suite while silently re-forking the question. */
const stairCarry = readFileSync(join(here, "../dealer/pos/StairCarryFields.tsx"), "utf8");
const salesOrderForm = readFileSync(
  join(here, "../../../../../packages/shared/src/sales-order-form.ts"),
  "utf8",
);

describe("Sales Order object template contract", () => {
  it("keeps one object identity and the exact four-item object navigation", () => {
    /* The header is now the SHARED object header (the DO page reuses it with
       its own back destination — one implementation, Law C). The SO contract
       survives as the parameterized DEFAULT. */
    expect(header).toContain('backTo = "/operation/orders"');
    expect(header).toContain('backLabel = "Sales Orders"');
    expect(header).toContain("aria-label={backLabel}");
    expect(header).not.toContain("Back to Sales Orders");
    expect(workspace).toContain('const OBJECT_VIEWS = ["Order", "Revisions", "History", "Order Route"]');
    expect(header).not.toContain('word="Sales Order"');
    expect(workspace).not.toContain("Back to register");
  });

  it("keeps output explicit and rare destructive actions out of the primary action row", () => {
    expect(workspace).toContain("Print ▾");
    expect(workspace).toContain("More actions");
    expect(workspace).toContain("setObjectView(view)");
  });

  /* ── ONE PAGE, ONE STATE — owner ruling 2026-08-15 ─────────────────────── */

  it("has retired the whole-page edit mode and strips a stale `?edit=1`", () => {
    /* There is no Edit button, no edit mode and no edit-only notice — the
       fields are simply editable. What remains is the redirect for a bookmark
       that still carries the retired param. */
    expect(workspace).not.toContain('data-testid="workspace-edit"');
    expect(workspace).not.toContain('next.set("edit", "1")');
    expect(workspace).not.toContain(
      "Editing operational details only. Commercial changes require an amendment.",
    );
    expect(workspace).not.toContain('"Edit operational details"');
    expect(workspace).toContain('if (!params.get("edit")) return');
    expect(workspace).toContain('next.delete("edit")');
    expect(workspace).toContain('type Mode = "object" | "create" | "oldrev"');
  });

  it("shows the save bar only when something changed, and counts the fields", () => {
    expect(workspace).toContain('data-testid="save-bar"');
    expect(workspace).toContain("mode === \"object\" && dirty &&");
    expect(workspace).toContain('⚠ {changedFields.length}');
    expect(workspace).toContain("Discard");
    /* Dirty navigation still refuses safely — a half-typed address must not
       leave by a tab click or a browser close. */
    expect(workspace).toContain('addEventListener("beforeunload"');
    expect(workspace).toContain("Discard unsaved changes?");
    expect(workspace).toContain("if (!confirmDiscard()) return");
    /* ⛔ A REFETCH MAY NEVER CLOBBER AN OPEN EDIT (ui/MASTER.md §6.4 C3). */
    expect(workspace).toContain("if (dirtyRef.current) return;");
    expect(workspace).toContain("const seed = `${orderId}:${detailQ.dataUpdatedAt}`");
    /* A save makes what was saved the new baseline, so the bar clears without
       waiting for the round trip and the refetch lands on a clean form. */
    expect(workspace).toContain("setBaseline(draftRef.current)");
  });

  /* `01-design-tokens.md` §2.2 is frozen: blue appears ONCE on a screen. Eight
     blue section rules would spend the accent eight times over. */
  it("keeps the section bars grey so the one accent stays the current thing", () => {
    expect(workspace).toContain("border-l-2 border-base-300 pl-2");
    expect(workspace).not.toContain("border-l-2 border-kit-blue-9");
    /* The tab underline is the screen's one accent, and it marks the current
       view — the accent's own job. */
    expect(workspace.match(/bg-kit-blue-9/g)).toHaveLength(1);
  });

  it("draws two 50/50 panes that scroll separately and stack below 1024px", () => {
    expect(workspace).toContain('data-testid="object-two-panes"');
    expect(workspace).toContain("flex h-full min-h-0 flex-col lg:flex-row");
    expect(workspace).toContain("lg:w-1/2 lg:overflow-hidden");
    /* ⭐ THE DOCUMENT PANE SCROLLS AT EVERY WIDTH (2026-09-11). It was
       `lg:overflow-auto`, so below the split breakpoint — where the panes
       STACK and the document is at its narrowest — the pane clipped nothing
       and a page wider than it pushed the PAGE sideways. The 50/50 split and
       the stacking rule below 1024px are unchanged; only the clipping is. */
    expect(workspace).toContain("overflow-auto border-t border-kit-slate-5 bg-kit-slate-3 px-4 py-4 lg:w-1/2 lg:border-l lg:border-t-0");
    /* The PAGE does not scroll at desktop widths; the panes do. */
    expect(workspace).toContain("min-h-0 flex-1 overflow-auto bg-kit-slate-3 lg:overflow-hidden");
  });

  /* ── THE PREVIEW IS THE DOCUMENT ───────────────────────────────────────── */

  it("renders the real document through the SAME renderer Print uses", () => {
    expect(workspace).toContain('data-testid="pdf-pane"');
    /* ONE RENDERER, TWO PURPOSES. The pane paints the bytes of the PREVIEW
       blob; Print opens a blob built from the SAVED data. Both go through
       `renderSalesOrderPdf` — a second lookalike renderer is the failure this
       asserts against, and a page-local template call would show up here as a
       third name rather than a second call. */
    expect(workspace.match(/renderSalesOrderPdf\(/g)).toHaveLength(2);
    expect(workspace).toContain("const blob = await renderSalesOrderPdf(data)");
    expect(workspace).toContain("const blob = await renderSalesOrderPdf(printData)");
    expect(render).toContain("return toBlob(SalesOrderTemplate(data))");
    /* The paper is centred at a fixed maximum width. */
    expect(workspace).toContain('className="relative mx-auto max-w-[700px]"');
  });

  /* ⭐ PRINT IS THE SAVED TRUTH — owner ruling 2026-08-15. Preview-equals-Print
     is asserted in the SAVED state only, so the printable blob may never be
     built from the draft, and a dirty print must SAY which version it gave. */
  it("prints the saved version while the form is dirty, and says so", () => {
    expect(workspace).toContain(
      "mode === \"oldrev\" && viewedRevision ? templateData : base",
    );
    expect(workspace).toContain(
      'toast.message("You have unsaved changes — printing the saved version")',
    );
    /* The draft's own blob is never handed to Print. */
    expect(workspace).not.toContain("window.open(pdfUrl,");
  });

  it("watermarks the paper while changes are unsaved, without printing it", () => {
    expect(workspace).toContain('data-testid="unsaved-watermark"');
    expect(workspace).toContain("UNSAVED");
    expect(workspace).toContain("pointer-events-none absolute inset-0");
    /* The watermark is markup over the canvas — it never reaches the template
       data, so Print produces the document and not a picture of the screen. */
    expect(workspace).not.toContain("watermark:");
  });

  it("keeps a pending amendment out of the document body and on a banner", () => {
    expect(workspace).toContain('data-testid="pending-amendment-banner"');
    expect(workspace).toContain("⚠ Amendment pending approval: delivery date →");
    /* The preview always renders the effective revision: the proposal reaches
       the banner from `proposed_snapshot` and never the template data. */
    expect(workspace).toContain("proposed_snapshot");
    expect(workspace).not.toContain("draftTemplateData(liveAmendment");
  });

  /* AN OLD REVISION IS A PHOTOGRAPH. The same fields render, filled from THAT
     snapshot and locked — never today's values wearing a read-only pill. */
  it("fills the form from the snapshot and locks it when a revision is open", () => {
    expect(workspace).toContain("function draftFromSnapshot(snap: SalesOrderSnapshot): Draft");
    expect(workspace).toContain("const seed = `${orderId}:rev:${viewRev}`");
    expect(workspace).toContain('disabled={mode === "oldrev"}');
    expect(workspace).toContain("<fieldset");
    expect(workspace).toContain("Viewing Rev {viewedRevision.revision} · read-only");
    /* No save bar can exist there — the diff is empty by construction. */
    expect(workspace).toContain('if (mode === "oldrev") return [];');
    /* Selecting an old revision leaves the ledger and opens the SAME complete
       document workspace. The Revisions tab remains current in the header. */
    expect(workspace).toContain(
      '(objectView === "Revisions" && mode !== "oldrev") || objectView === "History"',
    );
  });

  /* ⭐ THE ORDER TAB STOPS RE-PRINTING WHAT `Order Route` OWNS — owner ruling
     2026-08-26 (Jess). This assertion is INVERTED, not deleted, and that needs
     its reasoning recorded because it used to protect two whole cards.

     `Delivery Journey` and `Related Documents` were both read-only mirrors of
     facts another view already draws. Jess ruled them off the Order tab; the
     facts survive because `Order Route` carries every one of them —
     `packages/shared/src/sales-order-route.ts` builds a `LOGISTICS` node from
     the same `logistics.partnerName`, a `DELIVERY DATE` node carrying the
     appointment and its slot, a `DELIVERY ORDER` node, and a door on each of
     PURCHASING · RECEIVING · STOCK · MONEY · the Service branch. Nothing was
     the Order tab's alone.

     Two duplications died with them and are asserted below so they cannot come
     back: the customer's promised date was printed TWICE (`Requested Delivery Date`
     in Order info and `Customer promise` in Delivery Journey — one fact, two
     labels, ownership Law D), and `Journey` is a word COPY-STANDARD:1337 and
     :1453 both ban in favour of `Order Route`. */
  it("leaves the delivery journey and the document index to Order Route", () => {
    expect(workspace).not.toContain('title="Delivery Journey"');
    expect(workspace).not.toContain('title="Related Documents"');
    expect(workspace).not.toContain('data-testid="sales-order-related-documents"');
    /* The banned word is gone from the surface entirely. */
    expect(workspace).not.toContain("Journey");
    /* ONE promised-date FACT, under the one governed label. `Customer
       Delivery` still appears twice — the create picker and the object-mode
       Fact, which are the same field in two modes. `Customer promise` was a
       SECOND label for that same date on a card that is now gone. */
    expect(workspace).not.toContain('label="Customer promise"');
    /* The tab that inherited the work is still reachable and still exists. */
    expect(workspace).toContain('const OBJECT_VIEWS = ["Order", "Revisions", "History", "Order Route"]');
    expect(workspace).toContain("<SalesOrderRoute");
    /* And the queries that fed ONLY those two cards left with them, or the page
       would still pay for three round trips it never renders. */
    for (const dead of ["deliveryOrdersQ", "paymentsQ", "guaranteesQ", "relatedDocuments"]) {
      expect(workspace, `${dead} outlived the card that read it`).not.toContain(dead);
    }
  });

  /* ⭐ FEWER CARDS, SAME FACTS — owner ruling 2026-08-26 (Jess): "make it merge
     more". `DELIVERY ADDRESS` joined `CUSTOMER` and `SALES OWNERSHIP` joined
     `ORDER INFO`. The merge may not cost a locked WORD, so each keeps its exact
     name; what it loses is a border, a 24px gap and a second heading rule.

     ⭐ RE-PINNED 2026-09-01 (YH): `Sales ownership` came back OUT as a card of
     its own. Jess's ruling was "fewer, fuller cards", and this half of it did
     not serve that — `Order info` is what the CUSTOMER asked for (dates,
     floors, a lift) and sales ownership is who inside Carres gets paid, so the
     merged card held two topics rather than one fuller one. `Delivery address`
     is untouched: it is the same party's fact as the customer above it, which
     is why that half of the merge still reads as one card. */
  it("puts ownership inside Customer and gives Delivery a card of its own", () => {
    /* ⭐ 2026-09-11. The two halves swapped homes, and each one moved TOWARD
       the fact it belongs with: three salesperson names joined the customer
       they sold to; the address joined the access conditions that decide
       whether the lorry can reach it. Both keep their locked words — `Block`
       and `SubHead` render the same string in a different rank. */
    expect(workspace).toContain("<SubHead>Sales ownership</SubHead>");
    expect(workspace).not.toContain('<Block title="Sales ownership">');
    expect(workspace).toContain('<Block title="Delivery">');
    expect(workspace).toContain("<SubHead>Delivery address</SubHead>");
    expect(workspace).not.toContain('<Block title="Delivery address">');
    /* Every field of both sections still renders. */
    expect(workspace).toContain('data-pos-field="address"');
    expect(workspace).toContain('data-pos-field="billing"');
    expect(workspace).toContain("<SalesOrderAttribution");
    /* Emergency contact keeps its own heading AND gains the divider that makes
       it read as a section rather than three more customer boxes. */
    expect(workspace).toContain("<SubHead>Emergency contact</SubHead>");
    expect(workspace).toMatch(/border-t border-kit-slate-5 pt-3">\s*\n\s*<SubHead>Emergency contact<\/SubHead>/);
  });

  /* ⭐ THE THIRD MERGE PASS — YH, 2026-08-27. Seven cards became FOUR (plus
     the conditional work card), and the order changed: MONEY rose above
     ORDER INFO, directly under CUSTOMER.

     `Emergency contact` and `Change delivery date` were the last two collapsible
     cards. Merged, they lose the fold with the border — which also retires the
     `forceOpen` machinery that existed ONLY because they could be collapsed: a
     section that is always on screen cannot hide an unsaved change or a live
     amendment, which is what those two guards were for.

     Neither loses its NAME or its governed copy: `creates a Revision · needs
     approval` moved onto the subsection heading rather than being reworded. */
  it("keeps four cards, in the ruled order, with the two folds merged in", () => {
    const cards = [...workspace.matchAll(/<Block$\s+title="([^"]+)"|<Block title="([^"]+)"/gm)]
      .map((m) => m[1] ?? m[2]);
    /* ⭐ RE-PINNED 2026-09-10 — the approved Sales Order detail composition.
       `Money` moved from SECOND to below `Goods`. It is the same card with the
       same locked word; what changed is that it now reads AFTER the thing it is
       about. The order total is stated once, under the Goods table that
       produces it, and this card answers the collections question underneath
       it — so a reader goes value → what came in → what is still out in one
       downward sweep instead of meeting the money before the goods. */
    /* ⭐ RE-PINNED 2026-09-11 — the approved Sales Order detail organisation.
       `Sales ownership` folded INTO `Customer` (who sold it is part of who
       bought it) and `Delivery` came out as a card of its own, holding the
       address, the billing relationship and the access conditions that were
       split across two cards before. The page now reads as five questions:
       who · when · where · what · money. */
    expect(cards).toEqual([
      "Customer",
      "Order info",
      "Delivery",
      "Goods",
      "Money",
      "What this change started elsewhere",
    ]);
    /* `Emergency contact` survives as a named subsection of CUSTOMER… */
    expect(workspace).toContain("<SubHead>Emergency contact</SubHead>");
    expect(workspace).not.toContain('title="Emergency contact"');
    expect(workspace).toContain("so-emergency-name");
    /* …and it is still gated on the 0219 config, not hardcoded on. */
    expect(workspace).toContain("{emergencyEnabled && (");
  });

  /* ⭐ THE AMEND TRIO IS A MODAL, OPENED FROM THE DATE IT MOVES — YH,
     2026-08-27. It has now been a card, then a merged subsection, and neither
     earned standing space: three fields open on every order for an act that
     happens rarely.

     Two things this pins beyond the move. The governed note travelled to the
     modal's DESCRIPTION rather than being dropped — it is read on opening now,
     not as a footnote beside the button that commits it. And a LIVE proposal
     is NOT behind the modal: a pending amendment is truth, so it prints beside
     the date it is waiting to move, where somebody reading that date sees it. */
  it("opens the amend trio from beside Requested Delivery Date, and never hides a live one", () => {
    expect(workspace).toContain('data-testid="amend-date-open"');
    expect(workspace).toContain("setAmendDateOpen(true)");
    expect(workspace).toContain('title="Change delivery date"');
    expect(workspace).toContain('description="creates a Revision · needs approval"');
    expect(workspace).toContain("<SalesOrderAmendDeliveryDate");
    /* The modal closes itself once the proposal is recorded. */
    expect(workspace).toContain("onDone={() => setAmendDateOpen(false)}");
    expect(amendDate).toContain("onDone?.()");
    /* A pending proposal is stated in the CARD, not behind the door. */
    expect(workspace).toContain('data-testid="amend-date-waiting"');
    /* And no standing section survives on the card. */
    expect(workspace).not.toContain("<SubHead>Change delivery date</SubHead>");
  });

  /* ⭐ THE STANDING FACT SITS BESIDE THE CARD'S NAME (Jess, 2026-08-26) —
     "add stuff to header part like the new/existing customer thingy". It stays
     a FACT, never a control: the phone probe derives it and MASTER.md:1038
     rules it read-only on both surfaces. It rides the header bar as a compact
     pill (Jess, 2026-09-10 density pass) rather than matching the card
     title's own shouting face — a badge reads as a fact, not a second title. */
  it("answers new-or-existing inside the Customer card's own header bar, and still never lets it be typed", () => {
    expect(workspace).toContain('data-testid="customer-type-chip"');
    // `\s+`, not a literal newline: a Windows checkout holds CRLF, CI's Linux
    // checkout holds LF, and the same file must match on both.
    const start = workspace.search(/<Block\s+title="Customer"/);
    const customer = workspace.slice(start, workspace.indexOf('</Block>', start));
    expect(start).toBeGreaterThan(-1);
    expect(customer).toContain("headerSlot=");
    expect(customer).toContain('data-testid="customer-type-chip"');
    expect(customer).toContain("rounded-full");
    expect(workspace).not.toContain('label="Customer type (auto)"');
    expect(workspace).toContain("customerTypeWord");
    /* The accent is spent once, on the tab underline — a chip may not take it. */
    expect(workspace.match(/bg-kit-blue-9/g)).toHaveLength(1);
  });

  /* ⭐ ONE FACT, ONE CONTROL SHAPE, BOTH SURFACES — owner ruling 2026-08-26
     (Jess): "ensure both sides of filling in are the same". The POS offers two
     named answers to the lift question; this page offered an unlabelled
     tickbox, where unticked meant BOTH "no lift" and "nobody said". The two
     words now live in ONE place and both surfaces import them. */
  it("asks the lift question with the POS's own two words", () => {
    expect(workspace).toContain('<Select id="so-lift" label="Lift available?"');
    expect(workspace).toContain("LIFT_OPTIONS");
    expect(workspace).not.toContain('<Checkbox id="so-lift"');
    expect(stairCarry, "the POS must read the same list").toContain("LIFT_OPTIONS");
    expect(salesOrderForm).toContain('export const LIFT_OPTIONS = ["No lift", "Has lift"] as const');
  });

  /* ⭐ THE STAIR CARRY IS ADDED UP OUT LOUD (Jess, 2026-08-26) — the office
     keyed floor, quantity and lift and was told nothing back while the POS
     printed the whole working-out. ⛔ The arithmetic is IMPORTED: one derived
     fact has ONE arithmetic (ownership Law D), so a second copy of the formula
     on this page is the failure being asserted against. */
  it("shows the stair-carry working-out, without a second copy of the sum", () => {
    expect(workspace).toContain('data-testid="so-stair-working"');
    expect(workspace).toContain("floorSurchargeRaw(");
    expect(workspace).toContain('from "@/lib/order-totals"');
    /* The rate and the free floors are READ from config, never retyped. */
    expect(workspace).toContain("cfg.freeUpToFloor");
    expect(workspace).toContain("cfg.perFloorPerItem");
    expect(workspace).not.toMatch(/freeUpToFloor\s*[:=]\s*\d/);
  });

  /* ⭐ A SAVED ORDER READS ITS OWN CHARGE, NEVER TODAY'S RATE (YH, 2026-09-01).
     The working-out priced from the live `floor_config` singleton in EVERY
     mode, so a principal moving the rate made one page print two numbers: the
     sentence narrated the new rate while MONEY, the PDF and every payment cap
     kept the fee that was actually stamped. An old revision was worse — it
     mixed the snapshot's floor with the CURRENT order's line count.

     ⛔ The live rate may reach this sentence on a CREATE and nowhere else,
     because a create is the one state with no stamped row to read. */
  it("prices the working-out from the stamped row once the order exists", () => {
    expect(workspace).toContain("const stairWorking = useMemo");
    /* The saved branch reads the stamped STAIR_CARRY row — the same row MONEY
       reads, so the two cannot disagree on one page. */
    expect(workspace).toContain("STAIR_CARRY_ADDON_KEY");
    /* A REVISION IS A PHOTOGRAPH: its own lines and its own addons, never the
       order's current ones. */
    expect(workspace).toContain('mode === "oldrev" ? (viewedRevision?.snapshot ?? null) : null');
    /* The rendered fee is the one the memo resolved per mode, never the live
       re-derivation. */
    expect(workspace).toContain("<Money value={stairWorking.fee} />");
    expect(
      workspace,
      "the live rate must not be rendered directly — it is create-only, via stairWorking",
    ).not.toContain("<Money value={stair.cfg.perFloorPerItem} />");
    expect(workspace).not.toContain("<Money value={stair.fee} />");
  });

  /* ⭐ PROCEED DATE IS READ-ONLY ON AN EXISTING ORDER (Jess, 2026-08-26),
     REFINED 2026-08-28 (YH): a date that was never RECORDED is not a date that
     is LOCKED. The lock is on the ANSWER, never on the emptiness.

     The two assertions below are the same INTENT this test has always pinned —
     a recorded proceed date is a Fact, and the field still has a control — and
     they are unchanged. What is replaced is the third: `mode === "create" ?`
     was a SPELLING of "only create offers the picker", and that sentence is no
     longer the rule. The invariant that survives is stated directly instead. */
  it("records a proceed date it HAS, and offers one it never recorded", () => {
    /* ⚠️ THE END BOUNDARY MOVED WITH THE FIELDS, 2026-09-10. This span used to
       end at `data-pos-field="stairCarry"`, which sat directly below the
       proceed date on `Order info`. Floor / lift / stair carry are delivery
       ACCESS facts and now sit with the address they qualify, ABOVE this card —
       so that marker no longer bounds anything here and the slice came back
       empty (a passing-looking assertion on ''). The card's own end is the
       honest boundary. */
    const field = workspace.slice(
      workspace.indexOf('data-pos-field="proceedDate"'),
      workspace.indexOf('<Block title="Delivery">'),
    );
    /* A recorded date is a photograph, on every mode that is not create. */
    expect(field).toContain('<Fact label="Proceed date"');
    expect(field).toContain('<DatePicker id="so-proceed"');
    /* The correction door, and the one thing that makes it safe: the test is
       the SAVED value. Reading `draft` would lock the control the instant a
       date was picked, before the operator could correct a mis-click. */
    expect(field).toContain('!baseline.proceed_date');
    expect(field).not.toContain("!draft.proceed_date ?");
    /* It opens for an existing order, never for an old revision — `oldrev` is
       a photograph and carries no lane. */
    expect(field).toContain('mode === "object"');
    /* The builtin still has a control on the page — the completeness test below
       walks the POS registry and would not accept the field simply vanishing. */
    expect(workspace).toContain('id="so-proceed"');
  });

  /* ⭐ THE OFFICE DOOR NAMES THE PRODUCTION START (YH, 2026-08-28).
     The POS has refused an order without one since Phase 11.1; this door did
     not, so it could mint the one order nobody could then repair. Pinned as
     INTENT — the refusal exists and uses the ruled words — not as a line. */
  /* ⭐ THE QUOTE INCLUDES THE CARRY, BEFORE IT IS SAVED (YH, 2026-08-28).
     On `/so/new` there is no persisted STAIR_CARRY addon to read — 0393 stamps
     it at birth — so the create branch adds the fee from the same memo that
     prints the working-out. The DOUBLE-COUNT is the trap this pins: in
     `object` mode the row IS in the addons, so adding it again there would
     charge the carry twice on every upstairs order. */
  it("puts the stair fee in the quote on create, and never twice on a saved order", () => {
    const money = workspace.slice(
      workspace.indexOf("const money = useMemo"),
      workspace.indexOf("const cancelledLines"),
    );
    const createBranch = money.slice(
      money.indexOf('if (mode === "create")'),
      money.indexOf("const lines = detailQ.data?.lines"),
    );
    expect(createBranch).toContain("stair?.fee");
    /* The object branch reads the persisted addons and adds nothing. Sliced to
       the BODY, stopping before the dependency array — `stair?.fee` legitimately
       appears there, and letting the slice run on would assert against the memo's
       own deps rather than its arithmetic. */
    const objectBranch = money.slice(
      money.indexOf("const lines = detailQ.data?.lines"),
      money.indexOf("  }, [mode,"),
    );
    expect(objectBranch).not.toContain("stair?.fee");
    /* ONE arithmetic: the quote and its explanation read the same memo, never
       a second copy of `floorSurchargeRaw` inside the money block. */
    expect(money).not.toContain("floorSurchargeRaw(");
  });

  /* ⭐ THE PAPER AND THE MONEY CARD AGREE ON THE DRAFT (YH, 2026-08-28, found
     on the screen). MONEY read RM 1,540 while the document beside it printed
     BALANCE DUE RM 1,490 — the fee was in the card and not on the paper.
     A SAVED order gets the row from `base.addons` (0393); a draft has no row
     yet, so the preview synthesises the same one. */
  it("puts the stair carry on the draft paper, and never on top of a saved row", () => {
    const fn = workspace.slice(
      workspace.indexOf("function draftTemplateData"),
      workspace.indexOf("function snapshotTemplateData"),
    );
    /* The row is a real addon, so the customer can READ the charge they are
       being asked to sign for — not a silent difference between two totals. */
    expect(fn).toContain("STAIR_CARRY_ADDON_KEY");
    expect(fn).toContain('label: "Stair carry"');
    /* `base?.addons ??` — the saved row WINS. Adding the synthetic one on top
       of it would print the charge twice on every upstairs order. */
    expect(fn).toContain("base?.addons ??");
    /* And it feeds the same subtotal every other addon feeds, so the paper's
       BALANCE DUE cannot drift from the card again. */
    expect(fn).toContain("addons.reduce((s, a) => s + a.line_total, 0)");
  });

  it("refuses to create an office order with no proceed date", () => {
    expect(workspace).toContain("needDealer && !draft.proceed_date");
    /* COPY-STANDARD:1447 governs the words; a second spelling is how the POS
       ended up with two of them. */
    expect(workspace).toContain("Proceed date — pick the day production should start");
  });

  it("puts no toolbar on or above the paper", () => {
    const pane = workspace.slice(workspace.indexOf('aria-label="Sales Order document"'));
    expect(pane).not.toContain("Print ▾");
    expect(pane).not.toContain("<Button");
  });

  /* ── FIELD COMPLETENESS — the tally, made mechanical ───────────────────── */

  it("renders every field the Sales Portal collects — zero misses", () => {
    /* The POS's own builtin registry is the list. A field added there and not
       here fails this test rather than quietly existing on one surface. */
    for (const field of POS_FORM_BUILTINS) {
      expect(
        workspace.includes(`data-pos-field="${field.key}"`),
        `POS builtin \`${field.key}\` (${field.label}) has no control on the object page`,
      ).toBe(true);
    }
  });

  it("renders the wizard's sub-fields the registry keeps inside one builtin", () => {
    /* `address`, `billing` and `emergency` are single locked builtins covering
       several inputs each; `building_type` is not a builtin at all — it rides
       `entry_data.fields`. All of them are still questions the portal asks. */
    for (const id of [
      "so-line1",
      "so-line2",
      "so-postcode",
      "so-city",
      "so-state",
      "so-address-unknown",
      "so-building-type",
      "so-billing-same",
      "so-billing",
      "so-emergency-name",
      "so-emergency-phone",
      "so-emergency-relationship",
      "so-race",
      "so-gender",
      "so-birthday",
      "so-stair-items",
      "so-lift",
      "so-floor",
      "so-proceed",
    ]) {
      expect(workspace, `no control with id="${id}"`).toContain(`id="${id}"`);
    }
  });

  it("reads the field contract from the SAME 0219 config the POS renders from", () => {
    expect(workspace).toContain("useOrderEntryConfig");
    expect(workspace).toContain("resolveFormTab(formFields, t)");
    expect(workspace).toContain('tab("customer").custom');
    expect(workspace).toContain('tab("address").custom');
    expect(workspace).toContain('tab("emergency").custom');
    expect(workspace).toContain('tab("target").custom');
  });

  it("edits the emergency contact as three validated fields, not one string", () => {
    expect(workspace).toContain("parseEmergencyContact");
    expect(workspace).toContain("composeEmergencyContact");
    /* The stored column stays ONE text column — the codec is shared with the
       POS so a legacy string round-trips untouched. */
    expect(workspace).not.toContain('label="Emergency contact"');
    /* ⛔ The section's NOTE is retired (YH, 2026-08-27) — this used to assert
       the sentence was present. What the ruling protected was the THREE
       FIELDS over one column, which is asserted above and below; the note was
       a separate 2026-08-15 decision and it has been overwritten in both
       COPY-STANDARD and MASTER. Asserted absent so it cannot drift back. */
    expect(workspace).not.toContain("Used only if we cannot reach the customer on delivery day");
  });

  it("keeps the document address and the editable parts as one fact", () => {
    /* Before this card the structured parts were editable while the printed
       `customer_address` stayed on whatever was imported. */
    expect(workspace).toContain("const addressString = (d: Draft, was: Draft)");
    /* 2026-08-21: the string passes through autoCapitalize on its way out —
       still the ONE addressString fact, first letters lifted (Jess's
       "auto capitalized" ask). The contract is that addressString remains the
       single source; the wrapper does not add a second one. */
    expect(workspace).toContain("customer_address: autoCapitalize(addressString(draft, baseline)");
    expect(workspace).toContain("address: addressString(draft, baseline)");
    expect(workspace).not.toContain('id="so-address" label="Address"');
    /* A CLEAR HAPPENS ONLY WHEN SOMEBODY CLEARS IT — an order that arrived
       already ticked keeps its imported string, so a phone fix cannot wipe an
       address (or a billing address) nobody looked at. */
    expect(workspace).toContain("was.customer_address_unknown ? was.customer_address");
    expect(workspace).toContain("was.customer_billing_same ? was.customer_billing");
    expect(workspace).toContain("customer_billing: billingString(draft, baseline)");
  });

  /* ── THE WRITE BOUNDARY ────────────────────────────────────────────────── */

  it("calls the Sales Order creation fact SO Date, never Purchasing's Ordered", () => {
    expect(workspace).toContain('<Fact label="SO Date"');
    expect(workspace).toContain("order?.placed_at");
    expect(workspace).not.toContain('<Fact label="Ordered"');
  });

  it("keeps goods, price and Requested Delivery Date out of the direct writer", () => {
    expect(workspace).toContain('<Fact label="Requested Delivery Date"');
    /* One promised-date picker exists, and it is CREATE's — an existing
       order's promise moves by amendment only. */
    expect(workspace.match(/id="so-promised"/g)).toHaveLength(1);
    expect(workspace).toContain('mode === "create" ? (');
    const payload = workspace.slice(
      workspace.indexOf("const safeCorrectionPayload"),
      workspace.indexOf("const createHeaderPayload"),
    );
    for (const forbidden of ["delivery_date", "salesperson_id", "outlet_id", "dealer_id", "lines"]) {
      expect(payload, `${forbidden} must not ride the direct writer`).not.toContain(`${forbidden}:`);
    }
  });

  it("opens the amend trio with exactly three fields, through the governed lane", () => {
    expect(amendDate).toContain("Requested date (from customer)");
    expect(amendDate).toContain("New delivery date");
    expect(amendDate).toContain('label="Reason for change"');
    expect(amendDate).toContain("required");
    expect(amendDate).toContain("useSubmitSalesOrderAmendment");
    expect(amendDate).toContain("customerAskedOn");
    expect(workspace).toContain("creates a Revision · needs approval");
    /* ONE machinery: while a proposal is open this block submits nothing. */
    expect(amendDate).toContain("if (liveAmendment)");
  });

  it("keeps one door for goods, price and the promise", () => {
    expect(workspace.match(/<SalesOrderAmendment\b/g)).toHaveLength(1);
  });

  /* ⭐ THAT DOOR MOVED TO `More actions` — YH, 2026-08-26, following the exact
     precedent `Report a problem` set on 2026-08-15: a rare act does not hold
     permanent space on a page read every day.

     The strip is gone from `Order info`; the CAPABILITY is not, and that is
     what this pins. The modal is the only way to change items, unit price or
     instalment months anywhere on the Sales Order — `Change delivery date`
     submits a date and nothing else — so a later "remove the button" would
     silently retire three capabilities. It must fail here first. */
  it("opens the amendment from More actions, and keeps no idle strip on the card", () => {
    expect(workspace).toContain('data-testid="workspace-propose-change"');
    expect(workspace).toContain("Propose a change to the customer");
    expect(workspace).toContain("inlineTrigger={false}");
    expect(workspace).toContain("openSignal={amendSignal}");
    /* A counter, not a boolean — a boolean cannot reopen the modal after a
       cancel, which is the bug this shape exists to avoid. */
    expect(workspace).toContain("setAmendSignal((n) => n + 1)");
    /* The standing sentence that sat beside it is gone for good. */
    expect(amendment).not.toContain("they change by proposal, not by editing");
    /* Still MOUNTED on the card, because a LIVE proposal is truth and belongs
       there — only the rule + padding are conditional on one existing. */
    expect(workspace).toContain('liveAmendment ? "mt-3 border-t border-kit-slate-5 pt-3" : ""');
  });

  it("names the governed ownership request and hides it from Operation", () => {
    /* The word is locked (COPY-STANDARD:1427) and has now been a card, a
       merged subsection, and a card again. It is the SAME STRING through all
       three — `Block` uppercases every title, so becoming a card title moved
       the border and never the name. */
    expect(workspace).toContain("<SubHead>Sales ownership</SubHead>");
    /* ⛔ THE PERMISSION LANE IS UNTOUCHED BY THE MOVE. The component and its
       gates are the same file; only the heading above it changed rank. */
    expect(attribution).toContain("Change salesperson — needs approval");
    expect(attribution).toContain('role === "principal" || role === "hr"');
    expect(attribution).toContain("Request ownership change");
    expect(attribution).not.toContain("Change who this order belongs to");
  });

  it("keeps the Object goods truth at least as complete as the Register expansion", () => {
    expect(workspace).toContain('data-testid="document-goods"');
    for (const label of ["Category", "Unit ID", "SKU", "Qty", "Item", "Deliver To"]) {
      expect(workspace).toContain(`>${label}</th>`);
    }
  });

  /* THE NEW-ORDER GOODS ROW ALIGNS AT THE TOP (YH, 2026-08-29 — reported from
     `/operation/orders/so/new`). `items-end` bottom-aligned every cell, and
     only SKU and Unit price carry a hint line — so Qty dropped a whole row to
     bring its short box level with their hints, and the three labels sat at
     three heights.

     This is a SOURCE SCAN because jsdom computes no layout: a render test
     cannot see that two boxes sit on different lines. It pins the one class
     that decides it, which is what a later edit would flip back. */
  it("aligns the create-mode goods row on its labels, not on its hints", () => {
    expect(workspace).toContain("grid-cols-[1fr_84px_120px_32px] items-start");
    expect(workspace).not.toContain("grid-cols-[1fr_84px_120px_32px] items-end");
  });

  /* ── ACTIONS ───────────────────────────────────────────────────────────── */

  /* Copy is RETIRED (Jess, 2026-08-28) — it dropped line configuration and
     handed Purchasing an un-autofillable PO. The assertion is inverted rather
     than dropped, so a quiet re-introduction fails here. */
  it("carries Report a problem and Cancel in More actions, no Copy, and no Problems card", () => {
    expect(workspace).not.toContain("Copy to new Sales Order");
    expect(workspace).not.toContain("/operation/orders/so/new?copyFrom=");
    expect(workspace).toContain('data-testid="workspace-report-problem"');
    expect(workspace).toContain("Report a problem");
    expect(workspace).toContain("Cancel SO");
    expect(workspace).toContain("<ServiceCaseWizard");
    /* The permanent card is gone — the cases themselves live on Order Route. */
    expect(workspace).not.toContain('id="sales-order-problems"');
    expect(workspace).not.toContain("Report a customer, product, delivery or installation problem.");
  });

  it("adds one READ-ONLY door to Payments, scoped to this order, riding the card's own header bar", () => {
    /* COPY-STANDARD:1771 registers `Open this order in Payments` — plural, in
       the "use exactly" column. The screen said `Payment`, which is the kind of
       one-letter drift a dictionary exists to stop. */
    expect(workspace).toContain("Open this order in Payments");
    expect(workspace).not.toContain("Open this order in Payment\n");
    expect(workspace).toContain("/finance/payments?order=");
    expect(workspace).not.toContain("Record payment");
    expect(workspace).not.toContain("Collect $");
    const start = workspace.search(/<Block\s+title="Money"/);
    const money = workspace.slice(start, workspace.indexOf('</Block>', start));
    expect(start).toBeGreaterThan(-1);
    expect(money).toContain("headerSlot=");
    /* THE OLD SHAPE: a second, redundant door in the card BODY. The bar under
       the amounts is now the Paid/Outstanding pair, which is not a door — so
       the invariant is stated as what it always meant: exactly one door, and it
       is the header's. */
    expect(money.match(/data-testid="workspace-open-payments"/g) ?? []).toHaveLength(1);
    expect(money).not.toContain("Record payment");
    /* The door lives in the header now, so it renders BEFORE the three
       amounts rather than in a row underneath them. */
    expect(money.indexOf('data-testid="workspace-open-payments"')).toBeLessThan(
      money.indexOf('data-testid="money-outstanding"'),
    );
  });

  /* THE PIN MOVED, NOT THE FACT (YH, 2026-08-28). This used to assert the
     2026-08-15 weighting — Total large · Paid medium · Outstanding loudest.
     That weighting never reached the amounts: `<Money>` renders each at its
     `row` tone, so the three digits were always the same size and only the
     containers differed, which is exactly why the three numbers did not line
     up. The surviving invariant is what the block is FOR — three named money
     facts, one size, and red while any is owed. */
  it("states Paid + Outstanding under the ledger, one size, red while owed", () => {
    /* ⭐ 2026-09-10 — `Total` LEFT THIS CARD. It is stated once, under the Goods
       table that produces it (`data-testid="goods-total"`); repeating it beside
       Paid would be the scattered summary the approved composition removes.
       The two figures that remain are the collections facts. */
    expect(workspace).toContain('data-testid="goods-total"');
    expect(workspace).not.toContain('data-testid="money-total"');
    expect(workspace).toContain('data-testid="money-paid"');
    expect(workspace).toContain('data-testid="money-outstanding"');
    /* One size on both, and red only while something is owed. */
    expect(workspace).toContain('className="text-strong tabular-nums text-base-700" data-testid="money-paid"');
    expect(workspace).toContain('`text-strong tabular-nums ${money.known && money.outstanding > 0');
    expect(workspace).toContain('money.known && money.outstanding > 0 ? "text-danger"');
    // The retired sizes may not come back.
    expect(workspace).not.toContain('className="text-title text-base-900" data-testid="money-total"');
    expect(workspace).not.toContain('label="Balance"');
    /* ⭐ EXACT AMOUNTS, TO THE CENT. `fmtMoney` is the governed spelling for
       "what is owed, what was paid" (money-format.ts, Loo 2026-07-28); the
       rounding `<Money>` recipe would print RM 2,500 against a ledger row of
       RM 2,499.50 and the receipt would disagree with the screen. */
    expect(workspace).toContain("fmtMoney(money.paid)");
    expect(workspace).toContain("fmtMoney(money.outstanding)");
  });

  it("carries NO guidance banner — the amber field note and the owned Work action say it once (owner 2026-08-18)", () => {
    // The seven-answer banner lectured instead of working and said one thing
    // in three places; it is DELETED, named here so it cannot quietly return.
    expect(workspace).not.toContain("missingDeliveryDateGuidance");
    for (const label of ["Who must act", "Who to contact", "What to use", "What happens next"]) {
      expect(workspace).not.toContain(label);
    }
    // What survives: the amber field-level note on Requested Delivery Date.
    expect(workspace).toContain('>No delivery date</span>');
  });

  it("keeps the SO number visible when the header runs out of room", () => {
    expect(header).toContain('data-testid="object-identity"');
    expect(header).toContain('className="shrink-0" data-testid="object-identity"');
    expect(header).toContain('data-testid="object-identity-customer"');
  });

  it("puts no Chinese on an operator screen", () => {
    for (const source of [workspace, header, attribution, amendDate]) {
      expect(source).not.toMatch(/[一-鿿]/);
    }
  });
});

/**
 * ⭐ THE THREE-RANK RECORD GRAMMAR IS STRUCTURE, NOT STYLE (CARD 2026-08-27).
 * `ui/MASTER.md` § HISTORY + REVISION THREE-RANK RECORD GRAMMAR is
 * owner-approved/locked; this pins the parts a green component suite could
 * quietly lose: the governed audit-defect words, the deleted `Unknown user`,
 * the 13/12/11 tokens, and the complete-version navigation that must survive
 * around them.
 */
describe("Sales Order record grammar contract", () => {
  const ledger = readFileSync(join(here, "SalesOrderLedger.tsx"), "utf8");

  it("⭐ has deleted `Unknown user` from employee copy, for good", () => {
    expect(ledger).not.toContain("Unknown user");
    expect(workspace).not.toContain("Unknown user");
    /* The governed audit-data defect sentence stands in its place — a legacy
       row without an actor states the defect; it never invents a person. */
    expect(ledger).toContain("Staff identity not recorded");
  });

  it("renders the three ranks in the ruled 13/12/11 tokens", () => {
    expect(ledger).toContain("text-body font-semibold");
    expect(ledger).toContain("text-meta font-normal");
    expect(ledger).toContain("text-label font-normal");
  });

  it("translates raw stored values at the read boundary, never in the store", () => {
    expect(ledger).toContain('"No deposit"');
    expect(ledger).toContain('"Online order"');
  });

  it("keeps every revision record a real door into the complete version", () => {
    /* Semantic list + button, with the existing focus token — mouse and
       keyboard both activate it, and an old version opens the same complete
       read-only workspace the assertions above pin. */
    expect(ledger).toContain('data-testid="revision-list"');
    expect(ledger).toContain("focus-visible:ring-2 focus-visible:ring-kit-blue-9");
    expect(ledger).toContain("Propose this version again");
    /* The duplicate chip strip above a second list is retired. */
    expect(ledger).not.toContain("flex-wrap gap-1.5");
  });

  it("keeps the four object views and the old-revision door wired together", () => {
    expect(workspace).toContain('const OBJECT_VIEWS = ["Order", "Revisions", "History", "Order Route"]');
    expect(workspace).toContain("onViewRevision={setViewRev}");
    expect(workspace).toContain('disabled={mode === "oldrev"}');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   ONE FORM, ONE GRAMMAR (YH, 2026-09-01)

   Three separate reports about the same page, and they turn out to be one
   complaint: the Order screen was drawn in two grammars and the reader had to
   learn by trial which shapes accept typing.

   These are SOURCE SCANS, like the alignment pin above, for the same reason —
   jsdom computes no layout, so a render test cannot see that two boxes wear
   different skins, and mounting this 3,100-line workspace to prove a border is
   the wrong price. Each assertion names the ONE token a later edit would flip
   back, and each has an inverted half so the old shape cannot return quietly.
   ═════════════════════════════════════════════════════════════════════════ */
describe("Sales Order object page — one form grammar", () => {
  it("draws a recorded answer in the same box as the question that would ask it", () => {
    /* `Fact` is the page's read-only field. It must render through the kit's
       own frame and the kit's own control skin — the point is that there is
       ONE skin and this shares it, so a change to the control travels here
       instead of leaving a second, drifting copy behind. */
    expect(workspace).toContain('import FieldFrame from "@/components/kit/FieldFrame"');
    expect(workspace).toContain('import { CONTROL_BASE, CONTROL_BORDER } from "@/components/kit/field-recipe"');
    expect(workspace).toContain('data-kit="readonly-field"');
    expect(workspace).toContain("${CONTROL_BASE} ${CONTROL_BORDER.rest}");
    /* Announced as what it is drawn as. A box that looks typable and reads to
       a screen reader as loose text is the same defect in the other channel. */
    expect(workspace).toContain('role="textbox"');
    expect(workspace).toContain("aria-readonly");
    /* THE OLD SHAPE: a bare micro-label with body text under it, no box. */
    expect(workspace).not.toContain('<div className="text-label text-base-500">{label}</div>');
  });

  it("prints a service by its name and never by its database key", () => {
    /* The Goods table printed `a.addon_key` in the Item column — the raw key,
       where every goods row prints a product name — while `SalesOrderAddons`
       eighty pixels below printed the catalog name for the same row from the
       same bundle. One record, two names, and the key was the one on top.
       ONE map, read by both, so they cannot disagree again (Law D). */
    expect(workspace).toContain("const addonNameByKey = useMemo(");
    expect(workspace).toContain("addonNameByKey.get(a.addon_key) ?? a.addon_key");
    /* The service row now wears the goods row's own cells: the CJK face on the
       item, and the second line where a goods row already puts its config. */
    expect(workspace).toContain("cjkClassName(serviceName)");
    /* THE OLD SHAPE: the key rendered straight into the Item cell. */
    expect(workspace).not.toContain('<td className="py-1.5 pr-3">{a.addon_key}</td>');
    /* COPY-STANDARD:1679 — `Not recorded` is the ONE absence word, and the
       bare `—` the service row used sits in that row's `Do NOT use` column. */
    expect(workspace).not.toContain('<td className="py-1.5">—</td>');
    expect(workspace).not.toContain('<td className="py-1.5 pr-3">—</td>');
  });

  it("no longer offers the delivery payment approval door", () => {
    /* ⭐ RE-PINNED ON AN OWNER INSTRUCTION, 2026-09-01. This asserted the
       opposite this morning — that `0362`'s door survived, moved under
       `Outstanding`. The owner has since instructed that the door be removed,
       so the assertion is INVERTED rather than deleted: a quiet
       reintroduction has to fail here.

       WHAT THE REMOVAL MEANS, pinned so it cannot be read as a tidy-up.
       `0362` made "money in full before delivery" the default and allowed one
       exception, decided by the principal, which opened the Delivery Order as
       COD. This was the only surface that could raise or decide one, so the
       rule is now ABSOLUTE: `ops_delivery_orders_money_gate` still refuses a
       Delivery Order while a Sales Order's goods money is outstanding, and
       nothing can ask for the exception. An owing order is undeliverable
       until it is paid. That is the intended effect.

       AND NOTHING BELOW THE SCREEN WAS DROPPED. The record, both RPCs, the
       API routes and the database trigger are untouched — an approval already
       granted stays honoured, and putting the door back is a revert. */
    expect(workspace).not.toContain("function PaymentApprovalBlock(");
    expect(workspace).not.toContain("Request payment approval");
    expect(workspace).not.toContain("useRequestPaymentApproval");
    expect(workspace).not.toContain("useDecidePaymentApproval");
    /* The money summary itself is unchanged and still read-only (Law B). */
    expect(workspace).toContain('data-testid="money-outstanding"');
    expect(workspace).not.toContain("Record payment");
  });

  it("states the money amounts without giving Money a door", () => {
    /* ⭐ 2026-09-10 — the amounts are no longer three `Fact` boxes. `Total` is
       under Goods; `Paid` and `Outstanding` are a right-aligned pair beneath
       the ledger they summarise, on the same right edge its `Amount` column
       already uses, so the eye reads one column of numerals.
       LAW B IS UNTOUCHED, which is the invariant this test exists for: the
       card still summarises and still writes nothing. */
    expect(workspace).toContain("<PaymentLedger orderId=");
    for (const amount of ["Paid", "Outstanding"]) {
      expect(workspace).toContain(`>${amount}</span>`);
    }
    expect(workspace).toContain('data-testid="goods-total"');
    /* Colour and size survive INSIDE the box: red while owed (owner ruling
       2026-08-15), one `text-strong` on all three (YH, 2026-08-28). */
    expect(workspace).toContain('money.known && money.outstanding > 0 ? "text-danger" : "text-base-900"');
    expect(workspace).toContain('data-testid="money-outstanding"');
    /* THE OLD SHAPE: three loose amounts packed left on a flex row. */
    expect(workspace).not.toContain('<div className="text-label text-base-500">Total</div>');
    expect(workspace).not.toContain("flex flex-wrap items-baseline gap-x-8 gap-y-3");
  });

  it("says how many Units are ready instead of the word the dictionary refuses", () => {
    /* COPY-STANDARD:1755 puts `Not allocated` in its `Do NOT use` column. The
       registered answer is the count and then what is being waited on, and it
       is written ONCE in shared so the Goods table, the Order Route STOCK node
       and the register expansion cannot drift into three spellings. */
    expect(workspace).toContain("unitsShortWords(truth?.unitIds.length ?? 0, r.qty)");
    /* The rendered STRING is gone; the governance comment recording WHY it
       went stays, which is why this pins the quoted literal. */
    expect(workspace).not.toContain('"Not allocated"');
    expect(route).toContain("unitsShortWords(readyQty, line.committedQty)");
    expect(route).not.toContain("Waiting for purchase");
    /* A LOAD IS NOT A SHORTAGE — the Deliver To cell has always guarded this;
       the Unit ID cell printed a shortage while the read was still in flight. */
    expect(workspace).toContain("goodsTruthQ.isLoading && !truth");
  });

  it("makes the stair-carry parity tag cover the field it names", () => {
    /* THE DEFECT, AND IT IS THE SECOND TIME. `data-pos-field="stairCarry"`
       wrapped the FLOOR box alone, while the registry field it stands for is
       "Delivery access (floor / lift / stair carry)". The completeness check
       below only asserts the attribute EXISTS in this file — it cannot see
       what the attribute wraps — so it reported the field covered while
       checking one box of three, and deleting `Lift available?` would still
       have passed. `orderAddons` failed exactly this way once already, on a
       hidden span with no control behind it.
       This asserts the SPAN: everything from the tag to the next
       `data-pos-field` must contain all three controls. */
    /* The ATTRIBUTE, not the mention of it — the comment above the tag names
       it in prose, and a plain `indexOf` would find that first. */
    const attribute = /\n\s*data-pos-field="stairCarry"/;
    const tag = attribute.exec(workspace);
    expect(tag, "the tag exists as an attribute").not.toBeNull();
    const from = tag!.index;
    /* The span ends at the NEXT tag of any kind. Every remaining mention is a
       real field, so a plain `indexOf` is enough once we are past this one. */
    const next = workspace.indexOf('data-pos-field="', from + 30);
    expect(next, "there is a following tag to bound the span").toBeGreaterThan(from);
    const span = workspace.slice(from, next);
    for (const id of ['id="so-floor"', 'id="so-stair-items"', 'id="so-lift"']) {
      expect(span, `${id} sits inside the stairCarry tag`).toContain(id);
    }
    /* ⭐ AND NOTHING CLOSES THE TAG EARLY. Text order is not containment: a
       `</div>` after the floor box would end the tag while leaving the other
       two ids further down the file, and an order-only assertion passes on
       that — measured, by breaking it on purpose. A source scan cannot read
       the DOM, so it reads the one thing that decides nesting here: the tag's
       div must not close before the last of its three controls. */
    const toLift = workspace.slice(from, workspace.indexOf('id="so-lift"', from));
    expect(toLift, "the stairCarry div is not closed before the lift").not.toContain("</div>");
    /* Nothing moved on screen: the three fields keep the parent's own three
       tracks rather than collapsing into one cell. */
    expect(workspace).toContain("sm:col-span-3 sm:grid-cols-3");
  });

  it("never prints a database key on a customer's document", () => {
    /* An OLD REVISION's PDF is a customer document. It built its own rows from
       the stored snapshot and read `String(a.addon_key)`, so it printed
       `dispose_mattress` where the live document prints `Mattress disposal` —
       the live path was never wrong, because `base.addons` arrives labelled
       from the server. */
    expect(workspace).not.toContain("label: String(a.addon_key)");
    expect(workspace).toContain("addonLabel: (key: string) => string");
    expect(workspace).toContain("addonNameByKey.get(key) ?? key");
    /* A REVISION IS A PHOTOGRAPH. Where the stored row carries its own label,
       that is what the customer agreed to and that is what prints — the
       catalog is asked only where the photograph is silent. */
    expect(workspace).toContain('(a as { label?: unknown }).label === "string"');
  });

  it("enforces the stair-carry ceiling it has always printed", () => {
    /* THE DEFECT: the hint has read `0 to 5` since it was written and the box
       accepted 99. The POS stepper stops at the item count
       (`StairCarryFields.tsx`), so the office could save a count no shop floor
       could quote, while the working line on the same card priced the clamped
       five — one card, two answers, and the saved one was the wrong one.
       `stairCarryCount` is the clamp the FEE already runs and the SERVER
       stamps with. Imported, never re-typed: a second copy of a ceiling is how
       these two surfaces drifted apart the first time. */
    expect(workspace).toContain("stairCarryCount(stair.itemsTotal, Number(e.target.value) || 0)");
    expect(workspace).toContain("max={stair?.itemsTotal}");
    /* THE OLD SHAPE: a lower clamp only, so anything above the item count
       went straight through. */
    expect(workspace).not.toContain(
      'e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0),',
    );
    /* NO CEILING WITHOUT A COUNT — until the catalog answers, the item total
       is unknown, and a guessed ceiling would silently cut a correct answer.
       The floor at zero still applies. */
    expect(workspace).toContain("Math.max(0, Number(e.target.value) || 0)");
    /* The POS half of the same rule, so the parity is asserted and not
       assumed: both surfaces reach the one shared clamp. */
    expect(stairCarry).toContain("Math.min(itemsTotal, parsed)");
  });

  /* ─────────────────────────────────────────────────────────────────────────
     THE APPROVED SALES ORDER DETAIL COMPOSITION — 2026-09-10.
     Four moves, each of which puts a fact beside the fact it belongs with.
     ───────────────────────────────────────────────────────────────────────── */

  it("keeps delivery ACCESS in the Delivery card with the address it describes", () => {
    /* Floor / lift / stair carry qualify ONE address. They sat on `Order info`,
       a card away from it. The whole `stairCarry` group moved under the
       `Delivery address` subsection — the clamps, the POS-parity tag and the
       working line unchanged. */
    expect(workspace).toContain("<SubHead>Delivery access</SubHead>");
    const deliveryCard = workspace.slice(
      workspace.indexOf('<Block title="Delivery">'),
      workspace.indexOf('<Block title="Goods">'),
    );
    for (const id of ['id="so-floor"', 'id="so-stair-items"', 'id="so-lift"', 'id="so-building-type"']) {
      expect(deliveryCard, `${id} sits with the address`).toContain(id);
    }
    /* The billing relationship and the billing address are the same card's
       question — where the paperwork goes, beside where the goods go. */
    expect(deliveryCard).toContain('data-pos-field="billing"');
    /* …and the working line came with them, so the charge is explained where
       the three fields that produce it are read. It is a WORKING, not a second
       fee: the money is the stamped STAIR_CARRY addon, charged once in Goods. */
    expect(deliveryCard).toContain('data-testid="so-stair-working"');
    /* Order info is left with what the CUSTOMER asked for: dates. */
    const orderInfo = workspace.slice(
      workspace.indexOf('<Block title="Order info">'),
      workspace.indexOf('<Block title="Delivery">'),
    );
    expect(orderInfo).not.toContain('id="so-floor"');
  });

  it("groups the customer's own reference under Order info, not in page chrome", () => {
    /* `orders.source_ref` is a text[] — one customer legitimately carries
       several spellings — and it is read-only: the importer is its only
       writer. It was a grey meta line floating above the cards. */
    const orderInfo = workspace.slice(
      workspace.indexOf('<Block title="Order info">'),
      workspace.indexOf('<Block title="Delivery">'),
    );
    expect(orderInfo).toContain('<Fact label="Customer reference"');
    expect(orderInfo).toContain('(order?.source_ref ?? []).join(" · ")');
    /* THE OLD SHAPE: the same fact as chrome. */
    expect(workspace).not.toContain('<div className="px-1 text-meta text-base-500">');
  });

  it("states the agreed price and the line total on the goods rows, right-aligned", () => {
    const goods = workspace.slice(
      workspace.indexOf('<Block title="Goods">'),
      workspace.indexOf('data-testid="goods-total"'),
    );
    for (const label of ["Unit price", "Line total"]) {
      expect(goods).toContain(`>${label}</th>`);
    }
    /* Numerals right-aligned and tabular, so a column of money reads as one. */
    expect(goods).toContain('text-right font-medium">Unit price</th>');
    expect(goods).toContain('text-right font-medium">Line total</th>');
    expect(goods).toContain("{fmtMoney(r.unitPrice)}");
    expect(goods).toContain("{fmtMoney(r.total)}");
    /* A SERVICE row carries the same two columns off `order_addons`, so the
       table has one shape down its whole length. */
    expect(goods).toContain("{fmtMoney(Number(a.unit_price ?? 0))}");
    /* The six ruled columns are untouched and still present. */
    for (const label of ["Category", "Unit ID", "SKU", "Qty", "Item", "Deliver To"]) {
      expect(goods).toContain(`>${label}</th>`);
    }
  });

  it("states ONE total, under the table that produces it, from the canonical rule", () => {
    expect(workspace).toContain('data-testid="goods-total"');
    /* ⛔ NEVER A RE-SUM OF THE PRINTED ROWS. `money` is `orderMoney`, the same
       value the register and the document read (Law D). */
    expect(workspace).toContain("money.known && money.total != null ? fmtMoney(money.total) : \"No price yet\"");
    /* And it is stated ONCE — the Money card no longer repeats it. */
    expect(workspace).not.toContain('data-testid="money-total"');
  });

  it("reads the payment ledger without ever gaining a form for it (Law B)", () => {
    expect(workspace).toContain("<PaymentLedger orderId=");
    const ledger = readFileSync(join(here, "components/SalesOrderPaymentLedger.tsx"), "utf8");
    /* Every column the approved composition names. */
    for (const label of ["Date", "Method", "Amount", "Reference", "Receipt", "Slip", "Recorded by"]) {
      expect(ledger).toContain(`>${label}</th>`);
    }
    /* ⛔ A SUMMARY MAY NEVER GAIN A FORM. Recording, voiding and refunding are
       Payment's acts; the only control here opens a slip somebody uploaded. */
    for (const write of [
      "useRecordPayment", "useVoidPayment", "useRefund", "<form", "Record payment", "Void payment",
    ]) {
      expect(ledger, `the ledger must not write (${write})`).not.toContain(write);
    }
    /* `Voided` IS allowed and is the point: it is the read-only stamp on a
       reversed row, not a control. The banned list above is write AFFORDANCES,
       and the distinction is the whole of Law B. */
    expect(ledger).toContain("Voided");
    /* A VOIDED ROW IS NOT MONEY, and no reader spells `voided_at` itself. */
    expect(ledger).toContain("isLivePayment(p)");
    expect(ledger).not.toContain("p.voided_at ==");
    /* Amounts to the cent — the receipt may not disagree with the screen. */
    expect(ledger).toContain("fmtMoney(Number(p.amount ?? 0))");
    /* The method word and the slip door are the drawer's own, imported. */
    expect(ledger).toContain('from "@/lib/payment-display"');
  });

  it("re-cuts the document when its pane changes width, and never clips it", () => {
    /* ⭐ THE ORIGINAL CLIPPING HAD TWO CAUSES, and both are asserted here
       because either one alone brings it back.
       ① The pages were scaled to `pane.clientWidth`, which INCLUDES the pane's
          own padding — so every page was drawn wider than the box it had to
          sit in, at every width, not only narrow ones.
       ② The render effect depended on `[data, paneEpoch]` only. Nothing
          watched the pane, so a width change (drag the window, open a side
          panel) left a bitmap cut for the old width hanging over the new one. */
    expect(workspace).toContain("function contentWidthOf(");
    expect(workspace).toContain("paddingLeft");
    expect(workspace).toContain("new ResizeObserver(");
    expect(workspace).toContain("}, [data, paneEpoch, paneWidth]);");
    /* ⛔ COALESCED ON A TIMER, NOT A FRAME. `requestAnimationFrame` does not
       run in a hidden or background tab (measured: in a hidden tab neither rAF
       nor ResizeObserver delivery ran at all), so a width change that happened
       while the tab was away would never be applied and the operator would
       return to a page cut for the old width — the original bug through a
       different door. */
    expect(workspace).toContain("setTimeout(() => setPaneWidth(contentWidthOf(node)), 120)");
    expect(workspace).not.toContain("requestAnimationFrame(() => setPaneWidth");
    expect(workspace).toContain("clearTimeout(timer)");
    /* ⛔ AND NO `max-width: 100%` ON THE PAGE. Below `MIN_PDF_WIDTH` the page
       must stay readable and SCROLL inside the pane; capping it would squash
       it back to a smear, and on a zero-width pane collapse it to nothing.
       The pane scrolls at EVERY width, not only at `lg`. */
    expect(workspace).not.toContain('canvas.style.maxWidth');
    expect(workspace).toContain("min-h-0 min-w-0 overflow-auto border-t");
    /* ⛔ THE SPLIT IS NOT REMOVED. Replacing the permanent 50/50 preview with
       an on-demand comparison is NOT an approved layout change; the pane and
       its Print path stay exactly where they are. */
    expect(workspace).toContain('aria-label="Sales Order document"');
    expect(workspace).toContain("Print ▾");
  });

  it("states a recorded instalment plan, and invents nothing when there is none", () => {
    const ledger = readFileSync(join(here, "components/SalesOrderPaymentLedger.tsx"), "utf8");
    /* `orders.installment_months` + `orders.payment_method` are the at-sale
       capture — an ORDER fact, so it is stated above the ledger, never as a
       column on rows that do not carry it. */
    expect(ledger).toContain('data-testid="money-instalment"');
    expect(workspace).toContain("installment_months");
    expect(ledger).toContain("atSalePaymentWord(saved.method, saved.months)");
    /* ⛔ NO DERIVED MONTHLY FIGURE. A number this screen computed would be
       read as one Carres agreed to, and a month count plus a total does not
       say what the customer's bank actually charges. */
    expect(workspace).not.toMatch(/instalment[\s\S]{0,200}money\.total\s*\//);
    expect(workspace).not.toContain("perMonth");
  });

  it("keeps the commercial table free of cost and margin", () => {
    /* The 2990 reference prints REVENUE · COST · MARGIN · MARGIN % above its
       payments block. That is a management view, and this is the page an
       operator reads a customer's order from; a cost column here is a number
       the customer must never be shown over the counter. */
    const goods = workspace.slice(
      workspace.indexOf('<Block title="Goods">'),
      workspace.indexOf('data-testid="goods-total"'),
    );
    for (const word of ["Margin", "margin", "Cost", "cost", "Revenue"]) {
      expect(goods, `no ${word} in the commercial table`).not.toContain(`>${word}<`);
    }
    /* …while the Unit and fulfilment links that DO belong stay. */
    expect(goods).toContain(">Unit ID</th>");
    expect(goods).toContain(">Deliver To</th>");
  });

  it("keeps the card title's mono/uppercase/flame treatment off ordinary subsection headings", () => {
    /* A card TITLE (`CUSTOMER`, `MONEY`, …) is the one shouting heading per
       card: mono face, uppercase, tracked, flame-dark (`signature-700`,
       `01-design-tokens.md` §2 — an existing declared token, no new value).
       `SubHead` (`Delivery address`, `Emergency contact`) sits INSIDE that
       card and previously copied the same shouting treatment at a smaller
       size — which made a reader read the SHADE/face to tell a section from
       the card's own name. It now renders as the ordinary field-group
       heading (`text-strong`, `01-design-tokens.md` §1): the ordinary face,
       the ordinary case, one step down in size from the card title. */
    const title = "font-mono text-strong uppercase tracking-[0.08em] text-signature-700";
    const sub = "text-strong text-base-900";
    expect(workspace, "the card title").toContain(title);
    expect(workspace, "the subsection heading").toContain(sub);
    /* THE OLD SHAPE: the subsection heading copying the card title's own
       shouting treatment. */
    expect(workspace).not.toContain(
      "gap-x-2 font-mono text-label uppercase tracking-[0.08em] text-signature-700",
    );
    /* ⛔ AND NOT THE ACCENT ON A CARD TITLE. `01-design-tokens.md` §2.2 spends
       blue once per screen and the tab underline already holds it; a blue
       card title would be the second spend and the current thing would stop
       standing out. */
    expect(workspace).not.toContain("uppercase tracking-[0.08em] text-kit-blue");
    /* Nor any status hue, for the same reason. */
    for (const job of ["text-kit-green", "text-kit-amber", "text-kit-red", "text-danger"]) {
      expect(workspace, `${job} is a status colour, not a heading colour`).not.toContain(
        `uppercase tracking-[0.08em] ${job}`,
      );
    }
  });

  it("keeps a service to ONE row, carrying its own doors", () => {
    /* A service was printed TWICE: as a row in the Goods table, and again in a
       `Services` list below that repeated its name, its size, its quantity and
       its price purely so it could hold two buttons. One record, two places —
       and with a second service on the order the operator had to match them by
       eye to know which row a `Remove` belonged to.
       The doors live in the row now. The list is gone. */
    expect(workspace).toContain("ServiceRowActions");
    expect(addons).toContain("export function ServiceRowActions(");
    /* THE LIST AND ITS HEADING: gone from the panel entirely. */
    expect(addons).not.toContain('<span className="text-label text-base-500">Services</span>');
    expect(addons).not.toContain("so-addons-empty");
    /* ⛔ NOT A SEVENTH COLUMN — §0.1 locks the table at six, and the document
       preview prints from the same six. The header row is unchanged. */
    for (const label of ["Category", "Unit ID", "SKU", "Qty", "Item", "Deliver To"]) {
      expect(workspace).toContain(`>${label}</th>`);
    }
    expect(workspace).not.toContain(">Actions</th>");
    /* The one act the table cannot perform — adding a service that is not
       there yet — is what the panel keeps, and the POS-parity attribute rides
       THAT rather than a hidden span with nothing behind it. */
    expect(workspace).toContain('data-pos-field="orderAddons"');
    expect(addons).toContain('data-testid="so-addon-open"');
    expect(addons).toContain("Add a service");
    /* ⭐ AND THE TABLE ACTUALLY REFRESHES (YH, 2026-09-01 — "ensure numbers
       and generated SO are correct"). The table is now the ONLY place a new
       service appears, so the add path must invalidate the key the office
       reads. `["orders"]` never reached `["operation","orders",id]` — see
       `order-addon-invalidation.test.ts` for the prefix proof. */
    expect(queries).toContain('void qc.invalidateQueries({ queryKey: ["operation", "orders"] });');
  });

  it("puts the salesperson door beside the salesperson, not in a row of its own", () => {
    /* The page's own grammar: `Change delivery date` sits under the date it
       moves. The ownership door now sits under the name it moves, in the same
       quiet text shape, and the lane below keeps only the request panel —
       which is truth and does deserve its rule. */
    expect(workspace).toContain("inlineTrigger={false}");
    expect(workspace).toContain("openSignal={attributionSignal}");
    expect(workspace).toContain("setAttributionSignal((n) => n + 1)");
    expect(workspace).toContain("Change salesperson");
    /* GATE 3's rule is imported, never re-typed — one rule, one place. */
    expect(workspace).toContain("useCanChangeSalesOwnership");
    expect(attribution).toContain("export function useCanChangeSalesOwnership()");
    /* THE OLD SHAPE: a hairline drawn across the lane whether or not anything
       is in it, which is what gave one button a section of its own. */
    expect(attribution).not.toContain(
      '<div className="mt-3 border-t border-kit-slate-5 pt-3" data-testid="attribution-lane">',
    );
    expect(attribution).toContain(
      'className={request ? "mt-3 border-t border-kit-slate-5 pt-3" : ""}',
    );
  });
});
