import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};

async function makeJwt(role: string) {
  return signTestJwt("u1", { email: `${role}@x`, app_metadata: { role } });
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

describe("GET /api/operation/stock-alerts", () => {
  const ALERT_ROWS = [
    {
      sku: "SOFA-CLOUD-3S",
      warehouse_id: "00000000-0000-0000-0000-000000000w01",
      qty: 5,
      reserved: 3,
      effective: 2,
      low_threshold: 10,
      shortage: 8,
    },
    {
      sku: "BED-OAK-Q",
      warehouse_id: "00000000-0000-0000-0000-000000000w02",
      qty: 4,
      reserved: 1,
      effective: 3,
      low_threshold: 5,
      shortage: 2,
    },
  ];

  it("returns alerts for operation with 200 + { alerts: [...] }", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: ALERT_ROWS, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/stock-alerts", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alerts: typeof ALERT_ROWS };
    expect(body.alerts).toHaveLength(2);
    expect(body.alerts[0]?.sku).toBe("SOFA-CLOUD-3S");
    expect(body.alerts[0]?.shortage).toBe(8);
    expect(sb.rpc).toHaveBeenCalledWith("operation_stock_alerts");
  });

  it("rejects dealer with 403 (role gate fires before RPC)", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/operation/stock-alerts", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("returns 200 + empty array when RPC returns no rows", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/stock-alerts", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alerts: unknown[] };
    expect(body.alerts).toEqual([]);
    expect(sb.rpc).toHaveBeenCalledWith("operation_stock_alerts");
  });

  // Unified Internal Portal (2026-06-30): operation routes now admit
  // operation + principal. `finance` is the still-rejected probe.
  it("rejects a non-operation role (finance) with 403", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/operation/stock-alerts", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    // Underlying RPC admits principal too, but the master plan T18 spec
    // restricts the HTTP endpoint to operation only. Inline guard short-circuits.
    expect(res.status).toBe(403);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("maps RPC SQLSTATE 42501 to 403", async () => {
    const sb = {
      rpc: vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: "42501", message: "forbidden" } }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/stock-alerts", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(sb.rpc).toHaveBeenCalledWith("operation_stock_alerts");
  });
});
