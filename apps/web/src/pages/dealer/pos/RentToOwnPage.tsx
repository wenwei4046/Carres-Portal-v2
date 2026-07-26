import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, CheckCircle2, Repeat, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { PosRentalPlan } from "@carres/shared";
import { rentalContractValue } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { rm } from "@/lib/format-currency";
import {
  useCatalog,
  useCreateRentalAgreement,
  useRentalPosPlans,
  useSalespersons,
  type CreateRentalAgreementResponse,
} from "@/lib/queries";
import RentalCollectModal from "./RentalCollectModal";

/**
 * Rent-to-Own — the POS rental sell lane (0255, Loo's rent-to-own initiative
 * segment ①). Its own overlay off the POS top bar — deliberately NOT part of
 * the cart wizard: a rental signs an AGREEMENT (RA-…), not an order.
 *
 * Flow: pick a rentable model + term (the stripped rental_plans_pos offers —
 * a store never sees the supplier/commission split) → customer name + phone
 * MANDATORY (the server upserts `customers` by canonical phone) → sign →
 * RA-number screen → collect month 1 + card via the Stripe subscription QR
 * (RentalCollectModal). Dormant-friendly: no active plans → a quiet empty
 * state, zero behavior change elsewhere.
 */

interface Props {
  /** Internal operator acting on behalf of a picked store (body dealerId —
   *  the API honors it only when the JWT carries no dealer). Store logins
   *  leave it undefined; their JWT dealer always wins server-side. */
  actingDealerId?: string;
  /** The dealer whose salesperson list scopes the attribution picker. */
  dealerId: string | null;
  onClose: () => void;
}

const todayIso = (): string => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

