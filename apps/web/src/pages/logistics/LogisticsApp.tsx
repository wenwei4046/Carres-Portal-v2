import { useState } from "react";
import LogisticsSidebar from "./LogisticsSidebar";
import LogisticsDashboard from "./LogisticsDashboard";
import LogisticsOrders from "./LogisticsOrders";
import LogisticsProcurement from "./LogisticsProcurement";
import LogisticsWarehouse from "./LogisticsWarehouse";
import LogisticsMovements from "./LogisticsMovements";
import type { MovementsFilters } from "@/lib/queries";

/**
 * Logistics shell — sidebar + main routing area. Mirrors the Phase 3 PrincipalApp
 * tab-state pattern (`React.useState("dashboard")`) rather than React Router
 * segments, so the proto's pixel layout (`reference/proto/logistics-*.jsx`)
 * transfers one-to-one without router config drift.
 *
 * Cross-tab prefill (M5.5): LogisticsWarehouse → LogisticsMovements carries
 * `{ sku?, warehouseId? }` through `movementsPrefill` so the user lands on
 * the movement log already filtered to the row they clicked. Mirrors the
 * proto's `movementsPrefill` state in `reference/proto/logistics.jsx` line 15.
 */
export default function LogisticsApp() {
  const [tab, setTab] = useState<string>("dashboard");
  const [movementsPrefill, setMovementsPrefill] = useState<
    Partial<MovementsFilters> | undefined
  >(undefined);

  function goMovements(prefill?: Partial<MovementsFilters>) {
    setMovementsPrefill(prefill);
    setTab("movements");
  }

  return (
    <div
      className="min-h-screen text-base-900 grid"
      style={{
        gridTemplateColumns: "232px 1fr",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <LogisticsSidebar
        active={tab}
        onChange={(t) => {
          // Switching away from the movements tab via the sidebar discards
          // any pending prefill so re-entering the tab starts fresh.
          if (t !== "movements") setMovementsPrefill(undefined);
          setTab(t);
        }}
      />
      <main className="min-w-0 overflow-auto bg-base-50">
        {tab === "dashboard" && <LogisticsDashboard setTab={setTab} />}
        {tab === "orders" && <LogisticsOrders />}
        {tab === "procurement" && <LogisticsProcurement />}
        {tab === "warehouse" && (
          <LogisticsWarehouse setTab={setTab} goMovements={goMovements} />
        )}
        {tab === "movements" && (
          <LogisticsMovements
            initialFilters={movementsPrefill}
            clearInitialFilters={() => setMovementsPrefill(undefined)}
            setTab={setTab}
          />
        )}
      </main>
    </div>
  );
}
