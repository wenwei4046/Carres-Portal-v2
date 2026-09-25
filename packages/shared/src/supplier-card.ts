/**
 * THE SUPPLIER CARD — the Work right panel's Supplier party card.
 * Owner approval 2026-09-25 (docs/workspace/MASTER.md §5.10 · Purchasing MASTER).
 *
 * ONE mission-level card for EVERY supplier of a Sales Order: it never
 * pretends there is one supplier. Every fact is Purchasing's (the PO, its
 * immutable `PO Delivery Date`, the supplier's latest reply and evidence, the
 * Supplier DO, Deliver To) or the Warehouse's (the GRN date and quantity); the
 * effective arrival is Purchasing's own `effectiveArrivalOf`, handed in — this
 * file computes no arrival of its own (Law D).
 *
 * Per supplier, four checks: PO issued · delivery date known · pre-arrival
 * confirmation · GRN received. The pre-arrival confirmation is NOT decided
 * here: Purchasing's `tomorrowDeliveryCallOf` owns it (anchored on the PO's
 * expected arrival, closed only by an answer ABOUT that exact date), and a
 * Supplier DO on the PO also settles it. A partial GRN is not "received".
 *
 * PURE — no clock, no I/O. Dates are ISO `YYYY-MM-DD`; `spell` prints them.
 */
import { myHolidaySet } from "./my-holidays";
import { normalizeSkuKey } from "./sku-code";
import { tomorrowDeliveryCallOf } from "./purchasing-supplier-calls";
import type { WorkingDayOptions } from "./working-days";
import type { PartyTone } from "./customer-card";

export const SUPPLIER_CARD_COPY = {
  heading: "Supplier",
  one: (name: string) => `Supplier · ${name}`,
  many: (n: number) => `Supplier · ${n} suppliers`,
  none: "No purchase order for this Sales Order",
  needPo: (n: number) => `No purchase order for this Sales Order · ${n} ${n === 1 ? "item needs" : "items need"} one`,
  fromStock: (ready: number, total: number) => `From stock · ${ready} of ${total} ready`,
  issued: (i: number, n: number) => `${i} of ${n} POs issued`,
  datesReady: (d: number, n: number) => `${d} of ${n} dates ready`,
  received: (r: number, n: number) => `${r} of ${n} received`,
  delayed: (k: number) => `${k} delayed`,
  arrivalMissed: (k: number) => `${k} arrival missed`,
  confirmationNeeded: (k: number) => `${k} confirmation needed`,
  arriving: (k: number, date: string) => `${k} arriving ${date}`,
  /* row states (§5.10) */
  state: {
    notIssued: "PO not issued",
    expected: "Expected",
    confirmationNeeded: "Confirmation needed",
    delayed: "Delayed",
    arrivingToday: "Arriving today",
    received: "Received",
    shortReceived: "Short received",
    arrivalMissed: "Arrival missed · Follow up supplier",
  },
  confirmationToday: "Confirmation needed today",
  recordDelay: "Record supplier delay",
  complete: (n: number) => `${n} of 4 complete`,
  /* row facts */
  poDate: "PO Delivery Date",
  latest: "Expected arrival",
  delayReason: "Delay reason",
  evidence: "Evidence",
  supplierDo: "Supplier DO",
  deliverTo: "Deliver to",
  grnLabel: "GRN",
  notRecorded: "Not recorded",
  notReceived: "Not received yet",
  receivedOn: (date: string) => `Received ${date}`,
  receivedQty: (r: number, n: number) => `${r} of ${n} received`,
  openPo: (po: string) => `Open ${po}`,
  openPurchasing: "Open Purchasing",
  unavailable: "Supplier details could not be loaded.",
} as const;

export interface SupplierPoFact {
  poNo: string;
  supplier: string | null;
  /** The PO reached the supplier (placed / issued). */
  issued: boolean;
  /** `official_delivery_date` — immutable (0428). */
  originalIso: string | null;
  /** Purchasing's `effectiveArrivalOf` — latest reply → original → plan. */
  effectiveIso: string | null;
  /** The latest recorded `tomorrow_delivery` supplier reply, when one exists. */
  reply: { answer: string; reason: string | null; evidence: string | null; recordedAtIso: string; aboutIso?: string | null } | null;
  /** `purchase_orders.status` and `eta_date` — what Purchasing's arrival call reads. */
  status?: string | null;
  etaIso?: string | null;
  supplierDo: { number: string | null; atIso: string | null } | null;
  deliverTo: string | null;
  /** The Warehouse's Goods received date — never a supplier claim. */
  grnIso: string | null;
  /** Σ ordered / Σ accepted received quantity on this PO's lines. */
  orderedQty?: number;
  receivedQty?: number;
  /** The PO's goods, for Purchasing's own supplier message. */
  lines?: Array<{ sku: string; qty: number }>;
}

export type SupplierRowState = keyof typeof SUPPLIER_CARD_COPY.state;

