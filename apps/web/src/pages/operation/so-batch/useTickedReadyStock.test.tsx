import { useCallback, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReadyStockResponse, ReadyStockUnit, SoBatchOrderRow } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useTickedReadyStock, type TickedLine } from "./useTickedReadyStock";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async () => ({ ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"), apiFetch: api }));

/**
 * `USE STOCK` ON THE SELECTION BAR (owner 13 Oct 2026, round 3; Purchasing
 * MASTER §9.1). The hook reads Ready Stock for the Sales Orders of the ticked
 * lines only, counts the ticked lines that have a free Unit, and reserves the
 * suggested Units through the existing reservation door on one press.
 * Every name below is TEST data.
 */
const LINE = "22222222-2222-4222-8222-222222222222";
const LINE_2 = "44444444-4444-4444-8444-444444444444";
const LINE_3 = "66666666-6666-4666-8666-666666666666";
const UNIT = "33333333-3333-4333-8333-333333333333";
const UNIT_2 = "55555555-5555-4555-8555-555555555555";
const RESERVE = "/api/operation/purchase/demands/ready-stock/reserve";
const readUrl = (orderId: string) => `/api/operation/purchase/demands/${orderId}/ready-stock`;

type OrderFacts = Pick<SoBatchOrderRow, "requestedDeliveryDate" | "proceededAt">;
const ORDERS: Record<string, OrderFacts> = {
  o1: { proceededAt: "2026-09-01", requestedDeliveryDate: "2026-10-12" },
  o2: { proceededAt: "2026-09-02", requestedDeliveryDate: "2026-10-05" },
};

const unit = (itemId: string, lineIds: string[], over: Partial<ReadyStockUnit> = {}): ReadyStockUnit => ({
  itemId, unitCode: `U-${itemId.slice(0, 4)}`, identityScope: "unit", sku: "A", condition: "new",
  siteName: "Carres Klang", warehouseId: "klang", holderName: null, ownership: "carres_owned", supplier: null,
  qty: 1, dateIn: "2026-09-01", matchingLineIds: lineIds, blocked: null, reservedForLineId: null, ...over,
});
const stockLine = (orderLineId: string, remainingQty = 1): ReadyStockResponse["lines"][number] => ({
  orderLineId, sku: "A", item: "A", qty: 1, reservedQty: 1 - remainingQty, reservedUnitCodes: [], onPoQty: 0, remainingQty,
});
/** One Sales Order's read: its item lines and the Units on the shelf. */
function stock(orderId: string, lineIds: string[], units: ReadyStockUnit[]): ReadyStockResponse {
  return { orderId, so: 1, reference: "SO-1", lines: lineIds.map((id) => stockLine(id)), units };
}
const tick = (demandId: string, orderId: string, orderLineIds: string[]): TickedLine => ({ demandId, orderId, orderLineIds });
const O1_TICK = [tick("d1", "o1", [LINE])];

const events: string[] = [];
const changed = vi.fn();
/**
 * The page's half of the contract: `onReserved` drops the ticks standing on
 * the answered item lines BEFORE the write goes out. `keepTicks` leaves them,
 * to read the hook on its own.
 */
function Harness({ initial, priority, keepTicks = false }: { initial: TickedLine[]; priority?: "customer_delivery" | "proceed_date"; keepTicks?: boolean }) {
  const [ticked, setTicked] = useState<TickedLine[]>(initial);
  /* `result` is the Units reserved by a press that finished; a press that
     stopped early is `null`, with what it held before stopping in `held`. */
  const [result, setResult] = useState<number | null | "not pressed">("not pressed");
  const [held, setHeld] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const orderOf = useCallback((orderId: string) => ORDERS[orderId], []);
  const onReserved = useCallback((orderId: string, orderLineIds: readonly string[]) => {
    events.push(`reserved:${orderId}:${orderLineIds.join("+")}`);
    changed(orderId, orderLineIds);
    if (!keepTicks) setTicked((prev) => prev.filter((line) => !(line.orderId === orderId && line.orderLineIds.some((id) => orderLineIds.includes(id)))));
  }, [keepTicks]);
  const model = useTickedReadyStock({ ticked, orderOf, priority, onReserved });
  return (
    <>
      <button onClick={() => void model.use().then((outcome) => {
        setResult(outcome == null || outcome.failed ? null : outcome.reserved);
        setHeld(outcome?.reserved ?? null); setFailed(outcome?.failed ?? null);
      })}>Use</button>
      <button onClick={() => setTicked([])}>Untick</button>
      <button onClick={() => setTicked(initial)}>Tick again</button>
      <output data-testid="state">{JSON.stringify({ lines: model.lines, units: model.units, busy: model.busy, error: model.error, result, held, failed, ticked: ticked.length })}</output>
    </>
  );
}
function draw(initial: TickedLine[], options: { priority?: "customer_delivery" | "proceed_date"; keepTicks?: boolean } = {}) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Harness initial={initial} {...options} />
    </QueryClientProvider>,
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent!) as {
  lines: number; units: number; busy: boolean; error: boolean; result: number | null | "not pressed"; held: number | null; failed: string | null; ticked: number;
};
const isPost = (options: unknown) => (options as { method?: string } | undefined)?.method === "POST";
const reads = () => api.mock.calls.filter(([, options]) => !isPost(options)).map(([path]) => String(path));
const posts = () => api.mock.calls.filter(([, options]) => isPost(options))
  .map(([path, options]) => [String(path), JSON.parse((options as { body: string }).body)] as const);
/** Lets reads land: React Query tells its observers on a timer. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
const orderIdOf = (path: unknown) => /\/demands\/([^/]+)\/ready-stock$/.exec(String(path))?.[1] ?? "";
/** Answers each Sales Order's read, and the reservation door. */
function answer(shelf: Record<string, ReadyStockResponse>, reserve?: (body: { orderId: string; picks: Array<{ itemId: string; orderLineId: string }> }) => unknown) {
  api.mockImplementation(async (path: unknown, options?: { method?: string; body?: string }) => {
    if (options?.method === "POST") {
      const body = JSON.parse(options.body!);
      events.push(`post:${body.orderId}`);
      return reserve ? reserve(body) : { reserved: body.picks.length, reference: "SO-1", units: body.picks };
    }
    const orderId = orderIdOf(path);
    events.push(`read:${orderId}`);
    return shelf[orderId] ?? stock(orderId, [], []);
  });
}

beforeEach(() => { api.mockReset(); changed.mockClear(); events.length = 0; });

describe("reading", () => {
  it("reads nothing while nothing is ticked", async () => {
    answer({ o1: stock("o1", [LINE], [unit(UNIT, [LINE])]) });
    draw([]);
    await settle();
    expect(api).not.toHaveBeenCalled();
    expect(state()).toMatchObject({ lines: 0, units: 0, busy: false, error: false });
  });

  it("reads the Sales Orders of the ticked lines only, each once, and reserves nothing", async () => {
    answer({ o1: stock("o1", [LINE], [unit(UNIT, [LINE])]), o2: stock("o2", [LINE_2], [unit(UNIT_2, [LINE_2])]) });
    /* Two ticked demand lines of one Sales Order are one read. */
    draw([tick("d1", "o1", [LINE]), tick("d1b", "o1", [LINE_3])]);
    await waitFor(() => expect(state().lines).toBe(1));
    await settle();
    expect(reads()).toEqual([readUrl("o1")]);
    expect(posts()).toEqual([]);
    expect(changed).not.toHaveBeenCalled();
  });

  it("stops offering when the ticks are taken off", async () => {
    answer({ o1: stock("o1", [LINE], [unit(UNIT, [LINE])]) });
    draw(O1_TICK);
    await waitFor(() => expect(state().lines).toBe(1));
    fireEvent.click(screen.getByText("Untick"));
    expect(state()).toMatchObject({ lines: 0, units: 0 });
    fireEvent.click(screen.getByText("Use"));
    await settle();
    expect(posts()).toEqual([]);
    expect(state().result).toBeNull();
  });

  it("a read that answers for another Sales Order is never stock", async () => {
    answer({ o1: stock("o9", [LINE], [unit(UNIT, [LINE])]) });
    draw(O1_TICK);
    await waitFor(() => expect(reads()).toEqual([readUrl("o1")]));
    await settle();
    expect(state()).toMatchObject({ lines: 0, units: 0 });
  });

  it("releases the reads at most five Sales Orders at a time", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `o${String(i + 1).padStart(2, "0")}`);
    const waiting: Array<() => void> = [];
    api.mockImplementation((path: unknown) => new Promise((resolve) => {
      waiting.push(() => resolve(stock(orderIdOf(path), [], [])));
    }));
    draw(ids.map((orderId) => tick(`d-${orderId}`, orderId, [`${orderId}-line`])));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(5));
    await settle();
    /* Five are out and none has answered: no sixth is asked. */
    expect(reads()).toEqual(ids.slice(0, 5).map(readUrl));
    await act(async () => { waiting.splice(0).forEach((release) => release()); });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(10));
    await settle();
    expect(reads()).toEqual(ids.slice(0, 10).map(readUrl));
    await act(async () => { waiting.splice(0).forEach((release) => release()); });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(12));
    await act(async () => { waiting.splice(0).forEach((release) => release()); });
    await settle();
    expect(reads()).toEqual(ids.map(readUrl));
    expect(posts()).toEqual([]);
  });
});

