import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
// Unified Internal Portal (2026-06-30) — shared role-aware rail.
import PortalSidebar from "@/pages/portal/PortalSidebar";
import PrincipalDashboard from "./PrincipalDashboard";
import PrincipalApprovals from "./PrincipalApprovals";
import PrincipalDealers from "./PrincipalDealers";
import PrincipalPartners from "./PrincipalPartners";
import PrincipalAccounts from "./PrincipalAccounts";
import PrincipalAudit from "./PrincipalAudit";
import DealerPos from "@/pages/dealer/DealerPos";
import PrincipalNewOrder from "./PrincipalNewOrder";
import PrincipalSalesAnalysis from "./PrincipalSalesAnalysis";
// 2026-05-19 — Suppliers / Stock moved to Operation sidebar. A place-order POS
// (on behalf of a picked dealer) re-added to Principal 2026-06-25. The trace-
// only PrincipalOrders page was removed 2026-07-16 — order views live in the
// Operations area (/operation/orders).
import ProductMaintenancePage from "@/pages/catalog/ProductMaintenancePage";
import RentalSettingPage from "@/pages/rental/RentalSettingPage";

/**
 * Principal shell — sidebar + main routing area. Mirrors the proto's tab-state
 * pattern (`React.useState("dashboard")`) rather than React Router segments,
 * because the sidebar in the proto is a plain `setTab(k)` button list, not a
 * NavLink. Keeping the same model means the proto's pixel layout transfers
 * one-to-one with no router config drift.
 *
 * The dashboard query is read at this level too so we can hydrate the
 * pending-approvals badge in the sidebar from the same fetch the dashboard
 * page uses (cache hit, no second round-trip).
 */
export default function PrincipalApp() {
  const [tab, setTab] = useState<string>("dashboard");
  const navigate = useNavigate();

  // Unified Internal Portal — PortalSidebar links to `/principal?tab=<key>`.
  // Sync the inbound param into local tab state (in-page callbacks like the
  // dashboard tiles' setTab still drive `tab` directly without a URL write).
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");
  useEffect(() => {
    if (urlTab) setTab(urlTab);
  }, [urlTab]);

  return (
    <div
      className="min-h-screen text-base-900 grid"
      style={{
        // `auto` tracks PortalSidebar's intrinsic width (232px ⇄ 60px collapsed).
        gridTemplateColumns: "auto 1fr",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <PortalSidebar />
      <main className="min-w-0 overflow-auto bg-base-50">
        {tab === "dashboard" && <PrincipalDashboard setTab={setTab} />}
        {/* POS-parity (2990s) — "New order" opens the POS catalog DIRECTLY; the
            principal picks the acting dealer in-flow at the CUSTOMER step (the
            old pre-pick page is gone). */}
        {tab === "pos" && <DealerPos onExit={() => navigate("/operation/orders")} />}
        {/* MAINTAIN → New Order — raw SO creation (no POS gates). */}
        {tab === "new-order" && <PrincipalNewOrder />}
        {/* MAINTAIN → Sales analysis — overview / customer data / products. */}
        {tab === "sales-analysis" && <PrincipalSalesAnalysis />}
        {/* MAINTAIN → Order Entry MOVED AGAIN (orders/MASTER.md §11): the
            Sales Order module owns its Order Entry fields and payment
            methods, and they are edited in the one Settings Workspace at
            `Sales Order Settings`. Keeping a second address for the same
            editor is how two screens come to disagree, so the old tab
            forwards instead of rendering a duplicate. */}
        {tab === "order-entry" && <Navigate to="/operation/settings/sales-orders" replace />}
        {tab === "approvals" && <PrincipalApprovals />}
        {/* Two doors onto the same store roster, split by `dealers.channel`
            (Loo 2026-07-19): external resellers vs Carres' own showrooms. */}
        {tab === "dealers" && <PrincipalDealers channel="dealer" />}
        {tab === "showrooms" && <PrincipalDealers channel="showroom" />}
        {tab === "partners" && <PrincipalPartners />}
        {/* Catalog split (Loo 2026-07-25): THIS is the selling catalog's home —
            the Admin "Product & Maintenance" entry (retail / POS prices, all 8
            tabs). Costing lives in Operations as the Operation Catalog. */}
        {tab === "catalog" && <ProductMaintenancePage isPrincipal />}
        {/* 0264 (Loo 2026-07-26) — Rental setting: its own Admin door. */}
        {tab === "rental-setting" && <RentalSettingPage isPrincipal />}
        {tab === "accounts" && <PrincipalAccounts />}
        {tab === "audit" && <PrincipalAudit />}
      </main>
    </div>
  );
}
