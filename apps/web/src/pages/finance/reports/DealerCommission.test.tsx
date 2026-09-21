/**
 * The report draws through the Register shell — the shape every other Finance
 * register has (ListPageShell + the register DataGrid). The footer note and the
 * engine's `N of M rows` only exist on that path, so asserting them is what
 * fails if the page goes back to hand-rolled chrome.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DcSource } from "@carres/shared/dealer-commission";
import DealerCommission from "./DealerCommission";

const net = vi.hoisted(() => ({ routes: {} as Record<string, unknown>, calls: [] as string[] }));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    net.calls.push(key);
    if (key in net.routes) return net.routes[key];
    throw new Error(`unmocked ${key}`);
  }),
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));

const now = new Date();
const MONTH = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

/** RM250 collected on a RM1,000 order at the 20% default rate: RM50 earned, RM150 still to collect. */
const SOURCE: DcSource = {
  settings: { defaultRate: 20 },
  rates: [],
  quotas: [],
  models: [{ id: "m1", name: "Sofa" }],
  dealers: [{ id: "d1", name: "Ace Furniture" }],
  outlets: [{ id: "o1", name: "Ace KL", dealerId: "d1" }],
  orders: [{
    orderId: "ord1", so: 2054, dealerId: "d1", outletId: "o1", addons: 0,
    lines: [{ modelId: "m1", category: "furniture", value: 1000 }],
    payments: [{ paidOn: `${MONTH}-05`, amount: 250 }],
  }],
};

beforeEach(() => {
  net.routes = { [`GET /api/finance/dealer-commission?month=${MONTH}`]: SOURCE };
  net.calls = [];
  localStorage.clear();
});

describe("Dealer commission", () => {
  it("reports the month through the Register shell", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter><DealerCommission /></MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("Ace Furniture");
    expect(screen.getByText("RM 50.00")).toBeTruthy();
    expect(screen.getByText("RM 150.00")).toBeTruthy();
    // The register's own 32px footer carries the count and the note.
    expect(screen.getByTestId("dealer-commission-summary")).toHaveTextContent(
      "1 of 1 rows · Commission is earned only on money collected.",
    );
    // The scope sits in the register's toolbar, so it is inside the grid frame.
    expect(screen.getByTestId("grid-footer")).toBeTruthy();
    expect(screen.getByText("Showroom")).toBeTruthy();
  });
});
