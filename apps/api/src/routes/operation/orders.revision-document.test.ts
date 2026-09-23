import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

/**
 * 0565 · AN ISSUED VERSION KEEPS ITS DOCUMENT.
 *
 * "Legacy PDFs that were never stored: use the approved reconstructed-copy
 *  notice. Newly issued versions after this release: preserve their original
 *  issued PDFs as required. A warning does not replace this capability."
 *  — owner, 2026-09-23.
 *
 * The three doors are tested on the two things that make the file evidence:
 * the BROWSER never names the path, and a stored document is written ONCE.
 */
const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "u" };
const ORDER = "85ff15dc-4dd8-4f04-913b-e1617784868e";
const KEY = `sales-orders/${ORDER}/rev-4.pdf`;

/** `version` is the revision row (404 when absent); `doc` is the row BESIDE it
 *  that says a file was kept. */
function mockDb(opts: { version?: boolean; doc?: boolean }, storage?: Partial<Record<string, unknown>>) {
  const rpc = vi.fn(async () => ({ data: { revision: 4, document_path: KEY }, error: null }));
  const createSignedUploadUrl = vi.fn(async (p: string) => ({ data: { token: "tok", path: p }, error: null }));
  const createSignedUrl = vi.fn(async (p: string) => ({ data: { signedUrl: `https://signed.test/${p}` }, error: null }));
  const table = (data: unknown) => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({ data, error: null }));
    return chain;
  };
  vi.mocked(userClient).mockReturnValue({
    from: vi.fn((t: string) =>
      t === "sales_order_revision_documents"
        ? table(opts.doc ? { path: KEY } : null)
        : table(opts.version === false ? null : { revision: 4 }),
    ),
    rpc,
    storage: { from: vi.fn(() => ({ createSignedUploadUrl, createSignedUrl, ...storage })) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return { rpc, createSignedUploadUrl, createSignedUrl };
}

async function call(path: string, method: "GET" | "POST", body?: unknown, role = "operation") {
  const jwt = await signTestJwt("11111111-1111-1111-1111-000000000777", { email: `${role}@carres.com`, app_metadata: { role } });
  return app.fetch(
    new Request(`http://t${path}`, {
      method,
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
  );
}

beforeEach(() => { useTestJwks(); vi.mocked(userClient).mockReset(); });
afterAll(() => _setJwksForTesting(null));

describe("0565 · a version keeps the document it was issued as", () => {
  it("mints the upload URL for a path the SERVER names, from the order and the version", async () => {
    const { createSignedUploadUrl } = mockDb({ version: true });
    const res = await call(`/api/operation/orders/${ORDER}/revisions/4/document/sign`, "POST");
    expect(res.status).toBe(200);
    expect(createSignedUploadUrl).toHaveBeenCalledWith(KEY);
    expect(await res.json()).toMatchObject({ token: "tok", path: KEY, bucket: "sales-order-documents" });
  });

  it("refuses to re-issue a version that already keeps its document", async () => {
    const { createSignedUploadUrl } = mockDb({ version: true, doc: true });
    const res = await call(`/api/operation/orders/${ORDER}/revisions/4/document/sign`, "POST");
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code?: string }).code).toBe("document_already_stored");
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("records what was stored through the database, which checks the path again", async () => {
    const { rpc } = mockDb({ version: true });
    const res = await call(`/api/operation/orders/${ORDER}/revisions/4/document`, "POST", { path: KEY, bytes: 51234 });
    expect(res.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("sales_order_record_revision_document", {
      p_order_id: ORDER, p_revision: 4, p_path: KEY, p_bytes: 51234,
    });
  });

  it("hands back a signed URL for a version that kept its file", async () => {
    mockDb({ version: true, doc: true });
    const res = await call(`/api/operation/orders/${ORDER}/revisions/4/document`, "GET");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stored: true, url: `https://signed.test/${KEY}` });
  });

  it("ABSENT IS NOT AN ERROR — a legacy version says so, and the page reconstructs", async () => {
    const { createSignedUrl } = mockDb({ version: true });
    const res = await call(`/api/operation/orders/${ORDER}/revisions/1/document`, "GET");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stored: false, url: null });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("a version number that is not a version is refused before anything is read", async () => {
    mockDb({ version: true });
    for (const bad of ["0", "-2", "abc"]) {
      const res = await call(`/api/operation/orders/${ORDER}/revisions/${bad}/document/sign`, "POST");
      expect(res.status).toBe(422);
    }
  });

  it("a version that does not exist is a 404, never a signed URL for nothing", async () => {
    const { createSignedUploadUrl } = mockDb({ version: false });
    const res = await call(`/api/operation/orders/${ORDER}/revisions/9/document/sign`, "POST");
    expect(res.status).toBe(404);
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
});
