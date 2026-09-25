/**
 * THE PO WINDOW MISSION — the Work right panel for `purchasing.po_window`
 * (Purchasing §5.6.1 · Workspace §6.1 · owner rulings 2026-09-24/25).
 *
 * Below the summary, two sections and nothing else:
 *
 *   To buy        one line per supplier: `{n} items · {m} Sales Orders`. The
 *                 act is the summary's `Open {window}` door — SO Batch
 *                 Purchase scoped to exactly this window's lines.
 *   POs to send   one 72px card per PO issued from the window, unsent first.
 *                 Opening one shows Jess's send line and THE shared send area
 *                 (`PoIssueEvidence`, Purchasing §8.2) — never a second set of
 *                 send controls. Opening WhatsApp or email records nothing;
 *                 only `PO sent to supplier` does.
 *
 * ONE blue act: while demand is left the summary door is blue and every PO
 * card starts closed; once everything is bought, the first unsent PO opens
 * and its `PO sent to supplier` is the blue act.
 *
 * The window is computed with `poWindowWorkFromSoBatch` — the function the
 * Work feed itself ran — over the same SO Batch read, so the card and this
 * panel cannot disagree.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PO_WINDOW_WORK_COPY as W,
  poWindowWorkFromSoBatch,
  soBatchPurchaseResponseSchema,
  type OperationWorkItem,
  type PoWindowPo,
  type PoWindowWork,
  type SoBatchPurchaseResponse,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { qk, useOperationSuppliers, type operationPosListResponse } from "@/lib/queries";
import PoIssueEvidence, { doorsForIssuedPo, type IssuedPo } from "../components/PoIssueEvidence";
import { Fact, PartyCardShell, SectionTitle, ToneLine } from "./PartyCardShell";
import { WorkSection } from "./WorkCard";

const DEMANDS_KEY = ["so-batch-purchase"] as const;

export function usePoWindow(item: OperationWorkItem): {
  window: PoWindowWork | null;
  loading: boolean;
  failed: boolean;
} {
  const demands = useQuery<SoBatchPurchaseResponse>({
    queryKey: [...DEMANDS_KEY, null],
    queryFn: async () =>
      soBatchPurchaseResponseSchema.parse(await apiFetch<unknown>("/api/operation/purchase/demands")) as SoBatchPurchaseResponse,
    staleTime: 15_000,
  });
  const suppliers = useOperationSuppliers();
  if (demands.isLoading || suppliers.isLoading) return { window: null, loading: true, failed: false };
  if (demands.isError || !demands.data) return { window: null, loading: false, failed: true };
  try {
    const all = poWindowWorkFromSoBatch(
      demands.data,
      (suppliers.data?.suppliers ?? []) as never,
      { keepClosed: true },
    );
    return { window: all.find((w) => w.key === item.object.id) ?? null, loading: false, failed: false };
  } catch {
    return { window: null, loading: false, failed: true };
  }
}

function PoSendCard({
  po,
  open,
  onToggle,
  onSent,
}: {
  po: PoWindowPo;
  open: boolean;
  onToggle: (open: boolean) => void;
  onSent: () => void;
}) {
  /* The PO's own register row — version, send history, destination and the
     supplier's recorded doors — read only while its card is open. */
  const row = useQuery({
    queryKey: ["operation", "pos", "one", po.poId],
    queryFn: () => apiFetch<operationPosListResponse>(`/api/operation/pos?status=all&poId=${encodeURIComponent(po.poId)}`),
    enabled: open && !po.sent,
    staleTime: 10_000,
  });
  const suppliers = useOperationSuppliers();
  const found = row.data?.pos.find((p) => p.id === po.poId) ?? null;
  const supplier = (suppliers.data?.suppliers ?? []).find((s) => s.id === po.supplierId) as
    | { whatsapp_group_url?: string | null; contact_email?: string | null; contact?: string | null }
    | undefined;
  const destinations = [...(row.data?.destinations ?? []), ...(row.data?.referencedDestinations ?? [])];
  const issued: IssuedPo | null = found
    ? {
        id: found.id,
        supplierId: found.supplier_id,
        supplierName: po.supplierName,
        destinationId: found.destination_id ?? "not-recorded",
        destination: destinations.find((d) => d.id === found.destination_id)?.name ?? null,
        whatsappGroupUrl: supplier?.whatsapp_group_url ?? null,
        contactEmail: supplier?.contact_email ?? null,
        contact: supplier?.contact ?? null,
      }
    : null;
  return (
    <PartyCardShell
      testId={`po-window-po-${po.poId}`}
      party={po.documentNo}
      heading={`${po.documentNo} · ${po.supplierName}`}
      status={<ToneLine tone={po.sent ? "done" : "attention"}>{po.sent ? W.sentWord : W.notSentWord}</ToneLine>}
      open={open}
      onToggle={onToggle}
    >
      {po.sent ? (
        <p className="text-body text-kit-slate-11">{W.sentWord}</p>
      ) : (
        <>
          <p className="text-body font-medium text-kit-slate-12" data-testid={`po-window-act-${po.poId}`}>{po.act}</p>
          {row.isLoading ? (
            <p className="text-body text-kit-slate-11" role="status">Loading…</p>
          ) : issued && found ? (
            <PoIssueEvidence
              po={issued}
              version={found.version ?? 1}
              evidence={found.sends ?? []}
              doors={doorsForIssuedPo(issued, row.data?.messageTemplate ?? null)}
              onConfirmed={onSent}
            />
          ) : (
            <p className="text-body text-kit-slate-11" role="status">Some information could not be refreshed.</p>
          )}
        </>
      )}
    </PartyCardShell>
  );
}

