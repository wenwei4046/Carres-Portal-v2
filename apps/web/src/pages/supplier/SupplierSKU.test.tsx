import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SupplierSKU from "./SupplierSKU";

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

const PRODUCTS = [
  {
    sku: "mattress:cloud:Queen",
    category: "mattress",
    model_key: "cloud",
    variant: "Queen",
    price: 2500,
    model: { name: "Cloud Series", blurb: "Memory foam" },
  },
  {
    sku: "mattress:cloud:King",
    category: "mattress",
    model_key: "cloud",
    variant: "King",
    price: 3200,
    model: { name: "Cloud Series", blurb: "Memory foam" },
  },
  {
    sku: "bedframe:l1202:King",
    category: "bedframe",
    model_key: "l1202",
    variant: "King",
    price: 1800,
    model: { name: "L1202 Series", blurb: "Solid wood" },
  },
];
const DEMAND = [
  { sku: "mattress:cloud:Queen", openQty: 10, poCount: 2 },
];

describe("SupplierSKU", () => {
  it("renders KPI row + table headers + grouped rows", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/products/demand")) return DEMAND;
      if (url.includes("/api/supplier/products")) return PRODUCTS;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<SupplierSKU />));

    await waitFor(() => {
      expect(screen.getByTestId("supplier-sku-table")).toBeInTheDocument();
    });

    expect(screen.getByText("Total SKUs")).toBeInTheDocument();
    expect(screen.getByText("Models covered")).toBeInTheDocument();
    // "Open demand" appears in both KPI label and table header — assert ≥1
    expect(screen.getAllByText("Open demand").length).toBeGreaterThan(0);
    expect(screen.getByText(/Carres SKU/i)).toBeInTheDocument();
  });

  it("filters by category chip", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/products/demand")) return DEMAND;
      if (url.includes("/api/supplier/products")) return PRODUCTS;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<SupplierSKU />));

    await waitFor(() => {
      expect(screen.getByText("mattress:cloud:Queen")).toBeInTheDocument();
    });

    expect(screen.getByText("bedframe:l1202:King")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Mattress$/ }));

    await waitFor(() => {
      expect(screen.queryByText("bedframe:l1202:King")).not.toBeInTheDocument();
    });

    expect(screen.getByText("mattress:cloud:Queen")).toBeInTheDocument();
  });

  it("filters by search query", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/products/demand")) return DEMAND;
      if (url.includes("/api/supplier/products")) return PRODUCTS;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<SupplierSKU />));

    await waitFor(() => {
      expect(screen.getByText("mattress:cloud:Queen")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/Search SKU/i), {
      target: { value: "L1202" },
    });

    await waitFor(() => {
      expect(screen.queryByText("mattress:cloud:Queen")).not.toBeInTheDocument();
    });

    expect(screen.getByText("bedframe:l1202:King")).toBeInTheDocument();
  });
});
