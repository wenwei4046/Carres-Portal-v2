import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  actingAs,
  backfillStatement,
  readyStockDatabase,
} from "./ready-stock-reservation-database";

/**
 * SO BATCH PURCHASE · READY STOCK — the reservation rules, run as SQL.
 *
 * Every case below is a measured production shape, not an invented one:
 * SO-1251 carries two item lines of one SKU, five register rows are counted
 * stock standing for 893 pieces, one free Unit belongs to a supplier, and the
 * Unreserve button in the order drawer is reachable today.
 */

const OP = "00000000-0000-0000-0000-0000000000aa";
const WH = "00000000-0000-0000-0000-0000000000c3";
const ORDER = "11111111-1111-1111-1111-111111111111";
const LINE_A = "22222222-2222-2222-2222-22222222222a";
const LINE_B = "22222222-2222-2222-2222-22222222222b";
const OTHER_ORDER = "11111111-1111-1111-1111-111111111112";
const OTHER_LINE = "22222222-2222-2222-2222-22222222222c";

let db: PGlite;

async function rows<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const res = await db.query<T>(sql);
  return res.rows;
}

async function draw(opts: {
  ref: string;
  itemId?: string | null;
  sku?: string | null;
  lineId?: string | null;
  reason?: string;
}): Promise<string | null> {
  const res = await rows<{ ops_stock_pool_draw: string | null }>(
    `select public.ops_stock_pool_draw(
        p_ref => '${opts.ref}',
        p_reason => '${opts.reason ?? "used_instead_of_ordering"}',
        p_note => 'test',
        p_item_id => ${opts.itemId ? `'${opts.itemId}'` : "null"},
        p_sku => ${opts.sku ? `'${opts.sku}'` : "null"},
        p_condition => null,
        p_wh => null,
        p_order_line_id => ${opts.lineId ? `'${opts.lineId}'` : "null"}) as ops_stock_pool_draw`,
  );
  return res[0]?.ops_stock_pool_draw ?? null;
}

/** The detail code the door refused with, or null when it did not refuse. */
async function refusal(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/**
 * The refusal's DETAIL — where 0473 writes the Unit the act stopped on. Read
 * separately from the message because the message is the refusal WORD and the
 * browser's sentence hangs off that; the Unit is the extra fact beside it.
 */
async function refusalDetail(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return ((e as { detail?: string }).detail ?? null);
  }
}

beforeEach(async () => {
  db = await readyStockDatabase();
  await db.exec(`
    insert into public.orders values ('${ORDER}', 1251), ('${OTHER_ORDER}', 1207);
    insert into public.order_lines values
      ('${LINE_A}', '${ORDER}', '1013Jager/Fab3-Queen/PC151-01', 1),
      ('${LINE_B}', '${ORDER}', '1013Jager/Fab3-Queen/PC151-01', 1),
      ('${OTHER_LINE}', '${OTHER_ORDER}', 'CODY-K', 2);
    insert into public.ops_stock_items
      (id, unit_code, sku, warehouse_id, status, condition, qty, identity_scope, date_in)
    values
      ('33333333-0000-0000-0000-00000000000a', 'U1-000-001', '1013Jager/Fab3-Queen/PC151-01', '${WH}', 'free', 'new', 1, 'unit', '2026-08-01'),
      ('33333333-0000-0000-0000-00000000000b', 'U1-000-002', '1013Jager/Fab3-Queen/PC151-01', '${WH}', 'free', 'exhibition', 1, 'unit', '2026-08-02'),
      ('33333333-0000-0000-0000-00000000000c', 'U1-000-003', '1013Jager/Fab3-King/PC151-01',  '${WH}', 'free', 'new', 1, 'unit', '2026-08-03'),
      ('33333333-0000-0000-0000-00000000000d', 'U1-000-004', '1013Jager/Fab3-Queen/PC151-14', '${WH}', 'free', 'new', 1, 'unit', '2026-08-04'),
      ('33333333-0000-0000-0000-00000000000e', 'QTY-000000001', '1013Jager/Fab3-Queen/PC151-01', '${WH}', 'free', 'new', 893, 'quantity', '2026-08-05'),
      ('33333333-0000-0000-0000-00000000000f', 'U1-000-006', '1013Jager/Fab3-Queen/PC151-01', '${WH}', 'free', 'damaged', 1, 'unit', '2026-08-06'),
      ('33333333-0000-0000-0000-000000000010', 'U1-000-007', 'CODY-K', '${WH}', 'free', 'new', 1, 'unit', '2026-08-07');
  `);
  await actingAs(db, "operation", OP);
});

