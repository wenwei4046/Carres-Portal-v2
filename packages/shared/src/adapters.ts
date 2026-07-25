/**
 * Adapters: snake_case DB rows → camelCase domain objects.
 */
import type * as DB from "./db-types";
import type * as D from "./domain";
import type { CreateOrderInput } from "./schemas/orders";
import { parseDefaultFreeGifts } from "./free-gift";
import { parseFreeItemEligible } from "./free-item-campaign";
import { parseBundleComponents, parseBundleSlots } from "./product-bundle";
import { parseRuleTargets } from "./rule-target";

export const dealerFromRow = (r: DB.DealerRow): D.Dealer => ({
  id: r.id,
  name: r.name,
  region: r.region,
  contact: r.contact,
  joinedDate: r.joined_date,
  status: r.status,
  creditLimit: Number(r.credit_limit),
  paymentTerms: r.payment_terms,
  depositBalance: Number(r.deposit_balance),
  channel: r.channel,
});

export const outletFromRow = (r: DB.OutletRow): D.Outlet => ({
  id: r.id,
  dealerId: r.dealer_id,
  name: r.name,
  address: r.address,
});

export const salespersonFromRow = (r: DB.SalespersonRow): D.Salesperson => ({
  id: r.id,
  dealerId: r.dealer_id,
  outletId: r.outlet_id,
  name: r.name,
  phone: r.phone,
  userId: r.user_id,
  // 0233 — tolerate pre-migration rows/mocks; zod re-defaults downstream too
  staffRole: r.staff_role ?? "salesperson",
  color: r.color ?? null,
  active: r.active ?? true,
  // 0241 staff profile
  email: r.email ?? null,
  birthday: r.birthday ?? null,
  gender: r.gender ?? null,
});

export const productModelFromRow = (r: DB.ProductModelRow): D.ProductModel => ({
  id: r.id,
  category: r.category,
  modelKey: r.model_key,
  name: r.name,
  blurb: r.blurb,
  colors: r.colors,
  gaps: r.gaps,
  sofaMode: r.sofa_mode,
  discontinuedAt: r.discontinued_at,
  // 0171 — photo + option pool (default to an empty pool when absent).
  photoUrl: r.photo_url ?? null,
  allowedOptions: r.allowed_options ?? {},
});

export const productSkuFromRow = (r: DB.ProductSkuRow): D.ProductSku => ({
  id: r.id,
  modelId: r.model_id,
  sku: r.sku,
  variant: r.variant,
  variantKind: r.variant_kind,
  price: Number(r.price),
  // 0074 — Postgres numeric arrives as string|number; coalesce to null when
  // the column is NULL (catalog admin's "cost not yet set" state).
  cost: r.cost == null ? null : Number(r.cost),
  // 2026-05-17 — pass through SKU-level supplier ownership.
  supplierId: r.supplier_id,
  discontinuedAt: r.discontinued_at,
  // 0170 — sell-side flag (default true to match the column default when a
  // legacy query didn't select it) + editable description.
  posActive: r.pos_active ?? true,
  description: r.description ?? null,
  // 0178 — nullable link to a sofa compartment type (additive, null on every
  // existing SKU).
  compartmentId: r.compartment_id ?? null,
  // 0186 — principal-only PWP reward price; null stays null (not coerced to 0)
  // so "unset" is distinct from "zero PWP price".
  pwpPrice: r.pwp_price == null ? null : Number(r.pwp_price),
  // 0204 — per-size price map; null column stays null ("nothing authored"),
  // present maps get their numeric values coerced (PostgREST jsonb strings).
  pricesBySize: r.prices_by_size == null ? null : coerceHeightMap(r.prices_by_size),
});

export const sofaFabricFromRow = (r: DB.SofaFabricRow): D.SofaFabric => ({
  id: r.id,
  modelId: r.model_id,
  fabricName: r.fabric_name,
  surcharge: Number(r.surcharge),
  colors: r.colors,
  discontinuedAt: r.discontinued_at,
  // 0176 — default to PRICE_1 if the column is absent on a legacy row fetched
  // before the migration applied (belt-and-suspenders; the DB default also
  // sets PRICE_1 for all pre-existing rows).
  tier: (r.tier ?? "PRICE_1") as D.FabricTier,
});

/**
 * Maps a `fabric_tier_addon_config` row to the camelCase domain shape.
 * Postgres numeric(12,2) columns surface as strings or numbers depending on
 * the PostgREST version; `Number()` normalises both.
 */
export const fabricTierConfigFromRow = (r: DB.FabricTierAddonConfigRow): D.FabricTierConfig => ({
  sofaTier2Delta: Number(r.sofa_tier2_delta),
  sofaTier3Delta: Number(r.sofa_tier3_delta),
});

/**
 * Maps a `model_fabric_tier_overrides` row to the camelCase domain shape.
 * Nullable deltas: `null` means "inherit from global" and must stay null
 * (not coerced to 0) so callers can distinguish "set to zero" from "unset".
 */
export const modelFabricTierOverrideFromRow = (
  r: DB.ModelFabricTierOverrideRow,
): D.ModelFabricTierOverride => ({
  modelId: r.model_id,
  tier2Delta: r.tier2_delta == null ? null : Number(r.tier2_delta),
  tier3Delta: r.tier3_delta == null ? null : Number(r.tier3_delta),
});

export const addonFromRow = (r: DB.AddonRow): D.Addon => ({
  key: r.key,
  name: r.name,
  price: Number(r.price),
  active: r.active,
  // 0172 — link to the Service-category SKU (bare SVC- code).
  serviceSku: r.service_sku ?? null,
  // 0242 — defensive: jsonb is free-form, keep only string entries.
  sizeOptions: Array.isArray(r.size_options)
    ? r.size_options.filter((s): s is string => typeof s === "string" && s.length > 0)
    : null,
});

