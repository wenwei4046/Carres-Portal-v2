/**
 * ⭐ THE COMMUNICATION PANE — the Work page's right column (Workspace MASTER
 * §5.10 A6a/A8 and BUILD SHEET, LOCKED 2026-09-28).
 *
 *   tabs       Supplier · Warehouse · Logistics · Customer — one per outside
 *              party on the Route, always there, on one row; the act being
 *              worked picks the tab
 *   To         the party's RECORDED channels only (Supplier Master, Delivery,
 *              the Sales Order) — never typed
 *   Template   the owning module's governed templates; the message beneath
 *   doors      WhatsApp and Email as icons, then `Copy message`
 *   History    folded to one line `History {n}`, opened on press
 *
 * Every message is its owning module's; Work writes none and stores none.
 * Opening a channel or copying text completes nothing. A send act has no
 * governed supplier message, so the pane says `Message not available` and
 * `Copy message` is off. No dash is printed.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Button from "@/components/kit/Button";
import Icon from "@/components/kit/Icon";
import Select from "@/components/kit/Select";
import Tabs from "@/components/kit/Tabs";
import { displayCustomerName } from "@/lib/customer-name";
import { fmtDate } from "@/lib/fmt-date";
import { useOperationSuppliers } from "@/lib/queries";
import { buildCustomerChase, buildCustomerReminder, buildSupplierChase, buildSupplierReminder, salutationOf } from "@/lib/wa-templates";
import { moneyOfOrder } from "../sales-order-facts";
import { useGoodsName } from "./goods-name";
import { useLogisticsMessage, useLogisticsModel } from "./LogisticsCard";
import { useSupplierCard } from "./SupplierCard";
import type { CommParty } from "./work-stops";

export const COMM_COPY = {
  title: "Communication",
  to: "To",
  template: "Template",
  message: "Message",
  notAvailable: "Message not available",
  copy: "Copy message",
  copied: "Message copied",
  copyFailed: "The message could not be copied.",
  history: (n: number) => `History ${n}`,
  whatsapp: "Open WhatsApp",
  email: "Open email",
} as const;

const PARTY_WORD: Record<CommParty, string> = { supplier: "Supplier", warehouse: "Warehouse", logistics: "Logistics", customer: "Customer" };
const PARTIES: readonly CommParty[] = ["supplier", "warehouse", "logistics", "customer"];
const RM = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** No dash reaches the screen or the clipboard (Jess, 2026-09-27). */
const plain = (text: string) => text.replace(/\s+[—–]\s+/g, ", ").replace(/[—–]/g, " ");

interface Door {
  key: string;
  /** `Ohana · WhatsApp group` — the recorded channel, never typed. */
  label: string;
  whatsapp: string | null;
  email: string | null;
}

interface PartyChannel {
  doors: Door[];
  templates: { key: string; label: string; message: string }[];
  history: { at: string; text: string }[];
}

const HISTORY_WORD: Record<string, string> = {
  assigned: "Logistics assigned",
  changed: "Logistics changed",
  cleared: "Logistics removed",
  cannot_deliver: "Cannot deliver",
  arrangement_saved: "Scheduled delivery saved",
  another_date: "Requested another date",
};

export default function WorkCommunication(props: {
  /** The order the Mission shows; null on a PO view (A3). */
  orderId: string | null;
  /** A PO view's supplier: its recorded channels only. */
  supplierName?: string | null;
  party: CommParty;
  onParty: (party: CommParty) => void;
  /** The act being worked is a PO send: no governed supplier message exists. */
  sendAct: boolean;
}) {
  if (props.orderId) return <OrderCommunication {...props} orderId={props.orderId} />;
  return <PoCommunication supplierName={props.supplierName ?? null} party={props.party} onParty={props.onParty} />;
}

/** A PO view has one outside party on its page: the supplier. */
function PoCommunication({ supplierName, party, onParty }: { supplierName: string | null; party: CommParty; onParty: (party: CommParty) => void }) {
  const suppliersQ = useOperationSuppliers();
  const s = (suppliersQ.data?.suppliers ?? []).find((x) => x.name === supplierName) as
    | { whatsapp_group_url?: string | null; contact_email?: string | null }
    | undefined;
  const doors: Door[] = [
    ...(s?.whatsapp_group_url ? [{ key: "wa", label: `${supplierName} · WhatsApp group`, whatsapp: s.whatsapp_group_url, email: null }] : []),
    ...(s?.contact_email ? [{ key: "mail", label: `${supplierName} · Email`, whatsapp: null, email: `mailto:${s.contact_email}` }] : []),
  ];
  return <CommunicationPane scope="po" party={party} onParty={onParty} channel={party === "supplier" ? { doors, templates: [], history: [] } : EMPTY} />;
}

