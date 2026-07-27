/**
 * Supplier scorecard — Receiving & claim card R5
 * (`docs/receiving-claim-execution-queue.md`, Jess-locked 2026-07-27).
 *
 * THE CARD: "per supplier, derived from R1-R4 data: on-time %, partial-delivery
 * rate, damage rate, claim rate, avg claim-resolution days. Lives on the
 * Suppliers page. Done when: **next supplier negotiation opens with numbers,
 * not memory.**"
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LIVE FINDING THAT SHAPED THIS FILE (measured on prod 2026-07-27):
 *
 *   10 suppliers · **0 purchase orders · 0 PO lines · 0 claims · 0 po_history
 *   rows.** Not "little data" — NO data. Every rate this card asks for is 0/0.
 *
 * Compute it the obvious way and the screen opens a negotiation with a number
 * nobody earned: `0 ÷ 0` printed as 0% reads "Ohana never delivers on time",
 * and defaulting the same fraction to 100% reads "Ohana is perfect". Both are
 * inventions, and the card's own done-when is that the negotiation starts with
 * NUMBERS — a fabricated number is worse than memory, because memory knows it
 * is memory.
 *
 * So the rule this file is built on:
 *
 *   **A rate is either backed by records or it is not printed at all.**
 *
 * Four gates follow, and every one of them heals by itself as real POs land:
 *
 *   A. A RATE NEEDS `MIN_JUDGED_POS` DELIVERIES BEHIND IT. One PO makes a
 *      supplier 0% or 100% on time, and a negotiation opened on a sample of one
 *      is memory wearing a percent sign. Below the floor the card says how many
 *      are on file and what is still needed.
 *   B. A PROMISE THAT HAS NOT BEEN TESTED IS NOT A FAILURE. A PO whose promised
 *      date is still in the future, and which is not yet complete, is counted
 *      nowhere — it is neither on time nor late, because the day has not come.
 *   C. A PO WITH NO PROMISED DATE CAN NEVER BE SCORED, AND SAYS SO. `eta_date`
 *      is the only promise the system holds. A PO raised without one is not a
 *      supplier failure, it is OURS — so it leaves the rate and is counted by
 *      name (`noPromisedDate`), where Purchase can see it.
 *   D. UNKNOWN NEVER READS AS GOOD. A PO that is complete but carries no
 *      receipt date cannot answer "was it on time?", so it leaves the on-time
 *      denominator instead of being guessed into it (`noDeliveryDate`). Same
 *      law K5 applies to a SKU whose records do not span its window, and the
 *      same law R3 applies to a claim whose PO line it cannot read.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES *NOT* READ, AND WHY (R4's carry-forward, honoured)
 *
 * `purchase_orders.status` is never consulted. R4 (0299) left a note the card's
 * next reader must know: a PO whose shortfall is made good by RELEASING held
 * units — rather than by a replacement delivery — stays `open` forever, because
 * only the receive RPC has ever closed a PO. A scorecard keyed on that word
 * would report a supplier as permanently undelivered for a problem they fixed.
 *
 * Completeness is therefore read from the LINES (`received_qty >= qty`), which
 * is the quantity question the status word only approximates.
 *
 * **Where this file departs from that carry-forward, deliberately and reported
 * rather than hidden:** the CF says on-time should read the covering claim's
 * `closed_at`. It does not, for the on-time and in-full RATES. A shortfall that
 * was written off, or refused by the supplier, is a shortfall — counting a
 * closed claim as "delivered in full" would launder a supplier failure into a
 * pass, and this scorecard exists precisely to stop that. `closed_at` is used
 * for the one number it genuinely answers: how long a claim takes to settle.
 * If Jess wants a released hold to count as delivered, it is one branch here.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURE and deterministic — no I/O, no clock, no timezone math. `asOf` and every
 * date are 'YYYY-MM-DD' MYT calendar days, converted by the caller once. The
 * API computes, the browser renders the answer, so the two can never present
 * different arithmetic.
 *
 * **NO MIGRATION, no RPC, no new table.** R5 is the review layer: it reads what
 * R1 (the three honest numbers on a line), R2/R3 (the claim and its life) and
 * R4 (the quarantine) already store, and adds nothing of its own. A review
 * layer with its own state is a fifth number to keep in step with four.
 */

