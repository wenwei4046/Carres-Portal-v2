import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { loginSchema } from "@carres/shared";
import CarresLockup from "@/components/CarresLockup";
import { useAuth } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useAuth((s) => s.session);
  const role = useAuth((s) => s.role);
  const loading = useAuth((s) => s.loading);
  const signIn = useAuth((s) => s.signIn);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session && role) {
      const from = (location.state as { from?: string } | null)?.from;
      // Role-aware default home. As more roles ship (Phase 3+), extend here.
      // Partner lands on /delivery-partner/dashboard explicitly (rather than
      // the bare /delivery-partner) so deep-link tests can assert the leaf URL.
      const defaultHome =
        role === "principal"
          ? "/principal"
          : role === "logistics"
            ? "/logistics"
            : role === "partner"
              ? "/delivery-partner/dashboard"
              : role === "dealer" || role === "salesperson"
                ? "/dealer"
                : "/me";
      navigate(from && from !== "/login" ? from : defaultHome, { replace: true });
    }
  }, [session, role, location.state, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    const { error: signInError } = await signIn(parsed.data.email, parsed.data.password);
    if (signInError) {
      setError(
        signInError.toLowerCase().includes("invalid")
          ? "Email or password is incorrect."
          : signInError,
      );
    }
  }

  const inputClass =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card text-card-foreground shadow-sm">
        <div className="space-y-1 p-6">
          <h1>
            <CarresLockup showPortal size={32} />
          </h1>
          <p className="text-sm text-muted-foreground pt-1">Sign in to continue.</p>
        </div>
        <div className="px-6 pb-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium leading-none">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium leading-none">Password</label>
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
              <input
                id="password"
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>

            <div className="space-y-1 text-center text-xs text-muted-foreground">
              <p>Demo: dealer@carres.com / 111</p>
              {!supabaseConfigured && (
                <p className="text-warning">Supabase not configured — set apps/web/.env.local</p>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
