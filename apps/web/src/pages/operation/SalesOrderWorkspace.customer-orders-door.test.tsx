/**
 * ⭐ `Existing customer · {n} orders ›` — `n` IS WHAT THE DOOR OPENS
 * (SO BUILD-1c, 2026-10-06 · Orders MASTER, owner ruling 2026-09-21).
 *
 * The door opens the Sales Orders Register searched by the phone. `n` used to
 * be the customer-type probe's `matches` — an exact phone over every status,
 * Placed, Cancelled and rental included — so `· 4 orders ›` could open a
 * Register showing 2. These tests render the REAL object page and answer
 * the probe and the Register's own count differently, so only a page that
 * reads the Register's count passes.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import SalesOrderWorkspace from "./SalesOrderWorkspace";

const apiFetch = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

/* The page's live PDF preview is not what these tests are about: it stays on
   its loading state, so jsdom never paints a document. */
vi.mock("@/lib/pdf/render", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf/render")>("@/lib/pdf/render");
  return { ...actual, renderSalesOrderPdf: () => new Promise(() => {}) };
});

const ID = "11111111-1111-1111-1111-111111111111";
const PHONE = "019-8337 2393";
/* An invented, dial-able number — never a real customer's. */
const ORDER = {
  id: ID, so: 1319, status: "proceed_order", operation_stage: "proceed_order",
  customer_name: "Customer", customer_phone: PHONE, customer_email: null,
  customer_address_line1: null, customer_address_line2: null, customer_address_city: null,
  customer_address_state: null, customer_address_postcode: null, customer_address_unknown: true,
  customer_billing: null, customer_billing_same: true, customer_emergency: null,
  customer_race: null, customer_gender: null, customer_birthday: null, entry_data: null,
  delivery_floor: null, delivery_has_lift: null, delivery_stair_items: null,
  placed_at: "2026-09-01T02:00:00Z", delivery_date: null, delivery_date_tbd: true, proceed_date: "2026-09-02",
  source_ref: null, source_system: null, paid: 0, dealer_id: null, outlet_id: null, salesperson_id: null,
  dealers: null, outlets: null, salespersons: null, installment_months: null, payment_method: null,
  do_number: null, invoice_no: null, invoiced_at: null, delivered_at: null, dispatched_at: null,
  warehouse_id: null, delivery_partner_id: null,
};
const PROBE = `/api/orders/customer-type?phone=${encodeURIComponent(PHONE)}`;
const COUNT = `/api/operation/orders?stage=proceeded&search=${encodeURIComponent(PHONE).replace(/%20/g, "+")}&count=only`;

type Answer = { probe?: { existing: boolean; matches: number }; count?: () => Promise<unknown> };
/** The Register count's answer has landed (resolved or failed). */
let countSettled = false;
function answer({ probe = { existing: true, matches: 4 }, count = () => Promise.resolve({ count: 2 }) }: Answer) {
  countSettled = false;
  apiFetch.mockReset();
  apiFetch.mockImplementation((path: unknown) => {
    if (path === `/api/operation/orders/${ID}`)
      return Promise.resolve({ order: ORDER, lines: [], addons: [], total: 0, warehouse: null, stockBalances: [], freeUnits: [], pos: [], history: [], threads: [] });
    if (path === PROBE) return Promise.resolve(probe);
    if (path === COUNT) {
      const answered = count();
      answered.then(() => { countSettled = true; }, () => { countSettled = true; });
      return answered;
    }
    return new Promise(() => {});
  });
}
const paths = () => apiFetch.mock.calls.map(([p]) => p).filter((p): p is string => typeof p === "string");
/** Wait until the chip has said everything it is going to say: the Register's
 *  count has answered, or a door is already on screen (the defect). */
async function settled() {
  await waitFor(() => expect(chip()).toHaveTextContent("Existing customer"), { timeout: 4000 });
  await waitFor(() => expect(countSettled || screen.queryByTestId("customer-orders-door") !== null).toBe(true));
  await new Promise((r) => setTimeout(r, 20));
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/operation/orders/so/${ID}`]}>
        <Routes>
          <Route path="/operation/orders/so/:orderId" element={<SalesOrderWorkspace />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const chip = () => screen.getByTestId("customer-type-chip");

/* A block body, not an arrow expression: a function returned from
   `beforeEach` is run as its teardown, and `mockReset()` returns the mock. */
beforeEach(() => {
  apiFetch.mockReset();
});

describe("Sales Order page — `{n} orders ›` counts what the Register door opens", () => {
  it("prints the Register's count, not the probe's matches, and the door carries the same phone", async () => {
    answer({ probe: { existing: true, matches: 4 }, count: () => Promise.resolve({ count: 2 }) });
    mount();
    const door = await screen.findByTestId("customer-orders-door", {}, { timeout: 4000 });
    expect(door).toHaveTextContent("2 orders ›");
    expect(chip()).toHaveTextContent("Existing customer · 2 orders ›");
    expect(chip()).not.toHaveTextContent("4 orders");
    expect(door.getAttribute("href")).toBe(`/operation/orders?search=${encodeURIComponent(PHONE)}`);
    /* The count is the Register's own read for that phone. */
    expect(paths()).toContain(COUNT);
  });

  it("one order reads `1 order ›`", async () => {
    answer({ count: () => Promise.resolve({ count: 1 }) });
    mount();
    expect(await screen.findByTestId("customer-orders-door", {}, { timeout: 4000 })).toHaveTextContent("1 order ›");
  });

  it("a Register count of 0 keeps `Existing customer` and shows no door — never `0 orders`", async () => {
    answer({ probe: { existing: true, matches: 4 }, count: () => Promise.resolve({ count: 0 }) });
    mount();
    await settled();
    expect(chip()).not.toHaveTextContent("0 orders");
    expect(chip().textContent).toBe("Existing customer");
    expect(screen.queryByTestId("customer-orders-door")).toBeNull();
    expect(paths()).toContain(COUNT);
  });

  it("a failed count read hides the door, prints no guessed number and keeps the chip", async () => {
    answer({ probe: { existing: true, matches: 4 }, count: () => Promise.reject(new ApiError(500, "Sales orders could not be counted.", { code: "count_unavailable" })) });
    mount();
    await settled();
    expect(chip().textContent).toBe("Existing customer");
    expect(screen.queryByTestId("customer-orders-door")).toBeNull();
    expect(paths()).toContain(COUNT);
  });

  it("an answer with no number (an older Worker's list) shows no door", async () => {
    answer({ count: () => Promise.resolve({ orders: [], salesOrderTotal: 9 }) });
    mount();
    await settled();
    expect(chip().textContent).toBe("Existing customer");
    expect(screen.queryByTestId("customer-orders-door")).toBeNull();
    expect(paths()).toContain(COUNT);
  });

  it("a new customer reads `New customer` from the unchanged probe and asks the Register nothing", async () => {
    answer({ probe: { existing: false, matches: 0 } });
    mount();
    await waitFor(() => expect(chip()).toHaveTextContent("New customer"), { timeout: 4000 });
    expect(paths()).toContain(PROBE);
    expect(paths().some((p) => p.includes("count=only"))).toBe(false);
    expect(screen.queryByTestId("customer-orders-door")).toBeNull();
  });
});
