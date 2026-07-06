import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  AllowedOptions,
  CatalogFabricDto,
  CatalogResponse,
  ProductModelDto,
  ProductSkuDto,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import {
  useDeleteModelPhoto,
  useDeleteModelSofaCompartment,
  usePatchCatalogModel,
  usePatchCatalogSku,
  useSetModelPhoto,
  useToggleSizesActive,
  useUpsertModelSofaCompartment,
} from "@/lib/queries";
import { INPUT_CLS, Modal } from "@/pages/operation/components/Modal";
import { CATEGORY_LABEL, CodeChip } from "../components/atoms";

/**
 * ModelEditorModal — THE one centered Modular editor (Loo 2026-07-06: "merge
 * the two windows into one base; Modular has NO permission to create variants
 * — it can only (1) toggle ON/OFF, (2) rename, (3) edit the description,
 * (4) change the photo").
 *
 * One floating window, 2990s Allowed-Options arrangement + the model identity
 * fields on top:
 *
 *   Photo (instant) · Name · Description (draft)
 *   sofa      Seat sizes · Compartments · Leg heights · Special Add-ons ·
 *             Fabrics (series-grouped, All on/off per series)
 *   bedframe  Sizes (existing only) · Colours · Leg heights · Special
 *             Add-ons · Fabrics
 *   mattress  Sizes (existing only) · Special Add-ons
 *   all       Variant SKUs ON/OFF (existing SKUs only — prices live in
 *             SKU Master; creating SKUs lives in + New Model / SKU Master)
 *
 * DRAFT + Save: everything except the photo saves in ONE batch — a model
 * PATCH (name / blurb / allowed_options), the size-cascade endpoint when a
 * non-sofa size set changed, the sofa compartment offer/un-offer diff (which
 * auto-syncs {MODEL}-{code} SKUs), and per-SKU pos_active diffs.
 *
 * Deliberately ABSENT (no creation in Modular): + Add size, pool quick-add,
 * Generate SKUs, compartment price inputs (SKU Master owns prices), sofa
 * combos (→ Combo Pricing tab), fabric-tier money knobs (→ Fabrics tab).
 */

const CHIP_ON = "bg-primary text-white border-primary";
const CHIP_OFF = "bg-white text-base-700 border-base-300 hover:border-base-500";

function Chip({
  on,
  label,
  disabled,
  onToggle,
  testid,
}: {
  on: boolean;
  label: string;
  disabled?: boolean;
  onToggle: () => void;
  testid?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={on}
      className={`t-small font-semibold px-3 py-1 rounded-full border transition-colors disabled:opacity-50 ${on ? CHIP_ON : CHIP_OFF}`}
      data-testid={testid}
    >
      {label}
    </button>
  );
}

function SectionHead({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="t-micro text-base-500">{label}</div>
      {right}
    </div>
  );
}

