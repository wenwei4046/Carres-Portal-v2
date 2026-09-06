import { Navigate, Route, Routes } from "react-router-dom";
// Unified Internal Portal (2026-06-30) — shared role-aware rail.
import PortalSidebar from "@/pages/portal/PortalSidebar";
import FinanceDashboard from "./FinanceDashboard";
import FinanceAR from "./FinanceAR";
import FinanceAP from "./FinanceAP";
import PaymentRegister from "./PaymentRegister";
import InvoiceRegister from "./InvoiceRegister";
import FinanceRefunds from "./FinanceRefunds";
import FinanceRecon from "./FinanceRecon";
import FinanceReports from "./FinanceReports";
import FinanceRentalApprover from "./FinanceRentalApprover";

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
      <PortalSidebar />
      <main className="flex-1 min-w-0">
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<FinanceDashboard />} />
          <Route path="ar"        element={<FinanceAR />} />
          <Route path="ap"        element={<FinanceAP />} />
          {/* Payment MASTER §16 — Finance → Payments is the canonical
              receipt Register; the Phase-5 bucket page is retired. */}
          <Route path="payments"  element={<PaymentRegister />} />
          <Route path="invoices"  element={<InvoiceRegister />} />
          <Route path="refunds"   element={<FinanceRefunds />} />
          <Route path="recon"     element={<FinanceRecon />} />
          <Route path="reports"   element={<FinanceReports />} />
          {/* 0268 — the rent-to-own credit gate (9th tab). */}
          <Route path="rental-approver" element={<FinanceRentalApprover />} />
          <Route path="*"         element={<Navigate to="dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}
