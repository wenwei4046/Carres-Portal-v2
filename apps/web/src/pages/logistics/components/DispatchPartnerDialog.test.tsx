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

describe("DispatchPartnerDialog", () => {
  it("submits with force_dispatch=true when Force toggle on", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (typeof path === "string" && path.includes("/partners")) {
        return [{ id: LP_ID, name: "LP-A" }];
      }
      return { mode: "force" };
    });
    const onClose = vi.fn();
    render(wrap(<DispatchPartnerDialog poId="PO-200" onClose={onClose} />));

    await waitFor(() => expect(screen.getByText("LP-A")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/LP-A/i));
    fireEvent.change(screen.getByLabelText(/confirm delivery date/i), { target: { value: "2026-05-20" } });
    fireEvent.click(screen.getByLabelText(/force dispatch/i));
    fireEvent.click(screen.getByRole("button", { name: /dispatch/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/logistics/pos/PO-200/dispatch-customer-leg",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"force_dispatch":true'),
        }),
      );
    });
  });

  it("submits with force_dispatch=false (RFD path) by default", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (typeof path === "string" && path.includes("/partners")) {
        return [{ id: LP_ID, name: "LP-A" }];
      }
      return { mode: "rfd" };
    });
    render(wrap(<DispatchPartnerDialog poId="PO-200" onClose={() => {}} />));

    await waitFor(() => expect(screen.getByText("LP-A")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/LP-A/i));
    fireEvent.change(screen.getByLabelText(/confirm delivery date/i), { target: { value: "2026-05-20" } });
    fireEvent.click(screen.getByRole("button", { name: /dispatch/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/logistics/pos/PO-200/dispatch-customer-leg",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"force_dispatch":false'),
        }),
      );
    });
  });
});
