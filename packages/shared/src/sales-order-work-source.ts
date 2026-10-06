import type { OrderActionSignals } from "./order-actions";

export interface SalesOrderWorkFacts {
  status: string;
  operationStage: string | null;
  lines: readonly { sku: string; qty: number }[];
  availableBySku: Readonly<Record<string, number>> | null;
  purchaseOrderSkus: readonly string[] | null;
  stockEtaByLine: Readonly<Record<string, string>> | null;
  stockStatusByLine: Readonly<Record<string, string>> | null;
  deliveryDate: string | null;
  deliveryDateTbd: boolean;
  logisticsAssigned: boolean;
  bookingStage: string | null;
  confirmedDate: string | null;
  deliveryOrderNumber?: string | null;
  deliveryPhotos?: readonly unknown[] | null;
  lineTotal: number | null;
  addonTotal: number | null;
  paid: number | null;
  storageOwing: number;
  delayDecision: "keep" | "new_date" | null;
  delayDecisionEta: string | null;
  today: string;
  safetyDays: number | null;
  financeExceptionHolds?: boolean;
}

function calendarDays(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

export function salesOrderActionSignalsFromFacts(
  facts: SalesOrderWorkFacts,
): OrderActionSignals {
  const stage = facts.operationStage ??
    (facts.status === "delivered" ? "delivered" : "in_production");
  const stageReady =
    stage === "ready_to_dispatch" ||
    stage === "dispatched" ||
    stage === "delivered";

  const needs = new Map<string, number>();
  for (const line of facts.lines) {
    if (line.qty > 0) needs.set(line.sku, (needs.get(line.sku) ?? 0) + line.qty);
  }
  const stockKnown =
    facts.availableBySku !== null &&
    [...needs.keys()].every((sku) => Object.hasOwn(facts.availableBySku!, sku));
  const liveStockReady =
    stockKnown &&
    [...needs].every(([sku, qty]) => (facts.availableBySku?.[sku] ?? 0) >= qty);
  const importedReady =
    facts.stockStatusByLine !== null &&
    Object.keys(facts.stockStatusByLine).length > 0 &&
    Object.values(facts.stockStatusByLine).every(
      (status) => status.toLowerCase() === "ready",
    );
  const goodsReady = stageReady || liveStockReady || importedReady;
  const poCovered =
    facts.purchaseOrderSkus !== null && facts.purchaseOrderSkus.length > 0;

  const waitingKeys = facts.stockStatusByLine
    ? Object.entries(facts.stockStatusByLine)
        .filter(([, status]) => status.toLowerCase() !== "ready")
        .map(([key]) => key)
    : Object.keys(facts.stockEtaByLine ?? {});
  const etaPool = waitingKeys
    .map((key) => facts.stockEtaByLine?.[key] ?? null)
    .filter((date): date is string => date !== null);
  const stockEtaIso = etaPool.sort().at(-1) ?? null;

  const promisedDateIso =
    facts.deliveryDateTbd ? null : facts.deliveryDate;
  const moneyKnown =
    facts.lineTotal !== null && facts.addonTotal !== null && facts.paid !== null;
  const outstanding = moneyKnown
    ? Math.max(
        0,
        facts.lineTotal! + facts.addonTotal! + facts.storageOwing - facts.paid!,
      )
    : 0;

  return {
    completed: facts.status === "delivered" || stage === "delivered",
    goodsReady,
    goodsUnordered: !goodsReady && !poCovered,
    stockEtaIso,
    promisedDateIso,
    daysToDue: promisedDateIso
      ? calendarDays(facts.today, promisedDateIso)
      : null,
    stockWindowDays: facts.safetyDays,
    hasLogistics: facts.logisticsAssigned,
    bookingConfirmed:
      facts.bookingStage === "confirmed" && facts.confirmedDate !== null,
    confirmedDateIso: facts.confirmedDate,
    todayIso: facts.today,
    deliveryOrderIssued:
      facts.deliveryOrderNumber === undefined
        ? null
        : Boolean(facts.deliveryOrderNumber?.trim()),
    photoOnFile:
      facts.deliveryPhotos === undefined
        ? null
        : Array.isArray(facts.deliveryPhotos) && facts.deliveryPhotos.length > 0,
    moneyOwing: outstanding > 0,
    delayDecision: facts.delayDecision,
    delayDecisionEtaIso: facts.delayDecisionEta,
    financeExceptionHolds: facts.financeExceptionHolds ?? false,
  };
}

