import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FinanceSettings from "./FinanceSettings";

const net = vi.hoisted(() => ({
  rows: [] as unknown,
  failList: false,
  refuse: null as string | null,
  calls: [] as Array<{ key: string; body: unknown }>,
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path.replace("/api/finance/ledger/money-accounts", "") || "/"}`;
    net.calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (key === "GET /api/finance/ledger/accounts") return { go_live_on: "2026-09-10", accounts: CHART };
    if (key === "GET /") {
      if (net.failList) throw new Error("boom");
      return net.rows;
    }
    if (key === "GET /card-routes") return [{ holding_code: "1131", channel: "dealer", bank_code: "1121" }];
    if (net.refuse) throw new Error(net.refuse);
    return { code: "1125" };
  }),
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));

const ROWS = [
  { code: "1110", name: "Cash on hand", money_kind: "CASH", is_active: true },
  { code: "1121", name: "Public Bank", money_kind: "BANK", is_active: true },
  { code: "1124", name: "RHB", money_kind: "BANK", is_active: false },
  { code: "1131", name: "GHL", money_kind: "HOLDING", is_active: true },
];

const acc = (code: string, name: string, parent_code: string | null, is_header = false) => ({
  code, name, kind: "LIABILITY", parent_code, is_control: false, control_for: null, is_active: true, is_header,
});
const CHART = [
  acc("2130", "Accrued expenses", "2100"),
  acc("2000", "Liabilities", null, true),
  acc("2100", "Payables", "2000", true),
];

beforeEach(() => {
  net.rows = ROWS;
  net.failList = false;
  net.refuse = null;
  net.calls = [];
  localStorage.clear();
});

function show(path = "/finance/settings") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <FinanceSettings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const writes = () => net.calls.filter((c) => !c.key.startsWith("GET"));

describe("Finance Settings — the money accounts", () => {
  it("lists every money account with its kind and whether it is in use", async () => {
    show();
    expect(screen.getByTestId("finance-settings-destination-header")).toHaveTextContent("Finance Settings");
    await screen.findByText("Public Bank");
    expect(screen.getByText("Online payment")).toBeInTheDocument();
    expect(screen.getAllByText("Bank transfer")).toHaveLength(2);
    expect(screen.getByText("Not active")).toBeInTheDocument();
  });

  it("adds a bank: the name and the kind, never a code", async () => {
    show();
    await screen.findByText("Public Bank");
    fireEvent.click(screen.getByRole("button", { name: "Add a money account" }));
    const dialog = await screen.findByRole("dialog");
    const save = within(dialog).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: " CIMB " } });
    fireEvent.click(save);
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ key: "POST /", body: { name: "CIMB", kind: "BANK" } });
  });

  it("adds a holding account when the kind is Online payment", async () => {
    show();
    await screen.findByText("Public Bank");
    fireEvent.click(screen.getByRole("button", { name: "Add a money account" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: "Stripe" } });
    fireEvent.keyDown(within(dialog).getByRole("combobox", { name: /Kind/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Online payment" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ key: "POST /", body: { name: "Stripe", kind: "HOLDING" } });
  });

  it("takes an account out of use, and shows the database's refusal when it still holds money", async () => {
    net.refuse = "1121 Public Bank is not at RM 0.00 in the ledger. It stays in use until it is.";
    show();
    fireEvent.click(await screen.findByText("Public Bank"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Active" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ key: "PATCH /1121", body: { name: "Public Bank", is_active: false } });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("is not at RM 0.00");
  });

  it("a list that could not be read says so, never an empty list", async () => {
    net.failList = true;
    show();
    expect(await screen.findByText("The accounts could not be loaded. Try again.")).toBeInTheDocument();
  });
});

describe("Finance Settings — card payout banks (0541)", () => {
  it("shows each route and saves a new bank for it", async () => {
    show();
    const row = await screen.findByTestId("card-route-1131-dealer");
    expect(row).toHaveTextContent("1131 · GHL · Dealer → 1121 · Public Bank");
    fireEvent.click(row);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ key: "POST /card-routes", body: { holding_code: "1131", channel: "dealer", bank_code: "1121" } });
  });
});

describe("Finance Settings — the chart of accounts", () => {
  it("lists the chart as a tree, headings in bold, and renames an account by its code", async () => {
    show("/finance/settings?tab=chart");
    const accrued = await screen.findByText("2130 Accrued expenses");
    expect(screen.getByText("2000 Liabilities")).toHaveClass("font-semibold");
    expect(accrued).not.toHaveClass("font-semibold");
    fireEvent.click(accrued);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: " Accruals " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ key: "PATCH /api/finance/ledger/accounts/2130", body: { name: "Accruals" } });
  });
});
