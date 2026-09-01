import { useState } from "react";
import { useCatalog } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { PillTabs, type PillTab } from "./components/PillTabs";
import OperationSkuCostTab from "./tabs/OperationSkuCostTab";
import OperationFabricCostTab from "./tabs/OperationFabricCostTab";
import OperationComboCostTab from "./tabs/OperationComboCostTab";
import ModularTab from "./modular/ModularTab";

/**
 * Operation Catalog (0226, Loo 2026-07-16) — the BUYING-side door onto the one
 * catalog. Four tabs:
 *
 *   • SKU Master — the SAME shared product_skus list. Cost and supplier are
 *     this door's reason to exist and are editable by operation + principal.
 *   • Modular    — the shared model-card wall (structure reference; same
 *     component as Product & Maintenance).
 *   • Fabric     — the procurement fabric master with a per-fabric buying
 *     ADD-ON (RM): picking a specific fabric adds its recorded cost.
 *   • Sofa Combos — read-only costing view: what a combo costs us at each
 *     seat height. The combo itself is created, priced and retired on the
 *     admin Sofa combos tab, so this is a door and not a duplicate.
 *
 * ⭐ ALIGNED WITH PRODUCT & MAINTENANCE — owner ruling 2026-08-26 (Jess):
 * *"the 2 catalogues should align"*. This page used to hide the selling price,
 * PWP, margin, import/export and `+ New SKU` on the reasoning that costing is
 * "fully isolated from POS selling prices". It is not isolated and never was —
 * `Margin` was already printed on the OTHER door from these same two numbers.
 * What is real is the WRITE boundary, not a viewing one: operation SEES the
 * selling price and cannot change it (Jess: *"it avoids data pollution"*).
 * See `docs/ERP-ARCHITECTURE.md` §3.1.
 *
 * Data is the same `useCatalog({ admin: true })` bundle the main catalog page
 * uses — ONE shared cache entry, which is the honest tell that this was always
 * one catalog behind two doors.
 */

type TabKey = "sku" | "modular" | "fabric" | "combo";

const TABS: readonly PillTab<TabKey>[] = [
  { key: "sku", label: "SKU Master" },
  { key: "modular", label: "Modular" },
  { key: "fabric", label: "Fabric" },
  { key: "combo", label: "Sofa Combos" },
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
          {/* ⭐ THE PAGE SAYS WHAT IT IS FOR (Jess, 2026-08-26). She could not
              be told apart the three catalog-ish destinations, and that was a
              real fault rather than a gap in the explaining — so each one now
              answers its own question on screen instead of in a conversation. */}
          <p className="text-body text-base-600 mt-1">
            The product list, from the buying side — what each item costs us and who supplies it.
            Selling prices are shown for reference; only the Master Admin can change them.
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
          {tab === "combo" && <OperationComboCostTab catalog={catalogQ.data} />}
        </>
      )}
    </div>
  );
}
