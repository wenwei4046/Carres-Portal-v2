import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import { authMiddleware, _setJwksForTesting } from "../../middleware/auth";
import issuesRouter from "./issues";
import type { AppEnv } from "../../types";

/**
 * HF-2 · Issue Tracker data safety (owner ruling 2026-09-17).
 *
 *  1. Create writes through ONE door (0526). The route itself writes no table,
 *     so a failure can never leave half an Issue behind, and the same request
 *     id answers with the same Issue.
 *  2. A database refusal reaches the browser as the 4xx it is.
 *  3. `Internal issues` returns only Issues with an internal-staff fault owner.
 *  4. The monthly report counts only Issues observed in that month, never a
 *     null Issue, and a row lands in exactly one section.
 *  5. A refused result names the acting person when the resolver knows them.
 */

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "unused" };
const ME = "11111111-1111-1111-1111-000000000999";
const SHASHA = "11111111-1111-1111-1111-000000000777";
const PARTY = "44444444-4444-4444-4444-444444444444";
const REQUEST = "55555555-5555-5555-5555-555555555555";

const app = (() => {
  const root = new Hono<AppEnv>();
  root.onError((err, c) => c.json({ error: "server_error", message: (err as Error).message }, ((err as { status?: number }).status ?? 500) as 500));
  const api = new Hono<AppEnv>();
  api.use("*", authMiddleware);
  api.route("/ops/issues", issuesRouter);
  root.route("/api", api);
  return root;
})();

type Result = { data: unknown; error: { code?: string; message: string } | null };
type Call = { table: string; op: string; args: unknown[] };

/** A Supabase double that keeps what was written, so an orphan is countable. */
function buildSb(opts: {
  select?: Record<string, unknown>;
  failInsertInto?: string;
  rpc?: (name: string, args: Record<string, unknown>) => Result;
} = {}) {
  const calls: Call[] = [];
  const written: Record<string, unknown[]> = {};
  let seq = 0;
  const from = (table: string) => {
    let result: Result = { data: opts.select?.[table] ?? [], error: null };
    const chain: Record<string, unknown> = {
      then: (ok: (v: Result) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result).then(ok, bad),
    };
    for (const op of ["select", "eq", "neq", "in", "is", "or", "not", "order", "limit", "gte", "lt", "update"]) {
      chain[op] = (...args: unknown[]) => { calls.push({ table, op, args }); return chain; };
    }
    chain.insert = (rows: unknown) => {
      calls.push({ table, op: "insert", args: [rows] });
      if (opts.failInsertInto === table) { result = { data: null, error: { code: "XX000", message: `${table} unavailable` } }; return chain; }
      const list = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ id: `row-${++seq}`, issue_no: `IS-2609-000${seq}`, ...(r as object) }));
      (written[table] ??= []).push(...list);
      result = { data: list, error: null };
      return chain;
    };
    chain.single = () => {
      const d = result.data;
      return Promise.resolve({ ...result, data: Array.isArray(d) ? d[0] ?? null : d });
    };
    return chain;
  };
  const sb = {
    from: vi.fn(from),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ table: `rpc:${name}`, op: "rpc", args: [args] });
      if (name === "actor_display_names") return { data: [{ id: SHASHA, name: "Shasha" }], error: null };
      return opts.rpc?.(name, args) ?? { data: null, error: null };
    }),
  };
  return { sb, calls, written };
}

async function send(path: string, sb: unknown, init: RequestInit = {}) {
  vi.mocked(userClient).mockReturnValue(sb as never);
  const jwt = await signTestJwt(ME, { email: "yujun@carres.com", app_metadata: { role: "operation" } });
  return app.request(`/api${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}`, ...(init.headers ?? {}) } }, env);
}
const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

const CREATE = {
  requestId: REQUEST,
  intake: {
    problemObject: "item", observedProblem: "damaged", foundByKind: "me", foundByName: "Yu Jun", observedOn: "2026-09-16",
    linkedObjects: [{ kind: "sales_order", id: "SO-1319", label: "SO-1319" }], affectedObject: "Sofa", impact: "Delivery cannot continue",
    evidence: [{ kind: "photo", count: 1 }],
  },
  sourceModule: "sales_order", materiality: "routine",
  currentAction: { trigger: "Delivery cannot continue", ownerRule: "issue_triage_duty", action: "Send the issue proof and ask for acceptance", recipient: "Hookka", requiredResult: "Acceptance or rejection is recorded", dueOn: "2026-09-18" },
};

