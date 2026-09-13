import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import PaymentMonitor from "./PaymentMonitor";

/**
 * PAYMENT MONITOR (owner ruling 2026-09-12): the full-width collection control
 * listing — seven columns in the ruled order, Primary School English goods and
 * storage facts, a two-line Payment timing cell with the Work feed's resolved
 * owner, seven factual rail filters, clear summaries, and the collection
 * workspace behind the row.
 */
const state = vi.hoisted(() => ({
  invoices: { data: [] as unknown[], isLoading: false, isError: false, isSuccess: true, refetch: vi.fn(), error: null },
  cases: { data: { cases: [] as unknown[] }, isLoading: false, isError: false, isSuccess: true, refetch: vi.fn() },
  requests: { data: { requests: [] as unknown[] }, isLoading: false, isError: false, isSuccess: true, refetch: vi.fn() },
  settings: { data: { collection_timing: [] as unknown[], bank_accounts: [] }, isLoading: false, isError: false, isSuccess: true, refetch: vi.fn() },
  work: { data: undefined as unknown },
}));
vi.mock("@/lib/queries", () => ({
  useInvoiceRegister: () => state.invoices,
  usePaymentStorageCases: () => state.cases,
  useLaterDeliveryRequests: () => state.requests,
  usePaymentSettings: () => state.settings,
  useOperationWork: () => state.work,
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

beforeEach(() => {
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
  state.work.data = undefined;
  auth.role = "operation";
  localStorage.clear();
  // jsdom's window is 1024px wide, below the 1100px rule that starts the rail
  // collapsed — the desktop tests want it open, as a wide window would.
  Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
});

function show(at = "/finance/monitor") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}><PaymentMonitor /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Payment Monitor — the listing", () => {
  it("shows the seven ruled columns, in order, and no Arrival column", () => {
    show();
    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent?.trim() ?? "");
    const words = ["SO No", "Customer", "Amount needed", "Goods", "Storage", "Customer delivery", "Payment timing"];
    const positions = words.map((w) => headers.findIndex((h) => h.startsWith(w)));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(headers.some((h) => /Expected arrival|^Arrival/.test(h))).toBe(false);
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

  it("Goods and Payment timing speak Primary School English — Wait is never a blind chase", () => {
    show();
    expect(screen.getAllByText("Arrival not confirmed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Goods ready").length).toBeGreaterThan(0);
    const waiting = screen.getByTestId("monitor-timing-1300");
    expect(waiting).toHaveTextContent("Arrival not confirmed");
    expect(waiting).toHaveTextContent("Wait");
    expect(waiting).not.toHaveTextContent("Ask customer to pay");
    const late = screen.getByTestId("monitor-timing-1302");
    expect(late).toHaveTextContent("Payment should have been received");
    expect(late).toHaveTextContent("Ask customer to pay");
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
      owner: { rule: "payment_duty", dutyKey: "payment_duty", normal: { userId: "u-shasha", name: "Shasha Tan" },
        activeCover: null, acting: { userId: "u-shasha", name: "Shasha Tan" }, state: "primary" },
      timing: { dueOn: iso(-5), workingDaysLate: 3, bucket: "overdue" },
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

  it("an unassigned duty is a visible configuration exception with the one assignment door", () => {
    state.work.data = { items: [{
      id: "payment:i3:payment.collect_customer_balance", module: "payment",
      ruleKey: "payment.collect_customer_balance",
      object: { kind: "invoice", id: "i3", label: "INV-1" },
      problem: "Customer payment should have been received", action: "Ask customer to pay",
      recipient: "LIM KUAN YANG", requiredResult: "x", completionFact: "y",
      owner: { rule: "payment_duty", dutyKey: "payment_duty", normal: null, activeCover: null, acting: null, state: "not_assigned" },
      timing: { dueOn: iso(-5), workingDaysLate: 3, bucket: "overdue" },
      destination: "/finance/monitor?invoice=i3", tone: "danger", locked: false, broken: false,
    }] };
    show();
    const late = screen.getByTestId("monitor-timing-1302");
    expect(within(late).getByTestId("monitor-owner-unassigned")).toHaveTextContent("Payment Duty is not assigned");
    expect(within(late).getByRole("link", { name: "Staff & Duties" })).toHaveAttribute("href", "/operation?tab=staff-duties");
    expect(late).toHaveTextContent("Ask customer to pay");
    expect(screen.queryByTestId("monitor-owner-avatar")).not.toBeInTheDocument();
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
    expect(screen.getByText("Mattress / Bedframe · Day 15 · RM 150.00 so far")).toBeInTheDocument();
    // SO-1301 still needs the goods money only — RM 1,000.00, not 1,150.
    expect(screen.getByTestId("payment-monitor-summary")).toHaveTextContent("RM 2,600.00 still needed");
    expect(screen.getAllByText("No storage charge").length).toBe(2);
  });

  it("Customer delivery shows the confirmed day, or No delivery date — never a Logistics ETA", () => {
    state.invoices.data = [
      row({ id: "a", order_id: "o1", so: 1300, control: { ...READY, confirmed_date: "2026-09-18" } }),
      row({ id: "b", order_id: "o2", so: 1301, control: READY }),
    ];
    show();
    expect(screen.getByRole("button", { name: /Open Calendar · Customer delivery Friday, 18 Sep/ })).toBeInTheDocument();
    expect(screen.getAllByText("No delivery date").length).toBeGreaterThan(0);
  });

  it("Show items opens the read-only exact item disclosure — Item · Qty · Goods", () => {
    state.invoices.data = [row({ id: "a", order_id: "o1", so: 1300,
      lines: [{ sku: "A", qty: 2, unit_price: 500 }, { sku: "B", qty: 1, unit_price: 100 }],
      control: { line_stock_status: { A: "ready", B: "waiting" }, line_etas: { B: "2026-09-21" }, confirmed_date: iso(20) } })];
    show();
    expect(screen.getByText("1 of 2 items ready · Last item arriving Monday, 21 Sep")).toBeInTheDocument();
    fireEvent.click(screen.getAllByTitle("Show items")[0]);
    const items = screen.getByTestId("payment-monitor-items");
    expect(within(items).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Item", "Qty", "Goods"]);
    expect(items).toHaveTextContent("King Mattress");
    expect(items).toHaveTextContent("Arriving Monday, 21 Sep");
    expect(within(items).queryAllByRole("button")).toHaveLength(0);
    expect(within(items).queryAllByRole("textbox")).toHaveLength(0);
  });
});

describe("Payment Monitor — the rail: filters are facts, summaries name the work", () => {
  it("has the seven filters as rail rows, never tabs, with live counts", () => {
    show();
    const rail = screen.getByTestId("payment-monitor-rail");
    expect(within(rail).queryAllByRole("tab")).toHaveLength(0);
    for (const label of ["Needs attention", "Ask customer today", "Promised today", "Should have been paid",
      "Waiting for goods", "Storage payments", "All unpaid"]) {
      expect(within(rail).getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByTestId("payment-monitor-filter-all_unpaid")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("payment-monitor-filter-all_unpaid")).toHaveTextContent("3");
    expect(screen.getByTestId("payment-monitor-filter-should_have_paid")).toHaveTextContent("1");
    expect(screen.getByTestId("payment-monitor-filter-waiting_goods")).toHaveTextContent("1");
  });

  it("picking a filter narrows the listing and the URL, never the summaries", () => {
    show();
    fireEvent.click(screen.getByTestId("payment-monitor-filter-should_have_paid"));
    expect(screen.getAllByRole("button", { name: /^SO-13/ }).map((b) => b.textContent)).toEqual(["SO-1302"]);
    expect(screen.getByTestId("payment-monitor-summaries")).toHaveTextContent("1 payment should have been received already");
    fireEvent.click(screen.getByTestId("payment-monitor-filter-waiting_goods"));
    expect(screen.getAllByRole("button", { name: /^SO-13/ }).map((b) => b.textContent)).toEqual(["SO-1300"]);
  });

  it("summaries are sentences, never `8 open · 2 late`", () => {
    show();
    const summaries = screen.getByTestId("payment-monitor-summaries");
    expect(summaries).toHaveTextContent("1 payment should have been received already");
    expect(summaries.textContent).not.toMatch(/\d+ open/);
  });

  it("the rail hides and comes back on Show filters, remembered for the browser", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Hide filters" }));
    expect(screen.queryByTestId("payment-monitor-rail")).not.toBeInTheDocument();
    expect(localStorage.getItem("carres.paymentMonitor.filterRail")).toBe("0");
    fireEvent.click(screen.getByTestId("payment-monitor-show-filters"));
    expect(screen.getByTestId("payment-monitor-rail")).toBeInTheDocument();
  });
});

describe("Payment Monitor — the collection workspace behind the row", () => {
  it("SO No opens the one-scroll collection workspace shared Work deep-links to", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "SO-1302" }));
    expect(screen.getByTestId("invoice-object-scroll")).toBeInTheDocument();
    for (const title of ["Money", "Goods and Delivery", "Storage", "What to do", "Invoice", "Related Payments", "Communication History"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Ask customer to pay" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record payment" })).toBeInTheDocument();
    expect(screen.queryByText(/Download DO/)).not.toBeInTheDocument();
  });

  it("`?invoice=` from Work opens the same workspace directly", () => {
    show("/finance/monitor?invoice=i3");
    expect(screen.getByTestId("invoice-object-scroll")).toBeInTheDocument();
    expect(screen.getByTestId("object-identity")).toHaveTextContent("INV-1");
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
    expect(screen.getByTestId("payment-monitor-summaries")).toHaveTextContent("Reading the collection desk…");
  });
  it("nothing needed is a useful empty state", () => {
    state.invoices.data = [row({ id: "a", paid: 1000 })];
    show();
    expect(screen.getByText("No customer money is needed right now.")).toBeInTheDocument();
    expect(screen.getByTestId("payment-monitor-summaries")).toHaveTextContent("Nothing needs collection today");
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
    expect(screen.getByTestId("monitor-timing-1300")).toHaveTextContent("Ask customer to pay");
  });
});
