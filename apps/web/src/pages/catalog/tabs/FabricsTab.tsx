import { useEffect, useMemo, useState } from "react";
import { Edit3, History, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CatalogFabricDto, CatalogResponse, FabricTier, ProductModelDto } from "@carres/shared";
import { ApiError } from "@/lib/api";
import {
  useBatchSaveCatalogFabrics,
  useCatalogFabricsHistory,
  useUpdateSofaCompartment,
  useUpsertModelFabricTierOverride,
} from "@/lib/queries";
import { INPUT_CLS, Modal } from "@/pages/operation/components/Modal";
import { CodeChip } from "../components/atoms";
import MaintenanceSidebar, {
  type MaintenanceSidebarGroup,
} from "../components/MaintenanceSidebar";
import FabricTierDeltasCard from "./FabricTierDeltasCard";

/**
 * Fabrics tab (0202) — the 2990s "Products › Fabrics" port. Left sidebar
 * mirrors the reference (COMMON → Fabrics / Fabric Pricing):
 *
 *   • Fabrics — the global procurement fabric master (catalog_fabrics):
 *     FABRIC CODE · SERIES · DESCRIPTION · SUPPLIER CODE · SOFA TIER ·
 *     BEDFRAME TIER. View mode is read-only + searchable; Edit (principal)
 *     turns the whole list into a draft (0201 PoolPanel pattern) — Save is ONE
 *     atomic batch PUT that replaces the master + appends a history snapshot.
 *     Read-only reference: NO order-side consumer — the SELLING fabric path
 *     stays per-model sofa_fabrics + the 0176 tier deltas (2990s keeps the
 *     same split: cost tiers on fabric_trackings, selling tiers elsewhere).
 *   • Fabric Pricing — the existing 0176 global P2/P3 delta editor
 *     (FabricTierDeltasCard — this is its only entry point since the
 *     Maintenance tab's duplicate "Fabric Tiers" item was removed).
 */

type FabricsKey = "fabrics" | "pricing";

const TIER_CYCLE: Record<FabricTier, FabricTier> = {
  PRICE_1: "PRICE_2",
  PRICE_2: "PRICE_3",
  PRICE_3: "PRICE_1",
};

const tierLabel = (t: FabricTier) => `Price ${t.replace("PRICE_", "")}`;

/** Soft tier pill — flame-tinted for the priced tiers, neutral for Price 1. */
function TierPill({ tier }: { tier: FabricTier }) {
  return tier === "PRICE_1" ? (
    <span className="pill pill-neutral">{tierLabel(tier)}</span>
  ) : (
    <span className="pill bg-primary/10 text-primary">{tierLabel(tier)}</span>
  );
}

interface DraftRow {
  fabricCode: string;
  series: string;
  description: string;
  supplierCode: string;
  sofaTier: FabricTier;
  bedframeTier: FabricTier;
  active: boolean;
}

function toDraft(rows: CatalogFabricDto[]): DraftRow[] {
  return rows.map((f) => ({
    fabricCode: f.fabricCode,
    series: f.series ?? "",
    description: f.description ?? "",
    supplierCode: f.supplierCode ?? "",
    sofaTier: f.sofaTier,
    bedframeTier: f.bedframeTier,
    active: f.active,
  }));
}

// view: code · series · description · supplier · sofa tier · bedframe tier
const VIEW_COLS = "150px minmax(90px,0.9fr) minmax(150px,1.2fr) minmax(120px,1fr) 96px 96px";
// edit adds: active toggle + remove
const EDIT_COLS =
  "140px minmax(90px,0.9fr) minmax(140px,1.2fr) minmax(110px,1fr) 88px 88px 52px 40px";

