import { Navigate, Route, Routes } from "react-router-dom";
import BDSidebar from "./BDSidebar";
import BDDashboard from "./BDDashboard";
import BDInquiries from "./BDInquiries";

/**
 * BD (Business Development) shell — Phase 8 Sprint 2.
 *
 * Visual reference: reference/proto/bd.jsx (151 LOC).
 * Routes mounted under `/bd/*` per master plan §6.
 *
 * Out of scope for V1 sprint (deferred to follow-up):
 *   - BD Dealers list + dealer detail + order detail (proto bd-dealers.jsx,
 *     430 LOC). Not in master-plan acceptance §8.
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
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}
