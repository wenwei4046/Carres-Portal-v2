/**
 * THE WORK ROUTE STOPS — Workspace MASTER §5.10 (LOCKED 2026-09-28).
 *
 * The stops ARE the Sales Order Order Route nodes, in the orders MASTER node
 * map order (`PURCHASING · SUPPLIER · RECEIVING · STOCK · LOGISTICS · DELIVERY
 * DATE · PAYMENT · DELIVERY ORDER · DELIVER · DELIVERY PHOTO`), read from the
 * one resolver (`resolveSalesOrderRoute`) the Sales Order page draws. This
 * file decides nothing about the order: it places
 *
 *   · each node's own sentence (its first line) as a card title,
 *   · the signed-in person's OPEN ACTS on the order onto the stop they belong
 *     to (the Work feed occurrence, or an unsent PO of a PO window),
 *   · a checklist of the steps that carry completion evidence.
 *
 * Acts first: stops holding an act come first, in Route order among
 * themselves; every other stop follows as one quiet line.
 *
 * PURE — no clock, no I/O.
 */
import {
  PO_WINDOW_WORK_COPY,
  type LogisticsCardModel,
  type RouteNode,
  type RouteNodeKind,
  type SalesOrderRouteMap,
} from "@carres/shared";
import type { ChecklistMark } from "@/components/kit/ChecklistRow";
import type { RouteStopTone } from "@/components/kit/RouteStop";

/** The kinds of act Work completes in place, each with its owning form. */
export type WorkActKind =
  | "send_po" // Purchasing · PoIssueEvidence
  | "supplier_answer" // Purchasing · SupplierReplySection
  | "delivery_date" // Delivery · DeliveryDatesEdit
  | "assign_logistics" // Delivery · LogisticsDetailsEdit
  | "other"; // no in-place form yet: the owning object's door

export interface WorkAct {
  /** The Work occurrence id; a PO window's send act appends the PO id. */
  key: string;
  occurrenceId: string;
  kind: WorkActKind;
  /** Which stop it belongs to. */
  stop: StopKey;
  /** The card title — the act's own row line. */
  title: string;
  /** The second line — why it is owed now. */
  why: string | null;
  missed: boolean;
  /** The owning form's button word. */
  button: string;
  poId?: string;
  /** The Communication tab the act picks. */
  party: CommParty;
}

export type CommParty = "supplier" | "warehouse" | "logistics" | "customer";

export type StopKey =
  | "purchasing"
  | "supplier"
  | "receiving"
  | "stock"
  | "logistics"
  | "delivery-date"
  | "money"
  | "delivery-order"
  | "deliver"
  | "delivery-photo"
  | "loan";

/** Route order and the node label the resolver prints. */
export const STOP_ORDER: readonly StopKey[] = [
  "purchasing",
  "supplier",
  "receiving",
  "stock",
  "loan",
  "logistics",
  "delivery-date",
  "money",
  "delivery-order",
  "deliver",
  "delivery-photo",
];

export interface WorkChecklistItem {
  mark: ChecklistMark;
  step: string;
  value: string | null;
  /** A document number the row links to. */
  doc: string | null;
  /** True when the step has completion evidence and counts in progress. */
  counts: boolean;
}

export interface WorkStopCard {
  key: string;
  title: string;
  why: string | null;
  whyTone: "missed" | "due" | "none";
  checklist: WorkChecklistItem[];
  /** `{n} of {m} done`, or null when the card counts nothing. */
  progress: string | null;
  act: WorkAct | null;
}

export interface WorkStop {
  key: StopKey;
  label: string;
  tone: RouteStopTone;
  cards: WorkStopCard[];
  /** No act now: the stop is one quiet line that opens on press. */
  quiet: boolean;
  status: string;
  progress: string | null;
}

export interface WorkPoFact {
  poId: string;
  documentNo: string;
  supplierName: string;
  /** `false` only when a PO window says the current version is not sent. */
  sent: boolean | null;
}

export interface WorkStopsInput {
  route: SalesOrderRouteMap;
  acts: readonly WorkAct[];
  pos: readonly WorkPoFact[];
  logistics: LogisticsCardModel | null;
  spell: (iso: string) => string;
}

const ISO_IN = /(\d{4}-\d{2}-\d{2})/g;

/** A resolver line carries ISO dates with their meaning; the page spells them. */
function spellLine(line: string, spell: (iso: string) => string): string {
  return line.replace(ISO_IN, (iso) => spell(iso)).replace(/: /g, " ");
}

