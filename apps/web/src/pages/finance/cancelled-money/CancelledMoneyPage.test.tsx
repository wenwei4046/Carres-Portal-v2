import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CancelledMoneyPage, { type CancelledMoneyRow } from "./CancelledMoneyPage";

const net = vi.hoisted(() => ({ calls: [] as string[], rows: [] as unknown[] }));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    net.calls.push(`${init?.method ?? "GET"} ${path}`);
    return net.rows;
  }),
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));

const ROW: CancelledMoneyRow = {
  order_id: "aaaaaaaa-0000-4000-8000-000000000001",
  so: 4321,
  customer_name: "Amy Tan",
  paid: 500,
  refunded: 100,
  held: 400,
  cancelled_at: "2026-10-01T02:00:00Z",
};

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CancelledMoneyPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  net.calls = [];
  net.rows = [];
});

describe("CancelledMoneyPage", () => {
  it("lists the order, customer and money held, linked to the order, and only reads", async () => {
    net.rows = [ROW];
    mount();
    const link = await screen.findByRole("link", { name: "SO-4321" });
    expect(link.getAttribute("href")).toBe(`/operation/orders/so/${ROW.order_id}`);
    expect(screen.getByText("Amy Tan")).toBeTruthy();
    expect(screen.getByText("RM 400.00")).toBeTruthy();
    expect(net.calls).toEqual(["GET /api/finance/cancelled-money"]);
    expect(screen.queryByRole("button", { name: /^(refund|issue refund|move money)$/i })).toBeNull();
  });

  it("says plainly when nothing is held", async () => {
    mount();
    expect(await screen.findByText("No cancelled order is holding customer money.")).toBeTruthy();
  });
});
