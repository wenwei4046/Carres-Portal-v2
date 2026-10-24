import type { SupabaseClient } from "@supabase/supabase-js";
/** Source-scoped names only. The personnel table stays hidden from other roles. */
export async function receivingActorNames(sb: SupabaseClient, receiptId: string, actorIds: readonly string[]): Promise<Record<string,string> | null> {
  const {data,error}=await sb.rpc("receiving_receipt_actor_names",{p_receipt_id:receiptId});
  if(error){
    if(["PGRST202","42883"].includes(error.code ?? "") && error.message.includes("receiving_receipt_actor_names"))return null;
    throw new Error("Receiving actor names could not be loaded");
  }
  if(!data || typeof data!=="object" || Array.isArray(data) || Object.entries(data).some(([id,name])=>!/^[-0-9a-f]{36}$/i.test(id) || typeof name!=="string"))throw new Error("Receiving actor names could not be loaded");
  const allowed=new Set(actorIds);
  return Object.fromEntries(Object.entries(data).filter(([id,name])=>allowed.has(id) && String(name).trim())) as Record<string,string>;
}
