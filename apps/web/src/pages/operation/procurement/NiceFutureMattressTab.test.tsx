import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import NiceFutureMattressTab from "./NiceFutureMattressTab";
import type {
  operationPosListResponse,
  operationPoListRow,
} from "@/lib/queries";

/**
 * NiceFutureMattressTab — Phase 4.5 Chunk 2 Sprint F Task 34.
 *
 * The tab is a thin wrapper around `ProcurementTabContent` keyed to
 * 'nice-future'. We verify it renders fetched POs as rows AND that the
 * underlying hook is called with that slug — slug correctness matters because
 * the Hono route at T33 owns the per-channel filtering.
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
            id: "PO-NF-001",
            supplier_id: "11111111-1111-1111-1111-000000000001",
            warehouse_id: "22222222-2222-2222-2222-000000000001",
            status: "open",
            sup_status: "in_production",
            so: 9001,
            so_refs: null,
            eta_date: "2026-06-01",
            placed_at: "2026-05-01T00:00:00Z",
            purchase_order_lines: [
              { id: "00000000-0000-0000-0000-aa0000000041", sku: "mattress:carres-cloud:King", qty: 5, received_qty: 0 },
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
            id: "11111111-1111-1111-1111-000000000001",
            name: "Nice Future Bedding",
            kind: "own_logistics",
            cat_covered: ["mattress"],
            lead_time: "5–7 days",
            contact: "+60 3-1111 1111",
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
            id: "s1",
            modelId: "m1",
            sku: "mattress:carres-cloud:King",
            variant: "Carres Cloud · King",
            variantKind: "size",
            price: 3500,
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
      <MemoryRouter initialEntries={["/operation/procurement/nice-future"]}>
        {node}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("NiceFutureMattressTab", () => {
  it("calls useProcurementTab with slug='nice-future' and renders fetched POs", () => {
    render(wrap(<NiceFutureMattressTab />));
    // The hook spy fires on mount with the wrapper's slug — failing this
    // assertion would mean the wrapper picked the wrong slug, and the Hono
    // route would return the wrong tab's data.
    expect(useProcurementTabSpy).toHaveBeenCalledWith("nice-future");
    // The seeded PO row mounts under its testid, with the friendly SKU label
    // resolved through the catalog map.
    expect(screen.getByTestId("po-row-PO-NF-001")).toBeInTheDocument();
    expect(screen.getByText("Carres Cloud · King")).toBeInTheDocument();
    // Supplier name resolves via the supplier-by-id map.
    expect(screen.getByText("Nice Future Bedding")).toBeInTheDocument();
    // Warehouse name resolves via the warehouse-by-id map.
    expect(screen.getByText("KL Warehouse")).toBeInTheDocument();
  });
});