const KIND_TO_STOP: Partial<Record<RouteNodeKind, StopKey>> = {
  purchasing: "purchasing",
  supplier: "supplier",
  receiving: "receiving",
  stock: "stock",
  loan: "loan",
  logistics: "logistics",
  "delivery-date": "delivery-date",
  money: "money",
  "delivery-order": "delivery-order",
  deliver: "deliver",
  "delivery-photo": "delivery-photo",
};

/** `line:PO:purchasing` → the PO id; `line:unassigned:…` → null. */
function poOfNode(node: RouteNode): string | null {
  const parts = node.id.split(":");
  if (parts.length < 3) return null;
  const po = parts[parts.length - 2]!;
  return po === "unassigned" ? null : po;
}

export const done = (n: number, m: number) => `${n} of ${m} done`;

function progressOf(list: readonly WorkChecklistItem[]): string | null {
  const counted = list.filter((item) => item.counts);
  if (counted.length === 0) return null;
  return done(counted.filter((item) => item.mark === "done").length, counted.length);
}

function row(mark: ChecklistMark, step: string, value: string | null, doc: string | null = null, counts = true): WorkChecklistItem {
  return { mark, step, value, doc, counts };
}

/** The checklist of one node, from the facts it already carries. */
function checklistOf(node: RouteNode, input: WorkStopsInput, act: WorkAct | null): WorkChecklistItem[] {
  const spell = (line: string) => spellLine(line, input.spell);
  const actMark: ChecklistMark = act ? (act.missed ? "missed" : "due") : "open";
  const complete = node.mark === "complete";
  const po = poOfNode(node);
  switch (node.kind) {
    case "purchasing": {
      if (!po) return [row("open", "PO issued", spell(node.spoken[0] ?? ""), null)];
      const fact = input.pos.find((p) => p.poId === po);
      const issued = node.spoken.find((l) => l.startsWith("Issued"));
      const list = [row("done", "PO issued", issued ? spell(issued).replace(/^Issued /, "") : null, fact?.documentNo ?? po)];
      if (fact?.sent === false) list.push(row(act ? actMark : "open", "PO sent to supplier", PO_WINDOW_WORK_COPY.notSentWord));
      else if (fact?.sent === true) list.push(row("done", "PO sent to supplier", PO_WINDOW_WORK_COPY.sentWord));
      return list;
    }
    case "supplier":
      return [row(complete ? "done" : act ? actMark : "open", "Supplier Confirmed Delivery Date", complete ? spell(node.spoken[node.spoken.length - 1] ?? "") : "Not recorded")];
    case "receiving":
      return [row(complete ? "done" : act ? actMark : "open", "GRN posted", complete ? null : spell(node.spoken[0] ?? ""), complete ? (node.spoken[0] ?? "").split(" · ")[0] ?? null : null)];
    case "stock":
      return [row(complete ? "done" : "open", "Units ready", spell(node.spoken[0] ?? ""))];
    case "logistics": {
      const list = [row(complete ? "done" : act ? actMark : "open", "Logistics assigned", complete ? (node.spoken[0] ?? null) : null)];
      const t3 = input.logistics?.rows[0];
      if (t3 && t3.state !== "not_needed") {
        const mark: ChecklistMark = t3.state === "done" ? "done" : t3.state === "missed" ? "missed" : "open";
        list.push(row(mark, t3.label, [t3.dueIso ? input.spell(t3.dueIso) : null, t3.fact].filter(Boolean).join(" · ") || null));
      }
      return list;
    }
    case "delivery-date": {
      const list = [row(complete ? "done" : act ? actMark : "open", "Scheduled delivery", complete ? spell(node.spoken[0] ?? "").replace(/^Scheduled delivery /, "") : (node.spoken[0] ?? null))];
      const t1 = input.logistics?.rows[2];
      if (t1 && !complete) list.push(row("none", t1.label, t1.fact ?? (t1.dueIso ? `Opens ${input.spell(t1.dueIso)}` : null), null, false));
      return list;
    }
    case "money":
      return [row(complete ? "done" : act ? actMark : "open", "Customer paid in full", complete ? null : (node.spoken.find((l) => l.startsWith("Customer has not paid"))?.split(" · ")[0]?.replace("Customer has not paid ", "") ?? null))];
    case "delivery-order":
      return node.requirements.map((req) => row(req.met ? "done" : "open", req.text, null, null, false));
    case "deliver":
      return [row(complete ? "done" : "open", "Delivered", null)];
    case "delivery-photo":
      return [row(complete ? "done" : "open", "Delivery photo", null)];
    default:
      return [];
  }
}

/** The card a node draws: its own sentence, else the act that sits on it.
 *  `spoken` holds the resolver's whole sentences; `lines` are the same facts
 *  broken to fit a 208px Route box and must never be read here. */
