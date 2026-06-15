import { useEffect } from "react";
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
    <div
      onClick={onClose}
      role="presentation"
      className="fixed inset-0 z-[60] flex justify-end"
      style={{ background: "rgba(34,31,32,0.55)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Cart"
        className="bg-card text-card-foreground border-l border-base-200 h-screen flex flex-col"
        style={{ width: 460, maxWidth: "100vw" }}
        data-testid="pos-cart-drawer"
      >
        <header className="px-6 pt-5 pb-3.5 border-b border-base-100 flex items-center justify-between gap-4">
          <div>
            <p className="kicker">Customer order</p>
            <h2 className="t-h3 mt-0.5">
              {items} item{items === 1 ? "" : "s"}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="btn-ghost text-xl leading-none px-2 py-1"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-auto px-6 py-4">
          {empty ? (
            <p className="t-small text-base-500 text-center py-10">
              Your cart is empty — pick a product to get started.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {draft.lines.map((l) => (
                <div key={l.localId} className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="t-small truncate">{l.label}</div>
                    <div className="font-mono text-[10px] text-base-500 mt-0.5">
                      {rm(l.unitPrice)} ea · {l.sku}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <button
                        type="button"
                        onClick={() => bumpLineQty(l.localId, -1)}
                        className="px-1.5 py-0.5 text-[11px] border border-base-200 rounded hover:border-primary/40"
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="font-mono text-[11px] w-6 text-center">{l.qty}</span>
                      <button
                        type="button"
                        onClick={() => bumpLineQty(l.localId, 1)}
                        className="px-1.5 py-0.5 text-[11px] border border-base-200 rounded hover:border-primary/40"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLine(l.localId)}
                        className="ml-2 text-[10px] text-base-500 hover:text-destructive"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <span className="font-mono text-[13px] font-semibold whitespace-nowrap">
                    {rm(l.unitPrice * l.qty)}
                  </span>
                </div>
              ))}

              {draft.addons.length > 0 && (
                <div className="border-t border-base-100 pt-3 flex flex-col gap-2">
                  {draft.addons.map((a) => (
                    <div key={a.key} className="flex items-start justify-between gap-3 text-base-600">
                      <div className="min-w-0 flex-1">
                        <div className="t-small">
                          + {a.name}
                          {a.attrs?.size && <span className="text-base-700"> · {a.attrs.size}</span>}
                          {a.qty > 1 && <span className="text-base-500"> ×{a.qty}</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAddon(a.key)}
                          className="text-[10px] text-base-500 hover:text-destructive mt-0.5"
                        >
                          Remove
                        </button>
                      </div>
                      <span className="font-mono text-[13px] font-semibold whitespace-nowrap">
                        {rm(a.unitPrice * a.qty)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-base-100 bg-base-50">
          <div className="flex justify-between text-base-600 t-small">
            <span>Items subtotal</span>
            <span className="font-mono">{rm(lineSub)}</span>
          </div>
          {addonSub > 0 && (
            <div className="flex justify-between text-base-600 t-small mt-1">
              <span>Add-ons</span>
              <span className="font-mono">{rm(addonSub)}</span>
            </div>
          )}
          <div className="flex justify-between mt-2 pt-2 border-t border-base-200">
            <span className="t-h4">Total</span>
            <span className="font-mono text-base font-bold">{rm(total)}</span>
          </div>
          <p className="t-tiny text-base-500 mt-1">Stair carry (if any) is added at the next step.</p>

          <button
            type="button"
            onClick={onProceed}
            disabled={!ready}
            className="btn-primary w-full mt-3"
          >
            Proceed to Customer →
          </button>
          {!ready && blockReason && (
            <p className="t-tiny text-warning text-center mt-1.5">{blockReason}</p>
          )}
        </footer>
      </div>
    </div>
  );
}
