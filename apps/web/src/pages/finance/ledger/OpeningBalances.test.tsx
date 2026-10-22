import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mergeByKey,
  readDepositPaste,
  readOpeningAmount,
  readStockPaste,
  type OpeningAnswer,
} from "@carres/shared/opening-balances";
import { itSaysNoBannedWord } from "@/test/banned-words";
import OpeningBalances, { depositRemark, postGap } from "./OpeningBalances";
import { partyRemark } from "./OpeningParties";
import { noOpening } from "../month-end-pack";

/* Finance → Ledger → Opening balances (0705; Chew 2026-10-21/22). Every read
   is answered by URL and every write is recorded; names and figures are
   invented. The database's own rules (160-0000, one post, reverse, the date
   exception) are walked inside migration 0705. */
const api = vi.hoisted(() => ({
  answer: null as unknown,
  writes: [] as Array<{ url: string; method: string; body: unknown }>,
  fail: null as null | { status: number; message: string; code: string },
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    if (url.startsWith("/api/operation/register-layouts")) return { layouts: [], limit: 10 };
    if (init?.method && init.method !== "GET") {
      api.writes.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
      if (api.fail) throw Object.assign(new Error(api.fail.message), { status: api.fail.status, body: { code: api.fail.code } });
      return { updated_at: "2026-10-22T03:00:01+00:00", not_found: [] };
    }
    if (url === "/api/finance/opening-balances") return api.answer;
    if (url === "/api/finance/opening-balances/state") return { status: "draft", entry_date: null, entry_no: null };
    throw new Error(`unexpected read ${url}`);
  }),
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));

const WAS = "2026-10-22T03:00:00.123456+00:00";
const SUPPLIER = "33333333-3333-4333-8333-333333333333";
const CUSTOMER = "44444444-4444-4444-8444-444444444444";

function draft(over: Partial<OpeningAnswer> = {}): OpeningAnswer {
  return {
    status: "draft", go_live_on: "2026-09-10", entry_date: "2026-09-09", books_closed_through: null, entry: null,
    posted_at: null, posted_by_name: null, updated_at: WAS, updated_by_name: "Chew", last_reversed: null, may_post: true,
    accounts: [
      { code: "310-2000", name: "HONG LEONG BANK", kind: "ASSET", special: "SBK", debit: "1000.00", credit: "0.00", eligible: true },
      { code: "500-0000", name: "SALES", kind: "INCOME", special: null, debit: "0.00", credit: "0.00", eligible: true },
    ],
    parties: [
      { id: "p-1", party_type: "SUPPLIER", party_id: SUPPLIER, name: "Lumen Sofa Works", account_code: "400-0000", account_name: "TRADE CREDITORS",
        total: "50.00", items_total: "70.00", difference: "-20.00",
        items: [{ id: "i-1", doc_no: "LS-881", doc_date: "2026-07-01", due_date: "2026-08-01", amount: "30.00" },
          { id: "i-2", doc_no: "LS-902", doc_date: "2026-08-15", due_date: null, amount: "40.00" }] },
      { id: "p-2", party_type: "CUSTOMER", party_id: CUSTOMER, name: "Tan Mei Ling", account_code: "300-1000", account_name: "SHOWROOM DEBTORS",
        total: "500.00", items_total: "500.00", difference: "0.00",
        items: [{ id: "i-3", doc_no: "INV-OLD-1", doc_date: "2026-06-01", due_date: "2026-07-01", amount: "500.00" }] },
    ],
    stock: [
      { unit_code: "U-404", unit_id: null, found: false, sku: null, qty: null, unit_cost: "10.00", value: null },
      { unit_code: "U-1", unit_id: "u-1", found: true, sku: "mattress:M1", qty: 2, unit_cost: "250.00", value: "500.00" },
    ],
    deposits: [
      { id: "d-1", order_ref: "SO-1401", customer_ref: "Lim", order_id: "o-1", found: true, so: 1401, customer_name: "Tan Mei Ling",
        delivered_at: null, account_code: "300-1000", amount: "300.00" },
      { id: "d-2", order_ref: "9999", customer_ref: null, order_id: null, found: false, so: null, customer_name: null,
        delivered_at: null, account_code: null, amount: "5.00" },
    ],
    totals: { debit: "1500.00", credit: "350.00", lines: 5 },
    choices: {
      customers: [{ id: CUSTOMER, name: "Tan Mei Ling", phone: "0123456789" }],
      other_debtors: [], suppliers: [{ id: SUPPLIER, name: "Lumen Sofa Works" }],
      debtor_accounts: [{ code: "300-1000", name: "SHOWROOM DEBTORS", control_for: "CUSTOMER" }],
      supplier_accounts: [{ code: "400-0000", name: "TRADE CREDITORS", control_for: "SUPPLIER" }],
      default_accounts: { CUSTOMER: "300-1000", OTHER: null, SUPPLIER: "400-0000" },
    },
    ...over,
  };
}

