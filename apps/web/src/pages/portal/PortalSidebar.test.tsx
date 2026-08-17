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

// The rail self-fetches badges / pending count; stub the queries so no network.
vi.mock("@/lib/queries", () => ({
  useOperationBadges: () => ({ data: undefined }),
  useMarkOperationBadgeSeen: () => ({ mutate: vi.fn() }),
  usePrincipalDashboard: () => ({ data: undefined }),
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

describe("PortalSidebar — merged Purchasing item active across its 3 routes", () => {
  beforeEach(() => {
    mockRole = "operation";
  });

  function purchasingLink() {
    return screen.getByText("Purchasing").closest("a") as HTMLAnchorElement;
  }

  it("links to the To Order tab (?tab=purchase), not ?tab=purchasing", () => {
    renderAt("/operation?tab=purchase");
    expect(purchasingLink()).toHaveAttribute("href", "/operation?tab=purchase");
  });

  it("is active on the To Order tab (?tab=purchase)", () => {
    renderAt("/operation?tab=purchase");
    expect(purchasingLink().className).toContain("font-semibold");
  });

  it("is active on the Receiving tab (?tab=receiving)", () => {
    renderAt("/operation?tab=receiving");
    expect(purchasingLink().className).toContain("font-semibold");
  });

  it("is active on the Purchase Orders path (/operation/procurement)", () => {
    renderAt("/operation/procurement/nice-future");
    expect(purchasingLink().className).toContain("font-semibold");
  });

  it("is NOT active on a non-purchasing tab (e.g. ?tab=payments)", () => {
    renderAt("/operation?tab=payments");
    expect(purchasingLink().className).not.toContain("font-semibold");
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
    for (const heading of ["Workspace", "Sales", "Supply Chain", "Finance", "Customer Care", "Master Data"]) {
      expect(screen.getByText(heading)).toBeInTheDocument();
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
