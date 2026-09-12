/**
 * DELIVERY MONITOR — the page, held as tests.
 * Owner UI corrections 2026-09-06 / 2026-09-07.
 *
 * The arithmetic is pinned in `delivery-monitor.test.ts`. What THIS file holds
 * is everything that could only go wrong once the numbers reach the screen:
 *
 *  1. **The shape** — one 50px Destination Header saying Monitor, the page
 *     toolbar's `Day · Week · Month` (Week the desktop default), one
 *     page-owned 240px FilterRail (WORK TO DO · STATE · LOGISTICS PARTNER ·
 *     DELIVERY STATUS) with the complete month calendar fixed on top, and
 *     never a `Calendar` rail row.
 *  2. **One card, the approved fields** — confirmed time · DO No · Customer ·
 *     City and State · Goods · Logistics Partner · Delivery Status; no phone,
 *     money, owner, driver, vehicle, arrival or upload timestamp; NO checkbox.
 *  3. **Every card is ONE link** — an issued DO opens the Delivery Order, a
 *     row without one opens Edit Delivery.
 *  4. **THE PROJECTION RULE** — any operational pick renders the standard
 *     selectable work list; the calendar never grows selection; the work list
 *     carries the checkboxes, select-all and the in-place `{N} selected ·
 *     Clear · Assign logistics` toolbar; Day/Week/Month brings it back.
 *  5. **Upload delivery proof** — a recorded result stays `Delivered`; the
 *     row names the exact missing file(s).
 *  6. **The URL is the state**, every retired spelling still answering.
 *  7. **Mobile** is only ever the Day list; **tablet** Week is three days.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import type {
  DeliveryOrderRow,
  DeliveryPartnersListResponse,
  operationOrderListRow,
} from "@/lib/queries";
import type { DeliveryArrangementRow } from "@carres/shared";

function openFilter(label: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: label }), { key: "ArrowDown" });
}
function pickFilter(label: string, option: RegExp) {
  openFilter(label);
  fireEvent.click(screen.getByRole("option", { name: option }));
}

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
import { MONITOR_COPY } from "./delivery-monitor";

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

/**
 * ⭐ THE CALENDAR'S OWN URL (owner ruling 2026-09-10).
 *
 * `Work to do` is the LANDING now, so a bare `?tab=delivery` opens the work
 * list. Every test below that is about the CALENDAR opens the calendar
 * explicitly, which is also how the operator reaches it — one named tab. The
 * landing itself is pinned by its own tests in `the two top-level views`.
 */
const CALENDAR_ENTRY = "/operation?tab=delivery&view=week";

