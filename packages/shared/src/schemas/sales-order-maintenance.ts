import { z } from "zod";

// ===========================================================================
// Sales Order Maintenance — AutoCount-style configurable SO grid (2026-06-16)
// ---------------------------------------------------------------------------
// One row per order_line (order header fields repeated per line). Rows are
// READ-ONLY in the UI; the "maintenance" is over the COLUMN format + option
// lists, persisted server-side and SHARED for all internal users.
//
// The column universe (`SO_GRID_COLUMNS`) lives in code; the DB only stores
// per-column overrides (visible / order / width / label) + curated option
// lists (`config.options[key]`). Option lists are display/filter aids only —
// they NEVER mutate a DB enum.
// ===========================================================================

export const SO_GRID_COLUMN_TYPES = [
  "text",
  "number",
  "money",
  "date",
  "datetime",
  "bool",
  "option",
] as const;
export type SoGridColumnType = (typeof SO_GRID_COLUMN_TYPES)[number];

export const SO_GRID_COLUMN_SOURCES = ["order", "line", "resolved"] as const;
export type SoGridColumnSource = (typeof SO_GRID_COLUMN_SOURCES)[number];

export const SO_GRID_COLUMN_GROUPS = [
  "Order",
  "Customer",
  "Item",
  "Delivery",
  "Payment",
  "Operation",
  "Meta",
] as const;
export type SoGridColumnGroup = (typeof SO_GRID_COLUMN_GROUPS)[number];

export interface SoGridColumnDef {
  /** Stable key — matches the field key the API emits on each grid row. */
  key: string;
  /** Default display label (overridable per-config via `label`). */
  label: string;
  group: SoGridColumnGroup;
  type: SoGridColumnType;
  source: SoGridColumnSource;
  defaultVisible: boolean;
  defaultWidth: number;
  align?: "left" | "right";
  /** option columns carry a curatable value list in `config.options[key]`. */
  option?: boolean;
}

