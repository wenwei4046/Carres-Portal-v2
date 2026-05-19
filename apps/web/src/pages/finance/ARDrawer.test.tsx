import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import ARDrawer from "./ARDrawer";
import type { FinanceArAgingRow } from "@/lib/queries";

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
vi.mock("@/lib/pdf/render", () => ({
  renderInvoicePdf: vi.fn(),
}));
import { apiFetch } from "@/lib/api";
import { renderInvoicePdf } from "@/lib/pdf/render";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      {ui}
      <Toaster />
    </QueryClientProvider>
  );
}

const PAID_DELIVERED_ROW: FinanceArAgingRow = {
  order_id:      "11111111-1111-1111-1111-000000000001",
  so:            1240,
  customer_name: "Tan Wei Ming",
  dealer_id:     "d1",
  dealer_name:   "Carres KL",
  placed_at:     "2026-04-29T00:00:00Z",
  days:          11,
  aging:         "0-30",
  total:         12500,
  paid:          12500,
  outstanding:   0,
  invoice_no:    "INV-2026-0001",
  status:        "delivered",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ARDrawer", () => {
  it("renders Issue invoice button when delivered + fully paid", () => {
    vi.mocked(apiFetch).mockResolvedValue([]);

    render(wrap(<ARDrawer row={PAID_DELIVERED_ROW} onClose={() => {}} />));

    expect(screen.getByRole("button", { name: /Issue invoice/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Download invoice/i }),
    ).not.toBeInTheDocument();
  });

  it("post-issue: swaps Issue → Download button using id from RPC response", async () => {
    const NEW_INVOICE_ID = "22222222-2222-2222-2222-000000000099";
    vi.mocked(apiFetch).mockImplementation(async (url, init) => {
      if (init?.method === "POST" && url.includes("/api/finance/invoices/issue")) {
        return {
          id:         NEW_INVOICE_ID,
          invoice_no: "INV-2026-0001",
          order_id:   PAID_DELIVERED_ROW.order_id,
          amount:     12500,
          tax_amount: 925.93,
          issued_at:  "2026-05-09",
        };
      }
      return [];
    });

    const onClose = vi.fn();
    render(wrap(<ARDrawer row={PAID_DELIVERED_ROW} onClose={onClose} />));

    fireEvent.click(screen.getByRole("button", { name: /Issue invoice/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Download invoice/i }),
      ).toBeInTheDocument();
    });

    // Drawer stays open — user must explicitly click Download.
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Download click hits the JSON data route + renders client-side", async () => {
    const NEW_INVOICE_ID = "33333333-3333-3333-3333-000000000100";
    vi.mocked(apiFetch).mockImplementation(async (url, init) => {
      if (init?.method === "POST" && url.includes("/api/finance/invoices/issue")) {
        return { id: NEW_INVOICE_ID, invoice_no: "INV-2026-0001" };
      }
      if (url.includes("/pdf-data")) {
        // Browser-side render gets the template data, not a PDF blob.
        return { invoice_no: "INV-2026-0001" };
      }
      return [];
    });
    vi.mocked(renderInvoicePdf).mockResolvedValue(
      new Blob(["%PDF-1.4 fake"], { type: "application/pdf" }),
    );
    Object.assign(window.URL, {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(wrap(<ARDrawer row={PAID_DELIVERED_ROW} onClose={() => {}} />));

    fireEvent.click(screen.getByRole("button", { name: /Issue invoice/i }));

    const download = await screen.findByRole("button", { name: /Download invoice/i });
    fireEvent.click(download);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        `/api/finance/invoices/${NEW_INVOICE_ID}/pdf-data`,
      );
    });
    await waitFor(() => {
      expect(renderInvoicePdf).toHaveBeenCalled();
    });
    expect(openSpy).toHaveBeenCalledWith("blob:mock", "_blank");

    openSpy.mockRestore();
  });
});