import { daysBetween } from "./ready-stock-plan";
import type { IsoDate } from "./working-days";

// ── The floor ───────────────────────────────────────────────────────────────

/**
 * How many tested promises a supplier needs before a percentage is printed.
 *
 * Three, and the number is a judgement call worth naming: below it a single
 * late delivery swings the figure by 50 or 100 points, and the card's whole
 * point is that the number is stronger than somebody's recollection. The same
 * discipline HR-P7 applies to a month still in progress and K5 applies to a
 * SKU with no history — a figure that cannot be defended is not shown.
 *
 * One constant changes it if Jess wants a different floor.
 */
export const MIN_JUDGED_POS = 3;

// ── The inputs (exactly what R1-R4 already store) ───────────────────────────

export interface ScorecardPo {
  id: string;
  supplier_id: string;
  /**
   * The date the supplier promised the goods would be here — `eta_date`, which
   * is what the PO tells them and what the Receiving queue shows. NULL means
   * nobody set one, and an unset promise can never be kept or broken (gate C).
   */
  eta_date: IsoDate | null;
  /** MYT calendar day the PO was raised. Bounds the coverage window. */
  placed_at: IsoDate;
  /**
   * MYT calendar day of the LAST receive against this PO (`do_uploaded_at`).
   * For a PO that ended complete this IS the day it completed — every receive
   * overwrites the stamp, so the final one is the one that closed it out.
   * NULL on a PO nothing has ever been received against (and, in theory, on an
   * imported PO whose lines were filled without a receive — gate D).
   */
  received_on: IsoDate | null;
}

export interface ScorecardLine {
  po_id: string;
  qty: number;
  /** GOOD units booked into stock. R1's law: a damaged or wrong unit is not
   *  received, so this number never contains one. */
  received_qty: number;
  damaged_qty: number;
  wrong_item_qty: number;
}

export interface ScorecardClaim {
  po_id: string;
  claim_type: string;
  /** 'open' | 'closed' — R2/R3's two-valued status. */
  status: string;
  reported_on: IsoDate;
  /** R3's settle stamp. NULL while the claim is open. */
  closed_on: IsoDate | null;
}

// ── The outputs ─────────────────────────────────────────────────────────────

/**
 * Why a rate is not printed.
 *
 * - `no_records` — nothing has happened yet that this rate could measure.
 * - `too_few`    — some records exist, but fewer than `MIN_JUDGED_POS` (gate A).
 */
export type ScorecardUnknownReason = "no_records" | "too_few";

/** Plain words for the operator, in ONE place — the card, the drawer and any
 *  later consumer read the same sentence. (COPY-STANDARD: an empty state
 *  teaches; it never says "No data".) */
export const SCORECARD_UNKNOWN_TEXT: Record<ScorecardUnknownReason, string> = {
  no_records: "No delivery on file yet",
  too_few: `Not enough deliveries yet — ${MIN_JUDGED_POS} needed`,
};

export type ScorecardRate =
  | { known: true; pct: number; hits: number; of: number }
  | { known: false; reason: ScorecardUnknownReason; hits: number; of: number };

export interface ScorecardCoverage {
  /** POs on file for this supplier inside the window the caller fetched. */
  pos: number;
  /** POs whose promise has been tested — the denominator of `inFull`. */
  judged: number;
  /** Excluded, gate C: nobody set a promised date, so nothing can be scored. */
  noPromisedDate: number;
  /** Excluded, gate B: the promised date has not arrived and it is not complete. */
  notDueYet: number;
  /** Excluded from the ON-TIME rate only, gate D: complete, but no receipt date
   *  on file, so "was it on time?" has no honest answer. */
  noDeliveryDate: number;
  /** Earliest `placed_at` on file. NULL when the supplier has no PO at all. */
  from: IsoDate | null;
  /** Calendar days from `from` to `asOf`. 0 when nothing is on file. */
  days: number;
}

