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
    if (key === "GET /") {
      if (net.failList) throw new Error("boom");
      return net.rows;
    }
    if (net.refuse) throw new Error(net.refuse);
    return { code: "1125" };
  }),
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const ROWS = [
  { code: "1110", name: "Cash on hand", money_kind: "CASH", is_active: true },
  { code: "1121", name: "Public Bank", money_kind: "BANK", is_active: true },
  { code: "1124", name: "RHB", money_kind: "BANK", is_active: false },
  { code: "1131", name: "GHL", money_kind: "HOLDING", is_active: true },
];

beforeEach(() => {
  net.rows = ROWS;
  net.failList = false;
  net.refuse = null;
  net.calls = [];
  localStorage.clear();
});

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <FinanceSettings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const writes = () => net.calls.filter((c) => !c.key.startsWith("GET"));

describe("Finance → Settings — the money accounts", () => {
  it("lists every money account with its kind and whether it is in use", async () => {
    show();
    expect(screen.getByTestId("finance-settings-destination-header")).toHaveTextContent("Settings");
    await screen.findByText("Public Bank");
    expect(screen.getByText("Online payment")).toBeInTheDocument();
    expect(screen.getByText("Not active")).toBeInTheDocument();
    expect(screen.getByTestId("money-accounts-summary")).toHaveTextContent("4 money accounts");
  });

  it("adds a bank: the name and the kind, never a code", async () => {
    show();
    await screen.findByText("Public Bank");
    fireEvent.click(screen.getByRole("button", { name: "New money account" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: " CIMB " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save money account" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Choose the kind");
    expect(writes()).toHaveLength(0);

    fireEvent.keyDown(within(dialog).getByRole("combobox", { name: /Kind/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Bank" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save money account" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ key: "POST /", body: { name: "CIMB", kind: "BANK" } });
  });

  it("takes an account out of use, and shows the database's refusal when it still holds money", async () => {
    net.refuse = "1121 Public Bank is not at RM 0.00 in the ledger. It stays in use until it is.";
    show();
    fireEvent.doubleClick(await screen.findByText("Public Bank"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Active/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save money account" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ key: "PATCH /1121", body: { name: "Public Bank", is_active: false } });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("is not at RM 0.00");
  });

  it("a list that could not be read says so, never an empty list", async () => {
    net.failList = true;
    show();
    expect(await screen.findByText("Money accounts could not be loaded. Try again.")).toBeInTheDocument();
  });
});