export interface SupplierRow extends SupplierPoFact {
  state: SupplierRowState;
  stateText: string;
  tone: PartyTone;
  /** One Office working day before the latest date — the pre-arrival check day. */
  confirmByIso: string | null;
  confirmed: boolean;
  checksDone: number;
  delayed: boolean;
}

export interface SupplierCardModel {
  heading: string;
  total: number;
  status: { text: string; tone: PartyTone };
  rows: SupplierRow[];
  issuedCount: number;
  receivedCount: number;
  delayedCount: number;
  datedCount: number;
  /** Earliest and latest effective arrival across issued POs (route top line). */
  arrivalRange: { fromIso: string; toIso: string } | null;
  latestGrnIso: string | null;
  /** POs whose arrival passed without a GRN — the Route's GRN tone reads it. */
  arrivalMissedCount: number;
  /** Goods served from stock (lines no PO of this order carries) — owner
   *  decision 2026-09-25: the Supplier card counts every goods need. */
  stock: { ready: number; total: number; site: string | null } | null;
  /** Pieces short on those stock-served lines — goods that need a PO. */
  needPoCount: number;
}

const RANK: Record<SupplierRowState, number> = {
  arrivalMissed: 0,
  delayed: 1,
  shortReceived: 2,
  notIssued: 3,
  confirmationNeeded: 4,
  arrivingToday: 5,
  expected: 6,
  received: 7,
};

