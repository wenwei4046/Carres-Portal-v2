import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isPurchasingCategory,
  type PurchasingCategory,
  type PurchasingDestination,
  type PurchasingProductionDays,
  type PurchasingSettingChange,
  type PurchasingSettings,
  type PurchasingSupplierCollection,
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
}> {
  const { data, error } = await sb
    .from("purchasing_settings")
    .select("order_by_buffer_days, earliest_sell_days, logistics_call_working_days, po_days")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(`purchasing_settings: ${error.message}`);
  if (!data) throw new Error("purchasing_settings row 1 missing");
  const row = data as SettingsRow;
  const numbers = {
    orderByBufferDays: Number(row.order_by_buffer_days),
    earliestSellDays: Number(row.earliest_sell_days),
    logisticsCallWorkingDays: Number(row.logistics_call_working_days),
    poDays: (row.po_days ?? []).map(Number),
  };
  // A row that is not a row (a shape change, a partial select) must SAY so.
  // Letting a NaN through would plan every order against a nonsense date and
  // look exactly like a working page.
  for (const [k, v] of Object.entries(numbers)) {
    if (Array.isArray(v)) continue;
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

  const [skusR, suppliersR, prodR, weekR, destR, changesR] = await Promise.all([
    sb
      .from("product_skus")
      .select("supplier_id, product_models!inner(category)")
      .not("supplier_id", "is", null),
    sb.from("suppliers").select("id, name"),
    sb.from("purchasing_production_days").select("supplier_id, category, working_days"),
    // P4 (0307) — the collection rule rides on the SAME row as the work week,
    // so it costs no extra round trip. `off_days` and `fixed_destination_id`
    // are two facts about one supplier, not two tables.
    sb
      .from("purchasing_supplier_settings")
      .select("supplier_id, off_days, fixed_destination_id, collected_by_partner_id"),
    // `warehouses(address)` is embedded, not joined by hand: a destination
    // linked to one of our own warehouses carries NO address of its own (a DB
    // CHECK forbids it) and derives one from the warehouse record. Reading
    // only the destination's own column would show `Address not set` against
    // `Carres Klang`, which 0307 exists to make impossible.
    sb
      .from("purchasing_destinations")
      .select("id, name, address, warehouse_id, is_default, warehouses(address)")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    sb
      .from("purchasing_setting_changes")
      .select("setting_key, supplier_id, category, old_value, new_value, changed_at, changed_by")
      .order("changed_at", { ascending: false })
      .limit(400),
  ]);
  for (const r of [skusR, suppliersR, prodR, weekR, destR, changesR]) {
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

  const offDaysBySupplier = new Map<string, number[]>();
  const supplierCollection: PurchasingSupplierCollection[] = [];
  for (const row of (weekR.data ?? []) as Array<Record<string, unknown>>) {
    offDaysBySupplier.set(
      row.supplier_id as string,
      ((row.off_days as number[] | null) ?? []).map(Number),
    );
    // Only suppliers that actually carry a rule. A row exists for every
    // supplier whose work week was ever set, and listing those as "collected
    // by nobody, delivering nowhere" would read as a rule somebody made.
    const fixedDestinationId = (row.fixed_destination_id as string | null) ?? null;
    const collectedByPartnerId = (row.collected_by_partner_id as string | null) ?? null;
    if (fixedDestinationId || collectedByPartnerId) {
      supplierCollection.push({
        supplierId: row.supplier_id as string,
        fixedDestinationId,
        collectedByPartnerId,
      });
    }
  }

  const destinations: PurchasingDestination[] = [];
  for (const row of (destR.data ?? []) as Array<Record<string, unknown>>) {
    const linkedToWarehouse = (row.warehouse_id as string | null) != null;
    // PostgREST returns an embedded to-one as either an object or a
    // single-element array depending on how it resolves the relationship.
    const wh = row.warehouses as { address?: string | null } | { address?: string | null }[] | null;
    const whAddress = (Array.isArray(wh) ? wh[0] : wh)?.address ?? null;
    destinations.push({
      id: row.id as string,
      name: (row.name as string | null) ?? "",
      address: linkedToWarehouse ? whAddress : ((row.address as string | null) ?? null),
      linkedToWarehouse,
      isDefault: Boolean(row.is_default),
    });
  }

  const nameById = new Map<string, string>();
  for (const row of (suppliersR.data ?? []) as Array<Record<string, unknown>>) {
    nameById.set(row.id as string, (row.name as string | null) ?? "");
  }

  const suppliers: PurchasingSupplierRow[] = [...catsBySupplier.entries()]
    .map(([id, cats]) => ({
      id,
      name: nameById.get(id) ?? "",
      categories: [...cats].sort(),
      offDays: offDaysBySupplier.get(id) ?? null,
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

  return { ...numbers, suppliers, productionDays, destinations, supplierCollection, lastChanges };
}
