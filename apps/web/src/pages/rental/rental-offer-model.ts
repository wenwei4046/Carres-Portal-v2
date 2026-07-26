import type {
  CatalogFabricDto,
  CatalogResponse,
  ProductModelDto,
  ProductSkuDto,
  RentalOptionGroup,
  RentalOptionValue,
  SofaComboDto,
} from "@carres/shared";

/**
 * Rental offer editor — the PURE shaping layer (0264, Loo 2026-07-26).
 *
 * Turns the catalog into exactly what an offer may price, so the editor
 * component stays about rendering:
 *
 *   · rentTargets(model, catalog, mode) — the rows of the price matrix: the
 *     model's live SKUs (variant), its offered sofa compartments, or its
 *     combos. A rent line and a buy price both aim at one of these.
 *   · optionGroups(model, catalog) — the option groups a rental overlay may
 *     narrow, in the SAME allowed_options vocabulary the Modular editor
 *     writes: an offer can only ever offer LESS than the model allows.
 *   · fabricSeries(model, catalog) — series → colours, the two-level fabric
 *     picker (CG has 16 colours; a rental may open 4 of them).
 *
 * No IO, no React — unit-testable on its own.
 */

/** One thing a rent line / buy price can aim at. */
export interface RentTarget {
  /** Stable key: `sku:CLOUD-K` or `combo:<uuid>`. */
  key: string;
  kind: "unit" | "compartment" | "combo";
  sku: string | null;
  comboId: string | null;
  /** What the operator reads: "Queen", "1A · Armrest left", "2+3 L-shape". */
  label: string;
  /** Sub-label — the SKU code or the combo's slot shape. */
  sub: string;
  /** SKU Master list price (buy-lane fallback + a sanity anchor). */
  listPrice: number | null;
}

export const targetKey = (sku: string | null, comboId: string | null): string =>
  comboId ? `combo:${comboId}` : `sku:${sku ?? ""}`;

/** A model's live, sellable SKUs (never discontinued, never compartment-linked). */
export function liveSkusOf(model: ProductModelDto, catalog: CatalogResponse): ProductSkuDto[] {
  return catalog.skus
    .filter((s) => s.modelId === model.id && !s.discontinuedAt && s.compartmentId == null)
    .sort((a, b) => a.variant.localeCompare(b.variant, undefined, { numeric: true }));
}

/** The compartment SKUs the model offers (sofa builds price part by part). */
export function compartmentSkusOf(model: ProductModelDto, catalog: CatalogResponse): ProductSkuDto[] {
  const offered = new Set(
    (catalog.modelSofaCompartments ?? [])
      .filter((o) => o.modelId === model.id)
      .map((o) => o.compartmentId),
  );
  return catalog.skus
    .filter(
      (s) =>
        s.modelId === model.id &&
        !s.discontinuedAt &&
        s.compartmentId != null &&
        offered.has(s.compartmentId),
    )
    .sort((a, b) => a.variant.localeCompare(b.variant, undefined, { numeric: true }));
}

/** The model's active combos (the fixed-price sofa shapes). */
export function combosOf(model: ProductModelDto, catalog: CatalogResponse): SofaComboDto[] {
  return (catalog.sofaCombos ?? [])
    .filter((c) => c.modelId === model.id && c.active && !c.discontinuedAt)
    .sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));
}

const comboShape = (c: SofaComboDto): string =>
  c.slots.map((row) => row.join(" ")).join(" / ") || "no slots";

const comboLabel = (c: SofaComboDto): string => c.label?.trim() || comboShape(c);

/** Cheapest authored height price — what the combo sells for today. */
const comboListPrice = (c: SofaComboDto): number | null => {
  const prices = Object.values(c.pricesByHeight ?? {}).filter(
    (p): p is number => typeof p === "number",
  );
  return prices.length > 0 ? Math.min(...prices) : null;
};

/**
 * The rows of the price matrix for a pricing mode. `both` shows compartments
 * AND combos — the customer picks either at the POS.
 */
