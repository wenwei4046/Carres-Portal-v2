import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Toaster } from "sonner";
import DownloadSalesOrderButton from "./DownloadSalesOrderButton";

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
  renderSalesOrderPdf: vi.fn(),
}));
import { apiFetch } from "@/lib/api";
import { renderSalesOrderPdf } from "@/lib/pdf/render";

describe("DownloadSalesOrderButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // window.open is undefined in jsdom unless we stub.
    vi.stubGlobal("open", vi.fn());
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("renders for allowed roles", () => {
    render(
      <DownloadSalesOrderButton orderId="ord-1" so={1001} role="dealer" />,
    );
    expect(screen.getByTestId("download-sales-order-1001")).toBeInTheDocument();
  });

  it("renders for operation (allowed after Loo's 2026-05-12 revision)", () => {
    render(
      <DownloadSalesOrderButton orderId="ord-1" so={1001} role="operation" />,
    );
    expect(screen.getByTestId("download-sales-order-1001")).toBeInTheDocument();
  });

  it("renders nothing for partner + supplier (denied)", () => {
    const partner = render(
      <DownloadSalesOrderButton orderId="ord-2" so={1002} role="partner" />,
    );
    expect(partner.container.firstChild).toBeNull();

    const supplier = render(
      <DownloadSalesOrderButton orderId="ord-3" so={1003} role="supplier" />,
    );
    expect(supplier.container.firstChild).toBeNull();
  });

  it("pos variant renders the .pos-proto ghost pill with the View label", () => {
    render(
      <DownloadSalesOrderButton orderId="ord-1" so={1256} role="dealer" variant="pos" />,
    );
    const btn = screen.getByTestId("download-sales-order-1256");
    expect(btn).toHaveClass("btn", "btn--ghost");
    expect(btn).toHaveTextContent("View sales order");
  });

  it("fetches JSON, renders client-side, opens new tab on click", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(apiFetch).mockResolvedValueOnce({ so_number: "SO-001001" } as any);
    const fakeBlob = new Blob(["%PDF-1.4 …"], { type: "application/pdf" });
    vi.mocked(renderSalesOrderPdf).mockResolvedValueOnce(fakeBlob);

    render(
      <>
        <DownloadSalesOrderButton orderId="ord-1" so={1001} role="dealer" />
        <Toaster />
      </>,
    );

    fireEvent.click(screen.getByTestId("download-sales-order-1001"));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/orders/ord-1/sales-order-data",
      );
    });
    await waitFor(() => {
      expect(renderSalesOrderPdf).toHaveBeenCalled();
    });
    expect(window.open).toHaveBeenCalledWith("blob:fake", "_blank");
  });
});
