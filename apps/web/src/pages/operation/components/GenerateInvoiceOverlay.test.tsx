import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import GenerateInvoiceOverlay from "./GenerateInvoiceOverlay";

const state = vi.hoisted(() => ({ fetch: vi.fn(), render: vi.fn() }));
vi.mock("@/lib/api", () => ({
  apiFetch: state.fetch,
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/lib/pdf/render", () => ({ renderInvoicePdf: state.render }));

/**
 * 0476 — an invoice number is DRAWN at issue (governed INV-DDMMYY-NNNN), so the
 * overlay never predicts one. Before the issue the invoice reads `Draft`; after
 * it, the number the server drew.
 */
function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GenerateInvoiceOverlay
        orderId="00000000-0000-0000-0000-0000000004a1"
        so={4101}
        invoiceNo={null}
        customerName="Probe Customer Overlay"
        customerPhone={null}
        customerAddress={null}
        lines={[{ sku: "PROBE-BED-Q", qty: 1, unit_price: 1000 } as never]}
        hasLineTotal
        orderTotal={1000}
        totalSet
        storageCharge={0}
        storageIncurred={false}
        invoiceTotal={1000}
        balanceDue={0}
        onClose={() => {}}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.fetch.mockReset();
  state.render.mockReset();
  state.render.mockResolvedValue(new Blob(["%PDF"]));
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
});

describe("GenerateInvoiceOverlay — the number is drawn at issue (0476)", () => {
  it("reads Draft before the issue and never shows a predicted INV-YYYY number", async () => {
    show();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.queryByText(/INV-20\d\d-/)).not.toBeInTheDocument();
    await waitFor(() => expect(state.render).toHaveBeenCalled());
    expect(state.render.mock.calls[0][0]).toMatchObject({ invoice_no: "DRAFT" });
  });

  it("the first output issues through the order door and shows the number the server drew", async () => {
    state.fetch.mockResolvedValue({
      invoice_no: "INV-110926-5842", issued_at: "2026-09-11T02:00:00Z", amount: 1000, already_issued: false,
    });
    show();
    fireEvent.click(screen.getByRole("button", { name: /WhatsApp/ }));
    await waitFor(() => expect(state.fetch).toHaveBeenCalledWith(
      "/api/orders/00000000-0000-0000-0000-0000000004a1/issue-invoice",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ amount: 1000 }) }),
    ));
    await waitFor(() => expect(screen.getByText("Issued · INV-110926-5842")).toBeInTheDocument());
    expect(screen.queryByText("Draft")).not.toBeInTheDocument();
  });
});
