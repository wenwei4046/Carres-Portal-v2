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
 * Nothing here is new behaviour. The map and the door are the drawer's own,
 * moved.
 */
import { toast } from "sonner";
import type { OrderPaymentMethod, OrderPaymentRow } from "@carres/shared";
import { supabase } from "@/lib/supabase";
import { ATTACHMENTS_BUCKET } from "@/lib/storage";

/** Method → display label (Balance v3 payment rows + the record modal). */
export const PAY_METHOD_LABEL: Record<OrderPaymentMethod, string> = {
  cash: "Cash",
  bank: "Bank transfer",
  card: "Card",
  cheque: "Cheque",
  online: "e-wallet",
  other: "Other",
  duitnow_qr: "DuitNow QR",
  credit_card: "Credit card",
  debit_card: "Debit card",
};

/** The method word for one row, falling back to the raw value so an unmapped
 *  method is still readable rather than blank. */
export function payMethodWord(method: OrderPaymentMethod | string | null): string {
  if (!method) return "Not recorded";
  return PAY_METHOD_LABEL[method as OrderPaymentMethod] ?? String(method);
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
