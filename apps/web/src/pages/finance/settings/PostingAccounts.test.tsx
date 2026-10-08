/**
 * Finance Settings → Posting accounts (0657, 0658).
 *
 * What the page must get right:
 *   · every posting in one of four groups, in words, with its account;
 *   · an add-on with no account says so;
 *   · a Sales row, a changeable role or a way of being paid (0658) opens its
 *     window; the accounts the system keeps never do;
 *   · the window offers only accounts of the posting's kind that the door
 *     takes (a way of being paid: the money accounts Payment settings offers),
 *     and sends the account it showed as `was`;
 *   · a refusal (someone changed it meanwhile) is the database's sentence;
 *   · the changes are listed, newest first, in words, a way of being paid's
 *     included, and its row says when it last changed.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PostingAccounts, { incomeWord, postingAccountOptions } from "./PostingAccounts";

const net = vi.hoisted(() => ({
  calls: [] as Array<{ method: string; path: string; body: Record<string, unknown> }>,
  refuse: null as string | null,
}));

const acc = (code: string, name: string, kind: string, extra: Record<string, unknown> = {}) => ({
  code, name, kind, parent_code: "4000", is_control: false, control_for: null, is_active: true, is_header: false, sort_order: 0, ...extra,
});

const POSTINGS = {
  income: [
    { type: "GOODS", key: "*", name: null, active: null, accountCode: "500-0000", accountName: "SALES", changedAt: null, changedBy: null },
    { type: "GOODS", key: "rental", name: null, active: null, accountCode: "500-2000", accountName: "SUBSCRIPTION", changedAt: null, changedBy: null },
    { type: "STORAGE", key: "*", name: null, active: null, accountCode: "500-4000", accountName: "STORAGE CHARGES", changedAt: null, changedBy: null },
    { type: "ADDON", key: "DELIVERY", name: "Delivery fee", active: true, accountCode: "500-3000", accountName: "SERVICE CHARGES", changedAt: "2026-10-07T09:00:00Z", changedBy: "Chew" },
    { type: "ADDON", key: "dispose-sofa-big", name: "Dispose old sofa (big size)", active: true, accountCode: null, accountName: null, changedAt: null, changedBy: null },
  ],
  roles: [
    { role: "TRADE_PAYABLE", changeable: false, accountCode: "400-0000", accountName: "TRADE CREDITORS", changedAt: null, changedBy: null },
    { role: "COST_OF_GOODS_SOLD", changeable: true, accountCode: "610-0000", accountName: "PURCHASES", changedAt: null, changedBy: null },
    { role: "OTHER_INCOME", changeable: true, accountCode: "580-0000", accountName: "ADDITIONAL INCOME", changedAt: null, changedBy: null },
  ],
  changes: [
    { id: "P8", what: "PAYMENT", key: "bank/*", name: "Bank transfer", fromCode: "310-1000", fromName: "PUBLIC BANK", toCode: "310-2000", toName: "HONG LEONG BANK", changedAt: "2026-10-07T10:00:00Z", changedBy: "Chew" },
    { id: "2", what: "INCOME", key: "ADDON/DELIVERY", name: "Delivery fee", fromCode: "500-0000", fromName: "SALES", toCode: "500-3000", toName: "SERVICE CHARGES", changedAt: "2026-10-07T09:00:00Z", changedBy: "Chew" },
    { id: "1", what: "ROLE", key: "OTHER_INCOME", name: null, fromCode: "4900", fromName: "Other income", toCode: "580-0000", toName: "ADDITIONAL INCOME", changedAt: "2026-10-06T09:00:00Z", changedBy: "Chew" },
    { id: "P3", what: "PAYMENT", key: "online/stripe_checkout", name: null, fromCode: "310-2000", fromName: "HONG LEONG BANK", toCode: "315-5000", toName: "STRIPE", changedAt: "2026-10-05T09:00:00Z", changedBy: "Jess" },
  ],
  payments: [
    { key: "bank/*", changedAt: "2026-10-07T10:00:00Z", changedBy: "Chew" },
    { key: "online/stripe_checkout", changedAt: "2026-10-05T09:00:00Z", changedBy: "Jess" },
  ],
};

const CHART = [
  acc("4000", "INCOME", "INCOME", { parent_code: null, is_header: true }),
  acc("500-0000", "SALES", "INCOME"),
  acc("500-2000", "SUBSCRIPTION", "INCOME"),
  acc("500-3000", "SERVICE CHARGES", "INCOME"),
  acc("500-4000", "STORAGE CHARGES", "INCOME"),
  acc("500-9000", "OLD SALES", "INCOME", { is_active: false }),
  acc("580-0000", "ADDITIONAL INCOME", "INCOME"),
  acc("610-0000", "PURCHASES", "EXPENSE", { parent_code: "5000" }),
  acc("610-0020", "PURCHASE - MATTRESS", "EXPENSE", { parent_code: "5000" }),
  acc("310-2000", "HONG LEONG BANK", "ASSET", { parent_code: "310-0000" }),
];

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      if (path === "/api/finance/ledger/posting-accounts") return POSTINGS;
      if (path === "/api/finance/ledger/accounts") return { go_live_on: "2026-09-10", accounts: CHART, money_accounts: ["310-2000"] };
      if (path === "/api/finance/payment-settings/methods") {
        return {
          methods: [{ method: "bank", label: "Bank transfer", account_code: "310-2000", account_name: "HONG LEONG BANK", active: true, sort: 1 }],
          money_accounts: [
            { code: "310-2000", name: "HONG LEONG BANK" },
            { code: "320-0000", name: "CASH IN HAND" },
          ],
          system_rows: [{ method: "online", source_channel: "stripe_checkout", account_code: "315-5000" }],
        };
      }
      throw new Error(`unexpected GET ${path}`);
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    net.calls.push({ method, path, body });
    if (net.refuse) throw new Error(net.refuse);
    return { what: body.what, key: body.key, accountCode: body.accountCode, changed: true };
  }),
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));

beforeEach(() => {
  net.calls = [];
  net.refuse = null;
  localStorage.clear();
});

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PostingAccounts />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const row = (id: string) => document.querySelector<HTMLTableRowElement>(`tr[data-row-key="${id}"]`)!;

async function ready() {
  await waitFor(() => expect(row("ROLE/COST_OF_GOODS_SOLD")).toBeTruthy());
}

describe("Posting accounts (0657)", () => {
  it("lists every posting in its group, in words, with its account", async () => {
    show();
    await ready();
    expect(screen.getByTestId("grid-group-toggle-sales")).toHaveTextContent("Sales");
    expect(within(row("INCOME/GOODS/*")).getByText("Goods sold, when the item group has no sales account")).toBeInTheDocument();
    expect(row("INCOME/GOODS/*")).toHaveTextContent("500-0000 SALES");
    expect(within(row("INCOME/GOODS/rental")).getByText("Subscription fees")).toBeInTheDocument();
    expect(within(row("INCOME/ADDON/DELIVERY")).getByText("Delivery fee")).toBeInTheDocument();
    expect(row("ROLE/COST_OF_GOODS_SOLD")).toHaveTextContent("Goods bought that are not in the catalog");
    expect(row("ROLE/TRADE_PAYABLE")).toHaveTextContent("Suppliers owed for goods");
    expect(row("PAYMENT/bank/*")).toHaveTextContent("Bank transfer");
    expect(row("PAYMENT/online/stripe_checkout")).toHaveTextContent("Online payment · Stripe checkout");
  });

  it("says when an add-on has no account yet", async () => {
    show();
    await ready();
    expect(within(row("INCOME/ADDON/dispose-sofa-big")).getByText("No account yet")).toBeInTheDocument();
  });

  it("opens a Sales row and sends the account it showed as was", async () => {
    show();
    await ready();
    fireEvent.click(within(row("INCOME/ADDON/DELIVERY")).getByText("Delivery fee"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Save: pick another account" })).toBeDisabled();
    fireEvent.keyDown(within(dialog).getByRole("combobox", { name: /Account/ }), { key: "Enter" });
    expect(screen.queryByRole("option", { name: "610-0000 PURCHASES" })).toBeNull();
    expect(screen.queryByRole("option", { name: "500-9000 OLD SALES" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "580-0000 ADDITIONAL INCOME" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(net.calls).toHaveLength(1));
    expect(net.calls[0]).toEqual({
      method: "PUT",
      path: "/api/finance/ledger/posting-accounts",
      body: { what: "INCOME", key: "ADDON/DELIVERY", accountCode: "580-0000", was: "500-3000" },
    });
  });

  it("gives an add-on with no account its first one, sending no was", async () => {
    show();
    await ready();
    fireEvent.click(within(row("INCOME/ADDON/dispose-sofa-big")).getByText("Dispose old sofa (big size)"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Save: pick the account" })).toBeDisabled();
    fireEvent.keyDown(within(dialog).getByRole("combobox", { name: /Account/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "500-3000 SERVICE CHARGES" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(net.calls).toHaveLength(1));
    expect(net.calls[0]!.body).toEqual({ what: "INCOME", key: "ADDON/dispose-sofa-big", accountCode: "500-3000", was: null });
  });

  it("offers expense accounts for purchases, and shows the database's sentence when someone changed it first", async () => {
    net.refuse = "Someone else changed this posting after you opened it. Open it again to see their change.";
    show();
    await ready();
    fireEvent.click(within(row("ROLE/COST_OF_GOODS_SOLD")).getByText("Goods bought that are not in the catalog"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(within(dialog).getByRole("combobox", { name: /Account/ }), { key: "Enter" });
    expect(screen.queryByRole("option", { name: "500-0000 SALES" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "610-0020 PURCHASE - MATTRESS" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Someone else changed this posting after you opened it. Open it again to see their change.")).toBeInTheDocument();
    expect(net.calls[0]!.body).toEqual({ what: "ROLE", key: "COST_OF_GOODS_SOLD", accountCode: "610-0020", was: "610-0000" });
  });

  it("opens a way of being paid, offering only the money accounts, and sends it as PAYMENT (0658)", async () => {
    show();
    await ready();
    expect(screen.getByTestId("grid-group-toggle-money")).toHaveTextContent("Customer money");
    fireEvent.click(within(row("PAYMENT/bank/*")).getByText("Bank transfer"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Save: pick another account" })).toBeDisabled();
    fireEvent.keyDown(within(dialog).getByRole("combobox", { name: /Money account/ }), { key: "Enter" });
    expect(screen.queryByRole("option", { name: "500-0000 SALES" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "320-0000 CASH IN HAND" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(net.calls).toHaveLength(1));
    expect(net.calls[0]).toEqual({
      method: "PUT",
      path: "/api/finance/ledger/posting-accounts",
      body: { what: "PAYMENT", key: "bank/*", accountCode: "320-0000", was: "310-2000" },
    });
  });

  it("sends the POS card and Online payment rows with their channel (0658)", async () => {
    show();
    await ready();
    fireEvent.click(within(row("PAYMENT/online/stripe_checkout")).getByText("Online payment · Stripe checkout"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(within(dialog).getByRole("combobox", { name: /Money account/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "310-2000 HONG LEONG BANK" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(net.calls).toHaveLength(1));
    expect(net.calls[0]!.body).toEqual({ what: "PAYMENT", key: "online/stripe_checkout", accountCode: "310-2000", was: "315-5000" });
  });

  it("says when a way of being paid last changed its account (0658)", async () => {
    show();
    await ready();
    expect(row("PAYMENT/bank/*")).toHaveTextContent("Chew");
    expect(row("PAYMENT/online/stripe_checkout")).toHaveTextContent("Jess");
  });

  it("never opens an account the system keeps", async () => {
    show();
    await ready();
    fireEvent.click(within(row("ROLE/TRADE_PAYABLE")).getByText("Suppliers owed for goods"));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists the changes, newest first, in words", async () => {
    show();
    await ready();
    const rows = within(screen.getByTestId("posting-changes-table")).getAllByRole("row").map((r) => r.textContent ?? "");
    expect(rows[1]).toContain("Bank transfer");
    expect(rows[1]).toContain("310-1000 PUBLIC BANK");
    expect(rows[1]).toContain("310-2000 HONG LEONG BANK");
    expect(rows[2]).toContain("Delivery fee");
    expect(rows[2]).toContain("500-0000 SALES");
    expect(rows[2]).toContain("500-3000 SERVICE CHARGES");
    expect(rows[3]).toContain("Money the bank pays in");
    expect(rows[4]).toContain("Online payment · Stripe checkout");
  });
});

describe("posting words and options", () => {
  it("names the income postings", () => {
    expect(incomeWord({ type: "GOODS", key: "*", name: null })).toBe("Goods sold, when the item group has no sales account");
    expect(incomeWord({ type: "GOODS", key: "rental", name: null })).toBe("Subscription fees");
    expect(incomeWord({ type: "STORAGE", key: "*", name: null })).toBe("Storage charges");
    expect(incomeWord({ type: "ADDON", key: "STAIR_CARRY", name: "Stair carry" })).toBe("Stair carry");
  });

  it("offers only accounts in use of the posting's kind, never a heading or a money account", () => {
    const codes = postingAccountOptions("INCOME", CHART as never, ["310-2000"]).map((a) => a.code);
    expect(codes).toEqual(["500-0000", "500-2000", "500-3000", "500-4000", "580-0000"]);
  });
});
