import { Fragment, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { ProductModelDto, SofaComboCreateInput } from "@carres/shared";
import { useCreateSofaCombo } from "@/lib/queries";

/**
 * Principal-only modal (Loo 2026-07-06): turn the CURRENT sofa build (its
 * arranged compartment codes) into a `sofa_combo_pricing` row without leaving
 * the Customize canvas. Two kinds (Loo 2026-07-07):
 *
 *   • "combo"      — a PRICING rule. A per-size grid captures the combo price +
 *     PWP price for each canonical height; a blank price = not offered at that
 *     size. Saved with `isQuickPick: false` → the engine matches it for pricing
 *     but it does NOT appear in the POS Quick pick tab.
 *   • "quick_pick" — a LAYOUT PRESET shown in the POS Quick pick tab. NO price
 *     (empty `pricesByHeight`) → it never competes in matched-combo pricing;
 *     picking it just loads the layout onto the canvas, which prices live. Saved
 *     with `isQuickPick: true`.
 *
 * Saving goes through `useCreateSofaCombo`, which invalidates the catalog query
 * so a combo shows immediately in Maintenance › Combo Pricing, and a quick pick
 * shows immediately in the POS Quick pick tab.
 *
 * `heights` MUST be the canonical combo axis (`gatedSofaHeights`) — the server's
 * `prices_by_height` only accepts `SOFA_HEIGHTS` keys (Flat is excluded).
 */
export default function CreateSofaComboModal({
  model,
  moduleCodes,
  heights,
  kind = "combo",
  onClose,
}: {
  model: ProductModelDto;
  moduleCodes: string[];
  heights: readonly string[];
  kind?: "combo" | "quick_pick";
  onClose: () => void;
}) {
  const isQuickPick = kind === "quick_pick";
  const create = useCreateSofaCombo();
  const [label, setLabel] = useState(moduleCodes.join(" + "));
  // Per-height { price, pwp } as raw strings — blank = not priced at that size.
  const [rows, setRows] = useState<Record<string, { price: string; pwp: string }>>(() =>
    Object.fromEntries(heights.map((h) => [h, { price: "", pwp: "" }])),
  );

  const setCell = (h: string, key: "price" | "pwp", v: string) =>
    setRows((r) => ({ ...r, [h]: { ...(r[h] ?? { price: "", pwp: "" }), [key]: v } }));

  // A size counts ONLY when its price parses to a non-negative number. Its PWP
  // rides along only if the price is set too (blank price → size skipped).
  const priced = useMemo(() => {
    const pricesByHeight: Record<string, number> = {};
    const pwpByHeight: Record<string, number> = {};
    for (const h of heights) {
      const raw = rows[h]?.price?.trim() ?? "";
      const p = Number(raw);
      if (raw !== "" && Number.isFinite(p) && p >= 0) {
        pricesByHeight[h] = p;
        const rawW = rows[h]?.pwp?.trim() ?? "";
        const w = Number(rawW);
        if (rawW !== "" && Number.isFinite(w) && w >= 0) pwpByHeight[h] = w;
      }
    }
    return { pricesByHeight, pwpByHeight };
  }, [rows, heights]);

  const canSave =
    moduleCodes.length > 0 &&
    // A Quick Pick is a price-less layout preset; a combo needs ≥1 authored size.
    (isQuickPick || Object.keys(priced.pricesByHeight).length > 0) &&
    !create.isPending;

  async function save() {
    if (!canSave) return;
    const input: SofaComboCreateInput = {
      modelId: model.id,
      slots: moduleCodes.map((c) => [c]),
      // Quick Pick = a price-less layout preset (prices live when used); Combo =
      // a priced matched-combo rule. `isQuickPick` gates the POS Quick pick tab.
      pricesByHeight: isQuickPick ? {} : priced.pricesByHeight,
      pwpPricesByHeight:
        !isQuickPick && Object.keys(priced.pwpByHeight).length > 0 ? priced.pwpByHeight : null,
      label: label.trim() || null,
      active: true,
      isQuickPick,
    };
    try {
      await create.mutateAsync(input);
      toast.success(isQuickPick ? "Quick pick created" : "Combo created — synced to Maintenance");
      onClose();
    } catch {
      toast.error(
        isQuickPick
          ? "Could not create the quick pick. Please try again."
          : "Could not create the combo. Please try again.",
      );
    }
  }

  return createPortal(
    <div
      className="pos-proto"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(34,31,32,0.45)",
        padding: 16,
      }}
      role="dialog"
      aria-modal="true"
      aria-label={isQuickPick ? "Create quick pick" : "Create combo"}
      data-testid={isQuickPick ? "create-sofa-quickpick-modal" : "create-sofa-combo-modal"}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 96vw)",
          maxHeight: "90vh",
          overflow: "auto",
          background: "var(--pos-panel, #fff)",
          borderRadius: 16,
          border: "1px solid var(--line)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.28)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "16px 18px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="pos-eyebrow">
              Principal · {isQuickPick ? "Create quick pick" : "Create combo"}
            </div>
            <div className="t-h4" style={{ marginTop: 2 }}>
              {model.name}
            </div>
            <div className="t-small text-base-500" style={{ marginTop: 2 }}>
              {moduleCodes.join(" + ")}
            </div>
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            aria-label="Cancel"
            data-testid="create-combo-cancel"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="pos-eyebrow">{isQuickPick ? "Quick pick name" : "Combo name"}</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="rounded-[6px] border border-base-300 bg-white px-2 py-1.5 t-small"
              data-testid="create-combo-label"
            />
          </label>

          {isQuickPick ? (
            <div
              className="t-tiny text-base-500"
              style={{
                background: "var(--pos-soft, #f6f3ef)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: "10px 12px",
                lineHeight: 1.5,
              }}
              data-testid="create-quickpick-note"
            >
              This layout appears in the <strong>Quick pick</strong> tab for salespeople. It has
              no fixed price — picking it drops the layout on the canvas and prices live.
            </div>
          ) : (
            <div>
              <div className="pos-eyebrow" style={{ marginBottom: 6 }}>
                Price per size
              </div>
              <div className="t-tiny text-base-400" style={{ marginBottom: 10 }}>
                Leave a size blank = this combo isn't offered at that size.
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "64px 1fr 1fr",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <span className="t-micro text-base-400">Size</span>
                <span className="t-micro text-base-400">Combo price (RM)</span>
                <span className="t-micro text-base-400">PWP price (RM)</span>
                {heights.map((h) => (
                  <Fragment key={h}>
                    <span className="t-small font-mono">{/^\d+$/.test(h) ? `${h}″` : h}</span>
                    <input
                      inputMode="decimal"
                      value={rows[h]?.price ?? ""}
                      onChange={(e) => setCell(h, "price", e.target.value)}
                      placeholder="—"
                      className="rounded-[6px] border border-base-300 bg-white px-2 py-1 t-small font-mono"
                      data-testid={`create-combo-price-${h}`}
                    />
                    <input
                      inputMode="decimal"
                      value={rows[h]?.pwp ?? ""}
                      onChange={(e) => setCell(h, "pwp", e.target.value)}
                      placeholder="—"
                      className="rounded-[6px] border border-base-300 bg-white px-2 py-1 t-small font-mono"
                      data-testid={`create-combo-pwp-${h}`}
                    />
                  </Fragment>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 2 }}>
            <button type="button" className="btn btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!canSave}
              onClick={save}
              data-testid="create-combo-save"
            >
              {create.isPending
                ? "Creating…"
                : isQuickPick
                  ? "Create quick pick"
                  : "Create combo"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
