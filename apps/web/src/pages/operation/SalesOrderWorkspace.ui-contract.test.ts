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
});