afterEach(async () => {
  await db.close();
});

/* ─── SAME SKU ON MULTIPLE SO LINES ─────────────────────────────────────── */

describe("same SKU on two item lines of one Sales Order", () => {
  it("binds each chosen Unit to the exact line it was chosen for", async () => {
    const first = await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000a", lineId: LINE_A });
    const second = await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000b", lineId: LINE_B });
    expect(first).toBe("33333333-0000-0000-0000-00000000000a");
    expect(second).toBe("33333333-0000-0000-0000-00000000000b");
    const bound = await rows<{ unit_code: string; reserved_order_line_id: string }>(
      `select unit_code, reserved_order_line_id from public.ops_stock_items
        where reserved_order_line_id is not null order by unit_code`,
    );
    expect(bound).toEqual([
      { unit_code: "U1-000-001", reserved_order_line_id: LINE_A },
      { unit_code: "U1-000-002", reserved_order_line_id: LINE_B },
    ]);
  });

  it("refuses a second Unit for a line that is already covered", async () => {
    await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000a", lineId: LINE_A });
    const err = await refusal(() =>
      draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000b", lineId: LINE_A }),
    );
    expect(err).toContain("line_already_covered");
  });

  /**
   * THE RESOLUTION HAS TWO OUTCOMES, NEVER A GUESS. The order drawer's picker
   * sends no line; with two lines of one SKU both still needing goods, the
   * door refuses rather than pick one.
   */
  it("refuses to guess when a caller names no line and two could be meant", async () => {
    const err = await refusal(() =>
      draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000a" }),
    );
    expect(err).toContain("order_line_required");
    const reserved = await rows(`select 1 from public.ops_stock_items where status = 'reserved'`);
    expect(reserved).toEqual([]);
  });

  it("resolves silently when only one line can be meant", async () => {
    await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000a", lineId: LINE_A });
    /* Line A is covered now, so only line B can still be meant. */
    const drawn = await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000b" });
    expect(drawn).toBe("33333333-0000-0000-0000-00000000000b");
    const [row] = await rows<{ reserved_order_line_id: string }>(
      `select reserved_order_line_id from public.ops_stock_items where unit_code = 'U1-000-002'`,
    );
    expect(row.reserved_order_line_id).toBe(LINE_B);
  });
});

/* ─── WRONG CONFIGURATION AND INELIGIBLE STOCK ──────────────────────────── */

describe("configuration and eligibility", () => {
  it("refuses a different size of the same model", async () => {
    const err = await refusal(() =>
      draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000c", lineId: LINE_A }),
    );
    expect(err).toContain("unit_does_not_match_line");
  });

  it("refuses a different colour of the same model and size", async () => {
    const err = await refusal(() =>
      draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000d", lineId: LINE_A }),
    );
    expect(err).toContain("unit_does_not_match_line");
  });

  it("refuses a damaged Unit that was released back to free", async () => {
    const err = await refusal(() =>
      draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000f", lineId: LINE_A }),
    );
    expect(err).toContain("unit_not_available");
  });

  it("refuses a Unit that belongs to another Sales Order's line", async () => {
    const err = await refusal(() =>
      draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-000000000010", lineId: OTHER_LINE }),
    );
    expect(err).toContain("line_not_in_order");
  });

  it("refuses every role that is not operation or principal", async () => {
    await actingAs(db, "sales");
    const err = await refusal(() =>
      draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000a", lineId: LINE_A }),
    );
    expect(err).toContain("forbidden");
    await actingAs(db, "principal");
    expect(
      await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000a", lineId: LINE_A }),
    ).toBe("33333333-0000-0000-0000-00000000000a");
  });
});

