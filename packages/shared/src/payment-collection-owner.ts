/**
 * ONE SALES ORDER, ONE COLLECTION OWNER (owner ruling 2026-09-13 —
 * `docs/payment/MASTER.md` §3 · §10 · §12; migrations 0489 · 0504).
 *
 * The owner of ordinary customer-balance collection is the RESPONSIBLE
 * DELIVERY OPERATION — not a daily duty, and since 0504 not a duty holder
 * either: it is the INDIVIDUAL the Sales Order was dealt to when it entered
 * Operations (`ops_order_control.assigned_staff`). That person carries the
 * customer follow-up and stays the owner until the balance is fully paid. A
 * changed date, a duty rotation, a filter or a page reload never rotates it;
 * only governed buddy cover (the acting person for today, the owner preserved)
 * or a formal handover (full evidence, append-only) changes who acts.
 *
 * This module is the ONE translation of the database's context row
 * (`payment_collection_owner_context`) into the shared Work owner shape every
 * surface reads — the Work feed, My Work, Team Work, the Quick Rail and the
 * Payment Monitor's owner cell all print the same three facts: normal owner ·
 * today's cover · acting person.
 */

import type { WorkspaceDutyPerson, WorkspaceDutyResolution } from "./workspace-duty";

/** The owner-rule word — Payment MASTER §10's own column. */
export const COLLECTION_OWNER_RULE_WORD = "Responsible Delivery Operation";
/** The duty word an unresolved owner stands under in the shared Work surfaces,
 *  and the key the buddy-cover law is written against. Since 0504 the owner is
 *  no longer established FROM this duty — it is the person the Sales Order was
 *  dealt to — but cover is still configured here, so the key stays. */
export const COLLECTION_OWNER_DUTY_KEY = "delivery_duty";
export const COLLECTION_OWNER_DUTY_WORD = "Delivery Duty";
/**
 * ⭐ NOBODY ASSIGNED — the governed failure when no collection owner resolves
 * (owner instruction 2026-09-16, clearing the stale `Nobody holds Delivery
 * Duty.` hint). Since 0504 the owner is the individual the Sales Order was
 * dealt to, so an unresolved owner means nobody is assigned to THIS order and
 * the one door that fixes it is the Sales Orders Team (a manager assigns).
 * Staff & Duties cannot fix it and is no longer named here. The short word on
 * a fixed 72px row is `Not assigned`; its accessible name is the sentence and
 * the door together.
 */
export const COLLECTION_NOT_ASSIGNED = "Not assigned";
export const NOBODY_ASSIGNED_TO_ORDER = "Nobody is assigned to this order.";
export const ASSIGN_IN_SALES_ORDERS = "Assign it in Sales Orders → Team";
export const ASSIGN_IN_SALES_ORDERS_HREF = "/operation/orders";

export interface CollectionOwnerHistoryRow {
  id: string;
  source: "established" | "handover";
  owner_user_id: string;
  owner_user_name: string | null;
  previous_owner_user_id: string | null;
  previous_owner_user_name: string | null;
  reason: string;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string;
  effective_from: string;
}

/** One order's row from `payment_collection_owner_context`. */
export interface CollectionOwnerContextRow {
  order_id: string;
  normal_user_id: string;
  normal_user_name: string | null;
  cover_user_id: string | null;
  cover_user_name: string | null;
  acting_user_id: string;
  acting_user_name: string | null;
  is_cover: boolean;
  cover_ends_on: string | null;
  /** 0504 — `assigned` is the order's own Operation assignment, which needs no
   *  ledger row to be true; `established`/`handover` are ledger rows. */
  source: "established" | "handover" | "assigned";
  effective_from: string | null;
  established_on: string | null;
  history: CollectionOwnerHistoryRow[];
}

function person(userId: string | null | undefined, name: string | null | undefined): WorkspaceDutyPerson | null {
  if (!userId) return null;
  return { userId, name: name && name.trim().length > 0 ? name : null };
}

/**
 * The shared Work owner shape for one order. No row ⇒ the honest
 * `not_assigned` under the Delivery Duty word — never a PIC, never a
 * superuser, never yesterday's holder.
 */
export function collectionOwnerResolution(
  row: CollectionOwnerContextRow | null | undefined,
  today: string,
): WorkspaceDutyResolution {
  const normal = row ? person(row.normal_user_id, row.normal_user_name) : null;
  if (!row || !normal) {
    return {
      dutyKey: COLLECTION_OWNER_DUTY_KEY, onDate: today,
      normalOwner: null, buddy: null, activeCover: null, actingPerson: null,
      state: "not_assigned", assignmentId: null,
    };
  }
  const cover = row.is_cover ? person(row.cover_user_id, row.cover_user_name) : null;
  const covered = !!cover && cover.userId !== normal.userId;
  return {
    dutyKey: COLLECTION_OWNER_DUTY_KEY,
    onDate: today,
    normalOwner: normal,
    buddy: covered ? cover : null,
    activeCover: covered ? cover : null,
    actingPerson: covered ? cover : normal,
    state: covered ? "covered" : "primary",
    assignmentId: null,
  };
}

/** `Normal owner: Shasha · Today's cover: Yu Jun` — the two facts, never
 *  collapsed into one name. */
export function collectionOwnerFacts(resolution: WorkspaceDutyResolution): {
  normal: string | null; cover: string | null; acting: string | null;
} {
  return {
    normal: resolution.normalOwner?.name ?? null,
    cover: resolution.activeCover?.name ?? null,
    acting: resolution.actingPerson?.name ?? null,
  };
}
