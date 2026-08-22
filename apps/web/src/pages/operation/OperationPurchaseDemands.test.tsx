import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  PURCHASE_DEMAND_RAIL_WORDS,
  PURCHASE_DEMAND_STATES,
  PURCHASE_DEMAND_WORDS as W,
  type PurchaseDemandRow,
  type PurchaseDemandsResponse,
} from "@carres/shared";
import OperationPurchaseDemands from "./OperationPurchaseDemands";

/**
 * PURCHASE DEMANDS — the Register that explains
 * (CARD-2026-08-20-purchase-demands).
 *
 * The page has ONE job and one anti-job: it must make every blocked demand
 * findable and say what fixes it, and it must never grow a way to buy
 * something. Both are asserted here.
 */

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

const apiFetch = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...a: unknown[]) => apiFetch(...a) };
});

// The header's global icon cluster self-fetches; this file is about the grid.
vi.mock("./components/GlobalTopBar", () => ({ TopBarIcons: () => null }));

function row(over: Partial<PurchaseDemandRow>): PurchaseDemandRow {
  return {
    id: "r",
    state: "ready_to_buy",
    lineIds: ["l"],
    orderId: "o1",
    so: 1207,
    customer: "PETER",
    customerDelivery: "2026-09-30",
    item: "Booqit",
    variant: "King",
    category: "mattress",
    skus: ["B1201S-K"],
    supplierId: "s1",
    supplier: "Nice Future",
    qtyNeeded: 2,
    readyStock: 0,
    takenFromStock: 0,
    onPo: 0,
    poNumbers: [],
    toBuy: 2,
    goodsMustArrive: null,
    issueRef: null,
    action: null,
    ownerName: null,
    ownerDuty: null,
    ...over,
  };
}

const ROWS: PurchaseDemandRow[] = [
  row({ id: "ready", lineIds: ["l1"] }),
  row({
    id: "queen",
    lineIds: ["l1b"],
    variant: "Queen",
    skus: ["B1201S-Q"],
    so: 1208,
    customer: "MAY",
    qtyNeeded: 1,
    toBuy: 1,
  }),
  row({
    id: "nodate",
    lineIds: ["l4"],
    item: "Haven",
    variant: "King",
    skus: ["H1401S-K"],
    so: 1204,
    customer: "ella",
    customerDelivery: null,
    state: "no_customer_date",
    qtyNeeded: 1,
    toBuy: 1,
    ownerName: "Siew Hong",
  }),
  row({
    id: "nosku",
    lineIds: ["l2"],
    item: 'Transport Fees 4"',
    variant: null,
    category: null,
    skus: ['Transport Fees 4"'],
    supplier: null,
    supplierId: null,
    state: "no_sku",
    qtyNeeded: 1,
    readyStock: null,
    takenFromStock: null,
    onPo: null,
    toBuy: null,
    ownerName: "Yee Jin",
  }),
  row({
    id: "nosupplier",
    lineIds: ["l5"],
    item: "Orphan",
    variant: "King",
    skus: ["B9999-K"],
    supplier: null,
    supplierId: null,
    state: "no_supplier",
    qtyNeeded: 1,
    readyStock: null,
    takenFromStock: null,
    onPo: null,
    toBuy: null,
    ownerName: "Yee Jin",
  }),
  row({
    id: "nodays",
    lineIds: ["l6"],
    item: "Ohana Bed",
    variant: "Queen",
    category: "bedframe",
    skus: ["OB-Q"],
    supplier: "Ohana",
    state: "no_production_days",
    qtyNeeded: 1,
    readyStock: null,
    takenFromStock: null,
    onPo: null,
    toBuy: null,
    ownerDuty: "Purchasing Settings",
  }),
  row({
    id: "covered",
    lineIds: ["l7"],
    item: "Softcloud",
    variant: "King",
    skus: ["COV-K"],
    so: 1211,
    customer: "BOB",
    state: "covered",
    qtyNeeded: 3,
    onPo: 3,
    poNumbers: ["PO-2051"],
    toBuy: 0,
  }),
];

const BODY: PurchaseDemandsResponse = {
  today: "2026-08-20",
  rows: ROWS,
  stockWarehouse: "Carres Klang",
};

beforeEach(() => {
  apiFetch.mockReset();
  navigate.mockReset();
  window.localStorage.clear();
  apiFetch.mockImplementation(() => Promise.resolve(BODY));
});

function mount(path = "/operation?tab=purchase-demands") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <OperationPurchaseDemands />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Mount and wait for the SERVER's answer. `anchor` is a row the listing being
 * asked for actually contains — half of these listings are deliberately
 * narrowed, so waiting for `Booqit` every time would wait for nothing.
 */
async function loaded(path?: string, anchor = "Booqit") {
  const view = mount(path);
  await screen.findByText(anchor);
  return view;
}

