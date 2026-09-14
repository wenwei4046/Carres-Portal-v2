import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
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
const KID = "k1";
let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000001")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

beforeAll(async () => {
  const kp = await generateKeyPair("ES256", { extractable: true });
  signKey = kp.privateKey;
  publicJwk = await exportJWK(kp.publicKey);
  publicJwk.kid = KID;
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
});

beforeEach(() => {
  _setJwksForTesting(createLocalJWKSet({ keys: [publicJwk] }));
  vi.mocked(userClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

// ── a recording stand-in for the supabase client ────────────────────────────
// Every `from()` / `rpc()` starts a call; every chained method is recorded on
// it; awaiting the chain asks `answer` for the result, so a test sees the
// whole query that was built before it answers.

type Op = [string, ...unknown[]];
type Call = { kind: "from" | "rpc"; name: string; args?: unknown; ops: Op[] };
type Result = { data: unknown; error: { code?: string; message?: string } | null; count?: number | null };

function fakeClient(answer: (call: Call) => Result) {
  const calls: Call[] = [];
  const chain = (call: Call): unknown => {
    const proxy: object = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => {
            try {
              return Promise.resolve(answer(call)).then(resolve, reject);
            } catch (e) {
              return reject(e);
            }
          };
        }
        return (...args: unknown[]) => {
          call.ops.push([prop, ...args]);
          return proxy;
        };
      },
    });
    return proxy;
  };
  const sb = {
    from: vi.fn((name: string) => {
      const call: Call = { kind: "from", name, ops: [] };
      calls.push(call);
      return chain(call);
    }),
    rpc: vi.fn((name: string, args?: unknown) => {
      const call: Call = { kind: "rpc", name, args, ops: [] };
      calls.push(call);
      return chain(call);
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(sb as any);
  return { sb, calls };
}

const ops = (call: Call | undefined, method: string) => (call?.ops ?? []).filter((o) => o[0] === method);

async function get(path: string, role = "finance") {
  const jwt = await makeJwt(role);
  return app.fetch(
    new Request(`http://t/api/finance/ledger${path}`, { headers: { Authorization: `Bearer ${jwt}` } }),
    env,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJson = Record<string, any>;
const json = async (res: Response) => (await res.json()) as AnyJson;

const ok = (data: unknown, count?: number | null): Result => ({ data, error: null, count });
const fail = (code: string, message = "database said something internal"): Result => ({
  data: null,
  error: { code, message },
});

const ENTRY = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  entry_no: "JE-202609-0003",
  entry_date: "2026-09-02",
  source_type: "SALES_INVOICE",
  source_doc_no: "INV-TEST-1",
  narration: "Invoice to a test customer",
  total_debit: "150.00",
  total_credit: "150.00",
  reversed: true,
  reverses: null,
  reversed_by: "aaaaaaaa-0000-4000-8000-000000000002",
  created_at: "2026-09-02T03:00:00Z",
  created_by: "11111111-1111-1111-1111-000000000001",
};

/** The entry ENTRY.reversed_by points at, as the linked-number read returns it. */
const LINKED = { id: "aaaaaaaa-0000-4000-8000-000000000002", entry_no: "JE-202609-0004" };

/** The linked-number read is the `gl_entries` read filtered `in("id", …)`. */
const isLinkedRead = (call: Call) => call.name === "gl_entries" && ops(call, "in").some((o) => o[1] === "id");

// ── the guard ────────────────────────────────────────────────────────────────

describe("finance ledger — who may read", () => {
  const paths = [
    "/entries",
    "/entries/JE-202609-0003",
    "/accounts",
    "/trial-balance",
    "/health",
    "/self-check",
    "/account-ledger?account=1210&from=2026-09-01&to=2026-09-30",
    "/profit-and-loss?from=2026-09-01&to=2026-09-30",
    "/balance-sheet",
  ];

  it.each(["dealer", "operation", "supplier"])("refuses %s on every route before any database call", async (role) => {
    for (const p of paths) {
      const res = await get(p, role);
      expect(res.status, `${role} ${p}`).toBe(403);
    }
    expect(userClient).not.toHaveBeenCalled();
  });

  it("admits the principal", async () => {
    const { sb } = fakeClient(() => ok([], 0));
    const res = await get("/entries", "principal");
    expect(res.status).toBe(200);
    expect(sb.from).toHaveBeenCalledWith("gl_entries");
  });
});

// ── the Journal ──────────────────────────────────────────────────────────────

describe("GET /entries", () => {
  it("reads posted entries newest first, with both reversal numbers", async () => {
    const { calls } = fakeClient((call) => (isLinkedRead(call) ? ok([LINKED]) : ok([ENTRY], 1)));
    const res = await get("/entries");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.total).toBe(1);
    expect(body.rows[0]).toMatchObject({
      entry_no: "JE-202609-0003",
      total_debit: 150,
      reversed: true,
      reversed_by_entry_no: "JE-202609-0004",
      reverses_entry_no: null,
    });
    const c = calls[0]!;
    expect(c.name).toBe("gl_entries");
    const select = ops(c, "select")[0]!;
    expect(String(select[1])).not.toContain("!inner");
    expect(select[2]).toEqual({ count: "exact" });
    expect(ops(c, "eq")).toContainEqual(["eq", "posted", true]);
    expect(ops(c, "order").map((o) => o[1])).toEqual(["entry_date", "created_at", "id"]);
    expect(ops(c, "range")).toEqual([["range", 0, 499]]);
    // The number comes from a second, plain read of the entry it points at.
    const linked = calls[1]!;
    expect(isLinkedRead(linked)).toBe(true);
    expect(ops(linked, "select")).toEqual([["select", "id,entry_no"]]);
    expect(ops(linked, "in")).toEqual([["in", "id", [LINKED.id]]]);
    expect(calls).toHaveLength(2);
  });

  // PostgREST refuses to embed a table in itself through a foreign-key hint,
  // and production answered every Journal read 500 while this select carried
  // one. A recording fake accepts any string, so the select is pinned instead.
  it("never embeds gl_entries in itself", async () => {
    const { calls } = fakeClient((call) =>
      isLinkedRead(call) ? ok([LINKED]) : ops(call, "maybeSingle").length ? ok(ENTRY) : ok([ENTRY], 1));
    await get("/entries");
    await get("/entries?account=1210");
    await get("/entries/JE-202609-0003");
    const selects = calls.flatMap((call) => ops(call, "select").map((o) => String(o[1])));
    expect(selects.length).toBeGreaterThan(3);
    for (const s of selects) expect(s).not.toMatch(/gl_entries[!(]/);
  });

  it("asks for no linked numbers when no entry on the page links", async () => {
    const { calls } = fakeClient(() => ok([{ ...ENTRY, reversed: false, reversed_by: null }], 1));
    const res = await get("/entries");
    expect(res.status).toBe(200);
    expect((await json(res)).rows[0]).toMatchObject({ reverses_entry_no: null, reversed_by_entry_no: null });
    expect(calls).toHaveLength(1);
  });

  it("reads the linked numbers of a full page in slices of 100", async () => {
    const id = (n: number) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const page = Array.from({ length: 250 }, (_, n) => ({ ...ENTRY, id: `row-${n}`, reversed_by: id(n) }));
    const { calls } = fakeClient((call) => {
      if (!isLinkedRead(call)) return ok(page, 250);
      const asked = ops(call, "in")[0]![2] as string[];
      return ok(asked.map((i) => ({ id: i, entry_no: `JE-${i.slice(-4)}` })));
    });
    const res = await get("/entries?limit=1000");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.rows[249].reversed_by_entry_no).toBe("JE-0249");
    expect(calls.filter(isLinkedRead).map((call) => (ops(call, "in")[0]![2] as string[]).length)).toEqual([100, 100, 50]);
  });

  it("answers an unreadable linked number with an error, never a reversal without its link", async () => {
    fakeClient((call) => (isLinkedRead(call) ? fail("XX000") : ok([ENTRY], 1)));
    const res = await get("/entries");
    expect(res.status).toBe(500);
    expect((await json(res)).message).toBe("The journal could not be loaded. Try again.");
  });

  it("narrows by account through an inner join, and by date, source and search", async () => {
    const { calls } = fakeClient(() => ok([], 0));
    const res = await get(
      "/entries?account=1210&from=2026-09-01&to=2026-09-30&source=SALES_INVOICE&q=INV-7&offset=500&limit=100",
    );
    expect(res.status).toBe(200);
    const c = calls[0]!;
    expect(String(ops(c, "select")[0]![1])).toContain("gl_entry_lines!inner(account_code)");
    expect(ops(c, "eq")).toContainEqual(["eq", "gl_entry_lines.account_code", "1210"]);
    expect(ops(c, "eq")).toContainEqual(["eq", "source_type", "SALES_INVOICE"]);
    expect(ops(c, "gte")).toEqual([["gte", "entry_date", "2026-09-01"]]);
    expect(ops(c, "lte")).toEqual([["lte", "entry_date", "2026-09-30"]]);
    expect(ops(c, "or")).toEqual([["or", "entry_no.ilike.*INV-7*,source_doc_no.ilike.*INV-7*"]]);
    expect(ops(c, "range")).toEqual([["range", 500, 599]]);
  });

  it.each([
    ["?from=2026-09-30&to=2026-09-01", "backwards dates"],
    ["?q=a,b", "a comma in the search"],
    ["?q=a*", "a wildcard in the search"],
    ["?account=12%2010", "a space in an account"],
    ["?limit=5000", "a page too large"],
    ["?colour=red", "an unknown filter"],
  ])("refuses %s (%s) with 422 before any database call", async (qs) => {
    const res = await get(`/entries${qs}`);
    expect(res.status).toBe(422);
    expect(userClient).not.toHaveBeenCalled();
  });

  it("answers an unreadable Journal with an error, never an empty list", async () => {
    fakeClient(() => fail("XX000"));
    const res = await get("/entries");
    expect(res.status).toBe(500);
    expect((await json(res)).message).toBe("The journal could not be loaded. Try again.");
  });

  it("answers a missing count with an error", async () => {
    fakeClient(() => ok([ENTRY], null));
    expect((await get("/entries")).status).toBe(500);
  });
});

describe("GET /entries/:ref", () => {
  function entryAnswer(overrides: Partial<Record<"head" | "linked" | "related" | "lines", Result>> = {}) {
    return (call: Call): Result => {
      if (call.name === "gl_entries" && ops(call, "maybeSingle").length) return overrides.head ?? ok(ENTRY);
      if (isLinkedRead(call)) return overrides.linked ?? ok([LINKED]);
      if (call.name === "gl_entries") {
        return overrides.related ?? ok([
          {
            id: "aaaaaaaa-0000-4000-8000-000000000002",
            entry_no: "JE-202609-0004",
            entry_date: "2026-09-03",
            source_type: "SALES_INVOICE_REVERSAL",
            reversed: false,
          },
        ]);
      }
      if (call.name === "gl_entry_lines") {
        return overrides.lines ?? ok([
          {
            line_no: 1, account_code: "1210", debit: "150.00", credit: "0", party_type: "CUSTOMER",
            party_id: "cccccccc-0000-4000-8000-000000000001", memo: null, gl_accounts: { name: "Trade debtors" },
          },
          {
            line_no: 2, account_code: "4100", debit: "0", credit: "150.00", party_type: null,
            party_id: null, memo: "Sales", gl_accounts: { name: "Sales" },
          },
        ]);
      }
      if (call.name === "customers") return ok([{ id: "cccccccc-0000-4000-8000-000000000001", name: "Test Customer One" }]);
      return ok([]);
    };
  }

  it("finds an entry by its number, with lines, party names and related entries", async () => {
    const { calls } = fakeClient(entryAnswer());
    const res = await get("/entries/je-202609-0003");
    expect(res.status).toBe(200);
    const body = await json(res);
    const head = calls.find((c) => c.name === "gl_entries" && ops(c, "maybeSingle").length)!;
    expect(ops(head, "eq")).toContainEqual(["eq", "entry_no", "JE-202609-0003"]);
    expect(body.entry.reversed_by_entry_no).toBe("JE-202609-0004");
    expect(body.lines).toHaveLength(2);
    expect(body.lines[0]).toMatchObject({
      account_code: "1210", account_name: "Trade debtors", debit: 150, credit: 0, party_name: "Test Customer One",
    });
    expect(body.lines[1]).toMatchObject({ party_name: null, memo: "Sales" });
    expect(body.related).toEqual([
      expect.objectContaining({ entry_no: "JE-202609-0004", source_type: "SALES_INVOICE_REVERSAL" }),
    ]);
    // Finance reads only its own app_users row, so a name lookup would lie
    // about everybody else; the entry does not ask.
    expect(body).not.toHaveProperty("posted_by_name");
    expect(calls.some((c) => c.name === "app_users")).toBe(false);
    const linked = calls.find(isLinkedRead)!;
    expect(ops(linked, "in")).toEqual([["in", "id", [LINKED.id]]]);
    const related = calls.find((c) => c.name === "gl_entries" && ops(c, "eq").some((o) => o[1] === "source_doc_no"))!;
    expect(ops(related, "in")).toEqual([["in", "source_type", ["SALES_INVOICE", "SALES_INVOICE_REVERSAL"]]]);
    expect(ops(related, "neq")).toEqual([["neq", "id", ENTRY.id]]);
    // No supplier on the lines, so suppliers are never asked.
    expect(calls.some((c) => c.name === "suppliers")).toBe(false);
  });

  it("finds an entry by its id", async () => {
    const { calls } = fakeClient(entryAnswer());
    expect((await get(`/entries/${ENTRY.id}`)).status).toBe(200);
    expect(ops(calls[0], "eq")).toContainEqual(["eq", "id", ENTRY.id]);
  });

  it("says 404 when no entry has that number", async () => {
    fakeClient(entryAnswer({ head: ok(null) }));
    expect((await get("/entries/JE-209901-0001")).status).toBe(404);
  });

  it("refuses a malformed reference", async () => {
    expect((await get("/entries/JE%2A1")).status).toBe(422);
    expect(userClient).not.toHaveBeenCalled();
  });

  it("fails when the lines cannot be read, rather than showing an entry with none", async () => {
    fakeClient(entryAnswer({ lines: fail("XX000") }));
    expect((await get("/entries/JE-202609-0003")).status).toBe(500);
  });

  it("fails when the linked number cannot be read, rather than showing a reversal without it", async () => {
    fakeClient(entryAnswer({ linked: fail("XX000") }));
    expect((await get("/entries/JE-202609-0003")).status).toBe(500);
  });
});

// ── the chart and the trial balance ─────────────────────────────────────────

const CHART = [
  { code: "1000", name: "Assets", kind: "ASSET", parent_code: null, is_control: false, control_for: null, is_active: true },
  { code: "1210", name: "Trade debtors", kind: "ASSET", parent_code: "1000", is_control: true, control_for: "CUSTOMER", is_active: true },
  { code: "4100", name: "Sales", kind: "INCOME", parent_code: null, is_control: false, control_for: null, is_active: true },
];

function chartAnswer(tb: Result) {
  return (call: Call): Result => {
    if (call.name === "gl_trial_balance") return tb;
    if (call.name === "gl_accounts") return ok(CHART);
    if (call.name === "gl_config") return ok({ go_live_on: "2026-09-01" });
    return ok([]);
  };
}

describe("GET /accounts", () => {
  it("returns the chart with headers worked out from parents, and the ledger start", async () => {
    fakeClient(chartAnswer(ok([])));
    const res = await get("/accounts");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.go_live_on).toBe("2026-09-01");
    expect(body.accounts.map((a: AnyJson) => [a.code, a.is_header])).toEqual([["1000", true], ["1210", false], ["4100", false]]);
  });
});

describe("GET /trial-balance", () => {
  const tbRow = (o: AnyJson) => ({ report_status: "OK", go_live_on: "2026-09-01", as_of: "2026-09-10", ...o });

  it("asks for the day given, drops header accounts, and reports the difference", async () => {
    const { sb } = fakeClient(chartAnswer(ok([
      tbRow({ ordinal: 1, row_kind: "ACCOUNT", account_code: "1000", account_name: "Assets", kind: "ASSET", total_debit: 0, total_credit: 0, natural_balance: 0 }),
      tbRow({ ordinal: 2, row_kind: "ACCOUNT", account_code: "1210", account_name: "Trade debtors", kind: "ASSET", is_control: true, is_active: true, total_debit: "150.00", total_credit: "40.00", natural_balance: "110.00" }),
      tbRow({ ordinal: 3, row_kind: "ACCOUNT", account_code: "4100", account_name: "Sales", kind: "INCOME", is_active: true, total_debit: "0", total_credit: "110.00", natural_balance: "110.00" }),
      tbRow({ ordinal: 4, row_kind: "TOTAL", total_debit: "150.00", total_credit: "150.00", balances: true }),
    ])));
    const res = await get("/trial-balance?asOf=2026-09-10");
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("gl_trial_balance", { p_as_of: "2026-09-10" });
    const body = await json(res);
    expect(body.status).toBe("ok");
    expect(body.accounts.map((a: AnyJson) => a.account_code)).toEqual(["1210", "4100"]);
    expect(body).toMatchObject({ total_debit: 150, total_credit: 150, difference: 0, balances: true });
  });

  it("defaults to today in Malaysia", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-10T17:30:00Z")); // 01:30 on the 11th in Malaysia
    try {
      const { sb } = fakeClient(chartAnswer(ok([tbRow({ row_kind: "TOTAL", total_debit: 0, total_credit: 0, balances: true })])));
      await get("/trial-balance");
      expect(sb.rpc).toHaveBeenCalledWith("gl_trial_balance", { p_as_of: "2026-09-11" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("says the day is before the ledger started instead of showing zeros", async () => {
    fakeClient(chartAnswer(ok([tbRow({ report_status: "BEFORE_GO_LIVE", as_of: "2026-08-01", row_kind: "NOTICE" })])));
    const body = await json(await get("/trial-balance?asOf=2026-08-01"));
    expect(body).toMatchObject({ status: "before_go_live", accounts: [], difference: null });
  });

  it("maps a ledger with no start date to 409", async () => {
    fakeClient(chartAnswer(fail("55000")));
    const res = await get("/trial-balance");
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe("ledger_not_started");
  });

  it("fails closed on an empty answer", async () => {
    fakeClient(chartAnswer(ok([])));
    expect((await get("/trial-balance")).status).toBe(500);
  });

  it("refuses a date that is not a date", async () => {
    expect((await get("/trial-balance?asOf=10/09/2026")).status).toBe(422);
    expect(userClient).not.toHaveBeenCalled();
  });
});

describe("GET /account-ledger", () => {
  it("reads the account in pages and returns every row", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      report_status: "OK", go_live_on: "2026-09-01", account_code: "1210", account_name: "Trade debtors",
      kind: "ASSET", ordinal: i + 1, row_kind: "LINE", debit: "1.00", credit: "0", running_balance: String(i + 1),
    }));
    const page2 = [{ report_status: "OK", go_live_on: "2026-09-01", ordinal: 1001, row_kind: "CLOSING", running_balance: "1000.00" }];
    const { calls } = fakeClient((call) => (ops(call, "range")[0]![1] === 0 ? ok(page1) : ok(page2)));
    const res = await get("/account-ledger?account=1210&from=2026-09-01&to=2026-09-30");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.rows).toHaveLength(1001);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.args).toEqual({ p_account_code: "1210", p_from: "2026-09-01", p_to: "2026-09-30" });
    expect(ops(calls[1], "range")).toEqual([["range", 1000, 1999]]);
  });

  it("needs an account and both dates", async () => {
    expect((await get("/account-ledger?account=1210&from=2026-09-01")).status).toBe(422);
  });
});

