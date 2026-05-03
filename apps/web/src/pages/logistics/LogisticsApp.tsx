import { useState } from "react";
import LogisticsSidebar from "./LogisticsSidebar";
import LogisticsDashboard from "./LogisticsDashboard";
import LogisticsOrders from "./LogisticsOrders";
import LogisticsProcurement from "./LogisticsProcurement";
import LogisticsWarehouse from "./LogisticsWarehouse";
import LogisticsMovements from "./LogisticsMovements";

/**
 * Logistics shell — sidebar + main routing area. Mirrors the Phase 3 PrincipalApp
 * tab-state pattern (`React.useState("dashboard")`) rather than React Router
 * segments, so the proto's pixel layout (`reference/proto/logistics-*.jsx`)
 * transfers one-to-one without router config drift. M1 ships placeholder pages
 * for all 5 tabs; real content lands in M3-M5.
 */
export default function LogisticsApp() {
  const [tab, setTab] = useState<string>("dashboard");

  return (
    <div
      className="min-h-screen text-base-900 grid"
      style={{
        gridTemplateColumns: "232px 1fr",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <LogisticsSidebar active={tab} onChange={setTab} />
      <main className="min-w-0 overflow-auto bg-base-50">
        {tab === "dashboard" && <LogisticsDashboard setTab={setTab} />}
        {tab === "orders" && <LogisticsOrders />}
        {tab === "procurement" && <LogisticsProcurement />}
        {tab === "warehouse" && <LogisticsWarehouse />}
        {tab === "movements" && <LogisticsMovements />}
      </main>
    </div>
  );
}
