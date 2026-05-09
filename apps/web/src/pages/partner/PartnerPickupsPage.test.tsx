import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PartnerPickupsPage from "./PartnerPickupsPage";

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
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const THREAD_ID = "00000000-0000-0000-0000-0000000200a1";

// Phase 4.5 Chunk 2 carry-forward `phase-4.5-chunk-2-partner-rfd-page-rebuild`
// rebuilt this page with two sections — RFD Pending (customer-leg, sourced
// from `GET /api/partner/pickups/rfd-pending` via RPC `logistics_partner_rfd_pending`)
// and All Pickups (procurement-leg, sourced from `GET /api/partner/pickups`).
// Customer-leg state lives on `order_supplier_threads` post-0052; the
// PO-sourced indicator that disappeared with the column drop is now restored
// from threads via the new endpoint.
function mockApi(rfdRows: unknown[], poRows: unknown[], toDeliverRows: unknown[] = []) {
  vi.mocked(apiFetch).mockImplementation(async (path) => {
    if (typeof path === "string" && path.includes("/rfd-pending")) return rfdRows;
    if (typeof path === "string" && path.includes("/to-deliver")) return toDeliverRows;
    return poRows;
  });
}

describe("PartnerPickupsPage", () => {
  it("renders procurement-leg PO rows with sup_status chips", async () => {
    mockApi(
      [],
      [
        { id: "PO-001", sup_status: "pickup_assigned" },
        { id: "PO-002", sup_status: "delivered" },
      ],
    );
    render(wrap(<PartnerPickupsPage />));
    await waitFor(() => expect(screen.getByText("PO-001")).toBeInTheDocument());
    expect(screen.getByText(/pickup_assigned/i)).toBeInTheDocument();
    expect(screen.getByText("PO-002")).toBeInTheDocument();
    // sup_status chip "delivered" is the only `delivered`-text element when
    // the In Transit list is empty (added Phase 7 Sprint 2).
    expect(screen.getByText("delivered")).toBeInTheDocument();
  });

  it("renders empty-state when no RFD-pending threads", async () => {
    mockApi([], [{ id: "PO-001", sup_status: "delivered" }]);
    render(wrap(<PartnerPickupsPage />));
    await waitFor(() =>
      expect(
        screen.getByText(/No RFD requests waiting for your response/i),
      ).toBeInTheDocument(),
    );
  });

  it("renders RFD-pending row with customer name + dates + View RFD button", async () => {
    mockApi(
      [
        {
          thread_id: THREAD_ID,
          order_id: "00000000-0000-0000-0000-0000000300a1",
          po_id: "PO-001",
          customer_name: "Loo's Living Room",
          request_for_delivery_at: "2026-05-08T08:30:00Z",
          confirm_delivery_date: "2026-05-15",
        },
      ],
      [],
    );
    render(wrap(<PartnerPickupsPage />));
    await waitFor(() =>
      expect(screen.getByText("Loo's Living Room")).toBeInTheDocument(),
    );
    expect(screen.getByText("2026-05-15")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /view rfd/i })).toBeInTheDocument();
  });

  it("clicking View RFD opens the dialog scoped to that thread", async () => {
    mockApi(
      [
        {
          thread_id: THREAD_ID,
          order_id: "00000000-0000-0000-0000-0000000300a1",
          po_id: "PO-007",
          customer_name: "Acme Sdn Bhd",
          request_for_delivery_at: "2026-05-08T08:30:00Z",
          confirm_delivery_date: "2026-05-15",
        },
      ],
      [],
    );
    render(wrap(<PartnerPickupsPage />));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /view rfd/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /view rfd/i }));
    // Dialog title uses poLabel — confirms threadId + poLabel were both passed.
    await waitFor(() =>
      expect(screen.getByText(/Request for Delivery — PO-007/)).toBeInTheDocument(),
    );
    // Dialog has Accept + Reject buttons (poLabel header confirms it's the one
    // we just opened, not stale state).
    expect(screen.getByRole("button", { name: /^accept$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
  });

  it("closing the dialog (Cancel) hides it", async () => {
    mockApi(
      [
        {
          thread_id: THREAD_ID,
          order_id: "00000000-0000-0000-0000-0000000300a1",
          po_id: "PO-007",
          customer_name: "Acme Sdn Bhd",
          request_for_delivery_at: "2026-05-08T08:30:00Z",
          confirm_delivery_date: "2026-05-15",
        },
      ],
      [],
    );
    render(wrap(<PartnerPickupsPage />));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /view rfd/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /view rfd/i }));
    await waitFor(() =>
      expect(screen.getByText(/Request for Delivery — PO-007/)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() =>
      expect(screen.queryByText(/Request for Delivery — PO-007/)).toBeNull(),
    );
  });
});
