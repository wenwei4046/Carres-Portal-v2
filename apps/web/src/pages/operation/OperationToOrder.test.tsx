import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TO_ORDER_WORDS as W } from "@carres/shared";
import OperationToOrder from "./OperationToOrder";
import { fmtDate } from "@/lib/fmt-date";

/**
 * To Order — the final freeze (Loo, 2026-08-01): LEFT is a Linear-style
 * Action Launcher (Today · the categories · + Create Purchase · the Issue
 * pill), RIGHT is a GitHub-Projects grid of exactly six columns speaking
 * business language only — `Order By` never reaches the screen. Rows arrive
 * pre-selected with delta memory; Issue posts one ARRANGEMENT per group,
 * updates the grid in place (rows never vanish), reports in the bottom bar
 * (no toast, no popup), and a partial failure stays until retried.
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
  today: "2026-07-30",
  destinations: [{ id: KLANG, name: "Carres Klang", isDefault: true }],
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
          builds: [build("bk-e", "Booqit", "5539-1A(LHF)")],
        },
        {
          orderId: "o1", so: 1207, customer: "PETER", qty: 2,
          summary: "Booqit · 2 Sofas", stockReady: "2026-08-13",
          delivery: "2026-08-13",
          builds: [
            build("bk-a", "Booqit", "5539-1B(LHF)"),
            build("bk-b", "Booqit", "5539-1A(LHF)"),
          ],
        },
        {
          orderId: "o3", so: 1257, customer: "kee tong", qty: 2,
          summary: "Booqit · 2 Sofas", stockReady: null,
          delivery: null, // TBD — prints the dash, sinks in the sort
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
          builds: [build("l1", "Cody", "CODY-Q", 3, "Queen")],
        },
        {
          orderId: "o8", so: 1301, customer: "lim", qty: 1,
          summary: "Cody · 1 Bedframe", stockReady: "2026-08-06",
          delivery: "2026-08-15",
          builds: [build("l2", "Cody", "CODY-K", 1, "King")],
        },
      ],
    },
    {
      // A run AHEAD — its order-by day has not come, so the page (which IS
      // today) does not list it.
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
  return document.getElementById(`row-${proposalKey}:${orderId}`)!;
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

describe("the Action Launcher", () => {
  it("is Today · the categories · + Create Purchase — and nothing systemic", async () => {
    await loaded();
    const nav = screen.getByTestId("to-order-nav");
    expect(within(nav).getByTestId("to-order-cat-today")).toHaveTextContent(W.navToday);
    // 5 unique customer orders today; the run ahead is not counted.
    expect(within(nav).getByTestId("to-order-cat-today")).toHaveTextContent("5 Orders");
    expect(within(nav).getByTestId("to-order-cat-bedframe")).toHaveTextContent("2 Orders");
    expect(within(nav).getByTestId("to-order-cat-sofa")).toHaveTextContent("3 Orders");
    // Mattress exists only as a run ahead — the row is there, at zero.
    expect(within(nav).getByTestId("to-order-cat-mattress")).toHaveTextContent("0 Orders");
    expect(within(nav).getByTestId("to-order-create-purchase")).toHaveTextContent(
      W.createPurchase,
    );
    // No system words, no headings, no H1 anywhere.
    expect(within(nav).queryByText("Views")).toBeNull();
    expect(within(nav).queryByText("Group")).toBeNull();
    expect(screen.queryByText("TO ORDER")).toBeNull();
    expect(document.querySelector("h1")).toBeNull();
  });

  it("clicking a category filters the grid; Today shows everything", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-cat-bedframe"));
    expect(screen.getByText("SO-1300")).toBeInTheDocument();
    expect(screen.queryByText("SO-1204")).toBeNull();
    fireEvent.click(screen.getByTestId("to-order-cat-today"));
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
    // ella's delivery is past → red overdue, sorted to the very top.
    const cells = screen.getAllByText(fmtDate("2026-07-20"));
    expect(cells[0]!.className).toContain("text-kit-red-11");
    // kee tong has no date — the dash prints and the row sinks.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    // The engine's own dates never render.
    expect(screen.queryByText(fmtDate("2026-07-15"))).toBeNull(); // sofa orderBy
    expect(screen.queryByText(fmtDate("2026-08-06"))).toBeNull(); // bedframe stockReady
  });

  it("rows arrive PRE-SELECTED and the pill tells the truth", async () => {
    await loaded();
    const pill = screen.getByTestId("to-order-issue-pill");
    expect(pill).toHaveTextContent("5 SO selected");
    // Sofa is one-per-order (3) + bedframe merges (1).
    expect(pill).toHaveTextContent("4 Purchase Orders");
  });

  it("an untick drops the pill's promise; unticking everything removes the pill", async () => {
    await loaded();
    fireEvent.click(rowBox(`${OHANA}::sofa`, "o2"));
    expect(screen.getByTestId("to-order-issue-pill")).toHaveTextContent("4 SO selected");
    expect(screen.getByTestId("to-order-issue-pill")).toHaveTextContent("3 Purchase Orders");
    for (const [p, o] of [
      [`${OHANA}::sofa`, "o1"],
      [`${OHANA}::sofa`, "o3"],
      [`${OHANA}::bedframe`, "o9"],
      [`${OHANA}::bedframe`, "o8"],
    ] as const) {
      fireEvent.click(rowBox(p, o));
    }
    expect(screen.queryByTestId("to-order-issue-pill")).toBeNull();
  });

  it("the operator's unticks survive a category switch — deltas, not snapshots", async () => {
    await loaded();
    fireEvent.click(rowBox(`${OHANA}::sofa`, "o2"));
    fireEvent.click(screen.getByTestId("to-order-cat-bedframe"));
    fireEvent.click(screen.getByTestId("to-order-cat-today"));
    expect(screen.getByTestId("to-order-issue-pill")).toHaveTextContent("4 SO selected");
  });

  it("search narrows by SO or model", async () => {
    await loaded();
    fireEvent.change(document.getElementById("to-order-search")!, {
      target: { value: "cody" },
    });
    expect(screen.getByText("SO-1300")).toBeInTheDocument();
    expect(screen.queryByText("SO-1204")).toBeNull();
  });
});

describe("Issue — the grid is the receipt, the bar is the report", () => {
  it("posts one ARRANGEMENT per group and updates rows in place — nothing vanishes", async () => {
    await loaded();
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
    expect(document.getElementById(`row-${OHANA}::bedframe:o9`)).toBeNull();
    expect(document.getElementById(`row-${OHANA}::sofa:o2`)).not.toBeNull();

    // The bar reports; the pill is gone (only ella remains, unticked).
    expect(screen.getByTestId("to-order-created-line")).toHaveTextContent(
      "3 Purchase Orders Created",
    );
    fireEvent.click(screen.getByTestId("to-order-continue"));
    expect(navigate).toHaveBeenCalledWith("/operation/procurement");
    // The launcher counts fell with the work.
    expect(screen.getByTestId("to-order-cat-bedframe")).toHaveTextContent("0 Orders");
  });

  it("a failed group fails ALONE and stays in the bar until retried", async () => {
    failCategories = new Set(["bedframe"]);
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-issue"));
    await screen.findByTestId("to-order-failed-line");
    // Sofa succeeded beside it; the failure does not evaporate.
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
    expect(screen.getByTestId("to-order-unresolved")).toBeInTheDocument();
    expect(screen.getByTestId("to-order-issue")).toBeDisabled();
  });

  it("an empty To Order is an answer, not a blank sheet", async () => {
    apiFetch.mockImplementation((path: string) =>
      path.endsWith("/to-order")
        ? Promise.resolve({ ...TO_ORDER, proposals: [] })
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
