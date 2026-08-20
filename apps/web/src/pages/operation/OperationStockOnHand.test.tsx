import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import OperationStockOnHand from "./OperationStockOnHand";
import type { OpsStockItem } from "@carres/shared";

/**
 * OperationStockOnHand — the unified per-unit Stock list. On Hand redesign C+ ·
 * P1: the four status chips moved into an always-visible LEFT filter rail
 * (Design 2). They are now buttons in the "Status" group; the filtering logic
 * (ready / reserved / defective predicates) is unchanged, so these tests target
 * the status buttons by accessible name.
 *
 * Mocks apiFetch so the single /inventory fetch returns a fixture; OpsStockListView
 * is rendered for real with injected rows (its own fetch is disabled via the
 * `rows` prop), so this also exercises the embedded-mode + unitCode column fix.
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

function makeUnit(p: Partial<OpsStockItem> & { id: string; unitCode: string }): OpsStockItem {
  return {
    sku: "SKU-1",
    warehouseId: "wh-klang",
    condition: "new",
    status: "free",
    reservedRef: null,
    refHistory: [],
    needsRepair: false,
    supplier: null,
    poNo: null,
    sourceRef: null,
    dateIn: "2026-05-20",
    createdAt: "2026-05-20T00:00:00Z",
    updatedAt: "2026-05-20T00:00:00Z",
    ...p,
  };
}

// all=7, ready=3 (u1 new, u2 display, u4 fair-used), reserved=1 (u3), defective=1 (u5 needsRepair)
const UNITS: OpsStockItem[] = [
  makeUnit({ id: "1", unitCode: "id-aaa111", condition: "new", status: "free" }),
  makeUnit({ id: "2", unitCode: "id-bbb222", condition: "exhibition", status: "free" }),
  makeUnit({ id: "3", unitCode: "id-ccc333", condition: "new", status: "reserved", reservedRef: "SO-1142" }),
  makeUnit({ id: "4", unitCode: "id-ddd444", condition: "old", status: "free" }),
  makeUnit({ id: "5", unitCode: "id-eee555", condition: "new", status: "free", needsRepair: true }),
  makeUnit({ id: "6", unitCode: "id-fff666", condition: "new", status: "incoming" }),
  makeUnit({ id: "7", unitCode: "id-ggg777", condition: "new", status: "sold" }),
];

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // K0: the page mounts StockTabs (react-router Link/useLocation), so it must
  // mount inside a Router — same as OperationReceiving.test with PurchasingTabs.
  return render(
    <MemoryRouter initialEntries={["/operation?tab=stock-onhand"]}>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>,
  );
}

const statusBtn = (name: RegExp) => screen.getByRole("button", { name });

/** The filter rail group a heading belongs to (FilterGroup: label + pill list). */
const railGroup = (label: string) => screen.getByText(label).parentElement!;
/** Every pill in a rail group, in render order, as "Label count". The label and
 *  the count are separate spans with no whitespace between them, so they are
 *  joined explicitly rather than read off textContent. */
const pillNames = (group: HTMLElement) =>
  Array.from(group.querySelectorAll("button")).map((b) =>
    Array.from(b.querySelectorAll("span"))
      .map((s) => (s.textContent ?? "").trim())
      .filter(Boolean)
      .join(" "),
  );
// Default view is grouped (rollup, collapsed) — switch to Flat to assert on
// individual unit rows.
const showFlat = () => fireEvent.click(screen.getByRole("tab", { name: /Flat/ }));

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((path: string) => {
    if (typeof path === "string" && path.includes("/ops/stock/inventory")) {
      return Promise.resolve({ items: UNITS, total: UNITS.length });
    }
    return Promise.resolve({ items: [], total: 0 });
  });
});

