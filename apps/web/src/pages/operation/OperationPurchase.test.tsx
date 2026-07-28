import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type {
  PurchasePlaceGroup,
  PurchaseTodayResponse,
} from "@carres/shared";

/**
 * To Order — card P2, the click behaviour (`docs/UI-KIT.md` §8.2).
 *
 * Every test here locks a behaviour a screenshot cannot prove, and each one
 * was broken before P2:
 *
 *  1. Clicking the SAME PO again clears it. The row already toggled `selection`
 *     to null; the auto-select effect put the first row straight back one hook
 *     later, so a re-click had never once cleared anything — it silently jumped
 *     to a DIFFERENT factory instead.
 *  2. Clicking the stage you are already on is a no-op. It used to re-run the
 *     whole reset and throw away the supplier filter the operator had just set
 *     — the exact opposite of §8.2's "the table keeps its filter".
 *  3. Clicking the same supplier again clears it. This one was already true;
 *     the test exists so it cannot quietly stop being true.
 *  4. Closing a drawer gives the list back — the filter, the selection and the
 *     facet rail's scroll position.
 */

const mutation = () => ({ mutate: vi.fn(), isPending: false });

const usePurchaseToday = vi.fn();
const useOperationSuppliers = vi.fn();

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>(
    "@/lib/queries",
  );
  return {
    ...actual,
    usePurchaseToday: (...a: unknown[]) => usePurchaseToday(...a),
    useOperationSuppliers: (...a: unknown[]) => useOperationSuppliers(...a),
    // `refetch` MUST resolve to a query result — the drawer's close handler
    // awaits it and reads `.data`. A bare `vi.fn()` returns undefined, which
    // throws AFTER the test has finished and leaves an unhandled rejection
    // that no assertion can see.
    useOperationPos: () => ({
      data: { pos: [] },
      refetch: vi.fn().mockResolvedValue({ data: { pos: [] } }),
    }),
    useOperationWarehouse: () => ({ data: { warehouses: [] } }),
    useOperationOrders: () => ({ data: { orders: [] } }),
    useOperationPoDuty: () => ({ data: null }),
    usePurchasingSettings: () => ({ data: { canEdit: false } }),
    useChasePoEventMutation: () => mutation(),
    usePurchaseSkipLines: () => mutation(),
    usePurchasePushLines: () => mutation(),
    usePurchaseSnoozeSupplier: () => mutation(),
  };
});

import OperationPurchase from "./OperationPurchase";

const NICE = "11111111-1111-1111-1111-111111111111";
const OHANA = "22222222-2222-2222-2222-222222222222";

function group(over: Partial<PurchasePlaceGroup> & { supplierId: string }): PurchasePlaceGroup {
  return {
    supplierName: null,
    categories: ["mattress"],
    totalUnits: 3,
    orderCount: 1,
    earliestOrderBy: "2026-08-01",
    urgency: "scheduled",
    lines: [
      {
        sku: "N1001S-Q",
        modelName: "Nice 1001",
        category: "mattress",
        need: 3,
        forOrders: [
          {
            so: 1256,
            customerName: "Tan Wei Ming",
            deliveryDate: "2026-08-20",
            ref: null,
          },
        ],
        orderBy: "2026-08-01",
        ready: 0,
        cost: null,
        lineIds: [],
      },
    ],
    ...over,
  } as PurchasePlaceGroup;
}

function today(over: Partial<PurchaseTodayResponse> = {}): PurchaseTodayResponse {
  return {
    today: "2026-07-28",
    bundles: [],
    placeGroups: [
      group({ supplierId: NICE, categories: ["mattress"] }),
      group({ supplierId: OHANA, categories: ["bedframe"], totalUnits: 5 }),
    ],
    bySku: [],
    chase: [],
    receive: [],
    summary: {
      late: 0,
      urgent: 0,
      due: 0,
      scheduled: 2,
      no_deadline: 0,
      toPlaceBundles: 2,
      toOrderUnits: 8,
      toChase: 0,
      chaseLate: 0,
      toReceive: 0,
    },
    ...over,
  } as PurchaseTodayResponse;
}

const refetch = vi.fn().mockResolvedValue({});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operation?tab=purchase"]}>
        <OperationPurchase />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  usePurchaseToday.mockReturnValue({
    data: today(),
    isLoading: false,
    isError: false,
    error: null,
    refetch,
  });
  useOperationSuppliers.mockReturnValue({
    data: {
      suppliers: [
        { id: NICE, name: "Nice Future" },
        { id: OHANA, name: "Ohana" },
      ],
    },
  });
});

