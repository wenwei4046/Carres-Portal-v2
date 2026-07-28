import { Navigate, Route, Routes } from "react-router-dom";
import WarehouseSidebar from "./WarehouseSidebar";
import WarehouseIncoming from "./WarehouseIncoming";
import WarehouseMyReceipts from "./WarehouseMyReceipts";

/**
 * Warehouse portal shell — R6 of the receiving & claim queue (Jess 2026-07-27).
 *
 * The THIRD external portal, built exactly like the supplier and partner ones:
 * its own sidebar, its own routes, and a surface that stops where the card says
 * it stops. TWO tabs, and there is no third to add later without a card:
 *
 *   Incoming    — POs coming to THIS warehouse + the receiving form
 *   My receiving — what we filed, and what Carres did with it
 *
 * What is deliberately absent: prices, stock adjustments, settings, deletes,
 * other warehouses. Not hidden — unreachable. Every read and write behind this
 * shell is a SECURITY DEFINER RPC scoped by `app_warehouse_id()`, and 0302
 * asserts that no table policy anywhere names the warehouse role.
 */
export default function WarehouseApp() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <WarehouseSidebar />
      <main className="ml-[240px] flex-1 min-w-0">
        <Routes>
          <Route index element={<Navigate to="incoming" replace />} />
          <Route path="incoming" element={<WarehouseIncoming />} />
          <Route path="receipts" element={<WarehouseMyReceipts />} />
          <Route path="*" element={<Navigate to="incoming" replace />} />
        </Routes>
      </main>
    </div>
  );
}
