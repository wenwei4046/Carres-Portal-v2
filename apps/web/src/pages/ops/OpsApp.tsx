import { useState } from "react";
import OpsSidebar from "./OpsSidebar";
import OpsDashboard from "./OpsDashboard";
import OrderImport from "./OrderImport";
import OrderInbox from "./OrderInbox";
import ActivityLog from "./ActivityLog";
import StockInventory from "./StockInventory";

/**
 * Ops Panel root — sidebar + content shell mirroring LogisticsApp pattern.
 *
 * Phase 1 active tabs: dashboard / stock-transfer / stock-import /
 * stock-inventory / activity. Other items marked `disabled` in OpsSidebar and
 * land in later phases. Tab state is local for now; URL-driven routing can be
 * layered later when deep-linking matters (per LogisticsApp's nested-Routes
 * pattern for orders/procurement).
 */
export default function OpsApp() {
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="min-h-screen flex bg-base-50">
      <OpsSidebar active={tab} onChange={setTab} />
      <main className="min-w-0 flex-1">
        {tab === "dashboard" && <OpsDashboard />}
        {tab === "order-import" && <OrderImport />}
        {tab === "order-inbox" && <OrderInbox />}
        {tab === "order-pipeline" && <ComingSoon name="Order Pipeline" />}
        {tab === "stock-inventory" && <StockInventory />}
        {tab === "stock-transfer" && <ComingSoon name="Stock Transfer" />}
        {tab === "activity" && <ActivityLog />}
      </main>
    </div>
  );
}

function ComingSoon({ name }: { name: string }) {
  return (
    <div className="px-9 py-7">
      <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold mb-1.5">
        Ops Panel
      </div>
      <h1 className="text-[28px] font-display font-bold text-base-900 mb-2">{name}</h1>
      <p className="text-[13px] text-base-600 mb-6 max-w-2xl">
        This module is scaffolded in Phase 1. The functional UI ships in the
        next iteration. For now, the sidebar plumbing + role gate are in place
        so wenwei can review the shell before features land.
      </p>
      <div className="card p-9 text-center text-[12px] text-base-500 italic">
        Module under construction · Phase 1 placeholder
      </div>
    </div>
  );
}