const EMPTY: PartyChannel = { doors: [], templates: [], history: [] };

function OrderCommunication({
  orderId,
  party,
  onParty,
  sendAct,
}: {
  orderId: string;
  party: CommParty;
  onParty: (party: CommParty) => void;
  sendAct: boolean;
}) {
  const lm = useLogisticsModel(orderId);
  const logistics = useLogisticsMessage(orderId);
  const supplier = useSupplierCard(orderId);
  const suppliersQ = useOperationSuppliers();
  const nameOf = useGoodsName();
  const o = lm.o;
  const [doorKey, setDoorKey] = useState<string | undefined>(undefined);
  useEffect(() => setDoorKey(undefined), [party, orderId]);

  const reference = (o?.source_ref ?? []).filter(Boolean).join(" · ") || null;
  const issuedRows = useMemo(() => (supplier.model?.rows ?? []).filter((r) => r.issued), [supplier.model]);

  const channel: PartyChannel = useMemo(() => {
    if (party === "logistics") {
      return {
        doors: logistics ? [{ key: "logistics", label: `${logistics.party} · ${logistics.channel}`, whatsapp: logistics.href, email: null }] : [],
        templates: logistics?.templates ?? [],
        history: (lm.facts?.history ?? []).map((h) => ({ at: h.at, text: [HISTORY_WORD[h.event] ?? "Activity", h.detail, h.who].filter(Boolean).join(" · ") })),
      };
    }
    if (party === "customer") {
      if (!o) return { doors: [], templates: [], history: [] };
      const name = displayCustomerName(o.customer_name) || "Name not recorded";
      const phone = (o.customer_phone ?? "").replace(/\D/g, "");
      const email = (o.customer_email ?? "").trim() || null;
      const money = moneyOfOrder(o);
      const owed = money.known && money.outstanding > 0;
      const input = { salutation: salutationOf(null, o.customer_name), ref: reference, outstanding: RM.format(owed ? money.outstanding : 0), lines: (o.order_lines ?? []).map((l) => ({ sku: nameOf(l.sku), qty: l.qty })) };
      return {
        doors: [
          ...(phone ? [{ key: "wa", label: `${name} · WhatsApp`, whatsapp: `https://wa.me/${phone.startsWith("0") ? `6${phone}` : phone}`, email: null }] : []),
          ...(email ? [{ key: "mail", label: `${name} · Email`, whatsapp: null, email: `mailto:${email}` }] : []),
        ],
        templates: owed
          ? [
              { key: "reminder", label: "Payment reminder", message: buildCustomerReminder(input) },
              { key: "followup", label: "Payment follow-up", message: buildCustomerChase(input) },
            ]
          : [],
        history: [],
      };
    }
    if (party === "supplier") {
      const doors: Door[] = [];
      for (const row of issuedRows) {
        const s = (suppliersQ.data?.suppliers ?? []).find((x) => x.name === row.supplier) as
          | { whatsapp_group_url?: string | null; contact_email?: string | null }
          | undefined;
        const who = row.supplier ?? row.poNo;
        if (s?.whatsapp_group_url) doors.push({ key: `${row.poNo}:wa`, label: `${who} · WhatsApp group`, whatsapp: s.whatsapp_group_url, email: null });
        if (s?.contact_email) doors.push({ key: `${row.poNo}:mail`, label: `${who} · Email`, whatsapp: null, email: `mailto:${s.contact_email}` });
      }
      const unique = doors.filter((d, i) => doors.findIndex((x) => x.label === d.label) === i);
      const chosenPo = issuedRows.find((r) => doorKey?.startsWith(`${r.poNo}:`)) ?? issuedRows[0] ?? null;
      const input = chosenPo
        ? { poNo: chosenPo.poNo, ref: reference, lines: (chosenPo.lines ?? []).map((l) => ({ sku: nameOf(l.sku), qty: l.qty })), deadline: chosenPo.effectiveIso ? fmtDate(chosenPo.effectiveIso) : "" }
        : null;
      return {
        doors: unique,
        templates:
          sendAct || !input
            ? []
            : [
                { key: "reminder", label: "Reminder", message: buildSupplierReminder(input) },
                { key: "followup", label: "Date passed", message: buildSupplierChase(input) },
              ],
        history: [],
      };
    }
    return { doors: [], templates: [], history: [] };
  }, [party, logistics, lm.facts, o, reference, nameOf, issuedRows, suppliersQ.data, sendAct, doorKey]);

  return <CommunicationPane scope={orderId} party={party} onParty={onParty} channel={channel} doorKey={doorKey} onDoor={setDoorKey} />;
}

