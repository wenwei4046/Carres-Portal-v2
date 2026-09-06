/**
 * DELIVERY MONITOR — the page, held as tests.
 * Owner UI correction 2026-09-06.
 *
 * The arithmetic is pinned in `delivery-monitor.test.ts`. What THIS file holds
 * is everything that could only go wrong once the numbers reach the screen:
 *
 *  1. **The shape** — one 50px Destination Header saying Monitor, one toolbar,
 *     one page-owned 240px FilterRail (WORK TO DO · REGION · LOGISTICS),
 *     six operating-day columns.
 *  2. **One card, the approved fields** — no phone, money, driver, vehicle or
 *     upload timestamp on any calendar card; a card carries NO checkbox.
 *  3. **Every card is ONE link** — an issued DO opens the Delivery Order, a
 *     scope without one opens Edit Delivery.
 *  4. **THE PROJECTION RULE** — any operational pick renders the standard
 *     selectable work list; the calendar never grows selection, and the work
 *     list carries the checkboxes, select-all and the in-place selection
 *     toolbar with `Assign logistics` for unassigned rows.
 *  5. **The spanning empty range** — one sentence, the real confirmed-date
 *     count, and the `Open No confirmed date` door.
 *  6. **The URL is the state**, legacy `?schedule=`/`?checking=` included.
 *  7. **Mobile** — a one-day list, Sunday skipped, the rail as a drawer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import type {
  DeliveryOrderRow,
  DeliveryPartnersListResponse,
  operationOrderListRow,
} from "@/lib/queries";
import type { DeliveryArrangementRow } from "@carres/shared";

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
    | { deliveryOrders: DeliveryOrderRow[]; attempts: unknown[]; handoverEvents: unknown[] }
    | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: ReturnType<typeof vi.fn>;
};
let arrangementsState: {
  data: { arrangements: DeliveryArrangementRow[] } | undefined;
  refetch: ReturnType<typeof vi.fn>;
};

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationOrders: () => ordersState,
    useDeliveryPartners: () => partnersState,
    useDeliveryOrdersRegister: () => docsState,
    useDeliveryArrangements: () => arrangementsState,
    /* The ▸ expansion's Unit facts are their own query — quiet here. */
    useSalesOrderExpansion: () => ({ data: undefined, isLoading: false }),
  };
});

import OperationDelivery from "./OperationDelivery";

/** The one consistent example: Friday, 4 September 2026. */
const TODAY = "2026-09-04";

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
    delivery_date: null,
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

function arrangement(
  over: Partial<DeliveryArrangementRow> & { order_id: string },
): DeliveryArrangementRow {
  return {
    id: `arr-${over.order_id}`,
    leg: 0,
    partner_id: null,
    partner_name: null,
    confirmed_date: null,
    confirmed_time: null,
    expected_arrival: null,
    logistics_note: null,
    reply_proof_path: null,
    driver_name: null,
    vehicle: null,
    updated_at: "2026-09-01T00:00:00Z",
    updated_by: null,
    ...over,
  };
}

function doc(
  over: Partial<DeliveryOrderRow> & { id: string; do_number: string },
): DeliveryOrderRow {
  return {
    order_id: undefined,
    issued_at: "2026-09-01T00:00:00Z",
    trip_groups: null,
    delivery_date: null,
    time_slot: null,
    logistics_partner: null,
    voided_at: null,
    void_reason: null,
    orders: { id: "a", so: 1322, customer_name: "kong chai yin" },
    ...over,
  };
}

/** The URL is the page's state — this probe lets a test read it back. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
}

function wrap(node: React.ReactNode, initialEntry = "/operation?tab=delivery") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        {node}
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let mediaMatches = false;
beforeEach(() => {
  mediaMatches = false;
  window.matchMedia = ((query: string) => ({
    matches: mediaMatches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  ordersState = {
    data: { orders: [] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
  partnersState = {
    data: {
      partners: [
        { id: "p-nets", name: "NETS" },
        { id: "p-al", name: "AL" },
        { id: "p-houzs", name: "HOUZS" },
      ],
    } as DeliveryPartnersListResponse,
  };
  docsState = {
    data: { deliveryOrders: [], attempts: [], handoverEvents: [] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
  arrangementsState = { data: { arrangements: [] }, refetch: vi.fn() };
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T09:00:00+08:00`));
});
afterEach(() => {
  vi.useRealTimers();
});

/** One scope confirmed for Friday 4 Sep with an issued DO, one without a DO. */
function seedTwoScopes() {
  ordersState.data = {
    orders: [
      order({ id: "a", so: 1322, do_number: "DO-040926-0001" }),
      order({ id: "b", so: 1323, customer_name: "aida rahim" }),
    ],
  };
  docsState.data = {
    deliveryOrders: [
      doc({ id: "do-row-1", do_number: "DO-040926-0001", delivery_date: "2026-09-04", time_slot: "11:00–13:00" }),
    ],
    attempts: [],
    handoverEvents: [],
  };
  arrangementsState.data = {
    arrangements: [
      arrangement({
        order_id: "b",
        partner_id: "p-nets",
        partner_name: "NETS",
        confirmed_date: "2026-09-05",
        confirmed_time: "14:00–16:00",
        expected_arrival: "15:00",
      }),
    ],
  };
}

