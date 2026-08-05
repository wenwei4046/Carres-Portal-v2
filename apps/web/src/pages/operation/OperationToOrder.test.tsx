import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TO_ORDER_WORDS as W } from "@carres/shared";
import OperationToOrder from "./OperationToOrder";
import { fmtDate } from "@/lib/fmt-date";

/**
 * To Order — the Work Queue + Excel Workspace (Jess's freeze, 2026-08-01).
 *
 * LEFT = time views (five DISJOINT sets, engine opens Today, overdue folds
 * in) + CATEGORY (work order, no counts) + Create Purchase. RIGHT = the
 * Excel grid: pill search · the Issue pill that exists only while something
 * is selected · `Updated hh:mm` · header sort · per-column Excel filters
 * whose PO options speak business (`Not Ordered` / `Ordered`, never
 * `(Blanks)`). Ordered rows stay in their bucket; their PO No. is the door
 * to Purchase Orders. Issue posts one ARRANGEMENT per group, updates the
 * grid in place, reports in the bottom bar, and a partial failure stays.
 *
 * Fixture time: today = 2026-07-30 (Thursday). This week = Jul 27 → Aug 2;
 * next week starts Aug 3.
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

const OHANA = "11111111-1111-1111-1111-111111111111";
const NF = "33333333-3333-3333-3333-333333333333";
const KLANG = "2f181917-f4e1-42b2-9e25-d7ee6785424a";

function build(key: string, model: string, codes: string, qty = 1, size: string | null = null) {
  return {
    key, title: model, spec: "", codes, qty, size, model, ordinal: null,
    lines: [{ lineId: `${key}-l1`, sku: codes, qty, cost: null }],
  };
}

const TO_ORDER = {
  today: "2026-07-30", // Thursday — NOT a PO day; schedule = Fri 31 · Mon 3 · Wed 5
  poDays: [1, 3, 5],
  destinations: [{ id: KLANG, name: "Carres Klang", isDefault: true }],
  ordered: [
    {
      // A PO created TODAY — Today + `Ordered` must answer 今天已经下了哪些.
      poId: "PO-9001", placedAt: "2026-07-30", category: "bedframe",
      supplierId: OHANA, supplierName: "Ohana", orderId: "o30", so: 1350,
      delivery: "2026-08-10", model: "Cody K", qty: 1,
    },
  ],
  proposals: [
    {
      key: `${OHANA}::sofa`,
      supplierId: OHANA,
      supplierName: "Ohana",
      category: "sofa",
      label: "Ohana · Sofa",
      orderBy: "2026-07-15",
      poCount: 3,
      blocked: null,
      productionDays: 14,
      rows: [
        {
          orderId: "o2", so: 1204, customer: "ella", qty: 1,
          summary: "Booqit · 1 Sofa", stockReady: "2026-07-20",
          delivery: "2026-07-20", // the CUSTOMER's date, already past → red
          orderBy: "2026-07-15", // overdue → folds into Today
          builds: [build("bk-e", "Booqit", "5539-1A(LHF)")],
        },
        {
          orderId: "o1", so: 1207, customer: "PETER", qty: 2,
          summary: "Booqit · 2 Sofas", stockReady: "2026-08-13",
          delivery: "2026-08-13",
          orderBy: "2026-07-30",
          builds: [
            build("bk-a", "Booqit", "5539-1B(LHF)"),
            build("bk-b", "Booqit", "5539-1A(LHF)"),
          ],
        },
        {
          orderId: "o3", so: 1257, customer: "kee tong", qty: 2,
          summary: "Booqit · 2 Sofas", stockReady: null,
          delivery: null, // TBD — NOT purchasable work: never listed (Jess)
          orderBy: null,
          builds: [build("bk-k", "Booqit", "5539-2B(LHF)")],
        },
      ],
    },
    {
      key: `${OHANA}::bedframe`,
      supplierId: OHANA,
      supplierName: "Ohana",
      category: "bedframe",
      label: "Ohana · Bedframe",
      orderBy: "2026-07-30",
      poCount: 1,
      blocked: null,
      productionDays: 7,
      rows: [
        {
          orderId: "o9", so: 1300, customer: "wong", qty: 3,
          summary: "Cody · 3 Bedframes", stockReady: "2026-08-06",
          delivery: "2026-08-15",
          orderBy: "2026-07-30",
          builds: [build("l1", "Cody", "CODY-Q", 3, "Queen")],
        },
        {
          orderId: "o8", so: 1301, customer: "lim", qty: 1,
          summary: "Cody · 1 Bedframe", stockReady: "2026-08-06",
          delivery: "2026-08-15",
          orderBy: "2026-07-30",
          builds: [build("l2", "Cody", "CODY-K", 1, "King")],
        },
      ],
    },
    {
      // A run AHEAD — its order-by day is next Monday, so it lives in the
      // Next Week view: listed, visible, NOT pre-selected.
      key: `${NF}::mattress`,
      supplierId: NF,
      supplierName: "Nice Future",
      category: "mattress",
      label: "Nice Future · Mattress",
      orderBy: "2026-08-03",
      poCount: 1,
      blocked: null,
      productionDays: 7,
      rows: [
        {
          orderId: "o20", so: 1400, customer: "amy", qty: 1,
          summary: "Sonic · 1 Mattress", stockReady: "2026-08-20",
          delivery: "2026-08-25",
          orderBy: "2026-08-03",
          builds: [build("m1", "Sonic", "SONIC-Q", 1, "Queen")],
        },
      ],
    },
  ],
};

let failCategories: Set<string>;

/**
 * The Create Purchase picker's own read (P15).
 *
 * **THE FIRST FOUR ROWS ARE THE DEFECT THIS CARD EXISTS FOR, copied from the
 * live measurement of 2026-08-04**: four different SKUs whose model label is
 * the single word `Booqit`, because a PART variant has no size letter to tell
 * them apart. Before P15 the picker printed that label alone and an operator
 * could not pick the right one.
 */
const PICK_ITEMS = {
  items: [
    { sku: "5539-L(RHF)", label: "Booqit", supplier: "Ohana", onHand: 3, reserved: 1, free: 2 },
    { sku: "5539-2NA", label: "Booqit", supplier: "Ohana", onHand: 0, reserved: 0, free: 0 },
    { sku: "5539-CNR", label: "Booqit", supplier: "Ohana", onHand: 5, reserved: 0, free: 5 },
    { sku: "5539-Console", label: "Booqit", supplier: "Ohana", onHand: 0, reserved: 0, free: 0 },
    { sku: "SONIC-S", label: "Sonic S", supplier: "Nice Future", onHand: 7, reserved: 2, free: 5 },
  ],
  stockWarehouse: "Carres Klang",
};

function route(path: string, body?: { category?: string; purchaseOrders?: { key: string }[] }) {
  // BEFORE the generic to-order branch — `startsWith` would otherwise answer
  // the picker with the whole workspace payload.
  if (path.startsWith("/api/operation/purchase/to-order/demand/pick-items")) {
    return Promise.resolve(PICK_ITEMS);
  }
  if (path.startsWith("/api/operation/purchase/to-order/issue")) {
    const cat = body?.category ?? "?";
    if (failCategories.has(cat)) return Promise.reject(new Error(`boom-${cat}`));
    return Promise.resolve({
      supplier: "x",
      destination: "Carres Klang",
      pos: (body?.purchaseOrders ?? []).map((_d, i) => ({
        id: `PO-${cat}-${i + 1}`,
        customer: "c",
      })),
    });
  }
  if (path.startsWith("/api/operation/purchase/to-order")) return Promise.resolve(TO_ORDER);
  if (path.startsWith("/api/operation/purchasing/settings")) {
    return Promise.resolve({ canEdit: false });
  }
  return Promise.resolve({});
}

function rowBox(proposalKey: string, orderId: string, buildKey: string) {
  return document.getElementById(`kit-table-row-${proposalKey}:${orderId}:${buildKey}`)!;
}

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <OperationToOrder />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigate.mockReset();
  apiFetch.mockReset();
  failCategories = new Set();
  apiFetch.mockImplementation((path: string, init?: RequestInit) =>
    route(path, init?.body ? JSON.parse(String(init.body)) : undefined),
  );
});

async function loaded() {
  render(wrap());
  // The calendar rows appear once data lands. The Issue pill may NOT be
  // there yet: the batch is VIEW-SCOPED, and the default view can hold no
  // selectable work (this fixture's Friday holds only a receipt).
  await screen.findByTestId("to-order-day-2026-07-31");
}

