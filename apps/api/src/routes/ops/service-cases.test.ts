import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";
import { Hono } from "hono";
import { authMiddleware, _setJwksForTesting } from "../../middleware/auth";
import scRouter from "./service-cases";
import type { AppEnv } from "../../types";

/**
 * Service cases (0210) — the J2 cross-link contract.
 *
 * Two things a UI bug cannot reveal:
 *  1. `?orderId=` must narrow in the DATABASE. If the filter silently did
 *     nothing, the order drawer would show every case in the company as
 *     "related to this order" — a wrong answer that still looks like a feature.
 *  2. The response must carry the linked order's SO NUMBER. order_id is a uuid;
 *     without the join nothing on screen can name the order, which is the whole
 *     point of the case→order half.
 */

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { adminClient, userClient } from "../../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-1";
const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

function buildApp() {
  const app = new Hono<AppEnv>();
  app.onError((err, c) => {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Internal server error";
    return c.json({ error: "server_error", message }, status as 400 | 401 | 403 | 404 | 500);
  });
  const api = new Hono<AppEnv>();
  api.use("*", authMiddleware);
  api.route("/ops/service-cases", scRouter);
  app.route("/api", api);
  return app;
}
const app = buildApp();

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: "test@carres.com", app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
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

/** Chainable read stub that RECORDS every `.eq()` — the filter assertions below
 *  are about what reached the database, not about what came back. */
