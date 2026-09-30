import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  auth: { user: { id: "jess" } as {id:string}|null, role: "principal" as string|null },
  observe: vi.fn(), dispose: vi.fn(), send: vi.fn().mockResolvedValue({ok:true}),
}));
vi.mock("./auth", () => ({useAuth: (select: (state: typeof mocks.auth) => unknown) => select(mocks.auth)}));
vi.mock("./api", () => ({apiFetch: mocks.send}));
vi.mock("./work-activity", () => ({observeWorkActivity: mocks.observe}));
import { useWorkActivity } from "./use-work-activity";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth = {user:{id:"jess"},role:"principal"};
  mocks.observe.mockReturnValue(mocks.dispose);
});
describe("portal-wide work activity", () => {
  it("keeps one collector when the same person switches modules, with no mount heartbeat", async () => {
    const {rerender,unmount} = renderHook(({module}) => { void module; useWorkActivity(); }, {initialProps:{module:"operation"}});
    expect(mocks.observe).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
    rerender({module:"finance"});
    rerender({module:"people"});
    expect(mocks.observe).toHaveBeenCalledTimes(1);
    await mocks.observe.mock.calls[0][1]();
    expect(mocks.send).toHaveBeenCalledWith("/api/operation/work-activity",{method:"POST"});
    unmount();
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });
  it("disposes identity-scoped evidence on account change and sign-out", () => {
    const {rerender} = renderHook(() => useWorkActivity());
    mocks.auth={user:{id:"colleague"},role:"operation"};
    rerender();
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.observe).toHaveBeenCalledTimes(2);
    mocks.auth={user:null,role:null};
    rerender();
    expect(mocks.dispose).toHaveBeenCalledTimes(2);
    expect(mocks.observe).toHaveBeenCalledTimes(2);
  });
  it("does not collect for an unrelated role", () => {
    mocks.auth.role="dealer";
    renderHook(() => useWorkActivity());
    expect(mocks.observe).not.toHaveBeenCalled();
  });
});
