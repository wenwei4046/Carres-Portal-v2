import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import FinanceDashboard from "./FinanceDashboard";
import FinanceAR from "./FinanceAR";
import ApOutstanding from "./payables/ApOutstanding";
import LedgerJournal from "./ledger/LedgerJournal";
import { customerBalanceRows } from "./FinancePaymentReport";
import { rm } from "@/lib/format-currency";
import { fmtDate } from "@/lib/fmt-date";

/* Reads answer by path (a function gets the whole URL); a path in `fail` throws. Names are invented. */
const api = vi.hoisted(() => ({
  routes: {} as Record<string, unknown>,
  fail: new Set<string>(),
  urls: [] as string[],
  book: [] as string[],
  files: [] as string[],
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string) => {
    api.urls.push(url);
    const path = url.replace(/\?.*$/, "");
    if (api.fail.has(path)) throw Object.assign(new Error("boom"), { status: 500, body: {} });
    if (!(path in api.routes)) throw new Error(`unexpected read ${url}`);
    const answer = api.routes[path];
    return typeof answer === "function" ? (answer as (u: string) => unknown)(url) : answer;
  }),
  ApiError: class ApiError extends Error {},
}));
vi.mock("xlsx", () => ({
  utils: {
    json_to_sheet: () => ({}),
    book_new: () => ({}),
    aoa_to_sheet: () => ({}),
    book_append_sheet: (_wb: unknown, _s: unknown, name: string) => api.book.push(name),
  },
  writeFile: (_wb: unknown, name: string) => api.files.push(name),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { storage: { from: vi.fn() } } }));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: unknown) => unknown) => sel({ user: { id: "u1" }, role: "finance" }),
}));

const INV = "/api/finance/invoices/register";
const AP = "/api/finance/payables/outstanding";
const CHART_URL = "/api/finance/ledger/accounts";
const ACCOUNT_LEDGER = "/api/finance/ledger/account-ledger";
const ENTRIES = "/api/finance/ledger/entries";

/* The business clock: 00:30 on Wed 14 Oct 2026 in Malaysia is still 13 Oct in UTC. */
const NOW = "2026-10-13T16:30:00Z";
const TODAY = "2026-10-14";
const GO_LIVE = "2026-09-10";

function invoice(id: string, orderId: string, so: number, over: {
  kind?: InvoiceRegisterRow["kind"]; amount?: number; tax?: number; paid: number; lines: number; customer: string;
  issuedAt: string;
}): InvoiceRegisterRow {
  return {
    id, invoice_no: `INV-${id}`, status: "issued", kind: over.kind ?? "sales",
    amount: over.amount ?? over.lines, tax_amount: over.tax ?? 0,
    issued_at: over.issuedAt, voided_at: null, void_reason: null, replaces_invoice_id: null,
    created_at: "2026-09-06T00:00:00Z", order_id: orderId,
    orders: {
      id: orderId, so, customer_name: over.customer, status: "proceed_order", paid: over.paid,
      delivery_date: null, delivery_date_tbd: false, delivered_at: null, placed_at: "2026-06-01T02:00:00Z",
      order_lines: [{ qty: 1, unit_price: over.lines }], order_addons: [],
      ops_order_control: [{ balance: null, confirmed_date: null, line_etas: null, line_stock_status: null }],
      order_payments: [],
    },
  };
}

/* Every order was placed on 1 Jun; the age counts from the invoice's issue day.
   The aging edge, in Malaysia time: 16:00 UTC on 13 Sep is 00:00 on 14 Sep in Malaysia (30 days before
   today: 0-30), one second earlier is still 13 Sep (31 days: overdue). Read in UTC both would be 13 Sep. */
