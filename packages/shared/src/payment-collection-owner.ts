/**
 * ONE SALES ORDER, ONE COLLECTION OWNER (owner ruling 2026-09-13 —
 * `docs/payment/MASTER.md` §3 · §10 · §12; migration 0489).
 *
 * The owner of ordinary customer-balance collection is the RESPONSIBLE
 * DELIVERY OPERATION — not a daily duty. When collection first becomes
 * actionable for a Sales Order (balance in the window, a missed promise, or a
 * live Storage Invoice), the Delivery Duty NORMAL holder on that day is
 * written as the order's collection owner and stays its owner until the
 * balance is fully paid. A changed date, a duty rotation, a filter or a page
 * reload never rotates it; only governed buddy cover (the acting person for
 * today, the owner preserved) or a formal handover (full evidence, append-only)
 * changes who acts.
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
/** The duty the owner is established FROM; the duty word an unresolved
 *  owner stands under (Team Work groups, the Monitor cell). */
export const COLLECTION_OWNER_DUTY_KEY = "delivery_duty";
export const COLLECTION_OWNER_DUTY_WORD = "Delivery Duty";
/** The governed configuration failure (Delivery MASTER §13.1 · COPY-STANDARD). */
export const NO_DELIVERY_DUTY_HOLDER = "Nobody holds Delivery Duty.";
export const SET_HOLDER_DOOR = "Set the holder in Workspace → Staff & Duties";

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
  source: "established" | "handover";
  effective_from: string;
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
