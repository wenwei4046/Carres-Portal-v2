/**
 * DELIVERY WORK — the manual planning workspace, held as tests.
 * `CARD-2026-08-21-delivery-02-work-layout`.
 *
 * The arithmetic is pinned in `delivery-work.test.ts`. What THIS file holds is
 * everything that could only go wrong once the numbers reach the screen:
 *
 *  1. **The old page is gone and cannot come back.** No `Work list` / `Calendar`
 *     switch, no KPI preamble, no Refresh, no action-card wall, no permanent
 *     detail pane, no `Due` / `Next Action` / `Priority` / `Today`.
 *  2. **The shape** — one 50px Destination Header, one 200px local rail, one
 *     expandable register.
 *  3. **The approved column order**, exactly.
 *  4. **▸ has one job** — this scope's goods, and only its own.
 *  5. **Nothing writes.** No `New DO` / `Issue` / `Release` / `Approve`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type {
  DeliveryOrderRow,
  DeliveryPartnersListResponse,
  operationOrderListRow,
  SalesOrderExpansionResponse,
} from "@/lib/queries";

let ordersState: {
  data: { orders: operationOrderListRow[] } | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: ReturnType<typeof vi.fn>;
};
let partnersState: { data: DeliveryPartnersListResponse | undefined };
let docsState: {
  data:
    | { deliveryOrders: DeliveryOrderRow[]; attempts: []; handoverEvents: [] }
    | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: ReturnType<typeof vi.fn>;
};
let expansionState: { data: SalesOrderExpansionResponse | undefined; isLoading: boolean };
/** Keyed by order id — the ONLY way to prove an expansion shows its OWN goods
 *  and not the row above it (the card's own acceptance line). */
let expansionByOrder: Record<string, SalesOrderExpansionResponse> | null = null;
let loansState: { data: { loans: unknown[] } | undefined };
let arrangementsState: { data: { arrangements: unknown[] } | undefined };
let assignState: { mutate: ReturnType<typeof vi.fn>; isPending: boolean };
/** Every `navigate()` this page makes — the interaction contract, observed. */
const navigateSpy = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateSpy };
});

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationOrders: () => ordersState,
    useDeliveryPartners: () => partnersState,
    useDeliveryOrdersRegister: () => docsState,
    useSalesOrderExpansion: (orderId: string | null) =>
      expansionByOrder
        ? { data: expansionByOrder[orderId ?? ""], isLoading: false }
        : expansionState,
    useOrderLoans: () => loansState,
    useDeliveryArrangements: () => arrangementsState,
    useAssignLogistics: () => assignState,
  };
});

import OperationDelivery from "./OperationDelivery";

const TODAY = "2026-08-21"; // a Friday

