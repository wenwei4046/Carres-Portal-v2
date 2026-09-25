/**
 * ⭐ ONE WORK OCCURRENCE PER PO WINDOW (Purchasing MASTER §5.6.1 · Workspace
 * MASTER §6 · owner rulings, Jess 2026-09-24 / 2026-09-25).
 *
 * PO Duty does not get one `Issue PO` card per Sales Order. SO demand is
 * collected into the daily windows (first 11:30, optional second 16:00, a
 * supplier's earlier cut-off wins) and Work shows ONE occurrence per window
 * over the exact eligible demand lines:
 *
 *   before issue   `Buy {n} items for {m} Sales Orders`
 *                  `Issue the POs by 11:30 AM`
 *   after issue    `{k} POs issued · {x} not sent yet`
 *                  `Click WhatsApp, send PO260925-4827(1) to Ohana` (the earliest
 *                  unsent PO when several are owed)
 *
 * It closes when no eligible demand is left in the window AND every PO issued
 * from it has its CURRENT version marked `PO sent to supplier`. Opening
 * WhatsApp or email never closes it (Purchasing §5.6).
 *
 * WHICH WINDOW is not decided here. The SO Batch read stamps `poWindow` on
 * every demand row and every lineage PO with the one `poWindowFor` arithmetic;
 * SO Batch's `?window=` scope and this projection read the SAME stamp, so the
 * card and the page it opens can never disagree (Law D).
 *
 * PURE — no clock, no I/O.
 */
import { parsePoWindowKey, poWindowTimeWord } from "./po-windows";
import { poDocumentNumberOf } from "./po-workspace";
import type { PurchaseDemandRow } from "./purchase-demands";
import { isSelectableForBuying, type SoBatchOrderRow } from "./so-batch-purchase";

export const PO_WINDOW_WORK_COPY = {
  objectLabel: (time: string) => `${time} PO window`,
  buy: (items: number, orders: number) =>
    `Buy ${items} ${items === 1 ? "item" : "items"} for ${orders} ${orders === 1 ? "Sales Order" : "Sales Orders"}`,
  issueBy: (time: string) => `Issue the POs by ${time}`,
  issued: (issued: number, unsent: number) =>
    `${issued} ${issued === 1 ? "PO" : "POs"} issued · ${unsent} not sent yet`,
  sendWhatsApp: (po: string, supplier: string) => `Click WhatsApp, send ${po} to ${supplier}`,
  sendEmail: (po: string, supplier: string) => `Click Email, send ${po} to ${supplier}`,
  send: (po: string, supplier: string) => `Send ${po} to ${supplier}`,
  suppliers: (n: number) => `${n} suppliers`,
  result: "Every PO issued and marked as sent",
  demandHeading: "To buy",
  posHeading: "POs to send",
  sentWord: "Sent",
  notSentWord: "Sending not confirmed",
  itemsWord: (n: number) => `${n} ${n === 1 ? "item" : "items"}`,
  openSoBatch: "Open SO Batch Purchase",
  supplierUnknown: "the supplier",
} as const;

export type PoSendChannel = "whatsapp" | "email" | null;

/** The supplier's recorded way in — group link or chat number → WhatsApp,
 *  else an email address → Email, else none recorded. */
export function poSendChannelOf(doors: {
  whatsappGroupUrl?: string | null;
  contact?: string | null;
  contactEmail?: string | null;
} | null | undefined): PoSendChannel {
  if (!doors) return null;
  if (doors.whatsappGroupUrl?.trim() || (doors.contact ?? "").replace(/\D/g, "")) return "whatsapp";
  if (doors.contactEmail?.trim()) return "email";
  return null;
}

/** Jess's send line (2026-09-25), by the supplier's recorded channel. */
export function poSendActOf(documentNo: string, supplier: string, channel: PoSendChannel): string {
  if (channel === "whatsapp") return PO_WINDOW_WORK_COPY.sendWhatsApp(documentNo, supplier);
  if (channel === "email") return PO_WINDOW_WORK_COPY.sendEmail(documentNo, supplier);
  return PO_WINDOW_WORK_COPY.send(documentNo, supplier);
}

