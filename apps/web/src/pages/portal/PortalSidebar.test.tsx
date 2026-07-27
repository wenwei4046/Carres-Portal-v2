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
    expect(screen.getByText("Operation Catalog")).toBeInTheDocument();
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
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    // Active area (operation) is expanded → its items render. Catalog split
    // (2026-07-25): Operations carries ONLY the costing Operation Catalog —
    // the selling Product & Maintenance moved to the (collapsed) Admin area.
    expect(screen.getByText("Operation Catalog")).toBeInTheDocument();
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
    expect(screen.getByText("Operation Catalog")).toBeInTheDocument();
    expect(screen.queryByText("Product & Maintenance")).not.toBeInTheDocument();
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
