import type { Role } from "@carres/shared/domain";
import { PORTAL_URLS, portalForRole } from "@/lib/portal";
import { useAuth } from "@/lib/auth";

/**
 * Shown when a signed-in role lands on the WRONG portal domain (POS role on
 * erp.carresofficial.com or vice versa). We never silently redirect — the
 * Supabase session lives per-origin, so the user must sign in again on the
 * right domain; this card tells them where to go.
 */
export default function WrongPortal({ role }: { role: Role }) {
  const signOut = useAuth((s) => s.signOut);
  const home = portalForRole(role);
  const url = PORTAL_URLS[home];
  const label = home === "pos" ? "Carres POS" : "Carres ERP";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 text-center shadow-sm" data-testid="wrong-portal">
        <p className="t-micro text-muted-foreground">WRONG DOOR</p>
        <h1 className="t-h3 mt-2 text-foreground">这个账号属于 {label}</h1>
        <p className="t-small mt-2 text-muted-foreground">
          请前往 {label} 登录使用。
        </p>
        <a
          href={url}
          className="btn-primary mt-6 inline-flex w-full items-center justify-center"
          data-testid="wrong-portal-go"
        >
          前往 {url.replace("https://", "")}
        </a>
        <button
          type="button"
          className="btn-ghost mt-2 w-full"
          onClick={() => void signOut()}
          data-testid="wrong-portal-signout"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
