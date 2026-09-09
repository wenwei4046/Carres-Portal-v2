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
    wrap(<OperationDelivery />);
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
      "No confirmed date",
      "Overdue",
      "Failed Delivery",
      "Upload delivery proof",
      "Waiting for warehouse",
      "Ready for handover",
      "Out for delivery",
    ]) {
      expect(within(rail).getByText(row)).toBeTruthy();
    }
  });

  it("WORK TO DO keeps the ruled order, and Waiting for warehouse sits under DELIVERY STATUS only", () => {
    wrap(<OperationDelivery />);
    const rail = screen.getByTestId("delivery-monitor-rail");
    const rows = [
      "delivery-monitor-work-all",
      "delivery-monitor-work-no_logistics",
      "delivery-monitor-work-no_confirmed_date",
      "delivery-monitor-work-overdue",
      "delivery-monitor-work-failed",
      "delivery-monitor-work-upload_proof",
      "delivery-monitor-status-waiting_warehouse",
      "delivery-monitor-status-ready_for_handover",
      "delivery-monitor-status-out_for_delivery",
    ].map((id) => within(rail).getByTestId(id));
    for (let i = 1; i < rows.length; i += 1) {
      expect(
        rows[i - 1]!.compareDocumentPosition(rows[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(within(rail).getAllByText("No logistics picked")).toHaveLength(1);
    expect(within(rail).getAllByText("Waiting for warehouse")).toHaveLength(1);
    expect(within(rail).queryByTestId("delivery-monitor-work-waiting_warehouse")).toBeNull();
  });

  it("STATE lists direct state names from the real records — no sub-group headings", () => {
    wrap(<OperationDelivery />);
    const rail = screen.getByTestId("delivery-monitor-rail");
    expect(within(rail).getByText("Selangor")).toBeTruthy();
    for (const heading of ["EAST MALAYSIA", "WEST MALAYSIA", "SINGAPORE", "KLANG VALLEY"]) {
      expect(within(rail).queryByText(heading)).toBeNull();
    }
  });

  it("LOGISTICS PARTNER lists only governed partners genuinely carrying rows — no invented company, no duplicated No logistics picked row", () => {
    wrap(<OperationDelivery />);
    const rail = screen.getByTestId("delivery-monitor-rail");
    expect(within(rail).getByText("NETS")).toBeTruthy();
    expect(within(rail).queryByText("AL")).toBeNull();
    expect(within(rail).queryByText("HOUZS")).toBeNull();
    expect(within(rail).queryByTestId("delivery-monitor-logistics-none")).toBeNull();
  });

  it("the rail carries the COMPLETE month calendar fixed above the scrolling filters", () => {
    wrap(<OperationDelivery />);
    const calendar = screen.getByTestId("delivery-monitor-month-calendar");
    expect(within(calendar).getByText(/September 2026/i)).toBeTruthy();
    fireEvent.click(within(calendar).getByRole("button", { name: "Previous month" }));
    expect(within(calendar).getByText(/August 2026/i)).toBeTruthy();
    fireEvent.click(within(calendar).getByRole("button", { name: "Next month" }));
    expect(within(calendar).getByText(/September 2026/i)).toBeTruthy();
    const rail = screen.getByTestId("delivery-monitor-rail");
    const scrollRegion = rail.querySelector(".overflow-y-auto");
    expect(scrollRegion).toBeTruthy();
    expect(scrollRegion!.contains(calendar)).toBe(false);
    const sunday = within(calendar).getByText("6").closest("button");
    expect(sunday?.disabled).toBe(true);
  });

  it("clicking a rail date opens that date's DAY view and clears the picked queue", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date&region=Selangor");
    const calendar = screen.getByTestId("delivery-monitor-month-calendar");
    fireEvent.click(within(calendar).getByText("15"));
    const probe = screen.getByTestId("location-probe").textContent ?? "";
    expect(probe).toContain("date=2026-09-15");
    expect(probe).toContain("view=day");
    expect(probe).not.toContain("region=");
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

  it("on the work list the control stays with nothing lit, and one click on Week returns the Calendar and clears every pick", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date&region=Selangor&status=waiting_warehouse");
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    const control = screen.getByTestId("delivery-monitor-calendar-view");
    for (const name of ["Day", "Week", "Month"]) {
      expect(within(control).getByRole("tab", { name }).getAttribute("aria-selected")).toBe("false");
    }
    fireEvent.click(within(control).getByRole("tab", { name: "Week" }));
    const probe = screen.getByTestId("location-probe").textContent ?? "";
    expect(probe).not.toContain("view=");
    expect(probe).not.toContain("region=");
    expect(probe).not.toContain("status=");
    expect(screen.getByTestId("delivery-monitor-day-2026-09-04")).toBeTruthy();
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
    fireEvent.click(within(empty).getByText("Open No confirmed date"));
    expect(screen.getByTestId("location-probe").textContent).toContain("view=no_confirmed_date");
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

describe("the projection rule — an operational pick renders the work list", () => {
  beforeEach(seedTwoScopes);

  it("a WORK TO DO pick replaces the calendar with the standard DataGrid", () => {
    ordersState.data!.orders.push(order({ id: "c", so: 1324, customer_name: "tan mei ling" }));
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByTestId("delivery-monitor-work-no_confirmed_date"));
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(screen.queryByTestId("delivery-monitor-day-2026-09-04")).toBeNull();
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

  it("a STATE pick also renders the work list — the card wall is calendar-only", () => {
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByTestId("delivery-monitor-region-Selangor"));
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(screen.queryByTestId("delivery-monitor-card-a")).toBeNull();
  });

  it("a LOGISTICS PARTNER pick renders the work list narrowed to that partner", () => {
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByTestId("delivery-monitor-logistics-p-nets"));
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    expect(screen.getByText("SO-1323")).toBeTruthy();
    expect(screen.queryByText("SO-1322")).toBeNull();
  });

  it("a DELIVERY STATUS pick is a filter over recorded progress — Waiting for warehouse lists the arranged-but-not-ready rows", () => {
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByTestId("delivery-monitor-status-waiting_warehouse"));
    expect(screen.getByTestId("location-probe").textContent).toContain("status=waiting_warehouse");
    expect(screen.getByTestId("delivery-monitor-work-list")).toBeTruthy();
    /* SO-1322 holds a live DO with no handover yet — Waiting for warehouse. */
    expect(screen.getByText("SO-1322")).toBeTruthy();
    expect(screen.queryByText("SO-1323")).toBeNull();
    expect(screen.getByTestId("delivery-monitor-filter-summary").textContent).toContain("Waiting for warehouse");
  });

  it("combined active filters print above the list, and Clear filters returns to the Week calendar", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date&region=Selangor");
    const summary = screen.getByTestId("delivery-monitor-filter-summary");
    expect(summary.textContent).toContain("No confirmed date · Selangor");
    fireEvent.click(screen.getByTestId("delivery-monitor-clear-filters"));
    const probe = screen.getByTestId("location-probe").textContent ?? "";
    expect(probe).not.toContain("view=");
    expect(probe).not.toContain("region=");
    expect(screen.queryByTestId("delivery-monitor-work-list")).toBeNull();
    expect(screen.getByTestId("delivery-monitor-day-2026-09-04")).toBeTruthy();
  });

  it("a legacy ?logistics=none URL still narrows and still prints its label", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date&logistics=none");
    expect(screen.getByTestId("delivery-monitor-filter-summary").textContent).toContain(
      "No confirmed date · No logistics picked",
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
        ops_order_control: { delivery_photos: [{ path: "p.jpg", at: "2026-09-03T11:00:00Z", by: null }] },
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
    wrap(<OperationDelivery />);
    expect(screen.getByTestId("delivery-monitor-work-upload_proof").textContent).toContain("2");
    fireEvent.click(screen.getByTestId("delivery-monitor-work-upload_proof"));
    expect(screen.getByTestId("location-probe").textContent).toContain("view=upload_proof");
    const list = screen.getByTestId("delivery-monitor-work-list");
    expect(within(list).getByText("SO-1325")).toBeTruthy();
    expect(within(list).getByText("SO-1326")).toBeTruthy();
    expect(within(list).queryByText("SO-1322")).toBeNull();
    const lines = within(list).getAllByTestId("delivery-monitor-missing-proof").map((el) => el.textContent);
    expect(lines).toContain("Upload delivery photo · Upload signed Delivery Order");
    expect(lines).toContain("Upload signed Delivery Order");
    /* The result word never changes. */
    expect(within(list).getAllByText("Delivered").length).toBe(2);
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
    expect(screen.getAllByText("No delivery order yet").length).toBe(3);
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
    wrap(<OperationDelivery />);
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
    expect(screen.getByTestId("delivery-monitor-status-waiting_warehouse").getAttribute("aria-pressed")).toBe("true");
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

  it("shows `Confirmed Delivery` as its OWN column — one date is never two names", () => {
    seedChase();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date");
    const found = headers();
    expect(found.some((h) => h.includes("Confirmed Delivery"))).toBe(true);
    expect(found.some((h) => h.includes("Confirmed Time"))).toBe(true);
    /* The customer's date and the operational answer stay separate words. */
    for (const retired of ["Customer Delivery", "Promised Delivery", "Deliver By"]) {
      expect(found.some((h) => h.includes(retired))).toBe(false);
    }
  });

  it("prints the ruled default column order, `Actions` last of the visible sheet", () => {
    seedChase();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date");
    const ruled = [
      "SO No",
      "Customer",
      "State",
      "Requested Delivery Date",
      "Logistics Partner",
      "Confirmed Delivery",
      "Confirmed Time",
      "DO No",
      "Delivery Location",
      "Goods",
      "Delivery Status",
      "Actions",
    ];
    const found = headers();
    const at = (label: string) => found.findIndex((h) => h.includes(label));
    expect(ruled.every((label) => at(label) >= 0)).toBe(true);
    expect(ruled.map(at)).toEqual([...ruled.map(at)].sort((a, b) => a - b));
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
    expect(screen.getByText("Call NETS — confirm delivery date")).toBeTruthy();
    expect(screen.getByTestId("delivery-monitor-action-confirm_date-early").textContent).toBe(
      "Edit Delivery",
    );
    /* No employee and no carrier is ever hard-coded into the sentence. */
    for (const name of ["Chan", "Tan Ah", "Khor Yee"]) {
      expect(screen.queryByText(new RegExp(`Call ${name}`))).toBeNull();
    }
  });

  it("`Edit Delivery` opens THIS order and carries the queue back with it", () => {
    seedChase();
    wrap(<OperationDelivery />, "/operation?tab=delivery&view=no_confirmed_date&region=Selangor");
    fireEvent.click(screen.getByTestId("delivery-monitor-action-confirm_date-early"));
    const url = screen.getByTestId("location-probe").textContent ?? "";
    expect(url).toContain("/operation/delivery/edit/early");
    expect(url).toContain("view%3Dno_confirmed_date");
    expect(url).toContain("region%3DSelangor");
  });

  it("a row whose date IS confirmed leaves the queue and joins the calendar", () => {
    ordersState.data = { orders: [order({ id: "early", so: 1501, delivery_date: "2026-09-10" })] };
    arrangementsState.data = {
      arrangements: [
        arrangement({
          order_id: "early",
          partner_id: "p-nets",
          partner_name: "NETS",
          confirmed_date: "2026-09-04",
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
    fireEvent.click(screen.getByTestId("delivery-monitor-clear-filters"));
    expect(screen.getByTestId("delivery-monitor-calendar-view")).toBeTruthy();
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
