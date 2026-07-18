import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { STAFF_TOKEN_HEADER } from "@carres/shared";
import { apiFetch, ApiError } from "./api";
import { useStaffSession } from "./staff";

// The fetcher reads the store JWT from useAuth; stub it to a fixed session.
vi.mock("./auth", () => ({
  useAuth: { getState: () => ({ session: { access_token: "jwt" } }) },
}));

const fetchMock = vi.fn();
beforeEach(() => {
  useStaffSession.getState().reset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function ok(body: unknown) {
  return { ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(body) };
}
function err(status: number, body: unknown) {
  return { ok: false, status, statusText: "ERR", text: async () => JSON.stringify(body) };
}

describe("apiFetch — staff token", () => {
  it("attaches X-Staff-Token when a staff session exists, omits it otherwise", async () => {
    fetchMock.mockResolvedValueOnce(ok({ v: 1 }));
    await apiFetch("/api/x");
    let headers = (fetchMock.mock.calls[0][1].headers as Headers);
    expect(headers.get(STAFF_TOKEN_HEADER)).toBeNull();

    useStaffSession.getState().setSession("staff-tok", { sid: "s1", tier: "manager", name: "M", color: null, outletId: "o1" }, "d1");
    fetchMock.mockResolvedValueOnce(ok({ v: 2 }));
    await apiFetch("/api/x");
    headers = fetchMock.mock.calls[1][1].headers as Headers;
    expect(headers.get(STAFF_TOKEN_HEADER)).toBe("staff-tok");
  });

  it("clears the staff token on a 403 staff_session_required response", async () => {
    useStaffSession.getState().setSession("staff-tok", { sid: "s1", tier: "manager", name: "M", color: null, outletId: "o1" }, "d1");
    fetchMock.mockResolvedValueOnce(err(403, { error: "staff_session_required" }));
    await expect(apiFetch("/api/orders")).rejects.toBeInstanceOf(ApiError);
    expect(useStaffSession.getState().token).toBeNull();
  });

  it("leaves the token intact on unrelated errors", async () => {
    useStaffSession.getState().setSession("staff-tok", { sid: "s1", tier: "manager", name: "M", color: null, outletId: "o1" }, "d1");
    fetchMock.mockResolvedValueOnce(err(400, { error: "bad_request" }));
    await expect(apiFetch("/api/orders")).rejects.toBeInstanceOf(ApiError);
    expect(useStaffSession.getState().token).toBe("staff-tok");
  });
});