describe("GET /health", () => {
  it("returns the rows without the database wording", async () => {
    fakeClient(() => ok([{
      ordinal: 1, check_key: "go_live_on", check_label: "Go-live", status: "OK",
      detail: "select ... from gl_config", date_value: "2026-09-01", count_value: null, amount_value: null,
    }]));
    const body = await json(await get("/health"));
    expect(body.rows[0]).toMatchObject({ check_key: "go_live_on", date_value: "2026-09-01" });
    expect(body.rows[0]).not.toHaveProperty("detail");
  });

  it("treats no rows as a failure, not a healthy ledger", async () => {
    fakeClient(() => ok([]));
    expect((await get("/health")).status).toBe(500);
  });
});

// ── the self-check ───────────────────────────────────────────────────────────

const SUP_A = "5a5a5a5a-0000-4000-8000-000000000001";
const SUP_B = "5a5a5a5a-0000-4000-8000-000000000002";
const CUST = "cccccccc-0000-4000-8000-000000000001";

const controlRows = [
  { account_code: "1210", account_name: "Trade debtors", kind: "ASSET", control_for: "CUSTOMER", is_active: true, row_kind: "ACCOUNT", total_debit: "105", total_credit: "40", natural_balance: "65", line_count: 3 },
  { account_code: "1210", row_kind: "PARTY", party_type: "CUSTOMER", party_id: CUST, party_name: "Test Customer One", party_matches: true, total_debit: "100", total_credit: "40", natural_balance: "60", line_count: 2 },
  { account_code: "1210", row_kind: "PARTY", party_type: "SUPPLIER", party_id: SUP_A, party_name: "Test Supplier A", party_matches: false, total_debit: "5", total_credit: "0", natural_balance: "5", line_count: 1, entry_nos: ["JE-202609-0009"] },
  { account_code: "1240", account_name: "Other debtors", kind: "ASSET", control_for: "CUSTOMER", is_active: true, row_kind: "ACCOUNT", total_debit: "0", total_credit: "0", natural_balance: "0", line_count: 0 },
  { account_code: "2110", account_name: "Trade creditors", kind: "LIABILITY", control_for: "SUPPLIER", is_active: true, row_kind: "ACCOUNT", total_debit: "0", total_credit: "35", natural_balance: "35", line_count: 2 },
  { account_code: "2110", row_kind: "NO_PARTY", total_debit: "0", total_credit: "5", natural_balance: "5", line_count: 1, entry_nos: ["JE-202609-0009"] },
  { account_code: "2110", row_kind: "PARTY", party_type: "SUPPLIER", party_id: SUP_A, party_name: "Test Supplier A", party_matches: true, total_debit: "0", total_credit: "30", natural_balance: "30", line_count: 1 },
];