function cardOf(node: RouteNode, input: WorkStopsInput, act: WorkAct | null): WorkStopCard {
  const lines = node.spoken.map((line) => spellLine(line, input.spell));
  const po = node.kind === "purchasing" ? poOfNode(node) : null;
  const sent = po ? input.pos.find((p) => p.poId === po)?.sent ?? null : null;
  if (!act && po && sent !== null) {
    /* The PO's send state in Purchasing's own words, not its bare number. */
    lines[0] = sent ? PO_WINDOW_WORK_COPY.sentWord : PO_WINDOW_WORK_COPY.notSentWord;
  }
  const checklist = checklistOf(node, input, act);
  const why = act ? act.why : lines.slice(1).filter((l) => !/^Issued /.test(l)).join(" · ") || null;
  return {
    key: act ? act.key : node.id,
    title: act ? act.title : lines[0] ?? node.title,
    why,
    whyTone: act ? (act.missed ? "missed" : "due") : "none",
    checklist,
    progress: node.kind === "delivery-order" ? null : progressOf(checklist),
    act,
  };
}

const UPPER: Record<StopKey, string> = {
  purchasing: "PURCHASING",
  supplier: "SUPPLIER",
  receiving: "RECEIVING",
  stock: "STOCK",
  loan: "LOAN",
  logistics: "LOGISTICS",
  "delivery-date": "DELIVERY DATE",
  money: "PAYMENT",
  "delivery-order": "DELIVERY ORDER",
  deliver: "DELIVER",
  "delivery-photo": "DELIVERY PHOTO",
};

export function workStopsOf(input: WorkStopsInput): WorkStop[] {
  const byStop = new Map<StopKey, RouteNode[]>();
  const seenPo = new Set<string>();
  for (const node of input.route.nodes) {
    const stop = KIND_TO_STOP[node.kind];
    if (!stop) continue;
    /* One PO shows ONE card per stop, however many lines it serves. */
    const po = ["purchasing", "supplier", "receiving"].includes(node.kind) ? poOfNode(node) : null;
    if (po) {
      const key = `${node.kind}:${po}`;
      if (seenPo.has(key)) continue;
      seenPo.add(key);
    }
    byStop.set(stop, [...(byStop.get(stop) ?? []), node]);
  }

  const acts = [...input.acts];
  const takeAct = (stop: StopKey, node: RouteNode): WorkAct | null => {
    const po = poOfNode(node);
    const at = acts.findIndex((a) => a.stop === stop && (!a.poId || !po || a.poId === po));
    return at === -1 ? null : acts.splice(at, 1)[0]!;
  };

  const stops: WorkStop[] = [];
  for (const key of STOP_ORDER) {
    const nodes = byStop.get(key) ?? [];
    const cards = nodes.map((node) => cardOf(node, input, takeAct(key, node)));
    /* An act whose node the Route does not draw still shows on its stop. */
    for (const act of acts.filter((a) => a.stop === key)) {
      cards.push({ key: act.key, title: act.title, why: act.why, whyTone: act.missed ? "missed" : "due", checklist: [], progress: null, act });
    }
    for (let i = acts.length - 1; i >= 0; i -= 1) if (acts[i]!.stop === key) acts.splice(i, 1);
    if (cards.length === 0) continue;

    const withActs = cards.filter((c) => c.act);
    const missed = withActs.some((c) => c.act!.missed);
    const due = !missed && withActs.length > 0;
    const counted = cards.flatMap((c) => c.checklist.filter((i) => i.counts));
    const allDone = counted.length > 0 && counted.every((i) => i.mark === "done") && nodes.every((n) => n.mark === "complete");
    const supplierWaits = key === "supplier" && input.pos.some((p) => p.sent === false);
    stops.push({
      key,
      label: UPPER[key],
      tone: missed ? "missed" : due ? "due" : allDone ? "done" : "none",
      cards,
      quiet: withActs.length === 0,
      status: supplierWaits ? "Supplier has not confirmed the ready date" : cards[0]!.title,
      progress:
        supplierWaits || key === "delivery-order" || counted.length === 0
          ? null
          : done(counted.filter((i) => i.mark === "done").length, counted.length),
    });
  }
  /* Acts first, in Route order among themselves; then every other stop. */
  return [...stops.filter((s) => !s.quiet), ...stops.filter((s) => s.quiet)];
}

/** The Communication tab an act picks (§5.10 A8). */
export function partyOfStop(stop: StopKey): CommParty {
  if (stop === "purchasing" || stop === "supplier") return "supplier";
  if (stop === "receiving" || stop === "stock") return "warehouse";
  if (stop === "logistics" || stop === "delivery-date" || stop === "deliver" || stop === "delivery-photo" || stop === "delivery-order") return "logistics";
  return "customer";
}
