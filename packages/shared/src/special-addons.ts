/**
 * Special Add-ons — the PURE surcharge resolver shared by the POS picker (preview
 * price) and the Hono server-recompute (the honest-pricing drift gate). Faithful
 * port of the 2990s special-addon pricing: a per-line SELLING surcharge =
 * base sellingPrice + Σ (the chosen choice's `extra`, one per follow-up group).
 * Negatives are allowed (a deduction). One level of nesting only.
 *
 * Carres ride: a model offers codes via product_models.allowed_options.specials;
 * a line's picks live in order_lines.attrs.specials[] and FOLD into the line
 * unitPrice (no separate SKU). create_order / order_lines / DraftLine untouched.
 */

export interface SpecialAddonChoice {
  label: string;
  /** Surcharge delta for this choice (added to the add-on base). Can be negative. */
  extra: number;
}

export interface SpecialAddonOptionGroup {
  label: string;
  required: boolean;
  choices: SpecialAddonChoice[];
}

export interface SpecialAddonDef {
  code: string;
  label: string;
  soDescription: string;
  categories: string[];
  /** Base selling surcharge (RM). Negative allowed. */
  sellingPrice: number;
  cost: number | null;
  optionGroups: SpecialAddonOptionGroup[];
  active: boolean;
  sortOrder: number;
}

/** One picked special add-on on a line — rides in order_lines.attrs.specials[].
 *  `choiceLabels[i]` is the chosen choice label for option group i ("" = none). */
export interface SpecialAddonPick {
  code: string;
  choiceLabels: string[];
}

export interface ResolvedSpecialLine {
  code: string;
  label: string;
  soDescription: string;
  choiceLabels: string[];
  surcharge: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Resolve one pick's surcharge against its definition: base + Σ matched-choice
 * extras. An empty/unmatched choice contributes +0 (so an unanswered optional
 * group is just the base). Returns a 2dp RM number.
 */
export function resolveSpecialAddonSurcharge(
  def: SpecialAddonDef,
  choiceLabels: readonly string[],
): number {
  let sum = def.sellingPrice;
  def.optionGroups.forEach((g, i) => {
    const chosen = choiceLabels[i];
    if (!chosen) return;
    const hit = g.choices.find((c) => c.label === chosen);
    if (hit) sum += hit.extra;
  });
  return round2(sum);
}

/** Whether every REQUIRED option group has a valid chosen choice (POS gate). */
export function specialPickComplete(def: SpecialAddonDef, choiceLabels: readonly string[]): boolean {
  return def.optionGroups.every((g, i) => {
    if (!g.required) return true;
    const chosen = choiceLabels[i];
    return !!chosen && g.choices.some((c) => c.label === chosen);
  });
}

export interface SpecialsTotalResult {
  total: number;
  unknownCodes: string[];
  lines: ResolvedSpecialLine[];
}

/**
 * Resolve a line's full set of picks against the live definitions (keyed by code).
 * A pick whose code isn't in `defsByCode` is reported in `unknownCodes` and
 * contributes 0 — the server-recompute treats any unknown code as a drift reject.
 */
export function resolveSpecialsTotal(
  picks: readonly SpecialAddonPick[],
  defsByCode: Map<string, SpecialAddonDef>,
): SpecialsTotalResult {
  let total = 0;
  const unknownCodes: string[] = [];
  const lines: ResolvedSpecialLine[] = [];
  for (const p of picks) {
    const def = defsByCode.get(p.code);
    if (!def) {
      unknownCodes.push(p.code);
      continue;
    }
    const choiceLabels = p.choiceLabels ?? [];
    const surcharge = resolveSpecialAddonSurcharge(def, choiceLabels);
    total += surcharge;
    lines.push({
      code: def.code,
      label: def.label,
      soDescription: def.soDescription,
      choiceLabels,
      surcharge,
    });
  }
  return { total: round2(total), unknownCodes, lines };
}