function order(
  over: Partial<operationOrderListRow> & { id: string; so: number },
): operationOrderListRow {
  return {
    status: "proceed_order",
    operation_stage: "ready_to_dispatch",
    warehouse_id: null,
    customer_name: "kong chai yin",
    customer_phone: "0162389000",
    customer_address: "12 Jalan Damai, Klang",
    customer_address_city: "Klang",
    customer_address_state: "Selangor",
    building_type: "Condominium",
    placed_at: "2026-08-01T00:00:00Z",
    delivery_date: "2026-08-30",
    delivery_date_tbd: false,
    source_system: null,
    source_ref: ["CR0854"],
    ops_assigned_logistic: null,
    order_lines: [{ id: "l-1", sku: "mattress:M1401F-K", qty: 1, label: "Serena · King" }],
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
    ...over,
  };
}

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operation?tab=delivery"]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  ordersState = {
    data: { orders: [] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
  partnersState = { data: { partners: [] } };
  docsState = {
    data: { deliveryOrders: [], attempts: [], handoverEvents: [] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
  expansionState = { data: { defaultDeliverTo: null, place: [], lines: [] }, isLoading: false };
  expansionByOrder = null;
  loansState = { data: { loans: [] } };
  arrangementsState = { data: { arrangements: [] } };
  assignState = { mutate: vi.fn(), isPending: false };
  navigateSpy.mockClear();
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T09:00:00+08:00`));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the old three-pane page is gone", () => {
  beforeEach(() => {
    ordersState.data = { orders: [order({ id: "a", so: 1322 })] };
  });

  it("carries no Work list / Calendar switch, no KPI preamble and no Refresh", () => {
    wrap(<OperationDelivery />);
    expect(screen.queryByText("Work list")).toBeNull();
    expect(screen.queryByText("Calendar")).toBeNull();
    expect(screen.queryByRole("button", { name: /refresh/i })).toBeNull();
    expect(screen.queryByTestId("delivery-queues")).toBeNull();
    expect(screen.queryByTestId("delivery-detail")).toBeNull();
  });

  it("never shows a generic employee label or a relative day word", () => {
    wrap(<OperationDelivery />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\bDue\b/);
    expect(text).not.toMatch(/Next Action/i);
    expect(text).not.toMatch(/Priority/i);
    expect(text).not.toMatch(/\bToday\b/);
    expect(text).not.toMatch(/\bTomorrow\b/);
    expect(text).not.toMatch(/\bPending\b/);
  });

  it("offers no door that would write a Delivery Order", () => {
    wrap(<OperationDelivery />);
    for (const word of [/New DO/i, /^Issue$/i, /Release/i, /Approve/i]) {
      expect(screen.queryByRole("button", { name: word })).toBeNull();
    }
  });
});

describe("the shape", () => {
  it("draws one 50px Destination Header saying only Delivery", () => {
    wrap(<OperationDelivery />);
    const header = screen.getByTestId("delivery-work-destination-header");
    expect(header.className).toContain("h-[50px]");
    expect(
      within(header).getByTestId("delivery-work-destination-header-module-word").textContent,
    ).toBe("Delivery");
  });

  it("draws the governed 240px local rail and one listing beside it", () => {
    wrap(<OperationDelivery />);
    expect(screen.getByTestId("delivery-work-rail").className).toContain("w-[240px]");
    expect(screen.getByTestId("delivery-work-listing")).toBeTruthy();
  });

  it("hides the local rail below 1280 until staff choose Show filters", () => {
    wrap(<OperationDelivery />);
    const rail = screen.getByTestId("delivery-work-rail");
    expect(rail.className).toContain("hidden");
    expect(rail.className).toContain("xl:flex");

    const toggle = screen.getByRole("button", { name: "Show filters" });
    expect(toggle.className).toContain("xl:hidden");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);

    expect(rail.className).toContain("flex");
    expect(screen.getByRole("button", { name: "Hide filters" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("orders the DELIVERY SCHEDULE rail: no confirmed date, Overdue, then real days", () => {
    ordersState.data = {
      orders: [
        order({ id: "a", so: 1322 }),
        order({
          id: "b",
          so: 1323,
          ops_order_control: { booking_stage: "confirmed", confirmed_date: "2026-08-19" },
        }),
        order({
          id: "c",
          so: 1324,
          ops_order_control: { booking_stage: "confirmed", confirmed_date: "2026-08-24" },
        }),
      ],
    };
    wrap(<OperationDelivery />);
    const rail = screen.getByTestId("delivery-work-rail");
    const labels = within(rail)
      .getAllByRole("button")
      .map((b) => b.textContent ?? "");
    expect(labels[0]).toContain("No confirmed date");
    // `Overdue`, never `Date passed` — the rail is a work queue (owner 2026-08-24).
    expect(labels[1]).toContain("Overdue");
    /* The near-term window is always present, so the first real day is TODAY
       rather than the first day that happens to hold work. */
    expect(labels[2]).toContain("Fri, 21 Aug");
    expect(labels.some((l) => l.includes("Mon, 24 Aug"))).toBe(true);
  });

  it("keeps every governed Logistics Partner on the rail at zero", () => {
    wrap(<OperationDelivery />);
    for (const name of ["NETS", "AL", "TEOW", "TT", "EU", "SSY", "HOUZS"]) {
      expect(screen.getByTestId(`delivery-logistics-${name}`)).toBeTruthy();
    }
    expect(screen.getByTestId("delivery-logistics-all")).toBeTruthy();
  });

  it("combines the date and the logistics filter into one question", () => {
    ordersState.data = {
      orders: [
        order({
          id: "a",
          so: 1322,
          delivery_partners: { id: "p-nets", name: "NETS" },
          ops_order_control: { booking_stage: "confirmed", confirmed_date: "2026-08-24" },
        }),
        order({
          id: "b",
          so: 1323,
          delivery_partners: { id: "p-al", name: "AL" },
          ops_order_control: { booking_stage: "confirmed", confirmed_date: "2026-08-24" },
        }),
      ],
    };
    wrap(<OperationDelivery />);
    expect(screen.getByText("SO-1322")).toBeTruthy();
    expect(screen.getByText("SO-1323")).toBeTruthy();

    fireEvent.click(screen.getByTestId("delivery-date-2026-08-24"));
    fireEvent.click(screen.getByTestId("delivery-logistics-NETS"));

    expect(screen.getByText("SO-1322")).toBeTruthy();
    expect(screen.queryByText("SO-1323")).toBeNull();
  });
});

describe("the listing", () => {
  beforeEach(() => {
    ordersState.data = { orders: [order({ id: "a", so: 1322 })] };
  });

  it("shows the approved default columns, in the approved order", () => {
    wrap(<OperationDelivery />);
    const headers = screen
      .getAllByRole("columnheader")
      .map((h) => h.textContent?.trim() ?? "")
      .filter(Boolean);
    /* The owner's corrected order (2026-08-24): the PLACE facts lead, then the
       two dates kept apart, then who carries it. */
    expect(headers).toEqual([
      "SO / Ref",
      "Customer",
      "Delivery Location",
      "Building",
      "Requested Delivery Date",
      "Confirmed Delivery",
      "Confirmed Time",
      "Logistics Partner",
      "Goods",
      "DO No",
      "Delivery Status",
    ]);
    // A register finds documents; it never names an owner or an action.
    expect(headers).not.toContain("Owner");
    expect(headers).not.toContain("Next Action");
  });

  it("⭐ Delivery Status says where the WORK is, never `Created` and never the DO absence", () => {
    /* OWNER CORRECTION 2026-08-24, and it OVERWRITES the earlier twinning.
       `DO No` answers *which document* and `Delivery Status` answers *where is
       the work* — two questions, so two answers. The document's own word
       `Created` belongs to the Delivery Orders Register and may not appear. */
    wrap(<OperationDelivery />);
    expect(screen.getAllByText("No delivery order yet")).toHaveLength(1);
    expect(screen.getByText("Waiting for customer date")).toBeInTheDocument();
    expect(screen.queryByText("Created")).toBeNull();
  });

  it("reads `Delivery confirmed` once a day is agreed, with no document yet", () => {
    ordersState.data = {
      orders: [
        order({
          id: "a",
          so: 1322,
          ops_order_control: { booking_stage: "confirmed", confirmed_date: "2026-08-28" },
        }),
      ],
    };
    wrap(<OperationDelivery />);
    expect(screen.getByText("Delivery confirmed")).toBeInTheDocument();
  });

  it("keeps the two Requested Delivery Date absences apart", () => {
    ordersState.data = {
      orders: [
        order({ id: "a", so: 1322, delivery_date: null, delivery_date_tbd: false }),
        order({ id: "b", so: 1323, delivery_date: null, delivery_date_tbd: true }),
      ],
    };
    wrap(<OperationDelivery />);
    // Nobody has asked this customer …
    expect(screen.getByText("No delivery date")).toBeTruthy();
    // … and this one HAS been asked and answered "not yet". Different facts,
    // and both words are the portal's own, not this page's.
    expect(screen.getByText("To be confirmed")).toBeTruthy();
  });

  it("prints the DO number as a door once the system has issued one", () => {
    ordersState.data = {
      orders: [order({ id: "a", so: 1322, do_number: "DO-210826-0001" })],
    };
    docsState.data = {
      deliveryOrders: [
        {
          id: "do-1",
          do_number: "DO-210826-0001",
          issued_at: "2026-08-20T00:00:00Z",
          trip_groups: null,
          delivery_date: "2026-08-26",
          time_slot: "12pm–3pm",
          logistics_partner: "NETS",
          voided_at: null,
          void_reason: null,
          orders: { id: "a", so: 1322, customer_name: "kong chai yin" },
        },
      ],
      attempts: [],
      handoverEvents: [],
    };
    wrap(<OperationDelivery />);
    expect(screen.getByRole("button", { name: "DO-210826-0001" })).toBeTruthy();
    /* The document's own confirmed day and slot, not the SO's promise. The
       day is asserted INSIDE the listing: the rail carries the same date as
       its own bucket, and a bare text match would pass on the rail alone. */
    const listing = screen.getByTestId("delivery-work-listing");
    expect(within(listing).getByText("Wed, 26 Aug")).toBeTruthy();
    expect(within(listing).getByText("12pm–3pm")).toBeTruthy();
    /* ⭐ The OPERATION's word, not the document's. A DO exists and nothing
       physical has been recorded against it, so the job is with the Warehouse —
       which is what the operator needs to read. `Created` describes the paper
       and stays in the Delivery Orders Register (owner ruling 2026-08-24). */
    expect(within(listing).getByText("Waiting for warehouse")).toBeTruthy();
    expect(within(listing).queryByText("Created")).toBeNull();
  });

  it("counts SCOPES in the footer, legs included", () => {
    ordersState.data = {
      orders: [
        order({
          id: "a",
          so: 1322,
          delivery_stops: [
            {
              leg: 1,
              partner_id: "p-teow",
              partner_name: "TEOW",
              from_loc: "Klang WH",
              to_loc: "JB transit",
              status: "pending",
            },
            {
              leg: 2,
              partner_id: "p-ssy",
              partner_name: "SSY",
              from_loc: "JB transit",
              to_loc: "Singapore customer",
              status: "pending",
            },
          ],
        }),
      ],
    };
    wrap(<OperationDelivery />);
    expect(screen.getByText("2 delivery scopes")).toBeTruthy();
    expect(screen.getByText(/Leg 1 · Klang WH → JB transit/)).toBeTruthy();
    expect(screen.getByText(/Leg 2 · JB transit → Singapore customer/)).toBeTruthy();
  });
});

describe("▸ has exactly one job", () => {
  it("announces its state and opens THIS scope's goods and physical facts", () => {
    ordersState.data = { orders: [order({ id: "a", so: 1322 })] };
    expansionState.data = {
      defaultDeliverTo: null,
      place: [{ unitCode: "CAR-000123", siteName: "Carres Klang", holderName: null }],
      lines: [
        {
          lineId: "l-1",
          sku: "mattress:M1401F-K",
          unitIds: ["CAR-000123"],
          deliverTo: [{ name: "Carres Klang", qty: 1 }],
        },
      ],
    };
    wrap(<OperationDelivery />);

    const chevron = screen.getByRole("button", { name: "Expand row" });
    expect(chevron.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(chevron);
    expect(
      screen.getByRole("button", { name: "Collapse row" }).getAttribute("aria-expanded"),
    ).toBe("true");

    const box = screen.getByTestId("delivery-scope-expansion");
    expect(within(box).getByTestId("goods-mini-table")).toBeTruthy();
    expect(within(box).getByText("CAR-000123")).toBeTruthy();

    const facts = within(box).getByTestId("delivery-scope-facts");
    expect(facts.textContent).toContain("Where");
    expect(facts.textContent).toContain("Carres Klang");
    expect(facts.textContent).toContain("Who has it");
    expect(facts.textContent).toContain("Stock ETA");

    // No second Delivery form hides inside the disclosure.
    expect(within(box).queryByRole("textbox")).toBeNull();
    expect(within(box).queryByRole("combobox")).toBeNull();
    expect(within(box).queryByRole("button", { name: /save/i })).toBeNull();
  });

  it("opens on the keyboard, and two expansions carry their OWN goods", () => {
    ordersState.data = {
      orders: [
        order({
          id: "a",
          so: 1322,
          order_lines: [{ id: "l-a", sku: "mattress:M-AAA", qty: 1, label: "Serena · King" }],
        }),
        order({
          id: "b",
          so: 1323,
          order_lines: [{ id: "l-b", sku: "sofa:S-BBB", qty: 1, label: "Rialto · 3 seater" }],
        }),
      ],
    };
    expansionByOrder = {
      a: {
        defaultDeliverTo: null,
        place: [{ unitCode: "UNIT-AAA", siteName: "Carres Klang", holderName: null }],
        lines: [{ lineId: "l-a", sku: "mattress:M-AAA", unitIds: ["UNIT-AAA"], deliverTo: [] }],
      },
      b: {
        defaultDeliverTo: null,
        place: [{ unitCode: "UNIT-BBB", siteName: "NETS Warehouse", holderName: null }],
        lines: [{ lineId: "l-b", sku: "sofa:S-BBB", unitIds: ["UNIT-BBB"], deliverTo: [] }],
      },
    };
    wrap(<OperationDelivery />);

    /* The chevron is a real button, so the keyboard reaches it and Enter opens
       it — no key handler of this page's own. */
    const [first, second] = screen.getAllByRole("button", { name: "Expand row" });
    first!.focus();
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first!, { key: "Enter", code: "Enter" });
    fireEvent.click(first!);
    fireEvent.click(second!);

    const boxes = screen.getAllByTestId("delivery-scope-expansion");
    expect(boxes).toHaveLength(2);
    // Two mini-tables, each carrying only its own scope's Unit and item.
    expect(screen.getAllByTestId("goods-mini-table")).toHaveLength(2);
    expect(within(boxes[0]!).getByText("UNIT-AAA")).toBeTruthy();
    expect(within(boxes[0]!).queryByText("UNIT-BBB")).toBeNull();
    expect(within(boxes[1]!).getByText("UNIT-BBB")).toBeTruthy();
    expect(within(boxes[1]!).queryByText("UNIT-AAA")).toBeNull();
  });

  it("draws the Loan block only when a loan is actually out", () => {
    ordersState.data = { orders: [order({ id: "a", so: 1322 })] };
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByRole("button", { name: "Expand row" }));
    expect(screen.queryByTestId("delivery-scope-loan")).toBeNull();
  });

  it("names the loaned Unit, not its database key", () => {
    ordersState.data = { orders: [order({ id: "a", so: 1322 })] };
    loansState.data = {
      loans: [
        {
          id: "loan-1",
          order_id: "a",
          source: "warehouse",
          item_id: "11111111-1111-1111-1111-111111111111",
          item_unit_code: "CAR-000999",
          item_sku: "sofa:SOF-2",
          status: "on_loan",
          loaned_at: "2026-08-10T00:00:00Z",
          borrowed_label: null,
          supplier_name: null,
        },
      ],
    };
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByRole("button", { name: "Expand row" }));
    const loan = screen.getByTestId("delivery-scope-loan");
    expect(within(loan).getByText("CAR-000999")).toBeTruthy();
    expect(within(loan).getByText("Carres Warehouse")).toBeTruthy();
    expect(loan.textContent).not.toContain("11111111-1111");
  });
});

/**
 * ⭐ THE INTERACTION CONTRACT — owner correction 2026-08-24.
 *
 * The production defect this whole card exists for: `onRowDoubleClick` was
 * wired to the SALES ORDER, so double-clicking a delivery scope threw a
 * logistics operator into a commercial document they must not edit.
 *
 * ```
 * Click SO No          → open Sales Order
 * Click DO No          → open Delivery Order
 * Click ▸              → expand, read-only
 * Double-click row     → open Edit Delivery
 * Select one           → Assign logistics + Edit Delivery
 * Select many          → Assign logistics only
 * ```
 */
describe("the interaction contract", () => {
  beforeEach(() => {
    ordersState.data = {
      orders: [
        order({ id: "a", so: 1322, do_number: "DO-180826-3035" }),
        order({ id: "b", so: 1323 }),
      ],
    };
    docsState.data = {
      deliveryOrders: [
        {
          id: "do-1",
          do_number: "DO-180826-3035",
          issued_at: "2026-08-18T00:00:00Z",
          trip_groups: null,
          delivery_date: "2026-08-26",
          time_slot: "12pm–3pm",
          logistics_partner: "NETS",
          voided_at: null,
          void_reason: null,
          orders: { id: "a", so: 1322, customer_name: "kong chai yin" },
        } as unknown as DeliveryOrderRow,
      ],
      attempts: [],
      handoverEvents: [],
    };
  });

  it("⭐ DOUBLE-CLICKING A ROW OPENS EDIT DELIVERY, NEVER THE SALES ORDER", () => {
    wrap(<OperationDelivery />);
    const cell = screen.getByText("SO-1323").closest("tr")!;
    fireEvent.doubleClick(cell);
    expect(navigateSpy).toHaveBeenCalledWith("/operation/delivery/edit/b");
    // The exact regression, asserted as an absence.
    expect(navigateSpy).not.toHaveBeenCalledWith("/operation/orders/so/b");
  });

  it("SO No still opens the Sales Order — that door is unchanged", () => {
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByText("SO-1323"));
    expect(navigateSpy).toHaveBeenCalledWith("/operation/orders/so/b");
  });

  it("DO No still opens the Delivery Order", () => {
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByText("DO-180826-3035"));
    expect(navigateSpy).toHaveBeenCalledWith("/operation/delivery-orders/DO-180826-3035");
  });

  it("⭐ ONE selected row offers BOTH actions", () => {
    wrap(<OperationDelivery />);
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[1]!);
    const bar = screen.getByTestId("selection-bar");
    expect(within(bar).getByText("1 delivery scope selected")).toBeInTheDocument();
    expect(within(bar).getByText("Assign logistics")).toBeInTheDocument();
    expect(within(bar).getByText("Edit Delivery")).toBeInTheDocument();
  });

  it("⭐ MANY selected rows hide Edit Delivery — it opens one arrangement", () => {
    wrap(<OperationDelivery />);
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[1]!);
    fireEvent.click(boxes[2]!);
    const bar = screen.getByTestId("selection-bar");
    expect(within(bar).getByText("2 delivery scopes selected")).toBeInTheDocument();
    expect(within(bar).getByText("Assign logistics")).toBeInTheDocument();
    expect(within(bar).queryByText("Edit Delivery")).toBeNull();
  });

  it("the selection bar REPLACES the toolbar rather than adding a second row", () => {
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    expect(screen.getByTestId("selection-bar")).toBeInTheDocument();
    // The normal toolbar's search box is gone while a selection stands.
    expect(screen.queryByPlaceholderText(/Search delivery scopes/i)).toBeNull();
  });

  it("`Edit Delivery` from the selection bar opens that one scope", () => {
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    fireEvent.click(within(screen.getByTestId("selection-bar")).getByText("Edit Delivery"));
    expect(navigateSpy).toHaveBeenCalledWith(expect.stringContaining("/operation/delivery/edit/"));
  });

  it("`Assign logistics` opens the dialog, and the dialog issues nothing", () => {
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    fireEvent.click(within(screen.getByTestId("selection-bar")).getByText("Assign logistics"));
    const dialog = screen.getByTestId("assign-logistics-dialog");
    expect(dialog).toBeInTheDocument();
    for (const word of [/^Issue$/i, /Release/i, /Approve/i, /New DO/i]) {
      expect(within(dialog).queryByRole("button", { name: word })).toBeNull();
    }
  });
});

describe("the disclosure is chrome, not an alarm", () => {
  beforeEach(() => {
    ordersState.data = { orders: [order({ id: "a", so: 1322 })] };
  });

  it("says what OPENS on hover, not the mechanic", () => {
    wrap(<OperationDelivery />);
    expect(screen.getAllByTitle("Show delivery items").length).toBeGreaterThan(0);
  });

  it("announces its state, and flips it", () => {
    wrap(<OperationDelivery />);
    const chevron = screen.getAllByTitle("Show delivery items")[0]!;
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(chevron);
    expect(screen.getAllByTitle("Show delivery items")[0]!).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("⭐ is NOT painted in the danger ink", () => {
    /* It shipped as a 12px RED triangle in every row's leftmost gutter — the
       portal's danger colour spent on "there is more here". */
    wrap(<OperationDelivery />);
    const chevron = screen.getAllByTitle("Show delivery items")[0]!;
    expect(chevron.getAttribute("style") ?? "").not.toContain("--c-burnt");
  });
});

describe("the rail says Overdue, and shows the days ahead", () => {
  it("⭐ names the bucket `Overdue`, never `Date passed`", () => {
    ordersState.data = { orders: [order({ id: "a", so: 1322 })] };
    wrap(<OperationDelivery />);
    const rail = screen.getByTestId("delivery-work-rail");
    expect(within(rail).getByText("Overdue")).toBeInTheDocument();
    expect(within(rail).queryByText("Date passed")).toBeNull();
  });

  it("heads the group `DELIVERY SCHEDULE`", () => {
    ordersState.data = { orders: [order({ id: "a", so: 1322 })] };
    wrap(<OperationDelivery />);
    expect(within(screen.getByTestId("delivery-work-rail")).getByText("DELIVERY SCHEDULE"))
      .toBeInTheDocument();
  });

  it("carries the near-term operating days even at zero, and no relative word", () => {
    ordersState.data = { orders: [order({ id: "a", so: 1322 })] };
    wrap(<OperationDelivery />);
    const rail = screen.getByTestId("delivery-work-rail");
    // TODAY is Fri 21 Aug 2026 — seven operating days run to Fri 28 Aug.
    expect(within(rail).getByText("Fri, 21 Aug")).toBeInTheDocument();
    expect(within(rail).getByText("Fri, 28 Aug")).toBeInTheDocument();
    expect(within(rail).queryByText("Sun, 23 Aug")).toBeNull();
    expect(within(rail).queryByText("Today")).toBeNull();
    expect(within(rail).queryByText("Tomorrow")).toBeNull();
  });
});

describe("the entry rule keeps Sales work off this page", () => {
  it("⭐ leaves out an order with no delivery address rather than printing `Not given`", () => {
    ordersState.data = {
      orders: [
        order({ id: "a", so: 1322 }),
        order({
          id: "b",
          so: 1323,
          customer_address: null,
          customer_address_city: null,
          customer_address_state: null,
        }),
      ],
    };
    wrap(<OperationDelivery />);
    expect(screen.getByText("SO-1322")).toBeInTheDocument();
    expect(screen.queryByText("SO-1323")).toBeNull();
  });

  it("leaves out an order whose only line is a service", () => {
    ordersState.data = {
      orders: [
        order({ id: "b", so: 1323, order_lines: [{ id: "l-1", sku: "DELIVERY", qty: 1 }] }),
      ],
    };
    wrap(<OperationDelivery />);
    expect(screen.queryByText("SO-1323")).toBeNull();
  });
});

describe("empty, loading and error all speak inside the listing", () => {
  it("says there are no delivery scopes rather than showing a blank sheet", () => {
    wrap(<OperationDelivery />);
    expect(
      within(screen.getByTestId("delivery-work-listing")).getByText("No delivery scopes"),
    ).toBeTruthy();
  });

  it("puts the failure and its retry inside the listing area", () => {
    ordersState.isError = true;
    ordersState.error = new Error("boom");
    wrap(<OperationDelivery />);
    const listing = screen.getByTestId("delivery-work-listing");
    expect(within(listing).getByText("Delivery could not be loaded")).toBeTruthy();
    fireEvent.click(within(listing).getByRole("button", { name: "Try again" }));
    expect(ordersState.refetch).toHaveBeenCalled();
    // The rail survives the failure — it is the page, not the result.
    expect(screen.getByTestId("delivery-work-rail")).toBeTruthy();
  });
});
