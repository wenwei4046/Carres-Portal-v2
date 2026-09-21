import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import PaymentMonitor from "./PaymentMonitor";

/**
 * PAYMENT MONITOR (owner rulings 2026-09-12 · 2026-09-16): the full-width
 * collection control listing — eight columns in the ruled order on Delivery's
 * fixed 72px two-line row, Items & Stock from Delivery's own arithmetic, the
 * requested and confirmed delivery dates side by side, a two-line Payment
 * timing cell with the Work feed's own action and owner, the Monday–Friday
 * follow-up plan in the rail, and the payment workspace opened below the row.
 */
const state = vi.hoisted(() => ({
  invoices: { data: [] as unknown[], isLoading: false, isError: false, isSuccess: true, refetch: vi.fn(), error: null },
  cases: { data: { cases: [] as unknown[] }, isLoading: false, isError: false, isSuccess: true, refetch: vi.fn() },
  requests: { data: { requests: [] as unknown[] }, isLoading: false, isError: false, isSuccess: true, refetch: vi.fn() },
  settings: { data: { collection_timing: [] as unknown[], bank_accounts: [] }, isLoading: false, isError: false, isSuccess: true, refetch: vi.fn() },
  work: { data: undefined as unknown, isSuccess: true, isError: false, refetch: vi.fn() },
  orders: { data: { orders: [] as unknown[] } as unknown, isSuccess: true, isError: false, refetch: vi.fn() },
}));
vi.mock("@/lib/queries", () => ({
  useInvoiceRegister: () => state.invoices,
  usePaymentStorageCases: () => state.cases,
  useLaterDeliveryRequests: () => state.requests,
  usePaymentSettings: () => state.settings,
  useOperationWork: () => state.work,
  useOperationOrders: () => state.orders,
  // Delivery's Items, Services & Stock panel reads the Sales Order expansion
  // for Unit, PO and place; the listing tests pin the words it prints.
  useSalesOrderExpansion: () => ({ data: { lines: [], unitCoverage: {}, unitScopes: {}, place: [] } }),
  useDeliveryPartners: () => ({ data: { partners: [] } }),
  useDeliveryArrangements: () => ({ data: { arrangements: [], contacts: [] } }),
  useRecordCannotDeliver: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveDeliveryArrangement: () => ({ mutate: vi.fn(), isPending: false }),
  // 0489 — the collection owner section and the recorded results are read
  // by the workspace; the Monitor tests pin the listing, not those reads.
  useCollectionOwner: () => ({ data: { owner: null }, isLoading: false, isError: false }),
  useWorkspaceDuties: () => ({ data: { can_assign: false, duties: [] }, isLoading: false, isError: false }),
  useCollectionOutcomes: () => ({ data: { outcomes: [] }, isLoading: false, isError: false }),
  useCatalog: () => ({ data: { models: [{ id: "m1", name: "King Mattress" }], skus: [{ sku: "A", modelId: "m1" }] } }),
  useRecordPayment: () => ({ mutate: vi.fn(), isPending: false }),
  qk: { finance: {
    invoiceRegister: () => ["finance", "invoice-register"],
    paymentRegister: () => ["finance", "payment-register"],
  } },
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string) => {
    if (url.includes("/payment-storage")) return { cases: [] };
    if (url.includes("/templates")) return { templates: [] };
    return {};
  }),
}));
const auth = vi.hoisted(() => ({ role: "operation" as string }));
vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { role: string }) => unknown) => selector({ role: auth.role }),
}));

/** The frozen clock every test in this file runs on: Tuesday 15 Sep 2026 in
 *  Kuala Lumpur. It is frozen in the file-level `beforeEach` BEFORE any fixture
 *  is built, because `iso()` and `workday()` read the clock: a fixture built on
 *  the real clock and asserted against a frozen one rots as the calendar moves. */
const TUESDAY = new Date("2026-09-15T02:00:00Z");

function iso(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}
/** The next date at least `min` days out that is not a Sunday — so the
 *  working-day clock lands where the test expects whatever today is. */
function workday(min: number): string {
  for (let n = min; n < min + 3; n++) {
    const d = new Date(); d.setDate(d.getDate() + n);
    if (d.getDay() !== 0) return iso(n);
  }
  return iso(min);
}

