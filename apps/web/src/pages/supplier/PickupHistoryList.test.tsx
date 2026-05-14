import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import PickupHistoryList from "./PickupHistoryList";

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

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("PickupHistoryList", () => {
  it("renders one row per event with DO# + reprint button", async () => {
    vi.mocked(apiFetch).mockResolvedValue([
      {
        id: "evt-1",
        do_number: "DO-9001",
        picked_up_at: "2026-05-15T11:00:00Z",
        ack_role: "partner",
        thread_count: 2,
      },
      {
        id: "evt-2",
        do_number: "DO-9000",
        picked_up_at: "2026-05-14T10:00:00Z",
        ack_role: "logistics",
        thread_count: 1,
      },
    ]);

    render(wrap(<PickupHistoryList poId="PO-9999" />));

    await waitFor(() => {
      expect(screen.getByText("DO-9001")).toBeInTheDocument();
    });
    expect(screen.getByText("DO-9000")).toBeInTheDocument();
    // 2 threads → plural; 1 thread → singular
    expect(screen.getByText(/partner · 2 threads/)).toBeInTheDocument();
    expect(screen.getByText(/logistics · 1 thread$/)).toBeInTheDocument();
    // Reprint buttons one per row
    expect(screen.getByTestId("reprint-do-evt-1")).toBeInTheDocument();
    expect(screen.getByTestId("reprint-do-evt-2")).toBeInTheDocument();
  });

  it("renders empty hint when PO has no pickups yet", async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);

    render(wrap(<PickupHistoryList poId="PO-EMPTY" />));

    await waitFor(() => {
      expect(screen.getByText(/No pickups yet/i)).toBeInTheDocument();
    });
  });

  it("opens /print/pickup-event/:id in new tab when reprint clicked", async () => {
    vi.mocked(apiFetch).mockResolvedValue([
      {
        id: "evt-abc",
        do_number: "DO-7777",
        picked_up_at: "2026-05-15T11:00:00Z",
        ack_role: "partner",
        thread_count: 1,
      },
    ]);
    const openSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => null as unknown as Window);

    render(wrap(<PickupHistoryList poId="PO-9999" />));

    await waitFor(() => {
      expect(screen.getByText("DO-7777")).toBeInTheDocument();
    });
    screen.getByTestId("reprint-do-evt-abc").click();
    expect(openSpy).toHaveBeenCalledWith(
      "/print/pickup-event/evt-abc",
      "_blank",
    );
    openSpy.mockRestore();
  });
});
