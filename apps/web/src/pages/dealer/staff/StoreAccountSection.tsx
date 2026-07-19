import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Mail } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { changeOwnPassword } from "@/lib/password";
import { useCancelEmailChange, useMyEmailChange, useSubmitEmailChange } from "@/lib/queries";
import { useStaffSession } from "@/lib/staff";
import { ModalShell } from "./staff-ui";

/**
 * Store login credential card (Loo 2026-07-19) — DEALER-store principal (店主)
 * only; a showroom's login belongs to Carres HQ, and lower tiers manage
 * nothing here (they also don't know the store password, which both flows
 * re-verify).
 *
 *   Password — changed directly (lib/password.ts, client → Supabase Auth).
 *   Email    — submit-for-approval: the request parks in the 0240 ledger until
 *              a Carres HQ principal approves (login email actually swaps) or
 *              rejects with a note shown here.
 *
 * Mounted in the POS StaffManagePage overlay AND DealerSettings (shared, like
 * StaffSection).
 */
export default function StoreAccountSection() {
  const role = useAuth((s) => s.role);
  const email = useAuth((s) => s.user?.email ?? "");
  const tier = useStaffSession((s) => s.staff?.tier ?? null);
  const show = role === "dealer" && tier === "principal";

  const reqQ = useMyEmailChange({ enabled: show });
  const cancel = useCancelEmailChange();
  const [pwOpen, setPwOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  if (!show) return null;

  const request = reqQ.data?.request ?? null;
  const pending = request?.status === "pending" ? request : null;
  const rejected = request?.status === "rejected" ? request : null;

  function cancelPending() {
    if (!pending) return;
    if (!confirm(`Withdraw the email change request (${pending.requestedEmail})?`)) return;
    cancel.mutate(
      { id: pending.id },
      {
        onSuccess: () => toast.success("Request withdrawn"),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not cancel"),
      },
    );
  }

  return (
    <>
      <section
        className="rounded-md border border-border bg-card p-5 mt-6"
        data-testid="store-account-section"
      >
        <h2 className="text-xs uppercase tracking-[0.16em] text-muted-foreground font-semibold mb-3">
          Store login
        </h2>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">
              Login email
            </div>
            <div className="text-sm font-medium truncate" data-testid="store-account-email">
              {email}
            </div>
            {pending && (
              <div className="mt-1.5 text-[12px]" data-testid="email-change-pending">
                <span className="inline-block px-2 py-[2px] rounded bg-warning-soft text-warning font-semibold mr-2">
                  Pending HQ approval
                </span>
                <span className="text-muted-foreground">→ {pending.requestedEmail}</span>
                <button
                  type="button"
                  onClick={cancelPending}
                  disabled={cancel.isPending}
                  data-testid="email-change-cancel"
                  className="ml-2 text-[12px] font-semibold text-destructive hover:bg-base-100 rounded px-1.5 py-0.5 disabled:opacity-50"
                >
                  Withdraw
                </button>
              </div>
            )}
            {!pending && rejected && (
              <div className="mt-1.5 text-[12px] text-destructive" data-testid="email-change-rejected">
                Last request ({rejected.requestedEmail}) was rejected by Carres HQ
                {rejected.decisionNote ? ` — ${rejected.decisionNote}` : ""}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setPwOpen(true)}
              data-testid="store-account-changepw"
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-base-700 border border-base-200 hover:bg-base-100 rounded px-3 py-1.5"
            >
              <KeyRound size={13} strokeWidth={1.75} />
              Change password
            </button>
            <button
              type="button"
              onClick={() => setEmailOpen(true)}
              disabled={!!pending}
              title={pending ? "A request is already pending" : undefined}
              data-testid="store-account-changeemail"
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-base-700 border border-base-200 hover:bg-base-100 rounded px-3 py-1.5 disabled:opacity-50"
            >
              <Mail size={13} strokeWidth={1.75} />
              Change email
            </button>
          </div>
        </div>

        <p className="text-[11.5px] text-muted-foreground mt-3">
          Password changes apply immediately. An email change takes effect only after Carres HQ
          approves it — keep signing in with the old email until then.
        </p>
      </section>

      {pwOpen && <ChangeStorePasswordModal email={email} onClose={() => setPwOpen(false)} />}
      {emailOpen && <RequestEmailChangeModal email={email} onClose={() => setEmailOpen(false)} />}
    </>
  );
}

const inputCls =
  "w-full px-3 py-2.5 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-base-700";
const btnGhost =
  "px-4 py-[9px] text-[13px] font-semibold text-base-600 rounded hover:bg-base-100 cursor-pointer disabled:opacity-50";
const btnSolid =
  "px-[18px] py-[9px] bg-base-900 text-white text-[13px] font-semibold rounded hover:bg-base-800 cursor-pointer disabled:opacity-50";

/** Direct password rotation — verify current, then updateUser (lib/password.ts). */
function ChangeStorePasswordModal({ email, onClose }: { email: string; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const valid =
    current.length > 0 && next.length >= 8 && next !== current && next === confirmPw;

  async function submit() {
    if (!valid || busy) return;
    setErr("");
    setBusy(true);
    const result = await changeOwnPassword(email, current, next);
    setBusy(false);
    if (!result.ok) {
      setErr(result.error);
      return;
    }
    toast.success("Password updated");
    onClose();
  }

  return (
    <ModalShell
      title="Change store password"
      subtitle={`${email} — verify the current password first; the change applies immediately.`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy} className={btnGhost}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid || busy}
            className={btnSolid}
            data-testid="storepw-save"
          >
            {busy ? "Updating…" : "Update password"}
          </button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-base-700">
          Current password
        </span>
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          data-testid="storepw-current"
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-base-700">
          New password
        </span>
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          data-testid="storepw-new"
          className={inputCls}
        />
        <span className="text-[11px] text-muted-foreground">
          Min 8 characters, must differ from the current password.
        </span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-base-700">
          Confirm new password
        </span>
        <input
          type="password"
          autoComplete="new-password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          data-testid="storepw-confirm"
          className={inputCls}
        />
      </label>
      {confirmPw.length > 0 && next !== confirmPw && (
        <div className="text-[12px] text-destructive">Passwords don&apos;t match.</div>
      )}
      {err && (
        <div className="text-[12px] text-destructive" data-testid="storepw-error">
          {err}
        </div>
      )}
    </ModalShell>
  );
}

/** Email change = submit for HQ approval (store password re-proven server-side). */
function RequestEmailChangeModal({ email, onClose }: { email: string; onClose: () => void }) {
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const submitReq = useSubmitEmailChange();

  const trimmed = newEmail.trim().toLowerCase();
  const valid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) &&
    trimmed !== email.toLowerCase() &&
    password.length > 0;

  function describeError(e: unknown): string {
    if (e instanceof ApiError) {
      const body = e.body as { error?: string } | null;
      if (body?.error === "bad_password") return "Wrong store password";
      if (body?.error === "email_in_use") return "Email already in use";
      if (body?.error === "pending_exists") return "A request is already pending";
      if (body?.error === "same_email") return "That is already the current login email";
      return e.message;
    }
    return "Could not submit the request";
  }

  function submit() {
    if (!valid || submitReq.isPending) return;
    setErr("");
    submitReq.mutate(
      { newEmail: trimmed, password },
      {
        onSuccess: () => {
          toast.success("Submitted for Carres HQ approval");
          onClose();
        },
        onError: (e) => setErr(describeError(e)),
      },
    );
  }

  return (
    <ModalShell
      title="Change login email"
      subtitle={`Currently ${email} — the request goes to Carres HQ; the login only changes once approved.`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={submitReq.isPending} className={btnGhost}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid || submitReq.isPending}
            className={btnSolid}
            data-testid="emailchange-submit"
          >
            {submitReq.isPending ? "Submitting…" : "Submit for approval"}
          </button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-base-700">
          New email
        </span>
        <input
          type="email"
          autoComplete="off"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          data-testid="emailchange-email"
          autoFocus
          className={inputCls}
          placeholder="new@store.com"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-base-700">
          Store password
        </span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="emailchange-password"
          className={inputCls}
        />
        <span className="text-[11px] text-muted-foreground">
          Confirms it&apos;s really the store owner.
        </span>
      </label>
      {err && (
        <div className="text-[12px] text-destructive" data-testid="emailchange-error">
          {err}
        </div>
      )}
    </ModalShell>
  );
}
