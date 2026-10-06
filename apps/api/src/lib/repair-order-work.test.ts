/**
 * Repair Order Work (Purchasing §9.7 · §10 · Workspace §6): the projection on
 * the feed's transport contract, the RO facts that complete each rule, and the
 * doors that carry the Completed writer — for exactly their own rules.
 */
import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { REPAIR_ORDER_WORK_RULE, type RepairOrderDetail, type RepairOrderUnitRow, type OperationWorkItem } from "@carres/shared";
import type { AppEnv } from "../types";
import { withWorkCompletion, type CompletedWrite, type WorkCompletionDeps, type WorkCompletionSpec } from "./work-completion";
import { projectRepairOrderWork, repairOrderWorkResult } from "./repair-order-work";

const ME = "00000000-0000-4000-8000-0000000000aa";

const unit = (over: Partial<RepairOrderUnitRow> = {}): RepairOrderUnitRow => ({
  stock_item_id: "si-1", unit_id: "U1-000-001", po_no: null, sku: null, category: null, item: null, item_spec: null,
  ownership: "carres_owned", display: false, problem: "damaged", problem_note: "Torn", repair_requirement: "Fix",
  evidence: [], collected_by: null, actual_pickup_date: null, goods_received_date: null, grn_no: null,
  return_proof: null, pickup_proof: null, inspected: false, ...over,
});
const ro = (over: Partial<RepairOrderDetail> = {}): RepairOrderDetail => ({
  id: "ro-1", ro_no: "RO260928-4827", ro_doc_date: "2026-09-28", version: 1, supplier_id: "s", supplier_name: "Hooka",
  claim_id: null, claim_no: null, cost_responsibility: "not_decided", price: null, pickup_site_id: "w", pickup_site_name: null,
  return_site_id: "w", return_site_name: null, issued: false, supplier_received_at: null, return_target_date: null,
  cancelled_at: null, latest_reply: null, units: [unit()], quotation_path: null, supplier_received_source: null,
  supplier_received_evidence: null, return_target_working_days: null, return_target_calendar: null, cancel_reason: null,
  created_by: null, created_at: "2026-09-28T02:00:00Z", sends: [], replies: [], consents: [], pickup_source_id: null, ...over,
});

describe("the Work feed's RO occurrences", () => {
  it("one stable identity per RO and rule, opening the RO object page", () => {
    const [item] = projectRepairOrderWork({ repairOrders: [ro()], poDuty: null, today: "2026-09-28" });
    expect(item!.id).toBe("purchasing:ro-1:repair_order.issue");
    expect(item!.object).toEqual({ kind: "repair_order", id: "ro-1", label: "RO260928-4827" });
    expect(item!.action).toBe("Issue repair order to Hooka");
    expect(item!.recipient).toBe("Hooka");
    expect(item!.destination).toBe("/operation?tab=repair-orders&ro=ro-1");
    expect(item!.timing.actionOn).toBe("2026-09-29");
    expect(item!.completionStatement).toBe("The current repair order version is marked as sent");
  });
});

describe("the RO facts that complete Work", () => {
  it("issue closes on a confirmed send; receipt on the evidenced Supplier receipt", () => {
    expect(repairOrderWorkResult(REPAIR_ORDER_WORK_RULE.issue, ro())).toBeNull();
    expect(repairOrderWorkResult(REPAIR_ORDER_WORK_RULE.issue, ro({ issued: true }))).toBe("document_sends=repair_order:ro-1@v1");
    expect(repairOrderWorkResult(REPAIR_ORDER_WORK_RULE.confirmReceipt, ro({ issued: true }))).toBeNull();
    expect(repairOrderWorkResult(REPAIR_ORDER_WORK_RULE.confirmReceipt, ro({ supplier_received_at: "2026-09-29T03:00:00Z" })))
      .toBe("repair_orders.supplier_received_at=2026-09-29T03:00:00Z");
  });

  it("the passed return date closes ONLY on every Unit received back or the RO cancelled — never on a Supplier reply", () => {
    const replied = ro({
      units: [unit(), unit({ stock_item_id: "si-2", unit_id: "U1-000-002", goods_received_date: "2026-10-22T02:00:00Z", grn_no: "GRN-2" })],
      latest_reply: { id: "r", expected_return_date: "2026-11-30", reason: "Fabric shortage", note: null, reference: "WA", recorded_by: null, recorded_at: "2026-10-21T02:00:00Z" },
    });
    expect(repairOrderWorkResult(REPAIR_ORDER_WORK_RULE.returnDatePassed, replied)).toBeNull();
    const back = { ...replied, units: replied.units.map((u) => ({ ...u, goods_received_date: "2026-10-23T02:00:00Z", grn_no: u.grn_no ?? "GRN-1" })) };
    expect(repairOrderWorkResult(REPAIR_ORDER_WORK_RULE.returnDatePassed, back)).toBe("grn=GRN-1,GRN-2");
    expect(repairOrderWorkResult(REPAIR_ORDER_WORK_RULE.returnDatePassed, ro({ cancelled_at: "2026-10-22T02:00:00Z" })))
      .toBe("repair_orders.cancelled_at=2026-10-22T02:00:00Z");
  });

  it("owner consent closes on a given consent for every such Unit; a refusal does not", () => {
    const consign = ro({ units: [unit({ ownership: "supplier_consignment" })] });
    const refused = { ...consign, consents: [{ id: "c1", stock_item_ids: ["si-1"], outcome: "refused" as const, evidence: "WA", note: null, recorded_by: null, recorded_at: "2026-09-28T03:00:00Z" }] };
    expect(repairOrderWorkResult(REPAIR_ORDER_WORK_RULE.ownerConsent, refused)).toBeNull();
    const given = { ...consign, consents: [{ ...refused.consents[0]!, id: "c2", outcome: "given" as const }] };
    expect(repairOrderWorkResult(REPAIR_ORDER_WORK_RULE.ownerConsent, given)).toBe("repair_order_owner_consents=c2");
  });
});

