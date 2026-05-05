import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import HoOKkASofaTab from "./HoOKkASofaTab";
import type {
  LogisticsPosListResponse,
  LogisticsPoListRow,
} from "@/lib/queries";

/**
 * HoOKkASofaTab — Phase 4.5 Chunk 2 Sprint F Task 34.
 *
 * Verifies the wrapper passes slug='hookka-sofa' through to the underlying
 * hook + renders the seeded sofa PO. Same shape as NiceFutureMattressTab.test
 * — slug correctness is the load-bearing assertion since T33's route filters
 * on it server-side.
 */
const useProcurementTabSpy = vi.fn();

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useProcurementTab: (slug: string) => {
      useProcurementTabSpy(slug);
      const data: LogisticsPosListResponse = {
        pos: [
          {
            id: "PO-SOFA-001",
            supplier_id: "11111111-1111-1111-1111-000000000002",
            warehouse_id: "22222222-2222-2222-2222-000000000001",
            status: "open",
            sup_status: "ready_confirm_sent",
            dl: 9100,
            dl_refs: null,
            eta_date: "2026-06-15",
            placed_at: "2026-05-02T00:00:00Z",
            purchase_order_lines: [
              { sku: "sofa:nordic:3s", qty: 1, received_qty: 0 },
            ],
          } satisfies LogisticsPoListRow,
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
    useLogisticsSuppliers: () => ({
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
    useLogisticsWarehouse: () => ({
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
            id: "s2",
            modelId: "m2",
            sku: "sofa:nordic:3s",
            variant: "Nordic Sofa · 3 seater",
            variantKind: "preset",
            price: 4500,
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
      <MemoryRouter initialEntries={["/logistics/procurement/hookka-sofa"]}>
        {node}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("HoOKkASofaTab", () => {
  it("calls useProcurementTab with slug='hookka-sofa' and renders fetched sofa POs", () => {
    render(wrap(<HoOKkASofaTab />));
    expect(useProcurementTabSpy).toHaveBeenCalledWith("hookka-sofa");
    expect(screen.getByTestId("po-row-PO-SOFA-001")).toBeInTheDocument();
    expect(screen.getByText("Nordic Sofa · 3 seater")).toBeInTheDocument();
    // Sofa channel sup_status='ready_confirm_sent' triggers the LP Pre-flight
    // 代按 button, distinct from the Receive default — verifies the per-row
    // ActionCell branched on the sofa-specific state.
    expect(
      screen.getByTestId("lp-inbound-confirm-PO-SOFA-001"),
    ).toBeInTheDocument();
  });
});