export default function RentToOwnPage({ actingDealerId, dealerId, onClose }: Props) {
  const plansQ = useRentalPosPlans();
  const catalogQ = useCatalog();
  const salespersonsQ = useSalespersons();
  const createAgreement = useCreateRentalAgreement();

  const [selected, setSelected] = useState<PosRentalPlan | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [created, setCreated] = useState<CreateRentalAgreementResponse | null>(null);
  const [collectOpen, setCollectOpen] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 0268 — an application waits on the finance Approver page before it becomes
  // a contract. Read the agreement's own status (not the response flag) so a
  // browser on this build talking to a pre-0268 Worker still behaves: there,
  // the agreement comes back 'active' and the old collect-now flow is correct.
  const awaitingApproval = created?.agreement.status === "pending_approval";

  // Offers grouped per SKU — one card per rentable product, term chips inside.
  const offers = useMemo(() => {
    const plans = plansQ.data?.plans ?? [];
    const bySku = new Map<string, PosRentalPlan[]>();
    for (const p of plans) {
      const list = bySku.get(p.sku) ?? [];
      list.push(p);
      bySku.set(p.sku, list);
    }
    return [...bySku.entries()].map(([sku, terms]) => {
      const catalogSku = catalogQ.data?.skus.find((s) => s.sku === sku);
      const model = catalogSku
        ? catalogQ.data?.models.find((m) => m.id === catalogSku.modelId)
        : undefined;
      return {
        sku,
        title: model ? `${model.name}${catalogSku?.variant ? ` · ${catalogSku.variant}` : ""}` : sku,
        photoUrl: model?.photoUrl ?? null,
        terms: terms.slice().sort((a, b) => a.termMonths - b.termMonths),
      };
    });
  }, [plansQ.data, catalogQ.data]);

  const salespersons = useMemo(() => {
    const all = salespersonsQ.data?.salespersons ?? [];
    return dealerId ? all.filter((s) => s.dealerId === dealerId) : all;
  }, [salespersonsQ.data, dealerId]);

  const formValid = !!selected && name.trim().length >= 1 && phone.trim().length >= 5;

  function handleSign() {
    if (!formValid || !selected || createAgreement.isPending) return;
    setSubmitError(null);
    createAgreement.mutate(
      {
        planId: selected.id,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        ...(email.trim() ? { customerEmail: email.trim() } : {}),
        ...(address.trim() ? { customerAddress: address.trim() } : {}),
        ...(actingDealerId ? { dealerId: actingDealerId } : {}),
        ...(salespersonId ? { salespersonId } : {}),
        startDate,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
      {
        onSuccess: (res) => {
          setCreated(res);
          // 0268: an application is not a live contract — don't tell the store
          // it is "signed" when finance still has to approve the credit.
          toast.success(
            res.agreement.status === "pending_approval"
              ? `${res.agreement.agreementNo} sent for approval`
              : `${res.agreement.agreementNo} signed`,
          );
        },
        onError: (e: unknown) =>
          setSubmitError(e instanceof ApiError ? e.message : "Could not sign the agreement"),
      },
    );
  }

  function startAnother() {
    setSelected(null);
    setName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setSalespersonId("");
    setStartDate(todayIso());
    setNotes("");
    setCreated(null);
    setSubscribed(false);
    setSubmitError(null);
  }

  const fieldStyle: React.CSSProperties = { width: "100%" };

  return createPortal(
    <div
      className="pos-proto"
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "var(--pos-bg)", overflowY: "auto" }}
      role="dialog"
      aria-modal="true"
      aria-label="Rent-to-Own"
      data-testid="pos-rental-page"
    >
      <div className="os-page">
        <div className="os-head">
          <div className="os-head__left">
            <button className="icon-btn" onClick={onClose} aria-label="Back" data-testid="rental-back">
              <ArrowLeft size={16} strokeWidth={1.75} />
            </button>
            <div>
              <div className="os-head__eyebrow">Pay monthly · own it at the end</div>
              <h1 className="os-head__title">Rent-to-Own</h1>
            </div>
          </div>
        </div>

        {created ? (
          /* ── Signed — collect month 1 + card ─────────────────────────── */
          <div style={{ maxWidth: 560, margin: "32px auto", display: "flex", flexDirection: "column", gap: 16, textAlign: "center" }}>
            <CheckCircle2 size={44} strokeWidth={1.5} className="text-success" style={{ margin: "0 auto" }} />
            <h2 className="os-head__title" data-testid="rental-created-no">
              {created.agreement.agreementNo} {awaitingApproval ? "submitted" : "signed"}
            </h2>
            <p style={{ fontSize: 13, color: "var(--fg-muted)" }}>
              {created.customer.name} · {created.agreement.sku} · RM{" "}
              {created.agreement.monthlyFee.toLocaleString()} × {created.agreement.termMonths} months
              (total {rm(rentalContractValue(created.agreement.monthlyFee, created.agreement.termMonths))})
              {/* 0268: the unit is only allocated on approval, so there is
                  nothing to name here until finance decides. */}
              {created.unit ? (
                <>
                  <br />
                  Unit {created.unit.unitCode}
                  {created.visitsTotal > 0 ? ` · includes ${created.visitsTotal} service visits` : ""}
                </>
              ) : null}
            </p>
            {awaitingApproval ? (
              /* Do NOT offer the card button here — the checkout route refuses
                 a pending application (422 pending_approval), so a button would
                 be a dead end. Tell the store whose move it is instead. */
              <p
                style={{ fontSize: 13, fontWeight: 600 }}
                data-testid="rental-awaiting-approval"
              >
                Sent to finance for approval — no payment is collected yet.
                <br />
                <span style={{ fontWeight: 400, fontSize: 12, color: "var(--fg-muted)" }}>
                  Once it is approved you can collect month 1 and switch on the auto-debit.
                </span>
              </p>
            ) : subscribed ? (
              <p style={{ fontSize: 13, fontWeight: 600 }} data-testid="rental-subscribed">
                Auto-debit is ACTIVE — month 1 collected, card saved.
              </p>
            ) : (
              <p style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                Next: the customer pays month 1 by card — that saves the card and switches on the
                monthly auto-debit.
              </p>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              {!subscribed && !awaitingApproval && (
                <button
                  type="button"
                  className="btn btn--primary btn--lg"
                  onClick={() => setCollectOpen(true)}
                  data-testid="rental-collect-open"
                >
                  Collect RM {created.agreement.monthlyFee.toLocaleString()} &amp; save card
                </button>
              )}
              <button type="button" className="btn btn--ghost" onClick={startAnother}>
                New rental
              </button>
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                Back to POS
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20, alignItems: "start", padding: "16px 0" }}>
            {/* ── Offers ─────────────────────────────────────────────────── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {plansQ.isPending && <p style={{ fontSize: 13, color: "var(--fg-muted)" }}>Loading offers…</p>}
              {plansQ.error != null && (
                <p style={{ fontSize: 13, color: "var(--c-burnt)" }}>
                  Couldn&rsquo;t load rental offers: {(plansQ.error as Error).message}
                </p>
              )}
              {plansQ.isSuccess && offers.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--fg-muted)" }} data-testid="rental-empty">
                  No rent-to-own offers configured yet — HQ authors them in Catalog → Rental.
                </p>
              )}
              {offers.map((offer) => (
                <div
                  key={offer.sku}
                  style={{
                    background: "var(--pos-panel)",
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    padding: 14,
                    display: "flex",
                    gap: 14,
                    alignItems: "center",
                  }}
                  data-testid={`rental-offer-${offer.sku}`}
                >
                  {offer.photoUrl ? (
                    <img
                      src={offer.photoUrl}
                      alt=""
                      style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 8,
                        flexShrink: 0,
                        display: "grid",
                        placeItems: "center",
                        background: "color-mix(in oklab, var(--c-orange) 10%, transparent)",
                      }}
                    >
                      <Repeat size={22} strokeWidth={1.5} />
                    </div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{offer.title}</div>
                    <div style={{ fontSize: 11, color: "var(--fg-muted)", marginBottom: 8 }}>{offer.sku}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {offer.terms.map((t) => {
                        const active = selected?.id === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setSelected(t)}
                            className={active ? "btn btn--primary" : "btn btn--ghost"}
                            style={{ fontSize: 12, padding: "6px 12px" }}
                            data-testid={`rental-term-${t.id}`}
                          >
                            RM {t.monthlyFee.toLocaleString()}/mo × {t.termMonths} mo
                          </button>
                        );
                      })}
                    </div>
                    {offer.terms.some((t) => t.packageName) && (
                      <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
                        <Sparkles size={12} strokeWidth={1.75} />
                        {offer.terms.find((t) => t.packageName)?.packageName}
                        {offer.terms.find((t) => t.packageName)?.packageVisitsPerYear
                          ? ` · ${offer.terms.find((t) => t.packageName)?.packageVisitsPerYear} visits/yr included free`
                          : " included free"}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Customer + sign ────────────────────────────────────────── */}
            <div
              style={{
                background: "var(--pos-panel)",
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                position: "sticky",
                top: 12,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>Customer &amp; agreement</div>
              {selected ? (
                <div
                  style={{
                    fontSize: 12,
                    background: "color-mix(in oklab, var(--c-orange) 8%, transparent)",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    padding: "8px 10px",
                  }}
                  data-testid="rental-selected-summary"
                >
                  {selected.sku} · RM {selected.monthlyFee.toLocaleString()}/mo × {selected.termMonths} mo
                  {" = "}
                  <b>{rm(rentalContractValue(selected.monthlyFee, selected.termMonths))}</b>
                  {selected.packageName ? ` · incl. ${selected.packageName}` : ""}
                  {!selected.stripeReady && (
                    <div style={{ color: "var(--c-burnt)", marginTop: 4 }}>
                      Online auto-debit not ready for this plan yet — you can sign now and collect
                      once HQ syncs it.
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ fontSize: 12, color: "var(--fg-muted)" }}>Pick a plan on the left first.</p>
              )}
              <label className="os-field" style={fieldStyle}>
                <span>Customer name *</span>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} data-testid="rental-name" />
              </label>
              <label className="os-field" style={fieldStyle}>
                <span>Phone * (the plan binds to this number)</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={32} inputMode="tel" data-testid="rental-phone" />
              </label>
              <label className="os-field" style={fieldStyle}>
                <span>Email (for Stripe receipts)</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" data-testid="rental-email" />
              </label>
              <label className="os-field" style={fieldStyle}>
                <span>Delivery address</span>
                <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} data-testid="rental-address" />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label className="os-field">
                  <span>Salesperson</span>
                  <select value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)} data-testid="rental-salesperson">
                    <option value="">—</option>
                    {salespersons.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="os-field">
                  <span>Start date</span>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="rental-start" />
                </label>
              </div>
              <label className="os-field" style={fieldStyle}>
                <span>Notes</span>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} data-testid="rental-notes" />
              </label>
              {submitError && <div className="os-detail__err">{submitError}</div>}
              <button
                type="button"
                className="btn btn--primary btn--lg"
                disabled={!formValid || createAgreement.isPending}
                onClick={handleSign}
                data-testid="rental-sign"
              >
                {createAgreement.isPending ? "Signing…" : "Sign rent-to-own agreement"}
              </button>
              <p style={{ fontSize: 11, color: "var(--fg-muted)" }}>
                Signing creates the agreement + full monthly schedule. Collection is the next
                screen — month 1 by card, then auto-debit.
              </p>
            </div>
          </div>
        )}
      </div>

      {collectOpen && created && (
        <RentalCollectModal
          agreementId={created.agreement.id}
          agreementNo={created.agreement.agreementNo}
          monthlyFee={created.agreement.monthlyFee}
          termMonths={created.agreement.termMonths}
          customerName={created.customer.name}
          customerPhone={created.customer.phone || null}
          onPaid={() => setSubscribed(true)}
          onClose={() => setCollectOpen(false)}
        />
      )}
    </div>,
    document.body,
  );
}
