import { describe, expect, it, vi } from "vitest";
import { observeWorkActivity } from "./work-activity";

function harness(send = vi.fn(async () => {})) {
  let time = Date.parse("2026-09-29T05:59:59Z");
  let visible = true;
  let focused = true;
  const listeners = new Map<string, EventListener>();
  const doc = {
    get visibilityState() { return visible ? "visible" : "hidden"; },
    hasFocus: () => focused,
    addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
  } as unknown as Document;
  const stop = observeWorkActivity(doc, send, () => time);
  return {
    send, stop, listeners,
    fire: (type = "pointerdown", trusted = true) => listeners.get(type)?.({ isTrusted: trusted } as Event),
    time: (value: number) => { time = value; },
    advance: (ms: number) => { time += ms; },
    visibility: (value: boolean) => { visible = value; },
    focus: (value: boolean) => { focused = value; },
  };
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

describe("work activity evidence", () => {
  it("does not send on mount, elapsed time, focus, or a synthetic event", async () => {
    const h = harness();
    h.advance(24 * 60 * 60_000);
    h.fire("focus"); h.fire("pointerdown", false);
    await settle();
    expect(h.send).not.toHaveBeenCalled();
  });
  it("ignores a hidden or unfocused page, then accepts real keyboard use", async () => {
    const h = harness();
    h.visibility(false); h.fire();
    h.visibility(true); h.focus(false); h.fire();
    await settle(); expect(h.send).not.toHaveBeenCalled();
    h.focus(true); h.fire("keydown"); await settle();
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send).toHaveBeenCalledWith();
  });
  it("deduplicates a burst but preserves the first interaction after lunch", async () => {
    const h = harness();
    h.fire(); h.fire("wheel"); await settle(); h.fire();
    expect(h.send).toHaveBeenCalledTimes(1);
    h.advance(1_000); // 14:00 Malaysia: never suppress with a lunch stamp.
    h.fire(); await settle(); expect(h.send).toHaveBeenCalledTimes(2);
  });
  it("a failed send retries only after another actual interaction", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const h = harness(send);
    h.fire(); await settle(); h.fire(); await settle();
    expect(send).toHaveBeenCalledTimes(1);
    h.advance(2_000); await settle(); expect(send).toHaveBeenCalledTimes(1);
    h.fire(); await settle(); expect(send).toHaveBeenCalledTimes(2);
  });
  it("does not let a slow older request suppress a new period", async () => {
    let resolve!: () => void;
    const send = vi.fn().mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; })).mockResolvedValue(undefined);
    const h = harness(send);
    h.fire(); await settle(); h.advance(1_000); h.fire(); await settle();
    resolve(); await settle(); h.fire(); await settle();
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("cancels a queued send when the person leaves before it starts", async () => {
    const h = harness(); h.fire(); h.stop(); await settle();
    expect(h.send).not.toHaveBeenCalled();
  });
  it("removes listeners on disposal and starts fresh for another person", async () => {
    const h = harness(); h.stop(); h.fire(); await settle();
    expect(h.listeners.size).toBe(0); expect(h.send).not.toHaveBeenCalled();
    const next = harness(); next.fire(); await settle(); expect(next.send).toHaveBeenCalledTimes(1);
  });
});