describe("the PO Schedule — a purchase calendar, not a menu", () => {
  it("rolling upcoming PO days + a red Overdue on top; CATEGORY stays wordless", async () => {
    await loaded();
    const nav = screen.getByTestId("to-order-nav");
    expect(within(nav).getByText(W.poScheduleHeading)).toBeInTheDocument();
    // 4 orders whose snapped PO day has PASSED — Overdue, red, on top;
    // never swallowed by the next run.
    expect(within(nav).getByTestId("to-order-overdue")).toHaveTextContent(W.filterOverdue);
    expect(within(nav).getByTestId("to-order-overdue")).toHaveTextContent("4");
    // Rolling from Thursday: Friday · Monday · Wednesday — 3 configured
    // days, 3 rows, no Today (Thursday is not a PO day), no stale Monday.
    expect(within(nav).getByTestId("to-order-day-2026-07-31")).toHaveTextContent("Friday");
    expect(within(nav).getByTestId("to-order-day-2026-07-31")).toHaveTextContent("0");
    expect(within(nav).getByTestId("to-order-day-2026-08-03")).toHaveTextContent("Monday");
    expect(within(nav).getByTestId("to-order-day-2026-08-05")).toHaveTextContent("Wednesday");
    expect(within(nav).queryByText(W.navToday)).toBeNull();
    // The retired vocabulary stays retired.
    expect(within(nav).queryByText("Tomorrow")).toBeNull();
    expect(within(nav).queryByText("This Week")).toBeNull();
    // CATEGORY is Loo's WORK ORDER, and since P9 (2026-08-04) each row also
    // carries how many UNITS that click produces. It may never say `Orders` —
    // that is the block above, counting a different thing.
    expect(within(nav).getByText(W.categoryHeading)).toBeInTheDocument();
    expect(within(nav).getByTestId("to-order-cat-all")).not.toHaveTextContent("Orders");
    expect(within(nav).getByTestId("to-order-create-purchase")).toHaveTextContent(
      W.createPurchase,
    );
    expect(document.querySelector("h1")).toBeNull();
  });

  it("calendar rows TOGGLE — pick two runs and the grid is the union", async () => {
    await loaded();
    // The engine opens the first upcoming run (Friday): today's receipt
    // lives there; overdue work does not leak in. And kee tong — no
    // delivery date — is NOT LISTED AT ALL: not purchasable work (Jess).
    expect(screen.getByText("SO-1350")).toBeInTheDocument();
    expect(screen.queryByText("SO-1257")).toBeNull();
    expect(screen.queryByText("SO-1204")).toBeNull();
    // Ticking Overdue ADDS it — Friday stays on (multi-select, Jess).
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    expect(screen.getByText("SO-1204")).toBeInTheDocument();
    expect(screen.getByText("SO-1350")).toBeInTheDocument();
    // Unticking Friday leaves Overdue alone.
    fireEvent.click(screen.getByTestId("to-order-day-2026-07-31"));
    expect(screen.getByText("SO-1204")).toBeInTheDocument();
    expect(screen.queryByText("SO-1350")).toBeNull();
    fireEvent.click(screen.getByTestId("to-order-day-2026-08-03"));
    expect(screen.getByText("SO-1400")).toBeInTheDocument();
  });

  it("clearing the whole time block lifts the time filter — the second way to place", async () => {
    await loaded();
    // Only Friday is lit; unticking it must be ALLOWED (nothing stays
    // forced on) and means: no time narrowing at all.
    fireEvent.click(screen.getByTestId("to-order-day-2026-07-31"));
    expect(screen.getByText("SO-1204")).toBeInTheDocument(); // overdue
    expect(screen.getByText("SO-1400")).toBeInTheDocument(); // Monday's run
    expect(screen.getByText("SO-1350")).toBeInTheDocument(); // the receipt
    // Category alone can now carve the sheet — browse ALL bedframes.
    fireEvent.click(screen.getByTestId("to-order-cat-bedframe"));
    expect(screen.getByText("SO-1300")).toBeInTheDocument();
    expect(screen.queryByText("SO-1204")).toBeNull();
  });

  it("clicking a category narrows within the calendar row; All restores", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    fireEvent.click(screen.getByTestId("to-order-cat-bedframe"));
    expect(screen.getByText("SO-1300")).toBeInTheDocument();
    expect(screen.queryByText("SO-1204")).toBeNull();
    fireEvent.click(screen.getByTestId("to-order-cat-all"));
    expect(screen.getByText("SO-1204")).toBeInTheDocument();
  });
});

describe("the grid — business language only", () => {
  it("carries only what belongs to an ITEM — the order's own facts moved to the group", async () => {
    await loaded();
    // Supplier · Qty · Model · PO No. — what is true of one piece of goods.
    for (const label of [W.supplierLabel, W.colModel, W.colQty, W.colPoNo]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // SO No. · Customer · Customer Delivery are facts about the ORDER, so they
    // are stated ONCE on the group header and are no longer column headers
    // (Loo, 2026-08-03 — AutoCount's own shape).
    const heads = [...document.querySelectorAll("thead th")].map((t) => t.textContent ?? "");
    for (const gone of [W.colSoNo, W.colCustomer, W.colPreferred]) {
      expect(heads.some((h) => h.includes(gone))).toBe(false);
    }
    expect(screen.queryByText("Category")).toBeNull();
    expect(screen.queryByText(/Order by/i)).toBeNull();
    expect(screen.queryByText("Stock ready")).toBeNull();
  });

  it("speaks the CUSTOMER's date — red when past, a dash when TBD, sorted soonest first", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    // ella's delivery is past → red overdue, sorted to the very top.
    const cells = screen.getAllByText(fmtDate("2026-07-20"));
    expect(cells[0]!.className).toContain("text-kit-red-11");
    // A TBD order is not listed at all — no dateless row to sink.
    expect(screen.queryByText("SO-1257")).toBeNull();
    // The engine's own dates never render.
    expect(screen.queryByText(fmtDate("2026-07-15"))).toBeNull(); // sofa orderBy
    expect(screen.queryByText(fmtDate("2026-08-06"))).toBeNull(); // bedframe stockReady
  });

  it("rows arrive PRE-SELECTED and the toolbar pill answers for the visible sheet", async () => {
    await loaded();
    // Friday (default) holds only the receipt — nothing selectable, so the
    // toolbar stays QUIET (view-scoped batch, Excel's iron law).
    expect(screen.queryByTestId("to-order-issue-pill")).toBeNull();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    const pill = screen.getByTestId("to-order-issue-pill");
    // 5 BUILDS (PETER's order is two sofas = two rows; kee tong's TBD
    // order is not listed).
    expect(pill).toHaveTextContent("5 selected");
    // Sofa is one-per-order (2 listed) + bedframe merges (1). Numbers are
    // STATE (the caption); the button is the ACTION alone.
    expect(screen.getByTestId("to-order-issue")).toHaveTextContent(/^Issue 3 POs$/);
    expect(pill.textContent).not.toContain("→");
  });

  it("the engine pre-ticks ONLY its own plan — a future row waits for a human", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-day-2026-08-03")); // Monday joins Friday
    const box = rowBox(`${NF}::mattress`, "o20", "m1");
    expect(box).not.toBeNull();
    expect(box.getAttribute("data-state")).not.toBe("checked");
    // Nothing pre-ticked in view → the toolbar is quiet until the human acts.
    expect(screen.queryByTestId("to-order-issue-pill")).toBeNull();
    fireEvent.click(box);
    // The batch answers for the VISIBLE sheet: amy alone.
    expect(screen.getByTestId("to-order-issue-pill")).toHaveTextContent("1 selected");
    expect(screen.getByTestId("to-order-issue")).toHaveTextContent(/^Issue 1 PO$/);
  });

  it("an untick drops the pill's promise; unticking everything removes the pill", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    fireEvent.click(rowBox(`${OHANA}::sofa`, "o2", "bk-e"));
    expect(screen.getByTestId("to-order-issue-pill")).toHaveTextContent("4 selected");
    expect(screen.getByTestId("to-order-issue")).toHaveTextContent(/^Issue 2 POs$/);
    for (const [p, o, b] of [
      [`${OHANA}::sofa`, "o1", "bk-a"],
      [`${OHANA}::sofa`, "o1", "bk-b"],
      [`${OHANA}::bedframe`, "o9", "l1"],
      [`${OHANA}::bedframe`, "o8", "l2"],
    ] as const) {
      fireEvent.click(rowBox(p, o, b));
    }
    expect(screen.queryByTestId("to-order-issue-pill")).toBeNull();
  });

  it("the operator's ticks and unticks survive a view switch — deltas, not snapshots", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    fireEvent.click(rowBox(`${OHANA}::sofa`, "o2", "bk-e"));
    fireEvent.click(screen.getByTestId("to-order-cat-bedframe"));
    fireEvent.click(screen.getByTestId("to-order-cat-all"));
    expect(screen.getByTestId("to-order-issue-pill")).toHaveTextContent("4 selected");
  });

  it("search narrows by SO or model", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    fireEvent.change(document.getElementById("to-order-search")!, {
      target: { value: "cody" },
    });
    expect(screen.getByText("SO-1300")).toBeInTheDocument();
    expect(screen.queryByText("SO-1204")).toBeNull();
  });

  it("a quiet Updated stamp — never a Refresh button", async () => {
    await loaded();
    expect(screen.getByTestId("to-order-updated")).toHaveTextContent(/^Updated/);
    expect(screen.queryByText("Refresh")).toBeNull();
  });
});

describe("the Excel reflexes — header sort, per-column filters", () => {
  it("a header click sorts by Model; a second click reverses", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    // SO No. is no longer a column — it is the group header's first fact — so
    // this asserts a sort on something an ITEM actually carries.
    const models = () =>
      [...document.querySelectorAll('[data-kit="data-row"]')].map(
        (tr) => tr.querySelectorAll("td")[3]?.textContent ?? "",
      );
    fireEvent.click(screen.getByTestId("table-sort-model"));
    const asc = models();
    fireEvent.click(screen.getByTestId("table-sort-model"));
    expect(models()).toEqual([...asc].reverse());
  });

  it("the PO filter speaks business — Yet to Order + the real numbers, never (Blanks)", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue")); // union: Fri + Overdue
    fireEvent.click(screen.getByTestId("table-filter-po"));
    expect(screen.getByLabelText(W.yetToOrder)).toBeInTheDocument();
    expect(screen.getByLabelText("PO-9001")).toBeInTheDocument();
    expect(screen.queryByText("(Blanks)")).toBeNull();
    // A real number narrows to that document's rows.
    fireEvent.click(screen.getByLabelText("PO-9001"));
    expect(screen.getByText("SO-1350")).toBeInTheDocument();
    expect(screen.queryByText("SO-1204")).toBeNull();
    // Yet to Order joins in — Excel ORs a checklist.
    fireEvent.click(screen.getByLabelText(W.yetToOrder));
    expect(screen.getByText("SO-1204")).toBeInTheDocument();
  });

  // THE DELIVERY ▼ IS GONE, with its column (Loo, 2026-08-03). The date moved
  // onto the group header, and filtering to ONE specific delivery date is the
  // single capability this page lost — recorded here rather than quietly
  // dropped, so that if it is missed it comes back as its own decision.
  it("no column filter survives for a fact that now lives on the group header", async () => {
    await loaded();
    expect(document.querySelector('[data-testid="table-filter-delivery"]')).toBeNull();
    expect(document.querySelector('[data-testid="table-filter-so"]')).toBeNull();
    expect(document.querySelector('[data-testid="table-filter-customer"]')).toBeNull();
  });

  it("there are no Status pills — the PO column IS the status door", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    expect(screen.queryByText("Status")).toBeNull();
    // The empty PO cell SAYS the work instead of a mute dash, and the
    // footer counts what the sheet shows.
    expect(screen.getAllByText(W.yetToOrder).length).toBeGreaterThan(0);
    // NO CUSTOMER-ORDER COUNT (Loo, 2026-08-03). `3 orders` read as a third
    // number in a third unit, and operations does not work in customer
    // orders. His pair stands: what I ticked, and how many purchase orders it
    // becomes.
    //
    // TWO RULINGS MEET HERE AND THEY DO NOT COLLIDE. The 2026-08-03 ban was on
    // the ORDER count; P9 (2026-08-04) puts UNITS in the footer, which is the
    // one thing Loo said the page could not answer. So the guard is narrowed
    // to what was actually banned rather than deleted — `N order` / `N SO` may
    // never come back, and the units line is free to be there.
    const footer = screen.getByTestId("to-order-footer");
    expect(footer).not.toHaveTextContent(/\d+\s*(orders?|SO)\b/i);
    // …and the digits it DOES carry are P9's, nobody else's.
    expect(screen.getByTestId("to-order-footer-units")).toBeInTheDocument();
  });
});

