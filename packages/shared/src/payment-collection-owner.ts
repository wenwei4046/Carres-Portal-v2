/** One translation of the current assignment for Orders, Work and Payment.
 * Original allocation remains evidence; only the resolver's actual current
 * person answers Assigned to. A departed original never hides a replacement.
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
  normal_user_id: string | null;
  normal_user_name: string | null;
  cover_user_id: string | null;
  cover_user_name: string | null;
  acting_user_id: string | null;
  acting_user_name: string | null;
  is_cover: boolean;
  cover_ends_on: string | null;
  /** 0504 — `assigned` is the order's own Operation assignment, which needs no
   *  ledger row to be true; `established`/`handover` are ledger rows. */
  source: "established" | "handover" | "assigned" | "not_assigned" | "system_assignment";
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
  if (!row) {
    return {
      dutyKey: COLLECTION_OWNER_DUTY_KEY, onDate: today,
      normalOwner: null, buddy: null, activeCover: null, actingPerson: null,
      state: "not_assigned", assignmentId: null,
    };
  }
  const acting = person(row.acting_user_id, row.acting_user_name);
  const cover = row.is_cover && acting && acting.userId !== normal?.userId ? acting : null;
  const covered = !!cover;
  return {
    dutyKey: COLLECTION_OWNER_DUTY_KEY,
    onDate: today,
    normalOwner: normal,
    buddy: covered ? cover : null,
    activeCover: covered ? cover : null,
    actingPerson: acting,
    state: !acting ? "not_assigned" : covered ? "covered" : "primary",
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
