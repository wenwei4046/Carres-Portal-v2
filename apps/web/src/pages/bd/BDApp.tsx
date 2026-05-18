import { Navigate, Route, Routes } from "react-router-dom";
import BDSidebar from "./BDSidebar";
import BDDashboard from "./BDDashboard";
import BDInquiries from "./BDInquiries";
import BDDealers from "./BDDealers";
import BDDealerDetail from "./BDDealerDetail";

/**
 * BD (Business Development) shell — Phase 8 Sprint 2 + Phase 10 drill-down.
 *
 * Visual reference: reference/proto/bd.jsx (151 LOC).
 * Routes mounted under `/bd/*` per master plan §6.
 *
 * Phase 10 adds the proto's drill-down chain (was Phase-8-deferred):
 *   /bd/dealers          → BDDealers     (list)
 *   /bd/dealers/:dealerId → BDDealerDetail (dealer info + orders table;
 *                          row click opens BDOrderModal in-place)
 *
 * Still deferred:
 *   - Products tab (proto reuses DealerProducts). Add when Loo asks.
 *   - Mobile (proto bd-mobile.jsx). Phase 9 mobile sweep.
 */
export default function BDApp() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <BDSidebar />
      <main className="ml-[220px] flex-1 min-w-0">
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<BDDashboard />} />
          <Route path="inquiries" element={<BDInquiries />} />
          <Route path="dealers" element={<BDDealers />} />
          <Route path="dealers/:dealerId" element={<BDDealerDetail />} />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}
