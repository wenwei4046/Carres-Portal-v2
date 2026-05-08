import { Navigate, Route, Routes } from "react-router-dom";
import SupplierSidebar from "./SupplierSidebar";
import SupplierDashboard from "./SupplierDashboard";
import SupplierIncoming from "./SupplierIncoming";
import SupplierPOs from "./SupplierPOs";
import SupplierSKU from "./SupplierSKU";

/**
 * Supplier portal shell — sidebar + main routing area.
 * Master Plan §8 + Phase 6 spec §6: 4 tabs (Dashboard / Incoming /
 * Purchase Orders / Total SKU).
 *
 * URL prefix `/supplier/*`. Mirrors FinanceApp's React-Router-driven
 * nested routing pattern so suppliers can deep-link to e.g.
 * `/supplier/pos` and have the sidebar highlight the right tab.
 */
export default function SupplierApp() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <SupplierSidebar />
      <main className="ml-[240px] flex-1 min-w-0">
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<SupplierDashboard />} />
          <Route path="incoming"  element={<SupplierIncoming />} />
          <Route path="pos"       element={<SupplierPOs />} />
          <Route path="sku"       element={<SupplierSKU />} />
          <Route path="*"         element={<Navigate to="dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}
