import { describe, it, expect } from "vitest";
import { PORTAL_NAV, navItemHref, type PortalNavItem } from "./portal-nav";
import {
  PURCHASING_PAGE_GROUPS,
  PURCHASING_LANDING_KEY,
  purchasingChildBlocks,
  activePurchasingGroup,
  parsePurchasingSidebarState,
  serializePurchasingSidebarState,
  purchasingSidebarStorageKey,
} from "./purchasing-sidebar";

/**
 * THE FINAL PURCHASING MAP — FOUR GROUPS, ELEVEN PAGES
 * (CARD-2026-08-22-purchasing-01-final-sidebar-listing; the approved tree is
 * `docs/purchasing/MASTER.md` §4).
 *
 * The earlier eighteen-row rail carried a Blueprint the owner rejected. This
 * file owns the replacement contract: four group labels in order, eleven pages
 * in order, the five live addresses byte-for-byte, and the eight retired rows
 * that may never return. None of it may drift because a renderer changed.
 */

const operation = PORTAL_NAV[0];
const purchasing = operation.items.filter((item) => item.section === "Purchasing");
const label = (item: PortalNavItem) => item.label;

/** The rows the owner deleted on 2026-08-22. A row that comes back here is a
 *  destination nobody approved — the assertion is the whole point. */
const RETIRED = [
  "purchasing-home",
  "purchasing-work",
  "new-supplier-requests",
  "new-sku-requests",
  "purchase-demands",
  "consignment-overview",
  "consignment-receipts",
  "purchasing-report",
];

describe("the four groups", () => {
  it("is BUY · RECEIVE · PROBLEMS · SHOWROOM, in that order", () => {
    expect(PURCHASING_PAGE_GROUPS.map((group) => group.label)).toEqual([
      "BUY",
      "RECEIVE",
      "PROBLEMS",
      "SHOWROOM",
    ]);
  });

  it("every group key is unique and every page attaches to a real group", () => {
    const keys = PURCHASING_PAGE_GROUPS.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const item of purchasing) {
      expect(keys, item.key).toContain(item.pageGroup);
    }
  });
});

describe("the approved hierarchy", () => {
  it("draws four groups and nothing else — no direct row, no Report", () => {
    const blocks = purchasingChildBlocks(purchasing);
    expect(
      blocks.map((b) => (b.kind === "page" ? b.item.label : b.group.label)),
    ).toEqual(["BUY", "RECEIVE", "PROBLEMS", "SHOWROOM"]);
    expect(blocks.every((b) => b.kind === "group")).toBe(true);
  });

  it("fills each group with the approved pages, in the approved order", () => {
    const blocks = purchasingChildBlocks(purchasing);
    const group = (key: string) =>
      blocks
        .filter((b) => b.kind === "group" && b.group.key === key)
        .flatMap((b) => (b.kind === "group" ? b.pages.map(label) : []));

    expect(group("purchasing-buy")).toEqual([
      "SO Batch Purchase",
      "Manual Purchase",
      "Purchase Orders",
    ]);
    expect(group("purchasing-receive")).toEqual(["Receiving"]);
    expect(group("purchasing-problems")).toEqual([
      "Supplier Claims",
      "Purchase Returns",
      "Repair Orders",
    ]);
    expect(group("purchasing-showroom")).toEqual([
      "Display Requests",
      "Consignment Orders",
      "Consignment Returns",
      "Consignment Sale Notices",
    ]);
  });

  it("is exactly eleven pages", () => {
    expect(purchasing).toHaveLength(11);
  });

  it("no row carries a hairline — Reports are central, not a Purchasing row", () => {
    for (const item of purchasing) {
      expect(item.dividerAbove, item.key).toBeUndefined();
    }
  });

  it("every retired row is gone from the module, not hidden behind a flag", () => {
    for (const key of RETIRED) {
      expect(
        purchasing.find((item) => item.key === key),
        key,
      ).toBeUndefined();
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
      "Report",
    ]) {
      expect(purchasing.map(label), word).not.toContain(word);
    }
  });

  it("REQUESTS and CONSIGNMENT are not group labels any more", () => {
    const labels = PURCHASING_PAGE_GROUPS.map((g) => g.label);
    expect(labels).not.toContain("REQUESTS");
    expect(labels).not.toContain("CONSIGNMENT");
    const keys = PURCHASING_PAGE_GROUPS.map((g) => g.key) as string[];
    expect(keys).not.toContain("purchasing-requests");
    expect(keys).not.toContain("purchasing-consignment");
  });
});

