import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, BookmarkPlus, X, Trash2, Minus, Pencil, Plus, Gift, Ticket, UserRound } from "lucide-react";
import type { CatalogResponse, PwpCodeDto, PwpDiscoverDto, PwpRuleDto } from "@carres/shared";
import { rm } from "@/lib/format-currency";
import {
  step2Valid,
  step2FirstDisposalIssue,
  type DraftLine,
  type WizardDraft,
} from "../new-order/draft";
import {
  cartAddonSubtotal,
  cartItemCount,
  cartLineSubtotal,
  lineBundleGroup,
  lineBundleLabel,
  lineEditTarget,
} from "./cart";
import { saveQuote } from "./quotes";
import { SpecialsSummary } from "../new-order/special-addons-picker";
import {
  coveringCampaignsForLine,
  isLineFreeItem,
  lineFreeItemCampaignId,
  markLineFree,
  previewDefaultGifts,
  unmarkLineFree,
} from "./free-line";
import {
  coveringPwpForLine,
  isLinePwp,
  linePwpCode,
  linePwpCrossOrder,
  linePwpRuleId,
  markLinePwp,
  markLinePwpWithAvailableCode,
  markLinePwpWithCode,
  pwpRewardPrice,
  unmarkLinePwp,
} from "./pwp-line";

/** 0186 — true when the line is claimed under a 'promo' PWP rule (price forced to
 *  0). A 'pwp' claim (discounted, > 0) shows its discounted price, not FREE. We
 *  detect promo via the claim + a zeroed unit price (the server canonicalises
 *  `attrs.pwp.type`, but the client marker only carries `ruleId`, so the price is
 *  the reliable client-side promo signal). */
function isPwpFreeLine(l: DraftLine, catalog: CatalogResponse): boolean {
  return isLinePwp(l) && l.unitPrice === 0 && (catalog.pwpRules?.length ?? 0) > 0;
}

/**
 * Right slide-in cart for the POS catalog. Lists product lines (qty bumper +
 * remove) and add-ons, shows the subtotal, and offers "Proceed to Customer →"
 * — gated on `step2Valid` (≥1 line AND every disposal add-on has a size). The
 * floating cart button is the page's one flame CTA, so the in-drawer Proceed
 * is the black `.btn-primary`.
 */
