import { adminClient } from "./supabase";
import type { Bindings } from "../types";

/** Server-owned integration evidence. Caller must first check actor permission,
 * user-visible PO rows, current versions, supplier and its saved recipient.
 * The RPC repeats those checks and atomically reserves every document version.
 */
export async function preparePoEmailAttempt(env: Bindings, actorId: string, input: {
  attemptId: string; supplierId: string; recipient: string; subject: string;
  message: string; documents: { id: string; version: number; filename: string; content: string }[]; resend?: boolean;
}) {
  const bytes = new TextEncoder().encode(JSON.stringify({ supplier: input.supplierId,
    recipient: input.recipient, subject: input.subject, message: input.message,
    documents: [...input.documents].sort((a, b) => a.id.localeCompare(b.id)) }));
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map(value => value.toString(16).padStart(2, "0")).join("");
  return adminClient(env).rpc("purchasing_prepare_po_email", {
    p_attempt_id: input.attemptId, p_actor_id: actorId, p_supplier_id: input.supplierId,
    p_recipient: input.recipient, p_payload_digest: digest,
    p_documents: input.documents.map(document => ({ id: document.id, version: document.version })),
    p_resend: input.resend ?? false,
  });
}

export async function recordPoEmailOutcome(env: Bindings, attemptId: string,
  outcome: "unknown" | "failed" | "dispatched", providerId?: string) {
  return adminClient(env).rpc("purchasing_record_po_email_outcome", {
    p_attempt_id: attemptId, p_outcome: outcome, p_provider_id: providerId ?? null,
  });
}

/** Only expose the one PO/version already proved visible through the user's RLS. */
export async function readPoEmailAttempts(env: Bindings, poId: string) {
  return adminClient(env).from("po_email_attempt_documents")
    .select("po_id,po_version,po_email_attempts!inner(id,outcome,provider_id,recipient)")
    .eq("po_id", poId);
}
