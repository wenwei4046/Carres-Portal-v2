/**
 * HR-P2 — duty keys: permissions that follow the POSITION, not the person.
 *
 * Before this file, "who may do X" was three hardcoded email lists. Promote
 * someone, hire someone, or let someone go, and a developer had to edit code
 * and redeploy. Now the grant hangs off `org_positions` (migration 0260) and
 * the Team tab moves it.
 *
 * TRUST MODEL (spec §3 HR-P2 — read before adding a key):
 * duties gate **workflow**, never security. Anything that approves money keeps
 * its role check (`principal` / `hr`); a duty may narrow further but must never
 * replace the role gate. RLS remains the only security boundary. A duty array
 * arriving from the client is therefore a UI convenience — the API re-reads it
 * from `my_org_duties()` before it lets a write through.
 */

/** The whole vocabulary. A 15-person company needs ~5 keys, not a matrix. */
export const DUTY_KEYS = [
  "ops_manager",
  "po_duty_editor",
  "account_creator",
  "finance_approver",
  "roster_editor",
  // K1 (0286) — "Only the COO edits reorder points / reserve levels"
  // (`docs/ready-stock-execution-queue.md`). Seeded to the COO seat ONLY,
  // deliberately narrower than po_duty_editor (which also covers the empty
  // Operation Manager seat). K4's reserve levels reuse this same key.
  "stock_planner",
] as const;
export type DutyKey = (typeof DUTY_KEYS)[number];

export function isDutyKey(v: unknown): v is DutyKey {
  return typeof v === "string" && (DUTY_KEYS as readonly string[]).includes(v);
}

/** `org_duty_holders()` shape: user id → their duties. */
export type DutyHolderMap = Readonly<Record<string, readonly string[]>>;

// ---------------------------------------------------------------------------
// TRANSITION FALLBACK — delete this block one release after 0260 ships
// ---------------------------------------------------------------------------
/**
 * The pre-0260 email hardcodes, kept for ONE daily-surface reason only.
 * `checkDuty` reports `via: "legacy_email"` whenever the legacy list was the
 * ONLY thing that let someone through.
 *
 * ⭐ NO APPROVAL READS THIS (owner ruling 2026-09-18, 0533). Deciding a Manual
 * Purchase is the resolved Purchasing Approver and nobody else; an email list
 * never names an approver. `jess@carres.com` left both lists the same day:
 * she is a `principal` person now and passes every gate below by role, so an
 * email entry for her would only be a second, silent answer to who she is.
 * What remains is the shared `operation@` login's PIC-manager fallback on the
 * Sales Orders Team surface (not an approval) — a named carry-forward.
 */
export const LEGACY_OPS_MANAGER_EMAILS = ["operation@carres.com"] as const;

const LEGACY_EMAILS_BY_DUTY: Partial<Record<DutyKey, readonly string[]>> = {
  ops_manager: LEGACY_OPS_MANAGER_EMAILS,
  // account_creator / finance_approver / roster_editor are NEW in 0260 —
  // nobody held them via email, so they have no fallback to grant.
};
// ---------------------------------------------------------------------------

export type DutyGrantVia = "role" | "duty" | "legacy_email" | "none";
export type DutyGrant = { allowed: boolean; via: DutyGrantVia };

/**
 * The one gate. Resolution order is deliberate: role → duty → legacy email.
 * Preferring `duty` over `legacy_email` when both would pass is what makes the
 * "zero legacy hits this week" signal meaningful.
 *
 * @param duties the caller's duty keys. `undefined`/`null` = "not loaded yet"
 *   (a UI still hydrating) — treated the same as empty, so a slow fetch can
 *   never accidentally GRANT anything.
 */
export function checkDuty(
  key: DutyKey,
  role: string | null | undefined,
  email: string | null | undefined,
  duties?: readonly string[] | null,
): DutyGrant {
  // principal is the standing role gate — never expressed as a duty (0260
  // deliberately grants the Chairman seat nothing, so the audit trail never
  // implies a duty is what authorises him).
  if (role === "principal") return { allowed: true, via: "role" };

  if (duties?.includes(key)) return { allowed: true, via: "duty" };

  const legacy = LEGACY_EMAILS_BY_DUTY[key];
  if (legacy && email && (legacy as readonly string[]).includes(email.toLowerCase())) {
    return { allowed: true, via: "legacy_email" };
  }

  return { allowed: false, via: "none" };
}

/** Convenience: did this grant come from the doomed legacy path? */
export function usedLegacyFallback(grant: DutyGrant): boolean {
  return grant.via === "legacy_email";
}

/**
 * Who may MANUALLY assign / reassign / redistribute PIC and manage the
 * assignment pool. Everyone else sees assignments read-only. One rule, two
 * consumers: the web hides the controls, the API enforces.
 */
export function isOpsManager(
  role: string | null | undefined,
  email: string | null | undefined,
  duties?: readonly string[] | null,
): boolean {
  return checkDuty("ops_manager", role, email, duties).allowed;
}

/**
 * Who may EDIT the PO duty roster — STRICTER than isOpsManager: the shared
 * operation@ login is a manager for daily surfaces, but whoever holds its
 * password must not be able to rewrite the rotation.
 */
export function isPoDutyEditor(
  role: string | null | undefined,
  email: string | null | undefined,
  duties?: readonly string[] | null,
): boolean {
  return checkDuty("po_duty_editor", role, email, duties).allowed;
}

/**
 * Who may SET a reorder point. Jess's locked line is "only the COO edits
 * reorder points / reserve levels", so there is deliberately NO legacy email
 * fallback here: the key is new, the seat that holds it is filled, and a
 * fallback would only widen a gate the business asked to keep narrow.
 * `principal` still passes, as it does on every gate.
 */
export function isStockPlanner(
  role: string | null | undefined,
  email: string | null | undefined,
  duties?: readonly string[] | null,
): boolean {
  return checkDuty("stock_planner", role, email, duties).allowed;
}

/**
 * Per-ROW helper for list surfaces (the assignment-pool filter).
 *
 * `my_org_duties()` is self-only and structurally cannot answer "is THIS OTHER
 * PERSON a manager?" — hence `org_duty_holders()`, whose duties ride each row.
 *
 * Passing `role: null` is the whole point: the row's manager-ness must come
 * from the ROW, never from whoever is looking. Reusing `isOpsManager(authRole,
 * …)` here would make every row look like a manager the moment the Chairman
 * opened the page, silently emptying the assignment pool.
 */
export function isOpsManagerRow(
  email: string | null | undefined,
  duties: readonly string[] | null | undefined,
): boolean {
  return isOpsManager(null, email, duties);
}