describe("OperationStockOnHand", () => {
  it("renders the 4 status filters with counts derived from the inventory grid", async () => {
    wrap(<OperationStockOnHand />);
    // Counts start at 0 during the inventory fetch, then settle — wait for it.
    await waitFor(() => {
      expect(within(statusBtn(/^All\b/)).getByText("7")).toBeInTheDocument();
    });
    expect(within(statusBtn(/^Ready\b/)).getByText("3")).toBeInTheDocument();
    expect(within(statusBtn(/^Reserved\b/)).getByText("1")).toBeInTheDocument();
    expect(within(statusBtn(/^Defective\b/)).getByText("1")).toBeInTheDocument();
  });

  it("Flat view lists every unit with its Unit ID", async () => {
    wrap(<OperationStockOnHand />);
    await waitFor(() => statusBtn(/^All\b/));
    showFlat();
    await waitFor(() =>
      expect(screen.getAllByRole("row").length).toBeGreaterThan(7),
    );
    // Unit ID column shows the minted code, not the SKU.
    expect(screen.getByText("id-aaa111")).toBeInTheDocument();
    expect(screen.getByText("id-ggg777")).toBeInTheDocument();
  });

  it("Ready filter shows free + sellable-grade + not-flagged units", async () => {
    wrap(<OperationStockOnHand />);
    await waitFor(() => statusBtn(/^Ready\b/));
    showFlat();
    fireEvent.click(statusBtn(/^Ready\b/));
    await waitFor(() => {
      expect(screen.getByText("id-aaa111")).toBeInTheDocument(); // new
      expect(screen.getByText("id-bbb222")).toBeInTheDocument(); // display
      expect(screen.getByText("id-ddd444")).toBeInTheDocument(); // fair (used) — now sellable
    });
    // reserved / needsRepair / incoming / sold are excluded
    expect(screen.queryByText("id-ccc333")).not.toBeInTheDocument();
    expect(screen.queryByText("id-eee555")).not.toBeInTheDocument();
  });

  it("Defective filter shows needs-repair OR damaged units", async () => {
    wrap(<OperationStockOnHand />);
    await waitFor(() => statusBtn(/^Defective\b/));
    showFlat();
    fireEvent.click(statusBtn(/^Defective\b/));
    await waitFor(() => {
      expect(screen.getByText("id-eee555")).toBeInTheDocument(); // needsRepair
    });
    // fair (used) is now sellable, no longer defective
    expect(screen.queryByText("id-ddd444")).not.toBeInTheDocument();
    expect(screen.queryByText("id-aaa111")).not.toBeInTheDocument(); // ready
  });

  it("Reserved filter shows the customer ref", async () => {
    wrap(<OperationStockOnHand />);
    await waitFor(() => statusBtn(/^Reserved\b/));
    showFlat();
    fireEvent.click(statusBtn(/^Reserved\b/));
    await waitFor(() => {
      expect(screen.getByText("id-ccc333")).toBeInTheDocument();
    });
    expect(screen.getByText("SO-1142")).toBeInTheDocument();
    expect(screen.queryByText("id-aaa111")).not.toBeInTheDocument();
  });

  it("invents no category pill when the catalog answered nothing", async () => {
    // The shared fixture pre-dates the catalog join, so no row carries one and
    // all 7 fall in the no-match bucket. Nothing may be conjured from the SKU
    // text "SKU-1" to fill the group.
    wrap(<OperationStockOnHand />);
    await waitFor(() => statusBtn(/^All\b/));
    expect(pillNames(railGroup("Category"))).toEqual(["Any", "Not in catalog 7"]);
  });

  it("Grouped view rolls units up by model (collapsed by default), expandable", async () => {
    wrap(<OperationStockOnHand />);
    // Default is grouped: the shared SKU-1 model appears as one collapsed group
    // header, and the individual unit ids are hidden until expanded.
    await waitFor(() =>
      expect(screen.getByText("SKU-1")).toBeInTheDocument(),
    );
    expect(screen.queryByText("id-aaa111")).not.toBeInTheDocument();
    // Expanding the group reveals its units.
    fireEvent.click(screen.getByText("SKU-1"));
    await waitFor(() =>
      expect(screen.getByText("id-aaa111")).toBeInTheDocument(),
    );
  });
});

/**
 * The Category filter — CARD-2026-08-19-onhand-category-filter.
 *
 * The category is the CATALOG's answer (D9, ERP-ARCHITECTURE §3.1) and arrives
 * already resolved on `/inventory`; this page only groups and labels it. The
 * fixture mirrors live prod: catalogued furniture alongside free-text import
 * SKUs the catalog has never held.
 *
 * Note the two uncatalogued SKUs: their TEXT contains "Pillow" and "Mattress".
 * They must land in the no-match bucket regardless — a Mattress pill counting
 * the protector would be D9 reappearing on a new screen.
 */
const SOFA = "TCF-Sofa-Lucca-3S-Beige";
const MATTRESS = "Breeze FirmCare-B1201F-K";
const PILLOW = "Essential Memory Pillow(L)";
const MP_K = "Microfiber Waterproof Mattress Protector-K";

const CATALOG_UNITS: OpsStockItem[] = [
  makeUnit({ id: "s1", unitCode: "id-sofa01", sku: SOFA, category: "sofa" }),
  makeUnit({
    id: "s2",
    unitCode: "id-sofa02",
    sku: SOFA,
    category: "sofa",
    status: "reserved",
    reservedRef: "SO-9001",
  }),
  makeUnit({ id: "m1", unitCode: "id-matt01", sku: MATTRESS, category: "mattress" }),
  makeUnit({ id: "p1", unitCode: "id-pill01", sku: PILLOW, category: null }),
  makeUnit({ id: "p2", unitCode: "id-pill02", sku: PILLOW, category: null }),
  makeUnit({ id: "x1", unitCode: "id-prot01", sku: MP_K, category: null }),
];

