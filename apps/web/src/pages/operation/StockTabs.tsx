import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import ModuleHeader from "./components/ModuleHeader";

/**
 * StockTabs — the ONE fixed header row of the Warehouse module
 * (Shell pattern, Loo 2026-08-02: "壳画头" — the shell draws the header,
 * pages never do).
 *
 * ── THE TAB STRIP IS GONE (CARD-2026-08-19-warehouse-rail) ──────────────────
 *
 * The Warehouse Blueprint (item 13) gives the module its pages in the SIDEBAR
 * under a WAREHOUSE heading, exactly as Purchasing's strip died on 2026-08-18:
 * a tab strip cannot grow to the blueprint's map (Transfers · Counts join it),
 * and the rail already lists every approved page from day one.
 *
 * **This file stays, and keeps drawing the header** — the shell law is not
 * being touched and all three pages import it. Only the strip is deleted.
 * The header prints the page's own name in the destination format
 * (`ModuleHeader destinationHeader`, owner ruling 2026-08-15) — the sidebar
 * heading already says WAREHOUSE, so no `Warehouse ·` prefix is drawn.
 *
 * The active page is derived from the `?tab=` value exactly as before; every
 * route and every `?tab=` value is unchanged — this moved the DOOR, not the
 * address.
 *
 * ── DE-NAVIGATED LEGACY PAGES (CARD-2026-09-01-warehouse-01-sidebar) ────────
 * The owner-approved 2026-09-01 Blueprint reduced the Warehouse map to
 * `Dashboard · Inbound · Inventory · Outbound`; `Ready stock` and `In & out`
 * left the rail. Their ROUTES stay alive so a direct URL still lands, and this
 * header keeps drawing their words until each page's capabilities are
 * relocated (Stock MASTER §13 names the scopes). The Inventory Register draws
 * its own header (`WarehouseStockRegister`) and does not use this file.
 */

type StockPage = "on-hand" | "ready" | "in-out";

/** The page word printed as the destination header. These are the SIDEBAR's
 *  own words (`portal-nav.ts`) — a page word is never invented here. */
const PAGE_WORD: Record<StockPage, string> = {
  "on-hand": "On hand",
  ready: "Ready stock",
  "in-out": "In & out",
};

export default function StockTabs({ right }: { right?: ReactNode } = {}) {
  const location = useLocation();
  const tabParam = new URLSearchParams(location.search).get("tab");
  const active: StockPage =
    tabParam === "movements" ? "in-out" : tabParam === "stock-plan" ? "ready" : "on-hand";
  const activeLabel = PAGE_WORD[active];

  return (
    <ModuleHeader
      testId="stock-tabs"
      word={activeLabel}
      docTitle={`${activeLabel} · Warehouse — Carres`}
      destinationHeader
      right={right}
    />
  );
}
