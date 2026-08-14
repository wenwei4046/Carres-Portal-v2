/**
 * `Sales Order Settings`, held as tests.
 *
 * The properties that matter here are OWNERSHIP properties, not rendering
 * ones. §11 gave this section three things and no more, and the expensive
 * mistake — the one `SO Maintenance` already made once — is a settings page
 * quietly growing an editor for something another module owns, or for a
 * historical Sales Order.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SalesOrderSettings from "./SalesOrderSettings";

vi.mock("./OrderEntryPage", () => ({
  default: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="order-entry-section" data-embedded={String(Boolean(embedded))} />
  ),
}));

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SalesOrderSettings />
    </QueryClientProvider>,
  );
}

describe("it owns exactly the three things §11 named", () => {
  it("renders the Order Entry editor as a section, not as its own page", () => {
    mount();
    expect(screen.getByTestId("order-entry-section")).toHaveAttribute("data-embedded", "true");
  });

  it("names the owner of every list it deliberately does not edit", () => {
    mount();
    const panel = screen.getByTestId("settings-elsewhere");
    for (const owner of ["Stores", "HR", "Operation Catalog", "Stock", "Delivery"]) {
      expect(panel).toHaveTextContent(owner);
    }
  });

  it("keeps per-user register columns and saved views on the register", () => {
    mount();
    expect(screen.getByText(/stay on the Sales Orders register/i)).toBeInTheDocument();
  });

  it("says plainly that a saved order keeps its own words", () => {
    mount();
    expect(screen.getByText(/never rewrite an order that is already saved/i)).toBeInTheDocument();
  });
});

describe("it never becomes an edit door into a Sales Order", () => {
  /* A source guard, deliberately. A rendering test cannot catch the failure
   * that matters — someone adding an order mutation to this page a year from
   * now — because the mutation would render as an innocuous button. §11's
   * ruling is "never an edit door into historical Sales Orders", so the file
   * may not reach an order writer at all. */
  it("imports no order mutation hook", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "SalesOrderSettings.tsx"),
      "utf8",
    );
    for (const forbidden of [
      "useCancelOrder",
      "useUpdateOrder",
      "useSaveSalesOrder",
      "useSubmitSalesOrderAmendment",
      "/api/orders/",
      "/api/operation/orders/",
    ]) {
      expect(src).not.toContain(forbidden);
    }
  });
});
