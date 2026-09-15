import * as fs from "node:fs";
import * as path from "node:path";
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

async function makeJwt(role: string) {
  return signTestJwt("11111111-1111-1111-1111-000000000001", { email: `${role}@x`, app_metadata: { role } });
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

describe("GET /api/finance/payment-settings", () => {
  function tables(fail = false) {
    const table = (rows: unknown[]) => {
      const chain = { select: vi.fn(), order: vi.fn(), limit: vi.fn() };
      chain.select.mockReturnValue(chain);
      // Two chained .order calls resolve on await — a thenable chain.
      const result = fail
        ? { data: null, error: { message: "down" } }
        : { data: rows, error: null };
      const thenable = Object.assign(chain, {
        then: (resolve: (v: unknown) => void) => resolve(result),
      });
      chain.order.mockReturnValue(thenable);
      chain.limit.mockReturnValue(thenable);
      return thenable;
    };
    const sb = { from: vi.fn().mockImplementation((name: string) =>
      table(name === "payment_manual_methods"
        ? [{ method: "bank", active: true, sort: 1 }]
        : [])) };
    vi.mocked(userClient).mockReturnValue(sb as never);
    return sb;
  }
  async function request(role: string) {
    return app.fetch(new Request("http://t/api/finance/payment-settings", {
      headers: { Authorization: `Bearer ${await makeJwt(role)}` },
    }), env);
  }
  it.each(["operation", "finance", "principal"])("reads the settings for %s", async (role) => {
    tables();
    const res = await request(role);
    expect(res.status).toBe(200);
    const body = await res.json() as { manual_methods: unknown[] };
    expect(body.manual_methods).toEqual([{ method: "bank", active: true, sort: 1 }]);
  });
  it.each(["dealer", "warehouse", "partner"])("refuses %s", async (role) => {
    expect((await request(role)).status).toBe(403);
    expect(userClient).not.toHaveBeenCalled();
  });
  it("a failed source read is an error, never empty settings", async () => {
    tables(true);
    expect((await request("finance")).status).toBe(500);
  });
});

describe("the payment method registry (0476)", () => {
  const REGISTRY = [
    { method: "bank", label: "Bank transfer", account_code: "1120", account_name: "Bank", active: true, sort: 1 },
  ];
  const ACCOUNTS = [
    { code: "1110", name: "Cash in hand" },
    { code: "1120", name: "Bank" },
    { code: "1130", name: "Card and online settlement" },
  ];
  async function get(role: string) {
    return app.fetch(new Request("http://t/api/finance/payment-settings/methods", {
      headers: { Authorization: `Bearer ${await makeJwt(role)}` },
    }), env);
  }
  async function save(role: string, body: unknown) {
    return app.fetch(new Request("http://t/api/finance/payment-settings/method/save", {
      method: "POST",
      headers: { Authorization: `Bearer ${await makeJwt(role)}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }), env);
  }

  it.each(["operation", "finance", "principal"])("lists methods and money accounts for %s", async (role) => {
    const rpc = vi.fn().mockImplementation(async (name: string) => ({
      data: name === "payment_method_registry" ? REGISTRY : ACCOUNTS, error: null,
    }));
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const res = await get(role);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ methods: REGISTRY, money_accounts: ACCOUNTS });
    expect(rpc).toHaveBeenCalledWith("payment_method_registry");
    expect(rpc).toHaveBeenCalledWith("payment_method_money_accounts");
  });
  it("refuses a dealer before any read", async () => {
    expect((await get("dealer")).status).toBe(403);
    expect(userClient).not.toHaveBeenCalled();
  });
  it("a failed read is an error, never an empty list", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "down" } });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    expect((await get("finance")).status).toBe(500);
  });
  it("adding a method sends a null key, the name and the money account", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { method: "grab_pay", label: "Grab Pay" }, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const res = await save("principal", { method: null, label: " Grab Pay ", accountCode: "1130" });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("payment_method_save", {
      p_method: null, p_label: "Grab Pay", p_account_code: "1130", p_active: true,
    });
  });
  it("renaming and switching off keeps the key", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { method: "grab_pay" }, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    await save("principal", { method: "grab_pay", label: "GrabPay", accountCode: "1120", active: false });
    expect(rpc).toHaveBeenCalledWith("payment_method_save", {
      p_method: "grab_pay", p_label: "GrabPay", p_account_code: "1120", p_active: false,
    });
  });
  it("an empty name is refused before SQL", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const res = await save("principal", { label: "  ", accountCode: "1130" });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("the SQL refusals map: manager gate → 403, not a money account → 422", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: "42501", message: "forbidden" } })
      .mockResolvedValueOnce({ data: null, error: { code: "22023", details: "account_not_money",
        message: "account 4100 is not a money account — choose cash, a bank account or card and online settlement" } });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    expect((await save("operation", { label: "Grab Pay", accountCode: "1130" })).status).toBe(403);
    const res = await save("principal", { label: "Grab Pay", accountCode: "4100" });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toContain("not a money account");
  });
  it("the Active switch accepts any registered key, not six words", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { method: "grab_pay", active: false }, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const res = await app.fetch(new Request("http://t/api/finance/payment-settings/method", {
      method: "POST",
      headers: { Authorization: `Bearer ${await makeJwt("principal")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ method: "grab_pay", active: false }),
    }), env);
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("payment_set_method_active", { p_method: "grab_pay", p_active: false });
  });
});

