/**
 * Rental + Service Plan base (migrations 0247-0249) — the PURE plan math.
 *
 * No DB/IO — shared verbatim by the config UI previews, the entitlement mint
 * and the finance split recording so the figures cannot drift (the
 * specials/sofa/delivery/bundle honest-pricing pattern).
 */

import type {
  AgreementBlock,
  RentalGift,
  RentalOfferCategory,
  RentalOptionGroup,
  RentalOptionValue,
  RentalSurcharge,
  ServicePackageType,
} from "./domain";

/** 2dp money rounding (same convention as special-addons/option-picks). */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Total visits a service package mints over its life: visits accrue at
 * `visitsPerYear` across `durationMonths`, floored to whole visits, and a
 * package always grants AT LEAST one visit (a 6-month × 1/year package still
 * delivers its single clean).
 *
 * serviceVisitsTotal(12, 3) = 3 · (24, 3) = 6 · (18, 3) = 4 · (6, 1) = 1.
 */
export function serviceVisitsTotal(durationMonths: number, visitsPerYear: number): number {
  return Math.max(1, Math.floor((durationMonths * visitsPerYear) / 12));
}

/**
 * Months between two pre-generated visits: 12 / visitsPerYear (3 visits/year →
 * every 4 months). May be fractional (e.g. 5/year → 2.4) — the scheduler
 * decides how to land fractional months on calendar dates.
 */
export function serviceVisitIntervalMonths(visitsPerYear: number): number {
  return 12 / visitsPerYear;
}

/**
 * Full contract value of a rental agreement: monthly fee × term months
 * (RM59 × 84 = RM4,956). Also the buyout ceiling (remaining months settle
 * against this figure).
 */
export function rentalContractValue(monthlyFee: number, termMonths: number): number {
  return monthlyFee * termMonths;
}

/** The three-way split of ONE collected month — see `rentalMonthlySplit`. */
export interface RentalMonthlySplit {
  supplierShare: number;
  commissionShare: number;
  carresShare: number;
}

/**
 * Splits one collected month three ways: `supplierRatePct`% → supplier,
 * `commissionBasePct`% → the selling dealer/salesperson (flat base — the full
 * commission hierarchy lives in the HR line), remainder → Carres.
 *
 * Each share is rounded to 2dp; `carresShare` is computed FROM THE ROUNDED
 * shares (fee − supplier − commission) so the three always sum exactly to the
 * fee — no lost or minted cent (the Σ-exact convention of explodeBundle).
 *
 * rentalMonthlySplit(59, 49, 20) → { 28.91, 11.80, 18.29 } (Σ = 59).
 */
