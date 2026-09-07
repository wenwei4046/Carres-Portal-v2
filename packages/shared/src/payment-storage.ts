/**
 * The §7 storage charge arithmetic (docs/payment/MASTER.md §7 · 0436) —
 * ONE derivation (Law D), so a case card, a report and a future Storage
 * Invoice can never disagree about the same days.
 *
 * The §7 worked examples pin the rules:
 *   Mattress/bedframe default: day 1–14 RM0 · 15–44 RM150 · 45–74 RM300
 *   Approved through day 21:   day 1–21 RM0 · 22–51 RM150 · 52–81 RM300
 *   Sofa:                      day 1–14 RM0 · 15–28 RM200 · 29–42 RM400
 *
 * The start day is day 1. `approved_free_until` becomes the free end when
 * approved; the first cycle starts the NEXT day, and a period is charged the
 * moment it COMMENCES.
 */

export interface StorageCaseFacts {
  /** Day 1 (ISO date). */
  storageStart: string;
  ruleFreeDays: number;
  ruleChargeAmount: number;
  ruleCycleDays: number;
  /** The approved free-until date, when a §7 extra-free decision exists. */
  approvedFreeUntil?: string | null;
}

export interface StorageCharge {
  /** The last free day (ISO). */
  freeUntilIso: string;
  /** The first chargeable day (ISO) — the day after the free end. */
  chargeStartIso: string;
  /** How many cycle periods have COMMENCED by `todayIso` (0 while free). */
  commencedPeriods: number;
  /** commencedPeriods × the snapshotted charge amount. */
  amountOwed: number;
  /** Which day of storage `todayIso` is (start day = 1). */
  dayOfStorage: number;
}

function isoAddDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000,
  );
}

export function storageChargeOf(facts: StorageCaseFacts, todayIso: string): StorageCharge {
  // The free end: the rule's automatic free days from day 1, or the approved
  // free-until when the §7 decision extended it (an approval only extends).
  const automaticFreeEnd = isoAddDays(facts.storageStart, Math.max(0, facts.ruleFreeDays) - 1);
  const freeUntilIso =
    facts.approvedFreeUntil && facts.approvedFreeUntil > automaticFreeEnd
      ? facts.approvedFreeUntil
      : automaticFreeEnd;
  const chargeStartIso = isoAddDays(freeUntilIso, 1);
  const dayOfStorage = daysBetween(facts.storageStart, todayIso) + 1;
  const daysPastFree = daysBetween(freeUntilIso, todayIso);
  const commencedPeriods =
    daysPastFree <= 0 ? 0 : Math.ceil(daysPastFree / Math.max(1, facts.ruleCycleDays));
  return {
    freeUntilIso,
    chargeStartIso,
    commencedPeriods,
    amountOwed: commencedPeriods * facts.ruleChargeAmount,
    dayOfStorage,
  };
}