describe("OperationStockOnHand — the Category filter", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/ops/stock/inventory")) {
        return Promise.resolve({
          items: CATALOG_UNITS,
          total: CATALOG_UNITS.length,
        });
      }
      return Promise.resolve({ items: [], total: 0 });
    });
  });

  it("lists the categories present, in catalog order, with the no-match bucket last", async () => {
    wrap(<OperationStockOnHand />);
    await waitFor(() => statusBtn(/^All\b/));
    // Catalog order (mattress · bedframe · sofa · …), NOT count order and NOT
    // alphabetical — and the honest bucket sits at the bottom, never folded
    // into Accessory.
    expect(pillNames(railGroup("Category"))).toEqual([
      // `Any` is the rail's no-filter word for a facet; `All` belongs to the
      // Status bucket list and must not be duplicated here.
      "Any",
      "Mattress 1",
      "Sofa 2",
      "Not in catalog 3",
    ]);
  });

  it("still shows a category this page has no ruled order for", async () => {
    // If the catalog gains a seventh category, its units must not become
    // countable-but-unfilterable. Known order first, the stranger after it.
    apiFetchMock.mockImplementation((path: string) =>
      typeof path === "string" && path.includes("/ops/stock/inventory")
        ? Promise.resolve({
            items: [
              ...CATALOG_UNITS,
              makeUnit({
                id: "n1",
                unitCode: "id-new001",
                sku: "NEW-1",
                category: "hammock",
              }),
            ],
            total: CATALOG_UNITS.length + 1,
          })
        : Promise.resolve({ items: [], total: 0 }),
    );
    wrap(<OperationStockOnHand />);
    await waitFor(() => statusBtn(/^All\b/));
    expect(pillNames(railGroup("Category"))).toEqual([
      "Any",
      "Mattress 1",
      "Sofa 2",
      "hammock 1",
      "Not in catalog 3",
    ]);
  });

  it("picking a category narrows the table to that category", async () => {
    wrap(<OperationStockOnHand />);
    await waitFor(() => statusBtn(/^All\b/));
    showFlat();
    fireEvent.click(within(railGroup("Category")).getByRole("button", { name: /^Sofa/ }));
    await waitFor(() => {
      expect(screen.getByText("id-sofa01")).toBeInTheDocument();
    });
    expect(screen.getByText("id-sofa02")).toBeInTheDocument();
    expect(screen.queryByText("id-matt01")).not.toBeInTheDocument();
    expect(screen.queryByText("id-pill01")).not.toBeInTheDocument();
  });

  it("the no-match bucket shows ONLY units the catalog does not hold", async () => {
    wrap(<OperationStockOnHand />);
    await waitFor(() => statusBtn(/^All\b/));
    showFlat();
    fireEvent.click(
      within(railGroup("Category")).getByRole("button", { name: /^Not in catalog/ }),
    );
    await waitFor(() => {
      expect(screen.getByText("id-pill01")).toBeInTheDocument();
    });
    expect(screen.getByText("id-pill02")).toBeInTheDocument();
    // The protector's SKU says "Mattress"; the catalog does not. It belongs here.
    expect(screen.getByText("id-prot01")).toBeInTheDocument();
    expect(screen.queryByText("id-sofa01")).not.toBeInTheDocument();
    expect(screen.queryByText("id-matt01")).not.toBeInTheDocument();
  });

  it("composes with Status as an AND, like every other rail group", async () => {
    wrap(<OperationStockOnHand />);
    await waitFor(() => statusBtn(/^All\b/));
    showFlat();
    fireEvent.click(within(railGroup("Category")).getByRole("button", { name: /^Sofa/ }));
    fireEvent.click(statusBtn(/^Reserved\b/));
    // Two sofas, one reserved → the reserved one only.
    await waitFor(() => {
      expect(screen.getByText("id-sofa02")).toBeInTheDocument();
    });
    expect(screen.queryByText("id-sofa01")).not.toBeInTheDocument();
    expect(screen.queryByText("id-pill01")).not.toBeInTheDocument();
  });

  it("clicking the active pill again clears it, and Clear filters resets it", async () => {
    wrap(<OperationStockOnHand />);
    await waitFor(() => statusBtn(/^All\b/));
    const sofa = () =>
      within(railGroup("Category")).getByRole("button", { name: /^Sofa/ });
    fireEvent.click(sofa());
    await waitFor(() => expect(screen.getByText(/Showing/)).toHaveTextContent("2"));
    // Toggling the same pill off restores the full list.
    fireEvent.click(sofa());
    await waitFor(() => expect(screen.getByText(/Showing/)).toHaveTextContent("6"));
    // And the rail's own reset clears it too.
    fireEvent.click(sofa());
    await waitFor(() => expect(screen.getByText(/Showing/)).toHaveTextContent("2"));
    fireEvent.click(screen.getByRole("button", { name: /Clear filters/ }));
    await waitFor(() => expect(screen.getByText(/Showing/)).toHaveTextContent("6"));
  });
});
