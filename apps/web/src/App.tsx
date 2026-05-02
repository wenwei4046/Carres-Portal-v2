import { useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import Login from "@/pages/Login";
import Me from "@/pages/Me";

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
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/me" element={<RequireAuth><Me /></RequireAuth>} />
      <Route path="/" element={<Navigate to="/me" replace />} />
      <Route path="*" element={<Navigate to="/me" replace />} />
    </Routes>
  );
}
