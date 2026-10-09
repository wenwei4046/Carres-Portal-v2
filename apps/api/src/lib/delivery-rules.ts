/**
 * THE ONE READER of `Delivery Settings → Delivery Rules` (0673) for every
 * deadline the Worker computes: the Work feed's `Assign logistics` due, the
 * Delivery Settings page and the web's leads read.
 *
 * Fails SAFE to the owner-confirmed default (3 Delivery working days) when
 * the storage is not installed or unreadable, and says so through
 * `stored: false`; a Settings page never offers Edit on that answer.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_ASSIGNMENT_LEAD_WORKING_DAYS } from "@carres/shared";

export interface StoredDeliveryRules {
  assignmentLeadWorkingDays: number;
  revision: number | null;
  changedAt: string | null;
  changedBy: string | null;
  stored: boolean;
}

export const DEFAULT_DELIVERY_RULES: StoredDeliveryRules = Object.freeze({
  assignmentLeadWorkingDays: DEFAULT_ASSIGNMENT_LEAD_WORKING_DAYS,
  revision: null,
  changedAt: null,
  changedBy: null,
  stored: false,
});

export async function readDeliveryRules(sb: SupabaseClient): Promise<StoredDeliveryRules> {
  try {
    const { data, error } = await sb
      .from("delivery_rules")
      .select("assignment_lead_working_days, revision, changed_at, changed_by")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return DEFAULT_DELIVERY_RULES;
    const row = data as { assignment_lead_working_days: number; revision: number; changed_at: string | null; changed_by: string | null };
    const days = Number(row.assignment_lead_working_days);
    return {
      assignmentLeadWorkingDays: Number.isInteger(days) && days >= 1 && days <= 30 ? days : DEFAULT_ASSIGNMENT_LEAD_WORKING_DAYS,
      revision: Number(row.revision),
      changedAt: row.changed_at ?? null,
      changedBy: row.changed_by ?? null,
      stored: true,
    };
  } catch {
    return DEFAULT_DELIVERY_RULES;
  }
}
