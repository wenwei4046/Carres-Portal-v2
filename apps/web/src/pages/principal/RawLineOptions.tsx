import { useMemo } from "react";
import type {
  CatalogOptionPoolDto,
  CatalogResponse,
  ProductModelDto,
  ProductSkuDto,
  SpecialAddonPick,
} from "@carres/shared";
import {
  allowedFabricsFor,
  allowedPoolValues,
  fabricTierFor,
  gatedSofaSizes,
  resolveFabricDelta,
  resolveSpecialsTotal,
} from "@carres/shared";
import type { DraftLine } from "../dealer/new-order/draft";
import {
  SpecialAddonsPicker,
  offeredSpecialsFor,
  optionsFromAttrs,
  specialsFromAttrs,
} from "../dealer/new-order/special-addons-picker";
import {
  fabricDisplayName,
  sellingFabricsFor,
} from "../dealer/sofa-build/selling-fabrics";

/**
 * Inline per-row variant panel for the raw New Order form (Loo 2026-07-18 —
 * the 2990s Backend "SOFA VARIANTS" reference): picking a product brings its
 * options OUT under the row — sofa = Seat height / Fabric / Leg height;
 * bed frame = Fabric / Divan / Gap / Leg; plus a collapsible "Special orders"
 * section for the model's Modular-enabled special add-ons. Everything is
 * OPTIONAL and inline — no page jump.
 *
 * Option sources = the SAME Modular config the POS uses: `allowed_options`
 * ticks ∩ Maintenance pools (`sofa_size` / `sofa_leg_height` / `divan_height`
 * / `gap` / `bedframe_leg_height`), master Fabrics ticks (tier-priced) +
 * legacy per-model sofa fabrics, and `offeredSpecialsFor` (0181).
 *
 * Fully CONTROLLED off `line.attrs` (no local state): each change rebuilds the
 * attrs slice in the POS conventions (attrs.options[] + options_total ·
 * attrs.gap · attrs.seat_height · flat fabric_* for sofa · attrs.specials +
 * specials_total) and re-derives the SUGGESTED unit price (per-seat-height
 * base + surcharges) — which the row's price input can still override after.
 */

