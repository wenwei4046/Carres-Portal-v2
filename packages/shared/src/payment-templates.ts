import { z } from "zod";

/**
 * The WhatsApp template library contract (payment/MASTER.md §16 · 0435).
 *
 * A template body carries protected merge fields as `{field}`. Rendering
 * substitutes the structured facts; a field with no fact stays visibly
 * unfilled rather than silently vanishing — a message must never quietly
 * lose its amount or reference.
 */
export const PAYMENT_TEMPLATE_PURPOSES = [
  "standard_bank_transfer",
  "gentle_reminder",
  "should_have_been_received",
  "customer_promised",
  "standard_payment_link",
  "new_link_after_expiry",
  "payment_received",
  "partial_payment_received",
] as const;
export type PaymentTemplatePurpose = (typeof PAYMENT_TEMPLATE_PURPOSES)[number];

/** The governed §16 purpose words, exactly. */
export const PAYMENT_TEMPLATE_PURPOSE_WORD: Record<PaymentTemplatePurpose, string> = {
  standard_bank_transfer: "Standard bank transfer",
  gentle_reminder: "Gentle reminder",
  should_have_been_received: "Payment should have been received",
  customer_promised: "Customer promised to pay",
  standard_payment_link: "Standard payment link",
  new_link_after_expiry: "New link after expiry",
  payment_received: "Payment received",
  partial_payment_received: "Partial payment received",
};

export interface PaymentTemplateRow {
  id: string;
  template_key: string;
  purpose: PaymentTemplatePurpose;
  name: string;
  body: string;
  version: number;
  active: boolean;
  is_default: boolean;
  is_head: boolean;
  created_at: string;
}

export const paymentTemplateSaveInput = z.object({
  templateKey: z.string().uuid().nullish(),
  purpose: z.enum(PAYMENT_TEMPLATE_PURPOSES),
  name: z.string().trim().min(1, "The template name is required.").max(80),
  body: z.string().trim().min(1, "The template wording is required.").max(4000),
});

export const paymentTemplateKeyInput = z.object({
  templateKey: z.string().uuid(),
});

export const paymentTemplateActiveInput = z.object({
  templateKey: z.string().uuid(),
  active: z.boolean(),
});

/** Substitute `{field}` merge fields with structured facts. Unknown fields
 *  stay visible as `{field}` — never silently dropped. */
export function renderPaymentTemplate(
  body: string,
  facts: Record<string, string | null | undefined>,
): string {
  return body.replace(/\{([a-z_]+)\}/g, (whole, key: string) => {
    const value = facts[key];
    return value == null || value === "" ? whole : value;
  });
}

/** The recommended purpose from structured facts: the shared clock's answer
 *  decides — a due balance gets the gentle reminder; a late one gets
 *  `Payment should have been received`. */
export function recommendedTemplatePurpose(
  timing: "due" | "late",
): PaymentTemplatePurpose {
  return timing === "late" ? "should_have_been_received" : "gentle_reminder";
}
