import { useState } from "react";
import { Trash2 } from "lucide-react";
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
import { INPUT_CLS } from "@/pages/operation/components/Modal";
import RuleTargetPicker, { RuleTargetRefinementRow, finalizeRuleTargets } from "./RuleTargetPicker";

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
  return (
    <div className="flex flex-col gap-10 max-w-[720px]">
      <DefaultGiftsSection catalog={catalog} isPrincipal={isPrincipal} />
      <FreeItemCampaignsSection catalog={catalog} isPrincipal={isPrincipal} />
      <PwpRulesSection catalog={catalog} isPrincipal={isPrincipal} />
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

const skuDisplay = (s: ProductSkuDto): string =>
  (s.description && s.description.trim()) || s.sku;

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
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const configs = (catalog.modelDefaultFreeGifts ?? []).filter((c) => c.gifts.length > 0);
  const modelsWithGifts = new Set(configs.map((c) => c.modelId));
  const modelById = new Map(catalog.models.map((m) => [m.id, m]));
  const accSkus = accessorySkus(catalog);

  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [addModelId, setAddModelId] = useState("");

  const addableModels = catalog.models
    .filter((m) => !m.discontinuedAt && !modelsWithGifts.has(m.id))
    .sort((a, b) => modelLabel(a).localeCompare(modelLabel(b)));

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <div className="t-h4 font-display">Default free gifts</div>
      </div>
      <p className="t-tiny text-base-500 mb-3">
        Give a free accessory automatically when a model is bought. The gift is a real accessory SKU
        booked at RM0; optionally limit it to certain sizes / sofa builds. The system appends the gift
        at checkout — nobody has to remember.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>

      {accSkus.length === 0 && isPrincipal && (
        <p className="t-tiny text-warning mb-3">
          No accessory SKUs exist yet — add an accessory in the SKU Master / Modular tabs before
          configuring a free gift.
        </p>
      )}

      {/* Existing per-model gift configs */}
      <div className="flex flex-col gap-3">
        {configs.length === 0 && editingModelId === null && (
          <div className="t-small text-base-500 bg-white border border-base-200 rounded-[4px] px-3 py-4">
            No default gifts configured.
          </div>
        )}
        {configs.map((cfg) => {
          const model = modelById.get(cfg.modelId);
          const editing = editingModelId === cfg.modelId;
          return (
            <div
              key={cfg.modelId}
              className="bg-white border border-base-200 rounded-[4px] p-3"
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
                    {cfg.gifts.map((g) => `${g.label || g.giftSku} ×${g.qty}`).join(", ")}
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

      {/* Add gifts to a new model */}
      {isPrincipal && (
        <div className="mt-3">
          {editingModelId && !modelsWithGifts.has(editingModelId) && modelById.get(editingModelId) ? (
            <div
              className="bg-white border border-base-200 rounded-[4px] p-3"
              data-testid={`gift-model-card-${editingModelId}`}
            >
              <div className="t-small font-medium text-base-900 mb-1">
                {modelLabel(modelById.get(editingModelId)!)}
              </div>
              <ModelGiftsEditor
                model={modelById.get(editingModelId)!}
                catalog={catalog}
                accSkus={accSkus}
                initialGifts={[]}
                onDone={() => {
                  setEditingModelId(null);
                  setAddModelId("");
                }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <select
                value={addModelId}
                onChange={(e) => setAddModelId(e.target.value)}
                className={`${INPUT_CLS} max-w-[280px]`}
                aria-label="Pick a model to add gifts to"
                data-testid="promo-gift-model-select"
              >
                <option value="">Add gifts to a model…</option>
                {addableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {modelLabel(m)} ({m.category})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!addModelId || accSkus.length === 0}
                onClick={() => setEditingModelId(addModelId)}
                className="btn-primary text-[12px] disabled:opacity-40"
                data-testid="promo-gift-add"
              >
                Configure
              </button>
            </div>
          )}
        </div>
      )}
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
      toast.success("Free gifts saved");
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    }
  }
  async function removeAll() {
    if (!confirm(`Remove all default gifts for "${modelLabel(model)}"?`)) return;
    try {
      await del.mutateAsync(model.id);
      toast.success("Free gifts removed");
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Remove failed");
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3 bg-base-50 border border-base-200 rounded-[4px] p-3">
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
                {skuDisplay(s)}
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
          <span className="label block mb-1">Label (optional)</span>
          <input
            value={gift.label ?? ""}
            onChange={(e) => onPatch({ label: e.target.value })}
            placeholder="e.g. Free pillow"
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
// (b) Free Item Campaigns — CRUD
// ---------------------------------------------------------------------------

function FreeItemCampaignsSection({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const campaigns = catalog.freeItemCampaigns ?? [];

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <div className="t-h4 font-display">Free item campaigns</div>
        {isPrincipal && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="btn-ghost text-[12px]"
            data-testid="campaign-add"
          >
            {adding ? "Close" : "+ New campaign"}
          </button>
        )}
      </div>
      <p className="t-tiny text-base-500 mb-3">
        A giveaway a salesperson can apply to an eligible cart line ("Make free") — the line books at
        RM0. Set which models / sizes / sofa builds qualify and the per-line free limit. A campaign is
        dormant until you flip it Active.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>

      {adding && isPrincipal && (
        <CampaignForm catalog={catalog} onDone={() => setAdding(false)} />
      )}

      <div className="bg-white border border-base-200 rounded-[4px] overflow-hidden">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-50 border-b border-base-200"
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
      <div className="px-3 py-3 border-b border-base-100 last:border-b-0 bg-base-50">
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
      <div className="text-right font-mono text-[12px]">{campaign.maxFreeQty}</div>
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

/** Create / edit a free item campaign. `campaign` present = patch mode. */
function CampaignForm({
  catalog,
  campaign,
  onDone,
}: {
  catalog: CatalogResponse;
  campaign?: FreeItemCampaignDto;
  onDone: () => void;
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
    <div className="bg-base-50 border border-base-200 rounded-[4px] p-4 mb-3 flex flex-col gap-3">
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
  pwp: "Purchase-with-purchase",
  promo: "Promo",
};

function PwpRulesSection({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const rules = catalog.pwpRules ?? [];
  const pwpRules = rules.filter((r) => r.type === "pwp");
  const promoRules = rules.filter((r) => r.type === "promo");

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <div className="t-h4 font-display">PWP / Promo rules</div>
        {isPrincipal && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="btn-ghost text-[12px]"
            data-testid="pwp-add"
          >
            {adding ? "Close" : "+ New rule"}
          </button>
        )}
      </div>
      <p className="t-tiny text-base-500 mb-3">
        Pair a trigger product with a reward product. Buying the trigger unlocks the reward up to a
        set count per trigger — sold at the reward SKU's PWP price (set in SKU Master). Choose Kind:{" "}
        <span className="font-medium">PWP</span> (the classic discounted add-on) or{" "}
        <span className="font-medium">Promo</span>. Empty targeting = the whole category. A rule is
        dormant until you flip it Active.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>

      {adding && isPrincipal && <PwpRuleForm catalog={catalog} onDone={() => setAdding(false)} />}

      <div className="bg-white border border-base-200 rounded-[4px] overflow-hidden">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-50 border-b border-base-200"
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
              <div className="t-micro text-base-400 px-3 pt-2 pb-1 bg-base-50/40">
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
      <div className="px-3 py-3 border-b border-base-100 last:border-b-0 bg-base-50">
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
      <div className="text-right font-mono text-[12px]">{rule.qtyPerTrigger}</div>
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
  onDone,
}: {
  catalog: CatalogResponse;
  rule?: PwpRuleDto;
  onDone: () => void;
}) {
  const create = useCreatePwpRule();
  const update = useUpdatePwpRule();
  const [type, setType] = useState<PwpRuleDto["type"]>(rule?.type ?? "pwp");
  const [active, setActive] = useState(rule?.active ?? false);
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
  const valid = Number.isInteger(qtyNum) && qtyNum >= 1 && daysValid;

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
    <div className="bg-base-50 border border-base-200 rounded-[4px] p-4 mb-3 flex flex-col gap-4">
      <div className="flex flex-wrap gap-4 items-end">
        <label className="block">
          <span className="label block mb-1">Kind</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as PwpRuleDto["type"])}
            className={`${INPUT_CLS} w-44`}
            data-testid="pwp-kind"
          >
            <option value="pwp">PWP — purchase-with-purchase</option>
            <option value="promo">Promo</option>
          </select>
        </label>
        <label className="block">
          <span className="label block mb-1">Reward / trigger</span>
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
        <p className="t-tiny text-base-400">
          Tick the models that qualify as the trigger. Leave all unticked = any {triggerCategory}.
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
        <p className="t-tiny text-base-400">
          The reward is sold at each reward SKU's PWP price (set in SKU Master). Leave all unticked =
          any {rewardCategory}.
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
