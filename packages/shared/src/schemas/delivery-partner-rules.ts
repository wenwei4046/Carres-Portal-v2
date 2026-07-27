import { z } from "zod";

/**
 * T9 · Logistic partner delivery rules (migration 0283) — the wire shapes.
 *
 * The RULE ENGINE lives in `../partner-delivery-rules.ts`; this file only
 * describes what crosses the wire, so the API validates writes and the drawer
 * validates what it renders against ONE definition (§9.5, one schema two
 * consumers).
 *
 * These four facts WARN, they never block — see the engine's header for why.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected yyyy-mm-dd");

/** The four columns, as they ride the partners list + the check response. */
export const partnerDeliveryRulesSchema = z.object({
  /** Weekday numbers the carrier does NOT run, 0=Sun … 6=Sat. The ceiling is 7,
   *  not 6, on purpose: a caller that sends all seven should be told "a carrier
   *  must run on at least one day of the week" (a sentence an operator can act
   *  on), not "array must contain at most 6 elements". The route refuses it
   *  with those words, and the DB CHECK is the backstop. */
  offDays: z.array(z.number().int().min(0).max(6)).max(7),
  blackoutDates: z.array(isoDate).max(200),
  /** null = never recorded (NOT "unlimited" — the rule stays silent). */
  dailyCapacity: z.number().int().min(1).max(999).nullable(),
  /** WORKING days of notice. */
  bookingLeadDays: z.number().int().min(0).max(30),
});
export type PartnerDeliveryRulesWire = z.infer<typeof partnerDeliveryRulesSchema>;

/** PUT /api/operation/partners/:id/delivery-rules — the whole profile every
 *  time. A partial patch would make "cleared the blackout dates" and "did not
 *  mention them" the same request, and clearing a blackout is a real edit. */
export const setPartnerDeliveryRulesInput = partnerDeliveryRulesSchema.strict();
export type SetPartnerDeliveryRulesInput = z.infer<
  typeof setPartnerDeliveryRulesInput
>;

export const partnerBookingWarningSchema = z.object({
  key: z.enum(["off_day", "blackout", "lead_time", "capacity"]),
  /** Ready to render — the server composed it from the same shared engine the
   *  drawer would use, so there is one wording, not two. */
  message: z.string(),
});
export type PartnerBookingWarningWire = z.infer<
  typeof partnerBookingWarningSchema
>;

/** GET /api/operation/orders/:id/booking/partner-check?date=YYYY-MM-DD */
export const partnerBookingCheckResponseSchema = z.object({
  /** null = no logistic assigned yet, so there is nobody to check against. */
  partner: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  rules: partnerDeliveryRulesSchema.nullable(),
  /** Deliveries this partner already has confirmed that day, EXCLUDING this
   *  order. null = not counted (no partner). */
  bookedOnDate: z.number().int().min(0).nullable(),
  warnings: z.array(partnerBookingWarningSchema),
});
export type PartnerBookingCheckResponse = z.infer<
  typeof partnerBookingCheckResponseSchema
>;
