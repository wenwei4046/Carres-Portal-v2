import { useState } from "react";
import { toast } from "sonner";
import type { StaffDto, StaffTierDto } from "@carres/shared";
import { ApiError } from "@/lib/api";
import MYAddressFields from "@/components/MYAddressFields";
import { composeAddress } from "@/data/malaysia-postcodes";
import {
  useCreateOutlet,
  useDealerSelf,
  useOutlets,
  usePatchStaff,
  useStaffList,
} from "@/lib/queries";
import { useStaffSession } from "@/lib/staff";
import {
  AddStaffModal,
  allowedCreateTiers,
  SetPinModal,
  StaffAvatar,
  TierBadge,
} from "./staff/staff-ui";

/**
 * Dealer/Showroom self-service Settings.
 *
 * Staff (0233): tier badges + colour avatar + PIN status, per-row Set/Reset PIN
 * and a deactivate toggle (the FK-unsafe hard delete is gone from the UI —
 * orders reference salesperson_id, so a referenced row can't be deleted; we
 * deactivate instead). The section is hidden entirely for a salesperson-tier
 * session; a manager sees only their own outlet's salespersons + can add
 * salespersons; the Outlets section is principal-tier only.
 */
export default function DealerSettings() {
  const dealer = useDealerSelf();
  const outletsQ = useOutlets();
  const staffQ = useStaffList();

  const callerTier: StaffTierDto = useStaffSession((s) => s.staff?.tier ?? "salesperson");
  const callerOutletId = useStaffSession((s) => s.staff?.outletId ?? null);

  const [showAddStaff, setShowAddStaff] = useState(false);
  const [showAddOutletModal, setShowAddOutletModal] = useState(false);

  const storeKind = staffQ.data?.storeKind ?? "dealer";
  const outlets = outletsQ.data?.outlets ?? [];
  const canManageStaff = callerTier === "principal" || callerTier === "manager";
  const canAddStaff = allowedCreateTiers(callerTier, storeKind).length > 0;

  // Manager sees only their own outlet's salespersons; principal sees everyone.
  const roster: StaffDto[] = (staffQ.data?.staff ?? []).filter((s) => {
    if (callerTier === "principal") return true;
    return s.outletId === callerOutletId || s.outletId === null;
  });

  return (
    <div className="p-9">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Settings</p>
        <h1 className="font-display text-3xl mt-1.5 tracking-tight">Your account</h1>
      </header>

      <section className="rounded-md border border-border bg-card p-5 mb-6">
        <h2 className="text-xs uppercase tracking-[0.16em] text-muted-foreground font-semibold mb-3">
          Account
        </h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Dealer</dt>
            <dd>{dealer.data?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Region</dt>
            <dd>{dealer.data?.region ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Status</dt>
            <dd className="capitalize">{dealer.data?.status ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Deposit balance</dt>
            <dd className="font-mono">RM {(dealer.data?.depositBalance ?? 0).toLocaleString()}</dd>
          </div>
        </dl>
      </section>

      {/* Outlets — principal tier only (a manager is bound to one outlet). */}
      {callerTier === "principal" && (
        <section className="rounded-md border border-border bg-card p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs uppercase tracking-[0.16em] text-muted-foreground font-semibold">
              Outlets
            </h2>
            <button
              type="button"
              onClick={() => setShowAddOutletModal(true)}
              data-testid="add-outlet"
              className="btn-primary text-[12px] py-1.5 px-3"
            >
              + Add outlet
            </button>
          </div>
          {outletsQ.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
          {outletsQ.error && (
            <p className="text-sm text-destructive">Couldn&apos;t load: {outletsQ.error.message}</p>
          )}
          {outletsQ.data && outlets.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              No outlets yet. Add one to start creating orders.
            </p>
          )}
          {outlets.length > 0 && (
            <ul className="divide-y divide-border">
              {outlets.map((o, idx) => (
                <li
                  key={o.id}
                  className="py-2.5 flex items-start justify-between gap-3"
                  data-testid={`outlet-row-${o.id}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{o.name}</span>
                      {idx === 0 && (
                        <span className="text-[9.5px] uppercase tracking-wider text-muted-foreground bg-base-100 px-1.5 py-0.5 rounded">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">{o.address}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Staff — hidden entirely for a salesperson-tier session. */}
      {canManageStaff && (
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
      )}

      {showAddStaff && (
        <AddStaffModal
          callerTier={callerTier}
          storeKind={storeKind}
          outlets={outlets}
          callerOutletId={callerOutletId}
          onClose={() => setShowAddStaff(false)}
        />
      )}
      {showAddOutletModal && <AddOutletModal onClose={() => setShowAddOutletModal(false)} />}
    </div>
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

/**
 * 2026-05-22 (Loo) — dealer-side outlet create. Reuses MYAddressFields (the same
 * cascading picker used for SO customer address + Principal dealer-create).
 */
function AddOutletModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [addr, setAddr] = useState({
    addressLine1: "",
    addressLine2: "",
    addressState: "",
    addressCity: "",
    addressPostcode: "",
  });
  const create = useCreateOutlet();

  const valid =
    name.trim().length >= 1 &&
    addr.addressLine1.trim().length >= 5 &&
    !!addr.addressState &&
    !!addr.addressCity &&
    !!addr.addressPostcode;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const address = composeAddress({
      line1: addr.addressLine1,
      line2: addr.addressLine2,
      state: addr.addressState,
      city: addr.addressCity,
      postcode: addr.addressPostcode,
    });
    try {
      await create.mutateAsync({ name: name.trim(), address });
      toast.success(`Added outlet "${name.trim()}"`);
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not create outlet");
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-5">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 cursor-pointer border-0 p-0"
      />
      <form
        onSubmit={submit}
        className="relative bg-white rounded-md p-6 w-[520px] max-w-[92vw] max-h-[90vh] overflow-auto shadow-xl"
      >
        <h3 className="font-display text-xl font-semibold mb-1">Add outlet</h3>
        <p className="text-[11.5px] text-muted-foreground mb-4">
          A new physical location for this dealer. The first outlet is auto-created from your signup
          info; add more here when you open another branch.
        </p>

        <label className="block mb-4">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            Outlet name <span className="text-destructive">*</span>
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="outlet-name"
            className="w-full mt-1 px-2.5 py-2 border border-border rounded text-sm outline-none"
            placeholder="e.g. Mont Kiara branch"
            autoFocus
          />
        </label>

        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Outlet address
          </div>
          <MYAddressFields
            data={addr}
            onChange={(patch) => setAddr((prev) => ({ ...prev, ...patch }))}
          />
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={create.isPending}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || create.isPending}
            data-testid="outlet-submit"
            className="btn-primary disabled:opacity-50"
          >
            {create.isPending ? "Adding…" : "Add outlet"}
          </button>
        </div>
      </form>
    </div>
  );
}