/** The place row's own selected state — `aria-pressed`, set by P2. */
function placeRow(supplierId: string, category: string) {
  return screen.getByTestId(`place-row-${supplierId}::${category}`);
}
function firstPlaceRow(supplierId: string) {
  // Single-category groups keep the bare supplier id as their groupKey.
  return screen.getByTestId(`place-row-${supplierId}`);
}

describe("To Order · §8.2 click again clears (card P2)", () => {
  it("clicking the SAME PO again clears it instead of jumping to another factory", async () => {
    renderPage();
    // The page auto-selects the first row so the preview is never blank.
    const nice = firstPlaceRow(NICE);
    const ohana = firstPlaceRow(OHANA);
    await waitFor(() => expect(nice).toHaveAttribute("aria-pressed", "true"));

    // Pick the second factory, then click it again.
    fireEvent.click(ohana);
    await waitFor(() => expect(ohana).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(ohana);

    await waitFor(() =>
      expect(ohana).toHaveAttribute("aria-pressed", "false"),
    );
    // The regression this test exists for: the auto-select effect used to fill
    // the gap with the FIRST row, so "clear" silently meant "select Nice
    // Future" — a different factory's PO on screen after asking for none.
    expect(nice).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByText("Select a factory on the left to see the SKU list."),
    ).toBeInTheDocument();
  });

  it("clicking a cleared row again selects it — the clear is not sticky", async () => {
    renderPage();
    const nice = firstPlaceRow(NICE);
    await waitFor(() => expect(nice).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(nice);
    await waitFor(() => expect(nice).toHaveAttribute("aria-pressed", "false"));
    fireEvent.click(nice);
    await waitFor(() => expect(nice).toHaveAttribute("aria-pressed", "true"));
  });

  it("clicking the same supplier facet cell again clears the filter", async () => {
    renderPage();
    const cell = screen.getByTestId(`facet-supplier-${OHANA}`);

    fireEvent.click(cell);
    await waitFor(() =>
      expect(screen.getByText("Supplier: Ohana")).toBeInTheDocument(),
    );
    // Only Ohana's PO survives the filter.
    expect(screen.queryByTestId(`place-row-${NICE}`)).toBeNull();

    fireEvent.click(cell);
    await waitFor(() =>
      expect(screen.queryByText("Supplier: Ohana")).toBeNull(),
    );
    expect(screen.getByTestId(`place-row-${NICE}`)).toBeInTheDocument();
  });

  it("clicking the stage you are already on keeps the supplier filter", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId(`facet-supplier-${OHANA}`));
    await waitFor(() =>
      expect(screen.getByText("Supplier: Ohana")).toBeInTheDocument(),
    );

    // Send POs is the active stage. Clicking it used to re-run the reset and
    // drop the filter without saying so.
    fireEvent.click(screen.getByTestId("facet-stage-place"));

    expect(screen.getByText("Supplier: Ohana")).toBeInTheDocument();
    expect(screen.queryByTestId(`place-row-${NICE}`)).toBeNull();
  });

  it("switching to a DIFFERENT stage still clears the filters", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId(`facet-supplier-${OHANA}`));
    await waitFor(() =>
      expect(screen.getByText("Supplier: Ohana")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("facet-stage-chase"));
    await waitFor(() =>
      expect(screen.queryByText("Supplier: Ohana")).toBeNull(),
    );
  });

  it("a split supplier renders one row per category and each toggles on its own", async () => {
    usePurchaseToday.mockReturnValue({
      data: today({
        placeGroups: [
          group({
            supplierId: OHANA,
            categories: ["bedframe", "sofa"],
            lines: [
              {
                sku: "BF-1-Q",
                modelName: "Frame",
                category: "bedframe",
                need: 2,
                forOrders: [
                  { so: 1, customerName: "A", deliveryDate: "2026-08-20", ref: null },
                ],
                orderBy: "2026-08-01",
                ready: 0,
                cost: null,
                lineIds: [],
              },
              {
                sku: "SF-1",
                modelName: "Sofa",
                category: "sofa",
                need: 1,
                forOrders: [
                  { so: 2, customerName: "B", deliveryDate: "2026-08-25", ref: null },
                ],
                orderBy: "2026-08-05",
                ready: 0,
                cost: null,
                lineIds: [],
              },
            ],
          }),
        ],
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch,
    });
    renderPage();

    const bedframe = placeRow(OHANA, "bedframe");
    const sofa = placeRow(OHANA, "sofa");
    fireEvent.click(sofa);
    await waitFor(() => expect(sofa).toHaveAttribute("aria-pressed", "true"));
    expect(bedframe).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(sofa);
    await waitFor(() => expect(sofa).toHaveAttribute("aria-pressed", "false"));
    expect(bedframe).toHaveAttribute("aria-pressed", "false");
  });
});