const DAY_30 = "2026-09-13T16:00:00Z";
const DAY_31 = "2026-09-13T15:59:59Z";
const INVOICES: InvoiceRegisterRow[] = [
  invoice("i1", "o1", 5101, { paid: 400, lines: 1000, customer: "Aria Tenggara", issuedAt: DAY_31 }),
  invoice("i1s", "o1", 5101, { kind: "storage", amount: 150, tax: 8, paid: 400, lines: 1000, customer: "Aria Tenggara", issuedAt: DAY_31 }),
  invoice("i2", "o2", 5102, { paid: 500, lines: 500, customer: "Bayu Kelana", issuedAt: "2026-06-01T02:00:00Z" }),
  invoice("i3", "o3", 5103, { paid: 0, lines: 2000, customer: "Cempaka Rahman", issuedAt: DAY_30 }),
];

function supplier(id: string, name: string, owing: string) {
  return {
    supplier_id: id, supplier_name: name, bills_confirmed: 1, billed_total: owing, allocated_total: "0.00",
    paid_total: "0.00", balance_owing: owing, uncommitted: owing, oldest_confirmed_bill_date: "2026-09-10",
    go_live_on: "2026-09-10", supplier_kind: "supplier", open_bills: owing === "0.00" ? 0 : 1,
    oldest_unpaid_bill_date: owing === "0.00" ? null : "2026-09-10",
  };
}
const SUPPLIERS = [
  supplier("s1", "Lumen Sofa Works", "1225.00"),
  supplier("s2", "Quiet Oak Beds", "0.00"),
  supplier("s3", "Selasih Foam", "310.50"),
];

// ── the ledger ───────────────────────────────────────────────────────────────
const acct = (code: string, parent: string | null, isHeader = false) => ({
  code, name: `Account ${code}`, kind: "ASSET", parent_code: parent, is_control: false, control_for: null,
  is_active: true, is_header: isHeader,
});
const CHART = {
  go_live_on: GO_LIVE,
  accounts: [acct("1000", null, true), acct("1100", "1000", true), acct("1110", "1100"), acct("1120", "1100"), acct("1210", "1000")],
};
type Line = { entry_no: string; entry_date: string; debit: number; credit: number };
const CASH_LINES: Record<string, Line[]> = {
  "1120": [
    { entry_no: "JE-202609-0003", entry_date: "2026-09-10", debit: 1000, credit: 0 },
    { entry_no: "JE-202609-0009", entry_date: "2026-09-15", debit: 300, credit: 0 }, // from the cash drawer
  ],
  "1110": [
    { entry_no: "JE-202609-0004", entry_date: "2026-09-12", debit: 0, credit: 250 },
    { entry_no: "JE-202609-0009", entry_date: "2026-09-15", debit: 0, credit: 300 }, // to the bank
  ],
};
function accountLedger(url: string) {
  const q = new URL(url, "http://portal.test").searchParams;
  const code = q.get("account")!;
  const lines = CASH_LINES[code] ?? [];
  const sum = (k: "debit" | "credit") => lines.reduce((s, l) => s + l[k], 0);
  return {
    status: "OK", go_live_on: GO_LIVE, account_code: code,
    rows: [
      { row_kind: "OPENING", entry_no: null, entry_date: null, debit: null, credit: null },
      ...lines.map((l) => ({ row_kind: "LINE", ...l })),
      { row_kind: "CLOSING", entry_no: null, entry_date: null, debit: sum("debit"), credit: sum("credit") },
    ],
  };
}
const entryBase = {
  narration: null, reversed: false, reverses: null, reverses_entry_no: null, reversed_by: null,
  reversed_by_entry_no: null, created_at: "2026-09-10T02:00:00Z", source_doc_no: "INV-TEST-1",
};
const E_NEW = { ...entryBase, id: "e9", entry_no: "JE-202609-0009", entry_date: "2026-09-15", source_type: "SOMETHING_NEW",
  total_debit: 300, total_credit: 300 };
const E_SALE = { ...entryBase, id: "e3", entry_no: "JE-202609-0003", entry_date: "2026-09-10", source_type: "SALES_INVOICE",
  total_debit: 1000, total_credit: 1000 };
