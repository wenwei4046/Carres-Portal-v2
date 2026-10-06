import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

/**
 * ⭐ EVERY PERMITTED ORDER, THE SAME TOTAL, THE SAME EXPORT (SO A3-3,
 * 2026-10-06 · Orders MASTER §0.0 "Register, filters, reports and exports").
 *
 * The Register used to read ONE answer of `GET /api/operation/orders`, which
 * stops at the newest 500 orders — past 500 the oldest vanished from the list,
 * its rail summary and its export while the footer's exact count disagreed.
 * `paged=1` walks the SAME population (the same `listScope`, the same search
 * clauses, the same caller) in pages of 500 ordered by `placed_at` desc, then
 * `id` desc, and hands back a cursor for the next page. These tests run the
 * route against ONE in-memory `orders` table that applies exactly what the
 * route sends — filters, keyset, sort and limit — so "no row is skipped or
 * repeated, and the rows equal the count" is measured, not assumed.
 *
 * Every OTHER caller (Delivery, Work, Payments, the dashboard, SO Batch's
 * single-order lookup, `orderId=`, `count=only`) sends no `paged` and must get
 * exactly what it got before: the newest 500, one sort key, no cursor.
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

/* ── The population ────────────────────────────────────────────────────────
   1,203 Register orders — three pages (500 · 500 · 203). Every seven share ONE
   `placed_at` to the microsecond, so a tie straddles both page edges (rows
   497–503 and 997–1003): only a unique tiebreaker keeps them from being
   skipped or repeated. Interleaved in time are orders the Register never
   holds (Placed, Cancelled, rental), so a page is full only if the population
   predicate is applied BEFORE the limit. The table is stored shuffled, so the
   fake cannot pass by returning insertion order. */
const BASE = Date.UTC(2026, 8, 30, 12, 0, 0);
const stampOf = (group: number) =>
  `${new Date(BASE - group * 37 * 60_000).toISOString().slice(0, 19)}.${String(100_001 + (group % 900) * 7).padStart(6, "0")}+00:00`;
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const REGISTER_COUNT = 1203;

function registerOrder(n: number, over: Row = {}): Row {
  return {
    id: idOf(n),
    so: 10_000 + n,
    status: n % 3 === 0 ? "delivered" : "proceed_order",
    operation_stage: "confirmed",
    source_system: n % 4 === 0 ? "native" : null,
    customer_name: n % 2 === 0 ? "Kimmy Tan" : "Ahmad",
    customer_phone: "012-345 6789",
    outlet_id: null,
    source_ref: null,
    invoice_no: null,
    do_number: null,
    placed_at: stampOf(Math.floor(n / 7)),
    order_lines: [],
    ...over,
  };
}
const REGISTER: Row[] = Array.from({ length: REGISTER_COUNT }, (_, n) => registerOrder(n));
const OUTSIDE: Row[] = [
  ...Array.from({ length: 40 }, (_, k) => registerOrder(5000 + k, { status: "place", placed_at: stampOf(k * 4) })),
  ...Array.from({ length: 40 }, (_, k) => registerOrder(6000 + k, { status: "cancelled", placed_at: stampOf(k * 4 + 1) })),
  ...Array.from({ length: 40 }, (_, k) => registerOrder(7000 + k, { source_system: "rental", placed_at: stampOf(k * 4 + 2) })),
];
/* A deterministic shuffle (LCG) — storage order is never the answer's order. */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  let seed = 20261006;
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
/** placed_at desc, then id desc — the one order every page is read in. */
const newestFirst = (a: Row, b: Row) =>
  String(b.placed_at).localeCompare(String(a.placed_at)) || String(b.id).localeCompare(String(a.id));
const EXPECTED_IDS = [...REGISTER].sort(newestFirst).map((r) => r.id as string);

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
    /* Every compared column here (`placed_at` in one ISO shape, lowercase
       uuids) orders the same as a string as it does in Postgres. */
    case "lt": return cell != null && String(cell) < value;
    case "gt": return cell != null && String(cell) > value;
    case "ilike": return typeof cell === "string" && likeToRegex(value).test(cell);
    case "in": return cell != null && listOf(value).includes(String(cell));
    case "cs": return Array.isArray(cell) && listOf(value).every((v) => (cell as unknown[]).map(String).includes(v));
    default: throw new Error(`fake PostgREST: unsupported or() operator ${op}`);
  }
}
function orToken(row: Row, token: string): boolean {
  const group = /^(and|or)\((.*)\)$/s.exec(token);
  if (group) {
    const parts = splitTop(group[2]!);
    return group[1] === "and" ? parts.every((p) => orToken(row, p)) : parts.some((p) => orToken(row, p));
  }
  const a = token.indexOf(".");
  const b = token.indexOf(".", a + 1);
  return test(row, token.slice(0, a), token.slice(a + 1, b), token.slice(b + 1));
}

