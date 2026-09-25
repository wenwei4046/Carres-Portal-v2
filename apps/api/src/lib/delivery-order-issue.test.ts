/**
 * SLICE 2 — `attemptDeliveryOrderIssue`, the ONE issuing path.
 *
 * The manual POST door, booking confirm, stock reserve and finance clear all
 * call this; these tests pin the behaviours the plan card says automation MUST
 * NOT break: the gate verifies the same facts, the mint is idempotent at the
 * database, the number is the LOCKED scheme, and a blocked order issues
 * nothing while naming what is still open.
 */
import { describe, it, expect, vi } from "vitest";
import { docNumber, orderActionDone } from "@carres/shared";
import { attemptDeliveryOrderIssue, attemptLegDocumentIssue, todayIsoMYT } from "./delivery-order-issue";

type Result = { data: unknown; error: unknown };

function tableMock(read: Result) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    is: vi.fn(() => b),
    maybeSingle: vi.fn().mockResolvedValue(read),
    single: vi.fn().mockResolvedValue(read),
    then: (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(read).then(res, rej),
  };
  return b;
}

/** `orders` answers the pre-read, then the UPDATE's own `.select()` — two
 *  different rows, which is the whole point of the mint. */
function ordersMock(read: Result, afterUpdate: Result) {
  let updated = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    is: vi.fn(() => b),
    update: vi.fn(() => {
      updated = true;
      return b;
    }),
    maybeSingle: vi.fn(() => Promise.resolve(updated ? afterUpdate : read)),
    then: (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(updated ? afterUpdate : read).then(res, rej),
  };
  return b;
}

/** The database's one allocator (0575) answers `delivery_document_number_draw`
 *  with the next number in `drawn`; every other RPC answers null. */
function makeSb(tables: Record<string, ReturnType<typeof tableMock>>, drawn: string[] = [DO_NUMBER]) {
  const queue = [...drawn];
  return {
    from: vi.fn((t: string) => {
      const b = tables[t];
      if (!b) throw new Error(`unmocked table ${t}`);
      return b;
    }),
    rpc: vi.fn(
      (fn: string): Promise<{ data: unknown; error: unknown }> =>
        Promise.resolve(
          fn === "delivery_document_number_draw"
            ? { data: queue.shift() ?? null, error: null }
            : { data: null, error: null },
        ),
    ),
  };
}

const ORDER_ID = "00000000-0000-0000-0000-00000000020a";
const MATTRESS = "mattress:FirmCare-K";
/** Monday 24 Aug 2026 — a working day, not on the Selangor calendar. */
const CONFIRMED_DATE = "2026-08-24";
/** What the allocator hands back in these tests (owner form 2026-09-23). */
const DO_NUMBER = "DO2609-4827";

function tables(over?: {
  doNumber?: string | null;
  /** `orders.paid`. Default = paid in full (the 2026-08-19 ruling: money in
   *  full before delivery is the only default door). */
  paid?: number;
  control?: Record<string, unknown> | null;
  financeExceptions?: Array<Record<string, unknown>>;
  paymentApprovals?: Array<Record<string, unknown>>;
  afterUpdate?: Result;
  /** Numbers already on the order's DOCUMENT rows (0356) — the repeat-letter
   *  input: a voided or failed document keeps its number forever, so a
   *  same-day re-issue must step to -B rather than resurrect it. */
  existingDocuments?: string[];
}) {
  const control =
    over?.control === null
      ? null
      : {
          line_received: { [MATTRESS]: 1 },
          balance: null,
          booking_stage: "confirmed",
          confirmed_date: CONFIRMED_DATE,
          confirmed_time_slot: "Afternoon (12pm–3pm)",
          booking_groups: null,
          ...(over?.control ?? {}),
        };
  return {
    orders: ordersMock(
      {
        data: {
          id: ORDER_ID,
          so: 1234,
          paid: over?.paid ?? 2500, // paid in full unless a test says otherwise
          do_number: over?.doNumber ?? null,
        },
        error: null,
      },
      over?.afterUpdate ?? {
        data: { id: ORDER_ID, do_number: DO_NUMBER },
        error: null,
      },
    ),
    order_lines: tableMock({
      data: [{ sku: MATTRESS, qty: 1, unit_price: 2500 }],
      error: null,
    }),
    order_addons: tableMock({ data: [], error: null }),
    ops_order_control: tableMock({ data: control, error: null }),
    ops_stock_items: tableMock({ data: [], error: null }),
    // Gate convergence (2026-09-07): the feeder reads the SO's storage papers.
    invoices: tableMock({ data: [], error: null }),
    order_finance_exceptions: tableMock({
      data: over?.financeExceptions ?? [],
      error: null,
    }),
    order_delivery_payment_approvals: tableMock({
      data: over?.paymentApprovals ?? [],
      error: null,
    }),
    ops_delivery_orders: tableMock({
      data: (over?.existingDocuments ?? []).map((n) => ({ do_number: n })),
      error: null,
    }),
  };
}

