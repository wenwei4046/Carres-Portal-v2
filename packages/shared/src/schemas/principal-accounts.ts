import { z } from "zod";
import {
  staffBirthdaySchema,
  staffColorSchema,
  staffGenderSchema,
  staffPinSchema,
  staffTierSchema,
} from "./staff";

/**
 * Phase 10 — Principal Accounts admin schemas.
 *
 * Backs `POST /api/principal/accounts` (create) + `POST /api/principal/accounts/:id/disable|enable|reset-password`.
 * All admin actions require service_role (auth.admin.createUser /
 * updateUserById) per CLAUDE.md §4.4 — never expose service_role to the
 * browser; routes are gated to `role='principal'` only.
 *
 * Mirrors `reference/proto/principal-accounts.jsx` field semantics:
 *   - role one of the 9 app_role enum values (principal / dealer /
 *     salesperson / showroom / operation / supplier / partner / finance / bd)
 *   - `companyName` only when role ∈ {dealer, supplier, partner} (creates the
 *     org row first, then app_users links via dealer_id / supplier_id /
 *     partner_id per check constraints in 0041)
 *   - `region` only for dealer role
 *   - `tempPassword` is given to the user offline; we do NOT email it. The
 *     "Email invite link" branch from proto is intentionally NOT implemented
 *     for V1 (needs Supabase email-template config — defer to next phase).
 */
export const APP_ROLES = [
  "principal",
  "dealer",
  "salesperson",
  "showroom",
  "operation",
  "supplier",
  "partner",
  "finance",
  "bd",
  "hr",
  // R6 (0301) — the third-party warehouse files its own receiving.
  "warehouse",
] as const;
export type AppRole = (typeof APP_ROLES)[number];

/**
 * 2026-07-18 (Loo) — standalone `salesperson` LOGINS are retired: floor staff
 * are PIN identities inside a dealer/showroom store (0233), not portal
 * accounts. The role stays in APP_ROLES for legacy display, but the create
 * door no longer offers it.
 */
export const CREATABLE_APP_ROLES = [
  "principal",
  "dealer",
  "showroom",
  "operation",
  "supplier",
  "partner",
  "finance",
  "bd",
  "hr",
  // R6 — `warehouse` is deliberately ABSENT. HR → Team is THE account door for
  // every non-store login (Loo, 2026-07-25), and supplier + partner — the other
  // two external roles — are already minted there. A second door for the same
  // account is how two of them drift.
] as const;
export type CreatableAppRole = (typeof CREATABLE_APP_ROLES)[number];

/**
 * 2026-07-18 (Loo) — the account-create form provisions the store's FIRST
 * staff identity + 6-digit PIN in one go, so a new store is born ACTIVATED
 * (first login lands straight on the PIN screen — no setup wizard).
 * Dealer ladder: principal (Dealer Principal) / manager / salesperson
 * (Sales Person). Showroom ladder caps at manager (labelled Sales Manager;
 * salesperson is labelled Sales Executive) — its principal is Carres.
 */
export const initialStaffInput = z.object({
  name: z.string().trim().min(1).max(120),
  staffRole: staffTierSchema,
  pin: staffPinSchema,
  // 0241 profile parity with the POS Add-staff form (Loo 2026-07-19: the two
  // create doors must collect the SAME data). Optional at the contract level;
  // the CreateAccountModal requires email/birthday/gender in the form.
  email: z.string().trim().toLowerCase().email().max(200).optional(),
  birthday: staffBirthdaySchema.optional(),
  gender: staffGenderSchema.optional(),
  phone: z.string().trim().max(40).optional(),
  color: staffColorSchema.optional(),
});
export type InitialStaffInput = z.infer<typeof initialStaffInput>;

export const createAccountInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email().max(160),
    role: z.enum(CREATABLE_APP_ROLES),
    title: z.string().trim().max(120).optional().nullable(),
    companyName: z.string().trim().max(200).optional(),
    region: z.string().trim().max(80).optional(),
    // 2026-05-22 (Loo) — explicit outlet name for the default outlet seeded
    // alongside the dealer/showroom org. Optional: server falls back to
    // companyName when blank so the simple case ("Outlet = company") keeps
    // working without an extra input.
    outletName: z.string().trim().max(120).optional(),
    // 2026-05-22 (Loo) — dealer address is mandatory on the create-account flow
    // because it surfaces on Sales Order PDFs (the "Sold By" block falls back
    // to dealers.address when no outlet is tied). Supplier/Partner roles don't
    // print to customer-facing docs, so address stays optional for them.
    address: z.string().trim().max(500).optional(),
    // 2026-05-22 (Loo) — Malaysia SSM (Suruhanjaya Syarikat Malaysia)
    // registration number per dealer company. Required for dealer accounts;
    // optional shape here, superRefine below gates on role=dealer.
    ssmCode: z.string().trim().max(40).optional(),
    // 2026-05-22 (Loo) — dealer PIC (Person In Charge) split into name +
    // phone. Both required for dealer accounts; API backfills the legacy
    // `dealers.contact` text column with "name · phone" for read-side
    // backwards compatibility.
    contactName: z.string().trim().max(120).optional(),
    contactPhone: z.string().trim().max(40).optional(),
    tempPassword: z.string().min(8).max(72),
    initialStaff: initialStaffInput.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.initialStaff && v.role !== "dealer" && v.role !== "showroom") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["initialStaff"],
        message: "initialStaff is only for dealer/showroom accounts",
      });
    }
    if (v.role === "showroom" && v.initialStaff?.staffRole === "principal") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["initialStaff", "staffRole"],
        message: "Showroom staff cap at Sales Manager — its principal is Carres",
      });
    }
    if ((v.role === "dealer" || v.role === "showroom" || v.role === "supplier" || v.role === "partner") && !v.companyName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["companyName"],
        message: `companyName is required for role=${v.role}`,
      });
    }
    // 2026-07-19 (Loo) — a showroom is Carres' OWN store, not an external
    // company, so it carries NO SSM / PIC-contact requirements. Its
    // `companyName` field transports the showroom name (e.g. "Carres KL
    // Showroom") and the address stays required for BOTH store kinds — it
    // prints on Sales Order PDFs and seeds the NOT NULL outlets.address.
    const orgLikeDealer = v.role === "dealer" || v.role === "showroom";
    if (orgLikeDealer && (!v.address || v.address.length < 5)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["address"],
        message: `address is required for role=${v.role}`,
      });
    }
    if (v.role === "dealer" && (!v.ssmCode || v.ssmCode.length < 6)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ssmCode"],
        message: `ssmCode is required for role=${v.role}`,
      });
    }
    if (v.role === "dealer" && (!v.contactName || v.contactName.length < 2)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contactName"],
        message: `contactName is required for role=${v.role}`,
      });
    }
    if (v.role === "dealer" && (!v.contactPhone || v.contactPhone.length < 7)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contactPhone"],
        message: `contactPhone is required for role=${v.role}`,
      });
    }
  });
export type CreateAccountInput = z.infer<typeof createAccountInput>;

export const setAccountStatusInput = z.object({
  status: z.enum(["active", "disabled"]),
  reason: z.string().trim().max(500).optional().nullable(),
});
export type SetAccountStatusInput = z.infer<typeof setAccountStatusInput>;

export const resetPasswordInput = z.object({
  tempPassword: z.string().min(8).max(72),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordInput>;
