import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { POS_FORM_BUILTINS } from "@carres/shared";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = readFileSync(join(here, "SalesOrderWorkspace.tsx"), "utf8");
/* `Block` — the one card — lives in the kit since 2026-09-28 (Workspace §5.10
   admission); its classes are read from there, the page still asks for its tone. */
const block = readFileSync(join(here, "../../components/kit/Block.tsx"), "utf8");
/* The Route's input is built by the ONE shared builder (Work reads it too). */
const routeInput = readFileSync(join(here, "sales-order-route-input.ts"), "utf8");
const header = readFileSync(join(here, "SalesOrderTabs.tsx"), "utf8");
const attribution = readFileSync(join(here, "SalesOrderAttribution.tsx"), "utf8");
const panels = readFileSync(join(here, "SalesOrderChangePanels.tsx"), "utf8");
const changeHelpers = readFileSync(join(here, "sales-order-change.ts"), "utf8");
/* ONE agreement block, rendered by both the amendment panel and the whole-page
   waiting request — so the words are asserted where they actually live. */
const agreement = readFileSync(join(here, "customer-agreement.tsx"), "utf8");
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
/* ⭐ THE STYLESHEETS ARE PART OF THE RULING, NOT DECORATION. The card title
   already carried `text-kit-blue-11` while the page still drew a dark uppercase
   word on a grey-blue band, because two page-scoped stylesheets repainted it
   with raw hex. A contract that reads only the component would have called the
   2026-09-21 / 2026-09-22 ruling built while the screen disagreed. */
const detailCss = readFileSync(
  join(here, "purchase-orders/purchase-order-detail.css"),
  "utf8",
);
const themeCss = readFileSync(join(here, "sales-order-detail-theme.css"), "utf8");
/* The document the left pane must tally with. */
const pdfTemplate = readFileSync(join(here, "../../lib/pdf/sales-order-template.tsx"), "utf8");
/* The owner-confirmed detail (handoff 2026-10-08) lives in `so-detail/`. */
const soHeader = readFileSync(join(here, "so-detail/SoHeader.tsx"), "utf8");
const soUi = readFileSync(join(here, "so-detail/ui.tsx"), "utf8");
const soRoute = readFileSync(join(here, "so-detail/SoOrderRoute.tsx"), "utf8");
const soTimeline = readFileSync(join(here, "so-detail/SoTimeline.tsx"), "utf8");
const soAmend = readFileSync(join(here, "so-detail/AmendmentPanels.tsx"), "utf8");