/** The reference toolbar keeps Search behind its icon until it is asked for. */
async function openSearch() {
  fireEvent.click(screen.getByTestId("search-icon"));
  return screen.getByPlaceholderText(W.search);
}

/** Open an item's disclosure by its name and hand back the expansion body. */
async function expand(item: string) {
  const cell = await screen.findByText(item);
  const tr = cell.closest("tr")!;
  // The engine prepends the chevron column, so the row's first button is it.
  fireEvent.click(tr.querySelector("button")!);
  const id = Array.from(document.querySelectorAll("[data-testid^='demand-expansion-']"))
    .map((el) => el.getAttribute("data-testid")!)
    .find((t) => t.endsWith(`::${item}`));
  return screen.getByTestId(id!);
}

describe("Purchase Demands — the destination", () => {
  it("reads the Register endpoint and nothing else", async () => {
    await loaded();
    expect(apiFetch).toHaveBeenCalledWith("/api/operation/purchase/demands");
    expect(
      apiFetch.mock.calls.some((c) => String(c[0]).includes("to-order")),
    ).toBe(false);
  });

  it("draws the Purchasing Destination Header and no second title", async () => {
    await loaded();
    const header = screen.getByTestId("purchasing-tabs");
    expect(within(header).getByText(W.page)).toBeInTheDocument();
    expect(header.textContent).not.toContain("Purchasing ·");
    // One identity: the word appears in the header, not again as a page title.
    expect(screen.getAllByText(W.page)).toHaveLength(1);
  });

  it("has no way to buy anything — no Issue, no price, no editor", async () => {
    await loaded();
    const page = document.body;
    for (const banned of ["Issue PO", "Issue Purchase Order", "Send PO", "Deliver To", "RM"]) {
      expect(page.textContent, banned).not.toContain(banned);
    }
    expect(document.querySelector("input[type='number']")).toBeNull();
    // The ONE door out is navigation.
    expect(screen.getByTestId("open-so-batch-purchase").textContent).toBe(W.openBatch);
  });

  it("opening SO Batch Purchase leaves this page for the existing workspace", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("open-so-batch-purchase"));
    expect(navigate).toHaveBeenCalledWith("/operation?tab=purchase");
  });
});