export interface PoWindowDemandRow {
  /** The exact SO Batch leaf row id. */
  id: string;
  orderId: string;
  so: number | null;
  supplierId: string | null;
  supplier: string | null;
  /** Business units still to buy (the SO Batch `toBuy`). */
  toBuy: number;
  /** Stamped by the SO Batch read; null = no admission time (excluded). */
  poWindow: string | null;
}

export interface PoWindowPoFact {
  poId: string;
  version: number;
  supplierId: string | null;
  supplierName: string | null;
  sentCurrentVersion: boolean;
  /** The window each ORDER this PO serves put it in — the earliest wins. */
  poWindow: string | null;
}

export interface PoWindowPo {
  poId: string;
  documentNo: string;
  supplierId: string | null;
  supplierName: string;
  sent: boolean;
  channel: PoSendChannel;
  /** The send line; null once the current version is marked sent. */
  act: string | null;
}

export interface PoWindowWork {
  /** `2026-09-25T11:30` — the occurrence identity's object id. */
  key: string;
  date: string;
  time: string;
  timeWord: string;
  /** `2026-09-25T11:30:00+08:00`. */
  dueAt: string;
  demand: {
    items: number;
    orders: number;
    rowIds: string[];
    suppliers: Array<{ supplierId: string | null; supplier: string; items: number; orders: number }>;
  };
  /** Every PO issued from the window, unsent first, then by number. */
  pos: PoWindowPo[];
  unsent: number;
  card: {
    objectLabel: string;
    problem: string;
    action: string;
    recipient: string | null;
    requiredResult: string;
  };
}

/**
 * One occurrence per window that still owes something: eligible demand left
 * to buy, or an issued PO whose current version is not marked sent. A window
 * whose POs are all sent and whose demand is gone yields nothing — it is
 * Completed, and the ledger says so.
 */