describe("`lines` counts the ticked demand lines that have a free Unit", () => {
  it("counts a ticked line with a Unit and not the one without", async () => {
    answer({ o1: stock("o1", [LINE, LINE_3], [unit(UNIT, [LINE])]), o2: stock("o2", [LINE_2], []) });
    draw([tick("d1", "o1", [LINE]), tick("d2", "o1", [LINE_3]), tick("d3", "o2", [LINE_2])]);
    await waitFor(() => expect(state().lines).toBe(1));
    await settle();
    expect(state()).toMatchObject({ lines: 1, units: 1 });
  });

  it("a set ticked once is one line, however many Units answer its item lines", async () => {
    answer({ o1: stock("o1", [LINE, LINE_3], [unit(UNIT, [LINE]), unit(UNIT_2, [LINE_3])]) });
    draw([tick("d-set", "o1", [LINE, LINE_3])]);
    await waitFor(() => expect(state().units).toBe(2));
    expect(state().lines).toBe(1);
  });

  it("a Unit for an item line nobody ticked is not offered", async () => {
    answer({ o1: stock("o1", [LINE, LINE_3], [unit(UNIT, [LINE]), unit(UNIT_2, [LINE_3])]) });
    draw(O1_TICK, { keepTicks: true });
    await waitFor(() => expect(state().lines).toBe(1));
    expect(state().units).toBe(1);
    fireEvent.click(screen.getByText("Use"));
    await waitFor(() => expect(state().result).toBe(1));
    expect(posts()).toEqual([[RESERVE, { orderId: "o1", picks: [{ itemId: UNIT, orderLineId: LINE }] }]]);
  });

  it.each([
    ["already reserved", { reservedForLineId: LINE }],
    ["the supplier's", { ownership: "supplier_consignment", blocked: "supplier_owned" }],
    ["counted stock, not an exact Unit", { identityScope: "quantity", qty: 5, blocked: "counted_stock" }],
    ["at another site", { siteName: "TEST Showroom", warehouseId: "showroom" }],
  ] as Array<[string, Partial<ReadyStockUnit>]>)("a Unit that is %s is not a free Unit", async (_name, over) => {
    /* A free Klang Unit for another line fixes where the shelf is. */
    answer({ o1: stock("o1", [LINE, LINE_3], [unit(UNIT, [LINE], over), unit(UNIT_2, [LINE_3])]) });
    draw(O1_TICK);
    await waitFor(() => expect(reads()).toEqual([readUrl("o1")]));
    await settle();
    expect(state()).toMatchObject({ lines: 0, units: 0 });
  });

  it("an already-covered order's `no line needs it` is not a conflict about the Unit", async () => {
    /* o2 needs nothing, so its read marks the very same Unit `no_line_needs_it`.
       That is about o2, not about the Unit: o1 may still take it. */
    const covered = stock("o2", [LINE_2], [unit(UNIT, [], { blocked: "no_line_needs_it" })]);
    covered.lines[0]!.remainingQty = 0;
    answer({ o1: stock("o1", [LINE], [unit(UNIT, [LINE])]), o2: covered });
    draw([tick("d1", "o1", [LINE]), tick("d2", "o2", [LINE_2])]);
    await waitFor(() => expect(state().lines).toBe(1));
    await settle();
    expect(state()).toMatchObject({ lines: 1, units: 1, error: false });
  });

  it("two reads that disagree about one Unit offer nothing: stale evidence is never stock", async () => {
    answer({
      o1: stock("o1", [LINE], [unit(UNIT, [LINE])]),
      o2: stock("o2", [LINE_2], [unit(UNIT, [LINE_2], { condition: "exhibition" })]),
    });
    draw([tick("d1", "o1", [LINE]), tick("d2", "o2", [LINE_2])]);
    await waitFor(() => expect(reads()).toHaveLength(2));
    await settle();
    expect(state()).toMatchObject({ lines: 0, units: 0 });
    fireEvent.click(screen.getByText("Use"));
    await settle();
    expect(posts()).toEqual([]);
  });
});

