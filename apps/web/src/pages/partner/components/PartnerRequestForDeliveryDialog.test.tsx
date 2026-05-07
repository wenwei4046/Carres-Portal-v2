import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PartnerRequestForDeliveryDialog from "./PartnerRequestForDeliveryDialog";

vi.mock("../../../lib/api", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "../../../lib/api";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const THREAD_ID = "00000000-0000-0000-0000-00000000beef";

describe("PartnerRequestForDeliveryDialog", () => {
  it("calls accept-rfd on Accept with threadId body", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ thread_id: THREAD_ID, mode: "accept" });
    const onClose = vi.fn();
    render(wrap(<PartnerRequestForDeliveryDialog threadId={THREAD_ID} poLabel="PO-001" onClose={onClose} />));

    fireEvent.click(screen.getByRole("button", { name: /^accept$/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/partner/pickups/accept-rfd",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ threadId: THREAD_ID }),
        }),
      );
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("calls reject-rfd on Reject with threadId body (no reason field per C1.9)", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ thread_id: THREAD_ID, rfd_cleared: true });
    const onClose = vi.fn();
    render(wrap(<PartnerRequestForDeliveryDialog threadId={THREAD_ID} poLabel="PO-001" onClose={onClose} />));

    fireEvent.click(screen.getByRole("button", { name: /reject/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/partner/pickups/reject-rfd",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ threadId: THREAD_ID }),
        }),
      );
    });
  });

  it("does not render a confirm-delivery-date input (dead UX cleaned up)", () => {
    render(wrap(<PartnerRequestForDeliveryDialog threadId={THREAD_ID} poLabel="PO-001" onClose={() => {}} />));
    expect(screen.queryByLabelText(/confirm delivery date/i)).toBeNull();
  });

  it("title falls back to threadId slice when poLabel omitted", () => {
    render(wrap(<PartnerRequestForDeliveryDialog threadId={THREAD_ID} onClose={() => {}} />));
    expect(screen.getByText(/Request for Delivery — 00000000/)).toBeInTheDocument();
  });
});
