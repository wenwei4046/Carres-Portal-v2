import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OperationReceiving from "./OperationReceiving";

/**
 * OperationReceiving — the GRN 待收 queue (P3). Mocks apiFetch so the three
 * underlying hooks (pos / suppliers / warehouse) return fixtures; asserts the
 * status tabs, counts, and per-row Receive affordance.
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

const SUPPLIERS = [
  { id: "sup-nf", name: "Nice Future", kind: "factory_pickup" },
  { id: "sup-oh", name: "Ohana", kind: "factory_pickup" },
];
const WAREHOUSES = [{ id: "wh-klang", name: "Carres Klang", address: "Klang" }];

function po(p: {
  id: string;
  supplier_id: string;
  status: "open" | "received" | "cancelled";
  sup_status: string;
  // R1 (0284): the two inspection counters are optional on the fixture, the
  // same way they are optional on the wire — a PO with a clean delivery
  // history simply omits them.
  lines: {
    id: string;
    sku: string;
    qty: number;
    received_qty: number;
    damaged_qty?: number;
    wrong_item_qty?: number;
  }[];
  warehouse_id?: string;
}) {
  return {
    id: p.id,
    supplier_id: p.supplier_id,
    warehouse_id: p.warehouse_id ?? "wh-klang",
    status: p.status,
    sup_status: p.sup_status,
    so: 1001,
    so_refs: null,
    eta_date: "2026-06-20",
    placed_at: "2026-06-01T00:00:00Z",
    purchase_order_lines: p.lines,
  };
}

const POS = [
  po({ id: "PO-2001", supplier_id: "sup-nf", status: "open", sup_status: "ready_for_pickup", lines: [{ id: "l1", sku: "MS01", qty: 5, received_qty: 0 }] }),
  po({ id: "PO-2002", supplier_id: "sup-oh", status: "open", sup_status: "in_production", lines: [{ id: "l2", sku: "SF02", qty: 2, received_qty: 0 }] }),
  po({ id: "PO-2003", supplier_id: "sup-nf", status: "received", sup_status: "delivered", lines: [{ id: "l3", sku: "BF01", qty: 3, received_qty: 3 }] }),
  po({ id: "PO-2004", supplier_id: "sup-oh", status: "cancelled", sup_status: "cancelled", lines: [{ id: "l4", sku: "SF03", qty: 1, received_qty: 0 }] }),
];

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // The page now renders the shared PurchasingTabs bar (uses router hooks), so
  // it must mount inside a Router.
  return render(
    <MemoryRouter initialEntries={["/operation?tab=receiving"]}>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>,
  );
}

/** The page's own status tabs (To receive / Received / All) — scoped away from
 *  the module-level PurchasingTabs bar, which is also a tablist. */
async function statusTabs() {
  const list = await screen.findByRole("tablist", { name: "Receiving status" });
  return within(list).getAllByRole("tab");
}

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((path: string) => {
    if (typeof path === "string" && path.includes("/api/operation/suppliers"))
      return Promise.resolve({ suppliers: SUPPLIERS });
    if (typeof path === "string" && path.includes("/api/operation/warehouse"))
      return Promise.resolve({ warehouses: WAREHOUSES });
    if (typeof path === "string" && path.includes("/api/operation/pos"))
      return Promise.resolve({ pos: POS });
    return Promise.resolve({});
  });
});

