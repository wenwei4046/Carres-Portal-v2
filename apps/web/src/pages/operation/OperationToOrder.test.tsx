import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TO_ORDER_WORDS as W } from "@carres/shared";
import OperationToOrder from "./OperationToOrder";

/**
 * To Order — the Excel grid (Loo's final division of responsibility,
 * 2026-07-31): decide which customer orders become purchase orders today.
 *
 * What these pin: the lenses are the engine's dates (Order today is the
 * default and pre-selects the plan); the operator's ticks are DELTAS a view
 * change cannot wash away; the groups are the future purchase orders and the
 * batch bar's sentence never lies; the batch posts the ARRANGEMENT only, one
 * POST per group, and the grid reports each group's outcome in place — rows
 * never vanish on success. Un-plannable demand is named, never hidden, and
 * never selectable.
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
const KK = "44444444-4444-4444-4444-444444444444";
const KLANG = "2f181917-f4e1-42b2-9e25-d7ee6785424a";
const AL = "818b420c-27f9-4707-a516-b91a6e03f343";

function build(key: string, model: string, codes: string, qty = 1, size: string | null = null) {
  return {
    key, title: model, spec: "", codes, qty, size, model, ordinal: null,
    lines: [{ lineId: `${key}-l1`, sku: codes, qty, cost: null }],
  };
}

const TO_ORDER = {
  today: "2026-07-30", // a Thursday — the week runs to Sun 2 Aug
  destinations: [
    { id: KLANG, name: "Carres Klang", isDefault: true },
    { id: AL, name: "AL Sungai Buloh", isDefault: false },
  ],
  proposals: [
    {
      key: `${OHANA}::sofa`,
      supplierId: OHANA,
      supplierName: "Ohana",
      category: "sofa",
      label: "Ohana · Sofa",
      orderBy: "2026-07-15", // OVERDUE — merges into today, red
      poCount: 3,
      blocked: null,
      productionDays: 14,
      rows: [
        {
          orderId: "o2", so: 1204, customer: "ella", qty: 1,
          summary: "Booqit · 1 Sofa", stockReady: "2026-07-20",
          builds: [build("bk-e", "Booqit", "5539-1A(LHF)")],
        },
        {
          orderId: "o1", so: 1207, customer: "PETER", qty: 2,
          summary: "Booqit · 2 Sofas", stockReady: "2026-08-13",
          builds: [
            build("bk-a", "Booqit", "5539-1B(LHF)"),
            build("bk-b", "Booqit", "5539-1A(LHF)"),
          ],
        },
        {
          orderId: "o3", so: 1257, customer: "kee tong", qty: 2,
          summary: "Booqit · 2 Sofas", stockReady: null,
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
      orderBy: "2026-07-30", // due exactly today
      poCount: 1,
      blocked: null,
      productionDays: 7,
      rows: [
        {
          orderId: "o9", so: 1300, customer: "wong", qty: 3,
          summary: "Cody · 3 Bedframes", stockReady: "2026-08-06",
          builds: [build("l1", "Cody", "CODY-Q", 3, "Queen")],
        },
        {
          orderId: "o8", so: 1301, customer: "lim", qty: 1,
          summary: "Cody · 1 Bedframe", stockReady: "2026-08-06",
          builds: [build("l2", "Cody", "CODY-K", 1, "King")],
        },
      ],
    },
    {
      key: `${NF}::mattress`,
      supplierId: NF,
      supplierName: "Nice Future",
      category: "mattress",
      label: "Nice Future · Mattress",
      orderBy: "2026-08-01", // Saturday — THIS WEEK, not today
      poCount: 1,
      blocked: null,
      productionDays: 7,
      rows: [
        {
          orderId: "o20", so: 1400, customer: "amy", qty: 1,
          summary: "Sonic · 1 Mattress", stockReady: "2026-08-20",
          builds: [build("m1", "Sonic", "SONIC-Q", 1, "Queen")],
        },
      ],
    },
    {
      key: `${KK}::mattress`,
      supplierId: KK,
      supplierName: "King Koil",
      category: "mattress",
      label: "King Koil · Mattress",
      orderBy: null,
      poCount: 1,
      blocked: "production_days", // NEEDS SETUP — named, never hidden
      productionDays: null,
      rows: [
        {
          orderId: "o30", so: 1230, customer: "GHI", qty: 1,
          summary: "Cloud · 1 Mattress", stockReady: null,
          builds: [build("kk1", "Cloud", "CLOUD-Q", 1, "Queen")],
        },
      ],
    },
  ],
};

/** Per-category issue results; bedframe can be told to fail. */
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
  return document.getElementById(`row-${proposalKey}-${orderId}`)!;
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
  await screen.findByTestId(`to-order-group-${OHANA}::sofa`);
}

