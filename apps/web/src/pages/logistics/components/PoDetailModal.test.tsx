import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PoDetailModal from "./PoDetailModal";
import type { CatalogResponse } from "@carres/shared";
import type { LogisticsPoListRow, SupplierRow } from "@/lib/queries";

/**
 * PoDetailModal — read-only detail modal + Receive entry button (v3-S2.3).
 *
 * The Receive button gates on the same eligibility rule as the action column
 * after v3-S2.2 — display status NOT in {received, cancelled} AND sup_status
 * NOT in {ready_for_pickup, pickup_assigned, pickup_accepted, picked_up}. The
 * button only renders when an `onReceive` callback is provided; rendering
 * without `onReceive` (defensive) hides the entire button.
 */

let catalogHookState: { data: CatalogResponse | undefined };

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useCatalog: () => catalogHookState,
  };
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const SUPPLIER: SupplierRow = {
  id: "11111111-1111-1111-1111-000000000001",
  name: "Carres Manufacturing",
  kind: "own_logistics",
  cat_covered: ["mattress"],
  lead_time: "5–7 days",
  contact: "+60 3-1111 1111",
};

const WAREHOUSE = {
  id: "22222222-2222-2222-2222-000000000001",
  name: "KL Warehouse",
  address: "Subang Jaya",
};

function makePo(overrides: Partial<LogisticsPoListRow> = {}): LogisticsPoListRow {
  return {
    id: "PO-9001",
    supplier_id: SUPPLIER.id,
    warehouse_id: WAREHOUSE.id,
    status: "open",
    sup_status: "pending",
    dl: 1234,
    dl_refs: null,
    eta_date: "2026-05-15",
    placed_at: "2026-05-01T00:00:00Z",
    purchase_order_lines: [
      { sku: "mattress:carres-cloud:King", qty: 5, received_qty: 0 },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  catalogHookState = {
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
  };
});

describe("PoDetailModal — Receive entry button (v3-S2.3)", () => {
  it("shows Receive button when onReceive provided and PO is open", () => {
    render(
      wrap(
        <PoDetailModal
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE}
          onClose={() => {}}
          onReceive={vi.fn()}
        />,
      ),
    );
    expect(
      screen.getByTestId("po-detail-receive-button"),
    ).toBeInTheDocument();
  });

  it("hides Receive button when onReceive prop is missing", () => {
    render(
      wrap(
        <PoDetailModal
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE}
          onClose={() => {}}
        />,
      ),
    );
    expect(
      screen.queryByTestId("po-detail-receive-button"),
    ).not.toBeInTheDocument();
  });

  it("hides Receive button when PO display status is received (lines fully received)", () => {
    render(
      wrap(
        <PoDetailModal
          po={makePo({
            purchase_order_lines: [
              { sku: "mattress:carres-cloud:King", qty: 5, received_qty: 5 },
            ],
          })}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE}
          onClose={() => {}}
          onReceive={vi.fn()}
        />,
      ),
    );
    expect(
      screen.queryByTestId("po-detail-receive-button"),
    ).not.toBeInTheDocument();
  });

  it("hides Receive button when PO is cancelled", () => {
    render(
      wrap(
        <PoDetailModal
          po={makePo({ status: "cancelled" })}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE}
          onClose={() => {}}
          onReceive={vi.fn()}
        />,
      ),
    );
    expect(
      screen.queryByTestId("po-detail-receive-button"),
    ).not.toBeInTheDocument();
  });

  it("hides Receive button when sup_status is ready_for_pickup", () => {
    render(
      wrap(
        <PoDetailModal
          po={makePo({ sup_status: "ready_for_pickup" })}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE}
          onClose={() => {}}
          onReceive={vi.fn()}
        />,
      ),
    );
    expect(
      screen.queryByTestId("po-detail-receive-button"),
    ).not.toBeInTheDocument();
  });

  it("hides Receive button when sup_status is pickup_assigned", () => {
    render(
      wrap(
        <PoDetailModal
          po={makePo({ sup_status: "pickup_assigned" })}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE}
          onClose={() => {}}
          onReceive={vi.fn()}
        />,
      ),
    );
    expect(
      screen.queryByTestId("po-detail-receive-button"),
    ).not.toBeInTheDocument();
  });

  it("hides Receive button when sup_status is pickup_accepted", () => {
    render(
      wrap(
        <PoDetailModal
          po={makePo({ sup_status: "pickup_accepted" })}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE}
          onClose={() => {}}
          onReceive={vi.fn()}
        />,
      ),
    );
    expect(
      screen.queryByTestId("po-detail-receive-button"),
    ).not.toBeInTheDocument();
  });

  it("hides Receive button when sup_status is picked_up", () => {
    render(
      wrap(
        <PoDetailModal
          po={makePo({ sup_status: "picked_up" })}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE}
          onClose={() => {}}
          onReceive={vi.fn()}
        />,
      ),
    );
    expect(
      screen.queryByTestId("po-detail-receive-button"),
    ).not.toBeInTheDocument();
  });

  it("calls onReceive callback when clicked", () => {
    const onReceive = vi.fn();
    render(
      wrap(
        <PoDetailModal
          po={makePo()}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE}
          onClose={() => {}}
          onReceive={onReceive}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("po-detail-receive-button"));
    expect(onReceive).toHaveBeenCalledTimes(1);
  });
});
