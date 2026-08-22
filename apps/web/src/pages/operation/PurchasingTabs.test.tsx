import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// The header's global icon cluster fetches orders + tasks; this file is about
// the WORD, so the cluster is stubbed rather than given a network.
vi.mock("./components/GlobalTopBar", () => ({
  TopBarIcons: () => null,
}));

import PurchasingTabs from "./PurchasingTabs";

/**
 * THE DESTINATION HEADER SAYS THE RAIL'S WORD
 * (CARD-2026-08-22-purchasing-01-final-sidebar-listing).
 *
 * A page word is decided in the sidebar and never invented here. The final
 * rail calls the internal buying record `Manual Purchase`, so the header must
 * too — an operator told to open "Manual Purchase" may not arrive at a page
 * that calls itself "Manual Purchase Requests".
 *
 * The hidden legacy pages (`Purchase Demands`, `Report`) keep their own words:
 * this Card retired their RAIL rows, not their page bodies.
 */
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PurchasingTabs />
    </MemoryRouter>,
  );
}

describe("PurchasingTabs — the destination word", () => {
  it("`Manual Purchase` — the final rail word, not the request one", () => {
    renderAt("/operation?tab=manual-purchase");
    expect(screen.getByTestId("purchasing-tabs")).toHaveTextContent("Manual Purchase");
    expect(screen.getByTestId("purchasing-tabs")).not.toHaveTextContent(
      "Manual Purchase Requests",
    );
    expect(screen.getByText("Manual Purchase")).toBeInTheDocument();
    expect(document.title).toBe("Manual Purchase · Purchasing — Carres");
  });

  it("`Goods Receipts` — and `Receiving` is gone from the header", () => {
    renderAt("/operation?tab=receiving");
    expect(screen.getByText("Goods Receipts")).toBeInTheDocument();
    expect(screen.queryByText("Receiving")).not.toBeInTheDocument();
    expect(screen.queryByText(/GRN/)).not.toBeInTheDocument();
  });

  it("every other page keeps the word it already had", () => {
    for (const [path, word] of [
      ["/operation?tab=purchase", "SO Batch Purchase"],
      ["/operation/procurement", "Purchase Orders"],
      ["/operation?tab=claims", "Supplier Claims"],
      // The hidden legacy page keeps its own word — this Card retired its rail
      // row, not the page (`docs/cards/CARD-2026-08-22-...` §4).
      ["/operation?tab=purchase-demands", "Purchase Demands"],
    ] as const) {
      const view = renderAt(path);
      expect(screen.getByText(word), path).toBeInTheDocument();
      view.unmount();
    }
  });

  it("stays the Sales Orders Destination Header — 24px word, no icon, no prefix", () => {
    renderAt("/operation?tab=receiving");
    const header = screen.getByTestId("purchasing-tabs");
    // The destination format prints the page's own name and nothing before it.
    expect(header.textContent).not.toContain("Purchasing ·");
    expect(screen.getByText("Goods Receipts").className).toContain("text-page");
    // No nameplate icon: at 24px the word carries the identity by itself.
    expect(header.querySelector("svg")).toBeNull();
  });

  it("`Purchase Demands` — the Register's own destination word", () => {
    // CARD-2026-08-20-purchase-demands. The header geometry is the Sales
    // Orders one, unchanged: 50px, 24px word, no icon, no `Purchasing ·`
    // prefix, no tab strip.
    renderAt("/operation?tab=purchase-demands");
    const header = screen.getByTestId("purchasing-tabs");
    expect(screen.getByText("Purchase Demands")).toBeInTheDocument();
    expect(header.textContent).not.toContain("Purchasing ·");
    expect(header.querySelector("svg")).toBeNull();
    // It did NOT fall through to the default page.
    expect(screen.queryByText("SO Batch Purchase")).not.toBeInTheDocument();
    expect(document.title).toBe("Purchase Demands · Purchasing — Carres");
  });

  it("the browser tab says the same word", () => {
    renderAt("/operation?tab=receiving");
    expect(document.title).toBe("Goods Receipts · Purchasing — Carres");
  });
});
