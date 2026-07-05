import { useState } from "react";
import { toast } from "sonner";
import type { AddonDto } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useCreateAddon, useDeleteAddon, usePatchAddon } from "@/lib/queries";
import { INPUT_CLS } from "@/pages/operation/components/Modal";
import { CodeChip } from "../components/atoms";

/**
 * OrderAddonsSection — per-ORDER add-ons CRUD (`addons`: disposal, lift…).
 * Moved verbatim from MaintenanceTab (0201): the Special Add-ons tab now hosts
 * it under its "Order Add-ons" sidebar section, mirroring the 2990s reference.
 * Open to internal roles (operation + principal) like before — the underlying
 * addons writes are is_internal()-gated at RLS, not principal-only.
 */
export default function OrderAddonsSection({ addons }: { addons: AddonDto[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <div className="t-h4 font-display">Order Add-ons</div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="btn-ghost text-[12px]"
        >
          {adding ? "Close" : "+ Add add-on"}
        </button>
      </div>
      <p className="t-tiny text-base-500 mb-3">
        Optional services offered at checkout (e.g. disposal). Each charges
        through its linked Service SKU.
      </p>

      {adding && <AddonAddForm onDone={() => setAdding(false)} />}

      <div className="bg-white border border-base-200 rounded-[4px] overflow-hidden">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-50 border-b border-base-200"
          style={{ gridTemplateColumns: "minmax(140px,1.4fr) 120px 150px 110px" }}
        >
          <div className="label">Name</div>
          <div className="label text-right">Price (RM)</div>
          <div className="label">Service SKU</div>
          <div className="label text-right">Actions</div>
        </div>
        {addons.length === 0 && (
          <div className="t-small text-base-500 px-3 py-4">No add-ons configured.</div>
        )}
        {addons.map((a) => (
          <AddonRow key={a.key} addon={a} />
        ))}
      </div>
    </section>
  );
}

function AddonRow({ addon }: { addon: AddonDto }) {
  const patch = usePatchAddon();
  const del = useDeleteAddon();

  function commitName(raw: string) {
    const next = raw.trim();
    if (next.length < 2 || next === addon.name) return;
    patch.mutate(
      { key: addon.key, patch: { name: next } },
      { onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Update failed") },
    );
  }
  function commitPrice(raw: string) {
    const v = Number(raw.trim());
    if (!Number.isFinite(v) || v < 0 || v === addon.price) return;
    patch.mutate(
      { key: addon.key, patch: { price: v } },
      { onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Update failed") },
    );
  }
  function remove() {
    if (
      !confirm(
        `Disable add-on "${addon.name}"? It will no longer be offered at checkout and ` +
          `will drop off this list. To restore it later, "+ Add add-on" with the same key (${addon.key}).`,
      )
    )
      return;
    del.mutate(addon.key, {
      onSuccess: () => toast.success(`${addon.name} disabled`),
      onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Disable failed"),
    });
  }

  return (
    <div
      className="grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0"
      style={{ gridTemplateColumns: "minmax(140px,1.4fr) 120px 150px 110px" }}
      data-testid={`addon-row-${addon.key}`}
    >
      <input
        defaultValue={addon.name}
        onBlur={(e) => commitName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={`${addon.key} name`}
        className="w-full px-2 py-1 border border-transparent hover:border-base-200 focus:border-base-400 rounded-[3px] text-[13px] outline-none bg-transparent"
      />
      <input
        type="number"
        min={0}
        step="0.01"
        defaultValue={addon.price}
        onBlur={(e) => commitPrice(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={`${addon.key} price`}
        className={`${INPUT_CLS} text-right t-num text-[12px]`}
      />
      <div>{addon.serviceSku ? <CodeChip>{addon.serviceSku}</CodeChip> : <span className="t-tiny text-base-400">—</span>}</div>
      <div className="text-right">
        <button
          type="button"
          onClick={remove}
          disabled={del.isPending}
          className="btn-danger text-[11px]"
        >
          Disable
        </button>
      </div>
    </div>
  );
}

function AddonAddForm({ onDone }: { onDone: () => void }) {
  const create = useCreateAddon();
  const patch = usePatchAddon();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [serviceSku, setServiceSku] = useState("");
  const busy = create.isPending || patch.isPending;

  const keyValid = /^[a-z0-9-]{2,60}$/.test(key.trim());
  const priceNum = Number(price);
  const skuValid = serviceSku.trim() === "" || /^SVC-[A-Z0-9-]+$/.test(serviceSku.trim());
  const valid =
    keyValid &&
    name.trim().length >= 2 &&
    Number.isFinite(priceNum) &&
    priceNum >= 0 &&
    skuValid;

  async function submit() {
    if (!valid) return;
    const body = {
      key: key.trim(),
      name: name.trim(),
      price: priceNum,
      serviceSku: serviceSku.trim() || null,
    };
    try {
      await create.mutateAsync(body);
      toast.success(`Added ${name}`);
      onDone();
    } catch (e) {
      // The GET bundle is active-only, so a previously-disabled add-on with
      // this key is invisible here and a fresh insert hits the unique key
      // (mapPgError has no 23505 case → 500 with a "duplicate key" message).
      // Treat that as "restore": PATCH the existing row back to active + update.
      const conflict =
        e instanceof ApiError && /duplicate key|already exists|unique/i.test(e.message);
      if (!conflict) {
        toast.error(e instanceof ApiError ? e.message : "Add failed");
        return;
      }
      try {
        await patch.mutateAsync({
          key: body.key,
          patch: { name: body.name, price: body.price, active: true, serviceSku: body.serviceSku },
        });
        toast.success(`Restored ${name}`);
        onDone();
      } catch (e2) {
        toast.error(e2 instanceof ApiError ? e2.message : "Restore failed");
      }
    }
  }

  return (
    <div className="bg-base-50 border border-base-200 rounded-[4px] p-4 mb-3 flex flex-wrap gap-3 items-end">
      <label className="block">
        <span className="label block mb-1">Key (kebab-case)</span>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="dispose-mattress"
          className={`${INPUT_CLS} w-44`}
        />
      </label>
      <label className="block">
        <span className="label block mb-1">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Old mattress disposal"
          className={`${INPUT_CLS} w-52`}
        />
      </label>
      <label className="block">
        <span className="label block mb-1">Price (RM)</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={`${INPUT_CLS} w-28`}
        />
      </label>
      <label className="block">
        <span className="label block mb-1">Service SKU (optional)</span>
        <input
          value={serviceSku}
          onChange={(e) => setServiceSku(e.target.value)}
          placeholder="SVC-DISPOSE-MATTRESS"
          className={`${INPUT_CLS} w-52 font-mono`}
        />
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={!valid || busy}
        className="btn-primary text-[12px] disabled:opacity-40"
      >
        {busy ? "Saving…" : "Add"}
      </button>
      <p className="t-tiny text-base-400 basis-full">
        Re-using a disabled add-on's key restores it.
      </p>
    </div>
  );
}