/**
 * q3 (Loo, 2026-08-03). `Overdue` is red in the rail, and on the row every
 * date was still comfortably in the future — because overdue means the
 * ORDER-BY date has passed and that date never renders. The row said nothing.
 */
describe("an overdue row says so on the row", () => {
  it("wears a red left bar; a row that is not overdue keeps a transparent one", async () => {
    await loaded();
    // The rail MULTI-selects, so the engine's opening day has to come OFF
    // before Overdue is the only thing in view — clicking Overdue alone shows
    // both, which is correct behaviour and a useless fixture for this test.
    fireEvent.click(screen.getByTestId("to-order-day-2026-07-31"));
    fireEvent.click(screen.getByTestId("to-order-overdue"));

    const bars = [...document.querySelectorAll('[data-kit="data-row"] td:first-child')];
    expect(bars.length).toBeGreaterThan(0);
    // P17 spells the bar's colour PER SIDE (`border-l-…`): an all-sides
    // `border-kit-red-9` also painted the cell's new column rule red, and its
    // `border-transparent` twin painted it invisible. Same bar, same red.
    for (const b of bars) expect(b.className).toContain("border-l-kit-red-9");

    // Swap to the first upcoming run — NOT overdue, same table, no red.
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    fireEvent.click(screen.getByTestId("to-order-day-2026-07-31"));
    const calm = [...document.querySelectorAll('[data-kit="data-row"] td:first-child')];
    expect(calm.length).toBeGreaterThan(0);
    for (const b of calm) {
      expect(b.className).toContain("border-l-transparent");
      expect(b.className).not.toContain("border-l-kit-red-9");
    }
  });
});

describe("ordered rows — the receipt stays on the sheet", () => {
  it("a PO created today sits on the current run's row, unticked, PO No. filled", async () => {
    await loaded();
    // The default view IS the first upcoming run — the receipt is already there.
    expect(screen.getByText("SO-1350")).toBeInTheDocument();
    expect(document.getElementById("kit-table-row-po:PO-9001:o30")).toBeNull(); // no checkbox
    expect(screen.getByTestId("row-po-po:PO-9001:o30")).toHaveTextContent("PO-9001");
    // It is DONE work — it must not inflate the rail's counts.
    expect(screen.getByTestId("to-order-day-2026-07-31")).toHaveTextContent("0");
  });

  it("its PO No. lands on Purchase Orders with THAT document opened", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("row-po-po:PO-9001:o30"));
    expect(navigate).toHaveBeenCalledWith(
      "/operation/procurement/hookka-bedframe?po=PO-9001",
    );
  });
});

describe("Issue — the grid is the receipt, the bar is the report", () => {
  it("posts one ARRANGEMENT per group and updates rows in place — nothing vanishes", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    fireEvent.click(rowBox(`${OHANA}::sofa`, "o2", "bk-e")); // leave ella out
    fireEvent.click(screen.getByTestId("to-order-issue"));

    await screen.findByTestId("to-order-created-line");
    const calls = apiFetch.mock.calls.filter(([p]) => String(p).endsWith("/issue"));
    expect(calls).toHaveLength(2);
    for (const [, init] of calls) {
      const body = JSON.parse(String((init as RequestInit).body));
      expect(Object.keys(body).sort()).toEqual([
        "category",
        "destinationId",
        "purchaseOrders",
        "supplierId",
      ]);
      expect(body.destinationId).toBe(KLANG); // the engine's default, silently
      expect(JSON.stringify(body)).not.toMatch(/sku|qty|cost|price/);
    }
    // ella's untick reached the wire.
    const sofaBody = JSON.parse(
      String((calls.find(([, i]) => String((i as RequestInit).body).includes('"sofa"'))![1] as RequestInit).body),
    );
    expect(sofaBody.purchaseOrders).toHaveLength(1);
    expect(JSON.stringify(sofaBody)).not.toContain("bk-e");

    // Rows updated IN PLACE: PO number a clickable door, checkbox gone,
    // unissued ella still visible with her ☑.
    expect(screen.getByTestId(`row-po-${OHANA}::bedframe:o9:l1`)).toHaveTextContent(
      "PO-bedframe-1",
    );
    expect(screen.getByTestId(`row-po-${OHANA}::sofa:o1:bk-a`)).toHaveTextContent("PO-sofa-");
    expect(document.getElementById(`kit-table-row-${OHANA}::bedframe:o9:l1`)).toBeNull();
    expect(
      document.getElementById(`kit-table-row-${OHANA}::sofa:o2:bk-e`),
    ).not.toBeNull();

    // The bar reports; the pill is gone (only ella remains, unticked).
    expect(screen.getByTestId("to-order-created-line")).toHaveTextContent(
      "2 Purchase Orders Created",
    );
    fireEvent.click(screen.getByTestId("to-order-continue"));
    expect(navigate).toHaveBeenCalledWith("/operation/procurement");
    // The rail's Overdue count fell with the work — only ella is left.
    expect(screen.getByTestId("to-order-overdue")).toHaveTextContent("1");
  });

  it("a session-issued PO's number is the door to ITS channel tab", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    fireEvent.click(rowBox(`${OHANA}::sofa`, "o2", "bk-e")); // leave ella out
    fireEvent.click(screen.getByTestId("to-order-issue"));
    await screen.findByTestId("to-order-created-line");
    fireEvent.click(screen.getByTestId(`row-po-${OHANA}::bedframe:o9:l1`));
    expect(navigate).toHaveBeenCalledWith(
      "/operation/procurement/hookka-bedframe?po=PO-bedframe-1",
    );
  });

  it("a failed group fails ALONE and stays in the bar until retried", async () => {
    failCategories = new Set(["bedframe"]);
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    fireEvent.click(screen.getByTestId("to-order-issue"));
    await screen.findByTestId("to-order-failed-line");
    // Sofa succeeded beside it; the failure does not evaporate.
    expect(screen.getByTestId(`row-po-${OHANA}::sofa:o2:bk-e`)).toBeInTheDocument();
    expect(screen.getByTestId("to-order-failed-line")).toHaveTextContent("1 failed");

    failCategories = new Set();
    apiFetch.mockClear();
    fireEvent.click(screen.getByTestId("to-order-retry"));
    await waitFor(() => {
      expect(screen.getByTestId(`row-po-${OHANA}::bedframe:o9:l1`)).toBeInTheDocument();
    });
    // ONLY the failed group was retried.
    expect(apiFetch.mock.calls.filter(([p]) => String(p).endsWith("/issue"))).toHaveLength(1);
    expect(screen.queryByTestId("to-order-failed-line")).toBeNull();
  });

  it("demand the catalog could not read blocks the pill, by name", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) =>
      path.endsWith("/to-order")
        ? Promise.resolve({
            ...TO_ORDER,
            unresolved: [{ sku: "M1401F-K", orderId: "ox", so: 1290 }],
          })
        : route(path, init?.body ? JSON.parse(String(init.body)) : undefined),
    );
    await loaded();
    expect(screen.getByTestId("to-order-unresolved")).toHaveTextContent(
      "1 item could not be read",
    );
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    expect(screen.getByTestId("to-order-issue")).toBeDisabled();
  });

  it("an empty To Order is an answer, not a blank sheet", async () => {
    apiFetch.mockImplementation((path: string) =>
      path.endsWith("/to-order")
        ? Promise.resolve({ ...TO_ORDER, proposals: [], ordered: [] })
        : route(path),
    );
    render(wrap());
    await screen.findByText(W.empty);
    expect(screen.getByTestId("to-order-empty")).toHaveTextContent(W.empty);
  });
});