export function rentTargets(
  model: ProductModelDto,
  catalog: CatalogResponse,
  mode: "variant" | "compartment" | "combo" | "both",
): RentTarget[] {
  const out: RentTarget[] = [];
  if (mode === "variant") {
    for (const s of liveSkusOf(model, catalog)) {
      out.push({
        key: targetKey(s.sku, null),
        kind: "unit",
        sku: s.sku,
        comboId: null,
        label: s.variant || s.sku,
        sub: s.sku,
        listPrice: s.price ?? null,
      });
    }
    return out;
  }
  if (mode === "compartment" || mode === "both") {
    for (const s of compartmentSkusOf(model, catalog)) {
      out.push({
        key: targetKey(s.sku, null),
        kind: "compartment",
        sku: s.sku,
        comboId: null,
        label: s.variant || s.sku,
        sub: s.sku,
        listPrice: s.price ?? null,
      });
    }
  }
  if (mode === "combo" || mode === "both") {
    for (const c of combosOf(model, catalog)) {
      out.push({
        key: targetKey(null, c.id),
        kind: "combo",
        sku: null,
        comboId: c.id,
        label: comboLabel(c),
        sub: comboShape(c),
        listPrice: comboListPrice(c),
      });
    }
  }
  return out;
}

/** One option group the overlay may price, already narrowed to what the model
 *  allows in Modular. */
export interface OptionGroupSpec {
  /** allowed_options key: leg_heights / divan_heights / gaps / specials. */
  key: string;
  label: string;
  values: { value: string; label: string }[];
}

/** Values of a global pool, active only, in pool order. */
function poolValues(catalog: CatalogResponse, pool: string): string[] {
  return (catalog.optionPools ?? [])
    .filter((p) => p.pool === pool && p.active)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => p.value);
}

/** Modular ticks for a key: absent/empty = no restriction (every pool value). */
function modelTicks(model: ProductModelDto, key: string): string[] | null {
  const raw = (model.allowedOptions ?? {})[key];
  return Array.isArray(raw) && raw.length > 0 ? raw.filter((v) => typeof v === "string") : null;
}

/**
 * The option groups a rental offer may price for this model — pool values
 * narrowed by the model's own Modular ticks. A mattress has none of these,
 * which is exactly why its editor shows only sizes and price.
 */
export function optionGroups(model: ProductModelDto, catalog: CatalogResponse): OptionGroupSpec[] {
  const out: OptionGroupSpec[] = [];
  const push = (key: string, label: string, pool: string) => {
    const universe = poolValues(catalog, pool);
    if (universe.length === 0) return;
    const ticks = modelTicks(model, key);
    const values = (ticks ? universe.filter((v) => ticks.includes(v)) : universe).map((v) => ({
      value: v,
      label: v,
    }));
    if (values.length > 0) out.push({ key, label, values });
  };

  if (model.category === "sofa") push("leg_heights", "Leg heights", "sofa_leg_height");
  if (model.category === "bedframe") {
    push("leg_heights", "Leg heights", "bedframe_leg_height");
    push("divan_heights", "Divan heights", "divan_height");
    push("gaps", "Mattress gaps", "gap");
  }

  // Special add-ons: the model's ticks ∩ the add-ons offered to its category.
  const specialTicks = modelTicks(model, "specials");
  const specials = (catalog.specialAddons ?? [])
    .filter((a) => a.active && a.categories.includes(model.category))
    .filter((a) => !specialTicks || specialTicks.includes(a.code))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  if (specials.length > 0) {
    out.push({
      key: "specials",
      label: "Special add-ons",
      values: specials.map((a) => ({ value: a.code, label: a.label })),
    });
  }
  return out;
}

/** One fabric series and the colours under it (the two-level picker). */
export interface FabricSeriesSpec {
  series: string;
  colors: { code: string; label: string }[];
}

/**
 * Fabric series → colours for this model. Upholstery is where a bed frame's
 * (and a sofa's) COLOUR lives — there is no separate colour axis (Loo
 * 2026-07-26: "先选 Fabric，然后再选具体的颜色"). Only fabrics the model ticks
 * in Modular appear; an untickd model offers no fabric choice at all.
 */
