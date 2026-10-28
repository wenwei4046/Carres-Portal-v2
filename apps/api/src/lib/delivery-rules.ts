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
import { DEFAULT_ASSIGNMENT_LEAD_WORKING_DAYS, DEFAULT_COURIER_DISPATCH_WORKING_DAYS } from "@carres/shared";

export interface StoredDeliveryRules {
  assignmentLeadWorkingDays: number;
  /** DEL-10 · `Courier dispatch within` (0678), default 3. */
  courierDispatchWorkingDays: number;
  /** False until 0678 adds the column — the default answers and Edit is not offered. */
  courierDispatchStored: boolean;
  revision: number | null;
  changedAt: string | null;
  changedBy: string | null;
  stored: boolean;
}

export const DEFAULT_DELIVERY_RULES: StoredDeliveryRules = Object.freeze({
  assignmentLeadWorkingDays: DEFAULT_ASSIGNMENT_LEAD_WORKING_DAYS,
  courierDispatchWorkingDays: DEFAULT_COURIER_DISPATCH_WORKING_DAYS,
  courierDispatchStored: false,
  revision: null,
  changedAt: null,
  changedBy: null,
  stored: false,
});

export async function readDeliveryRules(sb: SupabaseClient): Promise<StoredDeliveryRules> {
  try {
    const { data, error } = await sb
      .from("delivery_rules")
      /* `*` so the row still reads before 0678 adds the courier column: a
         missing column answers its default instead of failing the row. */
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return DEFAULT_DELIVERY_RULES;
    const row = data as {
      assignment_lead_working_days: number;
      courier_dispatch_working_days?: number | null;
      revision: number;
      changed_at: string | null;
      changed_by: string | null;
    };
    const days = Number(row.assignment_lead_working_days);
    const courier = Number(row.courier_dispatch_working_days);
    const courierStored = row.courier_dispatch_working_days != null && Number.isInteger(courier) && courier >= 1 && courier <= 30;
    return {
      assignmentLeadWorkingDays: Number.isInteger(days) && days >= 1 && days <= 30 ? days : DEFAULT_ASSIGNMENT_LEAD_WORKING_DAYS,
      courierDispatchWorkingDays: courierStored ? courier : DEFAULT_COURIER_DISPATCH_WORKING_DAYS,
      courierDispatchStored: courierStored,
      revision: Number(row.revision),
      changedAt: row.changed_at ?? null,
      changedBy: row.changed_by ?? null,
      stored: true,
    };
  } catch {
    return DEFAULT_DELIVERY_RULES;
  }
}
