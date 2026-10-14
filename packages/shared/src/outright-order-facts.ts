/**
 * The Outright list's owner facts, as the server answers them on
 * GET /api/operation/orders/register-facts (`owned`). Each fact is read from
 * its owner's own record; the server's `failed` flags say which reads failed,
 * so a screen can tell "nobody recorded it" from "this read did not work".
 */
import type { DeliveryHandoverKind } from "./delivery-order-status";

export type OutrightOrderFacts = {
  /** null = no PIC recorded. `name: null` = a PIC whose name this caller may not read. */
  pic: { userId: string; name: string | null } | null;
  /** The order's POs (by lineage) and the Supplier DO numbers recorded on them. */
  poCount: number;
  supplierDos: string[];
  grns: string[];
  /** The customer leg's scheduled day, by Delivery's own ladder. */
  delivery: {
    dateIso: string | null;
    time: string | null;
    source: "document" | "arrangement" | "booking" | null;
    partnerId: string | null;
    partnerName: string | null;
  };
  /** The newest handover record on the customer leg's live DO; `hasDo` false = no live DO. */
  loading: { hasDo: boolean; kind: DeliveryHandoverKind | null; at: string | null };
  /** Warehouse names holding the order's reserved Units. */
  locations: string[];
  /** The reason on the order's newest OPEN Finance exception; null = none open. */
  financeHold: { reason: string } | null;
  /**
   * The supplier of each order line (keyed by order line id), by the line's own
   * lineage (Orders MASTER, Order Route PURCHASING and STOCK; never SKU matching,
   * never the Catalog): `po` = the non-cancelled POs that source the line
   * (`po_line_sources.order_line_id`); `unit` = else the Units bound to the line
   * (`ops_stock_items.reserved_order_line_id`), named by each Unit's own PO;
   * `none` = neither holds a supplier record (supplier provenance only: not a
   * statement about PO existence or stock coverage — counted warehouse goods have
   * none). A `null` name is a supplier this caller may not read; an empty list is a
   * PO or Unit that records no supplier. Absent from a server that does not read it yet.
   */
  lineSuppliers?: Record<string, { from: "po" | "unit" | "none"; names: (string | null)[] }>;
};

export type OutrightFactsFailed = {
  pic: boolean;
  purchasing: boolean;
  delivery: boolean;
  loading: boolean;
  location: boolean;
  finance: boolean;
  /** The line suppliers' reads (PO lineage, bound Units, their POs, supplier names). */
  suppliers?: boolean;
};