// 0181 — special add-on (per-model selling surcharge + jsonb option groups).
export const specialAddonFromRow = (r: DB.SpecialAddonRow): D.SpecialAddon => ({
  id: r.id,
  code: r.code,
  label: r.label,
  soDescription: r.so_description ?? "",
  categories: r.categories ?? [],
  sellingPrice: Number(r.selling_price),
  cost: r.cost == null ? null : Number(r.cost),
  optionGroups: (r.option_groups ?? []).map((g) => ({
    label: g.label,
    required: !!g.required,
    choices: (g.choices ?? []).map((c) => ({ label: c.label, extra: Number(c.extra) })),
  })),
  active: r.active,
  sortOrder: r.sort_order,
});

export const floorConfigFromRow = (r: DB.FloorConfigRow): D.FloorConfig => ({
  id: r.id,
  freeUpToFloor: r.free_up_to_floor,
  perFloorPerItem: Number(r.per_floor_per_item),
});

/**
 * Maps a `delivery_fee_config` row to the camelCase domain shape (0184). Fees
 * are Postgres numeric — `Number()` normalises the string|number PostgREST
 * surfaces them as. The singleton `id` is dropped (the domain shape doubles as
 * the pure `computeDeliveryFee` config); `charged_categories` + lead days pass
 * through. Lead days are integers, also `Number()`-coerced for parity.
 */
export const deliveryFeeConfigFromRow = (
  r: DB.DeliveryFeeConfigRow,
): D.DeliveryFeeConfig => ({
  baseFee: Number(r.base_fee),
  crossCategoryFee: Number(r.cross_category_fee),
  chargedCategories: r.charged_categories ?? [],
  mattressBedframeLeadDays: Number(r.mattress_bedframe_lead_days),
  sofaLeadDays: Number(r.sofa_lead_days),
});

/**
 * Maps a `special_delivery_fee_rules` row to the camelCase domain shape (0184).
 * `target` jsonb is cleaned via `parseRuleTargets` (drops malformed entries);
 * fees are Postgres numeric → `Number()`. `label` stays null when unset.
 */
export const specialDeliveryFeeRuleFromRow = (
  r: DB.SpecialDeliveryFeeRuleRow,
): D.SpecialDeliveryFeeRule => ({
  id: r.id,
  target: parseRuleTargets(r.target),
  standaloneFee: Number(r.standalone_fee),
  crossCategoryFollowupFee: Number(r.cross_cat_followup_fee),
  label: r.label ?? null,
  active: r.active,
  sortOrder: Number(r.sort_order),
});

// 0182 — global option pool entry (supplier_category / bedframe_size /
// mattress_size + the 0201 pools). `label` + `dimensions` are nullable (size
// pools only) and stay null; `surcharge` (0201) is Postgres numeric → Number();
// `sort_order` is Postgres integer normalised via Number().
export const catalogOptionPoolFromRow = (r: DB.CatalogOptionPoolRow): D.CatalogOptionPool => ({
  id: r.id,
  pool: r.pool,
  value: r.value,
  label: r.label ?? null,
  dimensions: r.dimensions ?? null,
  surcharge: r.surcharge == null ? null : Number(r.surcharge),
  active: r.active,
  sortOrder: Number(r.sort_order),
});

/** 0201 — catalog_config_history row → domain. `snapshot` entries are stored
 *  camelCase by the RPC/migration; malformed entries are dropped (defensive —
 *  the write path always produces the full shape). */
export const catalogConfigHistoryFromRow = (
  r: DB.CatalogConfigHistoryRow,
): D.CatalogConfigHistory => ({
  id: r.id,
  section: r.section,
  entries: (Array.isArray(r.snapshot) ? r.snapshot : []).flatMap((e) => {
    if (typeof e !== "object" || e === null) return [];
    const o = e as Record<string, unknown>;
    if (typeof o.value !== "string") return [];
    return [
      {
        value: o.value,
        label: typeof o.label === "string" ? o.label : null,
        dimensions: typeof o.dimensions === "string" ? o.dimensions : null,
        surcharge: typeof o.surcharge === "number" ? o.surcharge : null,
        active: typeof o.active === "boolean" ? o.active : true,
        sortOrder: typeof o.sortOrder === "number" ? o.sortOrder : 0,
      },
    ];
  }),
  effectiveFrom: r.effective_from,
  notes: r.notes ?? null,
  createdAt: r.created_at,
});

// 0202 — global procurement fabric master row → domain (2990s fabric_trackings
// port). Tiers default PRICE_2 defensively (matches the DB column default).
export const catalogFabricFromRow = (r: DB.CatalogFabricRow): D.CatalogFabric => ({
  id: r.id,
  fabricCode: r.fabric_code,
  series: r.series ?? null,
  description: r.description ?? null,
  supplierCode: r.supplier_code ?? null,
  sofaTier: (r.sofa_tier ?? "PRICE_2") as D.FabricTier,
  bedframeTier: (r.bedframe_tier ?? "PRICE_2") as D.FabricTier,
  active: r.active,
  sortOrder: Number(r.sort_order),
  cost: r.cost == null ? null : Number(r.cost),
});

const FABRIC_TIERS: readonly D.FabricTier[] = ["PRICE_1", "PRICE_2", "PRICE_3"];

/** 0202 — a section='fabrics' catalog_config_history row → domain. The
 *  snapshot entries are fabric-shaped (camelCase, written by
 *  catalog_fabrics_batch_save); malformed entries are dropped (defensive —
 *  the write path always produces the full shape). */