describe("the Completed writer over an RO door", () => {
  it("Record Supplier receipt completes the receipt occurrence, by the person who wrote it", async () => {
    let call = 0;
    const open = { id: "purchasing:ro-1:repair_order.confirm_receipt", ruleKey: REPAIR_ORDER_WORK_RULE.confirmReceipt, object: { id: "ro-1", label: "RO260928-4827" }, timing: { actionOn: "2026-09-30" }, sourceVersion: "v1" } as unknown as OperationWorkItem;
    const spec: WorkCompletionSpec<RepairOrderDetail | null> = {
      owner: "Purchasing",
      rules: [REPAIR_ORDER_WORK_RULE.confirmReceipt],
      probe: async () => (call++ === 0 ? [open] : []),
      readFacts: async () => ro({ issued: true, supplier_received_at: "2026-09-30T02:00:00Z" }),
      result: repairOrderWorkResult,
    };
    const recorded: CompletedWrite[] = [];
    const deps: WorkCompletionDeps = { recordCompleted: async (_c, w) => { recorded.push(w); }, now: () => "2026-09-30T03:00:00.000Z", log: () => {} };
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => { c.set("auth", { id: ME } as never); await next(); });
    app.post("/w", (c) => withWorkCompletion(c, [{ spec, objectIds: ["ro-1"] }], async () => c.json({}), deps));
    await app.request("/w", { method: "POST" });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ occurrenceId: open.id, actorId: ME, objectLabel: "RO260928-4827", resultReference: "repair_orders.supplier_received_at=2026-09-30T02:00:00Z" });
  });
});

vi.mock("./repair-order-work", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./repair-order-work")>();
  return {
    ...actual,
    repairOrderWorkCompletion: (rules: string[]) => async (c: { json: (b: unknown) => Response }) => c.json({ wired: rules }),
    repairOrderReturnWorkCompletion: () => async (c: { json: (b: unknown) => Response }) => c.json({ wired: [REPAIR_ORDER_WORK_RULE.returnDatePassed] }),
  };
});

describe("the RO doors that complete Work — exactly their own rules", () => {
  async function mount() {
    const { default: router } = await import("../routes/operation/repair-orders");
    const { default: receipts } = await import("../routes/operation/warehouse-receipts");
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => { c.set("auth", { id: "u", role: "operation", jwt: "j" } as never); await next(); });
    app.route("/ro", router);
    app.route("/wr", receipts);
    return app;
  }
  const post = async (app: Hono<AppEnv>, path: string) =>
    (await app.request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json();

  it("issue · receipt · consent · cancel · the return receipt", async () => {
    const app = await mount();
    expect(await post(app, "/ro/ro-1/issue")).toEqual({ wired: [REPAIR_ORDER_WORK_RULE.issue] });
    expect(await post(app, "/ro/ro-1/supplier-receipt")).toEqual({ wired: [REPAIR_ORDER_WORK_RULE.confirmReceipt] });
    expect(await post(app, "/ro/ro-1/owner-consent")).toEqual({ wired: [REPAIR_ORDER_WORK_RULE.ownerConsent] });
    expect(await post(app, "/ro/ro-1/cancel")).toEqual({ wired: [REPAIR_ORDER_WORK_RULE.returnDatePassed] });
    expect(await post(app, "/wr/arrival/11111111-2222-4333-8444-555555555555")).toEqual({ wired: [REPAIR_ORDER_WORK_RULE.returnDatePassed] });
  });

  it("a Supplier reply completes nothing — it never closes the return follow-up", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../routes/operation/repair-orders.ts", import.meta.url), "utf8");
    const line = src.split("\n").find((l) => l.includes('router.post("/:id/supplier-reply"'))!;
    expect(line).not.toContain("WorkCompletion");
  });
});
