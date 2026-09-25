/**
 * Purchasing's completion facts (0581 · owner direction 2026-09-24):
 * `issue_po` closes when a purchase order now serves the order; the PO's
 * supplier-reply Work closes on an evidenced answer for its current version.
 */
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { OperationWorkItem } from "@carres/shared";
import type { AppEnv } from "../types";
import { withWorkCompletion, type CompletedWrite, type WorkCompletionDeps, type WorkCompletionSpec } from "./work-completion";
import {
  arrivalConfirmationResult,
  issuePoResult,
  orderIdsOfSoBatchSelections,
  supplierReplyResult,
  type ArrivalConfirmationFacts,
  type IssuePoFacts,
  type SupplierReplyFacts,
} from "./purchasing-work-completion";

const ME = "00000000-0000-4000-8000-0000000000aa";
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";

function item(objectId: string, ruleKey: string, label: string, actionOn: string | null): OperationWorkItem {
  return {
    id: ruleKey.startsWith("purchasing.") ? `purchasing:${objectId}:${ruleKey}` : `orders:${objectId}:${ruleKey}`,
    ruleKey,
    object: { kind: "x", id: objectId, label },
    timing: { actionOn },
    sourceVersion: "v1",
  } as unknown as OperationWorkItem;
}

describe("Purchasing completion facts", () => {
  it("issue_po holds only when a purchase order serves the order", () => {
    expect(issuePoResult("issue_po", { purchaseOrderIds: ["PO2609-2", "PO2609-1"] })).toBe("purchase_orders=PO2609-1,PO2609-2");
    expect(issuePoResult("issue_po", { purchaseOrderIds: [] })).toBeNull();
    expect(issuePoResult("delay_planning", { purchaseOrderIds: ["PO2609-1"] })).toBeNull();
  });

  it("a passed supplier date closes only on a governed answer to the current version — with its screenshot", () => {
    expect(supplierReplyResult("purchasing.supplier_date_passed", { answerId: "ans-1", poVersion: 2, screenshotCount: 1 })).toBe("po_supplier_promises=ans-1@v2");
    expect(supplierReplyResult("purchasing.supplier_date_passed", { answerId: "ans-1", poVersion: 2, screenshotCount: 0 })).toBeNull();
    expect(supplierReplyResult("purchasing.supplier_date_passed", { answerId: null, poVersion: 2, screenshotCount: 0 })).toBeNull();
    // Waiting for an immediate answer after sending is RETIRED — it completes nothing.
    expect(supplierReplyResult("purchasing.supplier_reply", { answerId: "ans-1", poVersion: 2, screenshotCount: 1 })).toBeNull();
    expect(supplierReplyResult("issue_po", { answerId: "ans-1", poVersion: 2, screenshotCount: 1 })).toBeNull();
  });

  it("the day-before check closes on the Supplier DO or an evidenced confirmation, and names which", () => {
    const facts: ArrivalConfirmationFacts = { confirmation: { id: "cf-1", kind: "supplier_do", forDate: "2026-10-20" }, poVersion: 2 };
    expect(arrivalConfirmationResult("purchasing.confirm_tomorrows_delivery", facts)).toBe("po_arrival_confirmations=cf-1:supplier_do@2026-10-20·v2");
    expect(arrivalConfirmationResult("purchasing.confirm_tomorrows_delivery", { confirmation: null, poVersion: 2 })).toBeNull();
    expect(arrivalConfirmationResult("purchasing.supplier_date_passed", facts)).toBeNull();
  });

  it("SO Batch names the orders it buys for; anything else names none", () => {
    expect(orderIdsOfSoBatchSelections({
      selections: [
        { demandId: `build::${A}::sofa-1` },
        { demandId: `build::${A}::sofa-2` },
        { demandId: `build::${B}::bed` },
        { demandId: "ready::whatever" },
      ],
    })).toEqual([A, B]);
    expect(orderIdsOfSoBatchSelections(null)).toEqual([]);
    expect(orderIdsOfSoBatchSelections({ selections: "x" })).toEqual([]);
  });
});

async function run<F>(spec: WorkCompletionSpec<F>, objectIds: string[], status = 200) {
  const recorded: CompletedWrite[] = [];
  const logs: string[] = [];
  const deps: WorkCompletionDeps = {
    recordCompleted: async (_c, write) => { recorded.push(write); },
    now: () => "2026-09-24T03:00:00.000Z",
    log: (m) => logs.push(m),
  };
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => { c.set("auth", { id: ME } as never); await next(); });
  app.post("/w", (c) => withWorkCompletion(c, [{ spec, objectIds }], async () => c.json({}, status as 200), deps));
  await app.request("/w", { method: "POST" });
  return { recorded, logs };
}

describe("a batch issue completes issue_po only for the orders a PO now serves", () => {
  it("A got its PO; B left Work because its goods became ready from stock — only A is completed", async () => {
    let call = 0;
    const spec: WorkCompletionSpec<IssuePoFacts> = {
      owner: "Purchasing",
      rules: ["issue_po"],
      probe: async (_c, id) => {
        call += 1;
        const before = call <= 2;
        return before ? [item(id, "issue_po", id === A ? "SO-1301" : "SO-1302", "2026-09-22")] : [];
      },
      readFacts: async (_c, id) => ({ purchaseOrderIds: id === A ? ["PO2609-4827"] : [] }),
      result: issuePoResult,
    };
    const { recorded, logs } = await run(spec, [A, B]);
    expect(recorded).toEqual([expect.objectContaining({
      occurrenceId: `orders:${A}:issue_po`,
      objectLabel: "SO-1301",
      actionOn: "2026-09-22",
      resultReference: "purchase_orders=PO2609-4827",
      actorId: ME,
    })]);
    expect(logs).toContain("work left without its completion fact: not recorded as completed");
  });

  it("a refused batch completes nothing", async () => {
    const spec: WorkCompletionSpec<IssuePoFacts> = {
      owner: "Purchasing", rules: ["issue_po"],
      probe: async (_c, id) => [item(id, "issue_po", "SO-1301", null)],
      readFacts: async () => ({ purchaseOrderIds: ["PO-1"] }),
      result: issuePoResult,
    };
    expect((await run(spec, [A], 409)).recorded).toEqual([]);
  });
});

describe("the supplier's answer completes the PO's reply Work, on its current generation", () => {
  it("records the answer against the occurrence the probe named", async () => {
    let call = 0;
    const spec: WorkCompletionSpec<SupplierReplyFacts> = {
      owner: "Purchasing",
      rules: ["purchasing.supplier_date_passed"],
      probe: async (_c, id) => {
        call += 1;
        return call === 1
          ? [{ ...item(id, "purchasing.supplier_date_passed", id, "2026-09-23"), id: `purchasing:${id}:purchasing.supplier_date_passed:g2` }]
          : [];
      },
      readFacts: async () => ({ answerId: "ans-9", poVersion: 3, screenshotCount: 2 }),
      result: supplierReplyResult,
    };
    const { recorded } = await run(spec, ["PO2609-4827"]);
    expect(recorded).toEqual([expect.objectContaining({
      occurrenceId: "purchasing:PO2609-4827:purchasing.supplier_date_passed:g2",
      idempotencyKey: "completed:purchasing:PO2609-4827:purchasing.supplier_date_passed:g2",
      objectLabel: "PO2609-4827",
      resultReference: "po_supplier_promises=ans-9@v3",
    })]);
  });
});