function buildSb(rows: unknown[]) {
  const eqCalls: Array<[string, unknown]> = [];
  const selects: string[] = [];
  /** S1 — what actually reached the INSERT. The five wizard answers are only
   *  worth anything if they land in their own columns; a route that quietly
   *  dropped them would still return 201 and still show the composed sentence. */
  const inserts: Record<string, unknown>[] = [];
  const chain: Record<string, unknown> = {
    then: (res: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(res),
    eq: (col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return chain;
    },
    select: (cols: string) => {
      selects.push(cols);
      return chain;
    },
    insert: (row: Record<string, unknown>) => {
      inserts.push(row);
      return chain;
    },
  };
  for (const m of ["order", "limit", "in", "is", "or", "contains", "single"]) {
    chain[m] = () => chain;
  }
  const sb = {
    from: vi.fn(() => chain),
    rpc: vi.fn(async () => ({ data: "SC2607-02", error: null })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { sb, eqCalls, selects, inserts };
}

/** The create path needs `.single()` to resolve to a ROW, not an array. */
function buildInsertSb() {
  const inserts: Record<string, unknown>[] = [];
  const chain: Record<string, unknown> = {
    insert: (row: Record<string, unknown>) => {
      inserts.push(row);
      return chain;
    },
    then: (res: (v: { data: unknown; error: null }) => unknown) =>
      Promise.resolve({ data: { id: "new-case", case_no: "SC2607-02" }, error: null }).then(res),
  };
  for (const m of ["select", "eq", "single", "order"]) chain[m] = () => chain;
  const sb = {
    from: vi.fn(() => chain),
    rpc: vi.fn(async () => ({ data: "SC2607-02", error: null })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { sb, inserts };
}

async function post(body: unknown, sb: unknown, role = "operation") {
  vi.mocked(userClient).mockReturnValue(sb as never);
  return app.request(
    "/api/ops/service-cases",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await makeJwt(role)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    env,
  );
}

/** S2 — the wizard now uploads against a draft before the case exists. */
const DRAFT_ID = "22222222-2222-2222-2222-222222222222";
const draftPath = (slot: string) => `draft/${DRAFT_ID}/abc-${slot}.jpg`;

/** Everything `colour_uneven` + reported-by-customer demands: the customer's
 *  screenshot, an overall photo, TWO close-ups, the SKU label and the video. */
const FULL_EVIDENCE = [
  { slot: "customer_message", path: draftPath("customer_message") },
  { slot: "overall_photo", path: draftPath("overall_photo") },
  { slot: "closeup_photo", path: draftPath("closeup_photo") },
  { slot: "closeup_photo", path: `draft/${DRAFT_ID}/def-closeup_photo.jpg` },
  { slot: "sku_label_photo", path: draftPath("sku_label_photo") },
  { slot: "pan_video", path: `draft/${DRAFT_ID}/ghi-pan_video.mp4` },
];

const WIZARD_BODY = {
  customerName: "Ryan Chong",
  whatHappened: "Colour uneven — Sofa · SF2201. Found by Customer. Still usable: No.",
  reportedBy: "customer",
  orderLineId: "11111111-1111-1111-1111-111111111111",
  productSku: "SF2201 3 Seater",
  productCategory: "sofa",
  issueType: "colour_uneven",
  usable: "no",
  customerWants: ["repair", "replace"],
  draftId: DRAFT_ID,
  evidence: FULL_EVIDENCE,
};

const CASE_ROW = {
  id: "c1",
  case_no: "SC2607-01",
  order_id: "ord-1",
  ref_no: "TCF0497",
  customer_name: "Ryan Chong",
  customer_phone: null,
  customer_address: null,
  case_type_id: null,
  status_id: null,
  what_happened: null,
  carres_action: null,
  what_affected: null,
  incurred_charges: null,
  opened_at: "2026-06-16",
  source_service_note_id: null,
  created_by: null,
  created_at: "2026-06-16T00:00:00Z",
  updated_at: "2026-06-16T00:00:00Z",
  service_case_types: { label: "Warranty Claim" },
  service_case_statuses: { label: "In Progress", is_closed: false },
  orders: { so: 1258 },
};

async function get(path: string, sb: unknown, role = "operation") {
  vi.mocked(userClient).mockReturnValue(sb as never);
  return app.request(
    `/api${path}`,
    { headers: { Authorization: `Bearer ${await makeJwt(role)}` } },
    env,
  );
}

describe("GET /api/ops/service-cases", () => {
  it("narrows to one order in the database when ?orderId= is given", async () => {
    const { sb, eqCalls } = buildSb([CASE_ROW]);
    const res = await get("/ops/service-cases?orderId=ord-1", sb);

    expect(res.status).toBe(200);
    // The filter must reach the query — not be applied after the fact, and not
    // be dropped on the floor.
    expect(eqCalls).toContainEqual(["order_id", "ord-1"]);
  });

  it("does NOT filter by order when the param is absent", async () => {
    const { sb, eqCalls } = buildSb([CASE_ROW]);
    await get("/ops/service-cases", sb);
    expect(eqCalls.some(([col]) => col === "order_id")).toBe(false);
  });

  it("treats a blank orderId as no filter rather than matching nothing", async () => {
    const { sb, eqCalls } = buildSb([CASE_ROW]);
    await get("/ops/service-cases?orderId=%20%20", sb);
    expect(eqCalls.some(([col]) => col === "order_id")).toBe(false);
  });

  it("carries the linked order's SO number so the link can be named", async () => {
    const { sb, selects } = buildSb([CASE_ROW]);
    const res = await get("/ops/service-cases", sb);
    const body = (await res.json()) as { items: { so: number | null; orderId: string }[] };

    expect(selects[0]).toContain("orders(so)");
    expect(body.items[0].so).toBe(1258);
    expect(body.items[0].orderId).toBe("ord-1");
  });

  it("reports so=null for a case with no linked order — the live state today", async () => {
    // Every service case in prod is currently unlinked (order_id null), so this
    // is the shape the screen actually renders.
    const { sb } = buildSb([{ ...CASE_ROW, order_id: null, orders: null }]);
    const res = await get("/ops/service-cases", sb);
    const body = (await res.json()) as { items: { so: number | null; orderId: string | null }[] };

    expect(body.items[0].orderId).toBeNull();
    expect(body.items[0].so).toBeNull();
  });

  it("tolerates PostgREST returning the embed as an array", async () => {
    const { sb } = buildSb([{ ...CASE_ROW, orders: [{ so: 1301 }] }]);
    const res = await get("/ops/service-cases", sb);
    const body = (await res.json()) as { items: { so: number | null }[] };
    expect(body.items[0].so).toBe(1301);
  });

  it("carries the intake answers back so the case reads the way it was filed", async () => {
    const { sb } = buildSb([
      { ...CASE_ROW, issue_type: "damaged", usable: "no", priority: "high",
        customer_wants: ["replace"], reported_by: "logistic", product_category: "sofa" },
    ]);
    const res = await get("/ops/service-cases", sb);
    const body = (await res.json()) as { items: Record<string, unknown>[] };

    expect(body.items[0]).toMatchObject({
      issueType: "damaged",
      usable: "no",
      priority: "high",
      customerWants: ["replace"],
      reportedBy: "logistic",
      productCategory: "sofa",
    });
  });

  it("reports a pre-wizard case as unanswered rather than inventing a priority", async () => {
    // SC2607-01 — the one real case on file, filed before 0285 existed.
    const { sb } = buildSb([CASE_ROW]);
    const res = await get("/ops/service-cases", sb);
    const body = (await res.json()) as { items: Record<string, unknown>[] };

    expect(body.items[0].priority).toBeNull();
    expect(body.items[0].issueType).toBeNull();
    expect(body.items[0].customerWants).toEqual([]);
  });

  it("still refuses a dealer — the cross-link opens no new door", async () => {
    const { sb } = buildSb([CASE_ROW]);
    const res = await get("/ops/service-cases?orderId=ord-1", sb, "dealer");
    expect(res.status).toBe(403);
  });
});

describe("POST /api/ops/service-cases — the S1 guided intake", () => {
  it("lands all five answers in their own columns, not only in the prose", async () => {
    const { sb, inserts } = buildInsertSb();
    const res = await post(WIZARD_BODY, sb);

    expect(res.status).toBe(201);
    expect(inserts[0]).toMatchObject({
      reported_by: "customer",
      order_line_id: "11111111-1111-1111-1111-111111111111",
      product_sku: "SF2201 3 Seater",
      product_category: "sofa",
      issue_type: "colour_uneven",
      usable: "no",
      customer_wants: ["repair", "replace"],
    });
  });

  it("never writes `priority` — it is generated from `usable` in the database", async () => {
    // The card's law is that staff never pick a priority. Enforcing it means the
    // write path must not HAVE the column, not merely decline to offer a picker.
    const { sb, inserts } = buildInsertSb();
    await post({ ...WIZARD_BODY, priority: "low" }, sb);
    expect(inserts[0]).not.toHaveProperty("priority");
  });

  it("refuses an answer that is not one of the offered keys", async () => {
    const { sb } = buildInsertSb();
    const bad = await post({ ...WIZARD_BODY, issueType: "smells_funny" }, sb);
    expect(bad.status).toBe(400);

    const { sb: sb2 } = buildInsertSb();
    const bad2 = await post({ ...WIZARD_BODY, customerWants: ["free_sofa"] }, sb2);
    expect(bad2.status).toBe(400);

    const { sb: sb3 } = buildInsertSb();
    const bad3 = await post({ ...WIZARD_BODY, usable: "maybe" }, sb3);
    expect(bad3.status).toBe(400);
  });

  it("still accepts a case with no wizard answers — the edit modal writes prose only", async () => {
    const { sb, inserts } = buildInsertSb();
    const res = await post({ customerName: "Walk-in", whatHappened: "typed by hand" }, sb);

    expect(res.status).toBe(201);
    expect(inserts[0]).toMatchObject({
      reported_by: null,
      issue_type: null,
      usable: null,
      customer_wants: [],
    });
  });

  it("still refuses a dealer — the wizard opens no new door", async () => {
    const { sb } = buildInsertSb();
    const res = await post(WIZARD_BODY, sb, "dealer");
    expect(res.status).toBe(403);
  });
});

describe("POST /api/ops/service-cases — the S2 evidence gate", () => {
  it("refuses a case whose issue type demands evidence it does not have", async () => {
    // The card's acceptance: "submitting without required evidence is
    // impossible." A disabled button is not impossible — this is the rule.
    const { sb, inserts } = buildInsertSb();
    const res = await post({ ...WIZARD_BODY, draftId: undefined, evidence: [] }, sb);

    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("evidence_missing");
    // Rule 6 — the error names what is still needed.
    expect(body.message).toContain("Video of the whole item");
    expect(body.message).toContain("Photo of the label on the item");
    // Nothing reached the database.
    expect(inserts).toHaveLength(0);
  });

  it("refuses a half-done count as loudly as a missing file", async () => {
    // Colour uneven asks for TWO close-ups. One is not "nearly enough".
    const { sb, inserts } = buildInsertSb();
    const res = await post(
      { ...WIZARD_BODY, evidence: FULL_EVIDENCE.filter((_, i) => i !== 3) },
      sb,
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { message: string; missing: { need: number; have: number }[] };
    expect(body.message).toContain("(1 of 2)");
    expect(body.missing).toContainEqual(
      expect.objectContaining({ slot: "closeup_photo", need: 2, have: 1 }),
    );
    expect(inserts).toHaveLength(0);
  });

  it("accepts the case once the checklist is satisfied", async () => {
    const { sb, inserts } = buildInsertSb();
    const res = await post(WIZARD_BODY, sb);

    expect(res.status).toBe(201);
    expect((inserts[0].evidence as unknown[]).length).toBe(6);
  });

  it("stamps who uploaded each file and when — the client cannot author it", async () => {
    const { sb, inserts } = buildInsertSb();
    // A client trying to forge a different uploader: the extra keys are not in
    // the schema, so they are stripped, and the server's own stamp is what lands.
    await post(
      {
        ...WIZARD_BODY,
        evidence: FULL_EVIDENCE.map((f) => ({
          ...f,
          by: "somebody-else",
          by_role: "principal",
          at: "1999-01-01T00:00:00Z",
        })),
      },
      sb,
    );

    const entries = inserts[0].evidence as Record<string, string>[];
    for (const e of entries) {
      expect(e.by).toBe("11111111-1111-1111-1111-000000000999"); // the JWT's subject
      expect(e.by_role).toBe("operation");
      expect(e.at).not.toBe("1999-01-01T00:00:00Z");
      expect(Number.isNaN(Date.parse(e.at))).toBe(false);
    }
  });

  it("derives the file kind from the slot rather than trusting the client", async () => {
    // Declaring the video slot to be a photo would satisfy the count while
    // proving nothing the video was asked for.
    const { sb, inserts } = buildInsertSb();
    await post(
      { ...WIZARD_BODY, evidence: FULL_EVIDENCE.map((f) => ({ ...f, kind: "photo" })) },
      sb,
    );

    const entries = inserts[0].evidence as Record<string, string>[];
    expect(entries.find((e) => e.slot === "pan_video")?.kind).toBe("video");
    expect(entries.find((e) => e.slot === "overall_photo")?.kind).toBe("photo");
  });

  it("refuses a file that belongs to somebody else's draft", async () => {
    const { sb, inserts } = buildInsertSb();
    const res = await post(
      {
        ...WIZARD_BODY,
        evidence: [
          ...FULL_EVIDENCE.slice(1),
          { slot: "customer_message", path: "draft/99999999-9999-9999-9999-999999999999/x.jpg" },
        ],
      },
      sb,
    );

    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe("evidence_path_mismatch");
    expect(inserts).toHaveLength(0);
  });

  it("refuses evidence sent with no draft to belong to", async () => {
    const { sb } = buildInsertSb();
    const res = await post({ ...WIZARD_BODY, draftId: undefined }, sb);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe("missing_draft_id");
  });

  it("drops the customer's screenshot from the demand when the WAREHOUSE found it", async () => {
    // A fault found before dispatch has no customer chat to screenshot. If the
    // gate demanded one anyway it could only be passed dishonestly.
    const { sb, inserts } = buildInsertSb();
    const res = await post(
      {
        ...WIZARD_BODY,
        reportedBy: "warehouse",
        evidence: FULL_EVIDENCE.filter((f) => f.slot !== "customer_message"),
      },
      sb,
    );

    expect(res.status).toBe(201);
    expect((inserts[0].evidence as unknown[]).length).toBe(5);
  });

  it("still accepts a prose-only case with no issue type and no evidence", async () => {
    // The edit modal asks no issue question; S1 kept that path alive and S2 must
    // not close it. The gate binds to the issue type, not to the endpoint.
    const { sb, inserts } = buildInsertSb();
    const res = await post({ customerName: "Walk-in", whatHappened: "typed by hand" }, sb);

    expect(res.status).toBe(201);
    expect(inserts[0].evidence).toEqual([]);
  });

  it("refuses an unknown evidence slot outright", async () => {
    const { sb } = buildInsertSb();
    const res = await post(
      { ...WIZARD_BODY, evidence: [{ slot: "receipt", path: draftPath("receipt") }] },
      sb,
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/ops/service-cases/evidence/sign-upload", () => {
  async function sign(body: unknown, role = "operation") {
    vi.mocked(userClient).mockReturnValue(buildInsertSb().sb as never);
    return app.request(
      "/api/ops/service-cases/evidence/sign-upload",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await makeJwt(role)}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
      env,
    );
  }

  it("refuses a photo where the checklist asked for a video", async () => {
    const res = await sign({ draftId: DRAFT_ID, slot: "pan_video", mimeType: "image/jpeg" });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("wrong_file_kind");
    expect(body.message).toContain("needs a video");
  });

  it("refuses a video where the checklist asked for a photo", async () => {
    const res = await sign({ draftId: DRAFT_ID, slot: "sku_label_photo", mimeType: "video/mp4" });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe("wrong_file_kind");
  });

  it("refuses a request that names both a draft and a case, or neither", async () => {
    const both = await sign({
      draftId: DRAFT_ID,
      caseId: "33333333-3333-3333-3333-333333333333",
      slot: "overall_photo",
      mimeType: "image/jpeg",
    });
    expect(both.status).toBe(400);

    const neither = await sign({ slot: "overall_photo", mimeType: "image/jpeg" });
    expect(neither.status).toBe(400);
  });

  it("still refuses a dealer — evidence opens no new door", async () => {
    const res = await sign(
      { draftId: DRAFT_ID, slot: "overall_photo", mimeType: "image/jpeg" },
      "dealer",
    );
    expect(res.status).toBe(403);
  });

  it("builds the object key itself — the client can neither pick nor overwrite a path", async () => {
    const signed: string[] = [];
    vi.mocked(adminClient).mockReturnValue({
      storage: {
        from: () => ({
          createSignedUploadUrl: async (p: string) => {
            signed.push(p);
            return { data: { token: "tok", path: p }, error: null };
          },
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const res = await sign({ draftId: DRAFT_ID, slot: "pan_video", mimeType: "video/mp4" });
    expect(res.status).toBe(200);

    // Under the draft's own prefix, named for the slot, with the extension the
    // mime type implies — none of it taken from the request body.
    expect(signed[0]).toMatch(new RegExp(`^draft/${DRAFT_ID}/[0-9a-f-]{36}-pan_video\\.mp4$`));
    expect((await res.json()) as { path: string }).toMatchObject({ token: "tok" });
  });
});

describe("POST /api/ops/service-cases/:id/evidence", () => {
  it("refuses a file that does not sit under this case's own prefix", async () => {
    // Including a DRAFT path: once a case exists, its files live under case/{id}/.
    vi.mocked(userClient).mockReturnValue(buildInsertSb().sb as never);
    const res = await app.request(
      "/api/ops/service-cases/33333333-3333-3333-3333-333333333333/evidence",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await makeJwt("operation")}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ slot: "overall_photo", path: draftPath("overall_photo") }),
      },
      env,
    );

    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe("evidence_path_mismatch");
  });
});

describe("GET /api/ops/service-cases/:id", () => {
  it("names the order on the detail read too (the modal's link)", async () => {
    const { sb } = buildSb([CASE_ROW]);
    // `.single()` resolves through the same then(), handing back the array; the
    // route reads `data` directly, so shape the stub to match a single row.
    vi.mocked(userClient).mockReturnValue({
      ...sb,
      from: () => {
        const chain: Record<string, unknown> = {
          then: (res: (v: { data: unknown; error: null }) => unknown) =>
            Promise.resolve({ data: CASE_ROW, error: null }).then(res),
        };
        for (const m of ["select", "eq", "order", "single"]) chain[m] = () => chain;
        return chain;
      },
    } as never);

    const res = await app.request(
      "/api/ops/service-cases/c1",
      { headers: { Authorization: `Bearer ${await makeJwt("operation")}` } },
      env,
    );
    const body = (await res.json()) as { so: number | null };
    expect(res.status).toBe(200);
    expect(body.so).toBe(1258);
  });
});