describe("the rail is page-owned filtering, and it names facts", () => {
  it("carries every state with its count, and no generic attention word", async () => {
    await loaded();
    const rail = screen.getByTestId("purchase-demands-rail");
    expect(within(rail).getByText(W.railHeading)).toBeInTheDocument();
    for (const s of PURCHASE_DEMAND_STATES) {
      expect(
        within(rail).getByText(PURCHASE_DEMAND_RAIL_WORDS[s]),
        s,
      ).toBeInTheDocument();
    }
    for (const banned of ["Today", "Tomorrow", "Needs attention", "Follow up", "Pending", "Waiting"]) {
      expect(rail.textContent, banned).not.toContain(banned);
    }
    // Counts are the real ones.
    expect(
      within(screen.getByTestId("purchase-demands-state-ready_to_buy")).getByText("2"),
    ).toBeInTheDocument();
  });

  it("a rail choice narrows the listing", async () => {
    await loaded();
    expect(screen.getByText("Orphan")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("purchase-demands-state-covered"));
    expect(screen.queryByText("Orphan")).not.toBeInTheDocument();
    expect(screen.getByText("Softcloud")).toBeInTheDocument();
  });

  it("a shared URL lands on the same listing — multi-select included", async () => {
    await loaded("/operation?tab=purchase-demands&state=no_supplier,no_sku", "Orphan");
    expect(screen.getByText("Orphan")).toBeInTheDocument();
    expect(screen.getByText('Transport Fees 4"')).toBeInTheDocument();
    expect(screen.queryByText("Booqit")).not.toBeInTheDocument();
    // The URL is the source of truth: the rail reads its state back off it, so
    // a refresh, a share and the back button all show the same lit rows.
    expect(
      screen.getByTestId("purchase-demands-state-no_supplier").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByTestId("purchase-demands-state-no_sku").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByTestId("purchase-demands-state-all").getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("`All demands` clears the choice", async () => {
    await loaded("/operation?tab=purchase-demands&state=covered", "Softcloud");
    expect(screen.queryByText("Booqit")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("purchase-demands-state-all"));
    expect(screen.getByText("Booqit")).toBeInTheDocument();
  });
});

describe("every blocked demand is visible, and says what fixes it", () => {
  it("a SKU the catalog never heard of is on the page, named", async () => {
    await loaded();
    // It is NOT assumed to be a fee, a service or a typo — the catalog is the
    // only authority able to decide what it is, and it has not decided.
    const cell = screen.getByText('Transport Fees 4"').closest("tr")!;
    expect(cell.textContent).toContain("SKU not found");
    expect(cell.textContent).toContain("Add this item to the SKU catalog");
  });

  it("each blocker prints the FACT, the owner and the fix — in that order", async () => {
    await loaded();
    const body = await expand("Orphan");
    const blocker = within(body).getByTestId("demand-blocker-nosupplier");
    expect(blocker.textContent).toContain("Supplier not assigned");
    expect(blocker.textContent).toContain("Check the supplier for Orphan");
    expect(
      within(blocker).getByTestId("demand-owner-nosupplier").textContent,
    ).toBe("Yee Jin");
  });

  it("where no person resolves, the duty word stands", async () => {
    await loaded();
    const body = await expand("Ohana Bed");
    expect(
      within(body).getByTestId("demand-owner-nodays").textContent,
    ).toBe("Purchasing Settings");
    expect(within(body).getByTestId("demand-blocker-nodays").textContent).toContain(
      "Add production days for Ohana · Bedframe",
    );
  });

  it("a dateless order says so in words, never as a blank cell", async () => {
    await loaded();
    const body = await expand("Haven");
    expect(body.textContent).toContain(W.noCustomerDate);
    expect(body.textContent).toContain("Ask customer for a delivery date");
  });

  it("an uncounted coverage says it is uncounted — it never prints a `0`", async () => {
    await loaded();
    const body = await expand("Orphan");
    expect(body.textContent).toContain(W.coverageUnknown);
  });
});

describe("the tree, the links and the footer", () => {
  it("an item with two variants keeps the variant level", async () => {
    await loaded();
    const body = await expand("Booqit");
    expect(within(body).getByText("King")).toBeInTheDocument();
    expect(within(body).getByText("Queen")).toBeInTheDocument();
  });

  it("a single-variant item collapses straight to its customers", async () => {
    await loaded();
    const body = await expand("Softcloud");
    // No variant band — the leaf is immediate.
    expect(within(body).queryByText("King")).not.toBeInTheDocument();
    expect(within(body).getByText("BOB")).toBeInTheDocument();
  });

  it("an SO number opens the Sales Order; a PO number opens Purchase Orders", async () => {
    await loaded();
    const body = await expand("Softcloud");
    fireEvent.click(within(body).getByTestId("demand-so-covered"));
    expect(navigate).toHaveBeenCalledWith("/operation/orders/so/o1");
    fireEvent.click(within(body).getByTestId("demand-po-covered-PO-2051"));
    expect(navigate).toHaveBeenCalledWith("/operation/procurement?po=PO-2051");
  });

  it("a covered leaf names the purchase order that covers it", async () => {
    await loaded();
    const body = await expand("Softcloud");
    expect(body.textContent).toContain("3 on PO-2051");
  });

  it("only a READY leaf offers the Batch door, with its SO in the URL", async () => {
    await loaded();
    const ready = await expand("Booqit");
    fireEvent.click(within(ready).getByTestId("demand-open-batch-ready"));
    expect(navigate).toHaveBeenCalledWith("/operation?tab=purchase&so=1207");
    const covered = await expand("Softcloud");
    expect(
      within(covered).queryByTestId("demand-open-batch-covered"),
    ).not.toBeInTheDocument();
  });

  it("the footer states demand lines, units needed and units to buy", async () => {
    await loaded();
    // 7 leaves · 10 units needed · 4 to buy — the three blocked leaves and the
    // covered one buy nothing, and an uncounted row adds no phantom unit.
    expect(
      screen.getByText("7 demand lines · 10 units needed · 4 units to buy"),
    ).toBeInTheDocument();
  });

  it("a narrowed listing says so in the footer", async () => {
    await loaded("/operation?tab=purchase-demands&state=covered", "Softcloud");
    expect(screen.getByText(/1 of 7 demand lines/)).toBeInTheDocument();
  });

  it("shortages sort above covered work", async () => {
    await loaded();
    const items = Array.from(document.querySelectorAll("tbody tr"))
      .map((tr) => tr.textContent ?? "")
      .filter(Boolean);
    const booqit = items.findIndex((t) => t.includes("Booqit"));
    const covered = items.findIndex((t) => t.includes("Softcloud"));
    expect(booqit).toBeGreaterThanOrEqual(0);
    expect(covered).toBeGreaterThan(booqit);
  });
});

describe("search, and the empty state", () => {
  it("one search reaches SO, customer, model, SKU, supplier and PO number", async () => {
    await loaded();
    const search = await openSearch();
    for (const [term, expected] of [
      ["1204", "Haven"],
      ["ella", "Haven"],
      ["B9999-K", "Orphan"],
      ["Ohana", "Ohana Bed"],
      ["PO-2051", "Softcloud"],
    ] as const) {
      fireEvent.change(search, { target: { value: term } });
      expect(await screen.findByText(expected), term).toBeInTheDocument();
    }
  });

  it("an empty register says so in the governed words", async () => {
    apiFetch.mockImplementation(() =>
      Promise.resolve({ today: "2026-08-20", rows: [], stockWarehouse: null }),
    );
    mount();
    expect(await screen.findByText(W.empty)).toBeInTheDocument();
  });
});
