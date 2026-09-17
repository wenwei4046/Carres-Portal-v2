import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import { purchasingRefusal } from "@carres/shared";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
vi.mock("../../lib/duties", () => ({
  myDuties: vi.fn().mockResolvedValue([]),
  dutyHolders: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../lib/purchase-demand-read", () => ({ readFreeStock: vi.fn() }));
vi.mock("../../lib/purchasing-settings", () => ({
  loadPurchasingSettings: vi.fn().mockResolvedValue({
    orderByBufferDays: 7,
    earliestSellDays: 21,
    logisticsCallWorkingDays: 1,
    poDays: [1, 3, 5],
    suppliers: [],
    productionDays: [],
    lastChanges: [],
    manualPurchaseMinDeliveryDays: 0,
  }),
}));

import { loadPurchasingSettings } from "../../lib/purchasing-settings";
import { userClient } from "../../lib/supabase";

/**
 * MANUAL PURCHASE ROUND 2 — the API half of owner rulings R1–R4 and D2/D4/D5
 * (2026-09-16/17, migration 0522). Every test here was written against the
 * pre-round-2 route and fails on it: the old route admitted
 * `approval_required = false` to Issue PO, had no withdraw / resubmit door,
 * refused `send_back` as an invalid body, printed the shared login's name as
 * the requester, and read `placed_at` as `PO Issued`.
 */

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};
const CALLER = "11111111-1111-1111-1111-000000000999";
const U_JESS = "11111111-1111-1111-1111-00000000000a";
const U_SHARED = "11111111-1111-1111-1111-00000000000b";
const U_PRINCIPAL = "11111111-1111-1111-1111-00000000000c";
const REQ = "aaaaaaaa-0000-0000-0000-00000000000a";
const REQ_2 = "aaaaaaaa-0000-0000-0000-00000000000b";
const SUP = "bbbbbbbb-0000-0000-0000-000000000001";
const DEST = "cccccccc-0000-0000-0000-000000000001";
const LINE = "dddddddd-0000-0000-0000-000000000001";

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});
afterAll(() => _setJwksForTesting(null));