function CommunicationPane({
  scope,
  party,
  onParty,
  channel,
  doorKey: doorKeyProp,
  onDoor,
}: {
  /** What the pane is about — a new scope resets its choices. */
  scope: string;
  party: CommParty;
  onParty: (party: CommParty) => void;
  channel: PartyChannel;
  doorKey?: string;
  onDoor?: (key: string) => void;
}) {
  const [ownDoor, setOwnDoor] = useState<string | undefined>(undefined);
  const doorKey = doorKeyProp ?? ownDoor;
  const setDoorKey = onDoor ?? setOwnDoor;
  const [templateKey, setTemplateKey] = useState<string | undefined>(undefined);
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    setTemplateKey(undefined);
    setHistoryOpen(false);
  }, [party, scope]);
  const door = channel.doors.find((d) => d.key === doorKey) ?? channel.doors[0] ?? null;
  const template = channel.templates.find((t) => t.key === templateKey) ?? channel.templates[0] ?? null;
  const message = template ? plain(template.message) : null;
  const copy = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      toast.success(COMM_COPY.copied);
    } catch {
      toast.error(COMM_COPY.copyFailed);
    }
  };
  const iconDoor = (href: string | null, name: "message" | "mail", label: string, testId: string) =>
    href ? (
      <a href={href} target="_blank" rel="noreferrer" aria-label={label} title={label} data-testid={testId}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-kit-slate-5 bg-white text-kit-slate-12 hover:bg-kit-slate-3">
        <Icon name={name} size={16} />
      </a>
    ) : (
      <span aria-label={label} title={label} aria-disabled="true" data-testid={testId}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-kit-slate-5 bg-kit-slate-2 text-kit-slate-9">
        <Icon name={name} size={16} />
      </span>
    );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="work-communication">
      <header className="flex h-16 shrink-0 items-center border-b border-kit-slate-5 px-4">
        <h2 className="text-strong text-kit-slate-12">{COMM_COPY.title}</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pt-2">
          <Tabs
            fill
            label={COMM_COPY.title}
            value={party}
            onValueChange={(v) => onParty(v as CommParty)}
            tabs={PARTIES.map((p) => ({ value: p, label: PARTY_WORD[p] }))}
          />
        </div>
        <div className="flex flex-col gap-3 p-4">
          <Select
            id={`work-comm-to-${scope}`}
            label={COMM_COPY.to}
            value={door?.key}
            disabled={channel.doors.length === 0}
            onValueChange={setDoorKey}
            options={channel.doors.map((d) => ({ value: d.key, label: d.label }))}
          />
          {channel.templates.length > 0 ? (
            <Select
              id={`work-comm-template-${scope}`}
              label={COMM_COPY.template}
              value={template?.key}
              onValueChange={setTemplateKey}
              options={channel.templates.map((t) => ({ value: t.key, label: t.label }))}
            />
          ) : null}
          <div className="flex flex-col gap-1">
            <span className="text-label text-kit-slate-11">{COMM_COPY.message}</span>
            <p className="whitespace-pre-wrap break-words rounded-control border border-kit-slate-5 px-3 py-2 text-body text-kit-slate-12" data-testid="work-comm-message">
              {message ?? COMM_COPY.notAvailable}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {iconDoor(door?.whatsapp ?? null, "message", COMM_COPY.whatsapp, "work-comm-whatsapp")}
            {iconDoor(door?.email ?? null, "mail", COMM_COPY.email, "work-comm-email")}
            <Button size="touch" disabled={!message} onClick={() => void copy()} data-testid="work-comm-copy">{COMM_COPY.copy}</Button>
          </div>
        </div>
        <div className="border-t border-kit-slate-5">
          <button
            type="button"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex h-12 w-full items-center gap-2 px-4 text-left hover:bg-kit-slate-2"
            data-testid="work-comm-history"
          >
            <span className="flex-1 text-strong text-kit-slate-12">{COMM_COPY.history(channel.history.length)}</span>
            <Icon name={historyOpen ? "collapse" : "forward"} size={16} />
          </button>
          {historyOpen ? (
            <ol className="flex flex-col gap-2 px-4 pb-4">
              {channel.history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="flex flex-col text-body text-kit-slate-12">
                  {h.text}
                  <span className="text-meta text-kit-slate-11">{fmtDate(h.at)}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </div>
    </div>
  );
}