function toggled(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function ModelEditorModal({
  model,
  skus,
  catalog,
  isPrincipal,
  onClose,
}: {
  model: ProductModelDto;
  skus: ProductSkuDto[];
  catalog: CatalogResponse;
  isPrincipal: boolean;
  onClose: () => void;
}) {
  const patchModel = usePatchCatalogModel();
  const toggleSizes = useToggleSizesActive();
  const upsertComp = useUpsertModelSofaCompartment();
  const delComp = useDeleteModelSofaCompartment();
  const patchSku = usePatchCatalogSku();
  const setPhoto = useSetModelPhoto();
  const delPhoto = useDeleteModelPhoto();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const isSofa = model.category === "sofa";
  const isBed = model.category === "bedframe";
  const isFlat = model.category === "accessory" || model.category === "service";

  const opts: AllowedOptions = model.allowedOptions ?? {};
  const pools = catalog.optionPools ?? [];

  /* ─── universes (EXISTING options only — no creation here) ───────────── */

  const poolValues = (name: string): string[] =>
    pools
      .filter((p) => p.pool === name && p.active)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => p.value);

  // Sofa seat sizes = the master pool. Mattress/bedframe sizes = the model's
  // OWN existing axis (saved actives ∪ materialized size variants) — never the
  // pool codes, and no add-input: creating sizes lives in + New Model / SKU
  // Master, not the Modular editor.
  const sizeUniverse = useMemo<string[]>(() => {
    if (isSofa) return poolValues("sofa_size");
    const set = new Set<string>(opts.sizes ?? []);
    for (const s of skus) if (s.variantKind === "size" && !s.discontinuedAt) set.add(s.variant);
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSofa, pools, opts.sizes, skus]);

  const compartmentUniverse = useMemo(
    () =>
      isSofa
        ? (catalog.sofaCompartments ?? [])
            .filter((c) => c.active)
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
        : [],
    [isSofa, catalog.sofaCompartments],
  );

  const legPool = isSofa
    ? poolValues("sofa_leg_height")
    : isBed
      ? poolValues("bedframe_leg_height")
      : [];

  const specialsPool = useMemo(
    () =>
      (catalog.specialAddons ?? [])
        .filter((a) => a.active && a.categories.includes(model.category))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)),
    [catalog.specialAddons, model.category],
  );

  const fabricSeries = useMemo(() => {
    if (!isSofa && !isBed) return [];
    const actives = (catalog.fabrics ?? [])
      .filter((f) => f.active)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.fabricCode.localeCompare(b.fabricCode));
    const bySeries = new Map<string, CatalogFabricDto[]>();
    for (const f of actives) {
      const key = f.series?.trim() || "Other";
      const arr = bySeries.get(key) ?? [];
      arr.push(f);
      bySeries.set(key, arr);
    }
    return Array.from(bySeries.entries()).map(([series, fabrics]) => ({ series, fabrics }));
  }, [isSofa, isBed, catalog.fabrics]);

  const offeredCompIds = useMemo(
    () =>
      (catalog.modelSofaCompartments ?? [])
        .filter((o) => o.modelId === model.id)
        .map((o) => o.compartmentId),
    [catalog.modelSofaCompartments, model.id],
  );

  // NO Variant SKUs list anywhere (Loo 2026-07-06): for mattress/bedframe the
  // Sizes chips ARE the per-size ON/OFF (they cascade pos_active); for sofa the
  // Compartments chips own it; SKU-level control lives in SKU Master. Flat
  // categories (accessory/service) keep ONE switch — Activate/Deactivate in
  // POS — which bulk-flips the model's live SKUs on Save.
  const liveSkus = useMemo(
    () => skus.filter((s) => !s.discontinuedAt && s.compartmentId == null),
    [skus],
  );
  const anyPosActive = liveSkus.some((s) => s.posActive !== false);

  /* ─── draft state (photo is the only instant op) ─────────────────────── */

  const [name, setName] = useState(model.name);
  const [blurb, setBlurb] = useState(model.blurb ?? "");
  // The size chips mirror what POS actually SELLS. POS gates a bedframe/mattress
  // size on product_skus.pos_active; allowed_options.sizes is only a cached copy
  // that can DRIFT (Loo 2026-07-06: Kayu showed every size OFF in Modular while
  // POS sold them all — allowed_options.sizes had drifted to [] while the SKUs
  // stayed pos_active=true). So seed a size ON iff it has a live SKU sold in POS.
  // Sofa seat sizes keep reading allowed_options.sizes — their POS gate IS that
  // field (gatedSofaHeights), not per-SKU pos_active.
  const [sizes, setSizes] = useState<string[]>(() => {
    if (isSofa) return opts.sizes ?? [];
    const on = new Set<string>();
    for (const s of skus) {
      if (s.variantKind === "size" && !s.discontinuedAt && s.posActive !== false) on.add(s.variant);
    }
    return [...on];
  });
  const [compIds, setCompIds] = useState<string[]>(() => offeredCompIds);
  const [legHeights, setLegHeights] = useState<string[]>(() =>
    Array.isArray(opts.leg_heights) ? opts.leg_heights : legPool,
  );
  const [specials, setSpecials] = useState<string[]>(() => opts.specials ?? []);
  const [fabrics, setFabrics] = useState<string[]>(() => opts.fabrics ?? []);
  // Flat categories — the single Activate/Deactivate-in-POS switch draft.
  const [showInPos, setShowInPos] = useState<boolean>(anyPosActive);
  const [saving, setSaving] = useState(false);

  const setFabricsBulk = (codes: string[], on: boolean) =>
    setFabrics((prev) => {
      const next = new Set(prev);
      if (on) codes.forEach((c) => next.add(c));
      else codes.forEach((c) => next.delete(c));
      return [...next];
    });

  /* ─── photo (instant — file uploads don't batch) ─────────────────────── */

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhoto.mutate(
      { modelId: model.id, file },
      {
        onSuccess: () => toast.success("Photo updated"),
        onError: (err: unknown) =>
          toast.error(err instanceof ApiError ? err.message : (err as Error).message || "Upload failed"),
      },
    );
  }

  function removePhoto() {
    if (!confirm("Remove this model photo?")) return;
    delPhoto.mutate(model.id, {
      onSuccess: () => toast.success("Photo removed"),
      onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : "Remove failed"),
    });
  }

  /* ─── save (one batch) ───────────────────────────────────────────────── */

  const nameValid = name.trim().length >= 2;

  async function save() {
    if (!nameValid) return;
    setSaving(true);
    try {
      const patch: { name?: string; blurb?: string | null; allowedOptions?: AllowedOptions } = {};
      if (name.trim() !== model.name) patch.name = name.trim();
      if (blurb.trim() !== (model.blurb ?? "")) patch.blurb = blurb.trim() || null;
      if (!isFlat) {
        patch.allowedOptions = {
          ...opts,
          sizes,
          ...(legPool.length > 0 ? { leg_heights: legHeights } : {}),
          ...(specialsPool.length > 0 ? { specials } : {}),
          ...(fabricSeries.length > 0 ? { fabrics } : {}),
        };
      }
      if (Object.keys(patch).length > 0) {
        await patchModel.mutateAsync({ id: model.id, patch });
      }
      // Non-sofa size set changed → the cascade endpoint (flips pos_active on
      // size-variant SKUs, same write the old drawer chips did).
      if (!isFlat && !isSofa && JSON.stringify(sizes) !== JSON.stringify(opts.sizes ?? [])) {
        await toggleSizes.mutateAsync({ modelId: model.id, input: { sizes } });
      }
      // Sofa compartment offer/un-offer diff (auto-syncs the compartment SKUs).
      if (isSofa) {
        const before = new Set(offeredCompIds);
        const after = new Set(compIds);
        for (const id of compIds) {
          if (!before.has(id)) {
            await upsertComp.mutateAsync({ modelId: model.id, compartmentId: id, input: {} });
          }
        }
        for (const id of offeredCompIds) {
          if (!after.has(id)) {
            await delComp.mutateAsync({ modelId: model.id, compartmentId: id });
          }
        }
      }
      // Flat categories — the single switch bulk-flips the live SKUs.
      if (isFlat && showInPos !== anyPosActive) {
        const flips = liveSkus.filter((s) => (s.posActive !== false) !== showInPos);
        const results = await Promise.allSettled(
          flips.map((s) => patchSku.mutateAsync({ id: s.id, patch: { posActive: showInPos } })),
        );
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) throw new Error(`${failed} SKU${failed === 1 ? "" : "s"} failed to update`);
      }
      toast.success("Model saved");
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : (e as Error).message || "Save failed");
      setSaving(false);
    }
  }

  /* ─── render ─────────────────────────────────────────────────────────── */

  return (
    <Modal title={model.name} onClose={onClose} size="lg">
      <div data-testid="model-editor-modal" className="flex flex-col gap-5">
        <div className="t-tiny text-base-500 -mt-4 flex items-center gap-1.5">
          {CATEGORY_LABEL[model.category]} · <CodeChip>{model.modelKey}</CodeChip>
        </div>

        {/* Photo — instant */}
        <div className="flex items-center gap-4" data-testid="model-photo">
          {model.photoUrl ? (
            <img
              src={model.photoUrl}
              alt={model.name}
              className="w-20 h-20 object-cover rounded-[6px] border border-base-200 bg-base-50"
            />
          ) : (
            <div className="w-20 h-20 rounded-[6px] border border-dashed border-base-300 bg-base-50 grid place-items-center text-base-300 text-[24px]">
              ▦
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={onPickPhoto}
              data-testid="model-photo-input"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={setPhoto.isPending}
                className="btn-secondary text-[12px]"
              >
                {setPhoto.isPending ? "Uploading…" : model.photoUrl ? "Replace photo" : "Upload photo"}
              </button>
              {model.photoUrl && (
                <button
                  type="button"
                  onClick={removePhoto}
                  disabled={delPhoto.isPending}
                  className="btn-danger text-[12px]"
                >
                  Remove
                </button>
              )}
            </div>
            <span className="t-tiny text-base-400">JPEG/PNG/WebP · auto-shrunk to ≤2 MB</span>
          </div>
        </div>

        {/* Name + Description — draft */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label block mb-1">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLS}
              data-testid="model-name-input"
            />
          </label>
          <label className="block">
            <span className="label block mb-1">Description / blurb</span>
            <input
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              placeholder="Short tagline shown to dealers"
              className={INPUT_CLS}
              data-testid="model-blurb-input"
            />
          </label>
        </div>

        {!isFlat && (
          <>
            {sizeUniverse.length > 0 && (
              <div data-testid="allowed-sizes">
                <SectionHead label={isSofa ? "Seat sizes (inches)" : "Sizes"} />
                <div className="flex flex-wrap gap-1.5">
                  {sizeUniverse.map((v) => (
                    <Chip
                      key={v}
                      on={sizes.includes(v)}
                      label={v}
                      onToggle={() => setSizes((s) => toggled(s, v))}
                      testid={`allowed-size-${v}`}
                    />
                  ))}
                </div>
                {!isSofa && (
                  <p className="t-tiny text-base-400 mt-1.5">
                    Turning a size off hides every SKU of that size from POS. New sizes are
                    created in + New Model / SKU Master, not here.
                  </p>
                )}
              </div>
            )}

            {isSofa && compartmentUniverse.length > 0 && (
              <div data-testid="allowed-compartments">
                <SectionHead
                  label="Compartments"
                  right={
                    !isPrincipal ? (
                      <span className="t-tiny text-base-400">Principal only</span>
                    ) : undefined
                  }
                />
                <div className="flex flex-wrap gap-1.5">
                  {compartmentUniverse.map((c) => (
                    <Chip
                      key={c.id}
                      on={compIds.includes(c.id)}
                      label={c.code}
                      disabled={!isPrincipal}
                      onToggle={() => setCompIds((s) => toggled(s, c.id))}
                      testid={`allowed-comp-${c.code}`}
                    />
                  ))}
                </div>
                <p className="t-tiny text-base-400 mt-1.5">
                  Ticking a compartment creates its SKU in SKU Master — set the selling
                  price there. Unticking hides it from the builder.
                </p>
              </div>
            )}

            {legPool.length > 0 && (
              <div data-testid="allowed-legs">
                <SectionHead label="Leg heights" />
                <div className="flex flex-wrap gap-1.5">
                  {legPool.map((v) => (
                    <Chip
                      key={v}
                      on={legHeights.includes(v)}
                      label={v}
                      onToggle={() => setLegHeights((s) => toggled(s, v))}
                      testid={`allowed-leg-${v}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {specialsPool.length > 0 && (
              <div data-testid="allowed-specials">
                <SectionHead label="Special Add-ons" />
                <div className="flex flex-wrap gap-1.5">
                  {specialsPool.map((a) => (
                    <Chip
                      key={a.code}
                      on={specials.includes(a.code)}
                      label={a.label}
                      onToggle={() => setSpecials((s) => toggled(s, a.code))}
                      testid={`allowed-special-${a.code}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {fabricSeries.length > 0 && (
              <div data-testid="allowed-fabrics">
                <SectionHead label="Fabrics" />
                <div className="flex flex-col gap-3">
                  {fabricSeries.map(({ series, fabrics: rows }) => {
                    const codes = rows.map((f) => f.fabricCode);
                    return (
                      <div key={series}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="t-small font-medium text-base-700">{series}</span>
                          <span className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setFabricsBulk(codes, true)}
                              className="btn-ghost text-[11px]"
                              data-testid={`allowed-fabrics-allon-${series}`}
                            >
                              All on
                            </button>
                            <button
                              type="button"
                              onClick={() => setFabricsBulk(codes, false)}
                              className="btn-ghost text-[11px]"
                            >
                              All off
                            </button>
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {rows.map((f) => (
                            <Chip
                              key={f.id}
                              on={fabrics.includes(f.fabricCode)}
                              label={f.description?.trim() || f.fabricCode}
                              onToggle={() => setFabrics((s) => toggled(s, f.fabricCode))}
                              testid={`allowed-fabric-${f.fabricCode}`}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Flat categories (accessory / service) — ONE function: Activate /
            Deactivate in POS. No option pools, no SKU list (prices + new SKUs
            live in SKU Master). */}
        {isFlat && (
          <div
            className="flex items-center justify-between gap-3 p-4 border border-base-200 rounded-[4px] bg-base-50"
            data-testid="flat-show-in-pos"
          >
            <div>
              <div className="t-small font-semibold text-base-900">Activate in POS</div>
              <div className="t-tiny text-base-500 mt-0.5">
                {showInPos
                  ? "On — sales staff can add this to an order."
                  : "Off — hidden from the POS catalog."}
                {liveSkus.length === 0 && " (No SKUs yet — add one in SKU Master first.)"}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showInPos}
              onClick={() => setShowInPos((v) => !v)}
              disabled={liveSkus.length === 0}
              className={`t-small font-semibold px-4 py-1.5 rounded-full border transition-colors disabled:opacity-50 ${showInPos ? "bg-base-900 text-white border-base-900" : CHIP_OFF}`}
              data-testid="flat-show-in-pos-switch"
            >
              {showInPos ? "On" : "Off"}
            </button>
          </div>
        )}

        {/* Footer — Cancel / Save */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-base-100">
          <button type="button" onClick={onClose} className="btn-ghost text-[12px]">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !nameValid}
            className="btn-primary text-[12px] disabled:opacity-40"
            data-testid="model-editor-save"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
