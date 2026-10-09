import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  saturdayOnCallResponseSchema,
  type SaturdayOnCallSetInput,
  type SaturdayOnCallWindowInput,
} from "@carres/shared/workspace-saturday-on-call";
import { apiFetch } from "./api";

/**
 * Saturday on-call (migration 0671) — a small Staff & Duties section, never a
 * Duty. The editor gate, the leave flag and every rule are the database's.
 */
export const saturdayOnCallKey = ["workspace", "saturday-on-call"] as const;

export function useSaturdayOnCall(weeks = 6) {
  return useQuery({
    queryKey: [...saturdayOnCallKey, weeks],
    queryFn: async () =>
      saturdayOnCallResponseSchema.parse(await apiFetch<unknown>(`/api/operation/saturday-on-call?weeks=${weeks}`)),
    staleTime: 30_000,
  });
}

export function useSaveSaturdayOnCallWindow() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SaturdayOnCallWindowInput) =>
      apiFetch<unknown>("/api/operation/saturday-on-call/window", { method: "PUT", body: JSON.stringify(input) }),
    onSettled: () => void client.invalidateQueries({ queryKey: saturdayOnCallKey }),
  });
}

export function useSetSaturdayOnCall() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ saturday, ...input }: SaturdayOnCallSetInput & { saturday: string }) =>
      apiFetch<unknown>(`/api/operation/saturday-on-call/${encodeURIComponent(saturday)}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSettled: () => void client.invalidateQueries({ queryKey: saturdayOnCallKey }),
  });
}

/** COPY-STANDARD "Saturday on-call" — one sentence per refusal. */
export function saturdayOnCallRefusalSentence(error: unknown, name = "This person"): string {
  const body = (error as { body?: unknown } | null)?.body;
  const code = body && typeof body === "object" ? (body as { code?: unknown }).code : null;
  switch (code) {
    case "settings_changed":
      return "These times changed. Cancel and try again.";
    case "invalid_window":
      return "Ends must be after Starts.";
    case "cover_is_person":
      return "Choose another person for Cover.";
    case "invalid_person":
    case "invalid_cover":
      return `${name} cannot be on call. Choose an eligible active staff member.`;
    case "not_settings_editor":
      return "Saturday on-call is set by Jess or a person she names.";
    default:
      return "Saturday on-call was not saved. Try again.";
  }
}
