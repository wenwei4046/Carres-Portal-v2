import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CardWaitingAnswer, CardWaitingPaymentWire } from "@carres/shared/card-money-waiting";
import { itSaysNoBannedWord } from "@/test/banned-words";
import CardMoneyWaiting from "./CardMoneyWaiting";

/* Finance → Bank & Cards → Card money waiting (0641; Chew 2026-10-03). The one
   read is answered by URL; names and figures are invented. */
const api = vi.hoisted(() => ({ answer: null as unknown, fail: null as null | { status: number } }));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string) => {
    if (api.fail) throw Object.assign(new Error("boom"), { status: api.fail.status, body: {} });
    if (url !== "/api/finance/card-settlement/waiting") throw new Error(`unexpected read ${url}`);
    return api.answer;
  }),
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));

const PAYMENT = "11111111-1111-4111-8111-111111111111";
const pay = (over: Partial<CardWaitingPaymentWire>): CardWaitingPaymentWire => ({
  entry_no: "JE-202610-0001", entry_date: "2026-10-01", source_type: "CUSTOMER_PAYMENT", doc_no: "OR-2610-0001",
  account_code: "1131", amount: 300, payment_id: PAYMENT, receipt_no: "OR-2610-0001", order_id: "o-1", so: 1401,
  customer_name: "Tan Mei Ling", acquirer: null, day_date: null, move_no: null, state: "NOT_ON_A_FILE", ...over,
});

const ANSWER: CardWaitingAnswer = {
  today: "2026-10-03",
  go_live_on: "2026-09-01",
  holdings: [{ account_code: "1131", name: "GHL", balance: 1020 }],
  payments: [
    pay({}),
    pay({ entry_no: "JE-202609-0040", entry_date: "2026-09-12", amount: 420, receipt_no: "OR-2609-0030", state: "NOT_PREPARED", acquirer: "GHL", day_date: "2026-09-12" }),
    pay({ entry_no: "JE-202609-0041", entry_date: "2026-09-12", amount: 300, receipt_no: "OR-2609-0031", state: "WAITING_APPROVAL", acquirer: "GHL", day_date: "2026-09-12", move_no: "MM-20260913-0001" }),
  ],
};

beforeEach(() => {
  api.answer = ANSWER;
  api.fail = null;
  localStorage.clear();
});

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><CardMoneyWaiting /></MemoryRouter></QueryClientProvider>);
}

const row = (entry: string) => screen.getByTestId(`card-money-waiting-row-${entry}`);

describe("Card money waiting (0641)", () => {
  it("lists each payment with its order, customer, card account, days and where it is", async () => {
    show();
    await screen.findByTestId("card-money-waiting-row-JE-202610-0001");
    const fresh = row("JE-202610-0001");
    expect(fresh).toHaveTextContent("OR-2610-0001");
    expect(fresh).toHaveTextContent("SO-1401");
    expect(fresh).toHaveTextContent("Tan Mei Ling");
    expect(fresh).toHaveTextContent("1131 GHL");
    expect(within(fresh).getByText("2")).toBeInTheDocument(); // days waiting
    expect(fresh).toHaveTextContent("No card company file shows it yet");
    expect(row("JE-202609-0040")).toHaveTextContent("Matched · card payout not prepared");
    expect(within(row("JE-202609-0040")).getByText("21")).toBeInTheDocument();
    expect(row("JE-202609-0041")).toHaveTextContent("Card payout MM-20260913-0001 waiting for approval");
  });

  it("a document opens its payment record; where it is opens Card settlement", async () => {
    show();
    await screen.findByTestId("card-money-waiting-row-JE-202610-0001");
    const fresh = row("JE-202610-0001");
    expect(within(fresh).getByRole("link", { name: "OR-2610-0001" })).toHaveAttribute("href", `/finance/payments?payment=${PAYMENT}`);
    expect(within(fresh).getByRole("link", { name: "No card company file shows it yet" })).toHaveAttribute("href", "/finance/card-settlement");
  });

  it("ties the list to the card and online accounts in the books", async () => {
    show();
    await screen.findByTestId("card-money-waiting-row-JE-202610-0001");
    expect(screen.getByTestId("card-money-waiting-summary")).toHaveTextContent(
      "3 payments · RM 1,020.00 waiting · The card and online accounts hold RM 1,020.00 in the books",
    );
    expect(screen.queryByTestId("card-money-waiting-differs")).not.toBeInTheDocument();
  });

  it("says when the accounts hold money the list does not explain", async () => {
    api.answer = { ...ANSWER, holdings: [{ account_code: "1131", name: "GHL", balance: 1100 }] };
    show();
    expect(await screen.findByTestId("card-money-waiting-differs")).toHaveTextContent(
      "The card and online accounts hold RM 80.00 more than these payments.",
    );
  });

  it("an empty list says every payment has reached the bank; a failed read shows the fix", async () => {
    api.answer = { ...ANSWER, payments: [], holdings: [{ account_code: "1131", name: "GHL", balance: 0 }] };
    const { unmount } = show();
    expect(await screen.findByText("No card or online money is waiting. Every payment has reached the bank.")).toBeInTheDocument();
    unmount();
    api.fail = { status: 500 };
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Card money waiting could not be loaded. Try again.");
  });
});

describe("no banned word reaches the screen", () => {
  itSaysNoBannedWord(join(dirname(fileURLToPath(import.meta.url)), "CardMoneyWaiting.tsx"), { minStrings: 15, expectString: "Where it is" });
});
