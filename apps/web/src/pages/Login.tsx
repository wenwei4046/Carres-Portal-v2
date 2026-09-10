import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { loginSchema } from "@carres/shared";
import { useAuth } from "@/lib/auth";
import { readReturnTo } from "@/lib/return-to";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import "./Login.css";

const RESET_REDIRECT_URL = `${window.location.origin}/update-password`;

function formatNowMyt(): string {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${fmt.format(new Date())} MYT`;
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

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
  const [remember, setRemember] = useState(true);

  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [topAlert, setTopAlert] = useState<{ kind: "error" | "success"; msg: string } | null>(null);

  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetEmailError, setResetEmailError] = useState("");
  const [resetAlert, setResetAlert] = useState<{ kind: "error" | "success"; msg: string } | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  const [clock, setClock] = useState(formatNowMyt());

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatNowMyt()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (session && role) {
      const from = readReturnTo(location.state);
      const defaultHome =
        role === "principal"
          ? "/principal"
          : role === "operation"
            ? "/operation"
            : role === "partner"
              ? "/delivery-partner/dashboard"
              : role === "finance"
                ? "/finance"
                : role === "supplier"
                  ? "/supplier"
                  : role === "bd"
                    ? "/bd"
                    : role === "dealer" || role === "salesperson" || role === "showroom"
                      ? "/dealer"
                      : "/me";
      navigate(from ?? defaultHome, { replace: true });
    }
  }, [session, role, location.state, navigate]);

  useEffect(() => {
    if (!showReset) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowReset(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showReset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setEmailError("");
    setPasswordError("");
    setTopAlert(null);

    let bad = false;
    if (!email.trim()) { setEmailError("Required"); bad = true; }
    else if (!isValidEmail(email)) { setEmailError("Invalid email"); bad = true; }
    if (!password) { setPasswordError("Required"); bad = true; }
    if (bad) return;

    const parsed = loginSchema.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      setTopAlert({ kind: "error", msg: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const { error: signInError } = await signIn(parsed.data.email, parsed.data.password);
    if (signInError) {
      const lower = signInError.toLowerCase();
      const msg =
        lower.includes("invalid")
          ? "Email or password is incorrect."
          : lower.includes("email not confirmed")
            ? "Please confirm your email before signing in."
            : signInError;
      setTopAlert({ kind: "error", msg });
      return;
    }
    setTopAlert({ kind: "success", msg: "Welcome back. Redirecting…" });
  }

  function openReset() {
    if (email.trim()) setResetEmail(email.trim());
    setResetAlert(null);
    setResetEmailError("");
    setShowReset(true);
  }

  async function onResetSubmit(e: FormEvent) {
    e.preventDefault();
    setResetEmailError("");
    setResetAlert(null);

    const v = resetEmail.trim();
    if (!v) { setResetEmailError("Required"); return; }
    if (!isValidEmail(v)) { setResetEmailError("Invalid email"); return; }

    setResetBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(v, {
        redirectTo: RESET_REDIRECT_URL,
      });
      if (error) {
        setResetAlert({ kind: "error", msg: error.message });
      } else {
        setResetAlert({
          kind: "success",
          msg: `If an account exists for ${v}, a reset link has been sent.`,
        });
      }
    } catch (err) {
      console.error(err);
      setResetAlert({ kind: "error", msg: "Couldn't send reset email. Please try again." });
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <div className="login-stage">
      {/* Persistent chrome */}
      <div className="chrome-top">
        <div className="L">
          <span className="brand">CARRES</span>
          <span className="chrome-tag">Operations Portal · Live</span>
        </div>
        <div className="R">
          <span>v 1.0 / 2026</span>
          <span>EN · ZH</span>
        </div>
      </div>
      <div className="chrome-bot">
        <div className="L">
          <span>① Sign in</span>
          <span style={{ opacity: 0.4 }}>② Workspace</span>
          <span style={{ opacity: 0.4 }}>③ Run</span>
        </div>
        <div className="R">
          <span>Kuala Lumpur · {clock}</span>
        </div>
      </div>

      <div className="stage">
        {/* LEFT: Editorial canvas */}
        <aside className="canvas">
          <div className="portrait" />
          <div className="portrait-veil" />

          <img src="/carres-logo.png" alt="" className="canvas-mark" />

          <div className="canvas-inner">
            <div className="meta-row">
              <span className="num">N° 001</span>
              <span className="dot" />
              <span>Access · Identification required</span>
            </div>

            <h1 className="display">
              <span className="row"><em>harmonious</em></span>
              <span className="row">&amp; healthy<span className="star">✸</span></span>
              <span className="row indent">home living.</span>
            </h1>

            <p className="deck">
              <strong>One workspace</strong> for dealers, suppliers, operation &amp; finance — every order, every approval, every signal in one place.
            </p>
          </div>

          <div className="canvas-foot">
            <div className="pillars">
              <span>HQ</span>
              <span>Network</span>
              <span>Catalog</span>
              <span>Pulse</span>
            </div>
            <span className="scroll-cue">
              <span>Sign in to enter</span>
              <span className="arrow" />
            </span>
          </div>
        </aside>

        {/* RIGHT: Form panel */}
        <main className="panel">
          <div className="panel-inner">
            <div className="panel-meta">
              <span className="accent">● Welcome</span>
              <span>Step 01 / 01</span>
            </div>

            <h2 className="panel-title">
              Sign <em>in</em>
              <br />to continue.
            </h2>
            <p className="panel-sub">Use your work email to access the operations portal.</p>

            {topAlert && (
              <div className={`alert alert-${topAlert.kind}`}>{topAlert.msg}</div>
            )}
            {!supabaseConfigured && (
              <div className="alert alert-error">
                Supabase not configured — set apps/web/.env.local
              </div>
            )}

            <form onSubmit={onSubmit} noValidate>
              <div className="field">
                <label className="field-label" htmlFor="email">Email · ID</label>
                <div className="input-wrap">
                  <input
                    type="email"
                    id="email"
                    className={`input${emailError ? " has-error" : ""}`}
                    placeholder="name@company.com"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="field-error">{emailError}</div>
              </div>

              <div className="field">
                <div className="field-row">
                  <label className="field-label" htmlFor="password" style={{ margin: 0 }}>Passphrase</label>
                  <button type="button" className="field-link" onClick={openReset}>Reset →</button>
                </div>
                <div className="input-wrap">
                  <input
                    type={showPw ? "text" : "password"}
                    id="password"
                    className={`input input-pad-right${passwordError ? " has-error" : ""}`}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="input-eye"
                    aria-label={showPw ? "Hide password" : "Show password"}
                    onClick={() => setShowPw((v) => !v)}
                  >
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
                <div className="field-error">{passwordError}</div>
              </div>

              <label className="remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span>Stay signed in</span>
              </label>

              <div className="cta-row">
                <button
                  type="submit"
                  className={`cta${loading ? " busy" : ""}`}
                  disabled={loading}
                >
                  {loading ? <><span className="spinner" />Signing in…</> : "Enter portal"}
                </button>
              </div>
            </form>

            <div className="footer-note">
              <span>No account?</span>
              <a href="mailto:admin@carres.com.my">Contact admin →</a>
            </div>
          </div>
        </main>
      </div>

      {/* Reset password modal */}
      {showReset && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowReset(false);
          }}
        >
          <div className="modal">
            <div className="modal-meta">
              <span className="accent">● Recovery</span>
              <span>Step 01 / 02</span>
            </div>
            <h2>Reset <em>passphrase</em>.</h2>
            <p className="modal-sub">Enter your email and we'll send a secure link to choose a new one.</p>

            {resetAlert && (
              <div className={`alert alert-${resetAlert.kind}`}>{resetAlert.msg}</div>
            )}

            <form onSubmit={onResetSubmit} noValidate>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="field-label" htmlFor="reset-email">Email · ID</label>
                <input
                  type="email"
                  id="reset-email"
                  className={`input${resetEmailError ? " has-error" : ""}`}
                  placeholder="name@company.com"
                  autoComplete="email"
                  required
                  autoFocus
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
                <div className="field-error">{resetEmailError}</div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowReset(false)}>Cancel</button>
                <button
                  type="submit"
                  className={`cta${resetBusy ? " busy" : ""}`}
                  disabled={resetBusy}
                >
                  {resetBusy ? <><span className="spinner" />Sending…</> : "Send link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
