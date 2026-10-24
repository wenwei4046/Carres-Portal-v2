import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import receipts from "./warehouse-receipts";
vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { userClient } from "../../lib/supabase";
const receiptId = "00000000-0000-4000-8000-000000000101";
const custodyId = "00000000-0000-4000-8000-000000000102";
const actor = "00000000-0000-4000-8000-000000000103";
const site = "00000000-0000-4000-8000-000000000104";
const key = "00000000-0000-4000-8000-000000000105";
const observed = { id: custodyId, receipt_id: receiptId, extra_ordinal: 1, reported_sku: "TEST-EXTRA", reported_qty: 2, reported_note: null, actual_site_id: site, holder_party_id: null, recorded_by: actor, recorded_at: "2026-10-19T10:00:00Z", goods_received_at: "2026-10-19" };
const row = { id: receiptId, po_id: "PO-TEST", status: "posted", grn_no: "GRN-TEST", extra_lines: [{ sku: "TEST-EXTRA", qty: 2 }], actual_site_id: site, warehouse_id: site };
const note = { id: "00000000-0000-4000-8000-000000000106", custody_id: custodyId, note: "TEST investigate original source", actor_id: actor, recorded_at: "2026-10-19T11:00:00Z", request_key: key };
function db(opts: { missing?: boolean; noCustody?: boolean; foreign?: boolean; missingWriter?: boolean; wrongAck?: boolean } = {}) {
  return { from: (table: string) => {
    const data = table === "warehouse_receipts" ? [row] : table === "receiving_extra_custody" ? opts.noCustody ? [] : [{ ...observed, receipt_id: opts.foreign ? "other-receipt" : receiptId }]
      : table === "warehouses" ? [{ id: site, name: "TEST Site" }] : [];
    const filters: Array<[string, unknown]> = [];
    const result = () => ({ data: data.filter(r => filters.every(([k, v]) => (r as Record<string, unknown>)[k] === v)), error: opts.missing && table === "receiving_extra_custody" ? { code: "PGRST205", message: "receiving_extra_custody is not in the schema cache" } : null });
    const q = { select: () => q, eq: (k: string, v: unknown) => { filters.push([k, v]); return q; }, in: () => q, order: () => q,
      range: async (from: number, to: number) => ({ ...result(), data: result().data.slice(from, to + 1) }),
      maybeSingle: async () => ({ ...result(), data: result().data[0] ?? null }) };
    return q;
  }, rpc: async (name: string) => name === "receiving_receipt_actor_names" ? {data:{},error:null} : opts.missingWriter ? { data: null, error: { code: "PGRST202", message: "receiving_extra_custody_note not deployed" } } : { data: opts.wrongAck ? { ...note, actor_id: site } : note, error: null } };
}
const app = new Hono<AppEnv>();
app.use("*", async (c, next) => { c.set("auth", { id: actor, jwt: "TEST", email: "test@example.invalid", role: c.req.header("x-test-role") ?? "operation" } as never); await next(); });
app.route("/receipts", receipts);
const request = (suffix = "", body?: unknown, role = "operation") => app.request(`/receipts/${receiptId}/extra-custody${suffix}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "x-test-role": role }, ...(body ? { body: JSON.stringify(body) } : {}) });
beforeEach(() => vi.mocked(userClient).mockReset());
describe("Receiving extra observations are not a disposition", () => {
  it("missing custody capability is unavailable, never an empty or resolved list", async () => {
    vi.mocked(userClient).mockReturnValue(db({ missing: true }) as never);
    const r = await request(); expect(r.status).toBe(503); expect(await r.json()).toMatchObject({ code: "receiving_extra_unavailable" });
  });
  it("preserves a known Extra observation when no controlled custody record exists", async () => {
    vi.mocked(userClient).mockReturnValue(db({ noCustody: true }) as never);
    const r = await request(); expect(r.status).toBe(503);
  });
  it("reads the actual custody record with missing names kept unknown", async () => {
    vi.mocked(userClient).mockReturnValue(db() as never);
    const r = await request(); expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ custody: [{ id: custodyId, reported_qty: 2 }], notes: [], actorNames: {} });
  });
  it("links only the original receiving report without claiming it resolves the Extra source", async () => {
    vi.mocked(userClient).mockReturnValue(db() as never);
    const r = await request();
    expect(await r.json()).toMatchObject({ recorded_with: { receipt_id: receiptId, grn_no: "GRN-TEST" } });
  });
  it("cannot append a note to another receipt's custody record", async () => {
    vi.mocked(userClient).mockReturnValue(db({ foreign: true }) as never);
    const r = await request(`/${custodyId}/notes`, { note: note.note, key }); expect(r.status).toBe(404);
  });
  it("a missing note writer is not a confirmed save", async () => {
    vi.mocked(userClient).mockReturnValue(db({ missingWriter: true }) as never);
    const r = await request(`/${custodyId}/notes`, { note: note.note, key }); expect(r.status).toBe(503);
  });
  it("a note body cannot carry a hidden accepted or returned decision", async () => {
    vi.mocked(userClient).mockReturnValue(db() as never);
    const r = await request(`/${custodyId}/notes`, { note: note.note, key, status: "accepted" }); expect(r.status).toBe(422);
  });
  it("rejects an acknowledgment belonging to a different actor", async () => {
    vi.mocked(userClient).mockReturnValue(db({ wrongAck: true }) as never);
    const r = await request(`/${custodyId}/notes`, { note: note.note, key }); expect(r.status).toBe(502);
  });
  it("returns a saved note only with this custody, actor and retry key", async () => {
    vi.mocked(userClient).mockReturnValue(db() as never);
    const r = await request(`/${custodyId}/notes`, { note: note.note, key }); expect(r.status).toBe(201); expect(await r.json()).toEqual(note);
  });
  it("Warehouse does not gain Operation's investigation-note door", async () => {
    vi.mocked(userClient).mockReturnValue(db() as never);
    const r = await request(`/${custodyId}/notes`, { note: note.note, key }, "warehouse"); expect(r.status).toBe(403);
  });
});
