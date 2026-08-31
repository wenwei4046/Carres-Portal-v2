import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(import.meta.dirname ?? __dirname, "../../../supabase/migrations/0407_one_receiving_session_posts_one_formal_grn.sql"),
  "utf8",
);

describe("0407 Receiving database authority", () => {
  it("makes Warehouse save and submit one atomic database call", () => {
    expect(sql).toMatch(/create or replace function public\.save_and_submit_receiving_session\s*\(/i);
    expect(sql).toMatch(/save_and_submit_receiving_session[\s\S]*save_receiving_session[\s\S]*submit_receiving_session/i);
  });

  it("revokes every retired physical-receipt writer from browser roles", () => {
    for (const signature of [
      "operation_receive_po_with_do(text,text,text,jsonb)",
      "office_receive_post(text,text,text,text,jsonb,date)",
      "warehouse_submit_receipt(text,text,text,text,jsonb,date)",
      "warehouse_resubmit_receipt(uuid,text,text,text,jsonb,date)",
      "warehouse_receipt_check_in(uuid)",
      "warehouse_receipt_return(uuid,text)",
    ]) {
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated;`);
      expect(sql).toContain(`has_function_privilege('authenticated', 'public.${signature}', 'execute')`);
    }
  });

  it("stores the complete official GRN snapshot at posting", () => {
    expect(sql).toMatch(/add column if not exists grn_snapshot jsonb/i);
    expect(sql).toMatch(/set status = 'posted'[\s\S]*grn_snapshot = jsonb_build_object/i);
    for (const fact of [
      "sourceSnapshot", "supplierSnapshot", "destinationSnapshot", "goodsReceivedAt",
      "supplierDoNo", "signedDoPath", "lines", "actualActor", "normalGrnDuty",
      "datedCover", "postAuthority", "postedAt",
    ]) expect(sql).toContain(`'${fact}'`);
  });

  it("keeps PO-issued Unit identity for the authoritative line destination", () => {
    expect(sql).toMatch(/add column if not exists po_line_id uuid/i);
    expect(sql).toMatch(/add column if not exists purchasing_destination_id uuid/i);
    expect(sql).toMatch(/coalesce\(v_pol\.destination_id, v_po\.destination_id\)/i);
    expect(sql).toContain("case when v_posts_stock then 'free' else 'transferred' end");
    expect(sql).toMatch(/app_warehouse_id\(\)[\s\S]*purchasing_destination_id/i);
  });

  it("pages Warehouse history and supports exact PO, session or GRN lookup", () => {
    expect(sql).toMatch(/create or replace function public\.warehouse_my_receipts\s*\(\s*p_limit integer/i);
    expect(sql).toMatch(/p_before timestamptz[\s\S]*p_before_id uuid[\s\S]*p_exact text/i);
    expect(sql).toMatch(/wr\.source_id[\s\S]*wr\.id::text[\s\S]*wr\.grn_number/i);
    expect(sql).toContain("'next'");
  });
});