export function fabricSeries(model: ProductModelDto, catalog: CatalogResponse): FabricSeriesSpec[] {
  if (model.category !== "sofa" && model.category !== "bedframe") return [];
  const ticks = modelTicks(model, "fabrics");
  const actives = (catalog.fabrics ?? [])
    .filter((f) => f.active)
    .filter((f) => !ticks || ticks.includes(f.fabricCode))
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.fabricCode.localeCompare(b.fabricCode));
  const bySeries = new Map<string, CatalogFabricDto[]>();
  for (const f of actives) {
    const key = f.series?.trim() || "Other";
    const arr = bySeries.get(key) ?? [];
    arr.push(f);
    bySeries.set(key, arr);
  }
  return [...bySeries.entries()].map(([series, rows]) => ({
    series,
    colors: rows.map((f) => ({
      code: f.fabricCode,
      label: f.description?.trim() || f.fabricCode,
    })),
  }));
}

/* ── overlay read/write helpers (the editor's draft is the overlay itself) ── */

export const EMPTY_VALUE: RentalOptionValue = { on: false, oneTime: null, monthly: null };

export function groupOf(
  overlay: Record<string, RentalOptionGroup>,
  key: string,
): RentalOptionGroup {
  return overlay[key] ?? { required: false, values: {}, series: {} };
}

export function valueOf(
  overlay: Record<string, RentalOptionGroup>,
  key: string,
  value: string,
): RentalOptionValue {
  return groupOf(overlay, key).values[value] ?? EMPTY_VALUE;
}

export function seriesOf(
  overlay: Record<string, RentalOptionGroup>,
  series: string,
): RentalOptionValue & { colors: Record<string, RentalOptionValue> } {
  const g = groupOf(overlay, "fabrics");
  return g.series[series] ?? { ...EMPTY_VALUE, colors: {} };
}

/** Immutably set one option value in the overlay draft. */
export function setValue(
  overlay: Record<string, RentalOptionGroup>,
  key: string,
  value: string,
  patch: Partial<RentalOptionValue>,
): Record<string, RentalOptionGroup> {
  const g = groupOf(overlay, key);
  return {
    ...overlay,
    [key]: { ...g, values: { ...g.values, [value]: { ...valueOf(overlay, key, value), ...patch } } },
  };
}

/** Immutably set a fabric SERIES row (its own price + on/off). */
export function setSeries(
  overlay: Record<string, RentalOptionGroup>,
  series: string,
  patch: Partial<RentalOptionValue>,
): Record<string, RentalOptionGroup> {
  const g = groupOf(overlay, "fabrics");
  const cur = seriesOf(overlay, series);
  return { ...overlay, fabrics: { ...g, series: { ...g.series, [series]: { ...cur, ...patch } } } };
}

/** Immutably set ONE colour under a series (blank prices inherit the series). */
export function setColor(
  overlay: Record<string, RentalOptionGroup>,
  series: string,
  code: string,
  patch: Partial<RentalOptionValue>,
): Record<string, RentalOptionGroup> {
  const g = groupOf(overlay, "fabrics");
  const cur = seriesOf(overlay, series);
  const colour = cur.colors[code] ?? EMPTY_VALUE;
  return {
    ...overlay,
    fabrics: {
      ...g,
      series: {
        ...g.series,
        [series]: { ...cur, colors: { ...cur.colors, [code]: { ...colour, ...patch } } },
      },
    },
  };
}

/** Turn every colour of a series on/off in one go (the All on / All off pair). */
export function setSeriesColorsBulk(
  overlay: Record<string, RentalOptionGroup>,
  series: string,
  codes: string[],
  on: boolean,
): Record<string, RentalOptionGroup> {
  const g = groupOf(overlay, "fabrics");
  const cur = seriesOf(overlay, series);
  const colors = { ...cur.colors };
  for (const code of codes) colors[code] = { ...(colors[code] ?? EMPTY_VALUE), on };
  return {
    ...overlay,
    fabrics: { ...g, series: { ...g.series, [series]: { ...cur, on: on || cur.on, colors } } },
  };
}

export function setGroupRequired(
  overlay: Record<string, RentalOptionGroup>,
  key: string,
  required: boolean,
): Record<string, RentalOptionGroup> {
  return { ...overlay, [key]: { ...groupOf(overlay, key), required } };
}

/** How many colours of a series are on offer (the summary on a closed row). */
export function colorsOnCount(
  overlay: Record<string, RentalOptionGroup>,
  series: string,
  codes: string[],
): number {
  const cur = seriesOf(overlay, series);
  return codes.filter((c) => cur.colors[c]?.on).length;
}
