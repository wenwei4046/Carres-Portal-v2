/**
 * `/ui` is the one Carres UI kit (UI MASTER, owner ruling 14 Oct 2026): every
 * part on it is the component the pages import, with TEST data, and the earlier
 * kit is gone from it. These tests pin what design checks against v12.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render as rtlRender, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import UiShowcase from "./UiShowcase";

/* As in the app: the Tasks button reads the tasks count through the query client. */
const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })}>{ui}</QueryClientProvider>);

describe("/ui — the one Carres UI kit", () => {
  it("shows the v12 kit parts, then every shared part the pages import, and none of the retired kit's notes", () => {
    render(<UiShowcase />);
    for (const id of ["table", "cells", "pills", "toolbar", "side-panel", "icons", "list-engine", "buttons", "fields", "menus", "tabs-kit", "dialogs", "states", "status-pill", "compact-card", "documents", "task-parts", "not-yet"]) {
      expect(document.getElementById(id), id).toBeInTheDocument();
    }
    expect(screen.queryByRole("heading", { name: "Frozen decisions" })).not.toBeInTheDocument();
    /* the one listing engine is on the page, not only the Sales Order Outright frame */
    expect(document.getElementById("list-engine")!.querySelector('[data-testid="sales-orders-grid"]')).toBeInTheDocument();
  });

  it("the ⋮ menu is the one CPopover menu: it opens, runs a command and closes", () => {
    render(<UiShowcase />);
    const menus = document.getElementById("menus")!;
    fireEvent.click(within(menus).getByRole("button", { name: "Row actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Print" }));
    expect(screen.queryByRole("menuitem", { name: "Print" })).not.toBeInTheDocument();
  });

  it("the Carres Table is the marked table, with the preserved date's two-line header and the identifier fixed", () => {
    render(<UiShowcase />);
    const tables = document.querySelectorAll('[data-carres-table="list"]');
    expect(tables).toHaveLength(2);
    const table = within(tables[0] as HTMLElement);
    /* the preserved request keeps its two lines, never ETA (owner 14 Oct 2026) */
    expect(table.getByRole("columnheader", { name: "Customer’s original requested delivery" })).toHaveTextContent("Customer’s original requested delivery");
    /* ▸ · ☐ · Proceed date · SO no. · … */
    const firstHeader = table.getAllByRole("columnheader")[2]!;
    expect(firstHeader).toHaveTextContent("Proceed date");
    expect(firstHeader.className).not.toContain("sticky");
    /* the identifier, SO No, stays (Layout Standard: ▸, tick and identifier stay fixed) */
    expect(table.getAllByRole("columnheader")[3]!.className).toContain("sticky");
    expect(table.getAllByRole("columnheader")[4]!.className).not.toContain("sticky");
    expect(table.getByRole("button", { name: "Hide items" })).toHaveAttribute("aria-expanded", "true");
    expect(within(document.querySelector('[data-carres-table="item-rows"]') as HTMLElement).getByText("TEST · Mattress model A")).toBeInTheDocument();
    expect(table.getByRole("checkbox", { name: "Select SO-TEST-02" })).toBeChecked();
  });

  it("the footer reads one line of words, two lines at most, inside the card; the pager stays", () => {
    render(<UiShowcase />);
    const section = document.querySelector('[data-carres-table="list"]') as HTMLElement;
    expect(section.className).toContain("grid-cols-[minmax(0,1fr)]");
    const words = section.querySelector(".line-clamp-2") as HTMLElement;
    /* fix list 14 Oct, point 7: one space each side of every ·, the fixed order */
    expect(words.textContent).toBe("3 orders · Qty: Mattress 23 · Pillow 10 · Bedframe 14 · Mattress protector 4 · Sofa 22 sets · Others 1");
    expect(words.className).toContain("line-clamp-2");
    expect(within(section).getByRole("button", { name: "Next page" })).toBeInTheDocument();
  });

  it("keeps the three empty states apart in the cells", () => {
    render(<UiShowcase />);
    const cells = document.getElementById("cells")!;
    expect(within(cells).getByText("Not recorded")).toBeInTheDocument();
    expect(within(cells).getByText("Could not read")).toBeInTheDocument();
    /* the sample's name and the cell itself */
    expect(within(cells).getAllByText("No access")).toHaveLength(2);
  });

  it("the side panel hides and comes back from the toolbar", () => {
    render(<UiShowcase />);
    fireEvent.click(screen.getByRole("button", { name: "Hide summary" }));
    expect(screen.queryByRole("complementary", { name: "Summary" })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Summary" })[0]!);
    expect(screen.getByRole("complementary", { name: "Summary" })).toBeInTheDocument();
  });

  it("the toolbar's chips clear and its ⋮ opens the menu", () => {
    render(<UiShowcase />);
    const toolbar = document.getElementById("toolbar")!;
    fireEvent.click(within(toolbar).getByRole("button", { name: "Payment: Owes ×" }));
    expect(within(toolbar).queryByRole("button", { name: "Payment: Owes ×" })).not.toBeInTheDocument();
    expect(within(toolbar).getByRole("tablist", { name: "Views" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "More actions" })).toBeInTheDocument();
    /* the view button names the view (v12 Shell) */
    expect(within(toolbar).getByRole("button", { name: "View: Sales Order" })).toHaveTextContent("Sales Order");
  });
});
