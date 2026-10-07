/**
 * Finance Settings → Chart of accounts in AutoCount's sections (0656).
 *
 * What the screen must get right (Chew 2026-10-07, docs/finance/MASTER.md §0):
 *   · accounts are grouped by AutoCount's section in AutoCount's order, each
 *     heading's accounts under it, every heading by number, and the top
 *     headings (0000 ...) are not shown;
 *   · a top account with no section yet reads under `No section yet`;
 *   · a heading folds; retired accounts show only when asked for;
 *   · the edit icon and a row click open the same window, and Save is ONE call
 *     carrying the name, number, section and heading;
 *   · the retire icon asks first, and a refusal is the database's sentence;
 *   · Add account asks for the section first, offers only that section's
 *     headings, and never the bank and cash heading.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChartOfAccounts, { accountSaveGap, chartBySection, NO_SECTION } from "./ChartOfAccounts";

const SECTIONS = [
  ["CAPITAL", "EQUITY"], ["RETAINED EARNING", "EQUITY"], ["FIXED ASSETS", "ASSET"], ["OTHER ASSETS", "ASSET"],
  ["CURRENT ASSETS", "ASSET"], ["CURRENT LIABILITIES", "LIABILITY"], ["LONG TERM LIABILITIES", "LIABILITY"],
  ["SALES", "INCOME"], ["SALES ADJUSTMENTS", "INCOME"], ["COST OF GOODS SOLD", "EXPENSE"], ["OTHER INCOMES", "INCOME"],
  ["EXPENSES", "EXPENSE"], ["TAXATION", "EXPENSE"],
].map(([section, kind], i) => ({ section: section!, kind: kind!, sort_order: (i + 1) * 10 }));

const net = vi.hoisted(() => ({
  chart: [] as Array<Record<string, unknown>>,
  calls: [] as Array<{ method: string; path: string; body: Record<string, unknown> }>,
  refuse: null as null | { message: string; tag?: string },
}));

const TOP_OF: Record<string, string> = { ASSET: "0000", LIABILITY: "2000", EXPENSE: "6000" };

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      return {
        go_live_on: "2026-09-10",
        accounts: net.chart,
        sections: SECTIONS,
        roles: { MONEY_ACCOUNTS_HEADING: "310-0000" },
        money_accounts: ["310-1000", "310-2000"],
        rule_headings: [],
      };
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    net.calls.push({ method, path, body });
    if (net.refuse) {
      throw Object.assign(new Error(net.refuse.message), { body: { code: net.refuse.tag, message: net.refuse.message } });
    }
    const code = path.split("/")[path.endsWith("/active") ? path.split("/").length - 2 : path.split("/").length - 1]!;
    if (method === "PUT") {
      // gl_account_edit: the heading it sits under (or its section's top),
      // the section at the top, then the name and the number.
      const self = net.chart.find((a) => a.code === code)!;
      const parent = (body.under as string | null) ?? TOP_OF[String(self.kind)]!;
      net.chart = net.chart.map((a) =>
        a.code === code
          ? { ...a, code: body.code, name: body.name, parent_code: parent, section: body.under ? a.section : body.section }
          : a.parent_code === code ? { ...a, parent_code: body.code } : a,
      );
      return { code: body.code };
    }
    if (path.endsWith("/active")) {
      net.chart = net.chart.map((a) => (a.code === code ? { ...a, is_active: body.active } : a));
      return { code, active: body.active };
    }
    if (path.endsWith("/in-section")) {
      const kind = SECTIONS.find((s) => s.section === body.section)!.kind;
      net.chart = [...net.chart, acc(String(body.code), String(body.name), (body.parentCode as string | null) ?? TOP_OF[kind]!, kind, {
        is_header: body.isHeading === true, section: body.section,
      })];
      return { code: body.code };
    }
    throw new Error(`unexpected ${method} ${path}`);
  }),
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));

function acc(code: string, name: string, parent_code: string | null, kind: string, extra: Record<string, unknown> = {}) {
  return {
    code, name, kind, parent_code, is_control: false, control_for: null, is_active: true, is_header: false,
    sort_order: 0, section: null, special: null, ...extra,
  };
}

/* Three top headings the screen never shows; four sections with accounts, a
   top account with no section yet, and a retired account. The bank and cash
   heading (310-0000) holds two bank accounts listed out of number order. */
