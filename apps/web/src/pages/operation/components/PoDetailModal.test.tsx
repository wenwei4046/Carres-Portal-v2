import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PoDetailModal from "./PoDetailModal";
import type { CatalogResponse } from "@carres/shared";
import type { operationPoListRow, SupplierRow } from "@/lib/queries";

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
let sourceOrdersHookState: {
  data: { orders: { dl: number; deliveryDate: string | null }[] } | undefined;
};

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useCatalog: () => catalogHookState,
    useOperationPoSourceOrders: () => sourceOrdersHookState,
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

function makePo(overrides: Partial<operationPoListRow> = {}): operationPoListRow {
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
      { id: "00000000-0000-0000-0000-aa0000000061", sku: "mattress:carres-cloud:King", qty: 5, received_qty: 0 },
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
          cost: null,
          supplierId: null,
        },
      ],
      sofaFabrics: [],
      addons: [],
      floorConfig: { id: 1, freeUpToFloor: 2, perFloorPerItem: 50 },
    },
  };
  // Default — modal renders without per-SO ETAs; existing tests don't care.
  sourceOrdersHookState = { data: undefined };
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
              { id: "00000000-0000-0000-0000-aa0000000129", sku: "mattress:carres-cloud:King", qty: 5, received_qty: 5 },
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

// Loo 2026-05-16 — per-source-order ETA list under Order refs.
describe("PoDetailModal — per-SO ETA", () => {
  it("renders each dl_ref with its own delivery date", () => {
    sourceOrdersHookState = {
      data: {
        orders: [
          { dl: 1001, deliveryDate: "2026-05-31" },
          { dl: 1002, deliveryDate: "2026-06-04" },
          { dl: 1003, deliveryDate: "2026-06-04" },
          { dl: 1004, deliveryDate: "2026-06-04" },
        ],
      },
    };
    render(
      wrap(
        <PoDetailModal
          po={makePo({ dl: null, dl_refs: [1001, 1002, 1003, 1004] })}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE}
          onClose={() => {}}
        />,
      ),
    );
    const r1 = screen.getByTestId("po-detail-order-ref-1001");
    const r2 = screen.getByTestId("po-detail-order-ref-1002");
    expect(r1.textContent).toContain("#1001");
    expect(r1.textContent).toContain("2026-05-31");
    expect(r2.textContent).toContain("#1002");
    expect(r2.textContent).toContain("2026-06-04");
  });

  it("falls back to bare #dl when source-orders fetch is pending", () => {
    sourceOrdersHookState = { data: undefined };
    render(
      wrap(
        <PoDetailModal
          po={makePo({ dl: null, dl_refs: [1001, 1002] })}
          supplier={SUPPLIER}
          warehouse={WAREHOUSE}
          onClose={() => {}}
        />,
      ),
    );
    const r1 = screen.getByTestId("po-detail-order-ref-1001");
    expect(r1.textContent).toContain("#1001");
    expect(r1.textContent).not.toContain("·");
  });
});