describe("+ Create Purchase — the dialog stops guessing (P15)", () => {
  /**
   * The picker renders through the kit's `DataTable` (§0.1 — a hand-rolled
   * table is a violation the guard counts). A row is found BY ITS SKU CELL,
   * which is the assertion this card is about anyway: if the code is not
   * rendered the row cannot be addressed, and defect 1 is back.
   */
  const pickRow = (sku: string) =>
    screen.getByText(sku, { selector: ".font-mono" }).closest("tr")!;

  async function openDialog() {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-create-purchase"));
    const dialog = await screen.findByTestId("to-order-create-dialog");
    await waitFor(() => expect(pickRow("5539-CNR")).toBeTruthy());
    return dialog;
  }

  it("asks SIX things — the five that were right, plus the Source", async () => {
    const dialog = await openDialog();

    // Item · Quantity · Deliver To · Required By · Remark were correct and are
    // untouched. `Required By` and `Destination` are Loo's own ruling and the
    // card forbids changing them.
    for (const w of [W.itemLabel, W.itemsColQty, W.destination, W.requiredBy, W.remark]) {
      expect(within(dialog).getByText(w)).toBeInTheDocument();
    }
    // THE SIXTH — P15's defect 2. `Reason` is the mirror's own word for the
    // field the frozen list calls Source; nothing new is spelt.
    expect(within(dialog).getByText(W.reason)).toBeInTheDocument();

    // Category was never asked and still is not.
    expect(within(dialog).queryByText("Category")).toBeNull();
    // Nothing disabled, no placeholder promise.
    expect(screen.queryByText(W.nextUpdate)).toBeNull();
  });

  it("DEFECT 1 — four SKUs that share the word Booqit are told apart", async () => {
    const dialog = await openDialog();

    // The label alone is ambiguous FOUR ways, which is the live measurement.
    expect(within(dialog).getAllByText("Booqit")).toHaveLength(4);
    // The SKU is what distinguishes them, and every one of them is on screen.
    for (const sku of ["5539-L(RHF)", "5539-2NA", "5539-CNR", "5539-Console"]) {
      expect(within(dialog).getByText(sku)).toBeInTheDocument();
    }
    // ...under a header that says what the column is.
    expect(within(dialog).getByText(W.pickerColSku)).toBeInTheDocument();

    // ONE WORD, ONE THING. The ambiguous column is headed `Model` — the grid's
    // own word for this value — because the FIELD is already `Item`, and one
    // word labelling two things in one dialog is the defect this card is
    // fixing in another form.
    expect(within(dialog).getAllByText(W.itemLabel)).toHaveLength(1);
    expect(within(dialog).getByText(W.colModel)).toBeInTheDocument();
  });

  it("DEFECT 3 — the picker carries the stock numbers, headed by their own words", async () => {
    const dialog = await openDialog();

    for (const w of [W.pickerColOnHand, W.pickerColReserved, W.pickerColFree]) {
      expect(within(dialog).getByText(w)).toBeInTheDocument();
    }
    // The row an operator would read before buying: 5 on hand, none spoken
    // for, 5 free — so buying more may be unnecessary.
    const row = pickRow("5539-CNR");
    expect(row).toHaveTextContent("5539-CNR");
    expect(row).toHaveTextContent("5");
    // ...and a SKU with nothing in the warehouse says zero rather than blank.
    expect(pickRow("5539-2NA")).toHaveTextContent("0");
  });

  it("DEFECT 4 — the supplier appears on pick, as a FACT and never a chooser", async () => {
    const dialog = await openDialog();

    // Nothing claimed before an item is picked.
    expect(within(dialog).queryByTestId("cp-supplier")).toBeNull();

    fireEvent.click(pickRow("SONIC-S"));
    expect(within(dialog).getByTestId("cp-supplier")).toHaveTextContent("Nice Future");

    // IT IS NOT A CONTROL. The supplier is derived by the server from the SKU
    // (Jess, 2026-08-03); a client that could name it could name the wrong
    // factory, so there is no input, no select and no button for it.
    const supplier = within(dialog).getByTestId("cp-supplier");
    expect(supplier.querySelector("input,select,button")).toBeNull();
  });

  it("DEFECT 2 — the Source is chosen and it is what gets posted", async () => {
    await openDialog();
    fireEvent.click(pickRow("SONIC-S"));

    // The four the store can record. Spare Parts and Other… are ruled WORDS
    // with no database value, so they are absent rather than greyed — a
    // control offering a word the server refuses by name is the disease 0322
    // had to repair on the stock pool's reasons.
    // Opened by KEYBOARD: jsdom@25 has no `PointerEvent`, so a synthesised
    // pointerDown is an Event React ignores and a Radix listbox silently never
    // opens — D0.5b paid for that once already.
    const trigger = document.getElementById("cp-purpose")!;
    fireEvent.keyDown(trigger, { key: "Enter" });
    // Scoped to the LIST, because the trigger renders the chosen value too and
    // `Ready Stock` is legitimately on screen twice while the list is open.
    const list = await screen.findByRole("listbox");
    for (const w of [W.reasonReadyStock, W.reasonDisplay, W.reasonWarranty, W.reasonOffice]) {
      expect(within(list).getByText(w)).toBeInTheDocument();
    }
    expect(within(list).queryByText(W.reasonSpareParts)).toBeNull();
    expect(within(list).queryByText(W.reasonOther)).toBeNull();

    fireEvent.click(within(list).getByText(W.reasonWarranty));

    apiFetch.mockClear();
    fireEvent.click(screen.getByTestId("to-order-create-submit"));
    await waitFor(() => {
      const post = apiFetch.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === "POST",
      );
      expect(post).toBeTruthy();
      const sent = JSON.parse(String((post![1] as RequestInit).body));
      expect(sent.purpose).toBe("warranty");
      expect(sent.sku).toBe("SONIC-S");
      // NO SUPPLIER ON THE WIRE. There is no key to send and no parameter to
      // send it to — the RPC derives it.
      expect(sent).not.toHaveProperty("supplier");
      expect(sent).not.toHaveProperty("supplierId");
    });
  });

  it("Save is refused until an item is picked", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-create-purchase"));
    await screen.findByTestId("to-order-create-dialog");

    // No item yet → the commit is refused. A demand with no product is not a
    // demand, and the button says so by being unavailable rather than failing.
    expect(screen.getByTestId("to-order-create-submit")).toBeDisabled();
  });
});

describe("the seven fixes — Excel completeness", () => {
  it("header select-all unticks the visible sheet, and ticks it back", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue")); // union: Fri + Overdue
    fireEvent.click(document.getElementById("kit-table-select-all")!);
    expect(screen.queryByTestId("to-order-issue-pill")).toBeNull();
    fireEvent.click(document.getElementById("kit-table-select-all")!);
    expect(screen.getByTestId("to-order-issue-pill")).toHaveTextContent("5 selected");
  });

  it("select-all works on a FILTERED sheet — the boss's 'tick all Nice Future'", async () => {
    await loaded();
    // Untick everything, then add Monday's run and narrow to Mattress.
    fireEvent.click(screen.getByTestId("to-order-overdue")); // union
    fireEvent.click(document.getElementById("kit-table-select-all")!);
    expect(screen.queryByTestId("to-order-issue-pill")).toBeNull();
    fireEvent.click(screen.getByTestId("to-order-day-2026-08-03"));
    fireEvent.click(screen.getByTestId("to-order-cat-mattress"));
    fireEvent.click(document.getElementById("kit-table-select-all")!);
    expect(screen.getByTestId("to-order-issue-pill")).toHaveTextContent("1 selected");
  });

  it("a filter that blanks the table names its cause and hands back the way out", async () => {
    await loaded();
    // TWO COLUMN FILTERS CAN NEVER CONTRADICT EACH OTHER, and that is the
    // page's design: the options cascade (Excel's own behaviour), so a value
    // that would blank the sheet is never offered. The reachable blank is a
    // filter that survives a change of RUN — pick a model, then walk to a day
    // it does not appear on.
    fireEvent.click(screen.getByTestId("to-order-day-2026-08-03"));
    fireEvent.click(screen.getByTestId("table-filter-model"));
    fireEvent.click(screen.getByLabelText("Sonic Q"));
    fireEvent.keyDown(document.body, { key: "Escape" });
    fireEvent.click(screen.getByTestId("to-order-day-2026-08-03"));
    // Sonic Q's run is Monday; walking back to Friday leaves the filter on and
    // nothing to show.
    expect(screen.getByTestId("to-order-filters-empty")).toHaveTextContent(W.filtersEmpty);
    fireEvent.click(screen.getByTestId("to-order-clear-filters"));
    expect(screen.queryByTestId("to-order-filters-empty")).toBeNull();
    expect(screen.getByTestId("to-order-sheet")).toBeInTheDocument();
  });

  it("a narrowing filter announces itself in the footer, with the way out", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    expect(screen.queryByTestId("to-order-footer-clear")).toBeNull();
    fireEvent.click(screen.getByTestId("table-filter-model"));
    fireEvent.click(screen.getByLabelText("Cody K"));
    expect(screen.getByTestId("to-order-footer-clear")).toHaveTextContent(W.clearFilters);
    fireEvent.click(screen.getByTestId("to-order-footer-clear"));
    expect(screen.queryByTestId("to-order-footer-clear")).toBeNull();
    expect(screen.getByText("SO-1204")).toBeInTheDocument();
  });

  it("search finds a PO number too — Ordered is this page's answer", async () => {
    await loaded();
    fireEvent.change(document.getElementById("to-order-search")!, {
      target: { value: "po-9001" },
    });
    expect(screen.getByText("SO-1350")).toBeInTheDocument();
    expect(screen.queryByText("SO-1204")).toBeNull();
  });

  it("the view lives in the URL — a refresh or a shared link keeps it", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={["/?view=2026-08-03&cat=mattress"]}>
        <QueryClientProvider client={qc}>
          <OperationToOrder />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await screen.findByText("SO-1400");
    expect(screen.queryByText("SO-1204")).toBeNull();
  });

  it("while Creating, the toolbar keeps talking instead of going blank", async () => {
    let release: (() => void) | null = null;
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith("/issue")) {
        return new Promise((res) => {
          release = () =>
            res({ supplier: "x", destination: "d", pos: [{ id: "PO-1", customer: "c" }] });
        });
      }
      return route(path, init?.body ? JSON.parse(String(init.body)) : undefined);
    });
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    fireEvent.click(screen.getByTestId("to-order-issue"));
    expect(await screen.findByTestId("to-order-creating")).toHaveTextContent(W.creatingPos);
    expect(screen.queryByTestId("to-order-issue")).toBeNull();
    expect(release).not.toBeNull();
  });
});

/**
 * 2026-08-03 — WHO makes it. Supplier × category decides how many purchase
 * orders `Issue` produces, and that fact lived only in the button's `title`
 * tooltip, which a keyboard cannot reach (`01-design-tokens.md` §9).
 *
 * A scope line (`which slice am I in`) shipped beside it and was REMOVED the
 * same day: the navigator is permanently on screen with its active row lit, so
 * the line repeated what was already visible — and it printed the weekday
 * twice. It was designed from reading code instead of from looking at the page.
 * There is deliberately no test for it, because there is deliberately no line.
 */
describe("Supplier on the row", () => {
  it("the grid names the factory on every row, demand AND already-ordered", async () => {
    await loaded();
    // Clear the time narrowing so both a demand row and the receipt are in view.
    fireEvent.click(screen.getByTestId("to-order-day-2026-07-31"));

    const sheet = screen.getByTestId("to-order-sheet");
    expect(within(sheet).getAllByText(W.supplierLabel).length).toBe(1); // the header
    // Ohana is named on rows, not only in a tooltip. The receipt row (PO-9001)
    // carries it too — its supplier may have no demand at all today, which is
    // why the name rides the wire instead of being resolved from proposals.
    expect(within(sheet).getAllByText("Ohana").length).toBeGreaterThan(1);
    expect(within(sheet).getByTestId("row-po-po:PO-9001:o30")).toBeInTheDocument();
  });


  it("the flash bands draw kit icons, never a unicode glyph", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    fireEvent.click(screen.getByTestId("to-order-issue"));

    const line = await screen.findByTestId("to-order-created-line");
    // The tick is an <svg data-icon>, so it renders identically on every OS —
    // a ✓ typed into the string does not (`01-design-tokens.md` §6).
    expect(line.textContent ?? "").not.toMatch(/[✓✗⚠]/);
    const band = line.closest("div");
    expect(band?.querySelector('[data-icon="confirm"]')).not.toBeNull();
  });
});

/**
 * ONE WIDTH SYSTEM (Loo, 2026-08-03, looking at the real page: *"why all this
 * table not align and all column no equal? no standard at all?"*).
 *
 * He was right and it was measurable: the grid mixed ONE percentage, five raw
 * pixel strings and a final `auto`. Three units means nothing is proportional
 * to anything, and `auto` on the last column hands every spare pixel to the
 * shortest content on the page — the empty right-hand third he saw.
 *
 * `02-components.md` already ruled it ("give every column a width; the set sums
 * to 100"); the page was simply breaking its own kit's law. These two tests are
 * the enforcement, so it cannot drift back by hand.
 */
