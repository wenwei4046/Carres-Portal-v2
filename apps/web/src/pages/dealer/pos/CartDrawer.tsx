import { useEffect } from "react";
import { X, Trash2, Minus, Plus, Package, Gift } from "lucide-react";
import type { CatalogResponse } from "@carres/shared";
import { rm } from "@/lib/format-currency";
import {
  step2Valid,
  step2FirstDisposalIssue,
  type DraftLine,
  type WizardDraft,
} from "../new-order/draft";
import { cartAddonSubtotal, cartItemCount, cartLineSubtotal } from "./cart";
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
  linePwpRuleId,
  markLinePwp,
  pwpRewardPrice,
  unmarkLinePwp,
} from "./pwp-line";

/** The combo key a line belongs to (set by `comboToDraftLines`), or null for a
 *  standalone (non-combo) line. */
function lineComboKey(l: DraftLine): string | null {
  const k = (l.attrs as Record<string, unknown> | null)?.combo_key;
  return typeof k === "string" ? k : null;
}

/** The display label for a combo group (the combo name, stamped on every line). */
function lineComboLabel(l: DraftLine): string {
  const v = (l.attrs as Record<string, unknown> | null)?.combo_label;
  return typeof v === "string" ? v : "Combo";
}

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
}: {
  draft: WizardDraft;
  onChange: (next: WizardDraft) => void;
  onProceed: () => void;
  onClose: () => void;
  /** 0185 — the catalog bundle, for the default-gift preview + the free-item
   *  "Make free" affordance. OPTIONAL: when absent (older callers / tests) the
   *  cart renders exactly as before — no gift rows, no Make-free. */
  catalog?: CatalogResponse;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function removeLine(localId: string) {
    onChange({ ...draft, lines: draft.lines.filter((l) => l.localId !== localId) });
  }
  function bumpLineQty(localId: string, delta: number) {
    onChange({
      ...draft,
      lines: draft.lines.map((l) =>
        l.localId === localId ? { ...l, qty: Math.max(1, l.qty + delta) } : l,
      ),
    });
  }
  function removeAddon(key: string) {
    onChange({ ...draft, addons: draft.addons.filter((a) => a.key !== key) });
  }
  // Drop every line belonging to a combo (its exploded component lines share
  // one combo_key). Standalone lines + add-ons are untouched.
  function removeCombo(comboKey: string) {
    onChange({
      ...draft,
      lines: draft.lines.filter((l) => lineComboKey(l) !== comboKey),
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

  // 0185 — deterministic default-gift preview (display-only; the server appends
  // the real RM0 gift lines). Empty when nothing is configured (DORMANT).
  const giftPreview = catalog ? previewDefaultGifts(draft.lines, catalog) : [];

  // Partition lines into standalone (render with steppers, as today) and combo
  // groups (header + read-only component lines + one "Remove combo"). Groups are
  // ordered by first appearance to keep the cart stable across re-renders.
  const standaloneLines = draft.lines.filter((l) => lineComboKey(l) === null);
  const comboOrder: string[] = [];
  const comboGroups = new Map<string, { label: string; lines: DraftLine[] }>();
  for (const l of draft.lines) {
    const key = lineComboKey(l);
    if (key === null) continue;
    if (!comboGroups.has(key)) {
      comboGroups.set(key, { label: lineComboLabel(l), lines: [] });
      comboOrder.push(key);
    }
    comboGroups.get(key)!.lines.push(l);
  }

  const lineSub = cartLineSubtotal(draft.lines);
  const addonSub = cartAddonSubtotal(draft.addons);
  const total = lineSub + addonSub;
  const items = cartItemCount(draft.lines);
  const ready = step2Valid(draft);
  const blockReason = step2FirstDisposalIssue(draft);
  const empty = draft.lines.length === 0 && draft.addons.length === 0;

  return (
    <>
      {/* Ink-wash + blur scrim */}
      <div
        onClick={onClose}
        role="presentation"
        className="pos-drawer-scrim"
        aria-hidden="true"
      />

      {/* White slide-in panel */}
      <div
        className="fixed inset-y-0 right-0 z-[60] flex flex-col bg-white animate-drawer-slide-in"
        style={{
          width: 460,
          maxWidth: "100vw",
          boxShadow: "-4px 0 32px rgba(17,24,39,0.12)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Cart"
        data-testid="pos-cart-drawer"
      >
        {/* Header */}
        <header
          className="px-6 pt-5 pb-4 flex items-center justify-between gap-4 shrink-0"
          style={{ borderBottom: "1px solid hsl(var(--base-200))" }}
        >
          <div>
            <p className="kicker mb-0.5">Customer order</p>
            <h2 className="t-h3">
              {items} item{items === 1 ? "" : "s"}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close cart"
            className="btn-ghost p-2 shrink-0"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        {/* Scrollable line list */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {empty ? (
            <p className="t-small text-base-500 text-center py-12">
              Your cart is empty — pick a product to get started.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {standaloneLines.map((l) => (
                <div key={l.localId} className="pos-card p-3 flex items-start gap-3">
                  {/* Product photo placeholder */}
                  <div
                    className="shrink-0 rounded-xl bg-base-100 flex items-center justify-center text-base-400"
                    style={{ width: 56, height: 56, fontSize: 22 }}
                    aria-hidden="true"
                  >
                    ▦
                  </div>

                  {/* Name + SKU + qty stepper */}
                  <div className="min-w-0 flex-1">
                    <div className="t-small font-medium text-base-900 truncate">{l.label}</div>
                    <div className="font-mono text-[11px] text-base-500 mt-0.5">{l.sku}</div>
                    <SpecialsSummary attrs={l.attrs} />

                    {/* Pill stepper */}
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => bumpLineQty(l.localId, -1)}
                        disabled={l.qty <= 1}
                        aria-label="Decrease quantity"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-base-200 text-base-600 transition-colors hover:border-base-400 hover:text-base-900 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Minus size={13} strokeWidth={1.75} />
                      </button>
                      <span className="font-mono text-[13px] font-semibold w-6 text-center text-base-900">
                        {l.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => bumpLineQty(l.localId, 1)}
                        aria-label="Increase quantity"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-base-200 text-base-600 transition-colors hover:border-base-400 hover:text-base-900"
                      >
                        <Plus size={13} strokeWidth={1.75} />
                      </button>
                    </div>

                    {/* 0185 — free-item "Make free" affordance (eligible lines). */}
                    {catalog && (
                      <MakeFreeRow line={l} catalog={catalog} onSet={replaceLine} />
                    )}

                    {/* 0186 — PWP / promo "Use PWP price" affordance (reward lines).
                        Hidden once the line is claimed free (free-item wins — a
                        line can't be both free AND PWP-priced). */}
                    {catalog && !isLineFreeItem(l) && (
                      <PwpRow line={l} lines={draft.lines} catalog={catalog} onSet={replaceLine} />
                    )}
                  </div>

                  {/* Line price + remove (FREE when free / promo-claimed, PWP price
                      when claimed under a 'pwp' rule) */}
                  <div className="shrink-0 flex flex-col items-end gap-2 pt-0.5">
                    {catalog && (isLineFreeItem(l) || isPwpFreeLine(l, catalog)) ? (
                      <span
                        className="pill pill-confirmed"
                        data-testid={`cart-line-free-${l.localId}`}
                      >
                        FREE
                      </span>
                    ) : (
                      <span className="pos-price text-[16px]">
                        <span className="pos-price-rm">RM</span>
                        {(l.unitPrice * l.qty).toLocaleString()}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeLine(l.localId)}
                      aria-label={`Remove ${l.label}`}
                      className="text-base-400 hover:text-destructive transition-colors"
                    >
                      <Trash2 size={15} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Combo groups (套餐) — header + read-only component lines + one
                  "Remove combo". No per-line stepper: an independent qty would
                  break the fixed combo ratio. */}
              {comboOrder.map((comboKey) => {
                const group = comboGroups.get(comboKey)!;
                const groupTotal = group.lines.reduce(
                  (s, l) => s + l.unitPrice * l.qty,
                  0,
                );
                return (
                  <div
                    key={comboKey}
                    className="pos-card p-3 flex flex-col gap-3"
                    data-testid={`pos-cart-combo-${comboKey}`}
                  >
                    {/* Combo header: label + group total */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                          <Package size={15} strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0">
                          <span className="kicker">Combo</span>
                          <div className="t-small font-medium text-base-900 truncate">
                            {group.label}
                          </div>
                        </div>
                      </div>
                      <span className="pos-price text-[16px] shrink-0">
                        <span className="pos-price-rm">RM</span>
                        {groupTotal.toLocaleString()}
                      </span>
                    </div>

                    {/* Read-only component lines */}
                    <div
                      className="flex flex-col gap-1.5 pl-9"
                      style={{ borderTop: "1px solid hsl(var(--base-100))", paddingTop: 10 }}
                    >
                      {group.lines.map((l) => (
                        <div
                          key={l.localId}
                          className="flex items-baseline justify-between gap-3 text-base-600"
                        >
                          <div className="min-w-0">
                            <span className="t-small">
                              {l.label}
                              {l.qty > 1 && (
                                <span className="text-base-500"> ×{l.qty}</span>
                              )}
                            </span>
                            <span className="font-mono text-[11px] text-base-400 block">
                              {l.sku}
                            </span>
                          </div>
                          <span className="font-mono text-[12px] text-base-500 shrink-0">
                            {(l.unitPrice * l.qty).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* One "Remove combo" for the whole group */}
                    <button
                      type="button"
                      onClick={() => removeCombo(comboKey)}
                      aria-label={`Remove combo ${group.label}`}
                      className="self-start inline-flex items-center gap-1.5 text-[11px] text-base-500 hover:text-destructive transition-colors"
                    >
                      <Trash2 size={13} strokeWidth={1.75} />
                      Remove combo
                    </button>
                  </div>
                );
              })}

              {/* 0185 — default free-gift preview (display-only). The server
                  appends the real RM0 gift lines authoritatively; the client
                  NEVER sends a gift line. */}
              {giftPreview.length > 0 && (
                <div
                  className="flex flex-col gap-2 pt-3"
                  style={{ borderTop: "1px solid hsl(var(--base-100))" }}
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
                          Free gift: {g.name}
                          {g.qty > 1 && <span className="text-base-500"> ×{g.qty}</span>}
                        </span>
                      </div>
                      <span className="pill pill-confirmed shrink-0">FREE</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Add-ons */}
              {draft.addons.length > 0 && (
                <div
                  className="flex flex-col gap-3 pt-3"
                  style={{ borderTop: "1px solid hsl(var(--base-100))" }}
                >
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

        {/* Footer — subtotal + total + proceed */}
        <footer
          className="px-6 py-5 shrink-0 bg-white"
          style={{ borderTop: "1px solid hsl(var(--base-200))" }}
        >
          <div className="flex justify-between items-center text-base-600 t-small">
            <span>Items subtotal</span>
            <span className="font-mono">{rm(lineSub)}</span>
          </div>
          {addonSub > 0 && (
            <div className="flex justify-between items-center text-base-600 t-small mt-1.5">
              <span>Add-ons</span>
              <span className="font-mono">{rm(addonSub)}</span>
            </div>
          )}

          {/* Total row */}
          <div
            className="flex justify-between items-baseline mt-3 pt-3"
            style={{ borderTop: "1px solid hsl(var(--base-200))" }}
          >
            <span className="t-h4 text-base-900">Total</span>
            <span className="pos-price text-[26px]">
              <span className="pos-price-rm">RM</span>
              {total.toLocaleString()}
            </span>
          </div>

          <p className="t-tiny text-base-500 mt-1.5">
            Stair carry (if any) is added at the next step.
          </p>

          {/* Proceed — BLACK btn-primary (flame belongs to the FAB) */}
          <button
            type="button"
            onClick={onProceed}
            disabled={!ready}
            className="btn-primary w-full mt-4"
          >
            Proceed to Customer →
          </button>
          {!ready && blockReason && (
            <p className="t-tiny text-warning text-center mt-2">{blockReason}</p>
          )}
        </footer>
      </div>
    </>
  );
}

/**
 * 0185 — the per-line free-item control. Renders nothing unless the line is
 * covered by ≥1 ACTIVE free-item campaign (or is already claimed free). A freed
 * line shows the campaign + an "Undo"; an eligible paid line shows a "Make free"
 * action per covering campaign whose `maxFreeQty` allows the line's qty (so the
 * client never offers a claim the server would 409). The server re-validates +
 * forces RM0 regardless — this is preview only.
 */
function MakeFreeRow({
  line,
  catalog,
  onSet,
}: {
  line: DraftLine;
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

  // Only offer campaigns whose per-line max allows this line's qty.
  const offerable = covering.filter((c) => line.qty <= c.maxFreeQty);
  if (offerable.length === 0) return null;

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
}: {
  line: DraftLine;
  lines: DraftLine[];
  catalog: CatalogResponse;
  onSet: (localId: string, next: DraftLine) => void;
}) {
  const claimed = isLinePwp(line);

  if (claimed) {
    const claimedId = linePwpRuleId(line);
    const rule = (catalog.pwpRules ?? []).find((r) => r.id === claimedId);
    const label =
      rule?.type === "promo" ? "Promo · FREE" : `PWP · ${rm(line.unitPrice)}`;
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

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      <span className="t-tiny text-base-400">Use PWP:</span>
      {covering.map((rule) => {
        const price = pwpRewardPrice(line, catalog, rule) ?? 0;
        const tag = rule.type === "promo" ? "FREE" : rm(price);
        return (
          <button
            key={rule.id}
            type="button"
            onClick={() => onSet(line.localId, markLinePwp(line, rule, price))}
            className="inline-flex items-center gap-1 rounded-[4px] border border-primary/40 bg-primary/5 px-2 py-0.5 text-[11px] text-primary hover:border-primary transition-colors"
            data-testid={`pwp-toggle-${line.localId}-${rule.id}`}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}
