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

function route(path: string, body?: { category?: string; purchaseOrders?: { key: string }[] }) {
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
    for (const b of bars) expect(b.className).toContain("border-kit-red-9");

    // Swap to the first upcoming run — NOT overdue, same table, no red.
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    fireEvent.click(screen.getByTestId("to-order-day-2026-07-31"));
    const calm = [...document.querySelectorAll('[data-kit="data-row"] td:first-child')];
    expect(calm.length).toBeGreaterThan(0);
    for (const b of calm) {
      expect(b.className).toContain("border-transparent");
      expect(b.className).not.toContain("border-kit-red-9");
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

describe("+ Create Purchase — the entrance is real, the save is next", () => {
  it("asks FIVE things and offers no purpose, no supplier, nothing disabled", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-create-purchase"));
    const dialog = await screen.findByTestId("to-order-create-dialog");

    // Item · Quantity · Deliver To · Required By · Remark (Jess, 2026-08-03).
    for (const w of [W.itemLabel, W.itemsColQty, W.destination, W.requiredBy, W.remark]) {
      expect(within(dialog).getByText(w)).toBeInTheDocument();
    }

    // NO purpose picker: V1 buys one thing, so choosing is not a question.
    expect(within(dialog).queryByText(W.reason)).toBeNull();
    expect(within(dialog).queryByText(W.reasonReadyStock)).toBeNull();
    // NO supplier picker: a product has one factory and the server derives it.
    expect(within(dialog).queryByText(W.supplierLabel)).toBeNull();
    // Category was never asked and still is not.
    expect(within(dialog).queryByText("Category")).toBeNull();

    // NOTHING DISABLED AND NO PLACEHOLDER — Display and Office begin at other
    // portals, and a greyed control here would promise this page owns them.
    expect(screen.queryByText(W.nextUpdate)).toBeNull();
    expect(within(dialog).queryByText(/Display|Office/)).toBeNull();
  });

  it("Save is refused until an item is picked, then posts what the server needs", async () => {
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
describe("the grid's width system", () => {
  it("every column is a PERCENTAGE and the set sums to 100 with the checkbox", async () => {
    await loaded();
    const cols = [...document.querySelectorAll("colgroup col")] as HTMLElement[];
    expect(cols.length).toBe(5); // ☑ + Supplier · Qty · Model · PO No.

    for (const c of cols) expect(c.style.width).toMatch(/^\d+(\.\d+)?%$/); // no px, no auto
    const total = cols.reduce((s, c) => s + parseFloat(c.style.width), 0);
    expect(total).toBe(100);
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

// ── P10 · ready stock is suggested; the human decides whether to take it ────

/**
 * `ella`'s sofa row (`o2` / `bk-e`) is the one the offer is hung on: it is a
 * build of ONE line, it is in the default view, and its SO is 1204 — so every
 * assertion below reads the same row the fixture already exercises.
 */
const ELLA_ROW = `${OHANA}::sofa:o2:bk-e`;

function withOffer(offer: unknown) {
  return {
    ...TO_ORDER,
    proposals: TO_ORDER.proposals.map((p, i) =>
      i !== 0
        ? p
        : {
            ...p,
            rows: p.rows.map((r) =>
              r.orderId !== "o2"
                ? r
                : { ...r, builds: [{ ...r.builds[0], stock: offer }] },
            ),
          },
    ),
  };
}

function serveOffer(offer: unknown) {
  apiFetch.mockImplementation((path: string, init?: RequestInit) => {
    if (
      path.startsWith("/api/operation/purchase/to-order") &&
      !path.includes("/issue")
    ) {
      return Promise.resolve(withOffer(offer));
    }
    return route(path, init?.body ? JSON.parse(String(init.body)) : undefined);
  });
}

const OFFER = {
  available: 2,
  takeable: 2,
  itemIds: ["u1", "u2"],
  stockSku: "Booqit-1A",
  warehouse: "Carres Klang",
};

describe("P10 — ready stock on the row", () => {
  it("changes NOTHING when the floor has nothing to offer", async () => {
    // The whole page today, measured: the expand control is a 3% column on
    // every row, so it is not paid for until something can actually open.
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue")); // ella lives here
    expect(document.querySelectorAll('[data-testid^="table-expand-"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-testid^="row-stock-"]')).toHaveLength(0);
  });

  it("marks the row with the units the floor holds, and says where", async () => {
    serveOffer(OFFER);
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue")); // ella lives here
    const marker = await screen.findByTestId(`row-stock-${ELLA_ROW}`);
    expect(marker).toHaveTextContent("2");
    expect(marker).toHaveAttribute("title", "Carres Klang · 2 free");
  });

  it("does not net the suggestion out of the quantity to buy", async () => {
    // `consumeFreeStock` stays OFF (Jess, 2026-07-21). The row still says buy 1.
    serveOffer(OFFER);
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue")); // ella lives here
    const marker = await screen.findByTestId(`row-stock-${ELLA_ROW}`);
    const tr = marker.closest("tr")!;
    // Qty is the one right-aligned column in this grid (Loo, 2026-08-03).
    expect(tr.querySelector("td.text-right")).toHaveTextContent("1");
    expect(marker).toHaveTextContent("2");
  });

  it("gives ONLY the offered row a control to open", async () => {
    serveOffer(OFFER);
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue")); // ella lives here
    await screen.findByTestId(`row-stock-${ELLA_ROW}`);
    const controls = document.querySelectorAll('[data-testid^="table-expand-"]');
    expect(controls).toHaveLength(1);
    expect(controls[0]).toHaveAttribute("data-testid", `table-expand-${ELLA_ROW}`);
  });

  it("opens to the two numbers and a button that names what it takes", async () => {
    serveOffer(OFFER);
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue")); // ella lives here
    fireEvent.click(await screen.findByTestId(`table-expand-${ELLA_ROW}`));
    const panel = await screen.findByTestId("ready-stock-panel");
    expect(panel).toHaveTextContent("Carres Klang · 2 free");
    expect(within(panel).getByTestId("ready-stock-reserve")).toHaveTextContent(
      "Reserve 2 to SO-1204",
    );
  });

  it("will not take a unit until somebody says why — K4's law", async () => {
    serveOffer(OFFER);
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue")); // ella lives here
    fireEvent.click(await screen.findByTestId(`table-expand-${ELLA_ROW}`));
    const panel = await screen.findByTestId("ready-stock-panel");
    const button = within(panel).getByTestId("ready-stock-reserve");
    expect(button).toBeDisabled();
    fireEvent.change(within(panel).getByTestId("pool-reason"), {
      target: { value: "sales_urgent" },
    });
    expect(button).not.toBeDisabled();
  });

  it("takes through K4's door — one call per record, with the reason", async () => {
    serveOffer(OFFER);
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue")); // ella lives here
    fireEvent.click(await screen.findByTestId(`table-expand-${ELLA_ROW}`));
    const panel = await screen.findByTestId("ready-stock-panel");
    fireEvent.change(within(panel).getByTestId("pool-reason"), {
      target: { value: "sales_urgent" },
    });
    fireEvent.click(within(panel).getByTestId("ready-stock-reserve"));
    await waitFor(() => {
      const calls = apiFetch.mock.calls.filter(
        (c) => String(c[0]) === "/api/ops/stock/reserve-item",
      );
      expect(calls).toHaveLength(2);
      expect(JSON.parse(String((calls[0][1] as RequestInit).body))).toEqual({
        itemId: "u1",
        ref: "SO-1204",
        reason: "sales_urgent",
        note: null,
      });
      expect(JSON.parse(String((calls[1][1] as RequestInit).body))).toMatchObject({
        itemId: "u2",
      });
    });
  });

  it("offers no press at all when nothing can be taken without over-reserving", async () => {
    // The floor holds a 2-unit record and the row needs 1. The register moves
    // WHOLE records, so the honest answer is the two numbers and no button.
    serveOffer({ ...OFFER, takeable: 0, itemIds: [] });
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue")); // ella lives here
    fireEvent.click(await screen.findByTestId(`table-expand-${ELLA_ROW}`));
    const panel = await screen.findByTestId("ready-stock-panel");
    expect(panel).toHaveTextContent("Carres Klang · 2 free");
    expect(within(panel).queryByTestId("ready-stock-reserve")).toBeNull();
    expect(within(panel).queryByTestId("pool-reason")).toBeNull();
  });
});
