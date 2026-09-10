import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../../types";
import sources from "./arrival-sources";
import receiving from "./warehouse-receipts";
vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));
import { userClient, adminClient } from "../../lib/supabase";
const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const rpc = vi.fn();
const input = {
  id,
  kind: "transfer",
  claim_id: null,
  case_id: null,
  from_site_id: id,
  to_site_id: other,
  party_id: id,
  expected_date: "2026-09-12",
  collection_date: null,
  reason: "Display request",
  unit_ids: [id],
};
function app(role = "operation") {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("auth", { id, role, jwt: "actor-token" } as never);
    await next();
  });
  a.route("/sources", sources);
  a.route("/receiving", receiving);
  return a;
}
const post = (a: ReturnType<typeof app>, path: string, body: unknown) =>
  a.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: { id }, error: null });
  vi.mocked(userClient).mockReturnValue({ rpc } as never);
});
describe("source and Receiving ownership", () => {
  it("creates source work using the authenticated database authority", async () => {
    expect((await post(app(), "/sources", input)).status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("arrival_source_create", {
      p_input: input,
    });
    expect(adminClient).not.toHaveBeenCalled();
  });
  it("rejects bulk/duplicate identities before calling the database", async () => {
    expect(
      (await post(app(), "/sources", { ...input, unit_ids: [id, id] })).status,
    ).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("a dealer cannot create or hand over a source", async () => {
    expect((await post(app("dealer"), "/sources", input)).status).toBe(403);
    expect(
      (await post(app("dealer"), `/sources/${id}/handover`, {})).status,
    ).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("source router offers no receipt writer", async () => {
    expect((await post(app(), `/sources/${id}/receive`, {})).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("Receiving delegates exact outcomes to the existing GRN authority", async () => {
    const r = {
      key: id,
      goods_received_at: "2026-09-07",
      actual_site_id: id,
      holder_party_id: id,
      handover_person: "Recorded person",
      do_number: "DO-1",
      do_file_path: `${id}/proof.pdf`,
      note: "",
      units: [
        {
          stock_item_id: id,
          outcome: "received_with_issue",
          issue_kind: "damaged",
          note: "Torn",
        },
      ],
    };
    expect((await post(app(), `/receiving/arrival/${id}`, r)).status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("receiving_arrival_post", {
      p_source_id: id,
      p_input: r,
    });
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "not GRN Duty" },
    });
    const denied = await post(app(), `/receiving/arrival/${id}`, r);
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { message: string }).message).toBe(
      "not GRN Duty",
    );
  });
  it("reports later Unit changes as a correction conflict, not success", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "40001", message: "Unit changed after Receiving" },
    });
    expect(
      (
        await post(app(), `/receiving/arrival-receipts/${id}/void`, {
          reason: "Count corrected",
        })
      ).status,
    ).toBe(409);
  });
});
