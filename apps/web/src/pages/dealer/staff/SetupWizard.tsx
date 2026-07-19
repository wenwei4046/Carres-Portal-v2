import { useState } from "react";
import { Check } from "lucide-react";
import type { OutletDto, StaffColorKey, StaffDto, StaffTierDto } from "@carres/shared";
import { STAFF_COLORS } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useCreateStaff, useSetStaffPin, useStaffReauth } from "@/lib/queries";
import { useStaffSession } from "@/lib/staff";
import PinPad from "../pos/PinPad";
import { staffColorHex, staffInitials, TIER_LABEL } from "./staff-ui";

/**
 * SetupWizard (0233) — the one-time forced activation an un-activated store is
 * pushed through on next login. Three steps:
 *   1. Re-prove the store email + password (reauth) → owner-mode token, so the
 *      creates below are authorised.
 *   2. Create the owner's own staff identity (dealer → 店主 principal, showroom
 *      → 经理 manager) with a name, avatar colour and a 6-digit PIN. If Carres
 *      already pre-provisioned an owner row (showroom), that row is reused and
 *      the step just sets its PIN.
 *   3. (Skippable) set a PIN — and optionally raise the tier — for the store's
 *      existing salesperson rows.
 * Finishing drops the owner-mode token; the gate then lands on the PIN screen.
 */
