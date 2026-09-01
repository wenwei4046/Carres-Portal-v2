import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

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
// Purchasing remembers its drawers PER SIGNED-IN USER, so the tests need to be
// able to be nobody, be one person, then be another.
let mockUserId: string | null = null;
vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { role: string | null; session: unknown }) => unknown) =>
    selector({
      role: mockRole,
      session: { user: { email: "x@carres.com", id: mockUserId ?? undefined } },
    }),
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

/** Prints the live URL, so a control can be proved NOT to have navigated. */
function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location-probe">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PortalSidebar />
      <LocationProbe />
    </MemoryRouter>,
  );
}

const module_ = (slug: string) => screen.getByTestId(`nav-module-${slug}`);
const child = (key: string) => screen.getByTestId(`nav-child-${key}`);
const group_ = (key: string) => screen.getByTestId(`nav-group-${key}`);
const drawerKey = (userId: string) => `carres:portal-sidebar:purchasing:v2:${userId}`;

beforeEach(() => {
  mockRole = "operation";
  mockBadges = undefined;
  mockUserId = null;
  localStorage.clear();
});

describe("PortalSidebar — role visibility", () => {
  it("operation sees Operations only — no Finance / Admin", () => {
    renderAt("/operation");
    expect(module_("purchasing")).toBeInTheDocument();
    /* 2026-08-21 — Suppliers left Master Data for its own module, so Master
       Data holds ONE page (Catalog) and renders as a PLAIN row: a module is an
       expandable parent, and there is nothing to expand into. The rule is
       `pages.length > 1` in buildNavBlocks; this asserts the row is present,
       not what shape it takes. */
    expect(child("op-catalog")).toBeInTheDocument();
    expect(module_("suppliers")).toBeInTheDocument();
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
    /* 2026-08-21 — Suppliers left Master Data for its own module, so Master
       Data holds ONE page (Catalog) and renders as a PLAIN row: a module is an
       expandable parent, and there is nothing to expand into. The rule is
       `pages.length > 1` in buildNavBlocks; this asserts the row is present,
       not what shape it takes. */
    expect(child("op-catalog")).toBeInTheDocument();
    expect(module_("suppliers")).toBeInTheDocument();
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
      ["warehouse", "Warehouse"],
      ["customer-care", "Customer Care"],
      /* Master Data dropped off this list on 2026-08-21: with Suppliers gone
         it carries one page, and a one-page section is a plain row by design.
         Suppliers takes its place — two pages, so a real module. */
      ["suppliers", "Suppliers"],
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
 * ONE MODULE OPEN AT A TIME — eleven purchasing pages and a Warehouse
 * module cannot stack, and the module you are standing in is the open one.
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
    // Schedule is Warehouse's landing Register — the rail navigated there.
    expect(child("warehouse-schedule").className).toContain("bg-kit-blue-3");
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
    expect(child("warehouse-schedule").className).toContain("bg-kit-blue-3");
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
  /* Sales stays a two-page module, so it proves the one-level elbow grammar.
   * Delivery is now one direct page and correctly carries no elbow. */
  it("every child row carries its own elbow", () => {
    renderAt("/operation/orders");
    const group = screen.getByTestId("nav-children-sales");
    const rows = group.querySelectorAll("[data-testid^='nav-child-']");
    const elbows = group.querySelectorAll("[data-testid^='nav-elbow-']");
    expect(rows.length).toBe(2);
    expect(elbows.length).toBe(rows.length);
  });

  it("every elbow turns at its own row's middle", () => {
    renderAt("/operation/orders");
    const group = screen.getByTestId("nav-children-sales");
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
    renderAt("/operation/orders");
    const group = screen.getByTestId("nav-children-sales");
    const rows = group.querySelectorAll("[data-testid^='nav-child-']");
    const trunks = group.querySelectorAll("[data-testid^='nav-trunk-']");
    expect(rows.length).toBe(2);
    expect(trunks.length).toBe(rows.length - 1);
    // `Old Orders` is last, and nothing hangs below it.
    expect(screen.getByTestId("nav-elbow-old-orders")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-trunk-old-orders")).not.toBeInTheDocument();
    // ...and the row above it DOES carry the line on.
    expect(screen.getByTestId("nav-trunk-orders")).toBeInTheDocument();
  });

  it("a selected child still shows the elbow it hangs from", () => {
    renderAt("/operation?tab=receiving");
    // The row's own wash may not bury its indent guide.
    expect(screen.getByTestId("nav-elbow-receiving").style.zIndex).toBe("1");
  });

  it("the trunk hangs from the module ICON's centre, and the elbow turns into the row", () => {
    renderAt("/operation/orders");
    const elbow = screen.getByTestId("nav-elbow-old-orders");
    // px-3.5 (14) + half a 16px icon = 22; the 1px line is centred on it.
    expect(elbow.style.left).toBe("21.5px");
    expect(elbow.style.width).toBe("11px");
    expect(elbow.style.borderBottomLeftRadius).toBe("9px");
  });

  it("a child is decoration-free for a screen reader — the elbow is aria-hidden", () => {
    renderAt("/operation/orders");
    expect(
      screen.getByTestId("nav-elbow-old-orders").getAttribute("aria-hidden"),
    ).toBe("true");
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
    renderAt("/operation?tab=purchase");
    // A sibling inside the drawer the route forced open — `Report` left the
    // rail on 2026-08-22, so the inactive row is proved on a live BUY page.
    const row = child("purchase-orders");
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

  it("Delivery Orders is not under Sales (ruling 2026-08-20)", () => {
    renderAt("/operation/orders");
    const group = screen.getByTestId("nav-children-sales");
    expect(group.querySelector("[data-testid='nav-child-delivery-orders']")).toBeNull();
  });
});

/**
 * ⭐ THE FINAL PURCHASING MAP — FOUR DRAWERS, ELEVEN PAGES
 * (Jess, 2026-08-22 — CARD-2026-08-22-purchasing-01-final-sidebar-listing;
 * the approved tree is `docs/purchasing/MASTER.md` §4).
 *
 * The module accordion and its drawer grammar are EXTENDED, never rebuilt —
 * only the CONTENTS changed. The eighteen-row rail carried an earlier
 * Blueprint the owner rejected: a Home nobody needs, a module Work page the
 * shared Work Engine already owns, request pages that are in-context Catalog
 * governance, a hidden demand record dressed as a destination, and a Report
 * row that belongs to central Reports. The module now opens onto four drawers
 * and nothing else — no direct row above them, no Report and no hairline.
 */
describe("PortalSidebar — the Purchasing map", () => {
  it("opens onto exactly four drawers — no direct row, no Report, no hairline", () => {
    renderAt("/operation?tab=purchase");
    const tree = screen.getByTestId("nav-children-purchasing");
    const rows = Array.from(tree.children)
      .filter((row) => (row.textContent ?? "").trim() !== "")
      .map((row) => {
        const groupButton = row.querySelector("[data-testid^='nav-group-']");
        if (groupButton) return groupButton.textContent?.trim();
        return row.textContent?.replace("Coming soon", "").trim();
      });
    expect(rows).toEqual(["BUY", "RECEIVE", "PROBLEMS", "SHOWROOM"]);
    // Every top-level row IS a drawer — nothing hangs beside them.
    expect(tree.querySelectorAll("[data-testid^='nav-group-purchasing-']")).toHaveLength(4);
    // Reports moved to the central Reports area, so the rule above them went too.
    expect(tree.querySelector(".border-t")).toBeNull();
  });

  it("eleven pages in the approved order, and not a twelfth", () => {
    renderAt("/operation?tab=purchase");
    for (const key of [
      "purchasing-buy",
      "purchasing-receive",
      "purchasing-problems",
      "purchasing-showroom",
    ]) {
      const row = group_(key);
      if (row.getAttribute("aria-expanded") === "false") fireEvent.click(row);
    }
    const tree = screen.getByTestId("nav-children-purchasing");
    const rows = Array.from(tree.querySelectorAll("[data-testid^='nav-child-']")).map(
      (el) => el.textContent?.replace("Coming soon", "").trim(),
    );
    expect(rows).toEqual([
      "SO Batch Purchase",
      "Manual Purchase",
      "Purchase Orders",
      "Goods Receipts",
      "Supplier Claims",
      "Purchase Returns",
      "Repair Orders",
      "Display Requests",
      "Consignment Orders",
      "Consignment Returns",
      "Consignment Sale Notices",
    ]);
  });

  /* THE EIGHT ROWS THE OWNER DELETED. Each one was a destination the rail
   * offered and the business does not have; a rail that still offers them
   * sends an operator to a page nobody owns. */
  it("every retired row is gone from the whole rail, in every drawer", () => {
    renderAt("/operation?tab=purchase");
    for (const key of [
      "purchasing-buy",
      "purchasing-receive",
      "purchasing-problems",
      "purchasing-showroom",
    ]) {
      const row = group_(key);
      if (row.getAttribute("aria-expanded") === "false") fireEvent.click(row);
    }
    for (const key of [
      "purchasing-home",
      "purchasing-work",
      "new-supplier-requests",
      "new-sku-requests",
      "purchase-demands",
      "consignment-overview",
      "consignment-receipts",
      "purchasing-report",
    ]) {
      expect(screen.queryByTestId(`nav-child-${key}`), key).not.toBeInTheDocument();
    }
    for (const word of [
      "Purchasing Home",
      "My Purchasing Work",
      "New Supplier Requests",
      "New SKU Requests",
      "Purchase Demands",
      "Consignment Overview",
      "Consignment Receipts",
      "Manual Purchase Requests",
      "REQUESTS",
      "CONSIGNMENT",
      "Report",
    ]) {
      expect(screen.queryByText(word), word).not.toBeInTheDocument();
    }
    expect(screen.queryByTestId("nav-group-purchasing-requests")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("nav-group-purchasing-consignment"),
    ).not.toBeInTheDocument();
  });

  it("fills the open drawer with its own approved pages, in order", () => {
    renderAt("/operation?tab=purchase"); // BUY is forced open by the route
    const rows = Array.from(
      screen
        .getByTestId("nav-group-children-purchasing-buy")
        .querySelectorAll("[data-testid^='nav-child-']"),
    ).map((el) => el.textContent?.replace("Coming soon", "").trim());
    expect(rows).toEqual(["SO Batch Purchase", "Manual Purchase", "Purchase Orders"]);
  });

  it("the rail word is `Manual Purchase`, in BUY, and the old word is gone", () => {
    renderAt("/operation?tab=receiving");
    expect(screen.getByText("Goods Receipts")).toBeInTheDocument();
    expect(screen.queryByText("Receiving")).not.toBeInTheDocument();
    expect(screen.queryByText(/GRN/)).not.toBeInTheDocument();
    fireEvent.click(group_("purchasing-buy"));
    const buy = screen.getByTestId("nav-group-children-purchasing-buy");
    expect(within(buy).getByText("Manual Purchase")).toBeInTheDocument();
    expect(screen.queryByText("Manual Purchase Requests")).not.toBeInTheDocument();
    expect(screen.queryByText("To Order")).not.toBeInTheDocument();
    expect(screen.queryByText("Claims")).not.toBeInTheDocument();
  });

  it("a live row IS a link, on its exact current address", () => {
    renderAt("/operation?tab=receiving");
    const row = child("receiving");
    expect(row.tagName).toBe("A");
    expect(row.getAttribute("href")).toBe("/operation?tab=receiving");
    expect(row.textContent).not.toContain("Coming soon");
    // ...and so is the live row in a drawer the operator opened by hand.
    fireEvent.click(group_("purchasing-problems"));
    expect(child("claims")).toHaveAttribute("href", "/operation?tab=claims");
  });

  it("`Purchase Orders` still links to its nested path, not to a ?tab=", () => {
    renderAt("/operation?tab=purchase");
    expect(child("purchase-orders").getAttribute("href")).toBe("/operation/procurement");
  });

  it("an unbuilt row is NOT a control — no href, not focusable, says why", () => {
    renderAt("/operation?tab=purchase");
    fireEvent.click(group_("purchasing-problems"));
    fireEvent.click(group_("purchasing-showroom"));
    for (const key of [
      "purchase-returns",
      "repair-orders",
      "display-requests",
      "consignment-orders",
      "consignment-returns",
      "consignment-sale-notices",
    ]) {
      const row = child(key);
      expect(row.tagName, key).toBe("SPAN");
      expect(row.getAttribute("href")).toBeNull();
      expect(row.getAttribute("role")).not.toBe("link");
      expect(row.getAttribute("tabindex")).toBe("-1");
      expect(row.getAttribute("aria-disabled")).toBe("true");
      expect(row.textContent).toContain("Coming soon");
      // The name owns its line; the reason stacks under it.
      expect(row.className).toContain("flex-col");
    }
  });

  it("no unbuilt row renders a count, and none renders a `0`", () => {
    mockBadges = { orders: 0, procurement: 0, serviceNotes: 0, lpRejected: 0 };
    renderAt("/operation?tab=purchase");
    const tree = screen.getByTestId("nav-children-purchasing");
    for (const row of tree.querySelectorAll("[data-soon='1']")) {
      expect(row.querySelector("[data-testid^='nav-badge-']")).toBeNull();
      expect(row.textContent).not.toMatch(/\b0\b/);
    }
  });

  it("a nested path page wins — Goods Receipts does not light next to Purchase Orders", () => {
    renderAt("/operation/procurement");
    expect(child("purchase-orders").className).toContain("bg-kit-blue-3");
    expect(screen.queryByTestId("nav-child-receiving")).not.toBeInTheDocument();
  });
});

/**
 * THE PURCHASING ROW IS A DRAWER HANDLE, NOT A DOOR. Clicking it reveals the
 * map and leaves the URL where it was — with eleven destinations in four
 * drawers, the operator clicks this row to LOOK far more often than to travel.
 */
describe("PortalSidebar — the Purchasing parent toggles without navigating", () => {
  it("a click changes the tree and does NOT change the URL", () => {
    renderAt("/operation");
    const before = screen.getByTestId("location-probe").textContent;
    fireEvent.click(module_("purchasing"));
    expect(screen.getByTestId("location-probe")).toHaveTextContent(before ?? "");
    expect(screen.getByTestId("nav-children-purchasing")).toBeInTheDocument();
    expect(module_("purchasing").getAttribute("aria-expanded")).toBe("true");
  });

  it("the whole row is one button carrying its own aria-expanded", () => {
    renderAt("/operation");
    const row = module_("purchasing");
    expect(row.tagName).toBe("BUTTON");
    expect(row.getAttribute("aria-expanded")).toBe("false");
  });

  it("opening Purchasing still shuts the module that was open", () => {
    renderAt("/operation/orders");
    expect(screen.getByTestId("nav-children-sales")).toBeInTheDocument();
    fireEvent.click(module_("purchasing"));
    expect(screen.getByTestId("nav-children-purchasing")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-children-sales")).not.toBeInTheDocument();
  });

  it("shutting Purchasing while standing on a Purchasing page is allowed", () => {
    renderAt("/operation?tab=receiving");
    expect(screen.getByTestId("nav-children-purchasing")).toBeInTheDocument();
    fireEvent.click(module_("purchasing"));
    expect(screen.queryByTestId("nav-children-purchasing")).not.toBeInTheDocument();
    expect(screen.getByTestId("location-probe")).toHaveTextContent(
      "/operation?tab=receiving",
    );
  });

  /* ⭐ ALWAYS EXACTLY ONE VISIBLE ACTIVE INDICATION (owner review, 2026-08-20).
   * Open, the child carries it. Shut, the parent carries it. Never both, and
   * never neither — a rail that says nothing about where you are standing is
   * the defect this rule exists to stop. */
  it("shutting the tree moves the light onto the Purchasing parent", () => {
    renderAt("/operation?tab=receiving");
    // Open: the parent is neutral and the child carries the light.
    expect(module_("purchasing").className).not.toContain("bg-kit-blue-3");
    expect(child("receiving").className).toContain("bg-kit-blue-3");

    fireEvent.click(module_("purchasing")); // shut it, still on Goods Receipts
    expect(module_("purchasing").className).toContain("bg-kit-blue-3");
    expect(module_("purchasing").querySelector(".bg-kit-blue-9")).not.toBeNull();
  });

  it("never both — the parent goes neutral again the moment the tree reopens", () => {
    renderAt("/operation?tab=receiving");
    fireEvent.click(module_("purchasing")); // shut
    fireEvent.click(module_("purchasing")); // and open again
    expect(module_("purchasing").className).not.toContain("bg-kit-blue-3");
    expect(child("receiving").className).toContain("bg-kit-blue-3");
  });

  it("open tree: exactly ONE row is selected — never parent + drawer + page", () => {
    renderAt("/operation?tab=receiving");
    expect(module_("purchasing").className).not.toContain("bg-kit-blue-3");
    expect(group_("purchasing-receive").className).not.toContain("bg-kit-blue-3");
    const lit = screen
      .getByTestId("nav-children-purchasing")
      .querySelectorAll(".bg-kit-blue-3");
    expect(lit.length).toBe(1);
    expect(child("receiving").className).toContain("bg-kit-blue-3");
  });

  it("arriving by URL opens Purchasing so the destination is never hidden", () => {
    renderAt("/operation?tab=claims");
    expect(module_("purchasing").getAttribute("aria-expanded")).toBe("true");
    expect(child("claims").className).toContain("bg-kit-blue-3");
  });

  /* MANUAL PURCHASE — the BUY drawer's second row since 2026-08-22. Its rail
   * row must be a real control on its unchanged address, BUY must open by
   * itself, and exactly one thing may be lit. */
  it("Manual Purchase is a real link on its unchanged address", () => {
    renderAt("/operation?tab=manual-purchase");
    const row = child("manual-purchase");
    expect(row.tagName).toBe("A");
    expect(row.getAttribute("href")).toBe("/operation?tab=manual-purchase");
    expect(row.textContent).not.toContain("Coming soon");
    expect(row.getAttribute("aria-disabled")).toBeNull();
  });

  it("arriving at Manual Purchase opens Purchasing + BUY and lights ONE row", () => {
    renderAt("/operation?tab=manual-purchase");
    expect(module_("purchasing").getAttribute("aria-expanded")).toBe("true");
    expect(group_("purchasing-buy").getAttribute("aria-expanded")).toBe("true");
    expect(child("manual-purchase").className).toContain("bg-kit-blue-3");
    // Its drawer siblings stay dark.
    expect(child("purchase").className).not.toContain("bg-kit-blue-3");
    expect(child("purchase-orders").className).not.toContain("bg-kit-blue-3");
    expect(module_("purchasing").className).not.toContain("bg-kit-blue-3");
    expect(group_("purchasing-buy").className).not.toContain("bg-kit-blue-3");
    const lit = screen
      .getByTestId("nav-children-purchasing")
      .querySelectorAll(".bg-kit-blue-3");
    expect(lit.length).toBe(1);
  });

  /* GOODS RECEIPTS — the one-page drawer. RECEIVE must force itself open. */
  it("arriving at Goods Receipts opens Purchasing + RECEIVE and lights ONE row", () => {
    renderAt("/operation?tab=receiving");
    expect(module_("purchasing").getAttribute("aria-expanded")).toBe("true");
    expect(group_("purchasing-receive").getAttribute("aria-expanded")).toBe("true");
    expect(child("receiving").className).toContain("bg-kit-blue-3");
    expect(module_("purchasing").className).not.toContain("bg-kit-blue-3");
    expect(group_("purchasing-receive").className).not.toContain("bg-kit-blue-3");
    const lit = screen
      .getByTestId("nav-children-purchasing")
      .querySelectorAll(".bg-kit-blue-3");
    expect(lit.length).toBe(1);
  });

  /* BOTH ENTRANCES, ONE DESTINATION. `/operation/to-order` is still a live
   * in-page link; it may not light a second row. */
  it("/operation/to-order opens Purchasing + BUY and selects only SO Batch Purchase", () => {
    renderAt("/operation/to-order");
    expect(module_("purchasing").getAttribute("aria-expanded")).toBe("true");
    expect(group_("purchasing-buy").getAttribute("aria-expanded")).toBe("true");
    expect(child("purchase").className).toContain("bg-kit-blue-3");
    expect(child("purchase-orders").className).not.toContain("bg-kit-blue-3");
    const lit = screen
      .getByTestId("nav-children-purchasing")
      .querySelectorAll(".bg-kit-blue-3");
    expect(lit.length).toBe(1);
  });
});

/**
 * FOUR DRAWERS, EACH OPENING ALONE. A buyer works out of two of them all day,
 * and a rail that keeps shutting one behind their back is a rail that gets
 * fought.
 */
describe("PortalSidebar — the Purchasing drawers", () => {
  it("each drawer is a full-width button with its own aria-expanded", () => {
    renderAt("/operation?tab=purchase");
    for (const key of [
      "purchasing-buy",
      "purchasing-receive",
      "purchasing-problems",
      "purchasing-showroom",
    ]) {
      const row = group_(key);
      expect(row.tagName, key).toBe("BUTTON");
      expect(row.getAttribute("aria-expanded"), key).not.toBeNull();
      expect(row.className).toContain("w-full");
    }
  });

  it("the word is a LABEL rank — 11px semibold uppercase, never a destination", () => {
    renderAt("/operation?tab=purchase");
    const row = group_("purchasing-buy");
    expect(row.className).toContain("text-label");
    expect(row.className).toContain("font-semibold");
    expect(row.className).toContain("uppercase");
    expect(row.getAttribute("href")).toBeNull();
  });

  it("opening one drawer does NOT shut another", () => {
    renderAt("/operation?tab=purchase"); // BUY forced open
    fireEvent.click(group_("purchasing-problems"));
    expect(screen.getByText("SO Batch Purchase")).toBeVisible();
    expect(screen.getByText("Supplier Claims")).toBeVisible();
    fireEvent.click(group_("purchasing-showroom"));
    expect(screen.getByText("SO Batch Purchase")).toBeVisible();
    expect(screen.getByText("Supplier Claims")).toBeVisible();
    expect(screen.getByText("Consignment Returns")).toBeVisible();
  });

  it("a drawer opened by hand shuts again on the next click", () => {
    renderAt("/operation?tab=purchase");
    fireEvent.click(group_("purchasing-problems"));
    expect(screen.getByTestId("nav-group-children-purchasing-problems")).toBeInTheDocument();
    fireEvent.click(group_("purchasing-problems"));
    expect(
      screen.queryByTestId("nav-group-children-purchasing-problems"),
    ).not.toBeInTheDocument();
  });

  it("the drawer holding the current page opens itself and REFUSES to shut", () => {
    renderAt("/operation?tab=receiving");
    const receive = group_("purchasing-receive");
    expect(receive.getAttribute("aria-expanded")).toBe("true");
    expect(receive.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(receive);
    expect(group_("purchasing-receive").getAttribute("aria-expanded")).toBe("true");
    expect(child("receiving")).toBeInTheDocument();
  });

  it("a drawer you are NOT standing in stays an ordinary handle", () => {
    renderAt("/operation?tab=receiving");
    expect(group_("purchasing-buy").getAttribute("aria-disabled")).toBeNull();
  });

  it("the drawer's children hang one level deeper, off their own trunk", () => {
    renderAt("/operation?tab=purchase");
    const nested = screen.getByTestId("nav-elbow-purchase");
    const topLevel = screen.getByTestId("nav-elbow-purchasing-showroom");
    // The module's own trunk stays on the icon's centre (21.5px); the drawer's
    // children hang from the drawer word's left edge, further right.
    expect(topLevel.style.left).toBe("21.5px");
    expect(Number.parseFloat(nested.style.left)).toBeGreaterThan(21.5);
    expect(nested.style.borderBottomLeftRadius).toBe("9px");
    expect(nested.getAttribute("aria-hidden")).toBe("true");
  });

  it("a drawer hangs off the module's trunk exactly as a page does", () => {
    renderAt("/operation?tab=purchase");
    const elbow = screen.getByTestId("nav-elbow-purchasing-buy");
    expect(elbow.style.left).toBe("21.5px");
    expect(elbow.style.borderBottomLeftRadius).toBe("9px");
    // The module trunk carries on past the whole drawer to reach the next row.
    expect(screen.getByTestId("nav-trunk-purchasing-buy")).toBeInTheDocument();
    // FOUR drawers → four elbows → THREE trunks. SHOWROOM is the last row in
    // the module now that Report has left, so it is the row that ends the line.
    expect(screen.queryByTestId("nav-trunk-purchasing-showroom")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("nav-children-purchasing").querySelectorAll(
        "[data-testid^='nav-trunk-purchasing-']",
      ),
    ).toHaveLength(3);
  });

  /* ⭐ THE 60px ICON GOES WHERE IT IS TOLD, NOT WHERE ROW ORDER PUTS IT
   * (owner review, 2026-08-20). Deriving it from the first live row moved the
   * module's landing page the moment grouping reordered the rail. */
  it("the collapsed Purchasing icon links to SO Batch Purchase, and lights on any Purchasing page", () => {
    localStorage.setItem("ops-sidebar-collapsed", "1");
    try {
      renderAt("/operation?tab=receiving");
      const icon = screen.getByTitle("Purchasing") as HTMLAnchorElement;
      // Named, never derived: the landing page does not move when row order does.
      expect(icon).toHaveAttribute("href", "/operation?tab=purchase");
      // Standing on Goods Receipts still lights the module's one icon.
      expect(icon.className).toContain("bg-kit-blue-3");
      expect(icon.querySelector(".bg-kit-blue-9")).not.toBeNull();
    } finally {
      localStorage.removeItem("ops-sidebar-collapsed");
    }
  });

  it("collapsed to 60px, every direct/drawer/listing row disappears", () => {
    localStorage.setItem("ops-sidebar-collapsed", "1");
    try {
      renderAt("/operation?tab=receiving");
      expect(screen.getByTitle("Purchasing")).toBeInTheDocument();
      expect(screen.queryByTestId("nav-group-purchasing-buy")).not.toBeInTheDocument();
      expect(screen.queryByText("BUY")).not.toBeInTheDocument();
      expect(screen.queryByText("Goods Receipts")).not.toBeInTheDocument();
      expect(screen.queryByText("Manual Purchase")).not.toBeInTheDocument();
      expect(screen.queryByText("SHOWROOM")).not.toBeInTheDocument();
    } finally {
      localStorage.removeItem("ops-sidebar-collapsed");
    }
  });
});

/**
 * THE DRAWERS ARE REMEMBERED, PER SIGNED-IN USER. Two people share a machine
 * in the office, and one operator's open drawers are not the other's.
 */
describe("PortalSidebar — Purchasing remembers its drawers", () => {
  it("writes the exact versioned user-id key, and only presentation state", () => {
    mockUserId = "user-a";
    renderAt("/operation");
    fireEvent.click(module_("purchasing"));
    fireEvent.click(group_("purchasing-problems"));
    const raw = localStorage.getItem(drawerKey("user-a"));
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw as string);
    expect(stored).toEqual({ moduleOpen: true, openGroups: ["purchasing-problems"] });
    expect(Object.keys(stored).sort()).toEqual(["moduleOpen", "openGroups"]);
  });

  it("restores them on the next load", () => {
    mockUserId = "user-a";
    localStorage.setItem(
      drawerKey("user-a"),
      JSON.stringify({ moduleOpen: true, openGroups: ["purchasing-showroom"] }),
    );
    renderAt("/operation");
    expect(module_("purchasing").getAttribute("aria-expanded")).toBe("true");
    expect(group_("purchasing-showroom").getAttribute("aria-expanded")).toBe("true");
    expect(group_("purchasing-buy").getAttribute("aria-expanded")).toBe("false");
  });

  it("user B does not inherit user A's open drawers", () => {
    localStorage.setItem(
      drawerKey("user-a"),
      JSON.stringify({ moduleOpen: true, openGroups: ["purchasing-showroom"] }),
    );
    mockUserId = "user-b";
    renderAt("/operation");
    expect(module_("purchasing").getAttribute("aria-expanded")).toBe("false");
    expect(localStorage.getItem(drawerKey("user-b"))).toBeNull();
  });

  it("nobody signed in — the rail still works, and writes nothing", () => {
    mockUserId = null;
    renderAt("/operation");
    fireEvent.click(module_("purchasing"));
    expect(screen.getByTestId("nav-children-purchasing")).toBeInTheDocument();
    expect(Object.keys(localStorage).filter((k) => k.includes("purchasing"))).toEqual([]);
  });

  it("malformed storage falls back safely — it never breaks navigation", () => {
    mockUserId = "user-a";
    localStorage.setItem(drawerKey("user-a"), "{not json");
    renderAt("/operation?tab=claims");
    // The route still wins, the drawer still opens, the page is still lit.
    expect(module_("purchasing").getAttribute("aria-expanded")).toBe("true");
    expect(child("claims").className).toContain("bg-kit-blue-3");
  });

  /* THE SAFETY RULE WINS OVER A STORED CLOSED STATE. Landing on a page the
   * rail is hiding is the one defect this may not ship. */
  it("a stored CLOSED module still opens when you arrive on a Purchasing page", () => {
    mockUserId = "user-a";
    localStorage.setItem(
      drawerKey("user-a"),
      JSON.stringify({ moduleOpen: false, openGroups: [] }),
    );
    renderAt("/operation?tab=receiving");
    expect(module_("purchasing").getAttribute("aria-expanded")).toBe("true");
    expect(child("receiving")).toBeInTheDocument();
  });

  /* A remembered Purchasing drawer may never hide the module you are actually
   * standing in — that would be the same defect from the other direction. */
  it("a remembered OPEN Purchasing never hides another module's current page", () => {
    mockUserId = "user-a";
    localStorage.setItem(
      drawerKey("user-a"),
      JSON.stringify({ moduleOpen: true, openGroups: ["purchasing-buy"] }),
    );
    renderAt("/operation/orders");
    expect(screen.getByTestId("nav-children-sales")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-children-purchasing")).not.toBeInTheDocument();
    expect(child("orders").className).toContain("bg-kit-blue-3");
  });

  /* ⭐ SWITCHING USER WITHOUT REMOUNTING (owner review, 2026-08-20).
   *
   * The rail is not torn down when the signed-in user changes, so the drawer
   * memory has to follow the user IN PLACE. This is the case that exposed the
   * dependency gap: loading B's (empty) state replaced A's, but the rule that
   * forces the module open for the page you are standing on was keyed only on
   * the active route — which had not changed — so B was left looking at a rail
   * that was hiding B's own current page. */
  it("user B does not inherit A's drawers, and still gets their own page shown", () => {
    localStorage.setItem(
      drawerKey("user-a"),
      JSON.stringify({
        moduleOpen: true,
        openGroups: ["purchasing-showroom", "purchasing-problems"],
      }),
    );
    mockUserId = "user-a";
    const view = renderAt("/operation?tab=receiving");
    expect(group_("purchasing-showroom").getAttribute("aria-expanded")).toBe("true");
    expect(group_("purchasing-problems").getAttribute("aria-expanded")).toBe("true");

    // Same mounted component — only the signed-in user changes.
    mockUserId = "user-b";
    view.rerender(
      <MemoryRouter initialEntries={["/operation?tab=receiving"]}>
        <PortalSidebar />
        <LocationProbe />
      </MemoryRouter>,
    );

    // A's drawers did not travel.
    expect(group_("purchasing-showroom").getAttribute("aria-expanded")).toBe("false");
    expect(group_("purchasing-problems").getAttribute("aria-expanded")).toBe("false");
    // ...and B is still shown the page B is standing on.
    expect(module_("purchasing").getAttribute("aria-expanded")).toBe("true");
    expect(group_("purchasing-receive").getAttribute("aria-expanded")).toBe("true");
    expect(child("receiving").className).toContain("bg-kit-blue-3");
    // B's own storage was not written by merely arriving.
    expect(localStorage.getItem(drawerKey("user-b"))).toBeNull();
  });

  it("the route it opens on is never written to storage", () => {
    mockUserId = "user-a";
    renderAt("/operation?tab=receiving");
    expect(localStorage.getItem(drawerKey("user-a"))).toBeNull();
  });
});

/**
 * THE DELIVERY MODULE — TWO PAGES, BOTH OF THEM OPEN
 * (CARD-2026-08-21-delivery-01-sidebar, owner ruling 2026-08-21).
 *
 * This OVERWRITES the seven-row list of 2026-08-19. Five of those rows —
 * Schedule, Delivery History, Exceptions, Partners, Report — were readable,
 * countable and dead, and a rail that refuses five of its seven clicks teaches
 * an operator to stop trusting the rail. The capabilities are not retired
 * (`docs/delivery/MASTER.md` §7 still holds them as approved targets); they are
 * simply not NAVIGATION until they are pages.
 */
describe("PortalSidebar — Delivery is one page", () => {
  it("shows one plain Delivery door instead of a parent with two children", () => {
    renderAt("/operation?tab=delivery");
    const row = child("delivery");
    expect(row.tagName).toBe("A");
    expect(row).toHaveAttribute("href", "/operation?tab=delivery");
    expect(row.className).toContain("bg-kit-blue-3");
    expect(row).toHaveTextContent("Delivery");
    expect(screen.queryByTestId("nav-module-delivery")).toBeNull();
    expect(screen.queryByTestId("nav-child-delivery-orders")).toBeNull();
  });

  it("does not show retired Delivery destinations", () => {
    renderAt("/operation?tab=delivery");
    for (const key of [
      "delivery-orders",
      "delivery-schedule",
      "delivery-history",
      "delivery-exceptions",
      "delivery-partners",
      "delivery-report",
    ]) {
      expect(screen.queryByTestId(`nav-child-${key}`)).toBeNull();
    }
  });
});

describe("PortalSidebar — the Warehouse module's pages", () => {
  it("Stock is the one built Warehouse register", () => {
    renderAt("/operation?tab=stock-onhand");
    expect(child("stock")).toHaveAttribute("href", "/operation?tab=stock-onhand");
    expect(screen.queryByTestId("nav-child-stock-plan")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-child-movements")).not.toBeInTheDocument();
  });

  it("Schedule is the landing Register; Transfers and Counts remain honest Blueprint rows", () => {
    renderAt("/operation?tab=stock-onhand");
    expect(child("warehouse-schedule")).toHaveAttribute(
      "href",
      "/operation?tab=warehouse-schedule",
    );
    for (const key of ["transfers", "counts"]) {
      const row = child(key);
      expect(row.tagName).toBe("SPAN");
      expect(row.getAttribute("aria-disabled")).toBe("true");
    }
  });

  /* UPDATED 2026-08-21 — CARD-2026-08-20-stock-register.
   *
   * The ruling this test was written for still stands: the MODULE is called
   * `Warehouse`, and K0's single merged `Stock` module row is gone for good.
   * What changed is that `Stock` is now the name of a CHILD PAGE — the Warehouse
   * master list, replacing `On hand` (ERP-ARCHITECTURE §2.1 and Stock MASTER §2
   * now spell the tree `Warehouse → Stock · Transfers · Counts`).
   *
   * The old assertion banned the WORD anywhere in the rail, which was always
   * wider than the ruling it enforced. It now checks the thing that was actually
   * ruled: no MODULE row says Stock, and the module row says Warehouse. */
  it("no bare `Stock` MODULE row survives — the module is Warehouse, Stock is its page", () => {
    renderAt("/operation?tab=stock-onhand");
    expect(within(module_("warehouse")).getByText("Warehouse")).toBeInTheDocument();
    // `Stock` exists exactly once, and it is a CHILD.
    expect(screen.getByTestId("nav-child-stock")).toHaveTextContent("Stock");
    const moduleRows = Array.from(
      document.querySelectorAll("[data-testid^='nav-module-']"),
    ).map((el) => el.textContent?.trim());
    expect(moduleRows).not.toContain("Stock");
  });

  it("the blueprint keeps Reports and Settings central — neither joins the module", () => {
    renderAt("/operation?tab=stock-onhand");
    const rows = Array.from(
      screen
        .getByTestId("nav-children-warehouse")
        .querySelectorAll("[data-testid^='nav-child-']"),
    ).map((el) => el.textContent?.replace("Coming soon", "").trim());
    /* `Stock`, not `On hand` — CARD-2026-08-20-stock-register §1. The learned
     * ORDER is untouched: the rail never reshuffles under an operator. */
    expect(rows).toEqual(["Schedule", "Stock", "Transfers", "Counts"]);
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
