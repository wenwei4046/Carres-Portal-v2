import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FinanceSettings from "./FinanceSettings";

type Code = { code: string };
const net = vi.hoisted(() => ({
  rows: [] as Array<{ code: string }>,
  routes: [] as Array<{ holding_code: string; channel: string; bank_code: string }>,
  chart: [] as Array<{ code: string; parent_code: string | null }>,
  failList: false,
  refuse: null as string | null,
  /** One write refused: its key, the sentence, and the door's tag (sent up as `code`). */
  refuseOn: null as { key: string; message: string; tag?: string } | null,
  calls: [] as Array<{ key: string; body: unknown }>,
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path.replace("/api/finance/ledger/money-accounts", "") || "/"}`;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    net.calls.push({ key, body });
    if (key === "GET /api/finance/ledger/accounts") return { go_live_on: "2026-09-10", accounts: net.chart };
    if (key === "GET /") {
      if (net.failList) throw new Error("boom");
      return net.rows;
    }
    if (key === "GET /card-routes") return net.routes;
    if (net.refuse) throw new Error(net.refuse);
    if (net.refuseOn?.key === key) {
      throw Object.assign(new Error(net.refuseOn.message), { body: { code: net.refuseOn.tag, message: net.refuseOn.message } });
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
    return { code: "1125" };
  }),
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));

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
    expect(screen.getByText("Online payment")).toBeInTheDocument();
    expect(screen.getAllByText("Bank transfer")).toHaveLength(2);
    expect(screen.getByText("Not active")).toBeInTheDocument();
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

  it("adds a holding account when the kind is Online payment", async () => {
    show();
    await screen.findByText("Public Bank");
    fireEvent.click(screen.getByRole("button", { name: "Add a money account" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: "Stripe" } });
    fireEvent.keyDown(within(dialog).getByRole("combobox", { name: /Kind/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Online payment" }));
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
    expect(await screen.findByText("1121 Public Bank")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Money accounts" }), { button: 0, ctrlKey: false });

    const dialog = await openPublicBank();
    expect(numberField(dialog)).toHaveValue("1121");
    fireEvent.change(numberField(dialog), { target: { value: " 310-a000 " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // One write, the Chart of accounts form's own request; the letter goes up in capitals.
    expect(writes()).toEqual([{ key: CHART_DOOR, body: { name: "Public Bank", code: "310-A000" } }]);

    expect(await screen.findByText("310-A000")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("card-route-1131-dealer")).toHaveTextContent("1131 · GHL · Dealer → 310-A000 · Public Bank"),
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Chart of accounts" }), { button: 0, ctrlKey: false });
    expect(await screen.findByText("310-A000 Public Bank")).toBeInTheDocument();
    expect(screen.queryByText("1121 Public Bank")).not.toBeInTheDocument();
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
    // A blank number cannot be sent at all.
    fireEvent.change(numberField(dialog), { target: { value: "  " } });
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("the same number keeps the money account's own save, and never calls the chart's door", async () => {
    show();
    const dialog = await openPublicBank();
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: "Public Bank Berhad" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ key: "PATCH /1121", body: { name: "Public Bank Berhad", is_active: true } });
  });

  it("a new name and a new number: the money account's save first, at the old number, then the chart's door", async () => {
    show();
    const dialog = await openPublicBank();
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: "Public Bank Berhad" } });
    fireEvent.change(numberField(dialog), { target: { value: "310-2000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes()).toEqual([
      { key: "PATCH /1121", body: { name: "Public Bank Berhad", is_active: true } },
      { key: CHART_DOOR, body: { name: "Public Bank Berhad", code: "310-2000" } },
    ]);
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
  it("shows each route and saves a new bank for it", async () => {
    show();
    const row = await screen.findByTestId("card-route-1131-dealer");
    expect(row).toHaveTextContent("1131 · GHL · Dealer → 1121 · Public Bank");
    fireEvent.click(row);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ key: "POST /card-routes", body: { holding_code: "1131", channel: "dealer", bank_code: "1121" } });
  });
});

describe("Finance Settings — the chart of accounts", () => {
  it("lists the chart as a tree, headings in bold, and renames an account by its code", async () => {
    show("/finance/settings?tab=chart");
    const accrued = await screen.findByText("2130 Accrued expenses");
    expect(screen.getByText("2000 Liabilities")).toHaveClass("font-semibold");
    expect(accrued).not.toHaveClass("font-semibold");
    fireEvent.click(accrued);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: " Accruals " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ key: "PATCH /api/finance/ledger/accounts/2130", body: { name: "Accruals" } });
  });
});
