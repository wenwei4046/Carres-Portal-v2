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
 *   Email    — submit-for-approval: the request parks in the 0239 ledger until
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
    if (!confirm(`撤回改邮箱申请（${pending.requestedEmail}）？· Withdraw this request?`)) return;
    cancel.mutate(
      { id: pending.id },
      {
        onSuccess: () => toast.success("申请已撤回 · Request withdrawn"),
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
          Store login · 店铺登录账号
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
                  等待 HQ 审批 · Pending approval
                </span>
                <span className="text-muted-foreground">→ {pending.requestedEmail}</span>
                <button
                  type="button"
                  onClick={cancelPending}
                  disabled={cancel.isPending}
                  data-testid="email-change-cancel"
                  className="ml-2 text-[12px] font-semibold text-destructive hover:bg-base-100 rounded px-1.5 py-0.5 disabled:opacity-50"
                >
                  撤回 · Withdraw
                </button>
              </div>
            )}
            {!pending && rejected && (
              <div className="mt-1.5 text-[12px] text-destructive" data-testid="email-change-rejected">
                上次申请（{rejected.requestedEmail}）被 HQ 拒绝
                {rejected.decisionNote ? `：${rejected.decisionNote}` : ""} · Last request was
                rejected{rejected.decisionNote ? ` — ${rejected.decisionNote}` : ""}
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
              改密码 · Change password
            </button>
            <button
              type="button"
              onClick={() => setEmailOpen(true)}
              disabled={!!pending}
              title={pending ? "已有一个申请在等审批 · A request is already pending" : undefined}
              data-testid="store-account-changeemail"
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-base-700 border border-base-200 hover:bg-base-100 rounded px-3 py-1.5 disabled:opacity-50"
            >
              <Mail size={13} strokeWidth={1.75} />
              申请改邮箱 · Change email
            </button>
          </div>
        </div>

        <p className="text-[11.5px] text-muted-foreground mt-3">
          密码改了马上生效；邮箱改动提交后要 Carres HQ 批准才生效（批准前继续用旧邮箱登录）。
          Password changes apply immediately; an email change takes effect only after Carres HQ
          approves it.
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
    toast.success("密码已更新 · Password updated");
    onClose();
  }

  return (
    <ModalShell
      title="Change store password"
      subtitle={`${email} — 先验证旧密码，马上生效。Verify the current password; applies immediately.`}
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
          Current password · 旧密码
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
          New password · 新密码
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
          至少 8 位，需与旧密码不同 · Min 8 characters, must differ from current.
        </span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-base-700">
          Confirm new password · 再输一次
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
      if (body?.error === "bad_password") return "店铺密码不对 · Wrong store password";
      if (body?.error === "email_in_use") return "这个邮箱已被使用 · Email already in use";
      if (body?.error === "pending_exists")
        return "已有一个申请在等审批 · A request is already pending";
      if (body?.error === "same_email") return "这已经是当前登录邮箱 · Already the current email";
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
          toast.success("已提交，等 HQ 审批 · Submitted for approval");
          onClose();
        },
        onError: (e) => setErr(describeError(e)),
      },
    );
  }

  return (
    <ModalShell
      title="Change login email"
      subtitle={`当前 ${email} — 提交后需 Carres HQ 批准才生效。Submitted for Carres HQ approval; the login only changes once approved.`}
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
          New email · 新邮箱
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
          Store password · 店铺密码
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
          确认是店主本人操作 · Confirms it&apos;s really the store owner.
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