export interface ScorecardClaimStats {
  open: number;
  closed: number;
  /**
   * Mean calendar days from `reported_on` to `closed_on`, over CLOSED claims
   * only. NULL when nothing has settled yet.
   *
   * The open count sits BESIDE it on purpose and is never folded in: a supplier
   * with one quick settlement and five claims nobody has answered would
   * otherwise read "settles in 2 days". R3 deliberately left no escape hatch
   * for a supplier who never answers — this is the number that was meant to
   * see it.
   */
  avgDaysToSettle: number | null;
  /** Age of the oldest OPEN claim, in days. NULL when none are open. */
  oldestOpenDays: number | null;
}

export interface SupplierScorecard {
  supplier_id: string;
  coverage: ScorecardCoverage;
  /** Goods all here on or before the promised day. */
  onTime: ScorecardRate;
  /**
   * Every unit ordered actually arrived — the card's "partial-delivery rate",
   * stated as the thing that went RIGHT so the label needs no minus sign.
   * `1 - inFull` is the partial rate.
   */
  inFull: ScorecardRate;
  /** Of the units this supplier actually sent, how many were unusable —
   *  damaged or not what was ordered. Denominator is UNITS, not POs. */
  faulty: ScorecardRate;
  /** Judged POs that needed at least one claim. */
  claimRate: ScorecardRate;
  claims: ScorecardClaimStats;
}

// ── The engine ──────────────────────────────────────────────────────────────

function rate(hits: number, of: number, judged: number): ScorecardRate {
  if (of <= 0) return { known: false, reason: "no_records", hits, of };
  if (judged < MIN_JUDGED_POS) return { known: false, reason: "too_few", hits, of };
  return { known: true, pct: Math.round((hits / of) * 100), hits, of };
}

/** One PO's verdict. Exported for the tests — the branches are the whole card. */
export interface PoVerdict {
  /** Every line reached its ordered quantity. */
  complete: boolean;
  /** The promise has been tested (gate B) and exists (gate C). */
  judged: boolean;
  /** Complete, on or before the promised day. NULL = judged but unanswerable
   *  (gate D: no receipt date on file). */
  onTime: boolean | null;
  unitsArrived: number;
  unitsFaulty: number;
}

export function poVerdict(
  po: ScorecardPo,
  lines: readonly ScorecardLine[],
  asOf: IsoDate,
): PoVerdict {
  let unitsArrived = 0;
  let unitsFaulty = 0;
  let complete = lines.length > 0;

  for (const l of lines) {
    const received = Math.max(0, l.received_qty ?? 0);
    const faulty = Math.max(0, l.damaged_qty ?? 0) + Math.max(0, l.wrong_item_qty ?? 0);
    unitsArrived += received + faulty;
    unitsFaulty += faulty;
    if (received < Math.max(0, l.qty ?? 0)) complete = false;
  }

  // Gate C: no promise on file → nothing to score against.
  // Gate B: a promise whose day has not come is not a broken promise.
  const judged = !!po.eta_date && (complete || po.eta_date < asOf);

  let onTime: boolean | null = null;
  if (judged) {
    if (!complete) {
      // The day passed and the goods are not all here. Late, and no receipt
      // date is needed to know it.
      onTime = false;
    } else if (po.received_on) {
      onTime = po.received_on <= (po.eta_date as IsoDate);
    } else {
      // Gate D — complete, but we cannot say WHEN. Unknown never reads as good.
      onTime = null;
    }
  }

  return { complete, judged, onTime, unitsArrived, unitsFaulty };
}

/**
 * The scorecard for ONE supplier.
 *
 * `pos` / `lines` / `claims` must already be narrowed to this supplier and to
 * whatever window the caller fetched — the engine reports the coverage it was
 * given and never assumes it saw everything (K5's law: a WINDOW is not a
 * HISTORY, so the caller states where the window ends).
 */
