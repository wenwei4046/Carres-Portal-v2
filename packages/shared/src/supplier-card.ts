/**
 * THE SUPPLIER CARD — the Work right panel's Supplier party card.
 * Owner approval 2026-09-25 (docs/workspace/MASTER.md §5.9 · Purchasing MASTER).
 *
 * ONE mission-level card for EVERY supplier of a Sales Order: it never
 * pretends there is one supplier. Every fact is Purchasing's (the PO, its
 * immutable `PO Delivery Date`, the supplier's latest reply and evidence, the
 * Supplier DO, Deliver To) or the Warehouse's (the GRN date); the effective
 * arrival is Purchasing's own `effectiveArrivalOf` answer, handed in — this
 * file computes no arrival of its own (Law D).
 *
 * PURE — no clock, no I/O. Dates are ISO `YYYY-MM-DD`; `spell` prints them.
 */
import { subtractWorkingDays, type WorkingDayOptions } from "./working-days";
import type { PartyTone } from "./customer-card";

/** The Office week — Purchasing's calendar (Mon–Fri). */
const OFFICE_OFF_DAYS = [0, 6];

export const SUPPLIER_CARD_COPY = {
  heading: "Supplier",
  one: (name: string) => `Supplier · ${name}`,
  many: (n: number) => `Supplier · ${n} suppliers`,
  progress: (done: number, total: number) => `${done} of ${total}`,
  none: "No purchase order for this Sales Order",
  issued: (i: number, n: number) => `${i} of ${n} POs issued`,
  datesReady: (d: number, n: number) => `${d} of ${n} dates ready`,
  delayedMany: (k: number) => `${k} suppliers delayed`,
  delayedOne: (name: string, date: string) => `${name} delayed to ${date}`,
  grn: (r: number, n: number) => `GRN received for ${r} of ${n}`,
  /* rows */
  poDate: "PO Delivery Date",
  latest: "Latest date",
  evidence: "Evidence",
  supplierDo: "Supplier DO",
  deliverTo: "Deliver to",
  grnLabel: "GRN",
  notIssued: "Not issued",
  confirmed: "Confirmed",
  earlier: "Earlier",
  delayed: (reason: string | null) => (reason ? `Delayed · ${reason}` : "Delayed"),
  reported: "Reported",
  notConfirmed: "Not confirmed",
  neededBy: (date: string) => `Needed by ${date}`,
  notNeededYet: "Not needed yet",
  received: (date: string) => `Received ${date}`,
  notReceived: "Not received yet",
  notRecorded: "Not recorded",
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
  /** The latest recorded supplier reply, when one exists. */
  reply: { answer: string; reason: string | null; evidence: string | null; recordedAtIso: string } | null;
  supplierDo: { number: string | null; atIso: string | null } | null;
  deliverTo: string | null;
  /** The Warehouse's Goods received date — never a supplier claim. */
  grnIso: string | null;
}

export interface SupplierRow extends SupplierPoFact {
  replyWord: string;
  delayed: boolean;
  /** `{number} · {date}` · `Needed by {date}` · `Not needed yet` · null once received. */
  doLine: string | null;
  doTone: PartyTone;
  grnLine: string;
}

export interface SupplierCardModel {
  heading: string;
  total: number;
  datedCount: number;
  status: { text: string; tone: PartyTone };
  rows: SupplierRow[];
  issuedCount: number;
  receivedCount: number;
  delayedCount: number;
  /** Earliest and latest effective arrival across issued POs (route top line). */
  arrivalRange: { fromIso: string; toIso: string } | null;
  latestGrnIso: string | null;
}

function replyWordOf(reply: SupplierPoFact["reply"]): { word: string; delayed: boolean } {
  if (!reply) return { word: SUPPLIER_CARD_COPY.notConfirmed, delayed: false };
  switch (reply.answer) {
    case "delayed":
      return { word: SUPPLIER_CARD_COPY.delayed(reply.reason), delayed: true };
    case "earlier":
      return { word: SUPPLIER_CARD_COPY.earlier, delayed: false };
    case "reported":
      return { word: SUPPLIER_CARD_COPY.reported, delayed: false };
    case "confirmed":
    case "shipping":
      return { word: SUPPLIER_CARD_COPY.confirmed, delayed: false };
    default:
      return { word: SUPPLIER_CARD_COPY.notConfirmed, delayed: false };
  }
}