/**
 * P16 — LOO'S RULE ①, AS THE ONLY THING JSDOM CAN HOLD OF IT.
 *
 * **These tests do NOT prove the widths are right.** jsdom has no layout, so
 * `getBoundingClientRect()` is zero for every cell and a page test can never
 * see a truncated string. The measuring was done in a real browser at 1440,
 * 1280 and 1024 and the numbers are quoted in the PR and in the column defs.
 *
 * What a test CAN hold is that nobody quietly puts the old system back: that
 * every width is a MEASURED PIXEL rather than a share of the container, that
 * no column is `auto`, and that the leftover goes to the kit's filler instead
 * of to a column. The block this replaces asserted the opposite law — *"every
 * column is a percentage and the set sums to 100"* — and summing to 100 IS
 * the instruction "stretch to fill". It is rewritten, not deleted, because
 * the page still needs a guard on how it spends width.
 */
describe("P16 · the grid's width system — content sizes the column", () => {
  /* The measured minimums. `ceil(worst string + 16px of cell padding) + 4`,
   * or the header's own floor where that is wider (`Qty`). Changing one of
   * these is a MEASUREMENT, taken in a browser — never a guess in this file. */
  const RULED = { supplier: "111px", qty: "55px", model: "155px", po: "163px" };

  it("gives every column the pixel width its own content measured", async () => {
    await loaded();
    const widths = [...document.querySelectorAll("thead th[data-column]")].map((th) => {
      const col = [...document.querySelectorAll("colgroup col")][
        [...th.parentElement!.children].indexOf(th)
      ] as HTMLElement;
      return [(th as HTMLElement).dataset.column, col.style.width];
    });
    expect(Object.fromEntries(widths)).toEqual(RULED);
  });

  it("lets NO column absorb the slack — not a percentage, not an `auto`", async () => {
    await loaded();
    // Every column the PAGE declares is a fixed pixel. A `%` would grow with
    // the container and an `auto` would eat the remainder — the two shapes
    // this card exists to remove.
    const dataCols = [...document.querySelectorAll("thead th[data-column]")].map(
      (th) =>
        (
          [...document.querySelectorAll("colgroup col")][
            [...th.parentElement!.children].indexOf(th)
          ] as HTMLElement
        ).style.width,
    );
    expect(dataCols.length).toBe(4);
    for (const w of dataCols) expect(w).toMatch(/^\d+px$/);
  });

  it("hands the leftover to the kit's filler, which holds nothing", async () => {
    await loaded();
    const filler = document.querySelector('thead th[data-kit="table-filler"]');
    expect(filler).toBeInTheDocument();
    expect(filler!.textContent).toBe("");
    // Hidden from a screen reader: there is no fact in it to read out.
    expect(filler!.getAttribute("aria-hidden")).toBe("true");
    // It is NOT a column — it never enters `columns`, so it cannot be sorted,
    // filtered or reordered, and the header row is still the four words.
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent!.trim())).toEqual([
      "",
      "",
      W.supplierLabel,
      W.colQty,
      W.colModel,
      W.colPoNo,
    ]);
  });

  it("frames nothing — the sheet is flush, with no gutters and no radius", async () => {
    await loaded();
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "OperationToOrder.tsx"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    // The workspace column keeps its vertical air and loses the 16px sides.
    expect(src).toContain("flex-1 min-w-0 flex flex-col min-h-0 gap-2 pt-2 pb-3");
    expect(src).not.toMatch(/min-w-0 flex flex-col min-h-0 gap-2 px-4/);
    // And the grid's own wrapper no longer draws a card frame around it.
    expect(src).not.toMatch(/flex-1 min-h-0 flex flex-col rounded-card/);
  });

  it("reads Supplier · Qty · Model · PO No. — the order's own facts left", async () => {
    await loaded();
    const heads = [...document.querySelectorAll("thead th")]
      .map((th) => (th.textContent ?? "").trim())
      .filter((t) => t.length > 0);
    expect(heads).toEqual([W.supplierLabel, W.colQty, W.colModel, W.colPoNo]);
  });
});

/**
 * ONE LINE PER CUSTOMER ORDER — AutoCount's shape (Loo, 2026-08-03, from its
 * own `SO Batch Posting` screen).
 *
 * Before this, a customer buying three pieces printed their name three times,
 * and there was NOWHERE to say "this order is already partly ordered" —
 * because that is a fact about the ORDER, and every row was one item.
 */
describe("the group header — one line per customer order", () => {
  it("states the order ONCE: SO, customer, the customer's date", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));

    // ella's order has one build; PETER's has two — and PETER is named ONCE.
    const groups = [...document.querySelectorAll('[data-kit="data-group"]')];
    expect(groups.length).toBeGreaterThan(0);
    const peter = groups.find((g) => /Peter/.test(g.textContent ?? ""));
    expect(peter).toBeTruthy();
    expect(peter!.textContent).toContain("SO-1207");
    expect(peter!.textContent).toContain(fmtDate("2026-08-13"));
    // …and the whole sheet says his name exactly once, not once per piece.
    const sheet = screen.getByTestId("to-order-sheet");
    expect((sheet.textContent ?? "").match(/Peter/g)?.length).toBe(1);
  });

  it("says `Partly ordered` only when SOME of the order is on a purchase order", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));

    // Nothing in this fixture is half-ordered, so the word must be ABSENT —
    // a status that appears when it is not true is worse than none.
    expect(screen.queryByText(W.partlyOrdered)).toBeNull();

    // The receipt's group is FULLY ordered: it shows its PO number and no word
    // (a word repeating what a number already proves is noise).
    const groups = [...document.querySelectorAll('[data-kit="data-group"]')];
    const receipt = groups.find((g) => /PO-9001/.test(g.textContent ?? ""));
    expect(receipt).toBeTruthy();
    expect(receipt!.textContent).not.toContain(W.partlyOrdered);
  });

  it("a group opens ONCE however many items it holds", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    const groups = [...document.querySelectorAll('[data-kit="data-group"]')];
    const rows = [...document.querySelectorAll('[data-kit="data-row"]')];
    // Strictly fewer headers than rows: at least one order carries two pieces.
    expect(groups.length).toBeLessThan(rows.length);
  });
});

/**
 * READY STOCK WITH NO `Required By` MUST STILL BE LISTED.
 *
 * Found by pressing the real button on 2026-08-03: the demand saved, the
 * dialog closed, and the row was nowhere. The TBD guard above — written for a
 * CUSTOMER whose delivery date is not agreed yet — was swallowing it.
 *
 * They are different facts. An empty customer date means *nobody has promised
 * this yet*; an empty `Required By` on ready stock is the frozen meaning *buy
 * it on the next run*. Applying the customer rule to typed demand made it
 * stored, saved and invisible, which is the worst of the three.
 */
describe("Ready Stock is listed even with no date", () => {
  const READY = {
    key: `${OHANA}::bedframe`,
    supplierId: OHANA,
    supplierName: "Ohana",
    category: "bedframe",
    label: "Ohana · Bedframe",
    orderBy: null,
    poCount: 1,
    blocked: null,
    productionDays: 7,
    rows: [
      {
        orderId: "demand:abc-123",
        so: null,
        customer: "—",
        readyStock: true,
        destination: "Carres Klang",
        qty: 5,
        summary: "Sonic · 5",
        stockReady: null,
        delivery: null, // no Required By — buy it on the next run
        orderBy: null,
        builds: [build("d1", "Sonic", "SONIC-S", 5, "Single")],
      },
    ],
  };

  it("shows the row, and the group says Ready Stock and where it goes", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.startsWith("/api/operation/purchase/to-order/issue")) {
        return route(path, init?.body ? JSON.parse(String(init.body)) : undefined);
      }
      if (path.startsWith("/api/operation/purchase/to-order")) {
        return Promise.resolve({ ...TO_ORDER, proposals: [READY] });
      }
      return route(path, undefined);
    });
    await loaded();

    const sheet = screen.getByTestId("to-order-sheet");
    expect(within(sheet).getByText("Sonic S")).toBeInTheDocument();

    const group = [...document.querySelectorAll('[data-kit="data-group"]')].find((g) =>
      /Ready Stock/.test(g.textContent ?? ""),
    );
    expect(group).toBeTruthy();
    // It names the DESTINATION, because it has no customer to name.
    expect(group!.textContent).toContain("Carres Klang");
    // …and no SO number is invented for it.
    expect(group!.textContent).not.toMatch(/SO-/);
    // …and it does NOT borrow the customer word for an empty date: on ready
    // stock an empty Required By means *buy it on the next run*, which is the
    // opposite of *nobody has promised this yet*.
    expect(group!.textContent).not.toContain(W.noDeliveryDate);
  });
});

/**
 * ── P9 · the page says how many of each you are buying (Loo, 2026-08-04) ─────
 *
 * Two numbers, and they mean different things. The rail's CATEGORY rows count
 * UNITS still to buy; the PO SCHEDULE rows above them count customer ORDERS.
 * Both print BARE — Loo ruled `Mattress 7`, never `Mattress 7 件` — so the
 * only thing telling them apart is each row's own tooltip.
 *
 * Fixture (today = Thu 2026-07-30). Everything whose order-by has passed is
 * Overdue: ella 1 sofa · PETER 2 sofas · wong 3 bedframes · lim 1 bedframe.
 * That is FOUR customer orders and SEVEN units, which is exactly the pair
 * this card exists to stop anyone confusing. kee tong has no delivery date,
 * so is not purchasable work and is in neither number.
 */
