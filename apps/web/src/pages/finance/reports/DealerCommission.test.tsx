/**
 * The report draws through the Register shell — the shape every other Finance
 * register has (ListPageShell + the register DataGrid). The footer note and the
 * engine's `N of M rows` only exist on that path, so asserting them is what
 * fails if the page goes back to hand-rolled chrome.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DcKpiRulesRead, DcPaymentChoice, DcRulesRead, DcSource, DcStatementSource } from "@carres/shared/dealer-commission";
import { fmtDate, fmtMonth } from "@/lib/fmt-date";
import DealerCommission from "./DealerCommission";

const net = vi.hoisted(() => ({
  routes: {} as Record<string, unknown>,
  calls: [] as string[],
  bodies: {} as Record<string, unknown>,
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    net.calls.push(key);
    if (init?.body) net.bodies[key] = JSON.parse(String(init.body));
    if (key in net.routes) return net.routes[key];
    throw new Error(`unmocked ${key}`);
  }),
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));

const now = new Date();
const MONTH = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const before = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const PREV = `${before.getFullYear()}-${String(before.getMonth() + 1).padStart(2, "0")}`;

/**
 * SO-2054: RM600 paid on a RM1,000 order at a 20% line rate this month (more
 * than half): RM120 earned, RM80 still to collect. SO-2050: paid RM600 last
 * month, cancelled this month: it keeps last month's commission, has nothing
 * still to collect, and shows under `Cancelled this month`.
 */
const SOURCE: DcSource = {
  settings: { defaultRate: 25 },
  rates: [],
  quotas: [],
  models: [{ id: "m1", name: "Sofa" }],
  dealers: [{ id: "d1", name: "Ace Furniture" }],
  outlets: [{ id: "o1", name: "Ace KL", dealerId: "d1" }],
  orders: [
    {
      orderId: "ord1", so: 2054, dealerId: "d1", outletId: "o1", addons: 0, orderedOn: `${MONTH}-02`,
      customer: "Probe Customer One",
      lines: [{ modelId: "m1", category: "sofa", value: 1000, rate: 20, qty: 1 }],
      payments: [{ paidOn: `${MONTH}-05`, amount: 600 }],
    },
    {
      orderId: "ord2", so: 2050, dealerId: "d1", outletId: "o1", addons: 0, orderedOn: `${PREV}-03`,
      customer: "Probe Customer Two", cancelledOn: `${MONTH}-04`,
      lines: [{ modelId: "m1", category: "sofa", value: 1000, rate: 20, qty: 1 }],
      payments: [{ paidOn: `${PREV}-05`, amount: 600 }],
    },
  ],
};

/**
 * 0664: Ace Furniture's statement. Last month SO-2050 earned RM120 (due the
 * 15th of this month); RM100 was paid on the 3rd; this month so far SO-2054
 * earned RM120. Carres owes RM140 now; SO-2054's RM80 is still to come.
 */
const STATEMENT: DcStatementSource = {
  today: `${MONTH}-08`,
  dealer: { id: "d1", name: "Ace Furniture" },
  orders: SOURCE.orders,
  quotas: [],
  payments: [{ id: "pay1", voucherId: "v1", voucherNo: "PV-0001", paidOn: `${MONTH}-03`, amount: 100 }],
};
const CHOICES: DcPaymentChoice[] = [
  { id: "00000000-0000-4000-8000-0000000000a2", voucherNo: "PV-0002", voucherDate: `${MONTH}-07`, payee: "Ace Furniture", amount: 40, narration: null },
];
const DC = "/api/finance/dealer-commission";

const RULES_URL = "/api/finance/dealer-commission/rules";
const rule = (over: Partial<DcRulesRead["rules"][number]>): DcRulesRead["rules"][number] => ({
  id: "r", kind: "standard", dealerId: null, dealerName: null, modelId: null, modelName: null,
  category: null, rate: 25, isOn: null, startsOn: null, memo: null,
  createdAt: "2026-10-08T01:00:00Z", createdBy: null, state: "in_use", ...over,
});
const RULES: DcRulesRead = {
  today: "2026-10-08",
  rules: [
    rule({ id: "r-std", memo: "The rate before rates had a start date" }),
    rule({ id: "r-std2", rate: 22, startsOn: "2026-12-01", memo: "Memo 1 Dec", createdBy: "Chew", state: "later" }),
    rule({ id: "r-prod", kind: "product", modelId: "m1", modelName: "Sofa One", rate: 20, startsOn: "2026-10-01" }),
    rule({ id: "r-acc", kind: "category", category: "accessory", rate: null, isOn: true, memo: "Accessories earn commission" }),
  ],
  dealers: [{ id: "d1", name: "Ace Furniture" }],
  models: [{ id: "m1", name: "Sofa One", category: "sofa" }, { id: "m2", name: "Mattress One", category: "mattress" }],
  categories: ["mattress", "bedframe", "sofa", "accessory"],
};