describe("scarce stock goes by the configured priority", () => {
  /* ONE Unit, and both Sales Orders could take it. o1 was proceeded first;
     o2's customer wants the goods sooner. */
  const scarce = () => answer({
    o1: stock("o1", [LINE], [unit(UNIT, [LINE])]),
    o2: stock("o2", [LINE_2], [unit(UNIT, [LINE_2])]),
  });
  const both = [tick("d1", "o1", [LINE]), tick("d2", "o2", [LINE_2])];

  it("by default the order whose customer needs the goods soonest takes it", async () => {
    scarce();
    draw(both);
    await waitFor(() => expect(state().lines).toBe(1));
    await settle();
    expect(state()).toMatchObject({ lines: 1, units: 1 });
    fireEvent.click(screen.getByText("Use"));
    await waitFor(() => expect(state().result).toBe(1));
    expect(posts()).toEqual([[RESERVE, { orderId: "o2", picks: [{ itemId: UNIT, orderLineId: LINE_2 }] }]]);
  });

  it("with Proceed Date priority the order proceeded first takes it, whatever the customer dates", async () => {
    scarce();
    draw(both, { priority: "proceed_date" });
    await waitFor(() => expect(state().lines).toBe(1));
    await settle();
    fireEvent.click(screen.getByText("Use"));
    await waitFor(() => expect(state().result).toBe(1));
    expect(posts()).toEqual([[RESERVE, { orderId: "o1", picks: [{ itemId: UNIT, orderLineId: LINE }] }]]);
  });
});