const APPROVED_ROW = {
  id: "00000000-0000-0000-0000-0000000ba00d",
  status: "approved",
  request_reason: "Outstation — partner schedules the customer",
  requested_at: "2026-08-19T02:00:00Z",
  decided_at: "2026-08-19T03:00:00Z",
  decision_reason: "COD by online transfer before unloading",
};

describe("attemptDeliveryOrderIssue — the one issuing path", () => {
  it("two different orders issued the same day never share a number — the P0 on 855c305c4", async () => {
    // Find two order ids the OLD scheme (DO-DDMMYY + FNV(order id) mod 10^4)
    // gave the same number today. The unfixed module issued both of them that
    // same number; the allocator must hand each its own.
    const oldNumber = (id: string) => docNumber({ prefix: "DO", date: todayIsoMYT(), seed: id, digits: 4 });
    const seen = new Map<string, string>();
    let pair: [string, string] | null = null;
    for (let i = 0; i < 100000 && !pair; i++) {
      const id = `00000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`;
      const n = oldNumber(id);
      const other = seen.get(n);
      if (other) pair = [other, id];
      else seen.set(n, id);
    }
    expect(pair).not.toBeNull();
    const [first, second] = pair!;
    const issued: string[] = [];
    for (const id of [first, second]) {
      const t = tables();
      t.orders = ordersMock(
        { data: { id, so: 1234, paid: 2500, do_number: null }, error: null },
        { data: { id, do_number: "(set below)" }, error: null },
      );
      const sb = makeSb(t, [id === first ? "DO2609-0001" : "DO2609-0002"]);
      const attempt = await attemptDeliveryOrderIssue(sb, id);
      expect(attempt.outcome).toBe("issued");
      if (attempt.outcome === "issued") issued.push(attempt.doNumber);
      expect(sb.rpc).toHaveBeenCalledWith("delivery_document_number_draw", { p_order_id: id });
    }
    expect(issued[0]).not.toBe(issued[1]);
  });

  it("a re-issue after a void is a NEW document with a NEW number — no repeat letter", async () => {
    const t = tables({ existingDocuments: ["DO2609-1111"] });
    const sb = makeSb(t, ["DO2609-2222"]);
    const attempt = await attemptDeliveryOrderIssue(sb, ORDER_ID);
    expect(attempt).toEqual({ outcome: "issued", doNumber: "DO2609-2222" });
    expect(t.orders.update).toHaveBeenCalledWith({ do_number: "DO2609-2222" });
  });

  it("a failed draw issues nothing and reports the error — never a made-up number", async () => {
    const t = tables();
    const sb = makeSb(t, []);
    const attempt = await attemptDeliveryOrderIssue(sb, ORDER_ID);
    expect(attempt.outcome).toBe("error");
    expect(t.orders.update).not.toHaveBeenCalled();
  });

  it("issues when every requirement is met — paid in full, with the number the allocator drew", async () => {
    const t = tables();
    const sb = makeSb(t);
    const attempt = await attemptDeliveryOrderIssue(sb, ORDER_ID);
    expect(attempt).toEqual({ outcome: "issued", doNumber: DO_NUMBER });
    expect(sb.rpc).toHaveBeenCalledWith("delivery_document_number_draw", { p_order_id: ORDER_ID });
    // Idempotent at the DATABASE: the mint writes only into an empty column.
    expect(t.orders.update).toHaveBeenCalledWith({ do_number: DO_NUMBER });
    expect(t.orders.is).toHaveBeenCalledWith("do_number", null);
  });

  it("records the issue on the order's own timeline, in the dictionary's words", async () => {
    const sb = makeSb(tables());
    await attemptDeliveryOrderIssue(sb, ORDER_ID);
    expect(sb.rpc).toHaveBeenCalledWith(
      "operation_add_annotation",
      expect.objectContaining({
        p_order_id: ORDER_ID,
        p_content: `${orderActionDone("issue_delivery_order")} — ${DO_NUMBER}`,
      }),
    );
  });

  it("an order already carrying its number gets that number back and mints nothing", async () => {
    const t = tables({ doNumber: "DO-240826-4821" });
    const sb = makeSb(t);
    const attempt = await attemptDeliveryOrderIssue(sb, ORDER_ID);
    expect(attempt).toEqual({ outcome: "already", doNumber: "DO-240826-4821" });
    expect(t.orders.update).not.toHaveBeenCalled();
  });

  it("a non-qualifying order issues nothing and states which requirement is still open", async () => {
    const t = tables({ control: null }); // no booking at all
    const sb = makeSb(t);
    const attempt = await attemptDeliveryOrderIssue(sb, ORDER_ID);
    expect(attempt.outcome).toBe("blocked");
    expect(
      attempt.outcome === "blocked" && attempt.reasons.join(" "),
    ).toContain("has no scheduled date yet");
    expect(t.orders.update).not.toHaveBeenCalled();
  });

  it("an outstanding balance blocks with no approval — the 2026-08-19 money gate", async () => {
    const t = tables({ paid: 0 });
    const sb = makeSb(t);
    const attempt = await attemptDeliveryOrderIssue(sb, ORDER_ID);
    expect(attempt.outcome).toBe("blocked");
    expect(
      attempt.outcome === "blocked" && attempt.reasons.join(" "),
    ).toContain("still outstanding");
    expect(t.orders.update).not.toHaveBeenCalled();
  });

  it("an APPROVED Delivery Payment Approval opens the money gate — COD issues the paper", async () => {
    const t = tables({ paid: 0, paymentApprovals: [APPROVED_ROW] });
    const sb = makeSb(t);
    const attempt = await attemptDeliveryOrderIssue(sb, ORDER_ID);
    expect(attempt).toEqual({ outcome: "issued", doNumber: DO_NUMBER });
  });

  it("a PENDING request keeps the gate shut — raising changes no gate", async () => {
    const t = tables({
      paid: 0,
      paymentApprovals: [
        { ...APPROVED_ROW, status: "pending", decided_at: null, decision_reason: null },
      ],
    });
    const sb = makeSb(t);
    const attempt = await attemptDeliveryOrderIssue(sb, ORDER_ID);
    expect(attempt.outcome).toBe("blocked");
    expect(
      attempt.outcome === "blocked" && attempt.reasons.join(" "),
    ).toContain("waiting for the approver");
  });

  // Outstation (card §5): goods ready and money in, but the partner has not
  // scheduled the customer yet — no confirmed booking exists.
  const OUTSTATION = {
    booking_stage: "proposed",
    confirmed_date: null,
    confirmed_time_slot: null,
  };

  it("the Request Delivery Order door issues without a confirmed booking — same gates otherwise", async () => {
    const blocked = await attemptDeliveryOrderIssue(
      makeSb(tables({ control: OUTSTATION })),
      ORDER_ID,
    );
    expect(blocked.outcome).toBe("blocked");

    const t2 = tables({ control: OUTSTATION });
    const requested = await attemptDeliveryOrderIssue(makeSb(t2), ORDER_ID, {
      waitBookingConfirm: false,
    });
    expect(requested).toEqual({ outcome: "issued", doNumber: DO_NUMBER });
  });

  it("the Request Delivery Order door still refuses money — it is not a bypass", async () => {
    const t = tables({ control: OUTSTATION, paid: 0 });
    const sb = makeSb(t);
    const attempt = await attemptDeliveryOrderIssue(sb, ORDER_ID, {
      waitBookingConfirm: false,
    });
    expect(attempt.outcome).toBe("blocked");
    expect(
      attempt.outcome === "blocked" && attempt.reasons.join(" "),
    ).toContain("still outstanding");
    expect(t.orders.update).not.toHaveBeenCalled();
  });

  it("an OPEN Finance exception blocks a fully-paid order — the second blocker (0355 unchanged)", async () => {
    const t = tables({
      financeExceptions: [
        {
          id: "00000000-0000-0000-0000-0000000fe00e",
          status: "open",
          reason: "Chargeback under investigation",
          opened_at: "2026-08-16T02:00:00Z",
          cleared_at: null,
          clear_evidence: null,
        },
      ],
    });
    const sb = makeSb(t);
    const attempt = await attemptDeliveryOrderIssue(sb, ORDER_ID);
    expect(attempt.outcome).toBe("blocked");
    expect(
      attempt.outcome === "blocked" && attempt.reasons.join(" "),
    ).toContain("Finance is holding this delivery");
    expect(t.orders.update).not.toHaveBeenCalled();
  });

  it("two callers arriving at the same moment cannot make two documents — the loser re-reads the winner's", async () => {
    // The idempotent UPDATE matched no row (someone else minted first): the
    // attempt re-reads and hands back the winner's number as `already`.
    const t = tables({
      afterUpdate: {
        data: null,
        error: null,
      },
    });
    // After the update "misses", the re-read must return the winner's row.
    let calls = 0;
    t.orders.maybeSingle = vi.fn(() => {
      calls += 1;
      // 1st call: the pre-read (no number). 2nd: the post-update maybeSingle
      // (null = lost the race). 3rd: the re-read (the winner's number).
      if (calls === 1)
        return Promise.resolve({
          data: { id: ORDER_ID, so: 1234, paid: 2500, do_number: null },
          error: null,
        });
      if (calls === 2) return Promise.resolve({ data: null, error: null });
      return Promise.resolve({
        data: { id: ORDER_ID, do_number: "DO-170826-9999" },
        error: null,
      });
    });
    const sb = makeSb(t);
    const attempt = await attemptDeliveryOrderIssue(sb, ORDER_ID);
    expect(attempt).toEqual({ outcome: "already", doNumber: "DO-170826-9999" });
  });
});

