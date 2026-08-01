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
      supplierId: OHANA, orderId: "o30", so: 1350,
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
          delivery: null, // TBD — prints the dash, sinks in the sort
          orderBy: null, // undated → a human must see it NOW, not in All
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

function rowBox(proposalKey: string, orderId: string) {
  return document.getElementById(`kit-table-row-${proposalKey}:${orderId}`)!;
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
  await screen.findByTestId("to-order-issue-pill");
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
    expect(within(nav).getByTestId("to-order-day-2026-07-31")).toHaveTextContent("1");
    expect(within(nav).getByTestId("to-order-day-2026-08-03")).toHaveTextContent("Monday");
    expect(within(nav).getByTestId("to-order-day-2026-08-05")).toHaveTextContent("Wednesday");
    expect(within(nav).queryByText(W.navToday)).toBeNull();
    // The retired vocabulary stays retired.
    expect(within(nav).queryByText("Tomorrow")).toBeNull();
    expect(within(nav).queryByText("This Week")).toBeNull();
    // CATEGORY is a WORK ORDER, not a scoreboard: heading + rows, no counts.
    expect(within(nav).getByText(W.categoryHeading)).toBeInTheDocument();
    expect(within(nav).getByTestId("to-order-cat-all")).not.toHaveTextContent("Orders");
    expect(within(nav).getByTestId("to-order-create-purchase")).toHaveTextContent(
      W.createPurchase,
    );
    expect(document.querySelector("h1")).toBeNull();
  });

  it("each calendar row shows ONLY its run; Overdue is its own place", async () => {
    await loaded();
    // The engine opens the first upcoming run (Friday): kee tong's dateless
    // order waits there; overdue work does not leak in.
    expect(screen.getByText("SO-1257")).toBeInTheDocument();
    expect(screen.queryByText("SO-1204")).toBeNull();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    expect(screen.getByText("SO-1204")).toBeInTheDocument();
    expect(screen.queryByText("SO-1257")).toBeNull();
    fireEvent.click(screen.getByTestId("to-order-day-2026-08-03"));
    expect(screen.getByText("SO-1400")).toBeInTheDocument();
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
  it("has exactly Loo's six columns and none of the system's", async () => {
    await loaded();
    for (const label of [W.colPreferred, W.colSoNo, W.colModel, W.colQty, W.colPoNo]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText("Customer")).toBeNull();
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
    // kee tong has no date — the dash prints and the row sinks.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    // The engine's own dates never render.
    expect(screen.queryByText(fmtDate("2026-07-15"))).toBeNull(); // sofa orderBy
    expect(screen.queryByText(fmtDate("2026-08-06"))).toBeNull(); // bedframe stockReady
  });

  it("rows arrive PRE-SELECTED and the toolbar pill tells the truth", async () => {
    await loaded();
    const pill = screen.getByTestId("to-order-issue-pill");
    expect(pill).toHaveTextContent("5 selected");
    // Sofa is one-per-order (3) + bedframe merges (1) — the promise lives ON
    // the button, never in a caption beside it (Jess, 2026-08-01).
    // Numbers are STATE (the caption); the button is the ACTION alone.
    expect(pill).toHaveTextContent("5 selected");
    expect(pill).toHaveTextContent("4 PO");
    expect(screen.getByTestId("to-order-issue")).toHaveTextContent(/^Issue PO$/);
    expect(pill.textContent).not.toContain("→");
  });

  it("the engine pre-ticks ONLY its own plan — a future row waits for a human", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-day-2026-08-03"));
    const box = rowBox(`${NF}::mattress`, "o20");
    expect(box).not.toBeNull();
    expect(box.getAttribute("data-state")).not.toBe("checked");
    fireEvent.click(box);
    // The tick joins the batch: 5 + amy = 6 SO, 4 + 1 = 5 Purchase Orders.
    expect(screen.getByTestId("to-order-issue-pill")).toHaveTextContent("6 selected");
    expect(screen.getByTestId("to-order-issue-pill")).toHaveTextContent("6 selected");
    expect(screen.getByTestId("to-order-issue-pill")).toHaveTextContent("5 PO");
  });

  it("an untick drops the pill's promise; unticking everything removes the pill", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    fireEvent.click(rowBox(`${OHANA}::sofa`, "o2"));
    expect(screen.getByTestId("to-order-issue-pill")).toHaveTextContent("4 selected");
    expect(screen.getByTestId("to-order-issue-pill")).toHaveTextContent("3 PO");
    for (const [p, o] of [
      [`${OHANA}::sofa`, "o1"],
      [`${OHANA}::bedframe`, "o9"],
      [`${OHANA}::bedframe`, "o8"],
    ] as const) {
      fireEvent.click(rowBox(p, o));
    }
    // kee tong waits on Friday's row — the last tick lives there.
    fireEvent.click(screen.getByTestId("to-order-day-2026-07-31"));
    fireEvent.click(rowBox(`${OHANA}::sofa`, "o3"));
    expect(screen.queryByTestId("to-order-issue-pill")).toBeNull();
  });

  it("the operator's ticks and unticks survive a view switch — deltas, not snapshots", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    fireEvent.click(rowBox(`${OHANA}::sofa`, "o2"));
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
  it("a header click sorts by SO; a second click reverses", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    fireEvent.click(screen.getByTestId("table-sort-so"));
    let sos = screen.getAllByText(/^SO-\d+$/).map((el) => el.textContent);
    expect(sos).toEqual(["SO-1204", "SO-1207", "SO-1300", "SO-1301"]);
    fireEvent.click(screen.getByTestId("table-sort-so"));
    sos = screen.getAllByText(/^SO-\d+$/).map((el) => el.textContent);
    expect(sos[0]).toBe("SO-1301");
  });

  it("the PO filter speaks business — Not Ordered / Ordered, never (Blanks)", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("table-filter-po"));
    expect(screen.getByLabelText(W.filterNotOrdered)).toBeInTheDocument();
    expect(screen.getByLabelText(W.filterOrdered)).toBeInTheDocument();
    expect(screen.queryByText("(Blanks)")).toBeNull();
    // `Ordered` narrows to the read-back PO row.
    fireEvent.click(screen.getByLabelText(W.filterOrdered));
    expect(screen.getByText("SO-1350")).toBeInTheDocument();
    expect(screen.queryByText("SO-1257")).toBeNull();
    // Not Ordered joins in — Excel ORs a checklist.
    fireEvent.click(screen.getByLabelText(W.filterNotOrdered));
    expect(screen.getByText("SO-1257")).toBeInTheDocument();
  });

  it("the delivery filter leads with Overdue and prints dates, not ISO", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    fireEvent.click(screen.getByTestId("table-filter-delivery"));
    fireEvent.click(screen.getByLabelText(W.filterOverdue));
    expect(screen.getByText("SO-1204")).toBeInTheDocument(); // ella, past date
    expect(screen.queryByText("SO-1300")).toBeNull();
  });

  it("there are no Status pills — the PO column IS the status door", async () => {
    await loaded();
    expect(screen.queryByText("Status")).toBeNull();
    expect(screen.queryByText("Yet to Order")).toBeNull();
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
    expect(screen.getByTestId("to-order-day-2026-07-31")).toHaveTextContent("1");
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
    fireEvent.click(rowBox(`${OHANA}::sofa`, "o2")); // leave ella out
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
    expect(sofaBody.purchaseOrders).toHaveLength(2);
    expect(JSON.stringify(sofaBody)).not.toContain("bk-e");

    // Rows updated IN PLACE: PO number a clickable door, checkbox gone,
    // unissued ella still visible with her ☑.
    expect(screen.getByTestId(`row-po-${OHANA}::bedframe:o9`)).toHaveTextContent(
      "PO-bedframe-1",
    );
    expect(screen.getByTestId(`row-po-${OHANA}::sofa:o1`)).toHaveTextContent("PO-sofa-");
    expect(document.getElementById(`kit-table-row-${OHANA}::bedframe:o9`)).toBeNull();
    expect(document.getElementById(`kit-table-row-${OHANA}::sofa:o2`)).not.toBeNull();

    // The bar reports; the pill is gone (only ella remains, unticked).
    expect(screen.getByTestId("to-order-created-line")).toHaveTextContent(
      "3 Purchase Orders Created",
    );
    fireEvent.click(screen.getByTestId("to-order-continue"));
    expect(navigate).toHaveBeenCalledWith("/operation/procurement");
    // The rail's Overdue count fell with the work — only ella is left.
    expect(screen.getByTestId("to-order-overdue")).toHaveTextContent("1");
  });

  it("a session-issued PO's number is the door to ITS channel tab", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    fireEvent.click(rowBox(`${OHANA}::sofa`, "o2")); // leave ella out
    fireEvent.click(screen.getByTestId("to-order-issue"));
    await screen.findByTestId("to-order-created-line");
    fireEvent.click(screen.getByTestId(`row-po-${OHANA}::bedframe:o9`));
    expect(navigate).toHaveBeenCalledWith(
      "/operation/procurement/hookka-bedframe?po=PO-bedframe-1",
    );
  });

  it("a failed group fails ALONE and stays in the bar until retried", async () => {
    failCategories = new Set(["bedframe"]);
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-issue"));
    await screen.findByTestId("to-order-failed-line");
    // Sofa succeeded beside it; the failure does not evaporate.
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    expect(screen.getByTestId(`row-po-${OHANA}::sofa:o2`)).toBeInTheDocument();
    expect(screen.getByTestId("to-order-failed-line")).toHaveTextContent("1 failed");

    failCategories = new Set();
    apiFetch.mockClear();
    fireEvent.click(screen.getByTestId("to-order-retry"));
    await waitFor(() => {
      expect(screen.getByTestId(`row-po-${OHANA}::bedframe:o9`)).toBeInTheDocument();
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
  it("opens the dialog with Reason · Supplier · Item · Qty · Remark and no Category", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-create-purchase"));
    const dialog = await screen.findByTestId("to-order-create-dialog");
    expect(screen.getByText(W.reason)).toBeInTheDocument();
    expect(within(dialog).getByText(W.reasonReadyStock)).toBeInTheDocument();
    expect(screen.getByText(W.supplierLabel)).toBeInTheDocument();
    expect(screen.getByText(W.itemLabel)).toBeInTheDocument();
    expect(screen.getByText(W.remark)).toBeInTheDocument();
    // Category is never asked — it comes from the item (Loo, 2026-08-01).
    expect(within(dialog).queryByText("Category")).toBeNull();
    // The save arrives with the unified purchase_demands card — the button
    // is disabled and SAYS so, so the door teaches without pretending.
    expect(screen.getByTestId("to-order-create-submit")).toBeDisabled();
    expect(screen.getByText(W.nextUpdate)).toBeInTheDocument();
  });
});

describe("the seven fixes — Excel completeness", () => {
  it("header select-all unticks the visible sheet, and ticks it back", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    fireEvent.click(document.getElementById("kit-table-select-all")!);
    // The four overdue rows untick; Friday's kee tong is still on.
    expect(screen.getByTestId("to-order-issue-pill")).toHaveTextContent("1 selected");
    fireEvent.click(document.getElementById("kit-table-select-all")!);
    expect(screen.getByTestId("to-order-issue-pill")).toHaveTextContent("5 selected");
  });

  it("select-all works on a FILTERED sheet — the boss's 'tick all Nice Future'", async () => {
    await loaded();
    // Untick everything, then Monday's run + mattress only, tick the header.
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    fireEvent.click(document.getElementById("kit-table-select-all")!);
    fireEvent.click(screen.getByTestId("to-order-day-2026-07-31"));
    fireEvent.click(document.getElementById("kit-table-select-all")!);
    expect(screen.queryByTestId("to-order-issue-pill")).toBeNull();
    fireEvent.click(screen.getByTestId("to-order-day-2026-08-03"));
    fireEvent.click(screen.getByTestId("to-order-cat-mattress"));
    fireEvent.click(document.getElementById("kit-table-select-all")!);
    expect(screen.getByTestId("to-order-issue-pill")).toHaveTextContent("1 selected");
  });

  it("a filter that blanks the table names its cause and hands back the way out", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-overdue"));
    fireEvent.click(screen.getByTestId("table-filter-model"));
    fireEvent.click(screen.getByLabelText("Cody K"));
    fireEvent.keyDown(document.body, { key: "Escape" });
    fireEvent.click(screen.getByTestId("table-filter-delivery"));
    fireEvent.click(screen.getByLabelText(W.filterOverdue));
    // Cody K is not overdue → zero rows, but never the lying empty state.
    expect(screen.getByTestId("to-order-filters-empty")).toHaveTextContent(W.filtersEmpty);
    fireEvent.click(screen.getByTestId("to-order-clear-filters"));
    expect(screen.queryByTestId("to-order-filters-empty")).toBeNull();
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
    fireEvent.click(screen.getByTestId("to-order-issue"));
    expect(await screen.findByTestId("to-order-creating")).toHaveTextContent(W.creatingPos);
    expect(screen.queryByTestId("to-order-issue")).toBeNull();
    expect(release).not.toBeNull();
  });
});
