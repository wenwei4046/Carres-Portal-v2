import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../../types";
vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";
import router, { companyProfileReadRouter } from "./settings-core";

const rpc = vi.fn();
const tables: Record<string, { data: unknown; error: unknown }> = {};
function chain(name: string) {
  const result = () => Promise.resolve(tables[name] ?? { data: null, error: null });
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "in"]) q[m] = () => q;
  q.maybeSingle = result;
  q.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => result().then(ok, bad);
  return q;
}
function app(role = "principal") {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => { c.set("auth", { role, jwt: "t", id: "me" } as never); await next(); });
  a.route("/settings", router);
  a.route("/company-profile", companyProfileReadRouter);
  return a;
}
const json = (body: unknown) => ({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const COMPANY = {
  legal_name: "CARRES SDN. BHD.", former_name: null, registration_no: "202401055306 (1601150-X)",
  address_line1: null, address_line2: null, address_line3: null, postcode: null, city: null, country: null,
  company_phone: null, company_email: null, support_name: null, support_phone: null, support_whatsapp: null, support_email: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tables)) delete tables[k];
  vi.mocked(userClient).mockReturnValue({ rpc, from: (n: string) => chain(n) } as never);
  rpc.mockResolvedValue({ data: true, error: null });
});

describe("Settings → Company", () => {
  it("before 0669 is installed: the verified identity, read only, never Edit", async () => {
    tables.company_profile = { data: null, error: { code: "42P01", message: "missing" } };
    const body = (await (await app().request("/settings/company")).json()) as { stored: boolean; canEdit: boolean; values: Record<string, string | null> };
    expect(body.stored).toBe(false);
    expect(body.canEdit).toBe(false);
    expect(body.values.registration_no).toBe("202401055306 (1601150-X)");
  });

  it("a person not named for Company is refused before the database door", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const res = await app("operation").request("/settings/company", json({ values: COMPANY, revision: 1 }));
    expect(res.status).toBe(403);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("settings_can_edit", { p_section: "company" });
  });

  it("a named editor saves through the audited door with the revision and optional reason", async () => {
    const res = await app("operation").request("/settings/company", json({ values: COMPANY, revision: 3, reason: "New SSM letter" }));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("settings_save_company_profile", {
      p_values: COMPANY, p_revision: 3, p_reason: "New SSM letter",
    });
  });

  it("an empty legal name never reaches the door", async () => {
    const res = await app().request("/settings/company", json({ values: { ...COMPANY, legal_name: " " }, revision: 1 }));
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalledWith("settings_save_company_profile", expect.anything());
  });

  it("someone else's save first answers 409", async () => {
    rpc.mockImplementation((fn: string) => Promise.resolve(fn === "settings_can_edit"
      ? { data: true, error: null }
      : { data: null, error: { code: "40001", details: "settings_changed" } }));
    const res = await app().request("/settings/company", json({ values: COMPANY, revision: 1 }));
    expect(res.status).toBe(409);
  });

  it("before 0668 is installed the gate answers Jess only, not a lock-out", async () => {
    rpc.mockImplementation((fn: string) => Promise.resolve(fn === "settings_can_edit"
      ? { data: null, error: { code: "PGRST202", message: "not found" } }
      : { data: {}, error: null }));
    expect((await app("principal").request("/settings/company", json({ values: COMPANY, revision: 1 }))).status).toBe(200);
    expect((await app("operation").request("/settings/company", json({ values: COMPANY, revision: 1 }))).status).toBe(403);
  });

  it("every signed-in account reads the printed identity", async () => {
    tables.company_profile = { data: { ...COMPANY, revision: 2 }, error: null };
    const body = await (await app("dealer").request("/company-profile")).json();
    expect(body).toEqual({ stored: true, values: COMPANY });
  });
});

describe("Settings → Office", () => {
  const VALUES = {
    work_days: [1, 2, 3, 4, 5], start_time: "09:00", end_time: "18:00", flexi_minutes: 60,
    lunch_start: "13:00", lunch_end: "14:00", lunch_shift_minutes: 60, holiday_region: "Kuala Lumpur",
  };
  it("lunch outside office hours is refused before the door", async () => {
    const res = await app().request("/settings/office", json({ values: { ...VALUES, lunch_end: "18:30" }, revision: 1 }));
    expect(res.status).toBe(422);
  });
  it("a holiday outside its year is refused before the door", async () => {
    const res = await app().request("/settings/office/holidays", json({ year: 2027, holidays: [{ date: "2026-12-25", name: "Christmas Day" }] }));
    expect(res.status).toBe(422);
  });
  it("one year's holidays go to the audited door", async () => {
    const holidays = [{ date: "2027-01-01", name: "New Year's Day" }];
    const res = await app().request("/settings/office/holidays", json({ year: 2027, holidays }));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("settings_save_office_holidays", { p_year: 2027, p_holidays: holidays, p_reason: null });
  });
});

describe("Settings editors", () => {
  it("only the owner names an editor", async () => {
    const res = await app("operation").request("/settings/editors/grant", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "purchasing", userId: "6f0d0d4e-6c1c-4a4b-9b55-2d0a1c6a1f10" }),
    });
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
