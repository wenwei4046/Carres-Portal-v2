import { describe, it, expect, vi } from "vitest";
import type { operationPoListRow } from "@/lib/queries";

vi.mock("@/lib/deadline-queries", async () => (await import("@/test/deadline-queries-mock")).deadlineQueriesMock());
const { receivingAfterPost, sameSupplierPick } = await import("./OperationReceiving");

/** Several POs of one supplier in one delivery — Weisiang's decision (Mr Lim, WhatsApp 2026-10-22). */
describe("receiving several POs of one supplier", () => {
  it("after each post opens the next queued PO, then the last receipt", () => {
    let p = receivingAfterPost(new URLSearchParams("tab=receiving&po=A&queue=B,C"), "r1");
    expect([p.get("po"), p.get("queue"), p.get("session")]).toEqual(["B", "C", null]);
    p = receivingAfterPost(p, "r2");
    expect([p.get("po"), p.get("queue")]).toEqual(["C", null]);
    p = receivingAfterPost(p, "r3");
    expect([p.get("po"), p.get("session"), p.get("tab")]).toEqual([null, "r3", "receiving"]);
  });

  it("only lets a PO of the same supplier join the ticked set", () => {
    const po = (id: string, supplier_id: string) => ({ id, supplier_id }) as operationPoListRow;
    expect(sameSupplierPick([], po("A", "s1"))).toBe(true);
    expect(sameSupplierPick([po("A", "s1")], po("B", "s1"))).toBe(true);
    expect(sameSupplierPick([po("A", "s1")], po("C", "s2"))).toBe(false);
  });
});
