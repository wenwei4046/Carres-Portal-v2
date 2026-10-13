/**
 * WHAT A PURCHASE ORDER GIVES ITS TASK — the parts of the one task view that
 * only Purchasing knows (owner's round 3 brief of 13 Oct 2026, point 2).
 *
 * Pure, from the PO read the panel already holds:
 *
 *   orders    the Sales Orders the PO serves (its governed sources), for the
 *             Sales Order fact, the Route tab and the Files tab
 *   history   what left Carres for the supplier (`sends`) and what the
 *             supplier answered (`promises`), as History prints them
 *
 * Nothing is derived that the read does not say. An `external_open` is said
 * as opening the channel, never as sending: only `PO sent to supplier` is.
 */
import { documentDisplayNumber } from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import type { operationPoListRow } from "@/lib/queries";
import { CHANNEL_WORD } from "../components/PoIssueEvidence";
import type { TaskOrder } from "../tasks/TaskRoute";
import type { TaskHistoryEvent } from "../tasks/task-view";

export const PO_TASK_WORDS = {
  sent: "PO sent to supplier",
  opened: (channel: string) => `${channel} opened`,
  answer: "Supplier answer recorded",
  supplierDate: (dates: string) => `Supplier date ${dates}`,
  delayed: "Delayed",
  supplierDo: (number: string | null) => (number ? `Supplier DO ${number} recorded` : "Supplier DO recorded"),
} as const;

const W = PO_TASK_WORDS;

/** The Sales Orders a PO serves: each once, in source order. */
export function poTaskOrders(po: Pick<operationPoListRow, "sources">): TaskOrder[] {
  const seen = new Set<string>();
  const orders: TaskOrder[] = [];
  for (const source of po.sources ?? []) {
    if (source.kind !== "sales_order" || !source.order_id || seen.has(source.order_id)) continue;
    seen.add(source.order_id);
    /* An older Worker may not name the source: the order is still linked. */
    orders.push({ orderId: source.order_id, label: source.reference || "Sales Order" });
  }
  return orders;
}

const versioned = (poId: string, version: number | null | undefined) =>
  documentDisplayNumber(version == null ? poId : `${poId}-V${version}`);

/** The PO's own recorded history, in no particular order (the frame sorts). */
export function poTaskHistory(po: Pick<operationPoListRow, "id" | "sends" | "promises" | "do_number" | "do_uploaded_at">): TaskHistoryEvent[] {
  const events: TaskHistoryEvent[] = [];
  (po.sends ?? []).forEach((send, index) => {
    const channel = CHANNEL_WORD[send.channel] ?? send.channel;
    events.push({
      key: `send-${index}-${send.sent_at}`,
      at: send.sent_at,
      text: send.kind === "confirmed_sent" ? W.sent : W.opened(channel),
      detail: [versioned(po.id, send.po_version), send.kind === "confirmed_sent" ? channel : null].filter(Boolean).join(" · "),
      by: send.sent_by_name ?? null,
    });
  });
  /* The rows of one recorded answer share `answer_group`: one History line. */
  const groups = new Map<string, NonNullable<operationPoListRow["promises"]>>();
  for (const promise of po.promises ?? []) {
    const key = promise.answer_group ?? promise.id ?? promise.recorded_at;
    const group = groups.get(key);
    if (group) group.push(promise); else groups.set(key, [promise]);
  }
  for (const [key, group] of groups) {
    const first = group[0]!;
    const dates = [...new Set(group.map((row) => row.new_date ?? row.about_date).filter((date): date is string => !!date))].sort();
    events.push({
      key: `answer-${key}`,
      at: first.recorded_at,
      text: W.answer,
      detail: [dates.length ? W.supplierDate(dates.map((date) => fmtDate(date)).join(", ")) : null,
        group.some((row) => row.answer === "delayed") ? W.delayed : null].filter(Boolean).join(" · ") || null,
      by: first.recorded_by_name ?? null,
    });
  }
  if (po.do_uploaded_at) events.push({ key: "supplier-do", at: po.do_uploaded_at, text: W.supplierDo(po.do_number ?? null) });
  return events;
}
