import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PartnerFactoryPickupsPage from "./PartnerFactoryPickupsPage";

/**
 * Task 11 (2026-05-15) — PartnerFactoryPickupsPage multi-select pickup tests.
 *
 * The page is the partner procurement-leg kanban (factory → warehouse). With
 * migration 0107, the Awaiting-accept column gains a per-thread checklist
 * for POs whose linked threads have been ticked supplier-ready. Picking a
 * subset, then clicking "Pickup selected", opens PickupBatchDialog scoped
 * to the chosen threads.
 *
 * NOTE: the task spec doc named "PartnerPickupsPage" but Loo's 2026-05-10
 * page split moved procurement-leg state to this file (PartnerFactoryPickups
 * Page), so the multi-select integration lives here. PartnerPickupsPage now
 * holds customer-leg deliveries only.
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

import { apiFetch } from "@/lib/api";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const PO_ID = "PO-FIXTURE-PICKUP-1";
const T1 = "00000000-0000-0000-0000-0000000a0001";
const T2 = "00000000-0000-0000-0000-0000000a0002";
const T3 = "00000000-0000-0000-0000-0000000a0003";

function poWithThreads(opts: { readyCount: number; total: number }) {
  const threads = Array.from({ length: opts.total }).map((_, i) => ({
    id: [T1, T2, T3][i] ?? `t-${i}`,
    order_id: `order-${i}`,
    supplier_ready_at: i < opts.readyCount ? "2026-05-14T10:00:00Z" : null,
    pickup_event_id: null,
    orders: {
      so: 1000 + i,
      delivery_date: "2026-05-25",
      customer_name: `Customer ${i + 1}`,
    },
  }));
  return {
    id: PO_ID,
    so: 999,
    supplier_id: "supplier-1",
    warehouse_id: "wh-1",
    sup_status: "ready_for_pickup",
    status: "open",
    eta_date: "2026-05-22",
    placed_at: "2026-05-01T00:00:00Z",
    procurement_partner_id: "partner-1",
    suppliers: { name: "NiceFuture", contact: null, kind: "factory_pickup" },
    warehouses: { name: "KL Warehouse", address: "Subang", kind: "own", owning_partner_id: null },
    lines: [{ id: "l1", sku: "mattress:King", qty: 3, received_qty: 0, attrs: null }],
    threads,
    customer_eta_min: "2026-05-25",
    urgency: "normal",
    behind_schedule: false,
    sku_summary: [{ sku: "mattress:King", qty: 3 }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PartnerFactoryPickupsPage — Task 11 multi-select pickup", () => {
  it("renders ready-thread checklist with one row per supplier-ready thread", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce([
      poWithThreads({ readyCount: 2, total: 3 }),
    ]);
    render(wrap(<PartnerFactoryPickupsPage />));

    // Wait for the page to render past the loading state.
    await waitFor(() =>
      expect(screen.getByTestId(`ready-threads-${PO_ID}`)).toBeInTheDocument(),
    );

    // Two ready threads → two checkboxes; the third (not ready) is omitted.
    expect(screen.getByTestId(`thread-checkbox-${T1}`)).toBeInTheDocument();
    expect(screen.getByTestId(`thread-checkbox-${T2}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`thread-checkbox-${T3}`)).not.toBeInTheDocument();

    // Pickup button is rendered but disabled until at least one thread ticked.
    expect(screen.getByTestId(`pickup-selected-${PO_ID}`)).toBeDisabled();
  });

  it("ticking threads enables Pickup-selected with running count, click opens dialog", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce([
      poWithThreads({ readyCount: 2, total: 2 }),
    ]);
    render(wrap(<PartnerFactoryPickupsPage />));
    await waitFor(() =>
      expect(screen.getByTestId(`ready-threads-${PO_ID}`)).toBeInTheDocument(),
    );

    const btn = screen.getByTestId(`pickup-selected-${PO_ID}`);
    expect(btn).toBeDisabled();
    expect(btn.textContent).toMatch(/Pickup selected \(0\)/);

    fireEvent.click(screen.getByTestId(`thread-checkbox-${T1}`));
    expect(btn).not.toBeDisabled();
    expect(btn.textContent).toMatch(/Pickup selected \(1\)/);

    fireEvent.click(screen.getByTestId(`thread-checkbox-${T2}`));
    expect(btn.textContent).toMatch(/Pickup selected \(2\)/);

    fireEvent.click(btn);

    // Dialog mounts (heading reflects the chosen count + scoped PO).
    await waitFor(() =>
      expect(screen.getByText(/Pickup 2 thread\(s\)/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(new RegExp(`PO ${PO_ID}`))).toBeInTheDocument();
  });

  it("falls back to legacy Accept-pickup button for stockpile POs (no threads)", async () => {
    // 2026-05-16 (migration 0114) — the legacy Accept-pickup path now means
    // "stockpile PO with no linked customer-leg threads". A PO with threads
    // shows the multi-select checklist scoped to the supplier-ready ones;
    // a PO without threads has nothing to multi-select against, so the
    // partner falls back to the old PO-level Accept-pickup button.
    vi.mocked(apiFetch).mockResolvedValueOnce([
      { ...poWithThreads({ readyCount: 0, total: 0 }), threads: [] },
    ]);
    render(wrap(<PartnerFactoryPickupsPage />));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /accept pickup/i })).toBeInTheDocument(),
    );
    // No multi-select widget rendered for this PO.
    expect(screen.queryByTestId(`ready-threads-${PO_ID}`)).not.toBeInTheDocument();
  });

  it("partial-ready PO appears in BOTH Upcoming and Awaiting columns (migration 0114)", async () => {
    // 1 ready thread + 2 producing → kanban shows the same PO in:
    //   * Upcoming column (producing threads still on the floor)
    //   * Awaiting column (1 ready thread waiting for partner)
    vi.mocked(apiFetch).mockResolvedValueOnce([
      { ...poWithThreads({ readyCount: 1, total: 3 }), sup_status: "in_production" },
    ]);
    render(wrap(<PartnerFactoryPickupsPage />));
    await waitFor(() =>
      expect(screen.getByTestId(`ready-threads-${PO_ID}`)).toBeInTheDocument(),
    );
    // Two PO cards in the kanban — one per column.
    const cards = screen.getAllByText(PO_ID);
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });

  it("records arrival only and leaves Goods Receipt to governed Receiving", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce([{
        ...poWithThreads({ readyCount: 0, total: 0 }),
        threads: [],
        sup_status: "picked_up",
      }])
      .mockImplementation(async (path) =>
        String(path).endsWith("/arrived") ? {} : [],
      );
    render(wrap(<PartnerFactoryPickupsPage />));

    const arrived = await screen.findByRole("button", { name: "Arrived at WH" });
    fireEvent.click(arrived);

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      `/api/partner/pickups/${PO_ID}/arrived`,
      { method: "POST" },
    ));
    expect(apiFetch).not.toHaveBeenCalledWith(
      `/api/partner/pickups/${PO_ID}/receive`,
      expect.anything(),
    );
    expect(screen.queryByText(/Receive PO/i)).not.toBeInTheDocument();
  });
});
