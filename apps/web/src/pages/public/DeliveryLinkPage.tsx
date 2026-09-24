/**
 * THE EXTERNAL LOGISTICS LINK PAGE — owner rulings 2026-09-24 (0581).
 *
 * A logistics company with no portal login opens this from the WhatsApp
 * message. No OTP, no PIN, no name: whoever holds the link answers for that
 * company on that one delivery. It shows the governed minimum (the customer's
 * own reference — never the SO number — the customer, the address, the goods
 * without prices, the pickup route, the requested date) and offers exactly
 * three structured answers; the save decides the result:
 *
 *   Save scheduled delivery   date required, time optional
 *   Ask for another date      date + governed reason
 *   Cannot deliver            governed reason (+ words for `Another reason`)
 *
 * `opened` is posted from the RENDERED page, never from the GET a chat app
 * makes to draw its preview, so "the company has the details" is a fact the
 * portal actually observed.
 */
// design-standard: not-a-list-page — a phone-first public answer page, outside the portal shell.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ANOTHER_DATE_REASONS,
  CANNOT_DELIVER_REASONS,
  DELIVERY_TIME_SLOTS,
  LINK_COPY,
  isSundayIso,
  myHolidaySet,
  type ExternalDeliveryLinkView,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import { apiFetch, ApiError } from "@/lib/api";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";

type Mode = "schedule" | "another" | "cannot";

function dayRefusal(iso: string | null): string | undefined {
  if (!iso) return undefined;
  if (iso < appTodayIso()) return LINK_COPY.pastRefused;
  if (isSundayIso(iso)) return LINK_COPY.sundayRefused;
  if (myHolidaySet().has(iso)) return LINK_COPY.holidayRefused;
  return undefined;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <span className="text-label text-kit-slate-11">{label}</span>
      <span className="text-body text-kit-slate-12">{children}</span>
    </div>
  );
}

