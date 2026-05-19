import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SupplierIncoming from "./SupplierIncoming";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, message: string, body: unknown) {
      super(message);
      this.status = status;
      this.body = body;
      this.name = "ApiError";
    }
  },
}));
import { apiFetch } from "@/lib/api";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const DEMAND = [
  { sku: "mattress:cloud:Queen", openQty: 12, poCount: 2 },
  { sku: "mattress:premier:King", openQty: 4, poCount: 1 },
  { sku: "bedframe:l1202:King", openQty: 6, poCount: 1 },
];
const PENDING_POS = [
  { id: "PO-2050", sup_status: "pending", supplier_id: "e1", qty: 4 },
  { id: "PO-2049", sup_status: "in_production", supplier_id: "e1", qty: 6 },
];

describe("SupplierIncoming", () => {
  it("renders KPI row with totals derived from demand + pending POs", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/products/demand")) return DEMAND;
      if (url.includes("/api/supplier/pos")) return PENDING_POS;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<SupplierIncoming />));

    await waitFor(() => {
      // 2026-05-10 (Loo) — KPI labels changed when the "pending demand"
      // bucket landed: "Total open units" → "Total demand", "Open POs" →
      // "Committed (POs)" + new "Pending (orders)" tile.
      expect(screen.getByText("Total demand")).toBeInTheDocument();
    });

    expect(screen.getByText("Committed (POs)")).toBeInTheDocument();
    expect(screen.getByText("Pending (orders)")).toBeInTheDocument();
    // 2026-05-15 (Loo) — "Pending ack" KPI removed from this view; supplier
    // reads ack state on the POs page now.
    expect(screen.queryByText("Pending ack")).not.toBeInTheDocument();
  });

  it("groups SKUs by category prefix", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/products/demand")) return DEMAND;
      if (url.includes("/api/supplier/pos")) return PENDING_POS;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<SupplierIncoming />));

    await waitFor(() => {
      expect(screen.getByTestId("incoming-cat-mattress")).toBeInTheDocument();
    });

    expect(screen.getByTestId("incoming-cat-bedframe")).toBeInTheDocument();
  });

  it("shows empty state when no demand rows", async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);

    render(wrap(<SupplierIncoming />));

    await waitFor(() => {
      expect(
        screen.getByText(/No incoming demand right now/i),
      ).toBeInTheDocument();
    });
  });
});
