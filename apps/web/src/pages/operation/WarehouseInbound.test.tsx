import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import WarehouseInbound from "./WarehouseInbound";

/**
 * WAREHOUSE — INBOUND (2026-09-06 replacement Card §5): a 240px rail +
 * Inbound Register of expected arrivals. It ROUTES to the governed
 * Receiving Session and posts nothing itself; status words are the
 * existing governed vocabulary, derived per row; no Calendar renders here.
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

vi.mock("@/lib/fmt-date", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fmt-date")>("@/lib/fmt-date");
  return { ...actual, appTodayIso: () => "2026-09-03" };
});

function po(
  id: string,
  overrides: Partial<{
    eta_date: string | null;
    lines: Array<{ id: string; sku: string; qty: number; received_qty: number }>;
    warehouse_id: string;
  }> = {},
) {
  return {
    id,
    supplier_id: "sup-1",
    warehouse_id: overrides.warehouse_id ?? "wh-1",
    status: "open",
    sup_status: "confirmed",
    so: null,
    so_refs: null,
    eta_date: overrides.eta_date === undefined ? "2026-09-04" : overrides.eta_date,
    placed_at: "2026-08-20",
    purchase_order_lines:
      overrides.lines ?? [{ id: `${id}-l1`, sku: "MAT-1", qty: 3, received_qty: 0 }],
  };
}

function stubApi({
  pos = [po("PO-2646-0107")],
  receipts = [] as unknown[],
} = {}) {
  apiFetchMock.mockImplementation((url: string) => {
    if (String(url).includes("/api/operation/pos")) return Promise.resolve({ pos });
    if (String(url).includes("/api/operation/suppliers"))
      return Promise.resolve({ suppliers: [{ id: "sup-1", name: "Nice Future" }] });
    if (String(url).includes("/api/operation/warehouse-receipts"))
      return Promise.resolve({ receipts });
    if (String(url).includes("/api/operation/warehouse"))
      return Promise.resolve({ warehouses: [{ id: "wh-1", name: "Carres Klang Warehouse" }] });
    return Promise.resolve({});
  });
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function mount(initialUrl = "/operation?tab=warehouse-inbound") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route
            path="/operation"
            element={
              <>
                <WarehouseInbound />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("Warehouse Inbound — expected arrivals Register", () => {
  it("lists an open PO owing goods with the governed columns, and no Calendar", async () => {
    stubApi();
    mount();
    await waitFor(() => expect(screen.getByText("PO-2646-0107")).toBeInTheDocument());
    expect(screen.getByTestId("warehouse-inbound-header")).toHaveTextContent("Inbound");
    expect(screen.getByText("Nice Future")).toBeInTheDocument();
    expect(screen.getAllByText("Waiting goods arrival").length).toBeGreaterThan(0);
    // The governed quantity words, each its own column.
    for (const w of ["Order Qty", "Received Qty", "Pending Delivery Qty"]) {
      expect(screen.getByText(w)).toBeInTheDocument();
    }
    // No six-day Calendar board renders on Inbound.
    expect(screen.queryByTestId("wm-board")).toBeNull();
  });

  it("a settled PO projects no row — nothing is owed", async () => {
    stubApi({
      pos: [
        po("PO-2646-0107", {
          lines: [{ id: "l1", sku: "MAT-1", qty: 3, received_qty: 3 }],
        }),
      ],
    });
    mount();
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(screen.queryByText("PO-2646-0107")).toBeNull();
  });

  it("derives `Overdue goods arrival` and `Waiting Carres check` from the stored facts", async () => {
    stubApi({
      pos: [
        po("PO-LATE", { eta_date: "2026-09-01" }),
        po("PO-COUNTED", { eta_date: "2026-09-01" }),
      ],
      receipts: [{ id: "sess-1", po_id: "PO-COUNTED", status: "submitted", lines: [] }],
    });
    mount();
    await waitFor(() => expect(screen.getByText("PO-LATE")).toBeInTheDocument());
    expect(screen.getAllByText("Overdue goods arrival").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Waiting Carres check").length).toBeGreaterThan(0);
    const rail = screen.getByTestId("wi-rail");
    expect(within(rail).getByText("ARRIVAL STATUS")).toBeInTheDocument();
  });

  it("a row ROUTES to the governed Receiving surface — the PO pre-start when no count waits", async () => {
    stubApi();
    mount();
    const cell = await screen.findByText("PO-2646-0107");
    fireEvent.click(cell);
    expect(screen.getByTestId("location")).toHaveTextContent("tab=receiving");
    expect(screen.getByTestId("location")).toHaveTextContent("po=PO-2646-0107");
  });

  it("a waiting count routes to its own session review", async () => {
    stubApi({
      pos: [po("PO-COUNTED")],
      receipts: [{ id: "sess-1", po_id: "PO-COUNTED", status: "submitted", lines: [] }],
    });
    mount();
    const cell = await screen.findByText("PO-COUNTED");
    fireEvent.click(cell);
    expect(screen.getByTestId("location")).toHaveTextContent("tab=receiving");
    expect(screen.getByTestId("location")).toHaveTextContent("session=sess-1");
  });

  it("a Monitor deep link arrives already filtered, and the scope chip clears it", async () => {
    stubApi({
      pos: [po("PO-2646-0107"), po("PO-OTHER", { eta_date: "2026-09-08" })],
    });
    mount("/operation?tab=warehouse-inbound&date=2026-09-04&po=PO-2646-0107");
    await waitFor(() => expect(screen.getByText("PO-2646-0107")).toBeInTheDocument());
    expect(screen.queryByText("PO-OTHER")).toBeNull();
    fireEvent.click(screen.getByTestId("wi-clear-scope"));
    await waitFor(() => expect(screen.getByText("PO-OTHER")).toBeInTheDocument());
  });
});
