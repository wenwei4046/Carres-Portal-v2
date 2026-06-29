import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ordersState: any;

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOrders: () => ordersState,
    useOutlets: () => ({ data: { outlets: [] } }),
    usePrincipalDealers: () => ({
      data: { dealers: [{ id: "d-1", name: "Mattress King", status: "active" }] },
    }),
  };
});

import PrincipalOrders from "./PrincipalOrders";

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PrincipalOrders", () => {
  it("renders an empty state when principal has no orders", () => {
    ordersState = { data: { orders: [] }, isLoading: false, error: null };
    render(wrap(<PrincipalOrders />));
    expect(screen.getByText("No orders.")).toBeInTheDocument();
  });

  it("lists an order with its owning dealer (read across the network)", () => {
    ordersState = {
      data: {
        orders: [
          {
            id: "o1",
            so: 1001,
            status: "place",
            dealerId: "d-1",
            outletId: null,
            customer: { name: "Tan Mei Ling" },
            totalAmount: 2990,
            placedAt: "2026-06-20T00:00:00Z",
          },
        ],
      },
      isLoading: false,
      error: null,
    };
    render(wrap(<PrincipalOrders />));
    expect(screen.getByText("SO-1001")).toBeInTheDocument();
    expect(screen.getByText("Tan Mei Ling")).toBeInTheDocument();
    expect(screen.getByText("Mattress King")).toBeInTheDocument();
  });
});
