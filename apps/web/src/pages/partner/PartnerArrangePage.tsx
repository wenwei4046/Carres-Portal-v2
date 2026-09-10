/**
 * DELIVERY DATES — the ruled partner screen (Delivery Card 07, 0413).
 * `docs/delivery/MASTER.md` §5 + §13, owner rulings 2026-09-01.
 *
 * One phone-first column. Each card is one delivery this partner carries, with
 * the ruled minimum facts and exactly TWO acts:
 *
 *   [ Save Delivery Arrangement ]   confirmed date · time window · ETA · note
 *   [ Cannot Deliver ]              governed reason (+ note), append-only
 *
 * No Accept (the partner is responsible without one), no money, no other
 * partner's work, no reassignment. Primary-school English throughout.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CANNOT_DELIVER_REASONS,
  type PartnerCannotDeliverInput,
  type PartnerDeliveryCard,
  type PartnerSaveArrangementInput,
} from "@carres/shared";
import { apiFetch, ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";

export const PA = {
  page: "Delivery dates",
  intro: "These deliveries are yours. Fill in the date after you talk to the customer.",
  empty: "No deliveries waiting for a date.",
  loadFailed: "The list could not be loaded",
  tryAgain: "Try again",
  customerAsked: "Customer asked",
  noCustomerDate: "Customer date not given yet",
  goods: "Goods",
  building: "Building",
  phone: "Phone",
  doNo: "DO No",
  noDo: "No delivery order yet",
  confirmedDate: "Confirmed date",
  timeWindow: "Time window",
  eta: "ETA",
  note: "Note",
  save: "Save Delivery Arrangement",
  saving: "Saving…",
  saved: "Arrangement saved",
  cannotDeliver: "Cannot Deliver",
  cannotDeliverWhy: "Why can you not deliver?",
  cannotDeliverNote: "Tell us more (needed for Another reason)",
  cannotDeliverSend: "Send Cannot Deliver",
  cannotDeliverSent: "Reported. Carres Operations will decide what happens next.",
  cannotDeliverReported: "You reported Cannot Deliver. Carres Operations is deciding.",
  cancel: "Cancel",
} as const;

const FIELD =
  "h-9 w-full rounded-control border border-border bg-card px-2 text-body";

function DeliveryCard({ card }: { card: PartnerDeliveryCard }) {
  const qc = useQueryClient();
  const [confirmedDate, setConfirmedDate] = useState(card.confirmedDate ?? "");
  const [confirmedTime, setConfirmedTime] = useState(card.confirmedTime ?? "");
  const [eta, setEta] = useState(card.expectedArrival ?? "");
  const [note, setNote] = useState(card.note ?? "");
  const [busy, setBusy] = useState(false);
  const [cdOpen, setCdOpen] = useState(false);
  const [cdReason, setCdReason] = useState("");
  const [cdNote, setCdNote] = useState("");

  const scopeQs = `?leg=${card.leg}`;

  async function save() {
    setBusy(true);
    try {
      const body: PartnerSaveArrangementInput = {
        confirmedDate: confirmedDate || null,
        confirmedTime: confirmedTime.trim() || null,
        expectedArrival: eta || null,
        note: note.trim() || null,
      };
      await apiFetch(
        `/api/partner/deliveries/${encodeURIComponent(card.orderId)}/arrangement${scopeQs}`,
        { method: "PUT", body: JSON.stringify(body) },
      );
      toast.success(PA.saved);
      void qc.invalidateQueries({ queryKey: ["partner-deliveries"] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : PA.loadFailed);
    } finally {
      setBusy(false);
    }
  }

  async function sendCannotDeliver() {
    if (!cdReason) return;
    setBusy(true);
    try {
      const body: PartnerCannotDeliverInput = {
        reason: cdReason as PartnerCannotDeliverInput["reason"],
        note: cdNote.trim() || null,
      };
      await apiFetch(
        `/api/partner/deliveries/${encodeURIComponent(card.orderId)}/cannot-deliver${scopeQs}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      toast.success(PA.cannotDeliverSent);
      setCdOpen(false);
      void qc.invalidateQueries({ queryKey: ["partner-deliveries"] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : PA.loadFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm"
      data-testid={`partner-delivery-${card.orderId}-${card.leg}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-body font-semibold">{card.customerName}</div>
          <div className="text-meta text-muted-foreground">
            {[card.area, card.building].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="text-right text-meta text-muted-foreground">
          {card.doNumber ?? PA.noDo}
          {card.leg > 0 ? <div>Leg {card.leg}</div> : null}
        </div>
      </div>

      <div className="text-meta">
        <span className="text-muted-foreground">{PA.goods}: </span>
        {card.goodsSummary}
      </div>
      {card.customerPhone ? (
        <div className="text-meta">
          <span className="text-muted-foreground">{PA.phone}: </span>
          <a className="font-medium underline-offset-2 hover:underline" href={`tel:${card.customerPhone}`}>
            {card.customerPhone}
          </a>
        </div>
      ) : null}
      <div className="text-meta font-medium">
        {card.requestedDate
          ? `${PA.customerAsked}: ${fmtDate(card.requestedDate)}`
          : PA.noCustomerDate}
      </div>

      {card.cannotDeliverReported ? (
        <div
          className="rounded-control border border-border bg-accent/40 px-3 py-2 text-meta"
          data-testid="partner-cannot-deliver-reported"
        >
          {PA.cannotDeliverReported}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-label text-muted-foreground">
              {PA.confirmedDate}
              <input
                type="date"
                className={FIELD}
                value={confirmedDate}
                onChange={(e) => setConfirmedDate(e.target.value)}
                data-testid="partner-confirmed-date"
              />
            </label>
            <label className="flex flex-col gap-1 text-label text-muted-foreground">
              {PA.timeWindow}
              <input
                className={FIELD}
                placeholder="2pm–5pm"
                value={confirmedTime}
                onChange={(e) => setConfirmedTime(e.target.value)}
                data-testid="partner-confirmed-time"
              />
            </label>
            <label className="flex flex-col gap-1 text-label text-muted-foreground">
              {PA.eta}
              <input
                type="time"
                className={FIELD}
                value={eta}
                onChange={(e) => setEta(e.target.value)}
                data-testid="partner-eta"
              />
            </label>
            <label className="flex flex-col gap-1 text-label text-muted-foreground">
              {PA.note}
              <input
                className={FIELD}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                data-testid="partner-note"
              />
            </label>
          </div>

          <button
            type="button"
            className="h-10 rounded-control bg-primary text-primary-foreground text-body font-semibold disabled:opacity-40"
            onClick={save}
            disabled={busy}
            data-testid="partner-save-arrangement"
          >
            {busy ? PA.saving : PA.save}
          </button>

          {!cdOpen ? (
            <button
              type="button"
              className="h-9 rounded-control border border-border text-meta font-medium text-muted-foreground hover:bg-accent/40"
              onClick={() => setCdOpen(true)}
              data-testid="partner-cannot-deliver"
            >
              {PA.cannotDeliver}
            </button>
          ) : (
            <div className="flex flex-col gap-2 rounded-control border border-border p-3">
              <span className="text-meta font-medium">{PA.cannotDeliverWhy}</span>
              <select
                className={FIELD}
                value={cdReason}
                onChange={(e) => setCdReason(e.target.value)}
                data-testid="partner-cannot-deliver-reason"
              >
                <option value="">—</option>
                {CANNOT_DELIVER_REASONS.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
              <input
                className={FIELD}
                placeholder={PA.cannotDeliverNote}
                value={cdNote}
                onChange={(e) => setCdNote(e.target.value)}
                data-testid="partner-cannot-deliver-note"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="h-9 flex-1 rounded-control border border-border text-meta font-medium"
                  onClick={() => setCdOpen(false)}
                >
                  {PA.cancel}
                </button>
                <button
                  type="button"
                  className="h-9 flex-1 rounded-control bg-destructive text-destructive-foreground text-meta font-semibold disabled:opacity-40"
                  onClick={sendCannotDeliver}
                  disabled={busy || !cdReason || (cdReason === "other" && !cdNote.trim())}
                  data-testid="partner-cannot-deliver-send"
                >
                  {PA.cannotDeliverSend}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function PartnerArrangePage() {
  const q = useQuery({
    queryKey: ["partner-deliveries"],
    queryFn: () =>
      apiFetch<{ partner: string; deliveries: PartnerDeliveryCard[] }>(
        "/api/partner/deliveries",
      ),
  });

  const cards = useMemo(() => q.data?.deliveries ?? [], [q.data]);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 p-4" data-testid="partner-arrange">
      <h1 className="text-page font-semibold">{PA.page}</h1>
      <p className="text-meta text-muted-foreground">{PA.intro}</p>
      {q.isError ? (
        <div className="rounded-control border border-border bg-card p-4 text-meta">
          {PA.loadFailed}{" "}
          <button type="button" className="font-medium underline" onClick={() => void q.refetch()}>
            {PA.tryAgain}
          </button>
        </div>
      ) : cards.length === 0 && !q.isLoading ? (
        <div className="rounded-control border border-border bg-card p-4 text-meta text-muted-foreground">
          {PA.empty}
        </div>
      ) : (
        cards.map((card) => <DeliveryCard key={`${card.orderId}#${card.leg}`} card={card} />)
      )}
    </div>
  );
}
