/**
 * THE ACT CARD — one open act on the order (Workspace MASTER §5.10, owner
 * rulings Jess 2026-09-26/27: "WhatsApp can load a template, short, simple").
 *
 * ```
 *  (icon)  Call AL Logistics   AL Logistics · due Tue, 22 Sep      [Open WhatsApp group] [Copy message] [Open SO-1362]
 *          The delivery is not scheduled · Finish when: Scheduled delivery recorded
 *          Template [Delivery details ▾]   Show message   Open in Delivery ↗
 * ```
 *
 * One compact row per act, like a deal's next step: the sentence, the party
 * and date, one grey line of why and what finishes it, then — only when the
 * owning module supplies messages — the template picker with the message
 * folded away until `Show message`. The first act's WhatsApp door is the
 * panel's ONE blue; later acts go neutral. An admitted embedded action
 * (Delivery proof review) renders beneath with `Finish when: {statement}`.
 * Owner, timing and source live in their own section (`WorkOwnerSource`).
 */
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { OperationWorkItem } from "@carres/shared";
import Button from "@/components/kit/Button";
import Icon, { type IconName } from "@/components/kit/Icon";
import Select from "@/components/kit/Select";
import { fmtDate } from "@/lib/fmt-date";
import DeliveryProofReviewWork from "../components/DeliveryProofReviewWork";
import { WORK_MODULE_WORD } from "./module-word";

export const ACTION_COPY = {
  finishWhen: "Finish when",
  template: "Template",
  showMessage: "Show message",
  hideMessage: "Hide message",
  openGroup: "Open WhatsApp group",
  openWhatsApp: "Open WhatsApp",
  copyMessage: "Copy message",
  copied: "Message copied",
  copyFailed: "The message could not be copied.",
  due: (date: string) => `due ${date}`,
} as const;

export interface WorkMessageTemplate {
  key: string;
  label: string;
  message: string;
}

/** The owning module's prepared messages: who they go to, how, the governed
 *  templates (the first is the default) and the door that records the
 *  answer. Never a Workspace draft (§5.2). */
export interface WorkCommunication {
  party: string;
  channel: string;
  templates: WorkMessageTemplate[];
  /** A WhatsApp group (or chat) URL — the one blue when present. */
  href: string | null;
  /** The owning module's door that records the answer. */
  recordDoor: { label: string; to: string } | null;
}

