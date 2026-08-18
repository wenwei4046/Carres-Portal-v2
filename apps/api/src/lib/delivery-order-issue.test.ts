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
import { attemptDeliveryOrderIssue, todayIsoMYT } from "./delivery-order-issue";

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

function makeSb(tables: Record<string, ReturnType<typeof tableMock>>) {
  return {
    from: vi.fn((t: string) => {
      const b = tables[t];
      if (!b) throw new Error(`unmocked table ${t}`);
      return b;
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

const ORDER_ID = "00000000-0000-0000-0000-00000000020a";
const MATTRESS = "mattress:FirmCare-K";
/** Monday 24 Aug 2026 — a working day, not on the Selangor calendar. */
const CONFIRMED_DATE = "2026-08-24";
const DO_NUMBER = docNumber({
  prefix: "DO",
  date: todayIsoMYT(),
  seed: ORDER_ID,
  digits: 4,
});

function tables(over?: {
  doNumber?: string | null;
  control?: Record<string, unknown> | null;
  financeExceptions?: Array<Record<string, unknown>>;
  afterUpdate?: Result;
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
          paid: 0, // owing in full — decision A: a balance never blocks
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
    order_finance_exceptions: tableMock({
      data: over?.financeExceptions ?? [],
      error: null,
    }),
  };
}

describe("attemptDeliveryOrderIssue — the one issuing path", () => {
  it("issues when every requirement is met — over an outstanding balance, with the LOCKED scheme", async () => {
    const t = tables();
    const sb = makeSb(t);
    const attempt = await attemptDeliveryOrderIssue(sb, ORDER_ID);
    expect(attempt).toEqual({ outcome: "issued", doNumber: DO_NUMBER });
    expect(attempt.outcome === "issued" && attempt.doNumber).toMatch(
      /^DO-\d{6}-\d{4}$/,
    );
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
    ).toContain("has not confirmed a delivery date");
    expect(t.orders.update).not.toHaveBeenCalled();
  });

  it("an OPEN Finance exception blocks — the ONE money blocker (decision A)", async () => {
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
          data: { id: ORDER_ID, so: 1234, paid: 0, do_number: null },
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