export function supplierCardModel(input: {
  todayIso: string;
  holidays?: WorkingDayOptions["holidays"];
  pos: ReadonlyArray<SupplierPoFact>;
  /** The Sales Order's goods lines (Delivery's readiness: qty and pieces the
   *  register does not hold). Omitted ⇒ no stock row is drawn. */
  goods?: ReadonlyArray<{ sku: string; qty: number; shortQty: number }>;
  /** Where the reserved Units sit (Stock's Site), when known. */
  stockSite?: string | null;
  spell: (iso: string) => string;
}): SupplierCardModel {
  const today = input.todayIso.slice(0, 10);
  const spell = input.spell;
  const holidays = input.holidays ?? myHolidaySet();
  const rows: SupplierRow[] = input.pos.map((po) => {
    const eff = po.effectiveIso ? po.effectiveIso.slice(0, 10) : null;
    const delayed = po.issued && po.reply?.answer === "delayed";
    const ordered = po.orderedQty ?? null;
    const receivedQty = po.receivedQty ?? null;
    const owed = ordered !== null && receivedQty !== null ? Math.max(0, ordered - receivedQty) : 1;
    /* Purchasing's one arrival call: open from the working day before the
       expected arrival until an answer ABOUT that date is recorded. */
    /* Purchasing anchors its arrival call on `eta_date` ONLY: a PO with no ETA
       has no call, so the card raises none either. */
    const anchor = po.etaIso ?? null;
    const call = po.issued
      ? tomorrowDeliveryCallOf(
          {
            poId: po.poNo,
            supplierId: "",
            status: po.status ?? "open",
            etaDateIso: anchor,
            tomorrowAnswerAboutDateIso: po.reply?.aboutIso ?? null,
            lines: [{ id: `${po.poNo}#owed`, sku: "owed", qty: owed, receivedQty: 0, shortSinceIso: null, balanceAnswerAboutQty: null }],
          },
          { todayIso: today, holidays: new Set(holidays as Iterable<string>) },
        )
      : null;
    const hasDo = Boolean(po.supplierDo?.number || po.supplierDo?.atIso);
    /* Confirmed = Purchasing's own closing clause (an answer ABOUT the ETA —
       the reason its call returns nothing inside the window) or a Supplier DO.
       The due day is the call's own; none is derived here. */
    const answeredAbout = Boolean(anchor && po.reply?.aboutIso && po.reply.aboutIso.slice(0, 10) === anchor.slice(0, 10));
    const confirmed = hasDo || answeredAbout;
    const confirmByIso = call?.dueIso ?? null;
    const received = Boolean(po.grnIso) && !(ordered !== null && receivedQty !== null && receivedQty < ordered);
    const short = Boolean(po.grnIso) && !received;

    let state: SupplierRowState;
    if (!po.issued) state = "notIssued";
    else if (received) state = "received";
    else if (short) state = "shortReceived";
    else if (eff && eff < today) state = "arrivalMissed";
    else if (delayed) state = "delayed";
    else if (eff === today) state = "arrivingToday";
    else if (call && !hasDo) state = "confirmationNeeded";
    else state = "expected";

    const tone: PartyTone =
      state === "arrivalMissed" ? "missed"
      : state === "delayed" || state === "shortReceived" || state === "notIssued" ? "attention"
      : state === "confirmationNeeded" || state === "arrivingToday" ? "current"
      : state === "received" ? "done"
      : "future";
    const checksDone = [po.issued, po.issued && Boolean(eff), confirmed || received, received].filter(Boolean).length;
    return {
      ...po,
      state,
      stateText: state === "confirmationNeeded" && call && !call.late ? SUPPLIER_CARD_COPY.confirmationToday : SUPPLIER_CARD_COPY.state[state],
      tone,
      confirmByIso,
      confirmed,
      checksDone,
      delayed,
    };
  });
  /* The most material supplier first, then by latest date. */
  rows.sort((a, b) => RANK[a.state] - RANK[b.state] || (a.effectiveIso ?? "").localeCompare(b.effectiveIso ?? ""));

  const total = rows.length;
  const names = [...new Set(rows.map((r) => r.supplier).filter((v): v is string => Boolean(v)))];
  const heading = names.length === 1 ? SUPPLIER_CARD_COPY.one(names[0]) : names.length > 1 ? SUPPLIER_CARD_COPY.many(names.length) : SUPPLIER_CARD_COPY.heading;
  const issuedCount = rows.filter((r) => r.issued).length;
  /* A short receipt is not received: only a full GRN counts. */
  const receivedCount = rows.filter((r) => r.state === "received").length;
  const delayedCount = rows.filter((r) => r.delayed).length;
  const datedCount = rows.filter((r) => r.issued && r.effectiveIso).length;
  const dates = rows.filter((r) => r.issued && r.effectiveIso).map((r) => (r.effectiveIso as string).slice(0, 10)).sort();
  const grns = rows.map((r) => r.grnIso).filter((v): v is string => Boolean(v)).map((v) => v.slice(0, 10)).sort();
  const count = (s: SupplierRowState) => rows.filter((r) => r.state === s).length;

  /* Every goods need of the order: a line no PO of this order carries is
     served from stock; its short pieces are goods that need a PO. */
  const poSkus = new Set(rows.flatMap((r) => (r.lines ?? []).map((l) => normalizeSkuKey(l.sku) || l.sku)));
  const stockLines = (input.goods ?? []).filter((g) => !poSkus.has(normalizeSkuKey(g.sku) || g.sku));
  const stockTotal = stockLines.reduce((n, g) => n + Math.max(0, g.qty), 0);
  const needPoCount = stockLines.reduce((n, g) => n + Math.max(0, g.shortQty), 0);
  const stock = stockTotal > 0 ? { ready: Math.max(0, stockTotal - needPoCount), total: stockTotal, site: input.stockSite ?? null } : null;

  let status: SupplierCardModel["status"];
  if (total === 0 && needPoCount > 0) status = { text: SUPPLIER_CARD_COPY.needPo(needPoCount), tone: "attention" };
  else if (total === 0 && stock) status = { text: SUPPLIER_CARD_COPY.fromStock(stock.ready, stock.total), tone: stock.ready === stock.total ? "done" : "future" };
  else if (total === 0) status = { text: SUPPLIER_CARD_COPY.none, tone: "future" };
  else {
    /* Group progress, then the highest-material exception — never a name. */
    const progress =
      issuedCount < total
        ? SUPPLIER_CARD_COPY.issued(issuedCount, total)
        : receivedCount > 0
          ? SUPPLIER_CARD_COPY.received(receivedCount, total)
          : SUPPLIER_CARD_COPY.datesReady(datedCount, total);
    let exception: string | null = null;
    let tone: PartyTone = issuedCount < total ? "attention" : receivedCount === total ? "done" : "neutral";
    if (count("arrivalMissed")) {
      exception = SUPPLIER_CARD_COPY.arrivalMissed(count("arrivalMissed"));
      tone = "missed";
    } else if (delayedCount) {
      exception = SUPPLIER_CARD_COPY.delayed(delayedCount);
      tone = "attention";
    } else if (count("shortReceived")) {
      exception = SUPPLIER_CARD_COPY.state.shortReceived;
      tone = "attention";
    } else if (count("confirmationNeeded")) {
      exception = SUPPLIER_CARD_COPY.confirmationNeeded(count("confirmationNeeded"));
      tone = "current";
    } else if (count("arrivingToday")) {
      exception = SUPPLIER_CARD_COPY.arriving(count("arrivingToday"), spell(today));
    } else if (receivedCount > 0 && receivedCount < total) {
      const next = rows.filter((r) => r.state !== "received" && r.effectiveIso).map((r) => (r.effectiveIso as string).slice(0, 10)).sort()[0];
      if (next) exception = SUPPLIER_CARD_COPY.arriving(rows.filter((r) => r.state !== "received" && r.effectiveIso?.slice(0, 10) === next).length, spell(next));
    }
    status = { text: exception ? `${progress} · ${exception}` : progress, tone };
  }

  return {
    heading,
    total,
    status,
    rows,
    issuedCount,
    receivedCount,
    delayedCount,
    datedCount,
    arrivalRange: dates.length ? { fromIso: dates[0], toIso: dates[dates.length - 1] } : null,
    latestGrnIso: grns.length ? grns[grns.length - 1] : null,
    arrivalMissedCount: count("arrivalMissed"),
    stock,
    needPoCount,
  };
}
