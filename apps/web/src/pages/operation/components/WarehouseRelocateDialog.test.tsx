import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WarehouseRelocateDialog from "./WarehouseRelocateDialog";

vi.mock("../../../lib/api", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "../../../lib/api";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("WarehouseRelocateDialog", () => {
  it("lists warehouses and submits selection", async () => {
    const WH_ID = "00000000-0000-0000-0000-0000000000a2";
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (typeof path === "string" && path.includes("/warehouse")) {
        return [
          { id: "00000000-0000-0000-0000-0000000000a1", name: "Own WH KL", kind: "own" },
          { id: WH_ID, name: "LP-A WH", kind: "operation_partner" },
        ];
      }
      return { po_id: "PO-100", new_warehouse_id: WH_ID };
    });

    const onClose = vi.fn();
    render(wrap(<WarehouseRelocateDialog poId="PO-100" onClose={onClose} />));

    await waitFor(() => expect(screen.getByText("LP-A WH")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/LP-A WH/i));
    fireEvent.click(screen.getByRole("button", { name: /relocate/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/operation/pos/PO-100/relocate-inbound",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining(WH_ID),
        }),
      );
    });
  });
});