function wrap(node: React.ReactNode, initialEntry = CALENDAR_ENTRY) {
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

let viewportWidth = 1440;
beforeEach(() => {
  viewportWidth = 1440;
  window.matchMedia = ((query: string) => ({
    matches: (() => {
      const m = /max-width:\s*(\d+)px/.exec(query);
      return m ? viewportWidth <= Number(m[1]) : false;
    })(),
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

  it("the DEFAULT landing is the Week calendar — six Mon–Sat columns, Week lit in the toolbar", () => {
    wrap(<OperationDelivery />);
    for (const day of ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]) {
      expect(screen.getByTestId(`delivery-monitor-day-${day}`)).toBeTruthy();
    }
    expect(screen.queryByTestId("delivery-monitor-day-2026-09-06")).toBeNull();
    expect(screen.queryByTestId("delivery-monitor-work-list")).toBeNull();
    const control = screen.getByTestId("delivery-monitor-calendar-view");
    expect(within(control).getByRole("tab", { name: "Week" }).getAttribute("aria-selected")).toBe("true");
    expect(within(control).getByRole("tab", { name: "Day" })).toBeTruthy();
    expect(within(control).getByRole("tab", { name: "Month" })).toBeTruthy();
    // The toolbar states the range in the governed date spelling.
    expect(screen.getByText(/Mon, 31 Aug\s*–\s*Sat, 5 Sep/)).toBeTruthy();
  });

  it("draws one 50px Destination Header saying Monitor, with no page-owned control in it", () => {
    wrap(<OperationDelivery />);
    const header = screen.getByTestId("delivery-monitor-destination-header");
    expect(header.className).toContain("h-[50px]");
    expect(
      within(header).getByTestId("delivery-monitor-destination-header-module-word").textContent,
    ).toBe("Monitor");
    expect(within(header).queryByText(/filters/i)).toBeNull();
    expect(within(header).queryByText("Week")).toBeNull();
  });

  it("draws the page-owned 240px FilterRail with the four ruled groups — never a Calendar row, never Proof Required", () => {
    /* WORK TO DO belongs to the Work to do tab (owner ruling 2026-09-10) — a
       queue pick from the calendar would change the tab out from under the
       operator, which is exactly the side effect the two tabs replaced. */
    wrap(<OperationDelivery />, "/operation?tab=delivery");
    const rail = screen.getByTestId("delivery-monitor-rail");
    expect(rail.className).toContain("w-[240px]");
    for (const heading of ["WORK TO DO", "STATE", "LOGISTICS PARTNER", "DELIVERY STATUS"]) {
      expect(within(rail).getByText(heading)).toBeTruthy();
    }
    for (const gone of [
      "REGION",
      "LOGISTICS",
      "DELIVERY SCHEDULE",
      "NEEDS CHECKING",
      "Calendar",
      "Delivered — Proof Required",
      "All regions",
      "All logistics",
    ]) {
      expect(within(rail).queryByText(gone)).toBeNull();
    }
    for (const row of [
      "All delivery work",
      "No logistics picked",
      /* The queue is named after the JOB (owner ruling 2026-09-10). */
      "Call customer",
      /* ⭐ NOT a bare `Overdue` (owner ruling 2026-09-11): the contact strip
         counts a DIFFERENT overdue population, and two identical words on one
         screen read as one number that disagrees with itself. */
      "Overdue delivery",
      "Failed Delivery",
      "Upload delivery proof",
    ]) {
      expect(within(rail).getByText(row)).toBeTruthy();
    }
  });

  it("WORK TO DO keeps the ruled order, and Waiting for warehouse sits under DELIVERY STATUS only", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery");
    const rail = screen.getByTestId("delivery-monitor-rail");
    const rows = [
      "delivery-monitor-work-all",
      "delivery-monitor-work-no_logistics",
      "delivery-monitor-work-no_confirmed_date",
      "delivery-monitor-work-overdue",
      "delivery-monitor-work-failed",
      "delivery-monitor-work-upload_proof",
    ].map((id) => within(rail).getByTestId(id));
    for (let i = 1; i < rows.length; i += 1) {
      expect(
        rows[i - 1]!.compareDocumentPosition(rows[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(within(rail).getAllByText("No logistics picked")).toHaveLength(1);
    expect(within(rail).getByRole("combobox", { name: "DELIVERY STATUS" })).toBeTruthy();
    expect(within(rail).queryByTestId("delivery-monitor-work-waiting_warehouse")).toBeNull();
  });

  it("STATE lists direct state names from the real records — no sub-group headings", () => {
    wrap(<OperationDelivery />);
    const rail = screen.getByTestId("delivery-monitor-rail");
    openFilter("STATE");
    expect(screen.getByRole("option", { name: /^Selangor/ })).toBeTruthy();
    for (const heading of ["EAST MALAYSIA", "WEST MALAYSIA", "SINGAPORE", "KLANG VALLEY"]) {
      expect(within(rail).queryByText(heading)).toBeNull();
    }
  });

  it("LOGISTICS PARTNER lists only governed partners genuinely carrying rows — no invented company, no duplicated No logistics picked row", () => {
    wrap(<OperationDelivery />);
    const rail = screen.getByTestId("delivery-monitor-rail");
    openFilter("LOGISTICS PARTNER");
    expect(screen.getByRole("option", { name: /^NETS/ })).toBeTruthy();
    expect(within(rail).queryByText("AL")).toBeNull();
    expect(within(rail).queryByText("HOUZS")).toBeNull();
    expect(within(rail).queryByTestId("delivery-monitor-logistics-none")).toBeNull();
  });

  it("the rail carries TWO consecutive months fixed above the scrolling filters, one arrow pair moving both", () => {
    wrap(<OperationDelivery />);
    const calendar = screen.getByTestId("delivery-monitor-month-calendar");
    /* Current month above next month — owner ruling 2026-09-10. */
    expect(within(calendar).getByText(/September 2026/i)).toBeTruthy();
    expect(within(calendar).getByText(/October 2026/i)).toBeTruthy();
    /* ONE pair of arrows, and it steps BOTH months by exactly one month. */
    expect(within(calendar).getAllByRole("button", { name: "Previous month" })).toHaveLength(1);
    fireEvent.click(within(calendar).getByRole("button", { name: "Previous month" }));
    expect(within(calendar).getByText(/August 2026/i)).toBeTruthy();
    expect(within(calendar).getByText(/September 2026/i)).toBeTruthy();
    expect(within(calendar).queryByText(/October 2026/i)).toBeNull();
    fireEvent.click(within(calendar).getByRole("button", { name: "Next month" }));
    expect(within(calendar).getByText(/September 2026/i)).toBeTruthy();
    expect(within(calendar).getByText(/October 2026/i)).toBeTruthy();
    const rail = screen.getByTestId("delivery-monitor-rail");
    const scrollRegion = rail.querySelector(".overflow-y-auto");
    expect(scrollRegion).toBeTruthy();
    expect(scrollRegion!.contains(calendar)).toBe(false);
    /* Sunday stays visible and unclickable — scoped to the FIRST month, since
       both months now carry a "6". */
    const september = within(calendar).getAllByRole("grid")[0];
    const sunday = within(september).getByText("6").closest("button");
    expect(sunday?.disabled).toBe(true);
  });

  it("clicking a rail date opens that date's DAY view and clears the picked queue", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date&region=Selangor");
    const calendar = screen.getByTestId("delivery-monitor-month-calendar");
    const september = within(calendar).getAllByRole("grid")[0];
    fireEvent.click(within(september).getByText("15"));
    const probe = screen.getByTestId("location-probe").textContent ?? "";
    expect(probe).toContain("date=2026-09-15");
    expect(probe).toContain("view=day");
    /* The STATE narrowing SURVIVES (owner ruling 2026-09-10): a pick applies
       to whichever view is open, and dropping it silently would answer a
       question the operator did not ask. */
    expect(probe).toContain("region=Selangor");
    expect(within(screen.getByTestId("delivery-monitor-daily")).getByText("Tue, 15 Sep")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Day" }).getAttribute("aria-selected")).toBe("true");
  });

  it("an individual empty day says the short `No deliveries`", () => {
    wrap(<OperationDelivery />);
    const day = screen.getByTestId("delivery-monitor-day-2026-09-02");
    expect(within(day).getByText("No deliveries")).toBeTruthy();
  });

  it("draws no hour-by-hour vertical timeline", () => {
    wrap(<OperationDelivery />);
    expect(screen.queryByTestId("delivery-monitor-hour-axis")).toBeNull();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\b0[89]:00\b.*\b10:00\b.*\b11:00\b/);
  });
});

describe("Day · Week · Month (owner correction 2026-09-07)", () => {
  beforeEach(seedTwoScopes);

  it("Day shows the selected operating day with full cards and steps one operating day", () => {
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByRole("tab", { name: "Day" }));
    expect(screen.getByTestId("location-probe").textContent).toContain("view=day");
    const daily = screen.getByTestId("delivery-monitor-daily");
    expect(within(daily).getByText("Fri, 4 Sep")).toBeTruthy();
    expect(within(daily).getByTestId("delivery-monitor-card-a")).toBeTruthy();
    expect(screen.queryByTestId("delivery-monitor-day-2026-09-04")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next days" }));
    expect(screen.getByTestId("location-probe").textContent).toContain("date=2026-09-05");
    expect(within(screen.getByTestId("delivery-monitor-daily")).getByTestId("delivery-monitor-card-b")).toBeTruthy();
  });

  it("Month is a capacity overview — compact counts per date, no cards, arrows moving a whole month", () => {
    /* A failed delivery on the 4th makes that day's Exceptions line real. */
    ordersState.data!.orders.push(order({ id: "f", so: 1330, do_number: "DO-F", customer_name: "lim ah kow" }));
    docsState.data!.deliveryOrders.push(doc({ id: "do-f", do_number: "DO-F", delivery_date: "2026-09-04" }));
    docsState.data!.attempts.push({ do_number: "DO-F", result: "failed", reason_key: "customer_absent", recorded_at: "2026-09-04T10:00:00Z" });
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByRole("tab", { name: "Month" }));
    expect(screen.getByTestId("location-probe").textContent).toContain("view=month");
    expect(screen.getByTestId("delivery-monitor-month-view")).toBeTruthy();
    expect(screen.getByTestId("delivery-monitor-range").textContent).toBe("Sep 2026");
    /* No card wall in the month. */
    expect(screen.queryByTestId("delivery-monitor-card-a")).toBeNull();
    const fourth = screen.getByTestId("delivery-monitor-month-day-2026-09-04");
    expect(fourth.getAttribute("aria-label")).toBe(
      "Fri, 4 Sep — 2 deliveries · 1 exception · 2 No logistics picked",
    );
    expect(within(fourth).getByText("Deliveries")).toBeTruthy();
    expect(within(fourth).getByText("Exceptions")).toBeTruthy();
    const fifth = screen.getByTestId("delivery-monitor-month-day-2026-09-05");
    expect(fifth.getAttribute("aria-label")).toBe("Fri, 5 Sep — 1 delivery".replace("Fri", "Sat"));
    expect(within(fifth).queryByText("Exceptions")).toBeNull();
    expect(within(fifth).queryByText("No logistics picked")).toBeNull();
    /* Sunday visible, not a choice. */
    expect((screen.getByTestId("delivery-monitor-month-day-2026-09-06") as HTMLButtonElement).disabled).toBe(true);
    /* The toolbar's month arrows replace the whole month. */
    const next = screen.getByTestId("delivery-monitor-next");
    expect(next.getAttribute("aria-label")).toBe("Next month");
    fireEvent.click(next);
    expect(screen.getByTestId("location-probe").textContent).toContain("date=2026-10-01");
    expect(screen.getByTestId("delivery-monitor-range").textContent).toBe("Oct 2026");
  });

  it("clicking a Month date opens that date's Day view", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=month");
    fireEvent.click(screen.getByTestId("delivery-monitor-month-day-2026-09-05"));
    const probe = screen.getByTestId("location-probe").textContent ?? "";
    expect(probe).toContain("view=day");
    expect(probe).toContain("date=2026-09-05");
    expect(within(screen.getByTestId("delivery-monitor-daily")).getByTestId("delivery-monitor-card-b")).toBeTruthy();
  });

  it("an empty month shows the ONE spanning state, never thirty empty cells", () => {
    ordersState.data = { orders: [order({ id: "u1", so: 1401 })] };
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=month");
    expect(screen.queryByTestId("delivery-monitor-month-view")).toBeNull();
    expect(
      within(screen.getByTestId("delivery-monitor-empty-range")).getByText(
        "No deliveries are scheduled from Tue, 1 Sep to Wed, 30 Sep.",
      ),
    ).toBeTruthy();
  });

  it("Day · Week · Month belongs to the CALENDAR and is absent from the work list", () => {
    /* Owner ruling 2026-09-10, narrowing the 2026-09-07 `on both projections`
       spelling: on a work list the control lit nothing and changed the page
       out from under the operator. The named tab is the way back. */
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date&region=Selangor&status=waiting_warehouse");
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(screen.queryByTestId("delivery-monitor-calendar-view")).toBeNull();
    fireEvent.click(screen.getByTestId("delivery-monitor-tab-calendar"));
    const probe = screen.getByTestId("location-probe").textContent ?? "";
    expect(probe).toContain("view=week");
    /* The narrowings survive the tab — they describe the rows, not the view. */
    expect(probe).toContain("region=Selangor");
    expect(screen.getByTestId("delivery-monitor-calendar-view")).toBeTruthy();
  });
});

describe("the spanning empty range", () => {
  it("a fully empty window shows ONE spanning state, not six repeated sentences", () => {
    ordersState.data = { orders: [order({ id: "u1", so: 1401 })] }; // dateless only
    wrap(<OperationDelivery />);
    const empty = screen.getByTestId("delivery-monitor-empty-range");
    expect(
      within(empty).getByText("No deliveries are scheduled from Mon, 31 Aug to Sat, 5 Sep."),
    ).toBeTruthy();
    expect(within(empty).getByText("1 delivery needs a confirmed date.")).toBeTruthy();
    fireEvent.click(within(empty).getByText("Open Call customer"));
    expect(screen.getByTestId("location-probe").textContent).toContain("view=no_confirmed_date");
  });

  it("a search that matches nothing is a FILTERED empty, not a false empty-range claim", () => {
    seedTwoScopes();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=week&q=zzz-no-match");
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
    expect(card.closest("a")?.getAttribute("href")).toBe("/operation/delivery-orders/do-row-1");
  });

  it("a card without a DO says so and opens Edit Delivery", () => {
    wrap(<OperationDelivery />);
    const card = screen.getByTestId("delivery-monitor-card-b");
    expect(within(card).getByText("No delivery order yet")).toBeTruthy();
    expect(within(card).getByText("Aida Rahim")).toBeTruthy();
    expect(within(card).getByText("NETS")).toBeTruthy();
    expect(within(card).getByText("Delivery confirmed")).toBeTruthy();
    expect(card.closest("a")?.getAttribute("href")).toBe("/operation/delivery/edit/b");
  });

  it("shows ONLY the approved fields — no expected arrival, phone, owner name or upload time", () => {
    wrap(<OperationDelivery />);
    const card = screen.getByTestId("delivery-monitor-card-b");
    expect(within(card).queryByText(/Expected arrival/)).toBeNull();
    expect(within(card).queryByText(/15:00/)).toBeNull();
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("0162389000");
    expect(text).not.toContain("011-11108855");
    for (const name of ["Yu Jun", "Shasha", "Khor Yee"]) expect(text).not.toContain(name);
  });

  it("a recorded delivery still owed evidence stays `Delivered` on the card — never Proof Required", () => {
    ordersState.data!.orders.push(
      order({ id: "d", so: 1325, do_number: "DO-D", customer_name: "lim ah kow", ops_order_control: { delivery_photos: [] } }),
    );
    docsState.data!.deliveryOrders.push(doc({ id: "do-d", do_number: "DO-D", delivery_date: "2026-09-03" }));
    docsState.data!.attempts.push({ do_number: "DO-D", result: "delivered", reason_key: null, recorded_at: "2026-09-03T10:00:00Z" });
    wrap(<OperationDelivery />);
    const card = screen.getByTestId("delivery-monitor-card-d");
    expect(within(card).getByText("Delivered")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Proof Required");
  });

  it("the calendar carries NO checkbox and no batch selection", () => {
    wrap(<OperationDelivery />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    const card = screen.getByTestId("delivery-monitor-card-a");
    expect(within(card).queryAllByRole("button")).toHaveLength(0);
    expect(document.querySelector("[draggable='true']")).toBeNull();
  });

  it("the calendar never prints a banned relative-day, mood or internal word", () => {
    wrap(<OperationDelivery />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\bDue\b/);
    expect(text).not.toMatch(/Next Action/i);
    expect(text).not.toMatch(/Priority/i);
    expect(text).not.toMatch(/\bToday\b/);
    expect(text).not.toMatch(/\bTomorrow\b/);
    expect(text).not.toMatch(/\bPending\b/);
    expect(text).not.toMatch(/\bscopes?\b/i);
    expect(text).not.toMatch(/\bLeg\b/);
  });
});

describe("the two top-level views (owner ruling 2026-09-10)", () => {
  beforeEach(seedTwoScopes);

  it("⭐ the DEFAULT LANDING is Work to do — the selectable work list, not a calendar", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery");
    const tabs = screen.getByTestId("delivery-monitor-tabs");
    expect(within(tabs).getByTestId("delivery-monitor-tab-work").getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(
      within(tabs).getByTestId("delivery-monitor-tab-calendar").getAttribute("aria-selected"),
    ).toBe("false");
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(screen.queryByTestId("delivery-monitor-day-2026-09-04")).toBeNull();
    /* Both tabs are NAMED — the operator never has to discover the other view
       by clearing a filter. */
    expect(within(tabs).getByText("Work to do")).toBeTruthy();
    expect(within(tabs).getByText("Confirmed deliveries")).toBeTruthy();
  });

  it("the landing offers nothing to CLEAR — its queue narrows nothing", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery");
    expect(screen.queryByTestId("delivery-monitor-filter-summary")).toBeNull();
    /* A real narrowing brings the bar back, naming only what it narrowed. */
    pickFilter("STATE", /^Selangor/);
    expect(screen.getByTestId("delivery-monitor-filter-summary").textContent).toContain(
      "Selangor",
    );
    expect(screen.getByTestId("delivery-monitor-filter-summary").textContent).not.toContain(
      "All delivery work",
    );
  });

  it("switching to Confirmed deliveries opens the Mon–Sat week, and back again", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery");
    fireEvent.click(screen.getByTestId("delivery-monitor-tab-calendar"));
    expect(screen.getByTestId("delivery-monitor-day-2026-09-04")).toBeTruthy();
    expect(screen.getByTestId("location-probe").textContent).toContain("view=week");
    expect(screen.getByTestId("delivery-monitor-calendar-scope").textContent).toBe(
      /* A day with no agreed window DOES enter the calendar — the operator
         must see the day — and its card says `No time agreed` rather than
         passing as a settled booking (owner ruling 2026-09-11). */
      "Only deliveries with a confirmed date appear here.",
    );
    fireEvent.click(screen.getByTestId("delivery-monitor-tab-work"));
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(screen.getByTestId("location-probe").textContent).toContain("view=all");
  });

  it("⭐ a day with NO AGREED TIME is visibly incomplete in the row", () => {
    /* The defect the 2026-09-11 render walk found: the cell printed the day
       twice — `Mon, 14 Sep / Mon, 14 Sep` — so a half-answered booking was
       distinguishable from a finished one only by a missing fragment an
       operator reads as formatting. The absence is now STATED. */
    /* The DAY is agreed on the document; the WINDOW never was. */
    docsState.data = {
      deliveryOrders: [
        doc({
          id: "do-row-1",
          do_number: "DO-040926-0001",
          delivery_date: "2026-09-04",
          time_slot: null,
        }),
      ],
      attempts: [],
      handoverEvents: [],
    };
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=all");
    const cell = screen.getByText("No time agreed");
    expect(cell.getAttribute("data-absence")).toBe("true");
    /* And the row KEEPS ITS WORK: the conversation is not finished, so the
       document still sits in the queue that finishes it. */
    fireEvent.click(screen.getByTestId("delivery-monitor-work-no_confirmed_date"));
    expect(screen.getByText("SO-1322")).toBeTruthy();
  });

  it("the work list prints the ruled columns, with the sheet's own selection and ▸", () => {
    ordersState.data!.orders.push(order({ id: "c", so: 1324, customer_name: "tan mei ling" }));
    wrap(<OperationDelivery />, "/operation?tab=delivery");
    fireEvent.click(screen.getByTestId("delivery-monitor-work-no_confirmed_date"));
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(screen.queryByTestId("delivery-monitor-day-2026-09-04")).toBeNull();
    for (const label of [
      "SO No",
      "Customer",
      "State",
      "Requested Delivery Date",
      "Items",
      "Accessories & services",
      "Expected arrival",
      "Stock",
      "Actions",
      "Edit Delivery",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("Show delivery items").length).toBeGreaterThan(0);
  });

  it("`All delivery work` lists every open row — dated, DO-less and dateless — and its footer counts deliveries", () => {
    ordersState.data!.orders.push(order({ id: "c", so: 1324, customer_name: "tan mei ling" }));
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=all");
    for (const so of ["SO-1322", "SO-1323", "SO-1324"]) expect(screen.getByText(so)).toBeTruthy();
    expect(screen.getByText("3 deliveries")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\bscopes?\b/i);
  });

  it("a STATE pick narrows the work list, and stays on the tab it was made on", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery");
    pickFilter("STATE", /^Selangor/);
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(screen.queryByTestId("delivery-monitor-card-a")).toBeNull();
  });

  it("a STATE pick NARROWS the calendar instead of replacing it (2026-09-10)", () => {
    /* The retired projection rule swapped the calendar for a sheet on any
       pick, and the operator's only way back was to notice Clear filters. */
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=week&region=Selangor");
    expect(screen.getByTestId("delivery-monitor-day-2026-09-04")).toBeTruthy();
    expect(screen.getByTestId("delivery-monitor-card-a")).toBeTruthy();
    expect(screen.getByTestId("delivery-monitor-filter-summary").textContent).toContain("Selangor");

    /* A state nothing is going to empties the WEEK, not the view. */
    cleanup();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=week&region=Johor");
    expect(screen.getByTestId("delivery-monitor-empty-range")).toBeTruthy();
    expect(screen.queryByTestId("delivery-monitor-work-list")).toBeNull();
    expect(screen.getByTestId("delivery-monitor-filter-summary").textContent).toContain("Johor");
  });

  it("a LOGISTICS PARTNER pick renders the work list narrowed to that partner", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery");
    pickFilter("LOGISTICS PARTNER", /^NETS/);
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(screen.getByText("SO-1323")).toBeTruthy();
    expect(screen.queryByText("SO-1322")).toBeNull();
  });

  it("a DELIVERY STATUS pick is a filter over recorded progress — Waiting for warehouse lists the arranged-but-not-ready rows", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery");
    pickFilter("DELIVERY STATUS", /^Waiting for warehouse/);
    expect(screen.getByTestId("location-probe").textContent).toContain("status=waiting_warehouse");
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    /* SO-1322 holds a live DO with no handover yet — Waiting for warehouse. */
    expect(screen.getByText("SO-1322")).toBeTruthy();
    expect(screen.queryByText("SO-1323")).toBeNull();
    expect(screen.getByTestId("delivery-monitor-filter-summary").textContent).toContain("Waiting for warehouse");
  });

  it("combined active filters print above the list, and Clear filters clears the NARROWINGS, not the tab", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date&region=Selangor");
    const summary = screen.getByTestId("delivery-monitor-filter-summary");
    expect(summary.textContent).toContain("Call customer · Selangor");
    fireEvent.click(screen.getByTestId("delivery-monitor-clear-filters"));
    const probe = screen.getByTestId("location-probe").textContent ?? "";
    /* An operator who clears a state pick is not asking to leave the view. */
    expect(probe).toContain("view=all");
    expect(probe).not.toContain("region=");
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
  });

  it("a legacy ?logistics=none URL still narrows and still prints its label", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date&logistics=none");
    expect(screen.getByTestId("delivery-monitor-filter-summary").textContent).toContain(
      "Call customer · No logistics picked",
    );
  });
});

