import { useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { useAuth } from "@/lib/auth";
import { RequireRole } from "@/lib/require-role";
import Login from "@/pages/Login";
import Me from "@/pages/Me";
import DealerApp from "@/pages/dealer/DealerApp";

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
  if (role === "dealer" || role === "salesperson") return <Navigate to="/dealer" replace />;
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
              <RequireRole roles={["dealer", "salesperson"]}>
                <DealerApp />
              </RequireRole>
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