describe("Sales Order object template contract", () => {
  /* ── ONE PAGE, ONE STATE — owner ruling 2026-08-15 ─────────────────────── */

  /* ⭐ THE CARD TITLE IS BLACK BOLD — ONE KIT LAW, owner ruling 2026-09-27
     (Jess). It overwrites the 2026-09-21 / 2026-09-22 "remain blue" ruling:
     every page follows the one kit, and the kit's title is `text-strong`
     15/600 slate-12, never blue. The 1px rule under it stays. */
  /* ── THE PREVIEW IS THE DOCUMENT ───────────────────────────────────────── */

  it("renders the real document through the SAME renderer Print uses", () => {
    expect(workspace).toContain('data-testid="pdf-pane"');
    /* ONE RENDERER, THREE PURPOSES. The pane paints the bytes of the PREVIEW
       blob; Print opens a blob built from the SAVED data; and 0565 keeps the
       sheet a new version was ISSUED as. All three go through
       `renderSalesOrderPdf` — a second lookalike renderer is the failure this
       asserts against, and a page-local template call would show up here as a
       different name rather than another call of this one. */
    expect(workspace.match(/renderSalesOrderPdf\(/g)).toHaveLength(4);
    expect(workspace).toContain("const blob = await renderSalesOrderPdf(data)");
    /* Print and Download both build from the SAVED data. */
    expect(workspace.match(/const blob = await renderSalesOrderPdf\(printData\)/g)).toHaveLength(2);
    expect(workspace).toContain("const blob = await renderSalesOrderPdf(issued)");
    expect(render).toContain("return toBlob(SalesOrderTemplate(data))");
  });

  /* ⭐ PRINT IS THE SAVED TRUTH — owner ruling 2026-08-15. Preview-equals-Print
     is asserted in the SAVED state only, so the printable blob may never be
     built from the draft, and a dirty print must SAY which version it gave. */
  it("prints the saved version while the form is dirty, and says so", () => {
    expect(workspace).toContain(
      "mode === \"oldrev\" && viewedRevision ? templateData : base",
    );
    expect(workspace).toContain(
      'toast.message("You have unsaved changes. Printing the saved version")',
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

  /* AN OLD REVISION IS A PHOTOGRAPH. The same fields render, filled from THAT
     snapshot and locked — never today's values wearing a read-only pill. */
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
  /* ⭐ THE AMEND TRIO IS A MODAL, OPENED FROM THE DATE IT MOVES — YH,
     2026-08-27. It has now been a card, then a merged subsection, and neither
     earned standing space: three fields open on every order for an act that
     happens rarely.

     Two things this pins beyond the move. The governed note travelled to the
     modal's DESCRIPTION rather than being dropped — it is read on opening now,
     not as a footnote beside the button that commits it. And a LIVE proposal
     is NOT behind the modal: a pending amendment is truth, so it prints beside
     the date it is waiting to move, where somebody reading that date sees it. */
  /* ⭐ THE STANDING FACT SITS BESIDE THE CARD'S NAME (Jess, 2026-08-26) —
     "add stuff to header part like the new/existing customer thingy". It stays
     a FACT, never a control: the phone probe derives it and MASTER.md:1038
     rules it read-only on both surfaces. It rides the header bar as a compact
     pill (Jess, 2026-09-10 density pass) rather than matching the card
     title's own shouting face — a badge reads as a fact, not a second title. */
  /* ⭐ ONE FACT, ONE CONTROL SHAPE, BOTH SURFACES — owner ruling 2026-08-26
     (Jess): "ensure both sides of filling in are the same". The POS offers two
     named answers to the lift question; this page offered an unlabelled
     tickbox, where unticked meant BOTH "no lift" and "nobody said". The two
     words now live in ONE place and both surfaces import them. */
  /* ⭐ THE STAIR CARRY IS ADDED UP OUT LOUD (Jess, 2026-08-26) — the office
     keyed floor, quantity and lift and was told nothing back while the POS
     printed the whole working-out. ⛔ The arithmetic is IMPORTED: one derived
     fact has ONE arithmetic (ownership Law D), so a second copy of the formula
     on this page is the failure being asserted against. */
  it("shows the stair-carry working-out, without a second copy of the sum", () => {
    expect(workspace).toContain('data-testid="so-stair-working"');
    expect(workspace).toContain("floorSurchargeRaw(");
    expect(workspace).toContain('from "@/lib/order-totals"');
    /* The rate and the free floors are READ from config, never retyped: the
       whole config goes to the one imported arithmetic. */
    expect(workspace).toContain("floorSurchargeRaw(draft.delivery_floor, draft.delivery_has_lift, items, cfg)");
    expect(workspace).not.toMatch(/freeUpToFloor\s*[:=]\s*\d/);
    expect(workspace).not.toMatch(/perFloorPerItem\s*[:=]\s*\d/);
  });

  /* ⭐ A SAVED ORDER READS ITS OWN CHARGE, NEVER TODAY'S RATE (YH, 2026-09-01).
     The working-out priced from the live `floor_config` singleton in EVERY
     mode, so a principal moving the rate made one page print two numbers: the
     sentence narrated the new rate while MONEY, the PDF and every payment cap
     kept the fee that was actually stamped. An old revision was worse — it
     mixed the snapshot's floor with the CURRENT order's line count.

     ⛔ The live rate never reaches this sentence: the one state with no
     stamped row to read was the office create door, retired 2026-09-27. */
  /* ⭐ PROCEED DATE IS READ-ONLY ON AN EXISTING ORDER (Jess, 2026-08-26),
     REFINED 2026-08-28 (YH): a date that was never RECORDED is not a date that
     is LOCKED. The lock is on the ANSWER, never on the emptiness.

     The two assertions below are the same INTENT this test has always pinned —
     a recorded proceed date is a Fact, and the field still has a control — and
     they are unchanged. What is replaced is the third: `mode === "create" ?`
     was a SPELLING of "only create offers the picker", and that sentence is no
     longer the rule. The invariant that survives is stated directly instead. */
  /* ⭐ NEVER TWICE ON A SAVED ORDER (YH, 2026-08-28). 0393 stamps the
     STAIR_CARRY addon at birth, so a saved order's money reads it from the
     persisted addons; adding the memo's fee again would charge the carry twice
     on every upstairs order. (The create quote that added it before the row
     existed left with the office create door, 2026-09-27.) */
  it("never adds the stair fee twice to a saved order's money", () => {
    const money = workspace.slice(
      workspace.indexOf("const money = useMemo"),
      workspace.indexOf("const cancelledLines"),
    );
    expect(money).toContain("const lines = detailQ.data?.lines");
    expect(money).not.toContain("stair?.fee");
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
      "so-proceed", // shown as a control only while never recorded (0391 · COPY)
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
    /* 0562 — the payload builder takes the draft it composes, so the SAME
       pipeline runs on both sides of the comparison. */
    expect(workspace).toContain("customer_address: autoCapitalize(addressString(d, baseline)");
    expect(workspace).toContain("address: addressString(draft, baseline)");
    expect(workspace).not.toContain('id="so-address" label="Address"');
    /* A CLEAR HAPPENS ONLY WHEN SOMEBODY CLEARS IT — an order that arrived
       already ticked keeps its imported string, so a phone fix cannot wipe an
       address (or a billing address) nobody looked at. */
    expect(workspace).toContain("was.customer_address_unknown ? was.customer_address");
    expect(workspace).toContain("was.customer_billing_same ? was.customer_billing");
    expect(workspace).toContain("customer_billing: billingString(d, baseline)");
  });

  /* ── THE WRITE BOUNDARY ────────────────────────────────────────────────── */

  it("carries the governed request fields inside the one draft review", () => {
    /* The three fields the retired trio owned now ride the whole-page review:
       the customer's request date, the reason, and — for a commercial change —
       the customer agreement the database gates approval on. */
    expect(panels).toContain("Requested date (from customer)");
    expect(panels).toContain('label="Reason for change"');
    expect(panels).toContain("required");
    expect(panels).toContain("Customer agreement");
    expect(workspace).toContain("useSubmitSalesOrderChanges");
    expect(workspace).toContain("customerAskedOn: changeAskedOn");
  });

  it("keeps ONE door for goods, price, services and the promise — the whole-page draft", () => {
    /* ⛔ NO COMPETING PROPOSAL MODAL (owner 2026-09-22): "Do not retain a
       competing proposal modal as the only way to edit those fields." The page
       holds one draft and one commit; the classification is the server's. */
    expect(workspace).not.toContain("<SalesOrderAmendment");
    expect(workspace).not.toContain('data-testid="workspace-propose-change"');
    expect(workspace).not.toContain("Propose a change to the customer");
    expect(workspace).toContain('data-testid="edit-items"');
    expect(workspace).toContain('data-testid="add-item"');
    expect(workspace).toContain('label="Add service"');
    expect(workspace).toContain("Restore");
  });

  it("gates approval on customer agreement evidence, and never on the page alone", () => {
    /* § Customer agreement evidence — APPROVED / LOCKED 2026-09-22: the request
       may be recorded without it; it cannot TAKE EFFECT without it, and the
       database is the gate (0564 `customer_agreement_required`). The page states the
       same rule and disables the decision it cannot make. */
    expect(panels).toContain("Customer agreement");
    expect(agreement).toContain("Nothing on record shows the customer agreed");
    expect(agreement).toContain("How did the customer agree?");
    /* No tick box, ever: every kind names a pointer outside the record. */
    expect(agreement).not.toMatch(/type=["']checkbox["']/);
    expect(panels).toContain("customer_agreement_covers_proposal");
    expect(panels).toContain("disabled={!decision.trim() || !recorded || !covered || props.busy}");
    expect(workspace).toContain("useRecordAmendmentAgreement");
  });

  it("prints a version as it was issued — its own money, and never a borrowed signature", () => {
    /* § Old versions and signatures. WHICH revision a stored signature covers is
       not recorded anywhere, so the page asks for the version's own day and the
       builder attributes nothing. The behaviour itself is proved by calling the
       builder in `SalesOrderWorkspace.historical-document.test.ts`. */
    expect(workspace).toContain("asOf?: { date: string }");
    expect(workspace).toContain("{ date: viewedRevision.created_at.slice(0, 10) }");
    expect(workspace).not.toContain("signedRevision");
    expect(workspace).toContain("(base?.payments ?? []).filter((pm) => pm.date && String(pm.date).slice(0, 10) <= asOf.date)");
  });

  it("shows the file a version was ISSUED as, and reconstructs only when there is none", () => {
    /* § Retained documents, owner ruling 2026-09-23: "Legacy PDFs that were
       never stored: use the approved reconstructed-copy notice. Newly issued
       versions after this release: preserve their original issued PDFs as
       required. A warning does not replace this capability."

       So the notice is NOT the capability. A version issued since 0565 keeps
       its own PDF and the page shows THAT FILE — not a re-render of it — while
       only a version that never had one is rebuilt and carries the notice. */
    expect(workspace).toContain("useIssuedSalesOrderDocument");
    expect(workspace).toContain("storeIssuedSalesOrderDocument");
    expect(workspace).toContain('data-testid="issued-document-pane"');
    expect(workspace).toContain('data-testid="oldrev-issued-document"');
    /* The rebuild is skipped entirely when a file exists — a stored document is
       shown as itself, never redrawn from the snapshot beside it. */
    expect(workspace).toContain('if (mode === "oldrev" && storedDocumentUrl) return null;');
    /* Both minting doors keep the sheet: a correction and an approved change. */
    expect(workspace).toContain('if (r.action === "saved") void keepIssuedDocument(r.revision);');
    expect(workspace).toContain('if (r.status === "applied") void keepIssuedDocument(Number(r.revision));');
    /* ⭐ AND PRINTING IS THE OTHER HALF OF "READ" — the gap this was missing.
       The pane showing the stored file proved nothing about the button the
       office actually presses: `Print this version` could still have rebuilt
       the sheet from the snapshot and handed the customer a document that was
       never issued. The stored URL is opened BEFORE any render path is
       reached, and the rebuild below it is unreachable for a kept version. */
    const print = workspace.slice(workspace.indexOf("const openPrint = async () => {"));
    const body = print.slice(0, print.indexOf("\n  };"));
    expect(body, "the stored file is opened").toContain('window.open(storedDocumentUrl, "_blank");');
    expect(
      body.indexOf("storedDocumentUrl"),
      "and it is reached before anything is rendered",
    ).toBeLessThan(body.indexOf("renderSalesOrderPdf"));
    expect(body.slice(0, body.indexOf("renderSalesOrderPdf")), "the stored branch returns").toContain("return;");
  });

  it("names the governed ownership request and hides it from Operation", () => {
    /* The word is locked (COPY-STANDARD:1427) and has now been a card, a
       merged subsection, and a card again. It is the SAME STRING through all
       three — `Block` uppercases every title, so becoming a card title moved
       the border and never the name. */
    expect(workspace).not.toContain("<SubHead>Sales ownership</SubHead>");
    /* ⛔ THE PERMISSION LANE IS UNTOUCHED BY THE MOVE. The component and its
       gates are the same file; only the heading above it changed rank. */
    expect(attribution).toContain("Change salesperson — needs approval");
    expect(attribution).toContain('role === "principal" || role === "hr"');
    expect(attribution).toContain("Request ownership change");
    expect(attribution).not.toContain("Change who this order belongs to");
  });

  /* ── ACTIONS ───────────────────────────────────────────────────────────── */

  /* Copy is RETIRED (Jess, 2026-08-28) — it dropped line configuration and
     handed Purchasing an un-autofillable PO. The assertion is inverted rather
     than dropped, so a quiet re-introduction fails here. */
  /* THE PIN MOVED, NOT THE FACT (YH, 2026-08-28). This used to assert the
     2026-08-15 weighting — Total large · Paid medium · Outstanding loudest.
     That weighting never reached the amounts: `<Money>` renders each at its
     `row` tone, so the three digits were always the same size and only the
     containers differed, which is exactly why the three numbers did not line
     up. The surviving invariant is what the block is FOR — three named money
     facts, one size, and red while any is owed. */
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
    for (const source of [workspace, header, attribution, panels, changeHelpers]) {
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
  it("prints a service by its name and never by its database key", () => {
    /* The Goods table printed `a.addon_key` in the Item column — the raw key,
       where every goods row prints a product name — while `SalesOrderAddons`
       eighty pixels below printed the catalog name for the same row from the
       same bundle. One record, two names, and the key was the one on top.
       ONE map, read by both, so they cannot disagree again (Law D). */
    expect(workspace).toContain("const addonNameByKey = useMemo(");
    /* The service name is printed by the ONE table that now stands in both
       modes; `nameOfAddon` is the same lookup under a name. */
    expect(workspace).toContain("nameOfAddon");
    /* The service row now wears the goods row's own cells: the CJK face on the
       item, and the second line where a goods row already puts its config. */
    /* The CJK class rode the retired view table; the one commercial table
       prints the service name through `nameOfAddon`. */
    expect(workspace).toContain("nameOfAddon");
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

  it("says how many Units are ready instead of the word the dictionary refuses", () => {
    /* COPY-STANDARD:1755 puts `Not allocated` in its `Do NOT use` column. The
       registered answer is the count and then what is being waited on, and it
       is written ONCE in shared so the Goods table, the Order Route STOCK node
       and the register expansion cannot drift into three spellings. */
    /* ⭐ THE UNIT READINESS WORDS LEFT THIS PAGE WITH THE UNIT FACTS (ruling
       2026-09-21): `Order Route` owns them and still says them. */
    expect(workspace).not.toContain("unitsShortWords");
    /* The rendered STRING is gone; the governance comment recording WHY it
       went stays, which is why this pins the quoted literal. */
    expect(workspace).not.toContain('"Not allocated"');
    expect(route).toContain("`Warehouse has ${readyQty} of ${line.committedQty} Units ready`");
    expect(route).not.toContain("Waiting for purchase");
    /* A LOAD IS NOT A SHORTAGE — the Deliver To cell has always guarded this;
       the Unit ID cell printed a shortage while the read was still in flight. */
    /* The Unit-truth loading state left the page with the Unit facts (ruling
       2026-09-21); `Order Route` owns them. */
    expect(workspace).not.toContain("goodsTruthQ.isLoading && !truth");
  });

  it("lets no stylesheet put the grey band back over the blue card title", () => {
    /* OWNER RULING (Jess, 2026-09-21), re-affirmed 2026-09-22 — "remain blue".
       MEASURED, not assumed: in the shell walk the `<h2>` computed to
       `#26384a`, uppercase, on a `#b9c9d8` band, because
       `purchase-order-detail.css` listed `.so-detail-style` in the band rule
       and `sales-order-detail-theme.css` repainted the heading again. The
       component was already right. This asserts the thing that actually
       decided the pixels. */
    for (const css of [detailCss, themeCss]) {
      const bands = [...css.matchAll(/([^\n{}]*\[data-block\] > div:first-child)\s*\{([^}]*)\}/g)];
      for (const [, selector, body] of bands) {
        if (!selector.includes(".so-detail-style")) continue;
        expect(body, `${selector.trim()} may not repaint the card header`).not.toMatch(/background-color/);
        expect(body, `${selector.trim()} may not recolour the card header`).not.toMatch(/^\s*color:/m);
      }
      const heads = [...css.matchAll(/([^\n{}]*\[data-block\] > div:first-child > h2)\s*\{([^}]*)\}/g)];
      for (const [, selector, body] of heads) {
        if (!selector.includes(".so-detail-style")) continue;
        expect(body, `${selector.trim()} may not recolour the blue title`).not.toMatch(/color:/);
        expect(body, `${selector.trim()} may not re-case the sentence-case title`).not.toMatch(/text-transform/);
      }
    }
    /* ⭐ AND SINCE 2026-09-26 PURCHASING MOVED TOO — owner instruction "follow
       sales order ui kit … every page of purchasing": no stylesheet may paint
       ANY page's card header. The band rules for `.po-detail-style` and
       `.mp-create-style` are gone, not merely narrowed. */
    for (const css of [detailCss, themeCss]) {
      const bands = [...css.matchAll(/([^\n{}]*\[data-block\] > div:first-child)\s*\{([^}]*)\}/g)];
      for (const [, selector, body] of bands) {
        expect(body, `${selector.trim()} may not paint a card header`).not.toMatch(/background(-color)?:/);
      }
    }
    expect(detailCss).not.toContain("#b9c9d8");
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

  it("groups the customer's own reference under Order info, not in page chrome", () => {
    /* `orders.source_ref` is a text[] — one customer legitimately carries
       several spellings — and it is read-only: the importer is its only
       writer. It was a grey meta line floating above the cards. */
    /* ⭐ `Customer reference` is REMOVED from the page — owner ruling
       2026-09-21. The importer remains its only writer and the fact is still
       read where it is owned; the page stops printing it. */
    expect(workspace).not.toContain('<Fact label="Customer reference"');
    /* THE OLD SHAPE: the same fact as chrome. */
    expect(workspace).not.toContain('<div className="px-1 text-meta text-base-500">');
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
    const goodsFrom = workspace.indexOf('data-testid="edit-goods"');
    const goods = workspace.slice(goodsFrom, workspace.indexOf("TOTAL PAYABLE", goodsFrom));
    for (const word of ["Margin", "margin", "Cost", "cost", "Revenue"]) {
      expect(goods, `no ${word} in the commercial table`).not.toContain(`>${word}<`);
    }
    /* ⛔ AND THE CROSS-MODULE COLUMNS LEFT WITH THEIR OWNERS (ruling
       2026-09-21): Unit ID is Stock's and `Deliver To` is Purchasing's, both
       read on `Order Route`. The commercial table is the document's. */
    expect(workspace).not.toContain(">Unit ID</th>");
    expect(workspace).not.toContain(">Deliver To</th>");
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
    /* No top margin — the SO section body spaces its groups — and no
       always-present empty button row, so an empty lane is truly `:empty` and
       takes no gap (kit-sizes card, 2026-09-23). */
    expect(attribution).toContain(
      'className={request ? "border-t border-kit-slate-5 pt-3" : ""}',
    );
    expect(attribution).toContain(") : canRequest && inlineTrigger ? (");
  });
});

/* ⭐ SO PAGE KIT SIZES — 2026-09-23. The token VALUES are the kit's
   (`01-design-tokens.md` §1/§3); these pin how the page USES them. The rendered
   numbers were measured in the real shell (so-workspace-shell-preview) before
   and after; these source contracts keep the causes from coming back. */
describe("Sales Order page — kit sizes, one gap, one table grammar", () => {
  const ledger = readFileSync(join(here, "components/SalesOrderPaymentLedger.tsx"), "utf8");
  const serviceCode = readFileSync(join(here, "../../lib/service-code.ts"), "utf8");

  it("spaces every SO section's groups with ONE 12px body gap — the Block's one body", () => {
    expect(block).toContain('className="mt-3 flex flex-col gap-3 [&>*:empty]:hidden"');
    /* The per-group margins it replaced may not return. */
    expect(workspace).not.toContain('<div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">');
    expect(workspace).not.toContain('<div className="mt-4 border-t border-kit-slate-5 pt-3">');
    expect(workspace).not.toContain("mb-2 mt-4 flex flex-wrap items-baseline");
  });

  it("keeps the kit's 32px controls — the page no longer resizes them", () => {
    expect(themeCss).not.toMatch(/height:\s*1\.75rem/);
  });

  it("prints Item Code and Approval code in the UI font at 13px, never monospace", () => {
    expect(workspace).not.toContain("font-mono text-meta ${strike}");
    expect(ledger).not.toContain("font-mono");
  });

  it("prints a service's Item Code from its governed identity — catalogue Service SKU when linked, saved key otherwise", () => {
    /* One rule, one function, both surfaces (verified 2026-09-24: 0172 links
       `addons.key` → `addons.service_sku`; no other display mapping exists). */
    expect(serviceCode).toContain("catalogServiceSku && catalogServiceSku.trim() ? catalogServiceSku.trim() : savedKey");
    /* Nothing is upper-cased or rewritten. */
    expect(serviceCode).not.toContain("toUpperCase");
    expect(workspace).toContain("{serviceCodeWord(a.addon_key, addonSkuByKey.get(a.addon_key))}");
    expect(workspace).toContain("(key) => serviceCodeWord(key, addonSkuByKey.get(key))");
    /* The paper prints what the payload sends; the API applies the same rule. */
    expect(pdfTemplate).toContain('(a.sku ?? "ADD-ON").split("-")');
    /* The stored key is what the draft still writes. */
    expect(workspace).toContain("addon_key: hit.key");
  });

});

/* ⭐ SCOPE A — owner rulings 2026-09-25 / 2026-09-26 (Orders MASTER §0.0). */
describe("Order Route reads its owners only when it is open", () => {
  it("fires the route fan-in only with ?route=1, never on every opened order", () => {
    expect(workspace).toMatch(/useSalesOrderRouteFacts\(\s*orderId \?\? null,\s*showRoute,/);
    expect(workspace).not.toMatch(/useSalesOrderRouteFacts\(\s*orderId \?\? null,\s*Boolean\(orderId\),/);
  });

  it("hands the resolver the failed reads and the waiting change request", () => {
    expect(routeInput).toContain("unreadable: {");
    expect(routeInput).toContain("delivery: a.facts.failed.delivery");
    expect(routeInput).toContain("payments: a.facts.failed.payments");
    expect(workspace).toContain("amendmentFailed: amendmentQ.isError");
    expect(workspace).toContain("salesOrderRouteInputOf({");
    expect(workspace).toContain("onRetry={retryRouteRead}");
  });
});

/* ⭐ THE LOCKED STATE — OWNER RULING 2026-09-26 (Jess), `docs/orders/MASTER.md`
   § THE LOCKED STATE rules 1 to 5. View and a historical version are ONE locked
   presentation; Edit is the only state that draws controls. */
describe("the locked state (owner ruling 2026-09-26)", () => {
  it("has ONE lock, and a historical version wears it", () => {
    expect(workspace).toContain(
      'const formLocked = (mode === "object" && !editing) || mode === "oldrev";',
    );
    expect(workspace.match(/const formLocked = /g)).toHaveLength(1);
  });

});

describe("Sales Order detail — owner-confirmed handoff 2026-10-08", () => {
  const detail = [workspace.slice(workspace.indexOf("const liveBlocksCommercial =")), soHeader, soUi, soRoute, soTimeline, soAmend];

  it("has exactly three views: Sales Order · Order Route · Timeline", () => {
    expect(workspace).toContain('const OBJECT_VIEWS = ["Sales Order", "Order Route", "Timeline"] as const;');
    expect(workspace).toContain("<PillTabs");
  });

  it("has ONE charcoal main button in the header, Request amendment, and everything else in More actions", () => {
    expect(soHeader).toContain('kind="main"');
    expect(soHeader.match(/kind="main"/g)).toHaveLength(1);
    expect(soHeader).toContain("Request amendment");
    expect(soHeader).toContain("Log contact");
    expect(soHeader).toContain('aria-label="More actions"');
    expect(soHeader).toContain("<TasksPill />");
    for (const id of ["workspace-preview", "workspace-print", "workspace-download", "workspace-copy-so", "workspace-report-problem", "workspace-cancel-so", "workspace-withdraw-amendment", "workspace-open-payments", "attribution-open"]) {
      expect(workspace, `More actions lost ${id}`).toContain(`testId: "${id}"`);
    }
  });

  it("uses only Carres tokens — no kit, base or blue colour on the detail", () => {
    for (const src of detail) {
      expect(src).not.toMatch(/\b(?:bg|text|border|ring|divide|stroke|fill)-(?:kit-[a-z]+-\d+|base-\d+|primary|info|blue-\d+)\b/);
      expect(src).not.toMatch(/font-mono/);
    }
  });

  it("speaks the customer date in the governed words only", () => {
    const words = workspace + soRoute;
    expect(words).toContain("Customer original delivery date");
    expect(words).toContain("Customer new delivery date");
    expect(soRoute).toContain("Customer confirmed delivery date");
    // COPY retired `Not confirmed yet` (2026-09-16); Delivery's word is `Not scheduled`,
    // and an unread Delivery says `Could not read`, never that nothing is arranged.
    expect(soRoute).not.toContain("Not confirmed yet");
    expect(soRoute).toContain("Not scheduled");
    expect(soRoute).toContain("Could not read Delivery for this order. This does not mean nothing is arranged.");
    expect(workspace).toContain("customerLegDeliveryOf({");
    for (const src of detail) {
      expect(src).not.toMatch(/"(?:Planned|Agreed date|ETA)"/);
    }
  });

  it("reads the original date from revision 1, never the mutable order date", () => {
    expect(workspace).toContain("const rev1 = revisions.find((r) => r.revision === 1) ?? null;");
    expect(workspace).toContain('rev1.snapshot.header["delivery_date"]');
  });

  it("keeps the 0562 amendment gates: server chooses, reason required, agreement gates approval", () => {
    expect(workspace).toContain("classifySalesOrderChange(current, next");
    expect(workspace).toContain("const commitWord = salesOrderCommitWord(");
    expect(workspace).toContain('if (!changeReason.trim()) return void toast.error("Reason for change");');
    expect(workspace).toContain("disabled={changesMut.isPending || !changeReason.trim() || liveBlocksCommercial || changeCount === 0}");
    expect(soAmend).toContain("disabled={!decision.trim() || !recorded || !covered || props.busy}");
    expect(soAmend).toContain("const covered = a.customer_agreement_covers_proposal === true;");
    expect(workspace).toContain("canDecide={role === \"principal\"}");
    /* Withdraw is the server's door and needs a reason. */
    expect(workspace).toContain("useWithdrawSalesOrderAmendment(");
    expect(workspace).toContain("disabled={withdrawMut.isPending || !withdrawReason.trim() || !liveAmendment}");
  });

  it("locks a historical version and a viewed order; only the amendment draws controls", () => {
    expect(workspace).toContain('const formLocked = (mode === "object" && !editing) || mode === "oldrev";');
    expect(workspace).toContain("const amending = !formLocked;");
    expect(workspace).toContain("editing={!formLocked && Boolean(editor)}");
    expect(workspace).toContain("const locked = !amending || l.removed || protectedLine(l);");
  });

  it("keeps the PDF the SAME document, drawn only while its drawer is open, and the old-version notices", () => {
    expect(workspace).toContain("usePdfCanvases(pdfOpen ? templateData : null)");
    expect(workspace).toContain('data-testid="pending-amendment-banner"');
    expect(workspace).toContain('data-testid="unsaved-watermark"');
    expect(workspace).toContain('data-testid="oldrev-rebuilt"');
    expect(workspace).toContain('{isReconstruction && base?.signature_url && <p className="text-[12px]" data-testid="oldrev-signature-unknown">');
    expect(workspace).toContain('data-testid="issued-document-pane"');
  });

  it("states the money from the ONE arithmetic, never a re-sum", () => {
    expect(workspace).toContain('data-testid="money-total-payable"');
    expect(workspace).toContain("money.known && money.total != null ? fmtMoney(money.total)");
    expect(workspace).toContain("fmtMoney(money.paid)");
    expect(workspace).toContain("fmtMoney(Math.max(0, money.outstanding))");
  });

  it("writes Timeline records read-only, in 12-hour time, with the gear for System and `?` when not recorded", () => {
    expect(soTimeline).toContain("twelveHour(fmtDate(e.at, { timeOnly: true }))");
    expect(soTimeline).toContain('name="settings"');
    expect(soTimeline).toContain("border-dashed");
    expect(soTimeline).toContain('["All", "Contacts", "Amendments", ...modules]');
    expect(soTimeline).not.toMatch(/onDelete|onEdit/);
  });

  it("orders problem cards first on the Order Route overview", () => {
    expect(soRoute).toContain("const ordered = [...problems, ...byBranch.filter((b) => !problems.includes(b))];");
    expect(soRoute).toContain('{ key: "ov", label: "Overview" }');
    expect(soRoute).toContain('{ key: "st", label: "Steps" }');
    expect(soRoute).toContain('{ key: "dt", label: "Details" }');
  });

  it("prints no dash character on screen", () => {
    for (const src of [soHeader, soUi, soRoute, soTimeline, soAmend]) {
      const strings = src.match(/>[^<>{}]*</g) ?? [];
      for (const text of strings) expect(text, text).not.toMatch(/[\u2013\u2014]/);
    }
  });
});
