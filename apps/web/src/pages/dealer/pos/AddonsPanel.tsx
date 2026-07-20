import { Plus, X, Minus } from "lucide-react";
import type { AddonDto } from "@carres/shared";
import { rm } from "@/lib/format-currency";
import {
  addonRequiresSize,
  addonSizeOptions,
  composeDisposalSizeSummary,
  disposalUnitSizes,
  type DraftAddon,
  type WizardDraft,
} from "../new-order/draft";

/** 0184 — the delivery-fee addon keys are SERVER-EXCLUSIVE: the Hono order
 *  recompute appends them itself and STRIPS any client-sent copy, so offering
 *  them in a POS picker would be a silent no-op. Filter them out everywhere
 *  the POS renders a selectable add-on list. */
const SERVER_EXCLUSIVE_ADDON_KEYS = new Set(["DELIVERY", "DELIVERY_CROSS", "DELIVERY_ADD"]);

/** The add-ons a POS operator may actually pick: active + not server-owned. */
export function offerableAddons(addons: AddonDto[]): AddonDto[] {
  return addons.filter((a) => a.active && !SERVER_EXCLUSIVE_ADDON_KEYS.has(a.key));
}

/**
 * Add-ons grid for the POS catalog "Add-ons" rail entry AND the Customer
 * step's Target-date section (Loo 2026-07-12 — order add-ons live inline
 * under the delivery date, not behind a 5th sub-step). Re-skinned as small
 * .pos-card tiles; disposal add-ons keep the required-size gate (red border
 * until a size is chosen). All toggle/qty/size logic: UNCHANGED.
 */
export default function AddonsPanel({
  addons,
  draft,
  onChange,
}: {
  addons: AddonDto[];
  draft: WizardDraft;
  onChange: (next: WizardDraft) => void;
}) {
  function toggleAddon(addonKey: string) {
    const existing = draft.addons.find((a) => a.key === addonKey);
    if (existing) {
      onChange({ ...draft, addons: draft.addons.filter((a) => a.key !== addonKey) });
      return;
    }
    const meta = addons.find((a) => a.key === addonKey);
    if (!meta) return;
    const next: DraftAddon = { key: meta.key, qty: 1, unitPrice: meta.price, name: meta.name };
    // 0242 — snapshot the addon's configured size list onto the draft (the
    // panel + step-2 gate read it from there). Sized add-ons init attrs: {}
    // so the dropdown renders empty + the gate stays closed.
    if (meta.sizeOptions?.length) next.sizeOptions = meta.sizeOptions;
    if (addonRequiresSize(next)) {
      next.attrs = {};
    }
    onChange({ ...draft, addons: [...draft.addons, next] });
  }

  function bumpAddonQty(addonKey: string, delta: number) {
    onChange({
      ...draft,
      addons: draft.addons.map((a) => {
        if (a.key !== addonKey) return a;
        const qty = Math.max(1, a.qty + delta);
        const next: DraftAddon = { ...a, qty };
        // Sized addon: keep one size slot per unit — qty change resizes the
        // per-unit list (new units start unpicked, shrink drops the tail).
        if (addonRequiresSize(a)) {
          const sizes = disposalUnitSizes(next);
          next.attrs = {
            ...(a.attrs ?? {}),
            sizes,
            size: composeDisposalSizeSummary(sizes) || undefined,
          };
        }
        return next;
      }),
    });
  }

  /** 2026-07-21 (Loo) — each unit picks its own size (qty 2 can be one Queen
   *  + one Single). `sizes` = per-unit truth; `size` stays the composed
   *  summary every downstream attrs.size reader renders. */
  function setAddonUnitSize(addonKey: string, unitIdx: number, size: string) {
    onChange({
      ...draft,
      addons: draft.addons.map((a) => {
        if (a.key !== addonKey) return a;
        const sizes = disposalUnitSizes(a);
        sizes[unitIdx] = size;
        return {
          ...a,
          attrs: {
            ...(a.attrs ?? {}),
            sizes,
            size: composeDisposalSizeSummary(sizes) || undefined,
          },
        };
      }),
    });
  }

  if (addons.length === 0) {
    return <p className="t-small text-base-500">No add-ons configured.</p>;
  }

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))" }}>
      {addons.map((a) => {
        const selected = draft.addons.find((d) => d.key === a.key);

        if (!selected) {
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => toggleAddon(a.key)}
              className="pos-card text-left p-4 flex flex-col gap-2 group"
            >
              <div className="flex items-start justify-between gap-1">
                <span className="t-small font-semibold text-base-900">{a.name}</span>
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-base-100 group-hover:bg-primary group-hover:text-white flex items-center justify-center transition-colors">
                  <Plus size={13} strokeWidth={2} />
                </span>
              </div>
              <span className="font-mono text-[13px] text-base-500">{rm(a.price)}</span>
            </button>
          );
        }

        return (
          <div key={a.key} className="pos-card pos-selected p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="t-small font-semibold text-base-900 truncate">{a.name}</div>
                <div className="font-mono text-[12px] text-base-500 mt-0.5">
                  {rm(selected.unitPrice)} ea
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleAddon(a.key)}
                className="flex-shrink-0 w-6 h-6 rounded-full bg-base-100 hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-colors"
                aria-label={`Remove ${a.name}`}
              >
                <X size={13} strokeWidth={2} />
              </button>
            </div>

            {/* Qty stepper */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 border border-base-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => bumpAddonQty(a.key, -1)}
                  className="w-7 h-7 flex items-center justify-center hover:bg-base-50 transition-colors"
                  aria-label={`Decrease ${a.name} quantity`}
                >
                  <Minus size={12} strokeWidth={2} />
                </button>
                <span className="font-mono text-[12px] w-5 text-center tabular-nums">
                  {selected.qty}
                </span>
                <button
                  type="button"
                  onClick={() => bumpAddonQty(a.key, 1)}
                  className="w-7 h-7 flex items-center justify-center hover:bg-base-50 transition-colors"
                  aria-label={`Increase ${a.name} quantity`}
                >
                  <Plus size={12} strokeWidth={2} />
                </button>
              </div>
              <span className="pos-price text-[14px]">{rm(selected.unitPrice * selected.qty)}</span>
            </div>

            {/* Size gate (0242 config-driven) — ONE dropdown PER UNIT (qty 2
                may be one Queen + one Single, Loo 2026-07-21); red border
                until chosen. */}
            {addonRequiresSize(selected) && (
              <div className="flex flex-col gap-1.5 pt-1">
                {disposalUnitSizes(selected).map((size, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="kicker text-base-400 flex-shrink-0 w-10">
                      {selected.qty > 1 ? `Size ${idx + 1}` : "Size"}
                    </span>
                    <select
                      value={size}
                      onChange={(e) => setAddonUnitSize(a.key, idx, e.target.value)}
                      aria-label={`${a.name} size${selected.qty > 1 ? ` (item ${idx + 1})` : ""}`}
                      className={`flex-1 h-7 px-2 rounded-lg border text-[11.5px] bg-white outline-none focus:border-primary transition-colors ${
                        size ? "border-base-200" : "border-destructive/60"
                      }`}
                    >
                      <option value="">Select size…</option>
                      {addonSizeOptions(selected).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
