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
import { render, screen, fireEvent, within } from "@testing-library/react";

const h = vi.hoisted(() => ({
  orders: [] as unknown[],
  partners: [] as unknown[],
}));

vi.mock("@/lib/queries", () => ({
  useOperationOrders: () => ({ data: { orders: h.orders } }),
  usePurchaseToday: () => ({ data: undefined }),
  useOperationSuppliers: () => ({ data: { suppliers: [] } }),
  useDeliveryPartners: () => ({ data: { partners: h.partners } }),
}));

import CalendarPanel from "./CalendarPanel";

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
    expect(within(day(TODAY)!).getAllByText("No logistics picked").length).toBeGreaterThan(0);
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
        "NETS is at its limit of 2 deliveries a day — call them before promising more",
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
        "NETS is not running on this day — call them or move these",
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

  it("a chip keeps the full ruled date on hover", () => {
    render(<CalendarPanel />);
    expect(screen.getByTestId("calendar-range-today").getAttribute("title")).toBe("27 Jul 26");
  });

  it("the day heading prints the weekday + date, never `TODAY ·`", () => {
    h.orders = [confirmed(TODAY, { so: 1207 })];
    render(<CalendarPanel />);
    expect(within(day(TODAY)!).getByText("Mon, 27 Jul 26")).toBeTruthy();
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