/** THE ROUTE TRUTH — the Card's own minimum assertion. Words moved; no address did. */
describe("the live destinations keep their exact current addresses", () => {
  it("five live pages, at the five unchanged addresses", () => {
    expect(
      purchasing
        .filter((item) => !item.soon)
        .map((item) => [item.label, navItemHref(operation, item)]),
    ).toEqual([
      ["SO Batch Purchase", "/operation?tab=purchase"],
      ["Manual Purchase", "/operation?tab=manual-purchase"],
      ["Purchase Orders", "/operation/procurement"],
      ["Receiving", "/operation?tab=receiving"],
      ["Supplier Claims", "/operation?tab=claims"],
    ]);
  });

  it("`Manual Purchase` kept its key and its address — only the word changed", () => {
    const item = purchasing.find((i) => i.key === "manual-purchase");
    expect(item?.label).toBe("Manual Purchase");
    expect(item?.pageGroup).toBe("purchasing-buy");
    expect(navItemHref(operation, item as PortalNavItem)).toBe(
      "/operation?tab=manual-purchase",
    );
  });

  it("uses the corrected Receiving workspace word", () => {
    expect(purchasing.find((i) => i.key === "receiving")?.label).toBe("Receiving");
  });

  it("SO Batch Purchase answers to BOTH its entrances, and links to one", () => {
    const item = purchasing.find((i) => i.key === "purchase");
    expect(item?.activeFor).toEqual(["tab:purchase", "path:/operation/to-order"]);
    expect(navItemHref(operation, item as PortalNavItem)).toBe("/operation?tab=purchase");
  });

  it("the six planned pages are non-controls — no route may be invented for them", () => {
    const soon = purchasing.filter((i) => i.soon);
    expect(soon.map(label)).toEqual([
      "Purchase Returns",
      "Repair Orders",
      "Display Requests",
      "Consignment Orders",
      "Consignment Returns",
      "Consignment Sale Notices",
    ]);
    for (const item of soon) {
      expect(item.path, item.key).toBeUndefined();
      expect(item.badge, item.key).toBeUndefined();
      expect(item.tab, item.key).toBeUndefined();
    }
  });

  it("the named landing page is permanent, and it is SO Batch Purchase", () => {
    expect(PURCHASING_LANDING_KEY).toBe("purchase");
    const landing = purchasing.find((i) => i.key === PURCHASING_LANDING_KEY);
    expect(landing?.label).toBe("SO Batch Purchase");
    expect(landing?.soon).toBeUndefined();
  });
});

describe("the group holding the page you are on", () => {
  it("finds the group of a live destination", () => {
    expect(activePurchasingGroup(purchasing, "receiving")).toBe("purchasing-receive");
    expect(activePurchasingGroup(purchasing, "claims")).toBe("purchasing-problems");
    expect(activePurchasingGroup(purchasing, "purchase")).toBe("purchasing-buy");
    expect(activePurchasingGroup(purchasing, "manual-purchase")).toBe("purchasing-buy");
    expect(activePurchasingGroup(purchasing, "purchase-orders")).toBe("purchasing-buy");
  });

  it("a retired key and another module's page belong to no group", () => {
    expect(activePurchasingGroup(purchasing, "purchasing-report")).toBeNull();
    expect(activePurchasingGroup(purchasing, "purchase-demands")).toBeNull();
    expect(activePurchasingGroup(purchasing, null)).toBeNull();
    expect(activePurchasingGroup(purchasing, "stock")).toBeNull();
  });
});

/**
 * PRESENTATION STATE ONLY, AND PER SIGNED-IN USER. It remembers which drawers
 * the operator likes open — never a route, a count or a business fact.
 *
 * V2 because the allowed group keys changed: the old five-group preference
 * names two drawers that no longer exist, so it is not read as final truth.
 */
describe("the remembered open state", () => {
  it("keys on the auth user id, at version v2", () => {
    expect(purchasingSidebarStorageKey("abc-123")).toBe(
      "carres:portal-sidebar:purchasing:v2:abc-123",
    );
    expect(purchasingSidebarStorageKey("abc-123")).not.toContain(":v1:");
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

  it("drops a retired group key instead of carrying a name nothing renders", () => {
    expect(
      parsePurchasingSidebarState(
        '{"moduleOpen":true,"openGroups":["purchasing-buy","purchasing-requests","purchasing-consignment","purchasing-ghost"]}',
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
