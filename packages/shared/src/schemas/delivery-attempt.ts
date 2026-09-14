import { z } from "zod";
import { DELIVERY_REASON_KEYS } from "../delivery-reasons";

/**
 * SO V2 CARD 5 (0344) — Delivery Attempt + Delivery Exception.
 *
 * Every vehicle run for an order is one attempt. This schema is the wire for
 * the PARTIAL / FAILED door (`delivery_attempt_record`); a FULL success walks
 * the existing gated delivery door, which mints its own 'delivered' attempt.
 *
 * The exception's reason comes from the T4 Reason Library — never a second
 * word list. `whereGoods` answers question 2 of the four; questions 3 and 4
 * (what is still owed · who does what next) are DERIVED, never stored.
 */

export const DELIVERY_ATTEMPT_WHERE_GOODS = [
  "returned_to_warehouse",
  "still_with_logistics",
  "with_customer",
] as const;
export type DeliveryAttemptWhereGoods =
  (typeof DELIVERY_ATTEMPT_WHERE_GOODS)[number];

export const deliveryAttemptReturnSchema = z.object({
  itemId: z.string().uuid(),
  /** Which Card 2 door the unit walks: release → Available, or the
   *  customer-return inspection hold (0341). */
  action: z.enum(["back_to_pool", "inspection_hold"]),
  note: z.string().trim().max(500).nullish(),
});

export const deliveryAttemptRecordInputSchema = z
  .object({
    /** 0491 — `delivered` is admitted only for an INTERMEDIATE Journey leg: the
     *  goods reached the named warehouse. The customer leg's success still
     *  walks the delivery door. */
    result: z.enum(["partial", "failed", "delivered"]),
    reasonKey: z.enum(DELIVERY_REASON_KEYS).nullish(),
    whereGoods: z.enum(DELIVERY_ATTEMPT_WHERE_GOODS).nullish(),
    note: z.string().trim().max(1000).nullish(),
    deliveredItemIds: z.array(z.string().uuid()).max(100).default([]),
    returned: z.array(deliveryAttemptReturnSchema).max(100).default([]),
    /** 0491 — the Delivery scope: 0 the whole order, 1..n a Journey leg. */
    leg: z.number().int().min(0).max(20).default(0),
  })
  .superRefine((v, ctx) => {
    if (v.result === "delivered") {
      if (v.leg === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["result"],
          message: "A full success walks the delivery door — only a Journey leg records its arrival here",
        });
      }
      if (v.deliveredItemIds.length > 0 || v.returned.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deliveredItemIds"],
          message: "A leg arrival moves no Unit",
        });
      }
      return;
    }
    if (!v.reasonKey) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reasonKey"], message: "A non-completed attempt states its reason" });
    }
    if (!v.whereGoods) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["whereGoods"], message: "A non-completed attempt states where the goods are" });
    }
    if (v.result === "partial" && v.deliveredItemIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deliveredItemIds"],
        message: "A partial attempt names at least one delivered unit",
      });
    }
    if (v.result === "failed" && v.deliveredItemIds.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deliveredItemIds"],
        message: "A failed attempt delivered nothing — record partial instead",
      });
    }
  });
export type DeliveryAttemptRecordInput = z.infer<
  typeof deliveryAttemptRecordInputSchema
>;

/** One attempt as the API returns it (snake_case DB shape). */
export interface DeliveryAttemptRow {
  id: string;
  order_id: string;
  attempt_no: number;
  result: "delivered" | "partial" | "failed";
  reason_key: string | null;
  where_goods: DeliveryAttemptWhereGoods | null;
  note: string | null;
  do_number: string | null;
  logistics_name: string | null;
  scheduled_date: string | null;
  recorded_by: string | null;
  recorded_at: string;
  /** 0491 — the scope the result belongs to (absent on older readers = 0). */
  leg?: number;
}

export interface DeliveryAttemptUnitRow {
  attempt_id: string;
  item_id: string;
  outcome: "delivered" | "returned_to_pool" | "inspection_hold";
}
