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
  gatedSofaSizes,
  resolveSpecialsTotal,
} from "@carres/shared";
import type { SpecialAddonDto } from "@carres/shared";
import type { DraftLine } from "../dealer/new-order/draft";
import {
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
 * / `gap` / `bedframe_leg_height`), master Fabrics ticks + legacy per-model
 * sofa fabrics, and `offeredSpecialsFor` (0181).
 *
 * NO MONEY ANYWHERE (Loo 2026-07-18, second pass): the dropdowns show NO
 * price hints, a selection NEVER touches the row's unit price (the operator's
 * typed figure is the only price), and the attrs written to the sales order
 * carry ONLY the spec choices (kind/value/label) — no surcharge / total
 * figures ride the API. Fully CONTROLLED off `line.attrs` (no local state).
 */

const SEL_CLS =
  "w-full rounded-md border border-base-300 bg-white px-2.5 py-1.5 text-body outline-none focus:border-primary";

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
    // Fallback AXIS only (never prices): the sku's own per-size keys.
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

  /** Write attrs back — SPECS ONLY, never money, never the unit price. */
  function apply(next: Record<string, unknown>) {
    if (Array.isArray(next.options) && next.options.length === 0) delete next.options;
    const cleaned = Object.fromEntries(
      Object.entries(next).filter(([, v]) => v !== "" && v !== undefined && v !== null),
    );
    onPatch({ attrs: Object.keys(cleaned).length > 0 ? cleaned : null });
  }

  function setPoolOption(kind: string, value: string, list: CatalogOptionPoolDto[]) {
    const others = options.filter((o) => o.kind !== kind);
    const next: Record<string, unknown> = { ...attrs };
    if (value) {
      const row = list.find((r) => r.value === value);
      next.options = [...others, { kind, value, ...(row?.label ? { label: row.label } : {}) }];
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
        if (f.id) next.fabric_id = f.id;
        if (f.code) next.fabric_code = f.code;
        next.fabric_name = f.name;
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
        next.options = [
          ...others,
          {
            kind: "fabric",
            value: f.fabricCode,
            label: fabricDisplayName(f.fabricCode, f.description),
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
    // Resolver used for canonical labels/descriptions ONLY — the money it
    // returns is dropped (raw lines carry no option prices).
    const { lines } = resolveSpecialsTotal(p, defsByCode);
    const next: Record<string, unknown> = { ...attrs };
    if (p.length > 0) {
      next.specials = lines.map(({ code, label, soDescription, choiceLabels }) => ({
        code,
        label,
        ...(soDescription ? { soDescription } : {}),
        ...(choiceLabels && choiceLabels.length > 0 ? { choiceLabels } : {}),
      }));
    } else {
      delete next.specials;
    }
    delete next.specials_total;
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
      <p className="text-label uppercase tracking-[0.05em] text-base-400 mb-1.5">
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
                {seatSizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
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
                {sofaFabrics.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.name}
                  </option>
                ))}
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
                {bedFabrics.map((f) => (
                  <option key={f.fabricCode} value={f.fabricCode}>
                    {fabricDisplayName(f.fabricCode, f.description)}
                  </option>
                ))}
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
                  </option>
                ))}
              </select>
            </MiniField>
          )}
        </div>
      )}
      {offered.length > 0 && (
        <details className="mt-2" data-testid={`raw-specials-${line.localId}`}>
          <summary className="text-body text-base-600 cursor-pointer select-none">
            Special orders ({picks.length} selected)
          </summary>
          <div className="mt-2">
            <RawSpecialsPicker defs={offered} value={picks} onChange={setPicks} />
          </div>
        </details>
      )}
    </div>
  );
}

/** Price-FREE twin of the POS `SpecialAddonsPicker` (same toggle + follow-up
 *  behaviour, but no +RM anywhere — raw lines carry no option money). */
function RawSpecialsPicker({
  defs,
  value,
  onChange,
}: {
  defs: SpecialAddonDto[];
  value: SpecialAddonPick[];
  onChange: (next: SpecialAddonPick[]) => void;
}) {
  const byCode = new Map(value.map((p) => [p.code, p]));

  function toggle(def: SpecialAddonDto) {
    if (byCode.has(def.code)) onChange(value.filter((p) => p.code !== def.code));
    else onChange([...value, { code: def.code, choiceLabels: def.optionGroups.map(() => "") }]);
  }
  function setChoice(code: string, gi: number, label: string) {
    onChange(
      value.map((p) =>
        p.code === code
          ? { ...p, choiceLabels: p.choiceLabels.map((c, i) => (i === gi ? label : c)) }
          : p,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {defs.map((def) => {
        const pick = byCode.get(def.code);
        const on = !!pick;
        return (
          <div key={def.code} className="border border-base-200 rounded-md p-2.5">
            <label className="flex items-center gap-2 text-body cursor-pointer">
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(def)}
                data-testid={`raw-special-${def.code}`}
              />
              <span className="text-base-800 font-medium">{def.label}</span>
            </label>
            {on &&
              def.optionGroups.map((g, gi) => (
                <div key={gi} className="mt-2 ml-6">
                  <span className="text-meta text-base-500 block mb-0.5">{g.label}</span>
                  <select
                    value={pick!.choiceLabels[gi] ?? ""}
                    onChange={(e) => setChoice(def.code, gi, e.target.value)}
                    className={SEL_CLS}
                    data-testid={`raw-special-choice-${def.code}-${gi}`}
                  >
                    <option value="">— select —</option>
                    {g.choices.map((c) => (
                      <option key={c.label} value={c.label}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-label uppercase tracking-[0.05em] text-base-400">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}
