import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import HoOKkABedFrameTab from "./HoOKkABedFrameTab";
import type {
  operationPosListResponse,
  operationPoListRow,
} from "@/lib/queries";

/**
 * HoOKkABedFrameTab — Phase 4.5 Chunk 2 Sprint F Task 34.
 *
 * Verifies the wrapper passes slug='hookka-bedframe' through to the hook +
 * renders the seeded bedframe PO. Bedframe is the 'STANDARD' SOP (not sofa-
 * special), so the action button should resolve to the catch-all "Receive →".
 */
const useProcurementTabSpy = vi.fn();

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useProcurementTab: (slug: string) => {
      useProcurementTabSpy(slug);
      const data: operationPosListResponse = {
        pos: [
          {
            id: "PO-BF-001",
            supplier_id: "11111111-1111-1111-1111-000000000002",
            warehouse_id: "22222222-2222-2222-2222-000000000001",
            status: "open",
            sup_status: "in_production",
            so: 9200,
            so_refs: null,
            eta_date: "2026-06-20",
            placed_at: "2026-05-03T00:00:00Z",
            purchase_order_lines: [
              { id: "00000000-0000-0000-0000-aa0000000040", sku: "bedframe:oak:queen", qty: 2, received_qty: 0 },
            ],
          } satisfies operationPoListRow,
        ],
      };
      return {
        data,
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      };
    },
    useOperationSuppliers: () => ({
      data: {
        suppliers: [
          {
            id: "11111111-1111-1111-1111-000000000002",
            name: "HoOKkA Furniture",
            kind: "factory_pickup",
            cat_covered: ["sofa", "bedframe"],
            lead_time: "10–14 days",
            contact: "+60 3-2222 2222",
          },
        ],
      },
    }),
    useOperationWarehouse: () => ({
      data: {
        warehouses: [
          {
            id: "22222222-2222-2222-2222-000000000001",
            name: "KL Warehouse",
            address: "Subang",
          },
        ],
        byWarehouse: {},
        totalsBySku: {},
      },
    }),
    useCatalog: () => ({
      data: {
        models: [],
        skus: [
          {
            id: "s3",
            modelId: "m3",
            sku: "bedframe:oak:queen",
            variant: "Oak Bedframe · Queen",
            variantKind: "size",
            price: 1800,
          },
        ],
        sofaFabrics: [],
        addons: [],
        floorConfig: { id: 1, freeUpToFloor: 2, perFloorPerItem: 50 },
      },
    }),
  };
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter
        initialEntries={["/operation/procurement/hookka-bedframe"]}
      >
        {node}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("HoOKkABedFrameTab", () => {
  it("calls useProcurementTab with slug='hookka-bedframe' and renders fetched bedframe POs", () => {
    render(wrap(<HoOKkABedFrameTab />));
    expect(useProcurementTabSpy).toHaveBeenCalledWith("hookka-bedframe");
    expect(screen.getByTestId("po-row-PO-BF-001")).toBeInTheDocument();
    expect(screen.getByText("Oak Bedframe · Queen")).toBeInTheDocument();
    // STANDARD SOP → 'in_production' falls through to the Receive catch-all,
    // not a pickup-flight branch.
    expect(screen.getByTestId("receive-po-PO-BF-001")).toBeInTheDocument();
  });
});
