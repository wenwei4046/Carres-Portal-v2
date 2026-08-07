import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TO_ORDER_WORDS as W } from "@carres/shared";
import OperationToOrder from "./OperationToOrder";
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";

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
      // P18 — a RECEIPT carries the order fact too. An order whose every line
      // is bought has no demand rows left, so this is the only place its group
      // header could read the plan from.
      proceedDate: "2026-07-28",
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
          // P18 — PASSED (today is 2026-07-30), so the header states the wait.
          proceedDate: "2026-07-15",
          orderBy: "2026-07-15", // overdue → folds into Today
          builds: [build("bk-e", "Booqit", "5539-1A(LHF)")],
        },
        {
          orderId: "o1", so: 1207, customer: "PETER", qty: 2,
          summary: "Booqit · 2 Sofas", stockReady: "2026-08-13",
          delivery: "2026-08-13",
          // P18 — STILL AHEAD of today (2026-07-30). This is the live SO-1256
          // shape, and the reason Loo ruled the count conditional: unconditional
          // it printed `(-2 days)`.
          proceedDate: "2026-08-01",
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
    // Rolling from Thursday: Fri · Mon · Wed — 3 configured days, 3 rows, no
    // Today (Thursday is not a PO day), no stale Monday. Each row prints
    // weekday + DATE in one format (Loo, 2026-08-06: `Fri 31 Jul`, never a
    // bare weekday), and the full spelling stays on the hover.
    expect(within(nav).getByTestId("to-order-day-2026-07-31")).toHaveTextContent("Fri 31 Jul");
    expect(within(nav).getByTestId("to-order-day-2026-07-31")).toHaveTextContent("0");
    expect(within(nav).getByTestId("to-order-day-2026-08-03")).toHaveTextContent("Mon 3 Aug");
    expect(within(nav).getByTestId("to-order-day-2026-08-05")).toHaveTextContent("Wed 5 Aug");
    // Never the bare weekday word alone.
    expect(within(nav).queryByText(/^Friday$/)).toBeNull();
    // The hover keeps the full date.
    expect(
      within(nav).getByTestId("to-order-day-2026-07-31").getAttribute("title"),
    ).toContain(fmtDate("2026-07-31"));
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
  it("T1 — every fact has a column; the order's facts print ONCE, aligned", async () => {
    await loaded();
    // The TEN, in Loo's approved order (T1 2026-08-06, extended by T1.1 the
    // same day and by T3): the identity columns render their facts on the
    // aligned ORDER line; the two T1.1 additions are the two facts that were
    // homeless — `Proceed date`, which T1 parked under `Supplier` in an
    // unheaded span, and `Ready Stock`, which had no home on screen at all —
    // and T3's `On PO` is the third, computed by the engine since the day it
    // was written and read by nobody.
    const heads = [...document.querySelectorAll("thead th")]
      .map((t) => (t.textContent ?? "").trim())
      .filter((t) => t.length > 0);
    expect(heads).toEqual([
      W.colSoNo,
      W.colCustomer,
      W.colPreferred,
      W.proceedDate,
      W.supplierLabel,
      W.colQty,
      W.colModel,
      W.colReadyStock,
      W.colOnPo,
      W.colPoNo,
    ]);
    expect(screen.queryByText("Category")).toBeNull();
    expect(screen.queryByText(/Order by/i)).toBeNull();
    expect(screen.queryByText("Stock ready")).toBeNull();
  });

  it("T1 — an ITEM row leaves the identity cells blank; the order line fills them", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    // PETER's order: the group line says SO-1207 · Peter · the date; his two
    // item rows say none of it — the fact is stated once, in its column.
    const rows = [...document.querySelectorAll('[data-kit="data-row"]')];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const tds = [...r.querySelectorAll("td")];
      // [0]=⊞ gutter, [1]=☑, [2]=SO No., [3]=Customer, [4]=Delivery.
      expect(tds[2]?.textContent ?? "").toBe("");
      expect(tds[3]?.textContent ?? "").toBe("");
      expect(tds[4]?.textContent ?? "").toBe("");
    }
    const sheet = screen.getByTestId("to-order-sheet");
    expect((sheet.textContent ?? "").match(/Peter/g)?.length).toBe(1);
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
    // td[7] is the Model cell under T1's ten-col grid: ⊞ · ☑ · SO No. ·
    // Customer · Delivery · Supplier · Qty · MODEL · PO No. · filler.
    const models = () =>
      [...document.querySelectorAll('[data-kit="data-row"]')].map(
        (tr) => tr.querySelectorAll("td")[7]?.textContent ?? "",
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

  // T1 (Loo, 2026-08-06) — THE THREE ▼ ARE BACK WITH THEIR COLUMNS. The one
  // capability 2026-08-03 recorded as lost (filtering to a delivery date) was
  // missed and returns as its own decision, on the portal's shared Excel date
  // machinery.
  it("the SO No. and Customer ▼ are back and narrow the sheet", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    const sheet = () => within(screen.getByTestId("to-order-sheet"));
    fireEvent.click(screen.getByTestId("table-filter-so"));
    fireEvent.click(screen.getByLabelText("SO-1300"));
    expect(sheet().getByText("SO-1300")).toBeInTheDocument();
    expect(sheet().queryByText("SO-1204")).toBeNull();
    fireEvent.click(screen.getByTestId("table-filter-clear-so"));
    // Customer speaks the display spelling — `PETER` is typed, `Peter` reads.
    fireEvent.click(screen.getByTestId("table-filter-customer"));
    fireEvent.click(screen.getByLabelText("Peter"));
    expect(sheet().getByText("SO-1207")).toBeInTheDocument();
    expect(sheet().queryByText("SO-1300")).toBeNull();
  });

  it("the Delivery ▼ speaks Excel — Overdue · presets · the data's months · a custom range", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    fireEvent.click(screen.getByTestId("table-filter-delivery"));
    // Overdue leads (the fact an operator hunts), then Excel's own six.
    for (const label of [W.filterOverdue, "Today", "This Week", "This Month", "Last Month"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    // The months the sheet holds — Jul + Aug 2026 in this fixture.
    expect(screen.getByLabelText("Aug 2026")).toBeInTheDocument();
    expect(screen.getByLabelText("Jul 2026")).toBeInTheDocument();
    // The custom pair is offered under them.
    expect(screen.getByTestId("table-filter-range-from-delivery")).toBeInTheDocument();

    // `Overdue` narrows to the customer whose date has passed.
    fireEvent.click(screen.getByLabelText(W.filterOverdue));
    expect(screen.getByText("SO-1204")).toBeInTheDocument();
    expect(screen.queryByText("SO-1207")).toBeNull();
    fireEvent.click(screen.getByLabelText(W.filterOverdue));

    // A month bucket narrows to it (Excel ORs a checklist).
    fireEvent.click(screen.getByLabelText("Jul 2026"));
    expect(screen.getByText("SO-1204")).toBeInTheDocument();
    expect(screen.queryByText("SO-1300")).toBeNull();
    fireEvent.click(screen.getByLabelText("Jul 2026"));

    // The custom range reaches exactly the days it names.
    fireEvent.change(screen.getByTestId("table-filter-range-from-delivery"), {
      target: { value: "2026-08-10" },
    });
    fireEvent.change(screen.getByTestId("table-filter-range-to-delivery"), {
      target: { value: "2026-08-20" },
    });
    fireEvent.click(screen.getByTestId("table-filter-range-apply-delivery"));
    expect(screen.getByText("SO-1300")).toBeInTheDocument(); // 15 Aug
    expect(screen.queryByText("SO-1204")).toBeNull(); // 20 Jul
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
    expect(document.getElementById("kit-table-row-po:PO-9001:o30:0")).toBeNull(); // no checkbox
    expect(screen.getByTestId("row-po-po:PO-9001:o30:0")).toHaveTextContent("PO-9001");
    // It is DONE work — it must not inflate the rail's counts.
    expect(screen.getByTestId("to-order-day-2026-07-31")).toHaveTextContent("0");
  });

  it("its PO No. lands on Purchase Orders with THAT document opened", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("row-po-po:PO-9001:o30:0"));
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
    // P19 — the testid gained the line's index, because the supplier is a fact
    // about ONE line and a dialog now holds several. The ASSERTION is P15's,
    // byte for byte; only the row it addresses is named.
    expect(within(dialog).queryByTestId("cp-supplier-0")).toBeNull();

    fireEvent.click(pickRow("SONIC-S"));
    expect(within(dialog).getByTestId("cp-supplier-0")).toHaveTextContent("Nice Future");

    // IT IS NOT A CONTROL. The supplier is derived by the server from the SKU
    // (Jess, 2026-08-03); a client that could name it could name the wrong
    // factory, so there is no input, no select and no button for it.
    const supplier = within(dialog).getByTestId("cp-supplier-0");
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

/**
 * P19 — Create Purchase takes many lines (Loo, 2026-08-05).
 *
 * The whole card is the FORM. `purchase_demands` is one row per SKU by the
 * frozen model, so N lines is N rows from one submit and nothing in the schema
 * or the api route moved. What these tests hold is therefore the two things a
 * form can get wrong: that the HEADER is asked once and reaches every row, and
 * that a partial failure behaves like the page's own frozen Issue — **what
 * succeeded stays created.**
 */
describe("+ Create Purchase — many lines, one submit (P19)", () => {
  const pickRow = (sku: string) =>
    screen.getByText(sku, { selector: ".font-mono" }).closest("tr")!;

  /** Fill line `i`: focus it, search, pick, then type the quantity and remark. */
  function fillLine(i: number, sku: string, qty?: string, remark?: string) {
    fireEvent.focus(document.getElementById(`cp-item-${i}`)!);
    fireEvent.click(pickRow(sku));
    if (qty !== undefined) {
      fireEvent.change(document.getElementById(`cp-qty-${i}`)!, { target: { value: qty } });
    }
    if (remark !== undefined) {
      fireEvent.change(document.getElementById(`cp-remark-${i}`)!, {
        target: { value: remark },
      });
    }
  }

  async function openDialog() {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-create-purchase"));
    await screen.findByTestId("to-order-create-dialog");
    await waitFor(() => expect(pickRow("5539-CNR")).toBeTruthy());
  }

  const posted = () =>
    apiFetch.mock.calls
      .filter((c) => (c[1] as RequestInit | undefined)?.method === "POST")
      .map((c) => JSON.parse(String((c[1] as RequestInit).body)));

  it("three items go in on ONE submit, as three demands — the card's own case", async () => {
    await openDialog();

    fillLine(0, "SONIC-S", "2", "showroom floor");
    fireEvent.click(screen.getByTestId("to-order-line-add"));
    fillLine(1, "5539-CNR", "1", "");
    fireEvent.click(screen.getByTestId("to-order-line-add"));
    fillLine(2, "5539-2NA", "4", "left corner");

    apiFetch.mockClear();
    fireEvent.click(screen.getByTestId("to-order-create-submit"));

    await waitFor(() => expect(posted()).toHaveLength(3));
    const sent = posted();

    // THE LINES CARRY WHAT IS PER-LINE...
    expect(sent.map((s) => [s.sku, s.qty, s.remark])).toEqual([
      ["SONIC-S", 2, "showroom floor"],
      ["5539-CNR", 1, null],
      ["5539-2NA", 4, "left corner"],
    ]);
    // ...and EVERY ONE carries the header, which was asked once. This is the
    // half a multi-line form gets wrong: a header field that silently reaches
    // only the first row.
    for (const s of sent) {
      expect(s.destinationId).toBe(KLANG);
      expect(s.purpose).toBe("ready_stock");
      // No supplier on the wire, on any row — P15's rule, per line now.
      expect(s).not.toHaveProperty("supplier");
      expect(s).not.toHaveProperty("supplierId");
      // ❌ a price column. Purchasing prices nothing here.
      expect(s).not.toHaveProperty("price");
      expect(s).not.toHaveProperty("cost");
    }
    // Nothing is left open once every line is a record.
    await waitFor(() => expect(screen.queryByTestId("to-order-create-dialog")).toBeNull());
  });

  it("WHAT SUCCEEDED STAYS CREATED — a bad line keeps its row, the good ones do not roll back", async () => {
    await openDialog();
    fillLine(0, "SONIC-S", "2");
    fireEvent.click(screen.getByTestId("to-order-line-add"));
    fillLine(1, "5539-CNR", "1");
    fireEvent.click(screen.getByTestId("to-order-line-add"));
    fillLine(2, "5539-2NA", "3");

    // The MIDDLE line is refused, so the assertion cannot pass by the run
    // simply stopping at the first failure.
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      const b = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (init?.method === "POST" && b?.sku === "5539-CNR") {
        return Promise.reject(new Error("sku_has_no_supplier"));
      }
      return route(path, b);
    });

    fireEvent.click(screen.getByTestId("to-order-create-submit"));

    // The failure names its OWN row, in the server's own words.
    const failed = await screen.findByTestId("to-order-line-failed-1");
    expect(failed).toHaveTextContent("sku_has_no_supplier");

    // The two that worked are RECORDS. They say so, and they no longer offer a
    // Remove — nothing in this form can un-make a row the server accepted.
    expect(screen.getByTestId("to-order-line-created-0")).toHaveTextContent(W.createdWord);
    expect(screen.getByTestId("to-order-line-created-2")).toHaveTextContent(W.createdWord);
    expect(screen.queryByTestId("to-order-line-remove-0")).toBeNull();
    expect(screen.queryByTestId("to-order-line-remove-2")).toBeNull();
    // ...and the one that failed keeps its way out.
    expect(screen.getByTestId("to-order-line-remove-1")).toBeInTheDocument();

    // THE DIALOG STAYS. A form that closed here would have reported nothing.
    expect(screen.getByTestId("to-order-create-dialog")).toBeInTheDocument();
  });

  it("pressing Create again retries ONLY the line that failed — a record is never posted twice", async () => {
    await openDialog();
    fillLine(0, "SONIC-S", "2");
    fireEvent.click(screen.getByTestId("to-order-line-add"));
    fillLine(1, "5539-CNR", "1");

    let refuse = true;
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      const b = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (init?.method === "POST" && b?.sku === "5539-CNR" && refuse) {
        return Promise.reject(new Error("boom"));
      }
      return route(path, b);
    });

    fireEvent.click(screen.getByTestId("to-order-create-submit"));
    await screen.findByTestId("to-order-line-failed-1");

    // The factory is fixed; the operator presses the same button again. There
    // is no second control — the button that made the attempt repeats it.
    refuse = false;
    apiFetch.mockClear();
    fireEvent.click(screen.getByTestId("to-order-create-submit"));

    await waitFor(() => expect(posted()).toHaveLength(1));
    // ONE call, and it is the failed line. Re-posting SONIC-S would have
    // bought the showroom two sofas for one decision.
    expect(posted()[0].sku).toBe("5539-CNR");
    await waitFor(() => expect(screen.queryByTestId("to-order-create-dialog")).toBeNull());
  });

  it("a line can be added and removed, and removing the last leaves one empty line", async () => {
    await openDialog();

    fireEvent.click(screen.getByTestId("to-order-line-add"));
    fireEvent.click(screen.getByTestId("to-order-line-add"));
    expect(screen.getAllByTestId(/^to-order-create-line-\d+$/)).toHaveLength(3);

    fireEvent.click(screen.getByTestId("to-order-line-remove-2"));
    expect(screen.getAllByTestId(/^to-order-create-line-\d+$/)).toHaveLength(2);

    // Removing every line leaves ONE empty line, never an unusable form — a
    // dialog with no rows has no way back.
    fireEvent.click(screen.getByTestId("to-order-line-remove-1"));
    fireEvent.click(screen.getByTestId("to-order-line-remove-0"));
    const left = screen.getAllByTestId(/^to-order-create-line-\d+$/);
    expect(left).toHaveLength(1);
    expect(document.getElementById("cp-item-0")).toHaveValue("");
    expect(screen.getByTestId("to-order-create-submit")).toBeDisabled();
  });

  it("a half-filled line holds the button rather than being silently dropped", async () => {
    await openDialog();
    fillLine(0, "SONIC-S", "1");
    expect(screen.getByTestId("to-order-create-submit")).toBeEnabled();

    // A row carrying a remark and NO item: posting the others and closing would
    // throw that typing away without saying so, so the button waits.
    fireEvent.click(screen.getByTestId("to-order-line-add"));
    fireEvent.change(document.getElementById("cp-remark-1")!, {
      target: { value: "the one with the taller legs" },
    });
    expect(screen.getByTestId("to-order-create-submit")).toBeDisabled();

    // An UNTOUCHED trailing row is the empty row at the bottom of every ERP
    // grid, and is ignored rather than held against the operator.
    fireEvent.change(document.getElementById("cp-remark-1")!, { target: { value: "" } });
    expect(screen.getByTestId("to-order-create-submit")).toBeEnabled();
  });

  it("at most ONE picker is open, and it belongs to the line being filled", async () => {
    await openDialog();
    /* The dialog's only table is the picker: Radix marks the rest of the page
     * `aria-hidden` while a modal is open, so the grid behind it is not in the
     * accessibility tree and cannot be miscounted here. */
    const pickers = () => screen.queryAllByRole("table").length;

    // A freshly opened dialog behaves exactly as the single-line version did.
    expect(pickers()).toBe(1);

    // The new line takes the picker WITH it — the first does not keep a copy.
    fireEvent.click(screen.getByTestId("to-order-line-add"));
    expect(pickers()).toBe(1);
    expect(within(screen.getByTestId("to-order-create-lines")).getAllByRole("table"))
      .toHaveLength(1);

    // Focus moves it back. Two open result tables cannot be REPRESENTED: the
    // state is a single id, not a set.
    fireEvent.focus(document.getElementById("cp-item-0")!);
    expect(pickers()).toBe(1);

    // ...and once the focused line names its item there is no picker at all,
    // which is what makes room for the next line rather than stacking tables.
    fillLine(0, "SONIC-S");
    expect(pickers()).toBe(0);

    // Focusing the empty line brings exactly one back.
    fireEvent.focus(document.getElementById("cp-item-1")!);
    expect(pickers()).toBe(1);
  });

  it("each line searches its OWN needle — one shared list would show the last thing typed", async () => {
    await openDialog();
    fillLine(0, "SONIC-S");

    fireEvent.click(screen.getByTestId("to-order-line-add"));
    fireEvent.change(document.getElementById("cp-item-1")!, {
      target: { value: "5539-CNR" },
    });
    await waitFor(() =>
      expect(screen.queryByText("SONIC-S", { selector: ".font-mono" })).toBeNull(),
    );
    // Line 0 keeps its pick while line 1 is filtered to something else.
    expect(document.getElementById("cp-item-0")).toHaveValue("Sonic S");
    expect(screen.getByText("5539-CNR", { selector: ".font-mono" })).toBeInTheDocument();
  });

  it("the header is asked ONCE and the line words are typed once", async () => {
    await openDialog();
    fireEvent.click(screen.getByTestId("to-order-line-add"));
    fireEvent.click(screen.getByTestId("to-order-line-add"));

    const dialog = screen.getByTestId("to-order-create-dialog");
    // Three lines, and still exactly one of each header field. Source,
    // Destination and Required By are per PURCHASE, never per line — the
    // card's Must-NOT names all three.
    for (const w of [W.reason, W.destination, W.requiredBy]) {
      expect(within(dialog).getAllByText(w)).toHaveLength(1);
    }
    expect(dialog.querySelectorAll("#cp-purpose")).toHaveLength(1);
    expect(dialog.querySelectorAll("#cp-dest")).toHaveLength(1);
    expect(dialog.querySelectorAll("#cp-required")).toHaveLength(1);

    // The three line words head the grid once, and every row's controls take
    // them as their accessible name rather than repeating the ink.
    for (const w of [W.itemLabel, W.itemsColQty, W.remark]) {
      expect(within(dialog).getAllByText(w)).toHaveLength(1);
    }
    for (let i = 0; i < 3; i++) {
      expect(document.getElementById(`cp-item-${i}`)).toHaveAttribute(
        "aria-label",
        W.itemLabel,
      );
      expect(document.getElementById(`cp-qty-${i}`)).toHaveAttribute(
        "aria-label",
        W.itemsColQty,
      );
      expect(document.getElementById(`cp-remark-${i}`)).toHaveAttribute(
        "aria-label",
        W.remark,
      );
    }
  });

  it("the surface is the kit's WIDE modal — a line list, not a question", async () => {
    await openDialog();
    const modal = document.querySelector('[data-kit="modal"]')!;
    // 600px, measured on the live dialog: at 512 the picker's SKU column holds
    // 126.8px for a 144.0px code, and P15's whole point is that the code is
    // what tells four SKUs apart. The class is the kit's config key, never a
    // number typed here.
    expect(modal.className).toContain("max-w-modal-wide");
    expect(modal.className).not.toContain("max-w-modal ");
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
    expect(within(sheet).getByTestId("row-po-po:PO-9001:o30:0")).toBeInTheDocument();
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
   * or the header's own floor where that is wider (`SO No.` · `Customer
   * Delivery` · `Qty`). Changing one of these is a MEASUREMENT, taken in a
   * browser — never a guess in this file. T1 added the three identity
   * columns; below ~1180px the grid scrolls sideways rather than truncating
   * (Loo, 2026-08-06 — Purchase Orders' own behaviour). */
  const RULED = {
    // T1.1 re-measured three of these in a real browser on live data:
    //   so    95 → 99   the order line's `Ready Stock` (79) ellipsised by 2px
    //   po   163 → 175  the cell now holds the order line's pill + one number,
    //                   and holds no button at all (G10 closed)
    //   proceed/readystock  new, measured the same way
    so: "99px",
    customer: "181px",
    delivery: "163px",
    proceed: "143px",
    supplier: "111px",
    qty: "55px",
    model: "155px",
    readystock: "99px",
    // T3 — the header's own floor, measured in a real browser with the kit's
    // own header classes and the app's own font (`500 11px Inter`): the word
    // `On PO` is 34.1, and the whole cell — word + the 2px gap + the 14px sort
    // arrow + 16 of `px-2` padding — is 66.1. + P16's 4px sub-pixel guard.
    // (The SAME measurement reproduces `Ready Stock` at 98.9 → the 99 above,
    // which is what says the method is the shipped one.)
    onpo: "71px",
    po: "175px",
  };

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
    expect(dataCols.length).toBe(10);
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
    // filtered or reordered, and the header row is still the seven words.
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent!.trim())).toEqual([
      "",
      "",
      W.colSoNo,
      W.colCustomer,
      W.colPreferred,
      W.proceedDate,
      W.supplierLabel,
      W.colQty,
      W.colModel,
      W.colReadyStock,
      W.colOnPo,
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

  it("reads SO No. · Customer · Customer Delivery · Proceed date · Supplier · Qty · Model · Ready Stock · On PO · PO No.", async () => {
    await loaded();
    const heads = [...document.querySelectorAll("thead th")]
      .map((th) => (th.textContent ?? "").trim())
      .filter((t) => t.length > 0);
    expect(heads).toEqual([
      W.colSoNo,
      W.colCustomer,
      W.colPreferred,
      W.proceedDate,
      W.supplierLabel,
      W.colQty,
      W.colModel,
      W.colReadyStock,
      W.colOnPo,
      W.colPoNo,
    ]);
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
    expect(screen.queryByTestId("table-expand-po:PO-9001:o30:0")).toBeNull();
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

  /**
   * ── T3 · ON PO — the answer to *why 1?* (Loo, 2026-08-06) ─────────────────
   *
   * The engine has netted open purchase orders out of demand since it was
   * written and the number reached NOBODY: a partly covered line printed its
   * reduced quantity with nothing beside it, so the grid said `Qty 1` where
   * the customer ordered 3 and the two units on `PO-2051` were stated on no
   * screen. This is the third of 2990s' four numbers, and the one that
   * explains the fourth.
   */
  describe("T3 · On PO", () => {
    /** The same payload with a partial open-PO cover on ella's build. */
    function withCover(n: number, pos: string[] = []) {
      const body = withOffer(0);
      const row = body.proposals[0].rows[0] as unknown as Record<string, unknown>;
      const b = (row.builds as Record<string, unknown>[])[0];
      b.coveredByOpenPo = n;
      b.coveredByOpenPoPos = pos;
      row.coveredByOpenPo = n;
      row.coveredByOpenPoPos = pos;
      return body;
    }

    it("prints the number on the row", async () => {
      await loadedWith(withCover(2));
      expect(screen.getByTestId(`to-order-onpo-${rowKey}`)).toHaveTextContent("2");
    });

    it("names the purchase orders behind it, on the hover", async () => {
      await loadedWith(withCover(2, ["PO-2051"]));
      expect(screen.getByTestId(`to-order-onpo-${rowKey}`)).toHaveAttribute(
        "title",
        "2 on PO-2051",
      );
    });

    it("ships the number with NO hover when the api could not resolve one", async () => {
      // An invented reference is worse than a bare number: an operator can
      // phone a purchase order that does not exist.
      await loadedWith(withCover(2));
      expect(screen.getByTestId(`to-order-onpo-${rowKey}`)).not.toHaveAttribute("title");
    });

    it("is BLANK at zero — a `0` reads as an answer somebody worked out", async () => {
      await loadedWith(withCover(0));
      expect(screen.queryByTestId(`to-order-onpo-${rowKey}`)).toBeNull();
    });

    it("says nothing on an ordered row — a receipt's own number is in PO No.", async () => {
      await loadedWith(withCover(2));
      expect(screen.queryByTestId("to-order-onpo-po:PO-9001:o30:0")).toBeNull();
    });

    it("is neutral ink, NOT the green Ready Stock owns", async () => {
      // Green means *you can take this today*; this number is information.
      await loadedWith(withCover(2));
      expect(screen.getByTestId(`to-order-onpo-${rowKey}`).className).not.toMatch(/green/);
    });

    it("carries NO action — the cell is a fact, the ⊞ holds the acts", async () => {
      await loadedWith(withCover(2));
      const cell = screen.getByTestId(`to-order-onpo-${rowKey}`).closest("td")!;
      expect(cell.querySelectorAll("button, a, input")).toHaveLength(0);
    });

    it("the ORDER LINE says nothing — the cover is a fact about an ITEM", async () => {
      await loadedWith(withCover(2));
      const group = document.querySelector('[data-kit="data-group"]')!;
      expect(group.querySelectorAll('[data-testid^="to-order-onpo-"]')).toHaveLength(0);
    });
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

  /**
   * T1.1 — `Cancel` LEFT THE `PO No.` CELL (MASTER §3's gap G10: one column,
   * one job) and lives in the row's own ⊞ beside `Reserve`. The claims below
   * are unchanged; what changed is that the button is reached the way every
   * other row ACT is reached. Opening every expandable row is deliberately
   * blunt — it keeps "exactly one row can be cancelled" a claim about the
   * whole sheet rather than about the one row a fixture happens to open.
   */
  const openRowActions = () => {
    for (const b of document.querySelectorAll('[data-testid^="table-expand-"]')) {
      fireEvent.click(b);
    }
  };

  it("a typed demand row offers Cancel; a customer requirement never does", async () => {
    await loadedWithDemand([PART_ORDERED, ...TO_ORDER.proposals]);
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    openRowActions();
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
    openRowActions();
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
    openRowActions();
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
    openRowActions();
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
    openRowActions();
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
    openRowActions();
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
    // ⊞ + ☑ + the TEN business columns (T1's seven, T1.1's `Proceed date` and
    // `Ready Stock`, T3's `On PO`) + P16's filler. The THIRTEENTH is not a
    // column: it carries no word, no sort and no filter, and `P16 · the grid's
    // width system` above pins both halves of that.
    expect(document.querySelectorAll("colgroup col")).toHaveLength(13);
  });
});

