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

describe("PartnerRequestForDeliveryDialog", () => {
  it("calls accept-rfd on Accept", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ po_id: "PO-001" });
    const onClose = vi.fn();
    render(wrap(<PartnerRequestForDeliveryDialog poId="PO-001" onClose={onClose} />));

    fireEvent.change(screen.getByLabelText(/confirm delivery date/i), { target: { value: "2026-05-15" } });
    fireEvent.click(screen.getByRole("button", { name: /^accept$/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/partner/pickups/PO-001/accept-rfd",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("2026-05-15"),
        }),
      );
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("calls reject-rfd on Reject (no reason field per C1.9)", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ po_id: "PO-001", rfd_cleared: true });
    const onClose = vi.fn();
    render(wrap(<PartnerRequestForDeliveryDialog poId="PO-001" onClose={onClose} />));

    fireEvent.click(screen.getByRole("button", { name: /reject/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/partner/pickups/PO-001/reject-rfd",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
