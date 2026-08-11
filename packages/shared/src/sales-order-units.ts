import { normalizeSkuKey } from "./sku-code";

export interface SalesOrderUnitRow {
  id: string;
  unit_code: string | null;
  sku: string;
  status: string;
  condition: string;
  reserved_ref: string | null;
  warehouse_id: string;
  po_no: string | null;
  needs_repair: boolean;
}

export interface SalesOrderUnitBundle {
  so: number;
  lines: Array<{ sku: string; qty: number }>;
  units: SalesOrderUnitRow[];
  events: Array<Record<string, unknown>>;
}

export function resolveSalesOrderUnits(bundle: SalesOrderUnitBundle) {
  const ref = `SO-${bundle.so}`;
  const needed = new Set(bundle.lines.map((line) => normalizeSkuKey(line.sku)).filter(Boolean));
  return {
    so: bundle.so,
    allocated: bundle.units.filter((unit) => unit.reserved_ref === ref),
    offered: bundle.units.filter(
      (unit) => unit.status === "free" && !unit.needs_repair && needed.has(normalizeSkuKey(unit.sku)),
    ),
    events: bundle.events,
  };
}
