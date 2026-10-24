import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";

/**
 * PortalSidebar — role-filtered area accordion (Unified Internal Portal,
 * 2026-06-30), rebuilt as EXPANDABLE MODULE ROWS (Jess, 2026-08-19 afternoon —
 * CARD-2026-08-19-sidebar-expandable-modules).
 *
 * Every module is an icon + name + chevron row whose pages hang beneath it on
 * one tree line with a rounded elbow to each page (owner 12 Oct 2026; 01 §4
 * "Side menu": one rule for every module, drawn from data). The Operations
 * area is cut into six small caps section labels (Carres Layout Standard §2).
 */

/** The selected row (Layout Standard §2): the theme select colours, 600. */
const SELECTED = "bg-c-select-pill";
/** The row a page hangs in: its trunk and its elbow sit beside the link. */
const treeRow = (key: string) => screen.getByTestId(`nav-child-${key}`).parentElement as HTMLElement;
const trunk = (key: string) => treeRow(key).querySelector<HTMLElement>("[data-tree='trunk']")!;
const elbow = (key: string) => treeRow(key).querySelector<HTMLElement>("[data-tree='elbow']")!;
/** A Material Symbols icon (`MIcon`) — the Operations menu's icons and carets. */
const MICON = ".material-symbols-rounded";
/** The person's own « choice, remembered (handoff 2026-10-08). */
const COLLAPSE_KEY = "carres-menu-collapsed";

