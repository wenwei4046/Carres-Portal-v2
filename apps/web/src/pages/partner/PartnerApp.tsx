import { Navigate, Route, Routes } from "react-router-dom";
import PartnerSidebar from "./PartnerSidebar";
import PartnerDashboard from "./PartnerDashboard";
import PartnerFactoryPickupsPage from "./PartnerFactoryPickupsPage";
import PartnerIncoming from "./PartnerIncoming";
import PartnerPickupsPage from "./PartnerPickupsPage";
import PartnerFleet from "./PartnerFleet";
import PartnerProfile from "./PartnerProfile";

/**
 * Partner (Delivery Partner / LP) shell — sidebar + main routing area.
 * Master Plan §6 canonical: URL prefix `/delivery-partner/*` (intentionally
 * verbose so partners reading the URL see "delivery partner"); page directory
 * uses the shorter `partner/` for code brevity.
 *
 * Mirrors DealerApp's React Router subroute pattern (NavLink-driven nav,
 * routes inside a `<Routes>`) so partners can deep-link to `/delivery-partner/
 * pickups` and have it work — useful for WhatsApp-shared links to today's
 * jobs. Different from the operation/Principal shells which use state tabs.
 */
export default function PartnerApp() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <PartnerSidebar />
      <main className="ml-[220px] flex-1 min-w-0">
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="incoming" element={<PartnerIncoming />} />
          <Route path="dashboard" element={<PartnerDashboard />} />
          {/* 2026-05-10 (Loo) — split into two pages by leg:
              factory-pickups = supplier → warehouse (procurement leg)
              deliveries      = warehouse → customer (customer leg)
              Old `/pickups` redirects to factory-pickups for shared links. */}
          <Route path="factory-pickups" element={<PartnerFactoryPickupsPage />} />
          <Route path="deliveries" element={<PartnerPickupsPage />} />
          <Route
            path="pickups"
            element={<Navigate to="../factory-pickups" replace />}
          />
          <Route path="fleet" element={<PartnerFleet />} />
          <Route path="profile" element={<PartnerProfile />} />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}
