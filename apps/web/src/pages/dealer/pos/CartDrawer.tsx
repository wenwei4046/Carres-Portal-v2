import { useEffect } from "react";
import { X, Trash2, Minus, Plus } from "lucide-react";
import { rm } from "@/lib/format-currency";
import {
  step2Valid,
  step2FirstDisposalIssue,
  type WizardDraft,
} from "../new-order/draft";
import { cartAddonSubtotal, cartItemCount, cartLineSubtotal } from "./cart";

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
}: {
  draft: WizardDraft;
  onChange: (next: WizardDraft) => void;
  onProceed: () => void;
  onClose: () => void;
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
        className="fixed inset-y-0 right-0 z-[60] flex flex-col bg-white"
        style={{
          width: 460,
          maxWidth: "100vw",
          boxShadow: "-4px 0 32px rgba(17,24,39,0.12)",
          animation: "pos-drawer-slide-in 0.26s cubic-bezier(0.22,1,0.36,1) both",
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
              {draft.lines.map((l) => (
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
                  </div>

                  {/* Line price + remove */}
                  <div className="shrink-0 flex flex-col items-end gap-2 pt-0.5">
                    <span className="pos-price text-[16px]">
                      <span className="pos-price-rm">RM</span>
                      {(l.unitPrice * l.qty).toLocaleString()}
                    </span>
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
