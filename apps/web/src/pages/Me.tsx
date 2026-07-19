import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { type MeResponse } from "@carres/shared";
import type { Role } from "@carres/shared/domain";
import CarresLockup from "@/components/CarresLockup";
import { useAuth } from "@/lib/auth";
import { apiFetch, ApiError } from "@/lib/api";
import { changeOwnPassword } from "@/lib/password";

function homeForRole(role: Role | null): string {
  switch (role) {
    case "principal":   return "/principal";
    case "operation":   return "/operation";
    case "partner":     return "/delivery-partner";
    case "finance":     return "/finance";
    case "supplier":    return "/supplier";
    case "bd":          return "/bd";
    case "dealer":
    case "salesperson":
    case "showroom":    return "/dealer";
    default:            return "/";
  }
}

export default function Me() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const role = useAuth((s) => s.role);
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
          <div className="flex items-center gap-2">
            <Link
              to={homeForRole(role)}
              className="inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              ← Back to dashboard
            </Link>
            <button
              onClick={handleSignOut}
              className="inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Sign out
            </button>
          </div>
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

        <ChangePasswordCard email={user?.email ?? ""} />

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

/**
 * Change-password UI available to every role. Walks Supabase Auth directly
 * (no Hono hop) because the user already has their own session JWT — admin
 * API + service_role would be overkill for self-service rotation.
 *
 * Flow:
 *   1. Verify `currentPassword` by re-running signInWithPassword (Supabase
 *      has no dedicated "verify password" endpoint; success ≡ correct pw).
 *      This refreshes the session as a side effect — harmless.
 *   2. Call `auth.updateUser({ password: newPassword })`.
 *
 * V1 keeps it minimal: 8-char floor, must match confirm, must differ from
 * current. Strength meter / breach-DB check deferred.
 */
function ChangePasswordCard({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function validate(): string | null {
    if (!current) return "Enter your current password";
    if (next.length < 8) return "New password must be at least 8 characters";
    if (next === current) return "New password must differ from current";
    if (next !== confirmPw) return "Confirmation doesn't match";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const v = validate();
    if (v) { setError(v); return; }
    if (!email) { setError("Missing session email — sign in again"); return; }

    setBusy(true);
    try {
      // Shared 2-step rotation (verify current → updateUser) — lib/password.ts.
      const result = await changeOwnPassword(email, current, next);
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      setSuccess(true);
      setCurrent("");
      setNext("");
      setConfirmPw("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Change password
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Rotate your own password. We verify your current password before applying the change.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <PwField
          label="Current password"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
        />
        <PwField
          label="New password"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          hint="Minimum 8 characters. Must differ from your current password."
        />
        <PwField
          label="Confirm new password"
          value={confirmPw}
          onChange={setConfirmPw}
          autoComplete="new-password"
        />
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">
            Password updated. Use your new password next time you sign in.
          </div>
        )}
        <div className="pt-1">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Updating…" : "Update password"}
          </button>
        </div>
      </form>
    </section>
  );
}

function PwField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="h-9 px-3 text-xs font-medium text-muted-foreground border border-input rounded-md hover:bg-accent cursor-pointer"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
