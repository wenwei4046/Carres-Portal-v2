import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

/**
 * /api/operation/workspace-duties — `Workspace → Staff & Duties` (0425).
 *
 * The claims under test: the GET resolves names and reports `can_assign` as
 * the SAME fact the write doors raise; the writes are thin — validated
 * camelCase in, one RPC's snake_case p_* out, and a SQL refusal comes back
 * with its own status, never a 500.
 */

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};

const HOLDER = "00000000-0000-0000-0000-0000000000aa";
const COVER = "00000000-0000-0000-0000-0000000000bb";
const MANAGER = "00000000-0000-0000-0000-0000000000cc";

async function makeJwt(role: string) {
  return signTestJwt("u1", { email: `${role}@x`, app_metadata: { role } });
}

type Result = { data: unknown; error: unknown };
type TableCfg = { list?: Result };

/** The scaffold's builder, with per-NAME rpc results — this router calls two
 *  different RPCs inside one GET, so a single shared result would lie. */
function makeSb(
  tables: Record<string, TableCfg>,
  rpcResults: Record<string, { data?: unknown; error?: unknown }> = {},
) {
  const sb = {
    rpc: vi.fn((fn: string) => {
      const r = rpcResults[fn] ?? {};
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    }),
    from(table: string) {
      const cfg = tables[table] ?? {};
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const m of ["select", "eq", "in", "order", "limit"])
        builder[m] = vi.fn(chain);
      builder.then = (
        resolve: (r: Result) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve(cfg.list ?? { data: [], error: null }).then(resolve, reject);
      return builder;
    },
  };
  return sb;
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

function req(path: string, method: string, jwt: string | null, body?: unknown) {
  return app.fetch(
    new Request(`http://t${path}`, {
      method,
      headers: {
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        "Content-Type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    env,
  );
}

function dutyTables() {
  return {
    workspace_duty_assignments: {
      list: {
        data: [
          {
            id: "a1",
            duty_key: "grn_duty",
            holder_id: HOLDER,
            effective_from: "2026-09-01",
            effective_until: null,
            assigned_by: MANAGER,
            note: "first holder",
            created_at: "2026-09-01T02:00:00Z",
          },
        ],
        error: null,
      },
    },
    workspace_duty_covers: {
      list: {
        data: [
          {
            id: "c1",
            duty_key: "grn_duty",
            normal_user_id: HOLDER,
            acting_user_id: COVER,
            starts_on: "2026-09-08",
            ends_on: "2026-09-10",
            reason: "annual leave",
            assigned_by: MANAGER,
            created_at: "2026-09-02T02:00:00Z",
          },
        ],
        error: null,
      },
    },
  };
}

const RESOLVED = {
  duty_key: "grn_duty",
  normal_user_id: HOLDER,
  acting_user_id: COVER,
  actor_user_id: COVER,
  is_cover: true,
  is_superuser: false,
  allowed: true,
  source: "assignment",
};

describe("who may open Staff & Duties", () => {
  it("401 without Authorization", async () => {
    expect(
      (await req("/api/operation/workspace-duties", "GET", null)).status,
    ).toBe(401);
  });

  it("403 for a dealer — duties are an Operations fact", async () => {
    const res = await req(
      "/api/operation/workspace-duties",
      "GET",
      await makeJwt("dealer"),
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/operation/workspace-duties", () => {
  it("returns the catalogue with resolved names, history and can_assign", async () => {
    const sb = makeSb(dutyTables(), {
      workspace_can_assign_duties: { data: true },
      workspace_resolve_duty: { data: RESOLVED },
      actor_display_names: {
        data: [
          { id: HOLDER, name: "Aina" },
          { id: COVER, name: "Buddy cover" },
          { id: MANAGER, name: "Jess" },
        ],
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      "/api/operation/workspace-duties",
      "GET",
      await makeJwt("operation"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      can_assign: boolean;
      duties: Array<Record<string, unknown>>;
    };
    expect(body.can_assign).toBe(true);
    expect(body.duties.map((d) => d.key)).toEqual([
      "po_duty",
      "grn_duty",
      "storage_waiver_approver",
      "purchasing_approver",
      "delivery_charge_approver",
      "payment_approver",
      "finance_approver",
      "stock_adjustment_approver",
      "service_case_approver",
      "issue_triage_duty",
      "issue_review_approver",
      "delivery_duty",
    ]);
    const grnDuty = body.duties.find((d) => d.key === "grn_duty")!;
    expect(grnDuty).toMatchObject({ key: "grn_duty", label: "GRN Duty" });
    expect(grnDuty.resolution).toMatchObject({
      normal_user_id: HOLDER,
      normal_user_name: "Aina",
      acting_user_id: COVER,
      acting_user_name: "Buddy cover",
      is_cover: true,
    });
    const assignments = grnDuty.assignments as Array<Record<string, unknown>>;
    expect(assignments[0]).toMatchObject({
      holder_name: "Aina",
      assigned_by_name: "Jess",
      note: "first holder",
    });
    const covers = grnDuty.covers as Array<Record<string, unknown>>;
    expect(covers[0]).toMatchObject({
      acting_user_name: "Buddy cover",
      normal_user_name: "Aina",
      assigned_by_name: "Jess",
    });
    // The resolution comes from the ONE resolver, never a page-side re-derive.
    expect(sb.rpc).toHaveBeenCalledWith("workspace_resolve_duty", {
      p_duty_key: "grn_duty",
      p_on: null,
    });
  });

  it("reports can_assign false for a reader — the same gate the write doors raise", async () => {
    const sb = makeSb(dutyTables(), {
      workspace_can_assign_duties: { data: false },
      workspace_resolve_duty: { data: RESOLVED },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      "/api/operation/workspace-duties",
      "GET",
      await makeJwt("operation"),
    );
    const body = (await res.json()) as { can_assign: boolean };
    expect(body.can_assign).toBe(false);
  });
});

describe("POST /assign", () => {
  it("422 on a body the schema refuses, before any RPC", async () => {
    const sb = makeSb(dutyTables());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    for (const body of [
      {},
      { dutyKey: "grn_duty" }, // no holder
      { dutyKey: "grn_duty", holderId: "not-a-uuid", effectiveFrom: "2026-09-04" },
      { dutyKey: "grn_duty", holderId: HOLDER, effectiveFrom: "04/09/2026" },
      { dutyKey: "grn_duty", holderId: HOLDER, effectiveFrom: "2026-09-04", extra: 1 },
    ]) {
      const res = await req(
        "/api/operation/workspace-duties/assign",
        "POST",
        await makeJwt("operation"),
        body,
      );
      expect(res.status).toBe(422);
    }
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("maps the camelCase body onto workspace_assign_duty's p_* params", async () => {
    const sb = makeSb(dutyTables(), {
      workspace_assign_duty: { data: { id: "a2" } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      "/api/operation/workspace-duties/assign",
      "POST",
      await makeJwt("operation"),
      {
        dutyKey: "grn_duty",
        holderId: HOLDER,
        effectiveFrom: "2026-09-04",
        effectiveUntil: "2026-09-30",
        note: "while Ben is on site",
      },
    );
    expect(res.status).toBe(201);
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(sb.rpc).toHaveBeenCalledWith("workspace_assign_duty", {
      p_duty_key: "grn_duty",
      p_holder_id: HOLDER,
      p_effective_from: "2026-09-04",
      p_effective_until: "2026-09-30",
      p_note: "while Ben is on site",
    });
  });

  it("an absent Until and note become null p_* params, not undefined", async () => {
    const sb = makeSb(dutyTables(), { workspace_assign_duty: { data: {} } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    await req(
      "/api/operation/workspace-duties/assign",
      "POST",
      await makeJwt("operation"),
      { dutyKey: "grn_duty", holderId: HOLDER, effectiveFrom: "2026-09-04" },
    );
    expect(sb.rpc).toHaveBeenCalledWith("workspace_assign_duty", {
      p_duty_key: "grn_duty",
      p_holder_id: HOLDER,
      p_effective_from: "2026-09-04",
      p_effective_until: null,
      p_note: null,
    });
  });

  it("a manager-gate refusal from the SQL door comes back as 403, not a 500", async () => {
    const sb = makeSb(dutyTables(), {
      workspace_assign_duty: {
        error: {
          code: "42501",
          message: "only a duty manager can assign duties",
          details: "not_duty_manager",
        },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      "/api/operation/workspace-duties/assign",
      "POST",
      await makeJwt("operation"),
      { dutyKey: "grn_duty", holderId: HOLDER, effectiveFrom: "2026-09-04" },
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string; message: string };
    // S2-A: a code, never the database's sentence.
    expect(body.code).toBe("unknown");
    expect(body.message).not.toContain("only a duty manager");
  });

  it("403 for a dealer before the body is even read", async () => {
    const res = await req(
      "/api/operation/workspace-duties/assign",
      "POST",
      await makeJwt("dealer"),
      { dutyKey: "grn_duty", holderId: HOLDER, effectiveFrom: "2026-09-04" },
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /cover", () => {
  it("422 on a cover without both dates, before any RPC", async () => {
    const sb = makeSb(dutyTables());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    for (const body of [
      {},
      { dutyKey: "grn_duty", actingUserId: COVER, startsOn: "2026-09-08" }, // no end
      { dutyKey: "grn_duty", actingUserId: COVER, endsOn: "2026-09-10" }, // no start
      { dutyKey: "grn_duty", actingUserId: "nope", startsOn: "2026-09-08", endsOn: "2026-09-10" },
    ]) {
      const res = await req(
        "/api/operation/workspace-duties/cover",
        "POST",
        await makeJwt("operation"),
        body,
      );
      expect(res.status).toBe(422);
    }
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("maps the camelCase body onto workspace_cover_duty's p_* params", async () => {
    const sb = makeSb(dutyTables(), { workspace_cover_duty: { data: { id: "c2" } } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      "/api/operation/workspace-duties/cover",
      "POST",
      await makeJwt("operation"),
      {
        dutyKey: "grn_duty",
        actingUserId: COVER,
        startsOn: "2026-09-08",
        endsOn: "2026-09-10",
        reason: "annual leave",
      },
    );
    expect(res.status).toBe(201);
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(sb.rpc).toHaveBeenCalledWith("workspace_cover_duty", {
      p_duty_key: "grn_duty",
      p_acting_user_id: COVER,
      p_starts_on: "2026-09-08",
      p_ends_on: "2026-09-10",
      p_reason: "annual leave",
    });
  });

  it("a cover with no reason sends p_reason null", async () => {
    const sb = makeSb(dutyTables(), { workspace_cover_duty: { data: {} } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    await req(
      "/api/operation/workspace-duties/cover",
      "POST",
      await makeJwt("operation"),
      {
        dutyKey: "grn_duty",
        actingUserId: COVER,
        startsOn: "2026-09-08",
        endsOn: "2026-09-10",
      },
    );
    expect(sb.rpc).toHaveBeenCalledWith("workspace_cover_duty", {
      p_duty_key: "grn_duty",
      p_acting_user_id: COVER,
      p_starts_on: "2026-09-08",
      p_ends_on: "2026-09-10",
      p_reason: null,
    });
  });

  it("a cover-needs-a-holder refusal passes through with its own status", async () => {
    const sb = makeSb(dutyTables(), {
      workspace_cover_duty: {
        error: {
          code: "22023",
          message: "no one holds grn_duty on 2026-09-08 — assign the duty first",
          details: "no_duty_holder",
        },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      "/api/operation/workspace-duties/cover",
      "POST",
      await makeJwt("operation"),
      {
        dutyKey: "grn_duty",
        actingUserId: COVER,
        startsOn: "2026-09-08",
        endsOn: "2026-09-10",
      },
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("no_duty_holder");
  });
});

describe("S2-A · refusals travel as codes, never as database text", () => {
  const coverBody = {
    dutyKey: "grn_duty",
    actingUserId: COVER,
    startsOn: "2026-09-08",
    endsOn: "2026-09-10",
  };
  async function refuse(
    path: "assign" | "cover",
    error: { code: string; message: string; details: string },
  ) {
    const sb = makeSb(dutyTables(), {
      [path === "assign" ? "workspace_assign_duty" : "workspace_cover_duty"]: { error },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      `/api/operation/workspace-duties/${path}`,
      "POST",
      await makeJwt("operation"),
      path === "assign"
        ? { dutyKey: "grn_duty", holderId: HOLDER, effectiveFrom: "2026-09-04" }
        : coverBody,
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  it.each([
    ["cover", "22023", "no one holds grn_duty on 2026-09-20 — assign the duty first", "no_duty_holder", 422],
    ["cover", "22023", "grn_duty already has cover between 2026-09-08 and 2026-09-10", "cover_overlap", 422],
    ["cover", "22023", "the normal holder cannot cover their own duty", "cover_is_holder", 422],
    ["cover", "22023", "the cover must be a different active internal staff member", "invalid_cover", 422],
    ["cover", "22023", "the cover needs a valid date window", "invalid_dates", 422],
    ["assign", "22023", "the holder must be an active internal staff member", "invalid_holder", 422],
    ["assign", "42501", "you cannot assign a duty to yourself", "self_assignment_refused", 403],
    ["assign", "22023", "an effective date is required", "invalid_dates", 422],
    ["assign", "42501", "forbidden", "duty assignments are set by the manager", 403],
  ] as const)("%s %s %s → code", async (path, code, message, details, status) => {
    const r = await refuse(path, { code, message, details });
    expect(r.status).toBe(status);
    const expected = details === "duty assignments are set by the manager" ? "not_duty_manager" : details;
    expect(r.body.code).toBe(expected);
    // The database's own sentence never leaves the API.
    expect(JSON.stringify(r.body)).not.toContain(message === "forbidden" ? "set by the manager" : message);
  });

  it("an unknown database failure is a plain unknown code", async () => {
    const r = await refuse("cover", { code: "XX000", message: "relation boom", details: "" });
    expect(r.status).toBe(500);
    expect(r.body.code).toBe("unknown");
    expect(JSON.stringify(r.body)).not.toContain("boom");
  });
});

describe("S2-A · the success names the SERVER's normal owner", () => {
  it("cover returns the normal and acting names for the ids the door wrote", async () => {
    const sb = makeSb(dutyTables(), {
      workspace_cover_duty: {
        data: { id: "c2", duty_key: "grn_duty", normal_user_id: HOLDER, acting_user_id: COVER },
      },
      actor_display_names: {
        data: [
          { id: HOLDER, name: "Yu Jun" },
          { id: COVER, name: "Shasha" },
        ],
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req("/api/operation/workspace-duties/cover", "POST", await makeJwt("operation"), {
      dutyKey: "grn_duty",
      actingUserId: COVER,
      startsOn: "2026-10-08",
      endsOn: "2026-10-10",
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      normal_user_id: HOLDER,
      normal_user_name: "Yu Jun",
      acting_user_name: "Shasha",
    });
  });
});

describe("S2-A · the scheduled cover is the one the resolver will use", () => {
  it("asks the resolver on the next cover's first day and returns its cover_id", async () => {
    const tables = dutyTables();
    tables.workspace_duty_covers.list.data = [
      { ...tables.workspace_duty_covers.list.data[0]!, id: "later", starts_on: "2030-10-20", ends_on: "2030-10-21" },
      { ...tables.workspace_duty_covers.list.data[0]!, id: "soon", starts_on: "2030-10-05", ends_on: "2030-10-06" },
    ];
    const sb = makeSb(tables, {
      workspace_can_assign_duties: { data: true },
      workspace_resolve_duty: {
        data: { ...RESOLVED, on_date: "2026-09-17", acting_user_id: null, is_cover: false, cover_id: null },
      },
    });
    sb.rpc.mockImplementation((fn: string, args?: Record<string, unknown>) => {
      if (fn === "workspace_resolve_duty" && args?.p_on === "2030-10-05") {
        return Promise.resolve({ data: { ...RESOLVED, cover_id: "soon" }, error: null });
      }
      if (fn === "workspace_resolve_duty") {
        return Promise.resolve({
          data: { ...RESOLVED, on_date: "2026-09-17", acting_user_id: null, is_cover: false, cover_id: null },
          error: null,
        });
      }
      if (fn === "workspace_can_assign_duties") return Promise.resolve({ data: true, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req("/api/operation/workspace-duties", "GET", await makeJwt("operation"));
    const body = (await res.json()) as { duties: Array<Record<string, unknown>> };
    const grn = body.duties.find((d) => d.key === "grn_duty")!;
    expect(grn.scheduled_cover_id).toBe("soon");
    expect(body.duties.find((d) => d.key === "po_duty")!.scheduled_cover_id).toBeNull();
  });
});
