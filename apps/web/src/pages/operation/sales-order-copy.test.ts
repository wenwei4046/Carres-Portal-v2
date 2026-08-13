import { describe, expect, it } from "vitest";
import { copySalesOrderDraft } from "./sales-order-copy";

describe("copySalesOrderDraft", () => {
  it("copies permitted commercial fields without transaction identity or execution dates", () => {
    const draft = copySalesOrderDraft({
      order: {
        id: "source-order",
        so: 1318,
        customer_name: "CARD-1 EVIDENCE",
        customer_phone: "0111111111",
        customer_email: "buyer@example.com",
        customer_address: "1 Test Street",
        customer_address_line1: "1 Test Street",
        customer_address_line2: "Unit 2",
        customer_address_city: "Kuala Lumpur",
        customer_address_state: "Kuala Lumpur",
        customer_address_postcode: "50000",
        customer_emergency: "0120000000",
        customer_billing: "Billing contact",
        dealer_id: "dealer-1",
        outlet_id: "outlet-1",
        salesperson_id: "salesperson-1",
        delivery_date: "2026-08-30",
        delivery_date_tbd: false,
        proceed_date: "2026-08-12",
        delivery_floor: 3,
        delivery_has_lift: true,
      },
      lines: [
        { id: "source-line", sku: "MODEL-C", qty: 2, unit_price: 2799 },
      ],
    });

    expect(draft).toEqual({
      customer_name: "CARD-1 EVIDENCE",
      customer_phone: "0111111111",
      customer_email: "buyer@example.com",
      customer_address: "1 Test Street",
      customer_address_line1: "1 Test Street",
      customer_address_line2: "Unit 2",
      customer_address_city: "Kuala Lumpur",
      customer_address_state: "Kuala Lumpur",
      customer_address_postcode: "50000",
      customer_emergency: "0120000000",
      customer_billing: "Billing contact",
      dealer_id: "dealer-1",
      outlet_id: "outlet-1",
      salesperson_id: "salesperson-1",
      delivery_date: null,
      delivery_date_tbd: true,
      proceed_date: null,
      delivery_floor: 3,
      delivery_has_lift: true,
      lines: [{ sku: "MODEL-C", qty: 2, unit_price: 2799 }],
    });
  });
});
