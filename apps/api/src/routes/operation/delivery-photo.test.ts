/**
 * T6 delivery photo (migration 0280) — the artifact routes on the
 * order-control router:
 *   POST /api/operation/orders/:id/delivery-photo/sign-upload
 *   POST /api/operation/orders/:id/delivery-photo/attach
 *   GET  /api/operation/orders/:id/delivery-photos
 * The SERVER is the gate: delivered orders only (sign + attach), the photo
 * path must sit under the order's own `order/{id}/` prefix, and the ledger
 * append also writes the activity line (fail-soft).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));
import { adminClient, userClient } from "../../lib/supabase";

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
    .setSubject("u1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

type Result = { data: unknown; error: unknown };

/** Thenable chainable builder — single-row reads via .maybeSingle(), the
 *  upsert response via .single(). */
function tableMock(read: Result, write?: Result) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    upsert: vi.fn(() => b),
    maybeSingle: vi.fn().mockResolvedValue(read),
    single: vi.fn().mockResolvedValue(write ?? read),
    then: (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(read).then(res, rej),
  };
  return b;
}

function makeSb(tables: Record<string, ReturnType<typeof tableMock>>) {
  return {
    from: vi.fn((t: string) => {
      const b = tables[t];
      if (!b) throw new Error(`unmocked table ${t}`);
      return b;
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

/** Admin (service) client mock — only storage signing is used. */
function makeAdmin() {
  const createSignedUploadUrl = vi.fn(async (path: string) => ({
    data: { token: "tok", path },
    error: null,
  }));
  const createSignedUrl = vi.fn(async (path: string) => ({
    data: { signedUrl: `https://signed/${path}` },
    error: null,
  }));
  const admin = {
    storage: {
      from: vi.fn(() => ({ createSignedUploadUrl, createSignedUrl })),
    },
  };
  return { admin, createSignedUploadUrl, createSignedUrl };
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
  vi.mocked(adminClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

const ORDER_ID = "00000000-0000-0000-0000-00000000020b";
const BASE = `http://t/api/operation/orders/${ORDER_ID}`;

const DELIVERED_ORDER = {
  data: { id: ORDER_ID, status: "delivered", operation_stage: "delivered" },
  error: null,
};
const UNDELIVERED_ORDER = {
  data: { id: ORDER_ID, status: "proceed_order", operation_stage: "dispatched" },
  error: null,
};

function post(url: string, jwt: string | null, body: unknown) {
  return app.fetch(
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
      body: JSON.stringify(body),
    }),
    env,
  );
}

function get(url: string, jwt: string) {
  return app.fetch(
    new Request(url, { headers: { Authorization: `Bearer ${jwt}` } }),
    env,
  );
}

describe("POST /delivery-photo/sign-upload", () => {
  it("403s a non-operation role", async () => {
    const res = await post(`${BASE}/delivery-photo/sign-upload`, await makeJwt("dealer"), {
      mimeType: "image/jpeg",
      sizeBytes: 1000,
    });
    expect(res.status).toBe(403);
  });

  it("refuses a not-yet-delivered order (the photo proves a delivery that happened)", async () => {
    vi.mocked(userClient).mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeSb({ orders: tableMock(UNDELIVERED_ORDER) }) as any,
    );
    const res = await post(`${BASE}/delivery-photo/sign-upload`, await makeJwt("operation"), {
      mimeType: "image/jpeg",
      sizeBytes: 1000,
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("not_delivered");
  });

  it("signs a server-generated key under the order's own prefix", async () => {
    vi.mocked(userClient).mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeSb({ orders: tableMock(DELIVERED_ORDER) }) as any,
    );
    const { admin, createSignedUploadUrl } = makeAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(adminClient).mockReturnValue(admin as any);

    const res = await post(`${BASE}/delivery-photo/sign-upload`, await makeJwt("operation"), {
      mimeType: "image/jpeg",
      sizeBytes: 1000,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; path: string };
    expect(body.token).toBe("tok");
    expect(body.path.startsWith(`order/${ORDER_ID}/`)).toBe(true);
    expect(body.path.endsWith("-delivery.jpg")).toBe(true);
    expect(createSignedUploadUrl).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-photo mime", async () => {
    const res = await post(`${BASE}/delivery-photo/sign-upload`, await makeJwt("operation"), {
      mimeType: "application/pdf",
      sizeBytes: 1000,
    });
    expect(res.status).toBe(422);
  });
});

describe("POST /delivery-photo/attach", () => {
  const GOOD_PATH = `order/${ORDER_ID}/abc-delivery.jpg`;

  it("refuses a path that does not belong to this order", async () => {
    const res = await post(`${BASE}/delivery-photo/attach`, await makeJwt("operation"), {
      path: "order/00000000-0000-0000-0000-000000000999/x-delivery.jpg",
    });
    expect(res.status).toBe(422);
  });

  it("refuses a not-yet-delivered order", async () => {
    vi.mocked(userClient).mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeSb({ orders: tableMock(UNDELIVERED_ORDER) }) as any,
    );
    const res = await post(`${BASE}/delivery-photo/attach`, await makeJwt("operation"), {
      path: GOOD_PATH,
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("not_delivered");
  });

  it("appends to the ledger, returns the control, and writes the activity line", async () => {
    const existing = [{ path: `order/${ORDER_ID}/old.jpg`, at: "2026-07-25T00:00:00Z", by: null }];
    const control = tableMock(
      { data: { delivery_photos: existing }, error: null },
      {
        data: { order_id: ORDER_ID, delivery_photos: [...existing, { path: GOOD_PATH }] },
        error: null,
      },
    );
    const sb = makeSb({
      orders: tableMock(DELIVERED_ORDER),
      ops_order_control: control,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const res = await post(`${BASE}/delivery-photo/attach`, await makeJwt("operation"), {
      path: GOOD_PATH,
    });
    expect(res.status).toBe(201);

    // The upsert carried the OLD entries + the new server-stamped one.
    const upsertArg = control.upsert.mock.calls[0][0] as {
      delivery_photos: { path: string; at: string; by: string | null }[];
    };
    expect(upsertArg.delivery_photos).toHaveLength(2);
    expect(upsertArg.delivery_photos[0].path).toBe(existing[0].path);
    expect(upsertArg.delivery_photos[1].path).toBe(GOOD_PATH);
    expect(upsertArg.delivery_photos[1].by).toBe("u1");

    // Activity: the annotation door was called with the plain-English line.
    expect(sb.rpc).toHaveBeenCalledWith("operation_add_annotation", {
      p_order_id: ORDER_ID,
      p_content: "Delivery photo uploaded",
      p_tag: null,
    });
  });

  it("an annotation failure never undoes the recorded photo (fail-soft)", async () => {
    const control = tableMock(
      { data: { delivery_photos: [] }, error: null },
      { data: { order_id: ORDER_ID, delivery_photos: [{ path: GOOD_PATH }] }, error: null },
    );
    const sb = makeSb({
      orders: tableMock(DELIVERED_ORDER),
      ops_order_control: control,
    });
    sb.rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const res = await post(`${BASE}/delivery-photo/attach`, await makeJwt("operation"), {
      path: GOOD_PATH,
    });
    expect(res.status).toBe(201);
  });
});

describe("GET /delivery-photos", () => {
  it("no overlay row → empty ledger", async () => {
    vi.mocked(userClient).mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeSb({ ops_order_control: tableMock({ data: null, error: null }) }) as any,
    );
    const res = await get(`${BASE}/delivery-photos`, await makeJwt("operation"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ photos: [] });
  });

  it("returns the ledger with a signed view url per photo", async () => {
    const entries = [
      { path: `order/${ORDER_ID}/a.jpg`, at: "2026-07-26T01:00:00Z", by: "u1" },
      { path: `order/${ORDER_ID}/b.jpg`, at: "2026-07-26T02:00:00Z", by: "u1" },
    ];
    vi.mocked(userClient).mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeSb({ ops_order_control: tableMock({ data: { delivery_photos: entries }, error: null }) }) as any,
    );
    const { admin, createSignedUrl } = makeAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(adminClient).mockReturnValue(admin as any);

    const res = await get(`${BASE}/delivery-photos`, await makeJwt("operation"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { photos: { path: string; url: string | null }[] };
    expect(body.photos).toHaveLength(2);
    expect(body.photos[0].url).toBe(`https://signed/${entries[0].path}`);
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
  });
});
