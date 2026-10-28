import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 0691 (Chew 2026-10-12): Finance's AutoCount-style codes for suppliers,
 * other creditors and other debtors (400-A001, 405-N001, 305-A001).
 *
 * `fin_party_codes()` gives a new supplier or party its code before it
 * answers, so every list that reads through here shows one. A database
 * without 0691, or a refusal, answers no codes: the list still loads, with
 * its names, as it did before.
 */
export interface PartyCodes {
  bySupplier: Map<string, string>;
  byParty: Map<string, string>;
}

export async function readPartyCodes(client: SupabaseClient): Promise<PartyCodes> {
  const bySupplier = new Map<string, string>();
  const byParty = new Map<string, string>();
  let answer: { data: unknown; error: unknown };
  try {
    answer = await client.rpc("fin_party_codes");
  } catch {
    return { bySupplier, byParty };
  }
  const { data, error } = answer;
  if (error || !Array.isArray(data)) return { bySupplier, byParty };
  for (const r of data as Array<{ supplier_id: string | null; party_id: string | null; code: string }>) {
    if (r.supplier_id) bySupplier.set(r.supplier_id, r.code);
    if (r.party_id) byParty.set(r.party_id, r.code);
  }
  return { bySupplier, byParty };
}
