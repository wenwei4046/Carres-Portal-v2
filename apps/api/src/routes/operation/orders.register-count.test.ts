import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

/**
 * ⭐ `{n} orders ›` COUNTS WHAT THE DOOR OPENS (SO BUILD-1c, 2026-10-06).
 *
 * The Sales Order page's `Existing customer · {n} orders ›` opens the Sales
 * Orders Register searched by the phone. `n` used to be the customer-type
 * probe's `matches` — an EXACT phone over every status (Placed, Cancelled,
 * rental) — while the Register lists only handed-over, non-cancelled,
 * non-rental orders and matches the phone by digits. These tests run the
 * list and its `count=only` answer against ONE in-memory `orders` table that
 * actually applies the filters the route sends, so "the count equals the
 * rows" is measured, not assumed.
 */

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

vi.mock("../../lib/sales-order-work-completion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/sales-order-work-completion")>()),
  salesOrderWorkCompletion: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

type Row = Record<string, unknown>;
const order = (id: string, so: number, status: string, customer_phone: string | null, source_system: string | null = null): Row => ({
  id: `00000000-0000-0000-0000-0000000000${id}`, so, status, customer_phone, source_system,
  customer_name: "Customer", operation_stage: "confirmed", outlet_id: null, source_ref: null,
  invoice_no: null, do_number: null, placed_at: `2026-09-${String(so % 28 + 1).padStart(2, "0")}T00:00:00Z`,
});

/* One customer, stored the way people typed it, across every status. */
const ORDERS: Row[] = [
  order("01", 5001, "proceed_order", "019-83372393"), // Register ✓ · probe ✓
  order("02", 5002, "delivered", "+6019 8337 2393", "native"), // Register ✓ (digits) · probe ✗ (not exact)
  order("03", 5003, "cancelled", "019-83372393"), // Register ✗ · probe ✓
  order("04", 5004, "place", "019-83372393"), // Register ✗ (not handed over) · probe ✓
  order("05", 5005, "proceed_order", "019-83372393", "rental"), // Register ✗ · probe ✓
  order("06", 5006, "proceed_order", "012-345 6789"), // another customer
];
const REGISTER_HITS = [ORDERS[0]!.id, ORDERS[1]!.id];

/* ── A tiny PostgREST over `orders`: applies what the route asks, nothing more ── */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (quoted) {
      cur += ch;
      if (ch === "\\") cur += s[++i] ?? "";
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    if (ch === "(" || ch === "{") depth++;
    if (ch === ")" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
const unquote = (v: string) => (v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\(.)/g, "$1") : v);
const likeToRegex = (pattern: string) =>
  new RegExp(
    `^${pattern.split("").map((ch) => (ch === "%" ? ".*" : ch === "_" ? "." : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("")}$`,
    "is",
  );
const listOf = (v: string) => v.replace(/^[({]|[)}]$/g, "").split(",");
function test(row: Row, col: string, op: string, raw: string): boolean {
  const value = unquote(raw);
  const cell = row[col];
  switch (op) {
    case "is": return value === "null" ? cell == null : String(cell) === value;
    case "eq": return cell != null && String(cell) === value;
    case "neq": return cell != null && String(cell) !== value;
    case "ilike": return typeof cell === "string" && likeToRegex(value).test(cell);
    case "in": return cell != null && listOf(value).includes(String(cell));
    case "cs": return Array.isArray(cell) && listOf(value).every((v) => (cell as unknown[]).map(String).includes(v));
    default: throw new Error(`fake PostgREST: unsupported or() operator ${op}`);
  }
}
function orToken(row: Row, token: string): boolean {
  const a = token.indexOf(".");
  const b = token.indexOf(".", a + 1);
  return test(row, token.slice(0, a), token.slice(a + 1, b), token.slice(b + 1));
}

type Read = { table: string; cols: string; head: boolean };
function fakeDb(rows: Row[], opts: { headCountError?: unknown } = {}) {
  const reads: Read[] = [];
  const builder = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    const read: Read = { table, cols: "", head: false };
    let counted = false;
    let window: [number, number] | null = null;
    let limit: number | null = null;
    const self: Record<string, unknown> = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
            try {
              /* A read is what is AWAITED — a builder the route only builds is not one. */
              reads.push(read);
              if (table !== "orders") return resolve({ data: [], error: null, count: 0 });
              if (read.head && opts.headCountError) return resolve({ data: null, count: null, error: opts.headCountError });
              let hit = rows.filter((r) => filters.every((f) => f(r)));
              const count = counted ? hit.length : null;
              if (window) hit = hit.slice(window[0], window[1] + 1);
              if (limit !== null) hit = hit.slice(0, limit);
              return resolve({ data: read.head ? null : hit, count, error: null });
            } catch (e) {
              return reject(e);
            }
          };
        }
        return (...args: unknown[]) => {
          if (prop === "select") {
            read.cols = String(args[0]);
            const o = args[1] as { count?: string; head?: boolean } | undefined;
            read.head = Boolean(o?.head);
            counted = o?.count === "exact";
            return self;
          }
          if (table !== "orders") return self;
          const [col, a1, a2] = args as [string, unknown, unknown];
          switch (prop) {
            case "not":
              if (a1 !== "in") throw new Error(`fake PostgREST: unsupported not ${String(a1)}`);
              filters.push((r) => !test(r, col, "in", String(a2)));
              break;
            case "or": {
              const tokens = splitTop(col);
              filters.push((r) => tokens.some((t) => orToken(r, t)));
              break;
            }
            case "in": filters.push((r) => (a1 as unknown[]).map(String).includes(String(r[col]))); break;
            /* `original_request.revision` filters the EMBED, never the parent rows. */
            case "eq": if (!col.includes(".")) filters.push((r) => test(r, col, "eq", String(a1))); break;
            case "is": filters.push((r) => (a1 === null ? r[col] == null : r[col] === a1)); break;
            case "ilike": filters.push((r) => test(r, col, "ilike", String(a1))); break;
            case "order": break;
            case "range": window = [Number(col), Number(a1)]; break;
            case "limit": limit = Number(col); break;
            default: throw new Error(`fake PostgREST: unsupported orders method ${prop}`);
          }
          return self;
        };
      },
    }) as Record<string, unknown>;
    return self;
  };
  vi.mocked(userClient).mockReturnValue({
    from: (table: string) => builder(table),
    rpc: () => builder("rpc"),
  } as never);
  return reads;
}

