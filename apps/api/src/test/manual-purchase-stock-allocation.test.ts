import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { actingAs, manualPurchaseStockDatabase } from "./ready-stock-reservation-database";

/**
 * MANUAL PURCHASE · READY STOCK ALLOCATION — the rules, run as SQL (0546).
 *
 * The route tests beside this one prove that the API passes a refusal code
 * through. They cannot prove that the DATABASE refuses, because they mock the
 * database. Every guard the owner ruling asks for — bind to the exact MPR
 * line, never pass an MPR id into the SO binding, approval first, recorded
 * intent, no double purchase, one winner in a race — is written in SQL, so it
 * is asked of the committed SQL here.
 *
 * `manualPurchaseStockDatabase()` runs migration 0546's own statements; no
 * body is restated, so a later edit to the migration is tested, not shadowed.
 */

const OP = "00000000-0000-0000-0000-0000000000aa";
const WH = "00000000-0000-0000-0000-0000000000c3";
const REQ = "33333333-3333-3333-3333-333333333331";
const LINE = "44444444-4444-4444-4444-444444444441";
const LINE_2 = "44444444-4444-4444-4444-444444444442";
/** A Sales Order line, to prove the two bindings stay apart. */
const ORDER = "11111111-1111-1111-1111-111111111111";
const SO_LINE = "22222222-2222-2222-2222-22222222222a";

let db: PGlite;

async function rows<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  return (await db.query<T>(sql)).rows;
}

/** The detail code the door refused with, or null when it did not refuse. */
async function refusal(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as { message?: string }).message ?? "unknown";
  }
}

const uuids = (ids: string[]) =>
  ids.length === 0 ? "'{}'::uuid[]" : `array[${ids.map((i) => `'${i}'`).join(",")}]::uuid[]`;

async function save(
  ids: string[],
  opts: { demand?: string; expected?: string[] | null } = {},
) {
  const res = await rows<{ purchasing_allocate_ready_units: Record<string, unknown> }>(
    `select public.purchasing_allocate_ready_units(
        '${opts.demand ?? LINE}'::uuid,
        ${uuids(ids)},
        ${opts.expected === undefined ? "null" : uuids(opts.expected ?? [])}
      ) as purchasing_allocate_ready_units`,
  );
  return res[0]!.purchasing_allocate_ready_units;
}

/** What the database actually holds for a line, after the act. */
async function held(demand = LINE): Promise<string[]> {
  const r = await rows<{ id: string }>(
    `select id from public.ops_stock_items
      where reserved_purchase_demand_id = '${demand}' and status in ('reserved','sold')
      order by unit_code`,
  );
  return r.map((x) => x.id);
}

async function unit(code: string): Promise<string> {
  const r = await rows<{ id: string }>(
    `select id from public.ops_stock_items where unit_code = '${code}'`,
  );
  return r[0]!.id;
}

beforeEach(async () => {
  db = await manualPurchaseStockDatabase();
  await db.exec(`
    insert into public.orders values ('${ORDER}', 1301);
    insert into public.order_lines values ('${SO_LINE}', '${ORDER}', '5539-2NA', 1);
    insert into public.purchase_requests (id, req_no, approved_at, fulfilment_intent)
      values ('${REQ}', 'MPR-20260918-4103', now(), 'concrete_need');
    insert into public.purchase_demands (id, request_id, sku, qty)
      values ('${LINE}', '${REQ}', '5539-2NA', 2),
             ('${LINE_2}', '${REQ}', '5539-CNR', 1);
    insert into public.ops_stock_items
      (unit_code, sku, warehouse_id, status, condition, date_in)
      values ('U1-000-001', '5539-2NA', '${WH}', 'free', 'new', '2026-07-01'),
             ('U1-000-002', '5539-2NA', '${WH}', 'free', 'new', '2026-07-02'),
             ('U1-000-003', '5539-2NA', '${WH}', 'free', 'new', '2026-07-03'),
             ('U1-000-009', '5539-CNR', '${WH}', 'free', 'new', '2026-07-04');
  `);
  await actingAs(db, "operation", OP);
});

afterEach(async () => {
  await db.close();
});

