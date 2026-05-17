import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import RevertConfirmDialog from "./RevertConfirmDialog";

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

describe("RevertConfirmDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the proceed revert endpoint when kind=proceed", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      order_id: "ord-1",
      dl: 1001,
      status: "place",
    });
    const onClose = vi.fn();

    render(
      wrap(
        <RevertConfirmDialog
          orderId="ord-1"
          dl={1001}
          kind="proceed"
          onClose={onClose}
        />,
      ),
    );

    expect(
      screen.getByText(/Revert order #1001 from Proceed Request to Placed\?/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("revert-confirm-button"));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/operation/orders/ord-1/revert-proceed",
        { method: "POST" },
      );
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("calls the dispatch revert endpoint when kind=dispatch", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      order_id: "ord-2",
      dl: 1002,
      threads_reverted: 2,
    });
    const onClose = vi.fn();

    render(
      wrap(
        <RevertConfirmDialog
          orderId="ord-2"
          dl={1002}
          kind="dispatch"
          onClose={onClose}
        />,
      ),
    );

    expect(
      screen.getByText(
        /Revert order #1002 from Dispatched to Ready to Dispatch\?/,
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("revert-confirm-button"));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/operation/orders/ord-2/revert-dispatch",
        { method: "POST" },
      );
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("Cancel button closes without calling the API", () => {
    const onClose = vi.fn();
    render(
      wrap(
        <RevertConfirmDialog
          orderId="ord-3"
          dl={1003}
          kind="proceed"
          onClose={onClose}
        />,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
