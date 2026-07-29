import { useState } from "react";
import { useCatalog } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { PillTabs, type PillTab } from "./components/PillTabs";
import OperationSkuCostTab from "./tabs/OperationSkuCostTab";
import OperationFabricCostTab from "./tabs/OperationFabricCostTab";
import ModularTab from "./modular/ModularTab";

/**
 * Operation Catalog (0226, Loo 2026-07-16) — the operation-facing COSTING
 * variant of Product & Maintenance. Three tabs only:
 *
 *   • SKU Master — the SAME shared product_skus list, but the money column is
 *     COST (what we pay the supplier), editable by operation + principal.
 *     No selling price, no PWP, no margin — costing is fully isolated from
 *     the POS system's selling prices.
 *   • Modular    — the shared model-card wall (structure reference; same
 *     component as Product & Maintenance).
 *   • Fabric     — the procurement fabric master with a per-fabric buying
 *     ADD-ON (RM): picking a specific fabric adds its recorded cost.
 *
 * Data is the same `useCatalog({ admin: true })` bundle the main catalog page
 * uses (one shared cache entry); only the SURFACE differs. Selling-side knobs
 * never appear here.
 */

type TabKey = "sku" | "modular" | "fabric";

const TABS: readonly PillTab<TabKey>[] = [
  { key: "sku", label: "SKU Master" },
  { key: "modular", label: "Modular" },
  { key: "fabric", label: "Fabric" },
];

export default function OperationCatalogPage() {
  const role = useAuth((s) => s.role);
  const isPrincipal = role === "principal";
  const catalogQ = useCatalog({ admin: true });
  const [tab, setTab] = useState<TabKey>("sku");

  return (
    <div className="px-9 py-8 pb-14">
      <div className="flex justify-between items-end mb-6 gap-4 flex-wrap">
        <div>
          <div className="kicker">Catalog</div>
          <h1 className="text-page font-display mt-1.5 text-base-900">Operation Catalog</h1>
          <p className="text-body text-base-600 mt-1">
            Costing — record buying prices per SKU and per fabric. Isolated from POS
            selling prices.
          </p>
        </div>
        <PillTabs tabs={TABS} active={tab} onChange={setTab} ariaLabel="Operation Catalog" />
      </div>

      {catalogQ.isLoading && <div className="text-body text-base-500">Loading catalog…</div>}
      {catalogQ.isError && !catalogQ.isLoading && (
        <div className="text-body text-danger">
          Failed to load the catalog. Try refreshing — your session may have expired.
        </div>
      )}

      {catalogQ.data && (
        <>
          {tab === "sku" && <OperationSkuCostTab catalog={catalogQ.data} />}
          {tab === "modular" && <ModularTab catalog={catalogQ.data} isPrincipal={isPrincipal} />}
          {tab === "fabric" && <OperationFabricCostTab catalog={catalogQ.data} />}
        </>
      )}
    </div>
  );
}
