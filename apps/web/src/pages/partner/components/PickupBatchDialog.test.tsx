import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PickupBatchDialog from "./PickupBatchDialog";

/**
 * Task 11 (2026-05-15) — PickupBatchDialog tests.
 *
 * The dialog wraps `usePartnerPickupBatch` which hits the partner-side
 * `/api/partner/pickups/batch` endpoint backed by `partner_pickup_threads`
 * RPC (migration 0107). Test surface is the gating logic on Submit — the
 * three predicates that must ALL pass:
 *   1. DO# trimmed length ≥ 3
 *   2. signed checkbox ticked
 *   3. doFilePath set (DOFileUploadField has produced a Storage path)
 *
 * We mock `@/lib/api` + `@/lib/supabase` so DOFileUploadField (the real
 * component, reused as-is) doesn't try to network during these tests.
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

  it("Submit disabled when DO# is empty + signed unchecked + no file", () => {
    render(
      wrap(
        <PickupBatchDialog
          poId="PO-1"
          selectedThreadIds={["t1", "t2"]}
          onClose={() => {}}
        />,
      ),
    );
    const submit = screen.getByTestId("pickup-batch-submit");
    expect(submit).toBeDisabled();
  });

  it("Submit stays disabled when only DO# is set", () => {
    render(
      wrap(
        <PickupBatchDialog
          poId="PO-1"
          selectedThreadIds={["t1", "t2"]}
          onClose={() => {}}
        />,
      ),
    );
    fireEvent.change(screen.getByLabelText(/DO number/i), {
      target: { value: "DO-A1" },
    });
    expect(screen.getByTestId("pickup-batch-submit")).toBeDisabled();
  });

  it("Submit stays disabled when DO# + signed are set but no file uploaded", () => {
    render(
      wrap(
        <PickupBatchDialog
          poId="PO-1"
          selectedThreadIds={["t1", "t2"]}
          onClose={() => {}}
        />,
      ),
    );
    fireEvent.change(screen.getByLabelText(/DO number/i), {
      target: { value: "DO-A1" },
    });
    fireEvent.click(screen.getByLabelText(/signed receipt confirmed/i));
    expect(screen.getByTestId("pickup-batch-submit")).toBeDisabled();
  });

  it("renders the DOFileUploadField only AFTER DO# reaches 3 chars (the upload path needs it)", () => {
    render(
      wrap(
        <PickupBatchDialog
          poId="PO-1"
          selectedThreadIds={["t1"]}
          onClose={() => {}}
        />,
      ),
    );
    // Pre-typing: file field absent.
    expect(screen.queryByLabelText(/do file/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/DO number/i), {
      target: { value: "AB" },
    });
    // Still <3 chars.
    expect(screen.queryByLabelText(/do file/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/DO number/i), {
      target: { value: "ABC" },
    });
    // Field surfaces (DOFileUploadField exposes its file input via
    // aria-label="DO file").
    expect(screen.getByLabelText(/do file/i)).toBeInTheDocument();
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

  // Submit success path is intentionally NOT covered here — exercising it
  // would require a real DOFileUploadField file pick + signed-URL round-trip
  // which is brittle in jsdom and already covered by DOFileUploadField's own
  // tests + the partner-pickups-batch API integration test.
});
