import { Navigate, Route, Routes } from "react-router-dom";
// Unified Internal Portal (2026-06-30) — shared role-aware rail.
import PortalSidebar from "@/pages/portal/PortalSidebar";
import { useAuth } from "@/lib/auth";
import FinanceDashboard from "./FinanceDashboard";
import FinanceAR from "./FinanceAR";
import FinanceAP from "./FinanceAP";
import PaymentRegister from "./PaymentRegister";
import InvoiceRegister from "./InvoiceRegister";
import FinanceRefunds from "./FinanceRefunds";
import FinanceReports from "./FinanceReports";
import FinancePaymentReport from "./FinancePaymentReport";
import FinanceRentalApprover from "./FinanceRentalApprover";

/**
 * Finance (HQ Internal) shell — sidebar + main routing area.
 * Phase 5 born with 8 tabs; the Recon workspace retired 2026-09-07 under
 * payment/MASTER.md §13 (Bank Matching is an intentional reject — its data
 * and API remain, the page and navigation left).
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
  // Payment MASTER §12 — operation staff (Payment Duty, Delivery Operation)
  // reach ONLY the Payments and Invoices destinations here; every finance-only
  // page bounces them to Payments instead of rendering finance controls.
  const role = useAuth((s) => s.role);
  const financeOnly = (page: React.ReactNode) =>
    role === "operation" ? <Navigate to="/finance/payments" replace /> : page;
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <PortalSidebar />
      <main className="flex-1 min-w-0">
        <Routes>
          <Route index element={role === "operation"
            ? <Navigate to="payments" replace /> : <Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={financeOnly(<FinanceDashboard />)} />
          <Route path="ar"        element={financeOnly(<FinanceAR />)} />
          <Route path="ap"        element={financeOnly(<FinanceAP />)} />
          {/* Payment MASTER §16 — Finance → Payments is the canonical
              receipt Register; the Phase-5 bucket page is retired. */}
          <Route path="payments"  element={<PaymentRegister />} />
          <Route path="invoices"  element={<InvoiceRegister />} />
          <Route path="refunds"   element={financeOnly(<FinanceRefunds />)} />
          {/* payment/MASTER.md §13 — the Bank Matching workspace is an
              intentional reject; the route retired 2026-09-07 (approved
              scope). The recon DATA and its API routes remain; an old link
              lands on Payments instead of a dead page. */}
          <Route path="recon"     element={<Navigate to="/finance/payments" replace />} />
          <Route path="reports"   element={financeOnly(<FinanceReports />)} />
          {/* Payment MASTER §16 — Reports → Payment: the six approved
              read-only listings over the same register wires. */}
          <Route path="reports/payment" element={financeOnly(<FinancePaymentReport />)} />
          {/* 0268 — the rent-to-own credit gate (9th tab). */}
          <Route path="rental-approver" element={financeOnly(<FinanceRentalApprover />)} />
          <Route path="*"         element={<Navigate to="." replace />} />
        </Routes>
      </main>
    </div>
  );
}
