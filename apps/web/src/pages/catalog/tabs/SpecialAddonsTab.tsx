import { useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  CatalogOptionPoolDto,
  CatalogOptionPoolName,
  CatalogResponse,
  ProductCategory,
  SpecialAddonDto,
  SpecialAddonOptionGroupDto,
} from "@carres/shared";
import { PRODUCT_CATEGORIES } from "@carres/shared";
import { ApiError } from "@/lib/api";
import {
  useCreateSpecialAddon,
  useDeleteSpecialAddon,
  usePatchSpecialAddon,
} from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "@/pages/operation/components/Modal";
import { CategoryChip, CATEGORY_LABEL, CodeChip } from "../components/atoms";
import MaintenanceSidebar, {
  type MaintenanceSidebarGroup,
} from "../components/MaintenanceSidebar";
import OrderAddonsSection from "./OrderAddonsSection";
import PoolPanel from "./PoolPanel";
import StairCarryFeeSection from "./StairCarryFeeSection";

/**
 * Special Add-ons tab — 0201 reshaped to the 2990s reference layout (Loo
 * 2026-07-05 screenshot): a grouped LEFT SIDEBAR + one panel at a time.
 *
 *   BEDFRAME  — Divan Heights (surcharge-priced) · Total Heights · Gaps ·
 *               Leg Heights — 0201 option pools (PoolPanel: Edit-draft batch
 *               save + Effective-from + History).
 *   SOFA      — Sizes · Leg Heights — 0201 option pools.
 *   PRODUCT ADD-ONS — the 0181 special_addons table (per-model SELLING
 *               surcharges with one-level follow-up question groups; may be
 *               negative). Unchanged editor, now hosted as a panel.
 *   ORDER ADD-ONS — the order-level addons CRUD (disposal, lift…), moved here
 *               from the Maintenance tab to mirror the 2990s sidebar. Also
 *               hosts the stair-carry fee (an order-level charge — moved out
 *               of the Delivery tab, Loo 2026-07-06).
 */

// NOTE (Loo 2026-07-06): "total_height" is deliberately NOT a section — total
// height is COMPUTED at POS (divan + leg), never authored/picked. The 0201
// `total_height` pool rows stay dormant in the DB.
type SpecialKey =
  | "divan_height"
  | "gap"
  | "bedframe_leg_height"
  | "sofa_size"
  | "sofa_leg_height"
  | "product"
  | "order";

