import { useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { useAuth } from "@/lib/auth";
import { RequireRole } from "@/lib/require-role";
import { roleAllowedOnPortal } from "@/lib/portal";
import WrongPortal from "@/components/WrongPortal";
import ErrorBoundary from "@/components/ErrorBoundary";
import Login from "@/pages/Login";
import Me from "@/pages/Me";
import DealerApp from "@/pages/dealer/DealerApp";
import PrincipalApp from "@/pages/principal/PrincipalApp";
import OperationApp from "@/pages/operation/OperationApp";
import PartnerApp from "@/pages/partner/PartnerApp";
import FinanceApp from "@/pages/finance/FinanceApp";
import SupplierApp from "@/pages/supplier/SupplierApp";
import BDApp from "@/pages/bd/BDApp";
import HrApp from "@/pages/hr/HrApp";
import PickupEventPrintPage from "@/pages/print/PickupEventPrintPage";
import ServiceNotePrintPage from "@/pages/print/ServiceNotePrintPage";
import { PayCancelled, PaySuccess } from "@/pages/pay/PayResult";

function HomeRedirect() {
  const session = useAuth((s) => s.session);
  const role = useAuth((s) => s.role);
  const hydrated = useAuth((s) => s.hydrated);
  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  // POS/ERP domain split (2026-07-18): wrong-domain roles get the signpost
  // before any role-home navigation. pages.dev/localhost stay ungated.
  if (role && !roleAllowedOnPortal(role)) return <WrongPortal role={role} />;
  if (role === "principal") return <Navigate to="/principal" replace />;
  if (role === "operation") return <Navigate to="/operation" replace />;
  if (role === "partner") return <Navigate to="/delivery-partner" replace />;
  if (role === "finance") return <Navigate to="/finance" replace />;
  if (role === "supplier") return <Navigate to="/supplier" replace />;
  if (role === "bd") return <Navigate to="/bd" replace />;
  if (role === "hr") return <Navigate to="/hr" replace />;
  if (role === "dealer" || role === "salesperson" || role === "showroom") return <Navigate to="/dealer" replace />;
  return <Navigate to="/me" replace />;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const session = useAuth((s) => s.session);
  const hydrated = useAuth((s) => s.hydrated);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const hydrate = useAuth((s) => s.hydrate);
  const location = useLocation();
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <>
      {/* Route-level net. Keyed on pathname so navigating AWAY from a page that
          crashed clears the error — otherwise the operator would be stuck on
          the failure screen until a full reload. The root boundary in main.tsx
          still backs this up. */}
      <ErrorBoundary key={location.pathname} area="Carres Portal" variant="route">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/me" element={<RequireAuth><Me /></RequireAuth>} />
        <Route
          path="/dealer/*"
          element={
            <RequireAuth>
              <RequireRole roles={["dealer", "salesperson", "showroom"]}>
                <DealerApp />
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/principal/*"
          element={
            <RequireAuth>
              <RequireRole roles={["principal"]}>
                <PrincipalApp />
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/operation/*"
          element={
            <RequireAuth>
              {/* Unified Internal Portal (2026-06-30) — principal admitted
                  alongside operation so the merged PortalSidebar's Operations
                  area is reachable by the boss. DB twin: migration 0189 widens
                  is_operation(); API twin: requireOperation admits principal. */}
              <RequireRole roles={["operation", "principal"]}>
                <OperationApp />
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/delivery-partner/*"
          element={
            <RequireAuth>
              <RequireRole roles={["partner"]}>
                <PartnerApp />
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/finance/*"
          element={
            <RequireAuth>
              <RequireRole roles={["finance", "principal"]}>
                <FinanceApp />
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/supplier/*"
          element={
            <RequireAuth>
              <RequireRole roles={["supplier"]}>
                <SupplierApp />
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/bd/*"
          element={
            <RequireAuth>
              <RequireRole roles={["bd"]}>
                <BDApp />
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/hr/*"
          element={
            <RequireAuth>
              {/* 0244/0245 — HR commission portal. Principal admitted like the
                  other internal areas (boss-sees-all invariant). */}
              <RequireRole roles={["hr", "principal"]}>
                <HrApp />
              </RequireRole>
            </RequireAuth>
          }
        />
        {/* Task 13 (2026-05-15) — pickup-event DO reprint landing.
         *  Role-agnostic URL pattern; the server endpoint
         *  (`/api/pickup-events/:id/print`) gates per-role via RLS. */}
        <Route
          path="/print/pickup-event/:eventId"
          element={
            <RequireAuth>
              <PickupEventPrintPage />
            </RequireAuth>
          }
        />
        <Route
          path="/print/service-note/:id"
          element={
            <RequireAuth>
              <ServiceNotePrintPage />
            </RequireAuth>
          }
        />
        {/* 0223 — Stripe Checkout landings. PUBLIC on purpose: the CUSTOMER's
         *  browser arrives here after paying; there is no session and nothing
         *  sensitive on the page. */}
        <Route path="/pay/success" element={<PaySuccess />} />
        <Route path="/pay/cancelled" element={<PayCancelled />} />
        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
      </ErrorBoundary>
      {/* Global toast surface — top-right per dealer-portal convention.
       *  rich-colors uses sonner's theme classes so success / error / warning
       *  pick up our --success / --warning / --destructive tokens via the
       *  default Tailwind cascade. closeButton lets dealers dismiss long
       *  messages (e.g. server validation errors) before auto-fade. */}
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}
