import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApAgingAnswer } from "@carres/shared/ap-aging";
import { itSaysNoBannedWord } from "@/test/banned-words";
import ApAging from "./ApAging";

/* Finance → Reports → AP Aging (0640; Chew 2026-10-03). The one read is
   answered by URL; names and figures are invented. */
const api = vi.hoisted(() => ({
  answer: null as unknown,
  calls: [] as string[],
  fail: null as null | { status: number },
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string) => {
    api.calls.push(url);
    if (api.fail) throw Object.assign(new Error("boom"), { status: api.fail.status, body: {} });
    if (!url.startsWith("/api/finance/payables/aging?")) throw new Error(`unexpected read ${url}`);
    return api.answer;
  }),
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/fmt-date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fmt-date")>()),
  appTodayIso: () => "2026-09-30",
}));

const LUMEN = "11111111-1111-4111-8111-111111111111";
const BAYVIEW = "22222222-2222-4222-8222-222222222222";
const BILL = "33333333-3333-4333-8333-333333333333";

const ANSWER: ApAgingAnswer = {
  as_at: "2026-09-30",
  go_live_on: "2026-06-01",
  controls: [{ account_code: "2110", name: "Trade payables", balance: 5500 }, { account_code: "2120", name: "Other payables", balance: -500 }],
  suppliers: [
    { supplier_id: LUMEN, name: "Lumen Sofa Works", kind: "factory_pickup", balance: 5500, bills: [
      { bill_id: BILL, bill_no: "BILL-2609-0001", supplier_invoice_no: "LS-77", bill_date: "2026-09-02", due_date: "2026-10-02", total: 4000, open: 4000 },
      { bill_id: "b-2", bill_no: "BILL-2607-0004", supplier_invoice_no: "LS-31", bill_date: "2026-07-15", due_date: null, total: 3000, open: 2000 },
    ] },
    { supplier_id: BAYVIEW, name: "Bayview Properties", kind: "other_creditor", balance: -500, bills: [] },
  ],
};

beforeEach(() => {
  api.answer = ANSWER;
  api.calls = [];
  api.fail = null;
  localStorage.clear();
});

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.search}</span>;
}

function show(at = "/finance/reports/ap-aging") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <Routes><Route path="/finance/reports/ap-aging" element={<><ApAging /><Where /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const row = (id: string) => screen.getByTestId(`ap-aging-row-${id}`);

describe("AP Aging (0640)", () => {
  it("reads today in Malaysia", async () => {
    show();
    await screen.findByTestId(`ap-aging-row-${LUMEN}`);
    expect(api.calls[0]).toBe("/api/finance/payables/aging?asAt=2026-09-30");
  });

  it("files each open bill by its month, and the rest of the balance as not tied to a bill", async () => {
    show();
    await screen.findByTestId(`ap-aging-row-${LUMEN}`);
    const lumen = row(LUMEN);
    expect(lumen).toHaveTextContent("RM 5,500.00"); // balance
    expect(lumen).toHaveTextContent("RM 4,000.00"); // this month
    expect(lumen).toHaveTextContent("RM 2,000.00"); // 2 months
    expect(lumen).toHaveTextContent("RM -500.00"); // paid ahead of a bill
    expect(row(BAYVIEW)).toHaveTextContent("RM -500.00");
  });

  it("ties the suppliers to the books in the footer", async () => {
    show();
    await screen.findByTestId(`ap-aging-row-${LUMEN}`);
    expect(screen.getByTestId("ap-aging-summary")).toHaveTextContent(
      "2 suppliers · In the books (2110 + 2120) on Wed, 30 Sep: RM 5,000.00 · Difference RM 0.00",
    );
    expect(screen.queryByTestId("ap-aging-differs")).not.toBeInTheDocument();
  });

  it("says so when the suppliers differ from the books", async () => {
    api.answer = { ...ANSWER, controls: [{ account_code: "2110", name: "Trade payables", balance: 5600 }] };
    show();
    expect(await screen.findByTestId("ap-aging-differs")).toHaveTextContent("The suppliers differ from the books by RM 600.00.");
  });

  it("opening a row lists the open bills, each opening its bill", async () => {
    show();
    await screen.findByTestId(`ap-aging-row-${LUMEN}`);
    fireEvent.click(within(row(LUMEN)).getByRole("button", { name: "Expand row" }));
    const bills = await screen.findByTestId(`ap-aging-bills-${LUMEN}`);
    expect(within(bills).getByRole("link", { name: "BILL-2609-0001" })).toHaveAttribute("href", `/finance/bills/${BILL}`);
    expect(bills).toHaveTextContent("This month");
    expect(bills).toHaveTextContent("2 months");
  });

  it("switches to days, and to the due date, keeping both in the address", async () => {
    show("/finance/reports/ap-aging?columns=day&by=due");
    await screen.findByTestId(`ap-aging-row-${LUMEN}`);
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent).join(" ")).toContain("Over 120");
    expect(screen.getByRole("combobox", { name: "Age by" })).toHaveTextContent("Due date");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Columns" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "By month" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("?by=due"));
  });

  it("a failed read shows the fix; a ledger with no start date says so", async () => {
    api.fail = { status: 500 };
    const { unmount } = show();
    expect(await screen.findByRole("alert")).toHaveTextContent("AP aging could not be loaded. Try again.");
    unmount();
    api.fail = { status: 409 };
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("The ledger has no start date yet. Nothing can be totalled.");
  });
});

describe("no banned word reaches the screen", () => {
  itSaysNoBannedWord(join(dirname(fileURLToPath(import.meta.url)), "ApAging.tsx"), { minStrings: 20, expectString: "Not tied to a bill" });
});