describe("OperationReceiving", () => {
  it("renders 3 status tabs with counts (cancelled excluded)", async () => {
    wrap(<OperationReceiving />);
    const tabs = await statusTabs();
    expect(tabs).toHaveLength(3);
    // To receive = 2 open, Received = 1, All = 3 (cancelled PO-2004 excluded).
    await waitFor(() => {
      expect(within(tabs[0]).getByText("2")).toBeInTheDocument();
    });
    expect(within(tabs[1]).getByText("1")).toBeInTheDocument();
    expect(within(tabs[2]).getByText("3")).toBeInTheDocument();
  });

  it("defaults to 'To receive' and shows a Check in button per open PO", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() => {
      expect(screen.getByText("PO-2001")).toBeInTheDocument();
    });
    expect(screen.getByText("PO-2002")).toBeInTheDocument();
    expect(screen.getByTestId("receive-PO-2001")).toBeInTheDocument();
    // received + cancelled POs are not in the default queue
    expect(screen.queryByText("PO-2003")).not.toBeInTheDocument();
    expect(screen.queryByText("PO-2004")).not.toBeInTheDocument();
  });

  // ── R8 · the row and the panel above it say ONE word for ONE act ───────────
  it("the row's action button says `Check in`, never `Receive →`", async () => {
    wrap(<OperationReceiving />);
    const btn = await screen.findByTestId("receive-PO-2001");
    // COPY-STANDARD: "Log goods arrival — the ACT: **Check in**"; `Receive` as
    // a verb is in the do-not-use column. This button said `Receive →` while
    // the R6 warehouse-receipt panel directly above it said `Check in`.
    expect(btn).toHaveTextContent("Check in");
    expect(btn.textContent).not.toMatch(/Receive/);
  });

  it("renders no `Receive` verb anywhere on the tab", async () => {
    const { container } = wrap(<OperationReceiving />);
    await waitFor(() => expect(screen.getByText("PO-2001")).toBeInTheDocument());
    // `Received` (the status tab and the pill) is a FACT and stays — the ban is
    // on the verb. Assert the verb shapes, not the stem.
    expect(container.textContent).not.toMatch(/Receive →/);
    expect(container.textContent).not.toMatch(/\bReceive\b(?!d)/);
  });

  it("'Received' tab shows received POs as Done (no Receive button)", async () => {
    wrap(<OperationReceiving />);
    const tabs = await statusTabs();
    fireEvent.click(tabs[1]); // Received
    await waitFor(() => {
      expect(screen.getByText("PO-2003")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("receive-PO-2003")).not.toBeInTheDocument();
    expect(screen.queryByText("PO-2001")).not.toBeInTheDocument();
  });

  it("search filters by PO id", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() => expect(screen.getByText("PO-2001")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("PO number or supplier…"), {
      target: { value: "2002" },
    });
    await waitFor(() =>
      expect(screen.queryByText("PO-2001")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("PO-2002")).toBeInTheDocument();
  });

  // Scoped to the ROWS by P2: the same two names now also head the rail's
  // Supplier facet, which is correct and makes an unscoped `getByText` ambiguous.
  it("shows the supplier name resolved from the suppliers list", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() => {
      expect(screen.getAllByText("Nice Future").length).toBeGreaterThan(0);
    });
    const names = screen
      .getAllByTestId("receiving-row")
      .map((r) => r.querySelectorAll("td")[1]?.textContent);
    expect(names).toContain("Nice Future");
    expect(names).toContain("Ohana");
  });

  it("P4 — excludes POs bound for an LP-owned warehouse once one exists (GRN = own WH only)", async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/api/operation/suppliers"))
        return Promise.resolve({ suppliers: SUPPLIERS });
      if (typeof path === "string" && path.includes("/api/operation/warehouse"))
        return Promise.resolve({
          warehouses: [
            { id: "wh-klang", name: "Carres Klang", address: "Klang", owning_partner_id: null },
            { id: "wh-balakong", name: "HOUZS Balakong", address: "Balakong", owning_partner_id: "lp-houzs" },
          ],
        });
      if (typeof path === "string" && path.includes("/api/operation/pos"))
        return Promise.resolve({
          pos: [
            po({ id: "PO-3001", supplier_id: "sup-nf", status: "open", sup_status: "ready_for_pickup", warehouse_id: "wh-klang", lines: [{ id: "k1", sku: "MS01", qty: 2, received_qty: 0 }] }),
            po({ id: "PO-3002", supplier_id: "sup-oh", status: "open", sup_status: "in_production", warehouse_id: "wh-balakong", lines: [{ id: "k2", sku: "SF02", qty: 1, received_qty: 0 }] }),
          ],
        });
      return Promise.resolve({});
    });
    wrap(<OperationReceiving />);
    // PO-3001 → Carres Klang (own WH) shows; PO-3002 → HOUZS Balakong (LP) excluded.
    await waitFor(() => expect(screen.getByText("PO-3001")).toBeInTheDocument());
    expect(screen.queryByText("PO-3002")).not.toBeInTheDocument();
  });
});

