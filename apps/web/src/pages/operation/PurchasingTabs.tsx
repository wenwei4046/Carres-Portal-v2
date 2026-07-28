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

/**
 * PurchasingTabs — the shared top tab bar for the merged Purchasing module
 * (NAV/IA merge 2026-07-21).
 *
 * The three procurement rails used to be three separate sidebar items; they are
 * now ONE "Purchasing" sidebar entry. This bar renders at the top of all three
 * pages (`OperationPurchase` / `TabbedProcurementShell` / `OperationReceiving`)
 * so switching between them feels like one module with three tabs:
 *   • To Order        → `/operation?tab=purchase`   (OperationPurchase)
 *   • Purchase Orders → `/operation/procurement`    (TabbedProcurementShell)
 *   • Receiving       → `/operation?tab=receiving`  (OperationReceiving)
 *   • Claims          → `/operation?tab=claims`     (OperationSupplierClaims)
 *
 * R2 (2026-07-27) added Claims as a SIBLING tab rather than a sidebar entry —
 * the receiving & claim queue doc's rule is "no new menu item", and a claim is
 * what a receiving produces, so it belongs next to it.
 *
 * The active tab is derived from the current location: the Purchase Orders path
 * wins first (a nested route), otherwise the `?tab=` value selects To Order vs
 * Receiving. It links via React Router (Link) exactly the way the sidebar +
 * OperationApp navigate between these routes.
 *
 * A `right` slot renders a right-aligned cluster on the tab bar itself — used
 * by pages under this bar to host the freshness stamp + refresh icon that
 * would otherwise live in the ListPageShell header. This is how module-tab
 * pages avoid duplicating the tab as a breadcrumb / big title (Jess 2026-07-22,
 * UI-KIT §A0 "Module-tab law").
 *
 * UI-KIT v4: token classes only (no raw hex), Lucide icons, English copy.
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
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1">
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
                  "relative flex items-center gap-1.5 px-4 py-3 text-[13px] transition-colors border-b-2 -mb-px",
                  isActive
                    ? "border-primary text-base-900 font-semibold"
                    : "border-transparent text-base-600 font-medium hover:text-base-900",
                ].join(" ")}
              >
                <t.icon
                  size={14}
                  strokeWidth={2}
                  className={isActive ? "text-primary" : "text-base-400"}
                />
                {t.label}
              </Link>
            );
          })}
        </div>
        {right && (
          <div
            className="shrink-0 flex items-center gap-2 pr-1"
            data-testid="purchasing-tabs-right"
          >
            {right}
          </div>
        )}
      </div>
    </div>
  );
}