/* ─── QUANTITY STOCK VERSUS SERIALIZED UNITS ────────────────────────────── */

describe("counted stock is not a Unit", () => {
  it("refuses to bind a quantity row to an item line", async () => {
    const err = await refusal(() =>
      draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000e", lineId: LINE_A }),
    );
    expect(err).toContain("quantity_row_not_bindable");
  });

  it("never lets a pick-by-SKU land on a counted row for a Sales Order", async () => {
    /* Line B is answered, so exactly one line can be meant — and the only
       stock left for these goods is the 893-piece counted row. */
    await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000b", lineId: LINE_B });
    await db.exec(
      `update public.ops_stock_items set status = 'sold'
        where identity_scope = 'unit' and status = 'free'
          and sku = '1013Jager/Fab3-Queen/PC151-01'`,
    );
    const drawn = await draw({ ref: "SO-1251", sku: "1013Jager/Fab3-Queen/PC151-01", lineId: null });
    expect(drawn).toBeNull();
    const [row] = await rows<{ status: string }>(
      `select status from public.ops_stock_items where unit_code = 'QTY-000000001'`,
    );
    expect(row.status).toBe("free");
  });
});

/* ─── TWO USERS CHOOSING THE SAME UNIT ──────────────────────────────────── */

describe("two operators reaching for one Unit", () => {
  it("gives the Unit to one of them and refuses the other", async () => {
    const first = await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000a", lineId: LINE_A });
    expect(first).toBe("33333333-0000-0000-0000-00000000000a");
    /* The second operator's browser still shows the Unit as free, and they
       are answering the OTHER line of the same Sales Order. */
    const err = await refusal(() =>
      draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000a", lineId: LINE_B }),
    );
    expect(err).toContain("unit_no_longer_free");
    const [row] = await rows<{ reserved_ref: string; reserved_order_line_id: string }>(
      `select reserved_ref, reserved_order_line_id from public.ops_stock_items
        where id = '33333333-0000-0000-0000-00000000000a'`,
    );
    expect(row.reserved_ref).toBe("SO-1251");
    expect(row.reserved_order_line_id).toBe(LINE_A);
  });

  it("refuses the WHOLE batch when one Unit was taken mid-act", async () => {
    await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000b", lineId: LINE_B });
    const err = await refusal(() =>
      rows(`select public.so_batch_reserve_ready_units('SO-1251', 'used_instead_of_ordering', 'test',
        '[{"itemId":"33333333-0000-0000-0000-00000000000a","orderLineId":"${LINE_A}"},
          {"itemId":"33333333-0000-0000-0000-00000000000b","orderLineId":"${LINE_B}"}]'::jsonb)`),
    );
    expect(err).toContain("unit_no_longer_free");
    /* NOTHING half-reserved: the first Unit of the batch is still free. */
    const [row] = await rows<{ status: string }>(
      `select status from public.ops_stock_items where id = '33333333-0000-0000-0000-00000000000a'`,
    );
    expect(row.status).toBe("free");
  });

  it("names the Unit that stopped the act, so five choices are not five guesses", async () => {
    /* Someone else took the SECOND of the two chosen Units. The operator must
       be told WHICH, or the only way to find out is to untick one at a time —
       four more races. 0473 puts the id in DETAIL; the refusal WORD is
       untouched, so the browser still prints the governed sentence. */
    await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000b", lineId: LINE_B });
    const act = () =>
      rows(`select public.so_batch_reserve_ready_units('SO-1251', 'used_instead_of_ordering', 'test',
        '[{"itemId":"33333333-0000-0000-0000-00000000000a","orderLineId":"${LINE_A}"},
          {"itemId":"33333333-0000-0000-0000-00000000000b","orderLineId":"${LINE_B}"}]'::jsonb)`);
    expect(await refusal(act)).toContain("unit_no_longer_free");
    expect(await refusalDetail(act)).toContain(
      "unit_id=33333333-0000-0000-0000-00000000000b",
    );
  });

  it("names the Unit for a refusal the DRAW door raised, keeping its own word", async () => {
    /* Not a race: U1-000-003 is a King, and both of SO-1251's lines are Queen.
       The word stays the draw door's; only the Unit is added. */
    const act = () =>
      rows(`select public.so_batch_reserve_ready_units('SO-1251', 'used_instead_of_ordering', 'test',
        '[{"itemId":"33333333-0000-0000-0000-00000000000c","orderLineId":"${LINE_A}"}]'::jsonb)`);
    expect(await refusal(act)).toContain("unit_does_not_match_line");
    expect(await refusalDetail(act)).toContain(
      "unit_id=33333333-0000-0000-0000-00000000000c",
    );
    /* And the draw door's own explanation survives beside it. */
    expect(await refusalDetail(act)).toContain("not the goods this item line ordered");
  });

  it("writes NOTHING when it names a Unit — the refusal is still the whole act", async () => {
    await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000b", lineId: LINE_B });
    await refusal(() =>
      rows(`select public.so_batch_reserve_ready_units('SO-1251', 'used_instead_of_ordering', 'test',
        '[{"itemId":"33333333-0000-0000-0000-00000000000a","orderLineId":"${LINE_A}"},
          {"itemId":"33333333-0000-0000-0000-00000000000b","orderLineId":"${LINE_B}"}]'::jsonb)`),
    );
    const [row] = await rows<{ status: string; reserved_order_line_id: string | null }>(
      `select status, reserved_order_line_id from public.ops_stock_items
        where id = '33333333-0000-0000-0000-00000000000a'`,
    );
    expect(row.status).toBe("free");
    expect(row.reserved_order_line_id).toBeNull();
    /* And the append-only ledger carries no row for the act that never was —
       only the earlier draw that made the second Unit unavailable. */
    const usage = await rows<{ item_id: string }>(
      `select item_id from public.ops_stock_pool_usage where ref = 'SO-1251'`,
    );
    expect(usage.map((u) => u.item_id)).toEqual([
      "33333333-0000-0000-0000-00000000000b",
    ]);
  });

  it("commits every Unit of a batch that succeeds", async () => {
    const [res] = await rows<{ so_batch_reserve_ready_units: { reserved: number } }>(
      `select public.so_batch_reserve_ready_units('SO-1251', 'used_instead_of_ordering', 'test',
        '[{"itemId":"33333333-0000-0000-0000-00000000000a","orderLineId":"${LINE_A}"},
          {"itemId":"33333333-0000-0000-0000-00000000000b","orderLineId":"${LINE_B}"}]'::jsonb)`,
    );
    expect(res.so_batch_reserve_ready_units.reserved).toBe(2);
    const bound = await rows(
      `select 1 from public.ops_stock_items where reserved_order_line_id is not null`,
    );
    expect(bound).toHaveLength(2);
  });
});