export default function CartDrawer({
  draft,
  onChange,
  onProceed,
  onClose,
  catalog,
  pwpReservedCodes,
  pwpClaimGroup,
  customerPhone,
  pwpAvailableVouchers,
  onApplyVoucherCode,
  onEditLine,
}: {
  draft: WizardDraft;
  onChange: (next: WizardDraft) => void;
  onProceed: () => void;
  onClose: () => void;
  /** 0185 — the catalog bundle, for the default-gift preview + the free-item
   *  "Make free" affordance. OPTIONAL: when absent (older callers / tests) the
   *  cart renders exactly as before — no gift rows, no Make-free. */
  catalog?: CatalogResponse;
  /** 0187 (Phase 8c) — the caller's RESERVED pwp_codes (from /pwp-codes/mine).
   *  P8c is Auto-Fill ONLY: a reward line offers "Apply" only when a RESERVED
   *  code minted under its covering rule is free to bind; clicking binds the next
   *  unconsumed code (RESERVED→USED at Confirm). OPTIONAL — absent → the PWP
   *  toggle binds NO code (P8b-only preview, byte-identical). */
  pwpReservedCodes?: PwpCodeDto[];
  /** 0187 — the per-cart claimGroup correlation uuid stamped onto a bound reward
   *  line's attrs.pwp.claimGroup. OPTIONAL (required to bind a code). */
  pwpClaimGroup?: string;
  /** 0188 (Phase 8d) — the cart's customer phone (from the CUSTOMER step). The
   *  cross-order "Redeem saved voucher" affordance is gated on this being
   *  non-empty (a cross-order voucher is phone-bound; the server re-asserts the
   *  binding against the FINAL submitted phone). OPTIONAL — absent → the
   *  cross-order affordance is hidden (only same-cart Auto-Fill shows). */
  customerPhone?: string;
  /** 0188 — the AVAILABLE carry-forward vouchers discovered for `customerPhone`
   *  (the stripped, no-PII discovery DTO from /pwp-codes/available). A reward line
   *  whose covering rule matches a `phoneMatches` voucher offers "Redeem saved
   *  voucher". OPTIONAL — absent/empty → no auto-suggest. */
  pwpAvailableVouchers?: PwpDiscoverDto[];
  /** 0188 — the manual voucher-code lookup callback (the salesperson types/scans a
   *  number). Returns the matching discovery DTO (server-validated phone match) or
   *  null. OPTIONAL — absent → the manual-entry field is hidden (auto-suggest still
   *  works from `pwpAvailableVouchers`). */
  onApplyVoucherCode?: (code: string) => Promise<PwpDiscoverDto | null>;
  /** Cart-line EDIT (Loo 2026-07-12) — the ✎ pencil beside a line's remove.
   *  Shown only for lines a configurator can re-open (`lineEditTarget`: sofa
   *  builds + mattress/bedframe). OPTIONAL — absent → no pencil (older callers
   *  / tests render byte-identical). */
  onEditLine?: (line: DraftLine) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function removeLine(localId: string) {
    // 0239 — removing a bundle component removes the WHOLE bundle group: a
    // lone component kept at its split share would silently under-price it.
    const target = draft.lines.find((l) => l.localId === localId);
    const group = target ? lineBundleGroup(target) : null;
    if (group !== null) {
      onChange({ ...draft, lines: draft.lines.filter((l) => lineBundleGroup(l) !== group) });
      toast.info(`Bundle removed — "${lineBundleLabel(target!) ?? "bundle"}" items go together.`);
      return;
    }
    onChange({ ...draft, lines: draft.lines.filter((l) => l.localId !== localId) });
  }
  function bumpLineQty(localId: string, delta: number) {
    let lines = draft.lines.map((l) =>
      l.localId === localId ? { ...l, qty: Math.max(1, l.qty + delta) } : l,
    );
    // A freed line whose qty grows past its campaign's per-ORDER allowance
    // would 409 at submit — revert the claim (real price restored) and say why.
    if (delta > 0 && catalog) {
      const bumped = lines.find((l) => l.localId === localId);
      const campaignId = bumped ? lineFreeItemCampaignId(bumped) : null;
      if (bumped && campaignId) {
        const camp = (catalog.freeItemCampaigns ?? []).find((c) => c.id === campaignId);
        const freed = lines.reduce(
          (sum, l) => sum + (lineFreeItemCampaignId(l) === campaignId ? Number(l.qty ?? 1) : 0),
          0,
        );
        if (camp && freed > camp.maxFreeQty) {
          lines = lines.map((l) => (l.localId === localId ? unmarkLineFree(l) : l));
          toast.warning(
            `"${camp.name}" allows ${camp.maxFreeQty} free per order — the line is back to its real price.`,
          );
        }
      }
    }
    onChange({ ...draft, lines });
  }
  function removeAddon(key: string) {
    onChange({ ...draft, addons: draft.addons.filter((a) => a.key !== key) });
  }
  // Empty every item from the cart (lines + add-ons) in one tap. Customer /
  // delivery details are kept — this clears the ITEMS only. One click, but an
  // Undo toast makes an accidental clear recoverable.
  function clearCart() {
    const prev = draft;
    onChange({ ...draft, lines: [], addons: [] });
    toast.success("Cart cleared", {
      action: { label: "Undo", onClick: () => onChange(prev) },
    });
  }
  // 0185 / 0186 — replace a standalone line with a re-priced copy. Used by both
  // the free-item "Make free" toggle (parks/restores the real price + stamps/
  // strips `attrs.free_item`) and the PWP "use PWP price" toggle (stamps/strips
  // `attrs.pwp`). The server re-validates the claim + forces the price regardless
  // (the client price is never trusted).
  function replaceLine(localId: string, next: DraftLine) {
    onChange({ ...draft, lines: draft.lines.map((l) => (l.localId === localId ? next : l)) });
  }

  // Save-Quote capture (Loo 2026-07-11): a quote must carry the customer's
  // NAME + PHONE before it saves — that's what makes it findable in the
  // Quotes drawer later. Seeded from draft.customer when opened; written back
  // on save so the customer step doesn't ask twice.
  const [quoteFormOpen, setQuoteFormOpen] = useState(false);
  const [quoteName, setQuoteName] = useState("");
  const [quotePhone, setQuotePhone] = useState("");
  const quoteFormValid = quoteName.trim().length > 0 && quotePhone.trim().length > 0;
  function commitSaveQuote() {
    if (!quoteFormValid) return;
    const q = saveQuote({
      label: quoteName,
      phone: quotePhone,
      lines: draft.lines,
      addons: draft.addons,
    });
    // The cart is parked in the quote — clear it (Loo 2026-07-14) so the
    // salesperson starts the next customer fresh; the quote holds the items.
    onChange({
      ...draft,
      lines: [],
      addons: [],
      customer: { ...draft.customer, name: quoteName.trim(), phone: quotePhone.trim() },
    });
    setQuoteFormOpen(false);
    toast.success(`Quote saved — "${q.label}". Cart cleared.`);
    onClose();
  }

  // 0185 — deterministic default-gift preview (display-only; the server appends
  // the real RM0 gift lines). Empty when nothing is configured (DORMANT).
  const giftPreview = catalog ? previewDefaultGifts(draft.lines, catalog) : [];

  // 0187 — voucher codes already bound to a reward line in THIS cart. A RESERVED
  // code already on one reward line must not be offered to another (one code = one
  // reward); PwpRow picks the first RESERVED code under its rule that is NOT here.
  const boundPwpCodes = new Set<string>();
  for (const l of draft.lines) {
    const c = linePwpCode(l);
    if (c) boundPwpCodes.add(c);
  }

  // Product photo per sku (via its model) — the cart line shows the real
  // product shot like the 2990s sheet; ▦ placeholder when there's no photo.
  const photoBySku = useMemo(() => {
    const bySku = new Map<string, string>();
    if (!catalog) return bySku;
    const models = new Map(catalog.models.map((m) => [m.id, m]));
    for (const s of catalog.skus) {
      const url = models.get(s.modelId)?.photoUrl;
      if (url) bySku.set(s.sku, url);
    }
    return bySku;
  }, [catalog]);

  const lineSub = cartLineSubtotal(draft.lines);
  const addonSub = cartAddonSubtotal(draft.addons);
  const total = lineSub + addonSub;
  const items = cartItemCount(draft.lines);
  const ready = step2Valid(draft);
  const blockReason = step2FirstDisposalIssue(draft);
  const empty = draft.lines.length === 0 && draft.addons.length === 0;

  return (
    <>
      {/* Prototype cart popup (Loo's Claude Design 2026-07-04): bottom-right
          card over a dim backdrop. Internal line logic: UNCHANGED. */}
      <div className="cart-pop-backdrop" onClick={onClose} role="presentation">
        <aside
          className="cart cart--pop"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Cart"
          data-testid="pos-cart-drawer"
        >
          {/* Header */}
          <div className="cart__head shrink-0">
            <div className="cart__title-row">
              <span className="cart__title">Customer order</span>
              <span className="cart__count">
                {items} {items === 1 ? "piece" : "pieces"}
              </span>
              <button className="cart__close" onClick={onClose} aria-label="Close cart">
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>
            <div className="cart__customer">
              <UserRound size={13} strokeWidth={1.75} />
              {draft.customer.name ? (
                <span>{draft.customer.name}</span>
              ) : (
                <span style={{ fontStyle: "italic" }}>
                  Walk-in customer · details captured at the customer step
                </span>
              )}
            </div>
          </div>

        {/* Scrollable line list — 2990s CustomerOrderSheet rows (Loo 2026-07-11):
            open rows on hairline dividers, photo · bold name / muted detail ·
            qty pill, flame price in the right column. No boxes. */}
        <div className="cart__body">
          {empty ? (
            <p className="t-small text-base-500 text-center py-12">
              Your cart is empty — pick a product to get started.
            </p>
          ) : (
            <div className="flex flex-col">
              {draft.lines.map((l) => {
                const photo = photoBySku.get(l.sku);
                // "Booqit · 1A(LHF) + 2A(RHF) · 24″ · Fabric KIV" → bold model
                // name on top, the configuration as the muted detail line.
                const [name, ...detailParts] = l.label.split(" · ");
                const detail = detailParts.join(" · ");
                // ✎ shows only when a configurator can actually re-open this
                // line (sofa build / mattress / bedframe) — same helper the
                // CatalogStep routes with, so the two never drift.
                const editable =
                  !!onEditLine && !!catalog && lineEditTarget(l, catalog) !== null;
                // 0239 — bundle component lines are price-locked as a group:
                // qty is fixed, no further discounts stack on the split price.
                const inBundle = lineBundleGroup(l) !== null;
                return (
                  <div key={l.localId} className="cart-item">
                    <div
                      className="cart-item__photo shrink-0"
                      style={photo ? { backgroundImage: `url(${photo})` } : undefined}
                      aria-hidden="true"
                    >
                      {!photo && "▦"}
                    </div>

                    {/* Name + detail + SKU + qty stepper */}
                    <div className="min-w-0">
                      <div className="cart-item__name">{name}</div>
                      {detail && <div className="cart-item__detail">{detail}</div>}
                      <div className="cart-item__detail font-mono">{l.sku}</div>
                      {inBundle && (
                        <div
                          className="t-tiny text-primary"
                          data-testid={`cart-line-bundle-${l.localId}`}
                        >
                          Bundle · {lineBundleLabel(l) ?? "bundle price"}
                        </div>
                      )}
                      <SpecialsSummary attrs={l.attrs} />

                      <div className="cart-item__qty">
                        <button
                          type="button"
                          onClick={() => bumpLineQty(l.localId, -1)}
                          disabled={l.qty <= 1 || inBundle}
                          title={inBundle ? "Bundle items are fixed — remove the bundle to change it" : undefined}
                          aria-label="Decrease quantity"
                          className="disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Minus />
                        </button>
                        <span>{l.qty}</span>
                        <button
                          type="button"
                          onClick={() => bumpLineQty(l.localId, 1)}
                          disabled={inBundle}
                          title={inBundle ? "Bundle items are fixed — remove the bundle to change it" : undefined}
                          aria-label="Increase quantity"
                          className="disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Plus />
                        </button>
                      </div>

                      {/* 0185 — free-item "Make free" affordance (eligible lines).
                          Hidden on bundle lines — the split price is already the
                          discount; free/PWP claims must not stack on top. */}
                      {catalog && !inBundle && (
                        <MakeFreeRow line={l} lines={draft.lines} catalog={catalog} onSet={replaceLine} />
                      )}

                      {/* 0186 — PWP / promo "Use PWP price" affordance (reward lines).
                          Hidden once the line is claimed free (free-item wins — a
                          line can't be both free AND PWP-priced). 0187 binds a
                          RESERVED voucher code on claim (Auto-Fill). */}
                      {catalog && !inBundle && !isLineFreeItem(l) && (
                        <PwpRow
                          line={l}
                          lines={draft.lines}
                          catalog={catalog}
                          onSet={replaceLine}
                          reservedCodes={pwpReservedCodes ?? []}
                          consumedCodes={boundPwpCodes}
                          claimGroup={pwpClaimGroup}
                          customerPhone={customerPhone}
                          availableVouchers={pwpAvailableVouchers ?? []}
                          onApplyVoucherCode={onApplyVoucherCode}
                        />
                      )}
                    </div>

                    {/* Edit + remove on top, price under (FREE when free /
                        promo-claimed, PWP price when claimed under a 'pwp'
                        rule) */}
                    <div className="cart-item__right">
                      <div className="flex items-center gap-1">
                        {editable && (
                          <button
                            type="button"
                            onClick={() => onEditLine!(l)}
                            aria-label={`Edit ${l.label}`}
                            title="Edit this item"
                            className="cart-item__remove"
                            data-testid={`cart-line-edit-${l.localId}`}
                          >
                            <Pencil />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeLine(l.localId)}
                          aria-label={`Remove ${l.label}`}
                          className="cart-item__remove"
                        >
                          <Trash2 />
                        </button>
                      </div>
                      {catalog && (isLineFreeItem(l) || isPwpFreeLine(l, catalog)) ? (
                        <span
                          className="pill pill-confirmed"
                          data-testid={`cart-line-free-${l.localId}`}
                        >
                          FREE
                        </span>
                      ) : (
                        <span className="cart-item__price">
                          <sup>RM</sup>
                          {(l.unitPrice * l.qty).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* 0185 — default free-gift preview (display-only). The server
                  appends the real RM0 gift lines authoritatively; the client
                  NEVER sends a gift line. */}
              {giftPreview.length > 0 && (
                <div
                  className="flex flex-col gap-2 pt-3"
                  data-testid="cart-gift-preview"
                >
                  {giftPreview.map((g) => (
                    <div
                      key={`${g.sourceModelId}-${g.giftSku}`}
                      className="flex items-center justify-between gap-3"
                      data-testid={`gift-preview-${g.giftSku}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 w-6 h-6 rounded-lg bg-success-soft text-success flex items-center justify-center">
                          <Gift size={13} strokeWidth={1.75} />
                        </span>
                        <span className="t-small text-base-700 truncate">
                          GWP: {g.name}
                          {g.qty > 1 && <span className="text-base-500"> ×{g.qty}</span>}
                          {g.campaign && (
                            <span className="text-base-400"> · {g.campaign}</span>
                          )}
                        </span>
                      </div>
                      <span className="pill pill-confirmed shrink-0">FREE</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Add-ons */}
              {draft.addons.length > 0 && (
                <div className="flex flex-col gap-3 pt-3">
                  {draft.addons.map((a) => (
                    <div
                      key={a.key}
                      className="flex items-start justify-between gap-3 text-base-600"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="t-small">
                          + {a.name}
                          {a.attrs?.size && (
                            <span className="text-base-700"> · {a.attrs.size}</span>
                          )}
                          {a.qty > 1 && (
                            <span className="text-base-500"> ×{a.qty}</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAddon(a.key)}
                          className="text-[11px] text-base-500 hover:text-destructive mt-0.5 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                      <span className="pos-price text-[14px] shrink-0">
                        <span className="pos-price-rm">RM</span>
                        {(a.unitPrice * a.qty).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — prototype .cart__foot: lines + total + CTA row. */}
        <div className="cart__foot shrink-0">
          <div className="cart__line">
            <span>Subtotal</span>
            <span>{rm(lineSub)}</span>
          </div>
          {addonSub > 0 && (
            <div className="cart__line">
              <span>Add-ons</span>
              <span>{rm(addonSub)}</span>
            </div>
          )}
          <div className="cart__line">
            <span>Delivery</span>
            <span>Set at the customer step</span>
          </div>
          <div className="cart__line cart__line--total">
            <span>Total</span>
            <span className="cart__total-num">
              <sup>RM</sup>
              {total.toLocaleString("en-MY")}
            </span>
          </div>

          <div className="cart__cta">
            {/* Clear cart — empties every item in one tap (Undo toast recovers
                it). Kept away from the primary CTA to avoid a misclick. */}
            <button
              type="button"
              disabled={draft.lines.length === 0 && draft.addons.length === 0}
              onClick={clearCart}
              className="btn btn--ghost"
              style={{ color: "var(--c-burnt)" }}
              data-testid="pos-clear-cart"
            >
              <Trash2 size={16} strokeWidth={1.75} />
              Clear cart
            </button>
            {/* Save Quote — opens the name+phone capture first (Loo 2026-07-11:
                a quote must carry the customer's name + phone so it can be
                FOUND later), then parks a sanitized snapshot on this device
                (POS topbar → Quotes lists + loads them back). */}
            <button
              type="button"
              disabled={draft.lines.length === 0}
              onClick={() => {
                setQuoteName(draft.customer.name ?? "");
                setQuotePhone(draft.customer.phone ?? "");
                setQuoteFormOpen(true);
              }}
              className="btn btn--ghost"
              data-testid="pos-save-quote"
            >
              <BookmarkPlus size={16} strokeWidth={1.75} />
              Save Quote
            </button>
            <button type="button" onClick={onProceed} disabled={!ready} className="btn btn--primary">
              Convert to Sales Order
              <ArrowRight size={16} strokeWidth={1.75} />
            </button>
          </div>
          {!ready && blockReason && (
            <p style={{ fontSize: 11, color: "var(--c-burnt)", textAlign: "center" }}>{blockReason}</p>
          )}
        </div>
        </aside>
      </div>

      {/* Save-Quote capture (Loo 2026-07-11): name + phone are REQUIRED so the
          quote can be found again in the Quotes drawer (label + phone render
          on every quote row). Enter saves, Escape/backdrop cancels. */}
      {quoteFormOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Save quote"
        >
          <div
            className="absolute inset-0 bg-black/30"
            role="presentation"
            onClick={(e) => {
              e.stopPropagation();
              setQuoteFormOpen(false);
            }}
          />
          <div
            className="relative bg-white rounded-xl shadow-xl p-5 w-[340px] flex flex-col gap-3"
            data-testid="save-quote-form"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setQuoteFormOpen(false);
              }
              if (e.key === "Enter") commitSaveQuote();
            }}
          >
            <div>
              <div className="t-h4 font-display">Save quote</div>
              <p className="t-tiny text-base-500 mt-0.5">
                The customer&apos;s name + phone are how you find this quote again.
              </p>
            </div>
            <label className="block">
              <span className="t-micro text-base-500 block mb-1">Customer name</span>
              <input
                value={quoteName}
                onChange={(e) => setQuoteName(e.target.value)}
                placeholder="e.g. Tan Mei Ling"
                autoFocus
                aria-label="Quote customer name"
                data-testid="save-quote-name"
                className="w-full rounded-[4px] border border-base-200 px-2.5 py-1.5 t-small text-base-900 placeholder:text-base-400 focus:border-base-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="t-micro text-base-500 block mb-1">Phone</span>
              <input
                value={quotePhone}
                onChange={(e) => setQuotePhone(e.target.value)}
                placeholder="e.g. 012-345 6789"
                inputMode="tel"
                aria-label="Quote customer phone"
                data-testid="save-quote-phone"
                className="w-full rounded-[4px] border border-base-200 px-2.5 py-1.5 t-small font-mono text-base-900 placeholder:text-base-400 focus:border-base-400 focus:outline-none"
              />
            </label>
            <div className="flex items-center justify-end gap-2 mt-1">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setQuoteFormOpen(false)}
                data-testid="save-quote-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!quoteFormValid}
                onClick={commitSaveQuote}
                data-testid="save-quote-confirm"
              >
                Save quote
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * 0185 — the per-line free-item control. Renders nothing unless the line is
 * covered by ≥1 ACTIVE free-item campaign (or is already claimed free). A freed
 * line shows the campaign + an "Undo"; an eligible paid line shows a "Make free"
 * action per covering campaign whose `maxFreeQty` — a per-campaign total across
 * the WHOLE order (server F3), not a per-line cap — still has room for this
 * line's qty on top of what the cart already freed (so the client never offers
 * a claim the server would 409). The server re-validates + forces RM0
 * regardless — this is preview only.
 */
function MakeFreeRow({
  line,
  lines,
  catalog,
  onSet,
}: {
  line: DraftLine;
  /** ALL cart lines — needed to count what's already freed under each campaign. */
  lines: DraftLine[];
  catalog: CatalogResponse;
  onSet: (localId: string, next: DraftLine) => void;
}) {
  const covering = coveringCampaignsForLine(line, catalog);
  const free = isLineFreeItem(line);
  if (!free && covering.length === 0) return null;

  if (free) {
    const claimedId = lineFreeItemCampaignId(line);
    const claimed = covering.find((c) => c.id === claimedId);
    const name =
      claimed?.name ??
      (((line.attrs as Record<string, unknown> | null)?.free_item as { name?: string } | undefined)
        ?.name ??
        "Free item");
    return (
      <div className="flex items-center gap-2 mt-2" data-testid={`free-item-claimed-${line.localId}`}>
        <span className="t-tiny text-success">Free · {name}</span>
        <button
          type="button"
          onClick={() => onSet(line.localId, unmarkLineFree(line))}
          className="t-tiny text-base-500 underline hover:text-base-900"
          data-testid={`undo-free-${line.localId}`}
        >
          Undo
        </button>
      </div>
    );
  }

  // qty already claimed free under a campaign across the WHOLE cart — the
  // server enforces maxFreeQty as a per-order TOTAL, so once the allowance is
  // used up no further line may offer that campaign.
  const freedQty = (campaignId: string) =>
    lines.reduce(
      (sum, l) => sum + (lineFreeItemCampaignId(l) === campaignId ? Number(l.qty ?? 1) : 0),
      0,
    );
  const offerable = covering.filter((c) => freedQty(c.id) + line.qty <= c.maxFreeQty);
  if (offerable.length === 0) {
    // Covered, but the order's free allowance is already spent elsewhere —
    // say so instead of silently dropping the affordance.
    return covering.some((c) => freedQty(c.id) > 0) ? (
      <div className="mt-2">
        <span
          className="t-tiny text-base-400"
          data-testid={`free-limit-reached-${line.localId}`}
        >
          Free limit reached for this order
        </span>
      </div>
    ) : null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      <span className="t-tiny text-base-400">Make free:</span>
      {offerable.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSet(line.localId, markLineFree(line, c))}
          className="inline-flex items-center gap-1 rounded-[4px] border border-success/40 bg-success-soft px-2 py-0.5 text-[11px] text-success hover:border-success transition-colors"
          data-testid={`make-free-${line.localId}-${c.id}`}
        >
          <Gift size={12} strokeWidth={1.75} />
          {c.name}
        </button>
      ))}
    </div>
  );
}

/**
 * 0186 — the per-line PWP / promo "Use PWP price" control. Renders nothing unless
 * the line is grantable under ≥1 ACTIVE pwp_rule right now (a qualifying TRIGGER
 * is in the cart with spare allowance + the reward scope + a usable reward price)
 * OR the line is already PWP-claimed. A claimed line shows the rule + an "Undo";
 * a grantable line shows a "Use PWP" / "Free" action per covering rule, previewing
 * the EXACT price the server will force (the sku's pwpPrice, or FREE for promo).
 * `coveringPwpForLine` runs the SAME shared `resolvePwp` the server runs, so the
 * client never offers a claim the server would 409 (honest-pricing).
 */
function PwpRow({
  line,
  lines,
  catalog,
  onSet,
  reservedCodes,
  consumedCodes,
  claimGroup,
  customerPhone,
  availableVouchers,
  onApplyVoucherCode,
}: {
  line: DraftLine;
  lines: DraftLine[];
  catalog: CatalogResponse;
  onSet: (localId: string, next: DraftLine) => void;
  /** 0187 — the caller's RESERVED pwp_codes. Auto-Fill binds one on claim. */
  reservedCodes: PwpCodeDto[];
  /** 0187 — codes already bound to a reward line in this cart (don't re-offer). */
  consumedCodes: Set<string>;
  /** 0187 — the per-cart claimGroup stamped onto a bound line. */
  claimGroup?: string;
  /** 0188 — the cart's customer phone (CUSTOMER step). Gates the cross-order
   *  affordances (a cross-order voucher is phone-bound; the server re-asserts). */
  customerPhone?: string;
  /** 0188 — AVAILABLE carry-forward vouchers discovered for the customer phone. */
  availableVouchers: PwpDiscoverDto[];
  /** 0188 — manual voucher-code lookup callback (type/scan a number). */
  onApplyVoucherCode?: (code: string) => Promise<PwpDiscoverDto | null>;
}) {
  const claimed = isLinePwp(line);

  if (claimed) {
    const claimedId = linePwpRuleId(line);
    const rule = (catalog.pwpRules ?? []).find((r) => r.id === claimedId);
    // 0188 — a cross-order (carry-forward) binding reads "Saved voucher"; a
    // same-cart / P8b claim reads "PWP" / "Promo" as before.
    const cross = linePwpCrossOrder(line);
    const label = cross
      ? rule?.type === "promo"
        ? "Saved voucher · FREE"
        : `Saved voucher · ${rm(line.unitPrice)}`
      : rule?.type === "promo"
        ? "Promo · FREE"
        : `PWP · ${rm(line.unitPrice)}`;
    return (
      <div className="flex items-center gap-2 mt-2" data-testid={`pwp-claimed-${line.localId}`}>
        <span className="t-tiny text-primary">{label}</span>
        <button
          type="button"
          onClick={() => onSet(line.localId, unmarkLinePwp(line))}
          className="t-tiny text-base-500 underline hover:text-base-900"
          data-testid={`undo-pwp-${line.localId}`}
        >
          Undo
        </button>
      </div>
    );
  }

  const covering = coveringPwpForLine(line, lines, catalog);
  if (covering.length === 0) return null;

  // 0187 — P8c is Auto-Fill ONLY: a covering rule is offerable only when a
  // RESERVED code minted under it is free to bind (not already on another reward
  // line + a claimGroup is present). The first free code under each rule backs the
  // claim. When NO reserved codes / claimGroup are wired (DORMANT / P8b-only / a
  // test without the voucher props), we fall back to the P8b code-less claim so
  // the price preview still works (the server forces price either way).
  const hasVoucherLayer = typeof claimGroup === "string" && claimGroup.length > 0;
  function freeCodeFor(ruleId: string): string | null {
    const hit = reservedCodes.find(
      (rc) => rc.ruleId === ruleId && rc.status === "RESERVED" && !consumedCodes.has(rc.code),
    );
    return hit?.code ?? null;
  }

  const coveringIds = new Set(covering.map((r) => r.id));
  return (
    <div className="flex flex-col gap-1.5 mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="t-tiny text-base-400">Use PWP:</span>
        {covering.map((rule) => {
          const price = pwpRewardPrice(line, catalog, rule) ?? 0;
          const tag = rule.type === "promo" ? "FREE" : rm(price);
          const code = freeCodeFor(rule.id);
          // With the voucher layer on, the offer is disabled until a RESERVED code
          // exists for this rule. Without the layer (DORMANT/test) it stays enabled
          // and binds no code — byte-identical to P8b.
          const disabled = hasVoucherLayer && !code;
          const onClick = () => {
            if (hasVoucherLayer && code && claimGroup) {
              onSet(line.localId, markLinePwpWithCode(line, rule, price, code, claimGroup));
            } else if (!hasVoucherLayer) {
              onSet(line.localId, markLinePwp(line, rule, price));
            }
          };
          return (
            <button
              key={rule.id}
              type="button"
              disabled={disabled}
              onClick={onClick}
              title={disabled ? "Buy the trigger product to unlock this voucher" : undefined}
              className="inline-flex items-center gap-1 rounded-[4px] border border-primary/40 bg-primary/5 px-2 py-0.5 text-[11px] text-primary hover:border-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-primary/40"
              data-testid={`pwp-toggle-${line.localId}-${rule.id}`}
            >
              {tag}
            </button>
          );
        })}
      </div>

      {/* 0188 — the CROSS-ORDER (carry-forward) voucher affordance. Phone-gated:
          a cross-order voucher is bound to the customer's phone; the server
          re-asserts the binding against the FINAL submitted phone, so the client
          gate is UX-only (the security gate is server-side). Shows nothing unless
          the cart has a customer phone AND a covering rule applies. */}
      {hasVoucherLayer && claimGroup && (
        <PwpCrossOrderRow
          line={line}
          covering={coveringIds}
          coveringRules={covering}
          catalog={catalog}
          onSet={onSet}
          claimGroup={claimGroup}
          customerPhone={customerPhone}
          availableVouchers={availableVouchers}
          consumedCodes={consumedCodes}
          onApplyVoucherCode={onApplyVoucherCode}
        />
      )}
    </div>
  );
}

/**
 * 0188 (Phase 8d) — the CROSS-ORDER (carry-forward) voucher row inside `PwpRow`.
 * Two affordances, both gated on a captured customer phone:
 *  (a) Auto-suggest — for each covering rule, an AVAILABLE voucher discovered for
 *      the customer's phone (`phoneMatches === true`, same `ruleId`, not already
 *      bound in this cart) is offered as "Redeem saved voucher (RM…/FREE)".
 *      Clicking binds it via `markLinePwpWithAvailableCode` (crossOrder: true).
 *  (b) Manual entry — a small text field to type/scan a voucher number. On Apply,
 *      `onApplyVoucherCode` server-validates (it returns the stripped DTO + the
 *      server-computed `phoneMatches`); a phone-matched code covering this line
 *      binds, else an inline message ("different customer" / "not found").
 * The raw bound phone is NEVER on the client — discovery returns only booleans +
 * the stripped projection (the §1 PII fix). The server re-validates + forces the
 * price regardless.
 */
function PwpCrossOrderRow({
  line,
  covering,
  coveringRules,
  catalog,
  onSet,
  claimGroup,
  customerPhone,
  availableVouchers,
  consumedCodes,
  onApplyVoucherCode,
}: {
  line: DraftLine;
  covering: Set<string>;
  coveringRules: PwpRuleDto[];
  catalog: CatalogResponse;
  onSet: (localId: string, next: DraftLine) => void;
  claimGroup: string;
  customerPhone?: string;
  availableVouchers: PwpDiscoverDto[];
  consumedCodes: Set<string>;
  onApplyVoucherCode?: (code: string) => Promise<PwpDiscoverDto | null>;
}) {
  const [manualCode, setManualCode] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualBusy, setManualBusy] = useState(false);

  const hasPhone = Boolean((customerPhone ?? "").trim());

  // Phone not yet captured → a hint to enter it at the CUSTOMER step. (No
  // discovery happens client-side; the security gate is server-side regardless.)
  if (!hasPhone) {
    return (
      <p
        className="t-tiny text-base-400 italic"
        data-testid={`pwp-cross-need-phone-${line.localId}`}
      >
        Enter the customer's phone (step 2) to redeem a saved voucher.
      </p>
    );
  }

  /** The rule (covering this line) backing voucher `v`, with the previewed price. */
  function ruleForVoucher(v: PwpDiscoverDto): { rule: PwpRuleDto; price: number } | null {
    if (!v.ruleId || !covering.has(v.ruleId)) return null;
    const rule = coveringRules.find((r) => r.id === v.ruleId);
    if (!rule) return null;
    return { rule, price: pwpRewardPrice(line, catalog, rule) ?? 0 };
  }

  // Auto-suggest: identity-matched (phone AND name — the 2990s name+phone
  // binding, 0204) AVAILABLE vouchers whose rule covers this line + not already
  // bound to another reward line in this cart.
  const suggestions = availableVouchers.filter(
    (v) => v.phoneMatches && v.nameMatches && !consumedCodes.has(v.code) && ruleForVoucher(v) !== null,
  );

  function bind(v: PwpDiscoverDto) {
    const hit = ruleForVoucher(v);
    if (!hit) return;
    onSet(line.localId, markLinePwpWithAvailableCode(line, hit.rule, hit.price, v.code, claimGroup));
  }

  async function applyManual() {
    const code = manualCode.trim();
    if (!code || !onApplyVoucherCode) return;
    setManualBusy(true);
    setManualError(null);
    try {
      const v = await onApplyVoucherCode(code);
      if (!v) {
        setManualError("Voucher not found, already used, or expired.");
        return;
      }
      if (consumedCodes.has(v.code)) {
        setManualError("This voucher is already applied to a line in this cart.");
        return;
      }
      if (!v.phoneMatches || !v.nameMatches) {
        setManualError("This voucher belongs to a different customer.");
        return;
      }
      if (ruleForVoucher(v) === null) {
        setManualError("This voucher doesn't apply to this product.");
        return;
      }
      bind(v);
      setManualCode("");
    } catch {
      setManualError("Couldn't check that voucher — please retry.");
    } finally {
      setManualBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid={`pwp-cross-${line.localId}`}>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="t-tiny text-base-400">Saved:</span>
          {suggestions.map((v) => {
            const hit = ruleForVoucher(v)!;
            const tag = hit.rule.type === "promo" ? "FREE" : rm(hit.price);
            return (
              <button
                key={v.code}
                type="button"
                onClick={() => bind(v)}
                className="inline-flex items-center gap-1 rounded-[4px] border border-accent/40 bg-accent/5 px-2 py-0.5 text-[11px] text-accent hover:border-accent transition-colors"
                data-testid={`pwp-cross-suggest-${line.localId}-${v.code}`}
                title="Redeem this customer's saved voucher"
              >
                <Ticket size={12} strokeWidth={1.75} />
                Redeem saved · {tag}
              </button>
            );
          })}
        </div>
      )}

      {onApplyVoucherCode && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={manualCode}
            onChange={(e) => {
              setManualCode(e.target.value);
              if (manualError) setManualError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void applyManual();
            }}
            placeholder="Voucher code"
            aria-label="Apply voucher code"
            className="w-32 rounded-[4px] border border-base-200 px-2 py-0.5 font-mono text-[11px] text-base-900 placeholder:text-base-400 focus:border-base-400 focus:outline-none"
            data-testid={`pwp-cross-input-${line.localId}`}
          />
          <button
            type="button"
            onClick={() => void applyManual()}
            disabled={manualBusy || !manualCode.trim()}
            className="inline-flex items-center rounded-[4px] border border-base-300 px-2 py-0.5 text-[11px] text-base-700 hover:border-base-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid={`pwp-cross-apply-${line.localId}`}
          >
            {manualBusy ? "…" : "Apply"}
          </button>
        </div>
      )}
      {manualError && (
        <p className="t-tiny text-warning" data-testid={`pwp-cross-error-${line.localId}`}>
          {manualError}
        </p>
      )}
    </div>
  );
}