describe("P9 — the CATEGORY rows carry a bare unit count", () => {
  const overdueOnly = () => {
    fireEvent.click(screen.getByTestId("to-order-day-2026-07-31")); // clear Friday
    fireEvent.click(screen.getByTestId("to-order-overdue"));
  };

  it("counts UNITS where the calendar above counts ORDERS — 4 orders, 7 units", async () => {
    await loaded();
    overdueOnly();
    const nav = screen.getByTestId("to-order-nav");

    // The calendar row: FOUR — customer orders.
    const overdue = within(nav).getByTestId("to-order-overdue");
    expect(overdue).toHaveTextContent("4");
    expect(overdue.getAttribute("title")).toContain("4 Orders");

    // The category rows: SEVEN units, split 3 sofa + 4 bedframe. PETER's one
    // order is two units and wong's one row is three, which is why these
    // numbers can never be read off the calendar.
    expect(within(nav).getByTestId("to-order-cat-sofa")).toHaveTextContent("Sofa3");
    expect(within(nav).getByTestId("to-order-cat-bedframe")).toHaveTextContent("Bedframe4");
    expect(within(nav).getByTestId("to-order-cat-all")).toHaveTextContent("All7");

    // The tooltip is the whole disambiguation, because the digits are bare.
    expect(within(nav).getByTestId("to-order-cat-sofa")).toHaveAttribute("title", "3 units");
    expect(within(nav).getByTestId("to-order-cat-all")).toHaveAttribute("title", "7 units");
  });

  it("a zero category still renders its row — a navigator may not change shape", async () => {
    await loaded();
    overdueOnly();
    const nav = screen.getByTestId("to-order-nav");
    // No mattress demand is overdue, and the row is still there saying so.
    expect(within(nav).getByTestId("to-order-cat-mattress")).toHaveTextContent("Mattress0");
    expect(within(nav).getByTestId("to-order-cat-pillow")).toHaveTextContent("Pillow0");
    expect(within(nav).getByTestId("to-order-cat-mattress_protector")).toHaveTextContent(
      "Mattress Protector0",
    );
  });

  it("no unit word reaches the screen — the word lives in the tooltip only", async () => {
    await loaded();
    overdueOnly();
    const nav = screen.getByTestId("to-order-nav");
    for (const k of ["all", "mattress", "bedframe", "sofa", "pillow", "mattress_protector"]) {
      const row = within(nav).getByTestId(`to-order-cat-${k}`);
      // Loo, 2026-08-04: BARE. Not `件`, not `units`, not `pcs`.
      expect(row.textContent ?? "").not.toMatch(/unit|pcs|piece|件/i);
      // …and the word IS reachable, for a hover and a screen reader.
      expect(row.getAttribute("title")).toMatch(/^\d+ units?$/);
    }
  });

  it("the count is what the click PRODUCES — it falls with every other filter", async () => {
    await loaded();
    overdueOnly();
    const nav = screen.getByTestId("to-order-nav");
    expect(within(nav).getByTestId("to-order-cat-bedframe")).toHaveTextContent("Bedframe4");

    // Search narrows the sheet, so it must narrow the promise too: lim's one
    // bedframe only. A rail that still said 4 would be advertising rows the
    // click cannot show.
    fireEvent.change(screen.getByLabelText(W.searchLabel), { target: { value: "lim" } });
    await waitFor(() =>
      expect(within(nav).getByTestId("to-order-cat-bedframe")).toHaveTextContent("Bedframe1"),
    );
    // `All` moves with it, so the two rows stay arithmetically consistent.
    expect(within(nav).getByTestId("to-order-cat-all")).toHaveTextContent("All1");
    expect(within(nav).getByTestId("to-order-cat-sofa")).toHaveTextContent("Sofa0");
  });
});

describe("P9 — the footer totals what is TICKED, per category", () => {
  const overdueOnly = () => {
    fireEvent.click(screen.getByTestId("to-order-day-2026-07-31"));
    fireEvent.click(screen.getByTestId("to-order-overdue"));
  };

  it("units per category for the ticked rows, in Loo's walking order", async () => {
    await loaded();
    overdueOnly();
    // Overdue pre-ticks itself — it is the engine's own plan.
    await waitFor(() => expect(screen.getByTestId("to-order-footer-units")).toBeInTheDocument());
    // Bedframe before Sofa: RAIL_CATEGORIES order, so the footer and the rail
    // read down in the same sequence.
    expect(screen.getByTestId("to-order-footer-units")).toHaveTextContent("Bedframe 4 · Sofa 3");
    // Mattress ticked nothing, so it is absent rather than printed as a zero.
    expect(screen.getByTestId("to-order-footer-units")).not.toHaveTextContent("Mattress");
  });

  it("VIEW-SCOPED — a filter moves the footer, because it moves what Issue acts on", async () => {
    await loaded();
    overdueOnly();
    await waitFor(() =>
      expect(screen.getByTestId("to-order-footer-units")).toHaveTextContent("Bedframe 4 · Sofa 3"),
    );

    // Excel's iron law: a tick hidden by a filter neither counts nor issues.
    // The footer comes from the same list the button acts on, so narrowing to
    // Sofa must drop the bedframes from BOTH.
    fireEvent.click(screen.getByTestId("to-order-cat-sofa"));
    await waitFor(() =>
      expect(screen.getByTestId("to-order-footer-units")).toHaveTextContent("Sofa 3"),
    );
    expect(screen.getByTestId("to-order-footer-units")).not.toHaveTextContent("Bedframe");

    // …and the ticks are remembered, not thrown away: clearing brings it back.
    fireEvent.click(screen.getByTestId("to-order-cat-sofa"));
    await waitFor(() =>
      expect(screen.getByTestId("to-order-footer-units")).toHaveTextContent("Bedframe 4 · Sofa 3"),
    );
  });

  it("the line goes with the selection — the band stays, the sentence does not", async () => {
    await loaded();
    overdueOnly();
    await waitFor(() => expect(screen.getByTestId("to-order-footer-units")).toBeInTheDocument());

    // Untick everything through the header ☑ — the same act that empties the
    // Issue pill must empty this.
    fireEvent.click(document.querySelector("thead [role=checkbox]")!);
    await waitFor(() => expect(screen.queryByTestId("to-order-issue-pill")).toBeNull());
    expect(screen.queryByTestId("to-order-footer-units")).toBeNull();
    // The band itself is not conditional — the Clear-filters button lives there.
    expect(screen.getByTestId("to-order-footer")).toBeInTheDocument();
  });

  it("units are not rows — one ticked row can be three units", async () => {
    await loaded();
    overdueOnly();
    await waitFor(() => expect(screen.getByTestId("to-order-issue-pill")).toBeInTheDocument());
    // The toolbar counts ROWS …
    expect(screen.getByTestId("to-order-issue-pill")).toHaveTextContent("5 selected");
    // … and the footer counts UNITS: SEVEN, because wong's single row is
    // three bedframes. This is the pair Loo could not read anywhere.
    expect(screen.getByTestId("to-order-footer-units")).toHaveTextContent("Bedframe 4 · Sofa 3");
  });
});

/**
 * P10 — READY STOCK IS SUGGESTED; THE HUMAN DECIDES WHETHER TO TAKE IT
 * (Loo, 2026-08-04).
 *
 * Jess's 2026-07-21 ruling is untouched: nothing auto-consumes labelled
 * stock. What was missing is that the number the engine already computed was
 * shown to nobody. Loo's option B: AutoCount's inline ⊞, using the kit's own
 * row expand — not a third pane, not a second expander.
 */
