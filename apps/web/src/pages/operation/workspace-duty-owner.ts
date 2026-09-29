import { COLLECTION_OWNER_DUTY_KEY } from "@carres/shared";
import type { WorkspaceDutiesResponse } from "@/lib/queries";

export interface WorkspaceDutyActor {
  userId: string;
  name: string | null;
  email: string;
}

/** The person who must act today. The normal holder remains unchanged in the
 * Workspace response, while an effective cover becomes the acting person. */
export function workspaceDutyActor(
  data: WorkspaceDutiesResponse | undefined,
  dutyKey: string,
): WorkspaceDutyActor | null {
  const resolution = data?.duties.find((duty) => duty.key === dutyKey)?.resolution;
  const userId = resolution?.actor_user_id ?? null;
  if (!userId) return null;
  const isActingCover = resolution?.acting_user_id === userId;
  return {
    userId,
    email: "",
    name: isActingCover
      ? (resolution?.acting_user_name ?? null)
      : (resolution?.normal_user_name ?? null),
  };
}

/**
 * Who each Order Route action names. Purchasing and Receiving are duties;
 * `Choose Ready Unit` is the Sales Order PIC's; Delivery and Payment act
 * through the order's own owner (the SO PIC, cover included, owner ruling
 * 2026-09-17) and, until that owner is established, today's Delivery Duty —
 * the rule Work uses. A line that acts always names who (2026-09-27).
 */
export function routeActionOwnersOf(
  duties: WorkspaceDutiesResponse | undefined,
  orderOwner: WorkspaceDutyActor | null,
) {
  const orderOrDuty = orderOwner ?? workspaceDutyActor(duties, COLLECTION_OWNER_DUTY_KEY);
  return {
    purchasing: workspaceDutyActor(duties, "po_duty"),
    receiving: workspaceDutyActor(duties, "grn_duty"),
    sales: orderOwner,
    delivery: orderOrDuty,
    payment: orderOrDuty,
  };
}
