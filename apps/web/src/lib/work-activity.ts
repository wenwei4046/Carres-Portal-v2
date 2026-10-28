/** Collect interaction evidence, not attendance. No mount/focus/timer event
 * proves that a person is working. The server owns time and identity; send
 * accepts neither a user id nor a client timestamp.
 *
 * The caller must dispose this collector when the authenticated person changes.
 * A trusted foreground interaction is at most one request per clock minute.
 * Minute buckets preserve the first interaction after 14:00 even if 13:59
 * already sent. There is no timer capable of carrying lunch activity forward.
 */
export function observeWorkActivity(
  doc: Document,
  send: () => Promise<unknown>,
  now: () => number = Date.now,
): () => void {
  const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
  let disposed = false;
  const sent = new Set<number>();
  const pending = new Set<number>();
  let retryAfter = 0;
  const record = (event: Event) => {
    if (disposed || !event.isTrusted || doc.visibilityState !== "visible" || !doc.hasFocus()) return;
    const time = now();
    const minute = Math.floor(time / 60_000);
    if (time < retryAfter || sent.has(minute) || pending.has(minute)) return;
    // Keep bounded state without letting an older pending response clear the
    // current minute's deduplication state.
    for (const previous of sent) if (previous < minute - 1) sent.delete(previous);
    pending.add(minute);
    void Promise.resolve().then(() => { if (!disposed) return send(); }).then(
      () => { if (!disposed) sent.add(minute); },
      () => { if (!disposed) retryAfter = now() + 1_000; },
    ).finally(() => pending.delete(minute));
  };
  for (const event of events) doc.addEventListener(event, record, { capture: true, passive: true });
  return () => {
    disposed = true;
    for (const event of events) doc.removeEventListener(event, record, { capture: true });
  };
}
