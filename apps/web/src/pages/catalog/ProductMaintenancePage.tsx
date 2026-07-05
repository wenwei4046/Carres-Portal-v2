import { useState } from "react";
import { useCatalog } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { PillTabs, type PillTab } from "./components/PillTabs";
import SkuMasterTab from "./tabs/SkuMasterTab";
import ModularTab from "./modular/ModularTab";
import MaintenanceTab from "./tabs/MaintenanceTab";
import CombosTab from "./tabs/CombosTab";
import SpecialAddonsTab from "./tabs/SpecialAddonsTab";
import FabricsTab from "./tabs/FabricsTab";
import PromoTab from "./tabs/PromoTab";

/**
 * Product & Maintenance — the rebuilt Catalog page (0169-0173). Replaces the
 * old single-page `OperationCatalog`. Four tabs:
 *
 *   • SKU Master  — flat product table (code · description · name · category ·
 *                   size · price · status), filter + search + Edit Prices.
 *   • Modular     — model cards grouped by category; photo, allowed-options,
 *                   per-size SKU ON/OFF (pos_active), Generate SKUs.
 *   • Maintenance — option pools + delivery-fee (floor_config) + add-ons.
 *   • Combos      — principal-only named SKU sets sold at one combo price; the
 *                   components split that price back out at checkout (0177).
 *
 * Mounts at the unchanged `'catalog'` routing key in BOTH OperationApp and
 * PrincipalApp. The single `useCatalog({ admin: true })` bundle is fetched
 * here and handed to every tab so the three tabs share one cache entry (the
 * admin bundle includes OFF / discontinued rows the editor needs to see).
 *
 * `isPrincipal` gates the Maintenance delivery-fee editor — floor_config
 * writes are principal-only at the RLS layer (floor_write_principal).
 *
 * Unified Internal Portal (2026-06-30): catalog is DEDUPED to a single nav
 * entry (Operations area), reachable by operation AND principal. So instead of
 * the mounting app passing `isPrincipal`, the page DERIVES it from the live
 * role — the principal gets the pricing-edit affordances wherever they open it.
 * The prop is kept as an explicit override (tests / the legacy Principal mount).
 */

type TabKey = "sku" | "modular" | "special" | "fabrics" | "maintenance" | "combos" | "promo";

const TABS: readonly PillTab<TabKey>[] = [
  { key: "sku", label: "SKU Master" },
  { key: "modular", label: "Modular" },
  { key: "special", label: "Special Add-ons" },
  { key: "fabrics", label: "Fabrics" },
  { key: "maintenance", label: "Maintenance" },
  { key: "combos", label: "Combos" },
  { key: "promo", label: "Promo / Free Gifts" },
];

export default function ProductMaintenancePage({
  isPrincipal: isPrincipalProp,
}: {
  isPrincipal?: boolean;
} = {}) {
  // Derive principal-ness from the live role unless the caller forces it.
  const role = useAuth((s) => s.role);
  const isPrincipal = isPrincipalProp ?? role === "principal";
  // admin:true → bundle includes OFF (pos_active=false) + discontinued rows so
  // the editor can toggle them back on. The dealer-facing bundle stays filtered.
  const catalogQ = useCatalog({ admin: true });
  const [tab, setTab] = useState<TabKey>("sku");

  return (
    <div className="px-9 py-8 pb-14">
      <div className="flex justify-between items-end mb-6 gap-4 flex-wrap">
        <div>
          <div className="kicker">Catalog</div>
          <h1 className="t-h1 font-display mt-1.5 text-base-900">Product &amp; Maintenance</h1>
          <p className="t-small text-base-600 mt-1">
            Manage the SKU master, modular models, combos, and delivery / add-on config.
          </p>
        </div>
        <PillTabs tabs={TABS} active={tab} onChange={setTab} ariaLabel="Product &amp; Maintenance" />
      </div>

      {catalogQ.isLoading && (
        <div className="t-small text-base-500">Loading catalog…</div>
      )}
      {catalogQ.isError && !catalogQ.isLoading && (
        <div className="t-small text-danger">
          Failed to load the catalog. Try refreshing — your session may have expired.
        </div>
      )}

      {catalogQ.data && (
        <>
          {tab === "sku" && <SkuMasterTab catalog={catalogQ.data} />}
          {tab === "modular" && <ModularTab catalog={catalogQ.data} isPrincipal={isPrincipal} />}
          {tab === "special" && (
            <SpecialAddonsTab catalog={catalogQ.data} isPrincipal={isPrincipal} />
          )}
          {tab === "fabrics" && (
            <FabricsTab catalog={catalogQ.data} isPrincipal={isPrincipal} />
          )}
          {tab === "maintenance" && (
            <MaintenanceTab catalog={catalogQ.data} isPrincipal={isPrincipal} />
          )}
          {tab === "combos" && (
            <CombosTab catalog={catalogQ.data} isPrincipal={isPrincipal} />
          )}
          {tab === "promo" && (
            <PromoTab catalog={catalogQ.data} isPrincipal={isPrincipal} />
          )}
        </>
      )}
    </div>
  );
}
