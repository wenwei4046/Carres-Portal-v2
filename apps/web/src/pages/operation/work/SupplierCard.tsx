/**
 * THE SUPPLIER PARTY CARD — Workspace MASTER §5.10 (owner approval 2026-09-25).
 *
 * ONE mission card for EVERY supplier of the Sales Order. Collapsed (exactly
 * 72px) it prints the group's progress plus the highest-material exception —
 * never a supplier name or PO number. Expanded, one compact row per PO: the
 * state, the original PO Delivery Date (never changes), the latest date, the
 * delay reason and evidence, the Supplier DO, Deliver to, the Warehouse's GRN,
 * and the owning doors. The model is `supplierCardModel`; the facts are
 * Purchasing's (`GET /api/operation/pos/for-order/:orderId`). Nothing here
 * writes: `Record supplier delay` opens the PO in Purchasing until the reply
 * rule is admitted as an embedded action (§5.1).
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { SUPPLIER_CARD_COPY as S, myHolidaySet, supplierCardModel, type SupplierRow } from "@carres/shared";
import Button from "@/components/kit/Button";
import Icon from "@/components/kit/Icon";
import { appTodayIso, fmtDateShort } from "@/lib/fmt-date";
import { useOperationSuppliers, useSupplierCardFacts } from "@/lib/queries";
import { buildSupplierChase, buildSupplierReminder } from "@/lib/wa-templates";
import { Fact, PartyCardShell, ToneLine } from "./PartyCardShell";

/* A date never splits over two lines (§5.10): `27 Oct` joined by a no-break space. */
const spell = (iso: string) => fmtDateShort(iso).replace(" ", "\u00a0");

/** The rows that carry a supplier act (a button) — the card and the panel's
 *  one-blue ranking ask the SAME predicate. Missed → today → attention. */
const ACT_STATES = new Set(["arrivalMissed", "delayed", "confirmationNeeded"]);
export function supplierActRowOf(rows: readonly SupplierRow[]): SupplierRow | null {
  const acting = rows.filter((r) => r.issued && ACT_STATES.has(r.state));
  return (
    acting.find((r) => r.tone === "missed") ??
    acting.find((r) => r.tone === "current") ??
    acting.find((r) => r.tone === "attention") ??
    null
  );
}
const poHref = (po: string) => `/operation/procurement?po=${encodeURIComponent(po)}`;

export function useSupplierCard(orderId: string) {
  const factsQ = useSupplierCardFacts(orderId);
  const model = useMemo(
    () =>
      factsQ.data
        ? supplierCardModel({ todayIso: appTodayIso(), holidays: myHolidaySet(), pos: factsQ.data.purchaseOrders, spell })
        : null,
    [factsQ.data],
  );
  return { factsQ, model };
}

export default function SupplierCard({
  orderId,
  reference,
  open,
  onToggle,
  primary,
}: {
  orderId: string;
  /** The order's CR/TCF reference — a supplier message never carries the SO. */
  reference: string | null;
  open: boolean;
  onToggle: (open: boolean) => void;
  primary: boolean;
}) {
  const { factsQ, model } = useSupplierCard(orderId);
  const suppliersQ = useOperationSuppliers();
  const groupOf = (name: string | null) =>
    (suppliersQ.data?.suppliers ?? []).find((s) => s.name === name)?.whatsapp_group_url ?? null;

  if (factsQ.isLoading && !model) {
    return <div className="h-[72px] shrink-0 animate-pulse rounded-work border border-work-line bg-white motion-reduce:animate-none" data-testid="party-supplier-loading" aria-label="Loading suppliers" />;
  }
  const failed = factsQ.isError || !model;
  const firstActionable = model ? supplierActRowOf(model.rows) : null;

  return (
    <PartyCardShell
      testId="party-supplier"
      anchorId={`party-supplier-${orderId}`}
      party={S.heading}
      heading={model?.heading ?? S.heading}
      status={
        failed ? (
          <ToneLine tone="attention">{S.unavailable}</ToneLine>
        ) : (
          <ToneLine tone={model.status.tone} testId="party-supplier-line">{model.status.text}</ToneLine>
        )
      }
      open={open}
      onToggle={onToggle}
    >
      {failed ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="touch" onClick={() => void factsQ.refetch()}>Try again</Button>
          <OpenPurchasing />
        </div>
      ) : model.rows.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-body text-kit-slate-11">{S.none}</p>
          <OpenPurchasing />
        </div>
      ) : (
        <>
          {model.rows.map((row) => (
            <SupplierRowView
              key={row.poNo}
              row={row}
              reference={reference}
              group={groupOf(row.supplier)}
              primary={primary && firstActionable?.poNo === row.poNo}
            />
          ))}
          <OpenPurchasing />
        </>
      )}
    </PartyCardShell>
  );
}

