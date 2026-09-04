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
let poDutyState: { data: { month: string; holder: { userId: string; email: string; name: string | null; assignedBy: string | null } | null } | undefined };
let workspaceDutiesState: { data: import("@/lib/queries").WorkspaceDutiesResponse | undefined; isLoading: boolean };
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
    useOperationPoDuty: () => poDutyState,
    useWorkspaceDuties: () => workspaceDutiesState,
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
import { fmtDate } from "@/lib/fmt-date";

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

function wrap(node: React.ReactNode, url = "/operation?tab=work") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>{node}</MemoryRouter>
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
  poDutyState = { data: undefined };
  workspaceDutiesState = { data: { onDate: TODAY, canEdit: false, duties: [], staff: [] }, isLoading: false };
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
    // Owner re-ruling 2026-08-16 (blueprint card §7): `Assign logistics` is
    // due within the ORDER day for a stock-source order with no PO — the
    // fixture's placed_at, 1 Jul. Spelled by the ONE formatter.
    expect(screen.getByTestId("work-day-2026-07-01")).toHaveTextContent(
      fmtDate("2026-07-01"),
    );
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
    // Blueprint card §7 — Team Work groups PER STAFF: the group header carries
    // the full name and the counts that say WHAT they count.
    const yuJun = screen.getByTestId(`work-owner-group-${OTHER_UID}`);
    expect(yuJun).toHaveTextContent("Yu Jun");
    expect(yuJun).toHaveTextContent("1 action to do");
    // The person's own list holds their item; identity is the GROUP'S, so the
    // row does not repeat it (ui/MASTER.md §5).
    expect(yuJun.querySelector('[data-testid="work-row-SO-1202-assign_logistics"]')).toBeTruthy();
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

  it("Assign logistics opens the exact Delivery arrangement, not the Sales Order", () => {
    listState.data = { orders: [makeRow({ id: "a", so: 1201 })] };
    wrap(<OperationWork />);
    fireEvent.click(screen.getByTestId("work-row-SO-1201-assign_logistics"));
    expect(navigateSpy).toHaveBeenCalledWith("/operation/delivery/edit/a");
  });

  it("Record Delivery Result opens the active DO object", () => {
    stockState.data = {
      warehouses: [],
      skus: [
        {
          sku: "B1201S-K",
          name: "Mattress",
          category: "mattress",
          price: 0,
          available: 1,
          lowThreshold: 0,
          incoming: 0,
          perWarehouse: {},
        },
      ],
      summary: { totalSkus: 1, lowStockCount: 0, openPos: 0 },
    };
    listState.data = {
      orders: [
        makeRow({
          id: "trip-a",
          so: 1205,
          operation_stage: "ready_to_dispatch",
          do_number: "DO-260731-1205",
          order_lines: [{ sku: "B1201S-K", qty: 1 }],
          delivery_partners: { id: "lp-1", name: "NETS" },
          ops_order_control: [
            {
              assigned_staff: OP_UID,
              booking_stage: "confirmed",
              confirmed_date: "2026-07-27",
              confirmed_time_slot: "Morning (9am–12pm)",
            } as never,
          ],
        }),
      ],
    };
    wrap(<OperationWork />, "/operation?tab=work&scope=team");
    fireEvent.click(screen.getByTestId("work-row-SO-1205-deliver_today"));
    expect(navigateSpy).toHaveBeenCalledWith(
      "/operation/delivery-orders/DO-260731-1205",
    );
  });

  it("Delivery Order work with no issued DO opens the exact Delivery scope", () => {
    stockState.data = {
      warehouses: [],
      skus: [{
        sku: "B1201S-K",
        name: "Mattress",
        category: "mattress",
        price: 0,
        available: 1,
        lowThreshold: 0,
        incoming: 0,
        perWarehouse: {},
      }],
      summary: { totalSkus: 1, lowStockCount: 0, openPos: 0 },
    };
    listState.data = {
      orders: [
        makeRow({
          id: "trip-without-do",
          so: 1206,
          do_number: null,
          order_lines: [{ sku: "B1201S-K", qty: 1 }],
          delivery_partners: { id: "lp-1", name: "NETS" },
          ops_order_control: [{
            assigned_staff: OP_UID,
            booking_stage: "confirmed",
            confirmed_date: "2026-07-27",
          } as never],
        }),
      ],
    };
    wrap(<OperationWork />, "/operation?tab=work&scope=team");
    fireEvent.click(screen.getByTestId("work-row-SO-1206-deliver_today"));
    expect(navigateSpy).toHaveBeenCalledWith(
      "/operation/delivery/edit/trip-without-do",
    );
  });

  it("no open work → the quiet clear sentence, never an invented item", () => {
    authState = { role: "principal", email: "boss@carres.co" };
    listState.data = { orders: [] };
    wrap(<OperationWork />);
    expect(screen.getByTestId("work-empty")).toHaveTextContent("every track is clear");
  });
});

