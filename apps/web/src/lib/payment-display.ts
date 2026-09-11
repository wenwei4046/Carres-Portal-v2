/**
 * PAYMENT LEDGER DISPLAY — the method word and the slip door, written once.
 *
 * Both live surfaces that print `order_payments` rows need them: the order
 * drawer's Balance rows and the Sales Order detail's payment card. They were a
 * private const and a private function inside `OrderDetailDrawer.tsx`, so the
 * second surface could only have a SECOND copy — and a second copy of a label
 * map is how `e-wallet` becomes `E-Wallet` on one screen and not the other
 * (ownership Law D: one derived fact, one implementation).
 *
 * The method word is not a second map: since 0476 a payment method is a
 * setting, and `methodLabel` (lib/payment-methods) is the one name lookup.
 * The slip door is the drawer's own, moved.
 */
import { toast } from "sonner";
import { DEFAULT_PAYMENT_METHODS, type OrderPaymentMethod, type OrderPaymentRow } from "@carres/shared";
import { supabase } from "@/lib/supabase";
import { ATTACHMENTS_BUCKET } from "@/lib/storage";
import { methodLabel } from "@/lib/payment-methods";

/** The method word for one row — the same name every payment surface prints. */
export function payMethodWord(method: OrderPaymentMethod | string | null): string {
  return methodLabel(method);
}

/** Open a payment's uploaded proof: an https receipt URL directly, or a
 *  storage path via a fresh signed URL (internal read, 1h TTL). */
export async function viewSlip(p: Pick<OrderPaymentRow, "receipt_url">) {
  const u = p.receipt_url;
  if (!u) return;
  if (/^https?:/i.test(u)) {
    window.open(u, "_blank", "noopener");
    return;
  }
  const path = u.startsWith(`${ATTACHMENTS_BUCKET}/`)
    ? u.slice(ATTACHMENTS_BUCKET.length + 1)
    : u;
  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    toast.error(`Couldn't open slip — ${error?.message ?? "no URL"}`);
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

/** POS capture codes have different meanings from operational ledger codes. */
export function atSalePaymentWord(method: string | null | undefined, months: number | null | undefined): string | null {
  const word = method ? (DEFAULT_PAYMENT_METHODS.find((m) => m.key === method)?.label ?? payMethodWord(method)) : null;
  const plan = months != null && Number.isInteger(Number(months)) && Number(months) > 0
    ? `${Number(months)}-month instalment` : null;
  return plan && word && method !== "installment" ? `${plan} · ${word}` : plan ?? word;
}
