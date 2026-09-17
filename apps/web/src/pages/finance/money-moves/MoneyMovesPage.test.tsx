import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MoneyMoveRow } from "@carres/shared/money-moves";
import MoneyMovesPage from "./MoneyMovesPage";

const net = vi.hoisted(() => ({
  routes: {} as Record<string, unknown>,
  calls: [] as Array<{ key: string; body: unknown }>,
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    net.calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (key in net.routes) return net.routes[key];
    throw new Error(`unmocked ${key}`);
  }),
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const row = (over: Partial<MoneyMoveRow>): MoneyMoveRow => ({
  move_id: "aaaaaaaa-0000-4000-8000-000000000001",
  move_no: "MM-20260917-1111",
  kind: "CARD_PAYOUT",
  status: "prepared",
  move_date: "2026-09-17",
  from_account_code: "1131",
  from_account_name: "GHL",
  to_account_code: "1123",
  to_account_name: "Hong Leong",
  amount: 97.5,
  fee: 2.5,
  reference: null,
  note: null,
  prepared_by_name: "Amy",
  prepared_by_me: false,
  prepared_at: "2026-09-17T02:00:00Z",
  approved_by_name: null,
  approved_at: null,
  ended_by_name: null,
  ended_at: null,
  end_reason: null,
  ...over,
});
const MINE = row({ move_id: "aaaaaaaa-0000-4000-8000-000000000002", move_no: "MM-20260917-2222", kind: "TRANSFER", fee: 0, prepared_by_me: true });

beforeEach(() => {
  net.routes = {
    "GET /api/finance/money-moves": [row({}), MINE],
    "GET /api/finance/money-moves/me": { mayApprove: true },
    "GET /api/finance/ledger/money-accounts": [
      { code: "1121", name: "Public Bank", money_kind: "BANK", is_active: true },
      { code: "1123", name: "Hong Leong", money_kind: "BANK", is_active: true },
      { code: "1131", name: "GHL", money_kind: "HOLDING", is_active: true },
    ],
    [`POST /api/finance/money-moves/${row({}).move_id}/approve`]: { id: row({}).move_id },
  };
  net.calls = [];
  localStorage.clear();
});

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MoneyMovesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Money moves", () => {
  it("lists moves, and offers Approve on someone else's move only", async () => {
    show();
    await screen.findByText("MM-20260917-1111");
    expect(screen.getByTestId("money-moves-summary")).toHaveTextContent("2 money moves · 2 to approve");

    fireEvent.click(screen.getAllByTitle("Inspect money move")[1]!);
    const mine = await screen.findByTestId("money-move-MM-20260917-2222");
    expect(mine).toHaveTextContent("You prepared this.");
    expect(mine.querySelector("button")?.textContent).toBe("Cancel money move");

    fireEvent.click(screen.getAllByTitle("Inspect money move")[0]!);
    const theirs = await screen.findByTestId("money-move-MM-20260917-1111");
    expect(theirs).toHaveTextContent("RM 100.00 from 1131 · GHL · RM 97.50 into 1123 · Hong Leong · Fee RM 2.50");
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(net.calls.map((c) => c.key)).toContain(`POST /api/finance/money-moves/${row({}).move_id}/approve`),
    );
  });

  it("the form refuses a move with no accounts before the server", async () => {
    show();
    await screen.findByText("MM-20260917-1111");
    fireEvent.click(screen.getByRole("button", { name: /New money move/ }));
    fireEvent.change(await screen.findByLabelText(/^Amount/), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare money move" }));
    expect(await screen.findByTestId("money-move-refusal")).toHaveTextContent("Choose where the money came from.");
    expect(net.calls.some((c) => c.key === "POST /api/finance/money-moves")).toBe(false);
  });
});
