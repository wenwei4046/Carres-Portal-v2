import { useState } from "react";
import { useCatalog } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { PillTabs, type PillTab } from "./components/PillTabs";
import SkuMasterTab from "./tabs/SkuMasterTab";
import ModularTab from "./modular/ModularTab";
import MaintenanceTab from "./tabs/MaintenanceTab";
import SofaCombosTab from "./tabs/SofaCombosTab";
import SpecialAddonsTab from "./tabs/SpecialAddonsTab";
import FabricsTab from "./tabs/FabricsTab";
import DeliveryTab from "./tabs/DeliveryTab";
import PromoTab from "./tabs/PromoTab";

/**
 * Product & Maintenance — the rebuilt Catalog page (0169-0173). Replaces the
 * old single-page `OperationCatalog`. Tabs:
 *
 *   • SKU Master  — flat product table (code · description · name · category ·
 *                   size · price · status), filter + search + Edit Prices.
 *   • Modular     — model cards grouped by category; photo, allowed-options,
 *                   per-size SKU ON/OFF (pos_active), Generate SKUs.
 *   • Delivery    — trip fee + special delivery rules + stair-carry fee (its
 *                   own tab, split out of Maintenance — Loo 2026-07-06).
 *   • Maintenance — option pools (sizes / compartments / supplier categories).
 *   • Sofa Combos — principal-only matched-shape compartment bundles priced per
 *                   seat height (0179). (The old fixed-set "Overall Combo" was
 *                   removed 2026-07-06 — written in error, never used.)
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

type TabKey =
  | "sku"
  | "modular"
  | "special"
  | "fabrics"
  | "delivery"
  | "maintenance"
  | "combos"
  | "promo";

const TABS: readonly PillTab<TabKey>[] = [
  { key: "sku", label: "SKU Master" },
  { key: "modular", label: "Modular" },
  { key: "special", label: "Special Add-ons" },
  { key: "fabrics", label: "Fabrics" },
  { key: "delivery", label: "Delivery" },
  { key: "maintenance", label: "Maintenance" },
  { key: "combos", label: "Sofa Combos" },
  { key: "promo", label: "Promo / GWP" },
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
          {tab === "delivery" && (
            <DeliveryTab catalog={catalogQ.data} isPrincipal={isPrincipal} />
          )}
          {tab === "maintenance" && (
            <MaintenanceTab catalog={catalogQ.data} isPrincipal={isPrincipal} />
          )}
          {tab === "combos" && (
            <SofaCombosTab catalog={catalogQ.data} isPrincipal={isPrincipal} />
          )}
          {tab === "promo" && (
            <PromoTab catalog={catalogQ.data} isPrincipal={isPrincipal} />
          )}
        </>
      )}
    </div>
  );
}
