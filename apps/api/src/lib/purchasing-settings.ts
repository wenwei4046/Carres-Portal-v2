import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isPurchasingCategory,
  type PurchasingCategory,
  type PurchasingProductionDays,
  type PurchasingSettingChange,
  type PurchasingSettings,
  type PurchasingSupplierRow,
} from "@carres/shared";

/**
 * Load the purchasing settings — card P1 (migration 0303).
 *
 * ONE loader, used by the ordering engine (`/operation/purchase/today`), the
 * Settings screen, the POS's earliest-sell gate and the delivery queues. A
 * second reader would be a second way to spell the same number, which is the
 * whole failure P1 exists to end.
 *
 * There is deliberately NO fallback object. If the read fails the caller gets
 * an error and says so — silently planning on invented numbers is worse than
 * a page that admits it cannot load.
 */

export interface LoadedPurchasingSettings extends Omit<PurchasingSettings, "canEdit"> {}

interface SettingsRow {
  order_by_buffer_days: number;
  earliest_sell_days: number;
  logistics_call_working_days: number;
  po_days: number[];
  /** 0422 — absent until the migration is applied; read as false. */
  manual_purchase_enforce_earliest_date?: boolean | null;
}

/**
 * The single numbers only — the cheap read, for callers that need nothing
 * per-supplier (the POS earliest-sell gate, the delivery queues).
 */
export async function loadPurchasingNumbers(sb: SupabaseClient): Promise<{
  orderByBufferDays: number;
  earliestSellDays: number;
  logisticsCallWorkingDays: number;
  poDays: number[];
  manualPurchaseEnforceEarliestDate: boolean;
}> {
  let { data, error } = await sb
    .from("purchasing_settings")
    .select(
      "order_by_buffer_days, earliest_sell_days, logistics_call_working_days, po_days, manual_purchase_enforce_earliest_date",
    )
    .eq("id", 1)
    .maybeSingle();
  // Pre-0422 schemas reject the select before the optional-field default
  // below can run. Retry only for this specific missing column.
  if (
    error?.code === "42703" &&
    error.message.includes("purchasing_settings.manual_purchase_enforce_earliest_date")
  ) {
    const legacy = await sb
      .from("purchasing_settings")
      .select("order_by_buffer_days, earliest_sell_days, logistics_call_working_days, po_days")
      .eq("id", 1)
      .maybeSingle();
    data = legacy.data ? { ...legacy.data, manual_purchase_enforce_earliest_date: false } : null;
    error = legacy.error;
  }
  if (error) throw new Error(`purchasing_settings: ${error.message}`);
  if (!data) throw new Error("purchasing_settings row 1 missing");
  const row = data as SettingsRow;
  const numbers = {
    orderByBufferDays: Number(row.order_by_buffer_days),
    earliestSellDays: Number(row.earliest_sell_days),
    logisticsCallWorkingDays: Number(row.logistics_call_working_days),
    poDays: (row.po_days ?? []).map(Number),
    /* 0422 — the switch. Only a stored `true` turns the refusal on; a
       missing column (migration not applied yet) reads as off, which is
       exactly the pre-0422 behaviour. */
    manualPurchaseEnforceEarliestDate: row.manual_purchase_enforce_earliest_date === true,
  };
  // A row that is not a row (a shape change, a partial select) must SAY so.
  // Letting a NaN through would plan every order against a nonsense date and
  // look exactly like a working page.
  for (const [k, v] of Object.entries(numbers)) {
    if (Array.isArray(v) || typeof v === "boolean") continue;
    if (!Number.isFinite(v)) throw new Error(`purchasing_settings.${k} is not a number`);
  }
  return numbers;
}

/**
 * Everything the Settings screen and the ordering engine need.
 *
 * `suppliers` carries only the factories that actually own a SKU in a
 * purchasable category — the matrix is derived from the catalog, never drawn
 * as every supplier × every category (live 2026-07-28: three real pairs, and
 * eight suppliers that own nothing).
 */
