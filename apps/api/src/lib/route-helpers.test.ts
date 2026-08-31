import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Hono } from "hono";
import { mapPgError, parseJsonBody } from "./route-helpers";

describe("mapPgError", () => {
  it("maps SQLSTATE 42501 to 403 forbidden", () => {
    const m = mapPgError({ code: "42501", message: "row-level violation" });
    expect(m.status).toBe(403);
    expect(m.body).toEqual({
      error: "forbidden",
      code: "forbidden",
      message: "row-level violation",
    });
  });

  it("falls back to 'forbidden' message when 42501 has no message", () => {
    const m = mapPgError({ code: "42501" });
    expect(m.status).toBe(403);
    expect(m.body.message).toBe("forbidden");
  });

  it("keeps the governed GRN authority refusal code", () => {
    const m = mapPgError({
      code: "42501",
      details: "grn_authority_required",
      message: "GRN authority is required",
    });
    expect(m.status).toBe(403);
    expect(m.body.code).toBe("grn_authority_required");
  });

  it("maps SQLSTATE 42P01 to 404 not_found", () => {
    const m = mapPgError({ code: "42P01", message: "relation x does not exist" });
    expect(m.status).toBe(404);
    expect(m.body).toEqual({
      error: "not_found",
      code: "not_found",
      message: "relation x does not exist",
    });
  });

  it("falls back to 'not found' message when 42P01 has no message", () => {
    const m = mapPgError({ code: "42P01" });
    expect(m.status).toBe(404);
    expect(m.body.message).toBe("not found");
  });

  it("maps SQLSTATE 22023 to 422 invalid_param", () => {
    const m = mapPgError({ code: "22023", message: "bad arg" });
    expect(m.status).toBe(422);
    expect(m.body).toEqual({
      error: "invalid_param",
      code: "invalid_param",
      message: "bad arg",
    });
  });

  it("falls back to 'invalid param' message when 22023 has no message", () => {
    const m = mapPgError({ code: "22023" });
    expect(m.status).toBe(422);
    expect(m.body.message).toBe("invalid param");
  });

  it("keeps the receiving evidence detail on a 422", () => {
    const m = mapPgError({
      code: "22023",
      details: "evidence_missing",
      message: "Signed DO photo is missing",
    });
    expect(m.status).toBe(422);
    expect(m.body.code).toBe("evidence_missing");
  });

  it("maps SQLSTATE P0001 to 422 rule_violation with details as code", () => {
    const m = mapPgError({
      code: "P0001",
      message: "stage transition not allowed",
      details: "stage_locked",
    });
    expect(m.status).toBe(422);
    expect(m.body).toEqual({
      error: "rule_violation",
      code: "stage_locked",
      message: "stage transition not allowed",
    });
  });

  it("P0001 without details falls back to invalid_param code and 'rule violation' message", () => {
    const m = mapPgError({ code: "P0001" });
    expect(m.status).toBe(422);
    expect(m.body).toEqual({
      error: "rule_violation",
      code: "invalid_param",
      message: "rule violation",
    });
  });

  it("maps unknown SQLSTATE to 500 rpc_failed", () => {
    const m = mapPgError({ code: "23505", message: "duplicate key" });
    expect(m.status).toBe(500);
    expect(m.body).toEqual({
      error: "rpc_failed",
      code: "rpc_failed",
      message: "duplicate key",
    });
  });

  it("maps the named duplicate Supplier DO guard to 409", () => {
    const m = mapPgError({
      code: "23505",
      details: "duplicate_supplier_do",
      message: "Supplier DO DO-1 was already used for GRN-20260831-0001",
    });
    expect(m.status).toBe(409);
    expect(m.body.code).toBe("duplicate_supplier_do");
  });

  // v3-active.1 (migration 0037): the batch RPC's _v3_claim_threads_for_po
  // helper raises 40001 (serialization_failure) when a concurrent PO has
  // already claimed one of the candidate threads. mapPgError surfaces it as
  // 409 Conflict so the FE can show "Refresh and try again" without confusing
  // it with a 422 validation failure.
  it("maps SQLSTATE 40001 to 409 conflict (concurrent_claim)", () => {
    const m = mapPgError({
      code: "40001",
      message: "concurrent_claim: 1 thread(s) already claimed",
      details: "concurrent_claim",
    });
    expect(m.status).toBe(409);
    expect(m.body).toEqual({
      error: "conflict",
      code: "concurrent_claim",
      message: "concurrent_claim: 1 thread(s) already claimed",
    });
  });

  it("falls back to 'concurrent_claim' code when 40001 has no details", () => {
    const m = mapPgError({ code: "40001" });
    expect(m.status).toBe(409);
    expect(m.body.message).toBe("conflict");
    expect(m.body.code).toBe("concurrent_claim");
  });

  it("maps undefined code to 500 rpc_failed with fallback message", () => {
    const m = mapPgError({});
    expect(m.status).toBe(500);
    expect(m.body).toEqual({
      error: "rpc_failed",
      code: "rpc_failed",
      message: "rpc failed",
    });
  });
});

describe("parseJsonBody", () => {
  // Build a minimal Hono context that matches what the helper consumes.
  // Using a real Hono app + Request keeps the test honest end-to-end.
  const schema = z.object({ name: z.string().min(1, "name required") });

  async function callHelper(body: BodyInit | null, contentType = "application/json") {
    const app = new Hono();
    let captured: Awaited<ReturnType<typeof parseJsonBody<typeof schema>>> | null = null;
    app.post("/t", async (c) => {
      captured = await parseJsonBody(c, schema);
      return c.json({ ok: true });
    });
    await app.fetch(
      new Request("http://t/t", {
        method: "POST",
        headers: { "Content-Type": contentType },
        body,
      }),
    );
    return captured!;
  }

  it("returns {ok: true, data} for valid JSON body", async () => {
    const r = await callHelper(JSON.stringify({ name: "Loo" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual({ name: "Loo" });
    }
  });

  it("returns 422 invalid_input for malformed JSON (treated as empty {})", async () => {
    const r = await callHelper("{not json");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(422);
      expect(r.body.error).toBe("invalid_input");
      expect(r.body.code).toBe("invalid_param");
      // schema requires `name`, so empty {} fails with the schema's first issue.
      expect(r.body.message).toBe("Required");
    }
  });

  it("propagates the first zod issue message on validation failure", async () => {
    const r = await callHelper(JSON.stringify({ name: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(422);
      expect(r.body.message).toBe("name required");
    }
  });

  it("falls back to 'invalid input' when zod failure has no first issue", async () => {
    // Duck-typed schema whose safeParse returns a failure with empty issues[].
    // Exercises the `?? "invalid input"` branch when issues[0] is undefined.
    const stubSchema = {
      safeParse: () => ({
        success: false as const,
        error: { issues: [] as { message?: string }[] },
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    type Result =
      | { ok: true; data: unknown }
      | { ok: false; status: 422; body: { error: string; code: string; message: string } };
    const app = new Hono();
    let captured: Result | null = null;
    app.post("/t", async (c) => {
      captured = (await parseJsonBody(c, stubSchema)) as Result;
      return c.json({ ok: true });
    });
    await app.fetch(
      new Request("http://t/t", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "anything" }),
      }),
    );
    const r = captured as Result | null;
    expect(r).not.toBeNull();
    if (r && !r.ok) {
      expect(r.status).toBe(422);
      expect(r.body.message).toBe("invalid input");
    } else {
      throw new Error("expected parseJsonBody to fail");
    }
  });
});
