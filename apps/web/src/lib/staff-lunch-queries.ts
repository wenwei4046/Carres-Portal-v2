/**
 * Settings → Personal → Lunch time (owner order 9 Oct 2026, migration 0677).
 * Every time comes from the database's one lunch and window arithmetic; the
 * screen only prints it. Saving a lunch moves the person's afternoon check, so
 * the Team list is refreshed too.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workspaceStaffLunchSchema, type WorkspaceStaffLunch, type WorkspaceStaffLunchInput } from "@carres/shared";
import { apiFetch } from "./api";

export const STAFF_LUNCH_KEY = ["operation", "work-activity", "lunch"] as const;

export function useStaffLunch() {
  return useQuery({
    queryKey: STAFF_LUNCH_KEY,
    queryFn: async () => workspaceStaffLunchSchema.parse(await apiFetch<unknown>("/api/operation/work-activity/lunch")),
    staleTime: 30_000,
  });
}

export function useSaveStaffLunch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: WorkspaceStaffLunchInput): Promise<WorkspaceStaffLunch> =>
      workspaceStaffLunchSchema.parse(await apiFetch<unknown>("/api/operation/work-activity/lunch", {
        method: "PUT", body: JSON.stringify(input),
      })),
    onSuccess: (data, input) => {
      if (!input.userId) client.setQueryData(STAFF_LUNCH_KEY, data);
      void client.invalidateQueries({ queryKey: ["operation", "work-activity", "team-today"] });
    },
    onError: () => { void client.invalidateQueries({ queryKey: STAFF_LUNCH_KEY }); },
  });
}
