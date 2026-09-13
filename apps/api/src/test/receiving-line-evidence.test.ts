import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LINE,
  LINE_QTY,
  OP,
  OP2,
  PO,
  actingAs,
  receivingEvidenceDatabase,
} from "./receiving-line-evidence-database";

/**
 * RECEIVING · EXCEPTION EVIDENCE — the 0493 rules, run as SQL.
 *
 * The shapes below are production's own: PO-2054 is the instruction's worked
 * example (one JAGER-SS line, 3 ordered), its first receipt records
 * Received 1 · Damaged 1 with one damaged photo, and the SMOKE receipts carry
 * extra_lines from before 0493 with no identity.
 */

let db: PGlite;

async function rows<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  const res = await db.query<T>(sql, params);
  return res.rows;
}

/** The refusal DETAIL code, or null when the door did not refuse. */
async function refusal(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    const err = e as { detail?: string; message?: string };
    return err.detail ?? err.message ?? "refused";
  }
}

const P = (name: string) => `${PO}/${name}`;

async function validateLines(lines: unknown) {
  return rows<{ v: { lines: Array<Record<string, unknown>>; counted: number } }>(
    `select public.warehouse_receipt_validate_lines($1, $2::jsonb, $3) as v`,
    [PO, JSON.stringify(lines), OP],
  ).then((r) => r[0]!.v);
}

async function validateExtras(extras: unknown) {
  return rows<{ v: { extra_lines: Array<Record<string, unknown>> } }>(
    `select public.receiving_validate_session_extras('[]'::jsonb, $1::jsonb) as v`,
    [JSON.stringify(extras)],
  ).then((r) => r[0]!.v);
}

async function postReceipt(opts: {
  id?: string;
  lines: unknown;
  extras?: unknown;
  status?: string;
}): Promise<string> {
  const id = opts.id ?? crypto.randomUUID();
  await db.query(
    `insert into warehouse_receipts (id, po_id, do_number, status, lines, extra_lines, grn_no, posted_by, submitted_by, updated_at)
     values ($1, $2, 'DO-1', $3, $4::jsonb, $5::jsonb, 'GRN-20260913-0001', $6, $6, '2026-09-13T00:00:00Z')`,
    [id, PO, opts.status ?? "posted", JSON.stringify(opts.lines), JSON.stringify(opts.extras ?? []), OP],
  );
  return id;
}

async function evidenceOf(receiptId: string) {
  return rows<{ exception_type: string; line_key: string; media_kind: string; path: string; source: string; added_by: string | null }>(
    `select exception_type, line_key, media_kind, path, source, added_by
       from receiving_line_evidence where receipt_id = $1
      order by exception_type, line_key, media_kind, path`,
    [receiptId],
  );
}

beforeEach(async () => {
  db = await receivingEvidenceDatabase();
  await actingAs(db, OP);
});
afterEach(async () => {
  await db.close();
});

describe("§2 · the media path law", () => {
  it("knows a photo from a video by extension, and nothing else", async () => {
    const r = await rows<{ k: string | null }>(
      `select public.receiving_media_kind_of_path(p) as k from unnest(array['a/b.jpg','a/b.JPEG','a/b.png','a/b.webp','a/b.mp4','a/b.MOV','a/b.webm','a/b.pdf','a/b']) p`,
    );
    expect(r.map((x) => x.k)).toEqual(["photo", "photo", "photo", "photo", "video", "video", "video", null, null]);
  });

  it("refuses a path outside the PO's own prefix, a wrong kind, a traversal and a file that is not there", async () => {
    const line = (photos: string[]) => [
      { id: LINE, received_now: 0, damaged_qty: 1, damaged_photos: photos },
    ];
    expect(await refusal(() => validateLines(line(["PO-9999/zzzz-claim-DO-9.jpg"])))).toBe("evidence_path_foreign");
    expect(await refusal(() => validateLines(line([P("bbbb-claim-DO-1.mp4")])))).toBe("evidence_kind_mismatch");
    expect(await refusal(() => validateLines(line([`${PO}/../secret.jpg`])))).toBe("evidence_path_invalid");
    expect(await refusal(() => validateLines(line([P("not-uploaded.jpg")])))).toBe("evidence_object_missing");
    expect(await refusal(() => validateLines(line([P("aaaa-claim-DO-1.jpg")])))).toBeNull();
  });
});

