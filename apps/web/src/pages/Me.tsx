import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type MeResponse } from "@carres/shared";
import CarresLockup from "@/components/CarresLockup";
import { useAuth } from "@/lib/auth";
import { apiFetch, ApiError } from "@/lib/api";

export default function Me() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<MeResponse>("/api/auth/me")
      .then((data) => { if (!cancelled) setMe(data); })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError) setError(`API ${e.status}: ${e.message}`);
        else setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center justify-between">
          <CarresLockup showPortal size={28} />
          <button
            onClick={handleSignOut}
            className="inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            Sign out
          </button>
        </header>

        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Browser session (Supabase JWT)
          </h2>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 font-mono text-sm">
            <dt className="text-muted-foreground">user.id</dt>
            <dd className="break-all">{user?.id ?? "—"}</dd>
            <dt className="text-muted-foreground">user.email</dt>
            <dd>{user?.email ?? "—"}</dd>
          </dl>
        </section>

        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            GET /api/auth/me (Hono → JWT verify → response)
          </h2>
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}
          {me && (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 font-mono text-sm">
              <dt className="text-muted-foreground">role</dt>
              <dd className="font-semibold text-primary">{me.role}</dd>
              <dt className="text-muted-foreground">dealerId</dt>
              <dd className="break-all">{me.dealerId ?? "—"}</dd>
              <dt className="text-muted-foreground">supplierId</dt>
              <dd className="break-all">{me.supplierId ?? "—"}</dd>
              <dt className="text-muted-foreground">partnerId</dt>
              <dd className="break-all">{me.partnerId ?? "—"}</dd>
              <dt className="text-muted-foreground">outletId</dt>
              <dd className="break-all">{me.outletId ?? "—"}</dd>
            </dl>
          )}
        </section>
      </div>
    </div>
  );
}