export default function FabricsTab({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const [active, setActive] = useState<FabricsKey>("fabrics");
  const fabrics = (catalog.fabrics ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  const groups: MaintenanceSidebarGroup<FabricsKey>[] = [
    {
      title: "Common",
      items: [
        { key: "fabrics", label: "Fabrics", count: fabrics.length },
        { key: "pricing", label: "Fabric Pricing" },
      ],
    },
  ];

  return (
    <div className="flex gap-5 items-start">
      <MaintenanceSidebar groups={groups} active={active} onChange={setActive} />
      <div className="flex-1 min-w-0 max-w-[980px]">
        {active === "fabrics" && <FabricsPanel fabrics={fabrics} isPrincipal={isPrincipal} />}
        {active === "pricing" && (
          <div className="flex flex-col gap-8">
            <div className="max-w-[680px]">
              <FabricTierDeltasCard catalog={catalog} isPrincipal={isPrincipal} />
            </div>
            <PerModelTierOverride catalog={catalog} isPrincipal={isPrincipal} />
            <PerCompartmentSpecialPrice catalog={catalog} isPrincipal={isPrincipal} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-model tier delta override (0176) — moved here from the Modular drawer
// (Loo 2026-07-06: Modular = ON/OFF · name · description · photo ONLY; money
// knobs live with the other fabric pricing). Blank delta = inherit global.
// ---------------------------------------------------------------------------

/** RM delta for a saved-list cell — null means "inherit the global delta". */
const deltaCell = (n: number | null | undefined) =>
  n == null ? <span className="text-base-400">global</span> : `RM ${n.toLocaleString("en-MY")}`;

function PerModelTierOverride({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const upsert = useUpsertModelFabricTierOverride();
  const models = useMemo(
    () =>
      catalog.models
        .filter((m: ProductModelDto) => m.category === "sofa" || m.category === "bedframe")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [catalog.models],
  );
  const modelById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  // Only overrides that actually SET a delta (all-null = inherits global = not
  // a real override) and belong to a sofa/bedframe model.
  const saved = useMemo(
    () =>
      (catalog.modelFabricTierOverrides ?? [])
        .filter((o) => (o.tier2Delta != null || o.tier3Delta != null) && modelById.has(o.modelId))
        .sort((a, b) =>
          (modelById.get(a.modelId)?.name ?? "").localeCompare(modelById.get(b.modelId)?.name ?? ""),
        ),
    [catalog.modelFabricTierOverrides, modelById],
  );

  const [modelId, setModelId] = useState<string>(models[0]?.id ?? "");
  const override =
    (catalog.modelFabricTierOverrides ?? []).find((o) => o.modelId === modelId) ?? null;

  const [t2, setT2] = useState("");
  const [t3, setT3] = useState("");
  useEffect(() => {
    setT2(override?.tier2Delta != null ? String(override.tier2Delta) : "");
    setT3(override?.tier3Delta != null ? String(override.tier3Delta) : "");
  }, [modelId, override?.tier2Delta, override?.tier3Delta]);

  const t2Num = t2.trim() === "" ? null : Number(t2);
  const t3Num = t3.trim() === "" ? null : Number(t3);
  const valid =
    (t2Num === null || (Number.isFinite(t2Num) && t2Num >= 0)) &&
    (t3Num === null || (Number.isFinite(t3Num) && t3Num >= 0));
  const dirty =
    t2Num !== (override?.tier2Delta ?? null) || t3Num !== (override?.tier3Delta ?? null);

  function save() {
    if (!valid || !dirty || !modelId) return;
    upsert.mutate(
      { modelId, tier2Delta: t2Num, tier3Delta: t3Num },
      {
        onSuccess: () => toast.success("Tier override saved"),
        onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Save failed"),
      },
    );
  }

  function remove(mid: string) {
    upsert.mutate(
      { modelId: mid, tier2Delta: null, tier3Delta: null },
      {
        onSuccess: () => toast.success("Override removed — back to global"),
        onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Remove failed"),
      },
    );
  }

  if (models.length === 0) return null;

  return (
    <section data-testid="per-model-tier-override">
      <div className="t-h4 font-display text-base-900 mb-1">Per-model tier override</div>
      <p className="t-tiny text-base-500 mb-3 max-w-[560px]">
        Model-specific premium for P2 / P3 fabrics — overrides the global deltas above.
        Blank = use global.
        {!isPrincipal && " Master Admin only — read-only for your role."}
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_1fr] gap-5 items-start">
        {/* Editor */}
        <div className="bg-white border border-base-200 rounded-[4px] p-4 flex flex-col gap-4">
          <label className="block">
            <span className="label block mb-1">Model</span>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className={`${INPUT_CLS} w-full`}
              data-testid="tier-override-model"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-3">
            <label className="block flex-1">
              <span className="label block mb-1">P2 delta (RM)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={t2}
                disabled={!isPrincipal}
                onChange={(e) => setT2(e.target.value)}
                placeholder="global"
                className={`${INPUT_CLS} w-full disabled:opacity-60`}
                data-testid="tier-override-t2"
              />
            </label>
            <label className="block flex-1">
              <span className="label block mb-1">P3 delta (RM)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={t3}
                disabled={!isPrincipal}
                onChange={(e) => setT3(e.target.value)}
                placeholder="global"
                className={`${INPUT_CLS} w-full disabled:opacity-60`}
                data-testid="tier-override-t3"
              />
            </label>
          </div>
          {isPrincipal && (
            <button
              type="button"
              onClick={save}
              disabled={!valid || !dirty || upsert.isPending}
              className="btn-primary text-[12px] self-start disabled:opacity-40"
              data-testid="tier-override-save"
            >
              {upsert.isPending ? "Saving…" : override?.tier2Delta != null || override?.tier3Delta != null ? "Update override" : "Save override"}
            </button>
          )}
        </div>

        {/* Saved overrides list */}
        <div>
          <div className="label mb-1.5">Saved overrides</div>
          <div className="bg-base-50 border border-base-200 rounded-[4px] overflow-hidden">
            <div
              className="grid items-center gap-3 px-3 py-2 bg-base-100 border-b border-base-200"
              style={{ gridTemplateColumns: "minmax(120px,1.5fr) 100px 100px 96px" }}
            >
              <div className="label">Model</div>
              <div className="label text-right">P2</div>
              <div className="label text-right">P3</div>
              <div className="label text-right">Actions</div>
            </div>
            {saved.length === 0 && (
              <div className="t-small text-base-500 px-3 py-4" data-testid="tier-override-empty">
                No overrides — every model uses the global deltas.
              </div>
            )}
            {saved.map((o) => (
              <div
                key={o.modelId}
                className="grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0"
                style={{ gridTemplateColumns: "minmax(120px,1.5fr) 100px 100px 96px" }}
                data-testid={`tier-override-row-${o.modelId}`}
              >
                <div className="t-small text-base-900 truncate">{modelById.get(o.modelId)?.name}</div>
                <div className="text-right t-small">{deltaCell(o.tier2Delta)}</div>
                <div className="text-right t-small">{deltaCell(o.tier3Delta)}</div>
                <div className="text-right flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setModelId(o.modelId)}
                    className="btn-ghost text-[11px]"
                    data-testid={`tier-override-edit-${o.modelId}`}
                  >
                    Edit
                  </button>
                  {isPrincipal && (
                    <button
                      type="button"
                      onClick={() => remove(o.modelId)}
                      disabled={upsert.isPending}
                      className="btn-danger text-[11px]"
                      data-testid={`tier-override-remove-${o.modelId}`}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Per-compartment fabric-tier special (0205) — the highest-precedence delta,
// keyed on a COMPARTMENT (not a model). When any sofa build uses this
// compartment, its P2 / P3 special REPLACES the per-model / global delta for
// the whole sofa (highest wins if a build spans several). Blank = no special.
// Stored on the sofa_compartments pool row; reuses the compartment PATCH.
// ---------------------------------------------------------------------------

function PerCompartmentSpecialPrice({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const patch = useUpdateSofaCompartment();
  const compartments = useMemo(
    () =>
      (catalog.sofaCompartments ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)),
    [catalog.sofaCompartments],
  );
  const [compartmentId, setCompartmentId] = useState<string>(compartments[0]?.id ?? "");
  // Keep a valid selection if the pool changes under us (add / remove).
  useEffect(() => {
    if (compartments.length && !compartments.some((c) => c.id === compartmentId)) {
      setCompartmentId(compartments[0]!.id);
    }
  }, [compartments, compartmentId]);

  const current = compartments.find((c) => c.id === compartmentId) ?? null;

  const [t2, setT2] = useState("");
  const [t3, setT3] = useState("");
  useEffect(() => {
    setT2(current?.specialTier2Delta != null ? String(current.specialTier2Delta) : "");
    setT3(current?.specialTier3Delta != null ? String(current.specialTier3Delta) : "");
  }, [compartmentId, current?.specialTier2Delta, current?.specialTier3Delta]);

  const t2Num = t2.trim() === "" ? null : Number(t2);
  const t3Num = t3.trim() === "" ? null : Number(t3);
  const valid =
    (t2Num === null || (Number.isFinite(t2Num) && t2Num >= 0)) &&
    (t3Num === null || (Number.isFinite(t3Num) && t3Num >= 0));
  const dirty =
    t2Num !== (current?.specialTier2Delta ?? null) ||
    t3Num !== (current?.specialTier3Delta ?? null);

  function save() {
    if (!valid || !dirty || !compartmentId) return;
    patch.mutate(
      { id: compartmentId, patch: { specialTier2Delta: t2Num, specialTier3Delta: t3Num } },
      {
        onSuccess: () => toast.success("Compartment special saved"),
        onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Save failed"),
      },
    );
  }

  const saved = useMemo(
    () => compartments.filter((c) => c.specialTier2Delta != null || c.specialTier3Delta != null),
    [compartments],
  );

  function remove(id: string) {
    patch.mutate(
      { id, patch: { specialTier2Delta: null, specialTier3Delta: null } },
      {
        onSuccess: () => toast.success("Special removed"),
        onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Remove failed"),
      },
    );
  }

  return (
    <section data-testid="per-compartment-special-price">
      <div className="t-h4 font-display text-base-900 mb-1">Per-compartment special price</div>
      <p className="t-tiny text-base-500 mb-3 max-w-[560px]">
        When any sofa build uses this compartment, its P2 / P3 fabric premium
        replaces the per-model / global deltas above for the whole sofa (highest
        wins if a build spans several). Blank = no special.
        {!isPrincipal && " Master Admin only — read-only for your role."}
      </p>
      {compartments.length === 0 ? (
        <div className="bg-white border border-base-200 rounded-[4px] p-4 t-small text-base-500">
          No compartments yet — add them in the Maintenance tab first.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_1fr] gap-5 items-start">
          {/* Editor */}
          <div className="bg-white border border-base-200 rounded-[4px] p-4 flex flex-col gap-4">
            <label className="block">
              <span className="label block mb-1">Compartment</span>
              <select
                value={compartmentId}
                onChange={(e) => setCompartmentId(e.target.value)}
                className={`${INPUT_CLS} w-full`}
                data-testid="compartment-special-select"
              >
                {compartments.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}
                    {c.description ? ` — ${c.description}` : ""}
                    {c.active ? "" : " (off)"}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-3">
              <label className="block flex-1">
                <span className="label block mb-1">P2 special (RM)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={t2}
                  disabled={!isPrincipal}
                  onChange={(e) => setT2(e.target.value)}
                  placeholder="none"
                  className={`${INPUT_CLS} w-full disabled:opacity-60`}
                  data-testid="compartment-special-t2"
                />
              </label>
              <label className="block flex-1">
                <span className="label block mb-1">P3 special (RM)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={t3}
                  disabled={!isPrincipal}
                  onChange={(e) => setT3(e.target.value)}
                  placeholder="none"
                  className={`${INPUT_CLS} w-full disabled:opacity-60`}
                  data-testid="compartment-special-t3"
                />
              </label>
            </div>
            {isPrincipal && (
              <button
                type="button"
                onClick={save}
                disabled={!valid || !dirty || patch.isPending}
                className="btn-primary text-[12px] self-start disabled:opacity-40"
                data-testid="compartment-special-save"
              >
                {patch.isPending
                  ? "Saving…"
                  : current?.specialTier2Delta != null || current?.specialTier3Delta != null
                    ? "Update special"
                    : "Save special"}
              </button>
            )}
          </div>

          {/* Saved specials list */}
          <div>
            <div className="label mb-1.5">Saved specials</div>
            <div className="bg-base-50 border border-base-200 rounded-[4px] overflow-hidden">
              <div
                className="grid items-center gap-3 px-3 py-2 bg-base-100 border-b border-base-200"
                style={{ gridTemplateColumns: "minmax(120px,1.5fr) 100px 100px 96px" }}
              >
                <div className="label">Compartment</div>
                <div className="label text-right">P2</div>
                <div className="label text-right">P3</div>
                <div className="label text-right">Actions</div>
              </div>
              {saved.length === 0 && (
                <div className="t-small text-base-500 px-3 py-4" data-testid="compartment-special-empty">
                  No compartment specials set.
                </div>
              )}
              {saved.map((c) => (
                <div
                  key={c.id}
                  className="grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0"
                  style={{ gridTemplateColumns: "minmax(120px,1.5fr) 100px 100px 96px" }}
                  data-testid={`compartment-special-row-${c.id}`}
                >
                  <div className="t-small text-base-900 truncate" title={c.description ?? c.code}>
                    <span className="font-mono">{c.code}</span>
                    {!c.active && <span className="ml-1 text-base-400">(off)</span>}
                  </div>
                  <div className="text-right t-small">{deltaCell(c.specialTier2Delta)}</div>
                  <div className="text-right t-small">{deltaCell(c.specialTier3Delta)}</div>
                  <div className="text-right flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCompartmentId(c.id)}
                      className="btn-ghost text-[11px]"
                      data-testid={`compartment-special-edit-${c.id}`}
                    >
                      Edit
                    </button>
                    {isPrincipal && (
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        disabled={patch.isPending}
                        className="btn-danger text-[11px]"
                        data-testid={`compartment-special-remove-${c.id}`}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function FabricsPanel({
  fabrics,
  isPrincipal,
}: {
  fabrics: CatalogFabricDto[];
  isPrincipal: boolean;
}) {
  const save = useBatchSaveCatalogFabrics();
  // Also feeds the header's "Effective from" line, so fetch while mounted.
  const historyQ = useCatalogFabricsHistory(true);
  const history = historyQ.data?.history ?? [];
  const effectiveFrom = history[0]?.effectiveFrom ?? null;

  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<DraftRow[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const editing = draft !== null;

  const q = search.trim().toLowerCase();
  const visible = q
    ? fabrics.filter(
        (f) =>
          f.fabricCode.toLowerCase().includes(q) ||
          (f.description ?? "").toLowerCase().includes(q) ||
          (f.series ?? "").toLowerCase().includes(q) ||
          (f.supplierCode ?? "").toLowerCase().includes(q),
      )
    : fabrics;

  // --- draft helpers -------------------------------------------------------
  const patchRow = (i: number, up: Partial<DraftRow>) =>
    setDraft((d) => (d ? d.map((r, idx) => (idx === i ? { ...r, ...up } : r)) : d));
  const removeRow = (i: number) => setDraft((d) => (d ? d.filter((_, idx) => idx !== i) : d));
  const addRow = () =>
    setDraft((d) =>
      d
        ? [
            ...d,
            {
              fabricCode: "",
              series: "",
              description: "",
              supplierCode: "",
              sofaTier: "PRICE_2" as FabricTier,
              bedframeTier: "PRICE_2" as FabricTier,
              active: true,
            },
          ]
        : d,
    );

  // Direct click-to-cycle in VIEW mode (2990s behaviour — Loo 2026-07-06: the
  // pill must switch without entering Edit). One click = cycle Price 1 → 2 → 3
  // and save immediately through the same batch RPC (whole list, one tier
  // changed), stamping a descriptive history note.
  function cycleTier(f: CatalogFabricDto, field: "sofaTier" | "bedframeTier") {
    if (save.isPending) return;
    const next = TIER_CYCLE[f[field]];
    const side = field === "sofaTier" ? "Sofa" : "Bedframe";
    save.mutate(
      {
        entries: fabrics.map((x) => ({
          fabricCode: x.fabricCode,
          series: x.series,
          description: x.description,
          supplierCode: x.supplierCode,
          sofaTier: x.id === f.id && field === "sofaTier" ? next : x.sofaTier,
          bedframeTier: x.id === f.id && field === "bedframeTier" ? next : x.bedframeTier,
          active: x.active,
        })),
        notes: `${f.fabricCode} ${side} tier → ${tierLabel(next)}`,
      },
      {
        onSuccess: () => toast.success(`${f.fabricCode} · ${side} tier → ${tierLabel(next)}`),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
      },
    );
  }

  const draftCodes = (draft ?? []).map((r) => r.fabricCode.trim()).filter((v) => v.length > 0);
  const hasDuplicates = new Set(draftCodes).size !== draftCodes.length;
  const canSave = draftCodes.length > 0 && !hasDuplicates;

  function submit() {
    if (!draft || !canSave) return;
    save.mutate(
      {
        entries: draft
          .filter((r) => r.fabricCode.trim().length > 0)
          .map((r) => ({
            fabricCode: r.fabricCode.trim(),
            series: r.series.trim() || null,
            description: r.description.trim() || null,
            supplierCode: r.supplierCode.trim() || null,
            sofaTier: r.sofaTier,
            bedframeTier: r.bedframeTier,
            active: r.active,
          })),
      },
      {
        onSuccess: () => {
          setDraft(null);
          toast.success("Fabrics saved");
        },
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Save failed"),
      },
    );
  }

  return (
    <section data-testid="fabrics-panel">
      {/* header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="t-h4 font-display text-base-900">Fabrics</div>
          <p className="t-tiny text-base-500 mt-0.5 max-w-[520px]">
            Procurement fabric tiers (cost side, read-only reference).
            {!isPrincipal && " Principal only — read-only for your role."}
          </p>
          {effectiveFrom && (
            <p className="t-tiny text-base-400 mt-1" data-testid="fabrics-effective">
              Effective from {effectiveFrom}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {editing ? (
            <>
              <button type="button" onClick={() => setDraft(null)} className="btn-ghost text-[12px]">
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSave || save.isPending}
                className="btn-primary text-[12px] disabled:opacity-40"
                data-testid="fabrics-save"
              >
                {save.isPending ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            isPrincipal && (
              <button
                type="button"
                onClick={() => setDraft(toDraft(fabrics))}
                className="btn-ghost text-[12px] inline-flex items-center gap-1.5"
                data-testid="fabrics-edit"
              >
                <Edit3 size={13} strokeWidth={2} /> Edit
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="btn-ghost text-[12px] inline-flex items-center gap-1.5"
            data-testid="fabrics-history"
          >
            <History size={13} strokeWidth={2} /> History
          </button>
        </div>
      </div>

      {/* search (view mode only — the Edit draft always shows the full list) */}
      {!editing && (
        <div className="flex items-center justify-between gap-3 mb-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code or description…"
            aria-label="Search fabrics"
            data-testid="fabrics-search"
            className={`${INPUT_CLS} w-72`}
          />
          <span className="t-micro text-base-400">
            {visible.length} of {fabrics.length} records
          </span>
        </div>
      )}

      {/* body */}
      {!editing ? (
        <div className="bg-white border border-base-200 rounded-[4px] overflow-hidden">
          <div
            className="grid items-center gap-3 px-3 py-2 bg-base-50 border-b border-base-200"
            style={{ gridTemplateColumns: VIEW_COLS }}
          >
            <div className="label">Fabric code</div>
            <div className="label">Series</div>
            <div className="label">Description</div>
            <div className="label">Supplier code</div>
            <div className="label">Sofa tier</div>
            <div className="label">Bedframe tier</div>
          </div>
          {visible.length === 0 && (
            <div className="t-small text-base-500 px-3 py-6 text-center">
              {fabrics.length === 0
                ? "No fabrics yet — press Edit to add some."
                : "No fabrics match the search."}
            </div>
          )}
          {visible.map((f) => (
            <div
              key={f.id}
              className="grid items-center gap-3 px-3 py-2.5 border-b border-base-100 last:border-b-0"
              style={{ gridTemplateColumns: VIEW_COLS, opacity: f.active ? 1 : 0.5 }}
              data-testid={`fabric-row-${f.fabricCode}`}
            >
              <div>
                <CodeChip>{f.fabricCode}</CodeChip>
              </div>
              <div className="t-small text-base-700 truncate">
                {f.series || <span className="text-base-300">—</span>}
              </div>
              <div className="t-small text-base-800 truncate" title={f.description ?? ""}>
                {f.description || <span className="text-base-300">—</span>}
              </div>
              <div className="t-small text-base-700 truncate">
                {f.supplierCode || <span className="text-base-300">—</span>}
              </div>
              <div data-testid={`fabric-sofa-tier-${f.fabricCode}`}>
                {isPrincipal ? (
                  <button
                    type="button"
                    onClick={() => cycleTier(f, "sofaTier")}
                    disabled={save.isPending}
                    className="disabled:opacity-50"
                    aria-label={`${f.fabricCode} sofa tier — ${tierLabel(f.sofaTier)}, click to change`}
                    title="Click to cycle Price 1 → 2 → 3 (saves immediately)"
                  >
                    <TierPill tier={f.sofaTier} />
                  </button>
                ) : (
                  <TierPill tier={f.sofaTier} />
                )}
              </div>
              <div className="flex items-center gap-1.5" data-testid={`fabric-bed-tier-${f.fabricCode}`}>
                {isPrincipal ? (
                  <button
                    type="button"
                    onClick={() => cycleTier(f, "bedframeTier")}
                    disabled={save.isPending}
                    className="disabled:opacity-50"
                    aria-label={`${f.fabricCode} bedframe tier — ${tierLabel(f.bedframeTier)}, click to change`}
                    title="Click to cycle Price 1 → 2 → 3 (saves immediately)"
                  >
                    <TierPill tier={f.bedframeTier} />
                  </button>
                ) : (
                  <TierPill tier={f.bedframeTier} />
                )}
                {!f.active && <span className="pill pill-neutral">OFF</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* edit header row */}
          <div
            className="grid items-center gap-2 px-3 py-1.5"
            style={{ gridTemplateColumns: EDIT_COLS }}
          >
            <span className="label">Fabric code</span>
            <span className="label">Series</span>
            <span className="label">Description</span>
            <span className="label">Supplier code</span>
            <span className="label">Sofa tier</span>
            <span className="label">Bedframe tier</span>
            <span className="label text-center">Active</span>
            <span />
          </div>
          {(draft ?? []).map((r, i) => (
            <div
              key={i}
              className="grid items-center gap-2 bg-white border border-base-200 rounded-[4px] px-3 py-2"
              style={{ gridTemplateColumns: EDIT_COLS }}
            >
              <input
                value={r.fabricCode}
                onChange={(e) => patchRow(i, { fabricCode: e.target.value })}
                placeholder="BF-01"
                className={`${INPUT_CLS} font-mono text-[12px]`}
                aria-label={`row ${i + 1} fabric code`}
              />
              <input
                value={r.series}
                onChange={(e) => patchRow(i, { series: e.target.value })}
                placeholder="+ Add series"
                className={INPUT_CLS}
                aria-label={`row ${i + 1} series`}
              />
              <input
                value={r.description}
                onChange={(e) => patchRow(i, { description: e.target.value })}
                placeholder="—"
                className={INPUT_CLS}
                aria-label={`row ${i + 1} description`}
              />
              <input
                value={r.supplierCode}
                onChange={(e) => patchRow(i, { supplierCode: e.target.value })}
                placeholder="PC151-01"
                className={`${INPUT_CLS} font-mono text-[12px]`}
                aria-label={`row ${i + 1} supplier code`}
              />
              <button
                type="button"
                onClick={() => patchRow(i, { sofaTier: TIER_CYCLE[r.sofaTier] })}
                className="justify-self-start"
                aria-label={`row ${i + 1} sofa tier — ${tierLabel(r.sofaTier)}, click to change`}
                title="Click to cycle Price 1 → 2 → 3"
              >
                <TierPill tier={r.sofaTier} />
              </button>
              <button
                type="button"
                onClick={() => patchRow(i, { bedframeTier: TIER_CYCLE[r.bedframeTier] })}
                className="justify-self-start"
                aria-label={`row ${i + 1} bedframe tier — ${tierLabel(r.bedframeTier)}, click to change`}
                title="Click to cycle Price 1 → 2 → 3"
              >
                <TierPill tier={r.bedframeTier} />
              </button>
              <div className="text-center">
                <input
                  type="checkbox"
                  checked={r.active}
                  onChange={(e) => patchRow(i, { active: e.target.checked })}
                  aria-label={`row ${i + 1} active`}
                />
              </div>
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="btn-danger px-1.5 py-1"
                aria-label={`remove row ${i + 1}`}
              >
                <Trash2 size={13} strokeWidth={2} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addRow}
            className="btn-ghost text-[12px] self-start inline-flex items-center gap-1.5"
            data-testid="fabrics-add-row"
          >
            <Plus size={13} strokeWidth={2} /> Add fabric
          </button>
          {hasDuplicates && (
            <p className="t-tiny text-danger">
              Duplicate fabric codes — each code must be unique.
            </p>
          )}
        </div>
      )}

      {/* history dialog */}
      {showHistory && (
        <Modal title="History — Fabrics" onClose={() => setShowHistory(false)}>
          <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
            {historyQ.isLoading && <p className="t-small text-base-500">Loading history…</p>}
            {!historyQ.isLoading && history.length === 0 && (
              <p className="t-small text-base-500">No history yet — the first Edit save writes one.</p>
            )}
            {history.map((h) => (
              <div key={h.id} className="border border-base-200 rounded-[4px] p-3 bg-base-50">
                <div className="flex items-center justify-between gap-3">
                  <div className="t-small font-medium text-base-900">
                    Effective from {h.effectiveFrom}
                  </div>
                  <div className="t-tiny text-base-400">
                    saved {new Date(h.createdAt).toLocaleString("en-MY")}
                  </div>
                </div>
                {h.notes && <p className="t-tiny text-base-500 mt-1">{h.notes}</p>}
                <div className="mt-2 flex flex-col gap-1">
                  {h.entries.map((e, i) => (
                    <div key={i} className="flex items-center gap-2 t-tiny text-base-700">
                      <span className="text-base-400 w-6 text-center tabular-nums">{i + 1}</span>
                      <span className={e.active ? "" : "line-through text-base-400"}>
                        {e.fabricCode}
                        {e.description && e.description !== e.fabricCode
                          ? ` · ${e.description}`
                          : ""}
                        {e.supplierCode ? ` · ${e.supplierCode}` : ""}
                      </span>
                      <span className="ml-auto text-base-500">
                        {tierLabel(e.sofaTier)} / {tierLabel(e.bedframeTier)}
                      </span>
                    </div>
                  ))}
                  {h.entries.length === 0 && <p className="t-tiny text-base-400 italic">empty</p>}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </section>
  );
}