// ---------------------------------------------------------------------------
// The catalog. ~46 columns; ~19 visible by default. Order here = default order.
// ---------------------------------------------------------------------------
export const SO_GRID_COLUMNS: SoGridColumnDef[] = [
  // --- Order -------------------------------------------------------------
  { key: "so", label: "Doc No.", group: "Order", type: "text", source: "order", defaultVisible: true, defaultWidth: 110 },
  { key: "source_ref", label: "Ref.", group: "Order", type: "text", source: "order", defaultVisible: true, defaultWidth: 120 },
  { key: "placed_at", label: "SO Date", group: "Order", type: "date", source: "order", defaultVisible: true, defaultWidth: 110 },
  { key: "status", label: "Status", group: "Order", type: "option", source: "order", defaultVisible: true, defaultWidth: 110, option: true },
  { key: "channel", label: "Channel", group: "Order", type: "option", source: "order", defaultVisible: false, defaultWidth: 100, option: true },
  { key: "source_system", label: "Source", group: "Order", type: "option", source: "order", defaultVisible: false, defaultWidth: 100, option: true },

  // --- Customer ----------------------------------------------------------
  { key: "customer_name", label: "Debtor Name", group: "Customer", type: "text", source: "order", defaultVisible: true, defaultWidth: 180 },
  { key: "customer_phone", label: "Phone", group: "Customer", type: "text", source: "order", defaultVisible: true, defaultWidth: 130 },
  { key: "dealer_name", label: "Dealer", group: "Customer", type: "option", source: "resolved", defaultVisible: true, defaultWidth: 150, option: true },
  { key: "salesperson_name", label: "Agent", group: "Customer", type: "option", source: "resolved", defaultVisible: true, defaultWidth: 120, option: true },
  { key: "outlet_name", label: "Outlet", group: "Customer", type: "text", source: "resolved", defaultVisible: false, defaultWidth: 140 },
  { key: "customer_address", label: "Delivery Address", group: "Customer", type: "text", source: "order", defaultVisible: false, defaultWidth: 220 },
  { key: "customer_billing", label: "Billing Address", group: "Customer", type: "text", source: "order", defaultVisible: false, defaultWidth: 200 },
  { key: "customer_emergency", label: "Emergency Contact", group: "Customer", type: "text", source: "order", defaultVisible: false, defaultWidth: 150 },

  // --- Item (line) -------------------------------------------------------
  { key: "sku", label: "Item Code", group: "Item", type: "text", source: "line", defaultVisible: true, defaultWidth: 150 },
  { key: "product_name", label: "Product", group: "Item", type: "text", source: "resolved", defaultVisible: true, defaultWidth: 220 },
  { key: "item_group", label: "Item Group", group: "Item", type: "option", source: "resolved", defaultVisible: true, defaultWidth: 120, option: true },
  { key: "attrs", label: "Description 2", group: "Item", type: "text", source: "line", defaultVisible: false, defaultWidth: 180 },
  { key: "qty", label: "Qty", group: "Item", type: "number", source: "line", defaultVisible: true, defaultWidth: 70, align: "right" },
  { key: "unit_price", label: "Unit Price", group: "Item", type: "money", source: "line", defaultVisible: true, defaultWidth: 110, align: "right" },
  { key: "line_total", label: "Line Total", group: "Item", type: "money", source: "line", defaultVisible: true, defaultWidth: 120, align: "right" },
  { key: "source_po", label: "PO Doc No.", group: "Item", type: "text", source: "line", defaultVisible: false, defaultWidth: 130 },

  // --- Delivery ----------------------------------------------------------
  { key: "delivery_date", label: "Delivery Date", group: "Delivery", type: "date", source: "order", defaultVisible: true, defaultWidth: 120 },
  { key: "proceed_date", label: "Proceed Date", group: "Delivery", type: "date", source: "order", defaultVisible: false, defaultWidth: 120 },
  { key: "delivery_date_tbd", label: "Date TBD", group: "Delivery", type: "bool", source: "order", defaultVisible: false, defaultWidth: 90 },
  { key: "warehouse_name", label: "Location", group: "Delivery", type: "option", source: "resolved", defaultVisible: true, defaultWidth: 130, option: true },
  { key: "delivery_floor", label: "Floor", group: "Delivery", type: "number", source: "order", defaultVisible: false, defaultWidth: 70, align: "right" },
  { key: "delivery_has_lift", label: "Has Lift", group: "Delivery", type: "bool", source: "order", defaultVisible: false, defaultWidth: 80 },
  { key: "delivery_stair_items", label: "Stair Items", group: "Delivery", type: "number", source: "order", defaultVisible: false, defaultWidth: 90, align: "right" },
  { key: "delivery_partner_name", label: "Delivery Partner", group: "Delivery", type: "option", source: "resolved", defaultVisible: false, defaultWidth: 150, option: true },
  { key: "partner_eta", label: "Partner ETA", group: "Delivery", type: "text", source: "order", defaultVisible: false, defaultWidth: 120 },
  { key: "do_number", label: "DO No.", group: "Delivery", type: "text", source: "order", defaultVisible: false, defaultWidth: 120 },

  // --- Payment -----------------------------------------------------------
  { key: "paid", label: "Paid", group: "Payment", type: "money", source: "order", defaultVisible: true, defaultWidth: 110, align: "right" },
  { key: "payment_method", label: "Payment Method", group: "Payment", type: "option", source: "order", defaultVisible: false, defaultWidth: 130, option: true },
  { key: "approval_code", label: "Approval Code", group: "Payment", type: "text", source: "order", defaultVisible: false, defaultWidth: 130 },
  { key: "installment_months", label: "Installment", group: "Payment", type: "number", source: "order", defaultVisible: false, defaultWidth: 100, align: "right" },

  // --- Operation ---------------------------------------------------------
  { key: "operation_stage", label: "Operation Stage", group: "Operation", type: "option", source: "order", defaultVisible: true, defaultWidth: 140, option: true },
  { key: "partner_stage", label: "Partner Stage", group: "Operation", type: "option", source: "order", defaultVisible: false, defaultWidth: 130, option: true },
  { key: "dispatched_at", label: "Dispatched", group: "Operation", type: "datetime", source: "order", defaultVisible: false, defaultWidth: 150 },
  { key: "delivered_at", label: "Delivered", group: "Operation", type: "datetime", source: "order", defaultVisible: false, defaultWidth: 150 },
  { key: "invoice_no", label: "Invoice No.", group: "Operation", type: "text", source: "order", defaultVisible: false, defaultWidth: 130 },
  { key: "invoiced_at", label: "Invoiced", group: "Operation", type: "date", source: "order", defaultVisible: false, defaultWidth: 120 },

  // --- Meta --------------------------------------------------------------
  { key: "terms_accepted", label: "Terms Accepted", group: "Meta", type: "bool", source: "order", defaultVisible: false, defaultWidth: 90 },
  { key: "items_edited", label: "Items Edited", group: "Meta", type: "bool", source: "order", defaultVisible: false, defaultWidth: 100 },
  { key: "created_at", label: "Created", group: "Meta", type: "datetime", source: "order", defaultVisible: false, defaultWidth: 150 },
  { key: "updated_at", label: "Updated", group: "Meta", type: "datetime", source: "order", defaultVisible: false, defaultWidth: 150 },
];