describe("To Order · R8 · the three stage cells speak the dictionary", () => {
  it("reads Send PO · Confirm ready date · Check in, and nothing else", () => {
    renderPage();
    // COPY-STANDARD, PURCHASING — the queue-tile string of each action, taken
    // from `order-action-words.ts` so the cell cannot drift from the row.
    expect(screen.getByTestId("facet-stage-place")).toHaveTextContent("Send PO");
    expect(screen.getByTestId("facet-stage-chase")).toHaveTextContent(
      "Confirm ready date",
    );
    expect(screen.getByTestId("facet-stage-receive")).toHaveTextContent(
      "Check in",
    );
  });

  it("says none of the three retired words anywhere on the tab", () => {
    const { container } = renderPage();
    // `Chase` is BANNED (it names a mood); `Receive` as a verb is banned in
    // favour of `Check in`; `Send POs` was the plural of an action that has a
    // locked singular. All three shipped on this cell row for months.
    expect(container.textContent).not.toMatch(/Send POs/);
    expect(container.textContent).not.toMatch(/Chase factory/);
  });

  it("the middle-list header repeats the CELL's word, not a second one", () => {
    renderPage();
    // The stage header used to say `Chase factories` while the cell beside it
    // said `Chase factory` — one act, two spellings, one screen.
    fireEvent.click(screen.getByTestId("facet-stage-chase"));
    const shell = screen.getByTestId("operation-purchase");
    expect(shell.textContent).not.toMatch(/Chase factories/);
    expect(shell.textContent).not.toMatch(/Receive deliveries/);
  });
});

describe("To Order · §8.2 closing the drawer gives the list back (card P2)", () => {
  it("keeps the filter, the selection and the rail's scroll across the drawer", async () => {
    renderPage();

    // Leave the list in a specific state: filtered to Ohana, Ohana's PO open.
    fireEvent.click(screen.getByTestId(`facet-supplier-${OHANA}`));
    await waitFor(() =>
      expect(screen.getByText("Supplier: Ohana")).toBeInTheDocument(),
    );
    const ohana = firstPlaceRow(OHANA);
    await waitFor(() => expect(ohana).toHaveAttribute("aria-pressed", "true"));

    // Scroll the facet rail. jsdom has no layout, so give the element a real
    // scrollable box first — otherwise scrollTop can only ever be 0 and the
    // assertion would pass without proving anything.
    const rail = screen.getByTestId("listshell-facet");
    Object.defineProperty(rail, "scrollHeight", { value: 900, configurable: true });
    Object.defineProperty(rail, "clientHeight", { value: 400, configurable: true });
    rail.scrollTop = 260;

    // Open the drawer (+ New PO), then close it.
    fireEvent.click(screen.getByText("New PO"));
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toBeInTheDocument(),
    );
    rail.scrollTop = 0; // what a re-render / refetch does to it
    fireEvent.click(screen.getByLabelText("Close modal"));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Supplier: Ohana")).toBeInTheDocument();
    expect(firstPlaceRow(OHANA)).toHaveAttribute("aria-pressed", "true");
    expect(rail.scrollTop).toBe(260);
  });

  it("gives back an EMPTY selection too — a clear survives the drawer", async () => {
    renderPage();
    const nice = firstPlaceRow(NICE);
    await waitFor(() => expect(nice).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(nice);
    await waitFor(() => expect(nice).toHaveAttribute("aria-pressed", "false"));

    fireEvent.click(screen.getByText("New PO"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Close modal"));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(firstPlaceRow(NICE)).toHaveAttribute("aria-pressed", "false");
    expect(firstPlaceRow(OHANA)).toHaveAttribute("aria-pressed", "false");
  });
});