/**
 * R1 — the row says where the delivery is, in words.
 *
 * The card's own done-when: "还有 2 张没到" must be readable from this list
 * without opening anything.
 */
describe("OperationReceiving — R1 progress state", () => {
  const R1_POS = [
    po({ id: "PO-4001", supplier_id: "sup-nf", status: "open", sup_status: "in_production", lines: [{ id: "a1", sku: "MS01", qty: 10, received_qty: 0 }] }),
    po({ id: "PO-4002", supplier_id: "sup-nf", status: "open", sup_status: "partially_shipped", lines: [{ id: "a2", sku: "MS02", qty: 10, received_qty: 8 }] }),
    po({ id: "PO-4003", supplier_id: "sup-oh", status: "open", sup_status: "partially_shipped", lines: [{ id: "a3", sku: "SF01", qty: 6, received_qty: 3, damaged_qty: 2, wrong_item_qty: 1 }] }),
    po({ id: "PO-4004", supplier_id: "sup-oh", status: "received", sup_status: "delivered", lines: [{ id: "a4", sku: "BF01", qty: 4, received_qty: 4 }] }),
  ];

  beforeEach(() => {
    apiFetchMock.mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/api/operation/suppliers"))
        return Promise.resolve({ suppliers: SUPPLIERS });
      if (typeof path === "string" && path.includes("/api/operation/warehouse"))
        return Promise.resolve({ warehouses: WAREHOUSES });
      if (typeof path === "string" && path.includes("/api/operation/pos"))
        return Promise.resolve({ pos: R1_POS });
      return Promise.resolve({});
    });
  });

  it("reads In transit / Partially received (8/10) / Receiving issue off the list", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() =>
      expect(screen.getByTestId("receiving-progress-PO-4001")).toHaveTextContent(
        "In transit",
      ),
    );
    expect(screen.getByTestId("receiving-progress-PO-4002")).toHaveTextContent(
      "Partially received (8/10)",
    );
    expect(screen.getByTestId("receiving-progress-PO-4003")).toHaveTextContent(
      "Receiving issue",
    );
  });

  it("states what is still coming — 2 units pending delivery, never 'missing'", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() =>
      expect(screen.getByText("2 units pending delivery")).toBeInTheDocument(),
    );
    expect(screen.getByText("10 units pending delivery")).toBeInTheDocument();
    expect(screen.queryByText(/missing/i)).not.toBeInTheDocument();
  });

  it("names the problem on a PO with a receiving issue", async () => {
    wrap(<OperationReceiving />);
    await waitFor(() =>
      expect(screen.getByText("2 damaged · 1 wrong item")).toBeInTheDocument(),
    );
  });

  it("a settled PO reads Fully received with nothing outstanding", async () => {
    wrap(<OperationReceiving />);
    const tabs = await statusTabs();
    fireEvent.click(tabs[1]); // Received
    await waitFor(() =>
      expect(screen.getByTestId("receiving-progress-PO-4004")).toHaveTextContent(
        "Fully received",
      ),
    );
  });
});

/**
 * P2 — the facet rail and the §8.2 interaction law, on the Receiving tab.
 *
 * This tab had NO facet rail and NO filter state before this card, so nothing
 * here is a regression test: every assertion locks a behaviour that did not
 * exist. What each one is for:
 *
 *  1. `Check in` is the ONE queue tile of PURCHASING-WORKING-FLOW §7 that lives
 *     on this tab, and §9 says it is counted by QUANTITY. So a PO whose stored
 *     `status` still reads `open` but whose lines are fully received must NOT be
 *     in it — the tile and the `To receive` tab are deliberately two different
 *     questions.
 *  2. Every tile toggles (Receiving is a queue page, not a stage page: `All` is
 *     a legal, useful "nothing selected" view, which is §8.2's own test).
 *  3. Two tiles picked → two ✕-able chips, and one ✕ clears only its own.
 *  4. Closing the Check in drawer gives the list back — filters and the facet
 *     rail's scroll position.
 */