export default function SpecialAddonsTab({
  catalog,
  isPrincipal = false,
}: {
  catalog: CatalogResponse;
  isPrincipal?: boolean;
}) {
  const [active, setActive] = useState<SpecialKey>("divan_height");
  const pools = catalog.optionPools ?? [];
  const byPool = (p: CatalogOptionPoolName): CatalogOptionPoolDto[] =>
    pools.filter((e) => e.pool === p);

  const groups: MaintenanceSidebarGroup<SpecialKey>[] = [
    {
      title: "Bedframe",
      items: [
        { key: "divan_height", label: "Divan Heights", count: byPool("divan_height").length },
        { key: "gap", label: "Gaps", count: byPool("gap").length },
        {
          key: "bedframe_leg_height",
          label: "Leg Heights",
          count: byPool("bedframe_leg_height").length,
        },
      ],
    },
    {
      title: "Sofa",
      items: [
        { key: "sofa_size", label: "Sizes", count: byPool("sofa_size").length },
        { key: "sofa_leg_height", label: "Leg Heights", count: byPool("sofa_leg_height").length },
      ],
    },
    {
      title: "Product Add-ons",
      items: [
        { key: "product", label: "Product Add-ons", count: (catalog.specialAddons ?? []).length },
      ],
    },
    {
      title: "Order Add-ons",
      items: [{ key: "order", label: "Order Add-ons", count: catalog.addons.length }],
    },
  ];

  return (
    <div className="flex gap-5 items-start">
      <MaintenanceSidebar groups={groups} active={active} onChange={setActive} />
      <div className="flex-1 min-w-0 max-w-[860px]">
        {active === "divan_height" && (
          <PoolPanel
            pool="divan_height"
            variant="priced"
            title="Divan Heights"
            description="Bedframe divan height options with surcharge pricing."
            entries={byPool("divan_height")}
            isPrincipal={isPrincipal}
          />
        )}
        {active === "gap" && (
          <PoolPanel
            pool="gap"
            variant="plain"
            title="Gaps"
            description="Bedframe gap options (headboard-to-divan clearance)."
            entries={byPool("gap")}
            isPrincipal={isPrincipal}
          />
        )}
        {active === "bedframe_leg_height" && (
          <PoolPanel
            pool="bedframe_leg_height"
            variant="priced"
            title="Leg Heights"
            description="Bedframe leg height options with surcharge pricing."
            entries={byPool("bedframe_leg_height")}
            isPrincipal={isPrincipal}
          />
        )}
        {active === "sofa_size" && (
          <PoolPanel
            pool="sofa_size"
            variant="plain"
            title="Sizes"
            description="Sofa size options (seat depth, inches)."
            entries={byPool("sofa_size")}
            isPrincipal={isPrincipal}
          />
        )}
        {active === "sofa_leg_height" && (
          <PoolPanel
            pool="sofa_leg_height"
            variant="priced"
            title="Leg Heights"
            description="Sofa leg height options with surcharge pricing."
            entries={byPool("sofa_leg_height")}
            isPrincipal={isPrincipal}
          />
        )}
        {active === "product" && (
          <ProductAddonsPanel catalog={catalog} isPrincipal={isPrincipal} />
        )}
        {active === "order" && (
          <div className="flex flex-col gap-8">
            <OrderAddonsSection addons={catalog.addons} />
            <StairCarryFeeSection catalog={catalog} isPrincipal={isPrincipal} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PRODUCT ADD-ONS panel — the 0181 special_addons editor (previously the whole
// tab body; unchanged behaviour, now one sidebar panel).
// ---------------------------------------------------------------------------

function fmtRm(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}RM ${Math.abs(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface DraftGroup {
  label: string;
  required: boolean;
  choices: { label: string; extra: string }[]; // extra as string for the input
}
interface Draft {
  id: string | null; // null = new
  code: string;
  label: string;
  soDescription: string;
  categories: ProductCategory[];
  sellingPrice: string;
  cost: string;
  active: boolean;
  sortOrder: string;
  optionGroups: DraftGroup[];
}

function toDraft(a?: SpecialAddonDto): Draft {
  if (!a) {
    return { id: null, code: "", label: "", soDescription: "", categories: [], sellingPrice: "0", cost: "", active: true, sortOrder: "0", optionGroups: [] };
  }
  return {
    id: a.id,
    code: a.code,
    label: a.label,
    soDescription: a.soDescription,
    categories: a.categories as ProductCategory[],
    sellingPrice: String(a.sellingPrice),
    cost: a.cost == null ? "" : String(a.cost),
    active: a.active,
    sortOrder: String(a.sortOrder),
    optionGroups: a.optionGroups.map((g) => ({
      label: g.label,
      required: g.required,
      choices: g.choices.map((c) => ({ label: c.label, extra: String(c.extra) })),
    })),
  };
}

function ProductAddonsPanel({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const rows = useMemo(
    () =>
      [...(catalog.specialAddons ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
      ),
    [catalog.specialAddons],
  );
  const [editing, setEditing] = useState<Draft | null>(null);

  return (
    <section data-testid="product-addons-panel">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="t-h4 font-display text-base-900">Product Add-ons</div>
          <p className="t-tiny text-base-500 mt-0.5 max-w-[520px]">
            Per-model surcharges with optional follow-up questions. Attach them to a
            model in the Modular tab.
            {!isPrincipal && " Master Admin only — read-only for your role."}
          </p>
        </div>
        {isPrincipal && (
          <button
            type="button"
            onClick={() => setEditing(toDraft())}
            className="btn-hero text-[12px] shrink-0"
            data-testid="special-new"
          >
            + New special add-on
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="t-small text-base-500 py-6">No special add-ons yet.</div>
      ) : (
        <div className="bg-white border border-base-200 rounded-[4px] overflow-hidden">
          <div className="grid grid-cols-[1.4fr_140px_110px_90px_80px_64px] bg-base-50 t-micro text-base-500 px-3 py-2">
            <span>NAME</span>
            <span>CATEGORIES</span>
            <span className="text-right">BASE PRICE</span>
            <span className="text-right">QUESTIONS</span>
            <span>STATUS</span>
            <span />
          </div>
          {rows.map((a) => (
            <div
              key={a.id}
              className="grid grid-cols-[1.4fr_140px_110px_90px_80px_64px] px-3 py-2 border-t border-base-100 items-center"
              data-testid={`special-row-${a.code}`}
            >
              <div className="min-w-0">
                <div className="t-small text-base-900 font-medium truncate">{a.label}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <CodeChip>{a.code}</CodeChip>
                  {a.soDescription && <span className="t-tiny text-base-400 truncate">{a.soDescription}</span>}
                </div>
              </div>
              <span className="t-tiny text-base-500 truncate">
                {a.categories.map((c) => CATEGORY_LABEL[c as ProductCategory] ?? c).join(", ") || "—"}
              </span>
              <span className="t-small text-right tabular-nums">{fmtRm(a.sellingPrice)}</span>
              <span className="t-tiny text-right text-base-500">
                {a.optionGroups.length === 0 ? "—" : `${a.optionGroups.length}`}
              </span>
              <span>
                {a.active ? (
                  <span className="pill pill-confirmed">ACTIVE</span>
                ) : (
                  <span className="pill pill-neutral">OFF</span>
                )}
              </span>
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setEditing(toDraft(a))}
                  className="btn-ghost text-[11px]"
                  data-testid={`special-edit-${a.code}`}
                  disabled={!isPrincipal}
                >
                  {isPrincipal ? "Edit" : "View"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && isPrincipal && (
        <SpecialAddonEditor draft={editing} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}

function SpecialAddonEditor({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const create = useCreateSpecialAddon();
  const patch = usePatchSpecialAddon();
  const del = useDeleteSpecialAddon();
  const isNew = draft.id === null;
  const [d, setD] = useState<Draft>(draft);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  function toggleCategory(c: ProductCategory) {
    setD((p) => ({
      ...p,
      categories: p.categories.includes(c) ? p.categories.filter((x) => x !== c) : [...p.categories, c],
    }));
  }

  // --- option-group editing ---
  const addGroup = () =>
    setD((p) => ({ ...p, optionGroups: [...p.optionGroups, { label: "", required: true, choices: [{ label: "", extra: "0" }] }] }));
  const removeGroup = (gi: number) =>
    setD((p) => ({ ...p, optionGroups: p.optionGroups.filter((_, i) => i !== gi) }));
  const patchGroup = (gi: number, up: Partial<DraftGroup>) =>
    setD((p) => ({ ...p, optionGroups: p.optionGroups.map((g, i) => (i === gi ? { ...g, ...up } : g)) }));
  const addChoice = (gi: number) =>
    patchGroupChoices(gi, (cs) => [...cs, { label: "", extra: "0" }]);
  const removeChoice = (gi: number, ci: number) =>
    patchGroupChoices(gi, (cs) => cs.filter((_, i) => i !== ci));
  const patchChoice = (gi: number, ci: number, up: Partial<{ label: string; extra: string }>) =>
    patchGroupChoices(gi, (cs) => cs.map((c, i) => (i === ci ? { ...c, ...up } : c)));
  function patchGroupChoices(gi: number, fn: (cs: DraftGroup["choices"]) => DraftGroup["choices"]) {
    setD((p) => ({ ...p, optionGroups: p.optionGroups.map((g, i) => (i === gi ? { ...g, choices: fn(g.choices) } : g)) }));
  }

  const sellingNum = Number(d.sellingPrice);
  const costTrim = d.cost.trim();
  const valid =
    (isNew ? d.code.trim().length >= 1 : true) &&
    d.label.trim().length >= 1 &&
    d.categories.length >= 1 &&
    Number.isFinite(sellingNum) &&
    (costTrim === "" || Number.isFinite(Number(costTrim))) &&
    d.optionGroups.every(
      (g) => g.label.trim().length >= 1 && g.choices.length >= 1 && g.choices.every((c) => c.label.trim().length >= 1 && Number.isFinite(Number(c.extra))),
    );

  const pending = create.isPending || patch.isPending || del.isPending;

  async function save() {
    if (!valid) return;
    const optionGroups: SpecialAddonOptionGroupDto[] = d.optionGroups.map((g) => ({
      label: g.label.trim(),
      required: g.required,
      choices: g.choices.map((c) => ({ label: c.label.trim(), extra: Number(c.extra) })),
    }));
    const common = {
      label: d.label.trim(),
      soDescription: d.soDescription.trim(),
      categories: d.categories,
      sellingPrice: sellingNum,
      cost: costTrim === "" ? null : Number(costTrim),
      optionGroups,
      active: d.active,
      sortOrder: Number(d.sortOrder) || 0,
    };
    try {
      if (isNew) await create.mutateAsync({ code: d.code.trim(), ...common });
      else await patch.mutateAsync({ id: d.id!, patch: common });
      toast.success(isNew ? "Special add-on created" : "Special add-on updated");
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    }
  }

  async function remove() {
    if (isNew || !d.id) return;
    if (!confirm(`Turn off "${d.label}"? Existing orders keep their saved text; new ones won't offer it.`)) return;
    try {
      await del.mutateAsync(d.id);
      toast.success("Special add-on turned off");
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed");
    }
  }

  return (
    <Modal title={isNew ? "New special add-on" : "Edit special add-on"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label block mb-1">Code {isNew ? "" : "(locked)"}</span>
            <input
              value={d.code}
              onChange={(e) => set("code", e.target.value)}
              disabled={!isNew}
              placeholder="right-drawer"
              data-testid="special-code"
              className={`${INPUT_CLS} disabled:opacity-50`}
            />
          </label>
          <label className="block">
            <span className="label block mb-1">Label</span>
            <input value={d.label} onChange={(e) => set("label", e.target.value)} placeholder="Right Drawer" data-testid="special-label" className={INPUT_CLS} />
          </label>
        </div>

        <label className="block">
          <span className="label block mb-1">SO description (printed under the product)</span>
          <input value={d.soDescription} onChange={(e) => set("soDescription", e.target.value)} placeholder="Right pull-out drawer" className={INPUT_CLS} />
        </label>

        <div>
          <span className="label block mb-1">Categories that can offer this</span>
          <div className="flex items-center gap-1.5 flex-wrap" data-testid="special-categories">
            {PRODUCT_CATEGORIES.map((c) => (
              <CategoryChip key={c} active={d.categories.includes(c)} onClick={() => toggleCategory(c)}>
                {CATEGORY_LABEL[c]}
              </CategoryChip>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="label block mb-1">Base surcharge (RM, ± ok)</span>
            <input type="number" step="0.01" value={d.sellingPrice} onChange={(e) => set("sellingPrice", e.target.value)} data-testid="special-price" className={INPUT_CLS} />
          </label>
          <label className="block">
            <span className="label block mb-1">Cost (optional)</span>
            <input type="number" step="0.01" value={d.cost} onChange={(e) => set("cost", e.target.value)} placeholder="not set" className={INPUT_CLS} />
          </label>
          <label className="block">
            <span className="label block mb-1">Sort</span>
            <input type="number" value={d.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} className={INPUT_CLS} />
          </label>
        </div>

        {/* Option groups (follow-up questions) */}
        <div className="border-t border-base-200 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="label">Follow-up questions (optional)</span>
            <button type="button" onClick={addGroup} className="btn-secondary text-[11px]" data-testid="special-add-group">
              + Question
            </button>
          </div>
          {d.optionGroups.length === 0 && <p className="t-tiny text-base-400">No follow-up questions — the base surcharge applies as-is.</p>}
          <div className="flex flex-col gap-3">
            {d.optionGroups.map((g, gi) => (
              <div key={gi} className="border border-base-200 rounded-[4px] p-2.5 bg-base-50" data-testid={`special-group-${gi}`}>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    value={g.label}
                    onChange={(e) => patchGroup(gi, { label: e.target.value })}
                    placeholder="Thickness"
                    className={`${INPUT_CLS} flex-1`}
                    data-testid={`special-group-label-${gi}`}
                  />
                  <label className="flex items-center gap-1 t-tiny text-base-600">
                    <input type="checkbox" checked={g.required} onChange={(e) => patchGroup(gi, { required: e.target.checked })} />
                    required
                  </label>
                  <button type="button" onClick={() => removeGroup(gi)} className="btn-danger text-[11px]">Remove</button>
                </div>
                <div className="flex flex-col gap-1.5">
                  {g.choices.map((c, ci) => (
                    <div key={ci} className="flex items-center gap-2">
                      <input
                        value={c.label}
                        onChange={(e) => patchChoice(gi, ci, { label: e.target.value })}
                        placeholder='10"'
                        className={`${INPUT_CLS} flex-1`}
                        data-testid={`special-choice-label-${gi}-${ci}`}
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={c.extra}
                        onChange={(e) => patchChoice(gi, ci, { extra: e.target.value })}
                        placeholder="+RM"
                        className={`${INPUT_CLS} w-24`}
                        data-testid={`special-choice-extra-${gi}-${ci}`}
                        title="Extra surcharge for this choice (± ok)"
                      />
                      <button type="button" onClick={() => removeChoice(gi, ci)} className="btn-ghost text-[11px]" disabled={g.choices.length <= 1}>✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addChoice(gi)} className="btn-ghost text-[11px] self-start" data-testid={`special-add-choice-${gi}`}>
                    + choice
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 t-small text-base-700">
          <input type="checkbox" checked={d.active} onChange={(e) => set("active", e.target.checked)} />
          Active (offered at POS)
        </label>
      </div>

      <div className="flex items-center justify-between mt-1">
        {!isNew ? (
          <button type="button" onClick={remove} className="btn-danger text-[12px]" disabled={pending}>
            Turn off
          </button>
        ) : (
          <span />
        )}
        <ModalActions onCancel={onClose} onPrimary={save} primary={isNew ? "Create" : "Save"} primaryDisabled={!valid} primaryPending={pending} />
      </div>
    </Modal>
  );
}
