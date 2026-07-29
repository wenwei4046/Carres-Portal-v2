import { useState } from "react";
import { toast } from "sonner";
import type { CatalogFabricDto, CatalogResponse } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useSetCatalogFabricCost } from "@/lib/queries";
import { INPUT_CLS } from "@/pages/operation/components/Modal";
import { CodeChip } from "../components/atoms";

/**
 * Operation Catalog › Fabric (0226) — the procurement fabric master
 * (catalog_fabrics) with operation's per-fabric buying ADD-ON (RM): picking a
 * specific fabric adds its recorded cost on top of the base buying price.
 * Cost is the ONLY thing editable here (via the catalog_fabrics_set_cost
 * DEFINER RPC, internal-gated) — the fabric list's structure (codes, series,
 * suppliers, tiers) stays with the principal in Product & Maintenance, and a
 * principal batch save carries these costs forward by fabric code.
 */

// code · series · description · supplier · cost
const GRID_COLS = "150px minmax(90px,0.9fr) minmax(150px,1.2fr) minmax(120px,1fr) 130px";

function fmtRm(n: number): string {
  return `RM ${n.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function OperationFabricCostTab({ catalog }: { catalog: CatalogResponse }) {
  const fabrics = (catalog.fabrics ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const [search, setSearch] = useState("");
  const [editMode, setEditMode] = useState(false);

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

  return (
    <section data-testid="opcost-fabrics-panel">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="text-strong font-display text-base-900">Fabric costing</div>
          <p className="text-meta text-base-500 mt-0.5 max-w-[560px]">
            The buying add-on (RM) each specific fabric adds. Recorded by operation;
            isolated from POS selling prices. Fabric codes and tiers are managed in
            Product &amp; Maintenance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditMode((v) => !v)}
          className={`${editMode ? "btn-secondary" : "btn-primary"} text-meta shrink-0`}
          data-testid="opcost-fabric-edit"
        >
          {editMode ? "Done editing" : "Edit Costs"}
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 mb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by code or description…"
          aria-label="Search fabrics"
          data-testid="opcost-fabric-search"
          className={`${INPUT_CLS} w-72`}
        />
        <span className="text-label uppercase tracking-[0.05em] text-base-400">
          {visible.length} of {fabrics.length} fabrics
        </span>
      </div>

      <div className="bg-white border border-base-200 rounded-[4px] overflow-hidden">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-50 border-b border-base-200"
          style={{ gridTemplateColumns: GRID_COLS }}
        >
          <div className="label">Fabric code</div>
          <div className="label">Series</div>
          <div className="label">Description</div>
          <div className="label">Supplier code</div>
          <div className="label text-right">Cost add-on</div>
        </div>
        {visible.length === 0 && (
          <div className="text-body text-base-500 px-3 py-6 text-center">
            {fabrics.length === 0
              ? "No fabrics yet — the principal adds them in Product & Maintenance."
              : "No fabrics match the search."}
          </div>
        )}
        {visible.map((f) => (
          <FabricCostRow key={f.id} fabric={f} editMode={editMode} />
        ))}
      </div>
    </section>
  );
}

function FabricCostRow({ fabric, editMode }: { fabric: CatalogFabricDto; editMode: boolean }) {
  const setCost = useSetCatalogFabricCost();

  // Blank clears back to "not recorded" (null).
  function commitCost(raw: string) {
    const trimmed = raw.trim();
    const val = trimmed === "" ? null : Number(trimmed);
    if (val !== null && (!Number.isFinite(val) || val < 0)) {
      toast.error("Enter a non-negative number (blank = not set)");
      return;
    }
    if (val === (fabric.cost ?? null)) return;
    setCost.mutate(
      { id: fabric.id, cost: val },
      {
        onSuccess: () => toast.success(`${fabric.fabricCode} · cost updated`),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
      },
    );
  }

  return (
    <div
      className="grid items-center gap-3 px-3 py-2.5 border-b border-base-100 last:border-b-0"
      style={{ gridTemplateColumns: GRID_COLS, opacity: fabric.active ? 1 : 0.5 }}
      data-testid={`opcost-fabric-row-${fabric.fabricCode}`}
    >
      <div>
        <CodeChip>{fabric.fabricCode}</CodeChip>
      </div>
      <div className="text-body text-base-700 truncate">
        {fabric.series || <span className="text-base-300">—</span>}
      </div>
      <div className="text-body text-base-800 truncate" title={fabric.description ?? ""}>
        {fabric.description || <span className="text-base-300">—</span>}
      </div>
      <div className="text-body text-base-700 truncate">
        {fabric.supplierCode || <span className="text-base-300">—</span>}
      </div>
      <div className="text-right" data-testid={`opcost-fabric-cost-${fabric.fabricCode}`}>
        {editMode ? (
          <input
            type="number"
            min={0}
            step="0.01"
            defaultValue={fabric.cost ?? ""}
            placeholder="—"
            onBlur={(e) => commitCost(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            aria-label={`${fabric.fabricCode} cost add-on`}
            className={`${INPUT_CLS} text-right t-num text-meta`}
          />
        ) : fabric.cost == null ? (
          <span className="text-meta text-base-400 italic">not set</span>
        ) : (
          <span className="t-num text-meta text-base-800">{fmtRm(fabric.cost)}</span>
        )}
      </div>
    </div>
  );
}
