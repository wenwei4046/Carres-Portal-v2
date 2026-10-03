import { beforeEach, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAddressedActivity } from "./use-addressed-activity";
const mocks = vi.hoisted(() => ({ info: vi.fn(), rows: [] as unknown[] }));
vi.mock("sonner", () => ({ toast: { info: mocks.info } }));
vi.mock("@tanstack/react-query", async (original) => ({ ...await original<object>(), useQuery: () => ({ data: mocks.rows }) }));
vi.mock("./auth", () => ({ useAuth: (selector: (s: unknown) => unknown) => selector({ user: { id: "pic" } }) }));
beforeEach(() => { localStorage.clear(); mocks.info.mockClear(); mocks.rows = []; });
const event = (id: string, status: string, recipient = "pic") => ({ id, so: 1319, order_id: "o1", actor_name: "Colleague",
  action: `amendment.${status}`, detail: { recipient_id: recipient, status, amendment_id: "a1" } });
it("shows the latest outcome, the actual colleague and a link to the order only once", () => {
  mocks.rows = [event("effective", "applied"), event("waiting", "submitted")];
  const first = renderHook(() => useAddressedActivity());
  expect(mocks.info).toHaveBeenCalledTimes(1);
  expect(mocks.info).toHaveBeenCalledWith("SO-1319 · Amendment request · Saved", expect.objectContaining({ description: "Colleague", action: expect.objectContaining({ label: "View" }) }));
  first.unmount(); renderHook(() => useAddressedActivity());
  expect(mocks.info).toHaveBeenCalledTimes(1);
});
it("does not notify someone else's PIC", () => {
  mocks.rows = [event("not-mine", "submitted", "someone-else")];
  renderHook(() => useAddressedActivity()); expect(mocks.info).not.toHaveBeenCalled();
});
