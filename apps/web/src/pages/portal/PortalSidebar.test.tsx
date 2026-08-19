import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * PortalSidebar — role-filtered area accordion (Unified Internal Portal,
 * 2026-06-30). Verifies that each role sees exactly the areas it may:
 *   - operation → Operations only
 *   - finance   → Finance only
 *   - principal → Operations + Finance + Admin (only the active area expanded)
 */

let mockRole: string | null = "operation";
vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { role: string | null; session: unknown }) => unknown) =>
    selector({ role: mockRole, session: { user: { email: "x@carres.com" } } }),
}));

// The rail self-fetches badges / pending count / the purchasing settings gate;
// stub the queries so no network.
let mockCanEditPurchasingSettings = false;
vi.mock("@/lib/queries", () => ({
  useOperationBadges: () => ({ data: undefined }),
  useMarkOperationBadgeSeen: () => ({ mutate: vi.fn() }),
  usePrincipalDashboard: () => ({ data: undefined }),
  usePurchasingSettings: () => ({
    data: { canEdit: mockCanEditPurchasingSettings },
  }),
}));

import PortalSidebar from "./PortalSidebar";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PortalSidebar />
    </MemoryRouter>,
  );
}

describe("PortalSidebar — role visibility", () => {
  beforeEach(() => {
    mockRole = "operation";
  });

  it("operation sees Operations items only — no Finance / Admin", () => {
    mockRole = "operation";
    renderAt("/operation");
    // The three procurement rails merged into ONE "Purchasing" item (2026-07-21).
    expect(screen.getByText("Purchasing")).toBeInTheDocument();
    // 0226 — operation gets the costing Operation Catalog; Product &
    // Maintenance (selling prices) is principal-only.
    expect(screen.getByText("Catalog")).toBeInTheDocument();
    expect(screen.queryByText("Product & Maintenance")).not.toBeInTheDocument();
    expect(screen.queryByText("AR · Receivables")).not.toBeInTheDocument();
    expect(screen.queryByText("Accounts")).not.toBeInTheDocument();
  });

  it("finance sees Finance items only — no Operations", () => {
    mockRole = "finance";
    renderAt("/finance/dashboard");
    expect(screen.getByText("AR · Receivables")).toBeInTheDocument();
    expect(screen.getByText("Reconciliation")).toBeInTheDocument();
    expect(screen.queryByText("Purchasing")).not.toBeInTheDocument();
    expect(screen.queryByText("Accounts")).not.toBeInTheDocument();
  });

  it("principal sees all three area headers; only the active area is expanded", () => {
    mockRole = "principal";
    renderAt("/operation");
    // All three area groups are visible to the boss.
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.getAllByText("Finance").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Admin")).toBeInTheDocument();
    // Active area (operation) is expanded → its items render. Catalog split
    // (2026-07-25): Operations carries ONLY the costing Operation Catalog —
    // the selling Product & Maintenance moved to the (collapsed) Admin area.
    expect(screen.getByText("Catalog")).toBeInTheDocument();
    expect(screen.queryByText("Product & Maintenance")).not.toBeInTheDocument();
    // Inactive areas are collapsed → their items are hidden until clicked.
    expect(screen.queryByText("AR · Receivables")).not.toBeInTheDocument();
    expect(screen.queryByText("Accounts")).not.toBeInTheDocument();
  });

  it("principal on the Finance base expands the Finance area", () => {
    mockRole = "principal";
    renderAt("/finance/ar");
    expect(screen.getByText("AR · Receivables")).toBeInTheDocument();
    // Operations now collapsed.
    expect(screen.queryByText("Purchasing")).not.toBeInTheDocument();
  });
});

