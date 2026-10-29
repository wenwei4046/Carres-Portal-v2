import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import { FieldError } from "@/components/kit/FieldFrame";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import CouldNotLoad from "@/pages/operation/components/CouldNotLoad";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";

/**
 * Delivery Returns + Load Scan (migration 0716).
 *
 * Weisiang's decision (Mr Lim, Houzs owner side, WhatsApp 2026-10-22): office
 * staff record Delivery Returns and mark DOs Delivered by load scan, the Houzs
 * way. This overturns Jess's Delivery MASTER §6.1, §7 and §8 rules; Jess was
 * not part of this decision. Refund status is a status only: Finance still
 * owns the money, so nothing here posts a payment or a credit note.
 */

const BASE = "/api/operation/delivery-returns";
type Site = { id: string; name: string };
type PickUnit = { id: string; unit_code: string; sku: string };
type PickLine = { id: string; sku: string; qty: number; returned: number; remaining: number };
type Returnable = { deliveryOrder: { id: string; do_number: string }; mode: "units" | "lines"; units: PickUnit[]; lines: PickLine[] };
export type RefundStatus = "pending" | "refunded" | "not_refunded";
export const REFUND_STATUS: { value: RefundStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "refunded", label: "Refunded" },
  { value: "not_refunded", label: "Not refunded" },
];
/* Each returned Unit or line carries a condition, default New. Follows Houzs
   frontend/src/pages/scm-v2/DeliveryReturnFromDo.tsx:55,303 per Weisiang's ruling
   (2026-10-22): clear Carres rules, implement Houzs. */
type Condition = "NEW" | "OPENED" | "DAMAGED" | "DEFECTIVE";
const CONDITIONS: { value: Condition; label: string }[] = [
  { value: "NEW", label: "New" }, { value: "OPENED", label: "Opened" },
  { value: "DAMAGED", label: "Damaged" }, { value: "DEFECTIVE", label: "Defective" },
];
export const refundLabel = (s: string) => REFUND_STATUS.find((r) => r.value === s)?.label ?? s;

type ReturnRow = {
  id: string; return_no: string; created_at: string; reason: string; refund_status: RefundStatus;
  warehouses: { name: string } | null;
  ops_delivery_orders: { do_number: string } | null;
  orders: { so: number; customer_name: string } | null;
  delivery_return_units: { ops_stock_items: { unit_code: string; sku: string } | null }[];
  delivery_return_lines?: { qty_returned: number; order_lines: { sku: string } | null }[];
};

const post = <T,>(path: string, body: unknown) =>
  apiFetch<T>(`${BASE}${path}`, { method: "POST", body: JSON.stringify(body) });
const errorText = (e: unknown) => (e instanceof Error ? e.message : "Could not save. Try again.");

function Page({ word, testId, children }: { word: string; testId: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid={testId}>
      <ModuleHeader destinationHeader testId={`${testId}-header`} word={word} docTitle={`${word} · Delivery · Carres`} />
      {children}
    </div>
  );
}

