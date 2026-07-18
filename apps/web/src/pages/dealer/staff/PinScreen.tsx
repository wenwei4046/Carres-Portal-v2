import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { StaffDto } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useVerifyPin } from "@/lib/queries";
import { useStaffSession } from "@/lib/staff";
import PinPad from "../pos/PinPad";
import { staffColorHex, staffInitials, TIER_LABEL } from "./staff-ui";

/**
 * PinScreen (0233) — the tap-your-name + 6-digit PIN sign-in for an activated
 * store. Two panes: a tile grid (colour avatar + name + tier; PIN-less tiles
 * disabled with a "未设 PIN" badge; outlet-filtered) and, once a tile is
 * tapped, the shared PinPad keypad. A verified PIN mints the staff token
 * (stored in `useStaffSession`), which flips StaffGate to render the app.
 *
 * Tiles are filtered to the working outlet: a member's own outlet matches, an
 * outlet-less member (principal / floater) always shows, and a principal-tier
 * member shows in every outlet (they own the store).
 */
export default function PinScreen({
  staff,
  sessionOutletId,
  dealerId,
  outletLabel,
  onForgotPin,
}: {
  staff: StaffDto[];
  sessionOutletId: string | null;
  dealerId: string | null;
  outletLabel?: string | null;
  onForgotPin: () => void;
}) {
  const setSession = useStaffSession((s) => s.setSession);
  const [picked, setPicked] = useState<StaffDto | null>(null);

  const visible = useMemo(
    () =>
      staff.filter(
        (s) =>
          s.active &&
          (s.staffRole === "principal" ||
            s.outletId === null ||
            sessionOutletId === null ||
            s.outletId === sessionOutletId),
      ),
    [staff, sessionOutletId],
  );

  if (picked) {
    return (
      <StaffKeypad
        staff={picked}
        dealerId={dealerId}
        onBack={() => setPicked(null)}
        onVerified={(token, s) =>
          setSession(
            token,
            {
              sid: s?.id ?? null,
              tier: s?.staffRole ?? picked.staffRole,
              name: s?.name ?? picked.name,
              color: s?.color ?? picked.color,
              outletId: s?.outletId ?? picked.outletId,
            },
            dealerId,
          )
        }
        onForgotPin={onForgotPin}
      />
    );
  }

  return (
    <div className="staff-gate" data-testid="staff-pin-screen">
      <div className="staff-gate__card">
        <div className="staff-gate__eyebrow">{outletLabel || "Sign in"}</div>
        <h2 className="staff-gate__title">Tap your name</h2>
        <p className="staff-gate__sub">
          Enter your 6-digit PIN to start. Every order is recorded under you.
        </p>

        {visible.length === 0 ? (
          <p className="staff-gate__notice">
            No staff set up for this outlet yet. Ask the owner to add you in Settings.
          </p>
        ) : (
          <div className="staff-tiles">
            {visible.map((s) => (
              <button
                key={s.id}
                type="button"
                className="staff-tile"
                disabled={!s.hasPin}
                onClick={() => setPicked(s)}
                data-testid={`staff-tile-${s.id}`}
              >
                <span
                  className="staff-tile__avatar"
                  style={{ background: staffColorHex(s.color) }}
                >
                  {staffInitials(s.name)}
                </span>
                <span className="staff-tile__name">{s.name}</span>
                <span className="staff-tile__tier">
                  {TIER_LABEL[s.staffRole].zh} · {TIER_LABEL[s.staffRole].en}
                </span>
                {!s.hasPin && <span className="staff-tile__badge">未设 PIN</span>}
              </button>
            ))}
          </div>
        )}

        <button type="button" className="staff-gate__link" onClick={onForgotPin} data-testid="staff-forgot-pin">
          Forgot PIN? Owner can reset it
        </button>
      </div>
    </div>
  );
}

function StaffKeypad({
  staff,
  dealerId,
  onBack,
  onVerified,
  onForgotPin,
}: {
  staff: StaffDto;
  dealerId: string | null;
  onBack: () => void;
  onVerified: (token: string, staff: StaffDto | null) => void;
  onForgotPin: () => void;
}) {
  const verify = useVerifyPin();
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [message, setMessage] = useState("");
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Countdown ticker while locked — re-enables the pad when the window passes.
  useEffect(() => {
    if (lockedUntil === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);
  const lockedSecs = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;
  const locked = lockedSecs > 0;

  function doVerify(entered: string) {
    verify.mutate(
      { salespersonId: staff.id, pin: entered },
      {
        onSuccess: (resp) => onVerified(resp.token, resp.staff),
        onError: (e) => {
          setShake(true);
          setTimeout(() => {
            setPin("");
            setShake(false);
          }, 600);
          const body = e instanceof ApiError ? (e.body as Record<string, unknown> | null) : null;
          const code = body?.error;
          if (code === "pin_locked" && typeof body?.lockedUntil === "string") {
            const until = Date.parse(body.lockedUntil);
            setLockedUntil(Number.isNaN(until) ? Date.now() + 15 * 60_000 : until);
            setNow(Date.now());
            setMessage("Too many tries — locked for a few minutes.");
          } else if (code === "bad_pin") {
            const remaining = typeof body?.remaining === "number" ? body.remaining : null;
            setMessage(remaining !== null ? `Wrong PIN · ${remaining} tries left` : "Wrong PIN");
          } else if (code === "no_pin") {
            setMessage("No PIN set — ask the owner to set one.");
          } else {
            setMessage(e instanceof ApiError ? e.message : "Could not verify");
          }
        },
      },
    );
  }

  function press(k: string) {
    if (locked || verify.isPending) return;
    setMessage("");
    if (k === "del") return setPin((p) => p.slice(0, -1));
    if (k === "clr") return setPin("");
    if (pin.length >= 6) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 6) doVerify(next);
  }

  return (
    <div className="staff-gate" data-testid="staff-pin-keypad">
      <div className="staff-gate__card staff-gate__card--narrow">
        <button className="icon-btn pin-gate__close" onClick={onBack} aria-label="Back" data-testid="staff-pin-back">
          <X size={16} strokeWidth={1.75} />
        </button>
        <span
          className="staff-tile__avatar"
          style={{ background: staffColorHex(staff.color), width: 56, height: 56, margin: "0 auto 14px" }}
        >
          {staffInitials(staff.name)}
        </span>
        <div className="staff-gate__eyebrow">
          {TIER_LABEL[staff.staffRole].zh} · {TIER_LABEL[staff.staffRole].en}
        </div>
        <h2 className="staff-gate__title">{staff.name}</h2>
        <p className="staff-gate__sub">
          {locked ? `Locked · try again in ${lockedSecs}s` : "Enter your 6-digit PIN"}
        </p>

        <PinPad pin={pin} onKey={press} error={shake} testIdPrefix="staff-pin" disabled={locked || verify.isPending} />

        <div className="staff-gate__err" data-testid="staff-pin-message">
          {message}
        </div>

        <button type="button" className="staff-gate__link" onClick={onForgotPin}>
          Forgot PIN? Owner can reset it
        </button>
      </div>
    </div>
  );
}
