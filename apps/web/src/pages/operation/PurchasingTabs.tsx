import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { PO_REPORT_WORDS } from "@carres/shared";
import ModuleHeader from "./components/ModuleHeader";

/**
 * PurchasingTabs — the ONE fixed header row of the Purchasing module
 * (Shell pattern, Loo 2026-08-02: "壳画头" — the shell draws the header,
 * pages never do).
 *
 * ── THE TAB STRIP IS GONE (Jess, 2026-08-18) ────────────────────────────────
 *
 * Purchasing is approved to hold ELEVEN pages. A 44px tab strip is a good home
 * for three siblings and a bad home for eleven: it scrolls sideways, it cannot
 * show a count without shouting, and it cannot group. **The module's pages
 * moved to the SIDEBAR**, where the existing `Purchasing` rail item now expands
 * in place (`portal/portal-nav.ts` → `PortalNavChild`).
 *
 * A second left column INSIDE the module was refused: the portal rail is
 * already 232px and a purchasing page already carries a 200px right rail, so a
 * second column would spend ~430px of a 1440px screen on navigation before the
 * first column of data. One rail, not two.
 *
 * **This file stays, and keeps drawing the header** — the shell law is not
 * being touched and eight pages import it. Only the strip is deleted:
 *
 *   BEFORE  [🛍] Purchasing │ To Order  Purchase Orders  Receiving  Claims …
 *   AFTER   [🛍] Purchasing · Receiving
 *
 * The nameplate gains the page word, because with the tabs gone the header
 * would otherwise no longer say which page you are on. The active page is
 * derived from the location exactly as it always was: the Purchase Orders path
 * wins first (a nested route), otherwise the `?tab=` value selects the rest.
 * Every route and every `?tab=` value is unchanged — this moved the DOOR, not
 * the address.
 *
 * The `right` slot is the page-meta slot (freshness stamp / refresh) — it sits
 * BEFORE the global icons so the cluster order is stable on every page.
 *
 * Colour law (Loo 2026-08-02): the header is white, flat and quiet.
 *
 * UI-KIT: token classes only (no raw hex), Lucide icons, English copy.
 */

type PurchasingPage =
  | "to-order"
  | "manual-purchase"
  | "purchase-orders"
  | "receiving"
  | "claims"
  | "purchasing-report"
  | "purchasing-settings";

/** The page word printed after the nameplate. These are the SIDEBAR's own
 *  words (`portal-nav.ts`) — a page word is never invented here. */
const PAGE_WORD: Record<PurchasingPage, string> = {
  "to-order": "SO Batch Purchase",
  "manual-purchase": "Manual Purchase",
  "purchase-orders": "Purchase Orders",
  receiving: "Receiving",
  claims: "Supplier Claims",
  "purchasing-report": PO_REPORT_WORDS.tab,
  "purchasing-settings": "Settings",
};

export default function PurchasingTabs({ right }: { right?: ReactNode } = {}) {
  const location = useLocation();
  const onProcurement = location.pathname.startsWith("/operation/procurement");
  const tabParam = new URLSearchParams(location.search).get("tab");
  const active: PurchasingPage = onProcurement
    ? "purchase-orders"
    : tabParam === "manual-purchase"
      ? "manual-purchase"
      : tabParam === "receiving"
      ? "receiving"
      : tabParam === "claims"
        ? "claims"
        : tabParam === "purchasing-report"
          ? "purchasing-report"
          : tabParam === "purchasing-settings"
            ? "purchasing-settings"
            : "to-order";
  const activeLabel = PAGE_WORD[active];

  return (
    <ModuleHeader
      testId="purchasing-tabs"
      icon={ShoppingBag}
      word="Purchasing"
      page={activeLabel}
      docTitle={`${activeLabel} · Purchasing — Carres`}
      right={right}
    />
  );
}
