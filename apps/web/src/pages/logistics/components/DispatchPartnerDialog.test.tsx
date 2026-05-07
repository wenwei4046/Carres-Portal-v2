import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DispatchPartnerDialog from "./DispatchPartnerDialog";

vi.mock("../../../lib/api", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "../../../lib/api";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const LP_ID = "00000000-0000-0000-0000-0000000001f1";
const THREAD_ID = "00000000-0000-0000-0000-0000000200a1";

describe("DispatchPartnerDialog", () => {
  it("submits with forceDispatch=true when Force toggle on", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (typeof path === "string" && path.includes("/partners")) {
        return [{ id: LP_ID, name: "LP-A" }];
      }
      return { mode: "force" };
    });
    const onClose = vi.fn();
    render(wrap(<DispatchPartnerDialog threadId={THREAD_ID} poLabel="PO-200" onClose={onClose} />));

    await waitFor(() => expect(screen.getByText("LP-A")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/LP-A/i));
    fireEvent.change(screen.getByLabelText(/confirm delivery date/i), { target: { value: "2026-05-20" } });
    fireEvent.click(screen.getByLabelText(/force dispatch/i));
    fireEvent.click(screen.getByRole("button", { name: /dispatch/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/logistics/pos/dispatch-customer-leg",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"forceDispatch":true'),
        }),
      );
    });
    const dispatchCall = vi
      .mocked(apiFetch)
      .mock.calls.find(([p]) => typeof p === "string" && p.endsWith("/dispatch-customer-leg"));
    const body = JSON.parse((dispatchCall?.[1] as RequestInit).body as string);
    expect(body).toEqual({
      threadId: THREAD_ID,
      partnerId: LP_ID,
      confirmDeliveryDate: "2026-05-20",
      forceDispatch: true,
    });
  });

  it("submits with forceDispatch=false (RFD path) by default", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (typeof path === "string" && path.includes("/partners")) {
        return [{ id: LP_ID, name: "LP-A" }];
      }
      return { mode: "rfd" };
    });
    render(wrap(<DispatchPartnerDialog threadId={THREAD_ID} poLabel="PO-200" onClose={() => {}} />));

    await waitFor(() => expect(screen.getByText("LP-A")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/LP-A/i));
    fireEvent.change(screen.getByLabelText(/confirm delivery date/i), { target: { value: "2026-05-20" } });
    fireEvent.click(screen.getByRole("button", { name: /dispatch/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/logistics/pos/dispatch-customer-leg",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"forceDispatch":false'),
        }),
      );
    });
  });

  it("title falls back to threadId slice when poLabel omitted", async () => {
    vi.mocked(apiFetch).mockResolvedValue([{ id: LP_ID, name: "LP-A" }]);
    render(wrap(<DispatchPartnerDialog threadId={THREAD_ID} onClose={() => {}} />));
    await waitFor(() => expect(screen.getByText(/Dispatch — 00000000/)).toBeInTheDocument());
  });
});
