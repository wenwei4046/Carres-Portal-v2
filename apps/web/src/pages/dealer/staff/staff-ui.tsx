import { useState } from "react";
import { toast } from "sonner";
import {
  STAFF_COLORS,
  staffPinSchema,
  type StaffColorKey,
  type StaffDto,
  type StaffTierDto,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useCreateStaff, useSetStaffPin } from "@/lib/queries";

/**
 * Shared staff-admin UI (0233) — the bilingual tier labels, colour avatar,
 * STAFF_COLORS dot picker, and the Set-PIN + Add-staff modals. Reused by the
 * dealer/showroom Settings staff section AND the principal Accounts staff
 * drawer so both surfaces create/manage staff identically. UI-KIT v4 surfaces
 * (token classes only — colour hexes come from the shared STAFF_COLORS map, so
 * no raw-hex literal ever appears here).
 */

export const TIER_LABEL: Record<StaffTierDto, { zh: string; en: string }> = {
  principal: { zh: "店主", en: "Owner" },
  manager: { zh: "经理", en: "Manager" },
  salesperson: { zh: "销售", en: "Salesperson" },
};

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
  const l = TIER_LABEL[tier];
  return (
    <span className="inline-block px-2 py-[2px] rounded bg-base-100 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-base-700">
      {l.zh} · {l.en}
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

function ModalShell({
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
  const [phone, setPhone] = useState("");
  const [staffRole, setStaffRole] = useState<StaffTierDto>(tiers[tiers.length - 1] ?? "salesperson");
  const [color, setColor] = useState<StaffColorKey>("flame");
  const managerLocked = callerTier === "manager";
  const [outletId, setOutletId] = useState<string>(
    managerLocked ? (callerOutletId ?? "") : (outlets[0]?.id ?? ""),
  );
  const create = useCreateStaff();

  const valid = name.trim().length >= 2 && tiers.includes(staffRole);

  function submit() {
    if (!valid) return;
    create.mutate(
      {
        name: name.trim(),
        staffRole,
        phone: phone.trim() ? phone.trim() : undefined,
        color,
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
          toast.success(`Added ${name.trim()}`);
          onClose();
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not add staff"),
      },
    );
  }

  return (
    <ModalShell
      title="Add staff"
      subtitle="They'll appear on the PIN screen once you set their PIN."
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
          className="w-full px-3 py-2.5 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-base-700"
          placeholder="e.g. Aisha Rahman"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <Label>Phone (optional)</Label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          data-testid="staff-add-phone"
          className="w-full px-3 py-2.5 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-base-700"
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
            className="w-full px-3 py-2.5 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-base-700"
          >
            {tiers.map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t].zh} · {TIER_LABEL[t].en}
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
            className="w-full px-3 py-2.5 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-base-700"
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

      {create.isError && (
        <div className="text-[12px] text-destructive">
          {create.error?.message ?? "Could not add staff"}
        </div>
      )}
    </ModalShell>
  );
}