export const catalogFabricsHistoryFromRow = (
  r: DB.CatalogConfigHistoryRow,
): D.CatalogFabricsHistory => ({
  id: r.id,
  entries: (Array.isArray(r.snapshot) ? r.snapshot : []).flatMap((e) => {
    if (typeof e !== "object" || e === null) return [];
    const o = e as Record<string, unknown>;
    if (typeof o.fabricCode !== "string") return [];
    return [
      {
        fabricCode: o.fabricCode,
        series: typeof o.series === "string" ? o.series : null,
        description: typeof o.description === "string" ? o.description : null,
        supplierCode: typeof o.supplierCode === "string" ? o.supplierCode : null,
        sofaTier: FABRIC_TIERS.includes(o.sofaTier as D.FabricTier)
          ? (o.sofaTier as D.FabricTier)
          : "PRICE_2",
        bedframeTier: FABRIC_TIERS.includes(o.bedframeTier as D.FabricTier)
          ? (o.bedframeTier as D.FabricTier)
          : "PRICE_2",
        active: typeof o.active === "boolean" ? o.active : true,
        sortOrder: typeof o.sortOrder === "number" ? o.sortOrder : 0,
      },
    ];
  }),
  effectiveFrom: r.effective_from,
  notes: r.notes ?? null,
  createdAt: r.created_at,
});

/**
 * Maps a `sofa_compartments` row to the camelCase domain shape (migration 0178).
 * `default_price` is Postgres numeric(12,2) — `Number()` normalises the
 * string|number PostgREST surfaces it as. `seat_count` is nullable and stays
 * null (not coerced to 0) so "unspecified" is distinct from "zero seats".
 */
export const sofaCompartmentFromRow = (r: DB.SofaCompartmentRow): D.SofaCompartment => ({
  id: r.id,
  code: r.code,
  description: r.description ?? null,
  seatCount: r.seat_count == null ? null : Number(r.seat_count),
  armConfig: r.arm_config ?? null,
  iconUrl: r.icon_url ?? null,
  defaultPrice: Number(r.default_price),
  sortOrder: Number(r.sort_order),
  active: r.active,
  // 0205 — nullable per-compartment fabric-tier deltas. null stays null so
  // "no special" is distinct from "special of 0" (mirrors priceOverride below).
  specialTier2Delta: r.special_tier2_delta == null ? null : Number(r.special_tier2_delta),
  specialTier3Delta: r.special_tier3_delta == null ? null : Number(r.special_tier3_delta),
});

/**
 * Maps a `model_sofa_compartments` row to the camelCase domain shape (0178).
 * `price_override` is nullable: `null` means "inherit the pool default_price"
 * and must stay null (not coerced to 0) so callers can distinguish "no override"
 * from "override set to zero".
 */
export const modelSofaCompartmentFromRow = (
  r: DB.ModelSofaCompartmentRow,
): D.ModelSofaCompartment => ({
  modelId: r.model_id,
  compartmentId: r.compartment_id,
  priceOverride: r.price_override == null ? null : Number(r.price_override),
  sortOrder: Number(r.sort_order),
});

/**
 * Maps a `sofa_combo_pricing` row to the camelCase `SofaCombo` (0179).
 * `slots` defaults to `[]` and `prices_by_height` to `{}` when the DB sends
 * null. Every numeric price inside `prices_by_height` is `Number()`-coerced
 * (PostgREST may serialize jsonb numerics as strings) while a `null` price is
 * preserved (null = the combo does not apply at that height).
 */
const coerceHeightMap = (raw: Record<string, number | null> | null | undefined) => {
  const out: Record<string, number | null> = {};
  for (const [height, price] of Object.entries(raw ?? {})) {
    out[height] = price == null ? null : Number(price);
  }
  return out;
};

