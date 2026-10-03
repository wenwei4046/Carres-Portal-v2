import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ForecastAnswer } from "@carres/shared/forecast";
import { itSaysNoBannedWord } from "@/test/banned-words";
import Forecast, { forecastMonths, readForecastMonth } from "./Forecast";

/* Finance → Reports → Forecast (0646; Chew 2026-10-03). Each read is answered
   by URL; the plan and the figures are invented. */
const api = vi.hoisted(() => ({
  answer: null as unknown,
  calls: [] as string[],
  puts: [] as Array<{ url: string; body: unknown }>,
  putFail: null as null | { status: number; message: string; code: string },
  readFail: false,
}));
vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    constructor(public status: number, message: string, public body: unknown) { super(message); }
  }
  return {
    ApiError,
    apiFetch: vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        api.puts.push({ url, body: JSON.parse(String(init.body)) });
        if (api.putFail) throw new ApiError(api.putFail.status, api.putFail.message, { code: api.putFail.code, message: api.putFail.message });
        return { month: "2026-09", saved_at: "2026-09-30T09:00:00+00:00" };
      }
      api.calls.push(url);
      if (url.startsWith("/api/finance/ledger/forecast?")) {
        if (api.readFail) throw new ApiError(500, "The forecast could not be loaded. Try again.", null);
        return api.answer;
      }
      if (url.startsWith("/api/finance/ledger/profit-and-loss?")) return PL;
      throw new Error(`unexpected read ${url}`);
    }),
  };
});
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/fmt-date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fmt-date")>()),
  appTodayIso: () => "2026-09-30",
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const ANSWER: ForecastAnswer = {
  month: "2026-09",
  accounts: [
    { code: "4100", name: "Furniture sales", kind: "INCOME", active: true, block: "income" },
    { code: "4300", name: "Delivery income", kind: "INCOME", active: true, block: "income" },
    { code: "5100", name: "Cost of goods sold", kind: "EXPENSE", active: true, block: "cost" },
    { code: "6200", name: "Rent and utilities", kind: "EXPENSE", active: true, block: "expense" },
    { code: "6500", name: "Bank and payment charges", kind: "EXPENSE", active: true, block: "expense" },
    { code: "6900", name: "Office, marketing and general", kind: "EXPENSE", active: false, block: "expense" },
  ],
  lines: { "4100": { amount: 10000 }, "5100": { share: 5500 }, "6200": { amount: 1500 } },
  updated_at: "2026-09-29T08:00:00.123456+00:00",
  updated_by_name: "Chew",
  previous: { month: "2026-08", lines: { "4100": { amount: 9000 }, "4300": { amount: 300 }, "6500": { share: 200 } } },
  planned_months: ["2026-08", "2026-09"],
};

// The rows gl_profit_and_loss returns for September (0469).
const BLANK = { section: null, row_kind: null, header_code: null, header_name: null, account_code: null, account_name: null, amount: null };
const line = (section: string, hdr: string, hdrName: string, code: string, name: string, amount: number) =>
  ({ section, row_kind: "ACCOUNT", header_code: hdr, header_name: hdrName, account_code: code, account_name: name, amount });
const PL = {
  rows: [
    line("INCOME", "4000", "Income", "4100", "Furniture sales", 12500),
    line("INCOME", "4000", "Income", "4300", "Delivery income", 350),
    { section: "INCOME", row_kind: "HEADER_SUBTOTAL", header_code: "4000", header_name: "Income", amount: 12850 },
    { section: "INCOME", row_kind: "SECTION_TOTAL", header_name: "Total income", amount: 12850 },
    line("EXPENSE", "5000", "Cost of sales", "5100", "Cost of goods sold", 7000),
    { section: "EXPENSE", row_kind: "HEADER_SUBTOTAL", header_code: "5000", header_name: "Cost of sales", amount: 7000 },
    line("EXPENSE", "6000", "Operating expenses", "6200", "Rent and utilities", 1800),
    line("EXPENSE", "6000", "Operating expenses", "6500", "Bank and payment charges", 0),
    { section: "EXPENSE", row_kind: "HEADER_SUBTOTAL", header_code: "6000", header_name: "Operating expenses", amount: 1800 },
    { section: "EXPENSE", row_kind: "SECTION_TOTAL", header_name: "Total expense", amount: 8800 },
    { section: "NET", row_kind: "NET", header_name: "Net result for the period", amount: 4050 },
  ].map((r, i) => ({ report_status: "OK", go_live_on: "2026-09-01", period_from: "2026-09-01", period_to: "2026-09-30", ordinal: i + 1, ...BLANK, ...r })),
};

