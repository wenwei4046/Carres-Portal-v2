/**
 * Every `?tab=` value OperationApp draws a page for (2026-09-21).
 *
 * The tab branch renders `{tab === "x" && <Page />}` once per page, so a value
 * that matches none of them rendered NOTHING: a mistyped or retired address
 * such as `/operation?tab=purchase-orders` showed an empty main pane with no
 * way out. A value outside this set now answers `Page not found.` instead.
 *
 * A page that joins the tab branch joins this list in the same commit —
 * `operation-tabs.test.ts` holds the two together.
 */
export const OPERATION_TABS: ReadonlySet<string> = new Set([
  "dashboard",
  "work",
  "staff-duties",
  "warehouse",
  "movements",
  "receiving",
  "receiving-report",
  "delivery-report",
  "claims",
  "purchase-returns",
  "purchasing-settings",
  "purchasing-report",
  "delivery",
  "payments",
  "rental",
  "purchase",
  "purchase-demands",
  "manual-purchase",
  "catalog",
  "op-catalog",
  "stock-onhand",
  "warehouse-arrival-schedule",
  "warehouse-pickup-schedule",
  "warehouse-inbound",
  "warehouse-outbound",
  "arrival-source",
  "stock-plan",
  "stock",
  "all-orders",
  "suppliers",
  "supplier-items",
  "ops-import",
  "ops-inbox",
  "ops-ready",
  "ops-reserved",
  "ops-repair",
  "ops-inventory",
  "service-notes",
  "guarantees",
  /* Path-driven sections — `changeTab` navigates to their own route, and the
     tab state can hold the word for a moment on the way there. */
  "procurement",
  "orders",
]);

export function isOperationTab(tab: string): boolean {
  return OPERATION_TABS.has(tab);
}
