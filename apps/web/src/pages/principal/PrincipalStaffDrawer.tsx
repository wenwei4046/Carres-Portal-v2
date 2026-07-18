import { useState } from "react";
import { X } from "lucide-react";
import type { StaffDto } from "@carres/shared";
import { useStaffList } from "@/lib/queries";
import {
  AddStaffModal,
  SetPinModal,
  StaffAvatar,
  TierBadge,
} from "@/pages/dealer/staff/staff-ui";

/**
 * PrincipalStaffDrawer (0233) — Carres HQ manages a dealer/showroom store's
 * staff: list, create (tier options respect storeKind — a showroom caps at
 * manager), and reset PINs. Reuses the same Add-staff + Set-PIN modals as the
 * store's own Settings. The internal principal JWT is treated as principal-tier
 * server-side; creates thread the target `dealerId` so RLS scopes to that store.
 */
export default function PrincipalStaffDrawer({
  dealerId,
  storeKind,
  orgName,
  onClose,
}: {
  dealerId: string;
  storeKind: "dealer" | "showroom";
  orgName: string;
  onClose: () => void;
}) {
  const staffQ = useStaffList(dealerId);
  const [showAdd, setShowAdd] = useState(false);
  const roster = staffQ.data?.staff ?? [];

  return (
    <div className="fixed inset-0 z-[100] flex justify-end" data-testid="principal-staff-drawer">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 cursor-pointer border-0 p-0"
      />
      <aside className="relative bg-white w-full max-w-[460px] h-full overflow-auto shadow-xl flex flex-col">
        <div className="px-6 pt-5 pb-4 border-b border-base-100 flex items-start justify-between gap-3">
          <div>
            <div className="kicker text-[9px]">HQ · Staff</div>
            <h2 className="font-display text-[20px] mt-1 tracking-[-0.02em] font-semibold">{orgName}</h2>
            <div className="text-[12px] text-base-600 mt-1 capitalize">
              {storeKind} · manage sign-in staff &amp; PINs
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-base-100">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="p-6 flex-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-base-700">Staff</h3>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              data-testid="principal-staff-add"
              className="px-3 py-1.5 bg-base-900 text-white text-[12px] font-semibold rounded hover:bg-base-800 cursor-pointer"
            >
              + Add staff
            </button>
          </div>

          {staffQ.isPending && <p className="text-[13px] text-base-500">Loading…</p>}
          {staffQ.error && (
            <p className="text-[13px] text-destructive">Couldn&apos;t load: {staffQ.error.message}</p>
          )}
          {staffQ.data && roster.length === 0 && (
            <p className="text-[13px] text-base-500 italic">No staff yet. Add one to enable PIN sign-in.</p>
          )}
          {roster.length > 0 && (
            <ul className="divide-y divide-base-100">
              {roster.map((s) => (
                <StaffRow key={s.id} staff={s} />
              ))}
            </ul>
          )}
        </div>
      </aside>

      {showAdd && (
        <AddStaffModal
          callerTier="principal"
          storeKind={storeKind}
          outlets={[]}
          callerOutletId={null}
          dealerId={dealerId}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

function StaffRow({ staff }: { staff: StaffDto }) {
  const [showPin, setShowPin] = useState(false);
  return (
    <li className="py-2.5 flex items-center justify-between gap-3" data-testid={`principal-staff-row-${staff.id}`}>
      <div className="flex items-center gap-3 min-w-0">
        <StaffAvatar color={staff.color} name={staff.name} size={30} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-medium text-[13px] truncate ${staff.active ? "text-base-900" : "text-base-500 line-through"}`}>
              {staff.name}
            </span>
            <TierBadge tier={staff.staffRole} />
          </div>
          <div className="text-[11px] text-base-500">
            {staff.hasPin ? "PIN set" : "未设 PIN · no PIN"}
            {!staff.active && " · inactive"}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setShowPin(true)}
        data-testid={`principal-staff-setpin-${staff.id}`}
        className="text-[11.5px] font-semibold text-base-700 hover:bg-base-100 rounded px-2 py-1 flex-shrink-0"
      >
        {staff.hasPin ? "Reset PIN" : "Set PIN"}
      </button>
      {showPin && <SetPinModal staff={staff} onClose={() => setShowPin(false)} />}
    </li>
  );
}
