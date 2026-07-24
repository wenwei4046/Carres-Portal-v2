import { useState } from "react";
import { toast } from "sonner";
import { branchNoun, carresLocationName, type StaffTierDto, type StoreChannel } from "@carres/shared";
import { ApiError } from "@/lib/api";
import CarresNameInput from "@/components/CarresNameInput";
import MYAddressFields from "@/components/MYAddressFields";
import { composeAddress } from "@/data/malaysia-postcodes";
import { useCreateOutlet, useOutlets, useStaffList } from "@/lib/queries";
import { useStaffSession } from "@/lib/staff";

/**
 * Branch management — list + "Add" (principal tier only; a manager is bound to
 * one branch). Moved verbatim out of the deleted back-office DealerSettings
 * page (Loo 2026-07-19: the dealer runs everything inside the POS) into the
 * StaffManagePage overlay, which is now the only front-end door for opening a
 * new branch.
 *
 * The noun follows the store kind (Loo 2026-07-19): a dealer's branch is an
 * "outlet", one of Carres' own is a "showroom". This section sits directly
 * under the Add-staff form in the same overlay, so the two must agree.
 */
export default function OutletsSection() {
  const outletsQ = useOutlets();
  const staffQ = useStaffList();
  const storeKind: StoreChannel = staffQ.data?.storeKind ?? "dealer";
  const branch = branchNoun(storeKind);
  const callerTier: StaffTierDto = useStaffSession((s) => s.staff?.tier ?? "salesperson");
  const [showAddOutletModal, setShowAddOutletModal] = useState(false);

  if (callerTier !== "principal") return null;

  const outlets = outletsQ.data?.outlets ?? [];

  return (
    <>
      <section className="rounded-md border border-border bg-card p-5 mt-6" data-testid="outlets-section">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs uppercase tracking-[0.16em] text-muted-foreground font-semibold">
            {branch}s
          </h2>
          <button
            type="button"
            onClick={() => setShowAddOutletModal(true)}
            data-testid="add-outlet"
            className="btn-primary text-[12px] py-1.5 px-3"
          >
            + Add {branch.toLowerCase()}
          </button>
        </div>
        {outletsQ.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
        {outletsQ.error && (
          <p className="text-sm text-destructive">Couldn&apos;t load: {outletsQ.error.message}</p>
        )}
        {outletsQ.data && outlets.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No {branch.toLowerCase()}s yet. Add one to start creating orders.
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

      {showAddOutletModal && (
        <AddOutletModal branch={branch} onClose={() => setShowAddOutletModal(false)} />
      )}
    </>
  );
}

/**
 * 2026-05-22 (Loo) — dealer-side outlet create. Reuses MYAddressFields (the same
 * cascading picker used for SO customer address + Principal dealer-create).
 */
function AddOutletModal({
  branch,
  onClose,
}: {
  /** "Outlet" for a dealer, "Showroom" for one of ours. */
  branch: "Outlet" | "Showroom";
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [addr, setAddr] = useState({
    addressLine1: "",
    addressLine2: "",
    addressState: "",
    addressCity: "",
    addressPostcode: "",
  });
  const create = useCreateOutlet();

  // Every new branch is "Carres <location>" — the field locks the prefix and
  // the user types only the location (Loo 2026-07-25).
  const composedName = carresLocationName(name);

  const valid =
    composedName.length >= 1 &&
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
      await create.mutateAsync({ name: composedName, address });
      toast.success(`Added ${branch.toLowerCase()} "${composedName}"`);
      onClose();
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : `Could not create ${branch.toLowerCase()}`,
      );
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
        <h3 className="font-display text-xl font-semibold mb-1">
          Add {branch.toLowerCase()}
        </h3>
        <p className="text-[11.5px] text-muted-foreground mb-4">
          A new physical location for this store. The first one is auto-created from your signup
          info; add more here when you open another branch.
        </p>

        <label className="block mb-4">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            {branch} name <span className="text-destructive">*</span>
          </span>
          <div className="mt-1">
            <CarresNameInput
              value={name}
              onChange={setName}
              placeholder="e.g. Mont Kiara"
              testId="outlet-name"
              autoFocus
            />
          </div>
          <span className="block text-[11px] text-muted-foreground mt-1">
            Saved as {composedName || `Carres …`}
          </span>
        </label>

        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            {branch} address
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
            {create.isPending ? "Adding…" : `Add ${branch.toLowerCase()}`}
          </button>
        </div>
      </form>
    </div>
  );
}
