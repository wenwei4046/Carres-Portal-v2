-- 0734 · An order carries the carrier Delivery assigned (SO-1372, 29 Oct 2026)
--
-- Delivery's Assign logistics saves ops_delivery_arrangements (leg 0). The
-- Sales Order drawer, the invoice page and the DO mint read
-- orders.ops_assigned_logistic, which stayed empty, so they said "Logistics not
-- assigned" next to a Monitor that named Carres Lorries. The API now mirrors
-- every new assignment; this fills the orders assigned before that.
-- Only fills an EMPTY column, never replaces a carrier.

update public.orders o
   set ops_assigned_logistic = a.partner_id
  from public.ops_delivery_arrangements a
 where a.order_id = o.id
   and a.leg = 0
   and a.partner_id is not null
   and o.ops_assigned_logistic is null
   and o.delivery_partner_id is null;

-- REVERSAL: none needed; the column was empty and the arrangement still holds the partner.
