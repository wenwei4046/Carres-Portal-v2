import { z } from "zod";
import type { OrderPaymentRow } from "./schemas/order-payments";

export const paymentRegisterQuery = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

export interface PaymentRegisterRow extends OrderPaymentRow {
  recorded_by_name?: string | null;
  orders: { id: string; so: number; customer_name: string } | null;
  payment_allocations: Array<{
    id: string; order_id: string; amount: number; allocated_at: string;
    voided_at: string | null;
  }>;
}

export interface PaymentRegisterPage {
  rows: PaymentRegisterRow[];
  total: number;
}