/* ─── EXISTING AND PARTIALLY ISSUED PURCHASE ORDERS ─────────────────────── */

describe("goods already on a purchase order", () => {
  beforeEach(async () => {
    await db.exec(`
      insert into public.purchase_orders values ('PO-2051', 'open'), ('PO-2052', 'cancelled');
      insert into public.po_line_sources (po_id, sku, order_id, so, order_line_id, qty)
        values ('PO-2051', '1013Jager/Fab3-Queen/PC151-01', '${ORDER}', 1251, '${LINE_A}', 1);
    `);
  });

  it("refuses a Unit for a line an open purchase order already covers", async () => {
    const err = await refusal(() =>
      draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000a", lineId: LINE_A }),
    );
    expect(err).toContain("line_already_covered");
  });

  it("still allows the OTHER line of the same SKU", async () => {
    const drawn = await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000a", lineId: LINE_B });
    expect(drawn).toBe("33333333-0000-0000-0000-00000000000a");
  });

  it("ignores a cancelled purchase order's lineage", async () => {
    await db.exec(
      `insert into public.po_line_sources (po_id, sku, order_id, so, order_line_id, qty)
         values ('PO-2052', '1013Jager/Fab3-Queen/PC151-01', '${ORDER}', 1251, '${LINE_B}', 1)`,
    );
    const drawn = await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000a", lineId: LINE_B });
    expect(drawn).toBe("33333333-0000-0000-0000-00000000000a");
  });

  it("counts a PARTIALLY issued line correctly", async () => {
    /* A line of 2, one unit on a purchase order: one still needed. */
    await db.exec(`update public.order_lines set qty = 2 where id = '${LINE_A}'`);
    const remaining = await rows<{ r: number }>(
      `select public.so_line_remaining_requirement('${LINE_A}', null) as r`,
    );
    expect(remaining[0].r).toBe(1);
    const drawn = await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000a", lineId: LINE_A });
    expect(drawn).toBe("33333333-0000-0000-0000-00000000000a");
    /* And now nothing is left. */
    const err = await refusal(() =>
      draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000b", lineId: LINE_A }),
    );
    expect(err).toContain("line_already_covered");
  });

  /** SELECTING STOCK MUST NOT SILENTLY CANCEL OR REPLACE AN EXISTING PO. */
  it("leaves the purchase order exactly as it was", async () => {
    await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000a", lineId: LINE_B });
    const pos = await rows<{ id: string; status: string }>(
      `select id, status from public.purchase_orders order by id`,
    );
    expect(pos).toEqual([
      { id: "PO-2051", status: "open" },
      { id: "PO-2052", status: "cancelled" },
    ]);
    const sources = await rows(`select 1 from public.po_line_sources`);
    expect(sources).toHaveLength(1);
  });
});