describe("PURCHASING is a heading, not a parent row (Jess, 2026-08-19)", () => {
  beforeEach(() => {
    mockRole = "operation";
  });

  it("renders the PURCHASING heading and no bare `Purchasing` row", () => {
    renderAt("/operation?tab=purchase");
    const heading = screen.getByText("Purchasing");
    // A heading is a <div>, never a link — the pages are the doors.
    expect(heading.closest("a")).toBeNull();
    expect(heading.className).toContain("uppercase");
    // The umbrella word is gone for good.
    expect(screen.queryByText("Supply Chain")).toBeNull();
  });

  it("each page lights ITSELF — SO Batch Purchase on its tab, Receiving on its own", () => {
    renderAt("/operation?tab=purchase");
    expect(
      (screen.getByTestId("nav-child-purchase").closest("a") ?? screen.getByTestId("nav-child-purchase")).className,
    ).toContain("font-semibold");
    expect(screen.getByTestId("nav-child-receiving").className).not.toContain("font-semibold");
  });

  it("Purchase Orders lights on its path, alone", () => {
    renderAt("/operation/procurement/nice-future");
    expect(screen.getByTestId("nav-child-purchase-orders").className).toContain("font-semibold");
    expect(screen.getByTestId("nav-child-purchase").className).not.toContain("font-semibold");
  });

  it("the purchasing pages sit at the same structure as Sales Orders — items, not children", () => {
    renderAt("/operation?tab=purchase");
    const sales = screen.getByText("Sales Orders").closest("a")!;
    const batch = screen.getByTestId("nav-child-purchase");
    // Equal structure: both are direct rows in the same items column, with the
    // same base classes (assert structure, not pixel numbers).
    expect(batch.tagName).toBe("A");
    expect(batch.className).toContain("px-3.5");
    expect(sales.className).toContain("px-3.5");
    expect(batch.parentElement?.parentElement).toBe(sales.parentElement?.parentElement);
  });

  it("Delivery and Warehouse each carry their own heading — no umbrella survives", () => {
    renderAt("/operation?tab=purchase");
    for (const word of ["Delivery", "Warehouse"]) {
      const els = screen.getAllByText(word);
      // One of them is the heading (a non-link div with the heading classes).
      expect(els.some((el) => el.closest("a") === null && el.className.includes("uppercase"))).toBe(true);
    }
  });
});

