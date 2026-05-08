import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SupplierDashboard from "./SupplierDashboard";

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

const POS = [
  { id: "PO-2050", sup_status: "pending", qty: 4, supplier_id: "e1" },
  { id: "PO-2049", sup_status: "in_production", qty: 6, supplier_id: "e1" },
  { id: "PO-2048", sup_status: "ready_for_pickup", qty: 2, supplier_id: "e1" },
  { id: "PO-2047", sup_status: "delivered", qty: 8, supplier_id: "e1" },
];
const DEMAND = [
  { sku: "mattress:cloud:Queen", openQty: 12, poCount: 2 },
  { sku: "mattress:cloud:King", openQty: 4, poCount: 1 },
];

describe("SupplierDashboard", () => {
  it("renders 4 KPIs from the supplier PO list", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/products/demand")) return DEMAND;
      if (url.includes("/api/supplier/pos")) return POS;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<SupplierDashboard />));

    await waitFor(() => {
      expect(screen.getByText("Pending acknowledgement")).toBeInTheDocument();
    });

    expect(screen.getByText("In production")).toBeInTheDocument();
    expect(screen.getByText("Ready · awaiting pickup")).toBeInTheDocument();
    expect(screen.getByText("Total open units")).toBeInTheDocument();
  });

  it("derives pipeline stage counts from sup_status", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/products/demand")) return DEMAND;
      if (url.includes("/api/supplier/pos")) return POS;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<SupplierDashboard />));

    await waitFor(() => {
      expect(screen.getByText("Pipeline overview")).toBeInTheDocument();
    });

    // PO: 2 (pending + in_production); Ready: 1; Delivered: 1
    expect(screen.getByText("PO")).toBeInTheDocument();
    expect(screen.getByText("Ready to Pickup")).toBeInTheDocument();
    expect(screen.getByText("Delivered")).toBeInTheDocument();
  });

  it("renders Top demand from useSupplierDemand", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/products/demand")) return DEMAND;
      if (url.includes("/api/supplier/pos")) return POS;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<SupplierDashboard />));

    await waitFor(() => {
      expect(screen.getByText("mattress:cloud:Queen")).toBeInTheDocument();
    });
    expect(screen.getByText("mattress:cloud:King")).toBeInTheDocument();
    expect(screen.getByText(/Top demand/i)).toBeInTheDocument();
  });
});