const jwtOf = (role: string) =>
  signTestJwt("11111111-1111-1111-1111-000000000999", { email: `${role}@carres.com`, app_metadata: { role } });
async function get(path: string, role = "operation") {
  const jwt = await jwtOf(role);
  const res = await app.fetch(new Request(`http://t${path}`, { headers: { Authorization: `Bearer ${jwt}` } }), env);
  return { res, jwt, body: (await res.json()) as Record<string, unknown> };
}
const registerPath = (phone: string, count = false) =>
  `/api/operation/orders?stage=proceeded&search=${encodeURIComponent(phone)}${count ? "&count=only" : ""}`;

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});
afterAll(() => _setJwksForTesting(null));

describe("count=only — the Register's own rows for the same phone and caller, counted", () => {
  it.each(["019-83372393", "01983372393", "+60 19-8337 2393", "(019) 8337 2393"])(
    "typed %s: the count equals the rows the Register lists",
    async (phone) => {
      fakeDb(ORDERS);
      const list = await get(registerPath(phone));
      expect(list.res.status).toBe(200);
      const ids = (list.body.orders as Row[]).map((o) => o.id).sort();
      expect(ids).toEqual([...REGISTER_HITS].sort());

      fakeDb(ORDERS);
      const counted = await get(registerPath(phone, true));
      expect(counted.res.status).toBe(200);
      expect(counted.body).toEqual({ count: ids.length });
    },
  );

  it("counts through the caller's own RLS client, one head-only read, and never loads the rows", async () => {
    const reads = fakeDb(ORDERS);
    const { res, jwt, body } = await get(registerPath("019-83372393", true));
    expect(res.status).toBe(200);
    expect(body).toEqual({ count: 2 });
    expect(vi.mocked(userClient).mock.calls.every(([, token]) => token === jwt)).toBe(true);
    const orderReads = reads.filter((r) => r.table === "orders");
    /* The phone read (its own population) and ONE head count — no row read. */
    expect(orderReads.filter((r) => r.head)).toEqual([{ table: "orders", cols: "id", head: true }]);
    expect(orderReads.filter((r) => !r.head).map((r) => r.cols)).toEqual(["id, customer_phone"]);
  });

  it("a phone the Register does not hold counts 0 — the page then shows no door", async () => {
    fakeDb(ORDERS);
    const { res, body } = await get(registerPath("011-9999 0000", true));
    expect(res.status).toBe(200);
    expect(body).toEqual({ count: 0 });
  });

  it("a failed count is an error, never a number", async () => {
    fakeDb(ORDERS, { headCountError: { code: "42501", message: "permission denied for table orders" } });
    const { res, body } = await get(registerPath("019-83372393", true));
    expect(res.status).toBe(403);
    expect(body).not.toHaveProperty("count");
  });

  it("refuses any other count word", async () => {
    fakeDb(ORDERS);
    const { res } = await get(`${registerPath("019-83372393")}&count=all`);
    expect(res.status).toBe(422);
  });

  it("is behind the Register's own guard — a dealer gets no count", async () => {
    fakeDb(ORDERS);
    const { res } = await get(registerPath("019-83372393", true), "dealer");
    expect(res.status).toBe(403);
  });
});

/* The Sales Portal POS reads New/Existing from this probe at order entry: it
   stays the EXACT phone over every status the caller may read. */
describe("GET /api/orders/customer-type — unchanged", () => {
  it("still answers exact phone matches over every status", async () => {
    fakeDb(ORDERS);
    const { res, body } = await get("/api/orders/customer-type?phone=019-83372393");
    expect(res.status).toBe(200);
    expect(body).toEqual({ existing: true, matches: 4 });
  });
});
