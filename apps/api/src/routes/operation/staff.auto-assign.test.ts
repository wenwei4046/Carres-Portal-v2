import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../../types";
import staffRouter from "./staff";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
vi.mock("../../lib/duties", () => ({
  dutyHolders: vi.fn(async () => ({})),
  myDuties: vi.fn(async () => []),
  hasDuty: vi.fn(async () => false),
  requireDuty: vi.fn(async () => undefined),
}));
import { userClient } from "../../lib/supabase";

const AINA = "00000000-0000-4000-8000-00000000000a";

type Row = Record<string, unknown>;

/** A tiny PostgREST stand-in for `orders`: applies neq/order/range and, like
 *  the real server, never answers more than 1000 rows in one read. */
function ordersRead(all: Row[]) {
  let rows = [...all];
  let from = 0;
  let to = Infinity;
  const q = {
    select: () => q,
    neq: (col: string, val: unknown) => {
      // SQL: NULL <> x is not true, so neq drops NULLs.
      rows = rows.filter((r) => r[col] != null && r[col] !== val);
      return q;
    },
    or: (filter: string) => {
      const parts = filter.split(",").map((p) => p.split("."));
      rows = rows.filter((r) =>
        parts.some(([col, op, val]) => (op === "is" ? r[col] === null : r[col] != null && r[col] !== val)),
      );
      return q;
    },
    order: (col: string) => {
      rows = [...rows].sort((a, b) => String(a[col]).localeCompare(String(b[col])));
      return q;
    },
    range: (f: number, t: number) => {
      from = f;
      to = t;
      return q;
    },
    then: (ok: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null }).then(ok),
  };
  return q;
}

let orders: Row[] = [];
let upsertError: { message: string } | null = null;
const upsert = vi.fn(async () => ({ error: upsertError }));

const from = vi.fn((table: string) => {
  if (table === "orders") return ordersRead(orders);
  if (table === "app_users")
    return {
      select: () => ({
        eq: async () => ({
          data: [{ id: AINA, status: "active", last_seen_at: null, staff_code: "CR004" }],
          error: null,
        }),
      }),
    };
  if (table === "ops_staff_settings")
    return { select: async () => ({ data: [{ user_id: AINA, available: true }], error: null }) };
  if (table === "ops_order_control") return { upsert };
  throw new Error(`unexpected table ${table}`);
});

// principal: may trigger the sweep and never auto-enrolls, so the reads stay few.
function app() {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("auth", { id: AINA, role: "principal", jwt: "t" } as never);
    await next();
  });
  a.route("/staff", staffRouter);
  return a;
}

const delivered = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `d-${String(i).padStart(5, "0")}`,
    status: "delivered",
    operation_stage: "delivered",
    ops_order_control: null,
  }));
// A new order has no operation stage yet (NULL), and must still be dealt.
const OPEN: Row = { id: "z-open", status: "confirmed", operation_stage: null, ops_order_control: null };

beforeEach(() => {
  vi.clearAllMocks();
  upsertError = null;
  vi.mocked(userClient).mockReturnValue({ rpc: vi.fn(async () => ({ error: null })), from } as never);
});

describe("POST /staff/auto-assign", () => {
  it("deals an open order even when 1000 delivered orders come before it", async () => {
    orders = [...delivered(1000), OPEN];
    const res = await app().request("/staff/auto-assign", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ assigned: 1 });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("a failed save is a failed response, not a smaller success", async () => {
    orders = [OPEN];
    upsertError = { message: "permission denied" };
    const res = await app().request("/staff/auto-assign", { method: "POST" });
    expect(res.status).toBe(500);
  });
});
