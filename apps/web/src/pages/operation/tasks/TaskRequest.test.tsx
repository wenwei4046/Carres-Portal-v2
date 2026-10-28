import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WorkRow } from "../use-open-work";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async () => ({ ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"), apiFetch: api }));

import { ApiError } from "@/lib/api";
import TaskRequest, { canRecordRequest, requestRecordedWords } from "./TaskRequest";

/**
 * `Record as sent` (Workspace MASTER §5.10 "Communication and Waiting"; round 3
 * brief of 13 Oct 2026, point 4). Every party below is TEST data.
 */
const row = (over: Partial<WorkRow> = {}, source: Record<string, unknown> = {}): WorkRow => ({
  id: "purchasing:PO-261001-9001:purchasing.supplier_date_passed", module: "purchasing", ruleKey: "purchasing.supplier_date_passed",
  recipient: "TEST Supplier A", line: "Ask TEST Supplier A when the goods will arrive",
  ...over,
  source: { object: { kind: "purchase_order", id: "PO-261001-9001", label: "PO-261001-9001" }, sourceVersion: "v-7", ...source },
} as unknown as WorkRow);
const waiting = { state: "waiting", waitingSince: "2026-10-02T03:00:00.000Z", replyDueOn: "2026-10-06", replyMissed: false, channel: "email", contactKind: null, contactId: null, lastReplyAt: null };

function mount(task = row()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const onRecorded = vi.fn();
  render(<QueryClientProvider client={client}><TaskRequest row={task} onRecorded={onRecorded} /></QueryClientProvider>);
  return { onRecorded, invalidate };
}
const sent = (): Array<Record<string, unknown>> => api.mock.calls.map(([path, init]) => ({ path: path as string, ...(JSON.parse((init as { body: string }).body) as Record<string, unknown>) }));

beforeEach(() => { api.mockReset(); });

describe("which task can be marked as asked", () => {
  it("open work that names a party; never a purchase batch, work already waiting, or work with no party", () => {
    expect(canRecordRequest(row())).toBe(true);
    expect(canRecordRequest(row({}, { object: { kind: "po_window", id: "2026-10-05T11:00", label: "11:00 AM PO window" } }))).toBe(false);
    expect(canRecordRequest(row({}, { lifecycle: waiting }))).toBe(false);
    expect(canRecordRequest(row({ recipient: null }))).toBe(false);
    /* The answer day passed: the task is back in To do and can be asked again. */
    expect(canRecordRequest(row({}, { lifecycle: { ...waiting, state: "to_do", replyMissed: true } }))).toBe(true);
  });
});

describe("Record as sent", () => {
  it("records the request with its channel against the task as it was read, then says who, how and the next contact day", async () => {
    api.mockResolvedValue({ id: "e1", occurrenceId: "x", lifecycle: { ...waiting, channel: "whatsapp" } });
    const { onRecorded, invalidate } = mount();
    expect(screen.getByText("After you asked TEST Supplier A")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Record as sent" }));
    await waitFor(() => expect(onRecorded).toHaveBeenCalledWith("Asked TEST Supplier A · WhatsApp · Next contact Tue, 6 Oct"));
    expect(sent()).toEqual([expect.objectContaining({
      path: "/api/operation/work/purchasing%3APO-261001-9001%3Apurchasing.supplier_date_passed/request-sent",
      channel: "whatsapp", contactKind: null, contactId: null, sourceVersion: "v-7",
    })]);
    expect(String(sent()[0]!.idempotencyKey).length).toBeGreaterThanOrEqual(8);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["operation", "work"] });
  });

  it("a refusal says the door's own sentence, records nothing, and a second press is the same request", async () => {
    api.mockRejectedValueOnce(new ApiError(409, "This work changed. Refresh and try again.", { code: "work_stale" }));
    api.mockResolvedValueOnce({ id: "e1", occurrenceId: "x", lifecycle: waiting });
    const { onRecorded } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Record as sent" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This work changed. Refresh and try again.");
    expect(onRecorded).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Record as sent" }));
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
    expect(sent()[1]!.idempotencyKey).toBe(sent()[0]!.idempotencyKey);
  });

  it("a lost answer is not called a refusal: it says Not recorded, Try again", async () => {
    api.mockRejectedValueOnce(new Error("network"));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Record as sent" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not recorded · Try again");
  });

  it("the words name the channel and leave the day out when the record gives none", () => {
    expect(requestRecordedWords(row(), "phone", null)).toBe("Asked TEST Supplier A · Phone");
    expect(requestRecordedWords(row(), "in_person", "2026-10-07")).toBe("Asked TEST Supplier A · In person · Next contact Wed, 7 Oct");
  });
});