beforeEach(() => { useTestJwks(); vi.mocked(userClient).mockReset(); });
afterAll(() => _setJwksForTesting(null));

describe("POST /ops/issues — one door", () => {
  it("leaves no Issue behind when the proof cannot be written", async () => {
    const { sb, written } = buildSb({
      failInsertInto: "issue_evidence",
      rpc: (name) => name === "issue_record_issue" ? { data: null, error: { code: "XX000", message: "issue_evidence unavailable" } } : { data: null, error: null },
    });
    const res = await send("/ops/issues", sb, post(CREATE));
    expect(res.status).toBe(500);
    expect(written.issues ?? []).toHaveLength(0);
  });

  it("answers the same request id with the same Issue", async () => {
    const recorded = new Map<string, { id: string; issue_no: string; official_english: string; replayed: boolean }>();
    const { sb, written } = buildSb({
      rpc: (name, args) => {
        if (name !== "issue_record_issue") return { data: null, error: null };
        const key = String(args.p_request_id);
        const prior = recorded.get(key);
        if (prior) return { data: { ...prior, replayed: true }, error: null };
        const next = { id: `issue-${recorded.size + 1}`, issue_no: `IS-2609-000${recorded.size + 1}`, official_english: "Sofa was damaged.", replayed: false };
        recorded.set(key, next);
        return { data: next, error: null };
      },
    });
    const first = await (await send("/ops/issues", sb, post(CREATE))).json() as { id: string };
    const second = await (await send("/ops/issues", sb, post(CREATE))).json() as { id: string };
    expect(second.id).toBe(first.id);
    expect(recorded.size).toBe(1);
    expect(written.issues ?? []).toHaveLength(0);
  });

  it("sends the Issue, links, proof and first action to the door in one call", async () => {
    const { sb, calls } = buildSb({ rpc: () => ({ data: { id: "issue-1", issue_no: "IS-2609-0001", official_english: "x", replayed: false }, error: null }) });
    const res = await send("/ops/issues", sb, post(CREATE));
    expect(res.status).toBe(201);
    const doors = calls.filter((c) => c.table === "rpc:issue_record_issue");
    expect(doors).toHaveLength(1);
    const args = doors[0]!.args[0] as Record<string, unknown>;
    expect(args.p_request_id).toBe(REQUEST);
    expect(args.p_links).toEqual([{ kind: "sales_order", id: "SO-1319", label: "SO-1319" }]);
    expect(args.p_evidence).toEqual([{ kind: "photo", label: "1 photo" }]);
    expect(calls.filter((c) => c.op === "insert" || c.op === "update")).toHaveLength(0);
  });

  it.each([
    ["42501", 403], ["22023", 422], ["23514", 422], ["23502", 422], ["22007", 422], ["23505", 409], ["XX000", 500],
  ])("maps database code %s to HTTP %i", async (code, status) => {
    const { sb } = buildSb({ rpc: (name) => name === "issue_record_issue" ? { data: null, error: { code, message: "refused" } } : { data: null, error: null } });
    expect((await send("/ops/issues", sb, post(CREATE))).status).toBe(status);
  });

  it("names the refused field so the dialog can point at its step", async () => {
    const { sb } = buildSb();
    const res = await send("/ops/issues", sb, post({ ...CREATE, intake: { ...CREATE.intake, observedOn: "yesterday" } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ path: "intake.observedOn" });
  });

  it("refuses a create without a request id", async () => {
    const { sb } = buildSb();
    const { requestId: _omit, ...rest } = CREATE;
    expect((await send("/ops/issues", sb, post(rest))).status).toBe(400);
  });
});

describe("GET /ops/issues?view=internal", () => {
  it("joins fault owners as an inner filter so only internal-staff Issues return", async () => {
    const { sb, calls } = buildSb();
    await send("/ops/issues?view=internal", sb);
    const select = String(calls.find((c) => c.table === "issues" && c.op === "select")!.args[0]);
    expect(select).toContain("issue_fault_owners!inner(");
    expect(calls.some((c) => c.op === "eq" && c.args[0] === "issue_fault_owners.owner_kind" && c.args[1] === "internal_staff")).toBe(true);
  });

  it("keeps Issues without a fault owner in every other view", async () => {
    const { sb, calls } = buildSb();
    await send("/ops/issues?view=all", sb);
    const select = String(calls.find((c) => c.table === "issues" && c.op === "select")!.args[0]);
    expect(select).not.toContain("!inner");
  });
});

describe("GET /ops/issues/reports/:partyId", () => {
  const owner = (over: Record<string, unknown>, issue: Record<string, unknown> | null) => ({
    finding: "confirmed_fault", response: "no_response", act_or_omission: "Sent the wrong colour", ...over,
    issues: issue && { id: `id-${issue.issue_no}`, official_english: "x", issue_links: [], issue_evidence: [], issue_money_links: [], ...issue },
  });
  const rows = [
    owner({ response: "disagree" }, { issue_no: "IS-A", observed_on: "2026-09-03", issue_money_links: [{ track: "incurred", amount: "1280", cost_bearer_id: null }] }),
    owner({}, { issue_no: "IS-AUG", observed_on: "2026-08-20" }),
    owner({}, null),
    owner({ finding: "not_yet_confirmed" }, { issue_no: "IS-C", observed_on: "2026-09-30" }),
  ];

  it("counts only this month's Issues, never a null Issue, each in one section", async () => {
    const { sb, calls } = buildSb({ select: { issue_related_parties: [{ id: PARTY, name: "Hookka" }], issue_fault_owners: rows } });
    const body = await (await send(`/ops/issues/reports/${PARTY}?month=2026-09`, sb)).json() as {
      sections: Record<string, Array<{ issueNo: string }>>; totals: { distinctIssues: number; incurred: number };
    };
    const select = String(calls.find((c) => c.table === "issue_fault_owners" && c.op === "select")!.args[0]);
    expect(select).toContain("issues!inner(");
    const all = Object.values(body.sections).flat().map((r) => r.issueNo);
    expect(all).not.toContain("IS-AUG");
    expect(all.filter((n) => n === "IS-A")).toHaveLength(1);
    expect(body.sections.disputed!.map((r) => r.issueNo)).toEqual(["IS-A"]);
    expect(body.sections.confirmed).toEqual([]);
    expect(body.sections.waiting!.map((r) => r.issueNo)).toEqual(["IS-C"]);
    expect(body.totals.distinctIssues).toBe(2);
    expect(body.totals.incurred).toBe(1280);
  });
});

describe("POST /ops/issues/:id/actions/:actionId/result", () => {
  const refused = (resolver: Result) => buildSb({
    select: { issue_actions: [{ owner_rule: "issue_triage_duty" }] },
    rpc: (name) => name === "issue_record_action_result"
      ? { data: null, error: { code: "42501", message: "current Duty or cover must record this result" } }
      : name === "workspace_resolve_duty" ? resolver : { data: null, error: null },
  });
  const body = { resultCode: "accepted", result: "Supplier accepted" };

  it("names the acting person on a refusal", async () => {
    const { sb } = refused({ data: { actor_user_id: SHASHA }, error: null });
    const res = await send("/ops/issues/i1/actions/a1/result", sb, post(body));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "forbidden", actingPerson: "Shasha" });
  });

  it("names nobody when the resolver cannot answer", async () => {
    const { sb } = refused({ data: null, error: { code: "XX000", message: "down" } });
    const res = await send("/ops/issues/i1/actions/a1/result", sb, post(body));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ actingPerson: null });
  });

  it("answers a changed action as 404", async () => {
    const { sb } = buildSb({ rpc: () => ({ data: null, error: { code: "P0002", message: "current action not found" } }) });
    expect((await send("/ops/issues/i1/actions/a1/result", sb, post(body))).status).toBe(404);
  });
});