beforeEach(() => {
  api.answer = draft();
  api.writes = [];
  api.fail = null;
  localStorage.clear();
});

function show(at = "/finance/ledger/opening-balances") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={[at]}>
      <Routes><Route path="/finance/ledger/opening-balances" element={<OpeningBalances />} /></Routes>
    </MemoryRouter>
  </QueryClientProvider>);
}

describe("Opening balances (0705)", () => {
  it("says the draft is not in the ledger, and what 160-0000 would hold", async () => {
    show();
    expect(await screen.findByTestId("opening-state")).toHaveTextContent("Draft · Not in the ledger yet · Posts dated Wed, 9 Sep 26");
    expect(screen.getByTestId("opening-totals")).toHaveTextContent("Debit RM 1,500.00 · Credit RM 350.00");
    expect(screen.getByTestId("opening-difference")).toHaveTextContent("160-0000 Opening balance RM 1,150.00");
    // A Unit and an order not found come first: Post names the first gap.
    expect(screen.getByRole("button", { name: "Post: correct the Units not found" })).toBeDisabled();
  });

  it("names the gaps before Post in order, and none when the draft balances", () => {
    const a = draft();
    expect(postGap(a)).toBe("correct the Units not found");
    expect(postGap({ ...a, stock: a.stock.filter((s) => s.found) })).toBe("correct the orders not found");
    const clean = { ...a, stock: a.stock.filter((s) => s.found), deposits: a.deposits.filter((d) => d.found) };
    expect(postGap(clean)).toBe("make debits equal credits");
    expect(postGap({ ...clean, totals: { debit: "850.00", credit: "850.00", lines: 4 } })).toBeNull();
    expect(postGap({ ...clean, totals: { debit: "0", credit: "0", lines: 0 } })).toBe("enter the balances first");
  });

  it("saves the Accounts tab whole, with the draft it was read from", async () => {
    show();
    const credit = await screen.findByLabelText("Credit for 500-0000 SALES");
    fireEvent.change(credit, { target: { value: "1,000" } });
    expect(screen.getByTestId("opening-accounts-not-saved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.writes).toHaveLength(1));
    expect(api.writes[0]).toEqual({ url: "/api/finance/opening-balances/accounts", method: "PUT", body: {
      lines: [{ account_code: "310-2000", debit: 1000, credit: null }, { account_code: "500-0000", debit: null, credit: 1000 }],
      was: WAS,
    } });
  });

  it("refuses an account with both sides before it is sent", async () => {
    show();
    fireEvent.change(await screen.findByLabelText("Credit for 310-2000 HONG LEONG BANK"), { target: { value: "5" } });
    expect(screen.getByTestId("opening-accounts-error")).toHaveTextContent("An account takes a debit or a credit, not both.");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("shows a party whose open items do not tally with its difference, and posting is not blocked by it", async () => {
    show("/finance/ledger/opening-balances?tab=suppliers");
    expect(await screen.findByText("Lumen Sofa Works")).toBeInTheDocument();
    expect(screen.getByText("Open items differ from the total by RM -20.00")).toBeInTheDocument();
    expect(partyRemark({ difference: "0.00" })).toBe("");
    expect(postGap({ ...draft(), stock: [], deposits: [], totals: { debit: "50.00", credit: "50.00", lines: 2 } })).toBeNull();
  });

  it("lists customers and other debtors apart from suppliers", async () => {
    show("/finance/ledger/opening-balances?tab=debtors");
    expect(await screen.findByText("Tan Mei Ling")).toBeInTheDocument();
    expect(screen.queryByText("Lumen Sofa Works")).toBeNull();
  });

  it("lists a Unit not found and waits for it before Post", async () => {
    show("/finance/ledger/opening-balances?tab=stock");
    expect(await screen.findByTestId("opening-stock-missing")).toHaveTextContent("1 Unit is not found. Correct or remove it before Post.");
    expect(screen.getByText("Unit not found")).toBeInTheDocument();
  });

  it("pastes Units from Excel over the list, a Unit already listed taking the new cost", async () => {
    show("/finance/ledger/opening-balances?tab=stock");
    fireEvent.click(await screen.findByRole("button", { name: "Paste from Excel" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Pasted rows"), { target: { value: "Unit\tCost\nU-1\t300\nU-2\t1,250.50" } });
    expect(within(dialog).getByTestId("opening-paste-count")).toHaveTextContent("2 rows read");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.writes).toHaveLength(1));
    expect(api.writes[0]!.body).toEqual({ rows: [
      { unit_code: "U-404", unit_cost: 10 }, { unit_code: "U-1", unit_cost: 300 }, { unit_code: "U-2", unit_cost: 1250.5 },
    ], was: WAS });
  });

  it("names each deposit's remark: an order not found, delivered, or another customer", async () => {
    show("/finance/ledger/opening-balances?tab=deposits");
    expect(await screen.findByTestId("opening-deposits-missing")).toHaveTextContent("1 order is not found.");
    expect(screen.getByText("Order not found")).toBeInTheDocument();
    expect(screen.getByText("Customer on the order is Tan Mei Ling")).toBeInTheDocument();
    const d = draft().deposits[0]!;
    expect(depositRemark({ ...d, delivered_at: "2026-09-01T03:00:00Z" })).toBe("Delivered on Tue, 1 Sep");
    expect(depositRemark({ ...d, customer_ref: "tan mei ling" })).toBe("");
  });

  it("when posted: no Save, no paste, and Reverse asks for the reason", async () => {
    api.answer = draft({ status: "posted", entry: { id: "e-1", entry_no: "JE-202609-0001" }, posted_by_name: "Boss",
      totals: { debit: "850.00", credit: "850.00", lines: 4 } });
    show();
    expect(await screen.findByTestId("opening-state")).toHaveTextContent("Posted · JE-202609-0001 · Dated Wed, 9 Sep 26 · by Boss");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByLabelText("Credit for 500-0000 SALES")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reverse" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Reverse: type the reason" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Cash figure wrong" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reverse" }));
    await waitFor(() => expect(api.writes).toEqual([{ url: "/api/finance/opening-balances/reverse", method: "POST", body: { reason: "Cash figure wrong" } }]));
  });

  it("a Finance user sees no Post, and is told who may post", async () => {
    api.answer = draft({ may_post: false });
    show();
    expect(await screen.findByTestId("opening-note")).toHaveTextContent("Only the principal may post or reverse the opening balances.");
    expect(screen.queryByRole("button", { name: /^Post/ })).toBeNull();
  });

  it("Post asks first and sends the draft it was read from", async () => {
    api.answer = draft({ stock: [], deposits: [], totals: { debit: "850.00", credit: "850.00", lines: 4 } });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Post" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Post" }));
    await waitFor(() => expect(api.writes).toEqual([{ url: "/api/finance/opening-balances/post", method: "POST", body: { was: WAS } }]));
  });
});

