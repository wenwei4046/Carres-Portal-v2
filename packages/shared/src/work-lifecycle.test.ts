import { describe, expect, it } from "vitest";
import {
  workLifecycleOf,
  workReplyDueOn,
  type WorkOccurrenceEvent,
} from "./work-lifecycle";

const OCC = "orders:o-1318:ask_delivery_date";
let n = 0;
function ev(event: WorkOccurrenceEvent["event"], at: string, extra: Partial<WorkOccurrenceEvent> = {}): WorkOccurrenceEvent {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    occurrenceId: OCC,
    event,
    actorId: "00000000-0000-4000-8000-0000000000aa",
    at,
    channel: event === "completed" ? null : "whatsapp",
    contactKind: event === "completed" ? null : "customer",
    contactId: event === "completed" ? null : "00000000-0000-4000-8000-0000000000c1",
    replyDueOn: event === "request_sent" ? "2026-09-18" : null,
    resultReference: event === "completed" ? "SO-1318 delivery date" : null,
    sourceVersion: "v1",
    actionOn: event === "completed" ? "2026-09-17" : null,
    objectLabel: event === "completed" ? "SO-1318" : null,
    ...extra,
  };
}

describe("workLifecycleOf — the state is derived, never stored", () => {
  it("no events is To do", () => {
    expect(workLifecycleOf([], "2026-09-17").state).toBe("to_do");
  });

  it("a recorded send is Waiting, with when, how, whom and the reply due date", () => {
    const life = workLifecycleOf([ev("request_sent", "2026-09-17T02:00:00Z")], "2026-09-17");
    expect(life).toEqual({
      state: "waiting",
      waitingSince: "2026-09-17T02:00:00Z",
      replyDueOn: "2026-09-18",
      replyMissed: false,
      channel: "whatsapp",
      contactKind: "customer",
      contactId: "00000000-0000-4000-8000-0000000000c1",
      lastReplyAt: null,
    });
  });

  it("a reply returns it to To do", () => {
    const life = workLifecycleOf([
      ev("request_sent", "2026-09-17T02:00:00Z"),
      ev("reply_received", "2026-09-17T05:00:00Z"),
    ], "2026-09-17");
    expect(life.state).toBe("to_do");
    expect(life.lastReplyAt).toBe("2026-09-17T05:00:00Z");
    expect(life.waitingSince).toBeNull();
  });

  it("a second send after a reply waits again; the latest event decides, in time order", () => {
    const life = workLifecycleOf([
      ev("reply_received", "2026-09-17T05:00:00Z"),
      ev("request_sent", "2026-09-17T08:00:00Z", { replyDueOn: "2026-09-21" }),
      ev("request_sent", "2026-09-17T02:00:00Z"),
    ], "2026-09-17");
    expect(life.state).toBe("waiting");
    expect(life.replyDueOn).toBe("2026-09-21");
  });

  it("a reply that did not come by its due date returns it to To do and says so", () => {
    const life = workLifecycleOf([ev("request_sent", "2026-09-15T02:00:00Z", { replyDueOn: "2026-09-16" })], "2026-09-17");
    expect(life.state).toBe("to_do");
    expect(life.replyMissed).toBe(true);
    expect(life.replyDueOn).toBe("2026-09-16");
  });

  it("the due date itself still waits", () => {
    expect(workLifecycleOf([ev("request_sent", "2026-09-17T02:00:00Z", { replyDueOn: "2026-09-17" })], "2026-09-17").state).toBe("waiting");
  });

  it("a completion event on an OPEN occurrence changes nothing: only the module's fact closes Work", () => {
    expect(workLifecycleOf([ev("completed", "2026-09-17T02:00:00Z")], "2026-09-17").state).toBe("to_do");
  });
});

describe("workReplyDueOn — Malaysian working days", () => {
  it("one working day after Tue 15 Sep skips Malaysia Day to Thu 17 Sep", () => {
    expect(workReplyDueOn("2026-09-15")).toBe("2026-09-17");
  });
  it("skips the weekend", () => {
    expect(workReplyDueOn("2026-09-18")).toBe("2026-09-21");
  });
});

describe("workOccurrenceGenerationId + parseWorkOccurrenceId", () => {
  it("generation 1 keeps the plain identity; later ones carry :gN and parse back", async () => {
    const { workOccurrenceGenerationId } = await import("./work-lifecycle");
    const { parseWorkOccurrenceId, operationWorkStableId } = await import("./operation-work");
    const base = operationWorkStableId("orders", "ord:1", "delay_planning");
    expect(workOccurrenceGenerationId(base, 1)).toBe(base);
    expect(workOccurrenceGenerationId(base, 3)).toBe(`${base}:g3`);
    expect(parseWorkOccurrenceId(base)).toEqual({ module: "orders", objectId: "ord:1", ruleKey: "delay_planning", generation: 1 });
    expect(parseWorkOccurrenceId(`${base}:g3`)).toEqual({ module: "orders", objectId: "ord:1", ruleKey: "delay_planning", generation: 3 });
    expect(parseWorkOccurrenceId(`${base}:g1`)).toBeNull();
    expect(parseWorkOccurrenceId("claims:x:y")).toBeNull();
  });
});