type Call = { method: string; args: unknown[] };
type Read = { table: string; cols: string; head: boolean; calls: Call[] };
function fakeDb(table: Row[]) {
  const reads: Read[] = [];
  const builder = (name: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    const sorts: Array<{ col: string; ascending: boolean }> = [];
    const read: Read = { table: name, cols: "", head: false, calls: [] };
    let counted = false;
    let window: [number, number] | null = null;
    let limit: number | null = null;
    const self: Record<string, unknown> = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
            try {
              reads.push(read);
              if (name !== "orders") return resolve({ data: [], error: null, count: 0 });
              let hit = table.filter((r) => filters.every((f) => f(r)));
              const count = counted ? hit.length : null;
              if (sorts.length) {
                hit = [...hit].sort((x, y) => {
                  for (const s of sorts) {
                    const cmp = String(x[s.col]).localeCompare(String(y[s.col]));
                    if (cmp !== 0) return s.ascending ? cmp : -cmp;
                  }
                  return 0;
                });
              }
              if (window) hit = hit.slice(window[0], window[1] + 1);
              if (limit !== null) hit = hit.slice(0, limit);
              return resolve({ data: read.head ? null : hit, count, error: null });
            } catch (e) {
              return reject(e);
            }
          };
        }
        return (...args: unknown[]) => {
          read.calls.push({ method: prop, args });
          if (prop === "select") {
            read.cols = String(args[0]);
            const o = args[1] as { count?: string; head?: boolean } | undefined;
            read.head = Boolean(o?.head);
            counted = o?.count === "exact";
            return self;
          }
          if (name !== "orders") return self;
          const [col, a1, a2] = args as [string, unknown, unknown];
          switch (prop) {
            case "not":
              if (a1 === "in") filters.push((r) => !test(r, col, "in", String(a2)));
              else if (a1 === "is") filters.push((r) => r[col] != null);
              else throw new Error(`fake PostgREST: unsupported not ${String(a1)}`);
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
            case "order": sorts.push({ col, ascending: (a1 as { ascending?: boolean } | undefined)?.ascending !== false }); break;
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
    from: (name: string) => builder(name),
    rpc: () => builder("rpc"),
  } as never);
  return reads;
}

const jwtOf = (role: string) =>
  signTestJwt("11111111-1111-1111-1111-000000000999", { email: `${role}@carres.com`, app_metadata: { role } });
async function get(path: string, role = "operation", signed?: string) {
  const jwt = signed ?? (await jwtOf(role));
  const res = await app.fetch(new Request(`http://t${path}`, { headers: { Authorization: `Bearer ${jwt}` } }), env);
  return { res, jwt, body: (await res.json()) as Record<string, unknown> };
}

type Page = { orders: Row[]; salesOrderTotal?: number | null; nextCursor?: string | null };
/** Walk the pages exactly as the Register does: follow `nextCursor` until null. */
async function walk(base: string, between?: (pageIndex: number) => void, jwt?: string) {
  const pages: Page[] = [];
  let after: string | null = null;
  for (let guard = 0; guard < 20; guard++) {
    const { res, body } = await get(`${base}&paged=1${after ? `&after=${encodeURIComponent(after)}` : ""}`, "operation", jwt);
    expect(res.status).toBe(200);
    pages.push(body as unknown as Page);
    after = (body.nextCursor as string | null) ?? null;
    if (!after) return pages;
    between?.(pages.length);
  }
  throw new Error("paging never ended");
}
const idsOf = (pages: Page[]) => pages.flatMap((p) => p.orders.map((o) => o.id as string));

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});
afterAll(() => _setJwksForTesting(null));

