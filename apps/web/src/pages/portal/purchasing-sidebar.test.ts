import { describe, it, expect } from "vitest";
import { PORTAL_NAV, navItemHref, type PortalNavItem } from "./portal-nav";
import {
  PURCHASING_PAGE_GROUPS,
  purchasingChildBlocks,
  activePurchasingGroup,
  parsePurchasingSidebarState,
  serializePurchasingSidebarState,
  purchasingSidebarStorageKey,
} from "./purchasing-sidebar";

/**
 * THE PURCHASING MAP (CARD-2026-08-20-purchasing-sidebar-groups).
 *
 * Eighteen destinations stopped being scannable as one flat list, so the
 * module's pages hang off five NAMED groups. This file owns the contract:
 * the group order, which page belongs to which group, and the route truth
 * underneath — none of which may drift because a renderer changed.
 */

const operation = PORTAL_NAV[0];
const purchasing = operation.items.filter((item) => item.section === "Purchasing");
const label = (item: PortalNavItem) => item.label;

describe("the five groups", () => {
  it("is REQUESTS · BUY · RECEIVE · PROBLEMS · CONSIGNMENT, in that order", () => {
    expect(PURCHASING_PAGE_GROUPS.map((group) => group.label)).toEqual([
      "REQUESTS",
      "BUY",
      "RECEIVE",
      "PROBLEMS",
      "CONSIGNMENT",
    ]);
  });

  it("every group key is unique and every page attaches to a real group", () => {
    const keys = PURCHASING_PAGE_GROUPS.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const item of purchasing) {
      if (!item.pageGroup) continue;
      expect(keys).toContain(item.pageGroup);
    }
  });
});

describe("the approved hierarchy", () => {
  it("draws two direct rows, five groups, then Report", () => {
    const blocks = purchasingChildBlocks(purchasing);
    expect(
      blocks.map((b) => (b.kind === "page" ? b.item.label : b.group.label)),
    ).toEqual([
      "Purchasing Home",
      "My Purchasing Work",
      "REQUESTS",
      "BUY",
      "RECEIVE",
      "PROBLEMS",
      "CONSIGNMENT",
      "Report",
    ]);
  });

  it("fills each group with the approved pages, in the approved order", () => {
    const blocks = purchasingChildBlocks(purchasing);
    const group = (key: string) =>
      blocks
        .filter((b) => b.kind === "group" && b.group.key === key)
        .flatMap((b) => (b.kind === "group" ? b.pages.map(label) : []));

    expect(group("purchasing-requests")).toEqual([
      "New Supplier Requests",
      "New SKU Requests",
      "Display Requests",
      "Manual Purchase Requests",
    ]);
    expect(group("purchasing-buy")).toEqual([
      "Purchase Demands",
      "SO Batch Purchase",
      "Purchase Orders",
    ]);
    expect(group("purchasing-receive")).toEqual(["Goods Receipts"]);
    expect(group("purchasing-problems")).toEqual([
      "Supplier Claims",
      "Purchase Returns",
      "Repair Orders",
    ]);
    expect(group("purchasing-consignment")).toEqual([
      "Consignment Overview",
      "Consignment Orders",
      "Consignment Receipts",
      "Consignment Returns",
      "Consignment Sale Notices",
    ]);
  });

  it("Report is the trailing row and it carries the hairline", () => {
    const blocks = purchasingChildBlocks(purchasing);
    const last = blocks[blocks.length - 1];
    expect(last.kind).toBe("page");
    if (last.kind !== "page") return;
    expect(last.item.label).toBe("Report");
    expect(last.item.dividerAbove).toBe(true);
  });

  it("the two direct rows belong to no group", () => {
    for (const key of ["purchasing-home", "purchasing-work"]) {
      const item = purchasing.find((i) => i.key === key);
      expect(item, key).toBeDefined();
      expect(item?.pageGroup).toBeUndefined();
    }
  });
});

