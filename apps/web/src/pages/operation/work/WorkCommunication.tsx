/**
 * ⭐ THE COMMUNICATION PANE — the right column, floor to ceiling (owner ruling,
 * Jess 2026-09-27: "right is WhatsApp and communication, a full pane").
 *
 *   To           Logistics | Customer | Supplier   (the first act's party leads)
 *   Template     the owning module's governed templates; the message in full
 *   doors        WhatsApp (the page's ONE blue) · Email · Copy message
 *   the answer   the owning module's door that records it
 *   history      what was recorded, newest first
 *
 * Every message is its owning module's (Delivery, Payment, Purchasing); Work
 * writes none and stores none. Opening a channel or copying text is never
 * sent evidence. No dash is printed: a template's dash becomes a comma.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { OperationWorkItem } from "@carres/shared";
import Button from "@/components/kit/Button";
import Icon from "@/components/kit/Icon";
import Select from "@/components/kit/Select";
import { displayCustomerName } from "@/lib/customer-name";
import { fmtDate } from "@/lib/fmt-date";
import { useOperationSuppliers } from "@/lib/queries";
import { buildCustomerChase, buildCustomerReminder, buildSupplierChase, buildSupplierReminder, salutationOf } from "@/lib/wa-templates";
import { useOrderIdFromRef } from "../delivery-scope-card";
import { moneyOfOrder } from "../sales-order-facts";
import { useGoodsName } from "./goods-name";
import { useLogisticsMessage, useLogisticsModel } from "./LogisticsCard";
import { orderRefOf } from "./order-ref";
import { SectionTitle } from "./PartyCardShell";
import { useSupplierCard } from "./SupplierCard";

type PartyKey = "logistics" | "customer" | "supplier";
const PARTY_WORD: Record<PartyKey, string> = { logistics: "Logistics", customer: "Customer", supplier: "Supplier" };
const RM = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** No dash reaches the screen or the clipboard (Jess, 2026-09-27). */
const plain = (text: string) => text.replace(/\s+[—–]\s+/g, ", ").replace(/[—–]/g, "not recorded");

interface Channel {
  to: string;
  channel: string;
  templates: { key: string; label: string; message: string }[];
  whatsapp: string | null;
  email: string | null;
  missing: string | null;
  door: { label: string; to: string };
}

export default function WorkCommunication({ items, party, onClose }: {
  items: OperationWorkItem[];
  /** The step open in the middle: the pane follows it. */
  party?: PartyKey;
  /** Drawn as a drawer: its close door. */
  onClose?: () => void;
}) {
  const first = items[0]!;
  const ref = orderRefOf(first);
  const orderId = useOrderIdFromRef(ref ?? {});
  if (!orderId) {
    return (
      <div className="flex flex-col gap-3 p-4" data-testid="work-communication">
        <SectionTitle>Communication</SectionTitle>
        <p className="text-[13px] leading-[18px] text-kit-slate-11">{first.recipient ?? first.object.label}</p>
        <Link className="inline-flex items-center gap-1 self-start text-[13px] text-kit-slate-11 underline underline-offset-2 hover:text-kit-slate-12" to={first.destination}>
          Open {first.object.label}
          <Icon name="open" size={14} />
        </Link>
      </div>
    );
  }
  return <OrderCommunication key={orderId} orderId={orderId} items={items} follow={party} onClose={onClose} />;
}

