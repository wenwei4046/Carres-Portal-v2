export interface SalesOrderCopySource {
  order: {
    id: string;
    so: number;
    customer_name?: string | null;
    customer_phone?: string | null;
    customer_email?: string | null;
    customer_address?: string | null;
    customer_address_line1?: string | null;
    customer_address_line2?: string | null;
    customer_address_city?: string | null;
    customer_address_state?: string | null;
    customer_address_postcode?: string | null;
    customer_emergency?: string | null;
    customer_billing?: string | null;
    dealer_id?: string | null;
    outlet_id?: string | null;
    salesperson_id?: string | null;
    delivery_date?: string | null;
    delivery_date_tbd?: boolean;
    proceed_date?: string | null;
    delivery_floor?: number | null;
    delivery_has_lift?: boolean | null;
  };
  lines: Array<{
    id?: string;
    sku: string;
    qty: number;
    unit_price: number | string;
  }>;
}

export interface SalesOrderCopyDraft {
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_address: string;
  customer_address_line1: string;
  customer_address_line2: string;
  customer_address_city: string;
  customer_address_state: string;
  customer_address_postcode: string;
  customer_emergency: string;
  customer_billing: string;
  dealer_id: string | null;
  outlet_id: string | null;
  salesperson_id: string | null;
  delivery_date: null;
  delivery_date_tbd: true;
  proceed_date: null;
  delivery_floor: number;
  delivery_has_lift: boolean;
  lines: Array<{ sku: string; qty: number; unit_price: number }>;
}

/** Copy only draft-safe commercial facts. A new promise gets new dates, and
 * source row ids never cross the transaction boundary. */
export function copySalesOrderDraft(source: SalesOrderCopySource): SalesOrderCopyDraft {
  const { order } = source;
  return {
    customer_name: order.customer_name ?? "",
    customer_phone: order.customer_phone ?? "",
    customer_email: order.customer_email ?? "",
    customer_address: order.customer_address ?? "",
    customer_address_line1: order.customer_address_line1 ?? "",
    customer_address_line2: order.customer_address_line2 ?? "",
    customer_address_city: order.customer_address_city ?? "",
    customer_address_state: order.customer_address_state ?? "",
    customer_address_postcode: order.customer_address_postcode ?? "",
    customer_emergency: order.customer_emergency ?? "",
    customer_billing: order.customer_billing ?? "",
    dealer_id: order.dealer_id ?? null,
    outlet_id: order.outlet_id ?? null,
    salesperson_id: order.salesperson_id ?? null,
    delivery_date: null,
    delivery_date_tbd: true,
    proceed_date: null,
    delivery_floor: order.delivery_floor ?? 1,
    delivery_has_lift: order.delivery_has_lift ?? false,
    lines: source.lines.map((line) => ({
      sku: line.sku,
      qty: line.qty,
      unit_price: Number(line.unit_price),
    })),
  };
}
