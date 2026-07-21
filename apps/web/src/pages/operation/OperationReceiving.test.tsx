import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OperationReceiving from "./OperationReceiving";

/**
 * OperationReceiving — the GRN 待收 queue (P3). Mocks apiFetch so the three
 * underlying hooks (pos / suppliers / warehouse) return fixtures; asserts the
 * status tabs, counts, and per-row Receive affordance.
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

const SUPPLIERS = [
  { id: "sup-nf", name: "Nice Future", kind: "factory_pickup" },
  { id: "sup-oh", name: "Ohana", kind: "factory_pickup" },
];
const WAREHOUSES = [{ id: "wh-klang", name: "Carres Klang", address: "Klang" }];

function po(p: {
  id: string;
  supplier_id: string;
  status: "open" | "received" | "cancelled";
  sup_status: string;
  lines: { id: string; sku: string; qty: number; received_qty: number }[];
  warehouse_id?: string;
}) {
  return {
    id: p.id,
    supplier_id: p.supplier_id,
    warehouse_id: p.warehouse_id ?? "wh-klang",
    status: p.status,
    sup_status: p.sup_status,
    so: 1001,
    so_refs: null,
    eta_date: "2026-06-20",
    placed_at: "2026-06-01T00:00:00Z",
    purchase_order_lines: p.lines,
  };
}

const POS = [
  po({ id: "PO-2001", supplier_id: "sup-nf", status: "open", sup_status: "ready_for_pickup", lines: [{ id: "l1", sku: "MS01", qty: 5, received_qty: 0 }] }),
  po({ id: "PO-2002", supplier_id: "sup-oh", status: "open", sup_status: "in_production", lines: [{ id: "l2", sku: "SF02", qty: 2, received_qty: 0 }] }),
  po({ id: "PO-2003", supplier_id: "sup-nf", status: "received", sup_status: "delivered", lines: [{ id: "l3", sku: "BF01", qty: 3, received_qty: 3 }] }),
  po({ id: "PO-2004", supplier_id: "sup-oh", status: "cancelled", sup_status: "cancelled", lines: [{ id: "l4", sku: "SF03", qty: 1, received_qty: 0 }] }),
];

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // The page now renders the shared PurchasingTabs bar (uses router hooks), so
  // it must mount inside a Router.
  return render(
    <MemoryRouter initialEntries={["/operation?tab=receiving"]}>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>,
  );
}

/** The page's own status tabs (To receive / Received / All) — scoped away from
 *  the module-level PurchasingTabs bar, which is also a tablist. */
async function statusTabs() {
  const list = await screen.findByRole("tablist", { name: "Receiving status" });
  return within(list).getAllByRole("tab");
}

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((path: string) => {
    if (typeof path === "string" && path.includes("/api/operation/suppliers"))
      return Promise.resolve({ suppliers: SUPPLIERS });
    if (typeof path === "string" && path.includes("/api/operation/warehouse"))
      return Promise.resolve({ warehouses: WAREHOUSES });
    if (typeof path === "string" && path.includes("/api/operation/pos"))
      return Promise.resolve({ pos: POS });
    return Promise.resolve({});
  });
});

describe("OperationReceiving", () => {
  it("renders 3 status tabs with counts (cancelled excluded)", async () => {
    wrap(<OperationReceiving />);
    const tabs = await statusTabs();
    expect(tabs).toHaveLength(3);
    // To receive = 2 open, Received = 1, All = 3 (cancelled PO-2004 excluded).
    await waitFor(() => {
      expect(within(tabs[0]).getByText("2")).toBeInTheDocument();
    });
    expect(within(tabs[1]).getByText("1")).toBeInTheDocument();
    expect(within(tabs[2]).getByText("3")).toBeInTheDocument();
  });

  it("defaults to 'To receive' and shows a Receive button per open PO", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() => {
      expect(screen.getByText("PO-2001")).toBeInTheDocument();
    });
    expect(screen.getByText("PO-2002")).toBeInTheDocument();
    expect(screen.getByTestId("receive-PO-2001")).toBeInTheDocument();
    // received + cancelled POs are not in the default queue
    expect(screen.queryByText("PO-2003")).not.toBeInTheDocument();
    expect(screen.queryByText("PO-2004")).not.toBeInTheDocument();
  });

  it("'Received' tab shows received POs as Done (no Receive button)", async () => {
    wrap(<OperationReceiving />);
    const tabs = await statusTabs();
    fireEvent.click(tabs[1]); // Received
    await waitFor(() => {
      expect(screen.getByText("PO-2003")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("receive-PO-2003")).not.toBeInTheDocument();
    expect(screen.queryByText("PO-2001")).not.toBeInTheDocument();
  });

  it("search filters by PO id", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() => expect(screen.getByText("PO-2001")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("PO number or supplier…"), {
      target: { value: "2002" },
    });
    await waitFor(() =>
      expect(screen.queryByText("PO-2001")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("PO-2002")).toBeInTheDocument();
  });

  it("shows the supplier name resolved from the suppliers list", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() => {
      expect(screen.getAllByText("Nice Future").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Ohana")).toBeInTheDocument();
  });

  it("P4 — excludes POs bound for an LP-owned warehouse once one exists (GRN = own WH only)", async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/api/operation/suppliers"))
        return Promise.resolve({ suppliers: SUPPLIERS });
      if (typeof path === "string" && path.includes("/api/operation/warehouse"))
        return Promise.resolve({
          warehouses: [
            { id: "wh-klang", name: "Carres Klang", address: "Klang", owning_partner_id: null },
            { id: "wh-balakong", name: "HOUZS Balakong", address: "Balakong", owning_partner_id: "lp-houzs" },
          ],
        });
      if (typeof path === "string" && path.includes("/api/operation/pos"))
        return Promise.resolve({
          pos: [
            po({ id: "PO-3001", supplier_id: "sup-nf", status: "open", sup_status: "ready_for_pickup", warehouse_id: "wh-klang", lines: [{ id: "k1", sku: "MS01", qty: 2, received_qty: 0 }] }),
            po({ id: "PO-3002", supplier_id: "sup-oh", status: "open", sup_status: "in_production", warehouse_id: "wh-balakong", lines: [{ id: "k2", sku: "SF02", qty: 1, received_qty: 0 }] }),
          ],
        });
      return Promise.resolve({});
    });
    wrap(<OperationReceiving />);
    // PO-3001 → Carres Klang (own WH) shows; PO-3002 → HOUZS Balakong (LP) excluded.
    await waitFor(() => expect(screen.getByText("PO-3001")).toBeInTheDocument());
    expect(screen.queryByText("PO-3002")).not.toBeInTheDocument();
  });
});