describe("the allocation binds to the EXACT Manual Purchase line", () => {
  it("writes the demand id, not the Sales Order column, and not the reference alone", async () => {
    const u1 = await unit("U1-000-001");
    await save([u1]);
    const [row] = await rows<{
      reserved_purchase_demand_id: string | null;
      reserved_order_line_id: string | null;
      reserved_ref: string | null;
      status: string;
    }>(
      `select reserved_purchase_demand_id, reserved_order_line_id, reserved_ref, status
         from public.ops_stock_items where id = '${u1}'`,
    );
    expect(row!.reserved_purchase_demand_id).toBe(LINE);
    /* ⛔ THE RULING'S OWN WORDS: never pass an MPR id into an SO-only
       reservation route. The SO column stays empty — and it is the column the
       whole Sales Order lane reads. */
    expect(row!.reserved_order_line_id).toBeNull();
    /* The MPR No still rides along, because the ledger commits every drawn
       Unit to a named reference — but a request has several lines, so the
       reference alone could never say WHICH. That is why the column exists. */
    expect(row!.reserved_ref).toBe("MPR-20260918-4103");
    expect(row!.status).toBe("reserved");
  });

  it("⛔ REFUSES A UNIT ASKED TO ANSWER BOTH KINDS OF LINE AT ONCE", async () => {
    const u1 = await unit("U1-000-001");
    expect(
      await refusal(() =>
        db.exec(`select public.ops_stock_pool_draw(
          p_ref => 'MPR-20260918-4103', p_reason => 'used_instead_of_ordering',
          p_item_id => '${u1}', p_order_line_id => '${SO_LINE}',
          p_purchase_demand_id => '${LINE}')`),
      ),
    ).toContain("one_binding_only");
  });

  it("⛔ AND THE CONSTRAINT HOLDS EVEN IF SOMETHING GOT PAST THE DOOR", async () => {
    /* The guard above is a door. This is the CHECK underneath it: a Unit
       answers one line, whatever route tried to write the second. */
    const u1 = await unit("U1-000-001");
    await save([u1]);
    expect(
      await refusal(() =>
        db.exec(
          `update public.ops_stock_items set reserved_order_line_id = '${SO_LINE}' where id = '${u1}'`,
        ),
      ),
    ).toContain("ops_stock_items_one_binding");
  });

  it("a Manual Purchase line is not answered against a Sales Order reference", async () => {
    const u1 = await unit("U1-000-001");
    expect(
      await refusal(() =>
        db.exec(`select public.ops_stock_pool_draw(
          p_ref => 'SO-1301', p_reason => 'used_instead_of_ordering',
          p_item_id => '${u1}', p_purchase_demand_id => '${LINE}')`),
      ),
    ).toContain("mpr_line_needs_request_ref");
  });
});

describe("what the request must be before a Unit may answer it", () => {
  it("⛔ NOT APPROVED — nothing is saved, whatever the screen allowed", async () => {
    await db.exec(`update public.purchase_requests set approved_at = null where id = '${REQ}'`);
    expect(await refusal(async () => save([await unit("U1-000-001")]))).toContain(
      "request_not_approved",
    );
    expect(await held()).toEqual([]);
  });

  it("⛔ REFUSED, WITHDRAWN and SENT BACK are each their own no", async () => {
    for (const column of ["refused_at", "withdrawn_at", "sent_back_at"]) {
      await db.exec(`update public.purchase_requests set ${column} = now() where id = '${REQ}'`);
      expect(await refusal(async () => save([await unit("U1-000-001")]))).toContain(
        "request_not_approved",
      );
      await db.exec(`update public.purchase_requests set ${column} = null where id = '${REQ}'`);
    }
  });

  it("⛔ ADDITIONAL REPLENISHMENT MAY NOT TAKE THE SHELF — it is buying EXTRA", async () => {
    await db.exec(
      `update public.purchase_requests set fulfilment_intent = 'additional_stock' where id = '${REQ}'`,
    );
    expect(await refusal(async () => save([await unit("U1-000-001")]))).toContain(
      "request_not_a_concrete_need",
    );
  });

  it("⛔ AN UNRECORDED INTENT IS NOT A CONCRETE NEED — it is never guessed into one", async () => {
    await db.exec(
      `update public.purchase_requests set fulfilment_intent = null where id = '${REQ}'`,
    );
    expect(await refusal(async () => save([await unit("U1-000-001")]))).toContain(
      "request_not_a_concrete_need",
    );
  });

  it("⛔ AND NO THIRD INTENT CAN BE STORED", async () => {
    expect(
      await refusal(() =>
        db.exec(
          `update public.purchase_requests set fulfilment_intent = 'maybe' where id = '${REQ}'`,
        ),
      ),
    ).toContain("purchase_requests_fulfilment_intent_check");
  });

  it("⛔ NO MPR No, NO SAVE — a fabricated number would enter the stock ledger for ever", async () => {
    await db.exec(`update public.purchase_requests set req_no = null where id = '${REQ}'`);
    expect(await refusal(async () => save([await unit("U1-000-001")]))).toContain(
      "request_has_no_number",
    );
  });

  it("⛔ A LINE THAT IS NOT GOING AHEAD holds nothing", async () => {
    await db.exec(`update public.purchase_demands set cancelled_at = now() where id = '${LINE}'`);
    expect(await refusal(async () => save([await unit("U1-000-001")]))).toContain(
      "mpr_line_not_going_ahead",
    );
  });
});

