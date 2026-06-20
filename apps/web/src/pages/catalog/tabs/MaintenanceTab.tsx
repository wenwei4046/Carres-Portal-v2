import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { AddonDto, CatalogResponse } from "@carres/shared";
import { MAX_DELIVERY_FLOOR } from "@carres/shared";
import { ApiError } from "@/lib/api";
import {
  useCreateAddon,
  useDeleteAddon,
  usePatchAddon,
  usePatchFloorConfig,
  useUpdateFabricTierConfig,
} from "@/lib/queries";
import { INPUT_CLS } from "@/pages/operation/components/Modal";
import { CodeChip } from "../components/atoms";

/**
 * Maintenance (narrow) — the global catalog config that isn't per-model:
 *   • Delivery fee (floor_config singleton) — principal-only (RLS
 *     floor_write_principal), so the editor is UI-gated to principal.
 *   • Add-ons (addons) — name / price / active, with a read-only link to the
 *     Service-category SKU each add-on charges through (addons.service_sku).
 *
 * Per-model option pools (sizes / colours / gaps / compartments) live on the
 * Modular tab's drawer, since allowed_options is stored per model — there's no
 * global option-pool table in Carres.
 */
export default function MaintenanceTab({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  return (
    <div className="flex flex-col gap-8 max-w-[680px]">
      <DeliveryFeeSection catalog={catalog} isPrincipal={isPrincipal} />
      <FabricTierDeltasCard catalog={catalog} isPrincipal={isPrincipal} />
      <AddonsSection addons={catalog.addons} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delivery fee (floor_config) — principal-gated
// ---------------------------------------------------------------------------

function DeliveryFeeSection({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const patch = usePatchFloorConfig();
  const fc = catalog.floorConfig;
  const [freeUpTo, setFreeUpTo] = useState(String(fc.freeUpToFloor));
  const [perFloor, setPerFloor] = useState(String(fc.perFloorPerItem));

  // Re-sync the inputs if the bundle refetches with new floor_config values
  // (another session saved, or our own save round-tripped) so the editor never
  // shows stale numbers against a changed server state.
  useEffect(() => {
    setFreeUpTo(String(fc.freeUpToFloor));
    setPerFloor(String(fc.perFloorPerItem));
  }, [fc.freeUpToFloor, fc.perFloorPerItem]);

  const freeNum = Number(freeUpTo);
  const perNum = Number(perFloor);
  const valid =
    Number.isInteger(freeNum) &&
    freeNum >= 0 &&
    Number.isFinite(perNum) &&
    perNum >= 0;
  const dirty = freeNum !== fc.freeUpToFloor || perNum !== fc.perFloorPerItem;

  function save() {
    if (!valid || !dirty) return;
    patch.mutate(
      { freeUpToFloor: freeNum, perFloorPerItem: perNum },
      {
        onSuccess: () => toast.success("Delivery fee saved"),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Save failed"),
      },
    );
  }

  return (
    <section>
      <div className="t-h4 font-display mb-1">Delivery fee</div>
      <p className="t-tiny text-base-500 mb-3">
        Free up to a floor, then a per-floor-per-item charge. Carres does not
        stair-carry above floor {MAX_DELIVERY_FLOOR}.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>
      <div className="bg-white border border-base-200 rounded-[4px] p-4 flex flex-wrap gap-5 items-end">
        <label className="block">
          <span className="label block mb-1">Free up to floor</span>
          <input
            type="number"
            min={0}
            step="1"
            value={freeUpTo}
            disabled={!isPrincipal}
            onChange={(e) => setFreeUpTo(e.target.value)}
            className={`${INPUT_CLS} w-32 disabled:opacity-60`}
          />
        </label>
        <label className="block">
          <span className="label block mb-1">Per floor / item (RM)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={perFloor}
            disabled={!isPrincipal}
            onChange={(e) => setPerFloor(e.target.value)}
            className={`${INPUT_CLS} w-32 disabled:opacity-60`}
          />
        </label>
        {isPrincipal && (
          <button
            type="button"
            onClick={save}
            disabled={!valid || !dirty || patch.isPending}
            className="btn-primary text-[12px] disabled:opacity-40"
          >
            {patch.isPending ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Fabric tier deltas (global config) — principal-gated
// ---------------------------------------------------------------------------

/**
 * FabricTierDeltasCard — global RM premium for P2 and P3 sofa fabrics.
 * These apply to all sofa models unless a per-model override is set in the
 * Modular drawer. Principal-only write (RLS + UI gate).
 */
function FabricTierDeltasCard({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const patch = useUpdateFabricTierConfig();
  const cfg = catalog.fabricTierConfig;

  const [t2, setT2] = useState(String(cfg?.sofaTier2Delta ?? 0));
  const [t3, setT3] = useState(String(cfg?.sofaTier3Delta ?? 0));

  // Re-sync when bundle refetches (another session saved or our own save)
  useEffect(() => {
    setT2(String(cfg?.sofaTier2Delta ?? 0));
    setT3(String(cfg?.sofaTier3Delta ?? 0));
  }, [cfg?.sofaTier2Delta, cfg?.sofaTier3Delta]);

  const t2Num = Number(t2);
  const t3Num = Number(t3);
  const valid =
    Number.isFinite(t2Num) && t2Num >= 0 &&
    Number.isFinite(t3Num) && t3Num >= 0;
  const dirty =
    t2Num !== (cfg?.sofaTier2Delta ?? 0) ||
    t3Num !== (cfg?.sofaTier3Delta ?? 0);

  function save() {
    if (!valid || !dirty) return;
    patch.mutate(
      { sofaTier2Delta: t2Num, sofaTier3Delta: t3Num },
      {
        onSuccess: () => toast.success("Fabric tier deltas saved"),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Save failed"),
      },
    );
  }

  return (
    <section>
      <div className="t-h4 font-display mb-1">Fabric tier deltas</div>
      <p className="t-tiny text-base-500 mb-3">
        Global RM premium added to the base sofa price for P2 (mid) and P3 (premium) fabrics.
        P1 fabrics always carry zero delta. Per-model overrides in the Modular tab take precedence.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>
      <div className="bg-white border border-base-200 rounded-[4px] p-4 flex flex-wrap gap-5 items-end">
        <label className="block">
          <span className="label block mb-1">P2 delta (RM)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={t2}
            disabled={!isPrincipal}
            onChange={(e) => setT2(e.target.value)}
            className={`${INPUT_CLS} w-32 disabled:opacity-60`}
            data-testid="global-tier2-delta"
          />
        </label>
        <label className="block">
          <span className="label block mb-1">P3 delta (RM)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={t3}
            disabled={!isPrincipal}
            onChange={(e) => setT3(e.target.value)}
            className={`${INPUT_CLS} w-32 disabled:opacity-60`}
            data-testid="global-tier3-delta"
          />
        </label>
        {isPrincipal && (
          <button
            type="button"
            onClick={save}
            disabled={!valid || !dirty || patch.isPending}
            className="btn-primary text-[12px] disabled:opacity-40"
            data-testid="global-tier-save"
          >
            {patch.isPending ? "Saving…" : "Save"}
          </button>
        )}
      </div>
      {/* Summary pill */}
      <p className="t-tiny text-base-500 mt-2" data-testid="fabric-tier-summary">
        P2 adds <span className="font-semibold text-base-800">RM {(cfg?.sofaTier2Delta ?? 0).toFixed(2)}</span>
        &nbsp;&middot;&nbsp;
        P3 adds <span className="font-semibold text-base-800">RM {(cfg?.sofaTier3Delta ?? 0).toFixed(2)}</span>
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Add-ons CRUD
// ---------------------------------------------------------------------------

function AddonsSection({ addons }: { addons: AddonDto[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <div className="t-h4 font-display">Add-ons</div>
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
        className={`${INPUT_CLS} text-right font-mono text-[12px]`}
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