describe("payment templates (0435)", () => {
  it("save maps to the manager-gated versioning door", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { version: 2 }, error: null }) };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.fetch(new Request("http://t/api/finance/payment-settings/templates/save", {
      method: "POST",
      headers: { Authorization: `Bearer ${await makeJwt("principal")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ templateKey: null, purpose: "gentle_reminder",
        name: "Standard reminder", body: "Hi {customer}, RM {outstanding}" }),
    }), env);
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("payment_template_save", {
      p_template_key: null, p_purpose: "gentle_reminder",
      p_name: "Standard reminder", p_body: "Hi {customer}, RM {outstanding}",
    });
  });
  it("an unknown purpose is refused before SQL", async () => {
    const sb = { rpc: vi.fn() };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.fetch(new Request("http://t/api/finance/payment-settings/templates/save", {
      method: "POST",
      headers: { Authorization: `Bearer ${await makeJwt("principal")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "birthday_wish", name: "X", body: "Hi" }),
    }), env);
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
  it("the SQL manager refusal maps to 403 for set-default", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "forbidden" } }) };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.fetch(new Request("http://t/api/finance/payment-settings/templates/set-default", {
      method: "POST",
      headers: { Authorization: `Bearer ${await makeJwt("operation")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ templateKey: "00000000-0000-4000-8000-000000000001" }),
    }), env);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/finance/payment-settings/*", () => {
  async function post(path: string, role: string, body: unknown) {
    return app.fetch(new Request(`http://t/api/finance/payment-settings/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await makeJwt(role)}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }), env);
  }
  it("bank-account maps to the manager-gated SQL door", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { route_source: "dealer" }, error: null }) };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post("bank-account", "principal", {
      routeSource: "dealer", bankName: "RHB", accountName: "Carres Sdn Bhd", accountNo: "212345678",
    });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("payment_set_bank_account", {
      p_route_source: "dealer", p_bank_name: "RHB",
      p_account_name: "Carres Sdn Bhd", p_account_no: "212345678",
    });
  });
  it("the SQL manager refusal maps to 403", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "forbidden" } }) };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post("method", "operation", { method: "cash", active: false });
    expect(res.status).toBe(403);
  });
  it("an unknown routing source is refused before SQL", async () => {
    const sb = { rpc: vi.fn() };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post("bank-account", "principal", { routeSource: "walk_in", bankName: "X" });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
  it("a storage rule change reaches the append-only SQL door", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { id: "r1" }, error: null }) };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post("storage-rule", "principal", {
      productGroup: "sofa", freeDays: 14, chargeAmount: 200, cycleDays: 14,
      extraFreeAllowed: false, inspectionDays: 30, effectiveFrom: "2026-10-01",
      reason: "Owner ruling",
    });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("payment_set_storage_rule", expect.objectContaining({
      p_product_group: "sofa", p_charge_amount: 200, p_extra_free_allowed: false,
      p_reason: "Owner ruling",
    }));
  });
  it("a storage rule change without its reason is refused before SQL (0486)", async () => {
    const sb = { rpc: vi.fn() };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post("storage-rule", "principal", {
      productGroup: "sofa", freeDays: 14, chargeAmount: 200, cycleDays: 14,
      extraFreeAllowed: false, inspectionDays: 30, effectiveFrom: "2026-10-01",
    });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
  it("free days > Operation limit is refused before SQL — free ≤ Operation ≤ Approver", async () => {
    const sb = { rpc: vi.fn() };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post("storage-rule", "principal", {
      productGroup: "mattress_bedframe", freeDays: 25, chargeAmount: 150, cycleDays: 30,
      operationLimitDay: 21, waiverLimitDay: 30, extraFreeAllowed: true, inspectionDays: 30,
      effectiveFrom: "2026-10-01", reason: "typo",
    });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});

describe("Collection timing (0486)", () => {
  async function post(path: string, role: string, body: unknown) {
    return app.fetch(new Request(`http://t/api/finance/payment-settings/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await makeJwt(role)}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }), env);
  }
  it("GET carries the effective-dated rules, the change log and the provider fact", async () => {
    const table = (rows: unknown[]) => {
      const chain = { select: vi.fn(), order: vi.fn(), limit: vi.fn() };
      const thenable = Object.assign(chain, {
        then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
      });
      chain.select.mockReturnValue(chain); chain.order.mockReturnValue(thenable); chain.limit.mockReturnValue(thenable);
      return thenable;
    };
    const sb = { from: vi.fn().mockImplementation((name: string) =>
      table(name === "payment_collection_timing_rules"
        ? [{ ask_days_before: 3, deadline_days_before: 2, effective_from: "2026-08-19" }]
        : name === "payment_setting_changes"
          ? [{ what: "collection_timing", reason: "ruling", effective_from: "2026-08-19" }]
          : [])) };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.fetch(new Request("http://t/api/finance/payment-settings", {
      headers: { Authorization: `Bearer ${await makeJwt("principal")}` },
    }), env);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      collection_timing: unknown[]; setting_changes: unknown[]; online_provider: { name: string; configured: boolean };
    };
    expect(body.collection_timing).toEqual([{ ask_days_before: 3, deadline_days_before: 2, effective_from: "2026-08-19" }]);
    expect(body.setting_changes).toHaveLength(1);
    // No STRIPE_SECRET_KEY in the test env → the provider is honestly not configured.
    expect(body.online_provider).toEqual({ name: "Stripe", configured: false });
  });
  it("a change reaches the manager-gated SQL door with its reason and effective date", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { id: "t1" }, error: null }) };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post("collection-timing", "principal", {
      askDaysBefore: 4, deadlineDaysBefore: 3, effectiveFrom: "2026-10-01", reason: "  Give staff a day more  ",
    });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("payment_set_collection_timing", {
      p_ask_days_before: 4, p_deadline_days_before: 3, p_effective_from: "2026-10-01",
      p_reason: "Give staff a day more",
    });
  });
  it("asking must start EARLIER than the deadline — refused before SQL", async () => {
    const sb = { rpc: vi.fn() };
    vi.mocked(userClient).mockReturnValue(sb as never);
    for (const body of [
      { askDaysBefore: 2, deadlineDaysBefore: 2, effectiveFrom: "2026-10-01", reason: "x" },
      { askDaysBefore: 1, deadlineDaysBefore: 2, effectiveFrom: "2026-10-01", reason: "x" },
    ]) {
      expect((await post("collection-timing", "principal", body)).status).toBe(422);
    }
    expect(sb.rpc).not.toHaveBeenCalled();
  });
  it("a reason is required", async () => {
    const sb = { rpc: vi.fn() };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post("collection-timing", "principal", {
      askDaysBefore: 4, deadlineDaysBefore: 3, effectiveFrom: "2026-10-01", reason: " ",
    });
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
  it("the SQL manager refusal maps to 403", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({
      data: null, error: { code: "42501", message: "forbidden", details: "payment settings are set by the manager" },
    }) };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post("collection-timing", "operation", {
      askDaysBefore: 4, deadlineDaysBefore: 3, effectiveFrom: "2026-10-01", reason: "x",
    });
    expect(res.status).toBe(403);
  });
  it("both effective-date doors compare with today in Kuala Lumpur, not the UTC clock (0517)", () => {
    const mig = fs.readFileSync(
      path.resolve(__dirname, "../../../../../supabase/migrations/0517_the_effective_date_is_checked_against_today_in_kuala_lumpur.sql"),
      "utf-8",
    );
    for (const door of ["payment_set_collection_timing", "payment_set_storage_rule"]) {
      const body = mig.slice(mig.indexOf(`function public.${door}`), mig.indexOf(`grant execute on function public.${door}`));
      expect(body).toContain("p_effective_from < (timezone('Asia/Kuala_Lumpur', now()))::date");
      expect(body).not.toContain("< current_date");
      expect(body).toContain("detail = 'bad_effective_from'");
    }
  });
});
