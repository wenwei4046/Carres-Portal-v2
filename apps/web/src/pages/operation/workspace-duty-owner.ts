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