export function computeSupplierScorecard(input: {
  supplier_id: string;
  pos: readonly ScorecardPo[];
  lines: readonly ScorecardLine[];
  claims: readonly ScorecardClaim[];
  asOf: IsoDate;
}): SupplierScorecard {
  const { supplier_id, pos, lines, claims, asOf } = input;

  const linesByPo = new Map<string, ScorecardLine[]>();
  for (const l of lines) {
    const arr = linesByPo.get(l.po_id);
    if (arr) arr.push(l);
    else linesByPo.set(l.po_id, [l]);
  }
  const claimedPoIds = new Set(claims.map((c) => c.po_id));

  let judged = 0;
  let noPromisedDate = 0;
  let notDueYet = 0;
  let noDeliveryDate = 0;
  let onTimeHits = 0;
  let onTimeOf = 0;
  let inFullHits = 0;
  let unitsArrived = 0;
  let unitsFaulty = 0;
  let claimedJudged = 0;
  let from: IsoDate | null = null;

  for (const po of pos) {
    if (po.placed_at && (from === null || po.placed_at < from)) from = po.placed_at;

    const v = poVerdict(po, linesByPo.get(po.id) ?? [], asOf);
    if (!v.judged) {
      if (!po.eta_date) noPromisedDate += 1;
      else notDueYet += 1;
      continue;
    }

    judged += 1;
    if (v.complete) inFullHits += 1;
    if (v.onTime === null) {
      noDeliveryDate += 1;
    } else {
      onTimeOf += 1;
      if (v.onTime) onTimeHits += 1;
    }
    unitsArrived += v.unitsArrived;
    unitsFaulty += v.unitsFaulty;
    if (claimedPoIds.has(po.id)) claimedJudged += 1;
  }

  // The claim COUNTS span every claim the caller handed us, judged PO or not —
  // a claim is a claim whether or not its PO ever carried a promised date, and
  // hiding one would be the queue lying clean. Only the RATE needs the
  // comparable denominator.
  let open = 0;
  let closed = 0;
  let settledDays = 0;
  let oldestOpenDays: number | null = null;
  for (const c of claims) {
    if (c.status === "closed" && c.closed_on) {
      closed += 1;
      settledDays += Math.max(0, daysBetween(c.reported_on, c.closed_on));
    } else {
      open += 1;
      const age = Math.max(0, daysBetween(c.reported_on, asOf));
      if (oldestOpenDays === null || age > oldestOpenDays) oldestOpenDays = age;
    }
  }

  return {
    supplier_id,
    coverage: {
      pos: pos.length,
      judged,
      noPromisedDate,
      notDueYet,
      noDeliveryDate,
      from,
      days: from ? Math.max(0, daysBetween(from, asOf)) : 0,
    },
    onTime: rate(onTimeHits, onTimeOf, judged),
    inFull: rate(inFullHits, judged, judged),
    faulty: rate(unitsFaulty, unitsArrived, judged),
    claimRate: rate(claimedJudged, judged, judged),
    claims: {
      open,
      closed,
      avgDaysToSettle: closed > 0 ? Math.round(settledDays / closed) : null,
      oldestOpenDays,
    },
  };
}

/**
 * The one-line summary a supplier card shows.
 *
 * Numbers up front (COPY-STANDARD rule 3), and when there are none it says WHY
 * and what changes it (rule 5) rather than printing a zero nobody earned.
 */
export function scorecardHeadline(sc: SupplierScorecard): string {
  if (sc.coverage.pos === 0) return "No PO on file yet.";
  if (!sc.onTime.known && !sc.inFull.known) {
    const n = sc.coverage.judged;
    if (n === 0) {
      // WHY there is no score matters: "the day has not come" and "nobody set a
      // day" call for opposite next moves, and only one of them is about the
      // supplier at all.
      if (sc.coverage.noPromisedDate === sc.coverage.pos)
        return "No PO carries a promised date, so nothing can be scored.";
      return "No delivery has reached its promised date yet.";
    }
    return `${n} delivery${n === 1 ? "" : " deliveries"} on file · ${MIN_JUDGED_POS} needed before a score.`;
  }
  const bits: string[] = [];
  if (sc.onTime.known) bits.push(`${sc.onTime.pct}% on time`);
  if (sc.inFull.known) bits.push(`${sc.inFull.pct}% in full`);
  if (sc.claims.open > 0)
    bits.push(`${sc.claims.open} claim${sc.claims.open === 1 ? "" : "s"} open`);
  return `${bits.join(" · ")}.`;
}
