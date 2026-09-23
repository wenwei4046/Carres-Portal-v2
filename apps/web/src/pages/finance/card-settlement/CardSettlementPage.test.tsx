import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CardSettlementDay, CardSettlementReview, CardSettlementRow } from "@carres/shared/card-settlement";
import { pbbFile } from "@carres/shared/__fixtures__/card-settlement-files";
import { fmtDate } from "@/lib/fmt-date";
import CardSettlementPage from "./CardSettlementPage";

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
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const PAY = { exact: "p0000000-0000-4000-8000-000000000001", typo: "p0000000-0000-4000-8000-000000000002", other: "p0000000-0000-4000-8000-000000000003" };
const day = (over: Partial<CardSettlementDay>): CardSettlementDay => ({
  acquirer: "PBB",
  day_date: "2026-09-18",
  payout_date: "2026-09-18",
  group_key: "900000000001 / 90000001",
  row_count: 3,
  matched_count: 1,
  gross: 425,
  net: 420.75,
  recorded: 100,
  reference: "Card settlement PBB 900000000001 / 90000001 2026-09-18",
  payout_status: null,
  payout_move_no: null,
  ...over,
});
const line = (over: Partial<CardSettlementRow>): CardSettlementRow => ({
  id: "r0000000-0000-4000-8000-000000000001",
  file_name: "pbb.csv",
  acquirer: "PBB",
  line_no: 2,
  txn_date: "2026-09-17",
  payout_date: "2026-09-18",
  day_date: "2026-09-18",
  group_key: "900000000001 / 90000001",
  merchant_id: "900000000001",
  terminal_id: "90000001",
  approval_code: "A1B2C3",
  card_no: "400000XXXXXX0001",
  amount: 100,
  net_amount: 99,
  payment_id: PAY.exact,
  matched_how: "approval_code",
  matched_at: "2026-09-18T02:00:00Z",
  suggestions: [],
  ...over,
});
const MAYBANK = day({
  acquirer: "MAYBANK", group_key: "900000000009", row_count: 2, matched_count: 2, gross: 200, net: 198, recorded: 200,
  reference: "Card settlement MAYBANK 900000000009 2026-09-18",
});
const REVIEW: CardSettlementReview = {
  days: [day({}), MAYBANK],
  rows: [
    line({}),
    line({
      id: "r0000000-0000-4000-8000-000000000002", line_no: 3, approval_code: "K7M8N9", amount: 250, net_amount: 247.5,
      payment_id: null, matched_how: null, matched_at: null,
      suggestions: [{ payment_id: PAY.typo, how: "code_near", days_apart: 0 }],
    }),
    line({
      id: "r0000000-0000-4000-8000-000000000003", line_no: 4, approval_code: "Q1W2E3", amount: 75, net_amount: 74.25,
      payment_id: null, matched_how: null, matched_at: null, suggestions: [],
    }),
  ],
  payments: [
    { id: PAY.exact, amount: 100, paid_on: "2026-09-17", reference: "A1B2C3", receipt_no: "RC-170926-0001", so: 1001, voided: false },
    { id: PAY.typo, amount: 250, paid_on: "2026-09-17", reference: "K7M8N0", receipt_no: "RC-170926-0002", so: 1002, voided: false },
    { id: PAY.other, amount: 75, paid_on: "2026-09-16", reference: "X0X0X0", receipt_no: "RC-160926-0003", so: 1003, voided: false },
  ],
};

beforeEach(() => {
  net.routes = {
    "GET /api/finance/card-settlement": REVIEW,
    "GET /api/finance/ledger/money-accounts": [
      { code: "1123", name: "Test Bank", money_kind: "BANK", is_active: true },
      { code: "1131", name: "Test Card", money_kind: "HOLDING", is_active: true },
    ],
    "GET /api/finance/ledger/money-accounts/card-routes": [],
  };
  net.calls = [];
  toast.error.mockReset();
  toast.success.mockReset();
  localStorage.clear();
});

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CardSettlementPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const posts = () => net.calls.filter((c) => !c.key.startsWith("GET "));

