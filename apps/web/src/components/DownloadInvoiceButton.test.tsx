import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DownloadInvoiceButton from "./DownloadInvoiceButton";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/lib/pdf/render", () => ({ renderInvoicePdf: vi.fn(async () => new Blob()) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { apiFetch } from "@/lib/api";

// YH 2026-10-26: several live Sales Invoices (0712 part invoices) — the same
// control asks which one to print; one invoice prints as before.
describe("DownloadInvoiceButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("open", vi.fn());
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
  });

  it("one live invoice prints straight away, as before", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce([{ invoice_no: "INV-1", lines: [] }]).mockResolvedValueOnce({});
    render(<DownloadInvoiceButton orderId="ord-1" so={1001} role="operation" />);
    fireEvent.click(screen.getByTestId("download-invoice-1001"));
    await waitFor(() => expect(apiFetch).toHaveBeenLastCalledWith("/api/orders/ord-1/invoice-pdf-data"));
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("two live invoices: pick one by its number and goods, and that one prints", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce([
      { invoice_no: "INV-231026-0002", lines: [{ sku: "SOFA", qty: 1 }] },
      { invoice_no: "INV-231026-0001", lines: [{ sku: "BED", qty: 2 }] },
    ]).mockResolvedValueOnce({});
    render(<DownloadInvoiceButton orderId="ord-1" so={1001} role="operation" />);
    fireEvent.click(screen.getByTestId("download-invoice-1001"));
    const pick = await screen.findByRole("combobox", { name: /Sales Invoice to print/ });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(pick, { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "INV-231026-0001 · 2 × BED" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenLastCalledWith("/api/orders/ord-1/invoice-pdf-data?invoice=INV-231026-0001"));
  });
});