const CHART = [
  acc("0000", "ASSETS", null, "ASSET", { is_header: true }),
  acc("2000", "LIABILITIES", null, "LIABILITY", { is_header: true }),
  acc("6000", "EXPENSES", null, "EXPENSE", { is_header: true }),
  acc("200-0000", "FIXED ASSETS", "0000", "ASSET", { is_header: true, section: "FIXED ASSETS" }),
  acc("200-2000", "OFFICE EQUIPMENT", "200-0000", "ASSET", { section: "FIXED ASSETS", special: "SFA" }),
  acc("300-0000", "TRADE DEBTORS", "0000", "ASSET", { section: "CURRENT ASSETS", special: "SDC" }),
  acc("310-0000", "CASH AT BANK", "0000", "ASSET", { is_header: true, section: "CURRENT ASSETS" }),
  acc("310-2000", "HONG LEONG BANK", "310-0000", "ASSET", { section: "CURRENT ASSETS", special: "SBK" }),
  acc("310-1000", "ALLIANCE BANK", "310-0000", "ASSET", { section: "CURRENT ASSETS", special: "SBK" }),
  acc("410-0000", "ACCRUALS", "2000", "LIABILITY", { is_header: true, section: "CURRENT LIABILITIES" }),
  acc("410-0063", "ACCRUALS - EXPENSE", "410-0000", "LIABILITY", { section: "CURRENT LIABILITIES" }),
  acc("405-0000", "OTHERS CREDITORS", "2000", "LIABILITY"),
  acc("900-C001", "COMMISSION", "6000", "EXPENSE", { is_header: true, section: "EXPENSES" }),
  acc("900-C004", "COMMISSION - AGENT", "900-C001", "EXPENSE", { section: "EXPENSES" }),
  acc("900-E001", "ENTERTAINMENT", "6000", "EXPENSE", { section: "EXPENSES" }),
  acc("1230", "Advances to suppliers", "0000", "ASSET", { is_active: false }),
];

beforeEach(() => {
  net.chart = CHART.map((a) => ({ ...a }));
  net.calls = [];
  net.refuse = null;
  localStorage.clear();
});

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ChartOfAccounts />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const codesOnScreen = () =>
  Array.from(document.querySelectorAll<HTMLTableRowElement>("tr[data-row-key]")).map((tr) => tr.dataset.rowKey);
const row = (code: string) => document.querySelector<HTMLTableRowElement>(`tr[data-row-key="${code}"]`)!;

async function ready() {
  await waitFor(() => expect(row("310-1000")).toBeTruthy());
}

function pick(dialog: HTMLElement, label: RegExp, option: string) {
  fireEvent.keyDown(within(dialog).getByRole("combobox", { name: label }), { key: "Enter" });
  fireEvent.click(screen.getByRole("option", { name: option }));
}