describe("`use()` reserves through the existing reservation door", () => {
  it("POSTs the exact Units for the exact item lines once, and drops the ticks BEFORE the write", async () => {
    answer({ o1: stock("o1", [LINE], [unit(UNIT, [LINE])]) });
    draw(O1_TICK);
    await waitFor(() => expect(state().lines).toBe(1));
    events.length = 0;
    fireEvent.click(screen.getByText("Use"));
    await waitFor(() => expect(state().result).toBe(1));
    expect(posts()).toEqual([[RESERVE, { orderId: "o1", picks: [{ itemId: UNIT, orderLineId: LINE }] }]]);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledWith("o1", [LINE]);
    expect(events.slice(0, 2)).toEqual([`reserved:o1:${LINE}`, "post:o1"]);
    await settle();
    /* The tick is gone, so nothing is offered and nothing is sent again. */
    expect(state()).toMatchObject({ lines: 0, units: 0, busy: false, error: false, ticked: 0 });
    fireEvent.click(screen.getByText("Use"));
    await settle();
    expect(posts()).toHaveLength(1);
  });

  it("sends one Sales Order at a time and answers how many Units it reserved", async () => {
    answer({ o1: stock("o1", [LINE, LINE_3], [unit(UNIT, [LINE]), unit(UNIT_2, [LINE_3])]), o2: stock("o2", [LINE_2], [unit("77777777-7777-4777-8777-777777777777", [LINE_2])]) });
    draw([tick("d-set", "o1", [LINE, LINE_3]), tick("d2", "o2", [LINE_2])]);
    await waitFor(() => expect(state().units).toBe(3));
    expect(state().lines).toBe(2);
    fireEvent.click(screen.getByText("Use"));
    await waitFor(() => expect(state().result).toBe(3));
    expect(posts().map(([path, body]) => [path, body.orderId, body.picks.length])).toEqual([
      [RESERVE, "o2", 1],
      [RESERVE, "o1", 2],
    ]);
    expect(posts()[1]![1].picks).toEqual(expect.arrayContaining([
      { itemId: UNIT, orderLineId: LINE },
      { itemId: UNIT_2, orderLineId: LINE_3 },
    ]));
  });

  it("a second press while the first is out sends nothing more", async () => {
    let release: (value: unknown) => void = () => {};
    answer({ o1: stock("o1", [LINE], [unit(UNIT, [LINE])]) }, () => new Promise((resolve) => { release = resolve; }));
    draw(O1_TICK, { keepTicks: true });
    await waitFor(() => expect(state().lines).toBe(1));
    fireEvent.click(screen.getByText("Use"));
    await waitFor(() => expect(state().busy).toBe(true));
    fireEvent.click(screen.getByText("Use"));
    await settle();
    expect(posts()).toHaveLength(1);
    await act(async () => { release({ reserved: 1, reference: "SO-1", units: [{ itemId: UNIT, orderLineId: LINE }] }); });
    await waitFor(() => expect(state().busy).toBe(false));
    expect(posts()).toHaveLength(1);
  });

  it("a door that answers a different outcome than was asked is not a reservation", async () => {
    /* The door says 1 reserved but names another Unit; the order's own record
       does not hold the asked Unit either. */
    answer({ o1: stock("o1", [LINE], [unit(UNIT, [LINE])]) }, () => ({ reserved: 1, reference: "SO-1", units: [{ itemId: UNIT_2, orderLineId: LINE }] }));
    draw(O1_TICK);
    await waitFor(() => expect(state().lines).toBe(1));
    fireEvent.click(screen.getByText("Use"));
    await waitFor(() => expect(state().error).toBe(true));
    expect(state().result).toBeNull();
    expect(posts()).toHaveLength(1);
  });
});