export default function SetupWizard({
  staff,
  storeKind,
  dealerId,
  outlets,
  prefillName,
  onDone,
}: {
  staff: StaffDto[];
  storeKind: "dealer" | "showroom";
  dealerId: string | null;
  outlets: OutletDto[];
  prefillName: string;
  onDone: () => void;
}) {
  const setSession = useStaffSession((s) => s.setSession);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Owner-mode context captured at reauth (step 1) and used for the create.
  const [selfStaff, setSelfStaff] = useState<StaffDto | null>(null);
  const [ownerTier, setOwnerTier] = useState<StaffTierDto>(
    storeKind === "showroom" ? "manager" : "principal",
  );
  const [ownerOutletId, setOwnerOutletId] = useState<string | null>(null);

  return (
    <div className="pos-proto staff-gate" data-testid="staff-setup-wizard">
      <div className="staff-gate__card">
        {step === 1 && (
          <ReauthStep
            onDone={(resp) => {
              setSession(
                resp.token,
                {
                  sid: resp.staff?.id ?? null,
                  tier: resp.tier,
                  name: resp.staff?.name ?? prefillName,
                  color: resp.staff?.color ?? null,
                  outletId: resp.outletId,
                },
                dealerId,
              );
              setSelfStaff(resp.staff);
              setOwnerTier(resp.tier);
              setOwnerOutletId(resp.outletId);
              setStep(2);
            }}
          />
        )}

        {step === 2 && (
          <IdentityStep
            selfStaff={selfStaff}
            ownerTier={ownerTier}
            ownerOutletId={
              ownerOutletId ?? (storeKind === "showroom" ? outlets[0]?.id ?? null : null)
            }
            prefillName={prefillName}
            onDone={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <ExistingStaffStep
            staff={staff.filter((s) => s.id !== selfStaff?.id)}
            onFinish={onDone}
          />
        )}
      </div>
    </div>
  );
}

/* ── Step 1 — password reauth ──────────────────────────────────────────────── */

function ReauthStep({
  onDone,
}: {
  onDone: (resp: import("@carres/shared").StaffSessionResponse) => void;
}) {
  const [password, setPassword] = useState("");
  const reauth = useStaffReauth();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    reauth.mutate(
      { password },
      { onSuccess: (resp) => onDone(resp) },
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="staff-gate__eyebrow">First-time setup · 1 of 3</div>
      <h2 className="staff-gate__title">Set up staff sign-in</h2>
      <p className="staff-gate__sub">
        Confirm your store password to begin. After this, everyone signs in with a quick 6-digit
        PIN — no more sharing the store password.
      </p>
      <div className="staff-wiz__field">
        <label className="staff-wiz__label">Store password</label>
        <input
          type="password"
          className="staff-wiz__input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="staff-reauth-password"
          autoFocus
        />
      </div>
      {reauth.isError && (
        <div className="staff-gate__err">
          {reauth.error instanceof ApiError && reauth.error.status === 401
            ? "Wrong password — try again."
            : reauth.error?.message ?? "Could not verify"}
        </div>
      )}
      <button
        type="submit"
        className="btn btn--primary btn--lg"
        style={{ width: "100%", marginTop: 8 }}
        disabled={!password || reauth.isPending}
        data-testid="staff-reauth-submit"
      >
        {reauth.isPending ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}

/* ── Step 2 — create / claim the owner's own identity ──────────────────────── */

function IdentityStep({
  selfStaff,
  ownerTier,
  ownerOutletId,
  prefillName,
  onDone,
}: {
  selfStaff: StaffDto | null;
  ownerTier: StaffTierDto;
  ownerOutletId: string | null;
  prefillName: string;
  onDone: () => void;
}) {
  const [name, setName] = useState(selfStaff?.name ?? prefillName);
  const [color, setColor] = useState<StaffColorKey>(
    (selfStaff?.color as StaffColorKey | null) ?? "flame",
  );
  const [pin, setPin] = useState<string | null>(null);
  const create = useCreateStaff();
  const setStaffPin = useSetStaffPin();
  const pending = create.isPending || setStaffPin.isPending;
  const err = create.error ?? setStaffPin.error;

  const valid = name.trim().length >= 2 && !!pin;

  function submit() {
    if (!valid || !pin) return;
    if (selfStaff) {
      // Carres already provisioned this owner row — just set its PIN.
      setStaffPin.mutate({ id: selfStaff.id, pin }, { onSuccess: () => onDone() });
    } else {
      create.mutate(
        {
          name: name.trim(),
          staffRole: ownerTier,
          color,
          pin,
          outletId: ownerTier === "principal" ? null : ownerOutletId,
        },
        { onSuccess: () => onDone() },
      );
    }
  }

  return (
    <>
      <div className="staff-gate__eyebrow">First-time setup · 2 of 3</div>
      <h2 className="staff-gate__title">You're the {TIER_LABEL[ownerTier].zh}</h2>
      <p className="staff-gate__sub">
        This is your own sign-in tile. Pick a colour and a 6-digit PIN — you'll tap your name and
        enter this PIN to open the POS.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "center", marginBottom: 18 }}>
        <span className="staff-tile__avatar" style={{ background: staffColorHex(color), width: 56, height: 56 }}>
          {staffInitials(name)}
        </span>
      </div>

      <div className="staff-wiz__field">
        <label className="staff-wiz__label">Your name</label>
        <input
          className="staff-wiz__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!!selfStaff}
          data-testid="staff-setup-name"
        />
      </div>

      <div className="staff-wiz__field">
        <label className="staff-wiz__label">Avatar colour</label>
        <div className="staff-dots">
          {(Object.keys(STAFF_COLORS) as StaffColorKey[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              className={`staff-dot ${color === key ? "is-on" : ""}`}
              style={{ background: STAFF_COLORS[key] }}
              onClick={() => setColor(key)}
              data-testid={`staff-setup-color-${key}`}
            />
          ))}
        </div>
      </div>

      <div className="staff-wiz__field">
        <label className="staff-wiz__label">Your 6-digit PIN</label>
        <PinChooser onChange={setPin} />
      </div>

      {err && <div className="staff-gate__err">{err.message}</div>}

      <button
        type="button"
        className="btn btn--primary btn--lg"
        style={{ width: "100%", marginTop: 8 }}
        disabled={!valid || pending}
        onClick={submit}
        data-testid="staff-setup-identity-submit"
      >
        {pending ? "Saving…" : "Save & continue"}
      </button>
    </>
  );
}

/* ── Step 3 — existing salesperson rows (skippable) ────────────────────────── */

function ExistingStaffStep({
  staff,
  onFinish,
}: {
  staff: StaffDto[];
  onFinish: () => void;
}) {
  if (staff.length === 0) {
    return (
      <>
        <div className="staff-gate__eyebrow">First-time setup · 3 of 3</div>
        <h2 className="staff-gate__title">You're all set</h2>
        <p className="staff-gate__sub">
          Add your salespeople anytime from the Staff button in the POS top bar. For now,
          let's get selling.
        </p>
        <button
          type="button"
          className="btn btn--primary btn--lg"
          style={{ width: "100%", marginTop: 8 }}
          onClick={onFinish}
          data-testid="staff-setup-finish"
        >
          Finish
        </button>
      </>
    );
  }

  return (
    <>
      <div className="staff-gate__eyebrow">First-time setup · 3 of 3</div>
      <h2 className="staff-gate__title">Set your team's PINs</h2>
      <p className="staff-gate__sub">
        Give each salesperson a PIN so they can sign in. You can also do this later from the
        POS Staff button — skip if you're not ready.
      </p>

      <div className="staff-outlets">
        {staff.map((s) => (
          <ExistingStaffRow key={s.id} staff={s} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button
          type="button"
          className="btn btn--ghost"
          style={{ flex: 1 }}
          onClick={onFinish}
          data-testid="staff-setup-skip"
        >
          Skip for now
        </button>
        <button
          type="button"
          className="btn btn--primary"
          style={{ flex: 1 }}
          onClick={onFinish}
          data-testid="staff-setup-done"
        >
          Done
        </button>
      </div>
    </>
  );
}

function ExistingStaffRow({ staff }: { staff: StaffDto }) {
  const [pin, setPin] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const setStaffPin = useSetStaffPin();
  const saved = setStaffPin.isSuccess;

  return (
    <div className="staff-outlet" style={{ flexDirection: "column", alignItems: "stretch", cursor: "default" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="staff-tile__avatar" style={{ background: staffColorHex(staff.color), width: 38, height: 38, fontSize: 14 }}>
          {staffInitials(staff.name)}
        </span>
        <span style={{ flex: 1 }}>
          <span className="staff-outlet__name">{staff.name}</span>
          <span className="staff-outlet__addr">
            {TIER_LABEL[staff.staffRole].zh} · {staff.hasPin ? "PIN set" : "no PIN"}
          </span>
        </span>
        {saved ? (
          <span className="staff-tile__badge" style={{ color: "var(--c-burnt)" }}>
            <Check size={13} strokeWidth={2.5} style={{ verticalAlign: "-2px" }} /> Saved
          </span>
        ) : (
          <button
            type="button"
            className="staff-gate__link"
            style={{ marginTop: 0 }}
            onClick={() => setOpen((o) => !o)}
            data-testid={`staff-setup-setpin-${staff.id}`}
          >
            {open ? "Cancel" : staff.hasPin ? "Change PIN" : "Set PIN"}
          </button>
        )}
      </div>
      {open && !saved && (
        <div style={{ marginTop: 12 }}>
          <PinChooser onChange={setPin} />
          <button
            type="button"
            className="btn btn--primary"
            style={{ width: "100%", marginTop: 10 }}
            disabled={!pin || setStaffPin.isPending}
            onClick={() => pin && setStaffPin.mutate({ id: staff.id, pin }, { onSuccess: () => setOpen(false) })}
            data-testid={`staff-setup-savepin-${staff.id}`}
          >
            {setStaffPin.isPending ? "Saving…" : "Save PIN"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Keypad-based confirmed-PIN chooser (POS look) ─────────────────────────── */

function PinChooser({ onChange }: { onChange: (pin: string | null) => void }) {
  const [phase, setPhase] = useState<"enter" | "confirm">("enter");
  const [first, setFirst] = useState("");
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  function reset() {
    setPhase("enter");
    setFirst("");
    setPin("");
    setDone(null);
    onChange(null);
  }

  function press(k: string) {
    setShake(false);
    if (k === "del") return setPin((p) => p.slice(0, -1));
    if (k === "clr") return setPin("");
    if (pin.length >= 6) return;
    const next = pin + k;
    setPin(next);
    if (next.length < 6) return;
    if (phase === "enter") {
      setFirst(next);
      setPin("");
      setPhase("confirm");
    } else if (next === first) {
      setDone(next);
      onChange(next);
    } else {
      setShake(true);
      setTimeout(() => {
        setPin("");
        setFirst("");
        setPhase("enter");
        setShake(false);
      }, 700);
      onChange(null);
    }
  }

  if (done) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <span className="staff-tile__badge" data-testid="staff-pinchooser-done">
          <Check size={13} strokeWidth={2.5} style={{ verticalAlign: "-2px" }} /> PIN set
        </span>
        <button type="button" className="staff-gate__link" style={{ marginTop: 0 }} onClick={reset}>
          Re-enter
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 12, color: "var(--fg-muted)", marginBottom: 8 }}>
        {phase === "enter" ? "Choose a PIN" : "Confirm PIN"}
      </div>
      <PinPad pin={pin} onKey={press} error={shake} testIdPrefix="staff-choose-pin" />
    </div>
  );
}
