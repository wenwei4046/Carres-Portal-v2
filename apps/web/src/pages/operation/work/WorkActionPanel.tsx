/**
 * THE ACTION CARD — the top of the right panel (Workspace MASTER §5.10, owner
 * ruling Jess 2026-09-26 evening: "do", then "look").
 *
 * ```
 *   ACTION                                   COMMUNICATION · To AL Logistics · WhatsApp group
 *   Call AL Logistics                        ┌ TCF0541 · LIM KUAN YANG …            ┐
 *   AL Logistics · due Fri, 26 Sep (red)     └ Please send the scheduled delivery date ┘
 *   CURRENT FACT   The delivery is not…      [Open WhatsApp group] [Copy message]  Open in Delivery
 *   FINISH WHEN    Scheduled delivery recorded
 *   WHAT HAPPENS NEXT  (only when the source supplies one)
 *   [Open SO-1362]
 * ```
 *
 * COPY's own section words, nothing invented. Buttons live only here: the
 * ONE blue is the communication door when the owning module supplies a
 * message, else the `Open {object}` door. An admitted embedded action
 * (Delivery proof review) renders beneath with `Finish when: {statement}` and
 * is then the panel's one blue. Owner, timing and source live in their own
 * section at the bottom (`WorkOwnerSource`), never here.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { OperationWorkItem } from "@carres/shared";
import Button from "@/components/kit/Button";
import Icon from "@/components/kit/Icon";
import { fmtDate } from "@/lib/fmt-date";
import DeliveryProofReviewWork from "../components/DeliveryProofReviewWork";
import { WORK_MODULE_WORD } from "./module-word";
import { SectionTitle } from "./PartyCardShell";

export const ACTION_COPY = {
  action: "Action",
  fact: "Current fact",
  finishWhen: "Finish when",
  next: "What happens next",
  communication: "Communication",
  to: (party: string, channel: string) => `To ${party} · ${channel}`,
  openGroup: "Open WhatsApp group",
  openWhatsApp: "Open WhatsApp",
  copyMessage: "Copy message",
  copied: "Message copied",
  copyFailed: "The message could not be copied.",
  due: (date: string) => `due ${date}`,
} as const;

/** The owning module's prepared message: who it goes to, how, and the door
 *  that records the answer. Never a Workspace draft (§5.2). */
export interface WorkCommunication {
  party: string;
  channel: string;
  message: string;
  /** A WhatsApp group (or chat) URL — the one blue when present. */
  href: string | null;
  /** The owning module's door that records the answer. */
  recordDoor: { label: string; to: string } | null;
}

function Fact({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <>
      <dt className="text-[11px] font-semibold uppercase leading-4 tracking-[0.04em] text-kit-slate-11">{label}</dt>
      <dd className="min-w-0 text-[13px] leading-[18px] text-kit-slate-12" data-testid={testId}>{children}</dd>
    </>
  );
}