export function rentalMonthlySplit(
  monthlyFee: number,
  supplierRatePct: number,
  commissionBasePct: number,
): RentalMonthlySplit {
  const supplierShare = round2((monthlyFee * supplierRatePct) / 100);
  const commissionShare = round2((monthlyFee * commissionBasePct) / 100);
  // From the ROUNDED shares — Σ-exact; round2 only clears float noise.
  const carresShare = round2(monthlyFee - supplierShare - commissionShare);
  return { supplierShare, commissionShare, carresShare };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The collection calendar (Loo 2026-07-26) — WHEN the money is due.
 *
 * Loo's rule, in his own example: a customer who signs on the 30th pays once
 * on the 30th, then on the 7th of the next month, then every 7th after that.
 * The final month needs no payment, because the signup payment was the extra
 * one. His invariant, stated as the thing that actually matters:
 *
 *     "as long as the sum is correct"
 *
 * So N payments for an N-month term, and N x monthlyFee must equal the
 * contract value exactly. Everything else about the calendar is subordinate to
 * that, and `rentalScheduleSum` exists so the DB, the API and the tests can all
 * assert it rather than trust it.
 *
 * This ALSO has to be expressible in Stripe, which cannot be talked out of its
 * own opinions: `proration_behavior:'none'` WAIVES the first invoice, and the
 * default `create_prorations` bills a part-month. Neither is Loo's rule. The
 * composition that is: a one-time line item for the signup month + a trial
 * running to the first 7th (which then BECOMES the billing anchor) + a schedule
 * of N-1 iterations. Hence `MIN_FIRST_GAP_DAYS` below is not politeness.
 * ═════════════════════════════════════════════════════════════════════════ */

/** The day of the month money is due, from Loo's T&C ("on or before the 7th"). */
export const RENTAL_ANCHOR_DAY = 7;

/**
 * If the first anchor lands sooner than this after signing, skip to the next
 * month. Two reasons, and the second one is hard:
 *   1. Signing on the 6th would charge twice in two days, which a customer
 *      reads as a double charge and a bank reads as a chargeback.
 *   2. Stripe refuses a trial shorter than ~48 hours, and the trial is what
 *      carries the gap between signup and the first anchored invoice.
 * The payment COUNT never changes, so the sum never changes.
 */
export const MIN_FIRST_GAP_DAYS = 7;

/** One scheduled collection: which month of the term, and when it is due. */
export interface RentalDueDate {
  /** 1-based. seq 1 is the signup payment, collected at the counter. */
  seq: number;
  /** ISO `YYYY-MM-DD`. */
  dueDate: string;
}

const MS_PER_DAY = 86_400_000;

/** Parse `YYYY-MM-DD` to a UTC-midnight Date. Deterministic — no local zone. */
function parseIsoDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`rentalDueDates: startDate must be YYYY-MM-DD, got "${iso}"`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * `base` shifted by N calendar months, clamped to the target month's length.
 * Day 7 never triggers the clamp, but a future anchor day of 31 would, and a
 * silent Mar-31 -> May-1 rollover in a payment calendar is the kind of bug that
 * is only ever found by a customer.
 */
function addMonthsClamped(base: Date, months: number): Date {
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const d = base.getUTCDate();
  const lastOfTarget = new Date(Date.UTC(y, m + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m + months, Math.min(d, lastOfTarget)));
}

/**
 * The full collection calendar for an agreement.
 *
 * seq 1 = the signup day itself. seq 2..N = the anchor day of each successive
 * month, starting at the first anchor strictly after signing (pushed one month
 * when that gap is under `MIN_FIRST_GAP_DAYS`).
 */
export function rentalDueDates(
  startDate: string,
  termMonths: number,
  opts?: { anchorDay?: number; minGapDays?: number },
): RentalDueDate[] {
  if (!Number.isInteger(termMonths) || termMonths < 1) {
    throw new Error(`rentalDueDates: termMonths must be a positive integer, got ${termMonths}`);
  }
  const anchorDay = opts?.anchorDay ?? RENTAL_ANCHOR_DAY;
  const minGapDays = opts?.minGapDays ?? MIN_FIRST_GAP_DAYS;
  const start = parseIsoDate(startDate);

  // The anchor day within the signing month, clamped to that month's length.
  const lastOfSignMonth = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
  ).getUTCDate();
  let anchor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), Math.min(anchorDay, lastOfSignMonth)),
  );
  // Must be STRICTLY after signing: signing on the 7th rolls to next month,
  // because the signup payment already covered today.
  if (anchor.getTime() <= start.getTime()) anchor = addMonthsClamped(anchor, 1);
  if ((anchor.getTime() - start.getTime()) / MS_PER_DAY < minGapDays) {
    anchor = addMonthsClamped(anchor, 1);
  }

  const out: RentalDueDate[] = [{ seq: 1, dueDate: toIsoDate(start) }];
  for (let k = 2; k <= termMonths; k += 1) {
    out.push({ seq: k, dueDate: toIsoDate(addMonthsClamped(anchor, k - 2)) });
  }
  return out;
}

/**
 * What the calendar must add up to. Loo's law: N payments of the monthly fee,
 * total identical to the contract value. Kept as its own function so the
 * migration, the RPC and the tests all assert the SAME arithmetic.
 */
export function rentalScheduleSum(monthlyFee: number, termMonths: number): number {
  return round2(monthlyFee * termMonths);
}

