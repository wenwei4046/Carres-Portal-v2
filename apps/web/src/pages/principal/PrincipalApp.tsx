import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import PrincipalOrders from "./PrincipalOrders";
// 2026-05-19 — Suppliers / Stock moved to Operation sidebar. Orders + a place-
// order POS (on behalf of a picked dealer) re-added to Principal 2026-06-25.
import ProductMaintenancePage from "@/pages/catalog/ProductMaintenancePage";

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
        {tab === "pos" && <DealerPos onExit={() => setTab("orders")} />}
        {/* MAINTAIN → New Order — raw SO creation (no POS gates). */}
        {tab === "new-order" && <PrincipalNewOrder setTab={setTab} />}
        {tab === "orders" && <PrincipalOrders />}
        {tab === "approvals" && <PrincipalApprovals />}
        {tab === "dealers" && <PrincipalDealers />}
        {tab === "partners" && <PrincipalPartners />}
        {tab === "catalog" && <ProductMaintenancePage isPrincipal />}
        {tab === "accounts" && <PrincipalAccounts />}
        {tab === "audit" && <PrincipalAudit />}
      </main>
    </div>
  );
}
