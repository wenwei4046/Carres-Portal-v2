import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import FinanceDashboard from "./FinanceDashboard";
import FinanceAR from "./FinanceAR";
import ApOutstanding from "./payables/ApOutstanding";
import { customerBalanceRows } from "./FinancePaymentReport";
import { rm } from "@/lib/format-currency";

/* Reads answer by path; a path in `fail` throws. Names are invented. */
const api = vi.hoisted(() => ({
  routes: {} as Record<string, unknown>,
  fail: new Set<string>(),
  urls: [] as string[],
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string) => {
    api.urls.push(url);
    const path = url.replace(/\?.*$/, "");
    if (api.fail.has(path)) throw Object.assign(new Error("boom"), { status: 500, body: {} });
    if (!(path in api.routes)) throw new Error(`unexpected read ${url}`);
    return api.routes[path];
  }),
  ApiError: class ApiError extends Error {},
}));
vi.mock("xlsx", () => ({ utils: {}, writeFile: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { storage: { from: vi.fn() } } }));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: unknown) => unknown) => sel({ user: { id: "u1" }, role: "finance" }),
}));

const INV = "/api/finance/invoices/register";
const AP = "/api/finance/payables/outstanding";

function invoice(id: string, orderId: string, so: number, over: {
  kind?: InvoiceRegisterRow["kind"]; amount?: number; tax?: number; paid: number; lines: number; customer: string;
}): InvoiceRegisterRow {
  return {
    id, invoice_no: `INV-${id}`, status: "issued", kind: over.kind ?? "sales",
    amount: over.amount ?? over.lines, tax_amount: over.tax ?? 0,
    issued_at: "2026-09-06", voided_at: null, void_reason: null, replaces_invoice_id: null,
    created_at: "2026-09-06T00:00:00Z", order_id: orderId,
    orders: {
      id: orderId, so, customer_name: over.customer, status: "proceed_order", paid: over.paid,
      delivery_date: null, delivery_date_tbd: false, delivered_at: null,
      order_lines: [{ qty: 1, unit_price: over.lines }], order_addons: [],
      ops_order_control: [{ balance: null, confirmed_date: null, line_etas: null, line_stock_status: null }],
      order_payments: [],
    },
  };
}

const INVOICES: InvoiceRegisterRow[] = [
  invoice("i1", "o1", 5101, { paid: 400, lines: 1000, customer: "Aria Tenggara" }),
  invoice("i1s", "o1", 5101, { kind: "storage", amount: 150, tax: 8, paid: 400, lines: 1000, customer: "Aria Tenggara" }),
  invoice("i2", "o2", 5102, { paid: 500, lines: 500, customer: "Bayu Kelana" }),
  invoice("i3", "o3", 5103, { paid: 0, lines: 2000, customer: "Cempaka Rahman" }),
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

beforeEach(() => {
  api.fail.clear();
  api.urls.length = 0;
  api.routes = {
    [INV]: { rows: INVOICES, total: INVOICES.length },
    [AP]: { rows: SUPPLIERS },
  };
  localStorage.clear();
});

function show(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}

describe("Finance Dashboard", () => {
  it("Unpaid is the same figure the Unpaid by Supplier footer prints", async () => {
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

    show(<FinanceAR />);
    expect(await screen.findByTestId("ar-summary")).toHaveTextContent(`2 orders · ${rm(expected)} outstanding`);
  });

  it("a failed read says Could not load, never a zero, and the other figure still shows", async () => {
    api.fail.add(AP);
    show(<FinanceDashboard />);
    const card = screen.getByTestId("dashboard-unpaid");
    expect(await within(card).findByText("Could not load Unpaid by Supplier")).toBeInTheDocument();
    expect(card).not.toHaveTextContent("RM 0.00");
    expect(within(card).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(await screen.findByTestId("dashboard-outstanding-amount")).toHaveTextContent("RM 2,758.00");
  });

  it("shows no Cash figure and never calls the retired reads", async () => {
    show(<FinanceDashboard />);
    await screen.findByTestId("dashboard-outstanding-amount");
    expect(screen.queryByText(/cash/i)).not.toBeInTheDocument();
    expect(api.urls.some((u) => /dashboard-summary|cashflow|ar-aging|ap-aging/.test(u))).toBe(false);
  });

  it("each figure opens the page that adds it up", async () => {
    show(<FinanceDashboard />);
    expect(screen.getByRole("link", { name: "Open AR · Receivables" })).toHaveAttribute("href", "/finance/ar");
    expect(screen.getByRole("link", { name: "Open Unpaid by Supplier" })).toHaveAttribute("href", "/finance/ap-outstanding");
  });
});