/**
 * 8% per month SIMPLE interest on a late instalment (Loo's T&C; he confirmed
 * "单利" — simple, not compounding — and that it rides onto the next invoice).
 *
 * Accrual is PRO-RATA BY DAY, not "per month or part thereof". Both readings of
 * "8% per month" exist in Malaysian contracts; this is the one that cannot
 * over-charge, and over-charging a customer is a worse failure than
 * under-charging. Switching to whole-months is `Math.ceil(days / 30)` here and
 * nowhere else — that is why this is one function.
 *
 * NOTHING calls this automatically yet. Firing it belongs to the dunning ladder
 * (segment ②b); this is the calculator and the record, not the trigger.
 */
export const RENTAL_LATE_INTEREST_PCT_PER_MONTH = 8;

export function rentalLateInterest(
  amountDue: number,
  daysLate: number,
  ratePctPerMonth: number = RENTAL_LATE_INTEREST_PCT_PER_MONTH,
): number {
  if (!(daysLate > 0) || !(amountDue > 0)) return 0;
  return round2((amountDue * ratePctPerMonth * daysLate) / (100 * 30));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 0264 — the OFFER layer: service SKU codes + the pick → money resolver.
 *
 * ONE implementation, three consumers: the P&M authoring previews, the POS
 * rent/buy lanes, and the server-side recompute at signing (the sofa-P4
 * trust-gate doctrine — a client reports WHAT was picked, never what it
 * costs). Pure: no DB, no IO.
 * ═════════════════════════════════════════════════════════════════════════ */

/** Product-family token in a service SKU (Loo 2026-07-26). */
const CATEGORY_TOKEN: Record<RentalOfferCategory, string> = {
  mattress: "MAT",
  bedframe: "BF",
  sofa: "SOFA",
  accessory: "ACC",
};

/** What-it-does token in a service SKU. */
const SERVICE_TYPE_TOKEN: Record<ServicePackageType, string> = {
  cleaning: "CLEAN",
  repair: "REPAIR",
  other: "SVCX",
};

/**
 * The auto SKU of a service package: `SVC-{CATEGORY}-{TYPE}-{years}Y{visits}`
 * (Loo 2026-07-26 — "one year × how many visits = one SKU").
 *
 *   serviceSkuCode("mattress", "cleaning", 12, 2) → "SVC-MAT-CLEAN-1Y2"
 *   serviceSkuCode("sofa",     "cleaning", 36, 3) → "SVC-SOFA-CLEAN-3Y3"
 *   serviceSkuCode("bedframe", "repair",   36, 1) → "SVC-BF-REPAIR-3Y1"
 *
 * A duration that isn't whole years keeps its MONTH count with an `M`
 * (18 months × 2 → `SVC-MAT-CLEAN-18M2`) so a code is never ambiguous.
 * Changing duration or visits changes the code — two plans can never collide.
 */
export function serviceSkuCode(
  category: RentalOfferCategory,
  serviceType: ServicePackageType,
  durationMonths: number,
  visitsPerYear: number,
): string {
  const months = Math.max(1, Math.floor(durationMonths));
  const visits = Math.max(1, Math.floor(visitsPerYear));
  const span = months % 12 === 0 ? `${months / 12}Y` : `${months}M`;
  return `SVC-${CATEGORY_TOKEN[category]}-${SERVICE_TYPE_TOKEN[serviceType]}-${span}${visits}`;
}

/** One thing the customer picked: an option value, or a fabric colour (which
 *  travels with its series so the inheritance can be resolved). */
export interface RentalPick {
  /** allowed_options group key — "leg_heights", "divan_heights", "gaps",
   *  "specials" or "fabrics". */
  group: string;
  /** The picked value: a pool value, a special code, or a fabric COLOUR code. */
  value: string;
  /** Fabric picks only — the series the colour belongs to (e.g. "CG"). */
  series?: string;
}

/** The money one pick or surcharge adds. */
export interface RentalChargeLine {
  kind: "option" | "surcharge";
  /** `group:value` for an option, the surcharge code for a surcharge. */
  key: string;
  label: string;
  oneTime: number;
  monthly: number;
}

export interface RentalQuote {
  /** Base + every monthly charge, 2dp. */
  monthly: number;
  /** Everything due once at signing (or added to an outright purchase), 2dp. */
  oneOff: number;
  /** monthly × term + oneOff — what the whole contract collects. */
  termTotal: number;
  lines: RentalChargeLine[];
  /** Picks the offer does NOT allow (unknown group/value, or switched off) —
   *  a server recompute must REJECT the signup rather than silently drop them. */
  invalidPicks: string[];
}

export interface RentalQuoteInput {
  /** Variant fee, Σ of the picked compartments, or the combo fee — resolved
   *  by the caller from the rent lines. */
  baseMonthly: number;
  /** Months the agreement runs; 0 on the BUY lane (no monthly at all). */
  termMonths: number;
  /** The offer's option/fabric price overlay. */
  optionPrices: Record<string, RentalOptionGroup>;
  /** What the customer chose. */
  picks: RentalPick[];
  /** The offer's surcharge slots. */
  surcharges: RentalSurcharge[];
  /** Codes of the OPTIONAL surcharges the store ticked (required ones always
   *  apply and need not be listed). */
  pickedSurcharges?: string[];
}

/** A fabric colour with no price of its own inherits its series (null =
 *  "follow the series"; an explicit 0 stays 0). */
const inheritCharge = (
  own: RentalOptionValue | undefined,
  parent: RentalOptionValue | undefined,
): { oneTime: number; monthly: number } => ({
  oneTime: own?.oneTime ?? parent?.oneTime ?? 0,
  monthly: own?.monthly ?? parent?.monthly ?? 0,
});

/**
 * Resolves ONE pick against the overlay. Returns null when the offer doesn't
 * allow it — unknown group, unknown value, or a value/series switched off
 * (only `on` values ever reach a customer).
 */
export function resolveRentalPick(
  optionPrices: Record<string, RentalOptionGroup>,
  pick: RentalPick,
): { oneTime: number; monthly: number } | null {
  const group = optionPrices[pick.group];
  if (!group) return null;
  if (pick.group === "fabrics") {
    const series = pick.series ? group.series[pick.series] : undefined;
    if (!series || series.on === false) return null;
    const colour = series.colors[pick.value];
    // A series with no per-colour entries offers every colour at series price;
    // once ANY colour is authored, only the ON ones are on offer.
    if (Object.keys(series.colors).length > 0 && (!colour || colour.on === false)) return null;
    return inheritCharge(colour, series);
  }
  const value = group.values[pick.value];
  if (!value || value.on === false) return null;
  return { oneTime: value.oneTime ?? 0, monthly: value.monthly ?? 0 };
}

/**
 * Quotes an agreement: base monthly + every picked option's monthly + the
 * required and ticked surcharges; one-off money accumulates the same way.
 *
 * Rounding happens at the END (never per line) so the parts always sum to the
 * whole — the Σ-exact convention of explodeBundle / rentalMonthlySplit.
 */
export function quoteRental(input: RentalQuoteInput): RentalQuote {
  const lines: RentalChargeLine[] = [];
  const invalidPicks: string[] = [];
  let monthly = input.baseMonthly;
  let oneOff = 0;

  for (const pick of input.picks) {
    const charge = resolveRentalPick(input.optionPrices, pick);
    if (!charge) {
      invalidPicks.push(`${pick.group}:${pick.value}`);
      continue;
    }
    monthly += charge.monthly;
    oneOff += charge.oneTime;
    if (charge.monthly !== 0 || charge.oneTime !== 0) {
      lines.push({
        kind: "option",
        key: `${pick.group}:${pick.value}`,
        label: pick.value,
        oneTime: charge.oneTime,
        monthly: charge.monthly,
      });
    }
  }

  const ticked = new Set(input.pickedSurcharges ?? []);
  for (const s of input.surcharges) {
    if (!s.required && !ticked.has(s.code)) continue;
    monthly += s.monthly;
    oneOff += s.oneTime;
    if (s.monthly !== 0 || s.oneTime !== 0) {
      lines.push({
        kind: "surcharge",
        key: s.code,
        label: s.label,
        oneTime: s.oneTime,
        monthly: s.monthly,
      });
    }
  }

  const m = round2(monthly);
  const o = round2(oneOff);
  return { monthly: m, oneOff: o, termTotal: round2(m * input.termMonths + o), lines, invalidPicks };
}

/**
 * Base monthly of a sofa BUILD: the picked compartment codes summed against
 * their per-part monthly rates (Loo: "1A 10 + 2A 20 = 30/mo"). A part with no
 * authored rate is NOT rentable — it comes back in `missing` so the caller
 * refuses the build instead of quietly renting it for free.
 */
export function compartmentBuildMonthly(
  rates: Record<string, number>,
  build: string[],
): { monthly: number; missing: string[] } {
  let monthly = 0;
  const missing: string[] = [];
  for (const code of build) {
    const rate = rates[code];
    if (rate == null) missing.push(code);
    else monthly += rate;
  }
  return { monthly: round2(monthly), missing };
}

/**
 * Merges gift lists into one SKU → qty list, so two gifts of the same SKU
 * become one line of qty 2 for stock, delivery and the supplier PO.
 */
export function mergeRentalGifts(...lists: RentalGift[][]): RentalGift[] {
  const bySku = new Map<string, number>();
  for (const list of lists) {
    for (const g of list ?? []) {
      if (!g?.sku) continue;
      const qty = Math.max(1, Math.floor(Number(g.qty) || 1));
      bySku.set(g.sku, (bySku.get(g.sku) ?? 0) + qty);
    }
  }
  return [...bySku.entries()].map(([sku, qty]) => ({ sku, qty }));
}


/* ── 0267 — the agreement wording ────────────────────────────────────────── */

/** `{{token}}` occurrences, in order of first appearance, de-duplicated. */
export function agreementTokens(blocks: AgreementBlock[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of blocks) {
    for (const m of b.text.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)) {
      const token = m[1]!;
      if (!seen.has(token)) {
        seen.add(token);
        out.push(token);
      }
    }
  }
  return out;
}

