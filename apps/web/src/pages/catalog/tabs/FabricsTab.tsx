import { useState } from "react";
import { Edit3, History, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CatalogFabricDto, CatalogResponse, FabricTier } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useBatchSaveCatalogFabrics, useCatalogFabricsHistory } from "@/lib/queries";
import { INPUT_CLS, Modal } from "@/pages/operation/components/Modal";
import { CodeChip } from "../components/atoms";
import MaintenanceSidebar, {
  type MaintenanceSidebarGroup,
} from "../components/MaintenanceSidebar";
import { FabricTierDeltasCard } from "./MaintenanceTab";

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
 *     (FabricTierDeltasCard, shared with Maintenance › Fabric Tiers).
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
          <div className="max-w-[680px]">
            <FabricTierDeltasCard catalog={catalog} isPrincipal={isPrincipal} />
          </div>
        )}
      </div>
    </div>
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
                <TierPill tier={f.sofaTier} />
              </div>
              <div className="flex items-center gap-1.5" data-testid={`fabric-bed-tier-${f.fabricCode}`}>
                <TierPill tier={f.bedframeTier} />
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
