/**
 * 0664 — the store owner's own commission in the POS: what Carres owes the
 * store now, what is still to come, the statement, and a month's orders. The
 * same arithmetic as Finance's Statement view (shared `dealerStatement`).
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DcStatementSource } from "@carres/shared/dealer-commission";
import { fmtDate, fmtMonth } from "@/lib/fmt-date";
import CommissionPage from "./CommissionPage";
import { seesCommission } from "./commission-door";

const net = vi.hoisted(() => ({ routes: {} as Record<string, unknown>, calls: [] as string[] }));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    net.calls.push(key);
    if (key in net.routes) return net.routes[key];
    throw new Error(`unmocked ${key}`);
  }),
}));

const MONTH = "2026-10";
const PREV = "2026-09";

/**
 * SO-2050: RM600 paid in September on a RM1,000 order at 20%, cancelled in
 * October: RM120 in September. SO-2054: RM600 paid in October: RM120 so far,
 * RM80 still to come. RM100 paid to the store on 3 October.
 */
const STATEMENT: DcStatementSource = {
  today: `${MONTH}-08`,
  dealer: { id: "d1", name: "Ace Furniture" },
  quotas: [],
  orders: [
    {
      orderId: "ord1", so: 2054, dealerId: "d1", outletId: "o1", addons: 0, orderedOn: `${MONTH}-02`,
      customer: "Probe Customer One",
      lines: [{ modelId: "m1", category: "sofa", value: 1000, rate: 20, qty: 1 }],
      payments: [{ paidOn: `${MONTH}-05`, amount: 600 }],
    },
    {
      orderId: "ord2", so: 2050, dealerId: "d1", outletId: "o1", addons: 0, orderedOn: `${PREV}-03`,
      customer: "Probe Customer Two", cancelledOn: `${MONTH}-04`,
      lines: [{ modelId: "m1", category: "sofa", value: 1000, rate: 20, qty: 1 }],
      payments: [{ paidOn: `${PREV}-05`, amount: 600 }],
    },
  ],
  payments: [{ id: "pay1", voucherId: "v1", voucherNo: "PV-0001", paidOn: `${MONTH}-03`, amount: 100 }],
};

beforeEach(() => {
  net.routes = { "GET /api/dealer-commission/statement": STATEMENT };
  net.calls = [];
});

function renderPage(onClose = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CommissionPage onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

describe("the store's Commission page", () => {
  it("says what Carres owes the store now and what is still to come", async () => {
    renderPage();
    const owed = await screen.findByTestId("pos-commission-owed");
    expect(owed).toHaveTextContent("Owed to you now");
    expect(owed).toHaveTextContent("RM 140.00");
    // September's RM 120 is due on 15 October; RM 100 of it is paid.
    expect(owed).toHaveTextContent(`Due ${fmtDate(`${MONTH}-15`)}RM 20.00`);
    expect(owed).toHaveTextContent("Each month's commission is paid on the 15th of the month after.");
    expect(screen.getByTestId("pos-commission-to-come")).toHaveTextContent("RM 80.00");
    expect(screen.getByText("Ace Furniture")).toBeTruthy();
    expect(net.calls).toEqual(["GET /api/dealer-commission/statement"]);
  });

  it("lists the statement with its running balance", async () => {
    renderPage();
    const table = await screen.findByTestId("pos-commission-statement");
    expect(within(table).getByText(`Commission ${fmtMonth(PREV)}`)).toBeTruthy();
    expect(within(table).getByText("Payment PV-0001")).toBeTruthy();
    expect(within(table).getByText(`Commission ${fmtMonth(MONTH)} so far`)).toBeTruthy();
    // 120, less 100 paid, plus 120 so far.
    expect(within(table).getByText("RM 20.00")).toBeTruthy();
    expect(within(table).getByText("RM 140.00")).toBeTruthy();
  });

  it("shows this month's orders, and a month's row shows that month's", async () => {
    renderPage();
    const orders = await screen.findByTestId("pos-commission-orders");
    expect(screen.getByText(`Orders · ${fmtMonth(MONTH)}`)).toBeTruthy();
    expect(within(orders).getByText("SO-2054")).toBeTruthy();
    expect(within(orders).getByText("Waiting for the balance")).toBeTruthy();
    expect(within(orders).getByText("Cancelled")).toBeTruthy();

    fireEvent.click(screen.getByText(`Commission ${fmtMonth(PREV)}`));
    expect(await screen.findByText(`Orders · ${fmtMonth(PREV)}`)).toBeTruthy();
    const september = screen.getByTestId("pos-commission-orders");
    expect(within(september).getByText("SO-2050")).toBeTruthy();
    expect(within(september).getByText("Waiting for the balance")).toBeTruthy();
    // SO-2054 was placed in October.
    expect(within(september).queryByText("SO-2054")).toBeNull();
  });

  it("Back closes it", async () => {
    const onClose = renderPage();
    fireEvent.click(await screen.findByTestId("pos-commission-back"));
    expect(onClose).toHaveBeenCalled();
  });

  it("says so when the commission cannot be read", async () => {
    net.routes = {};
    renderPage();
    expect(await screen.findByText("Your commission could not be opened.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

describe("who sees the Commission pill", () => {
  it("a dealer store login with its owner's PIN only", () => {
    expect(seesCommission("dealer", "principal")).toBe(true);
    expect(seesCommission("dealer", "manager")).toBe(false);
    expect(seesCommission("dealer", "salesperson")).toBe(false);
    expect(seesCommission("dealer", null)).toBe(false);
    expect(seesCommission("showroom", "principal")).toBe(false);
    expect(seesCommission("principal", undefined)).toBe(false);
    expect(seesCommission("bd", "principal")).toBe(false);
  });
});