describe("paged=1 — the Register's whole population, page by page", () => {
  it("returns all 1,203 permitted orders, once each, newest first, across three pages", async () => {
    fakeDb(shuffled([...REGISTER, ...OUTSIDE]));
    const pages = await walk("/api/operation/orders?stage=proceeded");
    expect(pages.map((p) => p.orders.length)).toEqual([500, 500, 203]);
    const ids = idsOf(pages);
    expect(new Set(ids).size).toBe(ids.length); // nothing repeated
    expect(ids).toHaveLength(REGISTER_COUNT); // nothing skipped
    expect(ids).toEqual(EXPECTED_IDS); // placed_at desc, then id desc — stable across the edges
    expect(pages.at(-1)!.nextCursor).toBeNull();
  });

  it("reports the total once, on the first page, and it equals the rows the pages return", async () => {
    const reads = fakeDb(shuffled([...REGISTER, ...OUTSIDE]));
    const pages = await walk("/api/operation/orders?stage=proceeded");
    expect(pages[0]!.salesOrderTotal).toBe(REGISTER_COUNT);
    expect(idsOf(pages)).toHaveLength(pages[0]!.salesOrderTotal!);
    /* Later pages spend no second count. */
    expect(pages.slice(1).every((p) => !("salesOrderTotal" in p))).toBe(true);
    expect(reads.filter((r) => r.table === "orders" && r.head)).toHaveLength(1);
  });

  it("reads every page through the caller's own RLS client", async () => {
    fakeDb(shuffled([...REGISTER, ...OUTSIDE]));
    const jwt = await jwtOf("operation");
    await walk("/api/operation/orders?stage=proceeded", undefined, jwt);
    const tokens = vi.mocked(userClient).mock.calls.map(([, token]) => token);
    expect(tokens.length).toBeGreaterThan(0);
    expect(new Set(tokens)).toEqual(new Set([jwt]));
  });

  it("a searched Register pages too, and its rows equal count=only for the same search", async () => {
    fakeDb(shuffled([...REGISTER, ...OUTSIDE]));
    const pages = await walk("/api/operation/orders?stage=proceeded&search=Kimmy");
    const ids = idsOf(pages);
    const kimmy = EXPECTED_IDS.filter((id) => REGISTER.find((r) => r.id === id)!.customer_name === "Kimmy Tan");
    expect(kimmy.length).toBeGreaterThan(500);
    expect(ids).toEqual(kimmy);
    fakeDb(shuffled([...REGISTER, ...OUTSIDE]));
    const counted = await get("/api/operation/orders?stage=proceeded&search=Kimmy&count=only");
    expect(counted.body).toEqual({ count: ids.length });
  });

  it("an order placed or cancelled while the pages load moves no other order", async () => {
    /* Its own copies: this test changes a row, the others must not see it. */
    const table = shuffled([...REGISTER, ...OUTSIDE]).map((r) => ({ ...r }));
    fakeDb(table);
    const cancelled = EXPECTED_IDS[750]!; // on page two, read after page one
    const pages = await walk("/api/operation/orders?stage=proceeded", (pageIndex) => {
      if (pageIndex !== 1) return;
      /* After page one: a brand-new order arrives at the top, and one order on
         page two is cancelled. An offset read would now repeat row 500 and
         skip a row; the keyset read moves on from the last row it returned. */
      table.push(registerOrder(9999, { placed_at: stampOf(-5) }));
      table.find((r) => r.id === cancelled)!.status = "cancelled";
    });
    const ids = idsOf(pages);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(EXPECTED_IDS.filter((id) => id !== cancelled));
  });

  it("exactly 500 orders end with an empty page, never a lost or repeated row", async () => {
    fakeDb(shuffled(REGISTER.slice(0, 500)));
    const pages = await walk("/api/operation/orders?stage=proceeded");
    expect(pages.map((p) => p.orders.length)).toEqual([500, 0]);
    expect(idsOf(pages)).toEqual([...REGISTER.slice(0, 500)].sort(newestFirst).map((r) => r.id));
  });

  it.each([
    ["an `after` without paging", "/api/operation/orders?stage=proceeded&after=x"],
    ["a cursor that is not one", "/api/operation/orders?stage=proceeded&paged=1&after=2026-09-30"],
    ["a filter smuggled into the cursor", `/api/operation/orders?stage=proceeded&paged=1&after=${encodeURIComponent(`2026-09-30T12:00:00+00:00|${idOf(1)}),id.gt.(0`)}`],
    ["any other paging word", "/api/operation/orders?stage=proceeded&paged=all"],
  ])("refuses %s", async (_why, path) => {
    fakeDb(REGISTER);
    const { res } = await get(path);
    expect(res.status).toBe(422);
  });
});

describe("every other caller — exactly what it received before", () => {
  it("no `paged`: the newest 500, one sort key, the 500 cap, no cursor", async () => {
    const reads = fakeDb(shuffled([...REGISTER, ...OUTSIDE]));
    const { res, body } = await get("/api/operation/orders");
    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["orders", "salesOrderTotal"]);
    expect((body.orders as Row[])).toHaveLength(500);
    const list = reads.find((r) => r.table === "orders" && !r.head && r.cols.startsWith("id, so, status"))!;
    expect(list.calls.filter((c) => c.method === "order")).toEqual([{ method: "order", args: ["placed_at", { ascending: false }] }]);
    expect(list.calls.filter((c) => c.method === "limit")).toEqual([{ method: "limit", args: [500] }]);
    expect(list.calls.some((c) => c.method === "or" && String(c.args[0]).includes("placed_at"))).toBe(false);
  });

  it("the Register's old one-answer read (stage=proceeded, no paged) is unchanged too", async () => {
    fakeDb(shuffled([...REGISTER, ...OUTSIDE]));
    const { body } = await get("/api/operation/orders?stage=proceeded");
    expect(body).not.toHaveProperty("nextCursor");
    expect((body.orders as Row[])).toHaveLength(500);
    expect(body.salesOrderTotal).toBe(REGISTER_COUNT);
  });

  it("`orderId=` (the Work completion probe) still answers its one order, no cursor", async () => {
    fakeDb(shuffled([...REGISTER, ...OUTSIDE]));
    const { res, body } = await get(`/api/operation/orders?orderId=${idOf(42)}`);
    expect(res.status).toBe(200);
    expect((body.orders as Row[]).map((o) => o.id)).toEqual([idOf(42)]);
    expect(body).not.toHaveProperty("nextCursor");
  });

  it("`count=only` still answers the count alone", async () => {
    fakeDb(shuffled([...REGISTER, ...OUTSIDE]));
    const { body } = await get("/api/operation/orders?stage=proceeded&count=only");
    expect(body).toEqual({ count: REGISTER_COUNT });
  });
});