describe("Upload delivery proof (owner correction 2026-09-07)", () => {
  beforeEach(() => {
    seedTwoScopes();
    ordersState.data!.orders.push(
      order({ id: "d", so: 1325, do_number: "DO-D", customer_name: "lim ah kow", ops_order_control: { delivery_photos: [] } }),
      order({
        id: "e",
        so: 1326,
        do_number: "DO-E",
        customer_name: "ng siew lan",
        /* ⭐ The photo names the trip it came back from (owner ruling
           2026-09-11). An unstamped file belongs to no document's evidence,
           so this fixture states the document, exactly as the upload door
           now does. */
        ops_order_control: {
          delivery_photos: [
            { path: "p.jpg", at: "2026-09-03T11:00:00Z", by: null, doNumber: "DO-E", kind: "photo" },
          ],
        },
      }),
    );
    docsState.data!.deliveryOrders.push(
      doc({ id: "do-d", do_number: "DO-D", delivery_date: "2026-09-03" }),
      doc({ id: "do-e", do_number: "DO-E", delivery_date: "2026-09-03" }),
    );
    docsState.data!.attempts.push(
      { do_number: "DO-D", result: "delivered", reason_key: null, recorded_at: "2026-09-03T10:00:00Z" },
      { do_number: "DO-E", result: "delivered", reason_key: null, recorded_at: "2026-09-03T10:00:00Z" },
    );
  });

  it("the queue counts the rows still owed evidence and each row names the EXACT missing action(s)", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery");
    expect(screen.getByTestId("delivery-monitor-work-upload_proof").textContent).toContain("2");
    fireEvent.click(screen.getByTestId("delivery-monitor-work-upload_proof"));
    expect(screen.getByTestId("location-probe").textContent).toContain("view=upload_proof");
    const list = screen.getByTestId("delivery-monitor-work-list");
    expect(within(list).getByText("SO-1325")).toBeTruthy();
    expect(within(list).getByText("SO-1326")).toBeTruthy();
    expect(within(list).queryByText("SO-1322")).toBeNull();
    /* The EXACT missing evidence is the row's next act (owner ruling
       2026-09-10 moved it into `Actions`, where the row's one job lives) — and
       a RECORDED result outranks an unassigned partner, so a delivered row
       never asks for a carrier it no longer needs. */
    const acts = within(list)
      .getAllByTestId("delivery-monitor-missing-proof")
      .map((el) => el.textContent);
    expect(acts).toContain("Upload delivery photo · Upload signed Delivery Order");
    expect(acts).toContain("Upload signed Delivery Order");
    /* The recorded result word never changes — it is still `Delivered`, in
       the chooser's own Delivery Status column and in the row's search text. */
    expect(document.body.textContent).not.toContain("Proof Required");
  });

  it("the retired ?view=delivered_proof_required and ?checking= spellings open this queue", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=delivered_proof_required");
    expect(screen.getByTestId("delivery-monitor-work-upload_proof").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
  });
});

