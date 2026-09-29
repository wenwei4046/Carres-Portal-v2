/**
 * §9.7 (migration 0602) — the Repair Orders routes:
 *   GET  /api/operation/repair-orders            the register
 *   GET  /api/operation/repair-orders/:id        the object
 *   GET  /api/operation/repair-orders/eligible-units
 *   POST /api/operation/repair-orders            create
 *   POST /:id/issue · /:id/supplier-receipt · /:id/supplier-reply ·
 *        /:id/owner-consent · /:id/cancel
 *
 * The rules live in the database (0602's doors, proven on a replayed chain in
 * `test/repair-orders-0602.integration.test.ts`). What these pin down is the
 * route's own job: the gate, the one row shape assembled from the owning
 * facts, the refusal words passed through BY NAME, and the Office working-day
 * target computed once, by the shared engine, before the door checks it.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import {
  repairOrderReturnTarget,
  REPAIR_ORDER_TARGET_CALENDAR,
  repairOrderConditions,
  type RepairOrderDetail,
  type RepairOrderListRow,
} from "@carres/shared";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { adminClient, userClient } from "../../lib/supabase";

const env = { SUPABASE_URL: "https://t.x", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "" };
const RO_ID = "11111111-2222-4333-8444-555555555555";

const RO = {
  id: RO_ID, ro_no: "RO-20260928-4827", ro_doc_date: "2026-09-28", version: 1, supplier_id: "s1",
  supplier_claim_id: null, cost_responsibility: "not_decided", price: null, quotation_path: null,
  pickup_site_id: "w1", return_site_id: "w1", supplier_received_at: null, supplier_received_source: null,
  supplier_received_evidence: null, return_target_date: null, return_target_working_days: null,
  return_target_calendar: null, cancelled_at: null, cancel_reason: null, created_by: "u1", created_at: "2026-09-28T02:00:00Z",
};
const UNITS = [
  { repair_order_id: RO_ID, stock_item_id: "si1", unit_code: "U1-000-001", po_no: "PO260920-1111", sku: "SKU-1", ownership: "carres_owned", problem: "damaged", problem_note: "Arm torn", repair_requirement: "Replace arm fabric", evidence: [], released_at: null },
  { repair_order_id: RO_ID, stock_item_id: "si2", unit_code: "U1-000-002", po_no: "PO260920-1111", sku: "SKU-1", ownership: "supplier_consignment", problem: "missing_component", problem_note: "Leg missing", repair_requirement: "Supply leg", evidence: [], released_at: null },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function builder(rows: unknown[]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: vi.fn(() => b), order: vi.fn(() => b), in: vi.fn(() => b), eq: vi.fn(() => b), is: vi.fn(() => b), limit: vi.fn(() => b),
    range: vi.fn((from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: rows[0] ?? null, error: null })),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res, rej),
  };
  return b;
}

function client(over: Partial<Record<string, unknown[]>> = {}, rpc: (name: string, args: unknown) => unknown = () => ({ data: null, error: null })) {
  const tables: Record<string, unknown[]> = {
    repair_orders: [RO],
    repair_order_units: UNITS,
    document_sends: [],
    repair_order_supplier_replies: [],
    repair_order_owner_consents: [],
    arrival_sources: [],
    arrival_source_events: [],
    warehouse_receipts: [],
    receiving_unit_results: [],
    ops_stock_items: [{ id: "si1", status: "free", hold_reason: null, condition: "exhibition" }, { id: "si2", status: "free", hold_reason: null, condition: "new" }],
    product_skus: [{ sku: "SKU-1", variant: "3 seater · Grey", product_models: { name: "Sofa Lyra", category: "Sofa" } }],
    suppliers: [{ id: "s1", name: "Hooka" }],
    supplier_claims: [],
    warehouses: [{ id: "w1", name: "Carres Klang", kind: "own" }],
    purchasing_settings: [{ repair_return_working_days: 14 }],
    salespersons: [],
    ...over,
  };
  const calls: { name: string; args: unknown }[] = [];
  return {
    calls,
    rpc: vi.fn(async (name: string, args: unknown) => {
      if (name === "actor_display_names") return { data: [{ id: "u1", name: "Faizal" }], error: null };
      calls.push({ name, args });
      return rpc(name, args);
    }),
    from: vi.fn((t: string) => {
      if (!(t in tables)) throw new Error(`unmocked table ${t}`);
      return builder(tables[t]!);
    }),
    storage: { from: () => ({
      createSignedUrl: async () => ({ data: { signedUrl: "https://signed" } }),
      createSignedUploadUrl: async (path: string) => ({ data: { token: "t", path }, error: null }),
    }) },
  };
}

async function call(sb: ReturnType<typeof client>, path: string, init: RequestInit = {}, role = "operation") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(sb as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(adminClient).mockReturnValue(sb as any);
  const jwt = await signTestJwt("11111111-1111-1111-1111-000000000001", { email: `${role}@x`, app_metadata: { role } });
  return app.fetch(new Request(`http://t/api/operation/repair-orders${path}`, {
    ...init, headers: { Authorization: `Bearer ${jwt}`, "content-type": "application/json" },
  }), env);
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
  vi.mocked(adminClient).mockReset();
});
afterAll(() => _setJwksForTesting(null));

describe("GET /api/operation/repair-orders", () => {
  it("refuses a role that is not Operation or Principal", async () => {
    const res = await call(client(), "", {}, "dealer");
    expect(res.status).toBe(403);
  });

  it("returns one row per RO with every Unit, named Supplier and Sites, and Display read from Stock", async () => {
    const res = await call(client(), "");
    expect(res.status).toBe(200);
    const { repairOrders } = (await res.json()) as { repairOrders: RepairOrderListRow[] };
    expect(repairOrders).toHaveLength(1);
    const row = repairOrders[0]!;
    expect(row.ro_no).toBe("RO-20260928-4827");
    expect(row.supplier_name).toBe("Hooka");
    expect(row.pickup_site_name).toBe("Carres Klang");
    expect(row.units.map((u) => u.unit_id)).toEqual(["U1-000-001", "U1-000-002"]);
    expect(row.units[0]).toMatchObject({ item: "Sofa Lyra", item_spec: "3 seater · Grey", category: "Sofa", display: true });
    // Nothing sent: the rail says `Sending not confirmed`, never "not sent".
    expect(row.issued).toBe(false);
    expect(repairOrderConditions(row)).toContain("Sending not confirmed");
    // Price unknown stays unknown.
    expect(row.price).toBeNull();
  });

  it("reads the return leg from Stock's pickup event and Receiving's GRN", async () => {
    const sb = client({
      document_sends: [{ document_id: RO_ID, version: 1, recipient: "Hooka group", channel: "whatsapp", confirmed: true, sent_by: "u1", sent_at: "2026-09-28T03:00:00Z" }],
      arrival_sources: [{ id: "a1", repair_order_id: RO_ID, cancelled_at: null }],
      arrival_source_events: [{ source_id: "a1", kind: "collected", unit_ids: ["si1"], person: "Ah Hock", evidence: "lorry photo", occurred_at: "2026-09-29T02:00:00Z" }],
      warehouse_receipts: [{ id: "r1", arrival_source_id: "a1", grn_no: "GRN-20261010-1234", goods_received_at: "2026-10-10", do_file_path: "a1/x.pdf", status: "posted" }],
      receiving_unit_results: [{ receipt_id: "r1", stock_item_id: "si1", outcome: "received" }],
    });
    const res = await call(sb, "");
    const row = ((await res.json()) as { repairOrders: RepairOrderListRow[] }).repairOrders[0]!;
    expect(row.issued).toBe(true);
    expect(row.units[0]).toMatchObject({ collected_by: "Ah Hock", actual_pickup_date: "2026-09-29T02:00:00Z", grn_no: "GRN-20261010-1234", goods_received_date: "2026-10-10", pickup_proof: true, return_proof: true });
    expect(row.units[1]).toMatchObject({ actual_pickup_date: null, grn_no: null });
    expect(repairOrderConditions(row)).toEqual(expect.arrayContaining(["Partly picked up", "Partly returned"]));
  });
});

describe("GET /api/operation/repair-orders/:id", () => {
  it("opens by id or by RO No and carries sends, replies and consents", async () => {
    const res = await call(client(), `/${RO.ro_no}`);
    expect(res.status).toBe(200);
    const { repairOrder } = (await res.json()) as { repairOrder: RepairOrderDetail };
    expect(repairOrder.id).toBe(RO_ID);
    expect(repairOrder.created_by).toBe("Faizal");
    expect(repairOrder.sends).toEqual([]);
  });
  it("answers 404 for an RO that does not exist", async () => {
    const res = await call(client({ repair_orders: [] }), `/${RO_ID}`);
    expect(res.status).toBe(404);
  });
});

describe("writes", () => {
  const createBody = {
    request_id: "99999999-2222-4333-8444-555555555555", supplier_id: "11111111-2222-4333-8444-000000000001",
    cost_responsibility: "not_decided", pickup_site_id: "11111111-2222-4333-8444-000000000002",
    return_site_id: "11111111-2222-4333-8444-000000000002",
    units: [{ stock_item_id: "11111111-2222-4333-8444-000000000003", problem: "damaged", problem_note: "Arm torn", repair_requirement: "Replace arm", evidence: [] }],
  };

  it("create passes the body to the ONE door and answers 201 with the minted RO No", async () => {
    const sb = client({}, () => ({ data: { id: RO_ID, ro_no: "RO-20260928-4827", replayed: false }, error: null }));
    const res = await call(sb, "", { method: "POST", body: JSON.stringify(createBody) });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ro_no: "RO-20260928-4827" });
    expect(sb.calls[0]).toMatchObject({ name: "repair_order_create" });
  });

  it("a refused Unit comes back BY NAME with the door's own words", async () => {
    const sb = client({}, () => ({ data: null, error: { code: "23514", message: "U1-000-001: Reserved for SO2609-4827", details: "unit_not_eligible" } }));
    const res = await call(sb, "", { method: "POST", body: JSON.stringify(createBody) });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "unit_not_eligible", message: "U1-000-001: Reserved for SO2609-4827" });
  });

  it("refuses a create with no Units before the database is asked", async () => {
    const sb = client();
    const res = await call(sb, "", { method: "POST", body: JSON.stringify({ ...createBody, units: [] }) });
    expect(res.status).toBe(422);
    expect(sb.calls).toHaveLength(0);
  });

  it("issue records channel and recipient", async () => {
    const sb = client({}, () => ({ data: "send-1", error: null }));
    const res = await call(sb, `/${RO_ID}/issue`, { method: "POST", body: JSON.stringify({ channel: "whatsapp", recipient: "Hooka group" }) });
    expect(res.status).toBe(200);
    expect(sb.calls[0]).toEqual({ name: "repair_order_issue", args: { p_ro_id: RO_ID, p_channel: "whatsapp", p_recipient: "Hooka group", p_note: null } });
  });

  it("supplier receipt computes the target ONCE with the shared Office engine and the governed period", async () => {
    const sb = client({}, () => ({ data: { id: RO_ID }, error: null }));
    const received_at = "2026-09-28T02:00:00.000Z";
    const res = await call(sb, `/${RO_ID}/supplier-receipt`, { method: "POST", body: JSON.stringify({ received_at, source: "whatsapp", reference: "Hooka 10:02" }) });
    expect(res.status).toBe(200);
    expect(sb.calls[0]).toEqual({
      name: "repair_order_record_supplier_receipt",
      args: { p_ro_id: RO_ID, p_received_at: received_at, p_source: "whatsapp", p_evidence: "Hooka 10:02", p_target: repairOrderReturnTarget(received_at, 14), p_calendar: REPAIR_ORDER_TARGET_CALENDAR },
    });
  });

  it("a Supplier reply must name a governed reason; `Other` needs a note", async () => {
    const sb = client({}, () => ({ data: "r1", error: null }));
    const bad = await call(sb, `/${RO_ID}/supplier-reply`, { method: "POST", body: JSON.stringify({ reason: "Other", reference: "x" }) });
    expect(bad.status).toBe(422);
    const ok = await call(sb, `/${RO_ID}/supplier-reply`, { method: "POST", body: JSON.stringify({ reason: "Material unavailable", reference: "WhatsApp", expected_return_date: null }) });
    expect(ok.status).toBe(201);
  });

  it("owner consent and cancel reach their doors", async () => {
    const sb = client({}, () => ({ data: { id: RO_ID }, error: null }));
    const consent = await call(sb, `/${RO_ID}/owner-consent`, { method: "POST", body: JSON.stringify({ stock_item_ids: ["11111111-2222-4333-8444-000000000003"], outcome: "given", evidence: "WhatsApp OK" }) });
    expect(consent.status).toBe(201);
    const cancel = await call(sb, `/${RO_ID}/cancel`, { method: "POST", body: JSON.stringify({ reason: "Supplier cannot repair" }) });
    expect(cancel.status).toBe(200);
    expect(sb.calls.map((x) => x.name)).toEqual(["repair_order_record_owner_consent", "repair_order_cancel"]);
  });
});

describe("remove a Unit before Issue, and the category word", () => {
  it("a later Repair Quotation reaches its door, and the evidence read signs it", async () => {
    const sb = client({ repair_orders: [{ ...RO, quotation_path: "repair_quotation/x/q.pdf" }] }, () => ({ data: { id: RO_ID }, error: null }));
    const res = await call(sb, `/${RO_ID}/quotation`, { method: "POST", body: JSON.stringify({ path: "repair_quotation/x/q.pdf" }) });
    expect(res.status).toBe(200);
    expect(sb.calls[0]).toEqual({ name: "repair_order_record_quotation", args: { p_ro_id: RO_ID, p_path: "repair_quotation/x/q.pdf" } });
    const ev = (await (await call(sb, `/${RO_ID}/evidence`)).json()) as { quotation: { url: string } | null };
    expect(ev.quotation?.url).toBe("https://signed");
  });

  it("remove reaches its door", async () => {
    const sb = client({}, () => ({ data: { id: RO_ID }, error: null }));
    const res = await call(sb, `/${RO_ID}/units/11111111-2222-4333-8444-000000000003/remove`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    expect(sb.calls[0]).toEqual({ name: "repair_order_remove_unit", args: { p_ro_id: RO_ID, p_stock_item_id: "11111111-2222-4333-8444-000000000003" } });
  });
  it("Category prints the shared dictionary word, never the raw catalog value", async () => {
    const sb = client({ product_skus: [{ sku: "SKU-1", variant: "Queen", product_models: { name: "Sonic", category: "mattress" } }] });
    const row = ((await (await call(sb, "")).json()) as { repairOrders: RepairOrderListRow[] }).repairOrders[0]!;
    expect(row.units[0]!.category).toBe("Mattress");
  });
});

describe("the Repair Quotation upload slot", () => {
  it("accepts a PDF only for the repair_quotation purpose", async () => {
    const sb = client();
    const slot = (body: object) => fetchUpload(sb, body);
    const pdf = await slot({ mimeType: "application/pdf", scope: { kind: "repair_quotation", id: "11111111-2222-4333-8444-000000000009" } });
    expect(pdf.status).toBe(200);
    expect(((await pdf.json()) as { path: string }).path).toMatch(/^repair_quotation\/.+\.pdf$/);
    const elsewhere = await slot({ mimeType: "application/pdf", scope: { kind: "unit", id: "11111111-2222-4333-8444-000000000009" } });
    expect(elsewhere.status).toBe(422);
  });
});

async function fetchUpload(sb: ReturnType<typeof client>, body: object) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(adminClient).mockReturnValue(sb as any);
  const jwt = await signTestJwt("11111111-1111-1111-1111-000000000001", { email: "operation@x", app_metadata: { role: "operation" } });
  return app.fetch(new Request("http://t/api/ops/issues/evidence/upload-url", {
    method: "POST", body: JSON.stringify(body), headers: { Authorization: `Bearer ${jwt}`, "content-type": "application/json" },
  }), env);
}

describe("GET /api/operation/repair-orders/eligible-units", () => {
  it("needs the Site and prints each Unit's refusal words from the database", async () => {
    const sb = client({}, () => ({ data: [
      { id: "si9", unit_code: "U1-000-009", sku: "SKU-1", po_no: null, warehouse_id: "w1", condition: "new", ownership: "carres_owned", refusal: "Reserved for SO2609-4827" },
    ], error: null }));
    expect((await call(sb, "/eligible-units")).status).toBe(422);
    const res = await call(sb, "/eligible-units?site=11111111-2222-4333-8444-000000000002");
    const { units } = (await res.json()) as { units: { unit_id: string; refusal: string; item: string }[] };
    expect(units[0]).toMatchObject({ unit_id: "U1-000-009", refusal: "Reserved for SO2609-4827", item: "Sofa Lyra · 3 seater · Grey" });
  });
});