const SEL_CLS =
  "w-full rounded-md border border-base-300 bg-white px-2.5 py-1.5 t-small outline-none focus:border-primary";

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export default function RawLineOptions({
  line,
  model,
  sku,
  catalog,
  onPatch,
}: {
  line: DraftLine;
  model: ProductModelDto;
  sku: ProductSkuDto;
  catalog: CatalogResponse;
  onPatch: (patch: Partial<DraftLine>) => void;
}) {
  const attrs = (line.attrs ?? {}) as Record<string, unknown>;
  const pools = catalog.optionPools ?? [];
  const isSofa = model.category === "sofa";
  const isBed = model.category === "bedframe";

  // ── Option sources (Modular config ∩ Maintenance pools) ──────────────────
  const seatSizes = useMemo(() => {
    if (!isSofa) return [];
    const gated = gatedSofaSizes(model, pools);
    if (gated.length > 0) return gated;
    return Object.keys(sku.pricesBySize ?? {});
  }, [isSofa, model, pools, sku.pricesBySize]);
  const sofaLegOpts = useMemo(
    () => (isSofa ? allowedPoolValues(model, "sofa_leg_height", pools) : []),
    [isSofa, model, pools],
  );
  const sofaFabrics = useMemo(
    () =>
      isSofa
        ? sellingFabricsFor(
            model,
            (catalog.sofaFabrics ?? []).filter((f) => f.modelId === model.id),
            catalog.fabrics,
          )
        : [],
    [isSofa, model, catalog.sofaFabrics, catalog.fabrics],
  );
  const bedFabrics = useMemo(
    () => (isBed ? allowedFabricsFor(model, catalog.fabrics) : []),
    [isBed, model, catalog.fabrics],
  );
  const divanOpts = useMemo(
    () => (isBed ? allowedPoolValues(model, "divan_height", pools) : []),
    [isBed, model, pools],
  );
  const bedLegOpts = useMemo(
    () => (isBed ? allowedPoolValues(model, "bedframe_leg_height", pools) : []),
    [isBed, model, pools],
  );
  const gapChoices = useMemo(() => {
    if (!isBed) return [];
    const pool = allowedPoolValues(model, "gap", pools).map((o) => o.value);
    return pool.length > 0 ? pool : model.gaps ?? [];
  }, [isBed, model, pools]);
  const offered = useMemo(
    () => offeredSpecialsFor(model, catalog.specialAddons),
    [model, catalog.specialAddons],
  );
  const fabricTierOverride =
    (catalog.modelFabricTierOverrides ?? []).find((o) => o.modelId === model.id) ?? null;

  // ── Current values (read off attrs — the panel owns no state) ────────────
  const options = optionsFromAttrs(line.attrs);
  const optVal = (kind: string) => options.find((o) => o.kind === kind)?.value ?? "";
  const seatHeight = typeof attrs.seat_height === "string" ? attrs.seat_height : "";
  const gap = typeof attrs.gap === "string" ? attrs.gap : "";
  const sofaFabricKey =
    typeof attrs.fabric_id === "string"
      ? `sf:${attrs.fabric_id}`
      : typeof attrs.fabric_code === "string"
        ? `cf:${attrs.fabric_code}`
        : "";
  const picks: SpecialAddonPick[] = specialsFromAttrs(line.attrs)
    .filter((s): s is { code: string; choiceLabels?: string[] } => typeof s.code === "string")
    .map((s) => ({ code: s.code, choiceLabels: s.choiceLabels ?? [] }));

  // ── Write-back: rebuild attrs + re-derive the SUGGESTED unit price ────────
  function apply(next: Record<string, unknown>) {
    const opts = Array.isArray(next.options)
      ? (next.options as Array<{ surcharge?: number }>)
      : [];
    if (opts.length > 0) {
      next.options_total = Math.round(opts.reduce((s, o) => s + num(o.surcharge), 0) * 100) / 100;
    } else {
      delete next.options;
      delete next.options_total;
    }
    const nextSeat = typeof next.seat_height === "string" ? next.seat_height : "";
    const perSeat = nextSeat ? sku.pricesBySize?.[nextSeat] : null;
    const base = perSeat ?? sku.price ?? 0;
    const suggested =
      Math.round(
        (base + num(next.options_total) + num(next.fabric_surcharge) + num(next.specials_total)) *
          100,
      ) / 100;
    const cleaned = Object.fromEntries(
      Object.entries(next).filter(([, v]) => v !== "" && v !== undefined && v !== null),
    );
    onPatch({
      attrs: Object.keys(cleaned).length > 0 ? cleaned : null,
      unitPrice: Math.max(0, suggested),
    });
  }

  function setPoolOption(kind: string, value: string, list: CatalogOptionPoolDto[]) {
    const others = options.filter((o) => o.kind !== kind);
    const next: Record<string, unknown> = { ...attrs };
    if (value) {
      const row = list.find((r) => r.value === value);
      next.options = [
        ...others,
        {
          kind,
          value,
          ...(row?.label ? { label: row.label } : {}),
          surcharge: num(row?.surcharge),
        },
      ];
    } else {
      next.options = others;
    }
    apply(next);
  }

  function setSeatHeight(value: string) {
    const next: Record<string, unknown> = { ...attrs };
    if (value) next.seat_height = value;
    else delete next.seat_height;
    apply(next);
  }

  function setGap(value: string) {
    const next: Record<string, unknown> = { ...attrs };
    if (value) next.gap = value;
    else delete next.gap;
    apply(next);
  }

  function setSofaFabric(key: string) {
    const next: Record<string, unknown> = { ...attrs };
    delete next.fabric_id;
    delete next.fabric_code;
    delete next.fabric_name;
    delete next.fabric_tier;
    delete next.fabric_surcharge;
    if (key) {
      const f = sofaFabrics.find((x) => x.key === key);
      if (f) {
        const delta = resolveFabricDelta(
          f.tier,
          fabricTierOverride,
          catalog.fabricTierConfig ?? null,
        );
        if (f.id) next.fabric_id = f.id;
        if (f.code) next.fabric_code = f.code;
        next.fabric_name = f.name;
        next.fabric_tier = f.tier;
        next.fabric_surcharge = delta;
      }
    }
    apply(next);
  }

  function setBedFabric(code: string) {
    const others = options.filter((o) => o.kind !== "fabric");
    const next: Record<string, unknown> = { ...attrs };
    if (code) {
      const f = bedFabrics.find((x) => x.fabricCode === code);
      if (f) {
        const delta = resolveFabricDelta(
          fabricTierFor("bedframe", f),
          fabricTierOverride,
          catalog.fabricTierConfig ?? null,
        );
        next.options = [
          ...others,
          {
            kind: "fabric",
            value: f.fabricCode,
            label: fabricDisplayName(f.fabricCode, f.description),
            surcharge: delta,
          },
        ];
      }
    } else {
      next.options = others;
    }
    apply(next);
  }

  function setPicks(p: SpecialAddonPick[]) {
    const defsByCode = new Map(offered.map((d) => [d.code, d]));
    const { total, lines } = resolveSpecialsTotal(p, defsByCode);
    const next: Record<string, unknown> = { ...attrs };
    if (p.length > 0) {
      next.specials = lines;
      next.specials_total = total;
    } else {
      delete next.specials;
      delete next.specials_total;
    }
    apply(next);
  }

  const selects = isSofa
    ? seatSizes.length > 0 || sofaFabrics.length > 0 || sofaLegOpts.length > 0
    : isBed
      ? bedFabrics.length > 0 || divanOpts.length > 0 || bedLegOpts.length > 0 || gapChoices.length > 0
      : false;
  if (!selects && offered.length === 0) return null;

  return (
    <div
      className="mt-2 border-t border-base-100 pt-2.5"
      data-testid={`raw-options-${line.localId}`}
    >
      <p className="t-micro text-base-400 mb-1.5">
        {isSofa ? "Sofa variants" : isBed ? "Bed frame variants" : "Options"}
        <span className="normal-case tracking-normal"> · optional — KIV if not confirmed</span>
      </p>
      {selects && (
        <div className="grid gap-2 sm:grid-cols-3">
          {isSofa && seatSizes.length > 0 && (
            <MiniField label="Seat height">
              <select
                value={seatHeight}
                onChange={(e) => setSeatHeight(e.target.value)}
                aria-label="Seat height"
                className={SEL_CLS}
              >
                <option value="">KIV · to confirm</option>
                {seatSizes.map((s) => {
                  const p = sku.pricesBySize?.[s];
                  return (
                    <option key={s} value={s}>
                      {s}
                      {p != null ? ` · RM ${p.toLocaleString("en-MY")}` : ""}
                    </option>
                  );
                })}
              </select>
            </MiniField>
          )}
          {isSofa && sofaFabrics.length > 0 && (
            <MiniField label="Fabric">
              <select
                value={sofaFabricKey}
                onChange={(e) => setSofaFabric(e.target.value)}
                aria-label="Fabric"
                className={SEL_CLS}
              >
                <option value="">KIV · to confirm</option>
                {sofaFabrics.map((f) => {
                  const delta = resolveFabricDelta(
                    f.tier,
                    fabricTierOverride,
                    catalog.fabricTierConfig ?? null,
                  );
                  return (
                    <option key={f.key} value={f.key}>
                      {f.name}
                      {delta > 0 ? ` · +RM ${delta.toLocaleString("en-MY")}` : ""}
                    </option>
                  );
                })}
              </select>
            </MiniField>
          )}
          {isSofa && sofaLegOpts.length > 0 && (
            <MiniField label="Leg height">
              <select
                value={optVal("sofa_leg_height")}
                onChange={(e) => setPoolOption("sofa_leg_height", e.target.value, sofaLegOpts)}
                aria-label="Leg height"
                className={SEL_CLS}
              >
                <option value="">KIV · to confirm</option>
                {sofaLegOpts.map((o) => (
                  <option key={o.id} value={o.value}>
                    {o.value}
                    {num(o.surcharge) !== 0 ? ` · +RM ${num(o.surcharge).toLocaleString("en-MY")}` : ""}
                  </option>
                ))}
              </select>
            </MiniField>
          )}
          {isBed && bedFabrics.length > 0 && (
            <MiniField label="Fabric / finish">
              <select
                value={optVal("fabric")}
                onChange={(e) => setBedFabric(e.target.value)}
                aria-label="Fabric"
                className={SEL_CLS}
              >
                <option value="">KIV · to confirm</option>
                {bedFabrics.map((f) => {
                  const delta = resolveFabricDelta(
                    fabricTierFor("bedframe", f),
                    fabricTierOverride,
                    catalog.fabricTierConfig ?? null,
                  );
                  return (
                    <option key={f.fabricCode} value={f.fabricCode}>
                      {fabricDisplayName(f.fabricCode, f.description)}
                      {delta > 0 ? ` · +RM ${delta.toLocaleString("en-MY")}` : ""}
                    </option>
                  );
                })}
              </select>
            </MiniField>
          )}
          {isBed && divanOpts.length > 0 && (
            <MiniField label="Divan height">
              <select
                value={optVal("divan_height")}
                onChange={(e) => setPoolOption("divan_height", e.target.value, divanOpts)}
                aria-label="Divan height"
                className={SEL_CLS}
              >
                <option value="">KIV · to confirm</option>
                {divanOpts.map((o) => (
                  <option key={o.id} value={o.value}>
                    {o.value}
                    {num(o.surcharge) !== 0 ? ` · +RM ${num(o.surcharge).toLocaleString("en-MY")}` : ""}
                  </option>
                ))}
              </select>
            </MiniField>
          )}
          {isBed && gapChoices.length > 0 && (
            <MiniField label="Mattress gap">
              <select
                value={gap}
                onChange={(e) => setGap(e.target.value)}
                aria-label="Mattress gap"
                className={SEL_CLS}
              >
                <option value="">None</option>
                <option value="KIV">KIV · to confirm</option>
                {gapChoices.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </MiniField>
          )}
          {isBed && bedLegOpts.length > 0 && (
            <MiniField label="Leg height">
              <select
                value={optVal("bedframe_leg_height")}
                onChange={(e) => setPoolOption("bedframe_leg_height", e.target.value, bedLegOpts)}
                aria-label="Leg height"
                className={SEL_CLS}
              >
                <option value="">KIV · to confirm</option>
                {bedLegOpts.map((o) => (
                  <option key={o.id} value={o.value}>
                    {o.value}
                    {num(o.surcharge) !== 0 ? ` · +RM ${num(o.surcharge).toLocaleString("en-MY")}` : ""}
                  </option>
                ))}
              </select>
            </MiniField>
          )}
        </div>
      )}
      {offered.length > 0 && (
        <details className="mt-2" data-testid={`raw-specials-${line.localId}`}>
          <summary className="t-small text-base-600 cursor-pointer select-none">
            Special orders ({picks.length} selected)
          </summary>
          <div className="mt-2">
            <SpecialAddonsPicker defs={offered} value={picks} onChange={setPicks} />
          </div>
        </details>
      )}
    </div>
  );
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="t-micro text-base-400">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}
