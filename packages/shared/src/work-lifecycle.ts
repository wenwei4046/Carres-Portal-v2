/**
 * ⭐ THE WORK LIFECYCLE — `To do` · `Waiting` · `Completed` (owner rulings,
 * Jess 2026-09-24; ledger 0581 `work_occurrence_events`).
 *
 *   request_sent    Waiting. From an integrated provider only after the
 *                   provider accepted it; otherwise staff's explicit
 *                   `Record request sent`. Opening or copying a WhatsApp or
 *                   email text is never a send. A send never completes work.
 *   reply_received  back to To do (unless the module's completion fact is
 *                   already true — then the occurrence is not open at all).
 *   completed       only the owning module's completion fact. Terminal; a
 *                   recurring problem is a new occurrence.
 *
 * The state is DERIVED here from the ledger — no table stores it. An OPEN
 * occurrence is never Completed: completion takes it out of the open set, so
 * this function answers only `to_do` or `waiting` for the rows Work shows.
 */
import { z } from "zod";
import { myHolidaySet } from "./my-holidays";
import { OFFICE_OFF_DAYS } from "./order-action-due";
import { addWorkingDays } from "./working-days";

export const WORK_EVENT_KINDS = ["request_sent", "reply_received", "completed"] as const;
export const WORK_CHANNELS = ["whatsapp", "email", "phone", "in_person"] as const;
export const WORK_CONTACT_KINDS = ["customer", "supplier", "delivery_partner", "dealer"] as const;

export type WorkChannel = (typeof WORK_CHANNELS)[number];
export type WorkContactKind = (typeof WORK_CONTACT_KINDS)[number];

export const workOccurrenceEventSchema = z.object({
  id: z.string().uuid(),
  occurrenceId: z.string().min(5),
  event: z.enum(WORK_EVENT_KINDS),
  actorId: z.string().uuid().nullable(),
  at: z.string().min(10),
  channel: z.enum(WORK_CHANNELS).nullable(),
  contactKind: z.enum(WORK_CONTACT_KINDS).nullable(),
  contactId: z.string().uuid().nullable(),
  replyDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  resultReference: z.string().min(1).nullable(),
  sourceVersion: z.string().min(1),
  /** `completed` only: the original Work date (null = No working date). */
  actionOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  /** `completed` only: the document reference, `SO-1318`. */
  objectLabel: z.string().min(1).nullable(),
}).strict();

export type WorkOccurrenceEvent = z.infer<typeof workOccurrenceEventSchema>;

export const operationWorkLifecycleSchema = z.object({
  state: z.enum(["to_do", "waiting"]),
  /** When the pending request was recorded; null when not waiting. */
  waitingSince: z.string().nullable(),
  /** The latest send's reply due date (kept after it passes, for `No reply by`). */
  replyDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  /** The due date passed with no reply: the work is back in To do. */
  replyMissed: z.boolean(),
  channel: z.enum(WORK_CHANNELS).nullable(),
  contactKind: z.enum(WORK_CONTACT_KINDS).nullable(),
  contactId: z.string().uuid().nullable(),
  lastReplyAt: z.string().nullable(),
}).strict();

export type OperationWorkLifecycle = z.infer<typeof operationWorkLifecycleSchema>;

export const WORK_LIFECYCLE_TO_DO: OperationWorkLifecycle = {
  state: "to_do",
  waitingSince: null,
  replyDueOn: null,
  replyMissed: false,
  channel: null,
  contactKind: null,
  contactId: null,
  lastReplyAt: null,
};

/** One open occurrence's state from its ledger rows. `today` is Malaysia's date. */
export function workLifecycleOf(events: readonly WorkOccurrenceEvent[], today: string): OperationWorkLifecycle {
  const ordered = events
    .filter((e) => e.event !== "completed")
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const latest = ordered[ordered.length - 1];
  const lastReply = [...ordered].reverse().find((e) => e.event === "reply_received") ?? null;
  if (!latest) return WORK_LIFECYCLE_TO_DO;
  if (latest.event === "reply_received") {
    return { ...WORK_LIFECYCLE_TO_DO, lastReplyAt: latest.at };
  }
  const missed = latest.replyDueOn !== null && latest.replyDueOn < today;
  return {
    state: missed ? "to_do" : "waiting",
    waitingSince: missed ? null : latest.at,
    replyDueOn: latest.replyDueOn,
    replyMissed: missed,
    channel: latest.channel,
    contactKind: latest.contactKind,
    contactId: latest.contactId,
    lastReplyAt: lastReply?.at ?? null,
  };
}

/** Working days a reply is given, by rule. A rule not listed gets one. */
export const WORK_REPLY_WORKING_DAYS: Readonly<Record<string, number>> = {};

/** The reply due date: working days after `sentOn` on the Malaysian office
 *  calendar — Saturday, Sunday and the shared public holidays are skipped,
 *  the same days the 0581 door refuses. */
export function workReplyDueOn(sentOn: string, ruleKey?: string): string {
  const days = (ruleKey && WORK_REPLY_WORKING_DAYS[ruleKey]) || 1;
  return addWorkingDays(sentOn, days, { holidays: myHolidaySet(), offDays: OFFICE_OFF_DAYS });
}

/** An item's lifecycle, To do when the read attached none. */
export function workLifecycleOrToDo(item: { lifecycle?: OperationWorkLifecycle }): OperationWorkLifecycle {
  return item.lifecycle ?? WORK_LIFECYCLE_TO_DO;
}
