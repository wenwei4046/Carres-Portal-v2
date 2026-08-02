import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ClipboardCheck,
  ShoppingCart,
  PackageCheck,
  AlertTriangle,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { usePurchasingSettings } from "@/lib/queries";
import { TopBarIcons } from "./components/GlobalTopBar";

/**
 * PurchasingTabs — the ONE fixed header row of the Purchasing module
 * (Shell pattern, Loo 2026-08-02: "壳画头" — the shell draws the header,
 * pages never do).
 *
 * ONE white 44px row, never scrolls, and it is the WHOLE header:
 *   module word · tabs · (page meta slot) · global icons (🔔 ❓ ⚙)
 *
 * Pages render <PurchasingTabs /> as their first child and draw NO header of
 * their own — no breadcrumb strip, no H1, no TopBarIcons. That is the point:
 * a page structurally cannot forget the header, because it never draws one.
 *
 * Colour law (Loo 2026-08-02): the header is white, flat and quiet — the only
 * things allowed to speak are the blue active underline and (later) red count
 * badges. No brand colour above the content, ever, except the logo.
 *
 * Tabs:
 *   • To Order        → `/operation?tab=purchase`   (OperationToOrder)
 *   • Purchase Orders → `/operation/procurement`    (TabbedProcurementShell)
 *   • Receiving       → `/operation?tab=receiving`  (OperationReceiving)
 *   • Claims          → `/operation?tab=claims`     (OperationSupplierClaims)
 *   • Settings        → manager-only (server-gated)
 *
 * The active tab is derived from the current location: the Purchase Orders path
 * wins first (a nested route), otherwise the `?tab=` value selects the rest.
 *
 * The `right` slot is the page-meta slot (freshness stamp / refresh) — it sits
 * BEFORE the global icons so the cluster order is stable on every tab.
 *
 * UI-KIT: token classes only (no raw hex), Lucide icons, English copy.
 */

type PurchasingTab =
  | "to-order"
  | "purchase-orders"
  | "receiving"
  | "claims"
  | "purchasing-settings";

interface TabDef {
  key: PurchasingTab;
  label: string;
  to: string;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { key: "to-order", label: "To Order", to: "/operation?tab=purchase", icon: ClipboardCheck },
  { key: "purchase-orders", label: "Purchase Orders", to: "/operation/procurement", icon: ShoppingCart },
  { key: "receiving", label: "Receiving", to: "/operation?tab=receiving", icon: PackageCheck },
  { key: "claims", label: "Claims", to: "/operation?tab=claims", icon: AlertTriangle },
  // P1 — the fifth tab of the working flow's §1. Manager-only, so it renders
  // only for a caller the server says may edit; the RPC gate is what actually
  // protects the numbers.
  { key: "purchasing-settings", label: "Settings", to: "/operation?tab=purchasing-settings", icon: Settings },
];

export default function PurchasingTabs({ right }: { right?: ReactNode } = {}) {
  const location = useLocation();
  const settingsQ = usePurchasingSettings();
  const onProcurement = location.pathname.startsWith("/operation/procurement");
  const tabParam = new URLSearchParams(location.search).get("tab");
  const active: PurchasingTab = onProcurement
    ? "purchase-orders"
    : tabParam === "receiving"
      ? "receiving"
      : tabParam === "claims"
        ? "claims"
        : tabParam === "purchasing-settings"
          ? "purchasing-settings"
          : "to-order";
  const canEditSettings = settingsQ.data?.canEdit ?? false;
  const tabs = TABS.filter((t) => t.key !== "purchasing-settings" || canEditSettings);

  return (
    <div
      className="shrink-0 bg-white border-b border-base-200 px-6"
      role="tablist"
      aria-label="Purchasing"
      data-testid="purchasing-tabs"
    >
      <div className="flex items-center gap-4 h-11">
        {/* Module word — a coordinate, not a title. Small, grey, never bold. */}
        <span
          className="shrink-0 text-meta font-medium text-base-500 select-none"
          data-testid="purchasing-module-word"
        >
          Purchasing
        </span>
        <div className="flex gap-1 h-full min-w-0 overflow-x-auto">
          {tabs.map((t) => {
            const isActive = t.key === active;
            return (
              <Link
                key={t.key}
                to={t.to}
                role="tab"
                aria-selected={isActive}
                data-testid={`purchasing-tab-${t.key}`}
                className={[
                  "relative flex items-center gap-1.5 px-4 h-full whitespace-nowrap text-body transition-colors border-b-2 -mb-px",
                  isActive
                    ? "border-kit-blue-9 text-base-900 font-semibold"
                    : "border-transparent text-base-600 font-medium hover:text-base-900",
                ].join(" ")}
              >
                <t.icon
                  size={14}
                  strokeWidth={2}
                  className={isActive ? "text-kit-blue-9" : "text-base-400"}
                />
                {t.label}
              </Link>
            );
          })}
        </div>
        <div className="flex-1" />
        {right && (
          <div
            className="shrink-0 flex items-center gap-2"
            data-testid="purchasing-tabs-right"
          >
            {right}
          </div>
        )}
        {/* Global icons — the shell's, on every tab, so the Bell never
            disappears when the operator switches pages. */}
        <TopBarIcons />
      </div>
    </div>
  );
}