describe("bulk logistics assignment on the work list", () => {
  beforeEach(seedUnassigned);

  it("Monitor → No logistics picked → header select-all → `3 selected · Clear · Assign logistics`", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_logistics");
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    expect(screen.getByText("3 selected")).toBeTruthy();
    expect(screen.getByText("Clear")).toBeTruthy();
    /* The SELECTION toolbar's button — the row's own Actions cell offers the
       same governed word one row at a time, so this pick is addressed by the
       toolbar's testid rather than by a name three rows also carry. */
    fireEvent.click(screen.getByTestId("selection-action-assign-logistics"));
    const dialog = screen.getByTestId("assign-logistics-dialog");
    expect(within(dialog).getByText("3 deliveries")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\bscopes?\b/i);
  });

  it("`No logistics picked` holds every eligible row across all dates — no DO and no confirmed date included", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_logistics");
    for (const so of ["SO-1401", "SO-1402", "SO-1403"]) expect(screen.getByText(so)).toBeTruthy();
    /* Every one of them is unassigned and dateless — the population the bulk
       journey exists for. `DO No` now answers from the Columns chooser. */
    expect(screen.getAllByText(MONITOR_COPY.noLogistics).length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText(MONITOR_COPY.noConfirmedDate).length).toBe(3);
  });

  it("one unassigned row offers Assign logistics AND Edit Delivery; many rows never offer Edit Delivery", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_logistics");
    const rowBoxes = screen.getAllByRole("checkbox").slice(1);
    fireEvent.click(rowBoxes[0]!);
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(screen.getByTestId("selection-action-assign-logistics")).toBeTruthy();
    expect(screen.getByTestId("selection-action-edit-delivery")).toBeTruthy();
    fireEvent.click(rowBoxes[1]!);
    expect(screen.queryByTestId("selection-action-edit-delivery")).toBeNull();
    expect(screen.getByTestId("selection-action-assign-logistics")).toBeTruthy();
  });

  it("a selected row that already has a partner turns the act into the governed Change logistics — never a bulk replacement", () => {
    ordersState.data = { orders: [order({ id: "u1", so: 1401 }), order({ id: "u2", so: 1402 })] };
    arrangementsState.data = {
      arrangements: [arrangement({ order_id: "u1", partner_id: "p-nets", partner_name: "NETS" })],
    };
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date");
    const rowBoxes = screen.getAllByRole("checkbox").slice(1);
    fireEvent.click(rowBoxes[0]!);
    expect(screen.getByTestId("selection-action-change-logistics")).toBeTruthy();
    expect(screen.queryByTestId("selection-action-assign-logistics")).toBeNull();
    fireEvent.click(rowBoxes[1]!);
    expect(screen.queryByTestId("selection-action-change-logistics")).toBeNull();
    expect(screen.queryByTestId("selection-action-assign-logistics")).toBeNull();
  });

  it("changing the filter clears the selection", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_logistics");
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(screen.getByText("3 selected")).toBeTruthy();
    fireEvent.click(screen.getByTestId("delivery-monitor-work-no_confirmed_date"));
    expect(screen.queryByText(/\d selected/)).toBeNull();
  });
});

