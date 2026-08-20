import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * PortalSidebar — role-filtered area accordion (Unified Internal Portal,
 * 2026-06-30), rebuilt as EXPANDABLE MODULE ROWS (Jess, 2026-08-19 afternoon —
 * CARD-2026-08-19-sidebar-expandable-modules).
 *
 * Every module is an icon + name + chevron row whose pages hang beneath it on
 * rounded elbows. This SUPERSEDES the same morning's uppercase-heading rail:
 * she saw the shipped headings in production and re-ruled.
 */

let mockRole: string | null = "operation";
vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { role: string | null; session: unknown }) => unknown) =>
    selector({ role: mockRole, session: { user: { email: "x@carres.com" } } }),
}));

// The rail self-fetches badges / the pending count; stub them so no network.
let mockBadges:
  | { orders?: number; procurement?: number; serviceNotes?: number; lpRejected?: number }
  | undefined;
vi.mock("@/lib/queries", () => ({
  useOperationBadges: () => ({ data: mockBadges }),
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

const module_ = (slug: string) => screen.getByTestId(`nav-module-${slug}`);
const child = (key: string) => screen.getByTestId(`nav-child-${key}`);

beforeEach(() => {
  mockRole = "operation";
  mockBadges = undefined;
});

describe("PortalSidebar — role visibility", () => {
  it("operation sees Operations only — no Finance / Admin", () => {
    renderAt("/operation");
    expect(module_("purchasing")).toBeInTheDocument();
    expect(module_("master-data")).toBeInTheDocument();
    // The selling catalog is principal-only, by area.
    expect(screen.queryByText("Product & Maintenance")).not.toBeInTheDocument();
    expect(screen.queryByText("AR · Receivables")).not.toBeInTheDocument();
    expect(screen.queryByText("Accounts")).not.toBeInTheDocument();
  });

  it("finance sees Finance items only — no Operations", () => {
    mockRole = "finance";
    renderAt("/finance/dashboard");
    expect(screen.getByText("AR · Receivables")).toBeInTheDocument();
    expect(screen.getByText("Reconciliation")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-module-purchasing")).not.toBeInTheDocument();
    expect(screen.queryByText("Accounts")).not.toBeInTheDocument();
  });

  it("principal sees all three area headers; only the active area is expanded", () => {
    mockRole = "principal";
    renderAt("/operation");
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.getAllByText("Finance").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(module_("master-data")).toBeInTheDocument();
    // Inactive areas are collapsed → their items are hidden until clicked.
    expect(screen.queryByText("AR · Receivables")).not.toBeInTheDocument();
    expect(screen.queryByText("Accounts")).not.toBeInTheDocument();
  });

  it("principal on the Finance base expands the Finance area", () => {
    mockRole = "principal";
    renderAt("/finance/ar");
    expect(screen.getByText("AR · Receivables")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-module-purchasing")).not.toBeInTheDocument();
  });
});

/**
 * ⭐ THE CARD'S OWN SHAPE (Jess, 2026-08-19 afternoon).
 *
 * `▣ Sales ⌄` — a module is an icon + a name + a chevron, and the uppercase
 * heading rank it replaced is gone from the rail for good.
 */
describe("a module is an expandable PARENT ROW, never a heading", () => {
  it("every module row carries an icon, its name and a chevron", () => {
    renderAt("/operation");
    for (const [slug, name] of [
      ["sales", "Sales"],
      ["purchasing", "Purchasing"],
      ["delivery", "Delivery"],
      ["warehouse", "Warehouse"],
      ["customer-care", "Customer Care"],
      ["master-data", "Master Data"],
    ] as const) {
      const row = module_(slug);
      expect(row.tagName).toBe("BUTTON");
      expect(within(row).getByText(name)).toBeInTheDocument();
      // icon + chevron: two SVGs, and the chevron states the open/shut fact.
      expect(row.querySelectorAll("svg").length).toBe(2);
      expect(row.getAttribute("aria-expanded")).toBe("false");
    }
  });

  it("no uppercase module heading survives anywhere in the rail", () => {
    renderAt("/operation?tab=purchase");
    for (const word of ["Sales", "Purchasing", "Warehouse", "Delivery"]) {
      const uppercaseHeading = screen
        .queryAllByText(word)
        .some((el) => el.closest("a") === null && el.className.includes("uppercase"));
      expect(uppercaseHeading).toBe(false);
    }
    // The umbrella word never comes back either.
    expect(screen.queryByText("Supply Chain")).toBeNull();
  });

  it("single pages stay plain rows — no chevron on Dashboard, Work, Issue Tracker", () => {
    renderAt("/operation");
    for (const key of ["dashboard", "work", "issue-tracker"]) {
      const row = child(key);
      expect(row.tagName).toBe("A");
      expect(row.getAttribute("aria-expanded")).toBeNull();
      // icon only — a plain row has nothing to expand.
      expect(row.querySelectorAll("svg").length).toBe(1);
    }
  });

  it("Payments keeps its own plain row — one page may not hide behind a chevron", () => {
    renderAt("/operation");
    const row = child("payments");
    expect(row.tagName).toBe("A");
    expect(row).toHaveAttribute("href", "/operation?tab=payments");
    expect(screen.queryByTestId("nav-module-finance")).not.toBeInTheDocument();
  });
});

/**
 * ONE MODULE OPEN AT A TIME — thirteen purchasing pages and six delivery
 * pages cannot stack, and the module you are standing in is the open one.
 */
describe("the accordion", () => {
  it("the module holding the current page is open on a direct URL load", () => {
    renderAt("/operation?tab=purchase");
    expect(module_("purchasing").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("nav-children-purchasing")).toBeInTheDocument();
    // ...and every other module has hidden its pages.
    expect(screen.queryByTestId("nav-children-sales")).not.toBeInTheDocument();
    expect(screen.queryByText("Old Orders (temporary)")).not.toBeInTheDocument();
  });

  it("expanding Purchasing collapses Sales", () => {
    renderAt("/operation/orders");
    expect(screen.getByTestId("nav-children-sales")).toBeInTheDocument();
    fireEvent.click(module_("purchasing"));
    expect(screen.getByTestId("nav-children-purchasing")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-children-sales")).not.toBeInTheDocument();
  });

  it("clicking a module opens its first live page", () => {
    renderAt("/operation");
    fireEvent.click(module_("warehouse"));
    // On hand is Warehouse's first live page — the rail navigated there.
    expect(child("stock").className).toContain("bg-kit-blue-3");
  });

  it("clicking the open module closes it again", () => {
    renderAt("/operation?tab=purchase");
    fireEvent.click(module_("purchasing"));
    expect(screen.queryByTestId("nav-children-purchasing")).not.toBeInTheDocument();
    expect(module_("purchasing").getAttribute("aria-expanded")).toBe("false");
  });

  it("standing on a plain page, no module is open", () => {
    renderAt("/operation");
    expect(document.querySelectorAll("[data-testid^='nav-children-']").length).toBe(0);
  });

  /* A hand-worked chevron belongs to the page it was worked on. Leaving that
   * page retires it — otherwise a jump (⌘K, or any in-page link) into another
   * module would leave the OLD module open and the row you just moved to
   * hidden, which is the one rail defect §4.2 refuses to ship. */
  it("navigating away retires a hand-opened module — the new page's module opens", () => {
    renderAt("/operation");
    fireEvent.click(module_("purchasing"));
    expect(screen.getByTestId("nav-children-purchasing")).toBeInTheDocument();
    // Now travel to a Warehouse page the way any in-page link would.
    fireEvent.click(module_("warehouse"));
    expect(screen.getByTestId("nav-children-warehouse")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-children-purchasing")).not.toBeInTheDocument();
    expect(child("stock").className).toContain("bg-kit-blue-3");
  });

  it("a module shut by hand stays shut while you stand on its page", () => {
    renderAt("/operation?tab=purchase");
    fireEvent.click(module_("purchasing"));
    expect(screen.queryByTestId("nav-children-purchasing")).not.toBeInTheDocument();
    // ...and the shut module is the one carrying the light, so nothing is lost.
    expect(module_("purchasing").className).toContain("bg-kit-blue-3");
  });
});

/**
 * THE ELBOWS — each child hangs off its OWN rounded connector, and the trunk
 * stops at the last child. A single straight bar running past the group is
 * the exact defect the drawing exists to avoid.
 */
describe("the elbow connectors", () => {
  it("every child row carries its own elbow", () => {
    renderAt("/operation?tab=purchase");
    const group = screen.getByTestId("nav-children-purchasing");
    const rows = group.querySelectorAll("[data-testid^='nav-child-']");
    const elbows = group.querySelectorAll("[data-testid^='nav-elbow-']");
    expect(rows.length).toBe(12);
    expect(elbows.length).toBe(rows.length);
  });

  it("every elbow turns at its own row's middle", () => {
    renderAt("/operation?tab=purchase");
    const group = screen.getByTestId("nav-children-purchasing");
    for (const el of group.querySelectorAll<HTMLElement>("[data-testid^='nav-elbow-']")) {
      // Capped at the row's centre; the number is only what it reaches UP by.
      expect(el.style.height).toMatch(/^calc\(50% \+ \d+px\)$/);
      expect(el.style.borderBottomLeftRadius).toBe("9px");
    }
  });

  /* THE LINE ENDS AT THE LAST CHILD'S ELBOW — never a straight bar running
   * past the group. Every child but the last carries the trunk on to the next
   * one; the last carries none, so the drawing simply stops there. */
  it("the trunk stops at the last child — it carries on from every other", () => {
    renderAt("/operation?tab=purchase");
    const group = screen.getByTestId("nav-children-purchasing");
    const rows = group.querySelectorAll("[data-testid^='nav-child-']");
    const trunks = group.querySelectorAll("[data-testid^='nav-trunk-']");
    expect(rows.length).toBe(12);
    expect(trunks.length).toBe(rows.length - 1);
    // Report is last, and nothing hangs below it.
    expect(screen.getByTestId("nav-elbow-purchasing-report")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-trunk-purchasing-report")).not.toBeInTheDocument();
  });

  it("a selected child still shows the elbow it hangs from", () => {
    renderAt("/operation?tab=receiving");
    // The row's own wash may not bury its indent guide.
    expect(screen.getByTestId("nav-elbow-receiving").style.zIndex).toBe("1");
  });

  it("the trunk hangs from the module ICON's centre, and the elbow turns into the row", () => {
    renderAt("/operation?tab=purchase");
    const elbow = screen.getByTestId("nav-elbow-receiving");
    // px-3.5 (14) + half a 16px icon = 22; the 1px line is centred on it.
    expect(elbow.style.left).toBe("21.5px");
    expect(elbow.style.width).toBe("11px");
    expect(elbow.style.borderBottomLeftRadius).toBe("9px");
  });

  it("a child is decoration-free for a screen reader — the elbow is aria-hidden", () => {
    renderAt("/operation?tab=purchase");
    expect(screen.getByTestId("nav-elbow-receiving").getAttribute("aria-hidden")).toBe(
      "true",
    );
  });
});

/**
 * A COUNT MEANS WORK WAITING, and collapse changed the fact the old ruling
 * rested on: a hidden child cannot show its own number, so the shut module
 * carries the sum. Open, the children say it themselves — the same figure
 * twice would read as two queues.
 */
describe("badges across the collapse", () => {
  it("a COLLAPSED module shows the sum of its children's work", () => {
    mockBadges = { orders: 3, procurement: 5, serviceNotes: 0, lpRejected: 0 };
    renderAt("/operation");
    expect(within(module_("sales")).getByTestId("nav-badge-sales").textContent).toBe("3");
    expect(
      within(module_("purchasing")).getByTestId("nav-badge-purchasing").textContent,
    ).toBe("5");
  });

  it("an EXPANDED module row shows none — the children carry their own", () => {
    mockBadges = { orders: 3, procurement: 5, serviceNotes: 0, lpRejected: 0 };
    renderAt("/operation/orders");
    expect(
      module_("sales").querySelector("[data-testid^='nav-badge-']"),
    ).toBeNull();
    expect(
      within(child("orders")).getByTestId("nav-badge-sales-orders").textContent,
    ).toBe("3");
  });

  it("zero prints nothing — a quiet module carries no chip at all", () => {
    mockBadges = { orders: 0, procurement: 0, serviceNotes: 0, lpRejected: 0 };
    renderAt("/operation");
    for (const slug of ["sales", "purchasing", "customer-care"]) {
      expect(module_(slug).querySelector("[data-testid^='nav-badge-']")).toBeNull();
    }
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

/**
 * ⭐ PORTAL NAVIGATION ACTIVE COLOUR — APPROVED / LOCKED (`docs/ui/MASTER.md`).
 *
 * "I am on this page" is SELECTION, so it wears the governed blue treatment:
 * a `kit-blue-9` active line + a `kit-blue-3` wash. It may never be the flame
 * `primary`, because red in Carres already means ONE thing — late / act now.
 *
 * ⚠️ The card sketched this row as a WHITE pill (`surface bg`), which is the
 * one place its drawing and this locked law disagree; the card itself defers
 * ("active COLOR follows the governed blue active law"), so the law wins and
 * the shape — a rounded pill at 13px medium — is the card's. Reported to the
 * owner for her production walk.
 */
describe("the active page — governed blue, never flame", () => {
  it("the active child wears the blue-3 wash and a blue-9 line, at 13px medium", () => {
    renderAt("/operation?tab=receiving");
    const row = child("receiving");
    expect(row.className).toContain("bg-kit-blue-3");
    expect(row.className).toContain("rounded-control");
    expect(row.className).toContain("font-medium");
    expect(row.querySelector(".bg-kit-blue-9")).not.toBeNull();
  });

  it("the active page sits INSIDE its auto-expanded module on a direct URL load", () => {
    renderAt("/operation?tab=receiving");
    const group = screen.getByTestId("nav-children-purchasing");
    expect(group.contains(child("receiving"))).toBe(true);
  });

  it("an inactive child carries no selection colour, and reads one weight lighter", () => {
    renderAt("/operation?tab=receiving");
    const row = child("claims");
    expect(row.className).not.toContain("bg-kit-blue-3");
    expect(row.className).toContain("font-normal");
    expect(row.querySelector(".bg-kit-blue-9")).toBeNull();
  });

  it("no flame and no grey wash survives in the active row", () => {
    renderAt("/operation/orders");
    const row = child("orders");
    expect(row.className).not.toContain("bg-primary");
    expect(row.className).not.toContain("bg-base-100");
    expect(row.querySelector(".bg-primary")).toBeNull();
    expect(row.querySelector(".text-primary")).toBeNull();
  });

  it("a module that has SHUT on the page you are standing on lights instead", () => {
    renderAt("/operation?tab=purchase");
    fireEvent.click(module_("purchasing")); // shut it, still on its page
    expect(module_("purchasing").className).toContain("bg-kit-blue-3");
    expect(module_("purchasing").querySelector(".bg-kit-blue-9")).not.toBeNull();
  });

  it("the COLLAPSED icon rail lights blue too — same law, smaller rail", () => {
    localStorage.setItem("ops-sidebar-collapsed", "1");
    try {
      renderAt("/operation/orders");
      // Collapsed, the children disappear and the MODULE's one icon remains.
      const icon = screen.getByTitle("Sales") as HTMLAnchorElement;
      expect(icon).toHaveAttribute("href", "/operation/orders");
      expect(icon.className).toContain("bg-kit-blue-3");
      expect(icon.querySelector(".bg-kit-blue-9")).not.toBeNull();
      expect(icon.querySelector(".text-kit-blue-9")).not.toBeNull();
      expect(icon.className).not.toContain("bg-base-100");
      expect(icon.querySelector(".text-primary")).toBeNull();
    } finally {
      localStorage.removeItem("ops-sidebar-collapsed");
    }
  });

  it("the collapsed rail navigates thirteen pages by ONE icon, not thirteen", () => {
    localStorage.setItem("ops-sidebar-collapsed", "1");
    try {
      renderAt("/operation?tab=purchase");
      expect(screen.getByTitle("Purchasing")).toBeInTheDocument();
      expect(screen.queryByTitle("Receiving")).toBeNull();
      expect(screen.queryByTitle("Supplier Claims")).toBeNull();
    } finally {
      localStorage.removeItem("ops-sidebar-collapsed");
    }
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
    const accounts = screen.getByText("Accounts").closest("a") as HTMLAnchorElement;
    expect(
      accounts.compareDocumentPosition(pm) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("is active on /principal?tab=catalog — with NO section sub-links in the rail", () => {
    renderAt("/principal?tab=catalog");
    const pm = screen.getByText("Product & Maintenance").closest("a") as HTMLAnchorElement;
    expect(pm.className).toContain("bg-kit-blue-3");
    expect(screen.queryByText("SKU Master")).not.toBeInTheDocument();
    expect(screen.queryByText("Promo / GWP")).not.toBeInTheDocument();
  });

  it("operation never sees the selling catalog — only the costing Catalog", () => {
    mockRole = "operation";
    renderAt("/operation?tab=op-catalog");
    expect(child("op-catalog")).toBeInTheDocument();
    expect(screen.queryByText("Product & Maintenance")).not.toBeInTheDocument();
  });
});

describe("PortalSidebar — Commission is ONE HR entry (Loo 2026-07-27)", () => {
  beforeEach(() => {
    mockRole = "principal";
  });

  const commissionLink = () =>
    screen.getByText("Commission").closest("a") as HTMLAnchorElement;

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
    expect(commissionLink().className).toContain("bg-kit-blue-3");
  });

  it("is NOT lit on another HR tab (?tab=team)", () => {
    renderAt("/hr?tab=team");
    expect(commissionLink().className).not.toContain("bg-kit-blue-3");
  });
});

/**
 * ⭐ SALES ORDER PRODUCTION CUTOVER (owner, 2026-08-10).
 *
 * The rail carries TWO Orders doors and the difference must be legible from
 * the rail alone. `(temporary)` is load-bearing, not decoration: a legacy
 * surface that looks permanent becomes permanent.
 */
describe("PortalSidebar — the Sales Order cutover's two doors", () => {
  it("both doors sit under Sales, each pointing at its own route", () => {
    renderAt("/operation/orders");
    expect(child("orders")).toHaveAttribute("href", "/operation/orders");
    expect(child("old-orders")).toHaveAttribute("href", "/operation/old-orders");
    expect(screen.getByText("Old Orders (temporary)")).toBeInTheDocument();
  });

  it("on /operation/orders only Sales Orders is lit", () => {
    renderAt("/operation/orders");
    expect(child("orders").className).toContain("bg-kit-blue-3");
    expect(child("old-orders").className).not.toContain("bg-kit-blue-3");
  });

  it("on /operation/old-orders only the old door is lit", () => {
    renderAt("/operation/old-orders");
    expect(child("old-orders").className).toContain("bg-kit-blue-3");
    expect(child("orders").className).not.toContain("bg-kit-blue-3");
  });

  it("the old door stays lit on a carried-over kanban slug", () => {
    renderAt("/operation/old-orders/in_production");
    expect(child("old-orders").className).toContain("bg-kit-blue-3");
    expect(child("orders").className).not.toContain("bg-kit-blue-3");
  });

  it("Delivery Orders keeps its home under Sales (ruling 2026-08-16)", () => {
    renderAt("/operation/orders");
    const group = screen.getByTestId("nav-children-sales");
    expect(group.contains(child("delivery-orders"))).toBe(true);
  });
});

/**
 * THE PURCHASING PAGES ARE THE MODULE'S MAP (Jess, 2026-08-18) — all of them,
 * from day one, because a map showing four of eleven roads teaches three
 * operators a shape that is about to change under them seven more times.
 */
describe("PortalSidebar — the Purchasing module's pages", () => {
  const LIVE = [
    "SO Batch Purchase",
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

  it("lists every page while the module is open", () => {
    renderAt("/operation?tab=purchase");
    for (const word of [...LIVE, ...SOON]) {
      expect(screen.getByText(word)).toBeInTheDocument();
    }
  });

  it("lists them in the approved order of purchasing/MASTER.md §1", () => {
    renderAt("/operation?tab=purchase");
    const rows = Array.from(
      screen
        .getByTestId("nav-children-purchasing")
        .querySelectorAll("[data-testid^='nav-child-']"),
    ).map((el) => el.textContent?.replace("Coming soon", "").trim());
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
      const row = child(key);
      expect(row.tagName).toBe("SPAN");
      expect(row.getAttribute("href")).toBeNull();
      expect(row.getAttribute("role")).not.toBe("link");
      expect(row.getAttribute("tabindex")).toBe("-1");
      expect(row.getAttribute("aria-disabled")).toBe("true");
      expect(row.textContent).toContain("Coming soon");
      // The name owns its line; the reason stacks under it (measured
      // 2026-08-19 — beside the tag every unbuilt name truncated).
      expect(row.className).toContain("flex-col");
      expect(row.querySelector(".truncate")?.textContent ?? "").not.toContain(
        "Coming soon",
      );
    }
  });

  it("a live entry IS a link and does not say `Coming soon`", () => {
    renderAt("/operation?tab=purchase");
    const row = child("receiving");
    expect(row.tagName).toBe("A");
    expect(row.getAttribute("href")).toBe("/operation?tab=receiving");
    expect(row.textContent).not.toContain("Coming soon");
  });

  it("`Purchase Orders` links to its nested path, not to a ?tab=", () => {
    renderAt("/operation?tab=purchase");
    expect(child("purchase-orders").getAttribute("href")).toBe("/operation/procurement");
  });

  it("no unbuilt entry renders a count, and none renders a `0`", () => {
    mockBadges = { orders: 0, procurement: 0, serviceNotes: 0, lpRejected: 0 };
    renderAt("/operation?tab=purchase");
    for (const word of SOON) {
      const row = screen.getByText(word).closest("[data-testid^='nav-child-']");
      expect(row?.querySelector("[data-testid^='nav-badge-']")).toBeNull();
      expect(row?.textContent).not.toMatch(/\b0\b/);
    }
  });

  it("a nested path page wins — Receiving does not light next to Purchase Orders", () => {
    renderAt("/operation/procurement");
    expect(child("purchase-orders").className).toContain("bg-kit-blue-3");
    expect(child("receiving").className).not.toContain("bg-kit-blue-3");
  });
});

/**
 * THE DELIVERY MODULE (owner-approved 2026-08-19, carried into this card from
 * the delivery-rail card it replaced).
 */
describe("PortalSidebar — the Delivery module's pages", () => {
  it("lists the six approved pages, in order, with Report under its hairline", () => {
    renderAt("/operation?tab=delivery");
    const rows = Array.from(
      screen
        .getByTestId("nav-children-delivery")
        .querySelectorAll("[data-testid^='nav-child-']"),
    ).map((el) => el.textContent?.replace("Coming soon", "").trim());
    expect(rows).toEqual([
      "Delivery Work",
      "Schedule",
      "Delivery History",
      "Exceptions",
      "Partners",
      "Report",
    ]);
  });

  it("`Delivery Work` is the existing page — same key, same route", () => {
    renderAt("/operation?tab=delivery");
    const row = child("delivery");
    expect(row.tagName).toBe("A");
    expect(row).toHaveAttribute("href", "/operation?tab=delivery");
    expect(row.className).toContain("bg-kit-blue-3");
  });

  it("the four middle pages and Report are non-controls saying `Coming soon`", () => {
    renderAt("/operation?tab=delivery");
    for (const key of [
      "delivery-schedule",
      "delivery-history",
      "delivery-exceptions",
      "delivery-partners",
      "delivery-report",
    ]) {
      const row = child(key);
      expect(row.tagName).toBe("SPAN");
      expect(row.getAttribute("aria-disabled")).toBe("true");
      expect(row.textContent).toContain("Coming soon");
    }
  });
});

describe("PortalSidebar — the Warehouse module's pages", () => {
  it("the three built pages are doors keeping their `?tab=` addresses", () => {
    renderAt("/operation?tab=stock-onhand");
    expect(child("stock")).toHaveAttribute("href", "/operation?tab=stock-onhand");
    expect(child("stock-plan")).toHaveAttribute("href", "/operation?tab=stock-plan");
    expect(child("movements")).toHaveAttribute("href", "/operation?tab=movements");
  });

  it("Transfers and Counts print `Coming soon` and are NOT controls", () => {
    renderAt("/operation?tab=stock-onhand");
    for (const key of ["transfers", "counts"]) {
      const row = child(key);
      expect(row.tagName).toBe("SPAN");
      expect(row.getAttribute("aria-disabled")).toBe("true");
    }
  });

  it("no bare `Stock` row survives — the module is Warehouse", () => {
    renderAt("/operation?tab=stock-onhand");
    expect(screen.queryByText("Stock")).not.toBeInTheDocument();
    expect(within(module_("warehouse")).getByText("Warehouse")).toBeInTheDocument();
  });

  it("the blueprint keeps Reports and Settings central — neither joins the module", () => {
    renderAt("/operation?tab=stock-onhand");
    const rows = Array.from(
      screen
        .getByTestId("nav-children-warehouse")
        .querySelectorAll("[data-testid^='nav-child-']"),
    ).map((el) => el.textContent?.replace("Coming soon", "").trim());
    expect(rows).toEqual(["On hand", "Ready stock", "In & out", "Transfers", "Counts"]);
  });
});

/**
 * NO SETTINGS ROW ANYWHERE (Jess, 2026-08-19): *"Settings should be at the
 * header settings, not every panel got one setting."*
 */
describe("no rail carries a Settings row, for any role", () => {
  it("operation — walking every module", () => {
    for (const path of [
      "/operation",
      "/operation/orders",
      "/operation?tab=purchase",
      "/operation?tab=delivery",
      "/operation?tab=stock-onhand",
    ]) {
      const view = renderAt(path);
      expect(screen.queryByText("Settings")).not.toBeInTheDocument();
      expect(screen.queryByTestId("nav-child-purchasing-settings")).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it("principal — the boss gets no rail Settings door either", () => {
    mockRole = "principal";
    renderAt("/operation?tab=purchase");
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });
});
