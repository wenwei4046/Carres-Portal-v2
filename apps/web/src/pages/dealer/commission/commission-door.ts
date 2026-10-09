/**
 * Who sees the POS `Commission` pill (Chew 2026-10-09, Finance · Dealer,
 * 0664): a dealer store login with its store owner's (principal-tier) PIN.
 * The API and the database check the same again.
 */
export const seesCommission = (role: string | null | undefined, tier: string | null | undefined) =>
  role === "dealer" && tier === "principal";
