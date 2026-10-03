import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionAnswer, CollectionOrderWire } from "@carres/shared/collection";
import { itSaysNoBannedWord } from "@/test/banned-words";
import Collection, { readBelow } from "./Collection";

/* Finance → Reports → Collection (0644; Chew 2026-10-03). The one read is
   answered by URL; names and figures are invented. */
const api = vi.hoisted(() => ({ answer: null as unknown, calls: [] as string[] }));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string) => {
    api.calls.push(url);
    if (!url.startsWith("/api/finance/ledger/collection?")) throw new Error(`unexpected read ${url}`);
    return api.answer;
  }),
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/fmt-date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fmt-date")>()),
  appTodayIso: () => "2026-09-30",
}));

const order = (over: Partial<CollectionOrderWire>): CollectionOrderWire => ({
  id: "o", so: 1401, placed_on: "2026-09-05", status: "proceed_order", customer_name: "LIM KUAN YANG",
  salesperson_id: "s1", salesperson_name: "Aina", channel: "showroom", dealer_name: "PJ Showroom",
  order_value: "2000.00", deposit: "1000.00", balance_paid: "0.00", invoice_no: null, billed: null, issued_at: null,
  delivered: false, ...over,
});
const ANSWER: CollectionAnswer = {
  from: "2026-09-01", to: "2026-09-30",
  orders: [
    order({ id: "a", delivered: true, invoice_no: "INV-2609-0001", billed: "2100.00", balance_paid: "600.00" }),
    order({ id: "b", so: 1402, order_value: "3000.00", deposit: "600.00" }),
    order({ id: "c", so: 1403, salesperson_id: null, salesperson_name: null, order_value: "800.00", deposit: "800.00" }),
  ],
};

beforeEach(() => {
  api.answer = ANSWER;
  api.calls = [];
  localStorage.clear();
});

function Where() {
  return <span data-testid="where">{useLocation().search}</span>;
}
function show(at = "/finance/reports/collection") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <Routes><Route path="/finance/reports/collection" element={<><Collection /><Where /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Collection", () => {
  it("reads this month, per salesperson: orders, value, deposit and its share, and how many fell below 50%", async () => {
    show();
    const aina = await screen.findByTestId("collection-row-s1");
    expect(api.calls).toEqual(["/api/finance/ledger/collection?from=2026-09-01&to=2026-09-30"]);
    expect(aina).toHaveTextContent("Aina");
    expect(aina).toHaveTextContent("RM 5,000.00");
    expect(aina).toHaveTextContent("RM 1,600.00");
    expect(aina).toHaveTextContent("32.0%");
    expect(screen.getByTestId("collection-row-none")).toHaveTextContent("No salesperson");
    expect(screen.getByTestId("collection-summary")).toHaveTextContent("2 salespeople · 3 orders · 1 below 50%");
    // The money is the footer row's: totals and the share of the whole.
    const footer = screen.getAllByRole("row").find((r) => r.textContent?.includes("RM 5,800.00"));
    expect(footer).toHaveTextContent("RM 2,400.00");
    expect(footer).toHaveTextContent("41.4%");
  });

  it("the threshold is kept in the address and changes who is below it", async () => {
    show("/finance/reports/collection?below=40");
    await screen.findByTestId("collection-row-s1");
    expect(screen.getByTestId("collection-summary")).toHaveTextContent("1 below 40%");
    fireEvent.change(screen.getByLabelText("Below (%)"), { target: { value: "60" } });
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("below=60"));
    expect(screen.getByTestId("collection-summary")).toHaveTextContent("2 below 60%");
  });

  it("Balance shows the delivered orders: invoiced, balance due, paid and still owed", async () => {
    show("/finance/reports/collection?view=balance");
    const aina = await screen.findByTestId("collection-row-s1");
    expect(aina).toHaveTextContent("RM 2,100.00");
    expect(screen.getByTestId("collection-summary")).toHaveTextContent("2 salespeople · 1 delivered");
    const footer = screen.getAllByRole("row").find((r) => r.textContent?.includes("RM 1,100.00"));
    expect(footer).toHaveTextContent("RM 600.00");
    expect(footer).toHaveTextContent("54.5%");
    expect(footer).toHaveTextContent("RM 500.00");
    fireEvent.click(within(aina).getByTitle("Show orders"));
    const list = await screen.findByTestId("collection-orders-s1");
    expect(list).toHaveTextContent("SO-1401");
    expect(list).toHaveTextContent("INV-2609-0001");
    expect(list).not.toHaveTextContent("SO-1402"); // not delivered
  });

  it("switching to Balance keeps the period", async () => {
    show("/finance/reports/collection?from=2026-08-01&to=2026-08-31");
    await screen.findByTestId("collection-row-s1");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Balance" }));
    fireEvent.click(screen.getByRole("tab", { name: "Balance" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("view=balance"));
    expect(screen.getByTestId("where")).toHaveTextContent("from=2026-08-01");
  });

  it("reads the threshold strictly", () => {
    expect(readBelow("30")).toBe(30);
    expect(readBelow("0")).toBe(50);
    expect(readBelow("120")).toBe(50);
    expect(readBelow(null)).toBe(50);
  });
});

itSaysNoBannedWord(join(dirname(fileURLToPath(import.meta.url)), "Collection.tsx"), { minStrings: 15, expectString: "Balance paid" });
