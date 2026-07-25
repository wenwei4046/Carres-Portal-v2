import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Copy, MessageCircle, RefreshCw, X } from "lucide-react";
import type { StripeCheckoutSessionInfo } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useCreateRentalCheckout, useRentalCheckoutStatus } from "@/lib/queries";

/**
 * RentalCollectModal (0255) — set up a rent-to-own agreement's Stripe
 * auto-debit at the counter. The StripeCollectModal idiom minus the amount
 * stage: the amount IS the plan's monthly fee, so the subscription Checkout
 * link mints the moment the modal opens (QR first). Paying it collects month
 * 1 AND saves the card; the server then wraps the fixed-term schedule and
 * stamps the subscription onto the agreement (webhook or the 4s poll,
 * whichever first). Closing does NOT kill the link — a WhatsApp'd link stays
 * payable for 24h and completes in the background.
 */

interface Props {
  agreementId: string;
  agreementNo: string;
  monthlyFee: number;
  termMonths: number;
  customerName: string;
  customerPhone: string | null;
  /** Fired ONCE when the poll reports the session paid (subscription live). */
  onPaid?: () => void;
  onClose: () => void;
}

function rm2(n: number): string {
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** wa.me needs digits only with country code (MY 01x → 60…). */
function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "60" + digits.slice(1);
  return digits;
}

export default function RentalCollectModal({
  agreementId,
  agreementNo,
  monthlyFee,
  termMonths,
  customerName,
  customerPhone,
  onPaid,
  onClose,
}: Props) {
  const qc = useQueryClient();
  const [session, setSession] = useState<StripeCheckoutSessionInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const createMut = useCreateRentalCheckout(agreementId);
  const statusQ = useRentalCheckoutStatus(agreementId, session?.sessionId ?? null, {
    enabled: !!session && session.status === "open",
  });

  const live = statusQ.data?.session;
  const paidNotified = useRef(false);
  useEffect(() => {
    if (!live) return;
    setSession(live);
    if (live.status === "paid") {
      void qc.invalidateQueries({ queryKey: ["rental"] });
      if (!paidNotified.current) {
        paidNotified.current = true;
        onPaid?.();
      }
    }
  }, [live, qc, onPaid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // No amount to pick — mint the link the moment the modal opens (one-shot;
  // a failure falls through to the visible error + Retry).
  const autoFired = useRef(false);
  useEffect(() => {
    if (!autoFired.current && !session) {
      autoFired.current = true;
      void handleCreate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate() {
    setErr(null);
    try {
      const res = await createMut.mutateAsync();
      setSession(res.session);
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        setErr("Stripe is not set up yet — ask the principal to add the Stripe keys.");
      } else if (e instanceof ApiError) {
        const body = e.body as { message?: string } | null;
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
      // Clipboard denied — the QR + WhatsApp button still cover the flow.
    }
  }

  const waHref = useMemo(() => {
    if (!session || !customerPhone) return null;
    const text =
      `Hi ${customerName || "there"}, here is your secure link to start your Carres ` +
      `rent-to-own plan ${agreementNo} (RM ${rm2(session.amount)}/month × ${termMonths} months): ${session.url}`;
    return `https://wa.me/${waNumber(customerPhone)}?text=${encodeURIComponent(text)}`;
  }, [session, customerName, customerPhone, agreementNo, termMonths]);

  const stage: "creating" | "link" | "paid" | "expired" = !session
    ? "creating"
    : session.status === "paid"
      ? "paid"
      : session.status === "expired"
        ? "expired"
        : "link";

  return (
    <div className="os-stripe__overlay" onClick={onClose} data-testid="rental-stripe-modal">
      <div className="os-stripe" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn os-stripe__close" onClick={onClose} aria-label="Close">
          <X size={16} strokeWidth={1.75} />
        </button>

        <div className="os-stripe__eyebrow">Set up auto-debit · {agreementNo}</div>

        {stage === "creating" && (
          <>
            <h3 className="os-stripe__title">
              First month <sup>RM</sup>
              {rm2(monthlyFee)}
            </h3>
            {err ? (
              <>
                <div className="os-detail__err">{err}</div>
                <div className="os-detail__cta">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={createMut.isPending}
                    onClick={handleCreate}
                    data-testid="rental-stripe-retry"
                  >
                    Retry
                  </button>
                </div>
              </>
            ) : (
              <p className="os-stripe__sub os-stripe__waiting">
                <RefreshCw size={13} strokeWidth={2} className="os-stripe__spin" />
                Preparing the QR…
              </p>
            )}
          </>
        )}

        {stage === "link" && session && (
          <>
            <h3 className="os-stripe__title">
              Scan to start · <sup>RM</sup>
              {rm2(session.amount)}/mo
            </h3>
            <div className="os-stripe__qr" data-testid="rental-stripe-qr">
              <QRCodeSVG value={session.url} size={216} marginSize={2} />
            </div>
            <p className="os-stripe__sub os-stripe__waiting">
              <RefreshCw size={13} strokeWidth={2} className="os-stripe__spin" />
              Customer pays month 1 by card — the card is saved and RM {rm2(monthlyFee)} auto-debits
              monthly for {termMonths} months.
            </p>
            <div className="os-stripe__actions">
              <button type="button" className="btn btn--ghost" onClick={handleCopy} data-testid="rental-stripe-copy">
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
              Link stays valid for 24 hours — you can close this and the subscription still
              activates automatically once paid.
            </p>
          </>
        )}

        {stage === "paid" && session && (
          <div className="os-stripe__done" data-testid="rental-stripe-paid">
            <CheckCircle2 size={40} strokeWidth={1.75} />
            <h3 className="os-stripe__title">Auto-debit active</h3>
            <p className="os-stripe__sub">
              RM {rm2(session.amount)} collected · card saved — RM {rm2(monthlyFee)}/month for{" "}
              {termMonths} months from today.
            </p>
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
                  autoFired.current = false;
                  void handleCreate();
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
