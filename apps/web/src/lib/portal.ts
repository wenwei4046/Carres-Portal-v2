import type { Role } from "@carres/shared/domain";

/**
 * POS / ERP portal split (Loo 2026-07-18, mirroring the 2990s apps/pos +
 * apps/backend shape at the DOMAIN level):
 *
 *   pos.carresofficial.com — retail door: dealer / showroom / bd
 *                            (+ legacy salesperson email logins — they live in
 *                            the same DealerApp surface as dealers).
 *   erp.carresofficial.com — everything internal: principal / operation /
 *                            finance / supplier / partner.
 *
 * Detection is by HOSTNAME at runtime — one build artifact serves both Pages
 * projects, so the two portals can never drift. `*.pages.dev` and localhost
 * stay UNGATED ("all"): they are the legacy/preview/dev doors, and gating
 * them before the custom domains exist would strand users mid-cutover.
 */
export type Portal = "pos" | "erp" | "all";

export const POS_ROLES: ReadonlyArray<Role> = ["dealer", "salesperson", "showroom", "bd"];

export const PORTAL_URLS = {
  pos: "https://pos.carresofficial.com",
  erp: "https://erp.carresofficial.com",
} as const;

export function detectPortal(hostname: string = window.location.hostname): Portal {
  const host = hostname.toLowerCase();
  if (host === "pos.carresofficial.com") return "pos";
  if (host === "erp.carresofficial.com") return "erp";
  return "all";
}

/** Which portal a role BELONGS to (used to point mis-doored users home). */
export function portalForRole(role: Role): "pos" | "erp" {
  return POS_ROLES.includes(role) ? "pos" : "erp";
}

/** May this role use the app on this portal? */
export function roleAllowedOnPortal(role: Role, portal: Portal = detectPortal()): boolean {
  if (portal === "all") return true;
  return portalForRole(role) === portal;
}