function row(over: Partial<InvoiceRegisterRow> & {
  paid?: number;
  control?: Record<string, unknown>;
  delivery_date?: string | null;
  so?: number;
  lines?: Array<{ sku: string; qty: number; unit_price: number | null }>;
} = {}): InvoiceRegisterRow {
  return {
    id: over.id ?? "i1",
    invoice_no: over.invoice_no ?? "INV-1",
    status: over.status ?? "issued",
    kind: over.kind ?? "sales",
    amount: over.amount ?? 1000,
    tax_amount: 0,
    issued_at: over.issued_at ?? "2026-09-01T00:00:00Z",
    voided_at: over.voided_at ?? null,
    void_reason: over.void_reason ?? null,
    replaces_invoice_id: null,
    created_at: "2026-09-06T00:00:00Z",
    order_id: over.order_id ?? "o1",
    orders: {
      id: over.order_id ?? "o1", so: over.so ?? 1300, customer_name: "LIM KUAN YANG",
      customer_phone: "0123456789",
      status: "proceed_order", paid: over.paid ?? 0,
      delivery_date: over.delivery_date ?? null, delivery_date_tbd: false, delivered_at: null,
      ops_assigned_logistic: null,
      delivery_partners: { name: "NETS", contact: null },
      order_payments: [],
      payment_communications: [],
      order_lines: over.lines ?? [{ sku: "A", qty: 1, unit_price: 1000 }],
      order_addons: [],
      ops_order_control: [{
        balance: null,
        confirmed_date: (over.control?.confirmed_date as string | null) ?? null,
        line_etas: (over.control?.line_etas as Record<string, string>) ?? null,
        line_stock_status: (over.control?.line_stock_status as Record<string, string>) ?? null,
      }],
    },
  };
}

const READY = { line_stock_status: { A: "ready" } };

/** An Operation orders-list row — what Delivery's stock arithmetic reads. */
function order(id: string, so: number, over: {
  lines?: Array<{ sku: string; qty: number }>;
  units?: Array<{ sku: string; qty: number }>;
  status?: string;
} = {}) {
  return {
    id, so, status: over.status ?? "proceed_order",
    order_lines: (over.lines ?? [{ sku: "A", qty: 1 }]).map((l, i) => ({ id: `${id}-l${i}`, ...l, unit_price: 0 })),
    order_addons: [],
    allocated_units: (over.units ?? []).map((u) => ({ ...u, status: "reserved" })),
    po_arrivals: [],
  };
}

beforeEach(() => {
  // First, before a single fixture date is computed.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TUESDAY);
  state.invoices.data = [
    // Goods not ready, no arrival, delivery in two weeks — Wait.
    row({ id: "i1", order_id: "o1", so: 1300, paid: 400, control: { confirmed_date: iso(14) } }),
    // Ready, delivery far out — before the ask day.
    row({ id: "i2", order_id: "o2", so: 1301, control: { ...READY, confirmed_date: iso(20) } }),
    // Ready, delivery already passed — should have been paid.
    row({ id: "i3", order_id: "o3", so: 1302, control: { ...READY, confirmed_date: iso(-3) } }),
    // Paid — leaves the Monitor.
    row({ id: "i4", order_id: "o4", so: 1303, paid: 1000, control: { ...READY, confirmed_date: iso(5) } }),
  ];
  state.invoices.isError = false; state.invoices.isSuccess = true;
  state.cases.data = { cases: [] };
  state.requests.data = { requests: [] };
  state.settings.data = { collection_timing: [], bank_accounts: [] };
  state.work.data = undefined; state.work.isSuccess = true; state.work.isError = false;
  state.orders.isError = false; state.orders.isSuccess = true;
  // o1 has nothing in the register; o2 and o3 hold their one piece.
  state.orders.data = { orders: [
    order("o1", 1300), order("o2", 1301, { units: [{ sku: "A", qty: 1 }] }),
    order("o3", 1302, { units: [{ sku: "A", qty: 1 }] }), order("o4", 1303, { units: [{ sku: "A", qty: 1 }] }),
  ] };
  auth.role = "operation";
  localStorage.clear();
  // jsdom's window is 1024px wide, below the 1100px rule that starts the rail
  // collapsed — the desktop tests want it open, as a wide window would.
  Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
});

afterEach(() => { vi.useRealTimers(); });