export default function DeliveryLinkPage() {
  const { token = "" } = useParams();
  const base = `/public/delivery-link/${encodeURIComponent(token)}`;
  const [view, setView] = useState<ExternalDeliveryLinkView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "dead" | "failed">("loading");
  const [mode, setMode] = useState<Mode>("schedule");
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | undefined>(undefined);
  const [reason, setReason] = useState<string | undefined>(undefined);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setState("loading");
    apiFetch<ExternalDeliveryLinkView>(base)
      .then((v) => {
        setView(v);
        setDate(v.scheduledDate);
        setTime(v.scheduledTime ?? undefined);
        setState("ready");
      })
      .catch((err) => setState(err instanceof ApiError && err.status === 404 ? "dead" : "failed"));
  };
  useEffect(load, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  /* The page has RENDERED with the delivery on it — only now is it "opened". */
  useEffect(() => {
    if (state === "ready") void apiFetch(`${base}/opened`, { method: "POST" }).catch(() => undefined);
  }, [state, base]);

  useEffect(() => {
    document.title = "Delivery — Carres";
  }, []);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === "schedule") {
        await apiFetch(`${base}/arrangement`, {
          method: "PUT",
          body: JSON.stringify({ scheduledDate: date, scheduledTime: time ?? null }),
        });
        setDone(LINK_COPY.savedScheduled);
      } else if (mode === "another") {
        await apiFetch(`${base}/another-date`, { method: "POST", body: JSON.stringify({ proposedDate: date, reason }) });
        setDone(LINK_COPY.savedAnother);
      } else {
        await apiFetch(`${base}/cannot-deliver`, {
          method: "POST",
          body: JSON.stringify({ reason, note: note.trim() || null }),
        });
        setDone(LINK_COPY.savedCannot);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setState("dead");
      else setError(err instanceof Error ? err.message : LINK_COPY.loadFailed);
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading") {
    return <main className="min-h-screen bg-kit-canvas p-4 text-body text-kit-slate-11">Loading…</main>;
  }
  if (state === "dead" || state === "failed" || !view) {
    return (
      <main className="flex min-h-screen flex-col items-start gap-3 bg-kit-canvas p-4">
        <p className="text-body text-kit-slate-12" role="alert">{state === "dead" ? LINK_COPY.dead : LINK_COPY.loadFailed}</p>
        {state === "failed" ? <Button onClick={load}>{LINK_COPY.tryAgain}</Button> : null}
      </main>
    );
  }

  const refusal = mode === "cannot" ? undefined : dayRefusal(date);
  const canSave =
    !busy &&
    (mode === "cannot"
      ? Boolean(reason) && (reason !== "other" || Boolean(note.trim()))
      : Boolean(date) && !refusal && (mode === "schedule" || Boolean(reason)));

  return (
    <main className="min-h-screen bg-kit-canvas px-4 py-4" data-testid="delivery-link-page">
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
        <header className="rounded-work border border-work-line bg-white px-4 py-3">
          <p className="text-label text-kit-slate-11">{LINK_COPY.pageTitle}</p>
          <h1 className="text-section font-semibold text-kit-slate-12">{view.company}</h1>
        </header>

        <section aria-label="Delivery" className="rounded-work border border-work-line bg-white px-4 py-2">
          {view.reference ? <Row label={LINK_COPY.reference}>{view.reference}</Row> : null}
          <Row label={LINK_COPY.customer}>{view.customerName}</Row>
          {view.customerPhone ? (
            <Row label={LINK_COPY.phone}>
              <a className="text-kit-blue-11 underline-offset-2 hover:underline" href={`tel:${view.customerPhone}`}>{view.customerPhone}</a>
            </Row>
          ) : null}
          <Row label={LINK_COPY.address}>
            {[view.address, view.building].filter(Boolean).join(" · ") || "Not recorded"}
          </Row>
          <Row label={LINK_COPY.goods}>
            <ul>{view.goods.map((g, i) => <li key={`${g.name}-${i}`}>{g.qty} × {g.name}</li>)}</ul>
          </Row>
          {view.pickup.length > 0 ? (
            <Row label={LINK_COPY.pickup}>
              <ul>{view.pickup.map((p) => <li key={p}>{p}</li>)}</ul>
            </Row>
          ) : null}
          <Row label="Requested delivery">{view.requestedDate ? fmtDate(view.requestedDate) : "No requested delivery date"}</Row>
          {view.scheduledDate ? (
            <Row label="Scheduled delivery">
              {[fmtDate(view.scheduledDate), view.scheduledTime].filter(Boolean).join(" · ")}
            </Row>
          ) : null}
        </section>

        {done ? (
          <section role="status" className="rounded-work border border-work-line bg-white px-4 py-3 text-body text-kit-slate-12" data-testid="delivery-link-done">
            {done}
          </section>
        ) : (
          <section aria-label="Your answer" className="flex flex-col gap-3 rounded-work border border-work-line bg-white px-4 py-3">
            <div role="radiogroup" aria-label="Your answer" className="flex flex-wrap gap-2">
              {([
                ["schedule", LINK_COPY.modeScheduled],
                ["another", LINK_COPY.modeAnother],
                ["cannot", LINK_COPY.cannotDeliver],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={mode === key}
                  onClick={() => {
                    setMode(key);
                    setReason(undefined);
                    setError(null);
                  }}
                  className={`min-h-11 rounded-control border px-3 text-body ${mode === key ? "border-kit-blue-9 bg-kit-blue-3 text-kit-blue-11" : "border-kit-slate-5 bg-white text-kit-slate-12 hover:bg-kit-slate-3"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode !== "cannot" ? (
              <DatePicker
                id="link-date"
                label={mode === "schedule" ? LINK_COPY.scheduledDate : LINK_COPY.proposedDate}
                value={date}
                onChange={setDate}
                minDate={appTodayIso()}
                error={refusal}
                required
              />
            ) : null}
            {mode === "schedule" ? (
              <Select
                id="link-time"
                label={LINK_COPY.scheduledTime}
                value={time}
                onValueChange={setTime}
                options={DELIVERY_TIME_SLOTS.map((s) => ({ value: s, label: s }))}
              />
            ) : null}
            {mode !== "schedule" ? (
              <Select
                id="link-reason"
                label={LINK_COPY.reason}
                value={reason}
                onValueChange={setReason}
                placeholder="Choose a reason"
                options={(mode === "another" ? ANOTHER_DATE_REASONS : CANNOT_DELIVER_REASONS).map((r) => ({ value: r.key, label: r.label }))}
                required
              />
            ) : null}
            {mode === "cannot" && reason === "other" ? (
              <Textarea id="link-note" label={LINK_COPY.cannotDeliverNote} value={note} onChange={(e) => setNote(e.target.value)} />
            ) : null}
            {error ? <p role="alert" className="text-body text-kit-red-11">{error}</p> : null}
            <Button variant="primary" disabled={!canSave} onClick={() => void submit()} data-testid="delivery-link-submit">
              {mode === "schedule" ? LINK_COPY.saveScheduled : mode === "another" ? LINK_COPY.sendAnotherDate : LINK_COPY.cannotDeliver}
            </Button>
          </section>
        )}
      </div>
    </main>
  );
}