describe("Receiving · §8.2 the facet rail (card P2)", () => {
  // P-1 in transit (10 owed) · P-2 partially received (2 owed) ·
  // P-3 receiving issue (3 owed) · P-4 fully received by QUANTITY while its
  // stored status still says `open`.
  const P2_POS = [
    po({ id: "P-1", supplier_id: "sup-nf", status: "open", sup_status: "in_production", lines: [{ id: "b1", sku: "MS01", qty: 10, received_qty: 0 }] }),
    po({ id: "P-2", supplier_id: "sup-nf", status: "open", sup_status: "partially_shipped", lines: [{ id: "b2", sku: "MS02", qty: 10, received_qty: 8 }] }),
    po({ id: "P-3", supplier_id: "sup-oh", status: "open", sup_status: "partially_shipped", lines: [{ id: "b3", sku: "SF01", qty: 6, received_qty: 3, damaged_qty: 2, wrong_item_qty: 1 }] }),
    po({ id: "P-4", supplier_id: "sup-oh", status: "open", sup_status: "delivered", lines: [{ id: "b4", sku: "BF01", qty: 4, received_qty: 4 }] }),
  ];

  beforeEach(() => {
    apiFetchMock.mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/api/operation/suppliers"))
        return Promise.resolve({ suppliers: SUPPLIERS });
      if (typeof path === "string" && path.includes("/api/operation/warehouse"))
        return Promise.resolve({ warehouses: WAREHOUSES });
      if (typeof path === "string" && path.includes("/api/operation/pos"))
        return Promise.resolve({ pos: P2_POS });
      return Promise.resolve({});
    });
  });

  const rowIds = () =>
    screen
      .getAllByTestId("receiving-row")
      .map((r) => r.querySelector("td")?.textContent ?? "");

  async function ready() {
    wrap(<OperationReceiving />);
    await waitFor(() => expect(screen.getByText("P-1")).toBeInTheDocument());
  }

  it("counts Check in from the QUANTITIES, not from the PO's status word", async () => {
    await ready();
    const tile = screen.getByTestId("receiving-facet-checkin");
    // 3 of the 4 still owe units. P-4's stored status says `open`; its lines
    // say nothing is outstanding, and §9 says the quantities win.
    expect(tile).toHaveTextContent("3");

    fireEvent.click(tile);
    await waitFor(() => expect(rowIds()).not.toContain("P-4"));
    expect(rowIds()).toEqual(["P-1", "P-2", "P-3"]);
  });

  it("clicking the Check in tile again clears it and every PO comes back", async () => {
    await ready();
    const tile = screen.getByTestId("receiving-facet-checkin");
    fireEvent.click(tile);
    await waitFor(() => expect(tile).toHaveAttribute("aria-pressed", "true"));
    // R8 narrowed this: since the row buttons say `Check in` too (the same
    // dictionary word for the same act — which is the point of the card), a
    // bare text query now matches several buttons. The chip is what this test
    // is about, so it asks the chip row.
    expect(
      within(screen.getByTestId("listshell-active-chips")).getByText("Check in"),
    ).toBeInTheDocument();

    fireEvent.click(tile);
    await waitFor(() => expect(tile).toHaveAttribute("aria-pressed", "false"));
    expect(rowIds()).toEqual(["P-1", "P-2", "P-3", "P-4"]);
  });

  it("a Progress tile filters the table and clears on a second click", async () => {
    await ready();
    const issue = screen.getByTestId("receiving-facet-progress-receiving_issue");
    fireEvent.click(issue);
    await waitFor(() => expect(rowIds()).toEqual(["P-3"]));

    fireEvent.click(issue);
    await waitFor(() => expect(rowIds()).toHaveLength(4));
  });

  it("two tiles picked shows both queues and two ✕-able chips; one ✕ clears one", async () => {
    await ready();
    fireEvent.click(screen.getByTestId("receiving-facet-progress-receiving_issue"));
    fireEvent.click(screen.getByTestId("receiving-facet-progress-partially_received"));
    await waitFor(() => expect(rowIds()).toEqual(["P-2", "P-3"]));

    const chips = screen.getByTestId("listshell-active-chips");
    expect(within(chips).getAllByRole("button")).toHaveLength(2);

    fireEvent.click(within(chips).getByText("Partially received"));
    await waitFor(() => expect(rowIds()).toEqual(["P-3"]));
    expect(
      within(screen.getByTestId("listshell-active-chips")).getAllByRole("button"),
    ).toHaveLength(1);
  });

  it("a Supplier tile filters to that factory and clears on a second click", async () => {
    await ready();
    const ohana = screen.getByTestId("receiving-facet-supplier-sup-oh");
    fireEvent.click(ohana);
    await waitFor(() => expect(rowIds()).toEqual(["P-3", "P-4"]));
    expect(screen.getByText("Supplier: Ohana")).toBeInTheDocument();

    fireEvent.click(ohana);
    await waitFor(() => expect(rowIds()).toHaveLength(4));
    expect(screen.queryByText("Supplier: Ohana")).toBeNull();
  });

  it("hides the Check in tile on the Received tab — there is nothing to check in", async () => {
    await ready();
    expect(screen.getByTestId("receiving-facet-checkin")).toBeInTheDocument();
    const tabs = await statusTabs();
    fireEvent.click(tabs[1]); // Received — every one of these POs is `open`
    await waitFor(() =>
      expect(screen.queryByTestId("receiving-facet-checkin")).toBeNull(),
    );
  });

  it("closing the Check in drawer gives the filter and the rail's scroll back", async () => {
    await ready();
    fireEvent.click(screen.getByTestId("receiving-facet-supplier-sup-oh"));
    await waitFor(() =>
      expect(screen.getByText("Supplier: Ohana")).toBeInTheDocument(),
    );

    // jsdom has no layout, so give the rail a real scrollable box first —
    // otherwise scrollTop can only ever be 0 and the assertion would pass
    // without proving anything.
    const rail = screen.getByTestId("listshell-facet");
    Object.defineProperty(rail, "scrollHeight", { value: 900, configurable: true });
    Object.defineProperty(rail, "clientHeight", { value: 400, configurable: true });
    rail.scrollTop = 240;

    fireEvent.click(screen.getByTestId("receive-P-3"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    rail.scrollTop = 0; // what a re-render / refetch does to it
    fireEvent.click(screen.getByLabelText("Close modal"));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Supplier: Ohana")).toBeInTheDocument();
    expect(rowIds()).toEqual(["P-3", "P-4"]);
    expect(rail.scrollTop).toBe(240);
  });

  it("Reset filters clears every tile at once", async () => {
    await ready();
    fireEvent.click(screen.getByTestId("receiving-facet-checkin"));
    fireEvent.click(screen.getByTestId("receiving-facet-supplier-sup-oh"));
    await waitFor(() => expect(rowIds()).toEqual(["P-3"]));

    fireEvent.click(screen.getByText("Reset filters"));
    await waitFor(() => expect(rowIds()).toHaveLength(4));
    expect(screen.queryByTestId("listshell-active-chips")).toBeNull();
  });
});

