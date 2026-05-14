import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import PODrawerThreadList from "./PODrawerThreadList";

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

// Two threads — one not-yet-ready, one already ready. Pre-pickup so both
// checkboxes remain interactive (pickup_event_id null).
const THREADS = [
  {
    id: "t1",
    order_id: "o1",
    order_dl: 1001,
    customer_name: "Tan",
    customer_delivery_date: "2026-05-20",
    supplier_ready_at: null,
    pickup_event_id: null,
    sku_lines: [{ sku: "mattress:King", qty: 2 }],
  },
  {
    id: "t2",
    order_id: "o2",
    order_dl: 1002,
    customer_name: "Lim",
    customer_delivery_date: "2026-05-28",
    supplier_ready_at: "2026-05-15T10:00:00Z",
    pickup_event_id: null,
    sku_lines: [{ sku: "mattress:Queen", qty: 1 }],
  },
];

describe("PODrawerThreadList", () => {
  it("renders one row per thread with state pill", async () => {
    vi.mocked(apiFetch).mockResolvedValue(THREADS);

    render(wrap(<PODrawerThreadList poId="PO-9999" />));

    await waitFor(() => {
      expect(screen.getByText("DL-1001")).toBeInTheDocument();
    });
    expect(screen.getByText("DL-1002")).toBeInTheDocument();
    // t1 → not ready, not picked → 🛠 Producing pill
    expect(screen.getByText(/Producing/)).toBeInTheDocument();
    // t2 → ready, not picked → ✅ Ready pill
    expect(screen.getByText(/Ready/)).toBeInTheDocument();
    // SKU lines render
    expect(screen.getByText(/mattress:King × 2/)).toBeInTheDocument();
    // Customer ETA per row
    expect(screen.getByText(/2026-05-20/)).toBeInTheDocument();
    expect(screen.getByText(/2026-05-28/)).toBeInTheDocument();
  });

  it("renders empty hint when PO has no threads (stockpile PO)", async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);

    render(wrap(<PODrawerThreadList poId="PO-EMPTY" />));

    await waitFor(() => {
      expect(
        screen.getByText(/No linked sales orders/i),
      ).toBeInTheDocument();
    });
  });

  it("calls mark-ready endpoint when un-checked checkbox clicked", async () => {
    vi.mocked(apiFetch).mockImplementation(
      async (url: string, init?: RequestInit) => {
        if (
          url.includes("/threads")
          && !url.includes("/ready")
          && (init?.method === undefined || init?.method === "GET")
        ) {
          return THREADS;
        }
        if (url.includes("/ready") && init?.method === "POST") {
          return {
            thread_id: "t1",
            supplier_ready_at: "2026-05-15T11:00:00Z",
            po_sup_status: "ready_for_pickup",
          };
        }
        throw new Error(`unexpected ${url}`);
      },
    );

    render(wrap(<PODrawerThreadList poId="PO-9999" />));

    await waitFor(() => {
      expect(screen.getByText("DL-1001")).toBeInTheDocument();
    });

    // First row (t1) is not-ready → click marks ready.
    const checkbox = screen.getByTestId("thread-checkbox-t1");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        "/api/supplier/threads/t1/ready",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("calls unmark-ready endpoint when checked checkbox clicked", async () => {
    vi.mocked(apiFetch).mockImplementation(
      async (url: string, init?: RequestInit) => {
        if (
          url.includes("/threads")
          && !url.includes("/ready")
          && (init?.method === undefined || init?.method === "GET")
        ) {
          return THREADS;
        }
        if (url.includes("/ready") && init?.method === "DELETE") {
          return { thread_id: "t2", po_sup_status: "in_production" };
        }
        throw new Error(`unexpected ${url}`);
      },
    );

    render(wrap(<PODrawerThreadList poId="PO-9999" />));

    await waitFor(() => {
      expect(screen.getByText("DL-1002")).toBeInTheDocument();
    });

    // Second row (t2) is ready → click un-marks.
    const checkbox = screen.getByTestId("thread-checkbox-t2");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        "/api/supplier/threads/t2/ready",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("disables checkbox when thread is already picked up", async () => {
    const PICKED = [
      {
        ...THREADS[0],
        supplier_ready_at: "2026-05-15T10:00:00Z",
        pickup_event_id: "pe-1",
      },
    ];
    vi.mocked(apiFetch).mockResolvedValue(PICKED);

    render(wrap(<PODrawerThreadList poId="PO-9999" />));

    await waitFor(() => {
      expect(screen.getByText("DL-1001")).toBeInTheDocument();
    });

    const checkbox = screen.getByTestId(
      "thread-checkbox-t1",
    ) as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
    // Picked state pill renders 🚚 Picked.
    expect(screen.getByText(/Picked/)).toBeInTheDocument();
  });
});
