import { useState } from "react";
import { toast } from "sonner";
import {
  STAFF_COLORS,
  staffPinSchema,
  type StaffColorKey,
  type StaffDto,
  type StaffGenderDto,
  type StaffTierDto,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useCreateStaff, useSetStaffPin, useVerifyPin } from "@/lib/queries";

/**
 * Shared staff-admin UI (0233) — the tier labels, colour avatar, STAFF_COLORS
 * dot picker, and the Set-PIN + Add-staff modals. Reused by the
 * dealer/showroom Settings staff section AND the principal Accounts staff
 * drawer so both surfaces create/manage staff identically. UI-KIT v4 surfaces
 * (token classes only — colour hexes come from the shared STAFF_COLORS map, so
 * no raw-hex literal ever appears here). All copy is ENGLISH ONLY (Loo
 * 2026-07-19 — no Chinese anywhere in portal UI).
 */

export const TIER_LABEL: Record<StaffTierDto, string> = {
  principal: "Owner",
  manager: "Manager",
  salesperson: "Salesperson",
};

/**
 * Loo's naming (2026-07-18) — the ladder reads differently per store kind:
 * dealer = Dealer Principal / Manager / Sales Person; showroom = Sales
 * Manager / Sales Executive (no principal — that's Carres itself).
 */
export function tierLabel(tier: StaffTierDto, storeKind: "dealer" | "showroom"): string {
  if (storeKind === "showroom") {
    if (tier === "manager") return "Sales Manager";
    if (tier === "salesperson") return "Sales Executive";
    return TIER_LABEL.principal; // unreachable — showrooms have no principal
  }
  if (tier === "principal") return "Dealer Principal";
  if (tier === "manager") return "Manager";
  return "Sales Person";
}

/** Store owner sees the whole tier ladder; a showroom's ladder caps at manager
 *  (its "principal" is Carres itself); a manager may only mint salespersons. */
export function allowedCreateTiers(
  callerTier: StaffTierDto,
  storeKind: "dealer" | "showroom",
): StaffTierDto[] {
  if (callerTier === "salesperson") return [];
  if (callerTier === "manager") return ["salesperson"];
  // principal-tier caller
  return storeKind === "showroom"
    ? ["manager", "salesperson"]
    : ["principal", "manager", "salesperson"];
}

export function staffInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Resolve a stored colour key to its hex (unknown/null → slate). */
export function staffColorHex(color: string | null | undefined): string {
  if (color && color in STAFF_COLORS) return STAFF_COLORS[color as StaffColorKey];
  return STAFF_COLORS.slate;
}

/** PIN-gate avatars only: an unchosen colour renders brand terracotta instead
 *  of admin-neutral slate — the gate is a branded surface, grey reads broken
 *  there (Loo 2026-07-19). Admin chips/lists keep the slate fallback above. */
export function staffGateColorHex(color: string | null | undefined): string {
  return color && color in STAFF_COLORS ? STAFF_COLORS[color as StaffColorKey] : "var(--c-burnt)";
}

export function StaffAvatar({
  color,
  name,
  size = 34,
}: {
  color: string | null | undefined;
  name: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: staffColorHex(color),
        fontSize: Math.round(size * 0.36),
        letterSpacing: "0.02em",
      }}
    >
      {staffInitials(name)}
    </span>
  );
}

export function TierBadge({ tier }: { tier: StaffTierDto }) {
  return (
    <span className="inline-block px-2 py-[2px] rounded bg-base-100 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-base-700">
      {TIER_LABEL[tier]}
    </span>
  );
}

/** STAFF_COLORS swatch picker — a row of coloured dots; the active one rings. */
export function ColorDotPicker({
  value,
  onChange,
}: {
  value: StaffColorKey | null;
  onChange: (c: StaffColorKey) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="staff-color-picker">
      {(Object.keys(STAFF_COLORS) as StaffColorKey[]).map((key) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            aria-label={key}
            aria-pressed={active}
            onClick={() => onChange(key)}
            data-testid={`staff-color-${key}`}
            className={`w-7 h-7 rounded-full transition-transform ${active ? "ring-2 ring-offset-2 ring-base-900 scale-110" : "hover:scale-105"}`}
            style={{ background: STAFF_COLORS[key] }}
          />
        );
      })}
    </div>
  );
}

