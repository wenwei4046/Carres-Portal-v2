import { useState } from "react";
import { toast } from "sonner";
import type { StaffDto, StaffTierDto } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useOutlets, usePatchStaff, useStaffList } from "@/lib/queries";
import { useStaffSession } from "@/lib/staff";
import {
  AddStaffModal,
  allowedCreateTiers,
  SetPinModal,
  StaffAvatar,
  TierBadge,
} from "./staff-ui";

/**
 * Staff & PINs management section (0233) — tier badges + colour avatar + PIN
 * status, per-row Set/Reset PIN and a deactivate toggle (the FK-unsafe hard
 * delete is gone from the UI — orders reference salesperson_id, so a
 * referenced row can't be deleted; we deactivate instead). Renders null for a
 * salesperson-tier session; a manager sees only their own outlet's
 * salespersons + can add salespersons.
 *
 * Extracted from the (since-deleted) back-office DealerSettings page
 * (2026-07-19, Loo: the POS had no way to add staff); now mounted only in the
 * in-POS StaffManagePage overlay.
 */
export default function StaffSection() {
  const outletsQ = useOutlets();
  const staffQ = useStaffList();

  const callerTier: StaffTierDto = useStaffSession((s) => s.staff?.tier ?? "salesperson");
  const callerOutletId = useStaffSession((s) => s.staff?.outletId ?? null);

  const [showAddStaff, setShowAddStaff] = useState(false);

  const storeKind = staffQ.data?.storeKind ?? "dealer";
  const outlets = outletsQ.data?.outlets ?? [];
  const canManageStaff = callerTier === "principal" || callerTier === "manager";
  const canAddStaff = allowedCreateTiers(callerTier, storeKind).length > 0;

  // Manager sees only their own outlet's salespersons; principal sees everyone.
  const roster: StaffDto[] = (staffQ.data?.staff ?? []).filter((s) => {
    if (callerTier === "principal") return true;
    return s.outletId === callerOutletId || s.outletId === null;
  });

  if (!canManageStaff) return null;

  return (
    <>
      <section className="rounded-md border border-border bg-card p-5" data-testid="staff-section">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs uppercase tracking-[0.16em] text-muted-foreground font-semibold">
            Staff &amp; PINs
          </h2>
          {canAddStaff && (
            <button
              type="button"
              onClick={() => setShowAddStaff(true)}
              data-testid="add-staff"
              className="btn-primary text-[12px] py-1.5 px-3"
            >
              + Add staff
            </button>
          )}
        </div>

        {staffQ.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
        {staffQ.error && (
          <p className="text-sm text-destructive">Couldn&apos;t load: {staffQ.error.message}</p>
        )}
        {staffQ.data && roster.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No staff yet. Add one so they can sign in with a PIN.
          </p>
        )}
        {roster.length > 0 && (
          <ul className="divide-y divide-border">
            {roster.map((s) => {
              const outletName =
                outlets.find((o) => o.id === s.outletId)?.name ?? "All outlets";
              return (
                <StaffRow key={s.id} staff={s} outletName={outletName} callerTier={callerTier} />
              );
            })}
          </ul>
        )}
      </section>

      {showAddStaff && (
        <AddStaffModal
          callerTier={callerTier}
          storeKind={storeKind}
          outlets={outlets}
          callerOutletId={callerOutletId}
          onClose={() => setShowAddStaff(false)}
        />
      )}
    </>
  );
}

function StaffRow({
  staff,
  outletName,
  callerTier,
}: {
  staff: StaffDto;
  outletName: string;
  callerTier: StaffTierDto;
}) {
  const [showPin, setShowPin] = useState(false);
  const patch = usePatchStaff();

  // A manager may only touch salespersons; a principal may touch anyone.
  const canEdit = callerTier === "principal" || staff.staffRole === "salesperson";

  function toggleActive() {
    const next = !staff.active;
    if (!next && !confirm(`Deactivate ${staff.name}? They won't be able to sign in. Their past orders stay.`)) {
      return;
    }
    patch.mutate(
      { id: staff.id, patch: { active: next } },
      {
        onSuccess: () => toast.success(next ? `Reactivated ${staff.name}` : `Deactivated ${staff.name}`),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not update"),
      },
    );
  }

  return (
    <li className="py-2.5 flex items-center justify-between gap-3" data-testid={`staff-row-${staff.id}`}>
      <div className="flex items-center gap-3 min-w-0">
        <StaffAvatar color={staff.color} name={staff.name} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-medium text-sm truncate ${staff.active ? "" : "text-muted-foreground line-through"}`}>
              {staff.name}
            </span>
            <TierBadge tier={staff.staffRole} />
          </div>
          <div className="text-[12px] text-muted-foreground">
            {outletName} · {staff.hasPin ? "PIN set" : "未设 PIN · no PIN"}
            {!staff.active && " · inactive"}
          </div>
        </div>
      </div>
      {canEdit && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowPin(true)}
            data-testid={`staff-setpin-${staff.id}`}
            className="text-[12px] font-semibold text-base-700 hover:bg-base-100 rounded px-2 py-1"
          >
            {staff.hasPin ? "Reset PIN" : "Set PIN"}
          </button>
          <button
            type="button"
            onClick={toggleActive}
            disabled={patch.isPending}
            data-testid={`staff-toggle-${staff.id}`}
            className={`text-[12px] font-semibold rounded px-2 py-1 hover:bg-base-100 disabled:opacity-50 ${staff.active ? "text-destructive" : "text-success"}`}
          >
            {staff.active ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      )}
      {showPin && <SetPinModal staff={staff} onClose={() => setShowPin(false)} />}
    </li>
  );
}