describe("§4 · the line validator", () => {
  it("accepts damaged and wrong-item VIDEOS beside the required photo, de-duplicated", async () => {
    const v = await validateLines([
      {
        id: LINE,
        received_now: 1,
        damaged_qty: 1,
        damaged_photos: [P("aaaa-claim-DO-1.jpg"), P("aaaa-claim-DO-1.jpg")],
        damaged_videos: [P("bbbb-claim-DO-1.mp4")],
      },
      {
        id: LINE_QTY,
        received_now: 1,
        wrong_item_qty: 1,
        wrong_item_claim_type: "wrong_spec",
        wrong_item_photos: [P("cccc-claim-DO-1.png")],
        wrong_item_videos: [P("dddd-claim-DO-1.mov"), P("ffff-claim-DO-1.webm")],
      },
    ]);
    expect(v.counted).toBe(4);
    expect(v.lines[0]!.damaged_photos).toEqual([P("aaaa-claim-DO-1.jpg")]);
    expect(v.lines[0]!.damaged_videos).toEqual([P("bbbb-claim-DO-1.mp4")]);
    expect(v.lines[1]!.wrong_item_videos).toEqual([P("dddd-claim-DO-1.mov"), P("ffff-claim-DO-1.webm")]);
  });

  it("still demands at least one PHOTO for damaged and wrong goods — a video alone is not the claim's evidence", async () => {
    expect(
      await refusal(() =>
        validateLines([{ id: LINE, received_now: 0, damaged_qty: 1, damaged_videos: [P("bbbb-claim-DO-1.mp4")] }]),
      ),
    ).toBe("damaged_photo_required");
  });

  it("a zero exception carries no evidence — paths sent against it are dropped, never validated into a record", async () => {
    const v = await validateLines([
      { id: LINE, received_now: 2, damaged_qty: 0, damaged_photos: ["PO-9999/zzzz-claim-DO-9.jpg"] },
    ]);
    expect(v.lines[0]!.damaged_photos).toEqual([]);
    expect(v.lines[0]!.damaged_videos).toEqual([]);
  });

  it("snapshots the goods' full name at posting — `Model · Variant`, and null when the catalog has no name", async () => {
    const v = await validateLines([
      { id: LINE, received_now: 1 },
      { id: LINE_QTY, received_now: 1 },
    ]);
    expect(v.lines[0]!.item_label).toBe("Jager · Super Single");
    expect(v.lines[1]!.item_label).toBeNull();
  });
});

describe("§3 · extra goods get an identity", () => {
  it("stamps a uuid on every extra line, keeps one the caller round-trips, and refuses a non-positive quantity", async () => {
    const keep = "11111111-1111-1111-1111-111111111111";
    const v = await validateExtras([
      { sku: "PILLOW-X", qty: 2 },
      { id: keep, sku: "PILLOW-Y", qty: 1, photos: [P("eeee-claim-DO-1.jpg")], videos: [P("ffff-claim-DO-1.webm")] },
      { id: "not-a-uuid", sku: "PILLOW-Z", qty: 1 },
    ]);
    const ids = v.extra_lines.map((x) => x.id as string);
    expect(ids[1]).toBe(keep);
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[2]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[2]).not.toBe("not-a-uuid");
    expect(v.extra_lines[1]!.photos).toEqual([P("eeee-claim-DO-1.jpg")]);
    expect(v.extra_lines[1]!.videos).toEqual([P("ffff-claim-DO-1.webm")]);
    expect(v.extra_lines[0]!.photos).toEqual([]);
    expect(await refusal(() => validateExtras([{ sku: "PILLOW-X", qty: 0 }]))).toBe("extra_line_invalid");
    expect(await refusal(() => validateExtras([{ sku: "PILLOW-X", qty: -1 }]))).toBe("extra_line_invalid");
    expect(await refusal(() => validateExtras([{ sku: "PILLOW-X", qty: 1, photos: [P("bbbb-claim-DO-1.mp4")] }]))).toBe(
      "evidence_kind_mismatch",
    );
  });
});

