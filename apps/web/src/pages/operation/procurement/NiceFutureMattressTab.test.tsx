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
  });

  /**
   * 2026-08-08 — THE TWO ASSERTIONS THAT USED TO LIVE ABOVE ARE NOW THIS ONE,
   * INVERTED, BECAUSE A RULING REMOVED THE COLUMNS THEY READ.
   *
   * They asserted `Nice Future Bedding` and `KL Warehouse` render on the row.
   * **Loo's row redesign (C+D, 2026-05-18) dropped both columns on purpose**,
   * and `ProcurementTabContent.tsx:259-266` still carries the reason in its
   * own words: the Supplier column is *"redundant per supplier tab"* — this
   * whole tab IS Nice Future — and the Warehouse column is *"only 1 WH
   * currently, zero info."* The five columns are now `PO # · Items · Orders ·
   * Status · Action`.
   *
   * The maps did not go away; they moved. `supplierById` / `warehouseById`
   * still resolve, and their names still render — inside `AssignPickupDialog`
   * and `PoDetailModal`, neither of which this test opens.
   *
   * So the assertion is inverted rather than deleted. A deleted assertion
   * lets the column quietly come back; this one fails the day it does, and
   * names the ruling that would have to be reopened first.
   */
  it("does NOT put the supplier or the warehouse on the row — C+D dropped both columns", () => {
    render(wrap(<NiceFutureMattressTab />));
    const row = screen.getByTestId("po-row-PO-NF-001");
    expect(row.textContent).not.toContain("Nice Future Bedding");
    expect(row.textContent).not.toContain("KL Warehouse");
  });
});
