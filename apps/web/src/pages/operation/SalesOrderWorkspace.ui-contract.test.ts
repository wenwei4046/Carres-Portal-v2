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
  });

  it("does not render a second editable full-address authority", () => {
    expect(workspace).not.toContain('id="ws-address" label="Address"');
    expect(workspace).toContain('label="Address preview"');
  });

  it("names the governed ownership request instead of implying direct editing", () => {
    expect(workspace).toContain('<Section title="Sales ownership">');
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

  it("uses document-detail goods rather than copying the Register expansion columns", () => {
    expect(workspace).toContain('data-testid="document-goods"');
    expect(workspace).not.toContain('Category | Unit ID | SKU | Qty | Item | Deliver To');
  });
});