export default function PoWindowPanel({ item }: { item: OperationWorkItem }) {
  const queryClient = useQueryClient();
  const { window, loading, failed } = usePoWindow(item);
  const demandLeft = (window?.demand.rowIds.length ?? 0) > 0;
  const firstUnsent = window?.pos.find((po) => !po.sent)?.poId ?? null;
  const [openPo, setOpenPo] = useState<string | null>(null);
  /* One card at a time; once buying is done the first unsent PO opens so its
     `PO sent to supplier` is the panel's one blue act. */
  useEffect(() => {
    setOpenPo(demandLeft ? null : firstUnsent);
  }, [item.id, demandLeft, firstUnsent]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: DEMANDS_KEY });
    void queryClient.invalidateQueries({ queryKey: ["operation", "pos"] });
    void queryClient.invalidateQueries({ queryKey: qk.operation.work() });
  };

  if (loading) {
    return (
      <WorkSection className="shrink-0 p-3" data-testid="po-window-loading">
        <div className="h-5 w-40 animate-pulse rounded bg-kit-slate-3" />
      </WorkSection>
    );
  }
  if (failed || !window) {
    return (
      <WorkSection className="shrink-0 p-3" role="status" data-testid="po-window-failed">
        <p className="text-body text-kit-slate-12">Some information could not be refreshed.</p>
      </WorkSection>
    );
  }
  return (
    <>
      {demandLeft ? (
        <WorkSection className="flex shrink-0 flex-col gap-2 p-3 min-[960px]:px-4" aria-label={W.demandHeading} data-testid="po-window-demand">
          <SectionTitle>{W.demandHeading}</SectionTitle>
          {window.demand.suppliers.map((s) => (
            <Fact key={s.supplierId ?? s.supplier} label={s.supplier} testId={`po-window-supplier-${s.supplierId ?? "none"}`}>
              {W.itemsWord(s.items)} · {s.orders} {s.orders === 1 ? "Sales Order" : "Sales Orders"}
            </Fact>
          ))}
        </WorkSection>
      ) : null}
      {window.pos.length > 0 ? (
        <section className="flex shrink-0 flex-col gap-2" aria-label={W.posHeading} data-testid="po-window-pos">
          <SectionTitle>{W.posHeading}</SectionTitle>
          {window.pos.map((po) => (
            <PoSendCard
              key={po.poId}
              po={po}
              open={openPo === po.poId}
              onToggle={(next) => setOpenPo(next ? po.poId : null)}
              onSent={refresh}
            />
          ))}
        </section>
      ) : null}
    </>
  );
}