describe("P10 · ready stock on the grid", () => {
  /** The overdue view holds ella's sofa row (`bk-e`) — one build, one line. */
  const ELLA = { proposal: `${OHANA}::sofa`, orderId: "o2", buildKey: "bk-e" };

  /** The same payload with the offer put on ella's build. */
  function withOffer(freeStock: number, warehouse: string | null = "Carres Klang") {
    const body = structuredClone(TO_ORDER) as typeof TO_ORDER & {
      stockWarehouse?: string | null;
    };
    body.stockWarehouse = warehouse;
    const row = body.proposals[0].rows[0] as unknown as Record<string, unknown>;
    const b = (row.builds as Record<string, unknown>[])[0];
    b.freeStock = freeStock;
    b.freeStockItemIds = Array.from({ length: freeStock }, (_, i) => `i${i + 1}`);
    row.freeStock = freeStock;
    return body;
  }

  /** Load with a given payload, then open the view ella's row lives in. */
  async function loadedWith(body: unknown) {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.startsWith("/api/operation/purchase/to-order/take-stock")) {
        return takeResponse(init);
      }
      if (path.startsWith("/api/operation/purchase/to-order/issue")) {
        return route(path, init?.body ? JSON.parse(String(init.body)) : undefined);
      }
      if (path.startsWith("/api/operation/purchase/to-order")) return Promise.resolve(body);
      return Promise.resolve({});
    });
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
  }

  let takeResponse: (init?: RequestInit) => Promise<unknown>;
  beforeEach(() => {
    takeResponse = () => Promise.resolve({ taken: 2, reference: "SO-1204", items: 2 });
  });

  const rowKey = `${ELLA.proposal}:${ELLA.orderId}:${ELLA.buildKey}`;

  it("a row the warehouse holds nothing for is visually untouched — no control at all", async () => {
    await loadedWith(withOffer(0));
    expect(screen.queryByTestId(`table-expand-${rowKey}`)).toBeNull();
    // And every OTHER row on the page is equally untouched.
    expect(document.querySelectorAll('[data-testid^="table-expand-"]')).toHaveLength(0);
  });

  it("a row with stock gets the ⊞ — its presence IS the marker, and it carries the number", async () => {
    await loadedWith(withOffer(2));
    const ctrl = screen.getByTestId(`table-expand-${rowKey}`);
    // The number rides the label, so a screen reader gets what the ⊞ means.
    expect(ctrl).toHaveAttribute("aria-label", "Booqit — 2 available");
    expect(ctrl).toHaveAttribute("aria-expanded", "false");
  });

  it("opening the row says where the stock is and offers to take exactly that much", async () => {
    await loadedWith(withOffer(2));
    fireEvent.click(screen.getByTestId(`table-expand-${rowKey}`));
    const panel = screen.getByTestId(`to-order-stock-${rowKey}`);
    expect(panel).toHaveTextContent("Carres Klang: 2 available");
    expect(screen.getByTestId(`to-order-reserve-${rowKey}`)).toHaveTextContent("Reserve 2");
  });

  it("the number on the button is the number the row shows — never a typed one", async () => {
    await loadedWith(withOffer(2));
    fireEvent.click(screen.getByTestId(`table-expand-${rowKey}`));
    const panel = screen.getByTestId(`to-order-stock-${rowKey}`);
    // Loo's ruling 3: the system suggests, the human accepts. There is
    // nowhere on this page to type a quantity.
    expect(panel.querySelectorAll("input")).toHaveLength(0);
  });

  it("Reserve posts the ROW, and no quantity — the server owns the number", async () => {
    await loadedWith(withOffer(2));
    fireEvent.click(screen.getByTestId(`table-expand-${rowKey}`));
    fireEvent.click(screen.getByTestId(`to-order-reserve-${rowKey}`));
    await waitFor(() => {
      const call = apiFetch.mock.calls.find((c) =>
        String(c[0]).includes("/to-order/take-stock"),
      );
      expect(call).toBeTruthy();
      const body = JSON.parse(String((call![1] as RequestInit).body));
      expect(body).toEqual({ orderId: "o2", buildKey: "bk-e" });
    });
  });

  it("re-reads the whole workspace after a take — the pool is shared", async () => {
    // Issue updates the grid in place because a purchase order changes
    // nothing about its neighbours. A take DOES: the units it removed were
    // on offer to every other row of that model.
    await loadedWith(withOffer(2));
    const before = apiFetch.mock.calls.filter(
      (c) => String(c[0]) === "/api/operation/purchase/to-order",
    ).length;
    fireEvent.click(screen.getByTestId(`table-expand-${rowKey}`));
    fireEvent.click(screen.getByTestId(`to-order-reserve-${rowKey}`));
    await waitFor(() => {
      const after = apiFetch.mock.calls.filter(
        (c) => String(c[0]) === "/api/operation/purchase/to-order",
      ).length;
      expect(after).toBeGreaterThan(before);
    });
  });

  it("a refused take states the server's own reason and leaves the row open", async () => {
    await loadedWith(withOffer(2));
    takeResponse = () => Promise.reject(new Error("no_free_stock"));
    fireEvent.click(screen.getByTestId(`table-expand-${rowKey}`));
    fireEvent.click(screen.getByTestId(`to-order-reserve-${rowKey}`));
    await waitFor(() =>
      expect(screen.getByTestId(`to-order-stock-${rowKey}`)).toHaveTextContent(
        "no_free_stock",
      ),
    );
  });

  it("says why a quantity is smaller than what was asked for", async () => {
    const body = withOffer(0);
    const row = body.proposals[0].rows[0] as unknown as Record<string, unknown>;
    (row.builds as Record<string, unknown>[])[0].takenFromStock = 2;
    await loadedWith(body);
    // `rowBox` is the row's CHECKBOX; the sentence is in the row itself.
    expect(rowBox(ELLA.proposal, ELLA.orderId, ELLA.buildKey).closest("tr")).toHaveTextContent(
      "reserved 2 from stock",
    );
  });

  it("an ALREADY ORDERED row is never offered stock — there is nothing left to decide", async () => {
    const body = withOffer(2);
    await loadedWith(body);
    // The receipt row in the fixture carries a PO number and no control.
    expect(screen.queryByTestId("table-expand-po:PO-9001:o30")).toBeNull();
  });

  /**
   * ── P13① · ONE ACT, ONE WORD (Loo, 2026-08-04) ────────────────────────────
   *
   * The order drawer's picker has said `Reserve {n} to {soRef}` for this exact
   * act since 2026-06-30. P10 shipped `Take` on 2026-08-04, and Loo ruled the
   * OLDER word wins: the goods do not leave, they are LOCKED until delivery,
   * and `Take` reads as *already gone* — an operator who believes stock has
   * left will not chase it.
   */
  it("P13 — the button reads Reserve, with the system's own number", async () => {
    await loadedWith(withOffer(2));
    fireEvent.click(screen.getByTestId(`table-expand-${rowKey}`));
    expect(screen.getByTestId(`to-order-reserve-${rowKey}`)).toHaveTextContent("Reserve 2");
    expect(screen.getByTestId(`to-order-stock-${rowKey}`).textContent ?? "").not.toMatch(
      /\b(take|took|taken)\b/i,
    );
  });

  it("P13 — no rendered word anywhere on the page says Take or took", async () => {
    const body = withOffer(2);
    const row = body.proposals[0].rows[0] as unknown as Record<string, unknown>;
    // Render BOTH take-path strings at once: the offer and the past-tense fact.
    (row.builds as Record<string, unknown>[])[0].takenFromStock = 2;
    await loadedWith(body);
    fireEvent.click(screen.getByTestId(`table-expand-${rowKey}`));
    expect(document.body.textContent ?? "").not.toMatch(/\b(take|took|taken|takes)\b/i);
    expect(document.body.textContent ?? "").toContain("reserved 2 from stock");
  });
});

/**
 * ── P12 · a demand can be cancelled, and so can the remainder of a
 *    part-ordered one (Loo, 2026-08-04) ──────────────────────────────────────
 *
 * *"Ordered 3, don't want the other 2"* is an ordinary day. The 3 already
 * ordered are the purchase order's problem (`PURCHASING-WORKING-FLOW.md` §9);
 * what this page owns is the REMAINDER — which is exactly the number the row
 * already prints, because the api builds a demand row from the database's
 * GENERATED `remaining_qty`.
 *
 * The button and the door ship together: a route with no caller is the bypass
 * C1 deleted, and a button with no door is the same fault reversed.
 */
