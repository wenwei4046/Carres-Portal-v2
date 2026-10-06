import { describe, it, expect } from "vitest";
import {
  PORTAL_MODULES,
  PORTAL_NAV,
  navBlocks,
  navItemHref,
  visibleItems,
} from "./portal-nav";

/**
 * ⭐ THE APPROVED SALES ORDERS TREE — Jess, owner ruling 2026-09-23
 * (`docs/orders/MASTER.md` "Portal navigation", `docs/ui/MASTER.md`, and the
 * COPY-STANDARD table "Sales Orders navigation").
 *
 *     Sales Orders
 *     ├─ Outright Sales
 *     └─ Subscription
 *
 * This file guards the MODEL — the words, the addresses and the one-place rule
 * — so a later rail refactor cannot quietly re-open a settled ruling.
 * `PortalSidebar.test.tsx` guards how it draws.
 */

const OPERATIONS = PORTAL_NAV.find((g) => g.area === "operation")!;
const ADMIN = PORTAL_NAV.find((g) => g.area === "principal")!;

describe("the approved Sales Orders navigation", () => {
  it("the module row is `Sales Orders`", () => {
    expect(PORTAL_MODULES.find((m) => m.section === "Sales")?.label).toBe(
      "Sales Orders",
    );
  });

  it("holds exactly two children, in the approved order", () => {
    const block = navBlocks(OPERATIONS, "operation").find(
      (b) => b.kind === "module" && b.module.section === "Sales",
    );
    expect(block?.kind).toBe("module");
    const pages = block!.kind === "module" ? block!.pages : [];
    expect(pages.map((p) => p.label)).toEqual(["Outright Sales", "Subscription"]);
  });

  /* NEITHER ADDRESS MOVED. "Menu removal does not delete orders, history,
     documents or valid existing deep links", and a rename is not a relocation:
     every bookmark, every in-page link and every ⌘K jump still lands. */
  it("keeps both destinations at the addresses they already had", () => {
    const byKey = Object.fromEntries(
      visibleItems(OPERATIONS, "operation").map((i) => [i.key, i]),
    );
    expect(navItemHref(OPERATIONS, byKey.orders)).toBe("/operation/orders");
    expect(navItemHref(OPERATIONS, byKey.rental)).toBe("/operation?tab=rental");
  });

  /* `Purchase` is rejected BY NAME in COPY-STANDARD for this entry — it reads
     as the Purchasing module, which stays separate. */
  it("never calls the outright child `Purchase`", () => {
    const sales = visibleItems(OPERATIONS, "operation").filter(
      (i) => i.section === "Sales",
    );
    expect(sales.map((i) => i.label)).not.toContain("Purchase");
    for (const item of sales) expect(item.label).not.toMatch(/Purchase/);
  });

  /* A door, never a duplicate (Law C). The Subscription row MOVED out of
     Customer Care; a copy would be two rows the rail lights at once. */
  it("Subscription exists once, and only under Sales Orders", () => {
    const rental = visibleItems(OPERATIONS, "operation").filter(
      (i) => i.key === "rental",
    );
    expect(rental).toHaveLength(1);
    expect(rental[0].section).toBe("Sales");
    expect(rental[0].label).toBe("Subscription");
  });

  it("Customer Care keeps Service Cases and Guarantees", () => {
    const care = visibleItems(OPERATIONS, "operation").filter(
      (i) => i.section === "Customer Care",
    );
    expect(care.map((i) => i.label)).toEqual(["Service Cases", "Guarantees"]);
  });

  /* THE MENU ROW IS REMOVED; THE PAGE IS NOT. `/operation/old-orders` stays
     mounted (see `OperationApp.test.tsx`) and `CaseOrderLink` still deep-links
     into it. The rail simply no longer offers it. */
  it("no rail row points at the legacy orders page any more", () => {
    for (const group of PORTAL_NAV) {
      for (const item of group.items) {
        expect(item.key).not.toBe("old-orders");
        expect(item.path ?? "").not.toContain("old-orders");
      }
    }
  });

  /* ONE DESTINATION, ONE WORD. A principal stands in Operations AND Admin at
     once, and both rows address `/operation/orders`. */
  it("the Admin jump to the same register says the same word", () => {
    const admin = ADMIN.items.find((i) => i.path === "/operation/orders");
    expect(admin?.label).toBe("Outright Sales");
  });

  /* The shared parent is NAVIGATION ONLY. Purchasing keeps its own module, and
     nothing about it moves under Sales Orders. */
  it("Purchasing stays a separate module", () => {
    expect(PORTAL_MODULES.some((m) => m.section === "Purchasing")).toBe(true);
    const sales = visibleItems(OPERATIONS, "operation").filter(
      (i) => i.section === "Sales",
    );
    expect(sales.some((i) => i.pageGroup)).toBe(false);
  });
});