describe("the URL is the state", () => {
  beforeEach(seedTwoScopes);

  it("next REPLACES the displayed work week and writes the date to the URL", () => {
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByRole("button", { name: "Next days" }));
    expect(screen.getByTestId("location-probe").textContent).toContain("date=2026-09-11");
    expect(screen.queryByTestId("delivery-monitor-day-2026-09-04")).toBeNull();
    expect(screen.getByText("No deliveries are scheduled from Mon, 7 Sep to Sat, 12 Sep.")).toBeTruthy();
  });

  it("a shared URL restores the same week — the retired ?start= and ?view=calendar spellings included", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&start=2026-08-27&view=calendar");
    expect(screen.queryByTestId("delivery-monitor-day-2026-09-04")).toBeNull();
    expect(screen.getByText("No deliveries are scheduled from Mon, 24 Aug to Sat, 29 Aug.")).toBeTruthy();
  });

  it("a rail pick and the search ride the URL", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery");
    fireEvent.click(screen.getByTestId("delivery-monitor-work-no_confirmed_date"));
    expect(screen.getByTestId("location-probe").textContent).toContain("view=no_confirmed_date");
  });

  it("the search rides the URL from the calendar toolbar", () => {
    wrap(<OperationDelivery />);
    fireEvent.change(screen.getByPlaceholderText("Search deliveries…"), { target: { value: "aida" } });
    expect(screen.getByTestId("location-probe").textContent).toContain("q=aida");
  });

  it("the retired ?schedule= and ?checking= spellings still resolve", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&schedule=no_confirmed_date");
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(screen.getByTestId("delivery-monitor-work-no_confirmed_date").getAttribute("aria-pressed")).toBe("true");
  });

  it("a retired ?view=waiting_warehouse (once a queue) resolves to the DELIVERY STATUS filter", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=waiting_warehouse");
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "DELIVERY STATUS" })).toHaveTextContent("Waiting for warehouse");
    expect(screen.getByText("SO-1322")).toBeTruthy();
    expect(screen.queryByText("SO-1323")).toBeNull();
  });

  it("a restored filter URL narrows without a click", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&logistics=p-nets");
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(screen.getByText("SO-1323")).toBeTruthy();
    expect(screen.queryByText("SO-1322")).toBeNull();
  });

  it("a carried-over ?q= never narrows the WORK LIST invisibly — the grid's own search is the one search there", () => {
    ordersState.data!.orders.push(order({ id: "c", so: 1324, customer_name: "tan mei ling" }));
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date&q=aida");
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(screen.getByText("SO-1324")).toBeTruthy();
  });
});

describe("a Journey row on the work list", () => {
  it("names its route, never the word Leg; its door carries the leg in the URL only", () => {
    ordersState.data = {
      orders: [
        order({
          id: "j",
          so: 1350,
          customer_name: "tan ah seng",
          delivery_stops: [
            { leg: 1, partner_id: "3d0a2b6e-0000-4000-8000-000000000001", partner_name: "TEOW", from_loc: "Klang WH", to_loc: "JB transit", scheduled_at: null, status: "pending" },
            { leg: 2, partner_id: null, partner_name: null, from_loc: "JB transit", to_loc: "Singapore customer", scheduled_at: null, status: "pending" },
          ],
        } as Partial<operationOrderListRow> & { id: string; so: number }),
      ],
    };
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=all");
    const list = screen.getByTestId("delivery-monitor-work-list");
    expect(within(list).getByText("Klang WH → JB transit")).toBeTruthy();
    expect(within(list).getByText("2 deliveries")).toBeTruthy();
    expect(list.textContent).not.toMatch(/\bLeg\b/);
    expect(list.textContent).not.toMatch(/\bscopes?\b/i);
  });
});

describe("mobile is only ever the Day list", () => {
  beforeEach(() => {
    viewportWidth = 375;
    seedTwoScopes();
  });

  it("shows one selected operating day — never the Week or Month grid, whatever the URL asks", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=month");
    expect(screen.getByTestId("delivery-monitor-daily")).toBeTruthy();
    expect(screen.getByTestId("delivery-monitor-card-a")).toBeTruthy();
    expect(screen.queryByTestId("delivery-monitor-day-2026-09-04")).toBeNull();
    expect(screen.queryByTestId("delivery-monitor-month-view")).toBeNull();
    /* No Day · Week · Month control on a phone. */
    expect(screen.queryByTestId("delivery-monitor-calendar-view")).toBeNull();
  });

  it("the date heading is sticky and each card row is at least 44px tall", () => {
    wrap(<OperationDelivery />);
    const daily = screen.getByTestId("delivery-monitor-daily");
    expect(within(daily).getByText("Fri, 4 Sep").className).toContain("sticky");
    expect(screen.getByTestId("delivery-monitor-card-a").className).toContain("min-h-11");
  });

  it("previous/next moves one operating day and skips Sunday", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&day=2026-09-05");
    fireEvent.click(screen.getByRole("button", { name: "Next days" }));
    expect(screen.getByTestId("location-probe").textContent).toContain("date=2026-09-07");
    fireEvent.click(screen.getByRole("button", { name: "Previous days" }));
    expect(screen.getByTestId("location-probe").textContent).toContain("date=2026-09-05");
  });

  it("the full month opens through the kit's standard date control", () => {
    wrap(<OperationDelivery />);
    expect(within(screen.getByTestId("delivery-monitor-date-control")).getByRole("button")).toBeTruthy();
  });

  it("a Sunday deep link lands on the next operating day", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&day=2026-09-06");
    expect(within(screen.getByTestId("delivery-monitor-daily")).getByText("Mon, 7 Sep")).toBeTruthy();
  });

  it("uses the identical card link arithmetic as desktop", () => {
    wrap(<OperationDelivery />);
    expect(screen.getByTestId("delivery-monitor-card-a").closest("a")?.getAttribute("href")).toBe(
      "/operation/delivery-orders/do-row-1",
    );
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
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_logistics");
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(screen.queryByTestId("delivery-monitor-daily")).toBeNull();
  });
});

