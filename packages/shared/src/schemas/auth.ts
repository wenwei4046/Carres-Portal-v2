import { z } from "zod";

/**
 * Login form payload — sent from apps/web Login page directly to Supabase Auth
 * (browser → Supabase, not through Hono). Hono never sees the password.
 */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginPayload = z.infer<typeof loginSchema>;

/**
 * GET /api/auth/me — Hono route response. Reads role + entity ids from JWT
 * app_metadata (populated by 0004_auth_hook.sql), so no DB query per request.
 */
export const meResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum([
    "principal", "dealer", "salesperson", "showroom",
    "logistics", "supplier", "partner", "finance", "bd",
  ]),
  dealerId: z.string().uuid().nullable(),
  supplierId: z.string().uuid().nullable(),
  partnerId: z.string().uuid().nullable(),
  outletId: z.string().uuid().nullable(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
