import { useState } from "react";
import type { ProductModelDto, SpecialAddonDto, SpecialAddonPick } from "@carres/shared";
import { resolveSpecialsTotal, specialPickComplete } from "@carres/shared";

/**
 * Special Add-ons picker (0181) for the POS configurators. A model offers codes
 * via allowed_options.specials; this renders the matching active defs, lets the
 * operator tick add-ons + answer their one-level follow-up questions, and reports
 * the surcharge (folded into the line unitPrice) + the picks (r`attrs.specials`).
 * The server re-resolves + drift-checks on submit (special-addons-recompute).
 */

const selCls =
  "w-full rounded-xl border-[1.5px] border-base-200 px-3 py-2 text-[13px] bg-white focus:border-primary outline-none";

function fmtDelta(n: number): string {
  return `${n < 0 ? "−" : "+"}RM ${Math.abs(n).toLocaleString()}`;
}

/** Filter the catalog's special add-ons to the ones THIS model offers + can use. */
export function offeredSpecialsFor(
  model: ProductModelDto,
  specialAddons: SpecialAddonDto[] | null | undefined,
): SpecialAddonDto[] {
  const codes = new Set((model.allowedOptions?.specials ?? []) as string[]);
  if (codes.size === 0) return [];
  return (specialAddons ?? [])
    .filter((a) => a.active && codes.has(a.code) && a.categories.includes(model.category))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

export interface UseSpecials {
  offered: SpecialAddonDto[];
  picks: SpecialAddonPick[];
  setPicks: (p: SpecialAddonPick[]) => void;
  surcharge: number;
  /** All picked add-ons have their required follow-ups answered. */
  complete: boolean;
  /** Spread into the DraftLine attrs (empty when nothing picked). Carries the
   *  resolved lines for display + the picks the server re-resolves. */
  attrsPatch: Record<string, unknown>;
  reset: () => void;
}

/** Configurator hook: owns the picks state + derives surcharge/complete/attrs. */
export function useSpecials(
  model: ProductModelDto,
  specialAddons: SpecialAddonDto[] | null | undefined,
  /** Cart-line EDIT prefill — read once at mount (the host remounts per line).
   *  Picks whose code is no longer offered price to 0 via resolveSpecialsTotal
   *  and can simply be un-ticked by the operator. */
  initialPicks?: SpecialAddonPick[],
): UseSpecials {
  const offered = offeredSpecialsFor(model, specialAddons);
  const [picks, setPicks] = useState<SpecialAddonPick[]>(initialPicks ?? []);
  const defsByCode = new Map(offered.map((d) => [d.code, d]));
  const { total: surcharge, lines: resolvedLines } = resolveSpecialsTotal(picks, defsByCode);
  const complete = picks.every((p) => {
    const d = defsByCode.get(p.code);
    return d ? specialPickComplete(d, p.choiceLabels) : false;
  });
  // Store the RESOLVED lines (code + choiceLabels + label/soDescription/surcharge)
  // so the cart/detail can render before submit; the server re-resolves from
  // code+choiceLabels and overwrites with canonical values.
  const attrsPatch =
    picks.length > 0 ? { specials: resolvedLines, specials_total: surcharge } : {};
  return { offered, picks, setPicks, surcharge, complete, attrsPatch, reset: () => setPicks([]) };
}

/** A special-addon line as stored in a DraftLine/order_line attrs.specials[]
 *  (client-resolved or server-canonical). All display fields are optional —
 *  the free jsonb is read tolerantly. */
interface SpecialAttrLine {
  code?: string;
  label?: string;
  soDescription?: string;
  choiceLabels?: string[];
  surcharge?: number;
}

/** Read the resolved special-addon lines off a line's attrs (tolerant). */
export function specialsFromAttrs(attrs: Record<string, unknown> | null | undefined): SpecialAttrLine[] {
  if (!attrs) return [];
  const s = (attrs as { specials?: unknown }).specials;
  return Array.isArray(s) ? (s as SpecialAttrLine[]) : [];
}

/** An option pick as stored in attrs.options[] (0201/0202 wiring) — divan /
 *  leg heights + master fabric. Read tolerantly off the free jsonb. */
interface OptionAttrLine {
  kind?: string;
  value?: string;
  label?: string;
  surcharge?: number;
}

export const OPTION_KIND_LABEL: Record<string, string> = {
  divan_height: "Divan",
  bedframe_leg_height: "Leg",
  sofa_leg_height: "Leg",
  fabric: "Fabric",
};

/** Read the option picks off a line's attrs (tolerant). */
export function optionsFromAttrs(attrs: Record<string, unknown> | null | undefined): OptionAttrLine[] {
  if (!attrs) return [];
  const o = (attrs as { options?: unknown }).options;
  return Array.isArray(o) ? (o as OptionAttrLine[]) : [];
}

/** Render a line's picked special add-ons AND option picks (divan / leg /
 *  fabric — 0201/0202 wiring) as compact description rows (cart + order
 *  detail). A sofa-build leg (`attrs.leg_height`) renders too. Renders
 *  nothing when the line carries none of them. */
export function SpecialsSummary({
  attrs,
  className,
}: {
  attrs: Record<string, unknown> | null | undefined;
  className?: string;
}) {
  const lines = specialsFromAttrs(attrs);
  const options = optionsFromAttrs(attrs);
  // Sofa-build leg rides flat attr keys (the engine, not attrs.options).
  const legHeight = typeof attrs?.leg_height === "string" ? attrs.leg_height : null;
  const legSurcharge = typeof attrs?.leg_surcharge === "number" ? attrs.leg_surcharge : 0;
  // Remark (+ optional ± RM adjustment, Loo 2026-07-12) — flat attr keys too.
  const remark = typeof attrs?.remark === "string" && attrs.remark ? attrs.remark : null;
  const remarkSurcharge =
    typeof attrs?.remark_surcharge === "number" ? attrs.remark_surcharge : 0;
  if (lines.length === 0 && options.length === 0 && !legHeight && !remark && remarkSurcharge === 0)
    return null;
  const fmtSur = (n: number | undefined): string =>
    typeof n === "number" && n !== 0
      ? ` · ${n < 0 ? "−" : "+"}RM ${Math.abs(n).toLocaleString()}`
      : "";
  return (
    <div className={className ?? "mt-1 flex flex-col gap-0.5"} data-testid="specials-summary">
      {options.map((o, i) => (
        <div key={`o${i}`} className="t-tiny text-base-500">
          + {OPTION_KIND_LABEL[o.kind ?? ""] ?? o.kind ?? "Option"} {o.value ?? ""}
          {o.label ? ` — ${o.label}` : ""}
          {fmtSur(o.surcharge)}
        </div>
      ))}
      {legHeight && (
        <div className="t-tiny text-base-500" data-testid="leg-summary">
          + Leg {legHeight}
          {fmtSur(legSurcharge)}
        </div>
      )}
      {(remark || remarkSurcharge !== 0) && (
        <div className="t-tiny text-base-500" data-testid="remark-summary">
          ✎ {remark ?? "Price adjustment"}
          {fmtSur(remarkSurcharge)}
        </div>
      )}
      {lines.map((s, i) => {
        const desc = s.soDescription || s.label || s.code || "Add-on";
        const choices = (s.choiceLabels ?? []).filter(Boolean);
        return (
          <div key={i} className="t-tiny text-base-500">
            + {desc}
            {choices.length ? ` (${choices.join(", ")})` : ""}
            {fmtSur(s.surcharge)}
          </div>
        );
      })}
    </div>
  );
}

export function SpecialAddonsPicker({
  defs,
  value,
  onChange,
}: {
  defs: SpecialAddonDto[];
  value: SpecialAddonPick[];
  onChange: (next: SpecialAddonPick[]) => void;
}) {
  if (defs.length === 0) return null;
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
    <div className="flex flex-col gap-2" data-testid="special-addons-picker">
      <span className="t-tiny font-semibold text-base-600 uppercase tracking-wide">Special add-ons</span>
      {defs.map((def) => {
        const pick = byCode.get(def.code);
        const on = !!pick;
        return (
          <div key={def.code} className="border border-base-200 rounded-xl p-2.5">
            <label className="flex items-center gap-2 t-small cursor-pointer">
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(def)}
                data-testid={`pick-special-${def.code}`}
              />
              <span className="text-base-800 font-medium">{def.label}</span>
              {def.sellingPrice !== 0 && (
                <span className="t-tiny text-base-400">{fmtDelta(def.sellingPrice)}</span>
              )}
            </label>
            {on &&
              def.optionGroups.map((g, gi) => (
                <div key={gi} className="mt-2 ml-6">
                  <span className="t-tiny text-base-500 block mb-0.5">
                    {g.label}
                    {g.required && <span className="text-primary"> *</span>}
                  </span>
                  <select
                    value={pick!.choiceLabels[gi] ?? ""}
                    onChange={(e) => setChoice(def.code, gi, e.target.value)}
                    className={selCls}
                    data-testid={`pick-choice-${def.code}-${gi}`}
                  >
                    <option value="">— select —</option>
                    {g.choices.map((c) => (
                      <option key={c.label} value={c.label}>
                        {c.label}
                        {c.extra !== 0 ? ` (${fmtDelta(c.extra)})` : ""}
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
