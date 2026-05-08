import { Navigate, Route, Routes } from "react-router-dom";
import FinanceSidebar from "./FinanceSidebar";
import FinanceDashboard from "./FinanceDashboard";
import FinanceAR from "./FinanceAR";
import FinanceAP from "./FinanceAP";
import FinancePayments from "./FinancePayments";
import FinanceInvoices from "./FinanceInvoices";
import FinanceRecon from "./FinanceRecon";
import FinanceReports from "./FinanceReports";

/**
 * Finance (HQ Internal) shell — sidebar + main routing area.
 * Master Plan §6 + Phase 5 spec §4.1: 8 tabs (Dashboard / AR / AP /
 * Payments / Invoices / Refunds / Recon / Reports).
 *
 * 7 of 8 pages live (Chunk A + Chunk B). Refunds is the last stub —
 * lands in Chunk C alongside server-side invoice PDF (Q7=A locked).
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
          <Route path="refunds"   element={<ChunkBCStub label="Refunds & Credits" chunk="C" />} />
          <Route path="recon"     element={<FinanceRecon />} />
          <Route path="reports"   element={<FinanceReports />} />
          <Route path="*"         element={<Navigate to="dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function ChunkBCStub({ label, chunk }: { label: string; chunk: "B" | "C" }) {
  return (
    <div className="p-9 max-w-[1400px] mx-auto">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        Finance · Phase 5
      </div>
      <h1 className="font-display text-[32px] mt-1.5 mb-1 text-foreground tracking-[-0.02em]">
        {label}
      </h1>
      <div className="text-[13px] text-muted-foreground">
        Coming in Chunk {chunk}.
      </div>
    </div>
  );
}