function selfCheckAnswer(overrides: Partial<Record<string, Result>> = {}) {
  return (call: Call): Result => {
    const hit = overrides[call.name];
    if (hit) return hit;
    switch (call.name) {
      case "gl_trial_balance_check":
        return ok([{
          checked_at: "2026-09-10T00:00:00Z", go_live_on: "2026-09-01", entry_count: 4, line_count: 8,
          total_debit: "140", total_credit: "140", difference: "0", header_mismatch_count: 0, balanced: true,
        }]);
      case "gl_ledger_health":
        return ok([{ ordinal: 1, check_key: "go_live_on", check_label: "Go-live", status: "OK", date_value: "2026-09-01" }]);
      case "gl_control_party_balances":
        return ok(controlRows);
      case "gl_receivables_reconcile":
        return ok([{
          ar_account_code: "1210", go_live_on: "2026-09-01", comparable: true, ledger_ar_balance: "60",
          operational_ar_balance: "60", difference: "0", unposted_invoice_count: 0, unposted_invoice_amount: "0",
          missing_first: "internal text",
        }]);
      case "ap_outstanding":
        return ok([
          { supplier_id: SUP_A, supplier_name: "Test Supplier A", balance_owing: "30" },
          { supplier_id: SUP_B, supplier_name: "Test Supplier B", balance_owing: "12.50" },
        ]);
      default:
        return ok([]);
    }
  };
}

