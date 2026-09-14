import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";
import { _resetKeyedJournalLiveForTesting } from "./manual-journals";

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
  _resetKeyedJournalLiveForTesting();
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

  const UNKNOWN = "The answer did not come back. Check the Journal for this entry before you record it again.";
  it.each<[string, Result]>([
    ["a gateway page with no SQLSTATE", { data: null, error: { message: "<html><body>502 Bad Gateway internal</body></html>" } }],
    ["an empty code", { data: null, error: { code: "", message: "fetch failed internal" } }],
    ["no id and no error", { data: null, error: null }],
  ])("answers 503 outcome_unknown, never \"try again\", for %s", async (_name, rpc) => {
    happy({ rpc });
    const res = await post(OPENING);
    expect(res.status).toBe(503);
    const out = await json(res);
    expect(out).toMatchObject({ code: "outcome_unknown", message: UNKNOWN });
    expect(JSON.stringify(out)).not.toMatch(/internal|html|Try again/);
  });

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

// ── the request key (0502) ───────────────────────────────────────────────────

describe("manual journal — a resend with the same request key", () => {
  const KEY = "5e5e5e5e-0000-4000-8000-000000000001";
  const KEYED = { ...OPENING, requestKey: KEY };
  const READ_BACK = ok({ entry_no: "JE-202609-0007", source_doc_no: "MJ-202609-0001" });

  /** A database with 0502 applied: the keyed function remembers each key and
   *  the details it came with, the way `gl_manual_journal_requests` does. */
  function keyedDatabase() {
    const seen = new Map<string, { id: string; details: string }>();
    let posted = 0;
    const fake = fakeClient((call) => {
      if (call.kind === "from" && call.name === "gl_config") return ok({ go_live_on: "2026-09-10" });
      if (call.kind === "from" && call.name === "gl_entries") return READ_BACK;
      if (call.kind === "rpc" && call.name === "gl_manual_journal") {
        const { p_request_key: key, ...details } = call.args as AnyJson;
        const first = key ? seen.get(key) : undefined;
        if (first) {
          return first.details === JSON.stringify(details)
            ? ok(first.id)
            : refused("P0001", "idempotency_mismatch",
                "gl_manual_journal refused: this request was already recorded as JE-202609-0007 with different details");
        }
        posted += 1;
        const id = `aaaaaaaa-0000-4000-8000-00000000000${posted}`;
        if (key) seen.set(key, { id, details: JSON.stringify(details) });
        return ok(id);
      }
      throw new Error(`unexpected call ${call.kind} ${call.name}`);
    });
    return { ...fake, posted: () => posted };
  }

  it("passes the key to the keyed function when it is sent", async () => {
    const { calls } = happy();
    expect((await post(KEYED)).status).toBe(201);
    const rpc = calls.filter((c) => c.kind === "rpc");
    expect(rpc).toHaveLength(1);
    expect(Object.keys(rpc[0]?.args as AnyJson).sort()).toEqual(["p_entry_date", "p_lines", "p_narration", "p_request_key"]);
    expect((rpc[0]?.args as AnyJson).p_request_key).toBe(KEY);
  });

  it("same key, same details: the same entry id, and nothing new is posted", async () => {
    const db = keyedDatabase();
    const first = await post(KEYED);
    const second = await post(KEYED);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect((await json(second)).id).toBe((await json(first)).id);
    expect(db.posted()).toBe(1);
  });

  it("same key, different details: refused with 409, naming the entry already recorded", async () => {
    const db = keyedDatabase();
    expect((await post(KEYED)).status).toBe(201);
    const changed = await post({
      ...KEYED,
      lines: [{ account_code: "1120", debit: 200 }, { account_code: "3300", credit: 200 }],
    });
    expect(changed.status).toBe(409);
    expect(await json(changed)).toMatchObject({
      code: "idempotency_mismatch",
      message: "This entry was already recorded as JE-202609-0007 before it was changed. Open it in the Journal. To record another, start a New journal entry.",
    });
    expect(db.posted()).toBe(1);
  });

  it("no key: the old call, and every press is a new entry", async () => {
    const db = keyedDatabase();
    const a = await post(OPENING);
    const b = await post(OPENING);
    expect((await json(a)).id).not.toBe((await json(b)).id);
    expect(db.posted()).toBe(2);
    for (const c of db.calls.filter((x) => x.kind === "rpc")) {
      expect(Object.keys(c.args as AnyJson)).not.toContain("p_request_key");
    }
  });

  it("refuses a key that is not a uuid before any database call", async () => {
    const { calls } = happy();
    const res = await post({ ...OPENING, requestKey: "not-a-key" });
    expect(res.status).toBe(422);
    expect(calls).toEqual([]);
  });

  describe("before 0502 is applied", () => {
    it.each(["PGRST202", "42883"])("falls back to the old call when the keyed function is not found (%s)", async (code) => {
      const { calls } = fakeClient((call) => {
        if (call.kind === "from" && call.name === "gl_config") return ok({ go_live_on: "2026-09-10" });
        if (call.kind === "from" && call.name === "gl_entries") return READ_BACK;
        if (call.kind === "rpc" && "p_request_key" in (call.args as AnyJson)) {
          return { data: null, error: { code, message: "Could not find the function public.gl_manual_journal" } };
        }
        if (call.kind === "rpc") return ok(ENTRY_ID);
        throw new Error(`unexpected call ${call.kind} ${call.name}`);
      });
      const res = await post(KEYED);
      expect(res.status).toBe(201);
      expect((await json(res)).id).toBe(ENTRY_ID);
      const rpc = calls.filter((c) => c.kind === "rpc");
      expect(rpc).toHaveLength(2);
      expect(Object.keys(rpc[1]?.args as AnyJson).sort()).toEqual(["p_entry_date", "p_lines", "p_narration"]);
    });

    it("keeps \"check the Journal first\" when the fallback call's answer does not come back", async () => {
      fakeClient((call) => {
        if (call.kind === "from" && call.name === "gl_config") return ok({ go_live_on: "2026-09-10" });
        if (call.kind === "rpc" && "p_request_key" in (call.args as AnyJson)) {
          return { data: null, error: { code: "PGRST202", message: "not found" } };
        }
        if (call.kind === "rpc") return { data: null, error: { message: "fetch failed" } };
        throw new Error(`unexpected call ${call.kind} ${call.name}`);
      });
      const res = await post(KEYED);
      expect(res.status).toBe(503);
      expect(await json(res)).toMatchObject({
        code: "outcome_unknown",
        retry_safe: false,
        message: "The answer did not come back. Check the Journal for this entry before you record it again.",
      });
    });

    it("never falls back on any other refusal — the keyed function answered", async () => {
      const { calls } = happy({ rpc: refused("23514", "gl_post_out_of_balance") });
      const res = await post(KEYED);
      expect(res.status).toBe(422);
      expect(calls.filter((c) => c.kind === "rpc")).toHaveLength(1);
    });
  });

  describe("an unknown outcome once the key is live", () => {
    it("says a second press is safe once the keyed function has answered in this isolate", async () => {
      let n = 0;
      fakeClient((call) => {
        if (call.kind === "from" && call.name === "gl_config") return ok({ go_live_on: "2026-09-10" });
        if (call.kind === "from" && call.name === "gl_entries") return READ_BACK;
        if (call.kind === "rpc") {
          n += 1;
          return n === 1 ? ok(ENTRY_ID) : { data: null, error: { message: "<html>502 Bad Gateway</html>" } };
        }
        throw new Error(`unexpected call ${call.kind} ${call.name}`);
      });
      expect((await post(KEYED)).status).toBe(201);
      const res = await post({ ...KEYED, requestKey: "5e5e5e5e-0000-4000-8000-000000000002" });
      expect(res.status).toBe(503);
      expect(await json(res)).toMatchObject({
        code: "outcome_unknown",
        retry_safe: true,
        message: "The answer did not come back. Press Record journal entry again. This entry is never recorded twice.",
      });
    });

    it("stays careful when nothing yet shows the keyed function is live", async () => {
      happy({ rpc: { data: null, error: { message: "<html>502 Bad Gateway</html>" } } });
      const res = await post(KEYED);
      expect(res.status).toBe(503);
      expect(await json(res)).toMatchObject({ retry_safe: false });
    });

    it("does not count an unkeyed press as proof the key is live", async () => {
      let n = 0;
      fakeClient((call) => {
        if (call.kind === "from" && call.name === "gl_config") return ok({ go_live_on: "2026-09-10" });
        if (call.kind === "from" && call.name === "gl_entries") return READ_BACK;
        if (call.kind === "rpc") {
          n += 1;
          return n === 1 ? ok(ENTRY_ID) : { data: null, error: { message: "fetch failed" } };
        }
        throw new Error(`unexpected call ${call.kind} ${call.name}`);
      });
      expect((await post(OPENING)).status).toBe(201);
      expect(await json(await post(KEYED))).toMatchObject({ retry_safe: false });
    });
  });
});
