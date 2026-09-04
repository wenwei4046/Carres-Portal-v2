/**
 * DELIVERY MONITOR — the calendar page, held as tests.
 * `CARD-2026-09-04-delivery-01-monitor-calendar`.
 *
 * The arithmetic is pinned in `delivery-monitor.test.ts`. What THIS file holds
 * is everything that could only go wrong once the numbers reach the screen:
 *
 *  1. **The shape** — one 50px Destination Header saying Monitor, one toolbar,
 *     one page-owned 240px rail, six operating-day columns.
 *  2. **One card, the approved fields** — and NO phone number, money, driver,
 *     vehicle or upload timestamp on any calendar card.
 *  3. **Every card is ONE link** to an existing formal page — an issued DO
 *     opens the Delivery Order, a scope without one opens Edit Delivery.
 *  4. **Nothing writes.** No checkbox, bulk toolbar, Save, upload, assignment,
 *     result or drag/drop. The register composition is gone.
 *  5. **The URL is the state** — date, filters and search ride it, so Back
 *     restores the same calendar.
 *  6. **Mobile is a one-day list** — the six-column grid never renders in a
 *     phone viewport, and previous/next skips Sunday.
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
let arrangementsState: { data: { arrangements: DeliveryArrangementRow[] } | undefined };

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationOrders: () => ordersState,
    useDeliveryPartners: () => partnersState,
    useDeliveryOrdersRegister: () => docsState,
    useDeliveryArrangements: () => arrangementsState,
  };
});

import OperationDelivery from "./OperationDelivery";

/** The Card's one consistent example: Friday, 4 September 2026. */
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
  arrangementsState = { data: { arrangements: [] } };
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

describe("the shape", () => {
  it("draws one 50px Destination Header saying Monitor", () => {
    wrap(<OperationDelivery />);
    const header = screen.getByTestId("delivery-monitor-destination-header");
    expect(header.className).toContain("h-[50px]");
    expect(
      within(header).getByTestId("delivery-monitor-destination-header-module-word").textContent,
    ).toBe("Monitor");
  });

  it("draws the page-owned 240px rail with the four filter groups", () => {
    wrap(<OperationDelivery />);
    const rail = screen.getByTestId("delivery-monitor-rail");
    expect(rail.className).toContain("w-[240px]");
    expect(within(rail).getByText("DELIVERY SCHEDULE")).toBeTruthy();
    expect(within(rail).getByText("NEEDS CHECKING")).toBeTruthy();
    expect(within(rail).getByText("REGION")).toBeTruthy();
    expect(within(rail).getByText("LOGISTICS")).toBeTruthy();
    expect(within(rail).getByText("Calendar")).toBeTruthy();
    expect(within(rail).getByText("No confirmed date")).toBeTruthy();
    expect(within(rail).getByText("Overdue")).toBeTruthy();
    expect(within(rail).getByText("Failed Delivery")).toBeTruthy();
    expect(within(rail).getByText("Delivered — Proof Required")).toBeTruthy();
    expect(within(rail).getByText("Waiting for warehouse")).toBeTruthy();
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

  it("an empty day speaks T10's governed sentence", () => {
    wrap(<OperationDelivery />);
    const day = screen.getByTestId("delivery-monitor-day-2026-09-08");
    expect(within(day).getByText("No deliveries booked this day.")).toBeTruthy();
  });

  it("draws no hour-by-hour vertical timeline", () => {
    wrap(<OperationDelivery />);
    expect(screen.queryByTestId("delivery-monitor-hour-axis")).toBeNull();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\b0[89]:00\b.*\b10:00\b.*\b11:00\b/);
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

  it("a card contains no nested button — the card IS the one click target", () => {
    wrap(<OperationDelivery />);
    const card = screen.getByTestId("delivery-monitor-card-a");
    expect(within(card).queryAllByRole("button")).toHaveLength(0);
  });
});

describe("nothing writes", () => {
  beforeEach(seedTwoScopes);

  it("renders no checkbox, bulk toolbar, Save, upload, assignment or result control", () => {
    wrap(<OperationDelivery />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    for (const word of [
      /new do/i,
      /^issue$/i,
      /release/i,
      /approve/i,
      /^save$/i,
      /upload/i,
      /assign/i,
      /record result/i,
    ]) {
      expect(screen.queryByRole("button", { name: word })).toBeNull();
    }
    expect(document.querySelector("[draggable='true']")).toBeNull();
  });

  it("the register composition is gone — no grid, no column chooser, no export", () => {
    wrap(<OperationDelivery />);
    expect(screen.queryByTestId("delivery-work-listing")).toBeNull();
    expect(screen.queryByRole("button", { name: /columns/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /export/i })).toBeNull();
  });

  it("never prints a banned relative-day or mood word", () => {
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

describe("the URL is the state", () => {
  beforeEach(seedTwoScopes);

  it("next moves six operating days and writes the first date to the URL", () => {
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByRole("button", { name: "Next days" }));
    expect(screen.getByTestId("location-probe").textContent).toContain("start=2026-09-10");
    expect(screen.getByTestId("delivery-monitor-day-2026-09-10")).toBeTruthy();
    expect(screen.queryByTestId("delivery-monitor-day-2026-09-03")).toBeNull();
  });

  it("a shared URL restores the same window — Back lands where it left", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&start=2026-08-27");
    expect(screen.getByTestId("delivery-monitor-day-2026-08-27")).toBeTruthy();
    expect(screen.queryByTestId("delivery-monitor-day-2026-09-04")).toBeNull();
  });

  it("a rail pick and the search ride the URL too", () => {
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByTestId("delivery-monitor-schedule-no_confirmed_date"));
    expect(screen.getByTestId("location-probe").textContent).toContain(
      "schedule=no_confirmed_date",
    );
    fireEvent.change(screen.getByPlaceholderText("Search deliveries…"), {
      target: { value: "aida" },
    });
    expect(screen.getByTestId("location-probe").textContent).toContain("q=aida");
  });

  it("a restored filter URL narrows the calendar without a click", () => {
    wrap(<OperationDelivery />, "/operation?tab=delivery&logistics=p-nets");
    expect(screen.queryByTestId("delivery-monitor-card-a")).toBeNull();
    expect(screen.getByTestId("delivery-monitor-card-b")).toBeTruthy();
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

  it("the rail becomes a filter drawer behind Show filters", () => {
    wrap(<OperationDelivery />);
    const rail = screen.getByTestId("delivery-monitor-rail");
    expect(rail.className).toContain("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Show filters" }));
    expect(screen.getByTestId("delivery-monitor-rail").className).not.toContain("hidden");
    expect(screen.getByRole("button", { name: "Hide filters" })).toBeTruthy();
  });
});