describe("Chart of accounts — AutoCount's sections (0656)", () => {
  it("groups by section in AutoCount's order, each heading's accounts under it by number, and hides the top headings", async () => {
    show();
    await ready();
    expect(codesOnScreen()).toEqual([
      "200-0000", "200-2000",
      "300-0000", "310-0000", "310-1000", "310-2000",
      "410-0000", "410-0063",
      "900-C001", "900-C004", "900-E001",
      "405-0000",
    ]);
    expect(screen.getByTestId("grid-group-toggle-FIXED ASSETS")).toHaveTextContent("FIXED ASSETS · Asset");
    expect(screen.getByTestId("grid-group-toggle-CURRENT ASSETS")).toHaveTextContent("4");
    expect(screen.getByTestId(`grid-group-toggle-${NO_SECTION}`)).toHaveTextContent("No section yet");
  });

  it("shows AutoCount's special type, marks a heading, and indents what is under it", async () => {
    show();
    await ready();
    expect(within(row("200-2000")).getByText("SFA")).toBeInTheDocument();
    expect(within(row("200-2000")).getByText(/└ OFFICE EQUIPMENT/)).toBeInTheDocument();
    expect(within(row("310-0000")).getByText("Heading")).toBeInTheDocument();
    expect(within(row("310-0000")).getByText("CASH AT BANK")).toHaveClass("font-semibold");
    expect(within(row("300-0000")).queryByText("Heading")).toBeNull();
  });

  it("folds a heading and opens it again", async () => {
    show();
    await ready();
    fireEvent.click(screen.getByTestId("chart-fold-310-0000"));
    expect(codesOnScreen()).not.toContain("310-1000");
    expect(codesOnScreen()).toContain("310-0000");
    fireEvent.click(screen.getByTestId("chart-fold-310-0000"));
    expect(codesOnScreen()).toContain("310-1000");
  });

  it("shows a retired account only when asked, marked as retired", async () => {
    show();
    await ready();
    expect(codesOnScreen()).not.toContain("1230");
    fireEvent.click(screen.getByLabelText("Show retired accounts"));
    await waitFor(() => expect(codesOnScreen()).toContain("1230"));
    expect(within(row("1230")).getByText("Retired")).toBeInTheDocument();
  });
});