function OrderCommunication({ orderId, items, follow, onClose }: { orderId: string; items: OperationWorkItem[]; follow?: PartyKey; onClose?: () => void }) {
  const first = items[0]!;
  const lm = useLogisticsModel(orderId);
  const logistics = useLogisticsMessage(orderId);
  const supplier = useSupplierCard(orderId);
  const suppliersQ = useOperationSuppliers();
  const nameOf = useGoodsName();
  const o = lm.o;
  const startParty: PartyKey = first.module === "delivery" ? "logistics" : first.module === "purchasing" || first.module === "receiving" ? "supplier" : "customer";
  const [party, setParty] = useState<PartyKey>(follow ?? startParty);
  useEffect(() => { if (follow) { setParty(follow); setTemplateKey(undefined); } }, [follow]);
  const [templateKey, setTemplateKey] = useState<string | undefined>(undefined);
  const [poNo, setPoNo] = useState<string | undefined>(undefined);

  const reference = (o?.source_ref ?? []).filter(Boolean).join(" · ") || null;
  const issuedRows = useMemo(() => (supplier.model?.rows ?? []).filter((r) => r.issued), [supplier.model]);
  const row = issuedRows.find((r) => r.poNo === poNo) ?? issuedRows[0] ?? null;

  const channel: Channel | null = useMemo(() => {
    if (party === "logistics") {
      if (!logistics) return null;
      return {
        to: logistics.party, channel: logistics.channel, templates: logistics.templates, whatsapp: logistics.href, email: null,
        missing: logistics.href ? null : "WhatsApp group not set",
        door: logistics.recordDoor,
      };
    }
    if (party === "customer") {
      if (!o) return null;
      const name = displayCustomerName(o.customer_name) || "Name not recorded";
      const phone = (o.customer_phone ?? "").replace(/\D/g, "");
      const email = (o.customer_email ?? "").trim() || null;
      const money = moneyOfOrder(o);
      const owed = money.known && money.outstanding > 0;
      const input = { salutation: salutationOf(null, o.customer_name), ref: reference, outstanding: RM.format(owed ? money.outstanding : 0), lines: (o.order_lines ?? []).map((l) => ({ sku: nameOf(l.sku), qty: l.qty })) };
      return {
        to: name, channel: "WhatsApp",
        templates: owed
          ? [
              { key: "reminder", label: "Payment reminder", message: buildCustomerReminder(input) },
              { key: "followup", label: "Payment follow-up", message: buildCustomerChase(input) },
            ]
          : [],
        whatsapp: phone ? `https://wa.me/${phone.startsWith("0") ? `6${phone}` : phone}` : null,
        email: email ? `mailto:${email}` : null,
        missing: phone ? null : "No phone recorded",
        door: { label: "Open Sales Order", to: `/operation/orders/so/${encodeURIComponent(orderId)}` },
      };
    }
    if (!row) return null;
    const input = { poNo: row.poNo, ref: reference, lines: (row.lines ?? []).map((l) => ({ sku: nameOf(l.sku), qty: l.qty })), deadline: row.effectiveIso ? fmtDate(row.effectiveIso) : "TBD" };
    const group = (suppliersQ.data?.suppliers ?? []).find((s) => s.name === row.supplier)?.whatsapp_group_url ?? null;
    return {
      to: row.supplier ?? row.poNo, channel: "WhatsApp group",
      templates: [
        { key: "reminder", label: "Reminder", message: buildSupplierReminder(input) },
        { key: "followup", label: "Date passed", message: buildSupplierChase(input) },
      ],
      whatsapp: group, email: null,
      missing: group ? null : "WhatsApp group not set",
      door: { label: "Open Purchasing", to: `/operation/procurement?po=${encodeURIComponent(row.poNo)}` },
    };
  }, [party, logistics, o, reference, nameOf, orderId, row, suppliersQ.data]);

  const template = channel ? channel.templates.find((t) => t.key === templateKey) ?? channel.templates[0] ?? null : null;
  const message = template ? plain(template.message) : null;
  const history = party === "logistics" ? lm.facts?.history ?? [] : [];
  const copy = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Message copied");
    } catch {
      toast.error("The message could not be copied.");
    }
  };
  const door = (href: string, name: "message" | "mail", label: string, blue: boolean, testId: string) => (
    <a href={href} target="_blank" rel="noreferrer" aria-label={label} title={label} data-testid={testId}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${blue ? "bg-kit-blue-9 text-white hover:bg-kit-blue-10" : "border border-kit-slate-4 bg-white text-kit-slate-12 hover:bg-kit-slate-3"}`}>
      <Icon name={name} size={18} />
    </a>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4" data-testid="work-communication">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <SectionTitle>Communication</SectionTitle>
          {onClose ? <button type="button" aria-label="Close" title="Close" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-control text-kit-slate-11 hover:bg-kit-slate-3"><Icon name="close" size={16} /></button> : null}
        </div>
        <div className="inline-flex self-start overflow-hidden rounded-control border border-kit-slate-4" role="tablist" aria-label="Party">
          {(["logistics", "customer", "supplier"] as PartyKey[]).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={party === k} onClick={() => { setParty(k); setTemplateKey(undefined); }}
              className={`h-[34px] px-3 text-control ${party === k ? "bg-kit-slate-3 font-semibold text-kit-slate-12" : "bg-white text-kit-slate-11 hover:bg-kit-slate-2"}`}
              data-testid={`work-comm-party-${k}`}>
              {PARTY_WORD[k]}
            </button>
          ))}
        </div>
      </div>
      {!channel ? (
        <p className="text-[13px] leading-[18px] text-kit-slate-11" data-testid="work-comm-none">
          {party === "logistics" ? "Logistics not assigned" : party === "supplier" ? "No purchase order for this Sales Order" : "Order details unavailable"}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-0.5">
            <p className="text-[15px] font-semibold leading-5 text-kit-slate-12" data-testid="work-comm-to">To {channel.to}</p>
            <p className="text-[12px] leading-4 text-kit-slate-11">{channel.missing ?? channel.channel}</p>
          </div>
          {party === "supplier" && issuedRows.length > 1 ? (
            <Select id={`work-comm-po-${orderId}`} label="PO No" toolbar options={issuedRows.map((r) => ({ value: r.poNo, label: `${r.supplier ?? ""} · ${r.poNo}` }))} value={row?.poNo} onValueChange={setPoNo} />
          ) : null}
          {template ? (
            <>
              <Select id={`work-comm-template-${orderId}`} label="Template" toolbar options={channel.templates.map((t) => ({ value: t.key, label: t.label }))} value={template.key} onValueChange={setTemplateKey} />
              <pre className="whitespace-pre-wrap break-words rounded-control border border-kit-slate-4 bg-kit-slate-2 px-3 py-2.5 font-sans text-[13px] leading-[18px] text-kit-slate-12" data-testid="work-comm-message">{message}</pre>
            </>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {channel.whatsapp ? door(channel.whatsapp, "message", channel.channel === "WhatsApp group" ? "Open WhatsApp group" : "Open WhatsApp", true, "work-comm-whatsapp") : null}
            {channel.email ? door(channel.email, "mail", "Open email", false, "work-comm-email") : null}
            {message ? <Button type="button" size="touch" icon="copy" onClick={() => void copy()} data-testid="work-comm-copy">Copy message</Button> : null}
          </div>
          <Link className="inline-flex items-center gap-1 self-start text-[13px] text-kit-slate-11 underline underline-offset-2 hover:text-kit-slate-12" to={channel.door.to} data-testid="work-comm-door">
            {channel.door.label}
            <Icon name="open" size={14} />
          </Link>
          {history.length > 0 ? (
            <div className="flex flex-col gap-2 border-t border-kit-slate-4 pt-3">
              <SectionTitle>Evidence and recent history</SectionTitle>
              <ol className="flex flex-col gap-2">
                {history.map((h, i) => (
                  <li key={`${h.at}-${i}`} className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 text-[12px] leading-4">
                    <span className="text-kit-slate-11">{fmtDate(h.at)}</span>
                    <span className="min-w-0 text-kit-slate-12">{HISTORY_WORD[h.event] ?? "Activity"}<span className="text-kit-slate-11">{[h.detail, h.who].filter(Boolean).length ? ` · ${[h.detail, h.who].filter(Boolean).join(" · ")}` : ""}</span></span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

const HISTORY_WORD: Record<string, string> = {
  assigned: "Logistics assigned",
  changed: "Logistics changed",
  cleared: "Logistics removed",
  cannot_deliver: "Cannot deliver",
  arrangement_saved: "Scheduled delivery saved",
  another_date: "Requested another date",
};
