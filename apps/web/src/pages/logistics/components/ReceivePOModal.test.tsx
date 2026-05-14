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
const receiveThreadsMutateAsync = vi
  .fn()
  .mockResolvedValue({ pickup_event_id: "evt-1", thread_count: 1, po_sup_status: "partially_shipped" });

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useReceivePoWithDoMutation: () => ({
      mutateAsync: receiveMutateAsync,
      isPending: false,
    }),
    // Task 12: per-thread receive mutation. Suite stubs it to a stable
    // promise so we can assert the payload + button enablement without
    // touching the real /api/logistics/pos/:poId/receive-threads route.
    useLogisticsReceiveThreads: () => ({
      mutateAsync: receiveThreadsMutateAsync,
      isPending: false,
    }),
  };
});

// DOFileUploadField pulls from these two — mock both so the file-input
// onChange flow resolves to a deterministic { token, path } pair without a
// network call. Task 12 adds a second consumer of `apiFetch`: the per-PO
// threads read (`GET /api/logistics/pos/:poId/threads`). The shared mock
// routes by URL: storage sign-upload returns { token, path }; threads route
// returns whatever the test seeded via `setThreadsResponse(...)` (defaults
// to `[]`).
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

// URL-routing mock. The tests set:
//   - threadsResponse: what GET /threads returns (default []).
//   - default upload response: { token, path } pair the upload field expects.
let threadsResponse: unknown = [];
function setThreadsResponse(rows: unknown) {
  threadsResponse = rows;
}
function installApiFetchRouter() {
  vi.mocked(apiFetch).mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/threads")) {
      return Promise.resolve(threadsResponse) as ReturnType<typeof apiFetch>;
    }
    // Default = storage sign-upload response.
    return Promise.resolve({
      token: "sign-tok",
      path: "PO-2050/abc-DO-1.pdf",
    }) as ReturnType<typeof apiFetch>;
  });
}

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
  receiveThreadsMutateAsync.mockClear();
  vi.mocked(apiFetch).mockReset();
  setThreadsResponse([]);
  installApiFetchRouter();
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
    // apiFetch URL-router (installed in beforeEach) already returns the
    // upload { token, path } pair for any non-/threads call.
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
    // apiFetch URL-router (installed in beforeEach) already returns the
    // upload { token, path } pair for any non-/threads call.
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

