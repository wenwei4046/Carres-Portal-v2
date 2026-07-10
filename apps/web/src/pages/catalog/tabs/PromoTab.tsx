import { useState } from "react";
import { BadgePercent, Gift, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type {
  CatalogResponse,
  DefaultFreeGift,
  FreeItemCampaignDto,
  ProductCategory,
  ProductModelDto,
  ProductSkuDto,
  PwpRuleDto,
  RuleTarget,
  TargetRefinement,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import {
  useCreateFreeItemCampaign,
  useCreatePwpRule,
  useDeleteFreeItemCampaign,
  useDeleteModelFreeGifts,
  useDeletePwpRule,
  useUpdateFreeItemCampaign,
  useUpdatePwpRule,
  useUpsertModelFreeGifts,
} from "@/lib/queries";
import { INPUT_CLS, Modal } from "@/pages/operation/components/Modal";
import RuleTargetPicker, {
  RuleTargetRefinementRow,
  finalizeRuleTargets,
  modelSizes,
} from "./RuleTargetPicker";

const PRODUCT_CATEGORIES: ProductCategory[] = ["mattress", "bedframe", "sofa", "accessory", "service"];

/**
 * Promo / Free Gifts (2990s Products parity Phase 7, migration 0185). Two
 * principal-owned, principal-gated subsystems, both DORMANT until authored:
 *
 *   (a) Default Free Gifts — per model, a deterministic accessory @ RM0 the
 *       server APPENDS for a qualifying paid line (optionally gated by a P6
 *       refinement: size / sofa combo / compartment). A flat per-model list +
 *       an inline editor (cleaner than burying it in the Modular drawer — every
 *       configured model is visible at a glance for a promo manager).
 *   (b) Free Item Campaigns — a named GWP a salesperson can "Make free" an
 *       ELIGIBLE cart line under (eligibility = a P6 RuleTarget[]). CRUD list +
 *       inline form.
 *   (c) PWP / Promo rules (Phase 8a, migration 0186) — a trigger product (by
 *       category + RuleTarget[]) unlocks a reward product (by category +
 *       RuleTarget[]) `qtyPerTrigger` times. Kind = 'pwp' (purchase-with-purchase,
 *       reward sold at its discounted `pwpPrice`) or 'promo' (the conditional
 *       free/promo variant). CRUD list grouped by kind + an inline form. DORMANT.
 *
 * Both reuse the P6 RuleTargetPicker for targeting. Free lines book as RM0
 * order_lines with attrs markers — the order submit pipeline is untouched.
 */
export default function PromoTab({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  // 2990s parity: the tab header is the SINGLE home for every "add" — New PWP /
  // New Promo (both preset the rule form's Kind), New Free Gift (the bulk
  // add-a-gift-to-Models modal, formerly "GWP"), and New Free Item (the
  // free-item campaign form). The section cards below carry NO inline adders.
  const [gwpOpen, setGwpOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [newRuleKind, setNewRuleKind] = useState<PwpRuleDto["type"] | null>(null);

  return (
    <div className="flex flex-col gap-8 max-w-[1120px]">
      <section className="flex items-start justify-between gap-4">
        <p className="t-tiny text-base-500 max-w-[440px]">
          Each rule lets a customer who buys a qualifying <b>Trigger</b> redeem a{" "}
          <b>Reward</b>, at the chosen ratio. A <b>PWP</b> redeems at the reward&rsquo;s PWP
          price (set in the SKU Master &ldquo;PWP Price&rdquo; column); a <b>Promo</b> works
          the same but may redeem free (RM 0). Changes apply to new orders only.
        </p>
        {isPrincipal && (
          <div className="flex flex-wrap justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setNewRuleKind("pwp")}
              className="btn-primary text-[12px]"
              data-testid="pwp-add"
            >
              + New PWP
            </button>
            <button
              type="button"
              onClick={() => setNewRuleKind("promo")}
              className="btn-ghost text-[12px]"
              data-testid="promo-add"
            >
              + New Promo
            </button>
            <button
              type="button"
              onClick={() => setGwpOpen(true)}
              className="btn-ghost text-[12px]"
              data-testid="gwp-add"
            >
              + New GWP
            </button>
            <button
              type="button"
              onClick={() => setCampaignOpen(true)}
              className="btn-ghost text-[12px]"
              data-testid="campaign-add"
            >
              + New Free Item
            </button>
          </div>
        )}
      </section>
      {/* Loo 2026-07-06: two-column zigzag so the wide right space isn't wasted.
          3 cards → [Free gifts] [Free Item Campaigns] / [PWP/Promo rules] [ ]. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <DefaultGiftsSection
          catalog={catalog}
          isPrincipal={isPrincipal}
          gwpOpen={gwpOpen}
          onCloseGwp={() => setGwpOpen(false)}
        />
        <FreeItemCampaignsSection
          catalog={catalog}
          isPrincipal={isPrincipal}
          campaignOpen={campaignOpen}
          onCloseCampaign={() => setCampaignOpen(false)}
        />
        <PwpRulesSection
          catalog={catalog}
          isPrincipal={isPrincipal}
          newRuleKind={newRuleKind}
          onCloseNewRule={() => setNewRuleKind(null)}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const modelLabel = (m: ProductModelDto): string => m.name || m.modelKey;

/** Accessory SKUs (the only valid free gift): category resolved via the model. */
function accessorySkus(catalog: CatalogResponse): ProductSkuDto[] {
  const catByModel = new Map(catalog.models.map((m) => [m.id, m.category]));
  return catalog.skus.filter((s) => catByModel.get(s.modelId) === "accessory");
}

/** Friendly name for a gift accessory SKU: the accessory's MODEL name — the
 *  PRODUCT NAME (an accessory is one model = one product, e.g. "Memory Foam
 *  Pillow"; Loo 2026-07-11: show the product name, NOT the description) →
 *  description → bare code. Never surface a raw SKU code when a human name
 *  exists (Loo 2026-07-06: "Free gift: ACC-601"). */
const skuDisplay = (s: ProductSkuDto, catalog: CatalogResponse): string => {
  const model = catalog.models.find((m) => m.id === s.modelId);
  const name = model ? modelLabel(model).trim() : "";
  if (name) return name;
  const desc = (s.description ?? "").trim();
  return desc || s.sku;
};

/** Collapse a draft refinement to a persistable one, or undefined when it
 *  carries no real list (an empty 'variant'/'combo'/'compartment' would never
 *  match, so we treat it as "no condition" = whole model). */
function finalizeRefinement(ref: TargetRefinement | undefined): TargetRefinement | undefined {
  if (!ref || ref.scope === "model") return undefined;
  if (ref.scope === "variant") return ref.sizeCodes?.length ? { scope: "variant", sizeCodes: ref.sizeCodes } : undefined;
  if (ref.scope === "combo") return ref.comboIds?.length ? { scope: "combo", comboIds: ref.comboIds } : undefined;
  if (ref.scope === "compartment")
    return ref.compartments?.length ? { scope: "compartment", compartments: ref.compartments } : undefined;
  return undefined;
}

/** Stable signature of a gift's size/compartment condition (2990s parity).
 *  Two same-accessory gifts with DIFFERENT conditions (e.g. a pillow for Queen
 *  vs for King) must NOT merge into one — keying dedupe on this keeps them as
 *  separate entries so adding the King batch never overwrites the Queen one. */
function giftCondKey(c?: TargetRefinement): string {
  if (!c || c.scope === "model") return "";
  const norm = (a?: string[]): string => (a ?? []).map((x) => x.trim().toUpperCase()).sort().join("+");
  return `${c.scope}:${norm(c.sizeCodes)}/${norm(c.compartments)}/${norm(c.comboIds)}`;
}

/** Append `additions` to `existing`, keyed by (giftSku, label, condition):
 *  a matching key updates its qty, a new key is appended — so one Model can
 *  carry several distinct gifts AND the same accessory under different sizes
 *  stays as separate entries (2990s mergeGifts parity). */
function mergeGifts(existing: DefaultFreeGift[], additions: DefaultFreeGift[]): DefaultFreeGift[] {
  const keyOf = (g: DefaultFreeGift) => `${g.giftSku} ${g.label ?? ""} ${giftCondKey(g.condition)}`;
  const out = existing.map((g) => ({ ...g }));
  const at = new Map(out.map((g, i) => [keyOf(g), i] as const));
  for (const a of additions) {
    const k = keyOf(a);
    const i = at.get(k);
    if (i != null) out[i] = { ...a };
    else {
      at.set(k, out.length);
      out.push({ ...a });
    }
  }
  return out;
}

/** Human summary of a campaign's RuleTarget[] — model name + scope detail. */
function summarizeTargets(targets: RuleTarget[], catalog: CatalogResponse): string {
  if (targets.length === 0) return "Nothing (add at least one)";
  const nameById = new Map(catalog.models.map((m) => [m.id, m.name || m.modelKey]));
  return targets
    .map((t) => {
      const name = nameById.get(t.modelId) ?? (t.modelId || "combo");
      if (t.scope === "variant" && t.sizeCodes?.length) return `${name} (${t.sizeCodes.join(", ")})`;
      if (t.scope === "combo" && t.comboIds?.length) return `${name} (${t.comboIds.length} combo${t.comboIds.length === 1 ? "" : "s"})`;
      if (t.scope === "compartment" && t.compartments?.length) return `${name} (${t.compartments.join(", ")})`;
      return name;
    })
    .join(" · ");
}

// ---------------------------------------------------------------------------
// (a) Default Free Gifts — per-model
// ---------------------------------------------------------------------------

function DefaultGiftsSection({
  catalog,
  isPrincipal,
  gwpOpen,
  onCloseGwp,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
  gwpOpen: boolean;
  onCloseGwp: () => void;
}) {
  const configs = (catalog.modelDefaultFreeGifts ?? []).filter((c) => c.gifts.length > 0);
  const modelById = new Map(catalog.models.map((m) => [m.id, m]));
  const accSkus = accessorySkus(catalog);

  // Only existing configs are edited here (via each card's Edit); adding a gift
  // to a model is done from the header "+ New Free Gift" modal.
  const [editingModelId, setEditingModelId] = useState<string | null>(null);

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="t-h4 font-display flex items-center gap-2">
          <Gift size={16} strokeWidth={1.75} className="text-primary" />
          GWP — per Model
        </div>
      </div>
      <p className="t-tiny text-base-500 mb-4 pb-3 border-b border-base-100">
        A GWP (Gift With Purchase): an accessory auto-added at RM 0 when this Model is placed on an
        order. Applies to every SKU of the Model; a complete sofa of the Model grants its gift once.
        Changes apply to new orders only. Use &ldquo;+ New GWP&rdquo; above to add one gift to many
        Models at once.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>

      {gwpOpen && isPrincipal && (
        <BulkGwpModal
          catalog={catalog}
          accSkus={accSkus}
          configs={configs}
          onClose={onCloseGwp}
        />
      )}

      {accSkus.length === 0 && isPrincipal && (
        <p className="t-tiny text-warning mb-3">
          No accessory SKUs exist yet — add an accessory in the SKU Master / Modular tabs before
          configuring a GWP.
        </p>
      )}

      {/* Existing per-model gift configs */}
      <div className="flex flex-col gap-3">
        {configs.length === 0 && editingModelId === null && (
          <div className="t-small text-base-500 bg-base-50 border border-base-200 rounded-[4px] px-3 py-4">
            No GWP configured.
          </div>
        )}
        {configs.map((cfg) => {
          const model = modelById.get(cfg.modelId);
          const editing = editingModelId === cfg.modelId;
          return (
            <div
              key={cfg.modelId}
              className="bg-base-50 border border-base-200 rounded-[4px] p-3"
              data-testid={`gift-model-card-${cfg.modelId}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="t-small font-medium text-base-900 truncate">
                    {model ? modelLabel(model) : cfg.modelId}
                  </div>
                  <div className="t-tiny text-base-500">
                    {cfg.gifts.length} gift{cfg.gifts.length === 1 ? "" : "s"}
                    {" · "}
                    {cfg.gifts
                      .map((g) => {
                        // 2990s parity: show "qty× accessory-name"; the campaign
                        // label is a remark in parentheses, never the name.
                        const sku = accSkus.find((s) => s.sku === g.giftSku);
                        const name = sku ? skuDisplay(sku, catalog) : g.giftSku;
                        return `${g.qty}× ${name}${g.label ? ` (${g.label})` : ""}`;
                      })
                      .join(", ")}
                  </div>
                </div>
                {isPrincipal && !editing && (
                  <button
                    type="button"
                    onClick={() => setEditingModelId(cfg.modelId)}
                    className="btn-ghost text-[11px]"
                    data-testid={`gift-edit-${cfg.modelId}`}
                  >
                    Edit
                  </button>
                )}
              </div>
              {isPrincipal && editing && model && (
                <ModelGiftsEditor
                  model={model}
                  catalog={catalog}
                  accSkus={accSkus}
                  initialGifts={cfg.gifts}
                  onDone={() => setEditingModelId(null)}
                />
              )}
            </div>
          );
        })}
      </div>

    </section>
  );
}

/** Inline editor for one model's gift set. Replaces the whole set on save. */
function ModelGiftsEditor({
  model,
  catalog,
  accSkus,
  initialGifts,
  onDone,
}: {
  model: ProductModelDto;
  catalog: CatalogResponse;
  accSkus: ProductSkuDto[];
  initialGifts: DefaultFreeGift[];
  onDone: () => void;
}) {
  const upsert = useUpsertModelFreeGifts();
  const del = useDeleteModelFreeGifts();
  const [gifts, setGifts] = useState<DefaultFreeGift[]>(
    initialGifts.length > 0 ? initialGifts : [{ giftSku: "", qty: 1 }],
  );
  const busy = upsert.isPending || del.isPending;

  function patchRow(i: number, patch: Partial<DefaultFreeGift>) {
    setGifts((cur) => cur.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  }
  function removeRow(i: number) {
    setGifts((cur) => cur.filter((_, j) => j !== i));
  }
  function addRow() {
    setGifts((cur) => [...cur, { giftSku: "", qty: 1 }]);
  }

  const cleaned = gifts
    .filter((g) => g.giftSku.trim() !== "")
    .map((g) => {
      const condition = finalizeRefinement(g.condition);
      return {
        giftSku: g.giftSku.trim(),
        qty: Math.max(1, Math.floor(g.qty || 1)),
        ...(g.label && g.label.trim() ? { label: g.label.trim() } : {}),
        ...(condition ? { condition } : {}),
      };
    });
  const valid = cleaned.length >= 1;

  async function save() {
    if (!valid) return;
    try {
      await upsert.mutateAsync({ modelId: model.id, input: { gifts: cleaned } });
      toast.success("GWP saved");
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    }
  }
  async function removeAll() {
    if (!confirm(`Remove all default gifts for "${modelLabel(model)}"?`)) return;
    try {
      await del.mutateAsync(model.id);
      toast.success("GWP removed");
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Remove failed");
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3 bg-white border border-base-200 rounded-[4px] p-3">
      {gifts.map((g, i) => (
        <GiftRow
          key={i}
          index={i}
          gift={g}
          model={model}
          catalog={catalog}
          accSkus={accSkus}
          onPatch={(patch) => patchRow(i, patch)}
          onRemove={() => removeRow(i)}
        />
      ))}
      <button type="button" onClick={addRow} className="btn-ghost text-[12px] self-start" data-testid="gift-add-row">
        + Add another gift
      </button>
      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={removeAll}
          disabled={busy || initialGifts.length === 0}
          className="btn-danger text-[11px] disabled:opacity-40"
          data-testid="gift-remove-all"
        >
          Remove all
        </button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onDone} className="btn-ghost text-[12px]">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!valid || busy}
            className="btn-primary text-[12px] disabled:opacity-40"
            data-testid="gift-save"
          >
            {busy ? "Saving…" : "Save gifts"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GiftRow({
  index,
  gift,
  model,
  catalog,
  accSkus,
  onPatch,
  onRemove,
}: {
  index: number;
  gift: DefaultFreeGift;
  model: ProductModelDto;
  catalog: CatalogResponse;
  accSkus: ProductSkuDto[];
  onPatch: (patch: Partial<DefaultFreeGift>) => void;
  onRemove: () => void;
}) {
  const hasCondition = Boolean(gift.condition && gift.condition.scope !== "model");

  return (
    <div className="flex flex-col gap-2 border-b border-base-100 last:border-b-0 pb-2 last:pb-0">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="label block mb-1">Gift accessory</span>
          <select
            value={gift.giftSku}
            onChange={(e) => onPatch({ giftSku: e.target.value })}
            className={`${INPUT_CLS} max-w-[240px]`}
            data-testid={`gift-row-sku-${index}`}
          >
            <option value="">Pick an accessory…</option>
            {accSkus.map((s) => (
              <option key={s.sku} value={s.sku}>
                {skuDisplay(s, catalog)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label block mb-1">Qty</span>
          <input
            type="number"
            min={1}
            step={1}
            value={gift.qty}
            onChange={(e) => onPatch({ qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
            className={`${INPUT_CLS} w-20`}
            data-testid={`gift-row-qty-${index}`}
          />
        </label>
        <label className="block flex-1 min-w-[160px]">
          <span className="label block mb-1">Campaign name (optional)</span>
          <input
            value={gift.label ?? ""}
            onChange={(e) => onPatch({ label: e.target.value })}
            placeholder="e.g. MING PAO CANADA"
            className={`${INPUT_CLS} w-full`}
            data-testid={`gift-row-label-${index}`}
          />
        </label>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove gift ${index + 1}`}
          className="btn-ghost p-2 text-base-400 hover:text-destructive"
          data-testid={`gift-row-remove-${index}`}
        >
          <Trash2 size={15} strokeWidth={1.75} />
        </button>
      </div>

      {/* Optional P6 refinement: only fire the gift for some sizes / sofa builds. */}
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 t-tiny text-base-600 cursor-pointer">
          <input
            type="checkbox"
            checked={hasCondition}
            onChange={(e) =>
              onPatch({ condition: e.target.checked ? { scope: "variant" } : undefined })
            }
            className="w-3.5 h-3.5"
            data-testid={`gift-row-cond-toggle-${index}`}
          />
          Only for specific sizes / builds
        </label>
        {hasCondition && (
          <div className="pl-5">
            <RuleTargetRefinementRow
              category={model.category}
              model={model}
              catalog={catalog}
              value={gift.condition ?? { scope: "model" }}
              onChange={(ref) => onPatch({ condition: ref })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New GWP — bulk add a gift to many Models at once (2990s parity)
// ---------------------------------------------------------------------------

/** Categories a GWP can attach to (accessories/services never trigger gifts). */
const GIFT_CATEGORIES: ProductCategory[] = ["mattress", "bedframe", "sofa"];

function BulkGwpModal({
  catalog,
  accSkus,
  configs,
  onClose,
}: {
  catalog: CatalogResponse;
  accSkus: ProductSkuDto[];
  configs: { modelId: string; gifts: DefaultFreeGift[] }[];
  onClose: () => void;
}) {
  const upsert = useUpsertModelFreeGifts();
  const giftsByModel = new Map(configs.map((c) => [c.modelId, c.gifts]));
  const models = catalog.models.filter(
    (m) => !m.discontinuedAt && GIFT_CATEGORIES.includes(m.category),
  );
  const groups = GIFT_CATEGORIES.map((cat) => ({
    cat,
    list: models.filter((m) => m.category === cat),
  })).filter((g) => g.list.length > 0);

  // Size chips = union of offered sizes across all mattress/bedframe models
  // (uppercased — RuleTarget sizeCodes are stored uppercase). `modelSizes`
  // falls back to SKU-derived variants when allowed_options isn't curated.
  const sizeOptions = [
    ...new Set(
      models
        .filter((m) => m.category === "mattress" || m.category === "bedframe")
        .flatMap((m) => modelSizes(m, catalog))
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];

  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<DefaultFreeGift[]>([{ giftSku: "", qty: 1 }]);
  const [sizeCodes, setSizeCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleModel = (mid: string) =>
    setSelected((cur) => (cur.includes(mid) ? cur.filter((x) => x !== mid) : [...cur, mid]));
  const toggleCategory = (cat: ProductCategory) => {
    const ids = models.filter((m) => m.category === cat).map((m) => m.id);
    const allOn = ids.length > 0 && ids.every((id) => selected.includes(id));
    setSelected((cur) => (allOn ? cur.filter((id) => !ids.includes(id)) : [...new Set([...cur, ...ids])]));
  };
  const patchRow = (i: number, patch: Partial<DefaultFreeGift>) =>
    setDraft((cur) => cur.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  const cleaned: DefaultFreeGift[] = draft
    .filter((g) => g.giftSku.trim() !== "")
    .map((g) => ({
      giftSku: g.giftSku.trim(),
      qty: Math.max(1, Math.floor(g.qty || 1)),
      ...(g.label && g.label.trim() ? { label: g.label.trim() } : {}),
    }));

  async function apply() {
    setError(null);
    if (selected.length === 0) {
      setError("Pick at least one Model.");
      return;
    }
    if (cleaned.length === 0) {
      setError("Choose at least one gift accessory.");
      return;
    }
    setBusy(true);
    try {
      for (const mid of selected) {
        // The size refinement attaches to mattress/bedframe models only — a
        // size never matches a sofa line, so sofa selections get the gift
        // with no size condition (any build).
        const cat = models.find((m) => m.id === mid)?.category;
        const sizeCond: TargetRefinement | undefined =
          sizeCodes.length > 0 && (cat === "mattress" || cat === "bedframe")
            ? { scope: "variant", sizeCodes }
            : undefined;
        const additions = sizeCond ? cleaned.map((g) => ({ ...g, condition: sizeCond })) : cleaned;
        await upsert.mutateAsync({
          modelId: mid,
          input: { gifts: mergeGifts(giftsByModel.get(mid) ?? [], additions) },
        });
      }
      toast.success(`Gift added to ${selected.length} model${selected.length === 1 ? "" : "s"}`);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New GWP — add to Models" onClose={onClose} size="lg">
      <p className="t-tiny text-base-500 mb-3">
        Pick the Models, choose the gift, then Add. The gift is appended — a Model can hold several
        (e.g. 2 pillows + a protector). 🎁 marks Models that already have a gift.
      </p>

      {groups.map(({ cat, list }) => {
        const ids = list.map((m) => m.id);
        const allOn = ids.length > 0 && ids.every((id) => selected.includes(id));
        return (
          <div key={cat} className="mb-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="t-micro text-base-400 uppercase tracking-[0.14em]">{cat}</span>
              <button
                type="button"
                onClick={() => toggleCategory(cat)}
                className="t-tiny text-primary"
                data-testid={`gwp-select-all-${cat}`}
              >
                {allOn ? "clear" : "select all"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {list.map((m) => {
                const on = selected.includes(m.id);
                const has = (giftsByModel.get(m.id)?.length ?? 0) > 0;
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleModel(m.id)}
                    className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
                      on
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-base-300 bg-white text-base-700 hover:border-base-500"
                    }`}
                    data-testid={`gwp-model-${m.id}`}
                  >
                    {modelLabel(m)}
                    {has && " 🎁"}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="flex flex-col gap-2 border-t border-base-200 pt-3 mt-1">
        {draft.map((g, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="block flex-1 min-w-[180px]">
              <span className="label block mb-1">Gift accessory</span>
              <select
                value={g.giftSku}
                onChange={(e) => patchRow(i, { giftSku: e.target.value })}
                className={`${INPUT_CLS} w-full`}
                data-testid={`gwp-row-sku-${i}`}
              >
                <option value="">Choose accessory…</option>
                {accSkus.map((s) => (
                  <option key={s.sku} value={s.sku}>
                    {skuDisplay(s, catalog)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label block mb-1">Qty</span>
              <input
                type="number"
                min={1}
                step={1}
                value={g.qty}
                onChange={(e) => patchRow(i, { qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                className={`${INPUT_CLS} w-20`}
                data-testid={`gwp-row-qty-${i}`}
              />
            </label>
            <label className="block flex-1 min-w-[160px]">
              <span className="label block mb-1">Campaign name (optional)</span>
              <input
                value={g.label ?? ""}
                onChange={(e) => patchRow(i, { label: e.target.value })}
                placeholder="e.g. MING PAO CANADA"
                className={`${INPUT_CLS} w-full`}
                data-testid={`gwp-row-label-${i}`}
              />
            </label>
            <button
              type="button"
              onClick={() => setDraft((cur) => (cur.length <= 1 ? cur : cur.filter((_, j) => j !== i)))}
              disabled={draft.length <= 1}
              aria-label={`Remove gift ${i + 1}`}
              className="btn-ghost p-2 text-base-400 hover:text-destructive disabled:opacity-40"
            >
              <Trash2 size={15} strokeWidth={1.75} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setDraft((cur) => [...cur, { giftSku: "", qty: 1 }])}
          className="btn-ghost text-[12px] self-start"
          data-testid="gwp-add-row"
        >
          + Add gift
        </button>
      </div>

      {sizeOptions.length > 0 && (
        <div className="mt-3">
          <div className="t-tiny text-base-500 mb-1.5">
            Only for these sizes (optional — mattress / bed frame; none = any size)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sizeOptions.map((code) => {
              const on = sizeCodes.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setSizeCodes((cur) => (cur.includes(code) ? cur.filter((x) => x !== code) : [...cur, code]))
                  }
                  className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-base-300 bg-white text-base-700 hover:border-base-500"
                  }`}
                  data-testid={`gwp-size-${code}`}
                >
                  {code}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="t-tiny text-danger mt-2">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 mt-4">
        {selected.length > 0 && (
          <button type="button" onClick={() => setSelected([])} className="btn-ghost text-[12px]">
            Clear selection
          </button>
        )}
        <button type="button" onClick={onClose} className="btn-ghost text-[12px]">
          Cancel
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={busy || selected.length === 0}
          className="btn-primary text-[12px] disabled:opacity-40"
          data-testid="gwp-apply"
        >
          {busy ? "Adding…" : `Add to ${selected.length} Model${selected.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// (b) Free Item Campaigns — CRUD
// ---------------------------------------------------------------------------

function FreeItemCampaignsSection({
  catalog,
  isPrincipal,
  campaignOpen,
  onCloseCampaign,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
  campaignOpen: boolean;
  onCloseCampaign: () => void;
}) {
  const campaigns = catalog.freeItemCampaigns ?? [];

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="t-h4 font-display flex items-center gap-2">
          <Tag size={16} strokeWidth={1.75} className="text-primary" />
          Free Item Campaigns
        </div>
      </div>
      <p className="t-tiny text-base-500 mb-4 pb-3 border-b border-base-100">
        A giveaway a salesperson can apply to an eligible cart line ("Make free") — the line books at
        RM0. Set which models / sizes / sofa builds qualify and the per-line free limit. A campaign is
        dormant until you flip it Active. Use &ldquo;+ New Free Item&rdquo; above to add one.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>

      {campaignOpen && isPrincipal && (
        <Modal title="New Free Item" onClose={onCloseCampaign} size="lg">
          <CampaignForm catalog={catalog} onDone={onCloseCampaign} bare />
        </Modal>
      )}

      <div className="bg-base-50 border border-base-200 rounded-[4px] overflow-hidden">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-100 border-b border-base-200"
          style={{ gridTemplateColumns: "minmax(160px,1.6fr) 100px 90px" }}
        >
          <div className="label">Campaign</div>
          <div className="label text-right">Max free</div>
          <div className="label text-right">Actions</div>
        </div>
        {campaigns.length === 0 && (
          <div className="t-small text-base-500 px-3 py-4">No free item campaigns.</div>
        )}
        {campaigns.map((c) => (
          <CampaignRow key={c.id} campaign={c} catalog={catalog} isPrincipal={isPrincipal} />
        ))}
      </div>
    </section>
  );
}

function CampaignRow({
  campaign,
  catalog,
  isPrincipal,
}: {
  campaign: FreeItemCampaignDto;
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const del = useDeleteFreeItemCampaign();

  function remove() {
    if (!confirm(`Delete the free item campaign "${campaign.name}"?`)) return;
    del.mutate(campaign.id, {
      onSuccess: () => toast.success("Campaign deleted"),
      onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Delete failed"),
    });
  }

  if (editing) {
    return (
      <div className="px-3 py-3 border-b border-base-100 last:border-b-0 bg-white">
        <CampaignForm catalog={catalog} campaign={campaign} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div
      className={`grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0 ${campaign.active ? "" : "opacity-60"}`}
      style={{ gridTemplateColumns: "minmax(160px,1.6fr) 100px 90px" }}
      data-testid={`campaign-row-${campaign.id}`}
    >
      <div className="min-w-0">
        <div className="text-[13px] truncate flex items-center gap-2">
          {campaign.name}
          {!campaign.active && <span className="pill pill-neutral">inactive</span>}
        </div>
        <div className="t-tiny text-base-400 truncate">{summarizeTargets(campaign.eligible, catalog)}</div>
      </div>
      <div className="text-right t-num text-[12px]">{campaign.maxFreeQty}</div>
      <div className="text-right flex justify-end gap-1.5">
        {isPrincipal && (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="btn-ghost text-[11px]"
              data-testid={`campaign-edit-${campaign.id}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={del.isPending}
              className="btn-danger text-[11px]"
              data-testid={`campaign-delete-${campaign.id}`}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Create / edit a free item campaign. `campaign` present = patch mode.
 *  `bare` = rendered inside a Modal (the "+ New Free Item" header entry point):
 *  drop the inline card chrome. Inline row Edit keeps the card (bare=false). */
function CampaignForm({
  catalog,
  campaign,
  onDone,
  bare = false,
}: {
  catalog: CatalogResponse;
  campaign?: FreeItemCampaignDto;
  onDone: () => void;
  bare?: boolean;
}) {
  const create = useCreateFreeItemCampaign();
  const update = useUpdateFreeItemCampaign();
  const [name, setName] = useState(campaign?.name ?? "");
  const [active, setActive] = useState(campaign?.active ?? false);
  const [maxFreeQty, setMaxFreeQty] = useState(String(campaign?.maxFreeQty ?? 1));
  const [eligible, setEligible] = useState<RuleTarget[]>(campaign?.eligible ?? []);
  const busy = create.isPending || update.isPending;

  const finalEligible = finalizeRuleTargets(eligible);
  const maxNum = Math.floor(Number(maxFreeQty));
  const valid = name.trim().length >= 2 && finalEligible.length >= 1 && Number.isInteger(maxNum) && maxNum >= 1;

  async function submit() {
    if (!valid) return;
    const body = { name: name.trim(), active, maxFreeQty: maxNum, eligible: finalEligible };
    try {
      if (campaign) {
        await update.mutateAsync({ id: campaign.id, patch: body });
        toast.success("Campaign updated");
      } else {
        await create.mutateAsync(body);
        toast.success("Campaign created");
      }
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    }
  }

  return (
    <div
      className={
        bare
          ? "flex flex-col gap-3"
          : "bg-base-50 border border-base-200 rounded-[4px] p-4 mb-3 flex flex-col gap-3"
      }
    >
      <div className="flex flex-wrap gap-4 items-end">
        <label className="block flex-1 min-w-[200px]">
          <span className="label block mb-1">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Free pillow promo"
            className={`${INPUT_CLS} w-full`}
            data-testid="campaign-name"
          />
        </label>
        <label className="block">
          <span className="label block mb-1">Max free / line</span>
          <input
            type="number"
            min={1}
            step={1}
            value={maxFreeQty}
            onChange={(e) => setMaxFreeQty(e.target.value)}
            className={`${INPUT_CLS} w-24`}
            data-testid="campaign-maxqty"
          />
        </label>
        <label className="flex items-center gap-2 text-[13px] cursor-pointer pb-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="w-4 h-4"
            data-testid="campaign-active"
          />
          Active
        </label>
      </div>
      <div>
        <span className="label block mb-1.5">Eligible products</span>
        <RuleTargetPicker catalog={catalog} value={eligible} onChange={setEligible} />
        <p className="t-tiny text-base-400 mt-1.5">
          Tick at least one model. Sizes / combos / compartments narrow within a model. A salesperson
          can "Make free" any cart line that matches.
        </p>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onDone} className="btn-ghost text-[12px]">
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!valid || busy}
          className="btn-primary text-[12px] disabled:opacity-40"
          data-testid="campaign-save"
        >
          {busy ? "Saving…" : campaign ? "Save" : "Create campaign"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// (c) PWP / Promo rules — CRUD (migration 0186, Phase 8a)
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<PwpRuleDto["type"], string> = {
  pwp: "PWP — redeem at a set price",
  promo: "Promo — may redeem free",
};

function PwpRulesSection({
  catalog,
  isPrincipal,
  newRuleKind,
  onCloseNewRule,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
  newRuleKind: PwpRuleDto["type"] | null;
  onCloseNewRule: () => void;
}) {
  const rules = catalog.pwpRules ?? [];
  const pwpRules = rules.filter((r) => r.type === "pwp");
  const promoRules = rules.filter((r) => r.type === "promo");

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="t-h4 font-display flex items-center gap-2">
          <BadgePercent size={16} strokeWidth={1.75} className="text-primary" />
          PWP / Promo rules
        </div>
      </div>
      <p className="t-tiny text-base-500 mb-4 pb-3 border-b border-base-100">
        Pair a trigger product with a reward product. Buying the trigger unlocks the reward up to a
        set count per trigger — sold at the reward SKU's PWP price (set in SKU Master); a Promo may
        redeem free (RM 0). Use &ldquo;+ New PWP&rdquo; / &ldquo;+ New Promo&rdquo; above to create
        one. Empty targeting = the whole category.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>

      {newRuleKind !== null && isPrincipal && (
        <Modal
          title={newRuleKind === "pwp" ? "New PWP rule" : "New Promo rule"}
          onClose={onCloseNewRule}
          size="lg"
        >
          <PwpRuleForm catalog={catalog} initialKind={newRuleKind} onDone={onCloseNewRule} bare />
        </Modal>
      )}

      <div className="bg-base-50 border border-base-200 rounded-[4px] overflow-hidden">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-100 border-b border-base-200"
          style={{ gridTemplateColumns: "minmax(200px,1.8fr) 70px 90px" }}
        >
          <div className="label">Trigger → reward</div>
          <div className="label text-right">Per trigger</div>
          <div className="label text-right">Actions</div>
        </div>
        {rules.length === 0 && (
          <div className="t-small text-base-500 px-3 py-4">No PWP / promo rules.</div>
        )}
        {[
          ["pwp", pwpRules] as const,
          ["promo", promoRules] as const,
        ].map(([kind, list]) =>
          list.length === 0 ? null : (
            <div key={kind} data-testid={`pwp-group-${kind}`}>
              <div className="t-micro text-base-500 px-3 pt-2 pb-1 bg-base-100/60">
                {KIND_LABEL[kind]}
              </div>
              {list.map((r) => (
                <PwpRuleRow key={r.id} rule={r} catalog={catalog} isPrincipal={isPrincipal} />
              ))}
            </div>
          ),
        )}
      </div>
    </section>
  );
}

function PwpRuleRow({
  rule,
  catalog,
  isPrincipal,
}: {
  rule: PwpRuleDto;
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const del = useDeletePwpRule();

  function remove() {
    if (!confirm(`Delete this ${KIND_LABEL[rule.type]} rule?`)) return;
    del.mutate(rule.id, {
      onSuccess: () => toast.success("Rule deleted"),
      onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Delete failed"),
    });
  }

  if (editing) {
    return (
      <div className="px-3 py-3 border-b border-base-100 last:border-b-0 bg-white">
        <PwpRuleForm catalog={catalog} rule={rule} onDone={() => setEditing(false)} />
      </div>
    );
  }

  const triggerLabel =
    rule.triggerTargets.length > 0
      ? summarizeTargets(rule.triggerTargets, catalog)
      : `Any ${rule.triggerCategory}`;
  const rewardLabel =
    rule.rewardTargets.length > 0
      ? summarizeTargets(rule.rewardTargets, catalog)
      : `Any ${rule.rewardCategory}`;

  return (
    <div
      className={`grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0 ${rule.active ? "" : "opacity-60"}`}
      style={{ gridTemplateColumns: "minmax(200px,1.8fr) 70px 90px" }}
      data-testid={`pwp-row-${rule.id}`}
    >
      <div className="min-w-0">
        <div className="text-[13px] truncate flex items-center gap-2">
          <span className="pill pill-neutral uppercase">{rule.type}</span>
          {!rule.active && <span className="pill pill-neutral">inactive</span>}
        </div>
        <div className="t-tiny text-base-400 truncate">
          {triggerLabel} <span className="text-base-300">→</span> {rewardLabel}
        </div>
      </div>
      <div className="text-right t-num text-[12px]">{rule.qtyPerTrigger}</div>
      <div className="text-right flex justify-end gap-1.5">
        {isPrincipal && (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="btn-ghost text-[11px]"
              data-testid={`pwp-edit-${rule.id}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={del.isPending}
              className="btn-danger text-[11px]"
              data-testid={`pwp-delete-${rule.id}`}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Create / edit a PWP / promo rule. `rule` present = patch mode. */
function PwpRuleForm({
  catalog,
  rule,
  initialKind,
  onDone,
  bare = false,
}: {
  catalog: CatalogResponse;
  rule?: PwpRuleDto;
  initialKind?: PwpRuleDto["type"];
  onDone: () => void;
  /** True when rendered inside a Modal (the "+ New PWP/Promo" entry points):
   *  drop the inline card chrome so the modal supplies the box. Inline Edit
   *  keeps the card (bare=false). */
  bare?: boolean;
}) {
  const create = useCreatePwpRule();
  const update = useUpdatePwpRule();
  const [type, setType] = useState<PwpRuleDto["type"]>(rule?.type ?? initialKind ?? "pwp");
  // 2990s parity: a NEW rule defaults Active (the offer goes live on save).
  const [active, setActive] = useState(rule?.active ?? true);
  const [qtyPerTrigger, setQtyPerTrigger] = useState(String(rule?.qtyPerTrigger ?? 1));
  // P8d (0188) — per-rule cross-order carry-forward policy. carryForward true
  // (default) = an unclaimed voucher flips to AVAILABLE for the customer's next
  // order; false = same-cart delete. carryForwardDays blank = no expiry.
  const [carryForward, setCarryForward] = useState(rule?.carryForward ?? true);
  const [carryForwardDays, setCarryForwardDays] = useState(
    rule?.carryForwardDays != null ? String(rule.carryForwardDays) : "",
  );
  const [triggerCategory, setTriggerCategory] = useState<ProductCategory>(
    rule?.triggerCategory ?? "mattress",
  );
  const [rewardCategory, setRewardCategory] = useState<ProductCategory>(
    rule?.rewardCategory ?? "accessory",
  );
  const [triggerTargets, setTriggerTargets] = useState<RuleTarget[]>(rule?.triggerTargets ?? []);
  const [rewardTargets, setRewardTargets] = useState<RuleTarget[]>(rule?.rewardTargets ?? []);
  const busy = create.isPending || update.isPending;

  // Empty targeting is allowed = the whole category; finalize only collapses
  // half-finished refinements (a 'variant' row with no sizes → scope 'model').
  const finalTrigger = finalizeRuleTargets(triggerTargets);
  const finalReward = finalizeRuleTargets(rewardTargets);
  const qtyNum = Math.floor(Number(qtyPerTrigger));
  // P8d — blank = perpetual (null); otherwise a positive integer.
  const daysTrimmed = carryForwardDays.trim();
  const daysNum = daysTrimmed === "" ? null : Math.floor(Number(daysTrimmed));
  const daysValid = daysNum === null || (Number.isInteger(daysNum) && daysNum >= 1);
  // 2990s parity: "any sofa" has no meaning — a sofa trigger/reward needs an
  // explicit model or combo selection (empty ≠ every sofa build).
  const sofaTriggerInvalid = triggerCategory === "sofa" && finalTrigger.length === 0;
  const sofaRewardInvalid = rewardCategory === "sofa" && finalReward.length === 0;
  const valid =
    Number.isInteger(qtyNum) && qtyNum >= 1 && daysValid && !sofaTriggerInvalid && !sofaRewardInvalid;

  async function submit() {
    if (!valid) return;
    const body = {
      type,
      triggerCategory,
      triggerTargets: finalTrigger,
      rewardCategory,
      rewardTargets: finalReward,
      qtyPerTrigger: qtyNum,
      active,
      carryForward,
      carryForwardDays: daysNum,
    };
    try {
      if (rule) {
        await update.mutateAsync({ id: rule.id, patch: body });
        toast.success("Rule updated");
      } else {
        await create.mutateAsync(body);
        toast.success("Rule created");
      }
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    }
  }

  return (
    <div
      className={
        bare
          ? "flex flex-col gap-4"
          : "bg-base-50 border border-base-200 rounded-[4px] p-4 mb-3 flex flex-col gap-4"
      }
    >
      <div className="flex flex-wrap gap-4 items-end">
        <div className="block">
          <span className="label block mb-1">Kind</span>
          <div className="flex gap-1.5" data-testid="pwp-kind">
            {(
              [
                ["pwp", "PWP — redeem at a set price"],
                ["promo", "Promo — may redeem free (RM 0)"],
              ] as const
            ).map(([v, lbl]) => (
              <button
                key={v}
                type="button"
                aria-pressed={type === v}
                onClick={() => setType(v)}
                className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
                  type === v
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-base-300 bg-white text-base-600 hover:border-base-500"
                }`}
                data-testid={`pwp-kind-${v}`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="label block mb-1">Ratio (1 trigger : N rewards)</span>
          <input
            type="number"
            min={1}
            step={1}
            value={qtyPerTrigger}
            onChange={(e) => setQtyPerTrigger(e.target.value)}
            className={`${INPUT_CLS} w-24`}
            data-testid="pwp-qty"
          />
        </label>
        <label className="flex items-center gap-2 text-[13px] cursor-pointer pb-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="w-4 h-4"
            data-testid="pwp-active"
          />
          Active
        </label>
        <label className="flex items-center gap-2 text-[13px] cursor-pointer pb-2">
          <input
            type="checkbox"
            checked={carryForward}
            onChange={(e) => setCarryForward(e.target.checked)}
            className="w-4 h-4"
            data-testid="pwp-carry-forward"
          />
          Carry forward unused vouchers to the customer&rsquo;s next order
        </label>
        <label className="block">
          <span className="label block mb-1">Voucher valid for N days (blank = no expiry)</span>
          <input
            type="number"
            min={1}
            step={1}
            placeholder="no expiry"
            value={carryForwardDays}
            onChange={(e) => setCarryForwardDays(e.target.value)}
            disabled={!carryForward}
            className={`${INPUT_CLS} w-44`}
            data-testid="pwp-carry-forward-days"
          />
        </label>
      </div>

      {/* Trigger */}
      <div className="flex flex-col gap-1.5">
        <span className="label block">Trigger product</span>
        <label className="flex items-center gap-2 t-tiny text-base-600">
          Category
          <select
            value={triggerCategory}
            onChange={(e) => setTriggerCategory(e.target.value as ProductCategory)}
            className={`${INPUT_CLS} w-40`}
            data-testid="pwp-trigger-category"
          >
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <RuleTargetPicker
          catalog={catalog}
          value={triggerTargets}
          onChange={setTriggerTargets}
          categories={[triggerCategory]}
        />
        <p className={`t-tiny ${sofaTriggerInvalid ? "text-danger" : "text-base-400"}`}>
          {triggerCategory === "sofa"
            ? "Pick at least one sofa model / combo — “any sofa” has no meaning as a trigger."
            : `Tick the models that qualify as the trigger. Leave all unticked = any ${triggerCategory}.`}
        </p>
      </div>

      {/* Reward */}
      <div className="flex flex-col gap-1.5">
        <span className="label block">Reward product</span>
        <label className="flex items-center gap-2 t-tiny text-base-600">
          Category
          <select
            value={rewardCategory}
            onChange={(e) => setRewardCategory(e.target.value as ProductCategory)}
            className={`${INPUT_CLS} w-40`}
            data-testid="pwp-reward-category"
          >
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <RuleTargetPicker
          catalog={catalog}
          value={rewardTargets}
          onChange={setRewardTargets}
          categories={[rewardCategory]}
        />
        <p className={`t-tiny ${sofaRewardInvalid ? "text-danger" : "text-base-400"}`}>
          {rewardCategory === "sofa"
            ? "Pick at least one reward combo for a sofa reward."
            : `The reward is sold at each reward SKU's PWP price (set in SKU Master)${
                type === "promo" ? " — for a Promo, a PWP price of RM 0 redeems the reward free" : ""
              }. Leave all unticked = any ${rewardCategory}.`}
        </p>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onDone} className="btn-ghost text-[12px]">
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!valid || busy}
          className="btn-primary text-[12px] disabled:opacity-40"
          data-testid="pwp-save"
        >
          {busy ? "Saving…" : rule ? "Save" : "Create rule"}
        </button>
      </div>
    </div>
  );
}
