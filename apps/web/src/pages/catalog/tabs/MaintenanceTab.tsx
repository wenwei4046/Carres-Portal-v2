import { useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import type {
  CatalogOptionPoolDto,
  CatalogOptionPoolName,
  CatalogResponse,
  SofaCompartmentDto,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import {
  useCreateSofaCompartment,
  useUpdateSofaCompartment,
  useDeleteSofaCompartment,
  useSetCompartmentPhoto,
  useDeleteCompartmentPhoto,
} from "@/lib/queries";
import CompartmentSilhouette from "@/pages/dealer/sofa-build/CompartmentSilhouette";
import { INPUT_CLS } from "@/pages/operation/components/Modal";
import { CodeChip } from "../components/atoms";
import MaintenanceSidebar, {
  type MaintenanceSidebarGroup,
} from "../components/MaintenanceSidebar";
import PoolPanel from "./PoolPanel";

/**
 * Maintenance — 0201 reshaped to the 2990s reference layout (Loo 2026-07-05
 * screenshots): a grouped LEFT SIDEBAR with counts + ONE panel at a time.
 *
 *   PRODUCTS MAINTENANCE
 *     • Bedframe Sizes / Mattress Sizes — 0182→0201 option pools (PoolPanel:
 *       Edit-draft batch save + Effective-from + History).
 *     • Sofa Compartments — the 0178 pool (existing per-row editor, unchanged).
 *     • Supplier Categories — 0182 pool (empty mirrors 2990s' (0)).
 *
 * (Order Add-ons moved to the Special Add-ons tab's ORDER ADD-ONS section,
 * matching the 2990s sidebar. Delivery Fees moved to the top-level Delivery
 * tab, and Fabric Tiers lives only on the Fabrics tab's Fabric Pricing panel —
 * Loo 2026-07-06.)
 *
 * NOTE: the pools are GLOBAL reference lists. Per-model variant axes (the
 * actual sizes / colours / gaps / compartments a model offers) still live
 * per-model in allowed_options, edited on the Modular tab's drawer — the size
 * pools here only feed that drawer's picker as curated suggestions.
 */

type MaintKey =
  | "bedframe_size"
  | "mattress_size"
  | "compartments"
  | "supplier_category";

export default function MaintenanceTab({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const [active, setActive] = useState<MaintKey>("bedframe_size");
  const pools = catalog.optionPools ?? [];
  const byPool = (p: CatalogOptionPoolName): CatalogOptionPoolDto[] =>
    pools.filter((e) => e.pool === p);
  const activeCompartments = (catalog.sofaCompartments ?? []).filter((c) => c.active);

  const groups: MaintenanceSidebarGroup<MaintKey>[] = [
    {
      title: "Products Maintenance",
      items: [
        { key: "bedframe_size", label: "Bedframe Sizes", count: byPool("bedframe_size").length },
        { key: "mattress_size", label: "Mattress Sizes", count: byPool("mattress_size").length },
        { key: "compartments", label: "Sofa Compartments", count: activeCompartments.length },
        {
          key: "supplier_category",
          label: "Supplier Categories",
          count: byPool("supplier_category").length,
        },
      ],
    },
  ];

  return (
    <div className="flex gap-5 items-start">
      <MaintenanceSidebar groups={groups} active={active} onChange={setActive} />
      <div className="flex-1 min-w-0 max-w-[860px]">
        {active === "bedframe_size" && (
          <PoolPanel
            pool="bedframe_size"
            variant="size"
            title="Bedframe Sizes"
            description="Bedframe sizes — code · label · dimensions (e.g. K · 6FT · 183X190CM). Used in generated SKU names; each model's active sizes stay authoritative."
            entries={byPool("bedframe_size")}
            isPrincipal={isPrincipal}
          />
        )}
        {active === "mattress_size" && (
          <PoolPanel
            pool="mattress_size"
            variant="size"
            title="Mattress Sizes"
            description="Mattress sizes — code · label · dimensions. Feeds the per-model size picker as curated suggestions."
            entries={byPool("mattress_size")}
            isPrincipal={isPrincipal}
          />
        )}
        {active === "compartments" && (
          <SofaCompartmentsSection catalog={catalog} isPrincipal={isPrincipal} />
        )}
        {active === "supplier_category" && (
          <PoolPanel
            pool="supplier_category"
            variant="plain"
            title="Supplier Categories"
            description="Curated list of the product categories a supplier can cover. Reference only — supplier coverage is still set per supplier."
            entries={byPool("supplier_category")}
            isPrincipal={isPrincipal}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// (Order Add-ons CRUD moved to ./OrderAddonsSection.tsx — the Special Add-ons
// tab hosts it under ORDER ADD-ONS, mirroring the 2990s sidebar. 0201.)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 0178 — Sofa compartments (the "Base" pool) — principal-gated
// ---------------------------------------------------------------------------

function SofaCompartmentsSection({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const compartments = (catalog.sofaCompartments ?? [])
    .filter((c) => c.active)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <div className="text-strong font-display">Sofa Compartments</div>
        {isPrincipal && (
          <button type="button" onClick={() => setAdding((v) => !v)} className="btn-ghost text-meta">
            {adding ? "Close" : "+ Add compartment"}
          </button>
        )}
      </div>
      <p className="text-meta text-base-500 mb-3">
        The compartment pool (1A(LHF), 1NA, 2A(RHF), …) — a foundation catalog
        only. A sofa is assembled from these; each sofa model ticks which it
        offers in the Modular tab, and prices live on the per-model compartment
        SKUs in SKU Master (no price here). The photo shows in the sofa
        builder&apos;s cell box.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>

      {adding && isPrincipal && <SofaCompartmentAddForm onDone={() => setAdding(false)} />}

      <div className="bg-white border border-base-200 rounded-[4px] overflow-hidden">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-50 border-b border-base-200"
          style={{ gridTemplateColumns: COMPARTMENT_COLS }}
        >
          <div className="label">Code</div>
          <div className="label">Photo</div>
          <div className="label">Description</div>
          <div className="label text-right">Actions</div>
        </div>
        {compartments.length === 0 && (
          <div className="text-body text-base-500 px-3 py-4">No compartments configured.</div>
        )}
        {compartments.map((comp) => (
          <SofaCompartmentRow key={comp.id} comp={comp} isPrincipal={isPrincipal} />
        ))}
      </div>
    </section>
  );
}

/** Shared grid template for the compartment pool list (header + rows). */
const COMPARTMENT_COLS = "120px 140px minmax(160px,1.6fr) 110px";

function SofaCompartmentRow({
  comp,
  isPrincipal,
}: {
  comp: SofaCompartmentDto;
  isPrincipal: boolean;
}) {
  const patch = useUpdateSofaCompartment();
  const del = useDeleteSofaCompartment();
  const setPhoto = useSetCompartmentPhoto();
  const delPhoto = useDeleteCompartmentPhoto();

  function commitDescription(raw: string) {
    const next = raw.trim();
    if (next === (comp.description ?? "")) return;
    patch.mutate(
      { id: comp.id, patch: { description: next || null } },
      { onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Update failed") },
    );
  }
  function pickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhoto.mutate(
      { compartmentId: comp.id, file },
      {
        onSuccess: () => toast.success(`${comp.code} photo updated`),
        onError: (err: unknown) =>
          toast.error(err instanceof Error ? err.message : "Photo upload failed"),
      },
    );
  }
  function removePhoto() {
    delPhoto.mutate(comp.id, {
      onSuccess: () => toast.success(`${comp.code} photo removed`),
      onError: (err: unknown) =>
        toast.error(err instanceof ApiError ? err.message : "Photo remove failed"),
    });
  }
  function remove() {
    if (!confirm(`Disable compartment "${comp.code}"? It will drop off this list.`)) return;
    del.mutate(comp.id, {
      onSuccess: () => toast.success(`${comp.code} disabled`),
      onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Disable failed"),
    });
  }

  return (
    <div
      className="grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0"
      style={{ gridTemplateColumns: COMPARTMENT_COLS }}
      data-testid={`compartment-row-${comp.code}`}
    >
      <div>
        <CodeChip>{comp.code}</CodeChip>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center">
          <CompartmentSilhouette
            code={comp.code}
            iconUrl={comp.iconUrl}
            className="max-h-10 max-w-10"
          />
        </span>
        {isPrincipal && (
          <div className="flex flex-col items-start gap-0.5">
            <label className="btn-ghost text-label cursor-pointer">
              {setPhoto.isPending ? "Uploading…" : comp.iconUrl ? "Replace" : "Upload"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={setPhoto.isPending}
                onChange={pickPhoto}
                aria-label={`${comp.code} photo upload`}
                data-testid={`compartment-photo-input-${comp.code}`}
              />
            </label>
            {comp.iconUrl && (
              <button
                type="button"
                onClick={removePhoto}
                disabled={delPhoto.isPending}
                className="btn-danger text-label"
                aria-label={`${comp.code} remove photo`}
              >
                Remove
              </button>
            )}
          </div>
        )}
      </div>
      <input
        defaultValue={comp.description ?? ""}
        disabled={!isPrincipal}
        onBlur={(e) => commitDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={`${comp.code} description`}
        className="w-full px-2 py-1 border border-transparent hover:border-base-200 focus:border-base-400 rounded-[3px] text-body outline-none bg-transparent disabled:opacity-60"
      />
      <div className="text-right">
        {isPrincipal && (
          <button type="button" onClick={remove} disabled={del.isPending} className="btn-danger text-label">
            Disable
          </button>
        )}
      </div>
    </div>
  );
}

function SofaCompartmentAddForm({ onDone }: { onDone: () => void }) {
  const create = useCreateSofaCompartment();
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [seatCount, setSeatCount] = useState("");
  const busy = create.isPending;

  const codeValid = code.trim().length >= 1 && /^[A-Za-z0-9()\-_/. ]+$/.test(code.trim());
  const seatNum = seatCount.trim() === "" ? null : Number(seatCount);
  const valid =
    codeValid && (seatNum === null || (Number.isInteger(seatNum) && seatNum >= 0));

  async function submit() {
    if (!valid) return;
    try {
      await create.mutateAsync({
        code: code.trim(),
        description: description.trim() || null,
        seatCount: seatNum,
      });
      toast.success(`Added ${code.trim()}`);
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Add failed");
    }
  }

  return (
    <div className="bg-base-50 border border-base-200 rounded-[4px] p-4 mb-3 flex flex-wrap gap-3 items-end">
      <label className="block">
        <span className="label block mb-1">Code</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="1A(LHF)" className={`${INPUT_CLS} w-32 font-mono`} />
      </label>
      <label className="block">
        <span className="label block mb-1">Description</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="1 seat, ONE arm (left)" className={`${INPUT_CLS} w-60`} />
      </label>
      <label className="block">
        <span className="label block mb-1">Seats</span>
        <input type="number" min={0} step="1" value={seatCount} onChange={(e) => setSeatCount(e.target.value)} className={`${INPUT_CLS} w-20`} />
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={!valid || busy}
        className="btn-primary text-meta disabled:opacity-40"
        data-testid="compartment-add-submit"
      >
        {busy ? "Saving…" : "Add"}
      </button>
    </div>
  );
}