/** Three dateless unassigned scopes — the bulk-assignment population. */
function seedUnassigned() {
  ordersState.data = {
    orders: [
      order({ id: "u1", so: 1401 }),
      order({ id: "u2", so: 1402, customer_name: "aida rahim" }),
      order({ id: "u3", so: 1403, customer_name: "tan mei ling" }),
    ],
  };
}

describe("the shape", () => {
  beforeEach(seedTwoScopes);

  it("draws one 50px Destination Header saying Monitor, with no page-owned control in it", () => {
    wrap(<OperationDelivery />);
    const header = screen.getByTestId("delivery-monitor-destination-header");
    expect(header.className).toContain("h-[50px]");
    expect(
      within(header).getByTestId("delivery-monitor-destination-header-module-word").textContent,
    ).toBe("Monitor");
    /* §6.7 — the old Show/Hide filters toggle may not live on this row. */
    expect(within(header).queryByText(/filters/i)).toBeNull();
  });

  it("draws the page-owned 240px FilterRail with ONE WORK TO DO group — never Delivery Schedule / Needs Checking", () => {
    wrap(<OperationDelivery />);
    const rail = screen.getByTestId("delivery-monitor-rail");
    expect(rail.className).toContain("w-[240px]");
    expect(within(rail).getByText("WORK TO DO")).toBeTruthy();
    expect(within(rail).getByText("REGION")).toBeTruthy();
    expect(within(rail).getByText("LOGISTICS")).toBeTruthy();
    expect(within(rail).queryByText("DELIVERY SCHEDULE")).toBeNull();
    expect(within(rail).queryByText("NEEDS CHECKING")).toBeNull();
    for (const row of [
      "Calendar",
      "No confirmed date",
      "Overdue",
      "Failed Delivery",
      "Delivered — Proof Required",
      "Waiting for warehouse",
      "All regions",
      "All logistics",
      "No logistics picked",
    ]) {
      expect(within(rail).getByText(row)).toBeTruthy();
    }
  });

  it("REGION lists direct state names from the real records — no sub-group headings", () => {
    wrap(<OperationDelivery />);
    const rail = screen.getByTestId("delivery-monitor-rail");
    expect(within(rail).getByText("Selangor")).toBeTruthy();
    for (const heading of ["EAST MALAYSIA", "WEST MALAYSIA", "SINGAPORE"]) {
      expect(within(rail).queryByText(heading)).toBeNull();
    }
  });

  it("LOGISTICS lists only partners genuinely carrying scopes, plus No logistics picked", () => {
    wrap(<OperationDelivery />);
    const rail = screen.getByTestId("delivery-monitor-rail");
    expect(within(rail).getByText("NETS")).toBeTruthy();
    /* AL and HOUZS carry nothing today — no zero-count filler rows. */
    expect(within(rail).queryByText("AL")).toBeNull();
    expect(within(rail).queryByText("HOUZS")).toBeNull();
  });

  it("on Friday 4 Sep the six columns run Thu 3 – Wed 9 and omit Sunday 6", () => {
    wrap(<OperationDelivery />);
    for (const day of [
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
    ]) {
      expect(screen.getByTestId(`delivery-monitor-day-${day}`)).toBeTruthy();
    }
    expect(screen.queryByTestId("delivery-monitor-day-2026-09-06")).toBeNull();
    // The toolbar states the range in the governed date spelling.
    expect(screen.getByText(/Thu, 3 Sep\s*–\s*Wed, 9 Sep/)).toBeTruthy();
  });

  it("an individual empty day says the short `No deliveries` (owner correction 2026-09-06)", () => {
    wrap(<OperationDelivery />);
    const day = screen.getByTestId("delivery-monitor-day-2026-09-08");
    expect(within(day).getByText("No deliveries")).toBeTruthy();
  });

  it("draws no hour-by-hour vertical timeline", () => {
    wrap(<OperationDelivery />);
    expect(screen.queryByTestId("delivery-monitor-hour-axis")).toBeNull();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\b0[89]:00\b.*\b10:00\b.*\b11:00\b/);
  });
});

