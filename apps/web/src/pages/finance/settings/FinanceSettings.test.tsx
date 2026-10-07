import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FinanceSettings from "./FinanceSettings";

type Code = { code: string };
const net = vi.hoisted(() => ({
  rows: [] as Array<{ code: string }>,
  routes: [] as Array<{ holding_code: string; channel: string; bank_code: string }>,
  chart: [] as Array<{ code: string; parent_code: string | null; kind: string; section?: string }>,
  failList: false,
  refuse: null as string | null,
  /** One write refused: its key, the sentence, and the door's tag (sent up as `code`). */
  refuseOn: null as { key: string; message: string; tag?: string } | null,
  calls: [] as Array<{ key: string; body: unknown }>,
  closed: null as string | null,
  role: "finance",
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path.replace("/api/finance/ledger/money-accounts", "") || "/"}`;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    net.calls.push({ key, body });
    if (key === "GET /api/finance/ledger/accounts") {
      return { go_live_on: "2026-09-10", accounts: net.chart, sections: [{ section: "CURRENT LIABILITIES", kind: "LIABILITY", sort_order: 60 }] };
    }
    if (key === "GET /") {
      if (net.failList) throw new Error("boom");
      return net.rows;
    }
    if (key === "GET /card-routes") return net.routes;
    if (key === "GET /api/finance/ledger/books-closed") return { closedThrough: net.closed };
    if (net.refuse) throw new Error(net.refuse);
    if (net.refuseOn?.key === key) {
      throw Object.assign(new Error(net.refuseOn.message), { body: { code: net.refuseOn.tag, message: net.refuseOn.message } });
    }
    if (key === "PUT /api/finance/ledger/books-closed") {
      net.closed = body.closedThrough;
      return body;
    }
    // The chart's door renumbers: like the database's cascade, every list
    // that names the old number reads the new one from here on.
    const renumbered = /^PATCH \/api\/finance\/ledger\/accounts\/(.+)$/.exec(key);
    if (renumbered && body?.code) {
      const from = renumbered[1]!;
      const to = body.code as string;
      const move = <T extends Code>(r: T): T => (r.code === from ? { ...r, code: to } : r);
      net.rows = net.rows.map(move);
      net.chart = net.chart.map((a) => ({ ...move(a), parent_code: a.parent_code === from ? to : a.parent_code }));
      net.routes = net.routes.map((r) => ({
        ...r,
        holding_code: r.holding_code === from ? to : r.holding_code,
        bank_code: r.bank_code === from ? to : r.bank_code,
      }));
      return { code: to };
    }
    // The chart's add door: like the database, the new row is in the next read.
    if (key === "POST /api/finance/ledger/accounts") {
      const kind = body.kind ?? net.chart.find((a) => a.code === body.parentCode)?.kind;
      net.chart = [...net.chart, acc(body.code, body.name, body.parentCode, body.isHeading === true, kind)];
      return { code: body.code };
    }
    return { code: "1125" };
  }),
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: { role: string }) => unknown) => sel({ role: net.role }),
}));

const ROWS = [
  { code: "1110", name: "Cash on hand", money_kind: "CASH", is_active: true },
  { code: "1121", name: "Public Bank", money_kind: "BANK", is_active: true },
  { code: "1124", name: "RHB", money_kind: "BANK", is_active: false },
  { code: "1131", name: "GHL", money_kind: "HOLDING", is_active: true },
];

const acc = (code: string, name: string, parent_code: string | null, is_header = false, kind = "LIABILITY") => ({
  code, name, kind, parent_code, is_control: false, control_for: null, is_active: true, is_header,
});
const CHART = [
  acc("2130", "Accrued expenses", "2100"),
  acc("2000", "Liabilities", null, true),
  acc("2100", "Payables", "2000", true),
  acc("1100", "Bank and cash", null, true, "ASSET"),
  acc("1121", "Public Bank", "1100", false, "ASSET"),
];

beforeEach(() => {
  net.rows = ROWS;
  net.routes = [{ holding_code: "1131", channel: "dealer", bank_code: "1121" }];
  net.chart = CHART;
  net.failList = false;
  net.refuse = null;
  net.refuseOn = null;
  net.calls = [];
  net.closed = null;
  net.role = "finance";
  localStorage.clear();
});

function show(path = "/finance/settings") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <FinanceSettings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const writes = () => net.calls.filter((c) => !c.key.startsWith("GET"));

describe("Finance Settings — the money accounts", () => {
  it("lists every money account with its kind and whether it is in use", async () => {
    show();
    expect(screen.getByTestId("finance-settings-destination-header")).toHaveTextContent("Finance Settings");
    await screen.findByText("Public Bank");
    expect(screen.getByText("Card and online holding")).toBeInTheDocument();
    expect(screen.getAllByText("Bank account")).toHaveLength(2);
    expect(screen.getByText("Not active")).toBeInTheDocument();
    /* The kind has its own word, not a pay method's (YH, 1 Oct 2026). */
    expect(screen.queryByText("Online payment")).not.toBeInTheDocument();
    expect(screen.queryByText("Bank transfer")).not.toBeInTheDocument();
  });

  it("adds a bank: the name and the kind, never a code", async () => {
    show();
    await screen.findByText("Public Bank");
    fireEvent.click(screen.getByRole("button", { name: "Add a money account" }));
    const dialog = await screen.findByRole("dialog");
    const save = within(dialog).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: " CIMB " } });
    fireEvent.click(save);
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ key: "POST /", body: { name: "CIMB", kind: "BANK" } });
  });

  it("adds a holding account when the kind is Card and online holding", async () => {
    show();
    await screen.findByText("Public Bank");
    fireEvent.click(screen.getByRole("button", { name: "Add a money account" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: "Stripe" } });
    fireEvent.keyDown(within(dialog).getByRole("combobox", { name: /Kind/ }), { key: "Enter" });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Bank account", "Card and online holding"]);
    fireEvent.click(await screen.findByRole("option", { name: "Card and online holding" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ key: "POST /", body: { name: "Stripe", kind: "HOLDING" } });
  });

  it("takes an account out of use, and shows the database's refusal when it still holds money", async () => {
    net.refuse = "1121 Public Bank is not at RM 0.00 in the ledger. It stays in use until it is.";
    show();
    fireEvent.click(await screen.findByText("Public Bank"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Active" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ key: "PATCH /1121", body: { name: "Public Bank", is_active: false } });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("is not at RM 0.00");
  });

  it("a list that could not be read says so, never an empty list", async () => {
    net.failList = true;
    show();
    expect(await screen.findByText("The accounts could not be loaded. Try again.")).toBeInTheDocument();
  });
});

describe("Finance Settings — a money account's number, changed on its own form (24 Sep)", () => {
  const CHART_DOOR = "PATCH /api/finance/ledger/accounts/1121";
  const openPublicBank = async () => {
    fireEvent.click(await screen.findByText("Public Bank"));
    return screen.findByRole("dialog");
  };
  const numberField = (dialog: HTMLElement) => within(dialog).getByRole("textbox", { name: /Number/ });

  it("renumbers through the chart's own door, and the list, the payout banks and the chart read the new number", async () => {
    // The chart is read first and kept, so only a refresh after the save can
    // put the new number on it.
    show("/finance/settings?tab=chart");
    const chartRow = (code: string) => document.querySelector(`tr[data-row-key="${code}"]`);
    await waitFor(() => expect(chartRow("1121")).toHaveTextContent("Public Bank"));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Money accounts" }), { button: 0, ctrlKey: false });

    const dialog = await openPublicBank();
    expect(numberField(dialog)).toHaveValue("1121");
    fireEvent.change(numberField(dialog), { target: { value: " 310-a000 " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // One write, the Chart of accounts form's own request; the letter goes up in capitals.
    expect(writes()).toEqual([{ key: CHART_DOOR, body: { name: "Public Bank", code: "310-A000" } }]);

    expect(await screen.findByText("310-A000")).toBeInTheDocument();
    // The payout banks live on their own tab.
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Card payout banks" }), { button: 0, ctrlKey: false });
    await waitFor(() =>
      expect(screen.getByTestId("card-route-1131-dealer")).toHaveTextContent("1131 · GHL · Dealer → 310-A000 · Public Bank"),
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Chart of accounts" }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(chartRow("310-A000")).toHaveTextContent("Public Bank"));
    expect(chartRow("1121")).toBeNull();
  });

  it("a number another account has: the database's sentence under the Number field, and the form stays open", async () => {
    net.refuseOn = { key: CHART_DOOR, message: "An account numbered 1122 is already in the chart.", tag: "code_exists" };
    show();
    const dialog = await openPublicBank();
    fireEvent.change(numberField(dialog), { target: { value: "1122" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(numberField(dialog)).toHaveAccessibleDescription("An account numbered 1122 is already in the chart."));
    expect(numberField(dialog)).toHaveAttribute("aria-invalid", "true");
    expect(writes()).toEqual([{ key: CHART_DOOR, body: { name: "Public Bank", code: "1122" } }]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("not Finance: the database's sentence under the Number field", async () => {
    net.refuseOn = { key: CHART_DOOR, message: "Only Finance changes the chart of accounts.", tag: "not_finance" };
    show();
    const dialog = await openPublicBank();
    fireEvent.change(numberField(dialog), { target: { value: "310-2000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(numberField(dialog)).toHaveAccessibleDescription("Only Finance changes the chart of accounts."));
  });

  it("a number of the wrong shape is refused under the field before anything is sent", async () => {
    show();
    const dialog = await openPublicBank();
    fireEvent.change(numberField(dialog), { target: { value: "99" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(numberField(dialog)).toHaveAccessibleDescription(
      "A number is four digits, like 1210, or AutoCount's form, like 100-0001 or 900-A001.",
    );
    expect(writes()).toEqual([]);
  });

  it("a blank number keeps the account's own number: Save stays on and only the name is saved", async () => {
    show();
    const dialog = await openPublicBank();
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: "Public Bank Berhad" } });
    fireEvent.change(numberField(dialog), { target: { value: "  " } });
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes()).toEqual([{ key: "PATCH /1121", body: { name: "Public Bank Berhad", is_active: true } }]);
  });

  it("the same number keeps the money account's own save, and never calls the chart's door", async () => {
    show();
    const dialog = await openPublicBank();
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: "Public Bank Berhad" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ key: "PATCH /1121", body: { name: "Public Bank Berhad", is_active: true } });
  });

  it("a new name and a new number: one request to the chart's door, which saves both in one go", async () => {
    show();
    const dialog = await openPublicBank();
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: "Public Bank Berhad" } });
    fireEvent.change(numberField(dialog), { target: { value: "310-2000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes()).toEqual([{ key: CHART_DOOR, body: { name: "Public Bank Berhad", code: "310-2000" } }]);
  });

  it("a name the chart already has: refused at the foot, and nothing is saved", async () => {
    net.refuseOn = { key: CHART_DOOR, message: "An account named Accrued expenses is already in the chart.", tag: "name_exists" };
    show();
    const dialog = await openPublicBank();
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: "Accrued expenses" } });
    fireEvent.change(numberField(dialog), { target: { value: "310-2000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("An account named Accrued expenses is already in the chart.");
    // The money account's own door, which checks names only against other
    // money accounts, is never asked, so the clashing name is not saved.
    expect(writes()).toEqual([{ key: CHART_DOOR, body: { name: "Accrued expenses", code: "310-2000" } }]);
    expect(numberField(dialog)).not.toHaveAttribute("aria-invalid");
  });

  it("Active changed with a new name and number: Active is saved under the old name first, then the chart's door takes the name and number", async () => {
    net.rows = ROWS.map((r) => (r.code === "1121" ? { ...r, is_active: false } : r));
    show();
    const dialog = await openPublicBank();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Active" }));
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: "Public Bank Berhad" } });
    fireEvent.change(numberField(dialog), { target: { value: "310-2000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes()).toEqual([
      { key: "PATCH /1121", body: { name: "Public Bank", is_active: true } },
      { key: CHART_DOOR, body: { name: "Public Bank Berhad", code: "310-2000" } },
    ]);
  });

  it("a refusal that is not about the number goes to the foot, never under the Number field", async () => {
    net.refuseOn = { key: CHART_DOOR, message: "That account is not in the chart.", tag: "account_missing" };
    show();
    const dialog = await openPublicBank();
    fireEvent.change(numberField(dialog), { target: { value: "310-2000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("That account is not in the chart.");
    expect(numberField(dialog)).not.toHaveAttribute("aria-invalid");
    expect(numberField(dialog)).not.toHaveAccessibleDescription("That account is not in the chart.");

    net.refuseOn = { key: CHART_DOOR, message: "Internal Server Error" };
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Internal Server Error");
    expect(numberField(dialog)).not.toHaveAttribute("aria-invalid");
  });

  it("out of use refused while money is in it: the number is not touched", async () => {
    net.refuseOn = { key: "PATCH /1121", message: "1121 Public Bank is not at RM 0.00 in the ledger. It stays in use until it is." };
    show();
    const dialog = await openPublicBank();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Active" }));
    fireEvent.change(numberField(dialog), { target: { value: "310-2000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("is not at RM 0.00");
    expect(writes()).toEqual([{ key: "PATCH /1121", body: { name: "Public Bank", is_active: false } }]);
    expect(numberField(dialog)).not.toHaveAttribute("aria-invalid");
  });
});

describe("Finance Settings — card payout banks (0541)", () => {
  it("is its own tab, not a block under the money accounts", async () => {
    show();
    await screen.findByText("Public Bank");
    expect(screen.queryByTestId("card-routes")).not.toBeInTheDocument();
    /* Radix Tabs picks up a tab on mouseDown, not click (kit-behaviour.test). */
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Card payout banks" }), { button: 0, ctrlKey: false });
    expect(await screen.findByTestId("card-routes")).toBeInTheDocument();
  });

  it("says what happens to a card account that is not listed", async () => {
    show("/finance/settings?tab=card");
    expect(
      await screen.findByText(/not listed here fills in no bank\. Whoever records the card payout chooses it\./),
    ).toBeInTheDocument();
  });

  it("shows each route and saves a new bank for it", async () => {
    show("/finance/settings?tab=card");
    const row = await screen.findByTestId("card-route-1131-dealer");
    expect(row).toHaveTextContent("1131 · GHL · Dealer → 1121 · Public Bank");
    fireEvent.click(row);
    const dialog = await screen.findByRole("dialog");
    /* The holding side wears the kind's word, not "Card account". */
    expect(within(dialog).getByRole("combobox", { name: /Card and online holding/ })).toBeInTheDocument();
    expect(within(dialog).queryByText("Card account")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ key: "POST /card-routes", body: { holding_code: "1131", channel: "dealer", bank_code: "1121" } });
  });
});

describe("Finance Settings — the chart of accounts", () => {
  /* The chart screen itself is ChartOfAccounts.test.tsx. Here: the tab opens
     it, grouped by AutoCount's section (0656), and a row opens the account. */
  it("opens the chart grouped by section, and a row click opens the account", async () => {
    net.chart = [
      acc("2000", "Liabilities", null, true),
      { ...acc("2100", "Payables", "2000", true), section: "CURRENT LIABILITIES" },
      { ...acc("2130", "Accrued expenses", "2100"), section: "CURRENT LIABILITIES" },
    ];
    show("/finance/settings?tab=chart");
    const accrued = await screen.findByText(/Accrued expenses/);
    expect(screen.getByTestId("grid-group-toggle-CURRENT LIABILITIES")).toHaveTextContent("CURRENT LIABILITIES · Liability");
    expect(screen.queryByText("Liabilities")).toBeNull();
    fireEvent.click(accrued);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue("Accrued expenses");
  });
});

/** Open the calendar and pick the chosen day again, which clears it
 *  (react-day-picker single mode). The trigger's name is its label. */
function clearTheDay(trigger: HTMLElement) {
  fireEvent.click(trigger);
  const cell = screen.getAllByRole("gridcell").find((c) => c.getAttribute("aria-selected") === "true");
  fireEvent.click(cell!.querySelector("button") ?? cell!);
}

describe("Finance Settings — closed months (0622)", () => {
  it("is its own tab and says when no month is closed", async () => {
    show();
    await screen.findByText("Public Bank");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Closed months" }), { button: 0, ctrlKey: false });
    expect(await screen.findByText("No month is closed")).toBeInTheDocument();
  });

  it("finance reads the closed day and has no field to change it", async () => {
    net.closed = "2026-08-31";
    show("/finance/settings?tab=closed");
    expect(await screen.findByText(/^Books closed up to Mon, 31 Aug/)).toBeInTheDocument();
    expect(screen.getByText("The ledger takes nothing dated on or before this day.")).toBeInTheDocument();
    expect(screen.getByText("Only the principal can change this.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("the principal gets the field, and Save waits for a different day", async () => {
    net.role = "principal";
    net.closed = "2026-08-31";
    show("/finance/settings?tab=closed");
    await screen.findByText(/^Books closed up to/);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByText("Only the principal can change this.")).not.toBeInTheDocument();
  });

  it("the principal clears the day and saves: every month reopens", async () => {
    net.role = "principal";
    net.closed = "2026-08-31";
    show("/finance/settings?tab=closed");
    clearTheDay(await screen.findByRole("button", { name: "Close up to" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toEqual([{ key: "PUT /api/finance/ledger/books-closed", body: { closedThrough: null } }]));
    expect(await screen.findByText("No month is closed")).toBeInTheDocument();
  });

  it("a refusal from the database is shown as its sentence", async () => {
    net.role = "principal";
    net.closed = "2026-08-31";
    net.refuseOn = { key: "PUT /api/finance/ledger/books-closed", message: "Choose a day that has ended. 30 Sep 2026 has not ended yet.", tag: "books_closed_not_ended" };
    show("/finance/settings?tab=closed");
    clearTheDay(await screen.findByRole("button", { name: "Close up to" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Choose a day that has ended. 30 Sep 2026 has not ended yet.")).toBeInTheDocument();
  });
});