beforeEach(() => {
  net.routes = {
    [`GET /api/finance/dealer-commission?month=${MONTH}`]: SOURCE,
    [`GET ${RULES_URL}`]: RULES,
    [`POST ${RULES_URL}`]: { id: "new" },
    [`DELETE ${RULES_URL}/r-prod`]: { id: "r-prod", already: false },
    [`PUT /api/finance/dealer-commission/orders/ord2/take-back`]: { orderId: "ord2", takenBackOn: `${MONTH}-08`, already: false },
    [`GET /api/finance/dealer-commission?month=${PREV}`]: SOURCE,
    [`GET ${DC}/statement/d1`]: STATEMENT,
    [`GET ${DC}/payment-choices`]: CHOICES,
    [`POST ${DC}/payments`]: { id: "pay2", already: false },
    [`DELETE ${DC}/payments/pay1`]: { id: "pay1", already: false },
  };
  net.calls = [];
  net.bodies = {};
  localStorage.clear();
});

function renderAt(url = "/") {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}><DealerCommission /></MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The kit Select: open with Enter, pick by the option's words. A required
 *  field's name ends in its asterisk. */
function pick(name: string, option: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: new RegExp(`^${name}`) }), { key: "Enter" });
  fireEvent.click(screen.getByRole("option", { name: option }));
}