/**
 * THE RAIL'S DEEP LINK (owner ruling 2026-08-15).
 *
 * The Quick Rail's Team panel previews each person's `open · overdue` and its
 * rows link here scoped to that person. The link had nowhere to land: `scope`
 * was already in the old rail's href and this page never read it, so a
 * non-manager following `View Team Work` arrived on My Work. A link is a
 * STARTING view exactly as the role default is — it seeds state, never owns it.
 */
describe("OperationWork — the rail deep-links into a person's work", () => {
  it("`scope=team&owner=` lands on Team Work already scoped to that person", () => {
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
    wrap(<OperationWork />, `/operation?tab=work&scope=team&owner=${OTHER_UID}`);
    expect(screen.getByTestId("work-row-SO-1202-assign_logistics")).toBeInTheDocument();
    expect(screen.queryByTestId("work-row-SO-1201-assign_logistics")).toBeNull();
  });

  it("the scoped landing is a default, not a wall — the operator can widen it", () => {
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
    wrap(<OperationWork />, `/operation?tab=work&scope=team&owner=${OTHER_UID}`);
    fireEvent.click(screen.getByTestId("work-owner-clear"));
    expect(screen.getByTestId("work-row-SO-1201-assign_logistics")).toBeInTheDocument();
  });

  it("`scope=team` alone lands a non-manager on Team Work", () => {
    listState.data = { orders: [makeRow({ id: "a", so: 1201 })] };
    wrap(<OperationWork />, "/operation?tab=work&scope=team");
    // The Team-only per-staff groups are what proves the view, not the rows.
    expect(screen.getByTestId(`work-owner-group-${OP_UID}`)).toBeInTheDocument();
  });

  it("every count says WHAT it counts — `{n} actions to do` / `{n} late`, never a bare `open` (card §7)", () => {
    listState.data = { orders: [makeRow({ id: "a", so: 1201 })] };
    wrap(<OperationWork />, "/operation?tab=work&scope=team");
    const group = screen.getByTestId(`work-owner-group-${OP_UID}`);
    expect(group.textContent).toContain("1 action to do");
    const shell = screen.getByTestId("operation-work");
    // the 2026-08-14 `open · overdue` tally is SUPERSEDED by the card
    expect(shell.textContent).not.toMatch(/\d+ open\b/);
    expect(shell.textContent).not.toMatch(/\d+ overdue\b/);
  });
});

/**
 * THE DUTY ROW BELONGS TO ITS DUTY, NOT TO THE ORDER'S OWNER.
 *
 * `work-engine.ts` answers WHO for two composed keys with a DUTY word instead
 * of a name — `resolve_payment_exception` → Finance, `collect_loan_item` →
 * Delivery staff — because neither role has a roster fact yet.
 * `use-open-work` then stapled the order's `assigned_staff` onto EVERY row it
 * composed, which overwrote that answer. Three things broke at once, and all
 * three are silent: the `duty:` bucket this page already implements could
 * never be reached on an order that had an owner, Finance's exceptions were
 * filed in the salesperson's My Work, and they counted toward that person's
 * total. Finance and Delivery could not see their own work anywhere.
 *
 * These pin the INTENT — a duty row groups under its duty and belongs to no
 * person — not the spelling of either duty word.
 */