describe("P12 — Cancel on a demand row", () => {
  /**
   * A demand of 5 with 3 already on a purchase order — the card's own case.
   * What reaches the page is the REMAINDER, 2: the row is here only because
   * that number is above zero.
   */
  const PART_ORDERED = {
    key: `${OHANA}::bedframe`,
    supplierId: OHANA,
    supplierName: "Ohana",
    category: "bedframe",
    label: "Ohana · Bedframe",
    orderBy: null,
    poCount: 1,
    blocked: null,
    productionDays: 7,
    rows: [
      {
        orderId: "demand:6299ed4e-3c91-43c5-b41b-1e8fe9677c7d",
        so: null,
        customer: "—",
        readyStock: true,
        destination: "Carres Klang",
        qty: 2,
        summary: "Sonic · 2",
        stockReady: null,
        delivery: null,
        orderBy: null,
        builds: [build("d1", "Sonic", "SONIC-S", 2, "Single")],
      },
    ],
  };

  const cancelCalls: { path: string; body: unknown }[] = [];
  let cancelFails: string | null = null;

  async function loadedWithDemand(proposals: unknown[] = [PART_ORDERED]) {
    cancelCalls.length = 0;
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (/\/demand\/[^/]+\/cancel$/.test(path)) {
        cancelCalls.push({ path, body: JSON.parse(String(init?.body ?? "{}")) });
        return cancelFails
          ? Promise.reject(new Error(cancelFails))
          : Promise.resolve({ id: "x", cancelled: 2, issued: 3 });
      }
      if (path.startsWith("/api/operation/purchase/to-order/issue")) {
        return route(path, init?.body ? JSON.parse(String(init.body)) : undefined);
      }
      if (path.startsWith("/api/operation/purchase/to-order")) {
        return Promise.resolve({ ...TO_ORDER, proposals });
      }
      return route(path, undefined);
    });
    await loaded();
  }

  beforeEach(() => {
    cancelFails = null;
  });

  it("a typed demand row offers Cancel; a customer requirement never does", async () => {
    await loadedWithDemand([PART_ORDERED, ...TO_ORDER.proposals]);
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    const sheet = screen.getByTestId("to-order-sheet");
    /**
     * EXACTLY ONE, and that is the load-bearing assertion. Cancelling a
     * CUSTOMER's order is the Orders module's act; a second door to it here
     * would be a second truth about the same decision. Every other row on
     * screen is a customer requirement and gets no control at all.
     */
    expect(within(sheet).getAllByRole("button", { name: W.cancelDemand })).toHaveLength(1);
  });

  it("the dialog states what is being cancelled — the REMAINDER, and nobody types it", async () => {
    await loadedWithDemand();
    fireEvent.click(screen.getAllByRole("button", { name: W.cancelDemand })[0]);

    const dialog = await screen.findByTestId("to-order-cancel-dialog");
    expect(within(dialog).getByText("Sonic S")).toBeInTheDocument();
    // 2 — what is LEFT to buy, not the 5 that was originally asked for.
    expect(screen.getByTestId("to-order-cancel-qty")).toHaveTextContent("2");
    // NO quantity field anywhere: a cancel takes the whole remainder, and a
    // number a human types is a number a human can get wrong.
    expect(
      [...dialog.querySelectorAll("input")].filter((i) => i.type !== "hidden"),
    ).toHaveLength(0);
  });

  it("a reason is mandatory — the confirm button will not arm without one", async () => {
    await loadedWithDemand();
    fireEvent.click(screen.getAllByRole("button", { name: W.cancelDemand })[0]);
    await screen.findByTestId("to-order-cancel-dialog");

    const submit = screen.getByTestId("to-order-cancel-submit");
    expect(submit).toBeDisabled();
    // Whitespace is not a reason.
    fireEvent.change(screen.getByLabelText(W.cancelReason), { target: { value: "   " } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(W.cancelReason), {
      target: { value: "do not want the other 2" },
    });
    expect(submit).not.toBeDisabled();
    expect(cancelCalls).toHaveLength(0);
  });

  it("confirming sends the demand's id and the reason, and nothing else", async () => {
    await loadedWithDemand();
    fireEvent.click(screen.getAllByRole("button", { name: W.cancelDemand })[0]);
    await screen.findByTestId("to-order-cancel-dialog");
    fireEvent.change(screen.getByLabelText(W.cancelReason), {
      target: { value: "do not want the other 2" },
    });
    fireEvent.click(screen.getByTestId("to-order-cancel-submit"));

    await waitFor(() => expect(cancelCalls).toHaveLength(1));
    // The DEMAND's uuid, taken off `demand:<uuid>` — never the grid row key.
    expect(cancelCalls[0].path).toBe(
      "/api/operation/purchase/to-order/demand/6299ed4e-3c91-43c5-b41b-1e8fe9677c7d/cancel",
    );
    expect(cancelCalls[0].body).toEqual({ reason: "do not want the other 2" });
    // The dialog closes only on success.
    await waitFor(() => expect(screen.queryByTestId("to-order-cancel-dialog")).toBeNull());
  });

  it("a refusal stays in the dialog with the reason intact", async () => {
    cancelFails = "already cancelled";
    await loadedWithDemand();
    fireEvent.click(screen.getAllByRole("button", { name: W.cancelDemand })[0]);
    await screen.findByTestId("to-order-cancel-dialog");
    fireEvent.change(screen.getByLabelText(W.cancelReason), { target: { value: "oops" } });
    fireEvent.click(screen.getByTestId("to-order-cancel-submit"));

    // A cancel that did not happen must not look like one that did.
    expect(await screen.findByTestId("to-order-cancel-failed")).toHaveTextContent(
      "already cancelled",
    );
    expect(screen.getByTestId("to-order-cancel-dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(W.cancelReason)).toHaveValue("oops");
  });

  it("an ordered row offers no Cancel — its PO cell is a receipt, not a decision", async () => {
    await loadedWithDemand([]);
    const sheet = screen.getByTestId("to-order-sheet");
    // The fixture's ordered receipt (PO-9001) is all that is left; nothing is
    // cancellable, and the PO cell prints its number exactly as before.
    expect(within(sheet).queryByRole("button", { name: W.cancelDemand })).toBeNull();
  });
});

/**
 * P12 — CANCEL IS NOT DELETE, on the page as well as in the api (Loo,
 * 2026-08-04). A SOURCE SCAN, because what is claimed is that no control
 * exists ANYWHERE — a render test only sees the branches its fixture reaches,
 * and this page is thousands of lines of branches. Comments are stripped
 * first: the file is full of prose about why there is no delete, and a scan
 * that reads its own tombstone fails on the text explaining it.
 */
describe("the page offers no way to delete a demand", () => {
  /**
   * P14 — BOTH FILES, and the second one is not a widening of the claim.
   * `CreatePurchaseDialog` moved out of this page on 2026-08-04 and took the
   * create door with it. A scan that still named only `OperationToOrder.tsx`
   * would go on passing while seeing HALF the demand doors — the same silent
   * shrink that let `sent via whatsapp` reach production under 51 green render
   * tests. The expected values below are untouched: the scan's scope follows
   * the code so that its ASSERTION can stay exactly what it was.
   */
  /**
   * P15 — THE COMMENT STRIPPER BLINDED ITSELF, and the order of two lines is
   * the whole fix.
   *
   * `{…/*…*​/…}` ran FIRST, and its leading `\{\s*` will start at ANY brace
   * followed by whitespace and a `/*`. A function body that opens with a
   * doc comment is exactly that shape, so the match ran from the function's
   * own `{` to the first `*​/}` it could find and deleted **5,868 characters
   * of live code** — including both of this dialog's demand doors. The scan
   * went on passing while seeing half the file, which is the silent shrink
   * the note above records having already been paid for once.
   *
   * Stripping ordinary block comments FIRST cannot do that: the match begins
   * at `/*`, so it can never swallow the code in front of one. The JSX form
   * is then left in place as the no-op it has become — deleting it would be a
   * claim about JSX this test has no reason to make.
   *
   * It is caught rather than theoretical: the create-door assertion below
   * failed on its own the moment this file gained a doc comment.
   */
  const scan = (file: string) =>
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      // Every `${…}` collapses to `:id` BEFORE anything is extracted. Written
      // the other way round the path scan stopped at the first `)` inside
      // `encodeURIComponent(demandId)` and reported a path nobody wrote — a
      // scan can only be evidence about the page once it is evidence about
      // itself.
      .replace(/\$\{[^{}]*\}/g, ":id");

  const src = [scan("OperationToOrder.tsx"), scan("CreatePurchaseDialog.tsx")].join("\n");

  /**
   * THE VISIBLE-WORD HALF IS ASSERTED AGAINST THE WORDS MODULE, NOT THE PAGE
   * SOURCE, and that is the stronger claim rather than the easier one. Every
   * fixed string on this page comes from `TO_ORDER_WORDS` — its own law is
   * *"a word that is not here has not been ruled"* — so a word that is not in
   * it cannot reach the screen. Scanning the .tsx for a quoted `delete`
   * instead reads `n.delete(id)` (an ordinary `Set` call) the moment an
   * unpaired apostrophe upstream lets the match span into it, which is what
   * this test did on its first run.
   */
  it("no ruled word on this page says delete or purge", () => {
    /**
     * `delete` and `purge` ONLY. `Remove` is deliberately not banned, and
     * finding out why is the useful part: `itemsRemove` exists in this module
     * for the PREVIEW's item table — taking a line out of a purchase order
     * that has not been created yet, which destroys no record because there is
     * none. Banning the string would have failed on a word that means the
     * opposite of the thing the card forbids. (It also has ZERO consumers
     * today, which is reported in the card and is not this test's business.)
     */
    const offenders = Object.entries(W).filter(
      ([, v]) => typeof v === "string" && /\b(delete|purge)\b/i.test(v),
    );
    expect(offenders).toEqual([]);
  });

  it("the page calls no DELETE method and reaches no delete path", () => {
    expect(src).not.toMatch(/method:\s*["'`]DELETE["'`]/i);
    expect(src).not.toMatch(/["'`][^"'`\n]*\/(delete|purge|remove)\b/i);
  });

  /**
   * P15 adds a THIRD path and it is a READ. The two WRITE doors below are
   * byte-untouched — create and cancel, exactly as P12 and P14 left them —
   * and `pick-items` is a `GET` that answers what the picker may choose from.
   * It is listed rather than excluded by a filter: this assertion's value is
   * that it names EVERY path, so a door added quietly is a failure.
   */
  it("the only demand doors the page opens are create, cancel and the picker read", () => {
    const paths = [...src.matchAll(/to-order\/demand[a-z:/-]*/g)].map((m) => m[0]);
    expect([...new Set(paths)].sort()).toEqual([
      "to-order/demand",
      "to-order/demand/:id/cancel",
      "to-order/demand/pick-items",
    ]);
  });
});

/**
 * P13① — ONE ACT, ONE WORD (Loo, 2026-08-04).
 *
 * The order drawer's picker has said `Reserve {n} to {soRef}` for this exact
 * act since 2026-06-30. To Order shipped `Take` on 2026-08-04, and Loo ruled
 * the OLDER word wins: the goods do not leave, they are LOCKED until delivery,
 * and `Take` reads as *already gone*.
 *
 * BOTH HALVES ARE ASSERTED — that the new screen moved, and that the old one
 * did NOT. A rename card's real risk is that it "harmonises" in the wrong
 * direction, so the drawer's two strings are pinned byte for byte.
 */
describe("P13 · the OLDER screen is the one that does not move", () => {
  const here = dirname(fileURLToPath(import.meta.url));

  it("THE DRAWER IS NOT TOUCHED — its wording is byte-identical", () => {
    const dialog = readFileSync(join(here, "components/ReserveStockDialog.tsx"), "utf8");
    const picker = readFileSync(join(here, "components/StockPickerGrid.tsx"), "utf8");
    // The two strings Loo named. Reproduced here character for character so a
    // later "harmonisation" of the older screen fails this test.
    expect(dialog).toContain("`Reserve ${checked.size} to ${soRef}`");
    expect(dialog).toContain("Reserve ready stock");
    expect(picker).toContain("`Reserve ${checked.size} to ${soRef}`");
    expect(picker).toContain("`Reserve this unit to ${soRef}`");
  });
});

/**
 * ── Q6 · To Order audited against the Purchase Orders architecture ──────────
 *
 * An AUDIT, not a redesign (P7 owns the redesign), so what ships is the two
 * things the audit found true, turned into guards. A conclusion that lives
 * only in a document is one hand away from being undone by accident.
 *
 * ① THE PORTAL-WIDE DATE DICTIONARY (`PURCHASING-INFORMATION-MODEL.md` §12.2,
 *    ruled by Loo 2026-08-04). Four facts, four words — `Ready Date` ·
 *    `Expected Arrival` · `Received At` · `Customer Delivery` — and THREE
 *    retired spellings that all named fact ②: `Goods Arrival`, `Stock` and
 *    `Stock ETA` (`ETA` itself is a banned word). Measured 2026-08-04: this
 *    page carries none of the three, in the source OR on the live page. This
 *    guard is what keeps that true.
 *
 * ② THE TWO KIT POWERS THIS PAGE DELIBERATELY DOES NOT WIRE — `resize` and
 *    `reorder`. CLAUDE.md §13.3 asks one question of every kit power, *will
 *    this make the operator finish faster today?*, and on THIS page, measured
 *    on production, the answer is no for both (the reasoning is beside the
 *    `DataTable` in the page). The absence is asserted for the same reason
 *    #601 asserted the absence of footer totals on Purchase Orders: a power
 *    that quietly appears later is exactly the failure §13.3 exists to stop.
 */
describe("Q6 · the audit's two findings, as guards", () => {
  /**
   * THE WORDS MODULE IS THE STRONGER CLAIM, and the same argument P12's scan
   * makes: every fixed string on this page comes from `TO_ORDER_WORDS`, whose
   * own law is *"a word that is not here has not been ruled"* — so a retired
   * word that is not in it cannot reach the screen through any branch, not
   * only through the branches a fixture happens to render.
   */
  it("no ruled word on this page spells a retired date", () => {
    const offenders = Object.entries(W).filter(
      ([, v]) =>
        typeof v === "string" && /(goods\s+arrival|stock\s+eta|\bETA\b)/i.test(v),
    );
    expect(offenders).toEqual([]);
  });

  /**
   * `Customer Delivery` is pinned rather than deleted, and that is the point.
   * The fact moved onto the GROUP HEADER as a bare date when the identity
   * columns left (2026-08-03), so it labels nothing today — but §12.2 rules
   * the word for the day anybody labels that slot, and a constant nobody can
   * read is how the next chat invents `Preferred Delivery` again.
   */
  it("the customer's date keeps §12.2's own word, ready for the day it is labelled", () => {
    expect(W.colPreferred).toBe("Customer Delivery");
  });

  /**
   * The rendered half, and it is deliberately narrower than the scan above:
   * only the two-word spellings are checked here, because a bare `ETA` could
   * one day be three characters inside a real model name and a guard that
   * fails on the catalog is a guard somebody deletes.
   */
  it("nothing rendered — customer work or ready stock — says Goods Arrival or Stock ETA", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    expect(document.body.textContent ?? "").not.toMatch(/goods\s+arrival|stock\s+eta/i);
  });

  /**
   * §13.3, answered rather than obeyed. Both controls are the kit's ONE
   * `layout` prop, so this single assertion covers both refusals: no prop, no
   * handle, no draggable header.
   */
  it("no column may be resized and none may be dragged — §13.3 answered, not silent", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    expect(document.querySelectorAll('[data-testid^="table-resize-"]')).toHaveLength(0);
    expect(document.querySelectorAll('thead th[draggable="true"]')).toHaveLength(0);
    // …while the two powers the page DOES wire are untouched by the refusal.
    expect(document.querySelectorAll('[data-kit="data-group"]').length).toBeGreaterThan(0);
    // ⊞ + ☑ + the four business columns + P16's filler. The count was 6
    // before P16 and the SEVENTH is not a column: it carries no word, no
    // sort and no filter, and `P16 · the grid's width system` above pins
    // both halves of that — what it is, and that the header row is still
    // the same four words.
    expect(document.querySelectorAll("colgroup col")).toHaveLength(7);
  });
});
