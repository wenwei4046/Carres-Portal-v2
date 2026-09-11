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

// ── a recording stand-in for the supabase client (ledger.test.ts's shape) ──

type Op = [string, ...unknown[]];
type Call = { kind: "from" | "rpc"; name: string; args?: unknown; ops: Op[] };
type Result = { data: unknown; error: { code?: string; message?: string; details?: string } | null };

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

async function post(body: unknown, role = "principal") {
  const jwt = await makeJwt(role);
  return app.fetch(
    new Request("http://t/api/finance/manual-journals", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJson = Record<string, any>;
const json = async (res: Response) => (await res.json()) as AnyJson;

const ok = (data: unknown): Result => ({ data, error: null });
const refused = (code: string, details: string, message = "gl_post refused: something internal"): Result => ({
  data: null,
  error: { code, details, message },
});

const ENTRY_ID = "aaaaaaaa-0000-4000-8000-000000000001";

/** An opening bank balance: Dr 1120 Bank / Cr 3300 Opening balance equity. */
const OPENING = {
  entry_date: "2026-09-10",
  narration: "Opening bank balance",
  lines: [
    { account_code: "1120", debit: 12500.5, memo: "Test bank statement" },
    { account_code: "3300", credit: 12500.5 },
  ],
};

/** The database's happy path: the chart's start date, the entry, its numbers. */
function happy(overrides: Partial<Record<"config" | "rpc" | "entry", Result>> = {}) {
  return fakeClient((call) => {
    if (call.kind === "from" && call.name === "gl_config") return overrides.config ?? ok({ go_live_on: "2026-09-10" });
    if (call.kind === "rpc" && call.name === "gl_manual_journal") return overrides.rpc ?? ok(ENTRY_ID);
    if (call.kind === "from" && call.name === "gl_entries") {
      return overrides.entry ?? ok({ entry_no: "JE-202609-0007", source_doc_no: "MJ-202609-0001" });
    }
    throw new Error(`unexpected call ${call.kind} ${call.name}`);
  });
}

// ── the guard ────────────────────────────────────────────────────────────────

describe("manual journal — who may record", () => {
  it.each(["finance", "operation", "dealer", "supplier", "hr"])(
    "refuses %s before any database call",
    async (role) => {
      const res = await post(OPENING, role);
      expect(res.status).toBe(403);
      expect((await json(res)).message).toBe("Only the principal may record a journal entry.");
      expect(userClient).not.toHaveBeenCalled();
    },
  );

  it("refuses a request with no sign-in", async () => {
    const res = await app.fetch(
      new Request("http://t/api/finance/manual-journals", { method: "POST", body: JSON.stringify(OPENING) }),
      env,
    );
    expect(res.status).toBe(401);
    expect(userClient).not.toHaveBeenCalled();
  });

  it("keeps the database's own refusal when the principal check fails there", async () => {
    happy({ rpc: refused("42501", "gl_manual_journal_forbidden", "gl_manual_journal refused: role finance may not raise a manual journal") });
    const res = await post(OPENING);
    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({
      code: "gl_manual_journal_forbidden",
      message: "Only the principal may record a journal entry.",
    });
  });
});

// ── the happy path ───────────────────────────────────────────────────────────

describe("manual journal — recording", () => {
  it("calls gl_manual_journal through the caller's own client and answers the new numbers", async () => {
    const { calls } = happy();
    const res = await post(OPENING);
    expect(res.status).toBe(201);
    expect(await json(res)).toEqual({ id: ENTRY_ID, entry_no: "JE-202609-0007", doc_no: "MJ-202609-0001" });

    // The caller's JWT is what the database's principal check reads.
    expect(vi.mocked(userClient).mock.calls[0]?.[1]).toMatch(/^ey/);

    const rpc = calls.find((c) => c.kind === "rpc");
    expect(rpc?.name).toBe("gl_manual_journal");
    expect(rpc?.args).toEqual({
      p_entry_date: "2026-09-10",
      p_narration: "Opening bank balance",
      p_lines: [
        { account_code: "1120", debit: 12500.5, credit: null, memo: "Test bank statement" },
        { account_code: "3300", debit: null, credit: 12500.5, memo: null },
      ],
    });
    const read = calls.find((c) => c.kind === "from" && c.name === "gl_entries");
    expect(read?.ops).toContainEqual(["eq", "id", ENTRY_ID]);
  });

  it("trims the narration and drops a blank memo", async () => {
    const { calls } = happy();
    const res = await post({
      ...OPENING,
      narration: "  Correction of a test entry  ",
      lines: [
        { account_code: "6100", debit: 10, memo: "   " },
        { account_code: "1110", credit: 10 },
      ],
    });
    expect(res.status).toBe(201);
    const args = calls.find((c) => c.kind === "rpc")?.args as AnyJson;
    expect(args.p_narration).toBe("Correction of a test entry");
    expect(args.p_lines[0].memo).toBeNull();
  });

  it("answers 201 with the id when the entry posted but its numbers could not be read back", async () => {
    happy({ entry: { data: null, error: { code: "57014", message: "canceling statement" } } });
    const res = await post(OPENING);
    expect(res.status).toBe(201);
    expect(await json(res)).toEqual({ id: ENTRY_ID, entry_no: null, doc_no: null });
  });

  it("still records when the start date could not be read — the database checks it again", async () => {
    const { calls } = happy({ config: { data: null, error: { code: "XX000", message: "boom" } } });
    const res = await post(OPENING);
    expect(res.status).toBe(201);
    expect(calls.some((c) => c.kind === "rpc")).toBe(true);
  });
});

// ── the body ─────────────────────────────────────────────────────────────────

describe("manual journal — the body is checked before the database", () => {
  const cases: Array<[string, unknown, string]> = [
    ["one line", { ...OPENING, lines: [OPENING.lines[0]] }, "A journal entry needs at least two lines."],
    ["a blank narration", { ...OPENING, narration: "   " }, "Type the narration."],
    ["no date", { ...OPENING, entry_date: "" }, "Choose the entry date."],
    ["a date that is not a day", { ...OPENING, entry_date: "2026-02-30" }, "Choose the entry date."],
    ["out of balance", {
      ...OPENING,
      lines: [{ account_code: "1120", debit: 100 }, { account_code: "3300", credit: 99.99 }],
    }, "Debits and credits must be equal."],
    ["a line with both sides", {
      ...OPENING,
      lines: [{ account_code: "1120", debit: 100, credit: 100 }, { account_code: "3300", credit: 100 }],
    }, "A line takes a debit or a credit, not both."],
    ["a line with neither side", {
      ...OPENING,
      lines: [{ account_code: "1120" }, { account_code: "3300", credit: 100 }],
    }, "Type a debit or a credit on every line."],
    ["a negative amount", {
      ...OPENING,
      lines: [{ account_code: "1120", debit: -100 }, { account_code: "3300", credit: -100 }],
    }, "The amount must be more than RM 0.00."],
    ["a third decimal", {
      ...OPENING,
      lines: [{ account_code: "1120", debit: 1.005 }, { account_code: "3300", credit: 1.005 }],
    }, "An amount has at most two decimals."],
    ["an amount typed as text", {
      ...OPENING,
      lines: [{ account_code: "1120", debit: "100" }, { account_code: "3300", credit: 100 }],
    }, "Type the amount in numbers, like 1500.00."],
    ["no account", {
      ...OPENING,
      lines: [{ account_code: "", debit: 100 }, { account_code: "3300", credit: 100 }],
    }, "Choose an account on every line."],
    ["a field the door does not take", {
      ...OPENING,
      lines: [{ account_code: "1210", debit: 100, party_type: "CUSTOMER" }, { account_code: "3300", credit: 100 }],
    }, ""],
  ];

  it.each(cases)("refuses %s with 422", async (_name, body, message) => {
    const { calls } = happy();
    const res = await post(body);
    expect(res.status).toBe(422);
    const out = await json(res);
    if (message) expect(out.message).toBe(message);
    expect(calls).toEqual([]);
  });

  it("refuses a date before the ledger started, naming the start day, without calling the journal", async () => {
    const { calls } = happy();
    const res = await post({ ...OPENING, entry_date: "2026-09-09" });
    expect(res.status).toBe(422);
    expect((await json(res)).message).toBe("The ledger started on 10 Sep 2026. Pick a day from then on.");
    expect(calls.some((c) => c.kind === "rpc")).toBe(false);
  });
});

// ── the database's refusals ──────────────────────────────────────────────────

describe("manual journal — the database's refusals become sentences", () => {
  const cases: Array<[string, Result, number, string]> = [
    ["a control account", refused("22023", "gl_manual_journal_control_account",
      "gl_manual_journal refused: line 1 names control account 1210 — AR and AP move only through their own documents"),
      422, "Line 1 uses a customer, supplier or other party account. Those accounts move only through their own documents."],
    ["out of balance", refused("23514", "gl_post_out_of_balance"), 422, "Debits and credits must be equal."],
    ["before the start date", refused("22023", "gl_post_entry_date_before_go_live",
      "gl_post refused: entry_date 2026-09-01 is before the ledger go-live date 2026-09-10"),
      422, "The ledger started on 10 Sep 2026. Pick a day from then on."],
    ["an account not in the chart", refused("23503", "gl_post_account_unknown",
      "gl_post refused: line 2 names account 9999, which is not in the chart"),
      422, "Line 2 names an account that is not in the chart."],
    ["a heading account", refused("22023", "gl_post_account_is_header",
      "gl_post refused: line 1 names account 1100, which is a header account and cannot be posted to"),
      422, "Line 1 names a heading account. Choose an account under it."],
    ["a retired account", refused("22023", "gl_post_account_inactive",
      "gl_post refused: line 2 names account 2310, which is retired"),
      422, "Line 2 names an account that is no longer in use."],
    ["no start date at all", refused("22023", "gl_post_no_go_live"), 409, "The ledger has no start date yet."],
    ["an amount too large", { data: null, error: { code: "22003", message: "numeric field overflow" } },
      422, "The total is larger than the ledger can hold."],
    ["a permission the database refused", { data: null, error: { code: "42501", message: "permission denied for function gl_manual_journal" } },
      403, "Only the principal may record a journal entry."],
    ["something that broke", { data: null, error: { code: "XX000", message: "internal detail" } },
      500, "The journal entry could not be recorded. Try again."],
  ];

  it.each(cases)("%s", async (_name, rpc, status, message) => {
    happy({ rpc });
    const res = await post(OPENING);
    expect(res.status).toBe(status);
    const out = await json(res);
    expect(out.message).toBe(message);
    expect(JSON.stringify(out)).not.toContain("internal");
  });

  it("never reads back an entry the database refused", async () => {
    const { calls } = happy({ rpc: refused("23514", "gl_post_out_of_balance") });
    await post(OPENING);
    expect(calls.some((c) => c.kind === "from" && c.name === "gl_entries")).toBe(false);
  });
});