describe("OperationWork — a duty row belongs to its duty, not to the order's owner", () => {
  it("an open finance exception groups under Finance, never under the assigned salesperson", () => {
    listState.data = {
      orders: [
        makeRow({
          id: "a",
          so: 1203,
          order_finance_exceptions: [{ status: "open" }],
        }),
      ],
    };
    wrap(<OperationWork />, "/operation?tab=work&scope=team");

    const finance = screen.getByTestId("work-owner-group-duty:Finance");
    expect(finance).toHaveTextContent("Finance");
    expect(
      finance.querySelector(
        '[data-testid="work-row-SO-1203-resolve_payment_exception"]',
      ),
    ).toBeTruthy();

    // Shasha owns SO-1203, so she keeps her OWN action — and not Finance's.
    const shasha = screen.getByTestId(`work-owner-group-${OP_UID}`);
    expect(
      shasha.querySelector('[data-testid="work-row-SO-1203-assign_logistics"]'),
    ).toBeTruthy();
    expect(
      shasha.querySelector(
        '[data-testid="work-row-SO-1203-resolve_payment_exception"]',
      ),
    ).toBeNull();
  });

  it("an outstanding loan on a delivered order groups under Delivery staff", () => {
    listState.data = {
      orders: [
        makeRow({
          id: "a",
          so: 1204,
          delivered_at: "2026-07-20T00:00:00Z",
          ops_sofa_loans: [{ status: "on_loan" }],
        }),
      ],
    };
    wrap(<OperationWork />, "/operation?tab=work&scope=team");

    const delivery = screen.getByTestId("work-owner-group-duty:Delivery staff");
    const row = delivery.querySelector(
      '[data-testid="work-row-SO-1204-collect_loan_item"]',
    ) as HTMLElement;
    expect(row).toBeTruthy();
    fireEvent.click(row);
    expect(navigateSpy).toHaveBeenCalledWith("/operation/old-orders?order=a");
  });

  it("delivery-photo work keeps the exact existing upload writer reachable", () => {
    listState.data = {
      orders: [
        makeRow({
          id: "photo-order",
          so: 1207,
          status: "delivered",
          operation_stage: "delivered",
          delivered_at: "2026-07-20T00:00:00Z",
          do_number: "DO-260720-1207",
          ops_order_control: [{ assigned_staff: OP_UID, delivery_photos: [] } as never],
        }),
      ],
    };
    wrap(<OperationWork />, "/operation?tab=work&scope=team");
    fireEvent.click(screen.getByTestId("work-row-SO-1207-upload_delivery_photo"));
    expect(navigateSpy).toHaveBeenCalledWith(
      "/operation/old-orders?order=photo-order",
    );
  });

  it("Finance's exception stays out of the salesperson's My Work", () => {
    listState.data = {
      orders: [
        makeRow({
          id: "a",
          so: 1203,
          order_finance_exceptions: [{ status: "open" }],
        }),
      ],
    };
    // Signed in as Shasha, a non-manager: the default view is My Work.
    wrap(<OperationWork />);
    // Her own action is hers…
    expect(
      screen.getByTestId("work-row-SO-1203-assign_logistics"),
    ).toBeInTheDocument();
    // …the Finance duty is not.
    expect(
      screen.queryByTestId("work-row-SO-1203-resolve_payment_exception"),
    ).toBeNull();
  });
});

/**
 * THE ACTION OWNER ENGINE RESOLUTION (§0.1, built 2026-08-27).
 *
 * The registry's structured Owner Rules resolve per action: Purchasing's
 * order-track work lands on the month's PO-duty holder, the missing customer
 * promise on the responsible salesperson (a name without an ops account), and
 * the PIC keeps only what is truthfully the relationship owner's.
 */
