import { z } from "zod";

/**
 * Phase 4.5 Chunk 1 — Logistics Partner (LP) account creation input.
 *
 * Used by `POST /api/principal/partners` to atomically create a new LP:
 *   1. `delivery_partners` row (companyName, contactNumber, address)
 *   2. `auth.users` row via service_role admin.createUser
 *   3. `app_users` row with role='partner' + partner_id linking to (1)
 *
 * Field semantics (per Phase 4.5 design §6.x):
 *   - `companyName` → delivery_partners.name
 *   - `contactNumber` → delivery_partners.contact (combined with address by route)
 *   - `address` → folded into delivery_partners.contact for now (no dedicated
 *     `address` column in delivery_partners; future migration may split)
 *   - `password` → seeded via auth.admin.createUser; LP can change later
 */
export const createLpAccountSchema = z.object({
  companyName: z.string().min(2).max(120),
  contactNumber: z.string().min(7).max(30),
  address: z.string().min(5).max(500),
  password: z.string().min(8).max(72),
});
export type CreateLpAccountInput = z.infer<typeof createLpAccountSchema>;
