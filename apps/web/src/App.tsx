import { useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { useAuth } from "@/lib/auth";
import { RequireRole } from "@/lib/require-role";
import Login from "@/pages/Login";
import Me from "@/pages/Me";
import DealerApp from "@/pages/dealer/DealerApp";
import PrincipalApp from "@/pages/principal/PrincipalApp";
import OperationApp from "@/pages/operation/OperationApp";
import PartnerApp from "@/pages/partner/PartnerApp";
import FinanceApp from "@/pages/finance/FinanceApp";
import SupplierApp from "@/pages/supplier/SupplierApp";
import BDApp from "@/pages/bd/BDApp";
import PickupEventPrintPage from "@/pages/print/PickupEventPrintPage";

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
  if (role === "principal") return <Navigate to="/principal" replace />;
  if (role === "operation") return <Navigate to="/operation" replace />;
  if (role === "partner") return <Navigate to="/delivery-partner" replace />;
  if (role === "finance") return <Navigate to="/finance" replace />;
  if (role === "supplier") return <Navigate to="/supplier" replace />;
  if (role === "bd") return <Navigate to="/bd" replace />;
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
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <>
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
              <RequireRole roles={["operation"]}>
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
        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
      {/* Global toast surface — top-right per dealer-portal convention.
       *  rich-colors uses sonner's theme classes so success / error / warning
       *  pick up our --success / --warning / --destructive tokens via the
       *  default Tailwind cascade. closeButton lets dealers dismiss long
       *  messages (e.g. server validation errors) before auto-fade. */}
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}
