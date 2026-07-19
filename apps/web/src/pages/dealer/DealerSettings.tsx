import { useState } from "react";
import { toast } from "sonner";
import type { StaffTierDto } from "@carres/shared";
import { ApiError } from "@/lib/api";
import MYAddressFields from "@/components/MYAddressFields";
import { composeAddress } from "@/data/malaysia-postcodes";
import { useCreateOutlet, useDealerSelf, useOutlets } from "@/lib/queries";
import { useStaffSession } from "@/lib/staff";
import StaffSection from "./staff/StaffSection";

/**
 * Dealer/Showroom self-service Settings.
 *
 * Staff (0233): the shared <StaffSection> (also mounted in the POS
 * StaffManagePage overlay) — hidden entirely for a salesperson-tier session.
 * The Outlets section is principal-tier only.
 */
export default function DealerSettings() {
  const dealer = useDealerSelf();
  const outletsQ = useOutlets();

  const callerTier: StaffTierDto = useStaffSession((s) => s.staff?.tier ?? "salesperson");

  const [showAddOutletModal, setShowAddOutletModal] = useState(false);

  const outlets = outletsQ.data?.outlets ?? [];

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

      {/* Staff — the shared section; renders null for a salesperson-tier session. */}
      <StaffSection />

      {showAddOutletModal && <AddOutletModal onClose={() => setShowAddOutletModal(false)} />}
    </div>
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