/**
 * ── P18 · the order's proceed date joins the GROUP HEADER ────────────────────
 *
 * Loo asked for a COLUMN and the answer is a header line, on his own 2026-08-04
 * rule: a fact that is not per-row gets no column, and every line under one SO
 * shares this date — a column would print it three times and hold the width
 * forever.
 *
 * He then ruled the FORM on 2026-08-05, from three options with the live reading
 * attached: the waiting count appears only once the date has PASSED. Measured on
 * production the same day, `SO-1256`'s proceed date was the NEXT day, so an
 * unconditional count printed `(-1 days)` on the real page.
 *
 * Fixture time is 2026-07-30, and it holds all four cases on purpose:
 *   ella (o2)   proceed 2026-07-15 — passed  → date + `(15 days)`
 *   PETER (o1)  proceed 2026-08-01 — ahead   → the date alone
 *   wong (o9)   no proceed date              → nothing at all
 *   PO-9001     a RECEIPT with a proceed date → the header still reads it
 */
describe("P18 · the proceed date on the group header", () => {
  const groups = () => [...document.querySelectorAll('[data-kit="data-group"]')];
  const groupOf = (re: RegExp) => groups().find((g) => re.test(g.textContent ?? ""));

  it("states the label and the date for an order-backed group", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));

    const ella = groupOf(/ella/i);
    expect(ella).toBeTruthy();
    expect(ella!.textContent).toContain(fmtDateShort("2026-07-15"));
  });

  it("adds how long it has waited once the date has PASSED", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));

    // 2026-07-15 → 2026-07-30 is 15 days.
    expect(groupOf(/ella/i)!.textContent).toContain(
      `${fmtDateShort("2026-07-15")} (15 days)`,
    );
  });

  it("says the date ALONE while it is still ahead — never a negative count", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));

    const peter = groupOf(/Peter/);
    expect(peter).toBeTruthy();
    expect(peter!.textContent).toContain(fmtDateShort("2026-08-01"));
    // The whole point of Loo's ruling: no parenthesised count, and above all no
    // minus sign anywhere on the line.
    expect(peter!.textContent).not.toMatch(/\(-?\d+ days?\)/);
  });

  it("says NOTHING for an order that has no proceed date", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    // wong's bedframe order carries none; its group must not invent one, and
    // must not print a bare label with an em dash after it either.
    const wong = groupOf(/wong/i);
    expect(wong).toBeTruthy();
    // T1.1 — the LABEL now lives in the column header (permanently on screen),
    // so the claim is about the CELL: the proceed column of this order line is
    // empty, and no invented date or em dash stands in for the missing plan.
    const cells = [...wong!.querySelectorAll("td")];
    expect((cells[5]?.textContent ?? "").trim()).toBe("");
  });

  it("reads it off a RECEIPT too — a fully-bought order has no demand rows left", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));

    const receipt = groupOf(/PO-9001/);
    expect(receipt).toBeTruthy();
    // 2026-07-28 → 2026-07-30 is 2 days.
    expect(receipt!.textContent).toContain(
      `${fmtDateShort("2026-07-28")} (2 days)`,
    );
  });

  it("shows NOTHING on a Ready Stock group — no order, no plan", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.startsWith("/api/operation/purchase/to-order/issue")) {
        return route(path, init?.body ? JSON.parse(String(init.body)) : undefined);
      }
      if (path.startsWith("/api/operation/purchase/to-order")) {
        return Promise.resolve({
          ...TO_ORDER,
          ordered: [],
          proposals: [
            {
              key: `${OHANA}::bedframe`, supplierId: OHANA, supplierName: "Ohana",
              category: "bedframe", label: "Ohana · Bedframe", orderBy: null,
              poCount: 1, blocked: null, productionDays: 7,
              rows: [
                {
                  orderId: "demand:abc-123", so: null, customer: "—",
                  readyStock: true, destination: "Carres Klang", qty: 5,
                  summary: "Sonic · 5", stockReady: null, delivery: null,
                  proceedDate: null, orderBy: null,
                  builds: [build("d1", "Sonic", "SONIC-S", 5, "Single")],
                },
              ],
            },
          ],
        });
      }
      return route(path, undefined);
    });
    await loaded();

    const ready = groupOf(/Ready Stock/);
    expect(ready).toBeTruthy();
    expect(ready!.textContent).toContain("Carres Klang");
    expect(ready!.textContent).not.toContain(W.proceedDate);
  });

  /**
   * ⭐ T1.1 REVERSED P18'S "NO COLUMN", and Loo reversed it himself.
   *
   * P18's rule was *a fact that is not per-row gets no column* — sound, and it
   * produced a date printed in an unheaded SPAN under `Supplier · Qty · Model`.
   * Shown the live page on 2026-08-06 he named exactly that: *"proceed date out
   * at first column"*, *"now we got header title or not?"*. **A fact under a
   * header that names something else is worse than a column that is blank on
   * item rows**, because a blank cell under a true header still reads as *see
   * the line above*, and a date under `Supplier` reads as a lie.
   *
   * So the claim inverts: the column EXISTS, it is blank on every item row,
   * and the header — not the cell — carries the word.
   */
  it("has its own column, blank on every item row, labelled by its header", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));

    const head = [...document.querySelectorAll("thead th[data-column]")].find(
      (th) => (th as HTMLElement).dataset.column === "proceed",
    );
    expect(head?.textContent).toContain(W.proceedDate);

    const rows = [...document.querySelectorAll('[data-kit="data-row"]')];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      // [0]=⊞ [1]=☑ [2]=SO [3]=Customer [4]=Delivery [5]=Proceed date.
      expect(([...r.querySelectorAll("td")][5]?.textContent ?? "").trim()).toBe("");
      expect(r.textContent ?? "").not.toContain(fmtDateShort("2026-07-15"));
    }
  });

  it("keeps the customer's delivery date distinguishable from it", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));

    const ella = groupOf(/ella/i)!;
    // T1.1 — what tells the two dates apart is no longer a label INSIDE one of
    // them; it is that each sits in its own column under its own header. The
    // spellings stay different anyway (long with a weekday for the customer's
    // date, short for the plan), which is what keeps them readable when the
    // grid is scrolled sideways and only one header is in view.
    const cells = [...ella.querySelectorAll("td")];
    expect((cells[4]?.textContent ?? "").trim()).toBe(fmtDate("2026-07-20"));
    expect((cells[5]?.textContent ?? "").trim()).toContain(fmtDateShort("2026-07-15"));
    expect(fmtDate("2026-07-20")).not.toBe(fmtDateShort("2026-07-20"));
  });
});