/** All catalog keys, in default order. */
export const SO_GRID_COLUMN_KEYS: string[] = SO_GRID_COLUMNS.map((c) => c.key);

/** Keys of `option`-type columns (those with curatable value lists). */
export const SO_GRID_OPTION_KEYS: string[] = SO_GRID_COLUMNS.filter(
  (c) => c.option,
).map((c) => c.key);

const COLUMN_BY_KEY: Record<string, SoGridColumnDef> = Object.fromEntries(
  SO_GRID_COLUMNS.map((c) => [c.key, c]),
);
export function soGridColumnDef(key: string): SoGridColumnDef | undefined {
  return COLUMN_BY_KEY[key];
}

// ---------------------------------------------------------------------------
// Config (shared, persisted) — per-column overrides + option lists.
// ---------------------------------------------------------------------------
export const soGridColumnConfigSchema = z
  .object({
    key: z.string().min(1),
    visible: z.boolean(),
    order: z.number().int().min(0),
    width: z.number().int().min(48).max(800),
    /** Optional per-config label override (falls back to catalog label). */
    label: z.string().min(1).max(60).optional(),
  })
  .strict();
export type SoGridColumnConfig = z.infer<typeof soGridColumnConfigSchema>;

export const soGridConfigSchema = z
  .object({
    columns: z.array(soGridColumnConfigSchema),
    /** columnKey -> curated option values (filter / data-entry choices). */
    options: z.record(z.array(z.string())),
  })
  .strict();
export type SoGridConfig = z.infer<typeof soGridConfigSchema>;

/** PUT /config request body. */
export const updateSoGridConfigSchema = soGridConfigSchema;
export type UpdateSoGridConfigInput = SoGridConfig;

// ---------------------------------------------------------------------------
// Grid rows + response.
// ---------------------------------------------------------------------------
export const soGridCellValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
export type SoGridCellValue = z.infer<typeof soGridCellValueSchema>;

/** One flattened order×line row. `rowId` = `${orderId}:${lineId}`. Column
 *  values are scalar and keyed by catalog column key (catchall). */
export const soGridRowSchema = z
  .object({
    rowId: z.string(),
    orderId: z.string().uuid(),
    lineId: z.string(),
  })
  .catchall(soGridCellValueSchema);
export type SoGridRow = z.infer<typeof soGridRowSchema>;

export const soGridResponseSchema = z
  .object({
    rows: z.array(soGridRowSchema),
    config: soGridConfigSchema,
    generatedAt: z.string(),
  })
  .strict();
export type SoGridResponse = z.infer<typeof soGridResponseSchema>;

// ---------------------------------------------------------------------------
// Config helpers (shared by API + web so defaults never drift).
// ---------------------------------------------------------------------------
/** Fresh config from the catalog defaults (every column, default order). */
export function defaultSoGridConfig(): SoGridConfig {
  return {
    columns: SO_GRID_COLUMNS.map((c, i) => ({
      key: c.key,
      visible: c.defaultVisible,
      order: i,
      width: c.defaultWidth,
    })),
    options: {},
  };
}

/**
 * Merge a stored (possibly partial / stale) config with the live catalog so
 * that: new catalog columns appear (appended after stored ones), columns no
 * longer in the catalog are dropped, and stored ordering/visibility/width win
 * for known keys. Order indices are re-normalized 0..n-1.
 */
export function mergeSoGridConfig(
  stored: Partial<SoGridConfig> | null | undefined,
): SoGridConfig {
  const base = defaultSoGridConfig();
  const options = stored?.options ?? {};
  if (!stored?.columns?.length) return { columns: base.columns, options };

  const storedByKey = new Map(stored.columns.map((c) => [c.key, c]));
  // Keep only catalog-valid keys; layer stored overrides on the catalog base.
  const known = base.columns.map((b) => {
    const s = storedByKey.get(b.key);
    return s
      ? {
          key: b.key,
          visible: s.visible,
          order: s.order,
          width: s.width,
          ...(s.label ? { label: s.label } : {}),
        }
      : b;
  });
  known.sort((a, b) => a.order - b.order);
  known.forEach((c, i) => {
    c.order = i;
  });
  return { columns: known, options };
}
