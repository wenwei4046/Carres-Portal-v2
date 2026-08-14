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
  });

  it("does not render a second editable full-address authority", () => {
    expect(workspace).not.toContain('id="ws-address" label="Address"');
    expect(workspace).toContain('label="Address preview"');
  });

  it("names the governed ownership request instead of implying direct editing", () => {
    expect(attribution).toContain("Request ownership change");
    expect(attribution).not.toContain("Change who this order belongs to");
  });
});