export default function WorkActionPanel({
  item,
  embedded,
  onOpen,
  hasParties = false,
  primaryAct = null,
  openIsPrimary = false,
  communication = null,
  primary = true,
}: {
  item: OperationWorkItem;
  embedded?: ReactNode;
  onOpen: () => void;
  /** The mission's party cards carry the result; the summary stays compact. */
  hasParties?: boolean;
  /** An act that opens a party card — the one blue when no message exists. */
  primaryAct?: { label: string; onClick: () => void } | null;
  /** The `Open {object}` door IS the act (a PO window with demand left opens
   *  SO Batch Purchase on exactly that window) — then it is the one blue. */
  openIsPrimary?: boolean;
  communication?: WorkCommunication | null;
  /** False for the second, third… act on an order: its buttons go neutral so
   *  the panel keeps ONE blue (the first act). */
  primary?: boolean;
}) {
  /* The party is said once: `Call AL Logistics`, never `Call AL Logistics · AL Logistics`. */
  const partyInAction = Boolean(item.recipient && item.action.includes(item.recipient));
  const isEmbedded = item.interaction.mode === "embedded";
  const owningForm = item.interaction.mode === "embedded" && item.interaction.componentKey === "delivery.proof_review"
    ? <DeliveryProofReviewWork doNumber={item.object.id} />
    : null;
  const missed = item.timing.placement === "missed";
  const when = item.timing.actionOn ? ACTION_COPY.due(fmtDate(item.timing.actionOn)) : null;
  const timingLine = [partyInAction ? null : item.recipient, when].filter(Boolean).join(" · ");
  const blueIsMessage = Boolean(communication?.href) && !isEmbedded && primary;
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(ACTION_COPY.copied);
    } catch {
      toast.error(ACTION_COPY.copyFailed);
    }
  };
  return (
    <section
      aria-label="Work summary"
      className="shrink-0 rounded-work border border-work-line bg-white p-3 min-[768px]:px-4 min-[768px]:py-3"
      data-testid="work-detail-header"
    >
      <div className={`grid gap-4 ${communication ? "min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}`}>
        <div className="flex min-w-0 flex-col gap-2">
          <div>
            <SectionTitle>{ACTION_COPY.action}</SectionTitle>
            {/* The order header below names the record on a mission; work with no
                party cards says it here. */}
            {!hasParties ? <p className="mt-0.5 text-[11px] leading-4 text-kit-slate-11">{item.object.label} · {WORK_MODULE_WORD[item.module]}</p> : null}
            <h2 className="text-[16px] font-semibold leading-[22px] text-kit-slate-12" data-testid="work-detail-title">{item.action}</h2>
            {timingLine ? (
              <p className={`text-[13px] leading-[18px] ${missed ? "font-semibold text-danger" : "text-kit-slate-11"}`} data-testid="work-detail-action">{timingLine}</p>
            ) : null}
          </div>
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1">
            <Fact label={ACTION_COPY.fact} testId="work-detail-fact">{item.problem}</Fact>
            {item.interaction.mode === "read_only" ? (
              <Fact label={ACTION_COPY.finishWhen} testId="work-detail-result">{item.interaction.reason}</Fact>
            ) : !isEmbedded ? (
              <Fact label={ACTION_COPY.finishWhen} testId="work-detail-result">{hasParties ? item.completionStatement : item.requiredResult}</Fact>
            ) : null}
            {item.nextConsequence ? <Fact label={ACTION_COPY.next} testId="work-detail-next">{item.nextConsequence}</Fact> : null}
          </dl>
          <div className="flex flex-wrap items-center gap-2" data-testid="work-detail-open-row">
            {primaryAct && !isEmbedded && !blueIsMessage && primary ? (
              <Button type="button" size="touch" variant="primary" onClick={primaryAct.onClick} data-testid="work-detail-primary-act">
                {primaryAct.label}
              </Button>
            ) : null}
            <Button type="button" size="touch" variant={openIsPrimary && !blueIsMessage && primary ? "primary" : "neutral"} onClick={onOpen} data-testid="work-detail-open">Open {item.object.label}</Button>
          </div>
        </div>
        {communication ? (
          <div className="flex min-w-0 flex-col gap-2 border-t border-work-line pt-3 min-[900px]:border-l min-[900px]:border-t-0 min-[900px]:pl-4 min-[900px]:pt-0" data-testid="work-detail-communication">
            <div className="flex items-baseline justify-between gap-3">
              <SectionTitle>{ACTION_COPY.communication}</SectionTitle>
              <span className="text-[12px] leading-4 text-kit-slate-11">{ACTION_COPY.to(communication.party, communication.channel)}</span>
            </div>
            <pre className="whitespace-pre-wrap break-words rounded-control border border-kit-slate-4 bg-kit-slate-2 px-3 py-2 font-sans text-[13px] leading-[18px] text-kit-slate-12" data-testid="work-detail-message">{communication.message}</pre>
            <div className="flex flex-wrap items-center gap-2">
              {communication.href ? (
                <a
                  href={communication.href}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex h-9 items-center gap-1.5 rounded-control px-3 text-[13px] font-semibold leading-[18px] ${blueIsMessage ? "bg-kit-blue-9 text-white hover:bg-kit-blue-10" : "border border-kit-slate-4 bg-white text-kit-slate-12 hover:bg-kit-slate-3"}`}
                  data-testid="work-detail-open-chat"
                >
                  <Icon name="message" size={14} />
                  {communication.channel === "WhatsApp group" ? ACTION_COPY.openGroup : ACTION_COPY.openWhatsApp}
                </a>
              ) : null}
              <Button type="button" size="touch" icon="copy" onClick={() => void copy(communication.message)} data-testid="work-detail-copy">{ACTION_COPY.copyMessage}</Button>
              {communication.recordDoor ? (
                <Link className="ml-auto inline-flex min-h-6 items-center gap-1 text-[13px] text-kit-slate-11 underline underline-offset-2 hover:text-kit-slate-12" to={communication.recordDoor.to} data-testid="work-detail-record-door">
                  {communication.recordDoor.label}
                  <Icon name="open" size={14} />
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      {isEmbedded ? (
        <section aria-label="Do this work" className="mt-3 flex max-w-[760px] flex-col gap-3" data-testid="work-detail-task">
          <p className="text-label text-kit-slate-11">Finish when: {item.completionStatement}</p>
          {embedded ?? owningForm}
        </section>
      ) : null}
    </section>
  );
}