let mockRole: string | null = "operation";
// The signed-in person; the menu stores nothing under it (owner 12 Oct 2026).
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
    // Chew 2026-10-03: Finance's own pages sit in Finance modules.
    expect(module_("payables")).toBeInTheDocument();
    expect(module_("receivables")).toBeInTheDocument();
    // §13 (payment/MASTER.md) — the Bank Matching workspace retired
    // 2026-09-07: its row must NOT come back.
    expect(screen.queryByText("Reconciliation")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-module-purchasing")).not.toBeInTheDocument();
    expect(screen.queryByText("Accounts")).not.toBeInTheDocument();
  });

  it("principal sees the Finance, HR and Admin area words, never an Operations one; only the active area is expanded", () => {
    mockRole = "principal";
    renderAt("/operation");
    /* Owner ruling 2026-10-08: the Operations area draws its six groups with
       no area word for the boss — no group is called "Operations". */
    expect(screen.queryByText("Operations")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-area-operation")).not.toBeInTheDocument();
    expect(screen.getAllByText("Finance").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("nav-area-finance")).toBeInTheDocument();
    expect(screen.getByTestId("nav-area-hr")).toBeInTheDocument();
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

  it("Finance keeps Dashboard on top and AP · Payables above AR (owner ruling 2026-09-14; Finance modules, Chew 2026-10-03)", () => {
    mockRole = "finance";
    renderAt("/finance/ap-outstanding");
    const dashboard = child("dashboard");
    const payables = module_("payables");
    const receivables = module_("receivables");
    const ap = child("ap");
    expect(ap).toHaveTextContent("AP · Payables");
    expect(ap).toHaveAttribute("href", "/finance/ap-outstanding");
    expect(screen.queryByText("Unpaid by Supplier")).not.toBeInTheDocument();
    expect(dashboard.compareDocumentPosition(payables) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // AP sits inside Payables, and Payables sits above Receivables — so AP stays above AR.
    expect(payables.compareDocumentPosition(ap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ap.compareDocumentPosition(receivables) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("principal on the Finance base expands the Finance area", () => {
    mockRole = "principal";
    renderAt("/finance/ar");
    expect(screen.getByText("AR · Receivables")).toBeInTheDocument();
    /* Operations has no area word to open it with, so it is always drawn —
       standing in Finance never hides the boss's Operations menu (fix
       2026-10-09, found by the shell test pass). */
    expect(screen.getByTestId("nav-group-head-supply-chain")).toBeInTheDocument();
    expect(screen.getByTestId("nav-module-purchasing")).toBeInTheDocument();
  });
});

/**
 * ⭐ THE AREA YOU ARE IN FOLDS (Chew, 2026-10-03; Finance MASTER §4). Its
 * title folds it and opens it again, and the page stays where it is. Another
 * area's title still jumps to that area, as before. One rule for every area.
 */
describe("PortalSidebar — the area you are in folds", () => {
  beforeEach(() => {
    mockRole = "principal";
  });

  it("its title folds it and opens it again, and the page does not move", () => {
    renderAt("/finance/dashboard");
    const finance = screen.getByTestId("nav-area-finance");
    /* Operations is always drawn too, so it has its own Dashboard row: count
       the Finance one inside the Finance area only. */
    const financeDashboards = () =>
      screen.queryAllByTestId("nav-child-dashboard").filter((el) => el.getAttribute("href") === "/finance/dashboard");
    expect(finance).toHaveAttribute("aria-expanded", "true");
    expect(financeDashboards()).toHaveLength(1);
    fireEvent.click(finance);
    expect(finance).toHaveAttribute("aria-expanded", "false");
    expect(financeDashboards()).toHaveLength(0);
    expect(screen.queryByTestId("nav-module-payables")).not.toBeInTheDocument();
    expect(screen.getByTestId("location-probe")).toHaveTextContent(/^\/finance\/dashboard$/);
    fireEvent.click(finance);
    expect(finance).toHaveAttribute("aria-expanded", "true");
    expect(financeDashboards()).toHaveLength(1);
  });

  it("folded, its title is the one selected mark of where you are", () => {
    renderAt("/finance/dashboard");
    const finance = screen.getByTestId("nav-area-finance");
    // The theme select colour, never the retired blue (Layout Standard §2).
    expect(finance).not.toHaveClass("!text-c-select-fg");
    fireEvent.click(finance);
    expect(finance).toHaveClass("!text-c-select-fg");
    expect(screen.getByTestId("nav-area-hr")).not.toHaveClass("!text-c-select-fg");
  });

  it("every area title carries its caret, open or shut", () => {
    renderAt("/finance/dashboard");
    // Operations has no area title for the boss (owner ruling 2026-10-08).
    for (const area of ["finance", "hr", "principal"]) {
      expect(screen.getByTestId(`nav-area-${area}`).querySelector(MICON), area).not.toBeNull();
    }
  });

  it("another area's title still jumps there, and that area opens", () => {
    renderAt("/finance/dashboard");
    fireEvent.click(screen.getByTestId("nav-area-finance"));
    fireEvent.click(screen.getByTestId("nav-area-hr"));
    expect(screen.getByTestId("location-probe")).toHaveTextContent("/hr?tab=overview");
    expect(screen.getByTestId("nav-area-hr")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("nav-area-finance")).toHaveAttribute("aria-expanded", "false");
  });

  /* The Operations area has no area word to click, so standing in another
     area must not leave the boss without her Operations menu. */
  it("standing in Finance, the boss still has her Operations menu", () => {
    renderAt("/finance/dashboard");
    expect(screen.getByTestId("nav-group-head-supply-chain")).toBeInTheDocument();
    expect(module_("purchasing")).toBeInTheDocument();
  });

  /* "Operations folds too" is RETIRED: the Operations area has no area word
     for the boss (owner ruling 2026-10-08), so there is nothing to fold it by.
     Its six groups draw open while she stands in it. */
  it("Operations has no area word to fold — its groups draw open where she stands", () => {
    renderAt("/operation");
    expect(screen.queryByTestId("nav-area-operation")).not.toBeInTheDocument();
    expect(screen.getByTestId("nav-group-head-overview")).toBeInTheDocument();
    expect(module_("purchasing")).toBeInTheDocument();
    expect(screen.getByTestId("location-probe")).toHaveTextContent(/^\/operation$/);
  });
});

describe("PortalSidebar — narrow desktop", () => {
  /* RETIRED: the 2026-09-25 auto-collapse below 1280px. The menu now OPENS at
     220px on every desktop width (handoff 2026-10-08, "Do NOT" 2); only the
     person's own « click closes it. */
  it("opens at 220px below 1280 too — no automatic icon rail", () => {
    const previous = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(max-width: 1279px)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    try {
      renderAt("/operation?tab=delivery");
      expect(screen.getByTestId("portal-sidebar")).toHaveStyle({ width: "220px" });
      expect(screen.getByRole("button", { name: "Collapse menu" })).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "matchMedia", { configurable: true, value: previous });
    }
  });

  it("the « button closes it to 64px, says so, and is remembered under its own key", () => {
    const view = renderAt("/operation?tab=delivery");
    const toggle = screen.getByRole("button", { name: "Collapse menu" });
    expect(toggle).toHaveTextContent("«");
    fireEvent.click(toggle);
    expect(screen.getByTestId("portal-sidebar")).toHaveStyle({ width: "64px" });
    expect(screen.getByRole("button", { name: "Expand menu" })).toHaveTextContent("»");
    expect(localStorage.getItem(COLLAPSE_KEY)).toBe("1");
    view.unmount();
    // The next load keeps the person's choice.
    renderAt("/operation?tab=delivery");
    expect(screen.getByTestId("portal-sidebar")).toHaveStyle({ width: "64px" });
  });

  it("an older stored collapse never carries over — only the new key counts", () => {
    localStorage.setItem("ops-sidebar-collapsed", "1");
    renderAt("/operation?tab=delivery");
    expect(screen.getByTestId("portal-sidebar")).toHaveStyle({ width: "220px" });
  });
});

/**
 * ⭐ THE CARD'S OWN SHAPE (Jess, 2026-08-19 afternoon), drawn to the Carres
 * Layout Standard §2 (owner-confirmed template, 2026-10-08).
 *
 * A module is an icon + a name + a caret. The Operations area is cut into six
 * small uppercase GROUP LABELS — Overview · Sales locations · Sales · Supply
 * chain · Service · Data — which are labels, never destinations; a module row
 * itself is never an uppercase heading.
 */
describe("a module is an expandable PARENT ROW, never a heading", () => {
  it("every module row carries an icon, its name and a caret", () => {
    renderAt("/operation");
    for (const [slug, name] of [
      ["sales", "Sales Orders"],
      ["purchasing", "Purchasing"],
      ["warehouse", "Warehouse"],
      // The Customer Care module's word is `Service Case` (owner 2026-10-08).
      ["customer-care", "Service Case"],
      /* Master Data dropped off this list on 2026-08-21: with Suppliers gone
         it carries one page, and a one-page section is a plain row by design.
         Suppliers takes its place — two pages, so a real module. */
      ["suppliers", "Suppliers"],
    ] as const) {
      const row = module_(slug);
      expect(row.tagName).toBe("BUTTON");
      expect(within(row).getByText(name)).toBeInTheDocument();
      // icon + caret: two Material Symbols, and the caret states open/shut.
      expect(row.querySelectorAll(MICON).length).toBe(2);
      expect(row.getAttribute("aria-expanded")).toBe("false");
    }
  });

  it("the Operations menu is six small uppercase group labels, in the approved order", () => {
    renderAt("/operation?tab=purchase");
    const heads = Array.from(
      document.querySelectorAll<HTMLElement>("[data-testid^='nav-group-head-']"),
    );
    expect(heads.map((h) => h.textContent)).toEqual([
      "Overview",
      "Sales locations",
      "Sales",
      "Supply chain",
      "Service",
      "Data",
    ]);
    for (const head of heads) {
      // A label rank: 11px semibold caps, never a link or a button.
      expect(head.tagName).toBe("SPAN");
      expect(head.closest("a, button")).toBeNull();
      expect(head.className).toContain("uppercase");
      expect(head.className).toContain("text-[11px]");
      expect(head.className).toContain("font-semibold");
    }
    // No group is called "Operations" (owner ruling 2026-10-08).
    expect(screen.queryByText("Operations")).toBeNull();
  });

  it("each group carries its own modules and rows, in order", () => {
    renderAt("/operation");
    const nav = screen.getByRole("navigation", { name: "Modules" });
    const walk: string[] = [];
    for (const el of nav.querySelectorAll<HTMLElement>(
      "[data-testid^='nav-group-head-'], [data-testid^='nav-module-'], [data-testid^='nav-child-']",
    )) {
      walk.push(el.dataset.testid!.replace(/^nav-/, ""));
    }
    expect(walk).toEqual([
      "group-head-overview",
      "child-dashboard",
      "child-work",
      "child-leave",
      "group-head-sales-locations",
      "module-showroom",
      "group-head-sales",
      "module-sales",
      "group-head-supply-chain",
      "module-purchasing",
      "module-warehouse",
      "module-payments",
      "module-delivery",
      "group-head-service",
      "module-customer-care",
      "child-issue-tracker",
      "group-head-data",
      "module-reports",
      "module-suppliers",
      "child-op-catalog",
    ]);
  });

  it("no module row is an uppercase heading", () => {
    renderAt("/operation?tab=purchase");
    for (const word of ["Purchasing", "Warehouse", "Delivery", "Sales Orders"]) {
      const uppercaseHeading = screen
        .queryAllByText(word)
        .some((el) => el.closest("a") === null && el.className.includes("uppercase"));
      expect(uppercaseHeading, word).toBe(false);
    }
  });

  it("single pages stay plain rows — no caret on Dashboard, Workspace, Leave, Issue Tracker, Catalog", () => {
    renderAt("/operation");
    for (const key of ["dashboard", "work", "leave", "issue-tracker", "op-catalog"]) {
      const row = child(key);
      expect(row.tagName).toBe("A");
      expect(row.getAttribute("aria-expanded")).toBeNull();
      // icon only — a plain row has nothing to expand.
      expect(row.querySelectorAll(MICON).length, key).toBe(1);
    }
  });

  /* ⭐ PAYMENTS → Monitor · Payment Records (owner ruling 2026-09-12). A
     module of two destinations, no `Payments · Invoices` tabs, no standalone
     Invoices or Receipts row, no clickable parent — and the rail is tested for
     its DESTINATIONS, not only its shape (the 2026-09-09 lesson). */
  it("Payments is a module with exactly Monitor and Payment Records beneath it", () => {
    renderAt("/finance/monitor");
    const parent = module_("payments");
    expect(parent.tagName).toBe("BUTTON");
    expect(parent).toHaveAttribute("aria-expanded", "true");
    const children = screen.getByTestId("nav-children-payments");
    const rows = within(children).getAllByRole("link");
    expect(rows.map((r) => r.textContent?.trim())).toEqual(["Monitor", "Payment Records"]);
    expect(child("payments")).toHaveAttribute("href", "/finance/monitor");
    expect(child("payment-records")).toHaveAttribute("href", "/finance/payments");
    expect(screen.queryByText("Invoices")).not.toBeInTheDocument();
    expect(screen.queryByText("Receipts")).not.toBeInTheDocument();
    expect(screen.queryByText("Order Payments")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-module-finance")).not.toBeInTheDocument();
  });

  it("the parent row is not a page of its own — it opens the named landing, Monitor", () => {
    renderAt("/operation");
    fireEvent.click(module_("payments"));
    // The shipped shell rule: expanding a module opens its landing page.
    // Payments names it (Monitor); there is no parent page to land on.
    expect(screen.getByTestId("location-probe")).toHaveTextContent("/finance/monitor");
    expect(screen.getByTestId("nav-children-payments")).toBeInTheDocument();
  });

  it("the Monitor row stays lit on the retired Invoices address while it forwards", () => {
    renderAt("/finance/invoices?invoice=abc");
    expect(child("payments").className).toContain("bg-c-select-pill");
  });

  it("finance sees the same two Payments destinations — never a second Payment IA", () => {
    mockRole = "finance";
    renderAt("/finance/payments");
    expect(child("payments")).toHaveAttribute("href", "/finance/monitor");
    expect(child("payment-records")).toHaveAttribute("href", "/finance/payments");
    expect(child("payment-records").className).toContain("bg-c-select-pill");
    expect(screen.queryByText("Refunds & Credits")).not.toBeInTheDocument();
    expect(screen.queryByText("Invoices")).not.toBeInTheDocument();
    // Genuine finance-only capability keeps its own rows, in Finance's own modules.
    expect(module_("receivables")).toBeInTheDocument();
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
    expect(screen.queryByText("Outright")).not.toBeInTheDocument();
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
    // Arrival Schedule is Warehouse's landing (owner ruling 2026-09-14) —
    // the rail navigated there.
    expect(child("wh-arrival-schedule").className).toContain("bg-c-select-pill");
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
    expect(child("wh-arrival-schedule").className).toContain("bg-c-select-pill");
  });

  it("a module shut by hand stays shut while you stand on its page", () => {
    renderAt("/operation?tab=purchase");
    fireEvent.click(module_("purchasing"));
    expect(screen.queryByTestId("nav-children-purchasing")).not.toBeInTheDocument();
    // ...and the shut module is the one carrying the light, so nothing is lost.
    expect(module_("purchasing").className).toContain("bg-c-select-pill");
  });
});

/**
 * THE TREE LINE (owner 12 Oct 2026; 01 §4): a 1.5px grey trunk beside each
 * page with a rounded elbow (radius 7) reaching it. The trunk stops at the
 * last page of each group, and the current page's elbow takes the theme
 * colour. Both pieces are decoration: `aria-hidden`, outside the link.
 */
describe("the tree line", () => {
  it("every page hangs on a trunk and a rounded elbow, 18px in", () => {
    renderAt("/operation/orders");
    const group = screen.getByTestId("nav-children-sales");
    expect(group.className).toContain("ml-[18px]");
    for (const key of ["orders", "rental"]) {
      expect(trunk(key).className).toContain("border-l-[1.5px]");
      expect(trunk(key).className).toContain("border-c-tree-line");
      expect(elbow(key).className).toContain("rounded-bl-[7px]");
      expect(elbow(key).className).toContain("border-b-[1.5px]");
      expect(trunk(key).getAttribute("aria-hidden")).toBe("true");
      expect(elbow(key).getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("the trunk stops at the last page: full height before it, half at it", () => {
    renderAt("/operation/orders");
    expect(trunk("orders").style.height).toBe("100%");
    expect(trunk("rental").style.height).toBe("calc(50% - 8px)");
  });

  it("the trunk stops at the last page of EACH group", () => {
    renderAt("/operation?tab=purchase"); // BUY open: three pages
    expect(trunk("purchase").style.height).toBe("100%");
    expect(trunk("manual-purchase").style.height).toBe("100%");
    /* 0717 · the BUY group now ends at Cancellation Requests (Weisiang's decision (Mr Lim, WhatsApp 2026-10-22; Jess was not part of this decision)). */
    expect(trunk("purchase-orders").style.height).toBe("100%");
    expect(trunk("po-cancellation-requests").style.height).toBe("calc(50% - 8px)");
  });

  it("the current page's elbow takes the theme colour; the others stay grey", () => {
    renderAt("/operation?tab=receiving");
    expect(elbow("receiving").className).toContain("border-c-select-fg");
    fireEvent.click(group_("purchasing-buy"));
    expect(elbow("purchase").className).toContain("border-c-tree-line");
    expect(elbow("purchase").className).not.toContain("border-c-select-fg");
  });

  it("the line is decoration beside the link, so a screen reader hears only the name", () => {
    renderAt("/operation/orders");
    expect(child("rental").children).toHaveLength(1);
    expect(child("rental")).toHaveTextContent(/^Subscription$/);
  });

  it("a long name wraps to a second line and is never cut", () => {
    renderAt("/operation?tab=purchase");
    const label = within(child("manual-purchase")).getByText("Manual Purchase Request");
    expect(label.className).toContain("break-words");
    expect(label.className).not.toContain("truncate");
    expect(document.querySelector("[data-testid='portal-sidebar'] .truncate")).toBeNull();
  });

  /* The menu draws its own tree; it does not import the connector the
   * ConnectedSections page draws, which stays in the ONE shared file. */
  it("ConnectedSections still draws the shared connector, from its one file", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const sidebar = readFileSync(join(here, "PortalSidebar.tsx"), "utf8");
    expect(sidebar).not.toContain('from "@/components/tree-connector"');
    const sections = readFileSync(
      join(here, "..", "operation", "components", "ConnectedSections.tsx"),
      "utf8",
    );
    expect(sections).toContain('from "@/components/tree-connector"');
    expect(sections).not.toContain("borderBottomLeftRadius");
  });

  it("the menu names no module in its code: one rule, read from data", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const code = readFileSync(join(here, "PortalSidebar.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(code).not.toMatch(/"Purchasing"|"Warehouse"|"Payments"|PURCHASING|WAREHOUSE|PAYMENTS/);
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
    expect(
      within(module_("sales")).getByTestId("nav-badge-sales-orders").textContent,
    ).toBe("3");
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
      // The child's word is `Outright` (owner 2026-10-08), so is its chip's name.
      within(child("orders")).getByTestId("nav-badge-outright").textContent,
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
 * ⭐ THE SELECTED ROW — Carres Layout Standard §2 (owner-confirmed template,
 * Jess 2026-10-08): `bg-c-select-pill text-c-select-fg font-semibold`, the
 * theme's own select colours.
 *
 * RETIRED: the governed BLUE treatment (`kit-blue-3` wash + 3px `kit-blue-9`
 * left bar). There is no blue and no left bar any more, so the bar assertions
 * are gone. It still may never be the flame `primary` — red in Carres means
 * late / act now.
 */
describe("the active page — theme select colours, never flame", () => {
  it("the active child wears the theme select colours at 600, with no blue and no left bar", () => {
    renderAt("/operation?tab=receiving");
    const row = child("receiving");
    expect(row.className).toContain(SELECTED);
    expect(row.className).toContain("text-c-select-fg");
    expect(row.className).toContain("font-semibold");
    expect(row.className).toContain("rounded-lg");
    expect(row.className).not.toMatch(/kit-blue/);
    expect(row.querySelector("[class*='kit-blue']")).toBeNull();
  });

  it("the active page sits INSIDE its auto-expanded module on a direct URL load", () => {
    renderAt("/operation?tab=receiving");
    const group = screen.getByTestId("nav-children-purchasing");
    expect(group.contains(child("receiving"))).toBe(true);
  });

  it("an inactive page carries no selection colour, and reads at 400", () => {
    renderAt("/operation?tab=purchase");
    const row = child("purchase-orders");
    expect(row.className).not.toContain(SELECTED);
    // 400 at rest, 600 selected (01 §4 "Side menu").
    expect(row.className).toContain("font-normal");
    expect(row.className).not.toContain("font-semibold");
    expect(row.className).toContain("text-c-body");
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
    expect(module_("purchasing").className).toContain(SELECTED);
    expect(module_("purchasing").className).toContain("text-c-select-fg");
    // (the retired 3px blue bar assertion is gone — the approved row has none)
  });

  it("the COLLAPSED icon rail is selected the same way — same law, smaller rail", () => {
    localStorage.setItem(COLLAPSE_KEY, "1");
    try {
      renderAt("/operation/orders");
      expect(screen.getByTestId("portal-sidebar")).toHaveStyle({ width: "64px" });
      // Collapsed, the children disappear and the MODULE's one icon remains.
      const icon = screen.getByTitle("Sales Orders") as HTMLAnchorElement;
      expect(icon).toHaveAttribute("href", "/operation/orders");
      expect(icon.className).toContain(SELECTED);
      expect(icon.className).toContain("text-c-select-fg");
      expect(icon.querySelector("[class*='kit-blue']")).toBeNull();
      expect(icon.className).not.toContain("bg-base-100");
      expect(icon.querySelector(".text-primary")).toBeNull();
    } finally {
      localStorage.removeItem("carres-menu-collapsed");
    }
  });

  it("the collapsed rail navigates thirteen pages by ONE icon, not thirteen", () => {
    localStorage.setItem("carres-menu-collapsed", "1");
    try {
      renderAt("/operation?tab=purchase");
      expect(screen.getByTitle("Purchasing")).toBeInTheDocument();
      expect(screen.queryByTitle("Receiving")).toBeNull();
      expect(screen.queryByTitle("Supplier Claims")).toBeNull();
    } finally {
      localStorage.removeItem("carres-menu-collapsed");
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
    expect(pm.className).toContain("bg-c-select-pill");
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
    expect(commissionLink().className).toContain("bg-c-select-pill");
  });

  it("is NOT lit on another HR tab (?tab=team)", () => {
    renderAt("/hr?tab=team");
    expect(commissionLink().className).not.toContain("bg-c-select-pill");
  });
});

/**
 * ⭐ SALES ORDERS — ONE PARENT, TWO CHILDREN (Jess, owner ruling 2026-09-23).
 *
 *     Sales Orders
 *     ├─ Outright        (was `Outright Sales`; owner 2026-10-08)
 *     └─ Subscription
 *
 * `docs/orders/MASTER.md` "Portal navigation", `docs/ui/MASTER.md` and the
 * COPY-STANDARD "Sales Orders navigation" table. The module row is the parent;
 * each child names the KIND of customer order it opens. `Purchase` is rejected
 * by name — it reads as Purchasing.
 *
 * Two things this ruling deliberately does NOT do, and both are asserted here:
 * it does not move an ADDRESS (every existing deep link still lands), and it
 * does not delete the legacy page whose menu row it removes.
 */
describe("PortalSidebar — the approved Sales Orders tree", () => {
  it("is exactly Outright then Subscription, under one Sales Orders parent", () => {
    renderAt("/operation/orders");
    expect(module_("sales")).toHaveTextContent("Sales Orders");
    const group = screen.getByTestId("nav-children-sales");
    const rows = Array.from(group.querySelectorAll("[data-testid^='nav-child-']"));
    expect(rows.map((r) => r.textContent?.trim())).toEqual([
      "Outright",
      "Subscription",
    ]);
  });

  it("keeps both addresses exactly where they were", () => {
    renderAt("/operation/orders");
    // The register, its detail and its amendment journey — unmoved.
    expect(child("orders")).toHaveAttribute("href", "/operation/orders");
    // The Subscription-owned destination (`docs/rental/MASTER.md`) — unmoved.
    expect(child("rental")).toHaveAttribute("href", "/operation?tab=rental");
  });

  it("`Purchase` is never the word for the outright child", () => {
    renderAt("/operation/orders");
    const group = screen.getByTestId("nav-children-sales");
    expect(group.textContent).not.toMatch(/Purchase/);
  });

  it("on /operation/orders only Outright is lit", () => {
    renderAt("/operation/orders");
    expect(child("orders").className).toContain("bg-c-select-pill");
    expect(child("rental").className).not.toContain("bg-c-select-pill");
  });

  it("on ?tab=rental only Subscription is lit, and it opens the Sales Orders module", () => {
    renderAt("/operation?tab=rental");
    expect(child("rental").className).toContain("bg-c-select-pill");
    expect(child("orders").className).not.toContain("bg-c-select-pill");
    expect(module_("sales").getAttribute("aria-expanded")).toBe("true");
  });

  /* THE ROW MOVED; IT WAS NOT COPIED. Two rows to one page are two rows the
     rail would light at once — Law C, a door and never a duplicate. */
  it("Subscription left Customer Care — it is not in both places", () => {
    renderAt("/operation?tab=rental");
    expect(screen.getAllByTestId("nav-child-rental")).toHaveLength(1);
    expect(screen.queryByText("Rental")).not.toBeInTheDocument();
  });

  it("Customer Care keeps its own two pages, under the `Service Case` module word", () => {
    renderAt("/operation?tab=service-notes");
    expect(module_("customer-care")).toHaveTextContent("Service Case");
    const group = screen.getByTestId("nav-children-customer-care");
    const rows = Array.from(group.querySelectorAll("[data-testid^='nav-child-']"));
    expect(rows.map((r) => r.textContent?.trim())).toEqual([
      "Service Cases",
      "Guarantees",
    ]);
    // Issue Tracker is its own row under SERVICE, never inside the module.
    expect(group.querySelector("[data-testid='nav-child-issue-tracker']")).toBeNull();
    expect(child("issue-tracker")).toHaveAttribute("href", "/operation/issues");
  });

  /* ⭐ THE MENU ROW IS REMOVED. THE PAGE IS NOT. "Menu removal does not delete
     orders, history, documents or valid existing deep links." The route test
     that proves the page still mounts lives in OperationApp.test.tsx; this one
     proves only that the RAIL no longer offers it. */
  it("Old Orders has left the rail", () => {
    renderAt("/operation/orders");
    expect(screen.queryByText("Old Orders (temporary)")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-child-old-orders")).not.toBeInTheDocument();
  });

  it("standing on the legacy route still shows the rail, and lights nothing falsely", () => {
    renderAt("/operation/old-orders");
    // The de-navigated page keeps working; no Sales child claims to be it.
    expect(module_("sales")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-child-old-orders")).not.toBeInTheDocument();
  });

  it("Delivery Orders is not under Sales Orders (ruling 2026-08-20)", () => {
    renderAt("/operation/orders");
    const group = screen.getByTestId("nav-children-sales");
    expect(group.querySelector("[data-testid='nav-child-delivery-orders']")).toBeNull();
  });

  /* ONE DESTINATION, ONE WORD. A principal stands in Operations AND Admin at
     once; both rows point at `/operation/orders` and light together, so two
     different words would be the duplicate the ruling names. The Admin area is
     a shut accordion on an Operations URL, so the word is proved at the model
     it is read from — see `portal-nav.sales.test.ts` for the whole tree. */
  it("a principal sees the Sales Orders parent, not a second Sales word", () => {
    mockRole = "principal";
    renderAt("/operation/orders");
    expect(module_("sales")).toHaveTextContent("Sales Orders");
    expect(child("orders")).toHaveTextContent(/^Outright$/);
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
        // The word only — the caret is a Material Symbol ligature beside it.
        if (groupButton)
          return Array.from(groupButton.children)
            .find((el) => !el.matches(MICON))
            ?.textContent?.trim();
        return row.textContent?.replace("Coming soon", "").trim();
      });
    expect(rows).toEqual(["BUY", "RECEIVE", "PROBLEMS", "SHOWROOM"]);
    // Every top-level row IS a drawer — nothing hangs beside them.
    expect(tree.querySelectorAll("[data-testid^='nav-group-purchasing-']")).toHaveLength(4);
    // Reports moved to the central Reports area, so the rule above them went too.
    expect(tree.querySelector(".border-t")).toBeNull();
  });

  it("thirteen pages in the approved order, and not a fourteenth", () => {
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
      "Forecast Purchase",
      "Manual Purchase Request",
      "Purchase Orders",
      /* 0717 · Weisiang's decision (Mr Lim, WhatsApp 2026-10-22; Jess was not part of this decision). */
      "PO Amendments",
      "Cancellation Requests",
      "Receiving",
      "Supplier Claims",
      "Purchase Returns",
      "Repair Orders",
      "Display Requests",
      "Consignment Orders",
      "Consignment Returns",
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
    ]) {
      expect(screen.queryByTestId(`nav-child-${key}`), key).not.toBeInTheDocument();
    }
    /* `purchasing-report` is a real page again, but under DATA → Reports
       (owner 2026-10-08) — never back inside the Purchasing module. */
    expect(
      screen.getByTestId("nav-children-purchasing").querySelector("[data-testid='nav-child-purchasing-report']"),
    ).toBeNull();
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
    expect(rows).toEqual(["SO Batch Purchase", "Forecast Purchase", "Manual Purchase Request", "Purchase Orders", "PO Amendments", "Cancellation Requests"]);
  });

  it("the rail word is `Manual Purchase Request`, in BUY (owner 2026-09-23)", () => {
    renderAt("/operation?tab=receiving");
    expect(screen.getByText("Receiving")).toBeInTheDocument();
    // `Goods Receipts` retired as navigation (owner instruction 2026-09-04;
    // ERP-ARCHITECTURE §2.1 — the GRN is a document, never a page name).
    expect(screen.queryByText("Goods Receipts")).not.toBeInTheDocument();
    expect(screen.queryByText(/GRN/)).not.toBeInTheDocument();
    fireEvent.click(group_("purchasing-buy"));
    const buy = screen.getByTestId("nav-group-children-purchasing-buy");
    expect(within(buy).getByText("Manual Purchase Request")).toBeInTheDocument();
    /* The bare word is no longer a row of its own, and the PLURAL was never
       a navigation label (it belongs to the register's footer). */
    expect(within(buy).queryByText("Manual Purchase")).toBeNull();
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
      /* `purchase-returns` LEFT this list on 2026-09-19 — §9.6's register, its
         read and its storage shipped, so it is a destination now and is
         asserted as one in the test below. `repair-orders` left it with §9.7
         slice A (migration 0602). */
      "display-requests",
      "consignment-orders",
      "consignment-returns",
    ]) {
      const row = child(key);
      expect(row.tagName, key).toBe("SPAN");
      expect(row.getAttribute("href")).toBeNull();
      expect(row.getAttribute("role")).not.toBe("link");
      expect(row.getAttribute("tabindex")).toBe("-1");
      expect(row.getAttribute("aria-disabled")).toBe("true");
      expect(row.textContent).toContain("Coming soon");
      // The name owns its line; the reason stacks under it.
      expect(row.firstElementChild?.className).toContain("flex-col");
    }
  });

  it("Purchase Returns is a real door now — §9.6 shipped 2026-09-19", () => {
    renderAt("/operation?tab=purchase");
    fireEvent.click(group_("purchasing-problems"));
    const row = child("purchase-returns");
    // The opposite of every assertion in the test above: it is a link, it is
    // focusable, and it no longer explains itself away.
    expect(row.tagName).toBe("A");
    expect(row.getAttribute("href")).toBe("/operation?tab=purchase-returns");
    expect(row.getAttribute("aria-disabled")).not.toBe("true");
    expect(row.textContent).not.toContain("Coming soon");
  });

  it("Repair Orders is a real door now — §9.7 slice A", () => {
    renderAt("/operation?tab=purchase");
    fireEvent.click(group_("purchasing-problems"));
    const row = child("repair-orders");
    expect(row.tagName).toBe("A");
    expect(row.getAttribute("href")).toBe("/operation?tab=repair-orders");
    expect(row.textContent).not.toContain("Coming soon");
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

  it("a nested path page wins — Receiving does not light next to Purchase Orders", () => {
    renderAt("/operation/procurement");
    expect(child("purchase-orders").className).toContain("bg-c-select-pill");
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

  /* ⭐ WHERE YOU ARE IS ALWAYS MARKED (owner 12 Oct 2026; 01 §4): the module
   * holding the current page wears the selection, open or shut. Open, its
   * page wears it too. Shut, the module is the one mark. `aria-current` stays
   * on the page alone, and a group word is never selected. */
  it("shut, the module is the one mark of where you are", () => {
    renderAt("/operation?tab=receiving");
    fireEvent.click(module_("purchasing")); // shut it, still on Receiving
    expect(module_("purchasing").className).toContain("bg-c-select-pill");
    expect(module_("purchasing").className).toContain("font-semibold");
    expect(module_("purchasing").className).toContain("text-c-select-fg");
  });

  it("open, the module and its current page both wear the selection", () => {
    renderAt("/operation?tab=receiving");
    expect(module_("purchasing").className).toContain("bg-c-select-pill");
    expect(child("receiving").className).toContain("bg-c-select-pill");
    expect(module_("purchasing").getAttribute("aria-current")).toBeNull();
    expect(child("receiving").getAttribute("aria-current")).toBe("page");
  });

  it("open tree: exactly ONE page is selected — never a group word, never a sibling", () => {
    renderAt("/operation?tab=receiving");
    expect(group_("purchasing-receive").className).not.toContain("bg-c-select-pill");
    const lit = screen
      .getByTestId("nav-children-purchasing")
      .querySelectorAll(".bg-c-select-pill");
    expect(lit.length).toBe(1);
    expect(child("receiving").className).toContain("bg-c-select-pill");
    expect(document.querySelectorAll("[aria-current='page']")).toHaveLength(1);
  });

  it("a module that does not hold the current page stays neutral", () => {
    renderAt("/operation/orders");
    expect(module_("purchasing").className).not.toContain("bg-c-select-pill");
    expect(module_("sales").className).toContain("bg-c-select-pill");
  });

  it("arriving by URL opens Purchasing so the destination is never hidden", () => {
    renderAt("/operation?tab=claims");
    expect(module_("purchasing").getAttribute("aria-expanded")).toBe("true");
    expect(child("claims").className).toContain("bg-c-select-pill");
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
    expect(child("manual-purchase").className).toContain("bg-c-select-pill");
    // Its drawer siblings stay dark.
    expect(child("purchase").className).not.toContain("bg-c-select-pill");
    expect(child("purchase-orders").className).not.toContain("bg-c-select-pill");
    expect(group_("purchasing-buy").className).not.toContain("bg-c-select-pill");
    const lit = screen
      .getByTestId("nav-children-purchasing")
      .querySelectorAll(".bg-c-select-pill");
    expect(lit.length).toBe(1);
  });

  /* GOODS RECEIPTS — the one-page drawer. RECEIVE must force itself open. */
  it("arriving at Receiving opens Purchasing + RECEIVE and lights ONE row", () => {
    renderAt("/operation?tab=receiving");
    expect(module_("purchasing").getAttribute("aria-expanded")).toBe("true");
    expect(group_("purchasing-receive").getAttribute("aria-expanded")).toBe("true");
    expect(child("receiving").className).toContain("bg-c-select-pill");
    expect(group_("purchasing-receive").className).not.toContain("bg-c-select-pill");
    const lit = screen
      .getByTestId("nav-children-purchasing")
      .querySelectorAll(".bg-c-select-pill");
    expect(lit.length).toBe(1);
  });

  /* BOTH ENTRANCES, ONE DESTINATION. `/operation/to-order` is still a live
   * in-page link; it may not light a second row. */
  it("/operation/to-order opens Purchasing + BUY and selects only SO Batch Purchase", () => {
    renderAt("/operation/to-order");
    expect(module_("purchasing").getAttribute("aria-expanded")).toBe("true");
    expect(group_("purchasing-buy").getAttribute("aria-expanded")).toBe("true");
    expect(child("purchase").className).toContain("bg-c-select-pill");
    expect(child("purchase-orders").className).not.toContain("bg-c-select-pill");
    const lit = screen
      .getByTestId("nav-children-purchasing")
      .querySelectorAll(".bg-c-select-pill");
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
      /* Full width by its column: the button is a stretched child of a
         flex column (the `w-full` class itself left with the 2026-10-08
         drawing). */
      expect(row.parentElement?.className, key).toContain("flex-col");
    }
  });

  it("the word is a LABEL rank — 11 / 500 caps, never a destination", () => {
    renderAt("/operation?tab=purchase");
    const row = group_("purchasing-buy");
    // 01 §2 caps label: 11 / 500 / .06em caps (never below 11), aligned with the page text.
    expect(row.className).toContain("text-[11px]");
    expect(row.className).toContain("font-medium");
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

  /* A group word sits on the same 46px as the page text under it: the tree is
   * 18 in, the word is padded 28, the page is 18 + its own 10. */
  it("the group word is aligned with the page text beneath it", () => {
    renderAt("/operation?tab=purchase");
    expect(screen.getByTestId("nav-children-purchasing").className).toContain("ml-[18px]");
    expect(group_("purchasing-buy").className).toContain("pl-7");
    expect(treeRow("purchase").className).toContain("pl-[18px]");
    expect(child("purchase").className).toContain("px-2.5");
    expect(child("purchase").className).toContain("text-[13px]");
  });

  it("a group word carries no trunk and no elbow: the line stops between groups", () => {
    renderAt("/operation?tab=purchase");
    for (const key of ["purchasing-buy", "purchasing-receive", "purchasing-problems", "purchasing-showroom"]) {
      expect(group_(key).querySelector("[data-tree]"), key).toBeNull();
      const beside = Array.from(group_(key).parentElement?.children ?? []);
      expect(beside.some((el) => el.hasAttribute("data-tree")), key).toBe(false);
    }
  });

  /* ⭐ ONLY THE GROUP HOLDING THE CURRENT PAGE IS OPEN (owner 12 Oct 2026).
   * The others show their name and open with their own chevron. */
  it("only the group holding the current page is open when the page loads", () => {
    renderAt("/operation?tab=receiving");
    expect(group_("purchasing-receive").getAttribute("aria-expanded")).toBe("true");
    for (const key of ["purchasing-buy", "purchasing-problems", "purchasing-showroom"]) {
      expect(group_(key).getAttribute("aria-expanded"), key).toBe("false");
      expect(screen.queryByTestId(`nav-group-children-${key}`), key).toBeNull();
    }
  });

  it("a module opened to look, from another module's page, shows every group open", () => {
    renderAt("/operation/orders");
    fireEvent.click(module_("purchasing"));
    for (const key of ["purchasing-buy", "purchasing-receive", "purchasing-problems", "purchasing-showroom"]) {
      expect(group_(key).getAttribute("aria-expanded"), key).toBe("true");
    }
    expect(screen.getByText("Consignment Returns")).toBeVisible();
  });

  it("each group has its own chevron: up while open, down while shut", () => {
    renderAt("/operation?tab=receiving");
    expect(group_("purchasing-receive").querySelector(MICON)?.getAttribute("data-icon")).toBe("expand_less");
    expect(group_("purchasing-buy").querySelector(MICON)?.getAttribute("data-icon")).toBe("expand_more");
  });

  it("a group opened by hand does not outlive the page it was opened on", () => {
    function Jump() {
      const navigate = useNavigate();
      return <button type="button" onClick={() => navigate("/operation?tab=claims")}>jump</button>;
    }
    render(
      <MemoryRouter initialEntries={["/operation?tab=receiving"]}>
        <PortalSidebar />
        <Jump />
      </MemoryRouter>,
    );
    fireEvent.click(group_("purchasing-showroom"));
    expect(group_("purchasing-showroom").getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByText("jump"));
    expect(group_("purchasing-problems").getAttribute("aria-expanded")).toBe("true");
    expect(group_("purchasing-showroom").getAttribute("aria-expanded")).toBe("false");
    expect(group_("purchasing-receive").getAttribute("aria-expanded")).toBe("false");
  });

  /* ⭐ THE 64px ICON GOES WHERE IT IS TOLD, NOT WHERE ROW ORDER PUTS IT
   * (owner review, 2026-08-20). Deriving it from the first live row moved the
   * module's landing page the moment grouping reordered the rail. */
  it("the collapsed Purchasing icon links to SO Batch Purchase, and lights on any Purchasing page", () => {
    localStorage.setItem("carres-menu-collapsed", "1");
    try {
      renderAt("/operation?tab=receiving");
      const icon = screen.getByTitle("Purchasing") as HTMLAnchorElement;
      // Named, never derived: the landing page does not move when row order does.
      expect(icon).toHaveAttribute("href", "/operation?tab=purchase");
      // Standing on Receiving still lights the module's one icon.
      expect(icon.className).toContain("bg-c-select-pill");
      // (the retired 3px blue bar assertion is gone — the approved row has none)
    } finally {
      localStorage.removeItem("carres-menu-collapsed");
    }
  });

  it("collapsed to 64px, every direct/drawer/listing row disappears", () => {
    localStorage.setItem("carres-menu-collapsed", "1");
    try {
      renderAt("/operation?tab=receiving");
      expect(screen.getByTitle("Purchasing")).toBeInTheDocument();
      expect(screen.queryByTestId("nav-group-purchasing-buy")).not.toBeInTheDocument();
      expect(screen.queryByText("BUY")).not.toBeInTheDocument();
      expect(screen.queryByText("Receiving")).not.toBeInTheDocument();
      expect(screen.queryByText("Manual Purchase")).not.toBeInTheDocument();
      expect(screen.queryByText("SHOWROOM")).not.toBeInTheDocument();
    } finally {
      localStorage.removeItem("carres-menu-collapsed");
    }
  });
});

/**
 * NOTHING ABOUT THE MENU IS STORED PER PERSON (owner 12 Oct 2026). Which module
 * and which group are open is read from the page on every load, so the menu
 * can never hide the page you are on and never opens a group you are not in.
 * The one thing remembered is the person's own « choice.
 */
describe("PortalSidebar — the menu stores no open groups", () => {
  it("working the chevrons writes nothing to storage", () => {
    mockUserId = "user-a";
    renderAt("/operation?tab=receiving");
    fireEvent.click(group_("purchasing-problems"));
    fireEvent.click(module_("purchasing"));
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it("an older stored preference is ignored: the page still decides", () => {
    mockUserId = "user-a";
    localStorage.setItem(
      "carres:portal-sidebar:purchasing:v2:user-a",
      JSON.stringify({ moduleOpen: true, openGroups: ["purchasing-showroom"] }),
    );
    renderAt("/operation/orders");
    expect(screen.queryByTestId("nav-children-purchasing")).toBeNull();
    expect(screen.getByTestId("nav-children-sales")).toBeInTheDocument();
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
describe("PortalSidebar — the Delivery module's two destinations", () => {
  /* THE FOUR-PAGE MAP (CARD-2026-09-04-delivery-01): Monitor → Delivery
   * Orders → Delivery Order → Edit Delivery. The first two are NAVIGATION;
   * the object and the writer are reached from cards and rows, never from
   * the rail. This overwrites the 2026-08-21 one-page ruling. */
  it("Delivery is a module carrying Monitor and Delivery Orders, in that order", () => {
    renderAt("/operation?tab=delivery");
    expect(screen.getByTestId("nav-module-delivery")).toBeInTheDocument();
    const rows = Array.from(
      screen
        .getByTestId("nav-children-delivery")
        .querySelectorAll("[data-testid^='nav-child-']"),
    ).map((el) => el.textContent?.replace("Coming soon", "").trim());
    expect(rows).toEqual(["Monitor", "Delivery Orders"]);
  });

  it("Monitor opens ?tab=delivery and is the ONLY active row there", () => {
    renderAt("/operation?tab=delivery");
    const monitor = child("delivery");
    expect(monitor.tagName).toBe("A");
    expect(monitor).toHaveAttribute("href", "/operation?tab=delivery");
    expect(monitor.className).toContain("bg-c-select-pill");
    expect(child("delivery-orders").className).not.toContain("bg-c-select-pill");
  });

  it("Delivery Orders opens its restored register route and lights only itself", () => {
    renderAt("/operation/delivery-orders");
    const register = child("delivery-orders");
    expect(register).toHaveAttribute("href", "/operation/delivery-orders");
    expect(register.className).toContain("bg-c-select-pill");
    expect(child("delivery").className).not.toContain("bg-c-select-pill");
  });

  it("a DO object deep link lights the Delivery Orders row", () => {
    renderAt("/operation/delivery-orders/DO-040926-0001");
    expect(child("delivery-orders").className).toContain("bg-c-select-pill");
    expect(child("delivery").className).not.toContain("bg-c-select-pill");
  });

  it("does not show retired Delivery destinations", () => {
    renderAt("/operation?tab=delivery");
    const tree = screen.getByTestId("nav-children-delivery");
    for (const key of [
      "delivery-schedule",
      "delivery-history",
      "delivery-exceptions",
      "delivery-partners",
      /* `delivery-report` is a real page again, but under DATA → Reports
         (owner 2026-10-08) — never inside the Delivery module. */
      "delivery-report",
    ]) {
      expect(tree.querySelector(`[data-testid='nav-child-${key}']`), key).toBeNull();
    }
    for (const key of ["delivery-schedule", "delivery-history", "delivery-exceptions", "delivery-partners"]) {
      expect(screen.queryByTestId(`nav-child-${key}`), key).toBeNull();
    }
  });
});

describe("PortalSidebar — the Warehouse module's four destinations", () => {
  /* THE MAP IS FOUR DESTINATIONS (owner replacement Card 2026-09-06 —
   * Stock MASTER §2, ERP-ARCHITECTURE §2.1): `Monitor · Inbound ·
   * Inventory · Outbound`. The ERP keeps ONE global Dashboard; no
   * Warehouse-local Dashboard label remains, and no Calendar, Transfer,
   * Ready Stock or Dashboard row joins the rail. */
  it("the map is Monitor · Inbound · Inventory · Outbound, in that order", () => {
    renderAt("/operation?tab=stock-onhand");
    const rows = Array.from(
      screen
        .getByTestId("nav-children-warehouse")
        .querySelectorAll("[data-testid^='nav-child-']"),
    ).map((el) => el.textContent?.replace("Coming soon", "").trim());
    expect(rows).toEqual([
      "Arrival Schedule",
      "Pickup Schedule",
      "Inbound",
      "Inventory",
      "Outbound",
    ]);
  });

  it("Inventory is a live door and keeps the `?tab=stock-onhand` address", () => {
    renderAt("/operation?tab=stock-onhand");
    expect(child("stock")).toHaveAttribute("href", "/operation?tab=stock-onhand");
    expect(screen.getByTestId("nav-child-stock")).toHaveTextContent("Inventory");
  });

  it("all five destinations are live links — both Schedules, Inbound, Outbound included", () => {
    renderAt("/operation?tab=stock-onhand");
    const arrival = child("wh-arrival-schedule") as HTMLAnchorElement;
    expect(arrival.tagName).toBe("A");
    expect(arrival).toHaveAttribute("href", "/operation?tab=warehouse-arrival-schedule");
    const pickup = child("wh-pickup-schedule") as HTMLAnchorElement;
    expect(pickup.tagName).toBe("A");
    expect(pickup).toHaveAttribute("href", "/operation?tab=warehouse-pickup-schedule");
    const inbound = child("wh-inbound") as HTMLAnchorElement;
    expect(inbound.tagName).toBe("A");
    expect(inbound).toHaveAttribute("href", "/operation?tab=warehouse-inbound");
    const outbound = child("wh-outbound") as HTMLAnchorElement;
    expect(outbound.tagName).toBe("A");
    expect(outbound).toHaveAttribute("href", "/operation?tab=warehouse-outbound");
    // No Warehouse-local Dashboard label remains, and the retired combined
    // Monitor is gone from the rail (owner ruling 2026-09-14).
    const warehouseRail = within(screen.getByTestId("nav-children-warehouse"));
    expect(warehouseRail.queryByText("Dashboard")).toBeNull();
    expect(warehouseRail.queryByText("Monitor")).toBeNull();
  });

  /* The superseded subtree is GONE from the rail. The pages behind
   * `?tab=stock-plan` and `?tab=movements` keep their routes until their
   * capabilities are relocated (Stock MASTER §13) — de-navigated, not
   * deleted. */
  it("the superseded rows are gone — Stock, Ready stock, In & out, Transfers, Counts", () => {
    renderAt("/operation?tab=stock-onhand");
    for (const key of ["stock-plan", "movements", "transfers", "counts"]) {
      expect(screen.queryByTestId(`nav-child-${key}`)).toBeNull();
    }
    const railWords = Array.from(
      document.querySelectorAll("[data-testid^='nav-child-'], [data-testid^='nav-module-']"),
    ).map((el) => el.textContent?.replace("Coming soon", "").trim());
    for (const retired of ["Stock", "Ready stock", "In & out", "Transfers", "Counts"]) {
      expect(railWords).not.toContain(retired);
    }
    expect(within(module_("warehouse")).getByText("Warehouse")).toBeInTheDocument();
  });

  /* ⭐ THE 64px ICON GOES WHERE IT IS TOLD (the Purchasing law, applied):
   * Warehouse names `Arrival Schedule` as its landing (owner ruling
   * 2026-09-14) — by name, never derived from row order. */
  it("the collapsed Warehouse icon links to Arrival Schedule, and lights on a Warehouse page", () => {
    localStorage.setItem("carres-menu-collapsed", "1");
    try {
      renderAt("/operation?tab=stock-onhand");
      const icon = screen.getByTitle("Warehouse") as HTMLAnchorElement;
      expect(icon).toHaveAttribute("href", "/operation?tab=warehouse-arrival-schedule");
      expect(icon.className).toContain("bg-c-select-pill");
    } finally {
      localStorage.removeItem("carres-menu-collapsed");
    }
  });
});

/**
 * SETTINGS SITS AT THE BOTTOM OF THE MENU (Carres Layout Standard §2, owner
 * ruling 2026-10-08). The 2026-08-19 "no rail Settings row — the header gear
 * is the one Settings entry" rule is RETIRED by the owner: the header gear is
 * gone, and the ONE Settings entry is the row above the avatar.
 */
describe("the one Settings row, at the bottom of the menu", () => {
  it("operation — one Settings row, below every module, on every page", () => {
    for (const path of [
      "/operation",
      "/operation/orders",
      "/operation?tab=purchase",
      "/operation?tab=delivery",
      "/operation?tab=stock-onhand",
    ]) {
      const view = renderAt(path);
      const settings = screen.getByTestId("nav-settings");
      expect(screen.getAllByTestId("nav-settings"), path).toHaveLength(1);
      expect(settings).toHaveAttribute("href", "/operation/settings");
      expect(settings).toHaveTextContent("Settings");
      // Below the module list, never inside it; inside the one Modules landmark.
      const list = screen.getByTestId("portal-sidebar-list");
      expect(list.contains(settings)).toBe(false);
      expect(list.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByRole("navigation", { name: "Modules" }).contains(settings)).toBe(true);
      // ...and no module grows a Settings page of its own.
      expect(screen.queryByTestId("nav-child-purchasing-settings")).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it("principal — the same one row, to Operations Settings or to Finance Settings where she stands", () => {
    mockRole = "principal";
    const view = renderAt("/operation?tab=purchase");
    expect(screen.getByTestId("nav-settings")).toHaveAttribute("href", "/operation/settings");
    view.unmount();
    renderAt("/finance/dashboard");
    expect(screen.getByTestId("nav-settings")).toHaveAttribute("href", "/finance/settings");
  });

  it("finance has Finance Settings; People has no Settings page, so no row", () => {
    mockRole = "finance";
    const view = renderAt("/finance/dashboard");
    expect(screen.getByTestId("nav-settings")).toHaveAttribute("href", "/finance/settings");
    view.unmount();
    mockRole = "hr";
    renderAt("/hr?tab=overview");
    expect(screen.queryByTestId("nav-settings")).not.toBeInTheDocument();
  });

  it("collapsed, the Settings row keeps its icon and its name for a screen reader", () => {
    localStorage.setItem(COLLAPSE_KEY, "1");
    renderAt("/operation");
    const settings = screen.getByTestId("nav-settings");
    expect(settings).toHaveAttribute("aria-label", "Settings");
    expect(settings.querySelector(MICON)).not.toBeNull();
  });
});


it("Settings does not select Dashboard or restore a permanent Staff & Duties menu row", () => {
  renderAt("/operation/settings/staff-duties");
  expect(child("dashboard")).not.toHaveClass(SELECTED);
  expect(screen.queryByTestId("nav-child-staff-duties")).toBeNull();
  // The one selected row is Settings itself.
  expect(screen.getByTestId("nav-settings")).toHaveAttribute("aria-current", "page");
  expect(screen.getByTestId("nav-settings").className).toContain(SELECTED);
  // No module or page in the list is selected with it.
  expect(screen.getByTestId("portal-sidebar-list").querySelectorAll("[aria-current='page']")).toHaveLength(0);
  expect(document.querySelectorAll("[aria-current='page']")).toHaveLength(1);
});


describe("the menu frame (01 §4)", () => {
  it("the whole menu is the one Modules landmark and carries the right hairline", () => {
    renderAt("/operation");
    const menu = screen.getByRole("navigation", { name: "Modules" });
    expect(menu).toBe(screen.getByTestId("portal-sidebar"));
    expect(menu.className).toContain("border-r");
    expect(menu.className).toContain("border-c-head-line");
    expect(screen.getAllByRole("navigation", { name: "Modules" })).toHaveLength(1);
  });

  it("only the list scrolls: one scroller for the whole menu", () => {
    renderAt("/operation?tab=purchase");
    const scrollers = Array.from(screen.getByTestId("portal-sidebar").querySelectorAll<HTMLElement>("*"))
      .filter((el) => /overflow-y-auto|overflow-auto|overflow-y-scroll/.test(el.className));
    expect(scrollers).toEqual([screen.getByTestId("portal-sidebar-list")]);
  });
});

describe("Showroom operator destinations", () => {
  it("opens Carres and leaves Dealer non-clickable beneath the Showroom parent", () => {
    renderAt("/operation?tab=showroom");
    expect(module_("showroom")).toHaveAttribute("aria-expanded", "true");
    const tree = screen.getByTestId("nav-children-showroom");
    expect(within(tree).getByRole("link", { name: /^Carres$/ })).toHaveAttribute("href", "/operation?tab=showroom");
    const dealer = within(tree).getByTestId("nav-child-dealer-showroom");
    expect(dealer).toHaveAttribute("aria-disabled", "true");
    expect(dealer).not.toHaveAttribute("href");
    expect(dealer).toHaveTextContent("Dealer");
    expect(dealer).toHaveTextContent("Coming soon");
    expect(within(tree).queryByRole("link", { name: /^Dealer$/ })).not.toBeInTheDocument();
  });
});

// Detail auto-fit is temporary; lists keep the person's saved menu choice.
describe("PortalSidebar — Sales Order detail fit", () => {
  it("uses 64px below 1100 and restores the named menu on return", () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1025 });
    function ReturnToList() {
      const navigate = useNavigate();
      return <button onClick={() => navigate("/operation/orders")}>Return to list</button>;
    }
    try {
      render(<MemoryRouter initialEntries={["/operation/orders/so/test-order"]}>
        <PortalSidebar /><ReturnToList />
      </MemoryRouter>);
      expect(screen.getByTestId("portal-sidebar")).toHaveStyle({ width: "64px" });
      expect(localStorage.getItem(COLLAPSE_KEY)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Expand menu" }));
      expect(screen.getByTestId("portal-sidebar")).toHaveStyle({ width: "220px" });
      expect(localStorage.getItem(COLLAPSE_KEY)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Return to list" }));
      expect(screen.getByTestId("portal-sidebar")).toHaveStyle({ width: "220px" });
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth });
    }
  });
});

describe("PortalSidebar — common Tasks canvas fit", () => {
  it("temporarily compacts a narrow list and delegates expansion without changing the saved preference", () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1025 });
    const expand = vi.fn();
    try {
      render(<MemoryRouter initialEntries={["/operation?tab=purchase"]}>
        <PortalSidebar compactForCanvas onExpandForCanvas={expand} />
      </MemoryRouter>);
      expect(screen.getByTestId("portal-sidebar")).toHaveStyle({ width: "64px" });
      expect(localStorage.getItem(COLLAPSE_KEY)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Expand menu" }));
      expect(expand).toHaveBeenCalledOnce();
      // The shared host may still be asking whether to keep an unsaved task.
      expect(screen.getByTestId("portal-sidebar")).toHaveStyle({ width: "64px" });
      expect(localStorage.getItem(COLLAPSE_KEY)).toBeNull();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth });
    }
  });
});

describe("PortalSidebar — owner17Oct temporary module rail", () => {
  it("keeps a module detail64 without changing preference or hiding another panel", () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1025 });
    localStorage.setItem(COLLAPSE_KEY, "0");
    try {
      render(<MemoryRouter initialEntries={["/operation/orders/so/test-order"]}><PortalSidebar compactForCanvas /></MemoryRouter>);
      expect(screen.getByTestId("portal-sidebar")).toHaveStyle({ width: "64px" });
      expect(screen.getByRole("button", { name: "Expand menu" })).toBeDisabled();
      expect(localStorage.getItem(COLLAPSE_KEY)).toBe("0");
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1164 });
      fireEvent(window, new Event("resize"));
      expect(screen.getByTestId("portal-sidebar")).toHaveStyle({ width: "64px" });
      expect(localStorage.getItem(COLLAPSE_KEY)).toBe("0");
    } finally { Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth }); }
  });
});
