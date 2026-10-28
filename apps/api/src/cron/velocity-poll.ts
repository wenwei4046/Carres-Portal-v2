import { adminClient } from "../lib/supabase";
import type { Bindings } from "../types";

/**
 * Radius Velocity lorry positions, every 5 minutes (migration 0724).
 * YH (chat, 2026-10-26): Carres lorries use Radius Velocity, the same as Houzs;
 * a port of Houzs backend/src/scm/lib/velocity-poll.ts.
 * Follows Houzs backend/src/scm/lib/velocity-poll.ts:6-12,75-87 per Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs.
 * No tracker is fitted
 * yet, so this does nothing until both Worker secrets are set
 * (`wrangler secret put VELOCITY_REFRESH_TOKEN` / `VELOCITY_CUSTOMER_ID`).
 *
 * Auth (Houzs note, api-docs.velocityfleet.com): POST the refresh token to
 * /oauth2/refresh/ for an access token, then Bearer on every call. Velocity
 * gives live position only, so the stored rows are the history. Errors carry
 * the HTTP status only, never a body: a body could echo the token into logs.
 */
const BASE = "https://www.velocityfleet.com";

export interface VelocityFix { device_id: string; plate: string | null; lat: number; lng: number; recorded_at: string }

type RawDevice = { id?: unknown; vehicle_registration?: unknown; lat?: unknown; lon?: unknown; timestamp?: unknown };

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Velocity live-positions body to fixes. Drops a device with no id, position or time. */
export function parseDevices(body: { devices?: RawDevice[] } | null | undefined): VelocityFix[] {
  const out: VelocityFix[] = [];
  for (const d of body?.devices ?? []) {
    const lat = num(d.lat), lng = num(d.lon), ts = num(d.timestamp);
    const id = d.id == null ? "" : String(d.id);
    if (!id || lat == null || lng == null || ts == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const plate = typeof d.vehicle_registration === "string" && d.vehicle_registration.trim() ? d.vehicle_registration : null;
    out.push({ device_id: id, plate, lat, lng, recorded_at: new Date(ts * 1000).toISOString() });
  }
  return out;
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`velocity ${init.method ?? "GET"} ${path.split("?")[0]} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export async function runVelocityPoll(
  env: Bindings,
): Promise<{ skipped: true } | { devices: number; stored: number; unmatched: string[] }> {
  const refresh = env.VELOCITY_REFRESH_TOKEN;
  const customer = env.VELOCITY_CUSTOMER_ID;
  if (!refresh || !customer) return { skipped: true };

  // ponytail: a fresh access token every run (288/day), as Houzs. Cache it in KV if Velocity complains.
  const form = new FormData();
  form.append("token", refresh);
  const { token } = await call<{ token: string }>("/vapi/v1/accounts/users/oauth2/refresh/", { method: "POST", body: form });
  const body = await call<{ devices?: RawDevice[] }>(
    `/api/mobile/kinesis/device-live-positions/?customer=${encodeURIComponent(customer)}&useUTC`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
  const fixes = parseDevices(body);
  if (fixes.length === 0) return { devices: 0, stored: 0, unmatched: [] };

  // The one SQL door matches device/plate to a Carres lorry, refuses a future
  // time and drops a repeat (lorry, recorded_at).
  const { data, error } = await adminClient(env).rpc("fleet_store_velocity_fixes", { p_fixes: fixes });
  if (error) throw new Error(`fleet_store_velocity_fixes -> ${error.code ?? "error"}`);
  const r = (data ?? {}) as { stored?: number; unmatched?: string[] };
  return { devices: fixes.length, stored: r.stored ?? 0, unmatched: r.unmatched ?? [] };
}
