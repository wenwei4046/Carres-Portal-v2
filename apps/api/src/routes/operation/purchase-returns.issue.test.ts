/**
 * §9.6 creation door (owner approval 2026-09-25, migration 0609):
 *   GET  /api/operation/purchase-returns/issue-source?claim=
 *   POST /api/operation/purchase-returns                     Issue Purchase Return
 *   POST /api/operation/purchase-returns/:id/send            Return document sent to supplier
 *   POST /api/operation/purchase-returns/:id/pickup-confirmation
 *   GET  /api/operation/purchase-returns/:id                 the record (ledger-derived send)
 *   GET  /api/operation/purchase-returns/work-source
 *   POST /api/operation/supplier-claims/:id/carres-execution  PO Duty only
 *   GET  /api/operation/supplier-claims/:id/record            Plan Repair server check
 *
 * Every write is the ONE SQL door; the browser never supplies Return To or the
 * catalog snapshot; a Unit refused by name ends `No return was issued.`
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
vi.mock("../../lib/work-completion", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/work-completion")>();
  return { ...real, workCompletion: () => async (_c: unknown, next: () => Promise<void>) => next() };
});
import { adminClient, userClient } from "../../lib/supabase";

const env = { SUPABASE_URL: "https://t.x", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "" };
const ME = "11111111-1111-1111-1111-000000000001";
const CLAIM = "22222222-2222-4222-8222-000000000001";
const UNIT = "33333333-3333-4333-8333-000000000001";
const PR = "44444444-4444-4444-8444-000000000001";

type Rpc = { data?: unknown; error?: { code?: string; message?: string; details?: string } | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function builder(rows: unknown[]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {};
  for (const k of ["select", "order", "in", "eq", "is", "not"]) b[k] = vi.fn(() => b);
  b.range = vi.fn((from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }));
  b.maybeSingle = vi.fn(() => Promise.resolve({ data: rows[0] ?? null, error: null }));
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res, rej);
  b.insert = vi.fn(() => { throw new Error("a route wrote a table directly"); });
  b.update = b.insert;
  return b;
}

function client(opts: { tables?: Record<string, unknown[]>; rpc?: Record<string, Rpc> } = {}) {
  const tables: Record<string, unknown[]> = {
    supplier_claims: [{ id: CLAIM, claim_no: "SC-1", supplier_id: "s1", warehouse_receipt_id: null, status: "open", customer_resolution: null, carres_execution: "return_to_supplier", carres_execution_at: "2026-09-29T02:00:00Z", carres_execution_by: ME, requested_by: null, requested_at: null, responded_by: null, supplier_response_reply_id: null }],
    suppliers: [{ id: "s1", name: "Hooka", return_address: "Lot 9, Muar", contact: "012" }],
    warehouse_receipts: [],
    product_skus: [{ sku: "SOF-1", variant: "3 seater", product_models: { name: "Kaya", category: "sofa" } }],
    purchase_returns: [],
    purchase_return_units: [],
    document_sends: [],
    purchase_return_pickup_confirmations: [],
    purchase_return_supplier_receipts: [],
    purchase_return_supplier_receipt_units: [],
    supplier_claim_replies: [],
    ops_stock_items: [],
    repair_orders: [],
    salespersons: [],
    app_users: [{ id: ME, name: "Mei", email: "mei@x" }],
    ...opts.tables,
  };
  const rpcs: Record<string, Rpc> = {
    purchase_return_eligible_units: { data: [{ stock_item_id: UNIT, unit_code: "U1-000-001", sku: "SOF-1", po_no: "PO-1", warehouse_id: "w", pickup_location: "Carres Klang", seen: "2026-09-29 02:00:00+00", refusal: null }] },
    purchasing_issue_purchase_return: { data: PR },
    purchase_return_record_send: { data: "d1" },
    purchase_return_record_pickup_confirmation: { data: "p1" },
    purchase_return_record_supplier_receipt: { data: "r1" },
    purchasing_po_duty_may_act: { data: true },
    supplier_claim_record_carres_execution: { data: { claim_no: "SC-1" } },
    workspace_resolve_duty: { data: null },
    actor_display_names: { data: [{ id: ME, name: "Mei" }] },
    ...opts.rpc,
  };
  return {
    rpc: vi.fn(async (name: string, _args?: unknown) => ({ data: null, error: null, ...(rpcs[name] ?? {}) })),
    from: vi.fn((t: string) => {
      if (!(t in tables)) throw new Error(`unmocked table ${t}`);
      return builder(tables[t]!);
    }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "u" } }) }) },
  };
}

async function call(sb: ReturnType<typeof client>, path: string, init: { method?: string; body?: unknown; role?: string } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(sb as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(adminClient).mockReturnValue(sb as any);
  const jwt = await signTestJwt(ME, { email: "op@x", app_metadata: { role: init.role ?? "operation" } });
  return app.fetch(new Request(`http://t/api${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  }), env);
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
  vi.mocked(adminClient).mockReset();
});
afterAll(() => _setJwksForTesting(null));

describe("Issue Purchase Return", () => {
  it("the form reads Return To from Supplier Master and the Units with the door's own words", async () => {
    const res = await call(client(), `/operation/purchase-returns/issue-source?claim=${CLAIM}`);
    expect(res.status).toBe(200);
    const { source } = (await res.json()) as { source: Record<string, unknown> & { units: Array<Record<string, unknown>> } };
    expect(source.return_address).toBe("Lot 9, Muar");
    expect(source.units[0]).toMatchObject({ unit_code: "U1-000-001", category: "Sofa", item: "Kaya", item_spec: "3 seater", pickup_location: "Carres Klang", refusal: null });
  });

  it("calls the ONE door with the server's catalog snapshot, never the browser's Return To", async () => {
    const sb = client();
    const res = await call(sb, "/operation/purchase-returns", { method: "POST", body: { claim_id: CLAIM, units: [{ stock_item_id: UNIT, seen: "t", pickup_location: "Bay 3", return_to: "EVIL", item: "EVIL" }], confirmed_pickup_date: "2099-01-05" } });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: PR });
    const door = sb.rpc.mock.calls.find(([name]) => name === "purchasing_issue_purchase_return");
    expect(door?.[1]).toEqual({
      p_claim_id: CLAIM,
      p_units: [{ stock_item_id: UNIT, seen: "t", pickup_location: "Bay 3", category: "Sofa", item: "Kaya", item_spec: "3 seater" }],
      p_confirmed_pickup_date: "2099-01-05",
    });
  });

  it("a Unit refused by name ends with `No return was issued.`", async () => {
    const sb = client({ rpc: { purchasing_issue_purchase_return: { error: { code: "23514", message: "U1-000-001: Changed since the form opened", details: "unit_changed" } } } });
    const res = await call(sb, "/operation/purchase-returns", { method: "POST", body: { claim_id: CLAIM, units: [{ stock_item_id: UNIT, seen: "t" }] } });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "unit_changed", message: "U1-000-001: Changed since the form opened. No return was issued." });
  });

  it("a missing return address is refused in the approved words", async () => {
    const sb = client({ rpc: { purchasing_issue_purchase_return: { error: { code: "23514", message: "Add the return address of Hooka", details: "return_address_missing" } } } });
    const res = await call(sb, "/operation/purchase-returns", { method: "POST", body: { claim_id: CLAIM, units: [{ stock_item_id: UNIT, seen: "t" }] } });
    expect(await res.json()).toMatchObject({ code: "return_address_missing", message: "Add the return address of Hooka" });
  });

  it("is internal only", async () => {
    const res = await call(client(), "/operation/purchase-returns", { method: "POST", role: "dealer", body: { claim_id: CLAIM, units: [{ stock_item_id: UNIT, seen: "t" }] } });
    expect(res.status).toBe(403);
  });
});

describe("send and pickup", () => {
  it("records `Return document sent to supplier` through its door", async () => {
    const sb = client();
    const res = await call(sb, `/operation/purchase-returns/${PR}/send`, { method: "POST", body: { channel: "whatsapp", recipient: "Ah Seng" } });
    expect(res.status).toBe(200);
    expect(sb.rpc.mock.calls.find(([n]) => n === "purchase_return_record_send")?.[1]).toEqual({ p_return_id: PR, p_channel: "whatsapp", p_recipient: "Ah Seng", p_note: null });
  });

  it("records an evidenced Confirmed Pickup", async () => {
    const sb = client();
    const res = await call(sb, `/operation/purchase-returns/${PR}/pickup-confirmation`, { method: "POST", body: { confirmed_pickup_date: "2099-02-01", evidence: "Ah Seng on WhatsApp" } });
    expect(res.status).toBe(200);
    expect(sb.rpc.mock.calls.find(([n]) => n === "purchase_return_record_pickup_confirmation")?.[1]).toEqual({ p_return_id: PR, p_date: "2099-02-01", p_evidence: "Ah Seng on WhatsApp" });
  });

  it("the record derives `sent` from the ledger, not the 0548 column", async () => {
    const tables = {
      purchase_returns: [{ id: PR, pr_no: "PR-20260929-1001", pr_doc_date: "2026-09-29T02:00:00Z", supplier_id: "s1", supplier_claim_id: CLAIM, warehouse_receipt_id: null, confirmed_pickup_date: null, document_sent_at: "2020-01-01T00:00:00Z" }],
      purchase_return_units: [{ purchase_return_id: PR, stock_item_id: UNIT, unit_code: "U1-000-001", evidence: [] }],
      document_sends: [],
    };
    const res = await call(client({ tables }), `/operation/purchase-returns/${PR}`);
    const { purchaseReturn } = (await res.json()) as { purchaseReturn: { sent_at: string | null; sends: unknown[] } };
    expect(purchaseReturn.sent_at).toBeNull();
    expect(purchaseReturn.sends).toEqual([]);
  });

  it("Work reads claims awaiting a return and returns not yet picked up", async () => {
    const res = await call(client(), "/operation/purchase-returns/work-source");
    const body = (await res.json()) as { pendingIssue: Array<Record<string, unknown>> };
    expect(body.pendingIssue).toEqual([{ id: CLAIM, claim_no: "SC-1", supplier_name: "Hooka", carres_execution_at: "2026-09-29T02:00:00Z" }]);
  });
});

describe("Record what Carres does next and Plan Repair", () => {
  it("refuses an Operation person who is not PO Duty, cover or superuser", async () => {
    const sb = client({ rpc: { purchasing_po_duty_may_act: { data: false } } });
    const res = await call(sb, `/operation/supplier-claims/${CLAIM}/carres-execution`, { method: "POST", body: { carres_execution: "return_to_supplier" } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "not_po_duty" });
    expect(sb.rpc.mock.calls.some(([n]) => n === "supplier_claim_record_carres_execution")).toBe(false);
  });

  it("writes through the existing route for PO Duty", async () => {
    const sb = client();
    const res = await call(sb, `/operation/supplier-claims/${CLAIM}/carres-execution`, { method: "POST", body: { carres_execution: "return_to_supplier" } });
    expect(res.status).toBe(200);
    expect(sb.rpc.mock.calls.find(([n]) => n === "supplier_claim_record_carres_execution")?.[1]).toEqual({ p_claim_id: CLAIM, p_execution: "return_to_supplier", p_note: null });
  });

  it("`Plan Repair` shows only when Authorised Outcome = Repair, exact Units and the actor's permission", async () => {
    const repairClaim = (resolution: string | null) => ({ supplier_claims: [{ id: CLAIM, claim_no: "SC-1", status: "open", customer_resolution: resolution, carres_execution: null, carres_execution_at: null, carres_execution_by: null, requested_by: null, requested_at: null, responded_by: null, supplier_response_reply_id: null }], ops_stock_items: [{ id: UNIT, unit_code: "U1-000-001", identity_scope: "unit", qty: 1, status: "on_hold" }] });
    const read = async (sb: ReturnType<typeof client>) => ((await (await call(sb, `/operation/supplier-claims/${CLAIM}/record`)).json()) as { plan_repair: { allowed: boolean; missing: string | null }; may_record_next: boolean });
    expect((await read(client({ tables: repairClaim(null) }))).plan_repair).toEqual({ allowed: false, missing: "Authorised Outcome" });
    expect((await read(client({ tables: repairClaim("repair"), rpc: { purchasing_po_duty_may_act: { data: false } } }))).plan_repair).toEqual({ allowed: false, missing: "PO Duty" });
    const ok = await read(client({ tables: repairClaim("repair") }));
    expect(ok.plan_repair).toEqual({ allowed: true, missing: null });
    expect(ok.may_record_next).toBe(true);
  });

  it("the ONE decision is the Authorised Outcome; Replacement opens its existing door only", async () => {
    const claimWith = (over: Record<string, unknown>) => ({ supplier_claims: [{ id: CLAIM, claim_no: "SC-1", status: "open", customer_resolution: null, carres_execution: null, carres_execution_at: null, carres_execution_by: null, customer_resolution_at: null, customer_resolution_by: null, requested_by: null, requested_at: null, responded_by: null, supplier_response_reply_id: null, ...over }] });
    const read = async (sb: ReturnType<typeof client>) => (await (await call(sb, `/operation/supplier-claims/${CLAIM}/record`)).json()) as Record<string, unknown>;
    const replacement = await read(client({ tables: claimWith({ customer_resolution: "replace", customer_resolution_at: "2026-09-29T02:00:00Z", customer_resolution_by: ME }) }));
    expect(replacement).toMatchObject({ decision: "replacement", authorised_outcome: "Replacement", decision_by_name: "Mei", plan_replacement: { allowed: true } });
    const legacy = await read(client({ tables: claimWith({ carres_execution: "collect_first", customer_resolution: "accept_as_is" }) }));
    expect(legacy).toMatchObject({ decision: null, authorised_outcome: null, legacy_words: ["Collect First", "Accept As-Is"] });
  });

  it("refuses a customer movement before the database", async () => {
    const sb = client();
    const res = await call(sb, `/operation/supplier-claims/${CLAIM}/carres-execution`, { method: "POST", body: { carres_execution: "collect_first" } });
    expect(res.status).toBe(422);
    expect(sb.rpc.mock.calls.some(([n]) => n === "supplier_claim_record_carres_execution")).toBe(false);
  });
});

describe("Record supplier receipt (§9.6, 0614)", () => {
  const RU = "55555555-5555-4555-8555-000000000001";
  it("calls the ONE door with the exact Units, the supplier evidence and the confirmation", async () => {
    const sb = client();
    const res = await call(sb, `/operation/purchase-returns/${PR}/supplier-receipt`, { method: "POST", body: {
      received_on: "2026-09-07", stock_item_ids: [UNIT], evidence: [{ path: `purchase_return_receipt/${PR}/a.pdf`, kind: "pdf" }], confirmed_by: "Mr Tan", confirmed_at: "2026-09-07T10:00:00+08:00", note: "Signed GRN" } });
    expect(res.status).toBe(200);
    expect(sb.rpc.mock.calls.find(([n]) => n === "purchase_return_record_supplier_receipt")?.[1]).toEqual({
      p_return_id: PR, p_received_on: "2026-09-07", p_stock_item_ids: [UNIT], p_evidence: [{ path: `purchase_return_receipt/${PR}/a.pdf`, kind: "pdf" }],
      p_confirmed_by: "Mr Tan", p_confirmed_at: "2026-09-07T10:00:00+08:00", p_note: "Signed GRN",
    });
  });

  it("a Unit Stock has not picked up is refused in the door's own words", async () => {
    const sb = client({ rpc: { purchase_return_record_supplier_receipt: { error: { code: "23514", message: "U1-000-001: Not picked up", details: "not_picked_up" } } } });
    const res = await call(sb, `/operation/purchase-returns/${PR}/supplier-receipt`, { method: "POST", body: { received_on: "2026-09-07", stock_item_ids: [UNIT], confirmed_by: "Mr Tan", confirmed_at: "2026-09-07T10:00:00+08:00" } });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "not_picked_up", message: "U1-000-001: Not picked up" });
  });

  it("is internal only", async () => {
    const res = await call(client(), `/operation/purchase-returns/${PR}/supplier-receipt`, { method: "POST", role: "dealer", body: { received_on: "2026-09-07", stock_item_ids: [UNIT] } });
    expect(res.status).toBe(403);
  });

  it("the record reads Supplier Received Date and receipt proof from the receipt ledger, never from pickup or the 0548 column", async () => {
    const tables = {
      purchase_returns: [{ id: PR, pr_no: "PR-20260929-1001", pr_doc_date: "2026-09-29T02:00:00Z", supplier_id: "s1", supplier_claim_id: CLAIM, warehouse_receipt_id: null, confirmed_pickup_date: null }],
      purchase_return_units: [
        { id: RU, purchase_return_id: PR, stock_item_id: UNIT, unit_code: "U1-000-001", actual_pickup_date: "2026-09-05T02:00:00Z", supplier_received_date: "2020-01-01T00:00:00Z", evidence: [] },
        { id: "ru-2", purchase_return_id: PR, stock_item_id: "s-2", unit_code: "U1-000-002", actual_pickup_date: "2026-09-05T02:00:00Z", supplier_received_date: null, evidence: [] },
      ],
      purchase_return_supplier_receipts: [{ id: "r1", purchase_return_id: PR, received_on: "2026-09-07", evidence: [{ path: "purchase_return_receipt/x/a.jpg", kind: "photo" }, { path: "purchase_return_receipt/x/b.mp4", kind: "video" }], confirmed_by: null, confirmed_at: null, recorded_by: ME, recorded_at: "2026-09-07T04:00:00Z" }],
      purchase_return_supplier_receipt_units: [{ receipt_id: "r1", purchase_return_unit_id: RU }],
    };
    const res = await call(client({ tables }), `/operation/purchase-returns/${PR}`);
    const { purchaseReturn } = (await res.json()) as { purchaseReturn: { units: Array<Record<string, unknown>>; receipts: Array<Record<string, unknown>> } };
    expect(purchaseReturn.units.map((u) => [u.unit_id, u.stock_item_id, u.supplier_received_date])).toEqual([["U1-000-001", UNIT, "2026-09-07"], ["U1-000-002", "s-2", null]]);
    expect(purchaseReturn.units[0]!.evidence).toEqual([{ purpose: "receipt", photos: 1, videos: 1 }]);
    expect(purchaseReturn.units[1]!.evidence).toEqual([]);
    expect(purchaseReturn.receipts).toEqual([{ received_on: "2026-09-07", unit_ids: ["U1-000-001"], files: 2, confirmed_by: null, confirmed_at: null, recorded_at: "2026-09-07T04:00:00Z", recorded_by_name: "Mei" }]);
  });
});
