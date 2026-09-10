import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return { ...actual, useOperationOrders: () => ({ data: { orders: [] } }) };
});
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn().mockResolvedValue({ tasks: [] }) }));
vi.mock("./JumpTo", () => ({ default: () => null }));

import { TopBarIcons } from "./GlobalTopBar";

/**
 * The Settings gear on a WAREHOUSE page.
 *
 * The Warehouse map is four `?tab=` destinations, not four pathnames
 * (`portal-nav.ts`), so a launcher that reads only `location.pathname` offers
 * Warehouse Settings on every Operations page or on none. These tests pin the
 * two items the card names, and pin that the door actually opens something.
 */
function renderAt(entry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <QueryClientProvider client={qc}>
        <TopBarIcons />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

const WAREHOUSE_PAGES = [
  "/operation?tab=warehouse-monitor",
  "/operation?tab=warehouse-inbound",
  "/operation?tab=stock-onhand",
  "/operation?tab=warehouse-outbound",
];

describe("Settings → Warehouse", () => {
  it.each(WAREHOUSE_PAGES)("offers exactly two items on %s", (entry) => {
    renderAt(entry);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const menu = screen.getByTestId("settings-launcher");
    expect(within(menu).getByRole("menuitem", { name: "Warehouse Settings" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "All System Settings" })).toBeInTheDocument();
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(2);
  });

  it("opens the working Warehouse Settings route, not a placeholder", () => {
    renderAt("/operation?tab=warehouse-monitor");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Warehouse Settings" }));
    expect(navigate).toHaveBeenCalledWith("/operation/settings/warehouse/details");
  });

  it("does NOT offer Warehouse Settings on a page Warehouse does not own", () => {
    renderAt("/operation?tab=payments");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const menu = screen.getByTestId("settings-launcher");
    expect(within(menu).queryByRole("menuitem", { name: "Warehouse Settings" })).toBeNull();
  });

  it("still offers the OTHER modules their own settings", () => {
    renderAt("/operation/orders");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("menuitem", { name: "Sales Order Settings" })).toBeInTheDocument();
  });
});