const DETAIL = {
  entry: E_SALE,
  lines: [
    { line_no: 1, account_code: "1120", account_name: "Bank", debit: 1000, credit: 0, party_type: null, party_id: null, party_name: null, memo: null },
    { line_no: 2, account_code: "4100", account_name: "Sales", debit: 0, credit: 1000, party_type: null, party_id: null, party_name: null, memo: null },
  ],
  related: [],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  api.fail.clear();
  api.urls.length = 0;
  api.book.length = 0;
  api.files.length = 0;
  api.routes = {
    [INV]: { rows: INVOICES, total: INVOICES.length },
    [AP]: { rows: SUPPLIERS },
    [CHART_URL]: CHART,
    [ACCOUNT_LEDGER]: accountLedger,
    [ENTRIES]: { rows: [E_NEW, E_SALE], total: 2 },
    [`${ENTRIES}/JE-202609-0003`]: DETAIL,
  };
  localStorage.clear();
});
afterEach(() => { vi.useRealTimers(); });

function Where() {
  const loc = useLocation();
  return <span data-testid="where">{loc.pathname}{loc.search}</span>;
}

function show(ui: React.ReactNode, at = "/finance") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={[at]}>{ui}<Where /></MemoryRouter>
  </QueryClientProvider>);
}

const panel = (title: string) => screen.getByRole("heading", { name: title }).closest("section") as HTMLElement;