/**
 * P3 · the two supplier calls land on this tab, in the band P2-Receiving
 * reserved for them ("When P3 lands, its two actions get their tiles in this
 * same band").
 *
 * Dates are deliberately far from today in BOTH directions — a past arrival
 * that only gets more past, a `2099` arrival that is never reached — so this
 * fixture cannot quietly start testing a different rung the way T7 found one
 * doing.
 */
describe("Receiving · P3 the two supplier calls", () => {
  const P3_POS = [
    // nothing due for a lifetime → no call
    { ...po({ id: "T-1", supplier_id: "sup-nf", status: "open", sup_status: "in_production", lines: [{ id: "t1", sku: "MS01", qty: 4, received_qty: 0 }] }), eta_date: "2099-01-01" },
    // due long ago, unanswered → the tomorrow call, late
    { ...po({ id: "T-2", supplier_id: "sup-nf", status: "open", sup_status: "in_production", lines: [{ id: "t2", sku: "MS02", qty: 4, received_qty: 0 }] }), eta_date: "2026-06-20" },
    // due long ago AND short → both calls at once (Law 1)
    {
      ...po({ id: "T-3", supplier_id: "sup-oh", status: "open", sup_status: "partially_shipped", lines: [{ id: "t3", sku: "SF01", qty: 4, received_qty: 1 }] }),
      eta_date: "2026-06-20",
      purchase_order_lines: [
        { id: "t3", sku: "SF01", qty: 4, received_qty: 1, short_since: "2026-06-22" },
      ],
    },
    // due long ago but ANSWERED about that very date → no call
    {
      ...po({ id: "T-4", supplier_id: "sup-oh", status: "open", sup_status: "in_production", lines: [{ id: "t4", sku: "BF01", qty: 4, received_qty: 0 }] }),
      eta_date: "2026-06-20",
      tomorrow_answer_about_date: "2026-06-20",
    },
  ];

  beforeEach(() => {
    apiFetchMock.mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/api/operation/suppliers"))
        return Promise.resolve({ suppliers: SUPPLIERS });
      if (typeof path === "string" && path.includes("/api/operation/warehouse"))
        return Promise.resolve({ warehouses: WAREHOUSES });
      if (typeof path === "string" && path.includes("/api/operation/pos"))
        return Promise.resolve({ pos: P3_POS });
      return Promise.resolve({});
    });
  });

  const rows = () =>
    screen
      .getAllByTestId("receiving-row")
      .map((r) => r.querySelector("td")?.textContent ?? "");

  async function ready() {
    wrap(<OperationReceiving />);
    await waitFor(() => expect(screen.getByText("T-1")).toBeInTheDocument());
  }

  it("both tiles carry the dictionary's own words", async () => {
    await ready();
    expect(screen.getByTestId("receiving-facet-tomorrow")).toHaveTextContent(
      "Confirm tomorrow's delivery",
    );
    expect(screen.getByTestId("receiving-facet-balance")).toHaveTextContent(
      "Confirm balance delivery date",
    );
  });

  it("the tomorrow tile counts POs that are due and unanswered — and no others", async () => {
    await ready();
    // T-2 and T-3. T-1 is not due for 70 years; T-4 has already been answered
    // about this very arrival date.
    expect(screen.getByTestId("receiving-facet-tomorrow")).toHaveTextContent("2");
  });

  it("the balance tile counts the POs it will SHOW, while the row names its line", async () => {
    await ready();
    // §3 counts this action per PO LINE; this tab's ROW is a PO, so the cell
    // prints the rows it returns (P2-Claims' honesty rule) and the per-line
    // figure is the number of buttons on the row.
    expect(screen.getByTestId("receiving-facet-balance")).toHaveTextContent("1");
    expect(screen.getByTestId("balance-t3")).toBeInTheDocument();
  });

  it("each tile filters and clears again (§8.2)", async () => {
    await ready();
    fireEvent.click(screen.getByTestId("receiving-facet-tomorrow"));
    await waitFor(() => expect(rows()).toEqual(["T-2", "T-3"]));
    fireEvent.click(screen.getByTestId("receiving-facet-tomorrow"));
    await waitFor(() => expect(rows()).toHaveLength(4));

    fireEvent.click(screen.getByTestId("receiving-facet-balance"));
    await waitFor(() => expect(rows()).toEqual(["T-3"]));
    fireEvent.click(screen.getByTestId("receiving-facet-balance"));
    await waitFor(() => expect(rows()).toHaveLength(4));
  });

  it("a PO carries BOTH calls at once — one never hides the other (Law 1)", async () => {
    await ready();
    expect(screen.getByTestId("tomorrow-T-3")).toBeInTheDocument();
    expect(screen.getByTestId("balance-t3")).toBeInTheDocument();
    expect(screen.getByTestId("receive-T-3")).toBeInTheDocument();
    // and an answered PO shows no tomorrow button at all
    expect(screen.queryByTestId("tomorrow-T-4")).toBeNull();
    expect(screen.queryByTestId("tomorrow-T-1")).toBeNull();
  });

  it("the tomorrow form asks the ruled question and names the DATE, not `tomorrow`", async () => {
    await ready();
    fireEvent.click(screen.getByTestId("tomorrow-T-2"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute(
      "aria-label",
      "Call Nice Future — confirm tomorrow's delivery",
    );
    // Loo's reason for ruling these two (2026-07-29): they stay true however
    // late they are read, so neither may contain a relative word.
    const shipping = screen.getByTestId("supplier-answer-shipping").parentElement!;
    const delayed = screen.getByTestId("supplier-answer-delayed").parentElement!;
    expect(shipping).toHaveTextContent("It ships on");
    expect(delayed).toHaveTextContent("It ships later than");
    expect(shipping.textContent).not.toMatch(/\btomorrow\b/i);
    expect(delayed.textContent).not.toMatch(/\btomorrow\b/i);
  });

  it("a delayed answer will not submit without the new date", async () => {
    await ready();
    fireEvent.click(screen.getByTestId("tomorrow-T-2"));
    // The ROW button and the FORM button carry the same dictionary string, which
    // is correct — so every assertion here is scoped to the dialog.
    const form = within(await screen.findByRole("dialog"));
    expect(form.getByText("Record answer")).not.toBeDisabled(); // shipping needs no date

    fireEvent.click(screen.getByTestId("supplier-answer-delayed"));
    await waitFor(() => expect(form.getByText("Record answer")).toBeDisabled());

    fireEvent.change(screen.getByTestId("supplier-answer-new-date"), {
      target: { value: "2026-09-15" },
    });
    await waitFor(() => expect(form.getByText("Record answer")).not.toBeDisabled());
  });

  it("the balance form is the balance action's own words", async () => {
    await ready();
    fireEvent.click(screen.getByTestId("balance-t3"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute(
      "aria-label",
      "Call Ohana — confirm balance delivery date",
    );
    expect(within(dialog).getByText("Record balance date")).toBeInTheDocument();
    // R1's own sentence about what is short — a FACT, no to-do word in it.
    expect(screen.getByTestId("balance-line-fact")).toHaveTextContent(
      "SF01 · 3 units pending delivery",
    );
  });

  it("closing a record-answer form gives the list back (§8.2, last line)", async () => {
    await ready();
    fireEvent.click(screen.getByTestId("receiving-facet-tomorrow"));
    await waitFor(() => expect(rows()).toEqual(["T-2", "T-3"]));

    const rail = screen.getByTestId("listshell-facet");
    Object.defineProperty(rail, "scrollHeight", { value: 900, configurable: true });
    Object.defineProperty(rail, "clientHeight", { value: 400, configurable: true });
    rail.scrollTop = 180;

    fireEvent.click(screen.getByTestId("tomorrow-T-2"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    rail.scrollTop = 0; // what the refetch on close does to it
    fireEvent.click(screen.getByLabelText("Close modal"));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(rows()).toEqual(["T-2", "T-3"]);
    expect(rail.scrollTop).toBe(180);
  });

  it("records the answer through the route keyed on the LINE", async () => {
    await ready();
    fireEvent.click(screen.getByTestId("balance-t3"));
    const form = within(await screen.findByRole("dialog"));
    fireEvent.change(screen.getByTestId("supplier-answer-new-date"), {
      target: { value: "2026-09-20" },
    });
    fireEvent.click(form.getByText("Record balance date"));

    await waitFor(() => {
      const call = apiFetchMock.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("/balance-date"),
      );
      expect(call).toBeTruthy();
      expect(call![0]).toBe("/api/operation/pos/lines/t3/balance-date");
      expect(JSON.parse((call![1] as { body: string }).body)).toEqual({
        newDate: "2026-09-20",
      });
    });
  });
});