/**
 * Fills the wording for one agreement. Blocks come back in the same order with
 * every `{{token}}` replaced by its value; a token with NO value is left as
 * `{{token}}` and reported in `missing` — a blank on a signed contract must be
 * visible, never silently empty.
 */
export function fillAgreement(
  blocks: AgreementBlock[],
  values: Record<string, string | number | null | undefined>,
): { blocks: AgreementBlock[]; missing: string[] } {
  const missing: string[] = [];
  const filled = blocks.map((b) => ({
    ...b,
    text: b.text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (whole, token: string) => {
      const v = values[token];
      if (v == null || v === "") {
        if (!missing.includes(token)) missing.push(token);
        return whole;
      }
      return String(v);
    }),
  }));
  return { blocks: filled, missing };
}

/**
 * Turns pasted text into ordered blocks — the Agreements tab's paste box.
 * A line in ALL CAPS or listed in `headings` becomes a heading; a line starting
 * with a bullet or ending in `;` / `; and` / `; or` becomes a list item; the
 * rest are paragraphs. Blank lines separate blocks and are dropped.
 */
export function blocksFromText(text: string, headings: string[] = []): AgreementBlock[] {
  const heads = new Set(headings.map((h) => h.trim().toLowerCase()));
  const out: AgreementBlock[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  for (const [i, line] of lines.entries()) {
    if (!line) continue;
    const bullet = /^[-•*]\s+/.test(line);
    const clean = bullet ? line.replace(/^[-•*]\s+/, "") : line;
    if (i === 0) {
      out.push({ kind: "title", text: clean });
      continue;
    }
    const isHead =
      heads.has(clean.toLowerCase()) ||
      (clean.length < 70 && clean === clean.toUpperCase() && /[A-Z]/.test(clean)) ||
      (clean.length < 70 && !clean.endsWith(".") && !clean.endsWith(";") && !bullet && /^[A-Z]/.test(clean));
    if (isHead) out.push({ kind: "h2", text: clean });
    else if (bullet || /;( and| or)?$/.test(clean)) out.push({ kind: "li", text: clean });
    else out.push({ kind: "p", text: clean });
  }
  return out;
}