/* ─── RELEASE, REASSIGN AND QUANTITY RESTORATION ────────────────────────── */

describe("release and reassignment give the requirement back", () => {
  it("restores the line's remaining requirement on release", async () => {
    await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000a", lineId: LINE_A });
    expect((await rows<{ r: number }>(`select public.so_line_remaining_requirement('${LINE_A}', null) as r`))[0].r).toBe(0);

    await rows(`select public.ops_stock_release('33333333-0000-0000-0000-00000000000a')`);

    expect((await rows<{ r: number }>(`select public.so_line_remaining_requirement('${LINE_A}', null) as r`))[0].r).toBe(1);
    const [unit] = await rows<{ status: string; reserved_ref: string | null; reserved_order_line_id: string | null }>(
      `select status, reserved_ref, reserved_order_line_id from public.ops_stock_items
        where id = '33333333-0000-0000-0000-00000000000a'`,
    );
    expect(unit.status).toBe("free");
    expect(unit.reserved_ref).toBeNull();
    expect(unit.reserved_order_line_id).toBeNull();
  });

  /**
   * THE LEDGER IS NOT REWOUND. 0292 rules that a release does not unmake the
   * DECISION, and this proves the two answers stay separate: the pool-usage row
   * survives while the coverage goes back to zero.
   */
  it("leaves the pool-usage ledger append-only", async () => {
    await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000a", lineId: LINE_A });
    await rows(`select public.ops_stock_release('33333333-0000-0000-0000-00000000000a')`);
    const ledger = await rows<{ ref: string; reason: string }>(
      `select ref, reason from public.ops_stock_pool_usage`,
    );
    expect(ledger).toEqual([{ ref: "SO-1251", reason: "used_instead_of_ordering" }]);
  });

  it("lets the same Unit be chosen again after release — substitution", async () => {
    await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000a", lineId: LINE_A });
    await rows(`select public.ops_stock_release('33333333-0000-0000-0000-00000000000a')`);
    /* Substituted: a different Unit now answers the same line. */
    const drawn = await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000b", lineId: LINE_A });
    expect(drawn).toBe("33333333-0000-0000-0000-00000000000b");
    expect((await rows<{ r: number }>(`select public.so_line_remaining_requirement('${LINE_A}', null) as r`))[0].r).toBe(0);
  });

  it("clears the binding when a reassign moves the reference without a line", async () => {
    await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000a", lineId: LINE_A });
    await rows(
      `select public.ops_stock_reassign('33333333-0000-0000-0000-00000000000a', 'SO-1207')`,
    );
    const [unit] = await rows<{ reserved_ref: string; reserved_order_line_id: string | null }>(
      `select reserved_ref, reserved_order_line_id from public.ops_stock_items
        where id = '33333333-0000-0000-0000-00000000000a'`,
    );
    expect(unit.reserved_ref).toBe("SO-1207");
    expect(unit.reserved_order_line_id).toBeNull();
    /* The line the goods LEFT owes again. */
    expect((await rows<{ r: number }>(`select public.so_line_remaining_requirement('${LINE_A}', null) as r`))[0].r).toBe(1);
  });

  /** A delivered requirement must NOT come back as something to buy. */
  it("keeps the binding through the sale", async () => {
    await draw({ ref: "SO-1251", itemId: "33333333-0000-0000-0000-00000000000a", lineId: LINE_A });
    await db.exec(
      `update public.ops_stock_items set status = 'sold', sold_order_id = '${ORDER}'
        where id = '33333333-0000-0000-0000-00000000000a'`,
    );
    expect((await rows<{ r: number }>(`select public.so_line_remaining_requirement('${LINE_A}', null) as r`))[0].r).toBe(0);
  });
});

