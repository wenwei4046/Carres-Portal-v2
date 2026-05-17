import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LpInboundConfirmDialog from "./LpInboundConfirmDialog";

vi.mock("../../../lib/api", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "../../../lib/api";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("LpInboundConfirmDialog", () => {
  it("calls lp-accept-inbound on Accept", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ po_id: "PO-100", sup_status: "partner_confirmed" });
    const onClose = vi.fn();
    render(wrap(<LpInboundConfirmDialog poId="PO-100" onClose={onClose} />));
    fireEvent.click(screen.getByRole("button", { name: /^accept$/i }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/api/operation/pos/PO-100/lp-accept-inbound",
      expect.objectContaining({ method: "POST" }),
    ));
  });

  it("calls lp-reject-inbound on Reject", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ po_id: "PO-100", sup_status: "customer_rejected" });
    const onClose = vi.fn();
    render(wrap(<LpInboundConfirmDialog poId="PO-100" onClose={onClose} />));
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/api/operation/pos/PO-100/lp-reject-inbound",
      expect.objectContaining({ method: "POST" }),
    ));
  });
});