export const sofaComboFromRow = (r: DB.SofaComboPricingRow): D.SofaCombo => {
  return {
    id: r.id,
    modelId: r.model_id,
    slots: r.slots ?? [],
    tier: (r.tier ?? null) as D.SofaCombo["tier"],
    pricesByHeight: coerceHeightMap(r.prices_by_height),
    // 0183 — cost benchmark; null (column unset) stays null so the UI can tell
    // "no cost authored" from "{}", while present maps coerce numerics.
    costByHeight: r.cost_by_height == null ? null : coerceHeightMap(r.cost_by_height),
    // 0186 — PWP reward price; same null-preserving treatment as costByHeight.
    pwpPricesByHeight:
      r.pwp_prices_by_height == null ? null : coerceHeightMap(r.pwp_prices_by_height),
    label: r.label ?? null,
    effectiveFrom: r.effective_from,
    active: r.active,
    discontinuedAt: r.discontinued_at ?? null,
    // 0206 — Quick Pick preset flag; column is NOT NULL default false.
    isQuickPick: r.is_quick_pick ?? false,
    // 0179 audit timestamps — feed the simple per-combo History view.
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
};

/**
 * Maps a `model_default_free_gifts` row to the camelCase domain shape (0185).
 * `gifts` jsonb is cleaned via `parseDefaultFreeGifts` (drops malformed entries
 * — bad giftSku/qty, and a 'model'-scope condition collapses to no condition).
 */
export const modelDefaultFreeGiftsFromRow = (
  r: DB.ModelDefaultFreeGiftsRow,
): D.ModelDefaultFreeGifts => ({
  modelId: r.model_id,
  gifts: parseDefaultFreeGifts(r.gifts),
});

/**
 * Maps a `free_item_campaigns` row to the camelCase domain shape (0185).
 * `eligible` jsonb is cleaned via `parseFreeItemEligible` (a parseRuleTargets
 * wrapper); `max_free_qty` is Postgres integer → `Number()` (PostgREST may
 * serialize it as a string).
 */
export const freeItemCampaignFromRow = (
  r: DB.FreeItemCampaignRow,
): D.FreeItemCampaign => ({
  id: r.id,
  name: r.name,
  active: r.active,
  maxFreeQty: Number(r.max_free_qty),
  eligible: parseFreeItemEligible(r.eligible),
});

/**
 * Maps a `pwp_rules` row to the camelCase domain shape (0186). `trigger_targets`
 * / `reward_targets` jsonb are cleaned via `parseRuleTargets` (drops malformed
 * entries; `[]` = the whole category — intentional for PWP); `qty_per_trigger`
 * is Postgres integer → `Number()` (PostgREST may serialize it as a string).
 * P8d (0188): `carry_forward` defaults to `true` and `carry_forward_days` to
 * `null` so a pre-0188 row / a test mock that omits them still maps cleanly.
 */
export const pwpRuleFromRow = (r: DB.PwpRuleRow): D.PwpRule => ({
  id: r.id,
  type: r.type,
  triggerCategory: r.trigger_category,
  triggerTargets: parseRuleTargets(r.trigger_targets),
  rewardCategory: r.reward_category,
  rewardTargets: parseRuleTargets(r.reward_targets),
  qtyPerTrigger: Number(r.qty_per_trigger),
  active: r.active,
  // P8d (0188) — carry-forward defaults: a pre-0188 row / mock reads true / null.
  carryForward: r.carry_forward ?? true,
  carryForwardDays: r.carry_forward_days ?? null,
});

/**
 * Maps a `product_bundles` row to the camelCase domain shape (0239).
 * `components` jsonb is cleaned via `parseBundleComponents` (drops malformed
 * entries); `price` / `sort_order` are Postgres numeric/integer → `Number()`
 * (PostgREST may serialize them as strings).
 */
export const productBundleFromRow = (r: DB.ProductBundleRow): D.ProductBundle => ({
  id: r.id,
  name: r.name,
  price: Number(r.price),
  // 0241 — pre-0241 rows / mocks read as the fixed kind with no slots.
  kind: r.kind === "custom" ? "custom" : "fixed",
  components: parseBundleComponents(r.components),
  slots: parseBundleSlots(r.slots),
  active: r.active,
  sortOrder: Number(r.sort_order),
});

/**
 * Maps a `pwp_codes` row to the camelCase domain shape (0187 ledger + 0188 P8d
 * cross-order binding). `reward_targets` jsonb is cleaned via `parseRuleTargets`
 * (drops malformed entries; `[]` = the whole category — the snapshot of the
 * rule's reward scope). All other columns are direct snake→camel. The P8d binding
 * fields (`bound_customer_phone` / `owner_dealer_id` / `expires_at`) default to
 * null so a pre-0188 row / mock maps cleanly. OWNER-SCOPED USE ONLY — this carries
 * `boundCustomerPhone`; cross-order discovery uses `pwpDiscoverFromRow` (stripped,
 * no PII). DORMANT.
 */
export const pwpCodeFromRow = (r: DB.PwpCodeRow): D.PwpCode => ({
  code: r.code,
  ruleId: r.rule_id,
  type: r.type,
  rewardCategory: r.reward_category,
  rewardTargets: parseRuleTargets(r.reward_targets),
  status: r.status,
  ownerStaffId: r.owner_staff_id,
  cartLineKey: r.cart_line_key,
  triggerItemCode: r.trigger_item_code,
  claimGroup: r.claim_group,
  redeemedOrderId: r.redeemed_order_id,
  redeemedItemSku: r.redeemed_item_sku,
  sourceOrderId: r.source_order_id,
  customerId: r.customer_id,
  // P8d (0188) — cross-order carry-forward binding (default null pre-0188).
  boundCustomerPhone: r.bound_customer_phone ?? null,
  ownerDealerId: r.owner_dealer_id ?? null,
  expiresAt: r.expires_at ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/**
 * Maps a `pwp_discover_available` row (0188) to the camelCase domain shape. The
 * STRIPPED projection — NO bound phone / owner / trigger sku / customer id; the
 * phone match is the server-computed `phone_matches` boolean. `reward_targets`
 * jsonb is cleaned via `parseRuleTargets`. This is the ONLY pwp_codes-derived
 * shape a non-owner client ever receives, so it structurally cannot leak PII.
 */
export const pwpDiscoverFromRow = (r: DB.PwpDiscoverRow): D.PwpDiscover => ({
  code: r.code,
  ruleId: r.rule_id,
  type: r.type,
  rewardCategory: r.reward_category,
  rewardTargets: parseRuleTargets(r.reward_targets),
  sourceOrderId: r.source_order_id,
  expiresAt: r.expires_at,
  phoneMatches: r.phone_matches,
  // 0204 — legacy rows (pre-name-binding RPC) default to true (phone-only).
  nameMatches: r.name_matches ?? true,
});

export const warehouseFromRow = (r: DB.WarehouseRow): D.Warehouse => ({
  id: r.id,
  name: r.name,
  address: r.address,
});

export const supplierFromRow = (r: DB.SupplierRow): D.Supplier => ({
  id: r.id,
  name: r.name,
  contact: r.contact,
  leadTime: r.lead_time,
  kind: r.kind,
  catCovered: r.cat_covered,
  slug: r.slug,
});

export const partnerFromRow = (r: DB.DeliveryPartnerRow): D.DeliveryPartner => ({
  id: r.id,
  name: r.name,
  contact: r.contact,
  zones: r.zones,
  onboardedDate: r.onboarded_date,
  rateCard: r.rate_card
    ? Object.fromEntries(
        Object.entries(r.rate_card).map(([k, v]) => [
          k,
          { base: v.base, perFloorWalkUp: v.per_floor_walk_up, perKm: v.per_km },
        ]),
      )
    : null,
});

export const fleetFromRow = (r: DB.PartnerFleetRow): D.PartnerFleet => ({
  id: r.id,
  partnerId: r.partner_id,
  plate: r.plate,
  vehicleType: r.vehicle_type,
  capacity: r.capacity,
  driverName: r.driver_name,
  driverPhone: r.driver_phone,
});

export const stockBalanceFromRow = (r: DB.StockBalanceRow): D.StockBalance => ({
  sku: r.sku,
  warehouseId: r.warehouse_id,
  qty: r.qty,
  reserved: r.reserved,
});

export const stockMovementFromRow = (r: DB.StockMovementRow): D.StockMovement => ({
  id: r.id,
  sku: r.sku,
  warehouseId: r.warehouse_id,
  qty: r.qty,
  kind: r.kind,
  ref: r.ref,
  note: r.note,
  byRole: r.by_role,
  occurredAt: r.occurred_at,
});

export const orderLineFromRow = (r: DB.OrderLineRow): D.OrderLine => ({
  id: r.id,
  orderId: r.order_id,
  sku: r.sku,
  qty: r.qty,
  attrs: r.attrs,
  unitPrice: Number(r.unit_price),
});

export const orderAddonFromRow = (r: DB.OrderAddonRow): D.OrderAddon => ({
  id: r.id,
  orderId: r.order_id,
  addonKey: r.addon_key,
  qty: r.qty,
  unitPrice: Number(r.unit_price),
  attrs: r.attrs ?? null,
});

export const orderHistoryFromRow = (r: DB.OrderHistoryRow): D.OrderHistory => ({
  id: r.id,
  orderId: r.order_id,
  text: r.text,
  byRole: r.by_role,
  occurredAt: r.occurred_at,
});

export const orderFromRow = (
  r: DB.OrderRow,
  rels?: { lines?: DB.OrderLineRow[]; addons?: DB.OrderAddonRow[]; history?: DB.OrderHistoryRow[] },
): D.Order => ({
  id: r.id,
  so: r.so,
  status: r.status,
  channel: r.channel,
  dealerId: r.dealer_id,
  outletId: r.outlet_id,
  salespersonId: r.salesperson_id,
  customer: {
    name: r.customer_name,
    phone: r.customer_phone,
    address: r.customer_address,
    addressUnknown: r.customer_address_unknown,
    billing: r.customer_billing,
    billingSame: r.customer_billing_same,
    emergency: r.customer_emergency,
    // 0200 — `?? null` so pre-migration rows surface as null.
    email: r.customer_email ?? null,
    race: r.customer_race ?? null,
    gender: r.customer_gender ?? null,
    birthday: r.customer_birthday ?? null,
    // 0230 — structured MY address parts (`?? null` for pre-0230 rows).
    addressLine1: r.customer_address_line1 ?? null,
    addressLine2: r.customer_address_line2 ?? null,
    addressState: r.customer_address_state ?? null,
    addressCity: r.customer_address_city ?? null,
    addressPostcode: r.customer_address_postcode ?? null,
  },
  delivery: {
    date: r.delivery_date,
    // Phase 11.1 — `?? null` so rows fetched before migration 0165 (which added
    // the column) surface as null rather than tripping zod's nullable check.
    proceedDate: r.proceed_date ?? null,
    dateTbd: r.delivery_date_tbd,
    floor: r.delivery_floor,
    hasLift: r.delivery_has_lift,
    stairItems: r.delivery_stair_items ?? null,
  },
  paid: Number(r.paid),
  // `?? null` so an old DB row missing this column reads as null rather than
  // tripping zod's nullable check downstream. Migration 0005 added the column
  // but legacy rows from before the migration still surface as undefined.
  signatureUrl: r.signature_url ?? null,
  paymentSlipUrl: r.payment_slip_url ?? null,
  termsAccepted: r.terms_accepted,
  // 0007 added payment_method/approval_code/installment_months. Pre-0007 rows
  // surface as undefined → null here so zod nullable enums stay happy.
  paymentMethod: r.payment_method ?? null,
  // 0219 — POS entry extras (payment follow-ups e.g. bank + custom fields).
  entryData: r.entry_data ?? null,
  approvalCode: r.approval_code ?? null,
  installmentMonths: r.installment_months ?? null,
  operationStage: r.operation_stage,
  // 0132 import marker. `?? null` keeps pre-0132 rows adapting cleanly.
  sourceSystem: r.source_system ?? null,
  warehouseId: r.warehouse_id,
  deliveryPartnerId: r.delivery_partner_id,
  partnerStage: r.partner_stage,
  partnerPickedAt: r.partner_picked_at,
  partnerEta: r.partner_eta,
  doNumber: r.do_number,
  doNote: r.do_note,
  // 0019 migration columns. `?? null` so pre-0019 rows still adapt cleanly.
  dispatchedAt: r.dispatched_at ?? null,
  deliveredAt: r.delivered_at ?? null,
  invoiceNo: r.invoice_no,
  invoicedAt: r.invoiced_at,
  placedAt: r.placed_at,
  lines: rels?.lines?.map(orderLineFromRow),
  addons: rels?.addons?.map(orderAddonFromRow),
  history: rels?.history?.map(orderHistoryFromRow),
});

export const orderSupplierThreadFromRow = (
  r: DB.OrderSupplierThreadRow,
): D.OrderSupplierThread => ({
  id: r.id,
  orderId: r.order_id,
  supplierId: r.supplier_id,
  category: r.category,
  sopName: r.sop_name,
  operationStage: r.operation_stage,
  poId: r.po_id,
  warehouseId: r.warehouse_id,
  reservedAt: r.reserved_at,
  deliveredAt: r.delivered_at,
  // Phase 4.5 Chunk 2 customer-leg LP fields (migration 0049). Per-leg split
  // per Chunk 2 design spec §3 (CQ1 = option (b)). Procurement-leg LP stays
  // on `purchase_orders.delivery_partner_id` (renamed in Sprint C 0052).
  deliveryPartnerId: r.delivery_partner_id,
  confirmDeliveryDate: r.confirm_delivery_date,
  requestForDeliveryAt: r.request_for_delivery_at,
  partnerAcceptedAt: r.partner_accepted_at,
  partnerRejectedAt: r.partner_rejected_at,
  // Supplier per-thread pickup feature (migration 0107). `?? null` keeps the
  // adapter safe against rows fetched before the migration shipped.
  supplierReadyAt: r.supplier_ready_at ?? null,
  supplierReadyBy: r.supplier_ready_by ?? null,
  pickupEventId: r.pickup_event_id ?? null,
  history: r.history,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const purchaseOrderLineFromRow = (
  r: DB.PurchaseOrderLineRow,
): D.PurchaseOrderLine => ({
  poId: r.po_id,
  sku: r.sku,
  qty: r.qty,
  receivedQty: r.received_qty,
  // Migration 0055 (Phase 4.5 Chunk 2 Sprint E). `cost` is numeric(14,2) so
  // PostgREST may surface it as either string or number depending on driver
  // settings; coerce via Number() but preserve null for legacy rows. `?? null`
  // keeps the adapter safe against rows fetched before the migration shipped.
  cost: r.cost === null || r.cost === undefined ? null : Number(r.cost),
  costSource: r.cost_source ?? null,
});

export const purchaseOrderFromRow = (
  r: DB.PurchaseOrderRow,
  rels?: { lines?: DB.PurchaseOrderLineRow[] },
): D.PurchaseOrder => ({
  id: r.id,
  so: r.so,
  soRefs: r.so_refs,
  supplierId: r.supplier_id,
  warehouseId: r.warehouse_id,
  status: r.status,
  supStatus: r.sup_status,
  // Procurement-leg LP — renamed from `delivery_partner_id` in Phase 4.5 Chunk 2
  // Sprint C migration 0052. Customer-leg LP fields previously on the PO
  // (confirm_delivery_date / request_for_delivery_at / partner_accepted_at /
  // partner_rejected_at) were dropped by 0052 — they live on
  // `order_supplier_threads` and surface via `orderSupplierThreadFromRow`.
  procurementPartnerId: r.procurement_partner_id,
  expectedReadyDate: r.expected_ready_date,
  pickupDate: r.pickup_date,
  etaDate: r.eta_date,
  payStatus: r.pay_status,
  placedAt: r.placed_at,
  lines: rels?.lines?.map(purchaseOrderLineFromRow),
});

export const paymentFromRow = (r: DB.PaymentRow): D.Payment => ({
  id: r.id,
  direction: r.direction,
  amount: Number(r.amount),
  method: r.method,
  reference: r.reference,
  note: r.note,
  paidAt: r.paid_at,
  orderId: r.order_id,
  poId: r.po_id,
  refundId: r.refund_id,
  receiptUrl: r.receipt_url,
});

export const invoiceFromRow = (r: DB.InvoiceRow): D.Invoice => ({
  id: r.id,
  invoiceNo: r.invoice_no,
  orderId: r.order_id,
  amount: Number(r.amount),
  taxAmount: Number(r.tax_amount),
  issuedAt: r.issued_at,
  voidedAt: r.voided_at,
  pdfUrl: r.pdf_url,
});

export const refundFromRow = (r: DB.RefundRow): D.Refund => ({
  id: r.id,
  orderId: r.order_id,
  dealerId: r.dealer_id,
  amount: Number(r.amount),
  reason: r.reason,
  status: r.status,
  approvalId: r.approval_id,
  approvedAt: r.approved_at,
  paidAt: r.paid_at,
  creditNoteNo: r.credit_note_no,
});

export const approvalFromRow = (r: DB.ApprovalRow): D.Approval => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  actor: r.actor,
  refersTo: r.refers_to,
  amount: r.amount === null ? null : Number(r.amount),
  dealerId: r.dealer_id,
  reason: r.reason,
  payload: r.payload,
  status: r.status,
  decidedAt: r.decided_at,
  decisionNote: r.decision_note,
  createdAt: r.created_at,
});

export const auditFromRow = (r: DB.AuditLogRow): D.AuditEntry => ({
  id: r.id,
  role: r.role,
  actorText: r.actor_text,
  action: r.action,
  dealerId: r.dealer_id,
  ref: r.ref,
  occurredAt: r.occurred_at,
});

/** 0231/0233 — change-request row → DTO (P3 submission/approval flow). */
export const orderChangeRequestFromRow = (r: DB.OrderChangeRequestRow): D.OrderChangeRequest => ({
  id: r.id,
  orderId: r.order_id,
  kind: r.kind as "add_lines",
  payload: (r.payload ?? { lines: [] }) as { lines: Array<Record<string, unknown>> },
  status: r.status as D.OrderChangeRequest["status"],
  requestedBy: r.requested_by,
  requestedAt: r.requested_at,
  decidedBy: r.decided_by,
  decidedAt: r.decided_at,
  decisionNote: r.decision_note,
  appliedAt: r.applied_at,
});

/**
 * orderInputToRpcPayload — converts the camelCase CreateOrderInput from the
 * web wizard into the snake_case jsonb shape that `public.create_order(jsonb)`
 * expects. Stays a pure function so it's testable without a Supabase client.
 *
 * `dealerId` is added by the API layer from the verified JWT — the input
 * schema deliberately doesn't include it (cross-dealer posts are forbidden).
 */
export const orderInputToRpcPayload = (
  input: CreateOrderInput,
  dealerId: string,
): Record<string, unknown> => ({
  dealer_id: dealerId,
  outlet_id: input.outletId,
  salesperson_id: input.salespersonId,
  customer_name: input.customer.name,
  customer_phone: input.customer.phone,
  customer_address: input.customer.addressUnknown ? null : input.customer.address,
  customer_address_unknown: input.customer.addressUnknown,
  // 0230 — structured parts ride with the composed string; an address-unknown
  // order carries none (the wizard wipes them when "fill in later" is on).
  customer_address_line1: input.customer.addressUnknown ? null : (input.customer.addressLine1 ?? null),
  customer_address_line2: input.customer.addressUnknown ? null : (input.customer.addressLine2 ?? null),
  customer_address_state: input.customer.addressUnknown ? null : (input.customer.addressState ?? null),
  customer_address_city: input.customer.addressUnknown ? null : (input.customer.addressCity ?? null),
  customer_address_postcode: input.customer.addressUnknown ? null : (input.customer.addressPostcode ?? null),
  customer_billing: input.customer.billingSame ? null : input.customer.billing,
  customer_billing_same: input.customer.billingSame,
  customer_emergency: input.customer.emergency,
  // 0200 — POS-parity demographics (RPC nullifs '' → null).
  customer_email: input.customer.email ?? null,
  customer_race: input.customer.race ?? null,
  customer_gender: input.customer.gender ?? null,
  customer_birthday: input.customer.birthday ?? null,
  delivery_date: input.delivery.dateTbd ? null : input.delivery.date,
  // Phase 11.1 — proceed date pairs with delivery date; both nulled when TBD.
  proceed_date: input.delivery.dateTbd ? null : input.delivery.proceedDate,
  delivery_date_tbd: input.delivery.dateTbd,
  delivery_floor: input.delivery.floor,
  delivery_has_lift: input.delivery.hasLift,
  delivery_stair_items: input.delivery.stairItems ?? null,
  paid: input.paid,
  signature_url: input.signaturePath,
  payment_slip_url: input.paymentSlipPath,
  terms_accepted: input.termsAccepted,
  payment_method: input.paymentMethod,
  approval_code: input.approvalCode,
  installment_months: input.installmentMonths,
  // 0219 — POS entry extras. OMIT the key entirely when absent: sending
  // `entry_data: null` lands in Postgres as jsonb 'null' (which is NOT SQL
  // NULL — `payload->'entry_data' IS NOT NULL` is TRUE for it), tripping
  // create_order's `entry_data must be a json object` guard on every
  // no-extras order (Loo hit this 2026-07-14 on an installment order whose
  // follow-ups carry no text answers). An absent key reads as SQL NULL →
  // guard skipped → column stores NULL, the pre-0219 payload shape.
  ...(input.entryData != null ? { entry_data: input.entryData } : {}),
  lines: input.lines.map((l) => ({
    sku: l.sku,
    qty: l.qty,
    attrs: l.attrs,
    unit_price: l.unitPrice,
  })),
  addons: input.addons.map((a) => ({
    addon_key: a.addonKey,
    qty: a.qty,
    unit_price: a.unitPrice,
    attrs: a.attrs ?? null,
  })),
  deposit_pct: input.depositPct,
});

export const inquiryFromRow = (r: DB.InquiryRow): D.Inquiry => ({
  id: r.id,
  kind: r.kind,
  company: r.company,
  region: r.region,
  contact: r.contact,
  stage: r.stage,
  ownerUserId: r.owner_user_id,
  note: r.note,
  linkedDealerId: r.linked_dealer_id,
  createdAt: r.created_at,
});

// ---------------------------------------------------------------------------
// Rental + Service Plan base (migrations 0247-0249, 2026-07-25)
// ---------------------------------------------------------------------------

/** Nullable Postgres numeric → number | null (PostgREST may serialize numerics
 *  as strings; null stays null so the UI can tell "unset" from 0). */
const numOrNull = (v: number | null): number | null => (v == null ? null : Number(v));

/** Maps a `customers` row (0247) to the camelCase domain shape. */
export const customerFromRow = (r: DB.CustomerRow): D.Customer => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  phoneKey: r.phone_key,
  email: r.email,
  address: r.address,
  notes: r.notes,
  stripeCustomerId: r.stripe_customer_id ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  createdBy: r.created_by,
});

/**
 * Maps a `service_packages` row (0248) to the camelCase domain shape. `price`
 * is Postgres numeric → `Number()` (PostgREST may serialize it as a string);
 * the integer columns get the same treatment (mirrors freeItemCampaignFromRow).
 */
export const servicePackageFromRow = (r: DB.ServicePackageRow): D.ServicePackage => ({
  id: r.id,
  name: r.name,
  serviceType: r.service_type,
  durationMonths: Number(r.duration_months),
  visitsPerYear: Number(r.visits_per_year),
  price: Number(r.price),
  sku: r.sku,
  active: r.active,
  sortOrder: Number(r.sort_order),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
});

/**
 * Maps a `rental_plans` row (0248) to the camelCase domain shape. The money /
 * rate columns are Postgres numeric → `Number()`.
 */
export const rentalPlanFromRow = (r: DB.RentalPlanRow): D.RentalPlan => ({
  id: r.id,
  sku: r.sku,
  termMonths: Number(r.term_months),
  monthlyFee: Number(r.monthly_fee),
  supplierRatePct: Number(r.supplier_rate_pct),
  commissionBasePct: Number(r.commission_base_pct),
  includedPackageId: r.included_package_id,
  active: r.active,
  stripeProductId: r.stripe_product_id ?? null,
  stripePriceId: r.stripe_price_id ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
});

/**
 * Maps a `rental_plans_pos` VIEW row (0255) — the stripped store-side offer.
 * No split columns by design (CF rental-pos-config-projection).
 */
export const posRentalPlanFromRow = (r: DB.RentalPlanPosRow): D.PosRentalPlan => ({
  id: r.id,
  sku: r.sku,
  termMonths: Number(r.term_months),
  monthlyFee: Number(r.monthly_fee),
  includedPackageId: r.included_package_id,
  packageName: r.package_name,
  packageServiceType: r.package_service_type,
  packageVisitsPerYear: r.package_visits_per_year == null ? null : Number(r.package_visits_per_year),
  stripeReady: !!r.stripe_ready,
});

/**
 * Maps a `rental_agreements` row (0249) to the camelCase domain shape. The
 * snapshot money/rate columns are Postgres numeric → `Number()`;
 * `buyout_amount` is nullable numeric (null preserved).
 */
export const rentalAgreementFromRow = (r: DB.RentalAgreementRow): D.RentalAgreement => ({
  id: r.id,
  agreementNo: r.agreement_no,
  customerId: r.customer_id,
  dealerId: r.dealer_id,
  salespersonId: r.salesperson_id,
  orderId: r.order_id,
  planId: r.plan_id,
  sku: r.sku,
  termMonths: Number(r.term_months),
  monthlyFee: Number(r.monthly_fee),
  supplierRatePct: Number(r.supplier_rate_pct),
  commissionBasePct: Number(r.commission_base_pct),
  startDate: r.start_date,
  status: r.status,
  buyoutAt: r.buyout_at,
  buyoutAmount: numOrNull(r.buyout_amount),
  ownershipTransferAt: r.ownership_transfer_at,
  ownershipDocUrl: r.ownership_doc_url,
  stripeCustomerId: r.stripe_customer_id,
  stripeSubscriptionId: r.stripe_subscription_id,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  createdBy: r.created_by,
});

/**
 * Maps a `rental_billings` row (0249) to the camelCase domain shape. The
 * nullable numerics (`paid_amount` / `supplier_share` / `commission_share`)
 * preserve null (unset ≠ 0).
 */
export const rentalBillingFromRow = (r: DB.RentalBillingRow): D.RentalBilling => ({
  id: r.id,
  agreementId: r.agreement_id,
  seq: Number(r.seq),
  dueDate: r.due_date,
  amountDue: Number(r.amount_due),
  status: r.status,
  paidAt: r.paid_at,
  paidAmount: numOrNull(r.paid_amount),
  method: r.method,
  reference: r.reference,
  supplierShare: numOrNull(r.supplier_share),
  commissionShare: numOrNull(r.commission_share),
  stripeInvoiceId: r.stripe_invoice_id,
  recordedBy: r.recorded_by,
  createdAt: r.created_at,
});

/** Maps a `rental_stock_units` row (0249) to the camelCase domain shape. */
export const rentalStockUnitFromRow = (r: DB.RentalStockUnitRow): D.RentalStockUnit => ({
  id: r.id,
  unitCode: r.unit_code,
  sku: r.sku,
  agreementId: r.agreement_id,
  customerId: r.customer_id,
  status: r.status,
  deployedAt: r.deployed_at,
  returnedAt: r.returned_at,
  warrantyUntil: r.warranty_until,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
});

/** Maps a `service_entitlements` row (0249) to the camelCase domain shape. */
export const serviceEntitlementFromRow = (
  r: DB.ServiceEntitlementRow,
): D.ServiceEntitlement => ({
  id: r.id,
  customerId: r.customer_id,
  packageId: r.package_id,
  source: r.source,
  agreementId: r.agreement_id,
  orderId: r.order_id,
  visitsTotal: Number(r.visits_total),
  visitsUsed: Number(r.visits_used),
  startsOn: r.starts_on,
  expiresOn: r.expires_on,
  status: r.status,
  createdAt: r.created_at,
  createdBy: r.created_by,
});

/** Maps a `service_visits` row (0249) to the camelCase domain shape. */
export const serviceVisitFromRow = (r: DB.ServiceVisitRow): D.ServiceVisit => ({
  id: r.id,
  entitlementId: r.entitlement_id,
  seq: Number(r.seq),
  dueDate: r.due_date,
  scheduledDate: r.scheduled_date,
  partner: r.partner,
  unitId: r.unit_id,
  status: r.status,
  completedAt: r.completed_at,
  completedBy: r.completed_by,
  photoUrl: r.photo_url,
  notes: r.notes,
  createdAt: r.created_at,
});

/** Maps a `rental_unit_events` row (0249) to the camelCase domain shape. */
export const rentalUnitEventFromRow = (r: DB.RentalUnitEventRow): D.RentalUnitEvent => ({
  id: r.id,
  unitId: r.unit_id,
  eventType: r.event_type,
  visitId: r.visit_id,
  description: r.description,
  photoUrl: r.photo_url,
  actor: r.actor,
  occurredAt: r.occurred_at,
});