describe("the spanning empty range", () => {
  it("a fully empty window shows ONE spanning state, not six repeated sentences", () => {
    ordersState.data = { orders: [order({ id: "u1", so: 1401 })] }; // dateless only
    wrap(<OperationDelivery />);
    const empty = screen.getByTestId("delivery-monitor-empty-range");
    expect(
      within(empty).getByText("No deliveries are scheduled from Thu, 3 Sep to Wed, 9 Sep."),
    ).toBeTruthy();
    /* The REAL confirmed-date count, and its door. */
    expect(within(empty).getByText("1 delivery needs a confirmed date.")).toBeTruthy();
    fireEvent.click(within(empty).getByText("Open No confirmed date"));
    expect(screen.getByTestId("location-probe").textContent).toContain(
      "view=no_confirmed_date",
    );
  });

  it("a search that matches nothing is a FILTERED empty, not a false empty-range claim", () => {
    seedTwoScopes();
    wrap(<OperationDelivery />, "/operation?tab=delivery&q=zzz-no-match");
    expect(screen.getByTestId("delivery-monitor-empty-search")).toBeTruthy();
    expect(screen.queryByTestId("delivery-monitor-empty-range")).toBeNull();
  });
});

describe("one card", () => {
  beforeEach(seedTwoScopes);

  it("a card with an issued DO shows the DO number and opens the Delivery Order", () => {
    wrap(<OperationDelivery />);
    const card = screen.getByTestId("delivery-monitor-card-a");
    expect(within(card).getByText("DO-040926-0001")).toBeTruthy();
    expect(within(card).getByText("Kong Chai Yin")).toBeTruthy();
    expect(within(card).getByText("Klang, Selangor")).toBeTruthy();
    expect(within(card).getByText("11:00–13:00")).toBeTruthy();
    const link = card.closest("a");
    expect(link?.getAttribute("href")).toBe("/operation/delivery-orders/do-row-1");
  });

  it("a card without a DO says so and opens Edit Delivery", () => {
    wrap(<OperationDelivery />);
    const card = screen.getByTestId("delivery-monitor-card-b");
    expect(within(card).getByText("No delivery order yet")).toBeTruthy();
    expect(within(card).getByText("Aida Rahim")).toBeTruthy();
    expect(within(card).getByText("NETS")).toBeTruthy();
    expect(card.closest("a")?.getAttribute("href")).toBe("/operation/delivery/edit/b");
  });

  it("shows the recorded ETA and the derived status", () => {
    wrap(<OperationDelivery />);
    const card = screen.getByTestId("delivery-monitor-card-b");
    expect(within(card).getByText(/15:00/)).toBeTruthy();
    expect(within(card).getByText("Delivery confirmed")).toBeTruthy();
  });

  it("prints NO phone number on any calendar card", () => {
    wrap(<OperationDelivery />);
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("0162389000");
    expect(text).not.toContain("011-11108855");
  });

  it("the calendar carries NO checkbox and no batch selection", () => {
    wrap(<OperationDelivery />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    const card = screen.getByTestId("delivery-monitor-card-a");
    expect(within(card).queryAllByRole("button")).toHaveLength(0);
    expect(document.querySelector("[draggable='true']")).toBeNull();
  });

  it("the calendar never prints a banned relative-day or mood word", () => {
    wrap(<OperationDelivery />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\bDue\b/);
    expect(text).not.toMatch(/Next Action/i);
    expect(text).not.toMatch(/Priority/i);
    expect(text).not.toMatch(/\bToday\b/);
    expect(text).not.toMatch(/\bTomorrow\b/);
    expect(text).not.toMatch(/\bPending\b/);
  });
});

describe("the projection rule — an operational pick renders the work list", () => {
  beforeEach(seedTwoScopes);

  it("a WORK TO DO pick replaces the card wall with the standard DataGrid", () => {
    /* One genuinely dateless scope so the queue holds a row. */
    ordersState.data!.orders.push(order({ id: "c", so: 1324, customer_name: "tan mei ling" }));
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByTestId("delivery-monitor-work-no_confirmed_date"));
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(screen.queryByTestId("delivery-monitor-day-2026-09-04")).toBeNull();
    /* The ruled columns reach the screen. */
    for (const label of [
      "SO No",
      "Customer",
      "Requested Delivery Date",
      "Delivery Location",
      "State",
      "Logistics Partner",
      "Confirmed Delivery",
      "Confirmed Time",
      "Goods",
      "DO No",
      "Delivery Status",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    /* Selectable + expandable — the Sales Orders grammar. */
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("Show delivery items").length).toBeGreaterThan(0);
  });

  it("a REGION pick also renders the work list — the card wall is calendar-only", () => {
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByTestId("delivery-monitor-region-Selangor"));
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(screen.queryByTestId("delivery-monitor-card-a")).toBeNull();
  });

  it("a LOGISTICS pick renders the work list narrowed to that partner", () => {
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByTestId("delivery-monitor-logistics-p-nets"));
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(screen.getByText("SO-1323")).toBeTruthy();
    expect(screen.queryByText("SO-1322")).toBeNull();
  });

  it("combined active filters print above the list, and Clear filters resets them", () => {
    wrap(
      <OperationDelivery />,
      "/operation?tab=delivery&view=no_confirmed_date&logistics=none",
    );
    const summary = screen.getByTestId("delivery-monitor-filter-summary");
    expect(summary.textContent).toContain("No confirmed date · No logistics picked");
    fireEvent.click(screen.getByTestId("delivery-monitor-clear-filters"));
    const probe = screen.getByTestId("location-probe").textContent ?? "";
    expect(probe).not.toContain("view=");
    expect(probe).not.toContain("logistics=");
    /* Back on the calendar. */
    expect(screen.getByTestId("delivery-monitor-day-2026-09-04")).toBeTruthy();
  });
});