function show(at = "/finance/monitor?day=all") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}><PaymentMonitor /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Payment Monitor — the listing", () => {
  it("shows the eight ruled columns, in the exact order, on the fixed 72px row", () => {
    show();
    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent?.trim() ?? "");
    const words = ["SO No", "Customer", "Amount needed", "Items & Stock", "Storage",
      "Requested Delivery Date", "Confirmed Delivery", "Payment timing"];
    const positions = words.map((w) => headers.findIndex((h) => h.startsWith(w)));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // The retired headings and the invented ones never appear.
    for (const retired of [/^Goods/, /^Customer delivery/, /Stock readiness/, /Stock arrival/, /Next step/, /Expected arrival|^Arrival/]) {
      expect(headers.some((h) => retired.test(h))).toBe(false);
    }
    expect(document.querySelector("[data-row-height]")).toHaveAttribute("data-row-height", "72");
    // No decorative selection: the Monitor has no bulk act.
    expect(within(table).queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByText("Invoice No")).not.toBeInTheDocument();
    expect(screen.queryByText("New Payment")).not.toBeInTheDocument();
  });

  it("a paid SO leaves the Monitor; the rest are one row per SO in risk order", () => {
    show();
    expect(screen.queryByText("SO-1303")).not.toBeInTheDocument();
    const cells = screen.getAllByRole("button", { name: /^SO-13/ }).map((b) => b.textContent);
    expect(cells).toEqual(["SO-1302", "SO-1301", "SO-1300"]);
    expect(screen.getByTestId("payment-monitor-summary")).toHaveTextContent("3 orders · RM 2,600.00 still needed");
  });

  it("Items & Stock is Delivery's Ready / Not ready with the count; Payment timing never chases blind", () => {
    show();
    expect(screen.getByTestId("payment-monitor-stock-1300")).toHaveTextContent("Not ready");
    expect(screen.getByTestId("payment-monitor-stock-1300")).toHaveTextContent("0 of 1 · 1 short");
    expect(screen.getByTestId("payment-monitor-stock-1301")).toHaveTextContent("Ready");
    expect(screen.getByTestId("payment-monitor-stock-1301")).toHaveTextContent("1 of 1");
    const waiting = screen.getByTestId("monitor-timing-1300");
    expect(waiting).toHaveTextContent("Arrival not confirmed");
    expect(waiting).toHaveTextContent("Wait");
    expect(waiting).not.toHaveTextContent("Ask customer to pay");
    const late = screen.getByTestId("monitor-timing-1302");
    expect(late).toHaveTextContent("Payment should have been received");
    // No Work item for it in this feed → no action and no person are invented.
    expect(late).not.toHaveTextContent("Ask customer to pay");
    for (const banned of ["Stock status", "Stock received", "Logistics ETA", "Chase"]) {
      expect(screen.queryByText(new RegExp(banned))).not.toBeInTheDocument();
    }
  });

  it("the owner is the Work feed's resolved person, as an avatar — never a name in the sentence", () => {
    state.work.data = { items: [{
      id: "payment:i3:payment.collect_customer_balance", module: "payment",
      ruleKey: "payment.collect_customer_balance",
      object: { kind: "invoice", id: "i3", label: "INV-1" },
      problem: "Customer payment should have been received", action: "Ask customer to pay",
      recipient: "LIM KUAN YANG", requiredResult: "x", completionFact: "y",
      owner: { rule: "collection_owner", dutyKey: "delivery_duty", normal: { userId: "u-shasha", name: "Shasha Tan" },
        activeCover: null, acting: { userId: "u-shasha", name: "Shasha Tan" }, state: "primary" },
      timing: { actionOn: iso(-5), workingDaysLate: 3, bucket: "overdue" },
      destination: "/finance/monitor?invoice=i3", tone: "danger", locked: false, broken: false,
    }] };
    show();
    const late = screen.getByTestId("monitor-timing-1302");
    const avatar = within(late).getByTestId("monitor-owner-avatar");
    expect(avatar).toHaveAttribute("aria-label", "Shasha Tan");
    expect(avatar).toHaveAttribute("title", "Shasha Tan");
    expect(late).not.toHaveTextContent("Shasha Tan");
    expect(late).toHaveTextContent("Ask customer to pay");
  });

  it("nobody assigned to the order is a visible exception with the one door that fixes it — never Delivery Duty", () => {
    state.work.data = { items: [{
      id: "payment:i3:payment.collect_customer_balance", module: "payment",
      ruleKey: "payment.collect_customer_balance",
      object: { kind: "invoice", id: "i3", label: "INV-1" },
      problem: "Customer payment should have been received", action: "Ask customer to pay",
      recipient: "LIM KUAN YANG", requiredResult: "x", completionFact: "y",
      owner: { rule: "collection_owner", dutyKey: "delivery_duty", normal: null, activeCover: null, acting: null, state: "not_assigned" },
      timing: { actionOn: iso(-5), workingDaysLate: 3, bucket: "overdue" },
      destination: "/finance/monitor?invoice=i3", tone: "danger", locked: false, broken: false,
    }] };
    show();
    const late = screen.getByTestId("monitor-timing-1302");
    const door = within(late).getByTestId("monitor-owner-unassigned");
    expect(door).toHaveTextContent("Not assigned");
    expect(door).toHaveAccessibleName("Nobody is assigned to this order. Assign it in Sales Orders → Team");
    expect(door).toHaveAttribute("href", "/operation/orders");
    expect(late).not.toHaveTextContent(/Delivery Duty|Payment Duty|Staff & Duties/);
    expect(late).toHaveTextContent("Ask customer to pay");
    expect(screen.queryByTestId("monitor-owner-avatar")).not.toBeInTheDocument();
  });

  it("today's cover acts and the normal owner is kept beside it — two facts, never one name", () => {
    state.work.data = { items: [{
      id: "payment:i3:payment.collect_customer_balance", module: "payment",
      ruleKey: "payment.collect_customer_balance",
      object: { kind: "invoice", id: "i3", label: "INV-1" },
      problem: "Customer payment should have been received", action: "Ask customer to pay",
      recipient: "LIM KUAN YANG", requiredResult: "x", completionFact: "y",
      owner: { rule: "collection_owner", dutyKey: "delivery_duty", normal: { userId: "u-shasha", name: "Shasha" },
        activeCover: { userId: "u-yujun", name: "Yu Jun" }, acting: { userId: "u-yujun", name: "Yu Jun" }, state: "covered" },
      timing: { actionOn: iso(-5), workingDaysLate: 3, bucket: "overdue" },
      destination: "/finance/monitor?invoice=i3", tone: "danger", locked: false, broken: false,
    }] };
    show();
    const late = screen.getByTestId("monitor-timing-1302");
    const avatar = within(late).getByTestId("monitor-owner-avatar");
    expect(avatar).toHaveAttribute("aria-label", "Yu Jun");
    expect(avatar).toHaveAttribute("title", "Normal owner: Shasha · Today's cover: Yu Jun");
    expect(avatar).toHaveAttribute("data-normal-owner", "Shasha");
    expect(avatar).toHaveAttribute("data-cover", "Yu Jun");
    expect(late).not.toHaveTextContent("Yu Jun");
  });

  it("two Work items on one order: line 2 is the item whose work is the printed fact", () => {
    state.invoices.data = [
      row({ id: "i3", order_id: "o3", so: 1302, paid: 0, control: { ...READY, confirmed_date: iso(-3) } }),
      row({ id: "s3", order_id: "o3", so: 1302, kind: "storage", amount: 200, control: { ...READY, confirmed_date: iso(-3) } }),
    ];
    state.work.data = { items: [
      workItem("i3", iso(-5)),
      { ...workItem("s3", iso(-5), { ruleKey: "payment.send_storage_invoice" }), action: "Send the invoice and collect payment" },
    ] };
    show();
    const cell = screen.getByTestId("monitor-timing-1302");
    expect(cell).toHaveTextContent("Storage Invoice not paid");
    expect(cell).toHaveTextContent("Send the invoice and collect payment");
    expect(cell).not.toHaveTextContent("Ask customer to pay");
  });

  it("no Work item for the SO → no invented owner", () => {
    state.work.data = { items: [] };
    show();
    expect(screen.queryByTestId("monitor-owner-avatar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("monitor-owner-unassigned")).not.toBeInTheDocument();
  });

  it("Storage speaks the ruled states and the accrued charge stays out of Amount needed", () => {
    state.cases.data = { cases: [{
      id: "c1", order_id: "o2", product_group: "mattress_bedframe", storage_start: iso(-14),
      rule_free_days: 7, rule_charge_amount: 150, rule_cycle_days: 30, approved_free_until: null,
      approved_at: null, billed_through_period: 0, status: "open",
    }] };
    show();
    const storage = screen.getByTestId("payment-monitor-storage-1301");
    expect(storage).toHaveTextContent("Mattress / Bedframe · Day 15");
    expect(storage).toHaveTextContent("RM 150.00 so far");
    expect(storage).toHaveAccessibleName("Storage · Mattress / Bedframe · Day 15 · RM 150.00 so far");
    // SO-1301 still needs the goods money only — RM 1,000.00, not 1,150.
    expect(screen.getByTestId("payment-monitor-summary")).toHaveTextContent("RM 2,600.00 still needed");
    expect(screen.getAllByText("No storage charge").length).toBe(2);
  });

  it("Requested Delivery Date keeps the customer's request; Confirmed Delivery is Delivery's fact", () => {
    const withTime = row({ id: "a", order_id: "o1", so: 1300, delivery_date: "2026-09-18", control: READY });
    withTime.orders!.ops_delivery_arrangements = [{ leg: 0, confirmed_date: "2026-09-22", confirmed_time: "2 PM to 5 PM" }];
    const dayOnly = row({ id: "b", order_id: "o2", so: 1301, delivery_date: "2026-09-18", control: READY });
    dayOnly.orders!.ops_delivery_arrangements = [{ leg: 0, confirmed_date: "2026-09-19", confirmed_time: null }];
    const none = row({ id: "c", order_id: "o3", so: 1302, control: READY });
    state.invoices.data = [withTime, dayOnly, none];
    show();
    const cellOf = (so: number, key: string) => {
      const tr = screen.getByRole("button", { name: `SO-${so}` }).closest("tr")!;
      const index = within(screen.getByRole("table")).getAllByRole("columnheader")
        .findIndex((h) => h.textContent?.trim().startsWith(key));
      return tr.querySelectorAll("td")[index]!;
    };
    // The request survives the confirmation of a different day.
    expect(cellOf(1300, "Requested Delivery Date")).toHaveTextContent("Fri, 18 Sep");
    expect(cellOf(1300, "Confirmed Delivery")).toHaveTextContent("Confirmed");
    expect(cellOf(1300, "Confirmed Delivery")).toHaveTextContent("Tue, 22 Sep · 2 PM to 5 PM");
    // A day without a time is Delivery's half booking.
    expect(cellOf(1301, "Confirmed Delivery")).toHaveTextContent("Not confirmed");
    expect(cellOf(1301, "Confirmed Delivery")).toHaveTextContent("Sat, 19 Sep · No time agreed");
    // Nothing agreed: `Not confirmed` and nothing beneath; no request word.
    expect(cellOf(1302, "Confirmed Delivery").textContent?.trim()).toBe("Not confirmed");
    expect(cellOf(1302, "Requested Delivery Date")).toHaveTextContent("No delivery date");
    expect(screen.getByRole("button", { name: /Open Calendar · Confirmed Delivery Confirmed · Tue, 22 Sep/ })).toBeInTheDocument();
  });

  it("the SO number opens the Sales Order; the customer's reference is its own second line", () => {
    const r = row({ id: "a", order_id: "o1", so: 1300, control: READY });
    r.orders!.source_ref = ["TCF0541"];
    state.invoices.data = [r, row({ id: "b", order_id: "o2", so: 1301, control: READY })];
    show();
    const so = screen.getByRole("button", { name: "SO-1300" });
    expect(so.textContent).toBe("SO-1300");
    expect(so.closest("td")).toHaveTextContent("SO-1300TCF0541");
    // No reference → no empty second line.
    expect(screen.getByRole("button", { name: "SO-1301" }).closest("td")!.textContent).toBe("SO-1301");
  });

  it("a long customer name is cut to fit the row, and its full value opens by click and by keyboard", () => {
    const r = row({ id: "a", order_id: "o1", so: 1300, control: READY });
    r.orders!.customer_name = "TAN SRI DATO' SERI MUHAMMAD HAFIZUDDIN BIN ABDUL RAHMAN";
    state.invoices.data = [r];
    show();
    const trigger = screen.getByRole("button", { name: /TAN SRI DATO' SERI MUHAMMAD HAFIZUDDIN BIN ABDUL RAHMAN · 0123456789/ });
    trigger.focus();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.getByTestId("monitor-full-value")).toHaveTextContent("TAN SRI DATO' SERI MUHAMMAD HAFIZUDDIN BIN ABDUL RAHMAN");
  });

  it("Items & Stock opens the row below itself at Delivery's read-only items panel", async () => {
    state.invoices.data = [row({ id: "a", order_id: "o1", so: 1300, control: { confirmed_date: iso(20) } })];
    state.orders.data = { orders: [order("o1", 1300, { lines: [{ sku: "A", qty: 2 }, { sku: "B", qty: 1 }], units: [{ sku: "A", qty: 2 }] })] };
    show();
    const cell = screen.getByTestId("payment-monitor-stock-1300");
    expect(cell).toHaveTextContent("Not ready");
    expect(cell).toHaveTextContent("2 of 3 · 1 short");
    fireEvent.click(cell);
    const items = await screen.findByTestId("delivery-brief-items");
    expect(items).toHaveTextContent("Ready");
    // The listing is still on screen: the row opened below itself.
    expect(screen.getByRole("button", { name: "SO-1300" })).toBeInTheDocument();
    expect(within(items).queryAllByRole("textbox")).toHaveLength(0);
    await waitFor(() => expect(document.querySelector("[data-section=items]")).toHaveFocus());
  });

  it("a delivered order that still owes money says Delivered, not a stock count", () => {
    const r = row({ id: "a", order_id: "o1", so: 1300, control: READY });
    state.invoices.data = [r];
    state.orders.data = { orders: [order("o1", 1300, { status: "delivered" })] };
    show();
    expect(screen.getByTestId("payment-monitor-stock-1300").textContent).toBe("Delivered");
  });

  it("a failed stock read says so on the cell — never a blank Items & Stock", () => {
    state.orders.isError = true; state.orders.isSuccess = false; state.orders.data = undefined;
    show();
    expect(screen.getAllByText("Stock facts could not be loaded.").length).toBe(3);
  });

  it("a finance reader is told whose stock facts they are, never a guess", () => {
    auth.role = "finance";
    show();
    expect(screen.getAllByText("Stock facts are Operation's.").length).toBe(3);
  });
});

/** A collection Work item exactly as the shared feed ships it. */
function workItem(objectId: string, actionOn: string, over: {
  ruleKey?: string;
  owner?: Record<string, unknown>;
} = {}) {
  return {
    id: `payment:${objectId}:${over.ruleKey ?? "payment.collect_customer_balance"}`, module: "payment",
    ruleKey: over.ruleKey ?? "payment.collect_customer_balance",
    object: { kind: "invoice", id: objectId, label: "INV-1" },
    problem: "Customer balance due", action: "Ask customer to pay",
    recipient: "LIM KUAN YANG", requiredResult: "x", completionFact: "y",
    owner: over.owner ?? { rule: "collection_owner", dutyKey: "delivery_duty", normal: { userId: "u-shasha", name: "Shasha" },
      activeCover: null, acting: { userId: "u-shasha", name: "Shasha" }, state: "primary" },
    timing: { actionOn, workingDaysLate: 0, bucket: "later" },
    destination: `/finance/monitor?invoice=${objectId}`, tone: "warning", locked: false, broken: false,
  };
}

describe("Payment Monitor — the rail is the Monday–Friday follow-up plan (owner ruling 2026-09-16)", () => {
  // The clock is already frozen on TUESDAY by the file-level `beforeEach`.
  const days = () => screen.getAllByTestId(/^payment-monitor-day-\d/).map((b) => b.getAttribute("data-testid")!.slice(-10));
  const listed = () => screen.queryAllByRole("button", { name: /^SO-13/ }).map((b) => b.textContent);

  it("shows this week Monday to Friday, picks today by default and marks only today as Today", () => {
    state.work.data = { items: [] };
    show("/finance/monitor");
    expect(days()).toEqual(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"]);
    expect(screen.getByTestId("payment-monitor-week-label")).toHaveTextContent("Mon, 14 Sep – Fri, 18 Sep");
    expect(screen.getAllByTestId("payment-monitor-today")).toHaveLength(1);
    expect(screen.getByTestId("payment-monitor-day-2026-09-15")).toHaveAttribute("data-today", "yes");
    expect(screen.getByTestId("payment-monitor-day-2026-09-15")).toHaveAttribute("aria-pressed", "true");
    // Wed 16 Sep is Malaysia Day — named, never Today.
    expect(screen.getByTestId("payment-monitor-day-2026-09-16")).toHaveTextContent("Public holiday · Malaysia Day");
    expect(screen.getByTestId("payment-monitor-day-2026-09-16")).not.toHaveAttribute("data-today");
    expect(screen.getByTestId("payment-monitor-day-2026-09-14")).toHaveTextContent("No follow-up planned");
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });

  it("each day names its work and picking it shows exactly that day's orders", () => {
    state.work.data = { items: [
      workItem("i2", "2026-09-17"), workItem("i3", "2026-09-17"),
      workItem("i1", "2026-09-18", { ruleKey: "payment.missed_promise" }),
    ] };
    show("/finance/monitor");
    const thu = screen.getByTestId("payment-monitor-day-2026-09-17");
    expect(thu).toHaveTextContent("Ask 2 customers to pay");
    expect(screen.getByTestId("payment-monitor-day-2026-09-18")).toHaveTextContent("Check 1 promised payment");
    // Today has nothing → the listing is empty, and says so.
    expect(listed()).toEqual([]);
    expect(screen.getByText("No follow-up planned on Tue, 15 Sep.")).toBeInTheDocument();
    fireEvent.click(thu);
    expect(listed()).toEqual(["SO-1302", "SO-1301"]);
    expect(screen.getByTestId("payment-monitor-summary")).toHaveTextContent("2 orders");
    fireEvent.click(screen.getByTestId("payment-monitor-day-2026-09-18"));
    expect(listed()).toEqual(["SO-1300"]);
  });

  it("unfinished earlier work stays visible today with its own day, counted once", () => {
    state.work.data = { items: [
      workItem("i3", "2026-09-10", { ruleKey: "payment.missed_promise" }),
      workItem("i2", "2026-09-14"),
    ] };
    show("/finance/monitor");
    const tue = screen.getByTestId("payment-monitor-day-2026-09-15");
    expect(tue).toHaveTextContent("Ask 1 customer to pay");
    expect(tue).toHaveTextContent("Check 1 promised payment");
    expect(tue).toHaveTextContent("Includes 2 not done since Thu, 10 Sep");
    expect(listed()).toEqual(["SO-1302", "SO-1301"]);
    const mon = screen.getByTestId("payment-monitor-day-2026-09-14");
    expect(mon).toHaveTextContent("1 not done · counted under Today");
    expect(mon).not.toHaveTextContent("Ask 1 customer to pay");
    fireEvent.click(mon);
    expect(listed()).toEqual(["SO-1301"]);
  });

  it("previous and next week move the plan; This week comes back to today", () => {
    state.work.data = { items: [workItem("i2", "2026-09-22"), workItem("i3", "2026-09-10")] };
    show("/finance/monitor");
    fireEvent.click(screen.getByTestId("payment-monitor-next-week"));
    expect(screen.getByTestId("payment-monitor-week-label")).toHaveTextContent("Mon, 21 Sep – Fri, 25 Sep");
    expect(screen.queryByTestId("payment-monitor-today")).not.toBeInTheDocument();
    expect(screen.getByTestId("payment-monitor-day-2026-09-22")).toHaveTextContent("Ask 1 customer to pay");
    fireEvent.click(screen.getByTestId("payment-monitor-day-2026-09-22"));
    expect(listed()).toEqual(["SO-1301"]);
    fireEvent.click(screen.getByTestId("payment-monitor-previous-week"));
    fireEvent.click(screen.getByTestId("payment-monitor-previous-week"));
    expect(screen.getByTestId("payment-monitor-week-label")).toHaveTextContent("Mon, 7 Sep – Fri, 11 Sep");
    // The late item is counted on today, not a second time on its own day.
    expect(screen.getByTestId("payment-monitor-day-2026-09-10")).toHaveTextContent("1 not done · counted under Today");
    fireEvent.click(screen.getByTestId("payment-monitor-this-week"));
    expect(screen.getByTestId("payment-monitor-day-2026-09-15")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("payment-monitor-day-2026-09-15")).toHaveTextContent("Includes 1 not done since Thu, 10 Sep");
  });

  it("on a public holiday nothing is Today and the work waits on the next working day", () => {
    vi.setSystemTime(new Date("2026-09-16T02:00:00Z"));
    state.work.data = { items: [workItem("i3", "2026-09-15")] };
    show("/finance/monitor");
    expect(screen.queryByTestId("payment-monitor-today")).not.toBeInTheDocument();
    const thu = screen.getByTestId("payment-monitor-day-2026-09-17");
    expect(thu).toHaveAttribute("aria-pressed", "true");
    expect(thu).toHaveTextContent("Includes 1 not done since Tue, 15 Sep");
    expect(screen.getByTestId("payment-monitor-day-2026-09-15")).toHaveTextContent("1 not done · counted under Thu, 17 Sep");
  });

  it("on a weekend nothing is Today and the plan opens on Monday", () => {
    vi.setSystemTime(new Date("2026-09-19T02:00:00Z"));
    state.work.data = { items: [] };
    show("/finance/monitor");
    expect(screen.getByTestId("payment-monitor-week-label")).toHaveTextContent("Mon, 21 Sep – Fri, 25 Sep");
    expect(screen.queryByTestId("payment-monitor-today")).not.toBeInTheDocument();
    expect(screen.getByTestId("payment-monitor-day-2026-09-21")).toHaveAttribute("aria-pressed", "true");
  });

  it("today's cover rides the same item: the count is unchanged and the row avatar is the cover", () => {
    state.work.data = { items: [workItem("i3", "2026-09-15", { owner: {
      rule: "collection_owner", dutyKey: "delivery_duty", normal: { userId: "u-shasha", name: "Shasha" },
      activeCover: { userId: "u-yujun", name: "Yu Jun" }, acting: { userId: "u-yujun", name: "Yu Jun" }, state: "covered" } })] };
    show("/finance/monitor");
    expect(screen.getByTestId("payment-monitor-day-2026-09-15")).toHaveTextContent("Ask 1 customer to pay");
    const avatar = within(screen.getByTestId("monitor-timing-1302")).getByTestId("monitor-owner-avatar");
    expect(avatar).toHaveAttribute("aria-label", "Yu Jun");
    expect(avatar).toHaveAttribute("title", "Normal owner: Shasha · Today's cover: Yu Jun");
  });

  it("All unpaid orders keeps every unpaid order reachable, including ones no plan reaches", () => {
    state.work.data = { items: [] };
    show("/finance/monitor");
    const all = screen.getByTestId("payment-monitor-all-unpaid");
    expect(all).toHaveTextContent("All unpaid orders");
    expect(all).toHaveTextContent("3");
    fireEvent.click(all);
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(listed()).toEqual(["SO-1302", "SO-1301", "SO-1300"]);
    expect(screen.getByTestId("payment-monitor-summary")).toHaveTextContent("3 orders · RM 2,600.00 still needed");
  });

  it("the plan does not change money or rows: every day's orders are Monitor rows with the same amounts", () => {
    state.work.data = { items: [workItem("i3", "2026-09-15")] };
    show("/finance/monitor");
    expect(screen.getByTestId("payment-monitor-summary")).toHaveTextContent("1 order · RM 1,000.00 still needed");
    expect(screen.getByTestId("monitor-timing-1302")).toHaveTextContent("Payment should have been received");
  });

  it("a finance reader has no Work feed: the plan says whose it is and every unpaid order stays listed", () => {
    auth.role = "finance";
    show("/finance/monitor");
    expect(screen.getByTestId("payment-monitor-rail")).toHaveTextContent("The follow-up plan is Operation's.");
    expect(screen.queryByTestId("payment-monitor-days")).not.toBeInTheDocument();
    expect(screen.getByTestId("payment-monitor-all-unpaid")).toHaveAttribute("aria-pressed", "true");
    expect(listed()).toHaveLength(3);
  });

  it("an unanswered plan is never a quiet week, and a failed plan offers Try again", () => {
    state.work.data = undefined;
    state.work.isSuccess = false;
    show("/finance/monitor");
    expect(screen.getByTestId("payment-monitor-day-2026-09-14")).toHaveTextContent("Reading the collection desk…");
    expect(screen.getByTestId("payment-monitor-day-2026-09-14")).not.toHaveTextContent("No follow-up planned");
    state.work.isError = true;
    show("/finance/monitor");
    expect(screen.getAllByText("The follow-up plan could not be loaded.").length).toBeGreaterThan(0);
  });

  it("the rail hides and comes back on Show filters, and the picked day survives the collapse", () => {
    state.work.data = { items: [workItem("i3", "2026-09-15")] };
    show("/finance/monitor");
    fireEvent.click(screen.getByRole("button", { name: "Hide filters" }));
    expect(screen.queryByTestId("payment-monitor-rail")).not.toBeInTheDocument();
    expect(localStorage.getItem("carres.paymentMonitor.filterRail")).toBe("0");
    const collapsed = screen.getByTestId("payment-monitor-day-collapsed");
    expect(collapsed).toHaveTextContent("Tue, 15 Sep · Today");
    expect(collapsed).toHaveTextContent("Ask 1 customer to pay");
    fireEvent.click(screen.getByTestId("payment-monitor-show-filters"));
    expect(screen.getByTestId("payment-monitor-rail")).toBeInTheDocument();
  });

  /* ⭐ 2026-09-14 — seven columns need 1295px and the sheet has ~950px, so the
     Monitor ALWAYS scrolls sideways. With only `SO No` pinned the right-hand
     end showed the action with no customer attached to it — the same defect the
     owner ruled on for Delivery Monitor on 2026-09-12. */
  it("the row keeps its NAME when the sheet is scrolled: SO No and Customer both pin", () => {
    show("/finance/monitor");
    const pinned = [...document.querySelectorAll("th")]
      .filter((th) => th.style.left !== "")
      .map((th) => th.textContent?.replace(/\s+/g, " ").trim());
    expect(pinned.some((t) => t?.includes("SO No"))).toBe(true);
    expect(pinned.some((t) => t?.includes("Customer"))).toBe(true);
  });
});

describe("Payment Monitor — the payment workspace opens below the row", () => {
  it("the row opens below itself with every section and door, and the listing stays", () => {
    show();
    const tr = screen.getByRole("button", { name: "SO-1302" }).closest("tr")!;
    fireEvent.click(within(tr).getByTitle("Show payment details"));
    expect(screen.getByTestId("payment-monitor-workspace")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SO-1301" })).toBeInTheDocument();
    for (const title of ["Money", "Delivery Dates", "Items, Services & Stock", "Storage", "What to do", "Invoice", "Related Payments", "Communication History"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Ask customer to pay" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record payment" })).toBeInTheDocument();
    expect(screen.queryByText(/Download DO/)).not.toBeInTheDocument();
  });

  it("`?invoice=` from Work opens that order's row below itself, on every day", () => {
    show("/finance/monitor?invoice=i3");
    expect(screen.getByTestId("payment-monitor-workspace")).toBeInTheDocument();
    expect(screen.getByTestId("payment-monitor-all-unpaid")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "SO-1302" })).toBeInTheDocument();
  });

  it("`?invoice=` for money no longer on the Monitor keeps the full-page workspace", () => {
    show("/finance/monitor?invoice=i4");
    expect(screen.getByTestId("object-identity")).toHaveTextContent("INV-1");
    expect(screen.queryByTestId("payment-monitor-workspace")).not.toBeInTheDocument();
  });

  it("Storage opens the same row at its Storage section — it edits nothing in the cell", async () => {
    show();
    fireEvent.click(screen.getByTestId("payment-monitor-storage-1302"));
    await screen.findByTestId("payment-monitor-workspace");
    await waitFor(() => expect(document.querySelector("[data-section=storage]")).toHaveFocus());
  });

  it("finance reads the workspace; it does not post normal collection (§12)", () => {
    auth.role = "finance";
    show("/finance/monitor?invoice=i3");
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask customer to pay" })).not.toBeInTheDocument();
  });

  it("a waiting order says Wait in the workspace and offers no ask door", () => {
    show("/finance/monitor?invoice=i1");
    expect(screen.getByText("Do not ask the customer to pay yet.", { exact: false })).toBeInTheDocument();
    expect(screen.getByTestId("payment-monitor-workspace")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask customer to pay" })).not.toBeInTheDocument();
  });

  it("the order scope narrows the listing and says so; an empty scope points to Payment Records", () => {
    show("/finance/monitor?order=1302");
    expect(screen.getByTestId("payment-monitor-order-scope")).toHaveTextContent("SO-1302 only");
    expect(screen.getAllByRole("button", { name: /^SO-13/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.queryByTestId("payment-monitor-order-scope")).not.toBeInTheDocument();
  });
  it("a paid order's scope says its money is in Payment Records", () => {
    show("/finance/monitor?order=1303");
    expect(screen.getByText("SO-1303 needs no payment right now. Its money is in Payment Records.")).toBeInTheDocument();
  });
});

describe("Payment Monitor — states", () => {
  it("a failed source shows recovery, never a zero desk", () => {
    state.invoices.isError = true; state.invoices.data = [];
    show();
    expect(screen.getByRole("alert")).toHaveTextContent("The collection desk could not be loaded.");
    expect(screen.queryByTestId("payment-monitor-summary")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.invoices.refetch).toHaveBeenCalled();
  });
  it("an unanswered read is a skeleton, not an empty message", () => {
    state.invoices.isSuccess = false; state.invoices.data = [];
    show();
    expect(screen.queryByText("No customer money is needed right now.")).not.toBeInTheDocument();
  });
  it("nothing needed is a useful empty state", () => {
    state.invoices.data = [row({ id: "a", paid: 1000 })];
    show();
    expect(screen.getByText("No customer money is needed right now.")).toBeInTheDocument();
  });
  it("the timing rule is read from Settings, snapshotted on the invoice's issue day", () => {
    // Delivery in 4 working days: under the default 3·2 that is before the
    // ask day; under a 6·5 rule effective before the issue day it is due.
    const delivery = workday(4);
    state.invoices.data = [row({ id: "a", so: 1300, issued_at: "2026-09-10T00:00:00Z", control: { ...READY, confirmed_date: delivery } })];
    state.settings.data = { bank_accounts: [], collection_timing: [
      { ask_days_before: 6, deadline_days_before: 5, effective_from: "2026-09-01" },
    ] };
    show();
    // The fact comes from the clock under the snapshotted rule.
    expect(screen.getByTestId("monitor-timing-1300")).not.toHaveTextContent("Wait");
    expect(screen.getByTestId("monitor-timing-1300")).toHaveTextContent(/Payment should have been received|Payment due|Ask customer today/);
  });
});
