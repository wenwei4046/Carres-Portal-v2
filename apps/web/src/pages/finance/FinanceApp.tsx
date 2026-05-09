import { Navigate, Route, Routes } from "react-router-dom";
import FinanceSidebar from "./FinanceSidebar";
import FinanceDashboard from "./FinanceDashboard";
import FinanceAR from "./FinanceAR";
import FinanceAP from "./FinanceAP";
import FinancePayments from "./FinancePayments";
import FinanceInvoices from "./FinanceInvoices";
import FinanceRefunds from "./FinanceRefunds";
import FinanceRecon from "./FinanceRecon";
import FinanceReports from "./FinanceReports";

/**
 * Finance (HQ Internal) shell — sidebar + main routing area.
 * Master Plan §6 + Phase 5 spec §4.1: 8 tabs (Dashboard / AR / AP /
 * Payments / Invoices / Refunds / Recon / Reports).
 *
 * Phase 5 100% — all 8 pages live (Chunk A + Chunk B + Chunk C). The
 * ChunkBCStub component is no longer used; preserved for the (currently
 * empty) future deferral surface in case a Phase 6+ page lands here as
 * a stub before its real implementation.
 *
 * URL prefix `/finance/*`. Mirrors PartnerApp's React-Router-driven
 * nested routing pattern so finance staff can deep-link to e.g.
 * `/finance/ar` and have the sidebar highlight the right tab.
 */
export default function FinanceApp() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <FinanceSidebar />
      <main className="ml-[240px] flex-1 min-w-0">
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<FinanceDashboard />} />
          <Route path="ar"        element={<FinanceAR />} />
          <Route path="ap"        element={<FinanceAP />} />
          <Route path="payments"  element={<FinancePayments />} />
          <Route path="invoices"  element={<FinanceInvoices />} />
          <Route path="refunds"   element={<FinanceRefunds />} />
          <Route path="recon"     element={<FinanceRecon />} />
          <Route path="reports"   element={<FinanceReports />} />
          <Route path="*"         element={<Navigate to="dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}
