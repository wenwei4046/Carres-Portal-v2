import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReassignWarehouseDialog from "./ReassignWarehouseDialog";
import type {
  operationPoListRow,
  WarehouseListResponse,
  SupplierRow,
} from "@/lib/queries";

/**
 * ReassignWarehouseDialog — DEAD UI per Loo D3=A. The component still has
 * tests because Phase 7 will wire the trigger button to it; the dialog itself
 * must work end-to-end before that wire-up. Three tests cover the happy path,
 * empty-alternates state, and submit→mutation.
 *
 * See ReassignWarehouseDialog.tsx header for the full rationale.
 */

let warehouseHookState: { data: WarehouseListResponse | undefined };
const reassignMutateAsync = vi.fn().mockResolvedValue({});

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationWarehouse: () => warehouseHookState,
    useReassignPoWarehouseMutation: () => ({
      mutateAsync: reassignMutateAsync,
      isPending: false,
    }),
  };
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const WAREHOUSE_KL = {
  id: "22222222-2222-2222-2222-000000000001",
  name: "KL Warehouse",
  address: "Subang Jaya",
};
const WAREHOUSE_PG = {
  id: "22222222-2222-2222-2222-000000000002",
  name: "Penang Warehouse",
  address: "George Town",
};

const SUPPLIER: SupplierRow = {
  id: "supp-1",
  name: "Sofa Factory Co",
  kind: "factory_pickup",
  cat_covered: ["sofa"],
  lead_time: "10–14 days",
  contact: "+60 3-2222 2222",
  whatsapp_group_url: null,
};

function makePo(overrides: Partial<operationPoListRow> = {}): operationPoListRow {
  return {
    id: "PO-2090",
    supplier_id: SUPPLIER.id,
    warehouse_id: WAREHOUSE_KL.id,
    status: "open",
    sup_status: "reassign_needed",
    so: 1234,
    so_refs: null,
    eta_date: null,
    placed_at: "2026-05-01T00:00:00Z",
    purchase_order_lines: [{ id: "00000000-0000-0000-0000-aa0000000072", sku: "sofa:nordic:3s", qty: 2, received_qty: 0 }],
    ...overrides,
  };
}

beforeEach(() => {
  reassignMutateAsync.mockClear();
  warehouseHookState = {
    data: {
      warehouses: [WAREHOUSE_KL, WAREHOUSE_PG],
      byWarehouse: {},
      totalsBySku: {},
    },
  };
});

describe("ReassignWarehouseDialog (Phase 7 wire pending)", () => {
  it("renders the goods-staged-at-supplier card + alternate warehouse picker", () => {
    render(
      wrap(
        <ReassignWarehouseDialog
          po={makePo()}
          supplier={SUPPLIER}
          onClose={() => {}}
        />,
      ),
    );
    expect(
      screen.getByText(/Reassign warehouse · PO-2090/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Customer cannot receive/)).toBeInTheDocument();
    expect(screen.getByText(/Goods staged at supplier/)).toBeInTheDocument();
    // Currently bound for KL → only PG is selectable
    expect(
      screen.queryByRole("option", { name: /KL Warehouse/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Penang Warehouse/ }),
    ).toBeInTheDocument();
  });

  it("disables the primary CTA when there is no alternate warehouse", () => {
    warehouseHookState = {
      data: { warehouses: [WAREHOUSE_KL], byWarehouse: {}, totalsBySku: {} },
    };
    render(
      wrap(
        <ReassignWarehouseDialog
          po={makePo()}
          supplier={SUPPLIER}
          onClose={() => {}}
        />,
      ),
    );
    expect(
      screen.getByText(/No alternate warehouse available/),
    ).toBeInTheDocument();
    const primary = screen.getByRole("button", {
      name: /Reassign \+ notify supplier/,
    });
    expect(primary).toBeDisabled();
  });

  it("submit fires useReassignPoWarehouseMutation with the new warehouse id", async () => {
    render(
      wrap(
        <ReassignWarehouseDialog
          po={makePo()}
          supplier={SUPPLIER}
          onClose={() => {}}
        />,
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Reassign \+ notify supplier/ }),
    );
    await waitFor(() => {
      expect(reassignMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(reassignMutateAsync.mock.calls[0][0]).toEqual({
      newWarehouseId: WAREHOUSE_PG.id,
    });
  });
});