beforeEach(() => {
  api.answer = ANSWER;
  api.calls = [];
  api.puts = [];
  api.putFail = null;
  api.readFail = false;
  toast.success.mockReset();
  toast.error.mockReset();
});

function Where() {
  return <span data-testid="where">{useLocation().search}</span>;
}
function show(at = "/finance/reports/forecast") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <Routes><Route path="/finance/reports/forecast" element={<><Forecast /><Where /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const box = (name: string) => screen.getByRole("textbox", { name }) as HTMLInputElement;
const rowOf = (code: string) => screen.getAllByTestId("forecast-row").find((r) => r.textContent?.includes(code))!;
const bandOf = (word: string) => within(screen.getByTestId("forecast")).getAllByText(word).map((e) => e.closest("tr")!)[0]!;

describe("Forecast", () => {
  it("reads this month's plan beside its actual: each account, each block, gross profit and the net result", async () => {
    show();
    await waitFor(() => expect(box("Plan for 4100 Furniture sales")).toHaveValue("10,000.00"));
    expect(api.calls).toEqual(expect.arrayContaining([
      "/api/finance/ledger/forecast?month=2026-09",
      "/api/finance/ledger/profit-and-loss?from=2026-09-01&to=2026-09-30",
    ]));
    // Income is an amount; its share of the whole is only shown.
    expect(rowOf("4100")).toHaveTextContent("100.00%");
    expect(rowOf("4100")).toHaveTextContent("RM 12,500.00");
    expect(rowOf("4100")).toHaveTextContent("RM 2,500.00");
    expect(screen.queryByRole("textbox", { name: "% of income for 4100 Furniture sales" })).not.toBeInTheDocument();
    // A share shows what it works out to in the other box, and the other way round.
    expect(box("% of income for 5100 Cost of goods sold")).toHaveValue("55.00");
    expect(box("Plan for 5100 Cost of goods sold")).toHaveAttribute("placeholder", "5,500.00");
    expect(box("Plan for 6200 Rent and utilities")).toHaveValue("1,500.00");
    expect(box("% of income for 6200 Rent and utilities")).toHaveAttribute("placeholder", "15.00");
    // An account with nothing planned and nothing posted still has its line; a retired one does not.
    expect(rowOf("6500")).toHaveTextContent("RM 0.00");
    expect(screen.queryByText(/6900/)).not.toBeInTheDocument();

    expect(bandOf("Income")).toHaveTextContent("RM 10,000.00100.00%RM 12,850.00RM 2,850.00");
    expect(bandOf("Cost of sales")).toHaveTextContent("RM 5,500.0055.00%RM 7,000.00RM 1,500.00");
    expect(bandOf("Gross profit")).toHaveTextContent("RM 4,500.0045.00%RM 5,850.00RM 1,350.00");
    expect(bandOf("Expense")).toHaveTextContent("RM 1,500.0015.00%RM 1,800.00RM 300.00");
    expect(bandOf("Net result")).toHaveTextContent("RM 3,000.0030.00%RM 4,050.00RM 1,050.00");
    expect(screen.getByTestId("forecast-note")).toHaveTextContent("Saved by Chew on");
    expect(screen.queryByTestId("forecast-not-saved")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("typing a share replaces the amount, and Save sends the whole month with the time it was read", async () => {
    show();
    await waitFor(() => expect(box("Plan for 6200 Rent and utilities")).toHaveValue("1,500.00"));
    fireEvent.change(box("% of income for 6200 Rent and utilities"), { target: { value: "20" } });
    expect(box("Plan for 6200 Rent and utilities")).toHaveValue("");
    expect(box("Plan for 6200 Rent and utilities")).toHaveAttribute("placeholder", "2,000.00");
    expect(screen.getByTestId("forecast-not-saved")).toHaveTextContent("Not saved");
    // The month cannot change under a plan not saved.
    expect(screen.getByRole("combobox", { name: "Month" })).toBeDisabled();
    fireEvent.change(box("Plan for 4300 Delivery income"), { target: { value: "1,000.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.puts).toHaveLength(1));
    expect(api.puts[0]).toEqual({
      url: "/api/finance/ledger/forecast/2026-09",
      body: {
        lines: { "4100": { amount: 10000 }, "4300": { amount: 1000.5 }, "5100": { share: 5500 }, "6200": { share: 2000 } },
        was: "2026-09-29T08:00:00.123456+00:00",
      },
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Forecast saved"));
    // Read again after the save, and the boxes start from what was saved.
    await waitFor(() => expect(api.calls.filter((u) => u.startsWith("/api/finance/ledger/forecast?"))).toHaveLength(2));
  });

  it("a box that cannot be read says why and keeps Save shut; Discard puts the saved plan back", async () => {
    show();
    await waitFor(() => expect(box("Plan for 6200 Rent and utilities")).toHaveValue("1,500.00"));
    fireEvent.change(box("Plan for 6200 Rent and utilities"), { target: { value: "1.234" } });
    expect(screen.getByTestId("forecast-error")).toHaveTextContent("6200 Rent and utilities: type the amount in ringgit and sen.");
    expect(box("Plan for 6200 Rent and utilities")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    // The first wrong box in the chart's order is named; mended, the next one is.
    fireEvent.change(box("% of income for 6500 Bank and payment charges"), { target: { value: "-2" } });
    expect(screen.getByTestId("forecast-error")).toHaveTextContent("6200 Rent and utilities");
    fireEvent.change(box("Plan for 6200 Rent and utilities"), { target: { value: "1500" } });
    expect(screen.getByTestId("forecast-error")).toHaveTextContent("6500 Bank and payment charges: a share is 0% or more, to two decimals.");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(box("Plan for 6200 Rent and utilities")).toHaveValue("1,500.00"));
    expect(box("% of income for 6500 Bank and payment charges")).toHaveValue("");
    expect(screen.queryByTestId("forecast-not-saved")).not.toBeInTheDocument();
  });

  it("copies the earlier month's plan into the boxes left blank, never over a typed one", async () => {
    show();
    await waitFor(() => expect(box("Plan for 4100 Furniture sales")).toHaveValue("10,000.00"));
    // A box being typed in is not blank, even when what is in it cannot be read yet.
    fireEvent.change(box("% of income for 6500 Bank and payment charges"), { target: { value: "2." } });
    fireEvent.click(screen.getByRole("button", { name: "Copy plan from Aug 2026" }));
    expect(toast.success).toHaveBeenCalledWith("Plan copied from Aug 2026. Save to keep it.");
    expect(box("Plan for 4100 Furniture sales")).toHaveValue("10,000.00");
    expect(box("Plan for 4300 Delivery income")).toHaveValue("300.00");
    expect(box("% of income for 6500 Bank and payment charges")).toHaveValue("2.");
    expect(screen.getByRole("button", { name: "Copy plan from Aug 2026" })).toBeDisabled();
    expect(screen.getByTestId("forecast-not-saved")).toBeInTheDocument();
  });

  it("someone else saving first is refused with their sentence, and the month is read again", async () => {
    api.putFail = { status: 409, code: "forecast_changed", message: "Someone else saved this month after you opened it. Open it again to see their plan." };
    show();
    await waitFor(() => expect(box("Plan for 6200 Rent and utilities")).toHaveValue("1,500.00"));
    fireEvent.change(box("Plan for 6200 Rent and utilities"), { target: { value: "1600" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Someone else saved this month after you opened it. Open it again to see their plan."));
    await waitFor(() => expect(api.calls.filter((u) => u.startsWith("/api/finance/ledger/forecast?"))).toHaveLength(2));
    // What was typed stays until Discard.
    expect(box("Plan for 6200 Rent and utilities")).toHaveValue("1600");
  });

  it("a month that has not started has no actual and asks the ledger for none", async () => {
    api.answer = { ...ANSWER, month: "2026-10", lines: {}, updated_at: null, updated_by_name: null, previous: { month: "2026-09", lines: ANSWER.lines } };
    show("/finance/reports/forecast?month=2026-10");
    expect(await screen.findByRole("button", { name: "Copy plan from Sep 2026" })).toBeEnabled();
    expect(screen.getByTestId("forecast-no-actual")).toHaveTextContent("This month has not started, so it has no actual yet.");
    expect(api.calls.some((u) => u.includes("profit-and-loss"))).toBe(false);
    // No actual: the actual and difference cells stay empty, never RM 0.00.
    expect(rowOf("4100")).not.toHaveTextContent("RM");
  });

  it("keeps the month in the address, and lists the year around today and every planned month", () => {
    expect(readForecastMonth("2026-13", "2026-09-30")).toBe("2026-09");
    expect(readForecastMonth("2027-01", "2026-09-30")).toBe("2027-01");
    const months = forecastMonths("2026-09-30", ["2024-01"], "2026-09");
    expect(months[0]).toBe("2027-09");
    expect(months).toContain("2025-09");
    expect(months).not.toContain("2025-08");
    expect(months[months.length - 1]).toBe("2024-01");
  });

  it("a plan that cannot be read shows the fix and never a zero", async () => {
    api.readFail = true;
    show();
    expect(await screen.findByText("The forecast could not be loaded. Try again.")).toBeInTheDocument();
    expect(screen.queryByTestId("forecast")).not.toBeInTheDocument();
  });
});

itSaysNoBannedWord(join(dirname(fileURLToPath(import.meta.url)), "Forecast.tsx"), { minStrings: 15, expectString: "Copy plan from" });