describe("the lenses — the engine's dates as filters", () => {
  it("Order today is the default, overdue merged in, and the counts are the engine's", async () => {
    await loaded();
    const todayChip = screen.getByTestId("to-order-lens-today");
    expect(todayChip).toHaveAttribute("aria-pressed", "true");
    expect(todayChip).toHaveTextContent("5"); // 3 sofa + 2 bedframe SO
    expect(todayChip).toHaveTextContent("3"); // the overdue tail
    expect(screen.getByTestId("to-order-lens-week")).toHaveTextContent("1");
    expect(screen.getByTestId("to-order-lens-all")).toHaveTextContent("6");
    // Today's sheet holds no future group.
    expect(screen.queryByTestId(`to-order-group-${NF}::mattress`)).toBeNull();
  });

  it("switching lens changes the sheet, not the plan", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-lens-week"));
    await screen.findByTestId(`to-order-group-${NF}::mattress`);
    expect(screen.queryByTestId(`to-order-group-${OHANA}::sofa`)).toBeNull();
    // The batch bar still speaks for the SELECTABLE sheet it can see.
    fireEvent.click(screen.getByTestId("to-order-lens-today"));
    await screen.findByTestId(`to-order-group-${OHANA}::sofa`);
  });

  it("demand the engine cannot date is NAMED, never hidden — and never selectable", async () => {
    await loaded();
    const setupChip = screen.getByTestId("to-order-lens-setup");
    expect(setupChip).toHaveTextContent(W.lensNeedsSetup);
    expect(setupChip).toHaveTextContent("1");
    fireEvent.click(setupChip);
    const g = await screen.findByTestId(`to-order-group-${KK}::mattress`);
    expect(g).toHaveTextContent(W.cannotBePlanned);
    expect(g).toHaveTextContent(W.needsSetupHelp);
    // No checkbox anywhere in the group — nothing un-issuable is selectable.
    expect(within(g).queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("pre-selection — the engine proposes, the operator overrides", () => {
  it("today's plan arrives pre-selected and the batch bar tells the truth", async () => {
    await loaded();
    // 5 of 5 SO → sofa is one-per-order (3 docs) + bedframe merges (1 doc).
    expect(screen.getByTestId("to-order-will-create")).toHaveTextContent(
      "5 of 5 SO selected → will create 4 Purchase Orders",
    );
    // The promise lives in the batch bar ALONE — the group headers carry no
    // `becomes N POs` echo (Loo, 2026-08-01: one fact, one home).
    expect(screen.queryByTestId(`to-order-becomes-${OHANA}::sofa`)).toBeNull();
    expect(screen.queryByText(/becomes \d/)).toBeNull();
  });

  it("an untick drops the count and the group box turns indeterminate", async () => {
    await loaded();
    fireEvent.click(rowBox(`${OHANA}::sofa`, "o2"));
    expect(screen.getByTestId("to-order-will-create")).toHaveTextContent(
      "4 of 5 SO selected → will create 3 Purchase Orders",
    );
    expect(document.getElementById(`group-${OHANA}::sofa`)!).toHaveAttribute(
      "data-state",
      "indeterminate",
    );
  });

  it("the operator's overrides survive a view change — deltas, not snapshots", async () => {
    await loaded();
    fireEvent.click(rowBox(`${OHANA}::sofa`, "o2"));
    fireEvent.click(screen.getByTestId("to-order-lens-all"));
    await screen.findByTestId(`to-order-group-${NF}::mattress`);
    fireEvent.click(screen.getByTestId("to-order-lens-today"));
    await screen.findByTestId(`to-order-group-${OHANA}::sofa`);
    expect(screen.getByTestId("to-order-will-create")).toHaveTextContent(
      "4 of 5 SO selected",
    );
  });

  it("a future row is NOT pre-selected — ticking it is a deliberate pull-forward", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-lens-all"));
    await screen.findByTestId(`to-order-group-${NF}::mattress`);
    const box = rowBox(`${NF}::mattress`, "o20");
    expect(box).toHaveAttribute("data-state", "unchecked");
    fireEvent.click(box);
    expect(screen.getByTestId("to-order-will-create")).toHaveTextContent(
      "6 of 6 SO selected → will create 5 Purchase Orders",
    );
  });

  it("the group ☑ takes the whole future PO off and back on", async () => {
    await loaded();
    fireEvent.click(document.getElementById(`group-${OHANA}::bedframe`)!);
    expect(screen.getByTestId("to-order-will-create")).toHaveTextContent(
      "3 of 5 SO selected → will create 3 Purchase Orders",
    );
    fireEvent.click(document.getElementById(`group-${OHANA}::bedframe`)!);
    expect(screen.getByTestId("to-order-will-create")).toHaveTextContent(
      "5 of 5 SO selected → will create 4 Purchase Orders",
    );
  });
});

describe("the batch — one POST per group, the grid is the progress bar", () => {
  it("posts the ARRANGEMENT only, once per group, and reports each PO in place", async () => {
    await loaded();
    fireEvent.click(rowBox(`${OHANA}::sofa`, "o2")); // leave ella out today
    fireEvent.click(screen.getByTestId("to-order-create"));

    await screen.findByTestId(`to-order-result-${OHANA}::sofa`);
    await screen.findByTestId(`to-order-result-${OHANA}::bedframe`);

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
      expect(body.destinationId).toBe(KLANG);
      for (const po of body.purchaseOrders) {
        expect(Object.keys(po).sort()).toEqual(["buildKeys", "include", "key"]);
      }
      expect(JSON.stringify(body)).not.toMatch(/sku|qty|cost|price/);
    }
    // ella's untick reached the wire: the sofa batch carries 2 docs, not 3.
    const sofaBody = JSON.parse(
      String((calls.find(([, i]) => String((i as RequestInit).body).includes('"sofa"'))![1] as RequestInit).body),
    );
    expect(sofaBody.purchaseOrders).toHaveLength(2);
    expect(JSON.stringify(sofaBody)).not.toContain("bk-e");

    // The grid updated IN PLACE: PO numbers on the headers, rows still there.
    expect(screen.getByTestId(`to-order-result-${OHANA}::sofa`)).toHaveTextContent("PO-sofa-1");
    expect(screen.getByTestId(`to-order-result-${OHANA}::bedframe`)).toHaveTextContent(
      "PO-bedframe-1",
    );
    expect(screen.getByTestId(`to-order-row-${OHANA}::bedframe-o9`)).toBeInTheDocument();
    expect(screen.getByTestId("to-order-done-line")).toHaveTextContent(
      "3 Purchase Orders created",
    );
  });

  it("a failed group fails ALONE — ✗ on its header, Retry retries only it", async () => {
    failCategories = new Set(["bedframe"]);
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-create"));

    await waitFor(() => {
      expect(screen.getByTestId(`to-order-result-${OHANA}::bedframe`)).toHaveTextContent(
        "boom-bedframe",
      );
    });
    // Sofa succeeded beside it.
    expect(screen.getByTestId(`to-order-result-${OHANA}::sofa`)).toHaveTextContent("PO-sofa-1");

    failCategories = new Set();
    apiFetch.mockClear();
    fireEvent.click(screen.getByTestId(`to-order-retry-${OHANA}::bedframe`));
    await waitFor(() => {
      expect(screen.getByTestId(`to-order-result-${OHANA}::bedframe`)).toHaveTextContent(
        "PO-bedframe-1",
      );
    });
    // ONLY the failed group was retried.
    expect(apiFetch.mock.calls.filter(([p]) => String(p).endsWith("/issue"))).toHaveLength(1);
  });

  it("demand the catalog could not read stops the whole batch, by name", async () => {
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
    expect(screen.getByTestId("to-order-create")).toBeDisabled();
  });
});

describe("the sheet", () => {
  it("Group by None is the flat Excel — supplier · category ride the row", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId("to-order-groupby-none"));
    const flat = await screen.findByTestId("to-order-flat");
    const row = within(flat).getByTestId(`to-order-row-${OHANA}::bedframe-o9`);
    expect(row).toHaveTextContent("Ohana · Bedframe");
    // No group headers in the flat view.
    expect(screen.queryByTestId(`to-order-group-${OHANA}::sofa`)).toBeNull();
  });

  it("Destination lives on the GROUP — one purchase order, one destination", async () => {
    await loaded();
    const g = screen.getByTestId(`to-order-group-${OHANA}::bedframe`);
    expect(within(g).getByText("Carres Klang")).toBeInTheDocument();
    // The batch bar carries no destination control at all.
    expect(within(screen.getByTestId("to-order-batch-bar")).queryByText(W.destination)).toBeNull();
  });

  it("an empty lens is an answer, not a blank sheet", async () => {
    apiFetch.mockImplementation((path: string) =>
      path.endsWith("/to-order")
        ? Promise.resolve({ ...TO_ORDER, proposals: [] })
        : route(path),
    );
    render(wrap());
    await screen.findByText(W.empty);
    expect(screen.getByTestId("to-order-empty")).toHaveTextContent(W.empty);
  });

  it("the batch bar appears only when there is something to say", async () => {
    await loaded();
    // A selection exists → the bar is up.
    expect(screen.getByTestId("to-order-batch-bar")).toBeInTheDocument();
    // Take every group off — nothing to say, the height goes back to the grid.
    fireEvent.click(document.getElementById(`group-${OHANA}::sofa`)!);
    fireEvent.click(document.getElementById(`group-${OHANA}::bedframe`)!);
    expect(screen.queryByTestId("to-order-batch-bar")).toBeNull();
    // One tick brings it back.
    fireEvent.click(rowBox(`${OHANA}::bedframe`, "o9"));
    expect(screen.getByTestId("to-order-batch-bar")).toBeInTheDocument();
  });

  it("the top strip follows the Orders page; the panel holds Views · Group", async () => {
    await loaded();
    // The strip is the Orders page's own header shape: breadcrumb left,
    // the shared icon cluster right — NO search anywhere (Loo, 2026-08-01:
    // the views and the grid are the finding tools) and still no H1.
    const strip = screen.getByTestId("to-order-header-strip");
    expect(strip).toHaveTextContent("Purchasing");
    expect(strip).toHaveTextContent("To Order");
    expect(screen.queryByRole("searchbox")).toBeNull();
    const panel = screen.getByTestId("to-order-panel");
    expect(within(panel).getByTestId("to-order-lens-today")).toBeInTheDocument();
    expect(within(panel).getByTestId("to-order-groupby-supplier")).toBeInTheDocument();
    expect(within(panel).getByText(W.panelViews)).toBeInTheDocument();
    expect(within(panel).getByText(W.panelGroup)).toBeInTheDocument();
    // Gmail's rhythm: the grid starts immediately. No Refresh (ruled out
    // again 2026-08-01 — the plan updates itself), and Create Proposal /
    // Columns join once BUILT, never as dead controls.
    expect(screen.queryByTestId("to-order-refresh")).toBeNull();
    expect(screen.queryByText("Refresh")).toBeNull();
    expect(screen.queryByTestId("to-order-create-proposal")).toBeNull();
    expect(screen.queryByText(W.createProposal)).toBeNull();
    // No H1 anywhere — the lit tab is the page identity (Loo's law).
    expect(document.querySelector("h1")).toBeNull();
  });

  it("collapsing a group folds its rows to the one-line summary", async () => {
    await loaded();
    fireEvent.click(screen.getByTestId(`to-order-collapse-${OHANA}::sofa`));
    expect(screen.queryByTestId(`to-order-row-${OHANA}::sofa-o2`)).toBeNull();
    // The header (with its counts) is still on screen.
    expect(screen.getByTestId(`to-order-group-${OHANA}::sofa`)).toHaveTextContent("3 SO");
  });
});
