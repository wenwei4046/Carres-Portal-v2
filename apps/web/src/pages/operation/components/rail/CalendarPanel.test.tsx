/**
 * CalendarPanel — T10 (delivery calendar as single source).
 *
 * The card's law is "reading the SAME booking fields — never a second store",
 * and the bug it fixes is that this panel used to bucket deliveries by
 * `orders.delivery_date` (what we PROMISED) instead of the D1 booking (when the
 * truck actually moves). These tests pin exactly that: a promise alone puts
 * nothing on a day, the booking decides the day, confirmed and the carrier's
 * own date read differently, and the T9 carrier rules speak on the day.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render as baseRender, screen, fireEvent, within } from "@testing-library/react";

import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";

function render(ui: ReactElement, route = "/operation?tab=receiving") {
  return baseRender(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

const h = vi.hoisted(() => ({
  orders: [] as unknown[],
  partners: [] as unknown[],
  warehouse: { data: { events: [], sites: [], undatedReceipts: 0 }, isPending: false, error: null } as any,
}));

vi.mock("@/lib/queries", () => ({
  useOperationOrders: () => ({ data: { orders: h.orders } }),
  useWarehouseCalendar: () => h.warehouse,
  useDeliveryPartners: () => ({ data: { partners: h.partners } }),
}));

import CalendarPanel from "./CalendarPanel";
import { fmtDate } from "@/lib/fmt-date";

// 2026-07-27 is a Monday — so "This week" runs Mon 27 Jul → Sat 1 Aug.
const TODAY = "2026-07-27";
const TOMORROW = "2026-07-28";

function order(over: Record<string, unknown> = {}) {
  return {
    id: `o-${Math.random().toString(36).slice(2)}`,
    so: 1207,
    status: "proceed_order",
    customer_name: "PETER",
    customer_address: null,
    delivery_date: null,
    delivery_date_tbd: false,
    delivery_partner_id: "p-nets",
    delivery_partners: { id: "p-nets", name: "NETS" },
    ops_assigned_logistic: null,
    ops_order_control: null,
    ...over,
  };
}

/** An order the customer confirmed for `date`. */
function confirmed(date: string, over: Record<string, unknown> = {}) {
  return order({
    ops_order_control: {
      booking_stage: "confirmed",
      confirmed_date: date,
      confirmed_time_slot: "Afternoon (12pm–3pm)",
    },
    ...over,
  });
}

/** An order with only the carrier's word for `date`. */
function provisional(date: string, over: Record<string, unknown> = {}) {
  return order({
    ops_order_control: { booking_stage: "provisional", logistic_eta: date },
    ...over,
  });
}

function day(iso: string) {
  return screen.queryByTestId(`calendar-day-${iso}`);
}

