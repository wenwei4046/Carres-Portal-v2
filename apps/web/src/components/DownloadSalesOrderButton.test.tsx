import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Toaster } from "sonner";
import DownloadSalesOrderButton from "./DownloadSalesOrderButton";

vi.mock("@/lib/api", () => ({
  apiFetchBlob: vi.fn(),
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
import { apiFetchBlob } from "@/lib/api";

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
      <DownloadSalesOrderButton orderId="ord-1" dl={1001} role="dealer" />,
    );
    expect(screen.getByTestId("download-sales-order-1001")).toBeInTheDocument();
  });

  it("renders nothing for logistics (denied)", () => {
    const { container } = render(
      <DownloadSalesOrderButton orderId="ord-1" dl={1001} role="logistics" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for partner + supplier (denied)", () => {
    const partner = render(
      <DownloadSalesOrderButton orderId="ord-2" dl={1002} role="partner" />,
    );
    expect(partner.container.firstChild).toBeNull();

    const supplier = render(
      <DownloadSalesOrderButton orderId="ord-3" dl={1003} role="supplier" />,
    );
    expect(supplier.container.firstChild).toBeNull();
  });

  it("fetches PDF + opens new tab on click", async () => {
    const fakeBlob = new Blob(["%PDF-1.4 …"], { type: "application/pdf" });
    vi.mocked(apiFetchBlob).mockResolvedValueOnce(fakeBlob);

    render(
      <>
        <DownloadSalesOrderButton orderId="ord-1" dl={1001} role="dealer" />
        <Toaster />
      </>,
    );

    fireEvent.click(screen.getByTestId("download-sales-order-1001"));

    await waitFor(() => {
      expect(apiFetchBlob).toHaveBeenCalledWith(
        "/api/orders/ord-1/sales-order-pdf",
      );
    });
    expect(window.open).toHaveBeenCalledWith("blob:fake", "_blank");
  });
});
