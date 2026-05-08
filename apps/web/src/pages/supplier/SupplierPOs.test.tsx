import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import SupplierPOs from "./SupplierPOs";

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
  return (
    <QueryClientProvider client={qc}>
      {ui}
      <Toaster />
    </QueryClientProvider>
  );
}

const PENDING_PO = {
  id: "PO-2050",
  sup_status: "pending",
  sku: "mattress:cloud:Queen",
  qty: 4,
  placed_at: "2026-05-08T00:00:00Z",
  eta_date: "2026-05-15",
  expected_ready_date: null,
  do_number: null,
  supplier_id: "e1",
};
const PROD_PO = {
  ...PENDING_PO,
  id: "PO-2049",
  sup_status: "in_production",
};
const ACCEPTED_PO = {
  ...PENDING_PO,
  id: "PO-2048",
  sup_status: "pickup_accepted",
};

describe("SupplierPOs", () => {
  it("renders the 3 stage tabs", async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);

    render(wrap(<SupplierPOs />));

    expect(screen.getByText("PO")).toBeInTheDocument();
    expect(screen.getByText("Ready to Pickup")).toBeInTheDocument();
    expect(screen.getByText("Delivered")).toBeInTheDocument();
  });

  it("renders pending PO card with both Acknowledge and Mark-in-production buttons", async () => {
    vi.mocked(apiFetch).mockResolvedValue([PENDING_PO]);

    render(wrap(<SupplierPOs />));

    await waitFor(() => {
      expect(screen.getByTestId("po-card-PO-2050")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Acknowledge PO/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mark in production/i })).toBeInTheDocument();
  });

  it("opens drawer with DO upload CTA when sup_status=pickup_accepted", async () => {
    vi.mocked(apiFetch).mockResolvedValue([ACCEPTED_PO]);

    render(wrap(<SupplierPOs />));

    await waitFor(() => {
      expect(screen.getByTestId("po-card-PO-2048")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("po-card-PO-2048"));

    await waitFor(() => {
      expect(screen.getByTestId("po-drawer")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /Upload Delivery Order/i }),
    ).toBeInTheDocument();
  });

  it("calls acknowledge mutation when Acknowledge clicked", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url, init) => {
      if (init?.method === "POST") return { po_id: "PO-2050", sup_status: "acknowledged" };
      return [PENDING_PO];
    });

    render(wrap(<SupplierPOs />));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Acknowledge PO/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Acknowledge PO/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/supplier/pos/PO-2050/acknowledge",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("renders Mark-Ready-for-Pickup button on in_production PO", async () => {
    vi.mocked(apiFetch).mockResolvedValue([PROD_PO]);

    render(wrap(<SupplierPOs />));

    await waitFor(() => {
      expect(screen.getByTestId("po-card-PO-2049")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /Mark Ready for Pickup/i }),
    ).toBeInTheDocument();
  });
});