describe("when the door refuses, or its answer is lost", () => {
  it("a 4xx refusal sets `error` and writes nothing more", async () => {
    answer({ o1: stock("o1", [LINE], [unit(UNIT, [LINE])]), o2: stock("o2", [LINE_2], [unit(UNIT_2, [LINE_2])]) },
      () => { throw new ApiError(409, "unit_no_longer_free", { code: "unit_no_longer_free" }); });
    draw([tick("d1", "o1", [LINE]), tick("d2", "o2", [LINE_2])]);
    await waitFor(() => expect(state().lines).toBe(2));
    fireEvent.click(screen.getByText("Use"));
    await waitFor(() => expect(state().error && !state().busy).toBe(true));
    expect(state().result).toBeNull();
    /* o2 goes first (its customer needs the goods sooner); it is refused, and
       o1 is never sent, so only o2's ticks were taken off for a write. */
    expect(posts()).toEqual([[RESERVE, { orderId: "o2", picks: [{ itemId: UNIT_2, orderLineId: LINE_2 }] }]]);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledWith("o2", [LINE_2]);
    await settle();
    expect(posts()).toHaveLength(1);
    expect(state().ticked).toBe(1);
    expect(state().failed).toBe("refused");
    expect(state().held).toBe(0);
    /* The band answers that press. A new tick is a new decision, so it goes. */
    fireEvent.click(screen.getByText("Tick again"));
    await waitFor(() => expect(state().error).toBe(false));
  });

  it("a refusal on a later Sales Order keeps what was already reserved and stops there", async () => {
    answer({ o1: stock("o1", [LINE], [unit(UNIT, [LINE])]), o2: stock("o2", [LINE_2], [unit(UNIT_2, [LINE_2])]) },
      (body) => {
        if (body.orderId === "o1") throw new ApiError(409, "unit_no_longer_free", {});
        return { reserved: 1, reference: "SO-1", units: body.picks };
      });
    draw([tick("d1", "o1", [LINE]), tick("d2", "o2", [LINE_2])]);
    await waitFor(() => expect(state().lines).toBe(2));
    fireEvent.click(screen.getByText("Use"));
    await waitFor(() => expect(state().error && !state().busy).toBe(true));
    expect(posts().map(([, body]) => body.orderId)).toEqual(["o2", "o1"]);
    await settle();
    expect(posts()).toHaveLength(2);
  });

  it("a lost response is not sent again: the order's own record is read back and must hold the Unit", async () => {
    let posted = false;
    api.mockImplementation(async (path: unknown, options?: { method?: string }) => {
      if (options?.method === "POST") { posted = true; throw new Error("response_lost"); }
      /* After the write, the record shows the Unit held for its line. */
      return stock(orderIdOf(path), [LINE], [unit(UNIT, posted ? [] : [LINE], { reservedForLineId: posted ? LINE : null })]);
    });
    draw(O1_TICK);
    await waitFor(() => expect(state().lines).toBe(1));
    fireEvent.click(screen.getByText("Use"));
    await waitFor(() => expect(state().result).toBe(1));
    expect(state()).toMatchObject({ error: false, busy: false });
    expect(posts()).toHaveLength(1);
    expect(reads().filter((path) => path === readUrl("o1")).length).toBeGreaterThanOrEqual(2);
  });

  it("a lost response whose read-back does not show the Unit is `error`, and still is not sent again", async () => {
    let posted = false;
    api.mockImplementation(async (path: unknown, options?: { method?: string }) => {
      if (options?.method === "POST") { posted = true; throw new Error("response_lost"); }
      return stock(orderIdOf(path), [LINE], [unit(UNIT, [LINE])]);
    });
    draw(O1_TICK);
    await waitFor(() => expect(state().lines).toBe(1));
    fireEvent.click(screen.getByText("Use"));
    await waitFor(() => expect(state().error && !state().busy).toBe(true));
    expect(posted).toBe(true);
    expect(state().result).toBeNull();
    expect(state().failed).toBe("unknown");
    expect(posts()).toHaveLength(1);
    /* The tick was dropped before the write, so a second press has nothing to send. */
    fireEvent.click(screen.getByText("Use"));
    await settle();
    expect(posts()).toHaveLength(1);
  });

  it("after an answer that could not be confirmed, that Sales Order offers nothing until its record is read again", async () => {
    let posted = false, readable = true;
    api.mockImplementation(async (path: unknown, options?: { method?: string }) => {
      if (options?.method === "POST") { posted = true; readable = false; throw new Error("response_lost"); }
      if (!readable) throw new Error("read_unavailable");
      /* Once it can be read again, the record shows the lost write DID hold the Unit. */
      return stock(orderIdOf(path), [LINE], [posted ? { ...unit(UNIT, []), reservedForLineId: LINE } : unit(UNIT, [LINE])]);
    });
    draw(O1_TICK);
    await waitFor(() => expect(state().lines).toBe(1));
    fireEvent.click(screen.getByText("Use"));
    await waitFor(() => expect(state().failed).toBe("unknown"));
    /* Ticked again while the record cannot be read: the reading taken BEFORE
       the write still names the Unit as free, and it is not offered from it. */
    fireEvent.click(screen.getByText("Tick again"));
    await settle();
    expect(state().lines).toBe(0);
    fireEvent.click(screen.getByText("Use"));
    await settle();
    expect(posts()).toHaveLength(1);
  });

  it("a lost response whose read-back cannot be read is `error`, never a guess", async () => {
    let posted = false;
    api.mockImplementation(async (path: unknown, options?: { method?: string }) => {
      if (options?.method === "POST") { posted = true; throw new Error("response_lost"); }
      if (posted) throw new Error("read_unavailable");
      return stock(orderIdOf(path), [LINE], [unit(UNIT, [LINE])]);
    });
    draw(O1_TICK);
    await waitFor(() => expect(state().lines).toBe(1));
    fireEvent.click(screen.getByText("Use"));
    await waitFor(() => expect(state().error && !state().busy).toBe(true));
    expect(state().result).toBeNull();
    expect(posts()).toHaveLength(1);
  });

  it("a server fault (5xx) is treated as a lost response, not as a refusal", async () => {
    let posted = false;
    api.mockImplementation(async (path: unknown, options?: { method?: string }) => {
      if (options?.method === "POST") { posted = true; throw new ApiError(502, "bad_gateway", {}); }
      return stock(orderIdOf(path), [LINE], [unit(UNIT, posted ? [] : [LINE], { reservedForLineId: posted ? LINE : null })]);
    });
    draw(O1_TICK);
    await waitFor(() => expect(state().lines).toBe(1));
    fireEvent.click(screen.getByText("Use"));
    await waitFor(() => expect(state().result).toBe(1));
    expect(state().error).toBe(false);
    expect(posts()).toHaveLength(1);
  });
});