describe("the ask is never rewritten, and the same goods are never bought twice", () => {
  it("the remaining requirement falls by what is HELD, and the ask itself does not move", async () => {
    expect(await save([await unit("U1-000-001")])).toMatchObject({ remainingQty: 1 });
    const [line] = await rows<{ qty: number; approved_qty: number | null }>(
      `select qty, approved_qty from public.purchase_demands where id = '${LINE}'`,
    );
    /* ⛔ THE ORIGINAL ASK IS EVIDENCE. Two were requested and two are still
       recorded as requested; what changed is how many are left to BUY. */
    expect(line!.qty).toBe(2);
    expect(line!.approved_qty).toBeNull();
  });

  it("⛔ A COVERED LINE TAKES NO MORE — two Units answer a line that asked for two", async () => {
    await save([await unit("U1-000-001"), await unit("U1-000-002")]);
    expect(
      await refusal(async () =>
        save([
          await unit("U1-000-001"),
          await unit("U1-000-002"),
          await unit("U1-000-003"),
        ]),
      ),
    ).toContain("mpr_line_already_covered");
    /* Refused WHOLE: the two that were already there are untouched. */
    expect((await held()).length).toBe(2);
  });

  it("⛔ AND WHAT A PURCHASE ORDER ALREADY TOOK COUNTS TOO", async () => {
    await db.exec(`update public.purchase_demands set issued_qty = 2 where id = '${LINE}'`);
    expect(await refusal(async () => save([await unit("U1-000-001")]))).toContain(
      "mpr_line_already_covered",
    );
  });

  it("the APPROVED quantity is the ceiling when the approver cut the ask", async () => {
    await db.exec(`update public.purchase_demands set approved_qty = 1 where id = '${LINE}'`);
    await save([await unit("U1-000-001")]);
    expect(
      await refusal(async () => save([await unit("U1-000-001"), await unit("U1-000-002")])),
    ).toContain("mpr_line_already_covered");
  });

  it("a Unit may not answer a line that did not ask for its goods", async () => {
    expect(await refusal(async () => save([await unit("U1-000-009")]))).toContain(
      "unit_does_not_match_line",
    );
  });
});

describe("`Save changes` is ONE act — all of it, or none of it", () => {
  it("adds and removes in one save, and the answer is the stored truth", async () => {
    const [u1, u2] = [await unit("U1-000-001"), await unit("U1-000-002")];
    await save([u1]);
    const result = await save([u2], { expected: [u1] });
    expect(result).toMatchObject({ added: 1, removed: 1, reserved: 1 });
    expect(await held()).toEqual([u2]);
    /* The Unit that left is FREE again, not stranded half-released. */
    const [freed] = await rows<{ status: string; reserved_purchase_demand_id: string | null }>(
      `select status, reserved_purchase_demand_id from public.ops_stock_items where id = '${u1}'`,
    );
    expect(freed!.status).toBe("free");
    expect(freed!.reserved_purchase_demand_id).toBeNull();
  });

  it("⭐ AN EMPTY SET RELEASES EVERYTHING — removing every Unit is a legal save", async () => {
    const [u1, u2] = [await unit("U1-000-001"), await unit("U1-000-002")];
    await save([u1, u2]);
    expect(await save([], { expected: [u1, u2] })).toMatchObject({
      removed: 2,
      reserved: 0,
      remainingQty: 2,
    });
    expect(await held()).toEqual([]);
  });

  it("⛔ A REPEATED UNIT IN ONE SAVE would be drawn twice and counted twice", async () => {
    const u1 = await unit("U1-000-001");
    expect(await refusal(() => save([u1, u1]))).toContain("duplicate_unit_chosen");
  });

  it("⛔ AND AN EMPTY SET IS NOT A DUPLICATE OF ANYTHING (0547)", async () => {
    /* 0546 compared `array_length(arr, 1)` — NULL on an empty array — against
       a distinct count of 0, and `NULL is distinct from 0` is TRUE, so the one
       act that frees a line refused itself with a word that was not even true
       of it. Measured on PostgreSQL 16.13 and on the PGlite this suite runs.
       The guard must still catch a real repeat, which the test above asks. */
    expect(await refusal(() => save([]))).toBeNull();
    expect(await refusal(() => save([], { expected: [] }))).toBeNull();
  });

  it("⛔ A UNIT SOMEBODY ELSE TOOK refuses the whole save, and nothing is left half-done", async () => {
    const [u1, u2] = [await unit("U1-000-001"), await unit("U1-000-002")];
    /* U1-000-002 goes to a Sales Order line between the read and the save. */
    await db.exec(`select public.ops_stock_pool_draw(
      p_ref => 'SO-1301', p_reason => 'vip',
      p_item_id => '${u2}', p_order_line_id => '${SO_LINE}')`);
    /* `unit_no_longer_free` is the door's own word for it: the conditional
       UPDATE found no free row, which is the same fact the operator needs and
       the only one the database can state without racing itself. */
    expect(await refusal(() => save([u1, u2]))).toContain("unit_no_longer_free");
    /* ALL OR NONE: U1-000-001 was first in the list and is still free. */
    expect(await held()).toEqual([]);
    const [first] = await rows<{ status: string }>(
      `select status from public.ops_stock_items where id = '${u1}'`,
    );
    expect(first!.status).toBe("free");
  });

  it("names the Unit that stopped the act, so five choices are not five guesses", async () => {
    const [u1, u2] = [await unit("U1-000-001"), await unit("U1-000-002")];
    await db.exec(`update public.ops_stock_items set status = 'sold' where id = '${u2}'`);
    let detail: string | null = null;
    try {
      await save([u1, u2]);
    } catch (e) {
      detail = (e as { detail?: string }).detail ?? null;
    }
    expect(detail).toContain(u2);
  });
});