describe("GET /self-check", () => {
  it("checks the books, every control account, receivables, payables and health", async () => {
    const { calls } = fakeClient(selfCheckAnswer());
    const res = await get("/self-check");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.go_live_on).toBe("2026-09-01");
    expect(body.books).toMatchObject({ ok: true, balanced: true, difference: 0 });

    // Every control account from the chart shows — a new one with no code change.
    expect(body.controls.ok).toBe(true);
    expect(body.controls.accounts.map((a: AnyJson) => a.account_code)).toEqual(["1210", "1240", "2110"]);
    const ar = body.controls.accounts[0];
    expect(ar.findings).toEqual([
      expect.objectContaining({ kind: "wrong_party", party_type: "SUPPLIER", entry_nos: ["JE-202609-0009"] }),
    ]);
    expect(ar.open_party_count).toBe(2);
    const ap = body.controls.accounts[2];
    expect(ap.findings).toEqual([expect.objectContaining({ kind: "no_party", total_credit: 5, entry_nos: ["JE-202609-0009"] })]);

    expect(body.receivables).toMatchObject({ ok: true, comparable: true, difference: 0 });
    expect(body.receivables).not.toHaveProperty("missing_first");

    // Payables: the ledger has A at 30 and nothing for B; the bills say A 30, B 12.50.
    expect(body.payables).toMatchObject({
      ok: true, account_codes: ["2110"], ledger_total: 30, bills_total: 42.5, difference: -12.5, supplier_difference_count: 1,
    });
    expect(body.payables.suppliers).toEqual([
      { supplier_id: SUP_B, supplier_name: "Test Supplier B", ledger_owing: 0, bills_owing: 12.5, difference: -12.5 },
    ]);

    const control = calls.find((c) => c.name === "gl_control_party_balances")!;
    expect(ops(control, "order").map((o) => o[1])).toEqual(["account_code", "row_kind", "party_type", "party_id"]);
    expect(ops(control, "range")).toEqual([["range", 0, 999]]);

    // No rental month is waiting for its entry: the healthy answer.
    expect(body.rentals).toEqual({ ok: true, months: [], month_count: 0, amount: 0 });
  });

  it("names every rental month collected with no ledger entry", async () => {
    fakeClient(selfCheckAnswer({
      gl_rental_payments_unposted: ok([
        { billing_id: "b1", agreement_id: "a1", agreement_no: "RA-9001", seq: 3, paid_on: "2026-09-10",
          paid_amount: "120.50", method: "card", reference: null, stripe_invoice_id: null, doc_no: "RA-9001-M03" },
        { billing_id: "b2", agreement_id: "a1", agreement_no: "RA-9001", seq: 4, paid_on: "2026-09-11",
          paid_amount: "120.50", method: "card", reference: null, stripe_invoice_id: null, doc_no: "RA-9001-M04" },
      ]),
    }));
    const body = await json(await get("/self-check"));
    expect(body.rentals).toMatchObject({ ok: true, month_count: 2, amount: 241 });
    expect(body.rentals.months[0]).toEqual({
      agreement_no: "RA-9001", seq: 3, paid_on: "2026-09-10", paid_amount: 120.5, doc_no: "RA-9001-M03",
    });
  });

  it("says plainly when this server has no rental read yet", async () => {
    fakeClient(selfCheckAnswer({ gl_rental_payments_unposted: fail("PGRST202") }));
    const body = await json(await get("/self-check"));
    expect(body.rentals).toEqual({ ok: false, message: "Rental months are not checked on this server yet." });
    expect(body.books.ok).toBe(true);
  });

  it("marks one unreadable section as not checked, and never as zero", async () => {
    fakeClient(selfCheckAnswer({ gl_receivables_reconcile: fail("XX000") }));
    const res = await get("/self-check");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.receivables).toEqual({ ok: false, message: "Customer receivables could not be checked. Try again." });
    expect(body.books.ok).toBe(true);
  });

  it("cannot check payables when the control accounts were not read", async () => {
    fakeClient(selfCheckAnswer({ gl_control_party_balances: fail("XX000") }));
    const body = await json(await get("/self-check"));
    expect(body.controls.ok).toBe(false);
    expect(body.payables.ok).toBe(false);
  });

  it("refuses the whole page when the ledger refuses the reader", async () => {
    fakeClient(selfCheckAnswer({ gl_ledger_health: fail("42501") }));
    expect((await get("/self-check")).status).toBe(403);
  });

  it("refuses the whole page when the rental read refuses the reader", async () => {
    fakeClient(selfCheckAnswer({ gl_rental_payments_unposted: fail("42501") }));
    expect((await get("/self-check")).status).toBe(403);
  });
});

describe("statements, passed through", () => {
  it("profit and loss asks for the period", async () => {
    const { sb } = fakeClient(() => ok([{ report_status: "OK", row_kind: "TOTAL", amount: 0 }]));
    expect((await get("/profit-and-loss?from=2026-09-01&to=2026-09-30")).status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("gl_profit_and_loss", { p_from: "2026-09-01", p_to: "2026-09-30" });
  });

  it("balance sheet asks for the day", async () => {
    const { sb } = fakeClient(() => ok([{ report_status: "OK", row_kind: "TOTAL" }]));
    expect((await get("/balance-sheet?asOf=2026-09-30")).status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("gl_balance_sheet", { p_as_of: "2026-09-30" });
  });
});
