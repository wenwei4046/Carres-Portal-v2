/**
 * OperationWork — SO V2 CARD 10 · My Work / Team Work.
 *
 * The page is assembly, so the tests pin what assembly can get wrong:
 *
 *  1. **Two filters, ONE set** — the same rows, scoped by owner; My Work is
 *     empty-with-a-sentence when the signed-in account is not in the pool.
 *  2. **The starting view is the §2.2 law** — a manager lands on Team Work,
 *     a non-manager on My Work; both can switch (a default, never a wall).
 *  3. **WHO + ACTION + actual working day** — the row prints the party-named
 *     line the Orders list prints, grouped under weekday+date headers.
 *  4. **The page writes nothing** — a row is a door to the order workspace.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type {
  operationOrderListRow,
  operationOrdersListResponse,
  operationStockResponse,
  DeliveryPartnersListResponse,
} from "@/lib/queries";
import type { OpsStaffListResponse } from "@carres/shared";

let listState: {
  data: operationOrdersListResponse | undefined;
  isLoading: boolean;
  refetch: ReturnType<typeof vi.fn>;
};
let partnersState: { data: DeliveryPartnersListResponse | undefined };
let stockState: { data: operationStockResponse | undefined };
let staffState: { data: OpsStaffListResponse | undefined; isLoading: boolean };
let settingsState: { data: undefined };
let authState: { role: string; email: string | null };

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationOrders: () => listState,
    useDeliveryPartners: () => partnersState,
    useOperationStock: () => stockState,
    useOperationStaff: () => staffState,
    usePurchasingSettings: () => settingsState,
  };
});

vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: { role: string; user: { email: string | null } }) => unknown) =>
    sel({ role: authState.role, user: { email: authState.email } }),
}));

const navigateSpy = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateSpy };
});

import OperationWork from "./OperationWork";

const TODAY = "2026-07-27"; // a Monday

const OP_UID = "00000000-0000-0000-0000-0000000000aa";
const OTHER_UID = "00000000-0000-0000-0000-0000000000bb";

function makeRow(
  partial: Partial<operationOrderListRow> & { id: string; so: number },
): operationOrderListRow {
  return {
    status: "proceed_order",
    operation_stage: "ready_to_dispatch",
    warehouse_id: null,
    customer_name: "Kong Chai Yin",
    customer_phone: null,
    customer_address: null,
    placed_at: "2026-07-01T00:00:00Z",
    delivery_date: "2026-08-05",
    delivery_date_tbd: false,
    source_system: null,
    source_ref: null,
    ops_assigned_logistic: null,
    order_lines: [],
    delivery_partner_id: null,
    request_for_delivery_at: null,
    partner_accepted_at: null,
    partner_rejected_at: null,
    partner_rejected_reason: null,
    delivery_partners: null,
    do_number: null,
    dispatched_at: null,
    delivered_at: null,
    outlet_id: null,
    dealer_id: "d-1",
    dealers: { name: "Carres KL" },
    order_supplier_threads: [],
    order_annotations: [],
    ops_order_control: [{ assigned_staff: OP_UID } as never],
    ...partial,
  };
}

const STAFF: OpsStaffListResponse = {
  staff: [
    {
      user_id: OP_UID,
      email: "sha@carres.co",
      name: "Shasha",
      pooled: true,
      available: true,
      note: null,
      last_seen_at: null,
      duties: [],
    },
    {
      user_id: OTHER_UID,
      email: "yj@carres.co",
      name: "Yu Jun",
      pooled: true,
      available: true,
      note: null,
      last_seen_at: null,
      duties: [],
    },
  ],
  myDuties: [],
};

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operation?tab=work"]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  navigateSpy.mockReset();
  listState = { data: { orders: [] }, isLoading: false, refetch: vi.fn() };
  partnersState = { data: { partners: [] } };
  stockState = { data: undefined };
  staffState = { data: STAFF, isLoading: false };
  settingsState = { data: undefined };
  authState = { role: "operation", email: "sha@carres.co" };
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T09:00:00`));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("OperationWork — two filters over the one open work set", () => {
  it("a non-manager lands on My Work and sees only their own items, grouped by weekday+date", () => {
    listState.data = {
      orders: [
        makeRow({ id: "a", so: 1201 }), // PIC = Shasha (me)
        makeRow({
          id: "b",
          so: 1202,
          ops_order_control: [{ assigned_staff: OTHER_UID } as never],
        }),
      ],
    };
    wrap(<OperationWork />);
    // My Work default: only SO-1201's items.
    expect(screen.getByTestId("work-row-SO-1201-assign_logistics")).toBeInTheDocument();
    expect(screen.queryByTestId("work-row-SO-1202-assign_logistics")).toBeNull();
    // Grouped under a weekday+date header — never a bare Today.
    // 2026-08-05 (Wed) − 3 working days on the Mon–Sat week = Sat 1 Aug.
    expect(screen.getByTestId("work-day-2026-08-01")).toHaveTextContent("Sat 1 Aug");
  });

  it("Team Work shows everyone and the owner chip scopes — one set, filtered", () => {
    listState.data = {
      orders: [
        makeRow({ id: "a", so: 1201 }),
        makeRow({
          id: "b",
          so: 1202,
          ops_order_control: [{ assigned_staff: OTHER_UID } as never],
        }),
      ],
    };
    wrap(<OperationWork />);
    fireEvent.click(screen.getByTestId("work-view-team"));
    expect(screen.getByTestId("work-row-SO-1201-assign_logistics")).toBeInTheDocument();
    expect(screen.getByTestId("work-row-SO-1202-assign_logistics")).toBeInTheDocument();
    // Scope to Yu Jun only.
    fireEvent.click(screen.getByTestId(`work-owner-${OTHER_UID}`));
    expect(screen.queryByTestId("work-row-SO-1201-assign_logistics")).toBeNull();
    expect(screen.getByTestId("work-row-SO-1202-assign_logistics")).toBeInTheDocument();
    // The row names its owner in Team view.
    expect(screen.getByTestId("work-row-SO-1202-assign_logistics")).toHaveTextContent("Yu Jun");
  });

  it("a manager lands on Team Work — the §2.2 starting view, not a wall", () => {
    authState = { role: "principal", email: "boss@carres.co" };
    listState.data = { orders: [makeRow({ id: "a", so: 1201 })] };
    wrap(<OperationWork />);
    expect(screen.getByTestId("work-row-SO-1201-assign_logistics")).toBeInTheDocument();
    // And can switch to My Work (empty — not in the staff pool → the sentence).
    fireEvent.click(screen.getByTestId("work-view-mine"));
    expect(screen.getByTestId("work-empty")).toHaveTextContent("not in the staff list");
  });

  it("a row is a DOOR — clicking opens the order workspace, the page writes nothing", () => {
    listState.data = { orders: [makeRow({ id: "a", so: 1201 })] };
    wrap(<OperationWork />);
    fireEvent.click(screen.getByTestId("work-row-SO-1201-assign_logistics"));
    expect(navigateSpy).toHaveBeenCalledWith("/operation/orders/so/a");
  });

  it("no open work → the quiet clear sentence, never an invented item", () => {
    authState = { role: "principal", email: "boss@carres.co" };
    listState.data = { orders: [] };
    wrap(<OperationWork />);
    expect(screen.getByTestId("work-empty")).toHaveTextContent("every track is clear");
  });
});