describe("WAREHOUSE is a heading with its pages as rows (Warehouse Blueprint item 13, CARD-2026-08-19-warehouse-rail)", () => {
  beforeEach(() => {
    mockRole = "operation";
  });

  it("renders the WAREHOUSE heading and no bare `Stock` row", () => {
    renderAt("/operation?tab=stock-onhand");
    const heading = screen.getByText("Warehouse");
    // A heading is a <div>, never a link — the pages are the doors.
    expect(heading.closest("a")).toBeNull();
    expect(heading.className).toContain("uppercase");
    expect(screen.queryByText("Stock")).not.toBeInTheDocument();
  });

  it("the three built pages are doors keeping their `?tab=` addresses", () => {
    renderAt("/operation?tab=stock-onhand");
    const onHand = screen.getByText("On hand").closest("a") as HTMLAnchorElement;
    const ready = screen.getByText("Ready stock").closest("a") as HTMLAnchorElement;
    const inOut = screen.getByText("In & out").closest("a") as HTMLAnchorElement;
    expect(onHand).toHaveAttribute("href", "/operation?tab=stock-onhand");
    expect(ready).toHaveAttribute("href", "/operation?tab=stock-plan");
    expect(inOut).toHaveAttribute("href", "/operation?tab=movements");
  });

  it("Transfers went live and is a real link — the flag dropped, the span became a Link", () => {
    // CARD-2026-08-19-warehouse-transfers (0365): going live is two edits in
    // the page's own PR, and the row keeps its learned place in the rail.
    renderAt("/operation?tab=stock-onhand");
    const transfers = screen.getByText("Transfers").closest("a") as HTMLAnchorElement;
    expect(transfers).toHaveAttribute("href", "/operation?tab=transfers");
    expect(screen.getByText("Transfers").closest("[data-soon='1']")).toBeNull();
  });

  it("Counts still prints `Coming soon` and is NOT a control", () => {
    renderAt("/operation?tab=stock-onhand");
    const el = screen.getByText("Counts");
    expect(el.closest("a")).toBeNull();
    expect(el.closest("[data-soon='1']")).not.toBeNull();
  });

  it("the blueprint keeps Reports and Settings central — no Report or Settings row under WAREHOUSE", () => {
    renderAt("/operation?tab=stock-onhand");
    const nav = screen.getAllByTestId(/^nav-child-/).filter((el) =>
      ["stock", "stock-plan", "movements", "transfers", "counts"].includes(
        el.getAttribute("data-testid")!.replace("nav-child-", ""),
      ),
    );
    // Exactly the five blueprint rows — nothing else joined the group.
    expect(nav.length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByTestId("nav-child-warehouse-report")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-child-warehouse-settings")).not.toBeInTheDocument();
  });
});

describe("PortalSidebar — catalog split into two doors (2026-07-25)", () => {
  beforeEach(() => {
    mockRole = "principal";
  });

  it("Admin lists the selling Product & Maintenance (last, after Accounts)", () => {
    renderAt("/principal?tab=dashboard");
    const pm = screen.getByText("Product & Maintenance").closest("a") as HTMLAnchorElement;
    expect(pm).toHaveAttribute("href", "/principal?tab=catalog");
    // Sits at the bottom of the Admin list, below Accounts (Loo's placement).
    const accounts = screen.getByText("Accounts").closest("a") as HTMLAnchorElement;
    expect(
      accounts.compareDocumentPosition(pm) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("is active on /principal?tab=catalog — with NO section sub-links in the rail", () => {
    renderAt("/principal?tab=catalog");
    const pm = screen.getByText("Product & Maintenance").closest("a") as HTMLAnchorElement;
    expect(pm.className).toContain("font-semibold");
    // 2026-07-25: Loo dropped the indented section links — the rail stays flat.
    expect(screen.queryByText("SKU Master")).not.toBeInTheDocument();
    expect(screen.queryByText("Promo / GWP")).not.toBeInTheDocument();
  });

  it("operation never sees the selling catalog — only the costing Operation Catalog", () => {
    mockRole = "operation";
    renderAt("/operation?tab=op-catalog");
    expect(screen.getByText("Catalog")).toBeInTheDocument();
    expect(screen.queryByText("Product & Maintenance")).not.toBeInTheDocument();
  });
});

describe("PortalSidebar — ERP Shell V1 responsibility groups", () => {
  it("groups real operation destinations without removing temporary Old Orders access", () => {
    mockRole = "operation";
    renderAt("/operation/orders");
    for (const heading of ["Workspace", "Sales", "Purchasing", "Delivery", "Warehouse", "Finance", "Customer Care", "Master Data"]) {
      // Delivery appears twice (heading + its own row) — assert the
      // HEADING form exists: a non-link div in the heading rank.
      const els = screen.getAllByText(heading);
      expect(
        els.some((el) => el.closest("a") === null && el.className.includes("uppercase")),
      ).toBe(true);
    }
    expect(screen.getByText("Catalog")).toBeInTheDocument();
    expect(screen.queryByText("Operation Catalog")).not.toBeInTheDocument();
    expect(screen.getByText("Old Orders (temporary)")).toBeInTheDocument();
  });
});

describe("PortalSidebar — Commission is ONE HR entry (Loo 2026-07-27)", () => {
  beforeEach(() => {
    mockRole = "principal";
  });

  function commissionLink() {
    return screen.getByText("Commission").closest("a") as HTMLAnchorElement;
  }

  it("the rail no longer carries a second Commission Setup item", () => {
    renderAt("/hr?tab=commission");
    expect(commissionLink()).toHaveAttribute("href", "/hr?tab=commission");
    expect(screen.queryByText("Commission Setup")).not.toBeInTheDocument();
  });

  it("Attribution is gone from the rail (retired 2026-07-27)", () => {
    renderAt("/hr?tab=commission");
    expect(screen.queryByText("Attribution")).not.toBeInTheDocument();
  });

  it("stays lit on the Setup sub-tab (?tab=setup)", () => {
    renderAt("/hr?tab=setup");
    expect(commissionLink().className).toContain("font-semibold");
  });

  it("is NOT lit on another HR tab (?tab=team)", () => {
    renderAt("/hr?tab=team");
    expect(commissionLink().className).not.toContain("font-semibold");
  });
});

/**
 * ⭐ SALES ORDER PRODUCTION CUTOVER (owner, 2026-08-10 —
 * `docs/SALES-ORDER-CUTOVER.md`).
 *
 * The rail carries TWO Orders doors, and the difference between them must be
 * legible from the rail alone:
 *   - `Sales Orders`           → `/operation/orders`      the OFFICIAL page
 *   - `Old Orders (temporary)` → `/operation/old-orders`  the door being closed
 *
 * The word `(temporary)` is load-bearing, not decoration: a legacy surface
 * that looks permanent becomes permanent. And exactly ONE item may be lit at a
 * time — the reason the temporary door is `/operation/old-orders` and not a
 * `/operation/orders/...` sub-path, which `startsWith` would light twice.
 */
/**
 * ⭐ PORTAL NAVIGATION ACTIVE COLOUR — APPROVED / LOCKED (`docs/ui/MASTER.md`).
 *
 * "I am on this page" is SELECTION, so it wears the governed blue treatment:
 * a `kit-blue-9` active line + a `kit-blue-3` wash. It may never be the flame
 * `primary`, because red in Carres already means ONE thing — late / act now —
 * and an operator who sees the same red for "this row is overdue" and "this is
 * the page you are on" can no longer tell them apart. The grey `base-100` wash
 * this replaced was not a selection colour either.
 *
 * These tests are the guard: they fail the moment `primary` or `base-100`
 * returns to the active row, at either nav level.
 */
describe("PortalSidebar — active nav is governed blue, never flame", () => {
  beforeEach(() => {
    mockRole = "operation";
  });

  const activeRow = () =>
    screen.getByText("Sales Orders").closest("a") as HTMLAnchorElement;

  it("the expanded active row wears the blue-3 selection wash", () => {
    renderAt("/operation/orders");
    expect(activeRow().className).toContain("bg-kit-blue-3");
  });

  it("the expanded active row carries a blue-9 line and a blue-9 icon", () => {
    renderAt("/operation/orders");
    const row = activeRow();
    expect(row.querySelector(".bg-kit-blue-9")).not.toBeNull();
    expect(row.querySelector(".text-kit-blue-9")).not.toBeNull();
  });

  it("no flame and no grey wash survives anywhere in the active row", () => {
    renderAt("/operation/orders");
    const row = activeRow();
    expect(row.className).not.toContain("bg-primary");
    expect(row.className).not.toContain("bg-base-100");
    expect(row.querySelector(".bg-primary")).toBeNull();
    expect(row.querySelector(".text-primary")).toBeNull();
  });

  it("an INACTIVE row wears no selection colour at all", () => {
    renderAt("/operation/orders");
    const old = screen
      .getByText("Old Orders (temporary)")
      .closest("a") as HTMLAnchorElement;
    expect(old.className).not.toContain("bg-kit-blue-3");
    expect(old.querySelector(".bg-kit-blue-9")).toBeNull();
    expect(old.querySelector(".text-kit-blue-9")).toBeNull();
  });

  it("the COLLAPSED icon rail lights blue too — same law, smaller rail", () => {
    localStorage.setItem("ops-sidebar-collapsed", "1");
    try {
      renderAt("/operation/orders");
      const icon = screen.getByTitle("Sales Orders") as HTMLAnchorElement;
      expect(icon.className).toContain("bg-kit-blue-3");
      expect(icon.querySelector(".bg-kit-blue-9")).not.toBeNull();
      expect(icon.querySelector(".text-kit-blue-9")).not.toBeNull();
      expect(icon.className).not.toContain("bg-base-100");
      expect(icon.querySelector(".text-primary")).toBeNull();
    } finally {
      localStorage.removeItem("ops-sidebar-collapsed");
    }
  });
});

describe("PortalSidebar — the Sales Order cutover's two doors", () => {
  beforeEach(() => {
    mockRole = "operation";
  });

  const salesLink = () =>
    screen.getByText("Sales Orders").closest("a") as HTMLAnchorElement;
  const oldLink = () =>
    screen
      .getByText("Old Orders (temporary)")
      .closest("a") as HTMLAnchorElement;

  it("both doors are in the rail, each pointing at its own route", () => {
    renderAt("/operation/orders");
    expect(salesLink()).toHaveAttribute("href", "/operation/orders");
    expect(oldLink()).toHaveAttribute("href", "/operation/old-orders");
  });

  it("the old door says it is temporary", () => {
    renderAt("/operation/orders");
    expect(screen.getByText("Old Orders (temporary)")).toBeInTheDocument();
  });

  it("on /operation/orders only Sales Orders is lit", () => {
    renderAt("/operation/orders");
    expect(salesLink().className).toContain("font-semibold");
    expect(oldLink().className).not.toContain("font-semibold");
  });

  it("on /operation/old-orders only the old door is lit", () => {
    renderAt("/operation/old-orders");
    expect(oldLink().className).toContain("font-semibold");
    expect(salesLink().className).not.toContain("font-semibold");
  });

  it("the old door stays lit on a carried-over kanban slug", () => {
    renderAt("/operation/old-orders/in_production");
    expect(oldLink().className).toContain("font-semibold");
    expect(salesLink().className).not.toContain("font-semibold");
  });
});

/**
 * THE PURCHASING PAGES LEFT THE HEADER AND JOINED THE RAIL (Jess, 2026-08-18).
 *
 * The module's `Purchasing` item expands in place — one rail, not two. All
 * THIRTEEN entries are listed from day one (the eleven approved pages, then
 * Report and Settings below a hairline), because the rail is the module's MAP
 * and a map showing four of eleven roads teaches three operators a shape that
 * is about to change under them seven more times.
 *
 * The seven unbuilt entries are NOT CONTROLS: no href, out of the tab order,
 * `aria-disabled`, printing `Coming soon` on the row. That is what keeps them
 * inside `03-page-patterns.md:149` (no dead controls) while satisfying `:219`
 * (a deliberately disabled control must say why, on screen).
 */
describe("PortalSidebar — the Purchasing pages are in the rail", () => {
  beforeEach(() => {
    mockRole = "operation";
    mockCanEditPurchasingSettings = false;
  });

  const LIVE = [
    "SO Batch Purchase",
    // Went live 2026-08-19 (CARD-2026-08-18-manual-purchase): the two ruled
    // edits — the flag dropped, the span became a link.
    "Manual Purchase",
    "Purchase Orders",
    "Receiving",
    "Supplier Claims",
    "Report",
  ];
  const SOON = [
    "Purchase Returns",
    "Repair Orders",
    "Display Requests",
    "Consignment Orders",
    "Consignment Receipts",
    "Consignment Returns",
  ];

  it("lists every page while standing in Purchasing", () => {
    renderAt("/operation?tab=purchase");
    for (const word of [...LIVE, ...SOON]) {
      expect(screen.getByText(word)).toBeInTheDocument();
    }
  });

  it("lists them in the approved order of purchasing/MASTER.md §1", () => {
    renderAt("/operation?tab=purchase");
    const PURCHASING_KEYS = [
      "purchase", "manual-purchase", "purchase-orders", "receiving", "claims",
      "purchase-returns", "repair-orders", "display-requests",
      "consignment-orders", "consignment-receipts", "consignment-returns",
      "purchasing-report",
    ];
    const rows = Array.from(
      document.querySelectorAll("[data-testid^='nav-child-']"),
    )
      .filter((el) =>
        PURCHASING_KEYS.includes(el.getAttribute("data-testid")!.replace("nav-child-", "")),
      )
      .map((el) => el.textContent?.replace("Coming soon", "").trim());
    expect(rows).toEqual([
      "SO Batch Purchase",
      "Manual Purchase",
      "Purchase Orders",
      "Receiving",
      "Supplier Claims",
      "Purchase Returns",
      "Repair Orders",
      "Display Requests",
      "Consignment Orders",
      "Consignment Receipts",
      "Consignment Returns",
      "Report",
    ]);
  });

  it("the two renames are live and the old words appear nowhere", () => {
    renderAt("/operation?tab=purchase");
    expect(screen.getByText("SO Batch Purchase")).toBeInTheDocument();
    expect(screen.getByText("Supplier Claims")).toBeInTheDocument();
    expect(screen.queryByText("To Order")).not.toBeInTheDocument();
    expect(screen.queryByText("Claims")).not.toBeInTheDocument();
  });

  it("`Receiving` keeps its word — no `Goods Receipts`, no `GRN`", () => {
    renderAt("/operation?tab=purchase");
    expect(screen.getByText("Receiving")).toBeInTheDocument();
    expect(screen.queryByText("Goods Receipts")).not.toBeInTheDocument();
    expect(screen.queryByText(/GRN/)).not.toBeInTheDocument();
  });

  it("an unbuilt entry is NOT a control — no href, not focusable, says why", () => {
    renderAt("/operation?tab=purchase");
    for (const key of [
      "purchase-returns",
      "repair-orders",
      "display-requests",
      "consignment-orders",
      "consignment-receipts",
      "consignment-returns",
    ]) {
      const row = screen.getByTestId(`nav-child-${key}`);
      expect(row.tagName).toBe("SPAN");
      expect(row.getAttribute("href")).toBeNull();
      expect(row.getAttribute("role")).not.toBe("link");
      expect(row.getAttribute("tabindex")).toBe("-1");
      expect(row.getAttribute("aria-disabled")).toBe("true");
      expect(row.textContent).toContain("Coming soon");
      // Measured 2026-08-19 on the production stylesheet: beside the 71px tag
      // a name gets 71px of the row's 150px and every unbuilt name needs
      // 78-128px — the three Consignment entries truncated to one identical
      // string. The name owns its line; the reason stacks under it.
      expect(row.className).toContain("flex-col");
      expect(row.querySelector(".truncate")?.textContent ?? "").not.toContain(
        "Coming soon",
      );
    }
  });

  it("a live entry IS a link and does not say `Coming soon`", () => {
    renderAt("/operation?tab=purchase");
    const row = screen.getByTestId("nav-child-receiving");
    expect(row.tagName).toBe("A");
    expect(row.getAttribute("href")).toBe("/operation?tab=receiving");
    expect(row.textContent).not.toContain("Coming soon");
  });

  it("`Purchase Orders` links to its nested path, not to a ?tab=", () => {
    renderAt("/operation?tab=purchase");
    expect(screen.getByTestId("nav-child-purchase-orders").getAttribute("href")).toBe(
      "/operation/procurement",
    );
  });

  it("no unbuilt entry renders a count, and none renders a `0`", () => {
    renderAt("/operation?tab=purchase");
    for (const key of SOON) {
      const row = screen.getByText(key).closest("[data-testid^='nav-child-']");
      expect(row?.querySelector("[data-testid^='nav-badge-']")).toBeNull();
      expect(row?.textContent).not.toMatch(/\b0\b/);
    }
  });

  it("no rail carries a Settings row — the header gear is the one entry (Jess, 2026-08-19)", () => {
    renderAt("/operation?tab=purchase");
    expect(screen.queryByTestId("nav-child-purchasing-settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("the page you are standing on is the highlighted one", () => {
    renderAt("/operation?tab=receiving");
    expect(screen.getByTestId("nav-child-receiving").className).toContain("font-semibold");
    expect(screen.getByTestId("nav-child-claims").className).not.toContain("font-semibold");
  });

  it("a nested path page wins — Receiving does not light up next to Purchase Orders", () => {
    renderAt("/operation/procurement");
    expect(screen.getByTestId("nav-child-purchase-orders").className).toContain(
      "font-semibold",
    );
    expect(screen.getByTestId("nav-child-receiving").className).not.toContain(
      "font-semibold",
    );
  });

  it("the pages never hide — SALES' template, no accordion (2026-08-19)", () => {
    renderAt("/operation?tab=stock-onhand");
    // Standing in Stock, the purchasing pages are still on screen — the
    // accordion died with the parent row.
    expect(screen.getByTestId("nav-child-purchase")).toBeInTheDocument();
    expect(screen.getByText("Supplier Claims")).toBeInTheDocument();
    // ...and the heading is still there.
    expect(screen.getByText("Purchasing").closest("a")).toBeNull();
  });});