export function ModalShell({
  title,
  subtitle,
  children,
  onClose,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer: React.ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[110] grid place-items-center p-5"
      style={{ background: "rgba(20,18,16,0.55)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded w-full max-w-[440px] max-h-[92vh] overflow-auto"
      >
        <div className="px-6 pt-5 pb-4 border-b border-base-100">
          <h2 className="font-display text-[20px] tracking-[-0.02em] font-semibold">{title}</h2>
          {subtitle && <div className="text-[12px] text-base-600 mt-1">{subtitle}</div>}
        </div>
        <div className="p-6 flex flex-col gap-4">{children}</div>
        <div className="px-6 py-4 border-t border-base-100 bg-base-50 flex justify-end gap-2">
          {footer}
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-base-700">
      {children}
    </span>
  );
}

const btnGhost =
  "px-4 py-[9px] text-[13px] font-semibold text-base-600 rounded hover:bg-base-100 cursor-pointer disabled:opacity-50";
const btnSolid =
  "px-[18px] py-[9px] bg-base-900 text-white text-[13px] font-semibold rounded hover:bg-base-800 cursor-pointer disabled:opacity-50";

/** Set / reset a 6-digit PIN (entered twice). `dealerId` scopes the roster
 *  invalidation when a principal edits another store's staff. */
export function SetPinModal({
  staff,
  onClose,
}: {
  staff: Pick<StaffDto, "id" | "name">;
  onClose: () => void;
}) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const setStaffPin = useSetStaffPin({ onSuccess: () => onClose() });

  const pinOk = staffPinSchema.safeParse(pin).success;
  const match = pin === confirm;
  const valid = pinOk && match;

  function submit() {
    if (!valid) return;
    setStaffPin.mutate(
      { id: staff.id, pin },
      {
        onSuccess: () => toast.success(`PIN set for ${staff.name}`),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not set PIN"),
      },
    );
  }

  return (
    <ModalShell
      title="Set PIN"
      subtitle={`A 6-digit PIN for ${staff.name}. They enter it to sign in and stamp their orders.`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={setStaffPin.isPending} className={btnGhost}>
            Cancel
          </button>
          <button onClick={submit} disabled={!valid || setStaffPin.isPending} className={btnSolid} data-testid="staff-pin-save">
            {setStaffPin.isPending ? "Saving…" : "Save PIN"}
          </button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5">
        <Label>New 6-digit PIN</Label>
        <input
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          data-testid="staff-pin-input"
          className="w-full px-3 py-2.5 border border-base-200 rounded text-[15px] tracking-[0.4em] font-mono bg-white outline-none focus:border-base-700"
          placeholder="••••••"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <Label>Confirm PIN</Label>
        <input
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
          data-testid="staff-pin-confirm"
          className="w-full px-3 py-2.5 border border-base-200 rounded text-[15px] tracking-[0.4em] font-mono bg-white outline-none focus:border-base-700"
          placeholder="••••••"
        />
      </label>
      {confirm.length === 6 && !match && (
        <div className="text-[12px] text-destructive">PINs don't match.</div>
      )}
      {setStaffPin.isError && (
        <div className="text-[12px] text-destructive">
          {setStaffPin.error?.message ?? "Could not set PIN"}
        </div>
      )}
    </ModalShell>
  );
}

/** Create a staff member. `callerTier` + `storeKind` limit the offered tiers;
 *  a manager caller has the outlet forced (server enforces it too). */
/**
 * Self-service PIN change (Loo 2026-07-18) — EVERY tier, including the bottom
 * one (which has no Settings access), can rotate its own PIN from the staff
 * chip. The old PIN is verified first (same lockout as the sign-in keypad:
 * 5 fails → 15 min), then the new PIN is saved via the self-scoped set-pin
 * route.
 */
export function ChangeMyPinModal({
  sid,
  name,
  onClose,
}: {
  sid: string;
  name: string;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const verify = useVerifyPin();
  const setStaffPin = useSetStaffPin();

  const busy = verify.isPending || setStaffPin.isPending;
  const valid =
    staffPinSchema.safeParse(current).success &&
    staffPinSchema.safeParse(pin).success &&
    pin === confirm &&
    pin !== current;

  function digits(v: string) {
    return v.replace(/\D/g, "").slice(0, 6);
  }

  function describeVerifyError(e: unknown): string {
    if (e instanceof ApiError) {
      const body = e.body as { error?: string; remaining?: number } | null;
      if (body?.error === "bad_pin") {
        return `Wrong current PIN${typeof body.remaining === "number" ? ` (${body.remaining} tries left)` : ""}`;
      }
      if (body?.error === "pin_locked") {
        return "Too many attempts — locked for 15 minutes, try again later";
      }
      return e.message;
    }
    return "Could not verify the current PIN";
  }

  function submit() {
    if (!valid || busy) return;
    setErr("");
    verify.mutate(
      { salespersonId: sid, pin: current },
      {
        onSuccess: () => {
          setStaffPin.mutate(
            { id: sid, pin },
            {
              onSuccess: () => {
                toast.success("PIN updated");
                onClose();
              },
              onError: (e) =>
                setErr(e instanceof ApiError ? e.message : "Could not save the new PIN"),
            },
          );
        },
        onError: (e) => setErr(describeVerifyError(e)),
      },
    );
  }

  const pinInputCls =
    "w-full px-3 py-2.5 border border-base-200 rounded text-[15px] tracking-[0.4em] font-mono bg-white outline-none focus:border-base-700";

  return (
    <ModalShell
      title="Change my PIN"
      subtitle={`${name} — verify your current PIN, then pick a new 6-digit one.`}
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
            data-testid="changepin-save"
          >
            {busy ? "Saving…" : "Update PIN"}
          </button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5">
        <Label>Current PIN</Label>
        <input
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={current}
          onChange={(e) => setCurrent(digits(e.target.value))}
          data-testid="changepin-current"
          className={pinInputCls}
          placeholder="••••••"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <Label>New PIN</Label>
        <input
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(digits(e.target.value))}
          data-testid="changepin-new"
          className={pinInputCls}
          placeholder="••••••"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <Label>Confirm new PIN</Label>
        <input
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={confirm}
          onChange={(e) => setConfirm(digits(e.target.value))}
          data-testid="changepin-confirm"
          className={pinInputCls}
          placeholder="••••••"
        />
      </label>
      {pin.length === 6 && confirm.length === 6 && pin !== confirm && (
        <div className="text-[12px] text-destructive">PINs don't match.</div>
      )}
      {pin.length === 6 && pin === current && (
        <div className="text-[12px] text-destructive">New PIN must differ from the current one.</div>
      )}
      {err && (
        <div className="text-[12px] text-destructive" data-testid="changepin-error">
          {err}
        </div>
      )}
    </ModalShell>
  );
}

const inputCls =
  "w-full px-3 py-2.5 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-base-700";
const pinCls =
  "w-full px-3 py-2.5 border border-base-200 rounded text-[15px] tracking-[0.4em] font-mono bg-white outline-none focus:border-base-700";

/**
 * Create a staff member — ONE step (Loo 2026-07-19): profile (name / email /
 * birthday / gender, all required) + role/outlet/colour + the 6-digit PIN set
 * right here, so there's no separate Set-PIN follow-up. The row's Set/Reset
 * PIN action remains for later rotations.
 */
export function AddStaffModal({
  callerTier,
  storeKind,
  outlets,
  callerOutletId,
  dealerId,
  onClose,
}: {
  callerTier: StaffTierDto;
  storeKind: "dealer" | "showroom";
  outlets: { id: string; name: string }[];
  /** Manager caller: the outlet new salespersons are forced into. */
  callerOutletId: string | null;
  /** Set when a principal creates staff for ANOTHER store (drawer). */
  dealerId?: string;
  onClose: () => void;
}) {
  const tiers = allowedCreateTiers(callerTier, storeKind);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [gender, setGender] = useState<StaffGenderDto | "">("");
  const [phone, setPhone] = useState("");
  const [staffRole, setStaffRole] = useState<StaffTierDto>(tiers[tiers.length - 1] ?? "salesperson");
  const [color, setColor] = useState<StaffColorKey>("flame");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const managerLocked = callerTier === "manager";
  const [outletId, setOutletId] = useState<string>(
    managerLocked ? (callerOutletId ?? "") : (outlets[0]?.id ?? ""),
  );
  const create = useCreateStaff();

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const pinOk = staffPinSchema.safeParse(pin).success;
  const pinMatch = pin === pinConfirm;
  const valid =
    name.trim().length >= 2 &&
    emailOk &&
    birthday.length > 0 &&
    gender !== "" &&
    tiers.includes(staffRole) &&
    pinOk &&
    pinMatch;

  function submit() {
    // `valid` already requires a gender pick — TS narrows it to male|female here.
    if (!valid) return;
    create.mutate(
      {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        birthday,
        gender,
        staffRole,
        phone: phone.trim() ? phone.trim() : undefined,
        color,
        pin,
        // Salespersons bind to an outlet; a store owner (principal tier) sees all
        // outlets, so a blank pick is legitimately "all outlets" (null).
        outletId: managerLocked
          ? (callerOutletId ?? null)
          : staffRole === "principal"
            ? null
            : (outletId || null),
        // When a principal provisions ANOTHER store (drawer), thread the target
        // dealer as a query param; own-store creates omit it (JWT dealer wins).
        dealerId,
      },
      {
        onSuccess: () => {
          toast.success(`Added ${name.trim()} — they can sign in with their PIN now`);
          onClose();
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not add staff"),
      },
    );
  }

  return (
    <ModalShell
      title="Add staff"
      subtitle="Their PIN is set right here — they'll appear on the sign-in screen immediately."
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={create.isPending} className={btnGhost}>
            Cancel
          </button>
          <button onClick={submit} disabled={!valid || create.isPending} className={btnSolid} data-testid="staff-add-save">
            {create.isPending ? "Adding…" : "Add staff"}
          </button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5">
        <Label>Full name</Label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="staff-add-name"
          autoFocus
          className={inputCls}
          placeholder="e.g. Aisha Rahman"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <Label>Email</Label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="staff-add-email"
          className={inputCls}
          placeholder="aisha@store.com"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <Label>Birthday</Label>
          <input
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            data-testid="staff-add-birthday"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>Gender</Label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as StaffGenderDto | "")}
            data-testid="staff-add-gender"
            className={inputCls}
          >
            <option value="">— select —</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <Label>Phone (optional)</Label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          data-testid="staff-add-phone"
          className={inputCls}
          placeholder="012-3456789"
        />
      </label>

      {tiers.length > 1 && (
        <label className="flex flex-col gap-1.5">
          <Label>Role</Label>
          <select
            value={staffRole}
            onChange={(e) => setStaffRole(e.target.value as StaffTierDto)}
            data-testid="staff-add-role"
            className={inputCls}
          >
            {tiers.map((t) => (
              <option key={t} value={t}>
                {tierLabel(t, storeKind)}
              </option>
            ))}
          </select>
        </label>
      )}

      {!managerLocked && staffRole !== "principal" && outlets.length > 1 && (
        <label className="flex flex-col gap-1.5">
          <Label>Outlet</Label>
          <select
            value={outletId}
            onChange={(e) => setOutletId(e.target.value)}
            data-testid="staff-add-outlet"
            className={inputCls}
          >
            <option value="">— all outlets —</option>
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-col gap-1.5">
        <Label>Avatar colour</Label>
        <ColorDotPicker value={color} onChange={setColor} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <Label>6-digit PIN</Label>
          <input
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(digits(e.target.value))}
            data-testid="staff-add-pin"
            className={pinCls}
            placeholder="••••••"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>Confirm PIN</Label>
          <input
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pinConfirm}
            onChange={(e) => setPinConfirm(digits(e.target.value))}
            data-testid="staff-add-pin-confirm"
            className={pinCls}
            placeholder="••••••"
          />
        </label>
      </div>
      {pinConfirm.length === 6 && !pinMatch && (
        <div className="text-[12px] text-destructive">PINs don&apos;t match.</div>
      )}

      {create.isError && (
        <div className="text-[12px] text-destructive">
          {create.error?.message ?? "Could not add staff"}
        </div>
      )}
    </ModalShell>
  );
}