/** THE ROUTE TRUTH — the Card's own minimum assertion. A rename moved WORDS. */
describe("the live destinations keep their exact current addresses", () => {
  it("seven live pages, and every earlier route is unchanged", () => {
    // CARD-2026-08-20-purchase-demands added the SEVENTH. It joined at its
    // governed address and moved nobody: the six below are the same six
    // strings this test has asserted since the rename.
    expect(
      purchasing
        .filter((item) => !item.soon)
        .map((item) => [item.label, navItemHref(operation, item)]),
    ).toEqual([
      ["Manual Purchase Requests", "/operation?tab=manual-purchase"],
      ["Purchase Demands", "/operation?tab=purchase-demands"],
      ["SO Batch Purchase", "/operation?tab=purchase"],
      ["Purchase Orders", "/operation/procurement"],
      ["Goods Receipts", "/operation?tab=receiving"],
      ["Supplier Claims", "/operation?tab=claims"],
      ["Report", "/operation?tab=purchasing-report"],
    ]);
  });

  it("Purchase Demands is LIVE, in BUY, and it is not `Coming soon`", () => {
    // CARD-2026-08-20-purchase-demands — exactly the two edits the group's own
    // comment promised: `soon` came off, and the row became a link.
    const item = purchasing.find((i) => i.key === "purchase-demands");
    expect(item?.label).toBe("Purchase Demands");
    expect(item?.soon).toBeUndefined();
    expect(item?.pageGroup).toBe("purchasing-buy");
    expect(navItemHref(operation, item!)).toBe("/operation?tab=purchase-demands");
  });

  it("the two renamed pages kept their keys — only the word changed", () => {
    expect(purchasing.find((i) => i.key === "manual-purchase")?.label).toBe(
      "Manual Purchase Requests",
    );
    expect(purchasing.find((i) => i.key === "receiving")?.label).toBe("Goods Receipts");
  });

  it("SO Batch Purchase answers to BOTH its entrances, and links to one", () => {
    const item = purchasing.find((i) => i.key === "purchase");
    expect(item?.activeFor).toEqual(["tab:purchase", "path:/operation/to-order"]);
    expect(navItemHref(operation, item as PortalNavItem)).toBe("/operation?tab=purchase");
  });

  it("every other row is a non-control — no route may be invented for it", () => {
    for (const item of purchasing.filter((i) => i.soon)) {
      expect(item.path, item.key).toBeUndefined();
      expect(item.badge, item.key).toBeUndefined();
    }
  });
});

describe("the group holding the page you are on", () => {
  it("finds the group of a live destination", () => {
    expect(activePurchasingGroup(purchasing, "receiving")).toBe("purchasing-receive");
    expect(activePurchasingGroup(purchasing, "claims")).toBe("purchasing-problems");
    expect(activePurchasingGroup(purchasing, "purchase")).toBe("purchasing-buy");
    expect(activePurchasingGroup(purchasing, "manual-purchase")).toBe(
      "purchasing-requests",
    );
  });

  it("a direct row and Report belong to no group, and neither does nothing", () => {
    expect(activePurchasingGroup(purchasing, "purchasing-report")).toBeNull();
    expect(activePurchasingGroup(purchasing, null)).toBeNull();
    expect(activePurchasingGroup(purchasing, "stock")).toBeNull();
  });
});

/**
 * PRESENTATION STATE ONLY, AND PER SIGNED-IN USER. It remembers which drawers
 * the operator likes open — never a route, a count or a business fact.
 */
describe("the remembered open state", () => {
  it("keys on the auth user id, versioned", () => {
    expect(purchasingSidebarStorageKey("abc-123")).toBe(
      "carres:portal-sidebar:purchasing:v1:abc-123",
    );
  });

  it("round-trips", () => {
    const state = {
      moduleOpen: true,
      openGroups: ["purchasing-buy", "purchasing-problems"] as const,
    };
    expect(parsePurchasingSidebarState(serializePurchasingSidebarState(state))).toEqual({
      moduleOpen: true,
      openGroups: ["purchasing-buy", "purchasing-problems"],
    });
  });

  it("falls back safely on anything it did not write", () => {
    for (const raw of [
      null,
      "",
      "{",
      "null",
      "[]",
      '"a string"',
      "{}",
      '{"moduleOpen":"yes","openGroups":"buy"}',
    ]) {
      expect(parsePurchasingSidebarState(raw), String(raw)).toEqual({
        moduleOpen: false,
        openGroups: [],
      });
    }
  });

  it("keeps the half it can read and drops the half it cannot", () => {
    // The drawers are unreadable, but "the module was open" still is — and
    // throwing that away would shut a rail the operator left open.
    expect(parsePurchasingSidebarState('{"moduleOpen":true,"openGroups":[1,2,3]}')).toEqual({
      moduleOpen: true,
      openGroups: [],
    });
  });

  it("drops a group key it does not recognise instead of trusting it", () => {
    expect(
      parsePurchasingSidebarState(
        '{"moduleOpen":true,"openGroups":["purchasing-buy","purchasing-ghost"]}',
      ),
    ).toEqual({ moduleOpen: true, openGroups: ["purchasing-buy"] });
  });

  it("stores no route, no active key and no count", () => {
    const raw = serializePurchasingSidebarState({
      moduleOpen: true,
      openGroups: ["purchasing-receive"],
    });
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(["moduleOpen", "openGroups"]);
  });
});
