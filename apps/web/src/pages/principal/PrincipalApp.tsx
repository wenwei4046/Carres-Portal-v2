import { useState } from "react";
import PrincipalSidebar from "./PrincipalSidebar";
import PrincipalDashboard from "./PrincipalDashboard";
import PrincipalApprovals from "./PrincipalApprovals";
import PrincipalDealers from "./PrincipalDealers";
import PrincipalPartners from "./PrincipalPartners";
import PrincipalAccounts from "./PrincipalAccounts";
import PrincipalAudit from "./PrincipalAudit";
// 2026-05-19 — Suppliers / Orders / Stock moved to Operation sidebar.
import ProductMaintenancePage from "@/pages/catalog/ProductMaintenancePage";
import { usePrincipalDashboard } from "@/lib/queries";

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
  const { data } = usePrincipalDashboard();
  const pendingCount = data?.kpis?.pending_approvals ?? 0;

  return (
    <div
      className="min-h-screen text-base-900 grid"
      style={{
        gridTemplateColumns: "232px 1fr",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <PrincipalSidebar
        active={tab}
        onChange={setTab}
        pendingCount={pendingCount}
      />
      <main className="min-w-0 overflow-auto bg-base-50">
        {tab === "dashboard" && <PrincipalDashboard setTab={setTab} />}
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