export function DeliveryReturns() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["delivery-returns"], queryFn: () => apiFetch<{ returns: ReturnRow[] }>(BASE) });
  const sites = useQuery({ queryKey: ["delivery-returns", "sites"], queryFn: () => apiFetch<{ sites: Site[] }>(`${BASE}/sites`), staleTime: 300_000 });
  const [open, setOpen] = useState(false);
  const [doNo, setDoNo] = useState("");
  const [lookFor, setLookFor] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [lineQty, setLineQty] = useState<Record<string, number>>({});
  const [cond, setCond] = useState<Record<string, Condition>>({});
  const [siteId, setSiteId] = useState("");
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState<ReturnRow | null>(null);
  const [refund, setRefund] = useState<RefundStatus>("pending");
  const units = useQuery({
    queryKey: ["delivery-returns", "units", lookFor],
    queryFn: () => apiFetch<Returnable>(`${BASE}/delivered-units?do=${encodeURIComponent(lookFor)}`),
    enabled: Boolean(lookFor),
    retry: false,
  });
  const reset = () => { setOpen(false); setDoNo(""); setLookFor(""); setPicked([]); setLineQty({}); setCond({}); setReason(""); };
  const byLine = units.data?.mode === "lines";
  const pickedLines = Object.entries(lineQty).filter(([, q]) => q > 0).map(([orderLineId, qty]) => ({ orderLineId, qty, condition: cond[orderLineId] ?? "NEW" }));
  const find = () => { setPicked([]); setLineQty({}); setCond({}); setLookFor(doNo.trim()); };
  const save = useMutation({
    mutationFn: () => post("", { deliveryOrderId: units.data?.deliveryOrder.id, ...(byLine ? { lines: pickedLines } : { unitIds: picked, conditions: Object.fromEntries(picked.map((id) => [id, cond[id] ?? "NEW"])) }), siteId, reason }),
    onSuccess: () => { reset(); void qc.invalidateQueries({ queryKey: ["delivery-returns"] }); },
  });
  const saveRefund = useMutation({
    mutationFn: () => post(`/${editing?.id}/refund-status`, { status: refund }),
    onSuccess: () => { setEditing(null); void qc.invalidateQueries({ queryKey: ["delivery-returns"] }); },
  });
  const columns = useMemo<DataGridColumn<ReturnRow>[]>(() => [
    { key: "no", label: "Return No", width: 170, accessor: (r) => r.return_no },
    { key: "date", label: "Date", width: 110, accessor: (r) => fmtDate(r.created_at), dateValue: (r) => r.created_at, filterType: "date" },
    { key: "do", label: "DO No", width: 150, accessor: (r) => r.ops_delivery_orders?.do_number ?? "" },
    { key: "so", label: "SO No", width: 110, accessor: (r) => (r.orders ? `SO-${r.orders.so}` : "") },
    { key: "customer", label: "Customer", width: 200, accessor: (r) => r.orders?.customer_name ?? "" },
    { key: "units", label: "Units", width: 260, accessor: (r) => [
      ...r.delivery_return_units.map((u) => u.ops_stock_items?.unit_code),
      ...(r.delivery_return_lines ?? []).map((l) => (l.order_lines ? `${l.order_lines.sku} × ${l.qty_returned}` : null)),
    ].filter(Boolean).join(", ") },
    { key: "site", label: "Site", width: 160, accessor: (r) => r.warehouses?.name ?? "", filterType: "enum" },
    { key: "reason", label: "Reason", width: 220, accessor: (r) => r.reason },
    { key: "refund", label: "Refund status", width: 140, accessor: (r) => refundLabel(r.refund_status), filterType: "enum" },
  ], []);

  return (
    <Page word="Delivery Returns" testId="delivery-returns">
      {list.isError ? <CouldNotLoad detail="The delivery returns could not be loaded." onRetry={() => void list.refetch()} /> : (
        <ListPageShell register>
          <DataGrid rows={list.data?.returns ?? []} columns={columns} rowKey={(r) => r.id}
            storageKey="carres.delivery.returns.v1" appearance="reference" exportName="Delivery Returns"
            groupBanner={false} stickyIdentity isLoading={!list.isSuccess} searchPlaceholder="Search return, DO, customer or Unit ID…"
            onRowClick={(r) => { setEditing(r); setRefund(r.refund_status); }}
            toolbarEnd={<Button variant="primary" icon="add" onClick={() => setOpen(true)}>New Delivery Return</Button>}
            emptyMessage="No delivery returns yet." />
        </ListPageShell>
      )}
      <Modal open={open} onOpenChange={(o) => (o ? setOpen(true) : reset())} width="wide" title="New Delivery Return"
        footer={<>
          <Button variant="neutral" onClick={reset}>Close</Button>
          <Button variant="primary" loading={save.isPending} disabled={!units.data || (byLine ? pickedLines.length === 0 : picked.length === 0) || !siteId || !reason.trim()} onClick={() => save.mutate()}>Save</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <Input id="dr-do" label="DO No" value={doNo} onChange={(e) => setDoNo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") find(); }} />
            <Button variant="neutral" disabled={!doNo.trim()} onClick={find}>Find</Button>
          </div>
          {units.isError && <FieldError>{errorText(units.error)}</FieldError>}
          {units.data && byLine && (
            /* No Unit list on this DO: return by DO line and qty, capped at
               delivered minus already returned. Follows Houzs
               frontend/src/pages/scm-v2/DeliveryReturnFromDo.tsx:8-17 per
               Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs. */
            <div className="flex max-h-64 flex-col gap-2 overflow-auto rounded-control border border-c-line p-2" aria-label="Lines">
              {units.data.lines.every((l) => l.remaining === 0) && <p className="text-body text-c-muted">No delivered lines left to return on this DO.</p>}
              {units.data.lines.filter((l) => l.remaining > 0).map((l) => (
                <div key={l.id} className="grid grid-cols-[1fr_10rem] items-end gap-2">
                  <Input id={`dr-line-${l.id}`} type="number" min={0} max={l.remaining}
                    label={`${l.sku} · ${l.remaining} of ${l.qty} can come back`}
                    value={String(lineQty[l.id] ?? 0)}
                    onChange={(e) => setLineQty({ ...lineQty, [l.id]: Math.min(l.remaining, Math.max(0, Math.trunc(Number(e.target.value) || 0))) })} />
                  <Select id={`dr-line-cond-${l.id}`} label="Condition" value={cond[l.id] ?? "NEW"}
                    onValueChange={(v) => setCond({ ...cond, [l.id]: v as Condition })} options={CONDITIONS} />
                </div>
              ))}
            </div>
          )}
          {units.data && !byLine && (
            <div className="max-h-64 overflow-auto rounded-control border border-c-line p-2" aria-label="Units">
              {units.data.units.length === 0 && <p className="text-body text-c-muted">No delivered Units on this DO.</p>}
              {units.data.units.map((u) => (
                <div key={u.id} className="grid grid-cols-[1fr_10rem] items-center gap-2">
                  <Checkbox id={`dr-unit-${u.id}`} label={`${u.unit_code} · ${u.sku}`}
                    checked={picked.includes(u.id)}
                    onCheckedChange={(on) => setPicked(on ? [...picked, u.id] : picked.filter((x) => x !== u.id))} />
                  <Select id={`dr-unit-cond-${u.id}`} label="Condition" value={cond[u.id] ?? "NEW"}
                    onValueChange={(v) => setCond({ ...cond, [u.id]: v as Condition })} options={CONDITIONS} />
                </div>
              ))}
            </div>
          )}
          <Select id="dr-site" label="Back in stock at" value={siteId} onValueChange={setSiteId}
            options={(sites.data?.sites ?? []).map((s) => ({ value: s.id, label: s.name }))} />
          <Textarea id="dr-reason" label="Reason" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          {save.isError && <FieldError>{errorText(save.error)}</FieldError>}
        </div>
      </Modal>
      <Modal open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={`Refund status · ${editing?.return_no ?? ""}`}
        footer={<>
          <Button variant="neutral" onClick={() => setEditing(null)}>Close</Button>
          <Button variant="primary" loading={saveRefund.isPending} onClick={() => saveRefund.mutate()}>Save</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <Select id="dr-refund" label="Refund status" value={refund} onValueChange={(v) => setRefund(v as RefundStatus)} options={REFUND_STATUS} />
          <p className="text-body text-c-muted">Finance records the money. This is the status only.</p>
          {saveRefund.isError && <FieldError>{errorText(saveRefund.error)}</FieldError>}
        </div>
      </Modal>
    </Page>
  );
}

type ScanResult = { already: boolean; do_number: string; so: number };

export function LoadScan() {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const scan = useMutation({
    mutationFn: (c: string) => post<ScanResult>("/load-scan", { code: c }),
    onSuccess: (r, c) => {
      setDone((d) => [`${c} · ${r.do_number} · ${r.already ? "Already delivered" : "Delivered"}`, ...d]);
      setCode("");
      void qc.invalidateQueries();
    },
  });
  const submit = () => { if (code.trim()) scan.mutate(code.trim()); };
  return (
    <Page word="Load Scan" testId="load-scan">
      <div className="flex max-w-xl flex-col gap-3 p-4">
        <p className="text-body text-c-muted">Scan a DO No or a Unit ID. Its Delivery Order is marked Delivered. No signed DO or photo is needed.</p>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Input id="load-scan-code" label="DO No or Unit ID" autoFocus value={code} onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          <Button variant="primary" loading={scan.isPending} disabled={!code.trim()} onClick={submit}>Mark delivered</Button>
        </div>
        {scan.isError && <FieldError>{errorText(scan.error)}</FieldError>}
        {done.length > 0 && (
          <ul className="flex flex-col gap-1 text-body" aria-label="Scanned">
            {done.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        )}
      </div>
    </Page>
  );
}