describe("Finance Dashboard", () => {
  it("Unpaid is the same figure the AP · Payables page footer prints", async () => {
    const dash = show(<FinanceDashboard />);
    const amount = await screen.findByTestId("dashboard-unpaid-amount");
    const dashText = amount.textContent;
    expect(dashText).toBe("RM 1,535.50");
    expect(screen.getByTestId("dashboard-unpaid")).toHaveTextContent("2 suppliers");
    dash.unmount();

    show(<ApOutstanding />);
    const footer = await screen.findByTestId("ap-outstanding-summary");
    // Same count too: the supplier owed nothing (Quiet Oak Beds) is not counted on either surface.
    expect(footer).toHaveTextContent(`2 suppliers · ${dashText} unpaid`);
  });

  it("Outstanding is the sum of Customer balances that still owe, and the AR footer says the same", async () => {
    const expected = customerBalanceRows(INVOICES)
      .filter((r) => r.outstanding > 0)
      .reduce((s, r) => s + r.outstanding, 0);
    expect(expected).toBe(2758); // 1000 + 158 storage − 400, and 2000; the settled order is out
    const dash = show(<FinanceDashboard />);
    const amount = await screen.findByTestId("dashboard-outstanding-amount");
    expect(amount).toHaveTextContent(rm(expected));
    expect(screen.getByTestId("dashboard-outstanding")).toHaveTextContent("2 orders");
    dash.unmount();

    show(<FinanceAR />, "/finance/ar");
    expect(await screen.findByTestId("ar-summary")).toHaveTextContent(`2 orders · ${rm(expected)} outstanding`);
  });

  it("Overdue (>30d) counts the order 31 Malaysia days old, not the one 30 days old, and AR says the same behind its door", async () => {
    const dash = show(<FinanceDashboard />);
    expect(await screen.findByTestId("dashboard-overdue-amount")).toHaveTextContent("RM 758.00");
    const tile = screen.getByTestId("dashboard-overdue");
    expect(tile).toHaveTextContent("1 order");
    const door = within(tile).getByRole("link", { name: "Open AR · Receivables" });
    expect(door).toHaveAttribute("href", "/finance/ar?age=over-30");
    dash.unmount();

    show(<FinanceAR />, "/finance/ar?age=over-30");
    expect(await screen.findByTestId("ar-summary")).toHaveTextContent("1 order · RM 758.00 outstanding");
    expect(screen.getByText("Overdue (>30d)")).toBeInTheDocument();
    expect(screen.getByText("31 days")).toBeInTheDocument();
  });

  it("each A/R Aging bucket equals the AR footer at its age, and the buckets add up to Outstanding", async () => {
    const dash = show(<FinanceDashboard />);
    await screen.findByTestId("dashboard-aging");
    const want: Record<string, string> = {
      "0-30": "RM 2,000.00 · 1 order",
      "31-60": "RM 758.00 · 1 order",
      "61-90": "RM 0.00 · 0 orders",
      "90+": "RM 0.00 · 0 orders",
    };
    for (const [b, text] of Object.entries(want)) {
      expect(screen.getByTestId(`dashboard-aging-${b}-amount`)).toHaveTextContent(text);
      expect(screen.getByTestId(`dashboard-aging-${b}`)).toHaveAttribute("href", `/finance/ar?age=${encodeURIComponent(b)}`);
    }
    dash.unmount();

    for (const [b, footer] of [["0-30", "1 order · RM 2,000.00"], ["31-60", "1 order · RM 758.00"]] as const) {
      const ar = show(<FinanceAR />, `/finance/ar?age=${encodeURIComponent(b)}`);
      expect(await screen.findByTestId("ar-summary")).toHaveTextContent(`${footer} outstanding`);
      ar.unmount();
    }
    // 2,000.00 + 758.00 = 2,758.00, the Outstanding tile.
  });

  it("Net cash is money in less money out on the cash and bank accounts since go-live, and says it is short", async () => {
    show(<FinanceDashboard />);
    expect(await screen.findByTestId("dashboard-net-cash-amount")).toHaveTextContent("RM 750.00");
    const tile = screen.getByTestId("dashboard-net-cash");
    // The cash-drawer → bank move (JE-202609-0009) is neither in nor out.
    expect(tile).toHaveTextContent("In RM 1,000.00 · Out RM 250.00");
    expect(screen.getByTestId("dashboard-net-cash-short")).toHaveTextContent("Since Thu, 10 Sep · 6 of 12 weeks");
    // Every account ledger read starts at go-live and ends today (Malaysia), one per cash account.
    const reads = api.urls.filter((u) => u.startsWith(ACCOUNT_LEDGER));
    expect(reads.sort()).toEqual([
      `${ACCOUNT_LEDGER}?account=1110&from=${GO_LIVE}&to=${TODAY}`,
      `${ACCOUNT_LEDGER}?account=1120&from=${GO_LIVE}&to=${TODAY}`,
    ]);
    // The chart's weeks add up to the tile; the first week starts on go-live, not its Monday.
    const chart = screen.getByTestId("dashboard-cashflow");
    expect(within(chart).getByTestId("dashboard-cashflow-net")).toHaveTextContent("RM 750.00");
    expect(within(chart).getByTestId("dashboard-cashflow-in")).toHaveTextContent("RM 1,000.00");
    expect(within(chart).getByTestId("dashboard-cashflow-out")).toHaveTextContent("RM 250.00");
    expect(within(chart).getByTestId(`dashboard-cashflow-week-${GO_LIVE}`)).toHaveTextContent("RM 750.00");
    expect(within(chart).queryByTestId("dashboard-cashflow-week-2026-09-07")).not.toBeInTheDocument();
    expect(screen.getByTestId("dashboard-cashflow-short")).toHaveTextContent("The ledger started on Thu, 10 Sep. 6 of 12 weeks so far.");
  });

  it("twelve columns whose first starts mid-week on go-live name the date, never '12 of 12 weeks'", async () => {
    vi.setSystemTime(new Date("2026-11-25T02:00:00Z")); // 10:00 on Wed 25 Nov, Malaysia
    show(<FinanceDashboard />);
    expect(await screen.findByTestId("dashboard-net-cash-amount")).toHaveTextContent("RM 750.00");
    const chart = screen.getByTestId("dashboard-cashflow");
    expect(within(chart).getAllByRole("listitem")).toHaveLength(12);
    expect(within(chart).getByTestId(`dashboard-cashflow-week-${GO_LIVE}`)).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-net-cash-short").textContent).toBe(`Since ${fmtDate(GO_LIVE)}`);
    expect(screen.getByTestId("dashboard-cashflow-short").textContent).toBe(`The ledger started on ${fmtDate(GO_LIVE)}.`);
    expect(document.body).not.toHaveTextContent(/12 of 12/);
  });

  it("a go-live still ahead says when the ledger starts — no RM figure, no chart, no 'started on'", async () => {
    const ahead = "2026-10-20";
    api.routes[CHART_URL] = { ...CHART, go_live_on: ahead };
    show(<FinanceDashboard />);
    const tile = screen.getByTestId("dashboard-net-cash");
    const sentence = `The ledger starts on ${fmtDate(ahead)}.`;
    expect(await within(tile).findByText(sentence)).toBeInTheDocument();
    const chart = panel("Cashflow · Last 12 weeks");
    expect(within(chart).getByText(sentence)).toBeInTheDocument();
    for (const el of [tile, chart]) {
      expect(el).not.toHaveTextContent("RM");
      expect(el).not.toHaveTextContent("started on");
    }
    expect(screen.queryByTestId("dashboard-net-cash-amount")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-cashflow")).not.toBeInTheDocument();
    expect(api.urls.some((u) => u.startsWith(ACCOUNT_LEDGER))).toBe(false);
  });

  it("Activity lists the newest entries from go-live, and each number opens that entry in the Journal", async () => {
    const dash = show(<FinanceDashboard />);
    const table = await screen.findByTestId("dashboard-activity");
    expect(await within(table).findByRole("link", { name: "JE-202609-0003" })).toHaveAttribute("href", "/finance/ledger?entry=JE-202609-0003");
    expect(within(table).getByRole("link", { name: "JE-202609-0009" })).toHaveAttribute("href", "/finance/ledger?entry=JE-202609-0009");
    expect(within(table).getByText("Sales invoice")).toBeInTheDocument();
    expect(within(table).getByText("Other entry")).toBeInTheDocument();
    expect(within(table).getByText("RM 1,000.00")).toBeInTheDocument();
    expect(api.urls).toContain(`${ENTRIES}?offset=0&limit=8&from=${GO_LIVE}`);
    expect(within(panel("Activity · Recent transactions")).getByRole("link", { name: "Open Journal" })).toHaveAttribute("href", "/finance/ledger");
    fireEvent.click(within(table).getByRole("link", { name: "JE-202609-0003" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/finance/ledger?entry=JE-202609-0003");
    dash.unmount();

    show(<LedgerJournal />, "/finance/ledger?entry=JE-202609-0003");
    expect(await screen.findByTestId("object-identity")).toHaveTextContent("JE-202609-0003");
    expect(await screen.findByTestId("ledger-entry-facts")).toHaveTextContent("Sales invoice");
    expect(screen.getAllByText("RM 1,000.00").length).toBeGreaterThan(0);
  });

  it("a failed Invoices read says Could not load in Outstanding, Overdue and A/R Aging — never a zero", async () => {
    api.fail.add(INV);
    show(<FinanceDashboard />);
    const overdue = screen.getByTestId("dashboard-overdue");
    expect(await within(overdue).findByText("Could not load Invoices")).toBeInTheDocument();
    const aging = panel("A/R Aging · Outstanding by age");
    expect(await within(aging).findByText("Could not load Invoices")).toBeInTheDocument();
    for (const el of [overdue, aging, screen.getByTestId("dashboard-outstanding")]) {
      expect(el).not.toHaveTextContent("RM 0.00");
      expect(within(el).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    }
  });

  it("an owing order whose invoice is still a draft stays in Outstanding but has no age", async () => {
    api.routes[INV] = {
      rows: INVOICES.map((r) => (r.id === "i3"
        ? { ...r, status: "draft" as const, invoice_no: null, issued_at: null } : r)),
      total: INVOICES.length,
    };
    const dash = show(<FinanceDashboard />);
    expect(await screen.findByTestId("dashboard-outstanding-amount")).toHaveTextContent("RM 2,758.00");
    expect(screen.getByTestId("dashboard-overdue-amount")).toHaveTextContent("RM 758.00");
    expect(screen.getByTestId("dashboard-aging-0-30-amount")).toHaveTextContent("RM 0.00 · 0 orders");
    dash.unmount();

    show(<FinanceAR />, "/finance/ar");
    expect(await screen.findByTestId("ar-summary")).toHaveTextContent("2 orders · RM 2,758.00 outstanding");
    expect(screen.getByText("Not issued yet")).toBeInTheDocument();
  });

  it("an issued invoice whose date cannot be read makes the aging unreadable, never 0-30", async () => {
    api.routes[INV] = { rows: INVOICES.map((r) => ({ ...r, issued_at: "not a date" })), total: INVOICES.length };
    show(<FinanceDashboard />);
    expect(await screen.findByTestId("dashboard-outstanding-amount")).toHaveTextContent("RM 2,758.00");
    expect(within(screen.getByTestId("dashboard-overdue")).getByText("Could not load Invoices")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-aging")).not.toBeInTheDocument();
  });

  it("a failed cash read says Could not load Cash and bank in the tile and the chart — never a zero", async () => {
    api.fail.add(ACCOUNT_LEDGER);
    show(<FinanceDashboard />);
    const tile = screen.getByTestId("dashboard-net-cash");
    expect(await within(tile).findByText("Could not load Cash and bank")).toBeInTheDocument();
    const chart = panel("Cashflow · Last 12 weeks");
    expect(within(chart).getByText("Could not load Cash and bank")).toBeInTheDocument();
    for (const el of [tile, chart]) {
      expect(el).not.toHaveTextContent("RM 0.00");
      expect(within(el).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    }
  });

  /*
   * TWO WINDOWS, TWO FAILURES. From the first week of December the panel's window (from go-live, and
   * growing) and the twelve-week window are different reads. The account ledger refuses a read over
   * 20,000 lines per account, and the panel's window is the one that will meet that cap — so it must
   * fail alone. The tile and the chart worked before the panel existed and may not go down with it.
   */
  const LATER = "2027-03-01T02:00:00Z"; // 10:00 on Mon 1 Mar 2027, Malaysia
  const RECENT = { entry_no: "JE-202702-0001", entry_date: "2027-02-01", debit: 500, credit: 0 };
  const windowed = (capped: "since-go-live" | "twelve-weeks") => (url: string) => {
    const q = new URL(url, "http://portal.test").searchParams;
    const from = q.get("from")!;
    if ((from === GO_LIVE) === (capped === "since-go-live")) {
      throw Object.assign(new Error("too many rows"), { status: 422, body: { code: "too_many_rows" } });
    }
    const code = q.get("account")!;
    const pool = [...(CASH_LINES[code] ?? []), ...(code === "1120" ? [RECENT] : [])];
    const lines = pool.filter((l) => l.entry_date >= from && l.entry_date <= q.get("to")!);
    const sum = (k: "debit" | "credit") => lines.reduce((s, l) => s + l[k], 0);
    return {
      status: "OK", go_live_on: GO_LIVE, account_code: code,
      rows: [
        ...lines.map((l) => ({ row_kind: "LINE", ...l })),
        { row_kind: "CLOSING", entry_no: null, entry_date: null, debit: sum("debit"), credit: sum("credit") },
      ],
    };
  };

  it("the panel's own read failing leaves the Net cash tile and the Cashflow chart standing", async () => {
    vi.setSystemTime(new Date(LATER));
    api.routes[ACCOUNT_LEDGER] = windowed("since-go-live");
    show(<FinanceDashboard />);
    expect(await screen.findByTestId("dashboard-net-cash-amount")).toHaveTextContent("RM 500.00");
    expect(screen.getByTestId("dashboard-cashflow")).toBeInTheDocument();
    const movement = panel("Cash and bank · Movement since go-live");
    expect(within(movement).getByText("Could not load Cash and bank")).toBeInTheDocument();
    expect(movement).not.toHaveTextContent("RM 0.00");
    expect(screen.queryByTestId("dashboard-account-movement-table")).not.toBeInTheDocument();
  });

  it("the twelve-week read failing leaves the per-account panel standing", async () => {
    vi.setSystemTime(new Date(LATER));
    api.routes[ACCOUNT_LEDGER] = windowed("twelve-weeks");
    show(<FinanceDashboard />);
    const movement = panel("Cash and bank · Movement since go-live");
    expect(await within(movement).findByTestId("dashboard-account-movement-table")).toBeInTheDocument();
    expect(within(movement).getAllByTestId("dashboard-account-movement-row")).toHaveLength(2);
    for (const el of [screen.getByTestId("dashboard-net-cash"), panel("Cashflow · Last 12 weeks")]) {
      expect(within(el).getByText("Could not load Cash and bank")).toBeInTheDocument();
      expect(el).not.toHaveTextContent("RM 0.00");
    }
  });

  it("a failed Journal read says Could not load Journal, never an empty list", async () => {
    api.fail.add(ENTRIES);
    show(<FinanceDashboard />);
    const card = panel("Activity · Recent transactions");
    expect(await within(card).findByText("Could not load Journal")).toBeInTheDocument();
    expect(within(card).queryByText(/No entries yet/)).not.toBeInTheDocument();
  });

  it("a failed chart read fails the cash and Activity boxes in words", async () => {
    api.fail.add(CHART_URL);
    show(<FinanceDashboard />);
    expect(await within(screen.getByTestId("dashboard-net-cash")).findByText("Could not load Cash and bank")).toBeInTheDocument();
    expect(within(panel("Activity · Recent transactions")).getByText("Could not load Journal")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-net-cash")).not.toHaveTextContent("RM 0.00");
  });

  it("never calls the retired reads", async () => {
    show(<FinanceDashboard />);
    await screen.findByTestId("dashboard-net-cash-amount");
    expect(api.urls.some((u) => /dashboard-summary|cashflow|ar-aging|ap-aging|monthly-pl|top-skus/.test(u))).toBe(false);
  });

  it("each figure opens the page that adds it up", async () => {
    show(<FinanceDashboard />);
    const [outstandingDoor, overdueDoor] = screen.getAllByRole("link", { name: "Open AR · Receivables" });
    expect(outstandingDoor).toHaveAttribute("href", "/finance/ar");
    expect(overdueDoor).toHaveAttribute("href", "/finance/ar?age=over-30");
    expect(screen.getByRole("link", { name: "Open AP · Payables" })).toHaveAttribute("href", "/finance/ap-outstanding");
  });

  it("keeps the old layout: four tiles, then Cashflow beside A/R Aging, then Activity beside Payables", async () => {
    show(<FinanceDashboard />);
    const row1 = ["dashboard-outstanding", "dashboard-overdue", "dashboard-unpaid", "dashboard-net-cash"].map((id) => screen.getByTestId(id));
    expect(new Set(row1.map((el) => el.parentElement)).size).toBe(1);
    expect(row1.map((el) => within(el).getAllByText(/./)[0]!.textContent)).toEqual(
      ["Outstanding", "Overdue (>30d)", "Unpaid", "Net cash · 12 wks"],
    );
    const cashflow = panel("Cashflow · Last 12 weeks");
    const aging = panel("A/R Aging · Outstanding by age");
    const activity = panel("Activity · Recent transactions");
    const payables = screen.getByTestId("dashboard-payables");
    expect(cashflow.parentElement).toBe(aging.parentElement);
    expect(activity.parentElement).toBe(payables.parentElement);
    const order = [row1[3]!, cashflow, aging, activity, payables];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // The Payables card prints the same Unpaid figure as its tile — one arithmetic.
    expect(await within(payables).findByTestId("dashboard-payables-amount")).toHaveTextContent("RM 1,535.50");
    expect(payables).toHaveTextContent("2 suppliers");
  });

  it("a failed AP read says Could not load in the Payables card too", async () => {
    api.fail.add(AP);
    show(<FinanceDashboard />);
    const card = screen.getByTestId("dashboard-payables");
    expect(await within(card).findByText("Could not load AP · Payables")).toBeInTheDocument();
    expect(card).not.toHaveTextContent("RM 0.00");
    expect(await screen.findByTestId("dashboard-outstanding-amount")).toHaveTextContent("RM 2,758.00");
  });

  it("exports the month-end pack for the last complete month: Trial Balance, Profit and Loss, Balance Sheet", async () => {
    Object.assign(api.routes, {
      "/api/finance/ledger/trial-balance": (u: string) => ({
        status: "ok", go_live_on: GO_LIVE, as_of: new URL(u, "http://t").searchParams.get("asOf"),
        accounts: [], total_debit: 0, total_credit: 0, difference: 0, balances: true,
      }),
      "/api/finance/ledger/profit-and-loss": (u: string) => {
        const q = new URL(u, "http://t").searchParams;
        return { rows: [{ report_status: "OK", go_live_on: GO_LIVE, period_from: q.get("from"), period_to: q.get("to"),
          ordinal: 1, section: "NET", row_kind: "NET", amount: 0 }] };
      },
      "/api/finance/ledger/balance-sheet": (u: string) => ({
        rows: [
          { section: "EQUITY", row_kind: "ACCOUNT", header_code: "3000", account_code: "3100", amount: 0 },
          { section: "EQUITY", row_kind: "HEADER_SUBTOTAL", header_code: "3000", amount: 0 },
          { section: "EQUITY", row_kind: "DERIVED", amount: 0 },
          { section: "EQUITY", row_kind: "SECTION_TOTAL", amount: 0 },
          { section: "CHECK", row_kind: "EQUATION", amount: 0 },
        ].map((r, i) => ({ report_status: "OK", go_live_on: GO_LIVE, as_of: new URL(u, "http://t").searchParams.get("asOf"),
          ordinal: i + 1, header_name: null, account_name: null, equation_balances: true, equation_difference: 0, ...r })),
      }),
    });
    show(<FinanceDashboard />);
    const pack = screen.getByTestId("dashboard-month-end-pack");
    // Today is 14 Oct; September (go-live 10 Sep) is the last complete month.
    const button = within(pack).getByRole("button", { name: "Export month-end pack" });
    await waitFor(() => expect(button).toBeEnabled());
    expect(within(pack).getByRole("combobox")).toHaveTextContent("Sep 2026");
    fireEvent.click(button);
    await waitFor(() => expect(api.files).toEqual(["Month-end pack Sep 2026.xlsx"]));
    expect(api.book).toEqual(["Trial Balance", "Profit and Loss", "Balance Sheet"]);
    expect(api.urls).toEqual(expect.arrayContaining([
      "/api/finance/ledger/trial-balance?asOf=2026-09-30",
      "/api/finance/ledger/profit-and-loss?from=2026-09-01&to=2026-09-30",
      "/api/finance/ledger/balance-sheet?asOf=2026-09-30",
    ]));
  });

  it("says so when the month-end pack could not be exported, and writes no file", async () => {
    show(<FinanceDashboard />);
    const pack = screen.getByTestId("dashboard-month-end-pack");
    const button = within(pack).getByRole("button", { name: "Export month-end pack" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await within(pack).findByRole("alert", {}, { timeout: 4000 })).toHaveTextContent(
      "The month-end pack could not be exported. Try again.",
    );
    expect(api.files).toEqual([]);
  });
});