export function supplierCardModel(input: {
  todayIso: string;
  holidays?: WorkingDayOptions["holidays"];
  pos: ReadonlyArray<SupplierPoFact>;
  spell: (iso: string) => string;
}): SupplierCardModel {
  const today = input.todayIso.slice(0, 10);
  const spell = input.spell;
  const rows: SupplierRow[] = input.pos.map((po) => {
    const { word, delayed } = replyWordOf(po.reply);
    let doLine: string | null = null;
    let doTone: PartyTone = "future";
    if (!po.grnIso && po.issued) {
      if (po.supplierDo?.number || po.supplierDo?.atIso) {
        doLine = [po.supplierDo.number, po.supplierDo.atIso ? spell(po.supplierDo.atIso.slice(0, 10)) : null].filter(Boolean).join(" · ");
        doTone = "done";
      } else if (po.effectiveIso) {
        const neededBy = subtractWorkingDays(po.effectiveIso.slice(0, 10), 1, { offDays: OFFICE_OFF_DAYS, holidays: input.holidays });
        if (today >= neededBy) {
          doLine = SUPPLIER_CARD_COPY.neededBy(spell(neededBy));
          doTone = today > neededBy ? "missed" : "current";
        } else {
          doLine = SUPPLIER_CARD_COPY.notNeededYet;
        }
      }
    }
    return {
      ...po,
      replyWord: po.issued ? word : SUPPLIER_CARD_COPY.notIssued,
      delayed: po.issued && delayed,
      doLine,
      doTone,
      grnLine: po.grnIso ? SUPPLIER_CARD_COPY.received(spell(po.grnIso.slice(0, 10))) : SUPPLIER_CARD_COPY.notReceived,
    };
  });
  /* The delayed PO first, then not issued, then by latest date. */
  rows.sort((a, b) => Number(b.delayed) - Number(a.delayed) || Number(a.issued) - Number(b.issued) || (a.effectiveIso ?? "").localeCompare(b.effectiveIso ?? ""));

  const total = rows.length;
  const names = [...new Set(rows.map((r) => r.supplier).filter((v): v is string => Boolean(v)))];
  const heading = names.length === 1 ? SUPPLIER_CARD_COPY.one(names[0]) : names.length > 1 ? SUPPLIER_CARD_COPY.many(names.length) : SUPPLIER_CARD_COPY.heading;
  const issuedCount = rows.filter((r) => r.issued).length;
  const receivedCount = rows.filter((r) => r.grnIso).length;
  const delayed = rows.filter((r) => r.delayed);
  const datedCount = rows.filter((r) => r.issued && r.effectiveIso).length;
  const dates = rows.filter((r) => r.issued && r.effectiveIso).map((r) => (r.effectiveIso as string).slice(0, 10)).sort();
  const grns = rows.map((r) => r.grnIso).filter((v): v is string => Boolean(v)).map((v) => v.slice(0, 10)).sort();

  let status: SupplierCardModel["status"];
  if (total === 0) status = { text: SUPPLIER_CARD_COPY.none, tone: "future" };
  else {
    const parts: string[] = [];
    let tone: PartyTone = "neutral";
    if (delayed.length === 1 && delayed[0].supplier && delayed[0].effectiveIso) {
      parts.push(SUPPLIER_CARD_COPY.delayedOne(delayed[0].supplier, spell(delayed[0].effectiveIso.slice(0, 10))));
      tone = "attention";
    } else if (delayed.length > 0) {
      parts.push(SUPPLIER_CARD_COPY.delayedMany(delayed.length));
      tone = "attention";
    }
    if (issuedCount < total) {
      parts.push(SUPPLIER_CARD_COPY.issued(issuedCount, total));
      if (tone === "neutral") tone = "attention";
    } else if (receivedCount > 0) {
      parts.push(SUPPLIER_CARD_COPY.grn(receivedCount, total));
      if (tone === "neutral" && receivedCount === total) tone = "done";
    } else {
      parts.push(SUPPLIER_CARD_COPY.datesReady(datedCount, total));
    }
    status = { text: parts.slice(0, 2).join(" · "), tone };
  }

  return {
    heading,
    total,
    datedCount,
    status,
    rows,
    issuedCount,
    receivedCount,
    delayedCount: delayed.length,
    arrivalRange: dates.length ? { fromIso: dates[0], toIso: dates[dates.length - 1] } : null,
    latestGrnIso: grns.length ? grns[grns.length - 1] : null,
  };
}