describe("§5 · projection into rows", () => {
  const postedLines = [
    {
      id: LINE,
      sku: "JAGER-SS",
      received_now: 1,
      damaged_qty: 1,
      wrong_item_qty: 0,
      damaged_photos: [P("aaaa-claim-DO-1.jpg")],
      damaged_videos: [P("bbbb-claim-DO-1.mp4")],
      wrong_item_photos: [],
      wrong_item_videos: [],
    },
    {
      id: LINE_QTY,
      sku: "LOOSE-SKU",
      received_now: 0,
      damaged_qty: 0,
      wrong_item_qty: 1,
      wrong_item_photos: [P("cccc-claim-DO-1.png")],
      wrong_item_videos: [P("dddd-claim-DO-1.mov")],
    },
  ];
  const extraId = "22222222-2222-2222-2222-222222222222";

  it("a posted receipt's jsonb evidence becomes one row per file, by line, type and kind", async () => {
    const id = await postReceipt({
      lines: postedLines,
      extras: [
        { id: extraId, sku: "PILLOW-X", qty: 1, photos: [P("eeee-claim-DO-1.jpg")], videos: [P("ffff-claim-DO-1.webm")] },
        // Pre-0493 shape: no id → nothing can point at it, so nothing projects.
        { sku: "PILLOW-OLD", qty: 1, photos: [P("eeee-claim-DO-1.jpg")] },
      ],
    });
    const ev = await evidenceOf(id);
    expect(ev.map((e) => [e.exception_type, e.line_key, e.media_kind, e.path, e.source])).toEqual([
      ["damaged", LINE, "photo", P("aaaa-claim-DO-1.jpg"), "posting"],
      ["damaged", LINE, "video", P("bbbb-claim-DO-1.mp4"), "posting"],
      ["extra", extraId, "photo", P("eeee-claim-DO-1.jpg"), "posting"],
      ["extra", extraId, "video", P("ffff-claim-DO-1.webm"), "posting"],
      ["wrong_item", LINE_QTY, "photo", P("cccc-claim-DO-1.png"), "posting"],
      ["wrong_item", LINE_QTY, "video", P("dddd-claim-DO-1.mov"), "posting"],
    ]);
    expect(ev.every((e) => e.added_by === OP)).toBe(true);
  });

  it("re-projecting inserts nothing twice, and never touches the receipt row", async () => {
    const id = await postReceipt({ lines: postedLines });
    const before = await rows<{ updated_at: string; n: string }>(
      `select r.updated_at::text as updated_at, (select count(*) from receiving_line_evidence e where e.receipt_id = r.id)::text as n from warehouse_receipts r where r.id = $1`,
      [id],
    );
    const again = await rows<{ n: number }>(`select public.receiving_project_line_evidence($1, 'projection') as n`, [id]);
    expect(again[0]!.n).toBe(0);
    const after = await rows<{ updated_at: string; n: string }>(
      `select r.updated_at::text as updated_at, (select count(*) from receiving_line_evidence e where e.receipt_id = r.id)::text as n from warehouse_receipts r where r.id = $1`,
      [id],
    );
    expect(after).toEqual(before);
    expect(after[0]!.n).toBe("4");
  });

  it("a submitted count projects nothing; a historical GRN with no exceptions projects nothing", async () => {
    const submitted = await postReceipt({ lines: postedLines, status: "submitted" });
    expect(await evidenceOf(submitted)).toEqual([]);
    const clean = await postReceipt({
      lines: [{ id: LINE, sku: "JAGER-SS", received_now: 2, damaged_qty: 0, wrong_item_qty: 0, damaged_photos: [], wrong_item_photos: [] }],
    });
    expect(await evidenceOf(clean)).toEqual([]);
  });

  it("the trigger also runs when a submitted count is later posted", async () => {
    const id = await postReceipt({ lines: postedLines, status: "submitted" });
    await db.query(`update warehouse_receipts set status = 'posted', posted_by = $2 where id = $1`, [id, OP]);
    expect((await evidenceOf(id)).length).toBe(4);
  });
});

