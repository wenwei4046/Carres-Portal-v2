import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StockValueAnswer, StockValueUnit } from "@carres/shared/stock-value";
import { itSaysNoBannedWord } from "@/test/banned-words";
import StockValue, { lastEndedMonth, stockMonths } from "./StockValue";

/* Finance → Reports → Stock value (0643; Chew 2026-10-03). The one read is
   answered by URL; Units and figures are invented. */
const api = vi.hoisted(() => ({
  answer: null as unknown,
  calls: [] as string[],
  fail: false,
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string) => {
    api.calls.push(url);
    if (api.fail) throw Object.assign(new Error("boom"), { status: 500, body: {} });
    if (!url.startsWith("/api/finance/ledger/stock-value?")) throw new Error(`unexpected read ${url}`);
    return api.answer;
  }),
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/fmt-date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fmt-date")>()),
  appTodayIso: () => "2026-10-03",
}));

const unit = (over: Partial<StockValueUnit>): StockValueUnit => ({
  id: over.unit_code ?? "u", unit_code: "U1-000-001", sku: "SOFA-3S", qty: 1, scope: "unit", status: "free",
  bucket: "warehouse", site_name: "Carres Klang", holder_name: null, po_no: "PO260901-1111", unit_cost: "520.00", value: "520.00",
  ...over,
});
const ANSWER: StockValueAnswer = {
  month_end: "2026-09-30", cut_at: "2026-09-30T16:00:00Z", today: "2026-10-03", provisional: true,
  units: [
    unit({}),
    unit({ unit_code: "U1-000-002", status: "reserved", unit_cost: "1250.00", value: "1250.00" }),
    unit({ unit_code: "U1-000-003", bucket: "showroom", site_name: "PJ Showroom", unit_cost: null, value: null, po_no: null }),
    unit({ unit_code: "U1-000-004", bucket: "transit", status: "transferred", unit_cost: "300.00", value: "300.00" }),
    unit({ unit_code: "U1-000-005", bucket: "repair", status: "transferred", unit_cost: null, value: null }),
  ],
  left_out: { consignment_units: 2, consignment_qty: 2 },
};

beforeEach(() => {
  api.answer = ANSWER;
  api.calls = [];
  api.fail = false;
  localStorage.clear();
});

function Where() {
  return <span data-testid="where">{useLocation().search}</span>;
}

function show(at = "/finance/reports/stock-value") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <Routes><Route path="/finance/reports/stock-value" element={<><StockValue /><Where /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Stock value", () => {
  it("opens on the last month that has ended, and says the value is provisional", async () => {
    show();
    await screen.findByTestId("stock-value-row-U1-000-001");
    expect(api.calls).toEqual(["/api/finance/ledger/stock-value?monthEnd=2026-09-30"]);
    expect(screen.getByTestId("stock-value-note")).toHaveTextContent(
      "Provisional. Worked out from Stock's Units, at the end of Wed, 30 Sep 26, until Stock confirms its month-end count. 2 consignment Units are left out: they belong to their suppliers.",
    );
  });

  it("totals each group, and counts the Units with no cost apart", async () => {
    show();
    const groups = await screen.findByTestId("stock-value-groups");
    await waitFor(() => expect(groups).toHaveTextContent("RM 1,770.00"));
    const rows = within(groups).getAllByRole("row").map((r) => r.textContent);
    expect(rows).toEqual([
      "GroupUnitsValueNo cost recorded",
      "Warehouse2RM 1,770.00",
      "Showroom1RM 0.001",
      "In transit1RM 300.00",
      "Sent for repair1RM 0.001",
      "Not placed0RM 0.00",
      "Total5RM 2,070.00" + "2",
    ]);
    expect(screen.getByTestId("stock-value-footer")).toHaveTextContent("5 Units · RM 2,070.00 · 2 with no cost recorded");
  });

  it("a Unit with no cost recorded has empty cost and value cells, never RM 0.00", async () => {
    show();
    const row = await screen.findByTestId("stock-value-row-U1-000-003");
    expect(row).toHaveTextContent("Showroom");
    expect(row).toHaveTextContent("PJ Showroom");
    expect(row).not.toHaveTextContent("RM");
  });

  it("a month not yet ended says the Units are as they are now, and the month is kept in the address", async () => {
    show("/finance/reports/stock-value?month=2026-10");
    await screen.findByTestId("stock-value-row-U1-000-001");
    expect(api.calls).toEqual(["/api/finance/ledger/stock-value?monthEnd=2026-10-31"]);
    expect(screen.getByTestId("stock-value-note")).toHaveTextContent("This month has not ended, so the Units are as they are now.");
    fireEvent.keyDown(screen.getByRole("combobox", { name: /Month/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Sep 2026" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(""));
  });

  it("an answer that cannot be read is a refusal in words", async () => {
    api.fail = true;
    show();
    expect(await screen.findByText(/The stock value could not be loaded/)).toBeInTheDocument();
  });

  it("lists the last 24 months to choose from", () => {
    expect(lastEndedMonth("2026-01-15")).toBe("2025-12");
    const months = stockMonths("2026-10-03", null);
    expect(months).toHaveLength(24);
    expect(months[0]).toBe("2026-10");
    expect(months[23]).toBe("2024-11");
    expect(stockMonths("2026-10-03", "2020-01")).toContain("2020-01");
  });
});

itSaysNoBannedWord(join(dirname(fileURLToPath(import.meta.url)), "StockValue.tsx"), { minStrings: 15, expectString: "No cost recorded" });