const MODULE_ICON: Record<OperationWorkItem["module"], IconName> = {
  orders: "order", purchasing: "supplier", receiving: "warehouse", delivery: "delivery", payment: "money", issue_tracker: "flag",
};

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
  /** The order's cards carry the facts; the card says the completion statement. */
  hasParties?: boolean;
  /** An act that opens a fact card — the one blue when no message exists. */
  primaryAct?: { label: string; onClick: () => void } | null;
  /** The `Open {object}` door IS the act (a PO window with demand left opens
   *  SO Batch Purchase on exactly that window) — then it is the one blue. */
  openIsPrimary?: boolean;
  communication?: WorkCommunication | null;
  /** False for the second, third… act on an order: its buttons go neutral so
   *  the panel keeps ONE blue (the first act). */
  primary?: boolean;
}) {
  const [templateKey, setTemplateKey] = useState<string | undefined>(undefined);
  const [showMessage, setShowMessage] = useState(false);
  const template = communication
    ? communication.templates.find((t) => t.key === templateKey) ?? communication.templates[0] ?? null
    : null;
  /* The party is said once: `Call AL Logistics`, never `Call AL Logistics · AL Logistics`. */
  const partyInAction = Boolean(item.recipient && item.action.includes(item.recipient));
  const isEmbedded = item.interaction.mode === "embedded";
  const owningForm = item.interaction.mode === "embedded" && item.interaction.componentKey === "delivery.proof_review"
    ? <DeliveryProofReviewWork doNumber={item.object.id} />
    : null;
  const missed = item.timing.placement === "missed";
  const when = item.timing.actionOn ? ACTION_COPY.due(fmtDate(item.timing.actionOn)) : null;
  const timingLine = [partyInAction ? null : item.recipient, when].filter(Boolean).join(" · ");
  const finish = item.interaction.mode === "read_only" ? item.interaction.reason : hasParties ? item.completionStatement : item.requiredResult;
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
      className="shrink-0 rounded-work border border-work-line bg-white px-3 py-3 min-[768px]:px-4"
      data-testid="work-detail-header"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-kit-slate-3 text-kit-slate-11" aria-hidden="true">
          <Icon name={communication ? "message" : MODULE_ICON[item.module]} size={16} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <h2 className="text-[15px] font-semibold leading-5 text-kit-slate-12" data-testid="work-detail-title">{item.action}</h2>
            {timingLine ? (
              <span className={`text-[12px] leading-4 ${missed ? "font-semibold text-danger" : "text-kit-slate-11"}`} data-testid="work-detail-action">{timingLine}</span>
            ) : null}
            {!hasParties ? <span className="text-[12px] leading-4 text-kit-slate-11">{item.object.label} · {WORK_MODULE_WORD[item.module]}</span> : null}
          </div>
          <p className="text-[13px] leading-[18px] text-kit-slate-11">
            <span data-testid="work-detail-fact" className="text-kit-slate-12">{item.problem}</span>
            {!isEmbedded ? <> · {ACTION_COPY.finishWhen}: <span data-testid="work-detail-result">{finish}</span></> : null}
            {item.nextConsequence ? <> · <span data-testid="work-detail-next">{item.nextConsequence}</span></> : null}
          </p>
          {communication && template ? (
            <div className="mt-1 flex flex-col gap-2" data-testid="work-detail-communication">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-[12px] leading-4 text-kit-slate-11">{ACTION_COPY.template}</span>
                <div className="w-[200px]">
                  <Select id={`work-template-${item.id}`} toolbar options={communication.templates.map((t) => ({ value: t.key, label: t.label }))} value={template.key} onValueChange={setTemplateKey} />
                </div>
                <button type="button" className="text-[12px] leading-4 text-kit-slate-11 underline underline-offset-2 hover:text-kit-slate-12" onClick={() => setShowMessage((v) => !v)} data-testid="work-detail-toggle-message">
                  {showMessage ? ACTION_COPY.hideMessage : ACTION_COPY.showMessage}
                </button>
                {communication.recordDoor ? (
                  <Link className="inline-flex items-center gap-1 text-[12px] leading-4 text-kit-slate-11 underline underline-offset-2 hover:text-kit-slate-12" to={communication.recordDoor.to} data-testid="work-detail-record-door">
                    {communication.recordDoor.label}
                    <Icon name="open" size={14} />
                  </Link>
                ) : null}
              </div>
              {showMessage ? (
                <pre className="whitespace-pre-wrap break-words rounded-control border border-kit-slate-4 bg-kit-slate-2 px-3 py-2 font-sans text-[12px] leading-4 text-kit-slate-12" data-testid="work-detail-message">{template.message}</pre>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2" data-testid="work-detail-open-row">
          {communication?.href && template ? (
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
          {communication && template ? (
            <Button type="button" size="touch" icon="copy" onClick={() => void copy(template.message)} data-testid="work-detail-copy">{ACTION_COPY.copyMessage}</Button>
          ) : null}
          {primaryAct && !isEmbedded && !blueIsMessage && primary ? (
            <Button type="button" size="touch" variant="primary" onClick={primaryAct.onClick} data-testid="work-detail-primary-act">{primaryAct.label}</Button>
          ) : null}
          <Button type="button" size="touch" variant={openIsPrimary && !blueIsMessage && primary ? "primary" : "neutral"} onClick={onOpen} data-testid="work-detail-open">Open {item.object.label}</Button>
        </div>
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
