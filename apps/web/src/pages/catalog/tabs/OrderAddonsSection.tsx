import { useState } from "react";
import { toast } from "sonner";
import type { AddonDto, ProductSkuDto } from "@carres/shared";
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
export default function OrderAddonsSection({
  addons,
  skus = [],
}: {
  addons: AddonDto[];
  /** Catalog SKUs — the linked SVC- row supplies each add-on's editable
   *  description (Loo 2026-07-12; description lives on the Service SKU). */
  skus?: ProductSkuDto[];
}) {
  const [adding, setAdding] = useState(false);
  const descBySku = new Map(skus.map((s) => [s.sku, s.description ?? ""]));

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
          style={{ gridTemplateColumns: "minmax(130px,1.1fr) minmax(150px,1.4fr) 110px 150px 100px" }}
        >
          <div className="label">Name</div>
          <div className="label">Description</div>
          <div className="label text-right">Price (RM)</div>
          <div className="label">Service SKU</div>
          <div className="label text-right">Actions</div>
        </div>
        {addons.length === 0 && (
          <div className="t-small text-base-500 px-3 py-4">No add-ons configured.</div>
        )}
        {addons.map((a) => (
          <AddonRow
            key={a.key}
            addon={a}
            description={a.serviceSku ? (descBySku.get(a.serviceSku) ?? "") : null}
          />
        ))}
      </div>
    </section>
  );
}

function AddonRow({
  addon,
  description,
}: {
  addon: AddonDto;
  /** Current description of the linked Service SKU; null = no linked SKU
   *  (e.g. the server-owned DELIVERY* rows) → the cell shows a dash. */
  description: string | null;
}) {
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
  function commitDescription(raw: string) {
    const next = raw.trim();
    if (description === null || next === (description ?? "")) return;
    patch.mutate(
      { key: addon.key, patch: { serviceDescription: next } },
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
      style={{ gridTemplateColumns: "minmax(130px,1.1fr) minmax(150px,1.4fr) 110px 150px 100px" }}
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
      {description === null ? (
        <span className="t-tiny text-base-400">—</span>
      ) : (
        <input
          key={`${addon.key}-desc-${description}`}
          defaultValue={description}
          placeholder="Add a description…"
          onBlur={(e) => commitDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          aria-label={`${addon.key} description`}
          className="w-full px-2 py-1 border border-transparent hover:border-base-200 focus:border-base-400 rounded-[3px] text-[12.5px] text-base-600 outline-none bg-transparent"
        />
      )}
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

/** Kebab-case an add-on name into its stable key: "Old mattress disposal" →
 *  "old-mattress-disposal". Non-alphanumerics collapse to single dashes. */
export function addonKeyFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function AddonAddForm({ onDone }: { onDone: () => void }) {
  const create = useCreateAddon();
  const patch = usePatchAddon();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const busy = create.isPending || patch.isPending;

  // Loo 2026-07-12 — the operator fills Name / Description / Price ONLY.
  // Key + Service SKU both derive from the name; the server also mints the
  // SVC- row in the SKU master so the link is real.
  const key = addonKeyFromName(name);
  const serviceSku = key ? `SVC-${key.toUpperCase()}` : "";

  const keyValid = /^[a-z0-9-]{2,60}$/.test(key);
  const priceNum = Number(price);
  const valid =
    keyValid && name.trim().length >= 2 && price.trim() !== "" && Number.isFinite(priceNum) && priceNum >= 0;

  async function submit() {
    if (!valid) return;
    const body = {
      key,
      name: name.trim(),
      price: priceNum,
      serviceSku,
      ...(description.trim() ? { serviceDescription: description.trim() } : {}),
    };
    try {
      await create.mutateAsync(body);
      toast.success(`Added ${name} · ${serviceSku} created in SKU Master`);
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
          patch: {
            name: body.name,
            price: body.price,
            active: true,
            serviceSku: body.serviceSku,
            ...(description.trim() ? { serviceDescription: description.trim() } : {}),
          },
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
        <span className="label block mb-1">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Old mattress disposal"
          className={`${INPUT_CLS} w-52`}
          data-testid="addon-name"
        />
      </label>
      <label className="block">
        <span className="label block mb-1">Description (optional)</span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Shown on the Service SKU in the SKU master"
          className={`${INPUT_CLS} w-64`}
          data-testid="addon-description"
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
          data-testid="addon-price"
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
      <p className="t-tiny text-base-400 basis-full" data-testid="addon-auto-preview">
        {name.trim().length >= 2 && keyValid ? (
          <>
            Auto-generated — key: <span className="font-mono">{key}</span> · Service SKU:{" "}
            <span className="font-mono">{serviceSku}</span> (created in the SKU master on Add).
          </>
        ) : name.trim().length >= 2 ? (
          <>Name needs some letters or numbers — they build the key and Service SKU.</>
        ) : (
          <>Key + Service SKU are auto-generated from the name. Re-adding a disabled add-on's name restores it.</>
        )}
      </p>
    </div>
  );
}
