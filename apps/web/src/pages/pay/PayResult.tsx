import { useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle } from "lucide-react";

/**
 * Public Stripe Checkout landing pages (0223, Loo 2026-07-14) — where the
 * CUSTOMER's browser goes after paying (or backing out). No auth, no data
 * fetch: the payment itself is recorded server-side (webhook / POS poll), so
 * this page only needs to reassure. Stripe emails the receipt when receipts
 * are enabled in the dashboard.
 */

export function PaySuccess() {
  const [params] = useSearchParams();
  const so = params.get("so");
  return (
    <Shell>
      <CheckCircle2 size={44} strokeWidth={1.5} className="text-success" />
      <h1 className="font-display text-2xl font-semibold text-foreground">Payment received</h1>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        Thank you{so ? ` — your payment for order #${so} is confirmed` : ""}. It has been recorded
        automatically; no further action is needed. You may close this page.
      </p>
    </Shell>
  );
}

export function PayCancelled() {
  const [params] = useSearchParams();
  const so = params.get("so");
  return (
    <Shell>
      <XCircle size={44} strokeWidth={1.5} className="text-muted-foreground" />
      <h1 className="font-display text-2xl font-semibold text-foreground">Payment not completed</h1>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        No money was taken{so ? ` for order #${so}` : ""}. You can reopen the payment link to try
        again, or ask our showroom team for help.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        Carres
      </div>
      {children}
    </div>
  );
}
