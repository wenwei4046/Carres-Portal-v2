import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  useCreateSalesperson,
  useDealerSelf,
  useDeleteSalesperson,
  useOutlets,
  useSalespersons,
} from "@/lib/queries";

/**
 * Phase 2D — Dealer/Showroom self-service Settings.
 * V1 scope: list + add + delete salespersons. Outlets CRUD comes later
 * (most dealers have 1 outlet; principal can also seed outlets via
 * future PrincipalDealers UI).
 */
export default function DealerSettings() {
  const dealer = useDealerSelf();
  const outletsQ = useOutlets();
  const salespersonsQ = useSalespersons();

  const [showAddModal, setShowAddModal] = useState(false);

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

      <section className="rounded-md border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs uppercase tracking-[0.16em] text-muted-foreground font-semibold">
            Salespersons
          </h2>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            data-testid="add-salesperson"
            className="btn-primary text-[12px] py-1.5 px-3"
          >
            + Add salesperson
          </button>
        </div>

        {salespersonsQ.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
        {salespersonsQ.error && (
          <p className="text-sm text-destructive">Couldn&apos;t load: {salespersonsQ.error.message}</p>
        )}
        {salespersonsQ.data && salespersonsQ.data.salespersons.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No salespersons yet. Add one to start creating orders.
          </p>
        )}
        {salespersonsQ.data && salespersonsQ.data.salespersons.length > 0 && (
          <ul className="divide-y divide-border">
            {salespersonsQ.data.salespersons.map((sp) => {
              const outletName =
                outletsQ.data?.outlets.find((o) => o.id === sp.outletId)?.name ?? "—";
              return <SalespersonRow key={sp.id} sp={sp} outletName={outletName} />;
            })}
          </ul>
        )}
      </section>

      {showAddModal && (
        <AddSalespersonModal
          outlets={outletsQ.data?.outlets ?? []}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

interface SpRow {
  id:       string;
  name:     string;
  phone:    string | null;
  outletId: string | null;
}

function SalespersonRow({ sp, outletName }: { sp: SpRow; outletName: string }) {
  const del = useDeleteSalesperson();
  async function onDelete() {
    if (!confirm(`Remove "${sp.name}"? Past orders attributed to them stay but lose the link.`)) {
      return;
    }
    try {
      await del.mutateAsync(sp.id);
      toast.success(`Removed ${sp.name}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not remove");
    }
  }
  return (
    <li className="py-2.5 flex items-center justify-between gap-3" data-testid={`sp-row-${sp.id}`}>
      <div className="min-w-0">
        <div className="font-medium text-sm truncate">{sp.name}</div>
        <div className="text-[12px] text-muted-foreground">
          {outletName} · {sp.phone ?? "no phone"}
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={del.isPending}
        className="text-[12px] text-destructive hover:underline px-2 py-1"
      >
        Remove
      </button>
    </li>
  );
}

function AddSalespersonModal({
  outlets,
  onClose,
}: {
  outlets: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  // If dealer has only 1 outlet, auto-pick it. Otherwise default to first.
  const [outletId, setOutletId] = useState<string>(outlets[0]?.id ?? "");
  const create = useCreateSalesperson();

  const valid = name.trim().length >= 2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    try {
      await create.mutateAsync({
        name:     name.trim(),
        phone:    phone.trim() ? phone.trim() : null,
        outletId: outletId || null,
      });
      toast.success(`Added ${name.trim()}`);
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not create");
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 cursor-pointer border-0 p-0"
      />
      <form
        onSubmit={submit}
        className="relative bg-white rounded-md p-6 w-[420px] max-w-[92vw] shadow-xl"
      >
        <h3 className="font-display text-xl font-semibold mb-4">Add salesperson</h3>

        <label className="block mb-3">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            Full name <span className="text-destructive">*</span>
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="sp-name"
            className="w-full mt-1 px-2.5 py-2 border border-border rounded text-sm outline-none"
            placeholder="e.g. Aisha Rahman"
            autoFocus
          />
        </label>

        <label className="block mb-3">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            Phone (optional)
          </span>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            data-testid="sp-phone"
            className="w-full mt-1 px-2.5 py-2 border border-border rounded text-sm outline-none"
            placeholder="012-3456789"
          />
        </label>

        {outlets.length > 1 && (
          <label className="block mb-4">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Outlet
            </span>
            <select
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              data-testid="sp-outlet"
              className="w-full mt-1 px-2.5 py-2 border border-border rounded text-sm outline-none bg-white"
            >
              <option value="">— none —</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}

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
            data-testid="sp-submit"
            className="btn-primary"
          >
            {create.isPending ? "Adding…" : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}
