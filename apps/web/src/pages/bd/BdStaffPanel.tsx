import { useState } from "react";
import { X } from "lucide-react";
import type { StaffDto } from "@carres/shared";
import { useOutlets, useStaffList } from "@/lib/queries";
import {
  AddStaffModal,
  EditStaffModal,
  SetPinModal,
  StaffAvatar,
  TierBadge,
} from "@/pages/dealer/staff/staff-ui";

/**
 * BdStaffPanel (2026-07-19) — BD manages a dealership's staff from the POS
 * Accounts overlay: roster, add (sales manager / sales executive / dealer
 * principal per store kind), profile edits and PIN resets. Same shared
 * Add-staff / Set-PIN / Edit modals as the store's own Staff & PINs page and
 * the HQ drawer — every create door collects the same data. The BD JWT acts
 * as principal-tier server-side; every call threads the target `dealerId`.
 */
export default function BdStaffPanel({
  dealerId,
  orgName,
  onClose,
}: {
  dealerId: string;
  orgName: string;
  onClose: () => void;
}) {
  const staffQ = useStaffList(dealerId);
  const outletsQ = useOutlets();
  const [showAdd, setShowAdd] = useState(false);
  const roster = staffQ.data?.staff ?? [];
  const storeKind = staffQ.data?.storeKind ?? "dealer";
  const dealerOutlets = (outletsQ.data?.outlets ?? [])
    .filter((o) => o.dealerId === dealerId)
    .map((o) => ({ id: o.id, name: o.name }));

  return (
    <div className="fixed inset-0 z-[100] flex justify-end" data-testid="bd-staff-panel">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 cursor-pointer border-0 p-0"
      />
      <aside className="relative bg-white w-full max-w-[460px] h-full overflow-auto shadow-xl flex flex-col">
        <div className="px-6 pt-5 pb-4 border-b border-base-100 flex items-start justify-between gap-3">
          <div>
            <div className="kicker text-label">BD · Staff</div>
            <h2 className="font-display text-title mt-1 tracking-[-0.02em] font-semibold">{orgName}</h2>
            <div className="text-meta text-base-600 mt-1 capitalize">
              {storeKind} · manage sign-in staff &amp; PINs
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-base-100">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="p-6 flex-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-label font-semibold uppercase tracking-[0.08em] text-base-700">Staff</h3>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              data-testid="bd-staff-add"
              className="px-3 py-1.5 bg-base-900 text-white text-meta font-semibold rounded hover:bg-base-800 cursor-pointer"
            >
              + Add staff
            </button>
          </div>

          {staffQ.isPending && <p className="text-body text-base-500">Loading…</p>}
          {staffQ.error && (
            <p className="text-body text-destructive">Couldn&apos;t load: {staffQ.error.message}</p>
          )}
          {staffQ.data && roster.length === 0 && (
            <p className="text-body text-base-500 italic">No staff yet. Add one to enable PIN sign-in.</p>
          )}
          {roster.length > 0 && (
            <ul className="divide-y divide-base-100">
              {roster.map((s) => (
                <StaffRow key={s.id} staff={s} dealerId={dealerId} />
              ))}
            </ul>
          )}
        </div>
      </aside>

      {showAdd && (
        <AddStaffModal
          callerTier="principal"
          storeKind={storeKind}
          outlets={dealerOutlets}
          callerOutletId={null}
          dealerId={dealerId}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

function StaffRow({ staff, dealerId }: { staff: StaffDto; dealerId: string }) {
  const [showPin, setShowPin] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  return (
    <li className="py-2.5 flex items-center justify-between gap-3" data-testid={`bd-staff-row-${staff.id}`}>
      <div className="flex items-center gap-3 min-w-0">
        <StaffAvatar color={staff.color} name={staff.name} size={30} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-medium text-body truncate ${staff.active ? "text-base-900" : "text-base-500 line-through"}`}>
              {staff.name}
            </span>
            <TierBadge tier={staff.staffRole} />
          </div>
          <div className="text-label text-base-500 truncate">
            {staff.email ?? (staff.hasPin ? "PIN set" : "No PIN")}
            {staff.email ? ` · ${staff.hasPin ? "PIN set" : "No PIN"}` : ""}
            {!staff.active && " · inactive"}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => setShowEdit(true)}
          data-testid={`bd-staff-edit-${staff.id}`}
          className="text-label font-semibold text-base-700 hover:bg-base-100 rounded px-2 py-1"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setShowPin(true)}
          data-testid={`bd-staff-setpin-${staff.id}`}
          className="text-label font-semibold text-base-700 hover:bg-base-100 rounded px-2 py-1"
        >
          {staff.hasPin ? "Reset PIN" : "Set PIN"}
        </button>
      </div>
      {showPin && <SetPinModal staff={staff} dealerId={dealerId} onClose={() => setShowPin(false)} />}
      {showEdit && <EditStaffModal staff={staff} dealerId={dealerId} onClose={() => setShowEdit(false)} />}
    </li>
  );
}
