/**
 * Settings → Service (0711). YH (chat, 2026-10-26): Close Case needs a stage
 * that closes the case, so "In use" is locked on the last one still in use.
 * Renaming it stays allowed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/settings-queries", () => ({ useCanEditSettings: vi.fn(() => true) }));
import { apiFetch } from "@/lib/api";
import ServiceSettings from "./ServiceSettings";

const stage = (id: string, label: string, active: boolean, isClosed: boolean) => ({ id, label, active, isClosed });
function answer(statuses: ReturnType<typeof stage>[]) {
  vi.mocked(apiFetch).mockImplementation(async (path: string) =>
    path === "/api/ops/service-cases/settings"
      ? { defaultOwnerUserId: null, types: [], statuses }
      : { staff: [] },
  );
}
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ServiceSettings />
    </QueryClientProvider>,
  );
}
const inUse = (id: string) => document.getElementById(`service-statuses-${id}-active`) as HTMLButtonElement;

beforeEach(() => vi.mocked(apiFetch).mockReset());
afterEach(cleanup);

describe("Service Settings: the last stage that closes the case", () => {
  it("locks In use on the only closing stage in use and says why; renaming stays open", async () => {
    answer([stage("s1", "Pending", true, false), stage("s4", "Resolved", true, true)]);
    mount();
    const stages = await screen.findByTestId("service-pick-statuses");
    await within(stages).findByDisplayValue("Resolved");
    expect(inUse("s4")).toBeDisabled();
    expect(inUse("s1")).not.toBeDisabled();
    expect(within(stages).getByText("Close Case needs this stage.")).toBeInTheDocument();
    expect(within(stages).getByDisplayValue("Resolved")).not.toBeDisabled();
  });

  it("leaves both switchable when two closing stages are in use", async () => {
    answer([stage("s4", "Resolved", true, true), stage("s5", "Closed", true, true)]);
    mount();
    const stages = await screen.findByTestId("service-pick-statuses");
    await within(stages).findByDisplayValue("Closed");
    expect(inUse("s4")).not.toBeDisabled();
    expect(inUse("s5")).not.toBeDisabled();
    expect(within(stages).queryByText("Close Case needs this stage.")).not.toBeInTheDocument();
  });

  it("does not lock a closing stage that is already off", async () => {
    answer([stage("s4", "Resolved", true, true), stage("s5", "Closed", false, true)]);
    mount();
    const stages = await screen.findByTestId("service-pick-statuses");
    await within(stages).findByDisplayValue("Closed");
    expect(inUse("s4")).toBeDisabled();
    expect(inUse("s5")).not.toBeDisabled();
  });
});
