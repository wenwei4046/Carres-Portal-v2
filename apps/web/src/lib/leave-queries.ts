import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  leaveRecorderViewSchema,
  myLeaveResponseSchema,
  teamLeaveResponseSchema,
  type StaffLeaveRecordForInput,
  type StaffLeaveSubmitInput,
} from "@carres/shared/workspace-leave";
import { apiFetch } from "./api";

/**
 * Workspace → Leave (migration 0670). Reads and writes go through
 * `/api/operation/leave`; the SQL doors own every rule. A recorded leave moves
 * today's work at once, so a success also refreshes Staff & Duties, the Team
 * list and Work — they read the same resolver.
 */
export const leaveKeys = {
  mine: ["workspace", "leave", "mine"] as const,
  team: (days: number) => ["workspace", "leave", "team", days] as const,
};

export function useMyLeave() {
  return useQuery({
    queryKey: leaveKeys.mine,
    queryFn: async () => myLeaveResponseSchema.parse(await apiFetch<unknown>("/api/operation/leave")),
    staleTime: 30_000,
    // Not switched on yet (503) is an answer, not a blip: show it at once.
    retry: (count, error) => (error as { status?: number })?.status !== 503 && count < 2,
  });
}

export function useTeamLeave(days = 7) {
  return useQuery({
    queryKey: leaveKeys.team(days),
    queryFn: async () => teamLeaveResponseSchema.parse(await apiFetch<unknown>(`/api/operation/leave/team?days=${days}`)),
    staleTime: 30_000,
  });
}

function useRefreshAfterLeave() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ["workspace", "leave"] });
    void client.invalidateQueries({ queryKey: ["workspace", "saturday-on-call"] });
    void client.invalidateQueries({ queryKey: ["operation", "workspace-duties"] });
    void client.invalidateQueries({ queryKey: ["operation", "work"] });
    void client.invalidateQueries({ queryKey: ["operation", "work-activity", "team-today"] });
  };
}

export function useSubmitLeave() {
  const refresh = useRefreshAfterLeave();
  return useMutation({
    mutationFn: (input: StaffLeaveSubmitInput) =>
      apiFetch<{ id: string; cover_moved: number }>("/api/operation/leave", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: refresh,
  });
}

/** 0680 — may I record leave for a colleague, whom, and what I recorded. */
export function useLeaveRecorder() {
  return useQuery({
    queryKey: ["workspace", "leave", "recorder"] as const,
    queryFn: async () => leaveRecorderViewSchema.parse(await apiFetch<unknown>("/api/operation/leave/recorder")),
    staleTime: 60_000,
  });
}

/** 0680 — record a colleague's leave (the owner or a named Staff & Duties editor). */
export function useRecordLeaveFor() {
  const refresh = useRefreshAfterLeave();
  return useMutation({
    mutationFn: (input: StaffLeaveRecordForInput) =>
      apiFetch<{ id: string; cover_moved: number }>("/api/operation/leave/for", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: refresh,
  });
}

export function useCancelLeave() {
  const refresh = useRefreshAfterLeave();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(`/api/operation/leave/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: refresh,
  });
}

/** A one-time upload slot in MY folder of the private proof bucket. */
export function signLeaveProof(file: File) {
  return apiFetch<{ token: string; path: string }>("/api/operation/leave/proof/sign", {
    method: "POST",
    body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
  });
}

/** Opens one proof file through a short-lived signed link. */
export async function openLeaveProof(path: string) {
  const { url } = await apiFetch<{ url: string }>(
    `/api/operation/leave/proof/url?path=${encodeURIComponent(path)}`,
  );
  window.open(url, "_blank", "noopener");
}

/** The refusal code a leave door returned, or `unknown`. */
export function leaveRefusalCode(error: unknown): string {
  const body = (error as { body?: unknown } | null)?.body;
  const code = body && typeof body === "object" ? (body as { code?: unknown }).code : null;
  return typeof code === "string" ? code : "unknown";
}

/** COPY-STANDARD "Workspace → Leave" — one sentence per refusal, never the
 *  database's own text. */
export function leaveRefusalSentence(act: "submit" | "cancel", error: unknown, forName?: string): string {
  switch (leaveRefusalCode(error)) {
    case "leave_overlap":
      return forName ? `${forName} already has leave on these dates.` : "You already have leave on these dates.";
    case "not_leave_recorder":
    case "forbidden":
      return "Only the owner and the people named for Staff & Duties can record leave for a colleague.";
    case "invalid_proof":
      return "Upload the MC proof again.";
    case "reason_required":
      return "Write the reason.";
    case "invalid_dates":
      return "Choose valid leave dates.";
    case "text_too_long":
      return "The text is too long. Make it shorter.";
    case "not_staff":
      return "Only active staff can record leave.";
    case "already_cancelled":
      return "This leave is already cancelled.";
    case "leave_finished":
      return "This leave has no days left to cancel.";
    default:
      return act === "submit" ? "Leave was not recorded. Try again." : "Leave was not cancelled. Try again.";
  }
}
