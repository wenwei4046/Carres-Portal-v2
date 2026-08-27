import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { POS_FORM_BUILTINS } from "@carres/shared";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = readFileSync(join(here, "SalesOrderWorkspace.tsx"), "utf8");
const header = readFileSync(join(here, "SalesOrderTabs.tsx"), "utf8");
const attribution = readFileSync(join(here, "SalesOrderAttribution.tsx"), "utf8");
const amendDate = readFileSync(join(here, "SalesOrderAmendDeliveryDate.tsx"), "utf8");
const amendment = readFileSync(join(here, "SalesOrderAmendment.tsx"), "utf8");
const render = readFileSync(join(here, "../../lib/pdf/render.ts"), "utf8");
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
    expect(workspace).toContain("lg:w-1/2 lg:border-l lg:border-t-0 lg:overflow-auto");
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
     back: the customer's promised date was printed TWICE (`Customer Delivery`
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
     name as a subsection heading; what it loses is a border, a 24px gap and a
     second heading rule. */
  it("merges the address into Customer and ownership into Order info, keeping both names", () => {
    expect(workspace).toContain("<SubHead>Delivery address</SubHead>");
    expect(workspace).toContain("<SubHead>Sales ownership</SubHead>");
    expect(workspace).not.toContain('<Block title="Delivery address">');
    /* Every field of both merged sections still renders. */
    expect(workspace).toContain('data-pos-field="address"');
    expect(workspace).toContain('data-pos-field="billing"');
    expect(workspace).toContain("<SalesOrderAttribution");
  });

  /* ⭐ THE THIRD MERGE PASS — YH, 2026-08-27. Seven cards became FOUR (plus
     the conditional work card), and the order changed: MONEY rose above
     ORDER INFO, directly under CUSTOMER.

     `Emergency contact` and `Amend delivery date` were the last two collapsible
     cards. Merged, they lose the fold with the border — which also retires the
     `forceOpen` machinery that existed ONLY because they could be collapsed: a
     section that is always on screen cannot hide an unsaved change or a live
     amendment, which is what those two guards were for.

     Neither loses its NAME or its governed copy: `creates a Revision · needs
     approval` moved onto the subsection heading rather than being reworded. */
  it("keeps four cards, in the ruled order, with the two folds merged in", () => {
    const cards = [...workspace.matchAll(/<Block$\s+title="([^"]+)"|<Block title="([^"]+)"/gm)]
      .map((m) => m[1] ?? m[2]);
    expect(cards).toEqual([
      "Customer",
      "Money",
      "Order info",
      "Goods",
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
  it("opens the amend trio from beside Customer Delivery, and never hides a live one", () => {
    expect(workspace).toContain('data-testid="amend-date-open"');
    expect(workspace).toContain("setAmendDateOpen(true)");
    expect(workspace).toContain('title="Amend delivery date"');
    expect(workspace).toContain('description="creates a Revision · needs approval"');
    expect(workspace).toContain("<SalesOrderAmendDeliveryDate");
    /* The modal closes itself once the proposal is recorded. */
    expect(workspace).toContain("onDone={() => setAmendDateOpen(false)}");
    expect(amendDate).toContain("onDone?.()");
    /* A pending proposal is stated in the CARD, not behind the door. */
    expect(workspace).toContain('data-testid="amend-date-waiting"');
    /* And no standing section survives on the card. */
    expect(workspace).not.toContain("<SubHead>Amend delivery date</SubHead>");
  });

  /* ⭐ THE STANDING FACT SITS BESIDE THE CARD'S NAME (Jess, 2026-08-26) —
     "add stuff to header part like the new/existing customer thingy". It stays
     a FACT, never a control: the phone probe derives it and MASTER.md:1038
     rules it read-only on both surfaces. */
  it("answers new-or-existing in the Customer heading, and still never lets it be typed", () => {
    expect(workspace).toContain('data-testid="customer-type-chip"');
    expect(workspace).toContain("headerSlot=");
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

  /* ⭐ PROCEED DATE IS READ-ONLY ON AN EXISTING ORDER (Jess, 2026-08-26).
     This OVERWRITES `docs/orders/MASTER.md`:725-728, which gave Operations a
     direct writer. CREATE keeps the picker — `createOrderInput` refuses an
     order without a proceed date, so the office could not key one otherwise. */
  it("records the proceed date on an existing order instead of offering it", () => {
    const field = workspace.slice(
      workspace.indexOf('data-pos-field="proceedDate"'),
      workspace.indexOf('data-pos-field="stairCarry"'),
    );
    expect(field).toContain('mode === "create" ?');
    expect(field).toContain('<Fact label="Proceed date"');
    expect(field).toContain('<DatePicker id="so-proceed"');
    /* The builtin still has a control on the page — the completeness test below
       walks the POS registry and would not accept the field simply vanishing. */
    expect(workspace).toContain('id="so-proceed"');
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

  it("keeps goods, price and Customer Delivery out of the direct writer", () => {
    expect(workspace).toContain('<Fact label="Customer Delivery"');
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
    expect(amendDate).toContain("Amend date (from customer)");
    expect(amendDate).toContain("Amended delivery date");
    expect(amendDate).toContain('label="Amend reason"');
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
     instalment months anywhere on the Sales Order — `Amend delivery date`
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
    /* The section merged into `Order info` on 2026-08-26 and kept its locked
       word as the subsection heading — the merge moved the border, not the
       name (COPY-STANDARD:1427 still governs the door below it). */
    expect(workspace).toContain("<SubHead>Sales ownership</SubHead>");
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

  it("adds one READ-ONLY door to Payments, scoped to this order, and no money form", () => {
    expect(workspace).toContain("Open this order in Payments");
    expect(workspace).toContain("tab=payments&so=");
    expect(workspace).not.toContain("Record payment");
    expect(workspace).not.toContain("Collect $");
  });

  it("weights the money block Total · Paid · Outstanding, red while owed", () => {
    expect(workspace).toContain('data-testid="money-total"');
    expect(workspace).toContain('data-testid="money-paid"');
    expect(workspace).toContain('data-testid="money-outstanding"');
    /* Total large · Paid medium · Outstanding loudest (§6.4 ⑤ + owner ruling
       2026-08-15: red while any of it is still owed). */
    expect(workspace).toContain('className="text-title text-base-900" data-testid="money-total"');
    expect(workspace).toContain('className="text-strong text-base-700" data-testid="money-paid"');
    expect(workspace).toContain('money.known && money.outstanding > 0 ? "text-danger"');
    expect(workspace).not.toContain('label="Balance"');
  });

  it("carries NO guidance banner — the amber field note and the owned Work action say it once (owner 2026-08-18)", () => {
    // The seven-answer banner lectured instead of working and said one thing
    // in three places; it is DELETED, named here so it cannot quietly return.
    expect(workspace).not.toContain("missingDeliveryDateGuidance");
    for (const label of ["Who must act", "Who to contact", "What to use", "What happens next"]) {
      expect(workspace).not.toContain(label);
    }
    // What survives: the amber field-level note on Customer Delivery.
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
    expect(ledger).toContain("Actor was not recorded");
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