function tableStub(result: unknown, error: unknown = null) {
  const q: Record<string, unknown> = {};
  const chain = () => q;
  for (const m of ["select", "eq", "order", "limit", "not", "gt", "is", "in", "maybeSingle"]) {
    q[m] = vi.fn(chain);
  }
  (q as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    resolve({ data: error ? null : result, error });
  return q;
}

type Tables = Record<string, unknown | { error: unknown }>;

function makeSb(tables: Tables, rpc: ReturnType<typeof vi.fn> = vi.fn()) {
  return {
    from: vi.fn((table: string) => {
      const t = tables[table];
      if (t && typeof t === "object" && "error" in (t as object) && !Array.isArray(t)) {
        return tableStub(null, (t as { error: unknown }).error);
      }
      return tableStub(t ?? []);
    }),
    rpc: vi.fn(async (fn: string, args: unknown) => {
      if (fn === "actor_display_names") {
        return {
          data: [
            { id: U_JESS, name: "Jess" },
            { id: U_SHARED, name: "Operations" },
            { id: U_PRINCIPAL, name: "principal" },
          ],
          error: null,
        };
      }
      if (fn === "purchasing_actor_may_issue") return { data: true, error: null };
      const out = rpc(fn, args);
      return out ?? { data: null, error: null };
    }),
  } as unknown as ReturnType<typeof userClient>;
}

async function call(
  path: string,
  init: { method?: string; body?: unknown } = {},
  role = "operation",
) {
  const jwt = await signTestJwt(CALLER, {
    email: `${role}@carres.com`,
    app_metadata: { role },
  });
  return app.fetch(
    new Request(`https://api.test/api/operation/purchasing/requests${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    env as never,
    { waitUntil() {}, passThroughException() {} } as never,
  );
}

const USERS = [
  { id: U_JESS, name: "Jess", email: "jess@carres.com", role: "principal" },
  { id: U_SHARED, name: "Operations", email: "operation@carres.com", role: "operation" },
  // Hidden from an operation reader's plain `app_users` read in production.
];

const request = (over: Record<string, unknown> = {}) => ({
  id: REQ,
  req_no: null,
  purpose: "ready_stock",
  destination_id: DEST,
  required_by: "2026-10-30",
  why: null,
  approval_required: true,
  approved_at: "2026-09-10T02:00:00Z",
  approved_by: U_JESS,
  refused_at: null,
  refused_by: null,
  refuse_reason: null,
  withdrawn_at: null,
  sent_back_at: null,
  sent_back_reason: null,
  submitted_at: null,
  round: 1,
  for_service_case_id: null,
  for_staff_user_id: null,
  for_subsidiary_name: null,
  created_by: U_JESS,
  created_at: "2026-09-09T01:00:00Z",
  ...over,
});

const line = (over: Record<string, unknown> = {}) => ({
  id: LINE,
  request_id: REQ,
  sku: "5539-2NA",
  supplier_id: SUP,
  destination_id: DEST,
  qty: 2,
  approved_qty: null,
  issued_qty: 0,
  remaining_qty: 2,
  required_by: "2026-10-30",
  remark: null,
  po_id: null,
  cancelled_at: null,
  cancel_reason: null,
  cancelled_by: null,
  ...over,
});

describe("R1 · Issue PO refuses every request that is not approved", () => {
  async function issueOne(req: Record<string, unknown>) {
    const rpc = vi.fn().mockResolvedValue({ data: { po_ids: ["PO-1"] }, error: null });
    vi.mocked(userClient).mockReturnValue(
      makeSb(
        {
          purchase_requests: [req],
          purchase_demands: [line()],
          product_skus: [{ sku: "5539-2NA", supplier_id: SUP, cost: 850, product_models: { category: "sofa" } }],
          suppliers: [{ id: SUP, kind: "own_logistics", name: "Ohana" }],
        },
        rpc,
      ),
    );
    const res = await call("/issue", {
      method: "POST",
      body: { requestIds: [REQ], together: true },
    });
    return { res, rpc };
  }

  it("⭐ a stored `approval_required = false` with no decision is NOT an exemption", async () => {
    const { res, rpc } = await issueOne(request({ approval_required: false, approved_at: null }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("not_ready_to_order");
    expect(rpc).not.toHaveBeenCalledWith("purchasing_issue_pos_batch", expect.anything());
  });

  it("a sent-back request is not approved", async () => {
    const { res } = await issueOne(request({ approved_at: null, sent_back_at: "2026-09-11T00:00:00Z" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("not_ready_to_order");
  });

  it("a withdrawn request says it was withdrawn", async () => {
    const { res } = await issueOne(request({ approved_at: null, withdrawn_at: "2026-09-11T00:00:00Z" }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("request_withdrawn");
    expect(body.message).toBe(purchasingRefusal("request_withdrawn").wrong);
  });
});

describe("R4 · the decision door sends back, and the race loser is refused by name", () => {
  it("passes `send_back` and its reason to the one decision door", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: REQ, decision: "sent_back" }, error: null });
    vi.mocked(userClient).mockReturnValue(makeSb({}, rpc));
    const res = await call(`/${REQ}/decide`, {
      method: "POST",
      body: { decision: "send_back", reason: "Wrong size" },
    });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("purchasing_decide_request", {
      p_id: REQ,
      p_decision: "send_back",
      p_reason: "Wrong size",
      p_cuts: null,
    });
  });

  it.each([
    ["request_withdrawn", 409],
    ["request_sent_back", 409],
    ["already_decided", 409],
  ])("an Approve that lost the race to %s leaves in the governed words", async (detail, status) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "22023", details: detail, message: "x" } });
    vi.mocked(userClient).mockReturnValue(makeSb({}, rpc));
    const res = await call(`/${REQ}/decide`, { method: "POST", body: { decision: "approve" } });
    expect(res.status).toBe(status);
    const body = (await res.json()) as { code: string; message: string; action: string };
    expect(body.code).toBe(detail);
    expect(body.message).toBe(purchasingRefusal(detail).wrong);
  });
});

describe("R3 · Withdraw request", () => {
  it("calls the one withdraw door", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: REQ, withdrawn: true }, error: null });
    vi.mocked(userClient).mockReturnValue(makeSb({}, rpc));
    const res = await call(`/${REQ}/withdraw`, { method: "POST", body: {} });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("purchasing_withdraw_request", { p_id: REQ });
  });

  it("a non-requester is told WHO may withdraw — the real requester's name", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", details: "not_requester", message: "only the requester" },
    });
    vi.mocked(userClient).mockReturnValue(
      makeSb({ purchase_requests: request(), app_users: USERS }, rpc),
    );
    const res = await call(`/${REQ}/withdraw`, { method: "POST", body: {} });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string; action: string };
    expect(body.code).toBe("not_requester");
    expect(body.action).toBe("Ask Jess to do it.");
  });

  it("an approval that won the race refuses the withdrawal by name", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "22023", details: "already_decided", message: "x" },
    });
    vi.mocked(userClient).mockReturnValue(makeSb({}, rpc));
    const res = await call(`/${REQ}/withdraw`, { method: "POST", body: {} });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("already_decided");
  });

  it("a request with a PO cannot be withdrawn", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "22023", details: "request_ordered", message: "x" },
    });
    vi.mocked(userClient).mockReturnValue(makeSb({}, rpc));
    const res = await call(`/${REQ}/withdraw`, { method: "POST", body: {} });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("request_already_ordered");
  });
});

describe("R4 · Edit and send again", () => {
  const body = {
    destinationId: DEST,
    requiredBy: "2026-10-30",
    why: null,
    serviceCaseId: null,
    staffUserId: null,
    subsidiaryName: null,
    lines: [
      { id: LINE, sku: "5539-2NA", qty: 3, note: " left side " },
      { id: null, sku: "5539-CNR", qty: 1, note: null },
    ],
  };

  it("sends the SAME request's lines, ids kept, to the resubmit door", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: REQ, round: 2 }, error: null });
    vi.mocked(userClient).mockReturnValue(makeSb({}, rpc));
    const res = await call(`/${REQ}/resubmit`, { method: "POST", body });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("purchasing_resubmit_request", {
      p_id: REQ,
      p_destination_id: DEST,
      p_required_by: "2026-10-30",
      p_why: null,
      p_for_service_case_id: null,
      p_for_staff_user_id: null,
      p_for_subsidiary_name: null,
      p_lines: [
        { id: LINE, sku: "5539-2NA", qty: 3, remark: "left side" },
        { id: null, sku: "5539-CNR", qty: 1, remark: null },
      ],
    });
  });

  it("keeps the 0422 earliest-Delivery-Date floor a new request meets", async () => {
    vi.mocked(loadPurchasingSettings).mockResolvedValueOnce({
      manualPurchaseMinDeliveryDays: 3650,
    } as never);
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue(makeSb({}, rpc));
    const res = await call(`/${REQ}/resubmit`, { method: "POST", body });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe("delivery_date_before_earliest");
    expect(rpc).not.toHaveBeenCalledWith("purchasing_resubmit_request", expect.anything());
  });

  it("a request that is not back with its requester is refused by name", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "22023", details: "not_sent_back", message: "x" },
    });
    vi.mocked(userClient).mockReturnValue(makeSb({}, rpc));
    const res = await call(`/${REQ}/resubmit`, { method: "POST", body });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("not_sent_back");
  });
});

describe("D2 · ONE requester identity on the Register", () => {
  it("names the real person through the shared door; a shared login is nobody", async () => {
    vi.mocked(userClient).mockReturnValue(
      makeSb({
        purchase_requests: [
          request({ id: REQ, created_by: U_SHARED }),
          // The principal account is invisible to this reader's plain read —
          // the shared door still names it.
          request({ id: REQ_2, created_by: U_PRINCIPAL }),
        ],
        purchase_demands: [line(), line({ id: "dddddddd-0000-0000-0000-000000000002", request_id: REQ_2 })],
        app_users: USERS,
      }),
    );
    const res = await call("");
    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      requests: Array<{ id: string; requested_by_name: string | null; requested_by_user_id: string | null }>;
      linesUnavailable: boolean;
    };
    const byId = new Map(payload.requests.map((r) => [r.id, r]));
    expect(byId.get(REQ)?.requested_by_name).toBeNull();
    expect(byId.get(REQ)?.requested_by_user_id).toBeNull();
    expect(byId.get(REQ_2)?.requested_by_name).toBe("principal");
    expect(payload.linesUnavailable).toBe(false);
  });

  it("⭐ lines that cannot be read are UNKNOWN, never an empty success", async () => {
    vi.mocked(userClient).mockReturnValue(
      makeSb({
        purchase_requests: [request()],
        purchase_demands: { error: { code: "57014", message: "statement timeout" } },
        app_users: USERS,
      }),
    );
    const res = await call("");
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { lines: unknown[]; linesUnavailable: boolean };
    expect(payload.linesUnavailable).toBe(true);
    expect(payload.lines).toEqual([]);
  });
});

describe("D4 / D5 / R3 / R4 · the object's facts", () => {
  const PO = "PO-20260911-1234";
  function detailSb(extra: Tables = {}) {
    return makeSb({
      purchase_requests: request({ created_by: U_SHARED }),
      purchase_demands: [
        line({ issued_qty: 2, po_id: PO }),
        line({
          id: "dddddddd-0000-0000-0000-000000000009",
          sku: "5539-CNR",
          cancelled_at: "2026-09-12T01:00:00Z",
          cancel_reason: "Removed before sending again",
          cancelled_by: U_JESS,
        }),
      ],
      product_skus: [],
      purchase_order_lines: [],
      purchase_orders: [{ id: PO, placed_at: "2026-09-11T01:00:00Z", official_delivery_date: "2026-10-20", version: 2 }],
      po_sends: [
        { po_id: PO, po_version: 1, kind: "confirmed_sent", sent_at: "2026-09-11T02:00:00Z" },
        { po_id: PO, po_version: 2, kind: "confirmed_sent", sent_at: "2026-09-12T03:00:00Z" },
      ],
      purchase_request_events: [
        { round: 1, kind: "sent_back", actor_id: U_JESS, occurred_at: "2026-09-09T05:00:00Z", reason: "Wrong qty", changes: null },
        {
          round: 2,
          kind: "resubmitted",
          actor_id: U_SHARED,
          occurred_at: "2026-09-09T06:00:00Z",
          reason: null,
          changes: [{ field: "line", sku: "5539-2NA", from: 1, to: 2 }],
        },
      ],
      app_users: USERS,
      purchasing_destinations: [{ id: DEST, name: "Carres Klang", active: true }],
      suppliers: [],
      ...extra,
    });
  }

  it("D5 · PO Issued is the CURRENT version's marked-sent time, never placed_at", async () => {
    vi.mocked(userClient).mockReturnValue(detailSb());
    const res = await call(`/detail/${REQ}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pos: Array<{ marked_sent_at: string | null; placed_at: string }> };
    expect(body.pos[0]?.marked_sent_at).toBe("2026-09-12T03:00:00Z");
  });

  it("D5 · a current version nobody marked reads null (`Not marked as sent`)", async () => {
    vi.mocked(userClient).mockReturnValue(
      detailSb({ po_sends: [{ po_id: PO, po_version: 1, kind: "confirmed_sent", sent_at: "2026-09-11T02:00:00Z" }] }),
    );
    const res = await call(`/detail/${REQ}`);
    const body = (await res.json()) as { pos: Array<{ marked_sent_at: string | null }> };
    expect(body.pos[0]?.marked_sent_at).toBeNull();
  });

  it("R4 · every round is in History with its real actor; a shared login stays unnamed", async () => {
    vi.mocked(userClient).mockReturnValue(detailSb());
    const res = await call(`/detail/${REQ}`);
    const body = (await res.json()) as {
      history: Array<{ kind: string; actor: string | null; reason?: string | null; round?: number; changes?: unknown[] }>;
      requested_by_name: string | null;
    };
    const sentBack = body.history.find((h) => h.kind === "sent_back");
    const again = body.history.find((h) => h.kind === "resubmitted");
    expect(sentBack).toMatchObject({ actor: "Jess", reason: "Wrong qty" });
    expect(again).toMatchObject({ actor: null, round: 2 });
    expect(again?.changes).toEqual([{ field: "line", sku: "5539-2NA", from: 1, to: 2 }]);
    expect(body.requested_by_name).toBeNull();
  });

  it("D4 · a line marked not going ahead names who marked it", async () => {
    vi.mocked(userClient).mockReturnValue(detailSb());
    const res = await call(`/detail/${REQ}`);
    const body = (await res.json()) as { history: Array<{ kind: string; actor: string | null }> };
    expect(body.history.find((h) => h.kind === "line_not_going_ahead")?.actor).toBe("Jess");
  });

  it("R3 · the caller who did not ask sees no Withdraw and no Edit and send again", async () => {
    vi.mocked(userClient).mockReturnValue(detailSb());
    const res = await call(`/detail/${REQ}`);
    const body = (await res.json()) as { canWithdraw: boolean; canEditAndSendAgain: boolean };
    expect(body.canWithdraw).toBe(false);
    expect(body.canEditAndSendAgain).toBe(false);
  });

  it("R3 / R4 · the requester may withdraw while waiting, and edit once it is sent back", async () => {
    vi.mocked(userClient).mockReturnValue(
      detailSb({
        purchase_requests: request({ created_by: CALLER, approved_at: null, sent_back_at: "2026-09-09T05:00:00Z" }),
        purchase_demands: [line()],
      }),
    );
    const res = await call(`/detail/${REQ}`);
    const body = (await res.json()) as { canWithdraw: boolean; canEditAndSendAgain: boolean };
    expect(body.canWithdraw).toBe(true);
    expect(body.canEditAndSendAgain).toBe(true);
  });
});