describe("two operators reaching for one line", () => {
  it("⛔ REFUSES THE SAVE WHOSE VIEW OF THE LINE HAS MOVED", async () => {
    const [u1, u2] = [await unit("U1-000-001"), await unit("U1-000-002")];
    /* The first operator saves. The second is still editing the empty set it
       read a moment ago; its save must not silently overwrite the first's. */
    await save([u1]);
    expect(await refusal(() => save([u2], { expected: [] }))).toContain(
      "stock_selection_changed",
    );
    expect(await held()).toEqual([u1]);
  });

  it("a save that states the CURRENT set is accepted", async () => {
    const [u1, u2] = [await unit("U1-000-001"), await unit("U1-000-002")];
    await save([u1]);
    await save([u1, u2], { expected: [u1] });
    expect((await held()).length).toBe(2);
  });

  it("no expectation at all means no optimistic check — the first read still wins nothing", async () => {
    /* `null` is "I am not claiming to know the saved set". It is the create
       path, and it must not be readable as "I expect it to be empty". */
    const [u1, u2] = [await unit("U1-000-001"), await unit("U1-000-002")];
    await save([u1]);
    await save([u1, u2]);
    expect((await held()).length).toBe(2);
  });
});

describe("who may allocate", () => {
  it("⛔ REFUSES EVERY ROLE THAT IS NOT OPERATION OR PRINCIPAL", async () => {
    const u1 = await unit("U1-000-001");
    for (const role of ["sales", "finance", "warehouse", "null"]) {
      await actingAs(db, role);
      expect(await refusal(() => save([u1])), role).toContain("forbidden");
    }
  });

  it("the principal may allocate — approving and acting are the same desk here", async () => {
    await actingAs(db, "principal", OP);
    await save([await unit("U1-000-001")]);
    expect((await held()).length).toBe(1);
  });
});

describe("the act leaves evidence", () => {
  it("records ONE stock_allocated event carrying what moved", async () => {
    const [u1, u2] = [await unit("U1-000-001"), await unit("U1-000-002")];
    await save([u1]);
    await save([u2], { expected: [u1] });
    const events = await rows<{ kind: string; changes: Record<string, unknown> }>(
      `select kind, changes from public.purchase_request_events
        where request_id = '${REQ}' order by at, id`,
    );
    expect(events.map((e) => e.kind)).toEqual(["stock_allocated", "stock_allocated"]);
    expect(events[1]!.changes).toMatchObject({ demand_id: LINE, sku: "5539-2NA" });
  });

  it("a save that changes NOTHING writes no event", async () => {
    const u1 = await unit("U1-000-001");
    await save([u1]);
    await save([u1], { expected: [u1] });
    const events = await rows(
      `select 1 from public.purchase_request_events where request_id = '${REQ}'`,
    );
    expect(events.length).toBe(1);
  });
});

describe("two lines of one request are two requirements", () => {
  it("each line holds its own Units, and neither covers the other", async () => {
    await save([await unit("U1-000-001")]);
    await save([await unit("U1-000-009")], { demand: LINE_2 });
    expect((await held(LINE)).length).toBe(1);
    expect((await held(LINE_2)).length).toBe(1);
    /* The second line asked for one and now has one, so it is covered; the
       first asked for two and still has one to buy. */
    const [remaining] = await rows<{ a: number; b: number }>(
      `select public.purchasing_mpr_line_remaining_requirement('${LINE}') as a,
              public.purchasing_mpr_line_remaining_requirement('${LINE_2}') as b`,
    );
    expect(remaining).toMatchObject({ a: 1, b: 0 });
  });
});