describe("the paste readers and the report caption", () => {
  it("reads tab or comma separated Units, skipping the column names, naming a line it cannot read", () => {
    expect(readStockPaste("Unit\tCost\nU-1\t1,200.00\nU-2,RM 99.5\nU-3\tabc\n\n")).toEqual({
      rows: [{ unit_code: "U-1", unit_cost: 1200 }, { unit_code: "U-2", unit_cost: 99.5 }],
      problems: [{ line: 4, text: "U-3\tabc", reason: "Type the amount in numbers, like 1500.00." }],
    });
  });

  it("reads deposits as SO No and deposit, or customer, SO No and deposit", () => {
    expect(readDepositPaste("SO-1401\t300\nTan Mei Ling\tSO-1402\t1,000.00\n1403,50")).toEqual({
      rows: [
        { order_ref: "SO-1401", customer_ref: null, amount: 300 },
        { order_ref: "SO-1402", customer_ref: "Tan Mei Ling", amount: 1000 },
        { order_ref: "1403", customer_ref: null, amount: 50 },
      ],
      problems: [],
    });
  });

  it("reads an amount with RM and commas, and refuses three decimals", () => {
    expect(readOpeningAmount("RM 1,234.50")).toEqual({ value: 1234.5 });
    expect(readOpeningAmount("-20", true)).toEqual({ value: -20 });
    expect(readOpeningAmount("-20").error).toBeDefined();
    expect(readOpeningAmount("1.005").error).toBe("An amount has at most two decimals.");
  });

  it("merges pasted rows over the list by key", () => {
    expect(mergeByKey([{ k: "a", v: 1 }, { k: "b", v: 2 }], [{ k: "B", v: 3 }, { k: "c", v: 4 }], (r) => r.k))
      .toEqual([{ k: "a", v: 1 }, { k: "B", v: 3 }, { k: "c", v: 4 }]);
  });

  it("every report says Brought forward once the opening balances are posted", () => {
    expect(noOpening("2026-09-10")).toBe("Since Thu, 10 Sep 26 · No opening balances");
    expect(noOpening("2026-09-10", true)).toBe("Since Thu, 10 Sep 26 · Brought forward");
  });
});

const here = dirname(fileURLToPath(import.meta.url));
describe("Opening balances words", () => {
  itSaysNoBannedWord(join(here, "OpeningBalances.tsx"), { minStrings: 30, expectString: "Not in the ledger yet" });
  itSaysNoBannedWord(join(here, "OpeningParties.tsx"), { minStrings: 20, expectString: "Open items differ from the total by" });
});
