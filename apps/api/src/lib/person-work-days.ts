/**
 * THE RESPONSIBLE PERSON'S WORKING WEEK, read for an action day (owner
 * correction 9 Oct 2026). People/HR owns `hr_employees.work_days` (0678);
 * this reads ONLY the working days of the named people through the narrow
 * definer read `workspace_person_work_days` — nothing else of the HR file.
 *
 * A person missing from the map has no recorded week: the caller falls back
 * to the Office working weekdays (`personOwnerCalendar`). Fails SAFE to an
 * empty map (the storage not installed, a refused read, a thrown client).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { personWorkDaysOf } from "@carres/shared";

export async function readPersonWorkDays(
  sb: SupabaseClient,
  userIds: readonly (string | null | undefined)[],
): Promise<Map<string, number[]>> {
  const ids = [...new Set(userIds.filter((id): id is string => typeof id === "string" && id.length > 0))];
  const out = new Map<string, number[]>();
  if (ids.length === 0) return out;
  try {
    const { data, error } = await sb.rpc("workspace_person_work_days", { p_user_ids: ids });
    if (error || !Array.isArray(data)) return out;
    for (const row of data as Array<{ user_id?: string; work_days?: unknown }>) {
      const days = personWorkDaysOf(row.work_days);
      if (row.user_id && days) out.set(row.user_id, days);
    }
    return out;
  } catch {
    return new Map();
  }
}