describe("§6 · the append door", () => {
  const posted = [
    { id: LINE, sku: "JAGER-SS", received_now: 1, damaged_qty: 1, wrong_item_qty: 0, damaged_photos: [P("aaaa-claim-DO-1.jpg")], wrong_item_photos: [] },
  ];
  const extraId = "33333333-3333-3333-3333-333333333333";

  async function add(receiptId: string, entries: unknown, reason: string | null = "found the video later") {
    return rows<{ v: { added: number; before: number; after: number } }>(
      `select public.receiving_line_evidence_add($1, $2::jsonb, $3) as v`,
      [receiptId, JSON.stringify(entries), reason],
    ).then((r) => r[0]!.v);
  }

  it("appends rows for every exception × kind, a duplicate is a no-op, and one amended event carries before/after", async () => {
    const id = await postReceipt({ lines: posted, extras: [{ id: extraId, sku: "PILLOW-X", qty: 1 }] });
    const first = await add(id, [
      { line_key: LINE, exception_type: "damaged", kind: "video", path: P("bbbb-claim-DO-1.mp4") },
      { line_key: extraId, exception_type: "extra", kind: "photo", path: P("eeee-claim-DO-1.jpg") },
      { line_key: extraId, exception_type: "extra", kind: "video", path: P("ffff-claim-DO-1.webm") },
    ]);
    expect(first).toEqual({ receipt_id: id, added: 3, before: 1, after: 4 });
    const retry = await add(id, [
      { line_key: LINE, exception_type: "damaged", kind: "video", path: P("bbbb-claim-DO-1.mp4") },
    ]);
    expect(retry.added).toBe(0);
    const events = await rows<{ event: string; payload: Record<string, unknown> }>(
      `select event, payload from receiving_events where receipt_id = $1 order by event_at`,
      [id],
    );
    expect(events.length).toBe(1);
    expect(events[0]!.event).toBe("amended");
    expect(events[0]!.payload.kind).toBe("line_evidence");
    expect(events[0]!.payload.before).toEqual({ exception_evidence_count: 1 });
    expect(events[0]!.payload.after).toEqual({ exception_evidence_count: 4 });
    expect((events[0]!.payload.evidence_added as unknown[]).length).toBe(3);
  });

  it("two operators appending to the same GRN both persist — an append is an INSERT, never an array rebuilt", async () => {
    const id = await postReceipt({ lines: posted });
    await actingAs(db, OP);
    await add(id, [{ line_key: LINE, exception_type: "damaged", kind: "video", path: P("bbbb-claim-DO-1.mp4") }]);
    await actingAs(db, OP2);
    await add(id, [{ line_key: LINE, exception_type: "damaged", kind: "photo", path: P("cccc-claim-DO-1.png") }]);
    const ev = await evidenceOf(id);
    expect(ev.map((e) => [e.media_kind, e.path, e.added_by, e.source])).toEqual([
      ["photo", P("aaaa-claim-DO-1.jpg"), OP, "posting"],
      ["photo", P("cccc-claim-DO-1.png"), OP2, "amend"],
      ["video", P("bbbb-claim-DO-1.mp4"), OP, "amend"],
    ]);
    // The stored line jsonb is untouched — the table owns the evidence now.
    const stored = await rows<{ lines: Array<{ damaged_photos: string[] }> }>(`select lines from warehouse_receipts where id = $1`, [id]);
    expect(stored[0]!.lines[0]!.damaged_photos).toEqual([P("aaaa-claim-DO-1.jpg")]);
  });

  it("refuses by name: a zero exception, a foreign line, a cancelled GRN, a foreign path, and a caller outside GRN duty", async () => {
    const id = await postReceipt({ lines: posted });
    expect(
      await refusal(() => add(id, [{ line_key: LINE, exception_type: "wrong_item", kind: "photo", path: P("cccc-claim-DO-1.png") }])),
    ).toBe("evidence_exception_zero");
    expect(
      await refusal(() => add(id, [{ line_key: LINE_QTY, exception_type: "damaged", kind: "photo", path: P("cccc-claim-DO-1.png") }])),
    ).toBe("evidence_line_not_on_receipt");
    expect(
      await refusal(() => add(id, [{ line_key: LINE, exception_type: "damaged", kind: "photo", path: "PO-9999/zzzz-claim-DO-9.jpg" }])),
    ).toBe("evidence_path_foreign");
    expect(
      await refusal(() => add(id, [{ line_key: LINE, exception_type: "damaged", kind: "video", path: P("cccc-claim-DO-1.png") }])),
    ).toBe("evidence_kind_mismatch");
    const voided = await postReceipt({ lines: posted, status: "voided" });
    expect(
      await refusal(() => add(voided, [{ line_key: LINE, exception_type: "damaged", kind: "video", path: P("bbbb-claim-DO-1.mp4") }])),
    ).toBe("receipt_not_posted");
    await actingAs(db, OP2, "refuse");
    expect(
      await refusal(() => add(id, [{ line_key: LINE, exception_type: "damaged", kind: "video", path: P("bbbb-claim-DO-1.mp4") }])),
    ).toBe("not_grn_duty");
    expect((await evidenceOf(id)).length).toBe(1);
  });
});

describe("the record's boundary", () => {
  it("clients may read under RLS and may not write — only the doors insert", async () => {
    const priv = await rows<{ sel: boolean; ins: boolean; upd: boolean; del: boolean }>(
      `select has_table_privilege('authenticated','public.receiving_line_evidence','SELECT') as sel,
              has_table_privilege('authenticated','public.receiving_line_evidence','INSERT') as ins,
              has_table_privilege('authenticated','public.receiving_line_evidence','UPDATE') as upd,
              has_table_privilege('authenticated','public.receiving_line_evidence','DELETE') as del`,
    );
    expect(priv[0]).toEqual({ sel: true, ins: false, upd: false, del: false });
    const rls = await rows<{ relrowsecurity: boolean; policies: string }>(
      `select c.relrowsecurity, (select count(*) from pg_policy p where p.polrelid = c.oid)::text as policies
         from pg_class c where c.relname = 'receiving_line_evidence'`,
    );
    expect(rls[0]).toEqual({ relrowsecurity: true, policies: "1" });
    const fns = await rows<{ proname: string; ok: boolean }>(
      `select p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') as ok
         from pg_proc p where p.proname in ('receiving_line_evidence_add','receiving_project_line_evidence','receiving_validate_media_paths','receiving_validate_session_extras')
        order by p.proname`,
    );
    expect(fns).toEqual([
      { proname: "receiving_line_evidence_add", ok: true },
      { proname: "receiving_project_line_evidence", ok: false },
      { proname: "receiving_validate_media_paths", ok: false },
      { proname: "receiving_validate_session_extras", ok: false },
    ]);
  });
});
