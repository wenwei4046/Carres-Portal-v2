import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PartnerIncoming from "./PartnerIncoming";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));
import { apiFetch } from "@/lib/api";

const ORDER = {
  id: "o-1",
  so: 1401,
  customer_name: "Tan Mei Ling",
  customer_phone: null,
  customer_address: null,
  delivery_date: null,
  request_for_delivery_at: "2026-10-29T00:00:00Z",
  placed_at: "2026-10-28T00:00:00Z",
  operation_stage: null,
  warehouse_id: null,
  dealers: null,
  warehouses: null,
};

describe("PartnerIncoming", () => {
  it("a failed background refetch keeps the loaded orders", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ orders: [ORDER] });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <PartnerIncoming />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Tan Mei Ling/)).toBeInTheDocument();
    vi.mocked(apiFetch).mockRejectedValue(new Error("boom"));
    await act(async () => {
      await qc.refetchQueries();
    });
    expect(screen.getByText(/Tan Mei Ling/)).toBeInTheDocument();
    expect(screen.queryByText(/load incoming orders/)).not.toBeInTheDocument();
  });
});
