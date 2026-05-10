import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReceivePOModal from "./ReceivePOModal";
import type {
  LogisticsPoListRow,
  SupplierRow,
} from "@/lib/queries";

/**
 * ReceivePOModal — Phase 4.5 Chunk 1 Task 38 — DO file upload wiring.
 *
 * The pre-task version included a "Simulated DO PDF placeholder" UI block
 * (a dashed-border card showing `{doNumber}.pdf · 184 KB · (simulated)`).
 * Per spec §8.6 + §0.1, that placeholder is replaced by the real
 * `DOFileUploadField` component (Task 37) which:
 *   - Picks PDF/JPG/PNG ≤ 10 MB
 *   - Calls `POST /api/storage/dos/sign-upload` for a signed URL token
 *   - Streams bytes to the `delivery-orders` Storage bucket
 *   - Calls back with the canonical Storage path on success
 *
 * The Submit button is now gated until BOTH the existing fields (DO# ≥ 3
 * chars, signed checkbox, total > 0) AND a `doFilePath` from the upload
 * field are set. This guarantees the receive RPC always has a real DO file
 * to point at instead of the previous mock string.
 */

const receiveMutateAsync = vi.fn().mockResolvedValue({});

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useReceivePoWithDoMutation: () => ({
      mutateAsync: receiveMutateAsync,
      isPending: false,
    }),
  };
});

// DOFileUploadField pulls from these two — mock both so the file-input
// onChange flow resolves to a deterministic { token, path } pair without a
// network call.
vi.mock("../../../lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("../../../lib/supabase", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        uploadToSignedUrl: vi.fn().mockResolvedValue({ error: null }),
      })),
    },
  },
}));
import { apiFetch } from "../../../lib/api";

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const SUPPLIER: SupplierRow = {
  id: "11111111-1111-1111-1111-000000000001",
  name: "Carres Manufacturing",
  kind: "own_logistics",
  cat_covered: ["mattress"],
  lead_time: "5–7 days",
  contact: "+60 3-1111 1111",
};

const WAREHOUSE = {
  id: "22222222-2222-2222-2222-000000000001",
  name: "KL Warehouse",
  address: "Subang Jaya",
};

function makePo(overrides: Partial<LogisticsPoListRow> = {}): LogisticsPoListRow {
  return {
    id: "PO-2050",
    supplier_id: SUPPLIER.id,
    warehouse_id: WAREHOUSE.id,
    status: "open",
    sup_status: "delivered",
    dl: 1234,
    dl_refs: null,
    eta_date: "2026-05-15",
    placed_at: "2026-05-01T00:00:00Z",
    purchase_order_lines: [
      {
        // 0076: line UUID — modal keys recv state by id and sends it as the
        // RPC lookup key (replaces sku-based scoping).
        id: "11111111-1111-4111-8111-111111111111",
        sku: "mattress:carres-cloud:King",
        qty: 2,
        received_qty: 0,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  receiveMutateAsync.mockClear();
  vi.mocked(apiFetch).mockReset();
});

describe("ReceivePOModal — Task 38 DO file upload", () => {
  it("does NOT render the simulated DO placeholder anymore", () => {
    render(
      wrap(
        <ReceivePOModal
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE}
          onClose={() => {}}
        />,
      ),
    );
    // Pre-Task-38 placeholder said `(simulated)` — must be gone.
    expect(screen.queryByText(/simulated/i)).not.toBeInTheDocument();
    // The hard-coded "184 KB" mock-size string is also gone.
    expect(screen.queryByText(/184 KB/)).not.toBeInTheDocument();
  });

  it("renders the DOFileUploadField (real upload component)", () => {
    render(
      wrap(
        <ReceivePOModal
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE}
          onClose={() => {}}
        />,
      ),
    );
    // DOFileUploadField uses aria-label="DO file" on its <input type="file">.
    expect(screen.getByLabelText(/^do file$/i)).toBeInTheDocument();
  });

  it("Submit button is disabled until a DO file is uploaded (even when DO# + signed are set)", () => {
    render(
      wrap(
        <ReceivePOModal
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE}
          onClose={() => {}}
        />,
      ),
    );
    // Tick the signed checkbox.
    fireEvent.click(
      screen.getByText(/Goods inspected and DO signed by warehouse/)
        .previousSibling as Element,
    );
    // DO# auto-suggested already (≥ 3 chars), totalReceiving > 0 from default.
    // Without an uploaded file path, Submit must still be disabled.
    expect(
      screen.getByRole("button", { name: /Mark received|Receive partial/ }),
    ).toBeDisabled();
  });

  it("Submit button enables once a DO file is uploaded AND DO# + signed + totals are valid", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      token: "sign-tok",
      path: "PO-2050/abc-DO-1.pdf",
    });
    render(
      wrap(
        <ReceivePOModal
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE}
          onClose={() => {}}
        />,
      ),
    );
    // Tick signed.
    fireEvent.click(
      screen.getByText(/Goods inspected and DO signed by warehouse/)
        .previousSibling as Element,
    );
    // Upload a valid PDF.
    const file = new File(["%PDF-1.4"], "do.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/^do file$/i), {
      target: { files: [file] },
    });
    // Now Submit should be enabled.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Mark received|Receive partial/ }),
      ).not.toBeDisabled(),
    );
  });

  it("Submit makes one batched receive call carrying both lines + DO file path", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      token: "sign-tok",
      path: "PO-2050/abc-DO-1.pdf",
    });
    render(
      wrap(
        <ReceivePOModal
          po={makePo({
            purchase_order_lines: [
              {
                id: "22222222-2222-4222-8222-222222222222",
                sku: "mattress:carres-cloud:King",
                qty: 2,
                received_qty: 0,
              },
              {
                id: "33333333-3333-4333-8333-333333333333",
                sku: "sofa:nordic:3s",
                qty: 1,
                received_qty: 0,
              },
            ],
          })}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE}
          onClose={() => {}}
        />,
      ),
    );
    // Tick signed.
    fireEvent.click(
      screen.getByText(/Goods inspected and DO signed by warehouse/)
        .previousSibling as Element,
    );
    // Upload file.
    const file = new File(["%PDF-1.4"], "do.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/^do file$/i), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Mark received|Receive partial/ }),
      ).not.toBeDisabled(),
    );
    // Submit.
    fireEvent.click(
      screen.getByRole("button", { name: /Mark received|Receive partial/ }),
    );
    // v3 batched call: 1 mutation call with all ticked lines + DO metadata.
    await waitFor(() =>
      expect(receiveMutateAsync).toHaveBeenCalledTimes(1),
    );
    const payload = receiveMutateAsync.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      doFilePath: "PO-2050/abc-DO-1.pdf",
      // 0076: payload now keys by line UUID `id` (not sku) — the RPC scopes
      // WHERE/UPDATE on id so multi-variant lines (same sku, different
      // attrs) don't collide.
      lines: expect.arrayContaining([
        { id: "22222222-2222-4222-8222-222222222222", receivedQty: 2 },
        { id: "33333333-3333-4333-8333-333333333333", receivedQty: 1 },
      ]),
    });
    expect(payload.doNumber).toMatch(/^DO-\d+/);
  });
});