describe("ReceivePOModal — Task 12 own_logistics per-thread receive", () => {
  const FACTORY_PICKUP_SUPPLIER: SupplierRow = {
    ...SUPPLIER,
    kind: "factory_pickup",
  };
  const THREAD_A = {
    id: "11111111-1111-4111-8111-aaaaaaaaaaaa",
    order_id: "ord-a",
    order_dl: 1001,
    customer_name: "Aiman bin Salleh",
    customer_delivery_date: "2026-05-20",
    supplier_ready_at: "2026-05-15T10:00:00Z",
    pickup_event_id: null,
    sku_lines: [{ sku: "mattress:carres-cloud:King", qty: 2 }],
  };
  const THREAD_B = {
    id: "22222222-2222-4222-8222-bbbbbbbbbbbb",
    order_id: "ord-b",
    order_dl: 1002,
    customer_name: "Lim Mei Ling",
    customer_delivery_date: "2026-05-22",
    supplier_ready_at: "2026-05-15T11:00:00Z",
    pickup_event_id: null,
    sku_lines: [{ sku: "mattress:carres-cloud:Queen", qty: 1 }],
  };
  const THREAD_C_PICKED = {
    id: "33333333-3333-4333-8333-cccccccccccc",
    order_id: "ord-c",
    order_dl: 1003,
    customer_name: "Tan Wei",
    customer_delivery_date: "2026-05-25",
    // Ready AND already picked up — must NOT appear in the multi-select list.
    supplier_ready_at: "2026-05-14T10:00:00Z",
    pickup_event_id: "evt-existing",
    sku_lines: [],
  };

  it("renders Ready threads section for own_logistics suppliers with ready threads", async () => {
    setThreadsResponse([THREAD_A, THREAD_B]);
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
    await waitFor(() =>
      expect(
        screen.getByTestId("receive-po-ready-threads-section"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/Ready threads \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/DL-1001/)).toBeInTheDocument();
    expect(screen.getByText(/DL-1002/)).toBeInTheDocument();
  });

  it("filters out threads with pickup_event_id (already picked up)", async () => {
    setThreadsResponse([THREAD_A, THREAD_C_PICKED]);
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
    await waitFor(() =>
      expect(screen.getByText(/Ready threads \(1\)/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/DL-1001/)).toBeInTheDocument();
    expect(screen.queryByText(/DL-1003/)).not.toBeInTheDocument();
  });

  it("does NOT render the section for factory_pickup suppliers (even with ready threads)", async () => {
    // Even though we seed ready threads, the section is gated on
    // supplier.kind === "own_logistics".
    setThreadsResponse([THREAD_A]);
    render(
      wrap(
        <ReceivePOModal
          po={makePo()}
          supplier={FACTORY_PICKUP_SUPPLIER}
          warehouse={WAREHOUSE}
          onClose={() => {}}
        />,
      ),
    );
    // No section.
    expect(
      screen.queryByTestId("receive-po-ready-threads-section"),
    ).not.toBeInTheDocument();
  });

  it("does NOT render the section when own_logistics PO has 0 ready threads", async () => {
    setThreadsResponse([]);
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
    // Section gated on readyThreads.length > 0 — empty list hides it.
    expect(
      screen.queryByTestId("receive-po-ready-threads-section"),
    ).not.toBeInTheDocument();
  });

  it("checkbox toggle updates Receive button label with selected count", async () => {
    setThreadsResponse([THREAD_A, THREAD_B]);
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
    const btn = await screen.findByTestId("receive-po-receive-threads-btn");
    // 0 selected initially.
    expect(btn).toHaveTextContent(/Receive 0 threads/);
    // Tick first thread → label flips to "Receive 1 thread".
    fireEvent.click(
      screen.getByLabelText(`Tick thread for DL-${THREAD_A.order_dl}`),
    );
    expect(btn).toHaveTextContent(/Receive 1 thread/);
    // Tick second → label flips to "Receive 2 threads".
    fireEvent.click(
      screen.getByLabelText(`Tick thread for DL-${THREAD_B.order_dl}`),
    );
    expect(btn).toHaveTextContent(/Receive 2 threads/);
    // Untick first → drops to "Receive 1 thread".
    fireEvent.click(
      screen.getByLabelText(`Tick thread for DL-${THREAD_A.order_dl}`),
    );
    expect(btn).toHaveTextContent(/Receive 1 thread/);
  });

  it("Receive threads button is disabled until DO# + signed + file + ≥1 thread are valid", async () => {
    setThreadsResponse([THREAD_A]);
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
    const btn = await screen.findByTestId("receive-po-receive-threads-btn");
    // No thread selected → disabled.
    expect(btn).toBeDisabled();
    // Tick thread.
    fireEvent.click(
      screen.getByLabelText(`Tick thread for DL-${THREAD_A.order_dl}`),
    );
    // Still disabled — no file uploaded yet (signed unchecked too).
    expect(btn).toBeDisabled();
    // Tick signed.
    fireEvent.click(
      screen.getByText(/Goods inspected and DO signed by warehouse/)
        .previousSibling as Element,
    );
    expect(btn).toBeDisabled();
    // Upload file.
    const file = new File(["%PDF-1.4"], "do.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/^do file$/i), {
      target: { files: [file] },
    });
    // Now Receive button should be enabled.
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it("clicking Receive sends one batched receiveThreads call with the selected thread IDs + DO meta", async () => {
    setThreadsResponse([THREAD_A, THREAD_B]);
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
    const btn = await screen.findByTestId("receive-po-receive-threads-btn");
    // Tick both threads.
    fireEvent.click(
      screen.getByLabelText(`Tick thread for DL-${THREAD_A.order_dl}`),
    );
    fireEvent.click(
      screen.getByLabelText(`Tick thread for DL-${THREAD_B.order_dl}`),
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
    await waitFor(() => expect(btn).not.toBeDisabled());
    // Click Receive.
    fireEvent.click(btn);
    await waitFor(() =>
      expect(receiveThreadsMutateAsync).toHaveBeenCalledTimes(1),
    );
    const payload = receiveThreadsMutateAsync.mock.calls[0]?.[0];
    expect(payload.poId).toBe("PO-2050");
    expect(payload.doFilePath).toBe("PO-2050/abc-DO-1.pdf");
    expect(payload.doNumber).toMatch(/^DO-\d+/);
    expect(payload.threadIds).toHaveLength(2);
    expect(payload.threadIds).toEqual(
      expect.arrayContaining([THREAD_A.id, THREAD_B.id]),
    );
    // The legacy per-line mutation must NOT have been called.
    expect(receiveMutateAsync).not.toHaveBeenCalled();
  });
});
