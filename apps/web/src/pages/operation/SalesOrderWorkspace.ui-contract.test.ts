import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = readFileSync(join(here, "SalesOrderWorkspace.tsx"), "utf8");
const header = readFileSync(join(here, "SalesOrderTabs.tsx"), "utf8");
const attribution = readFileSync(join(here, "SalesOrderAttribution.tsx"), "utf8");

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
    expect(workspace).toContain('setObjectView(view)');
  });

  it("uses quiet edit boundaries and unambiguous edit abandonment copy", () => {
    expect(workspace).toContain(
      "Editing operational details only. Commercial changes require an amendment.",
    );
    expect(workspace).toContain("Discard");
    expect(workspace).not.toContain("Safe correction — customer and delivery facts only");
    expect(workspace).toContain('addEventListener("beforeunload"');
    expect(workspace).toContain("Discard unsaved changes?");
    expect(workspace).toContain("text-meta text-base-600 xl:col-span-2");
    expect(workspace).toContain('"Edit operational details"');
    expect(workspace).toContain('"Order context"');
    expect(workspace).toContain("if (!confirmDiscard()) return");
    expect(workspace).toContain('next.delete("edit")');
  });

  it("does not render a second editable full-address authority", () => {
    expect(workspace).not.toContain('id="ws-address" label="Address"');
    expect(workspace).toContain('label="Address preview"');
  });

  it("names the governed ownership request instead of implying direct editing", () => {
    expect(workspace).toContain('"Sales ownership"');
    expect(workspace).not.toContain('<Section title="Source">');
    expect(attribution).toContain("Request ownership change");
    expect(attribution).not.toContain("Change who this order belongs to");
  });

  it("keeps Customer Delivery read-only, Proceed date on its existing writer, and PDF behind Print", () => {
    expect(workspace).toContain('<Fact label="Customer Delivery"');
    expect(workspace.match(/id="ws-promised"/g)).toHaveLength(1);
    expect(workspace).toContain('id="ws-proceed"');
    expect(workspace).not.toContain('data-testid="pdf-pane"');
    expect(workspace).not.toContain('Section title="Order record"');
  });

  it("keeps the Object goods truth at least as complete as the Register expansion", () => {
    expect(workspace).toContain('data-testid="document-goods"');
    for (const label of ["Category", "Unit ID", "SKU", "Qty", "Item", "Deliver To"]) {
      expect(workspace).toContain(`>${label}</th>`);
    }
  });

  it("opens the canonical Service Case intake from one plain problem-reporting door", () => {
    expect(workspace).toContain("Report a problem");
    expect(workspace).toContain("Report a customer, product, delivery or installation problem.");
    expect(workspace).toContain("<ServiceCaseWizard");
    expect(workspace).toContain("Service Case");
    expect(workspace).not.toContain("Choose Claim");
    expect(workspace).not.toContain("Choose Return");
    expect(workspace).not.toContain("Choose Refund");
  });

  it("expands a missing-date Current Action into the governed seven answers", () => {
    expect(workspace).toContain("missingDeliveryDateGuidance");
    for (const label of ["Why", "Who must act", "Who to contact", "What to ask", "What to use", "What to record", "What happens next"]) {
      expect(workspace).toContain(label);
    }
  });

  /* ── Owner rulings 2026-08-15 (Chai) ──────────────────────────────────── */

  it("reaches the SHIPPED Copy action from More actions — one implementation, two doors", () => {
    expect(workspace).toContain("Copy to new Sales Order");
    /* The SAME route the register's context menu opens. A second copy path
       would be a second record-creating act for one business act (Law C). */
    expect(workspace).toContain("/operation/orders/so/new?copyFrom=");
  });

  it("adds one READ-ONLY door to Payments, scoped to this order, and no money form", () => {
    expect(workspace).toContain("Open this order in Payments");
    expect(workspace).toContain("tab=payments&so=");
    /* A summary is read-only forever (Law B) — the door navigates, it never
       records a payment here. */
    expect(workspace).not.toContain("Record payment");
    expect(workspace).not.toContain("Collect $");
  });

  it("calls the customer's money `Outstanding`, never `Balance`", () => {
    expect(workspace).toContain('label="Outstanding"');
    expect(workspace).not.toContain('label="Balance"');
  });

  it("keeps the SO number visible when the header runs out of room", () => {
    /* The identity does not shrink; the CUSTOMER is the part allowed to
       truncate away. One truncating span for both is how the header collapsed
       to a bare icon below medium desktop. */
    expect(header).toContain('data-testid="object-identity"');
    expect(header).toContain('className="shrink-0" data-testid="object-identity"');
    expect(header).toContain('data-testid="object-identity-customer"');
  });

  it("puts no Chinese on an operator screen", () => {
    for (const source of [workspace, header, attribution]) {
      expect(source).not.toMatch(/[\u4e00-\u9fff]/);
    }
  });
});
