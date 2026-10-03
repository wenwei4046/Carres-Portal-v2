import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";
import { billReaderRequest, readBillWithModel } from "../../lib/finance-bill-reader";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

/**
 * POST /api/finance/payables/read-bill (Chew 2026-10-03, Finance MASTER §3.2
 * Bill scanning). The model is never called in a test: `fetch` is stubbed and
 * answers as the Messages API does. Names are invented.
 */
const base = { SUPABASE_URL: "https://t.x", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "" };
const withKey = { ...base, ANTHROPIC_API_KEY: "sk-ant-test" };
const PAGE = { name: "bill.pdf", mime: "application/pdf", dataBase64: "JVBERi0xLjQK" };
const PHOTO = { name: "p2.jpg", mime: "image/jpeg", dataBase64: "/9j/4AAQ" };

const suppliers = [
  { id: "cccccccc-0000-4000-8000-000000000003", name: "Lumen Sofa Works", kind: "supplier" },
  { id: "cccccccc-0000-4000-8000-000000000004", name: "Bayview Properties", kind: "other_creditor" },
];

function modelAnswer(text: string, status = 200) {
  return new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status, headers: { "content-type": "application/json" } });
}

const reading = {
  vendorName: "LUMEN SOFA WORKS SDN BHD", vendorRegNo: null, documentKind: "invoice", invoiceNumber: "LSW-1207",
  invoiceDate: "2026-09-28", dueDate: null, currency: "RM", total: 1250,
  lines: [{ description: "Sofa 3 seater", amount: 1200 }, { description: "Delivery", amount: 50 }, { description: "Total", amount: 1250 }],
};

async function call(env: Record<string, string>, body: unknown, role = "finance") {
  const jwt = await signTestJwt("11111111-1111-1111-1111-000000000001", { email: `${role}@x`, app_metadata: { role } });
  return app.fetch(new Request("http://t/api/finance/payables/read-bill", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), env);
}

let model: ReturnType<typeof vi.fn>;
beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
  vi.mocked(userClient).mockReturnValue({
    from: vi.fn(() => ({ select: vi.fn().mockResolvedValue({ data: suppliers, error: null }) })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  model = vi.fn(async () => modelAnswer(JSON.stringify(reading)));
  vi.stubGlobal("fetch", model);
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => _setJwksForTesting(null));

describe("POST /read-bill", () => {
  it("is off until the key is given, and says so in words", async () => {
    const res = await call(base, { files: [PAGE] });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "bill_reader_not_set_up", message: "Reading bills is not set up yet. Type the bill in." });
    expect(model).not.toHaveBeenCalled();
  });

  it("is Finance's only", async () => {
    expect((await call(withKey, { files: [PAGE] }, "operation")).status).toBe(403);
    expect(model).not.toHaveBeenCalled();
  });

  it("refuses a request that is not one bill of PDF or photo pages", async () => {
    const res = await call(withKey, { files: [{ ...PAGE, mime: "text/plain" }] });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toBe("Read a PDF or a photo (JPEG, PNG or WebP).");
  });

  it("reads the pages once, cleans the answer and names the supplier it matched", async () => {
    const res = await call(withKey, { files: [PAGE, PHOTO] });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { reading: Record<string, unknown> & { lines: unknown[] }; supplier: unknown };
    expect(out.reading).toMatchObject({ invoiceNumber: "LSW-1207", invoiceDate: "2026-09-28", currency: "MYR", total: 1250 });
    expect(out.reading.lines).toEqual([{ description: "Sofa 3 seater", amount: 1200 }, { description: "Delivery", amount: 50 }]);
    expect(out.supplier).toEqual({ id: suppliers[0]!.id, name: "Lumen Sofa Works", kind: "supplier", how: "exact" });

    expect(model).toHaveBeenCalledTimes(1);
    const [url, init] = model.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers).toMatchObject({ "x-api-key": "sk-ant-test", "anthropic-version": "2023-06-01" });
    const sent = JSON.parse(String(init.body));
    expect(sent.model).toBe("claude-sonnet-5-5");
    expect(sent.messages[0].content.map((b: { type: string }) => b.type)).toEqual(["document", "image", "text"]);
  });

  it("an answer that is not JSON is a refusal in words, never an empty form", async () => {
    model.mockResolvedValueOnce(modelAnswer("Sorry, I can't read this."));
    const res = await call(withKey, { files: [PAGE] });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: "bill_unreadable", message: "The bill could not be read. Try again, or type it in." });
  });

  it("no supplier is named when the name matches none", async () => {
    model.mockResolvedValueOnce(modelAnswer(JSON.stringify({ ...reading, vendorName: "Unknown Traders" })));
    const out = (await (await call(withKey, { files: [PAGE] })).json()) as { supplier: unknown };
    expect(out.supplier).toBeNull();
  });
});

describe("readBillWithModel", () => {
  it("tells a refused page from a failed service and a slow one", async () => {
    const files = [PAGE] as Parameters<typeof billReaderRequest>[1];
    expect(await readBillWithModel({ key: "k", model: "m", files, fetchImpl: async () => new Response("{}", { status: 400 }) }))
      .toEqual({ ok: false, why: "refused" });
    expect(await readBillWithModel({ key: "k", model: "m", files, fetchImpl: async () => new Response("{}", { status: 529 }) }))
      .toEqual({ ok: false, why: "failed" });
    const slow = (_: unknown, init?: RequestInit) => new Promise<Response>((_r, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
    expect(await readBillWithModel({ key: "k", model: "m", files, fetchImpl: slow as typeof fetch, timeoutMs: 5 }))
      .toEqual({ ok: false, why: "timeout" });
  });
});
