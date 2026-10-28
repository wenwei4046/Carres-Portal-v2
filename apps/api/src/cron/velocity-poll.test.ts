import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/supabase", () => ({ adminClient: vi.fn(), userClient: vi.fn() }));
import { adminClient } from "../lib/supabase";
import type { Bindings } from "../types";
import { parseDevices, runVelocityPoll } from "./velocity-poll";

/** 0724 (YH 2026-10-26): Radius Velocity, as Houzs. Fakes only: no real token,
 *  customer or Velocity call. Matching and the (lorry, time) dedupe live in
 *  fleet_store_velocity_fixes and are proven in scripts/check-0724-fleet-crew.sql. */
const FAKE = { VELOCITY_REFRESH_TOKEN: "fake-refresh", VELOCITY_CUSTOMER_ID: "999" };
const env = (extra: Partial<Bindings> = {}) => ({ SUPABASE_URL: "x", SUPABASE_SERVICE_ROLE_KEY: "x", ...extra }) as Bindings;
const rpc = vi.fn();
const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(adminClient).mockReturnValue({ rpc } as never);
});
afterEach(() => vi.unstubAllGlobals());

describe("runVelocityPoll", () => {
  it("does nothing while either secret is unset", async () => {
    expect(await runVelocityPoll(env())).toEqual({ skipped: true });
    expect(await runVelocityPoll(env({ VELOCITY_REFRESH_TOKEN: "fake-refresh" }))).toEqual({ skipped: true });
    expect(await runVelocityPoll(env({ VELOCITY_CUSTOMER_ID: "999" }))).toEqual({ skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("trades the refresh token for an access token, then calls with Bearer and stores through the service door", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ token: "fake-access" }))
      .mockResolvedValueOnce(json({ devices: [
        { id: 7, vehicle_registration: "VKA 1234", lat: "3.1", lon: "101.6", timestamp: 1_790_000_000 },
        { id: 8, vehicle_registration: "", lat: 3.2, lon: 101.7, timestamp: 1_790_000_000 },
      ] }));
    rpc.mockResolvedValue({ data: { stored: 1, unmatched: ["8"] }, error: null });

    expect(await runVelocityPoll(env(FAKE))).toEqual({ devices: 2, stored: 1, unmatched: ["8"] });

    const [refreshUrl, refreshInit] = fetchMock.mock.calls[0];
    expect(refreshUrl).toBe("https://www.velocityfleet.com/vapi/v1/accounts/users/oauth2/refresh/");
    expect((refreshInit.body as FormData).get("token")).toBe("fake-refresh");
    const [liveUrl, liveInit] = fetchMock.mock.calls[1];
    expect(liveUrl).toContain("device-live-positions/?customer=999&useUTC");
    expect(liveInit.headers).toEqual({ Authorization: "Bearer fake-access" });
    expect(rpc).toHaveBeenCalledWith("fleet_store_velocity_fixes", {
      p_fixes: [
        { device_id: "7", plate: "VKA 1234", lat: 3.1, lng: 101.6, recorded_at: new Date(1_790_000_000_000).toISOString() },
        { device_id: "8", plate: null, lat: 3.2, lng: 101.7, recorded_at: new Date(1_790_000_000_000).toISOString() },
      ],
    });
  });

  it("names only the HTTP status when Velocity refuses, never the body", async () => {
    fetchMock.mockResolvedValueOnce(new Response("echo fake-refresh", { status: 401 }));
    const err = await runVelocityPoll(env(FAKE)).catch((e: Error) => e);
    expect((err as Error).message).toBe("velocity POST /vapi/v1/accounts/users/oauth2/refresh/ -> 401");
  });
});

describe("parseDevices", () => {
  it("drops a device with no id, no position, no time or off the globe", () => {
    expect(parseDevices({ devices: [
      { lat: 1, lon: 1, timestamp: 1 },
      { id: 1, lat: null, lon: 1, timestamp: 1 },
      { id: 2, lat: 1, lon: 1 },
      { id: 3, lat: 91, lon: 1, timestamp: 1 },
    ] })).toEqual([]);
    expect(parseDevices(null)).toEqual([]);
  });
});
