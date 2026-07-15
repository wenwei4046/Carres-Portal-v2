import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Copy, Link2, MessageCircle, ReceiptText, RefreshCw, X } from "lucide-react";
import type { StripeCheckoutSessionInfo } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { qk, useCreateStripeCheckout, useStripeCheckoutStatus } from "@/lib/queries";

/**
 * StripeCollectModal (0223, Loo 2026-07-14) — collect an order payment online.
 *
 * Flow: pick an amount (prefilled with the outstanding balance, with
 * "To 50%" / "Full balance" quick chips) → the API mints a Stripe Checkout
 * link → show it as a QR (customer scans at the counter) plus copy/WhatsApp
 * buttons (remote customer). The modal polls the link every 4s; the server
 * records the payment the moment Stripe confirms it (poll live-reconcile or
 * webhook — whichever first), so "paid" here means orders.paid ALREADY moved.
 *
 * Closing the modal does NOT kill the link — a WhatsApp'd link stays payable
 * for 24h and the webhook records it in the background.
 */

interface Props {
  orderId: string;
  so: number;
  /** Live balance figures from the drawer (server re-validates on create). */
  total: number;
  paid: number;
  /** 0224 — prefill the amount (wizard hand-off: the deposit picked on the
   *  CONFIRM step). Clamped to outstanding; absent → full outstanding. */
  initialAmount?: number;
  customerName: string;
  customerPhone: string | null;
  /** 0224 — fired ONCE when the poll reports the session paid (the money is
   *  already recorded server-side by then). */
  onPaid?: (amount: number) => void;
  onClose: () => void;
}

function rm2(n: number): string {
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** wa.me needs digits only with country code; MY numbers may be keyed as
 *  01x-xxxxxxx — prefix 60 when the leading 0 form is detected. */
function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "60" + digits.slice(1);
  return digits;
}

