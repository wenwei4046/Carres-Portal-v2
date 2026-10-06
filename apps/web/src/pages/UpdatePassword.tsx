import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH, setPasswordFromRecovery } from "@/lib/password";
import "./Login.css";

/**
 * UpdatePassword — STEP 02 of the recovery flow, and the page the reset email
 * has been pointing at since the flow was built.
 *
 * The link never had a destination: `/update-password` appeared exactly once in
 * this repository, in the `redirectTo` that sends people here. Because
 * `detectSessionInUrl` is on (`lib/supabase.ts`), following the link DID sign
 * the user in — and then the catch-all route dropped them on their home page
 * with no password field and no explanation. They could not change the password
 * they came to change, and nothing told them why.
 *
 * The login modal already calls itself `Step 01 / 02`, so this page finishes a
 * sentence the portal had started. It wears `Login.css` for that reason: it is
 * the same unauthenticated surface, not a portal page behind the shell.
 *
 * NO CURRENT-PASSWORD FIELD, deliberately. The person here is the one who does
 * not know it. The recovery token is the proof, and Supabase has already
 * exchanged it for a session before this component mounts.
 */
export default function UpdatePassword() {
  const navigate = useNavigate();
  const session = useAuth((s) => s.session);
  const hydrated = useAuth((s) => s.hydrated);
  const signOut = useAuth((s) => s.signOut);

  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Signed out on success so the next sign-in proves the new password works.
  // Leaving the recovery session live would land them in the portal without
  // ever typing it, which is how a forgotten password stays forgotten.
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => {
      void signOut().then(() => navigate("/login", { replace: true }));
    }, 2500);
    return () => window.clearTimeout(t);
  }, [done, signOut, navigate]);

  function validate(): string | null {
    if (next.length < MIN_PASSWORD_LENGTH)
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    if (next !== confirmPw) return "Confirmation doesn't match";
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setBusy(true);
    try {
      const result = await setPasswordFromRecovery(next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const chrome = (
    <>
      <div className="chrome-top">
        <div className="L">
          <span className="brand">CARRES</span>
          <span className="chrome-tag">Operations Portal · Live</span>
        </div>
      </div>
      <div className="chrome-bot">
        <div className="L">
          <span style={{ opacity: 0.4 }}>① Sign in</span>
          <span>② Choose a password</span>
        </div>
      </div>
    </>
  );

  // The auth store hydrates once at module level; until it has, we cannot tell
  // a valid recovery link from an expired one, and guessing would show the
  // wrong page to whichever case we guessed against.
  if (!hydrated) {
    return (
      <div className="login-stage">
        {chrome}
        <main className="panel">
          <div className="panel-inner">
            <p className="modal-sub">Checking your link…</p>
          </div>
        </main>
      </div>
    );
  }

  // No session ⇒ the link was used already, has expired, or the page was opened
  // directly. Say which door to use rather than leaving a dead form on screen.
  if (!session) {
    return (
      <div className="login-stage">
        {chrome}
        <main className="panel">
          <div className="panel-inner">
            <div className="modal-meta">
              <span className="accent">● Recovery</span>
              <span>Step 02 / 02</span>
            </div>
            <h2>
              This link has <em>expired</em>.
            </h2>
            <p className="modal-sub">
              A recovery link can be used once. Ask for a new one and it will arrive in the same
              inbox.
            </p>
            <div className="modal-actions">
              <button type="button" className="cta" onClick={() => navigate("/login")}>
                Back to sign in
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="login-stage">
      {chrome}
      <main className="panel">
        <div className="panel-inner">
          <div className="modal-meta">
            <span className="accent">● Recovery</span>
            <span>Step 02 / 02</span>
          </div>

          {done ? (
            <>
              <h2>
                Password <em>changed</em>.
              </h2>
              <p className="modal-sub">
                Taking you to sign in. Use the new password from now on.
              </p>
            </>
          ) : (
            <>
              <h2>
                Choose a new <em>password</em>.
              </h2>
              {/* The requirement is stated BEFORE typing, not only after a
                  failed attempt — the operator this portal is built for should
                  not have to discover a rule by breaking it. */}
              <p className="modal-sub">
                {session.user?.email ? `For ${session.user.email}. ` : ""}
                At least {MIN_PASSWORD_LENGTH} characters.
              </p>

              {/* `role="alert"` so a screen reader announces the refusal — the
                  message appears without focus moving, which is otherwise
                  silent. It also makes the error distinguishable from the
                  identical wording in the intro line above. */}
              {error && (
                <div className="alert alert-error" role="alert">
                  {error}
                </div>
              )}

              <form onSubmit={onSubmit} noValidate>
                <div className="field">
                  <label className="field-label" htmlFor="new-password">
                    New password
                  </label>
                  <input
                    id="new-password"
                    type={show ? "text" : "password"}
                    className="input"
                    autoComplete="new-password"
                    autoFocus
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="confirm-password">
                    Confirm new password
                  </label>
                  <input
                    id="confirm-password"
                    type={show ? "text" : "password"}
                    className="input"
                    autoComplete="new-password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                  />
                </div>

                <div className="modal-actions">
                  <button type="button" className="btn-ghost" onClick={() => setShow((s) => !s)}>
                    {show ? "Hide" : "Show"}
                  </button>
                  <button type="submit" className={`cta${busy ? " busy" : ""}`} disabled={busy}>
                    {busy ? (
                      <>
                        <span className="spinner" />
                        Saving…
                      </>
                    ) : (
                      "Save password"
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