export function poWindowWork(input: {
  rows: readonly PoWindowDemandRow[];
  pos: readonly PoWindowPoFact[];
  channelOf: (supplierId: string | null) => PoSendChannel;
  /** Keep a window that owes nothing — the completion writer reads what a
   *  closed window issued; the Work feed never sets it. */
  keepClosed?: boolean;
}): PoWindowWork[] {
  const windows = new Map<string, { rows: PoWindowDemandRow[]; pos: Map<string, PoWindowPoFact> }>();
  const at = (key: string) => {
    let entry = windows.get(key);
    if (!entry) windows.set(key, (entry = { rows: [], pos: new Map() }));
    return entry;
  };
  for (const row of input.rows) {
    if (!row.poWindow || !parsePoWindowKey(row.poWindow) || !(row.toBuy > 0)) continue;
    at(row.poWindow).rows.push(row);
  }
  /* A PO serving orders from two windows belongs to the EARLIEST — the one it
     was due for — and is counted once. */
  const earliest = new Map<string, PoWindowPoFact>();
  for (const po of input.pos) {
    if (!po.poWindow || !parsePoWindowKey(po.poWindow)) continue;
    const seen = earliest.get(po.poId);
    if (!seen || po.poWindow < seen.poWindow!) earliest.set(po.poId, po);
  }
  for (const po of earliest.values()) at(po.poWindow!).pos.set(po.poId, po);

  const out: PoWindowWork[] = [];
  for (const [key, entry] of [...windows.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const pos: PoWindowPo[] = [...entry.pos.values()]
      .map((po) => {
        const documentNo = poDocumentNumberOf(po.poId, po.version);
        const supplierName = po.supplierName?.trim() || PO_WINDOW_WORK_COPY.supplierUnknown;
        const channel = input.channelOf(po.supplierId);
        return {
          poId: po.poId,
          documentNo,
          supplierId: po.supplierId,
          supplierName,
          sent: po.sentCurrentVersion,
          channel,
          act: po.sentCurrentVersion ? null : poSendActOf(documentNo, supplierName, channel),
        };
      })
      .sort((a, b) => Number(a.sent) - Number(b.sent) || a.poId.localeCompare(b.poId));
    const unsent = pos.filter((po) => !po.sent).length;
    if (entry.rows.length === 0 && unsent === 0 && !input.keepClosed) continue;

    const { date, time } = parsePoWindowKey(key)!;
    const timeWord = poWindowTimeWord(time);
    const items = entry.rows.reduce((sum, row) => sum + row.toBuy, 0);
    const orders = new Set(entry.rows.map((row) => row.orderId)).size;
    const bySupplier = new Map<string, { supplierId: string | null; supplier: string; items: number; orders: Set<string> }>();
    for (const row of entry.rows) {
      const k = row.supplierId ?? "";
      const group = bySupplier.get(k) ?? {
        supplierId: row.supplierId,
        supplier: row.supplier?.trim() || PO_WINDOW_WORK_COPY.supplierUnknown,
        items: 0,
        orders: new Set<string>(),
      };
      group.items += row.toBuy;
      group.orders.add(row.orderId);
      bySupplier.set(k, group);
    }
    const suppliers = [...bySupplier.values()]
      .map((g) => ({ supplierId: g.supplierId, supplier: g.supplier, items: g.items, orders: g.orders.size }))
      .sort((a, b) => a.supplier.localeCompare(b.supplier));

    const demandLeft = entry.rows.length > 0;
    const firstUnsent = pos.find((po) => !po.sent) ?? null;
    const recipientNames = demandLeft
      ? suppliers.map((s) => s.supplier)
      : [...new Set(pos.filter((po) => !po.sent).map((po) => po.supplierName))];
    out.push({
      key,
      date,
      time,
      timeWord,
      dueAt: `${date}T${time}:00+08:00`,
      demand: { items, orders, rowIds: entry.rows.map((row) => row.id).sort(), suppliers },
      pos,
      unsent,
      card: {
        objectLabel: PO_WINDOW_WORK_COPY.objectLabel(timeWord),
        problem: demandLeft
          ? PO_WINDOW_WORK_COPY.buy(items, orders)
          : PO_WINDOW_WORK_COPY.issued(pos.length, unsent),
        /* Several unsent POs name the earliest one (Purchasing §5.6.1). */
        action: demandLeft || unsent === 0
          ? PO_WINDOW_WORK_COPY.issueBy(timeWord)
          : firstUnsent!.act!,
        recipient:
          recipientNames.length === 0
            ? null
            : recipientNames.length === 1
              ? recipientNames[0]!
              : PO_WINDOW_WORK_COPY.suppliers(recipientNames.length),
        requiredResult: PO_WINDOW_WORK_COPY.result,
      },
    });
  }
  return out;
}

/** A supplier row's recorded doors (`suppliers.whatsapp_group_url` · `contact`
 *  · `contact_email`), as the supplier reads return them. */
export interface PoWindowSupplierDoors {
  id: string;
  whatsapp_group_url?: string | null;
  contact?: string | null;
  contact_email?: string | null;
}

/**
 * The window model over the SO Batch read — the Work feed, its completion
 * probe and the Work right panel all run THIS, so "which demand and which POs
 * a window holds" has one answer (Law D). Only rows SO Batch may actually
 * buy (`isSelectableForBuying`) are demand; a received PO needs no sending.
 */
export function poWindowWorkFromSoBatch(
  read: {
    rows: readonly PurchaseDemandRow[];
    registerRows: readonly SoBatchOrderRow[];
    poWindowsUnavailable?: boolean;
  },
  suppliers: readonly PoWindowSupplierDoors[],
  opts: { keepClosed?: boolean } = {},
): PoWindowWork[] {
  if (read.poWindowsUnavailable) throw new Error("PO window settings are unavailable");
  const doors = new Map(suppliers.map((s) => [s.id, s]));
  return poWindowWork({
    rows: read.rows.filter(isSelectableForBuying).map((row) => ({
      id: row.id,
      orderId: row.orderId,
      so: row.so,
      supplierId: row.supplierId,
      supplier: row.supplier,
      toBuy: row.toBuy ?? 0,
      poWindow: row.poWindow ?? null,
    })),
    pos: read.registerRows.flatMap((reg) => reg.pos.map((po) => ({
      poId: po.poId,
      version: po.version ?? 1,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      sentCurrentVersion: po.sentCurrentVersion || po.status === "received",
      poWindow: po.poWindow ?? null,
    }))),
    channelOf: (supplierId) => {
      const door = supplierId ? doors.get(supplierId) : undefined;
      return poSendChannelOf(door ? {
        whatsappGroupUrl: door.whatsapp_group_url ?? null,
        contact: door.contact ?? null,
        contactEmail: door.contact_email ?? null,
      } : null);
    },
    ...(opts.keepClosed ? { keepClosed: true } : {}),
  });
}
