import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import FinanceAR from "./FinanceAR";

/* Names are invented. */
const api = vi.hoisted(() => ({ routes: {} as Record<string, unknown>, fail: new Set<string>(), urls: [] as string[] }));
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
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const INV = "/api/finance/invoices/register";

function invoice(id: string, orderId: string, so: number, paid: number, lines: number, customer: string,
  payments: NonNullable<InvoiceRegisterRow["orders"]>["order_payments"] = []): InvoiceRegisterRow {
  return {
    id, invoice_no: `INV-${id}`, status: "issued", kind: "sales", amount: lines, tax_amount: 0,
    issued_at: "2026-09-06", voided_at: null, void_reason: null, replaces_invoice_id: null,
    created_at: "2026-09-06T00:00:00Z", order_id: orderId,
    orders: {
      id: orderId, so, customer_name: customer, status: "proceed_order", paid,
      delivery_date: null, delivery_date_tbd: false, delivered_at: null,
      order_lines: [{ qty: 1, unit_price: lines }], order_addons: [],
      ops_order_control: [{ balance: null, confirmed_date: null, line_etas: null, line_stock_status: null }],
      order_payments: payments,
    },
  };
}

const ROWS = [
  invoice("i1", "o1", 6201, 1000, 5970, "Dahlia Suria", [
    { id: "p1", receipt_no: "RC-100926-0001", amount: 1000, paid_on: "2026-09-10", voided_at: null,
      reference: "TRX-77", method: "bank" },
  ]),
  invoice("i2", "o2", 6202, 3000, 3000, "Embun Setia"),
];

beforeEach(() => {
  api.fail.clear();
  api.urls.length = 0;
  api.routes = {
    [INV]: { rows: ROWS, total: ROWS.length },
    "/api/finance/payment-settings/methods": { methods: [], money_accounts: [] },
  };
  localStorage.clear();
});

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><FinanceAR /></MemoryRouter></QueryClientProvider>);
}

describe("AR · Receivables", () => {
  it("lists only orders that still owe, from the invoice register, never the old aging read", async () => {
    show();
    expect(await screen.findByText("Dahlia Suria")).toBeInTheDocument();
    expect(screen.queryByText("Embun Setia")).not.toBeInTheDocument(); // paid in full
    expect(screen.getByTestId("ar-summary")).toHaveTextContent("1 order · RM 4,970.00 outstanding");
    expect(api.urls.some((u) => u.includes("ar-aging"))).toBe(false);
  });

  it("Record receipt opens the drawer with the order's own receipts", async () => {
    show();
    await screen.findByText("Dahlia Suria");
    fireEvent.click(screen.getByTestId("ar-record-o1"));
    const drawer = await screen.findByTestId("ar-drawer");
    expect(within(drawer).getByTestId("ar-drawer-outstanding")).toHaveTextContent("RM 4,970.00");
    expect(within(drawer).getByText("RC-100926-0001")).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: "Open invoice" })).toHaveAttribute("href", "/finance/invoices?invoice=i1");
    expect(within(drawer).queryByRole("button", { name: /Issue invoice/i })).not.toBeInTheDocument();
    expect(api.urls.some((u) => u.startsWith("/api/finance/payments?"))).toBe(false);
  });

  it("the row's Record receipt button opens the drawer with the receipt form already showing", async () => {
    show();
    await screen.findByText("Dahlia Suria");
    fireEvent.click(screen.getByTestId("ar-record-o1"));
    const drawer = await screen.findByTestId("ar-drawer");
    expect(within(drawer).getByLabelText("Amount")).toHaveValue("4970");
    expect(within(drawer).getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });

  it("sorts Age by the number of days, never the words: 9, 45, 120 up, and the oldest first down", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T04:00:00Z")); // noon, 14 Oct, Malaysia
    try {
      const issued = (row: InvoiceRegisterRow, at: string): InvoiceRegisterRow => ({ ...row, issued_at: at });
      const rows = [
        issued(invoice("a1", "a1", 6301, 0, 100, "Kenanga Ali"), "2026-08-30T04:00:00Z"), // 45 days
        issued(invoice("a2", "a2", 6302, 0, 100, "Melur Hadi"), "2026-06-16T04:00:00Z"), // 120 days
        issued(invoice("a3", "a3", 6303, 0, 100, "Nilam Omar"), "2026-10-05T04:00:00Z"), // 9 days
      ];
      api.routes[INV] = { rows, total: rows.length };
      show();
      await screen.findByText("Kenanga Ali");
      const ages = () => screen.getAllByText(/^\d+ days$/).map((el) => el.textContent);
      const sortAge = () => fireEvent.click(screen.getByRole("button", { name: /^Age/ }));
      sortAge();
      expect(ages()).toEqual(["9 days", "45 days", "120 days"]);
      sortAge();
      expect(ages()).toEqual(["120 days", "45 days", "9 days"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a failed read says so and offers Try again, never an empty list", async () => {
    api.fail.add(INV);
    show();
    expect(await screen.findByText("Invoices could not be loaded. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("No customer owes money.")).not.toBeInTheDocument();
  });
});