describe("tablet Week is a fixed three-day window", () => {
  beforeEach(() => {
    viewportWidth = 1024;
    seedTwoScopes();
  });

  it("shows the aligned half-week containing the date — never a horizontal scroll", () => {
    wrap(<OperationDelivery />);
    for (const day of ["2026-09-03", "2026-09-04", "2026-09-05"]) {
      expect(screen.getByTestId(`delivery-monitor-day-${day}`)).toBeTruthy();
    }
    expect(screen.queryByTestId("delivery-monitor-day-2026-08-31")).toBeNull();
    expect(screen.getByText(/Thu, 3 Sep\s*–\s*Sat, 5 Sep/)).toBeTruthy();
  });

  it("previous/next replaces the visible three-day window", () => {
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByRole("button", { name: "Previous days" }));
    expect(screen.getByTestId("location-probe").textContent).toContain("date=2026-09-01");
    expect(screen.getByText("No deliveries are scheduled from Mon, 31 Aug to Wed, 2 Sep.")).toBeTruthy();
  });

  it("Day and Month still answer on a tablet, and the rail month calendar stays available", () => {
    wrap(<OperationDelivery />);
    expect(screen.getByTestId("delivery-monitor-month-calendar")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Month" }));
    expect(screen.getByTestId("delivery-monitor-month-view")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Day" }));
    expect(screen.getByTestId("delivery-monitor-daily")).toBeTruthy();
  });
});

/* ── THE CHASE: what the customer asked for, and who must answer ───────── */

describe("`No confirmed date` — the requested-vs-confirmed chase", () => {
  /** Four customers, three different requested days, seeded out of order. */
  function seedChase() {
    ordersState.data = {
      orders: [
        order({ id: "late", so: 1503, customer_name: "tan mei ling", delivery_date: "2026-09-30" }),
        order({ id: "none", so: 1504, customer_name: "wong ah kaw", delivery_date: null }),
        order({ id: "early", so: 1501, customer_name: "aida rahim", delivery_date: "2026-09-10" }),
        order({ id: "mid", so: 1502, delivery_date: "2026-09-20" }),
      ],
    };
    arrangementsState.data = {
      arrangements: [
        arrangement({ order_id: "early", partner_id: "p-nets", partner_name: "NETS" }),
      ],
    };
  }

  const headers = () =>
    screen.getAllByRole("columnheader").map((h) => (h.textContent ?? "").trim());

  it("shows `Requested Delivery Date` by default — no Columns chooser needed", () => {
    seedChase();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date");
    expect(headers().some((h) => h.includes("Requested Delivery Date"))).toBe(true);
  });

  it("answers the confirmed date ON the requested-date cell — never behind a chooser", () => {
    seedChase();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date");
    /* The 2026-09-09 adjacency ruling, kept inside the 2026-09-10 column
       order: the two dates are one cell's two lines, so *what did they ask
       for, and has anybody agreed a day?* is still one glance. The sortable
       columns stay in the chooser for the sheet's own filtering and export. */
    const grid = screen.getByTestId("delivery-monitor-work-list");
    expect(within(grid).getAllByText("No confirmed date").length).toBeGreaterThan(0);
    const found = headers();
    expect(found.some((h) => h.includes("Requested Delivery Date"))).toBe(true);
    for (const retired of ["Customer Delivery", "Promised Delivery", "Deliver By"]) {
      expect(found.some((h) => h.includes(retired))).toBe(false);
    }
  });

  it("prints the ruled default column order (owner ruling 2026-09-10)", () => {
    seedChase();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date");
    const ruled = [
      "SO No",
      "Customer",
      "State",
      "Requested Delivery Date",
      "Items",
      "Accessories & services",
      "Expected arrival",
      "Stock",
      "Actions",
      "Edit Delivery",
    ];
    const found = headers();
    const at = (label: string) => found.findIndex((h) => h.includes(label));
    expect(ruled.every((label) => at(label) >= 0)).toBe(true);
    expect(ruled.map(at)).toEqual([...ruled.map(at)].sort((a, b) => a - b));
    /* The six superseded columns are in the CHOOSER, not deleted — a document
       register must still be able to sort and export by them. */
    for (const chooserOnly of ["Confirmed Delivery", "DO No", "Delivery Location", "Goods"]) {
      expect(found.some((h) => h.includes(chooserOnly))).toBe(false);
    }
  });

  it("orders the rows by Requested Delivery Date, earliest first, absences last", () => {
    seedChase();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date");
    const text = screen.getByTestId("delivery-monitor-work-list").textContent ?? "";
    const seen = ["SO-1501", "SO-1502", "SO-1503", "SO-1504"].map((so) => text.indexOf(so));
    expect(seen.every((i) => i >= 0)).toBe(true);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it("a row with NO Logistics Partner offers `Assign logistics`", () => {
    seedChase();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date");
    const button = screen.getByTestId("delivery-monitor-action-assign_logistics-mid");
    expect(button.textContent).toBe("Assign logistics");
    fireEvent.click(button);
    const dialog = screen.getByTestId("assign-logistics-dialog");
    expect(within(dialog).getByText("1 delivery")).toBeTruthy();
  });

  it("a row WITH a Logistics Partner says `Call {partner} — confirm delivery date`", () => {
    seedChase();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date");
    /* The QUEUE is named after the customer conversation; the ROW names who
       the operator actually dials (MASTER §2 — the partner arranges the day
       with the customer), through the governed dictionary line. */
    expect(screen.getByText("Call NETS — confirm delivery date")).toBeTruthy();
    expect(screen.getByTestId("delivery-monitor-edit-early").textContent).toBe("Edit Delivery");
    /* No employee and no carrier is ever hard-coded into the sentence. */
    for (const name of ["Chan", "Tan Ah", "Khor Yee"]) {
      expect(screen.queryByText(new RegExp(`Call ${name}`))).toBeNull();
    }
  });

  it("`Edit Delivery` opens THIS order and carries the queue back with it", () => {
    seedChase();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date&region=Selangor");
    fireEvent.click(screen.getByTestId("delivery-monitor-edit-early"));
    const url = screen.getByTestId("location-probe").textContent ?? "";
    expect(url).toContain("/operation/delivery/edit/early");
    expect(url).toContain("view%3Dno_confirmed_date");
    expect(url).toContain("region%3DSelangor");
  });

  it("a row whose arrangement is FINISHED leaves the queue and joins the calendar", () => {
    ordersState.data = { orders: [order({ id: "early", so: 1501, delivery_date: "2026-09-10" })] };
    arrangementsState.data = {
      arrangements: [
        arrangement({
          order_id: "early",
          partner_id: "p-nets",
          partner_name: "NETS",
          confirmed_date: "2026-09-04",
          /* BOTH halves — a day AND a window. A day alone keeps the row in the
             contact queue (owner ruling 2026-09-11). */
          confirmed_time: "09:00–11:00",
        }),
      ],
    };
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date");
    expect(screen.queryByText("SO-1501")).toBeNull();
    /* The queue is empty because the work LEFT it — the workspace still holds
       the row, so the governed filtered-empty word is the honest one. */
    expect(screen.getByText(MONITOR_COPY.emptySearch)).toBeTruthy();

    cleanup();
    wrap(<OperationDelivery />, "/operation?tab=delivery&date=2026-09-04&view=day");
    const day = screen.getByTestId("delivery-monitor-daily");
    expect(within(day).getByText("Kong Chai Yin")).toBeTruthy();
  });

  it("never prints `scope` or `leg` while the chase is on screen", () => {
    seedChase();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date");
    expect(document.body.textContent).not.toMatch(/\bscopes?\b/i);
    expect(document.body.textContent).not.toMatch(/\bleg\b/i);
  });

  it("the act is also one right-click away — `Actions` is the twelfth column and a sheet scrolls", () => {
    seedChase();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date");
    const count = (name: string) => screen.queryAllByRole("button", { name }).length;
    const assignsOnSheet = count("Assign logistics");
    const editsOnSheet = count("Edit Delivery");

    /* A row nobody carries: the menu adds BOTH doors. */
    fireEvent.contextMenu(screen.getByText("SO-1502"));
    expect(count("Assign logistics")).toBe(assignsOnSheet + 1);
    expect(count("Edit Delivery")).toBe(editsOnSheet + 1);

    /* A row a partner already carries: the editor only — a partner is never
       silently swapped from a context menu (`Change logistics` is the
       governed act, and it asks for its reason). */
    fireEvent.contextMenu(screen.getByText("SO-1501"));
    expect(count("Assign logistics")).toBe(assignsOnSheet);
    expect(count("Edit Delivery")).toBe(editsOnSheet + 1);
  });

  it("keeps selection, the ▸ expansion and the per-column filters", () => {
    seedChase();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date");
    /* Header select-all + one checkbox per row. */
    expect(screen.getAllByRole("checkbox").length).toBe(5);
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(screen.getByText("4 selected")).toBeTruthy();
    /* `Clear filters` clears the NARROWINGS and stays on the work list (owner
       ruling 2026-09-10); the tab is the only thing that changes the view. */
    fireEvent.click(screen.getByTestId("delivery-monitor-clear-filters"));
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(screen.getByTestId("location-probe").textContent).toContain("view=all");
  });
});

describe("the phone's chase list", () => {
  it("is a readable list — the requested date, the partner and the act, with no Columns chooser", () => {
    viewportWidth = 390;
    ordersState.data = {
      orders: [order({ id: "early", so: 1501, delivery_date: "2026-09-10" })],
    };
    arrangementsState.data = {
      arrangements: [
        arrangement({ order_id: "early", partner_id: "p-nets", partner_name: "NETS" }),
      ],
    };
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date");
    const card = screen.getByTestId("delivery-monitor-work-card-early");
    expect(within(card).getByText("Requested Delivery Date")).toBeTruthy();
    expect(within(card).getByText("Thu, 10 Sep")).toBeTruthy();
    expect(within(card).getByText("Logistics Partner")).toBeTruthy();
    expect(within(card).getByText("NETS")).toBeTruthy();
    expect(within(card).getByText("Call NETS — confirm delivery date")).toBeTruthy();
    expect(within(card).getByText("Edit Delivery")).toBeTruthy();
    /* Not the desktop sheet squeezed: no grid, no Columns control. */
    expect(screen.queryByRole("columnheader")).toBeNull();
    expect(screen.queryByRole("button", { name: "Columns" })).toBeNull();
  });

  it("carries its OWN search box — a carried-over ?q= never narrows it invisibly", () => {
    viewportWidth = 390;
    ordersState.data = {
      orders: [
        order({ id: "early", so: 1501, customer_name: "aida rahim", delivery_date: "2026-09-10" }),
        order({ id: "mid", so: 1502, customer_name: "tan mei ling", delivery_date: "2026-09-20" }),
      ],
    };
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date&q=aida");
    /* The URL search is ignored on a work list — both rows are here. */
    expect(screen.getByTestId("delivery-monitor-work-card-early")).toBeTruthy();
    expect(screen.getByTestId("delivery-monitor-work-card-mid")).toBeTruthy();
    expect(screen.getByTestId("delivery-monitor-work-list-footer").textContent).toBe(
      "2 deliveries",
    );
    /* Typing in the visible box does narrow it, and says so. */
    fireEvent.change(screen.getByTestId("delivery-monitor-work-list-search"), {
      target: { value: "aida" },
    });
    expect(screen.queryByTestId("delivery-monitor-work-card-mid")).toBeNull();
    expect(screen.getByTestId("delivery-monitor-work-list-footer").textContent).toBe(
      "1 of 2 deliveries",
    );
  });

  it("keeps the filter drawer reachable and offers `Assign logistics` one delivery at a time", () => {
    viewportWidth = 390;
    ordersState.data = { orders: [order({ id: "mid", so: 1502, delivery_date: "2026-09-20" })] };
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date");
    expect(screen.getByTestId("delivery-monitor-show-filters")).toBeTruthy();
    fireEvent.click(screen.getByTestId("delivery-monitor-action-assign_logistics-mid"));
    const dialog = screen.getByTestId("assign-logistics-dialog");
    expect(within(dialog).getByText("1 delivery")).toBeTruthy();
  });
});

/* ── THE CONTACT WEEK, AND THE ROW'S FOUR NEW CELLS (2026-09-10) ────────── */

describe("Call customer — the contact week", () => {
  /** Three chases with three different contact deadlines, one already late. */
  function seedContacts() {
    ordersState.data = {
      orders: [
        /* T−3 (Mon–Sat, Malaysian holidays) from Fri 11 Sep = Tue 8 Sep. */
        order({ id: "soon", so: 1601, customer_name: "aida rahim", delivery_date: "2026-09-11" }),
        /* From Sat 12 Sep = Wed 9 Sep. */
        order({ id: "later", so: 1602, customer_name: "tan mei ling", delivery_date: "2026-09-12" }),
        /* From Fri 28 Aug = Mon 24 Aug — already behind TODAY (4 Sep). */
        order({ id: "late", so: 1603, customer_name: "wong ah kaw", delivery_date: "2026-08-28" }),
      ],
    };
    arrangementsState.data = {
      arrangements: [
        arrangement({ order_id: "soon", partner_id: "p-nets", partner_name: "NETS" }),
        arrangement({ order_id: "later", partner_id: "p-al", partner_name: "AL" }),
        arrangement({ order_id: "late", partner_id: "p-nets", partner_name: "NETS" }),
      ],
    };
  }

  it("appears under Call customer and NOWHERE else — these are contact dates", () => {
    seedContacts();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date&date=2026-09-08");
    const strip = screen.getByTestId("delivery-monitor-contact-week");
    expect(within(strip).getByText("Contact deadlines — not supplier or delivery dates")).toBeTruthy();

    cleanup();
    seedContacts();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=all");
    expect(screen.queryByTestId("delivery-monitor-contact-week")).toBeNull();
  });

  it("is Monday to Saturday with per-day COUNTS, and picking a day narrows the list", () => {
    seedContacts();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date&date=2026-09-08");
    const strip = screen.getByTestId("delivery-monitor-contact-week");
    for (const iso of [
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]) {
      expect(within(strip).getByTestId(`delivery-monitor-contact-day-${iso}`)).toBeTruthy();
    }
    /* Sunday is never an operating day and never a contact deadline. */
    expect(within(strip).queryByTestId("delivery-monitor-contact-day-2026-09-13")).toBeNull();
    expect(
      within(strip).getByTestId("delivery-monitor-contact-day-2026-09-08").textContent,
    ).toContain("1");

    fireEvent.click(within(strip).getByTestId("delivery-monitor-contact-day-2026-09-08"));
    expect(screen.getByTestId("location-probe").textContent).toContain("due=2026-09-08");
    const list = screen.getByTestId("delivery-monitor-work-list");
    expect(within(list).getByText("SO-1601")).toBeTruthy();
    expect(within(list).queryByText("SO-1602")).toBeNull();
  });

  it("keeps OVERDUE contact work discoverable from every date", () => {
    seedContacts();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date&date=2026-09-08");
    const chip = screen.getByTestId("delivery-monitor-contact-overdue");
    /* The chip carries its own live count, so a quiet week never hides it. */
    expect(chip.textContent).toContain("1");
    fireEvent.click(chip);
    expect(screen.getByTestId("location-probe").textContent).toContain("late=1");
    const list = screen.getByTestId("delivery-monitor-work-list");
    expect(within(list).getByText("SO-1603")).toBeTruthy();
    expect(within(list).queryByText("SO-1601")).toBeNull();
  });

  it("prints the deadline on the row, and the LATE one keeps the day it missed", () => {
    seedContacts();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date&late=1");
    const late = screen.getByTestId("delivery-monitor-contact-late");
    /* ⭐ THE COMPACT CELL IS A PHONE AND A DATE (owner ruling 2026-09-11) —
       `Call by` and `Late — was due` repeated the same two phrases down a
       whole column, and the icon plus its colour already carry both. */
    expect(late.textContent).toBe("Mon, 24 Aug");
    /* The WORDS did not disappear: the tooltip and the accessible name say
       what the date means AND that the deadline does not move. */
    const sentence = "Contact deadline Mon, 24 Aug — overdue, the deadline does not move";
    expect(late.getAttribute("title")).toBe(sentence);
    expect(late.getAttribute("aria-label")).toBe(sentence);
    /* ONE accessible name for the cell — the icon inside it is decorative, so
       a screen reader never reads the same sentence twice. */
    expect(late.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("an order with NO confirmed delivery date stays in the queue", () => {
    seedContacts();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date");
    const list = screen.getByTestId("delivery-monitor-work-list");
    for (const so of ["SO-1601", "SO-1602", "SO-1603"]) {
      expect(within(list).getByText(so)).toBeTruthy();
    }
  });

  it("never infers a customer's answer from a missing date", () => {
    seedContacts();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date");
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/Waiting for customer reply/i);
    expect(text).not.toMatch(/Customer did not/i);
  });
});

describe("the row's goods, arrival and stock cells", () => {
  function seedGoods(over: Partial<operationOrderListRow> = {}) {
    ordersState.data = {
      orders: [
        order({
          id: "g",
          so: 1701,
          delivery_date: "2026-09-30",
          delivery_floor: 3,
          delivery_has_lift: false,
          order_lines: [
            { id: "l-1", sku: "mattress:M1401F-K", qty: 2, label: "Serena · King" },
            { id: "l-2", sku: "Pillow soft", qty: 2 },
          ],
          order_addons: [{ addon_key: "dispose-mattress", qty: 1 }],
          allocated_units: [{ sku: "mattress:M1401F-K", status: "reserved", qty: 1 }],
          ...over,
        }),
      ],
    };
  }

  it("Items and Accessories & services are TWO cells, with the exact shortage", () => {
    seedGoods();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=all");
    const list = screen.getByTestId("delivery-monitor-work-list");
    expect(within(list).getByText(/Serena · King/)).toBeTruthy();
    /* ONE piece missing on the mattress line, TWO on the pillows — the exact
       number, on the line it belongs to. */
    expect(within(list).getByText(/Serena · King × 2/).textContent).toContain("1 short");
    expect(within(list).getByText(/Pillow/).textContent).toContain("2 short");
    /* The site the crew meets rides the services cell — it is what decides
       whether the job needs more people. */
    expect(within(list).getByText("Floor 3 · No lift")).toBeTruthy();
  });

  it("Expected arrival keeps the DATE first and the original beside a revision", () => {
    seedGoods({
      po_arrivals: [
        {
          poId: "PO-1",
          status: "open",
          owedSkus: ["mattress:M1401F-K"],
          plannedIso: "2026-09-20",
          originalIso: "2026-09-20",
          reply: {
            answer: "delayed",
            aboutIso: "2026-09-20",
            previousIso: null,
            newIso: "2026-09-28",
            recordedAt: "2026-09-05T00:00:00Z",
          },
        },
      ],
    });
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=all");
    const cell = screen.getByTestId("delivery-monitor-arrival-moved");
    /* ⭐ THE DATE IS THE CELL (owner ruling 2026-09-11). The NEW date leads,
       the original sits under it as context, and `Delayed` no longer repeats
       under every row — the icon and the tooltip carry the meaning. */
    expect(cell.textContent).toBe("Mon, 28 SepSun, 20 Sep");
    expect(cell.textContent).not.toContain("Delayed");
    const sentence = "Expected arrival Mon, 28 Sep · Delayed · PO Delivery Date Sun, 20 Sep";
    expect(cell.getAttribute("title")).toBe(sentence);
    expect(cell.getAttribute("aria-label")).toBe(sentence);
    /* A revision ALWAYS shows the new date — never a lone delay symbol. */
    expect(cell.querySelector("svg")).toBeTruthy();
  });

  it("no revised date states the truthful unresolved gap and invents nothing", () => {
    seedGoods({
      po_arrivals: [
        {
          poId: "PO-1",
          status: "open",
          owedSkus: ["mattress:M1401F-K"],
          plannedIso: null,
          originalIso: null,
          reply: null,
        },
      ],
    });
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=all");
    /* ⭐ THREE DIFFERENT ABSENCES, NEVER ONE (owner ruling 2026-09-11). Nobody
       asked and nobody could compute a date: the gap is OURS, and blaming a
       factory nobody contacted is the lie the single old state used to tell. */
    const cell = screen.getByTestId("delivery-monitor-arrival-no_calculation");
    expect(cell.textContent).toBe("No expected arrival calculated");
    expect(cell.textContent).not.toContain("The factory has not given a date");
    /* Nothing that looks like a date is printed beside the absence. */
    expect(cell.textContent).not.toMatch(/\d{1,2}\s(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/);
  });

  it("a supplier who ANSWERED with no new day is the factory's own absence", () => {
    seedGoods({
      po_arrivals: [
        {
          poId: "PO-1",
          status: "open",
          owedSkus: ["mattress:M1401F-K"],
          plannedIso: null,
          originalIso: null,
          reply: {
            answer: "delayed",
            aboutIso: null,
            previousIso: null,
            newIso: null,
            recordedAt: "2026-09-05T00:00:00Z",
          },
        },
      ],
    });
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=all");
    const cell = screen.getByTestId("delivery-monitor-arrival-late_no_date");
    expect(cell.textContent).toBe("The factory has not given a date");
  });

  it("a supplier date behind us wears AMBER, and red stays on the late CALL", () => {
    seedGoods({
      po_arrivals: [
        {
          poId: "PO-1",
          status: "open",
          owedSkus: ["mattress:M1401F-K"],
          plannedIso: "2026-08-01",
          originalIso: "2026-08-01",
          reply: null,
        },
      ],
    });
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=all");
    const cell = screen.getByTestId("delivery-monitor-arrival-passed");
    /* Compact: the amber icon and the date. The fact is in the sentence. */
    expect(cell.textContent).toBe("Sat, 1 Aug");
    expect(cell.getAttribute("title")).toBe(
      "Expected arrival Sat, 1 Aug · Supplier delivery date passed",
    );
    expect(cell.innerHTML).toContain("kit-amber-11");
    /* The supplier exception is LOCAL — it never paints the row or the page,
       and RED belongs to the overdue customer call. */
    expect(cell.innerHTML).not.toContain("kit-red-");
  });

  it("Stock is its own cell and stays separate from the arrival date", () => {
    seedGoods();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=all");
    const list = screen.getByTestId("delivery-monitor-work-list");
    expect(within(list).getByText("Not ready")).toBeTruthy();
    /* The whole delivery is three pieces short — the shipment scope, never
       the main goods alone, and never a service that moves no Unit. */
    expect(within(list).getByText("3 short")).toBeTruthy();
  });

  it("the arrival icons carry real labels, so colour is never the only signal", () => {
    seedGoods({
      po_arrivals: [
        {
          poId: "PO-1",
          status: "open",
          owedSkus: ["mattress:M1401F-K"],
          plannedIso: "2026-08-01",
          originalIso: "2026-08-01",
          reply: null,
        },
      ],
    });
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=all");
    /* ⭐ ONE accessible name per cell, not one per glyph. The icon is
       decorative; the CELL carries the sentence, so a screen reader reads the
       meaning once instead of hearing it twice. */
    const cell = screen.getByTestId("delivery-monitor-arrival-passed");
    expect(cell.getAttribute("aria-label")).toContain("Supplier delivery date passed");
    expect(cell.querySelectorAll("svg[aria-label]").length).toBe(0);
    expect(cell.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