describe("Card settlement", () => {
  it("lists the days, and a day to check shows each row's suggestions", async () => {
    show();
    await screen.findByText("All machines · 900000000009");
    expect(screen.getByTestId("card-settlement-summary")).toHaveTextContent("2 days · 1 to check");

    fireEvent.click(screen.getAllByTitle("Check the sales")[0]!);
    const pbb = await screen.findByTestId(`card-day-PBB|2026-09-18|900000000001 / 90000001`);
    expect(within(pbb).getByTestId("card-row-2")).toHaveTextContent("Matched by approval code · RM 100.00");
    expect(within(pbb).getByTestId(`card-suggestion-${PAY.typo}`)).toHaveTextContent(
      `Approval code may be typed wrong · RM 250.00 · ${fmtDate("2026-09-17")} · RC-170926-0002 · SO-1002 · Approval code K7M8N0`,
    );
    expect(within(pbb).getByTestId("card-row-4")).toHaveTextContent("No recorded card payment is close to this sale. Adjust the match by hand.");
    expect(pbb).toHaveTextContent("2 sales are not matched yet. Match every sale before you approve the day.");
    expect(within(pbb).queryByRole("button", { name: "Approve day" })).toBeNull();
  });

  it("Approve match sends the suggested payment; the typed code is not sent anywhere", async () => {
    net.routes["POST /api/finance/card-settlement/rows/r0000000-0000-4000-8000-000000000002/match"] = { matched_how: "suggestion" };
    show();
    await screen.findByText("All machines · 900000000009");
    fireEvent.click(screen.getAllByTitle("Check the sales")[0]!);
    const s = await screen.findByTestId(`card-suggestion-${PAY.typo}`);
    fireEvent.click(within(s).getByRole("button", { name: "Approve match" }));
    await waitFor(() => expect(posts()).toEqual([
      { key: "POST /api/finance/card-settlement/rows/r0000000-0000-4000-8000-000000000002/match", body: { paymentId: PAY.typo } },
    ]));
  });

  it("Adjust match picks a payment by hand", async () => {
    net.routes["POST /api/finance/card-settlement/rows/r0000000-0000-4000-8000-000000000003/match"] = { matched_how: "by_hand" };
    show();
    await screen.findByText("All machines · 900000000009");
    fireEvent.click(screen.getAllByTitle("Check the sales")[0]!);
    const row = await screen.findByTestId("card-row-4");
    fireEvent.click(within(row).getByRole("button", { name: "Adjust match" }));
    await screen.findByTestId("card-adjust-match");
    fireEvent.keyDown(screen.getByRole("combobox", { name: /Card payment/ }), { key: "Enter" });
    // the same amount comes first; a payment matched to another row is not offered
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      `RM 75.00 · ${fmtDate("2026-09-16")} · RC-160926-0003 · SO-1003 · Approval code X0X0X0`,
      `RM 250.00 · ${fmtDate("2026-09-17")} · RC-170926-0002 · SO-1002 · Approval code K7M8N0`,
    ]);
    fireEvent.click(options[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Save match" }));
    await waitFor(() => expect(posts()).toEqual([
      { key: "POST /api/finance/card-settlement/rows/r0000000-0000-4000-8000-000000000003/match", body: { paymentId: PAY.other } },
    ]));
  });

  it("Approve day fills the card payout form with the file's figures, read only, and prepares through the day's door", async () => {
    net.routes["POST /api/finance/card-settlement/days/payout"] = { move_id: "m", move_no: "MM-1" };
    show();
    await screen.findByText("All machines · 900000000009");
    fireEvent.click(screen.getAllByTitle("Check the sales")[1]!);
    const mb = await screen.findByTestId("card-day-MAYBANK|2026-09-18|900000000009");
    fireEvent.click(within(mb).getByRole("button", { name: "Approve day" }));
    const form = await screen.findByTestId("money-move-form");
    const kind = within(form).getByRole("combobox", { name: /Kind/ });
    expect(kind).toHaveTextContent("Card payout");
    expect(kind).toBeDisabled();
    expect(within(form).getByLabelText(/^Paid into the bank/)).toHaveValue("198.00");
    expect(within(form).getByLabelText(/^Paid into the bank/)).toHaveAttribute("readonly");
    expect(within(form).getByLabelText(/^Card company fee/)).toHaveValue("2.00");
    expect(within(form).getByLabelText(/^Card company fee/)).toHaveAttribute("readonly");
    const ref = within(form).getByLabelText(/^Reference/);
    expect(ref).toHaveValue("Card settlement MAYBANK 900000000009 2026-09-18");
    expect(ref).toHaveAttribute("readonly");
    expect(within(form).getByText(/^Date the bank received it/)).toBeInTheDocument();
    expect(posts()).toEqual([]);

    fireEvent.keyDown(within(form).getByRole("combobox", { name: /Paid from/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: /Test Card/ }));
    fireEvent.keyDown(within(form).getByRole("combobox", { name: /^Paid into/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: /Test Bank/ }));
    fireEvent.click(screen.getByRole("button", { name: "Prepare money move" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toMatchObject({
      key: "POST /api/finance/card-settlement/days/payout",
      body: { acquirer: "MAYBANK", dayDate: "2026-09-18", groupKey: "900000000009", moveDate: "2026-09-18", fromAccountCode: "1131", toAccountCode: "1123", note: null },
    });
  });

  it("a GHL day shows its sale date and no paid-out date; the payout form asks for the date the bank received it", async () => {
    const ghlDay = day({
      acquirer: "GHL", day_date: "2026-09-16", payout_date: null, group_key: "TESTTERM01", row_count: 1, matched_count: 1,
      gross: 300, net: 296.1, recorded: 300, reference: "Card settlement GHL TESTTERM01 2026-09-16",
    });
    net.routes["GET /api/finance/card-settlement"] = { ...REVIEW, days: [ghlDay], rows: [] };
    show();
    const cell = await screen.findByText("Not in the file");
    expect(cell.closest('[role="row"]') ?? document.body).toHaveTextContent(fmtDate("2026-09-16"));
    fireEvent.click(screen.getAllByTitle("Check the sales")[0]!);
    const d = await screen.findByTestId("card-day-GHL|2026-09-16|TESTTERM01");
    fireEvent.click(within(d).getByRole("button", { name: "Approve day" }));
    const form = await screen.findByTestId("money-move-form");
    expect(within(form).getByText(/^Date the bank received it/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Prepare money move" }));
    expect(await within(form).findByTestId("money-move-refusal")).toHaveTextContent("Choose a date.");
    expect(posts()).toEqual([]);
  });

  it("imports a file for the chosen card company, and asks for the company first", async () => {
    net.routes["POST /api/finance/card-settlement/import"] = { rows: 1, imported: 1, matched: 1 };
    show();
    await screen.findByText("All machines · 900000000009");
    fireEvent.click(screen.getByRole("button", { name: "Import file" }));
    expect(toast.error).toHaveBeenCalledWith("Choose the card company first.");

    fireEvent.keyDown(document.getElementById("card-company")!, { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Public Bank" }));
    const content = pbbFile([{ sett: "18092026", trans: "17092026", amt: "100.00", net: "99.00", mid: "900000000001", tid: "90000001", code: "A1B2C3", trace: "000101" }]);
    fireEvent.change(screen.getByTestId("card-file-input"), { target: { files: [Object.assign(new File([content], "pbb.csv", { type: "text/csv" }), { text: async () => content })] } });
    await waitFor(() => expect(posts()).toEqual([
      { key: "POST /api/finance/card-settlement/import", body: { acquirer: "PBB", fileName: "pbb.csv", content } },
    ]));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("1 of 1 rows imported · 1 matched."));
  });
});
