import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WarehouseReceiptsPanel from "./WarehouseReceiptsPanel";

/**
 * R6 (ops half) — the review panel on the Receiving station.
 *
 * The three claims under test: it costs ZERO pixels when nothing is waiting,
 * it says out loud that a check-in will open a claim, and a send-back cannot
 * happen without a reason.
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const RECEIPT = {
  id: "r1",
  po_id: "PO-2001",
  warehouse_id: "wh-klang",
  warehouse_name: "Carres Klang",
  supplier_name: "Ohana",
  do_number: "DO-5512",
  do_file_path: "PO-2001/x-do.jpg",
  note: "driver left before carton 3 was opened",
  status: "submitted",
  submitted_by_name: "Klang counter",
  submitted_at: "2026-07-27T02:00:00Z",
  reviewed_by_name: null,
  reviewed_at: null,
  return_reason: null,
  lines: [
    {
      id: "l1",
      sku: "MS01-K",
      received_now: 4,
      damaged_qty: 1,
      wrong_item_qty: 0,
      wrong_item_claim_type: null,
    },
  ],
  summary: "4 good · 1 damaged",
  opens_claims: true,
};

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

function mockQueue(receipts: unknown[]) {
  apiFetchMock.mockImplementation((path: string) => {
    if (typeof path === "string" && path.includes("/warehouse-receipts?status="))
      return Promise.resolve({ receipts, counts: { waiting: receipts.length } });
    return Promise.resolve({});
  });
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("WarehouseReceiptsPanel", () => {
  it("renders NOTHING when no count is waiting — zero permanent pixels", async () => {
    mockQueue([]);
    const { container } = wrap(<WarehouseReceiptsPanel />);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByTestId("warehouse-receipts-panel")).toBeNull(),
    );
    expect(container.textContent).toBe("");
  });

  it("names the PO, who counted it, and what they counted", async () => {
    mockQueue([RECEIPT]);
    wrap(<WarehouseReceiptsPanel />);
    await screen.findByTestId("warehouse-receipts-panel");
    expect(screen.getByText("PO-2001")).toBeInTheDocument();
    expect(screen.getByText("4 good · 1 damaged")).toBeInTheDocument();
    expect(screen.getByText(/Klang counter/)).toBeInTheDocument();
    expect(
      screen.getByText("driver left before carton 3 was opened"),
    ).toBeInTheDocument();
  });

  it("warns that a check-in will open a supplier claim", async () => {
    mockQueue([RECEIPT]);
    wrap(<WarehouseReceiptsPanel />);
    expect(
      await screen.findByTestId("warehouse-receipt-claims-PO-2001"),
    ).toHaveTextContent("opens a supplier claim");
  });

  it("says nothing about claims for a clean count", async () => {
    mockQueue([{ ...RECEIPT, opens_claims: false, summary: "4 good" }]);
    wrap(<WarehouseReceiptsPanel />);
    await screen.findByTestId("warehouse-receipts-panel");
    expect(
      screen.queryByTestId("warehouse-receipt-claims-PO-2001"),
    ).not.toBeInTheDocument();
  });

  it("checks in through the ops route, with no numbers of its own", async () => {
    mockQueue([RECEIPT]);
    wrap(<WarehouseReceiptsPanel />);
    fireEvent.click(await screen.findByTestId("warehouse-receipt-check-in-PO-2001"));

    await waitFor(() => {
      const call = apiFetchMock.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("/check-in"),
      );
      expect(call).toBeTruthy();
      expect(call?.[0]).toBe("/api/operation/warehouse-receipts/r1/check-in");
      expect(JSON.parse((call?.[1] as { body: string }).body)).toEqual({});
    });
  });

  it("offers no way to edit the count — ops reviews, it does not re-type", async () => {
    mockQueue([RECEIPT]);
    const { container } = wrap(<WarehouseReceiptsPanel />);
    await screen.findByTestId("warehouse-receipts-panel");
    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(0);
  });

  it("will not send a count back without a reason", async () => {
    mockQueue([RECEIPT]);
    wrap(<WarehouseReceiptsPanel />);
    fireEvent.click(await screen.findByTestId("warehouse-receipt-send-back-PO-2001"));

    const confirm = await screen.findByTestId(
      "warehouse-receipt-confirm-send-back-PO-2001",
    );
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(
      apiFetchMock.mock.calls.some(
        (c) => typeof c[0] === "string" && c[0].includes("/send-back"),
      ),
    ).toBe(false);
  });

  it("sends the reason with the return", async () => {
    mockQueue([RECEIPT]);
    wrap(<WarehouseReceiptsPanel />);
    fireEvent.click(await screen.findByTestId("warehouse-receipt-send-back-PO-2001"));
    fireEvent.change(
      await screen.findByTestId("warehouse-receipt-reason-PO-2001"),
      { target: { value: "DO photo is unreadable" } },
    );
    fireEvent.click(
      screen.getByTestId("warehouse-receipt-confirm-send-back-PO-2001"),
    );

    await waitFor(() => {
      const call = apiFetchMock.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("/send-back"),
      );
      expect(call?.[0]).toBe("/api/operation/warehouse-receipts/r1/send-back");
      expect(JSON.parse((call?.[1] as { body: string }).body)).toEqual({
        reason: "DO photo is unreadable",
      });
    });
  });
});