describe("OperationWork — owners resolve per RULE, not per order", () => {
  const unorderedRow = (over: Partial<operationOrderListRow> = {}) =>
    makeRow({
      id: "u",
      so: 1301,
      operation_stage: "placed",
      order_lines: [{ sku: "B1201S-K", qty: 1 }],
      ...over,
    });

  it("`Issue PO` lands in the PO-duty holder's My Work — the PIC never sees it as theirs", () => {
    workspaceDutiesState.data!.duties = [{
      key: "purchasing.po", name: "PO Duty", description: "Issue POs", assignment: null,
      resolution: {
        dutyKey: "purchasing.po", onDate: TODAY,
        normalOwner: { userId: OTHER_UID, name: "Yu Jun" }, buddy: null,
        activeCover: null, actingPerson: { userId: OTHER_UID, name: "Yu Jun" },
        state: "primary", assignmentId: "33333333-3333-4333-8333-333333333333",
      },
    }];
    listState.data = { orders: [unorderedRow()] }; // PIC = Shasha (signed in)
    wrap(<OperationWork />);
    // My Work (Shasha, the PIC): the purchasing act is NOT here…
    expect(screen.queryByTestId("work-row-SO-1301-issue_po")).toBeNull();
    // …it is in the duty holder's Team group.
    fireEvent.click(screen.getByTestId("work-view-team"));
    const yuJun = screen.getByTestId(`work-owner-group-${OTHER_UID}`);
    expect(yuJun.querySelector('[data-testid="work-row-SO-1301-issue_po"]')).toBeTruthy();
  });

  it("cover receives the action in My Work while Team Work keeps the normal owner", () => {
    workspaceDutiesState.data!.duties = [{
      key: "purchasing.po", name: "PO Duty", description: "Issue POs", assignment: null,
      resolution: {
        dutyKey: "purchasing.po", onDate: TODAY,
        normalOwner: { userId: OTHER_UID, name: "Yu Jun" },
        buddy: { userId: OP_UID, name: "Shasha" },
        activeCover: { userId: OP_UID, name: "Shasha" },
        actingPerson: { userId: OP_UID, name: "Shasha" },
        state: "covered", assignmentId: "33333333-3333-4333-8333-333333333333",
      },
    }];
    listState.data = { orders: [unorderedRow()] };

    wrap(<OperationWork />);
    expect(screen.getByTestId("work-row-SO-1301-issue_po")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("work-view-team"));
    const normalOwnerGroup = screen.getByTestId(`work-owner-group-${OTHER_UID}`);
    expect(normalOwnerGroup).toHaveTextContent("Yu Jun");
    expect(normalOwnerGroup).toHaveTextContent("Cover today: Shasha");
    expect(
      normalOwnerGroup.querySelector('[data-testid="work-row-SO-1301-issue_po"]'),
    ).toBeTruthy();
  });

  it("a dormant duty layer groups the purchasing act under the duty word — never the PIC borrowed", () => {
    workspaceDutiesState.data!.duties = [];
    listState.data = { orders: [unorderedRow()] };
    wrap(<OperationWork />, "/operation?tab=work&scope=team");
    const duty = screen.getByTestId("work-owner-group-duty:Purchasing");
    expect(duty).toHaveTextContent("Purchasing");
    expect(duty.querySelector('[data-testid="work-row-SO-1301-issue_po"]')).toBeTruthy();
  });

  it("a never-asked missing date groups under the SALESPERSON'S NAME — a person, not a duty word", () => {
    listState.data = {
      orders: [
        makeRow({
          id: "n",
          so: 1302,
          delivery_date: null,
          delivery_date_tbd: false,
          salespersons: { name: "Mei Ling" },
        }),
      ],
    };
    wrap(<OperationWork />, "/operation?tab=work&scope=team");
    const group = screen.getByTestId("work-owner-group-person:Mei Ling");
    expect(group).toHaveTextContent("Mei Ling");
    expect(
      group.querySelector('[data-testid="work-row-SO-1302-ask_delivery_date"]'),
    ).toBeTruthy();
  });

  it("the 8 who answered `not yet` raise NO ask item (owner ruling 2026-08-15)", () => {
    listState.data = {
      orders: [
        makeRow({
          id: "t",
          so: 1303,
          delivery_date: null,
          delivery_date_tbd: true,
          salespersons: { name: "Mei Ling" },
        }),
      ],
    };
    wrap(<OperationWork />, "/operation?tab=work&scope=team");
    expect(screen.queryByTestId("work-row-SO-1303-ask_delivery_date")).toBeNull();
  });
});
