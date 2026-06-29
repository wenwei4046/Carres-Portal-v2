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
    expect(screen.getByText("SO Maintenance")).toBeInTheDocument();
    expect(screen.getByText("Product & Maintenance")).toBeInTheDocument();
    expect(screen.queryByText("AR · Receivables")).not.toBeInTheDocument();
    expect(screen.queryByText("Accounts")).not.toBeInTheDocument();
  });

  it("finance sees Finance items only — no Operations", () => {
    mockRole = "finance";
    renderAt("/finance/dashboard");
    expect(screen.getByText("AR · Receivables")).toBeInTheDocument();
    expect(screen.getByText("Reconciliation")).toBeInTheDocument();
    expect(screen.queryByText("SO Maintenance")).not.toBeInTheDocument();
    expect(screen.queryByText("Accounts")).not.toBeInTheDocument();
  });

  it("principal sees all three area headers; only the active area is expanded", () => {
    mockRole = "principal";
    renderAt("/operation");
    // All three area groups are visible to the boss.
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    // Active area (operation) is expanded → its items render.
    expect(screen.getByText("Product & Maintenance")).toBeInTheDocument();
    // Inactive areas are collapsed → their items are hidden until clicked.
    expect(screen.queryByText("AR · Receivables")).not.toBeInTheDocument();
    expect(screen.queryByText("Accounts")).not.toBeInTheDocument();
  });

  it("principal on the Finance base expands the Finance area", () => {
    mockRole = "principal";
    renderAt("/finance/ar");
    expect(screen.getByText("AR · Receivables")).toBeInTheDocument();
    // Operations now collapsed.
    expect(screen.queryByText("SO Maintenance")).not.toBeInTheDocument();
  });
});
