import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./auth";
import { roleAllowedOnPortal } from "./portal";
import WrongPortal from "@/components/WrongPortal";
import type { Role } from "@carres/shared/domain";

export function RequireRole({ roles, children }: { roles: ReadonlyArray<Role>; children: ReactNode }) {
  const role = useAuth((s) => s.role);
  const hydrated = useAuth((s) => s.hydrated);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (!role || !roles.includes(role)) {
    return <Navigate to="/me" replace />;
  }
  // POS/ERP domain split (2026-07-18): a valid role on the WRONG domain gets
  // the signpost, never the app. pages.dev/localhost are ungated ("all").
  if (!roleAllowedOnPortal(role)) {
    return <WrongPortal role={role} />;
  }
  return <>{children}</>;
}