/**
 * ── T1 · the AutoCount-aligned grid (Loo, 2026-08-06) ───────────────────────
 *
 * Loo ruled the free-text group sentence hard to read and approved the exact
 * mock: order facts on their own ALIGNED row, every fact in a column, a group
 * ☑ that toggles the order's builds, and an always-on `Total · N units`
 * strip. These tests pin the mock's own shape.
 */
describe("T1 · the aligned order line", () => {
  const groups = () => [...document.querySelectorAll('[data-kit="data-group"]')];
  const groupOf = (re: RegExp) => groups().find((g) => re.test(g.textContent ?? ""));

  it("the order line is CELLS, not a sentence — SO, customer and date in their columns", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));

    const peter = groupOf(/Peter/)!;
    const tds = [...peter.querySelectorAll("td")];
    // ⊞ gutter · ☑ · SO No. · Customer · Delivery · the 3-col middle span ·
    // PO No. · filler — TEN cols, EIGHT cells (the span merges three).
    // The FACT under its HEADER is the whole card: each sits in its own cell.
    const texts = tds.map((t) => (t.textContent ?? "").trim());
    expect(texts).toContain("SO-1207");
    expect(texts).toContain("Peter");
    expect(texts).toContain(fmtDate("2026-08-13"));
    // …three separate cells, never one concatenated sentence.
    expect(texts.some((t) => t.includes("SO-1207") && t.includes("Peter"))).toBe(false);
  });

  it("the group ☑ ticks and unticks ALL its builds — one press, one meaning", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    // PETER's two sofa builds arrive pre-ticked (the engine's own plan), so
    // his group box reads CHECKED.
    const box = document.getElementById(`kit-table-group-o1`)!;
    expect(box).not.toBeNull();
    expect(box.getAttribute("data-state")).toBe("checked");

    // One press unticks both builds: 5 selected → 3.
    fireEvent.click(box);
    expect(screen.getByTestId("to-order-issue-pill")).toHaveTextContent("3 selected");
    expect(box.getAttribute("data-state")).toBe("unchecked");

    // Press again: both come back.
    fireEvent.click(box);
    expect(screen.getByTestId("to-order-issue-pill")).toHaveTextContent("5 selected");
  });

  it("SOME ticked = the indeterminate dash, and its press completes the group", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    // Untick ONE of PETER's two builds by its own row ☑ — build-level
    // selection is frozen and stays the real record.
    fireEvent.click(rowBox(`${OHANA}::sofa`, "o1", "bk-a"));
    const box = document.getElementById(`kit-table-group-o1`)!;
    expect(box.getAttribute("data-state")).toBe("indeterminate");
    // A press on SOME means "give me all of it" — Excel's own select-all rule.
    fireEvent.click(box);
    expect(box.getAttribute("data-state")).toBe("checked");
    expect(screen.getByTestId("to-order-issue-pill")).toHaveTextContent("5 selected");
  });

  it("a receipt group gets NO box — nothing on it can be picked", async () => {
    await loaded();
    // Friday's default view holds only PO-9001, the receipt.
    expect(document.getElementById("kit-table-group-o30")).toBeNull();
  });

  it("the Total strip is ALWAYS on and counts what is still TO BUY", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    /**
     * T6 CHANGED WHAT THIS COUNTS, and the receipts are why. It summed every
     * visible row while the only receipts on the sheet were a handful of POs
     * from the last fortnight; T6 puts every order an open purchase order
     * already covers back on the page — 35 of 62 rows on live data — so
     * summing the sheet would have said `71 units` on a day the buyer had 20
     * to place. The rail's category counts have skipped bought rows since P9,
     * so this is the two numbers agreeing rather than contradicting each other
     * 200px apart. Fri + Overdue = 7 demand units; PO-9001's receipt is not
     * work and no longer counts.
     */
    expect(screen.getByTestId("to-order-total")).toHaveTextContent(
      `${W.total} · 7 units`,
    );
    // Untick everything; the strip does not move (always on).
    fireEvent.click(document.getElementById("kit-table-select-all")!);
    expect(screen.getByTestId("to-order-total")).toHaveTextContent(
      `${W.total} · 7 units`,
    );
    // A filter narrows the sheet, so it narrows the total with it.
    fireEvent.click(screen.getByTestId("to-order-cat-sofa"));
    expect(screen.getByTestId("to-order-total")).toHaveTextContent(
      `${W.total} · 3 units`,
    );
    // …and it now agrees with the rail, which has always counted this way.
    expect(screen.getByTestId("to-order-cat-sofa")).toHaveTextContent("3");
  });

  it("a Ready Stock group prints `Required By` with its date — G8's bare date is named", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.startsWith("/api/operation/purchase/to-order/issue")) {
        return route(path, init?.body ? JSON.parse(String(init.body)) : undefined);
      }
      if (path.startsWith("/api/operation/purchase/to-order")) {
        return Promise.resolve({
          ...TO_ORDER,
          ordered: [],
          proposals: [
            {
              key: `${OHANA}::bedframe`, supplierId: OHANA, supplierName: "Ohana",
              category: "bedframe", label: "Ohana · Bedframe", orderBy: null,
              poCount: 1, blocked: null, productionDays: 7,
              rows: [
                {
                  orderId: "demand:abc-123", so: null, customer: "—",
                  readyStock: true, destination: "Carres Klang", qty: 5,
                  summary: "Sonic · 5", stockReady: null, delivery: "2026-08-15",
                  proceedDate: null, orderBy: null,
                  builds: [build("d1", "Sonic", "SONIC-S", 5, "Single")],
                },
              ],
            },
          ],
        });
      }
      return route(path, undefined);
    });
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-day-2026-07-31")); // lift time narrowing

    const ready = groupOf(/Ready Stock/)!;
    expect(ready).toBeTruthy();
    // The typed demand's date carries ITS name — the create dialog's own word,
    // short spelling (a labelled date, P18's pairing rule).
    expect(ready.textContent).toContain(`${W.requiredBy} ${fmtDateShort("2026-08-15")}`);
    // …and never the customer's bare long spelling.
    expect(ready.textContent).not.toContain(fmtDate("2026-08-15"));
  });
});