describe("Chart of accounts — edit and retire from the row (0656)", () => {
  it("the edit icon opens the account; Save is one call with its name, number, section and heading", async () => {
    show();
    await ready();
    fireEvent.click(screen.getByTestId("chart-edit-310-1000"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: " ALLIANCE BANK BERHAD " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(net.calls).toHaveLength(1));
    expect(net.calls[0]).toEqual({
      method: "PUT",
      path: "/api/finance/ledger/accounts/310-1000",
      body: { name: "ALLIANCE BANK BERHAD", code: "310-1000", section: "CURRENT ASSETS", under: "310-0000" },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("a row click opens the same window; Top of the section sends no heading", async () => {
    show();
    await ready();
    fireEvent.click(within(row("900-C004")).getByText(/COMMISSION - AGENT/));
    const dialog = await screen.findByRole("dialog");
    pick(dialog, /Under/, "Top of the section");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(net.calls).toHaveLength(1));
    expect(net.calls[0]!.body).toEqual({ name: "COMMISSION - AGENT", code: "900-C004", section: "EXPENSES", under: null });
  });

  it("offers only the sections of the account's kind, and a new section starts at its top", async () => {
    show();
    await ready();
    fireEvent.click(screen.getByTestId("chart-edit-300-0000"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(within(dialog).getByRole("combobox", { name: /Section/ }), { key: "Enter" });
    expect(screen.getByRole("option", { name: "FIXED ASSETS" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "EXPENSES" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "OTHER ASSETS" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(net.calls).toHaveLength(1));
    expect(net.calls[0]!.body).toMatchObject({ section: "OTHER ASSETS", under: null });
  });

  it("the retire icon asks first, then retires", async () => {
    show();
    await ready();
    fireEvent.click(screen.getByTestId("chart-retire-900-E001"));
    const dialog = await screen.findByRole("dialog", { name: "Retire account" });
    expect(net.calls).toHaveLength(0);
    fireEvent.click(within(dialog).getByTestId("account-retire-confirm"));
    await waitFor(() => expect(net.calls).toHaveLength(1));
    expect(net.calls[0]).toEqual({ method: "POST", path: "/api/finance/ledger/accounts/900-E001/active", body: { active: false } });
    await waitFor(() => expect(codesOnScreen()).not.toContain("900-E001"));
  });

  it("a used account stays: the database's sentence shows in the account's window", async () => {
    net.refuse = { message: "900-E001 ENTERTAINMENT has postings, so it stays. A used account is never retired.", tag: "gl_account_has_posted_history" };
    show();
    await ready();
    fireEvent.click(screen.getByTestId("chart-retire-900-E001"));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Retire account" })).getByTestId("account-retire-confirm"));
    expect(await screen.findByText("900-E001 ENTERTAINMENT has postings, so it stays. A used account is never retired.")).toBeInTheDocument();
    expect(screen.getByTestId("account-edit-form")).toBeInTheDocument();
  });

  it("brings a retired account back from its window", async () => {
    show();
    await ready();
    fireEvent.click(screen.getByLabelText("Show retired accounts"));
    await waitFor(() => expect(row("1230")).toBeTruthy());
    expect(screen.queryByTestId("chart-retire-1230")).toBeNull();
    fireEvent.click(screen.getByTestId("chart-edit-1230"));
    fireEvent.click(await screen.findByTestId("account-bring-back"));
    await waitFor(() => expect(net.calls).toHaveLength(1));
    expect(net.calls[0]).toEqual({ method: "POST", path: "/api/finance/ledger/accounts/1230/active", body: { active: true } });
  });
});

describe("Chart of accounts — Add account in a section (0656)", () => {
  it("asks for the section first, then offers that section's headings only", async () => {
    show();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Save: pick the section" })).toBeDisabled();
    pick(dialog, /Section/, "EXPENSES");
    fireEvent.keyDown(within(dialog).getByRole("combobox", { name: /Under/ }), { key: "Enter" });
    expect(screen.getByRole("option", { name: "900-C001 COMMISSION" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "410-0000 ACCRUALS" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "900-C001 COMMISSION" }));
    fireEvent.change(within(dialog).getByLabelText(/^Number/), { target: { value: "900-c010" } });
    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: "COMMISSION - EVENTS" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(net.calls).toHaveLength(1));
    expect(net.calls[0]).toEqual({
      method: "POST",
      path: "/api/finance/ledger/accounts/in-section",
      body: { section: "EXPENSES", parentCode: "900-C001", code: "900-C010", name: "COMMISSION - EVENTS", isHeading: false },
    });
    await waitFor(() => expect(codesOnScreen()).toContain("900-C010"));
  });

  it("never offers the bank and cash heading: those accounts are added in Money accounts", async () => {
    show();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    const dialog = await screen.findByRole("dialog");
    pick(dialog, /Section/, "CURRENT ASSETS");
    fireEvent.keyDown(within(dialog).getByRole("combobox", { name: /Under/ }), { key: "Enter" });
    expect(screen.getByRole("option", { name: "Top of the section" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "310-0000 CASH AT BANK" })).toBeNull();
  });

  it("a disabled Save names the first gap", () => {
    const f = { section: "EXPENSES", code: "900-C010", name: "COMMISSION - EVENTS", isHeading: false };
    expect(accountSaveGap({ ...f, section: undefined })).toBe("Save: pick the section");
    expect(accountSaveGap({ ...f, code: " " })).toBe("Save: type the number");
    expect(accountSaveGap({ ...f, name: "" })).toBe("Save: type the name");
    expect(accountSaveGap({ ...f, isHeading: true, code: "" })).toBe("Save: type the heading number");
    expect(accountSaveGap(f)).toBeNull();
  });
});

describe("chartBySection", () => {
  it("puts a top account with no known section under No section yet, after every section", () => {
    const rows = chartBySection(
      CHART.map((a) => ({ ...a })) as never,
      SECTIONS,
      { showRetired: true, folded: new Set() },
    );
    expect(rows.filter((r) => r.group === NO_SECTION).map((r) => r.account.code)).toEqual(["1230", "405-0000"]);
    expect(rows.at(-1)!.group).toBe(NO_SECTION);
  });
});
