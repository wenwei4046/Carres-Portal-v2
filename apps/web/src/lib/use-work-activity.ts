import { useEffect } from "react";
import { useAuth } from "./auth";
import { apiFetch } from "./api";
import { observeWorkActivity } from "./work-activity";

/** One collector for the authenticated person across module navigation.
 * Principal work in Finance/People is still portal activity. The database
 * remains the authority for active personal identity and the work period. */
export function useWorkActivity(): void {
  const userId = useAuth((state) => state.user?.id);
  const role = useAuth((state) => state.role);
  useEffect(() => {
    if (!userId || (role !== "operation" && role !== "principal")) return;
    return observeWorkActivity(document, () =>
      apiFetch("/api/operation/work-activity", { method: "POST" }),
    );
  }, [userId, role]);
}