function OpenPurchasing() {
  return (
    <Link className="inline-flex min-h-10 items-center gap-1 self-start text-label text-kit-blue-11 hover:underline" to="/operation/procurement">
      {S.openPurchasing}
      <Icon name="open" size={14} />
    </Link>
  );
}

function SupplierRowView({ row, reference, group, primary }: { row: SupplierRow; reference: string | null; group: string | null; primary: boolean }) {
  const needsAct = row.issued && ACT_STATES.has(row.state);
  /* Purchasing's two tones: `Remind` before the date, the firmer chase once it passed. */
  const build = row.state === "arrivalMissed" ? buildSupplierChase : buildSupplierReminder;
  const message = build({
    poNo: row.poNo,
    ref: reference,
    lines: row.lines ?? [],
    deadline: row.effectiveIso ? spell(row.effectiveIso) : "—",
  });
  return (
    <section aria-label={`${row.supplier ?? row.poNo} · ${row.poNo}`} className="flex flex-col gap-1 border-b border-kit-slate-4 pb-3 last:border-b-0 last:pb-0" data-testid={`party-supplier-row-${row.poNo}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-[13px] font-semibold leading-[18px] text-kit-slate-12">
          {row.supplier ?? S.notRecorded} · <span className="tabular-nums">{row.poNo}</span>
        </span>
        <span className="text-[12px] leading-4 text-kit-slate-11 tabular-nums">{S.complete(row.checksDone)}</span>
      </div>
      <ToneLine tone={row.tone} testId={`party-supplier-state-${row.poNo}`}>{row.stateText}</ToneLine>
      <div className="mt-1 flex flex-col">
        <Fact label={S.poDate}>{row.originalIso ? spell(row.originalIso) : S.notRecorded}</Fact>
        <Fact label={S.latest}>{row.effectiveIso ? spell(row.effectiveIso) : S.notRecorded}</Fact>
        {row.reply?.answer === "delayed" ? <Fact label={S.delayReason}>{row.reply.reason ?? S.notRecorded}</Fact> : null}
        {row.reply?.evidence ? <Fact label={S.evidence}>{`WhatsApp · ${spell(row.reply.recordedAtIso)}`}</Fact> : null}
        {row.issued && !row.grnIso ? (
          <Fact label={S.supplierDo}>
            {row.supplierDo?.number || row.supplierDo?.atIso
              ? [row.supplierDo.number, row.supplierDo.atIso ? spell(row.supplierDo.atIso) : null].filter(Boolean).join(" · ")
              : row.confirmByIso
                ? `Needed by ${spell(row.confirmByIso)}`
                : "Not needed yet"}
          </Fact>
        ) : null}
        <Fact label={S.deliverTo}>{row.deliverTo ?? S.notRecorded}</Fact>
        <Fact label={S.grnLabel}>
          {row.grnIso
            ? row.orderedQty != null && row.receivedQty != null && row.receivedQty < row.orderedQty
              ? `${S.receivedOn(spell(row.grnIso))} · ${S.receivedQty(row.receivedQty, row.orderedQty)}`
              : S.receivedOn(spell(row.grnIso))
            : S.notReceived}
        </Fact>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {needsAct && row.issued ? (
          <>
            <Button
              size="touch"
              icon="copy"
              variant={primary ? "primary" : "neutral"}
              onClick={() => {
                void navigator.clipboard.writeText(message).then(
                  () => toast.success("Message copied"),
                  () => toast.error("The message could not be copied. Try again."),
                );
              }}
              data-testid={`party-supplier-copy-${row.poNo}`}
            >
              Copy message
            </Button>
            {group ? (
              <a className="inline-flex min-h-10 items-center gap-1 text-label text-kit-blue-11 hover:underline" href={group} target="_blank" rel="noreferrer">
                <Icon name="message" size={14} />
                Open WhatsApp group
              </a>
            ) : (
              <span className="text-label text-kit-slate-11">WhatsApp group not set</span>
            )}
          </>
        ) : null}
        {row.issued && !row.grnIso ? (
          <Link className="inline-flex min-h-10 items-center gap-1 text-label text-kit-blue-11 hover:underline" to={poHref(row.poNo)} data-testid={`party-supplier-delay-${row.poNo}`}>
            {S.recordDelay}
            <Icon name="open" size={14} />
          </Link>
        ) : null}
        <Link className="inline-flex min-h-10 items-center gap-1 text-label text-kit-blue-11 hover:underline" to={poHref(row.poNo)}>
          {S.openPo(row.poNo)}
          <Icon name="open" size={14} />
        </Link>
      </div>
    </section>
  );
}
