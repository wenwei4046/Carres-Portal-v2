import { useMemo, useState } from "react";
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
  useDeleteModelSofaCompartment,
  usePatchCatalogModel,
  usePatchCatalogSku,
  useToggleSizesActive,
  useUpsertModelSofaCompartment,
} from "@/lib/queries";
import { Modal } from "@/pages/operation/components/Modal";

/**
 * Allowed Options — the CENTERED floating editor for one model's POS offering
 * (Loo 2026-07-06: "like a floating window in the middle, arranged exactly
 * like 2990s, none of the complicated stuff"). A faithful port of the 2990s
 * `ModelAllowedOptionsDrawer` ARRANGEMENT in the v17 Modal shell:
 *
 *   sofa      — Seat sizes (inches) · Compartments · Leg heights ·
 *               Special Add-ons · Fabrics (series-grouped, All on/off per series)
 *   bedframe  — Sizes · Leg heights · Special Add-ons · Fabrics
 *   mattress  — Sizes · Special Add-ons
 *   accessory / service — a single "Show in POS" switch (no option pools)
 *
 * DRAFT + Save (2990s): chip toggles mutate local state; Save writes once —
 * ONE model PATCH (allowed_options) + the sizes cascade endpoint + the sofa
 * compartment offer/un-offer diffs (which auto-sync the {MODEL}-{code} SKUs).
 *
 * Deliberately NOT here (2990s: "those stay on Backend" — our Model setup
 * drawer): photo, blurb, SKU generation, per-SKU toggles, prices, sofa combos.
 *
 * Leg-height seeding (2990s owner 2026-06-16): key ABSENT → seed every pool
 * chip ON ("offer every leg" default); key PRESENT (even []) → render the
 * saved exact set. Saving all-off is valid = "offer no legs".
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

/** Toggle a value in a string[] draft. */
function toggled(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function AllowedOptionsModal({
  model,
  skus,
  catalog,
  isPrincipal,
  onOpenSetup,
  onClose,
}: {
  model: ProductModelDto;
  skus: ProductSkuDto[];
  catalog: CatalogResponse;
  isPrincipal: boolean;
  /** Opens the full Model-setup drawer (photo / SKU generation / combos). */
  onOpenSetup: () => void;
  onClose: () => void;
}) {
  const patchModel = usePatchCatalogModel();
  const toggleSizes = useToggleSizesActive();
  const upsertComp = useUpsertModelSofaCompartment();
  const delComp = useDeleteModelSofaCompartment();
  const patchSku = usePatchCatalogSku();

  const isSofa = model.category === "sofa";
  const isBed = model.category === "bedframe";
  const isFlat = model.category === "accessory" || model.category === "service";

  const opts: AllowedOptions = model.allowedOptions ?? {};
  const pools = catalog.optionPools ?? [];

  /* ─── master pools (universe per section) ────────────────────────────── */

  const poolValues = (name: string): string[] =>
    pools
      .filter((p) => p.pool === name && p.active)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => p.value);

  // Sofa seat sizes come from the master pool (24…37 + Flat). Mattress /
  // bedframe sizes keep the model's own free-text size axis (they drive the
  // {MODEL}-SIZE SKU codes + the pos_active cascade — pool codes like "K"
  // would not match existing "King" variants), exactly what the setup drawer
  // shows: saved actives ∪ every materialized size variant.
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

  // Fabrics grouped by SERIES (2990s: chips under series headers, All on/off
  // per series). Chip text = description (else code); tick value = fabricCode.
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

  /* ─── draft state ────────────────────────────────────────────────────── */

  const offeredCompIds = useMemo(
    () =>
      (catalog.modelSofaCompartments ?? [])
        .filter((o) => o.modelId === model.id)
        .map((o) => o.compartmentId),
    [catalog.modelSofaCompartments, model.id],
  );

  const [sizes, setSizes] = useState<string[]>(() => opts.sizes ?? []);
  const [compIds, setCompIds] = useState<string[]>(() => offeredCompIds);
  // Leg seeding: absent key → every pool chip ON (2990s "offer every leg").
  const [legHeights, setLegHeights] = useState<string[]>(() =>
    Array.isArray(opts.leg_heights) ? opts.leg_heights : legPool,
  );
  const [specials, setSpecials] = useState<string[]>(() => opts.specials ?? []);
  const [fabrics, setFabrics] = useState<string[]>(() => opts.fabrics ?? []);
  const anyPosActive = skus.some((s) => s.posActive !== false && !s.discontinuedAt);
  const [showInPos, setShowInPos] = useState<boolean>(anyPosActive);
  const [saving, setSaving] = useState(false);

  const setFabricsBulk = (codes: string[], on: boolean) =>
    setFabrics((prev) => {
      const next = new Set(prev);
      if (on) codes.forEach((c) => next.add(c));
      else codes.forEach((c) => next.delete(c));
      return [...next];
    });

  /* ─── save (draft → one batch) ───────────────────────────────────────── */

  async function save() {
    setSaving(true);
    try {
      if (isFlat) {
        if (showInPos !== anyPosActive) {
          const flips = skus.filter(
            (s) => !s.discontinuedAt && (s.posActive !== false) !== showInPos,
          );
          const results = await Promise.allSettled(
            flips.map((s) => patchSku.mutateAsync({ id: s.id, patch: { posActive: showInPos } })),
          );
          const failed = results.filter((r) => r.status === "rejected").length;
          if (failed > 0) throw new Error(`${failed} SKU${failed === 1 ? "" : "s"} failed to update`);
        }
      } else {
        const allowedOptions: AllowedOptions = {
          ...opts,
          sizes,
          ...(legPool.length > 0 ? { leg_heights: legHeights } : {}),
          ...(specialsPool.length > 0 ? { specials } : {}),
          ...(fabricSeries.length > 0 ? { fabrics } : {}),
        };
        await patchModel.mutateAsync({ id: model.id, patch: { allowedOptions } });
        // Mattress/bedframe sizes ALSO cascade pos_active across size-variant
        // SKUs — the dedicated endpoint owns that (same write the setup
        // drawer's chips did). Sofa seat sizes have no size-variant SKUs, so
        // the plain allowed_options write above is the whole story.
        if (!isSofa && JSON.stringify(sizes) !== JSON.stringify(opts.sizes ?? [])) {
          await toggleSizes.mutateAsync({ modelId: model.id, input: { sizes } });
        }
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
      }
      toast.success("Allowed options saved");
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : (e as Error).message || "Save failed");
      setSaving(false);
    }
  }

  /* ─── render ─────────────────────────────────────────────────────────── */

  return (
    <Modal title={`Allowed Options · ${model.name}`} onClose={onClose} size="lg">
      <div data-testid="allowed-options-modal" className="flex flex-col gap-5">
        <p className="t-micro text-base-400 -mt-2 max-w-[620px]">
          Tick the options POS staff can pick from when configuring this model. Master
          pools live under Special Add-ons / Fabrics — add new codes there first if you
          don&apos;t see what you need.
        </p>

        {isFlat ? (
          <div className="flex items-center justify-between gap-3 p-4 border border-base-200 rounded-[4px] bg-base-50">
            <div>
              <div className="t-small font-semibold text-base-900">Show in POS</div>
              <div className="t-tiny text-base-500 mt-0.5">
                {showInPos
                  ? "On — sales staff can add this to an order."
                  : "Off — hidden from the POS catalog."}
                {skus.length === 0 && " (No SKUs yet — add one in SKU Master first.)"}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showInPos}
              onClick={() => setShowInPos((v) => !v)}
              disabled={skus.length === 0}
              className={`t-small font-semibold px-4 py-1.5 rounded-full border transition-colors disabled:opacity-50 ${showInPos ? "bg-base-900 text-white border-base-900" : CHIP_OFF}`}
              data-testid="allowed-show-in-pos"
            >
              {showInPos ? "On" : "Off"}
            </button>
          </div>
        ) : (
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

        {/* Footer — Cancel/Save (2990s) + a quiet door to the full setup drawer */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-base-100">
          <button
            type="button"
            onClick={onOpenSetup}
            className="btn-ghost text-[12px]"
            data-testid="allowed-open-setup"
          >
            Model setup (photo · SKUs · combos) →
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost text-[12px]">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="btn-primary text-[12px] disabled:opacity-40"
              data-testid="allowed-save"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