beforeEach(() => {
  h.orders = [];
  h.partners = [];
  h.warehouse = { data: { events: [], sites: [], undatedReceipts: 0 }, isPending: false, error: null };
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T09:00:00`));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("CalendarPanel — the day comes from the BOOKING, never the promise", () => {
  it("a promised date with nothing booked puts NO delivery on the day", () => {
    h.orders = [order({ so: 1204, delivery_date: TODAY, customer_name: "ella" })];
    render(<CalendarPanel />);
    const today = day(TODAY)!;
    expect(within(today).getByText("No dated events this day.")).toBeTruthy();
  });

  it("keeps undated booking work out of Calendar", () => {
    h.orders = [order({ so: 1204, delivery_date: TODAY, customer_name: "ella" })];
    render(<CalendarPanel />);
    const today = day(TODAY)!;
    expect(within(today).queryByText("Promised this day, no date yet")).toBeNull();
    expect(within(today).queryByText("Call ella — book delivery date")).toBeNull();
  });

  it("a booking on a DIFFERENT day than the promise lands on the booked day", () => {
    // The exact drift D1 created: promised today, actually booked tomorrow.
    h.orders = [confirmed(TOMORROW, { so: 1207, delivery_date: TODAY })];
    render(<CalendarPanel />);
    expect(within(day(TODAY)!).getByText("No dated events this day.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("calendar-range-tomorrow"));
    expect(within(day(TOMORROW)!).getByText("SO-1207")).toBeTruthy();
  });

  it("a delivered order's kept promise is not outstanding work", () => {
    h.orders = [order({ so: 1204, delivery_date: TODAY, status: "delivered" })];
    render(<CalendarPanel />);
    expect(within(day(TODAY)!).queryByText("Promised this day, no date yet")).toBeNull();
  });
});

describe("CalendarPanel — confirmed is the only green", () => {
  it("a confirmed booking shows the customer's slot", () => {
    h.orders = [confirmed(TODAY, { so: 1207 })];
    render(<CalendarPanel />);
    const row = within(day(TODAY)!).getByText("SO-1207").closest("div")!.parentElement!;
    expect(row.textContent).toContain("12pm–3pm");
    expect(row.textContent).toContain("NETS");
  });

  it("the carrier's own date is never dressed as a confirmation", () => {
    h.orders = [provisional(TODAY, { so: 1210 })];
    render(<CalendarPanel />);
    const today = day(TODAY)!;
    expect(within(today).getByText("Logistics' date")).toBeTruthy();
    expect(within(today).queryByText("Confirmed")).toBeNull();
  });

  it("an order with no carrier picked is still on the day, named as such", () => {
    h.orders = [
      confirmed(TODAY, { so: 1211, delivery_partner_id: null, delivery_partners: null }),
    ];
    render(<CalendarPanel />);
    expect(within(day(TODAY)!).getAllByText("Logistics not assigned").length).toBeGreaterThan(0);
  });
});

describe("CalendarPanel — Today / Tomorrow / This week", () => {
  it("opens on Today", () => {
    h.orders = [confirmed(TODAY, { so: 1207 }), confirmed(TOMORROW, { so: 1208 })];
    render(<CalendarPanel />);
    expect(day(TODAY)).toBeTruthy();
    expect(day(TOMORROW)).toBeNull();
  });

  it("This week spans today through Saturday and skips its empty days", () => {
    h.orders = [confirmed(TODAY, { so: 1207 }), confirmed("2026-08-01", { so: 1209 })];
    render(<CalendarPanel />);
    fireEvent.click(screen.getByText("This week"));
    expect(day(TODAY)).toBeTruthy();
    expect(day("2026-08-01")).toBeTruthy();
    // Nothing booked Tue–Fri → those days are not printed as noise.
    expect(day("2026-07-29")).toBeNull();
    // Sunday 2 Aug is outside the week entirely (never a delivery day).
    expect(day("2026-08-02")).toBeNull();
  });

  it("a week with nothing on it says so once, not six times", () => {
    render(<CalendarPanel />);
    fireEvent.click(screen.getByText("This week"));
    expect(screen.getAllByText("Nothing on the books for these days.")).toHaveLength(1);
  });

  it("one empty day still answers the question", () => {
    render(<CalendarPanel />);
    expect(within(day(TODAY)!).getByText("No dated events this day.")).toBeTruthy();
  });

  it("a promise never occupies the dated event calendar", () => {
    h.orders = [order({ so: 1204, delivery_date: TODAY })];
    render(<CalendarPanel />);
    fireEvent.click(screen.getByText("This week"));
    expect(screen.getAllByText("Nothing on the books for these days.")).toHaveLength(1);
  });
});

describe("CalendarPanel — the carrier's day (T9 rules)", () => {
  it("a carrier with no rules recorded shows its load and warns about nothing", () => {
    h.orders = [confirmed(TODAY, { so: 1207 }), confirmed(TODAY, { so: 1208 })];
    h.partners = [{ id: "p-nets", name: "NETS" }];
    render(<CalendarPanel />);
    const today = day(TODAY)!;
    expect(within(today).getByText("2")).toBeTruthy();
    expect(within(today).queryByText(/limit|not running/i)).toBeNull();
  });

  it("says when the carrier is at its stated limit, and what to do", () => {
    h.orders = [confirmed(TODAY, { so: 1207 }), confirmed(TODAY, { so: 1208 })];
    h.partners = [{ id: "p-nets", name: "NETS", daily_capacity: 2 }];
    render(<CalendarPanel />);
    const today = day(TODAY)!;
    expect(within(today).getByText("2 of 2")).toBeTruthy();
    expect(
      within(today).getByText(
        "NETS is at its limit of 2 deliveries a day. Call them before promising more",
      ),
    ).toBeTruthy();
  });

  it("a provisional date does not fill the carrier's limit", () => {
    h.orders = [confirmed(TODAY, { so: 1207 }), provisional(TODAY, { so: 1208 })];
    h.partners = [{ id: "p-nets", name: "NETS", daily_capacity: 2 }];
    render(<CalendarPanel />);
    const today = day(TODAY)!;
    expect(within(today).getByText("1 of 2")).toBeTruthy();
    expect(within(today).queryByText(/at its limit/)).toBeNull();
  });

  it("says when the carrier does not run that day", () => {
    h.orders = [confirmed(TODAY, { so: 1207 })];
    h.partners = [{ id: "p-nets", name: "NETS", blackout_dates: [TODAY] }];
    render(<CalendarPanel />);
    expect(
      within(day(TODAY)!).getByText(
        "NETS is not running on this day. Call them or move these",
      ),
    ).toBeTruthy();
  });
});

describe("CalendarPanel — banned words never reach the screen", () => {
  it("no Unscheduled / Not booked / POD anywhere, booked or empty", () => {
    h.orders = [
      confirmed(TODAY, { so: 1207 }),
      provisional(TODAY, { so: 1210 }),
      order({ so: 1204, delivery_date: TODAY }),
    ];
    const { container } = render(<CalendarPanel />);
    expect(container.textContent).not.toMatch(/Unscheduled|Not booked/i);
    expect(container.textContent).not.toMatch(/\bPOD\b|Proof of Delivery/i);
  });
});

describe("CalendarPanel — NO RELATIVE DATE WORDS (owner ruling 2026-08-15)", () => {
  it("the two single-day chips name their actual day", () => {
    render(<CalendarPanel />);
    // 2026-07-27 is a Monday; 07-28 the Tuesday after it.
    expect(screen.getByTestId("calendar-range-today").textContent).toContain("Mon, 27 Jul");
    expect(screen.getByTestId("calendar-range-tomorrow").textContent).toContain("Tue, 28 Jul");
  });

  it("`This week` stays — a span is not a day and no date can spell it", () => {
    render(<CalendarPanel />);
    expect(screen.getByTestId("calendar-range-week").textContent).toContain("This week");
  });

  it("a single-day chip needs NO hover — its face carries the ruled date", () => {
    // THE YEAR RULE (owner ruling 2026-08-15) put the full ruled date on the
    // chip itself. A hover could then only repeat it or say less, and a
    // tooltip that says less than the thing it explains is a defect.
    render(<CalendarPanel />);
    const chip = screen.getByTestId("calendar-range-today");
    expect(chip.getAttribute("title")).toBeNull();
    expect(chip.textContent).toContain(fmtDate(TODAY));
  });

  it("a SPAN chip keeps its hover — `This week` names no date", () => {
    render(<CalendarPanel />);
    expect(screen.getByTestId("calendar-range-week").getAttribute("title")).toMatch(/ to /);
  });

  it("the day heading prints the weekday + date, never `TODAY ·`", () => {
    h.orders = [confirmed(TODAY, { so: 1207 })];
    render(<CalendarPanel />);
    expect(within(day(TODAY)!).getByText(fmtDate(TODAY))).toBeTruthy();
  });

  it("`Today` and `Tomorrow` appear nowhere on the panel", () => {
    h.orders = [confirmed(TODAY, { so: 1207 }), confirmed(TOMORROW, { so: 1210 })];
    const { container } = render(<CalendarPanel />);
    fireEvent.click(screen.getByTestId("calendar-range-week"));
    expect(container.textContent).not.toMatch(/\bToday\b|\bTomorrow\b/);
    // `ETA today` rode the Receiving line and was false on any other day.
    expect(container.textContent).not.toMatch(/\bETA\b/);
  });
});


describe("shared Calendar Warehouse arrival source", () => {
  function event(over: Record<string, unknown> = {}) {
    return { id: "expected:PO", kind: "expected_arrival", date: TODAY, sourceId: "PO", sourceRef: "PO-20260727-0001", siteId: "klang", siteName: "Klang", expectedQty: 3, physicalQty: null, extraQty: null, receiptId: null, href: "/operation?tab=warehouse-inbound&source=PO&date=2026-07-27", ...over };
  }
  it("separates expected goods from actual receipt quantities and links the owning records", () => {
    h.warehouse.data = { sites: [], undatedReceipts: 0, events: [event(), event({ id: "receipt:r", kind: "actual_arrival", date: TOMORROW, expectedQty: null, physicalQty: 8, extraQty: 2, receiptId: "r", receiptRef: "GRN-20260728-0002", href: "/operation?tab=receiving&session=r" })] };
    render(<CalendarPanel />);
    expect(screen.getByText("Warehouse · 1 arriving")).toBeTruthy();
    expect(screen.getByText("Klang · Pending Delivery Qty 3")).toBeTruthy();
    fireEvent.click(screen.getByTestId("calendar-range-tomorrow"));
    expect(screen.getByText("Warehouse · GRN Records · 1")).toBeTruthy();
    expect(screen.getByText("Klang · Physical arrived Qty 8 · Extra Qty 2")).toBeTruthy();
    expect(screen.getByRole("link", { name: /GRN-260728-0002/ }).getAttribute("href")).toContain("session=r&calendarRange=tomorrow");
    expect(screen.queryByText("Warehouse · 1 arriving")).toBeNull();
  });

  it("restores the exact selected day and module/location scope", () => {
    h.orders = [confirmed(TODAY)];
    h.warehouse.data = { sites: [{ id: "klang", name: "Klang" }, { id: "al", name: "AL" }], undatedReceipts: 0, events: [event(), event({ id: "expected:other", siteId: "al", siteName: "AL" })] };
    render(<CalendarPanel />, "/operation?tab=receiving&calendarDay=2026-07-27&calendarModule=warehouse&calendarLocation=klang");
    expect(screen.getByText("Warehouse · 1 arriving")).toBeTruthy();
    expect(screen.queryByText("SO-1207")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Filter by location" }).textContent).toContain("Klang");
    expect(screen.getByRole("link").getAttribute("href")).toContain("calendarDay=2026-07-27");
  });

  it("never turns a loading or failed source into a clear day", () => {
    h.warehouse = { data: undefined, isPending: true, error: null };
    const page = render(<CalendarPanel />);
    expect(screen.getByText("Loading…").getAttribute("role")).toBe("status");
    expect(screen.queryByText("No dated events this day.")).toBeNull();
    page.unmount();
    h.warehouse = { data: undefined, isPending: false, error: new Error("failed") };
    render(<CalendarPanel />);
    expect(screen.getByRole("alert").textContent).toBe("The schedule could not be read for this date.");
    expect(screen.queryByText("No dated events this day.")).toBeNull();
  });

  it("selects a module through the shared keyboard-accessible filter", () => {
    h.warehouse.data.events = [event()];
    h.orders = [confirmed(TODAY)];
    render(<CalendarPanel />);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Filter by module" }), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: /^Delivery$/ }));
    expect(screen.queryByText("Warehouse · 1 arriving")).toBeNull();
    expect(screen.getByText("SO-1207")).toBeTruthy();
  });
});


describe("shared Calendar navigation", () => {
  it("uses the kit day picker and keeps a clicked date on the delivery door", () => {
    h.orders = [confirmed(TOMORROW)];
    render(<CalendarPanel />);
    fireEvent.click(screen.getByTestId(`month-day-${TOMORROW}`));
    expect(day(TOMORROW)).toBeTruthy();
    const link = screen.getByRole("link", { name: /SO-1207/ });
    const url = new URL(link.getAttribute("href")!, "https://carres.test");
    expect(url.searchParams.get("date")).toBe(TOMORROW);
    expect(url.searchParams.get("calendarDay")).toBe(TOMORROW);
    expect(url.searchParams.get("view")).toBe("day");
    expect(screen.getByText("Delivery · 1 scheduled delivery")).toBeTruthy();
  });

  it.each(["broken", "2026-02-30", "2026-13-27"])("ignores invalid URL date %s", (value) => {
    render(<CalendarPanel />, `/operation?tab=receiving&calendarDay=${value}`);
    expect(day(TODAY)).toBeTruthy();
    expect(screen.getByTestId(`month-day-${TODAY}`)).toBeTruthy();
  });

  it("never prints an unlabeled combined count on date controls", () => {
    h.orders = [confirmed(TODAY), confirmed(TODAY)];
    render(<CalendarPanel />);
    expect(screen.getByTestId("calendar-range-today").textContent).toBe(fmtDate(TODAY));
    expect(screen.getByTestId(`month-day-${TODAY}`).textContent).toBe("27");
  });
});
