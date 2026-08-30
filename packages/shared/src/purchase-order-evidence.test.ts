import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSupplierAnswerEvidence } from "./purchase-order-evidence";

const MIGRATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
);

function migration(prefix: string): string {
  const file = readdirSync(MIGRATIONS).find((name) => name.startsWith(prefix));
  expect(file, `no migration starting ${prefix}`).toBeTruthy();
  return readFileSync(join(MIGRATIONS, file!), "utf8");
}

describe("supplier answer evidence", () => {
  const base = {
    answer: "same_as_po" as const,
    poDeliveryDate: "2026-09-10",
    supplierDeliveryDate: "2026-09-10",
    channel: "whatsapp" as const,
    evidencePath: "PO-2032/supplier-answer.png",
    supplierAnsweredAt: "2026-08-30T09:20:00+08:00",
    reportedByUserId: "00000000-0000-0000-0000-000000000101",
  };

  it("accepts a screenshot for a WhatsApp answer", () => {
    expect(validateSupplierAnswerEvidence(base)).toMatchObject({
      answer: "same_as_po",
      supplierDeliveryDate: "2026-09-10",
      channel: "whatsapp",
      evidence: { kind: "file", path: "PO-2032/supplier-answer.png" },
    });
  });

  it("refuses a WhatsApp answer with no evidence", () => {
    expect(() => validateSupplierAnswerEvidence({ ...base, evidencePath: undefined }))
      .toThrow("evidence_required");
  });

  it("accepts a structured phone note but refuses a blank one", () => {
    expect(validateSupplierAnswerEvidence({
      ...base,
      channel: "phone",
      evidencePath: undefined,
      evidenceNote: "Spoke to supplier purchasing. They confirmed 10 Sep.",
    }).evidence).toEqual({
      kind: "note",
      note: "Spoke to supplier purchasing. They confirmed 10 Sep.",
    });
    expect(() => validateSupplierAnswerEvidence({
      ...base,
      channel: "phone",
      evidencePath: undefined,
      evidenceNote: "   ",
    })).toThrow("evidence_required");
  });

  it("keeps Same as PO true and requires a reason for a changed supplier date", () => {
    expect(() => validateSupplierAnswerEvidence({
      ...base,
      supplierDeliveryDate: "2026-09-11",
    })).toThrow("same_as_po_mismatch");
    expect(() => validateSupplierAnswerEvidence({
      ...base,
      answer: "changed_date",
      supplierDeliveryDate: "2026-09-12",
    })).toThrow("reason_required");
  });
});

describe("0401 keeps the official PO date separate", () => {
  const sql = migration("0401_");

  it("adds a separate official date without backfilling legacy rows", () => {
    expect(sql).toContain("add column if not exists po_delivery_date date");
    expect(sql).toContain("Legacy rows stay NULL");
    expect(sql).not.toMatch(/update\s+public\.purchase_orders\s+set\s+po_delivery_date\s*=\s*eta_date/i);
  });

  it("stores channel, evidence, reporter, recorder and both times", () => {
    for (const fact of [
      "channel",
      "evidence",
      "supplier_answered_at",
      "reported_by",
      "recorded_by",
      "recorded_at",
    ]) expect(sql).toContain(fact);
  });

  it("records supplier answers without overwriting either official PO date field", () => {
    const body = sql.match(/create or replace function public\.purchasing_record_supplier_answer[\s\S]*?\$supplier_answer\$;/i)?.[0] ?? "";
    expect(body).toContain("insert into public.po_supplier_promises");
    expect(body).not.toMatch(/update\s+public\.purchase_orders/i);
  });

  it("prints the official PO Delivery Date and never the mutable legacy date", () => {
    const body = sql.match(/create or replace function public\.purchasing_po_document[\s\S]*?\$po_document\$;/i)?.[0] ?? "";
    expect(body).toContain("'eta_date',    v_po.po_delivery_date");
    expect(body).not.toContain("'eta_date',    v_po.eta_date");
  });

  it("opening WhatsApp or email records an open, not a revision", () => {
    const body = sql.match(
      /create or replace function public\.purchasing_record_send[\s\S]*?\$external_open\$;/,
    )?.[0] ?? "";
    expect(body).toContain("'external_open'");
    expect(body).not.toContain("insert into po_revisions");
  });

  it("revises the official date through the one governed version writer", () => {
    expect(sql).toContain("drop function if exists public.purchasing_revise_po(text, text, jsonb)");
    expect(sql).toMatch(/create or replace function public\.purchasing_revise_po\(\s*p_po_id\s+text,\s*p_reason\s+text,\s*p_po_delivery_date\s+date,\s*p_lines\s+jsonb/i);
    expect(sql).toContain("'po_delivery_date', v_po.po_delivery_date");
    expect(sql).toContain("po_delivery_date = coalesce(p_po_delivery_date, po_delivery_date)");
    expect(sql).toContain("public.purchasing_actor_may_issue(v_uid)");
  });

  it("keeps each governed insert column and revision declaration singular", () => {
    expect(sql.match(/duty_user_id, acting_user_id/g)).toHaveLength(2);
    expect(sql.match(/po_id, kind, answer, about_date, previous_date, new_date, reason/g)).toHaveLength(1);
    expect(sql.match(/v_line purchase_order_lines;/g)).toHaveLength(1);
  });
});