export async function loadPurchasingSettings(
  sb: SupabaseClient,
): Promise<LoadedPurchasingSettings> {
  const numbers = await loadPurchasingNumbers(sb);

  const [skusR, suppliersR, prodR, weekR, changesR, destinationsR, partnersR] = await Promise.all([
    sb
      .from("product_skus")
      .select("supplier_id, product_models!inner(category)")
      .not("supplier_id", "is", null),
    sb.from("suppliers").select("id, name, kind"),
    sb.from("purchasing_production_days").select("supplier_id, category, working_days"),
    sb
      .from("purchasing_supplier_settings")
      .select("supplier_id, off_days, transit_days, fixed_destination_id, collected_by_partner_id"),
    sb
      .from("purchasing_setting_changes")
      .select("setting_key, supplier_id, category, old_value, new_value, changed_at, changed_by")
      .order("changed_at", { ascending: false })
      .limit(400),
    sb
      .from("purchasing_destinations")
      .select("id, name, address, is_default, active, warehouse_id, warehouses(address)")
      .order("sort_order")
      .order("name"),
    sb.from("delivery_partners").select("id, name").order("name"),
  ]);
  for (const r of [skusR, suppliersR, prodR, weekR, changesR, destinationsR, partnersR]) {
    if (r.error) throw new Error(`purchasing settings: ${r.error.message}`);
  }

  // Which categories each factory actually makes.
  const catsBySupplier = new Map<string, Set<PurchasingCategory>>();
  for (const row of (skusR.data ?? []) as Array<Record<string, unknown>>) {
    const supplierId = row.supplier_id as string | null;
    const pm = row.product_models as { category?: string } | { category?: string }[] | null;
    const cats = pm ? (Array.isArray(pm) ? pm : [pm]) : [];
    if (!supplierId) continue;
    for (const m of cats) {
      const c = m?.category;
      if (!isPurchasingCategory(c)) continue;
      const set = catsBySupplier.get(supplierId) ?? new Set<PurchasingCategory>();
      set.add(c);
      catsBySupplier.set(supplierId, set);
    }
  }

  const transitBySupplier = new Map<string, number>();
  const offDaysBySupplier = new Map<string, number[]>();
  const collectionBySupplier = new Map<
    string,
    { destinationId: string | null; partnerId: string | null }
  >();
  for (const row of (weekR.data ?? []) as Array<Record<string, unknown>>) {
    offDaysBySupplier.set(
      row.supplier_id as string,
      ((row.off_days as number[] | null) ?? []).map(Number),
    );
    // The eighth number. NULL stays null rather than becoming a 0 or a 1 —
    // "nobody has set it" and "it takes no time" are different facts, and only
    // the first one may withhold an arrival date.
    if (row.transit_days != null) {
      transitBySupplier.set(row.supplier_id as string, Number(row.transit_days));
    }
    collectionBySupplier.set(row.supplier_id as string, {
      destinationId: (row.fixed_destination_id as string | null) ?? null,
      partnerId: (row.collected_by_partner_id as string | null) ?? null,
    });
  }

  const nameById = new Map<string, string>();
  const factoryPickupSupplierIds: string[] = [];
  for (const row of (suppliersR.data ?? []) as Array<Record<string, unknown>>) {
    nameById.set(row.id as string, (row.name as string | null) ?? "");
    if (row.kind === "factory_pickup") factoryPickupSupplierIds.push(row.id as string);
  }

  const suppliers: PurchasingSupplierRow[] = [...catsBySupplier.entries()]
    .map(([id, cats]) => ({
      id,
      name: nameById.get(id) ?? "",
      categories: [...cats].sort(),
      offDays: offDaysBySupplier.get(id) ?? null,
      transitDays: transitBySupplier.get(id) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const productionDays: PurchasingProductionDays[] = [];
  for (const row of (prodR.data ?? []) as Array<Record<string, unknown>>) {
    const category = row.category as string;
    if (!isPurchasingCategory(category)) continue;
    productionDays.push({
      supplierId: row.supplier_id as string,
      category,
      workingDays: Number(row.working_days),
    });
  }

  const destinations = ((destinationsR.data ?? []) as Array<Record<string, unknown>>).map(
    (row) => {
      const warehouse = row.warehouses as
        | { address?: string | null }
        | { address?: string | null }[]
        | null;
      const warehouseAddress = Array.isArray(warehouse)
        ? warehouse[0]?.address
        : warehouse?.address;
      return {
        id: row.id as string,
        name: (row.name as string | null) ?? "",
        address:
          row.warehouse_id != null
            ? (warehouseAddress ?? null)
            : ((row.address as string | null) ?? null),
        isDefault: row.is_default === true,
        active: row.active !== false,
        warehouseLinked: row.warehouse_id != null,
      };
    },
  );

  const supplierCollections = factoryPickupSupplierIds
    .map((supplierId) => ({
      supplierId,
      supplierName: nameById.get(supplierId) ?? "",
      destinationId: collectionBySupplier.get(supplierId)?.destinationId ?? null,
      partnerId: collectionBySupplier.get(supplierId)?.partnerId ?? null,
    }))
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName));
  const deliveryPartners = ((partnersR.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    name: (row.name as string | null) ?? "",
  }));

  // The screen shows ONE line per setting — the most recent change. Rows come
  // back newest-first, so the first hit per key wins.
  const seen = new Set<string>();
  const lastChanges: PurchasingSettingChange[] = [];
  for (const row of (changesR.data ?? []) as Array<Record<string, unknown>>) {
    const supplierId = (row.supplier_id as string | null) ?? null;
    const category = (row.category as string | null) ?? null;
    const key = `${row.setting_key as string}::${supplierId ?? ""}::${category ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lastChanges.push({
      settingKey: row.setting_key as string,
      supplierId,
      category,
      oldValue: (row.old_value as string | null) ?? null,
      newValue: (row.new_value as string | null) ?? "",
      changedBy: (row.changed_by as string | null) ?? null,
      changedAt: String(row.changed_at ?? ""),
    });
  }

  // `changedBy` reaches the screen as a NAME — "Jess · 28 Jul 26, Tue" is a
  // fact a human can read; a uuid is not. Resolved over the handful of ids
  // that actually appear, not by joining the whole table.
  const actorIds = [...new Set(lastChanges.map((c) => c.changedBy).filter(Boolean))] as string[];
  if (actorIds.length > 0) {
    const { data: people } = await sb.from("app_users").select("id, name").in("id", actorIds);
    const byId = new Map<string, string>();
    for (const p of (people ?? []) as Array<Record<string, unknown>>) {
      byId.set(p.id as string, ((p.name as string | null) ?? "") || "");
    }
    for (const c of lastChanges) {
      if (c.changedBy) c.changedBy = byId.get(c.changedBy) || null;
    }
  }

  return {
    ...numbers,
    suppliers,
    productionDays,
    destinations,
    supplierCollections,
    deliveryPartners,
    lastChanges,
  };
}