describe("attemptLegDocumentIssue — a Journey leg's own document (0491)", () => {
  const STOPS = [
    { leg: 1, partner_id: "p-teow", partner_name: "TEOW", from_loc: "Klang WH", to_loc: "JB transit", status: "pending" },
    { leg: 2, partner_id: "p-ssy", partner_name: "SSY", from_loc: "JB transit", to_loc: "Singapore customer", status: "pending" },
  ];
  const LEG_DO = "DO2609-0761";
  function legTables(over?: {
    stops?: unknown[] | null;
    arrangement?: Record<string, unknown> | null;
    existing?: Array<{ do_number: string; leg: number; voided_at: string | null }>;
    paid?: number;
  }) {
    const t: Record<string, ReturnType<typeof tableMock>> = tables({ paid: over?.paid });
    t.orders = ordersMock(
      { data: { id: ORDER_ID, so: 1234, paid: over?.paid ?? 2500, do_number: null, delivery_stops: over?.stops === undefined ? STOPS : over.stops }, error: null },
      { data: { id: ORDER_ID, do_number: LEG_DO }, error: null },
    );
    t.ops_delivery_arrangements = tableMock({
      data:
        over?.arrangement === null
          ? null
          : { partner_id: "p-teow", partner_name: { name: "TEOW" }, confirmed_date: CONFIRMED_DATE, confirmed_time: "Morning (9am–12pm)", ...(over?.arrangement ?? {}) },
      error: null,
    });
    t.ops_delivery_orders = tableMock({ data: over?.existing ?? [], error: null });
    return t;
  }

  it("issues the leg's document through the governed mint, with a number the allocator drew", async () => {
    const sb = makeSb(legTables());
    sb.rpc = vi.fn((fn: string) =>
      Promise.resolve(
        fn === "delivery_document_number_draw"
          ? { data: LEG_DO, error: null }
          : { data: { do_number: LEG_DO, leg: 1 }, error: null },
      ),
    );
    const out = await attemptLegDocumentIssue(sb, ORDER_ID, 1);
    expect(out).toEqual({ outcome: "issued", doNumber: LEG_DO });
    expect(sb.rpc).toHaveBeenCalledWith("delivery_document_number_draw", { p_order_id: ORDER_ID });
    expect(sb.rpc).toHaveBeenCalledWith("delivery_leg_document_mint", { p_order_id: ORDER_ID, p_leg: 1, p_do_number: LEG_DO });
  });

  it("a leg that is not on the order's Journey issues nothing", async () => {
    const sb = makeSb(legTables({ stops: null }));
    const out = await attemptLegDocumentIssue(sb, ORDER_ID, 1);
    expect(out.outcome).toBe("blocked");
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("a leg without its partner or its agreed day is not ready — the reasons name what is open", async () => {
    const sb = makeSb(legTables({ arrangement: { partner_id: null, confirmed_date: null } }));
    const out = await attemptLegDocumentIssue(sb, ORDER_ID, 1);
    expect(out).toEqual({ outcome: "blocked", reasons: ["Assign logistics for this leg", "Confirm the delivery date for this leg"] });
  });

  it("the order's money gate still holds for a leg — an owing order issues no leg paper", async () => {
    const sb = makeSb(legTables({ paid: 0 }));
    const out = await attemptLegDocumentIssue(sb, ORDER_ID, 1);
    expect(out.outcome).toBe("blocked");
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("a live document for the leg is returned, never re-minted", async () => {
    const sb = makeSb(legTables({ existing: [{ do_number: "DO-010926-0001", leg: 1, voided_at: null }] }));
    const out = await attemptLegDocumentIssue(sb, ORDER_ID, 1);
    expect(out).toEqual({ outcome: "already", doNumber: "DO-010926-0001" });
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});


describe("attemptDeliveryOrderIssue — a split trip's own document (0542)", () => {
  it("a booking that names its groups mints through the trip door, never the order column", async () => {
    const t = tables({ control: { booking_groups: ["bed"] } });
    const sb = makeSb(t);
    sb.rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === "delivery_trip_document_mint"
          ? { data: { do_number: DO_NUMBER, trip: 2 }, error: null }
          : fn === "delivery_document_number_draw"
            ? { data: DO_NUMBER, error: null }
            : { data: null, error: null },
      ),
    );
    const attempt = await attemptDeliveryOrderIssue(sb, ORDER_ID);
    expect(attempt).toEqual({ outcome: "issued", doNumber: DO_NUMBER });
    expect(sb.rpc).toHaveBeenCalledWith("delivery_trip_document_mint", {
      p_order_id: ORDER_ID,
      p_do_number: DO_NUMBER,
    });
    expect(t.orders.update).not.toHaveBeenCalled();
  });
});
