import { type Context } from "hono";
import { SignJWT, jwtVerify } from "jose";
import {
  STAFF_TOKEN_HEADER,
  STAFF_TOKEN_TTL_SECONDS,
  staffTokenPayloadSchema,
  type StaffTokenPayload,
} from "@carres/shared";
import { adminClient } from "./supabase";
import type { AppEnv, Bindings } from "../types";

/**
 * 0232 staff PIN login — the per-request STAFF identity token.
 *
 * A store logs in once with email+password (unchanged). After a 6-digit PIN
 * verifies, the API mints a short-lived HS256 token (secret `STAFF_SESSION_SECRET`,
 * 12 h) carrying the staff row id + dealer + outlet + tier. The client echoes it
 * back on every call via the `X-Staff-Token` header; the orders routes read it to
 * scope reads + stamp `salesperson_id`. The token is a workflow/accountability
 * credential, not an anti-hacker boundary — RLS (JWT dealer scope) remains the
 * real security wall, so a missing/forged token degrades to today's behaviour.
 */

function secretKey(env: Bindings): Uint8Array {
  return new TextEncoder().encode(env.STAFF_SESSION_SECRET);
}

/** Sign a staff session token (HS256, 12 h). */
export async function mintStaffToken(env: Bindings, payload: StaffTokenPayload): Promise<string> {
  if (!env.STAFF_SESSION_SECRET) {
    throw new Error("STAFF_SESSION_SECRET not configured");
  }
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sid: payload.sid,
    did: payload.did,
    oid: payload.oid,
    tier: payload.tier,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + STAFF_TOKEN_TTL_SECONDS)
    .sign(secretKey(env));
}

/**
 * Read + verify the staff token off the request. Returns the payload only when
 * (a) the header is present, (b) the HS256 signature + expiry check out, (c) the
 * payload matches the zod contract, and (d) `did` equals the caller's JWT dealer
 * — a token minted for another store is treated as absent. Any failure → null
 * (the caller decides 403-vs-passthrough from the store's activation state).
 */
export async function getStaffContext(c: Context<AppEnv>): Promise<StaffTokenPayload | null> {
  const raw = c.req.header(STAFF_TOKEN_HEADER);
  if (!raw) return null;
  const auth = c.var.auth;
  if (!auth?.dealerId || !c.env.STAFF_SESSION_SECRET) return null;
  try {
    const { payload } = await jwtVerify(raw, secretKey(c.env), { algorithms: ["HS256"] });
    const parsed = staffTokenPayloadSchema.safeParse(payload);
    if (!parsed.success) return null;
    if (parsed.data.did !== auth.dealerId) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * True once ANY staff of this store has a PIN — this flips the login gate on.
 * Reads the deny-all `salesperson_pins` ledger via `adminClient` (service_role;
 * only the DEFINER PIN fns + this EXISTS probe touch that table). Fail-open:
 * a read error → false (dormant / today's behaviour), consistent with the PIN
 * being a workflow gate, not a security boundary.
 */
export async function isStoreActivated(env: Bindings, dealerId: string): Promise<boolean> {
  try {
    const admin = adminClient(env);
    const { data, error } = await admin
      .from("salesperson_pins")
      .select("salesperson_id, salespersons!inner(dealer_id)")
      .eq("salespersons.dealer_id", dealerId)
      .limit(1);
    if (error) return false;
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}
