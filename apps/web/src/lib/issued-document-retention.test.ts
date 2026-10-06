import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 0565 · KEEPING THE ISSUED DOCUMENT — what happens when it does NOT work.
 *
 * Owner, 2026-09-23: "Verify PDF retention failure recovery in the test
 * environment: closing the browser, failed upload, retry, and concurrent
 * amendment. Confirm the retained PDF belongs to the exact issued revision and
 * cannot inherit an older revision's signature."
 *
 * The rule under all of it: MINTING A VERSION IS BUSINESS TRUTH; KEEPING ITS
 * PAPER IS A SEPARATE ACT. A version is never blocked, rolled back or altered
 * because a file could not be stored — it simply has none, and the page draws
 * the reconstruction and says so.
 */
const apiFetch = vi.fn();
const uploadToSignedUrl = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock("@/lib/supabase", () => ({
  supabase: { storage: { from: () => ({ uploadToSignedUrl: (...a: unknown[]) => uploadToSignedUrl(...a) }) } },
}));

const ORDER = "85ff15dc-4dd8-4f04-913b-e1617784868e";
const KEY = `sales-orders/${ORDER}/rev-4.pdf`;
const pdf = () => new Blob([new Uint8Array([37, 80, 68, 70])], { type: "application/pdf" });

async function subject() {
  const mod = await import("./queries");
  return mod.storeIssuedSalesOrderDocument;
}

beforeEach(() => {
  vi.resetModules();
  apiFetch.mockReset();
  uploadToSignedUrl.mockReset();
});

describe("keeping the document a version was issued as", () => {
  it("signs, uploads, then records — in that order, and the browser never names the path", async () => {
    apiFetch.mockImplementation(async (url: string) =>
      url.endsWith("/document/sign") ? { token: "tok", path: KEY, bucket: "sales-order-documents" } : { ok: true },
    );
    uploadToSignedUrl.mockResolvedValue({ error: null });
    const store = await subject();
    const out = await store(ORDER, 4, pdf());
    expect(out).toEqual({ stored: true });
    const calls = apiFetch.mock.calls.map((c) => String(c[0]));
    expect(calls[0]).toContain("/revisions/4/document/sign");
    expect(calls[1]).toContain("/revisions/4/document");
    /* The path came back from the server and went straight to the recorder;
       nothing in the browser composed it. */
    expect(uploadToSignedUrl).toHaveBeenCalledWith(KEY, "tok", expect.any(Blob));
    expect(JSON.parse(String(apiFetch.mock.calls[1][1].body))).toMatchObject({ path: KEY });
  });

  it("A FAILED UPLOAD records nothing at all — no half-kept document", async () => {
    apiFetch.mockImplementation(async (url: string) =>
      url.endsWith("/document/sign") ? { token: "tok", path: KEY, bucket: "sales-order-documents" } : { ok: true },
    );
    uploadToSignedUrl.mockResolvedValue({ error: new Error("network lost") });
    const store = await subject();
    const out = await store(ORDER, 4, pdf());
    expect(out.stored).toBe(false);
    expect(out.reason).toContain("network lost");
    /* The recorder is never reached, so no row claims a file that is not there. */
    expect(apiFetch.mock.calls.filter((c) => !String(c[0]).endsWith("/sign"))).toHaveLength(0);
  });

  it("A CLOSED BROWSER is the same case — the sign door answered and nothing followed", async () => {
    apiFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/document/sign")) return { token: "tok", path: KEY, bucket: "sales-order-documents" };
      throw new Error("should not be reached");
    });
    /* A tab that goes away mid-upload never resolves; the abort surfaces here. */
    uploadToSignedUrl.mockRejectedValue(new DOMException("The user aborted a request.", "AbortError"));
    const store = await subject();
    const out = await store(ORDER, 4, pdf());
    expect(out.stored).toBe(false);
    expect(out.reason).toContain("abort");
  });

  it("RETRY after a failure works, because a failure left nothing behind", async () => {
    let attempt = 0;
    apiFetch.mockImplementation(async (url: string) =>
      url.endsWith("/document/sign") ? { token: `tok${++attempt}`, path: KEY, bucket: "sales-order-documents" } : { ok: true },
    );
    uploadToSignedUrl.mockResolvedValueOnce({ error: new Error("network lost") }).mockResolvedValueOnce({ error: null });
    const store = await subject();
    expect((await store(ORDER, 4, pdf())).stored).toBe(false);
    expect((await store(ORDER, 4, pdf())).stored).toBe(true);
    expect(attempt).toBe(2);
  });

  it("A SECOND STORE for a version that already has one is refused, and says so", async () => {
    /* The concurrent case: two approvals, two tabs, or a retry after a store
       that actually succeeded. The DOOR refuses before any byte is uploaded. */
    apiFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/document/sign")) throw new Error("document_already_stored");
      return { ok: true };
    });
    const store = await subject();
    const out = await store(ORDER, 4, pdf());
    expect(out.stored).toBe(false);
    expect(out.reason).toContain("document_already_stored");
    expect(uploadToSignedUrl).not.toHaveBeenCalled();
  });

  it("stores under the EXACT version it was issued for — never a neighbour", async () => {
    apiFetch.mockImplementation(async (url: string) =>
      url.endsWith("/document/sign")
        ? { token: "tok", path: `sales-orders/${ORDER}/rev-7.pdf`, bucket: "sales-order-documents" }
        : { ok: true },
    );
    uploadToSignedUrl.mockResolvedValue({ error: null });
    const store = await subject();
    await store(ORDER, 7, pdf());
    expect(String(apiFetch.mock.calls[0][0])).toContain("/revisions/7/document/sign");
    expect(String(apiFetch.mock.calls[1][0])).toContain("/revisions/7/document");
    expect(uploadToSignedUrl).toHaveBeenCalledWith(`sales-orders/${ORDER}/rev-7.pdf`, "tok", expect.any(Blob));
  });
});
