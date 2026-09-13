/**
 * THE CUSTOMER CONTACT RECORD — Delivery MASTER §5.1 (owner ruling 2026-09-13).
 *
 * Every contact names its purpose; never `Contact Customer` or `Follow Up`.
 * A record stores purpose, contact owner, channel, person contacted, actual
 * time, result, reply evidence, recorder, proxy provenance and the explicit
 * next action. **Silence is never a result** — `Waiting for customer reply`
 * appears only when a record carries that result, and a sent, copied or
 * opened message is never reply evidence.
 *
 * The words live here once (COPY-STANDARD); 0487 checks the same keys.
 */

import { z } from "zod";

export const DELIVERY_CONTACT_PURPOSES = [
  { key: "confirm_delivery_date", label: "Confirm Delivery Date" },
  { key: "confirm_delivery_time", label: "Confirm Delivery Time" },
  { key: "confirm_customer_availability", label: "Confirm Customer Availability" },
  { key: "confirm_delivery_address", label: "Confirm Delivery Address" },
  { key: "confirm_site_access", label: "Confirm Site Access" },
  { key: "confirm_receiver", label: "Confirm Receiver" },
  { key: "obtain_missing_information", label: "Obtain Missing Information" },
  {
    key: "confirm_new_delivery_date_after_failed_delivery",
    label: "Confirm New Delivery Date after Failed Delivery",
  },
  { key: "confirm_new_delivery_date", label: "Confirm New Delivery Date" },
  { key: "confirm_cancellation", label: "Confirm Cancellation" },
] as const;
export type DeliveryContactPurposeKey = (typeof DELIVERY_CONTACT_PURPOSES)[number]["key"];
export const DELIVERY_CONTACT_PURPOSE_KEYS = DELIVERY_CONTACT_PURPOSES.map((p) => p.key) as [
  DeliveryContactPurposeKey,
  ...DeliveryContactPurposeKey[],
];

export const DELIVERY_CONTACT_RESULTS = [
  { key: "confirmed", label: "Confirmed" },
  { key: "no_answer", label: "No Answer" },
  { key: "asked_to_call_again", label: "Asked to Call Again" },
  { key: "requested_another_date", label: "Requested Another Date" },
  { key: "contact_details_incorrect", label: "Contact Details Incorrect" },
  { key: "customer_refused_delivery", label: "Customer Refused Delivery" },
  { key: "waiting_for_customer_reply", label: "Waiting for Customer Reply" },
] as const;
export type DeliveryContactResultKey = (typeof DELIVERY_CONTACT_RESULTS)[number]["key"];
export const DELIVERY_CONTACT_RESULT_KEYS = DELIVERY_CONTACT_RESULTS.map((r) => r.key) as [
  DeliveryContactResultKey,
  ...DeliveryContactResultKey[],
];

export const DELIVERY_CONTACT_CHANNELS = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "call", label: "Call" },
  { key: "in_person", label: "In person" },
  { key: "email", label: "Email" },
] as const;
export type DeliveryContactChannelKey = (typeof DELIVERY_CONTACT_CHANNELS)[number]["key"];
export const DELIVERY_CONTACT_CHANNEL_KEYS = DELIVERY_CONTACT_CHANNELS.map((c) => c.key) as [
  DeliveryContactChannelKey,
  ...DeliveryContactChannelKey[],
];

export function deliveryContactPurposeLabel(key: string | null | undefined): string | null {
  return DELIVERY_CONTACT_PURPOSES.find((p) => p.key === key)?.label ?? null;
}
export function deliveryContactResultLabel(key: string | null | undefined): string | null {
  return DELIVERY_CONTACT_RESULTS.find((r) => r.key === key)?.label ?? null;
}

/**
 * `Information received from` (Delivery Dates edit state, §8.6): the partner,
 * the customer, or Operation on behalf of the partner. It decides who the
 * contact record says was contacted and whether Operation stood proxy.
 */
export const INFORMATION_RECEIVED_FROM = ["partner", "customer", "operation_on_behalf"] as const;
export type InformationReceivedFrom = (typeof INFORMATION_RECEIVED_FROM)[number];

/** The one contact door's input — POST …/contacts, or riding the save. */
export const deliveryContactInputSchema = z.object({
  purpose: z.enum(DELIVERY_CONTACT_PURPOSE_KEYS),
  channel: z.enum(DELIVERY_CONTACT_CHANNEL_KEYS),
  contactedPerson: z.enum(["customer", "partner"]),
  result: z.enum(DELIVERY_CONTACT_RESULT_KEYS),
  /** Storage path of the ACTUAL reply — never a sent/copied message. */
  replyEvidencePath: z.string().trim().max(400).nullish(),
  nextAction: z.string().trim().max(500).nullish(),
  note: z.string().trim().max(2000).nullish(),
  /** Operation recording on behalf of a partner names it. */
  onBehalfOfPartnerId: z.string().uuid().nullish(),
});
export type DeliveryContactInput = z.infer<typeof deliveryContactInputSchema>;

/** One row as the Worker returns it. */
export interface DeliveryContactRow {
  id: string;
  order_id: string;
  leg: number;
  purpose_key: DeliveryContactPurposeKey;
  channel: DeliveryContactChannelKey;
  contacted_person: "customer" | "partner";
  /** 0499 — the NORMAL responsible Operation person (an individual), resolved by the database. */
  contact_owner_user_id: string | null;
  /** 0499 — who acts today: the delivery_duty cover on the normal person, else the normal person. */
  acting_user_id?: string | null;
  /** 0499 — how the owner was resolved. */
  owner_basis?: "collection_owner" | "established_contact" | "delivery_duty" | "recorder" | "unresolved" | null;
  contacted_at: string;
  result_key: DeliveryContactResultKey;
  reply_evidence_path: string | null;
  next_action: string | null;
  note: string | null;
  on_behalf_of_partner_id: string | null;
  recorded_by: string | null;
  recorded_at: string;
}

/** The latest contact on a scope — what the status ladder reads. */
export function latestDeliveryContactOf<T extends { contacted_at: string }>(
  contacts: readonly T[],
): T | null {
  return [...contacts].sort((a, b) => b.contacted_at.localeCompare(a.contacted_at))[0] ?? null;
}

/**
 * ⭐ THE LATER-DATE RULE (§8.6): when the new confirmed day is later than the
 * customer's `Requested Delivery Date`, Operation must have contacted the
 * customer and the save must carry the customer's WhatsApp reply. A day that
 * is not later needs no proof. Pure — the door and the form both ask it.
 */
export function laterThanRequested(
  confirmedDate: string | null | undefined,
  requestedDate: string | null | undefined,
): boolean {
  return Boolean(confirmedDate && requestedDate && confirmedDate > requestedDate);
}