describe("Dealer commission", () => {
  it("reports the month through the Register shell", async () => {
    renderAt();

    await screen.findByText("Ace Furniture");
    // The row and the totals row under it.
    expect(screen.getAllByText("RM 120.00")).toHaveLength(2);
    expect(screen.getAllByText("RM 80.00")).toHaveLength(2);
    expect(screen.getByTestId("footer-totals")).toHaveTextContent("RM 120.00");
    // The register's own 32px footer carries the count and the note.
    expect(screen.getByTestId("dealer-commission-summary")).toHaveTextContent(
      "1 of 1 rows · Commission is earned only on money collected.",
    );
    // The scope sits in the register's toolbar, so it is inside the grid frame.
    expect(screen.getByTestId("grid-footer")).toBeTruthy();
    expect(screen.getByText("Showroom")).toBeTruthy();
    // The settings live on their own views: none of them under the report.
    expect(screen.getByTestId("dealer-commission-switch")).toBeTruthy();
    expect(screen.queryByTestId("commission-rates-page")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Renovation quotas" })).toBeNull();
  });

  it("a dealer's row opens its orders for the same month, in their groups", async () => {
    renderAt();
    await screen.findByText("Ace Furniture");
    fireEvent.click(screen.getByText("Ace Furniture"));
    expect(await screen.findByText("SO-2054")).toBeTruthy();
    expect(screen.getByText("New orders this month")).toBeTruthy();
    expect(screen.getByText("Cancelled this month")).toBeTruthy();
    expect(screen.getByText("SO-2050")).toBeTruthy();
    expect(screen.getByText("Probe Customer One")).toBeTruthy();
    // Paid more than half: the note says the balance is still to come.
    expect(screen.getByText("Waiting for the balance")).toBeTruthy();
    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.getByTestId("commission-orders-summary")).toHaveTextContent(
      "2 of 2 orders · What earns nothing is paid first. Nothing is earned before half the order is paid.",
    );
    // The month's commission adds up to the dealer's.
    expect(screen.getByTestId("footer-totals")).toHaveTextContent("RM 120.00");
  });

  it("an order's window says how its commission is made up", async () => {
    renderAt("/?view=orders");
    fireEvent.click(await screen.findByText("SO-2054"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Probe Customer One · Ace Furniture");
    expect(dialog).toHaveTextContent("Order total: RM 1,000.00");
    expect(dialog).toHaveTextContent("Earns nothing, paid first: RM 0.00");
    expect(dialog).toHaveTextContent("Commission in full: RM 200.00");
    expect(dialog).toHaveTextContent("Commission this month: RM 120.00");
    expect(dialog).toHaveTextContent("Still to earn: RM 80.00");
    // Not cancelled: nothing to take back.
    expect(within(dialog).queryByRole("button", { name: "Take commission back" })).toBeNull();
  });

  it("a cancelled order's commission is taken back from its window", async () => {
    renderAt("/?view=orders");
    fireEvent.click(await screen.findByText("SO-2050"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("What it earned on money Carres kept stays. Taking it back counts in the month you do it.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Take commission back" }));
    await waitFor(() => expect(net.calls).toContain("PUT /api/finance/dealer-commission/orders/ord2/take-back"));
    expect(net.bodies["PUT /api/finance/dealer-commission/orders/ord2/take-back"]).toEqual({ takeBack: true });
  });

  it("shows one settings view at a time", async () => {
    renderAt("/?view=rates");
    await screen.findByTestId("commission-rates-page");
    expect(screen.queryByRole("heading", { name: "Renovation quotas" })).toBeNull();
    expect(screen.queryByTestId("dealer-commission-summary")).toBeNull();
    expect(screen.getByTestId("dealer-commission-switch")).toBeTruthy();
    cleanup();

    renderAt("/?view=quotas");
    await screen.findByRole("heading", { name: "Renovation quotas" });
    expect(screen.queryByTestId("commission-rates-page")).toBeNull();
  });

  it("opens the quota form on the quotas view for the dealer whose Quota left reads No quota", async () => {
    renderAt();

    await screen.findByText("Ace Furniture");
    // Rebate this month stays plain words; only Quota left is the way in.
    fireEvent.click(screen.getByRole("button", { name: "No quota" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Renovation quota");
    expect(dialog).toHaveTextContent("Ace Furniture");
    // The page moved to the quotas view underneath the form (hidden while the form is open).
    expect(screen.getByRole("heading", { name: "Renovation quotas", hidden: true })).toBeTruthy();
    expect(screen.queryByTestId("dealer-commission-summary")).toBeNull();
  });
});

describe("Commission rates (0661)", () => {
  it("lists every rate from its day, in five groups, the empty ones named", async () => {
    renderAt("/?view=rates");
    const page = await screen.findByTestId("commission-rates-page");
    await within(page).findByText("Sofa One");
    for (const g of ["Standard rate", "Dealer rates", "Product rates", "Promotion items", "Kinds of product"]) {
      expect(within(page).getByText(g)).toBeTruthy();
    }
    expect(within(page).getByText("No dealer has its own rate")).toBeTruthy();
    expect(within(page).getByText("No promotion item")).toBeTruthy();
    // The standard rate from the start, and the one that starts later.
    expect(within(page).getAllByText("Every product")).toHaveLength(2);
    expect(within(page).getAllByText("From the start").length).toBeGreaterThan(0);
    expect(within(page).getByText("22%")).toBeTruthy();
    expect(within(page).getByText("Starts later")).toBeTruthy();
    // A switch reads as words, a kind by its name.
    expect(within(page).getByText("Accessory")).toBeTruthy();
    expect(within(page).getByText("Earns commission")).toBeTruthy();
    expect(screen.getByTestId("commission-rates-summary")).toHaveTextContent(
      "4 of 4 rows · An order takes the rates in force on its order day.",
    );
  });

  it("adds a product's rate from a day; Save names what is missing until then", async () => {
    renderAt("/?view=rates");
    await screen.findByText("Sofa One");
    fireEvent.click(screen.getByRole("button", { name: "Add a rate" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Save: pick what the rate is for" })).toBeDisabled();

    pick("For", "A product's rate");
    expect(within(dialog).getByRole("button", { name: "Save: pick the product" })).toBeDisabled();
    pick("Product", "Mattress One · Mattress");
    expect(within(dialog).getByRole("button", { name: "Save: type the rate" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Rate (%)", { exact: false }), { target: { value: "20" } });
    expect(within(dialog).getByRole("button", { name: "Save: pick the day it starts" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: /Starts on/ }));
    fireEvent.click(screen.getByText("15"));
    fireEvent.change(within(dialog).getByLabelText("Memo", { exact: false }), { target: { value: "Memo 22 Jul §12" } });

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(net.calls).toContain(`POST ${RULES_URL}`));
    expect(net.bodies[`POST ${RULES_URL}`]).toEqual({
      kind: "product", modelId: "m2", rate: 20, startsOn: `${MONTH}-15`, memo: "Memo 22 Jul §12",
    });
  });

  it("a promotion item takes its points off, five unless changed", async () => {
    renderAt("/?view=rates");
    await screen.findByText("Sofa One");
    fireEvent.click(screen.getByRole("button", { name: "Add a rate" }));
    const dialog = await screen.findByRole("dialog");
    pick("For", "A promotion item");
    pick("Product", "Sofa One · Sofa");
    expect(within(dialog).getByLabelText("Points off", { exact: false })).toHaveValue(5);
    fireEvent.click(within(dialog).getByRole("button", { name: /Starts on/ }));
    fireEvent.click(screen.getByText("15"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(net.calls).toContain(`POST ${RULES_URL}`));
    expect(net.bodies[`POST ${RULES_URL}`]).toEqual({
      kind: "promotion", modelId: "m1", isOn: true, points: 5, startsOn: `${MONTH}-15`, memo: null,
    });
  });

  it("removes a rate added from a day; a rate from the start stays", async () => {
    renderAt("/?view=rates");
    await screen.findByText("Sofa One");
    fireEvent.click(screen.getByText("Sofa One"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Removing it gives the orders from");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(net.calls).toContain(`DELETE ${RULES_URL}/r-prod`));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByText("Accessory"));
    const start = await screen.findByRole("dialog");
    expect(start).toHaveTextContent("A rate from the start stays. Add a new one from a day instead.");
    expect(within(start).queryByRole("button", { name: "Remove" })).toBeNull();
  });
});

/** The kit Select whose options arrive with the read: open it, then wait for the option. */
async function pickWhenReady(name: string, option: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: new RegExp(`^${name}`) }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

describe("Statement (0664)", () => {
  it("asks for a dealer, then shows what Carres owes it month by month", async () => {
    renderAt("/?view=statement");
    expect(await screen.findByText("Choose a dealer")).toBeTruthy();
    await pickWhenReady("Dealer", "Ace Furniture");

    expect(await screen.findByText(`Commission ${fmtMonth(PREV)}`)).toBeTruthy();
    expect(screen.getByText("Payment PV-0001")).toBeTruthy();
    expect(screen.getByText(`Commission ${fmtMonth(MONTH)} so far`)).toBeTruthy();
    expect(screen.getByTestId("commission-statement-summary")).toHaveTextContent(
      `Owed to Ace Furniture now RM 140.00 · Due ${fmtDate(`${MONTH}-15`)} RM 20.00 · Commission still to come RM 80.00`,
    );
    // The running balance: 120, less 100 paid, plus 120 so far.
    expect(screen.getByText("RM 20.00")).toBeTruthy();
    expect(screen.getAllByText("RM 140.00").length).toBeGreaterThan(0);
  });

  it("counts a paid voucher as a payment to the dealer; Save names what is missing until then", async () => {
    renderAt("/?view=statement");
    await pickWhenReady("Dealer", "Ace Furniture");
    await screen.findByText("Payment PV-0001");
    fireEvent.click(screen.getByRole("button", { name: "Add a payment" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Save: pick the payment voucher" })).toBeDisabled();
    await waitFor(() => expect(net.calls).toContain(`GET ${DC}/payment-choices`));
    fireEvent.keyDown(within(dialog).getByRole("combobox", { name: /^Payment voucher/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: /PV-0002/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(net.calls).toContain(`POST ${DC}/payments`));
    expect(net.bodies[`POST ${DC}/payments`]).toEqual({ voucherId: CHOICES[0].id, dealerId: "d1" });
  });

  it("a payment's row takes it off the statement; a month's row opens its orders", async () => {
    renderAt("/?view=statement");
    await pickWhenReady("Dealer", "Ace Furniture");
    fireEvent.click(await screen.findByText("Payment PV-0001"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Taking it off leaves the payment voucher as it is");
    fireEvent.click(within(dialog).getByRole("button", { name: "Take off this statement" }));
    await waitFor(() => expect(net.calls).toContain(`DELETE ${DC}/payments/pay1`));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByText(`Commission ${fmtMonth(PREV)}`));
    expect(await screen.findByText("SO-2050")).toBeTruthy();
    expect(screen.getByTestId("commission-orders-summary")).toBeTruthy();
    await waitFor(() => expect(net.calls).toContain(`GET ${DC}?month=${PREV}`));
    expect(screen.getByText("New orders this month")).toBeTruthy();
  });
});

describe("KPI allowance and the rebate's total (0665)", () => {
  const KPI_URL = `${DC}/kpi-rules`;
  // Made-up amounts: the memo's are Finance's and stay out of this repository.
  const KPI_READ: DcKpiRulesRead = {
    today: "2026-10-09",
    rules: [{
      id: "k1", startsOn: "2026-07-22", modelId: "g1", modelName: "Mattress Guarantee", perUnit: 10,
      tiers: [{ units: 5, bonus: 50 }], period: "month", memo: "Memo 22 Jul", createdAt: "2026-10-09T01:00:00Z",
      createdBy: "Chew", state: "in_use",
    }],
    guarantees: [{ id: "g1", name: "Mattress Guarantee" }],
  };
  beforeEach(() => {
    net.routes[`GET ${KPI_URL}`] = KPI_READ;
    net.routes[`POST ${KPI_URL}`] = { id: "k2" };
    net.routes[`DELETE ${KPI_URL}/k1`] = { id: "k1", already: false };
    net.routes[`PUT ${DC}/quotas/d1`] = { ok: true };
  });

  it("lists each KPI allowance from its day", async () => {
    renderAt("/?view=kpi");
    const page = await screen.findByTestId("commission-kpi-page");
    await within(page).findByText("Mattress Guarantee");
    expect(within(page).getByText("RM 10.00")).toBeTruthy();
    expect(within(page).getByText("5 guarantees RM 50.00")).toBeTruthy();
    expect(within(page).getByText("Each month")).toBeTruthy();
    expect(within(page).getByText("In use")).toBeTruthy();
    expect(screen.getByTestId("commission-kpi-summary")).toHaveTextContent(
      "1 of 1 rows · Each guarantee counts on its order's day. The highest tier reached pays its bonus.",
    );
  });

  it("adds one; Save names what is missing until then", async () => {
    renderAt("/?view=kpi");
    await screen.findByText("Mattress Guarantee");
    fireEvent.click(screen.getByRole("button", { name: "Add a KPI allowance" }));
    const dialog = await screen.findByRole("dialog");
    // The one guarantee on sale is already the one counted.
    expect(within(dialog).getByRole("button", { name: "Save: type the amount per guarantee" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Per guarantee (RM)", { exact: false }), { target: { value: "10" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add a tier" }));
    expect(within(dialog).getByRole("button", { name: "Save: complete each tier" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("From guarantees", { exact: false }), { target: { value: "5" } });
    fireEvent.change(within(dialog).getByLabelText("Bonus (RM)", { exact: false }), { target: { value: "50" } });
    expect(within(dialog).getByRole("button", { name: "Save: pick the day it starts" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: /Starts on/ }));
    fireEvent.click(screen.getByText("15"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(net.calls).toContain(`POST ${KPI_URL}`));
    expect(net.bodies[`POST ${KPI_URL}`]).toEqual({
      startsOn: `${MONTH}-15`, modelId: "g1", perUnit: 10, tiers: [{ units: 5, bonus: 50 }], period: "month", memo: null,
    });
  });

  it("removes one from its window", async () => {
    renderAt("/?view=kpi");
    fireEvent.click(await screen.findByText("Mattress Guarantee"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Tier bonus: 5 guarantees RM 50.00");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(net.calls).toContain(`DELETE ${KPI_URL}/k1`));
  });

  it("By dealer counts the dealer's guarantees and works its KPI allowance out", async () => {
    net.routes[`GET ${DC}?month=${MONTH}`] = {
      ...SOURCE,
      kpi: [{ id: "k1", startsOn: "2026-01-01", modelId: "g1", perUnit: 10, tiers: [{ units: 5, bonus: 50 }], period: "month" }],
      orders: [...SOURCE.orders, {
        orderId: "ord3", so: 2060, dealerId: "d1", outletId: "o1", addons: 0, orderedOn: `${MONTH}-03`,
        customer: "Probe Customer Three", payments: [],
        lines: [{ modelId: "g1", category: "guarantee", value: 150, rate: 0, qty: 2 }],
      }],
    };
    renderAt();
    await screen.findByText("Ace Furniture");
    // Two guarantees at RM 10: the row and the totals row.
    expect(screen.getAllByText("RM 20.00")).toHaveLength(2);
    expect(screen.queryByText("Not set up")).toBeNull();
    expect(screen.getByTestId("dealer-commission-summary")).toHaveTextContent(
      "The rebate and the KPI allowance are the dealer's whole, whatever showroom is picked.",
    );
  });

  it("a rebate whose total is not filled in reads No limit yet", async () => {
    net.routes[`GET ${DC}?month=${MONTH}`] = { ...SOURCE, quotas: [{ dealerId: "d1", quota: null, rebateRate: 5, startsOn: `${PREV}-01` }] };
    renderAt();
    expect(await screen.findByText("No limit yet")).toBeTruthy();
    // No KPI rule yet.
    expect(screen.getByText("Not set up")).toBeTruthy();
  });

  it("saves a renovation quota with its total left empty", async () => {
    renderAt();
    await screen.findByText("Ace Furniture");
    fireEvent.click(screen.getByRole("button", { name: "No quota" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Leave it empty to fill in later. Until then there is no limit.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(net.calls).toContain(`PUT ${DC}/quotas/d1`));
    expect(net.bodies[`PUT ${DC}/quotas/d1`]).toEqual({ quota: null, rebateRate: 5, startsOn: `${MONTH}-01` });
  });
});
