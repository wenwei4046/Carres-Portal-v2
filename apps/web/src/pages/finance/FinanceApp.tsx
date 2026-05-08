import { Navigate, Route, Routes } from "react-router-dom";
import FinanceSidebar from "./FinanceSidebar";
import FinanceDashboard from "./FinanceDashboard";

/**
 * Finance (HQ Internal) shell — sidebar + main routing area.
 * Master Plan §6 + Phase 5 spec §4.1: 8 tabs (Dashboard / AR / AP /
 * Payments / Invoices / Refunds / Recon / Reports).
 *
 * Chunk A pages mounted: Dashboard. The rest are placeholder routes
 * that render a "Coming in Chunk B/C" stub until those pages land.
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
          <Route path="ar"        element={<ChunkAStub label="AR · Receivables" />} />
          <Route path="ap"        element={<ChunkAStub label="AP · Payables" />} />
          <Route path="payments"  element={<ChunkAStub label="Order Payments" />} />
          <Route path="invoices"  element={<ChunkAStub label="Invoices" />} />
          <Route path="refunds"   element={<ChunkBCStub label="Refunds & Credits" chunk="C" />} />
          <Route path="recon"     element={<ChunkBCStub label="Reconciliation" chunk="B" />} />
          <Route path="reports"   element={<ChunkBCStub label="Reports" chunk="B" />} />
          <Route path="*"         element={<Navigate to="dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function ChunkAStub({ label }: { label: string }) {
  return (
    <div className="p-9 max-w-[1400px] mx-auto">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        Finance · Phase 5
      </div>
      <h1 className="font-display text-[32px] mt-1.5 mb-1 text-foreground tracking-[-0.02em]">
        {label}
      </h1>
      <div className="text-[13px] text-muted-foreground">
        Page lands later in Chunk A · server-side hooks ready in queries.ts
      </div>
      <div className="mt-7 p-12 text-center border-[1.5px] border-dashed border-border rounded-md bg-card/40 text-[13px] text-muted-foreground">
        Component skeleton coming next
      </div>
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