export default function StripeCollectModal({
  orderId,
  so,
  total,
  paid,
  initialAmount,
  customerName,
  customerPhone,
  onPaid,
  onClose,
}: Props) {
  const qc = useQueryClient();
  const outstanding = Math.max(0, total - paid);
  const toHalf = Math.max(0, total / 2 - paid);

  const [amount, setAmount] = useState(() =>
    Number(Math.min(initialAmount ?? outstanding, outstanding).toFixed(2)),
  );
  const [session, setSession] = useState<StripeCheckoutSessionInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const createMut = useCreateStripeCheckout(orderId);
  const statusQ = useStripeCheckoutStatus(orderId, session?.sessionId ?? null, {
    enabled: !!session && session.status === "open",
  });

  // Fold poll results back into the local session; on 'paid' the money is
  // already recorded server-side — refresh the drawer + board and tell the
  // caller once (ThankYou folds the amount into its receipt panel).
  const live = statusQ.data?.session;
  const paidNotified = useRef(false);
  useEffect(() => {
    if (!live) return;
    setSession(live);
    if (live.status === "paid") {
      void qc.invalidateQueries({ queryKey: qk.order(orderId), exact: true });
      void qc.invalidateQueries({ queryKey: ["orders"] });
      if (!paidNotified.current) {
        paidNotified.current = true;
        onPaid?.(live.amount);
      }
    }
  }, [live, orderId, qc, onPaid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canCreate = amount > 0 && amount <= outstanding + 0.005 && !createMut.isPending;

  async function handleCreate() {
    if (!canCreate) return;
    setErr(null);
    try {
      const res = await createMut.mutateAsync({ amount: Number(amount.toFixed(2)) });
      setSession(res.session);
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        setErr("Stripe is not set up yet — ask the principal to add the Stripe keys.");
      } else if (e instanceof ApiError) {
        const body = e.body as { message?: string; maxAmount?: number } | null;
        if (body?.maxAmount != null) setAmount(body.maxAmount);
        setErr(body?.message ?? e.message);
      } else {
        setErr(e instanceof Error ? e.message : "Could not create the payment link");
      }
    }
  }

  async function handleCopy() {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard denied (http / permissions) — leave the visible URL to
      // long-press-copy on the tablet.
    }
  }

  const waHref = useMemo(() => {
    if (!session || !customerPhone) return null;
    const text =
      `Hi ${customerName || "there"}, here is your secure payment link for Carres order #${so} ` +
      `(RM ${rm2(session.amount)}): ${session.url}`;
    return `https://wa.me/${waNumber(customerPhone)}?text=${encodeURIComponent(text)}`;
  }, [session, customerName, customerPhone, so]);

  const stage: "amount" | "link" | "paid" | "expired" = !session
    ? "amount"
    : session.status === "paid"
      ? "paid"
      : session.status === "expired"
        ? "expired"
        : "link";

  return (
    <div className="os-stripe__overlay" onClick={onClose} data-testid="pos-stripe-modal">
      <div className="os-stripe" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn os-stripe__close" onClick={onClose} aria-label="Close">
          <X size={16} strokeWidth={1.75} />
        </button>

        <div className="os-stripe__eyebrow">Collect online · order #{so}</div>

        {stage === "amount" && (
          <>
            <h3 className="os-stripe__title">How much to collect?</h3>
            <p className="os-stripe__sub">
              The customer pays by online banking (FPX) or card on Stripe&rsquo;s secure page.
              The payment records itself — no slip needed.
            </p>
            <label className="os-field">
              <span>Amount (RM) · outstanding RM {rm2(outstanding)}</span>
              <input
                type="number"
                min={0}
                max={outstanding}
                step="0.01"
                value={amount || ""}
                placeholder="0.00"
                onChange={(e) =>
                  setAmount(Math.min(outstanding, Math.max(0, parseFloat(e.target.value) || 0)))
                }
                data-testid="pos-stripe-amount"
              />
            </label>
            <div className="os-stripe__chips">
              {toHalf > 0.005 && (
                <button
                  type="button"
                  className="os-paychip"
                  onClick={() => setAmount(Number(toHalf.toFixed(2)))}
                  data-testid="pos-stripe-half"
                >
                  To 50% · RM {rm2(toHalf)}
                </button>
              )}
              <button
                type="button"
                className="os-paychip"
                onClick={() => setAmount(Number(outstanding.toFixed(2)))}
                data-testid="pos-stripe-full"
              >
                Full balance · RM {rm2(outstanding)}
              </button>
            </div>
            {err && <div className="os-detail__err">{err}</div>}
            <div className="os-detail__cta">
              <button
                type="button"
                className="btn btn--primary"
                disabled={!canCreate}
                onClick={handleCreate}
                data-testid="pos-stripe-create"
              >
                <Link2 size={16} />
                {createMut.isPending ? "Creating link…" : "Create payment link"}
              </button>
            </div>
          </>
        )}

        {stage === "link" && session && (
          <>
            <h3 className="os-stripe__title">
              Scan to pay · <sup>RM</sup>
              {rm2(session.amount)}
            </h3>
            <div className="os-stripe__qr" data-testid="pos-stripe-qr">
              <QRCodeSVG value={session.url} size={216} marginSize={2} />
            </div>
            <p className="os-stripe__sub os-stripe__waiting">
              <RefreshCw size={13} strokeWidth={2} className="os-stripe__spin" />
              Waiting for payment — this updates by itself.
            </p>
            <div className="os-stripe__actions">
              <button type="button" className="btn btn--ghost" onClick={handleCopy} data-testid="pos-stripe-copy">
                <Copy size={15} />
                {copied ? "Copied" : "Copy link"}
              </button>
              {waHref && (
                <a className="btn btn--ghost" href={waHref} target="_blank" rel="noreferrer">
                  <MessageCircle size={15} />
                  WhatsApp
                </a>
              )}
            </div>
            <p className="os-stripe__hint">
              Link stays valid for 24 hours — you can close this and the payment still records
              automatically.
            </p>
          </>
        )}

        {stage === "paid" && session && (
          <div className="os-stripe__done" data-testid="pos-stripe-paid">
            <CheckCircle2 size={40} strokeWidth={1.75} />
            <h3 className="os-stripe__title">
              RM {rm2(session.amount)} received
            </h3>
            <p className="os-stripe__sub">
              Recorded automatically{session.paymentMethodDetail ? ` · ${session.paymentMethodDetail}` : ""}.
            </p>
            {session.receiptUrl && (
              <a
                className="btn btn--ghost"
                href={session.receiptUrl}
                target="_blank"
                rel="noreferrer"
                data-testid="pos-stripe-receipt"
              >
                <ReceiptText size={15} />
                View Stripe receipt
              </a>
            )}
            <div className="os-detail__cta">
              <button type="button" className="btn btn--primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}

        {stage === "expired" && (
          <>
            <h3 className="os-stripe__title">Link expired</h3>
            <p className="os-stripe__sub">
              This payment link was not used within 24 hours. Create a fresh one.
            </p>
            <div className="os-detail__cta">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  setSession(null);
                  setErr(null);
                }}
              >
                Start over
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