describe("bulk logistics assignment on the work list", () => {
  beforeEach(seedUnassigned);

  it("No logistics picked → select all visible rows → Assign logistics opens the governed dialog", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&logistics=none");
    /* Header select-all takes every visible eligible row. */
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    expect(screen.getByText("3 delivery scopes selected")).toBeTruthy();
    /* The selection toolbar replaces the normal toolbar in place. */
    expect(screen.getByText("Clear")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Assign logistics" }));
    const dialog = screen.getByTestId("assign-logistics-dialog");
    expect(within(dialog).getByText("3 delivery scopes")).toBeTruthy();
  });

  it("one unassigned row offers Assign logistics AND Edit Delivery; many rows never offer Edit Delivery", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&logistics=none");
    const rowBoxes = screen.getAllByRole("checkbox").slice(1);
    fireEvent.click(rowBoxes[0]!);
    expect(screen.getByRole("button", { name: "Assign logistics" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit Delivery" })).toBeTruthy();
    fireEvent.click(rowBoxes[1]!);
    expect(screen.queryByRole("button", { name: "Edit Delivery" })).toBeNull();
    expect(screen.getByRole("button", { name: "Assign logistics" })).toBeTruthy();
  });

  it("a selected row that already has a partner turns the act into the governed Change logistics — never a bulk replacement", () => {
    ordersState.data = {
      orders: [order({ id: "u1", so: 1401 }), order({ id: "u2", so: 1402 })],
    };
    arrangementsState.data = {
      arrangements: [
        arrangement({ order_id: "u1", partner_id: "p-nets", partner_name: "NETS" }),
      ],
    };
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date");
    const rowBoxes = screen.getAllByRole("checkbox").slice(1);
    /* One ASSIGNED row → Change logistics (the reason/history flow). */
    fireEvent.click(rowBoxes[0]!);
    expect(screen.getByRole("button", { name: "Change logistics" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Assign logistics" })).toBeNull();
    /* Mixed selection → NO assignment act at all (the safe default). */
    fireEvent.click(rowBoxes[1]!);
    expect(screen.queryByRole("button", { name: "Change logistics" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Assign logistics" })).toBeNull();
  });

  it("changing the filter clears the selection", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&logistics=none");
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(screen.getByText("3 delivery scopes selected")).toBeTruthy();
    fireEvent.click(screen.getByTestId("delivery-monitor-work-no_confirmed_date"));
    expect(screen.queryByText(/delivery scopes selected/)).toBeNull();
  });
});

describe("the URL is the state", () => {
  beforeEach(seedTwoScopes);

  it("next moves six operating days and writes the first date to the URL", () => {
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByRole("button", { name: "Next days" }));
    expect(screen.getByTestId("location-probe").textContent).toContain("start=2026-09-10");
    /* The moved-to window holds nothing — the ONE spanning empty state names
       the new range instead of drawing six empty columns. */
    expect(screen.queryByTestId("delivery-monitor-day-2026-09-03")).toBeNull();
    expect(
      screen.getByText("No deliveries are scheduled from Thu, 10 Sep to Wed, 16 Sep."),
    ).toBeTruthy();
  });

  it("a shared URL restores the same window — Back lands where it left", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&start=2026-08-27");
    expect(screen.queryByTestId("delivery-monitor-day-2026-09-04")).toBeNull();
    expect(
      screen.getByText("No deliveries are scheduled from Thu, 27 Aug to Wed, 2 Sep."),
    ).toBeTruthy();
  });

  it("a rail pick and the search ride the URL", () => {
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByTestId("delivery-monitor-work-no_confirmed_date"));
    expect(screen.getByTestId("location-probe").textContent).toContain(
      "view=no_confirmed_date",
    );
  });

  it("the search rides the URL from the calendar toolbar", () => {
    wrap(<OperationDelivery />);
    fireEvent.change(screen.getByPlaceholderText("Search deliveries…"), {
      target: { value: "aida" },
    });
    expect(screen.getByTestId("location-probe").textContent).toContain("q=aida");
  });

  it("the retired ?schedule= and ?checking= spellings still resolve", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&schedule=no_confirmed_date");
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(
      screen
        .getByTestId("delivery-monitor-work-no_confirmed_date")
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("a restored filter URL narrows without a click", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&logistics=p-nets");
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(screen.getByText("SO-1323")).toBeTruthy();
    expect(screen.queryByText("SO-1322")).toBeNull();
  });
});

describe("mobile is a one-day list", () => {
  beforeEach(() => {
    mediaMatches = true;
    seedTwoScopes();
  });

  it("shows one selected operating day, never the six-column grid", () => {
    wrap(<OperationDelivery />);
    expect(screen.getByTestId("delivery-monitor-daily")).toBeTruthy();
    // Today's card renders; no day COLUMN exists in the phone layout.
    expect(screen.getByTestId("delivery-monitor-card-a")).toBeTruthy();
    expect(screen.queryByTestId("delivery-monitor-day-2026-09-04")).toBeNull();
    expect(screen.queryByTestId("delivery-monitor-day-2026-09-03")).toBeNull();
  });

  it("the date heading is sticky and each card row is at least 44px tall", () => {
    wrap(<OperationDelivery />);
    const daily = screen.getByTestId("delivery-monitor-daily");
    const heading = within(daily).getByText("Fri, 4 Sep");
    expect(heading.className).toContain("sticky");
    const card = screen.getByTestId("delivery-monitor-card-a");
    expect(card.className).toContain("min-h-11");
  });

  it("previous/next moves one operating day and skips Sunday", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&day=2026-09-05");
    fireEvent.click(screen.getByRole("button", { name: "Next days" }));
    // Saturday 5 → Monday 7, never Sunday 6.
    expect(screen.getByTestId("location-probe").textContent).toContain("day=2026-09-07");
    fireEvent.click(screen.getByRole("button", { name: "Previous days" }));
    expect(screen.getByTestId("location-probe").textContent).toContain("day=2026-09-05");
  });

  it("a Sunday deep link lands on the next operating day", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&day=2026-09-06");
    const daily = screen.getByTestId("delivery-monitor-daily");
    expect(within(daily).getByText("Mon, 7 Sep")).toBeTruthy();
  });

  it("uses the identical card link arithmetic as desktop", () => {
    wrap(<OperationDelivery />);
    expect(
      screen.getByTestId("delivery-monitor-card-a").closest("a")?.getAttribute("href"),
    ).toBe("/operation/delivery-orders/do-row-1");
  });

  it("the rail is a drawer: absent until Show filters, gone again on Hide filters", () => {
    wrap(<OperationDelivery />);
    expect(screen.queryByTestId("delivery-monitor-rail")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show filters" }));
    expect(screen.getByTestId("delivery-monitor-rail")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide filters" }));
    expect(screen.queryByTestId("delivery-monitor-rail")).toBeNull();
  });

  it("a work-list pick stays a selectable list on the phone", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&logistics=none");
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(screen.queryByTestId("delivery-monitor-daily")).toBeNull();
  });
});
