import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PickupBatchDialog from "./PickupBatchDialog";

/**
 * Task 11 (2026-05-15) — PickupBatchDialog tests.
 *
 * 2026-05-16 (migration 0117 + Loo screenshot) — dialog rebuilt around a
 * one-click Pickup confirmation. Server auto-generates the DO# server-side
 * (Carres single-company workflow; partner isn't the issuer). The dialog now
 * shows a brief PO summary + optional note + Pickup button. Submit is enabled
 * whenever there's at least one selected thread.
 */

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
vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        uploadToSignedUrl: vi.fn().mockResolvedValue({ error: null }),
      })),
    },
  },
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PickupBatchDialog", () => {
  it("renders heading with selected thread count + PO id", () => {
    render(
      wrap(
        <PickupBatchDialog
          poId="PO-FIXTURE-1"
          selectedThreadIds={["t1", "t2", "t3"]}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByText(/Pickup 3 thread\(s\)/i)).toBeInTheDocument();
    expect(screen.getByText(/PO-FIXTURE-1/)).toBeInTheDocument();
  });

  it("Submit enabled out-of-the-box (no DO# / file required) — server auto-generates", () => {
    render(
      wrap(
        <PickupBatchDialog
          poId="PO-1"
          selectedThreadIds={["t1", "t2"]}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByTestId("pickup-batch-submit")).not.toBeDisabled();
  });

  it("Submit disabled when no threads selected (defensive guard)", () => {
    render(
      wrap(
        <PickupBatchDialog
          poId="PO-1"
          selectedThreadIds={[]}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByTestId("pickup-batch-submit")).toBeDisabled();
  });

  it("shows the auto-generated DO# explainer text", () => {
    render(
      wrap(
        <PickupBatchDialog
          poId="PO-1"
          selectedThreadIds={["t1"]}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByText(/auto-generate the DO number/i)).toBeInTheDocument();
  });

  it("optional note field is rendered (only user-typeable input)", () => {
    render(
      wrap(
        <PickupBatchDialog
          poId="PO-1"
          selectedThreadIds={["t1"]}
          onClose={() => {}}
        />,
      ),
    );
    const note = screen.getByLabelText(/note/i);
    fireEvent.change(note, { target: { value: "driver-A · plate WPB1234" } });
    expect((note as HTMLTextAreaElement).value).toBe("driver-A · plate WPB1234");
  });

  it("Cancel button invokes onClose", () => {
    const onClose = vi.fn();
    render(
      wrap(
        <PickupBatchDialog
          poId="PO-1"
          selectedThreadIds={["t1"]}
          onClose={onClose}
        />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
