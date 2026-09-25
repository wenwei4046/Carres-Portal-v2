/**
 * Purchasing's completion facts (0584 · owner direction 2026-09-24):
 * a PO window closes when its demand is bought and every PO it issued is
 * marked sent; the PO's supplier-reply Work closes on an evidenced answer
 * for its current version.
 */
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { OperationWorkItem } from "@carres/shared";
import type { AppEnv } from "../types";
import { withWorkCompletion, type CompletedWrite, type WorkCompletionDeps, type WorkCompletionSpec } from "./work-completion";
import {
  arrivalConfirmationResult,
  poWindowResult,
  supplierReplyResult,
  type ArrivalConfirmationFacts,
  type PoWindowSendFacts,
  type SupplierReplyFacts,
} from "./purchasing-work-completion";

const ME = "00000000-0000-4000-8000-0000000000aa";
const W1 = "2026-09-25T11:30";
const W2 = "2026-09-25T16:00";

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
  it("a PO window holds only when its demand is bought and every PO it issued is sent", () => {
    expect(poWindowResult("purchasing.po_window", { poIds: ["PO250925-2", "PO250925-1"], demandLeft: 0, allSent: true })).toBe("po_sends=PO250925-1,PO250925-2");
    expect(poWindowResult("purchasing.po_window", { poIds: ["PO250925-1"], demandLeft: 0, allSent: false })).toBeNull();
    expect(poWindowResult("purchasing.po_window", { poIds: ["PO250925-1"], demandLeft: 2, allSent: true })).toBeNull();
    expect(poWindowResult("purchasing.po_window", { poIds: [], demandLeft: 0, allSent: false })).toBeNull();
    expect(poWindowResult("issue_po", { poIds: ["PO250925-1"], demandLeft: 0, allSent: true })).toBeNull();
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

describe("PO sent to supplier completes the window only when its last PO is sent", () => {
  it("W1's last PO was sent; W2 still has demand — only W1 is completed", async () => {
    let call = 0;
    const spec: WorkCompletionSpec<PoWindowSendFacts> = {
      owner: "Purchasing",
      rules: ["purchasing.po_window"],
      probe: async (_c, id) => {
        call += 1;
        const before = call <= 2;
        const label = id === W1 ? "11:30 AM PO window" : "4:00 PM PO window";
        return before || id === W2 ? [item(id, "purchasing.po_window", label, "2026-09-25")] : [];
      },
      readFacts: async (_c, id) => (id === W1
        ? { poIds: ["PO250925-4827", "PO250925-4828"], demandLeft: 0, allSent: true }
        : { poIds: ["PO250925-4828"], demandLeft: 3, allSent: true }),
      result: poWindowResult,
    };
    const { recorded } = await run(spec, [W1, W2]);
    expect(recorded).toEqual([expect.objectContaining({
      occurrenceId: `purchasing:${W1}:purchasing.po_window`,
      objectLabel: "11:30 AM PO window",
      actionOn: "2026-09-25",
      resultReference: "po_sends=PO250925-4827,PO250925-4828",
      actorId: ME,
    })]);
  });

  it("a window that left Work without every PO sent is not completed", async () => {
    let call = 0;
    const spec: WorkCompletionSpec<PoWindowSendFacts> = {
      owner: "Purchasing", rules: ["purchasing.po_window"],
      probe: async (_c, id) => (++call === 1 ? [item(id, "purchasing.po_window", "11:30 AM PO window", "2026-09-25")] : []),
      readFacts: async () => ({ poIds: ["PO250925-4827"], demandLeft: 0, allSent: false }),
      result: poWindowResult,
    };
    const { recorded, logs } = await run(spec, [W1]);
    expect(recorded).toEqual([]);
    expect(logs).toContain("work left without its completion fact: not recorded as completed");
  });

  it("a refused send completes nothing", async () => {
    const spec: WorkCompletionSpec<PoWindowSendFacts> = {
      owner: "Purchasing", rules: ["purchasing.po_window"],
      probe: async (_c, id) => [item(id, "purchasing.po_window", "11:30 AM PO window", null)],
      readFacts: async () => ({ poIds: ["PO-1"], demandLeft: 0, allSent: true }),
      result: poWindowResult,
    };
    expect((await run(spec, [W1], 409)).recorded).toEqual([]);
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
