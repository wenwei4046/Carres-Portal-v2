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
const render = readFileSync(join(here, "../../lib/pdf/render.ts"), "utf8");

describe("Sales Order object template contract", () => {
  it("keeps one object identity and the exact four-item object navigation", () => {
    expect(header).toContain('aria-label="Sales Orders"');
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

  it("renders the real document through the SAME call Print opens", () => {
    expect(workspace).toContain('data-testid="pdf-pane"');
    /* ONE template call path: the pane paints the bytes of the blob, and Print
       opens THAT blob's URL. A second lookalike renderer is the failure this
       asserts against. */
    expect(workspace.match(/renderSalesOrderPdf\(/g)).toHaveLength(1);
    expect(workspace).toContain("const blob = await renderSalesOrderPdf(data)");
    expect(workspace).toContain("URL.createObjectURL(blob)");
    expect(workspace).toContain("window.open(pdfUrl,");
    expect(render).toContain("return toBlob(SalesOrderTemplate(data))");
    /* The paper is centred at a fixed maximum width. */
    expect(workspace).toContain('className="relative mx-auto max-w-[700px]"');
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
    expect(workspace).toContain("Used only if we cannot reach the customer on delivery day");
  });

  it("keeps the document address and the editable parts as one fact", () => {
    /* Before this card the structured parts were editable while the printed
       `customer_address` stayed on whatever was imported. */
    expect(workspace).toContain("const addressString = (d: Draft, was: Draft)");
    expect(workspace).toContain("customer_address: addressString(draft, baseline)");
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

  it("names the governed ownership request and hides it from Operation", () => {
    expect(workspace).toContain('title="Sales ownership"');
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

  it("carries Copy, Report a problem and Cancel in More actions, and no Problems card", () => {
    expect(workspace).toContain("Copy to new Sales Order");
    /* The SAME route the register's context menu opens (Law C). */
    expect(workspace).toContain("/operation/orders/so/new?copyFrom=");
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

  it("expands a missing-date Current Action into the governed seven answers", () => {
    expect(workspace).toContain("missingDeliveryDateGuidance");
    for (const label of ["Why", "Who must act", "Who to contact", "What to ask", "What to use", "What to record", "What happens next"]) {
      expect(workspace).toContain(label);
    }
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