/* ─── THE ONE-TIME BACKFILL ─────────────────────────────────────────────── */

describe("the backfill binds only what cannot be wrong", () => {
  it("binds a reservation whose order has exactly one matching line", async () => {
    await db.exec(
      `update public.ops_stock_items set status = 'reserved', reserved_ref = 'SO-1207'
        where id = '33333333-0000-0000-0000-000000000010'`,
    );
    await db.exec(backfillStatement());
    const [unit] = await rows<{ reserved_order_line_id: string | null }>(
      `select reserved_order_line_id from public.ops_stock_items
        where id = '33333333-0000-0000-0000-000000000010'`,
    );
    expect(unit.reserved_order_line_id).toBe(OTHER_LINE);
  });

  it("leaves an ambiguous reservation unbound rather than guessing", async () => {
    await db.exec(
      `update public.ops_stock_items set status = 'reserved', reserved_ref = 'SO-1251'
        where id = '33333333-0000-0000-0000-00000000000a'`,
    );
    await db.exec(backfillStatement());
    const [unit] = await rows<{ reserved_order_line_id: string | null }>(
      `select reserved_order_line_id from public.ops_stock_items
        where id = '33333333-0000-0000-0000-00000000000a'`,
    );
    expect(unit.reserved_order_line_id).toBeNull();
  });

  it("never binds a counted row", async () => {
    await db.exec(
      `update public.ops_stock_items set status = 'reserved', reserved_ref = 'SO-1207',
              sku = 'CODY-K'
        where id = '33333333-0000-0000-0000-00000000000e'`,
    );
    await db.exec(backfillStatement());
    const [unit] = await rows<{ reserved_order_line_id: string | null }>(
      `select reserved_order_line_id from public.ops_stock_items
        where id = '33333333-0000-0000-0000-00000000000e'`,
    );
    expect(unit.reserved_order_line_id).toBeNull();
  });
});

/* ─── THE KEY, IN THE DATABASE ──────────────────────────────────────────── */

describe("stock_match_key in SQL", () => {
  it("agrees with the TypeScript rule on the shapes the catalog uses", async () => {
    const [r] = await rows<Record<string, string>>(`
      select public.stock_match_key('CODY-Q') as a,
             public.stock_match_key('Hana LV622-MD/SC-1521-1(White)-King') as b,
             public.stock_match_key('Hana LV622-MD/SC-1521-1(White)-K') as c,
             public.stock_match_key('CODY-SK') as d,
             public.stock_match_key('CODY-K') as e,
             public.stock_match_key('5539-1A(LHF)') as f,
             public.stock_match_key('5539-1A(RHF)') as g,
             public.stock_match_key('MODEL-Queen2') as h,
             public.stock_match_key('1013Jager/Fab3-SuperSingle/ PC151-01') as i
    `);
    expect(r.a).toBe("cody|Q");
    expect(r.b).toBe(r.c);
    expect(r.d).not.toBe(r.e);
    expect(r.f).not.toBe(r.g);
    expect(r.h).toBe("modelqueen2");
    expect(r.i).toBe("1013jagerfab3pc15101|S");
  });
});
