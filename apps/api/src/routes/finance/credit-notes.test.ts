import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};

const INVOICE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const NOTE_ID = "bbbbbbbb-0000-4000-8000-000000000001";

async function makeJwt(role: string) {
  return signTestJwt("11111111-1111-1111-1111-000000000001", { email: `${role}@x`, app_metadata: { role } });
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});
afterAll(() => _setJwksForTesting(null));

type Result = { data: unknown; error: { code?: string; message?: string } | null };
type Call = { kind: "from" | "rpc"; name: string; args?: unknown };

/** A recording stand-in for the supabase client: every chain step returns the
 *  same proxy, awaiting it answers with `answer(call)`. */
function fakeClient(answer: (call: Call) => Result) {
  const calls: Call[] = [];
  const chain = (call: Call): unknown => {
    const proxy: object = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (r: Result) => unknown) => Promise.resolve(answer(call)).then(resolve);
        }
        return () => proxy;
      },
    });
    return proxy;
  };
  const sb = {
    from: vi.fn((name: string) => { const c: Call = { kind: "from", name }; calls.push(c); return chain(c); }),
    rpc: vi.fn((name: string, args?: unknown) => { const c: Call = { kind: "rpc", name, args }; calls.push(c); return chain(c); }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(sb as any);
  return { calls };
}

async function send(path: string, method: string, body?: unknown, role = "finance") {
  const jwt = await makeJwt(role);
  return app.fetch(
    new Request(`http://t/api/finance/credit-notes${path === "/" ? "" : path}`, {
      method,
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => (await res.json()) as Record<string, any>;

/** An order worth RM 1,000 with RM 400 paid and nothing credited yet. */
const invoiceRow = (over: Record<string, unknown> = {}) => ({
  id: INVOICE_ID,
  invoice_no: "INV-281026-0001",
  orders: { paid: 400, credited: 0, order_lines: [{ qty: 1, unit_price: 1000 }], order_addons: [], ops_order_control: null, ...over },
});

const NOTE = { id: NOTE_ID, credit_note_no: "CN-0001", amount: 200 };

function happy(order = invoiceRow(), rpc: Result = { data: NOTE, error: null }) {
  return fakeClient((call) => {
    if (call.kind === "from" && call.name === "invoices") return { data: order, error: null };
    if (call.kind === "rpc" && call.name === "issue_credit_note") return rpc;
    throw new Error(`unexpected call ${call.kind} ${call.name}`);
  });
}

const ISSUE = { invoiceId: INVOICE_ID, amount: 200, reason: "Damaged on delivery, goods kept" };

describe("credit notes — who may issue", () => {
  it.each(["operation", "dealer", "supplier", "hr"])("refuses %s before any database call", async (role) => {
    const res = await send("/", "POST", ISSUE, role);
    expect(res.status).toBe(403);
    expect(userClient).not.toHaveBeenCalled();
  });
});

describe("credit notes — issue", () => {
  it("hands the invoice, amount and reason to issue_credit_note and answers 201", async () => {
    const { calls } = happy();
    const res = await send("/", "POST", ISSUE);
    expect(res.status).toBe(201);
    expect((await json(res)).credit_note_no).toBe("CN-0001");
    const rpc = calls.find((c) => c.kind === "rpc");
    expect(rpc?.args).toEqual({ p_invoice_id: INVOICE_ID, p_amount: 200, p_reason: ISSUE.reason, p_note_date: null });
  });

  it("the screen types the invoice number: it is resolved to the invoice before the ledger call", async () => {
    const { calls } = happy();
    const res = await send("/", "POST", { invoiceNo: "INV-281026-0001", amount: 200, reason: "Damaged" });
    expect(res.status).toBe(201);
    expect(calls.find((c) => c.kind === "rpc")?.args).toMatchObject({ p_invoice_id: INVOICE_ID });
  });

  it("an unknown invoice number is a 404, and neither id nor number is a 422", async () => {
    fakeClient(() => ({ data: null, error: null }));
    expect((await send("/", "POST", { invoiceNo: "INV-NOPE", amount: 1, reason: "x" })).status).toBe(404);
    expect((await send("/", "POST", { amount: 1, reason: "x" })).status).toBe(422);
  });

  it("a credit up to what is still owed is allowed (RM 600 owed, RM 600 credited)", async () => {
    happy();
    expect((await send("/", "POST", { ...ISSUE, amount: 600 })).status).toBe(201);
  });

  it("refuses a credit above what the order still owes, and never calls the ledger (Carres does not refund)", async () => {
    const { calls } = happy();
    const res = await send("/", "POST", { ...ISSUE, amount: 600.01 });
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.code).toBe("credit_exceeds_owing");
    expect(body.message).toContain("still owes RM 600.00");
    expect(body.message).toContain("Carres does not refund");
    expect(calls.some((c) => c.kind === "rpc")).toBe(false);
  });

  it("an earlier credit lowers what is owed: RM 300 already credited leaves RM 300", async () => {
    happy(invoiceRow({ credited: 300 }));
    expect((await send("/", "POST", { ...ISSUE, amount: 300 })).status).toBe(201);
    happy(invoiceRow({ credited: 300 }));
    expect((await send("/", "POST", { ...ISSUE, amount: 300.01 })).status).toBe(422);
  });

  it("a typed amount with a third decimal or no reason never reaches the database", async () => {
    happy();
    expect((await send("/", "POST", { ...ISSUE, amount: 10.005 })).status).toBe(422);
    expect((await send("/", "POST", { ...ISSUE, reason: "  " })).status).toBe(422);
    expect(userClient).not.toHaveBeenCalled();
  });

  it("passes the database's own sentence through (closed month, over the invoice)", async () => {
    happy(invoiceRow(), {
      data: null,
      error: { code: "22023", message: "Invoice INV-281026-0001 is for RM 1,000.00, and RM 900.00 is already credited. A credit note can be at most RM 100.00." },
    });
    const res = await send("/", "POST", ISSUE);
    expect(res.status).toBe(422);
    expect((await json(res)).message).toContain("A credit note can be at most RM 100.00");
  });
});

describe("credit notes — void and read", () => {
  it("void needs a reason and calls void_credit_note", async () => {
    const { calls } = fakeClient(() => ({ data: { ...NOTE, status: "voided" }, error: null }));
    expect((await send(`/${NOTE_ID}/void`, "POST", { reason: "" })).status).toBe(422);
    const res = await send(`/${NOTE_ID}/void`, "POST", { reason: "Issued on the wrong invoice" });
    expect(res.status).toBe(200);
    expect(calls.find((c) => c.kind === "rpc")?.args).toEqual({ p_id: NOTE_ID, p_reason: "Issued on the wrong invoice" });
  });

  it("print-data names the invoice, the SO and a voided note", async () => {
    fakeClient(() => ({
      data: {
        id: NOTE_ID, credit_note_no: "CN-0001", invoice_id: INVOICE_ID, order_id: "o", amount: "200.00",
        reason: "Damaged", note_date: "2026-10-28", status: "voided", void_reason: "Wrong invoice", created_at: "x",
        invoices: { invoice_no: "INV-281026-0001" }, orders: { so: 1209, customer_name: "Lim" },
      },
      error: null,
    }));
    const body = await json(await send(`/${NOTE_ID}/print-data`, "GET"));
    expect(body).toMatchObject({ credit_note_no: "CN-0001", invoice_no: "INV-281026-0001", order_code: "SO-1209", amount: 200, voided: true });
  });
});
