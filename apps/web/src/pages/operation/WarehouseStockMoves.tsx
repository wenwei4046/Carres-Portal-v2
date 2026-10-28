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
import ConfirmActionDialog from "@/pages/operation/components/ConfirmActionDialog";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";

/**
 * Stock Adjustment · Stock Transfer · Stock Take (migration 0714).
 *
 * Weisiang's decision (Mr Lim, Houzs owner side, WhatsApp 2026-10-22): office
 * staff adjust, transfer and count stock the Houzs way. This overturns Jess's
 * Stock MASTER §12.4 / §12.5 / §12.7 rules; Jess was not part of this decision.
 * Carres keeps its Units underneath: every line here picks or births exact
 * Units, never a bare quantity.
 */

const BASE = "/api/ops/stock-moves";
type Site = { id: string; name: string };
type PickUnit = { id: string; unit_code: string; sku: string; status: string; reserved_ref: string | null; needs_repair: boolean };
type UnitRef = { ops_stock_items: { unit_code: string; sku: string } | null };
type PlusLine = { sku: string; qty: string };

const post = <T,>(path: string, body: unknown) =>
  apiFetch<T>(`${BASE}${path}`, { method: "POST", body: JSON.stringify(body) });

function useSites() {
  return useQuery({ queryKey: ["stock-moves", "sites"], queryFn: () => apiFetch<{ sites: Site[] }>(`${BASE}/sites`), staleTime: 300_000 });
}
function siteName(sites: Site[] | undefined, id: string) {
  return sites?.find((s) => s.id === id)?.name ?? "";
}
function unitCodes(units: UnitRef[]) {
  return units.map((u) => u.ops_stock_items?.unit_code).filter(Boolean).join(", ");
}
function plusPayload(lines: PlusLine[]) {
  return lines.filter((l) => l.sku.trim()).map((l) => ({ sku: l.sku.trim(), qty: Number(l.qty) || 0 }));
}

function Page({ word, testId, children }: { word: string; testId: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid={testId}>
      <ModuleHeader destinationHeader testId={`${testId}-header`} word={word} docTitle={`${word} · Warehouse · Carres`} />
      {children}
    </div>
  );
}

/** Pick exact Units standing at one Site. */
function UnitPicker({ siteId, picked, onChange, allowReserved }: {
  siteId: string; picked: string[]; onChange: (ids: string[]) => void; allowReserved: boolean;
}) {
  const [find, setFind] = useState("");
  const q = useQuery({
    queryKey: ["stock-moves", "units", siteId],
    queryFn: () => apiFetch<{ units: PickUnit[] }>(`${BASE}/units?siteId=${siteId}`),
    enabled: Boolean(siteId),
  });
  if (!siteId) return null;
  const needle = find.trim().toLowerCase();
  const units = (q.data?.units ?? []).filter((u) => !needle || `${u.unit_code} ${u.sku}`.toLowerCase().includes(needle));
  return (
    <div className="flex flex-col gap-2">
      <Input id="find-unit" label="Find Unit" value={find} onChange={(e) => setFind(e.target.value)} />
      {q.isError && <FieldError>The Units could not be loaded. Try again.</FieldError>}
      <div className="max-h-64 overflow-auto rounded-control border border-c-line p-2" aria-label="Units">
        {q.isSuccess && units.length === 0 && <p className="text-body text-c-muted">No Units here.</p>}
        {units.map((u) => {
          const blocked = u.needs_repair || (!allowReserved && u.status === "reserved");
          const why = u.needs_repair ? " · In repair" : u.status === "reserved" ? ` · Reserved for ${u.reserved_ref ?? "a Sales Order"}` : "";
          return (
            <Checkbox
              key={u.id}
              id={`unit-${u.id}`}
              label={`${u.unit_code} · ${u.sku}${why}`}
              disabled={blocked}
              checked={picked.includes(u.id)}
              onCheckedChange={(on) => onChange(on ? [...picked, u.id] : picked.filter((x) => x !== u.id))}
            />
          );
        })}
      </div>
      <p className="text-body text-c-muted">{picked.length} Units picked</p>
    </div>
  );
}

/** Lines of goods that get NEW Unit IDs (Stock Adjustment plus, Stock Take extras). */
function PlusLines({ lines, onChange }: { lines: PlusLine[]; onChange: (l: PlusLine[]) => void }) {
  const set = (i: number, patch: Partial<PlusLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="flex flex-col gap-2">
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
          <Input id={`plus-sku-${i}`} label="Item" value={l.sku} onChange={(e) => set(i, { sku: e.target.value })} />
          <Input id={`plus-qty-${i}`} label="Qty" type="number" min={1} value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} />
          <Button variant="ghost" onClick={() => onChange(lines.filter((_, j) => j !== i))}>Remove</Button>
        </div>
      ))}
      <div><Button variant="neutral" icon="add" onClick={() => onChange([...lines, { sku: "", qty: "1" }])}>Add line</Button></div>
    </div>
  );
}

function SiteSelect({ id, label, value, onChange, sites }: { id: string; label: string; value: string; onChange: (v: string) => void; sites: Site[] }) {
  return <Select id={id} label={label} value={value} onValueChange={onChange} options={sites.map((s) => ({ value: s.id, label: s.name }))} />;
}

function errorText(e: unknown) {
  return e instanceof Error ? e.message : "Could not save. Try again.";
}

// ── Stock Adjustment ──────────────────────────────────────────────────────────
type AdjustmentRow = {
  id: string; adjustment_no: string; warehouse_id: string; reason: string; created_at: string;
  stock_counts: { count_no: string } | null;
  stock_adjustment_units: (UnitRef & { direction: "plus" | "minus" })[];
};

export function StockAdjustments() {
  const qc = useQueryClient();
  const sites = useSites();
  const list = useQuery({ queryKey: ["stock-moves", "adjustments"], queryFn: () => apiFetch<{ adjustments: AdjustmentRow[] }>(`${BASE}/adjustments`) });
  const [open, setOpen] = useState(false);
  const [siteId, setSiteId] = useState("");
  const [reason, setReason] = useState("");
  const [minus, setMinus] = useState<string[]>([]);
  const [plus, setPlus] = useState<PlusLine[]>([]);
  const [confirming, setConfirming] = useState(false);
  const save = useMutation({
    mutationFn: () => post("/adjustments", { siteId, reason, minusUnitIds: minus, plus: plusPayload(plus) }),
    onSuccess: () => {
      setConfirming(false); setOpen(false); setMinus([]); setPlus([]); setReason("");
      void qc.invalidateQueries({ queryKey: ["stock-moves"] });
    },
  });
  const columns = useMemo<DataGridColumn<AdjustmentRow>[]>(() => [
    { key: "no", label: "Adjustment No", width: 170, accessor: (r) => r.adjustment_no },
    { key: "date", label: "Date", width: 110, accessor: (r) => fmtDate(r.created_at), dateValue: (r) => r.created_at, filterType: "date" },
    { key: "site", label: "Site", width: 180, accessor: (r) => siteName(sites.data?.sites, r.warehouse_id), filterType: "enum" },
    { key: "reason", label: "Reason", width: 240, accessor: (r) => r.reason },
    { key: "minus", label: "Written off", width: 260, accessor: (r) => unitCodes(r.stock_adjustment_units.filter((u) => u.direction === "minus")) },
    { key: "plus", label: "Added", width: 260, accessor: (r) => unitCodes(r.stock_adjustment_units.filter((u) => u.direction === "plus")) },
    { key: "count", label: "Stock Take", width: 170, accessor: (r) => r.stock_counts?.count_no ?? "" },
  ], [sites.data]);

  return (
    <Page word="Stock Adjustment" testId="stock-adjustments">
      {list.isError ? <p role="alert" className="p-4 text-body">The stock adjustments could not be loaded. Try again.</p> : (
        <ListPageShell register>
          <DataGrid rows={list.data?.adjustments ?? []} columns={columns} rowKey={(r) => r.id}
            storageKey="carres.warehouse.stock-adjustments.v1" appearance="reference" exportName="Stock Adjustment"
            groupBanner={false} stickyIdentity isLoading={!list.isSuccess} searchPlaceholder="Search adjustment, reason or Unit ID…"
            toolbarEnd={<Button variant="primary" icon="add" onClick={() => setOpen(true)}>New Stock Adjustment</Button>}
            emptyMessage="No stock adjustments yet." />
        </ListPageShell>
      )}
      <Modal open={open} onOpenChange={setOpen} width="wide" title="New Stock Adjustment"
        footer={<>
          <Button variant="neutral" onClick={() => setOpen(false)}>Close</Button>
          <Button variant="primary" loading={save.isPending} disabled={!siteId || !reason.trim() || (minus.length === 0 && plusPayload(plus).length === 0)}
            onClick={() => (minus.length > 0 ? setConfirming(true) : save.mutate())}>Save</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <SiteSelect id="adj-site" label="Site" value={siteId} onChange={(v) => { setSiteId(v); setMinus([]); }} sites={sites.data?.sites ?? []} />
          <Textarea id="adj-reason" label="Reason" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="text-body font-semibold">Write off</p>
          <UnitPicker siteId={siteId} picked={minus} onChange={setMinus} allowReserved={false} />
          <p className="text-body font-semibold">Add</p>
          <PlusLines lines={plus} onChange={setPlus} />
          {!confirming && save.isError && <FieldError>{errorText(save.error)}</FieldError>}
        </div>
      </Modal>
      <ConfirmActionDialog open={confirming} title="Write off Units?"
        message={`${minus.length} ${minus.length === 1 ? "Unit" : "Units"} will be written off. This cannot be undone.`}
        confirmLabel="Write off and save" pending={save.isPending} error={save.isError ? errorText(save.error) : null}
        onConfirm={() => save.mutate()} onCancel={() => setConfirming(false)} />
    </Page>
  );
}

// ── Stock Transfer ────────────────────────────────────────────────────────────
type TransferRow = {
  id: string; transfer_no: string; from_site_id: string; to_site_id: string; note: string | null;
  status: "posted" | "cancelled"; created_at: string; cancel_reason: string | null;
  stock_transfer_units: UnitRef[];
};

export function StockTransfers() {
  const qc = useQueryClient();
  const sites = useSites();
  const list = useQuery({ queryKey: ["stock-moves", "transfers"], queryFn: () => apiFetch<{ transfers: TransferRow[] }>(`${BASE}/transfers`) });
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [units, setUnits] = useState<string[]>([]);
  const [cancelling, setCancelling] = useState<TransferRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const done = () => void qc.invalidateQueries({ queryKey: ["stock-moves"] });
  const save = useMutation({
    mutationFn: () => post("/transfers", { fromSiteId: from, toSiteId: to, unitIds: units, note }),
    onSuccess: () => { setOpen(false); setUnits([]); setNote(""); done(); },
  });
  const cancel = useMutation({
    mutationFn: () => post(`/transfers/${cancelling?.id}/cancel`, { reason: cancelReason }),
    onSuccess: () => { setCancelling(null); setCancelReason(""); done(); },
  });
  const columns = useMemo<DataGridColumn<TransferRow>[]>(() => [
    { key: "no", label: "Transfer No", width: 170, accessor: (r) => r.transfer_no },
    { key: "date", label: "Date", width: 110, accessor: (r) => fmtDate(r.created_at), dateValue: (r) => r.created_at, filterType: "date" },
    { key: "from", label: "Pickup Location", width: 180, accessor: (r) => siteName(sites.data?.sites, r.from_site_id), filterType: "enum" },
    { key: "to", label: "Delivery Location", width: 180, accessor: (r) => siteName(sites.data?.sites, r.to_site_id), filterType: "enum" },
    { key: "units", label: "Units", width: 280, accessor: (r) => unitCodes(r.stock_transfer_units) },
    { key: "status", label: "Status", width: 120, accessor: (r) => (r.status === "posted" ? "Posted" : "Cancelled"), filterType: "enum" },
    { key: "reason", label: "Reason", width: 220, accessor: (r) => r.cancel_reason ?? r.note ?? "" },
  ], [sites.data]);

  return (
    <Page word="Stock Transfer" testId="stock-transfers">
      {list.isError ? <p role="alert" className="p-4 text-body">The stock transfers could not be loaded. Try again.</p> : (
        <ListPageShell register>
          <DataGrid rows={list.data?.transfers ?? []} columns={columns} rowKey={(r) => r.id}
            storageKey="carres.warehouse.stock-transfers.v1" appearance="reference" exportName="Stock Transfer"
            groupBanner={false} stickyIdentity isLoading={!list.isSuccess} searchPlaceholder="Search transfer or Unit ID…"
            onRowClick={(r) => r.status === "posted" && setCancelling(r)}
            toolbarEnd={<Button variant="primary" icon="add" onClick={() => setOpen(true)}>New Stock Transfer</Button>}
            emptyMessage="No stock transfers yet." />
        </ListPageShell>
      )}
      <Modal open={open} onOpenChange={setOpen} width="wide" title="New Stock Transfer"
        description="The Units move as soon as you save."
        footer={<>
          <Button variant="neutral" onClick={() => setOpen(false)}>Close</Button>
          <Button variant="primary" loading={save.isPending} disabled={!from || !to || from === to || units.length === 0} onClick={() => save.mutate()}>Save</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <SiteSelect id="tr-from" label="Pickup Location" value={from} onChange={(v) => { setFrom(v); setUnits([]); }} sites={sites.data?.sites ?? []} />
          <SiteSelect id="tr-to" label="Delivery Location" value={to} onChange={setTo} sites={(sites.data?.sites ?? []).filter((s) => s.id !== from)} />
          <Textarea id="tr-note" label="Reason" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          <UnitPicker siteId={from} picked={units} onChange={setUnits} allowReserved />
          {save.isError && <FieldError>{errorText(save.error)}</FieldError>}
        </div>
      </Modal>
      <Modal open={cancelling !== null} onOpenChange={(o) => !o && setCancelling(null)} title={`Cancel ${cancelling?.transfer_no ?? ""}`}
        description="The Units move back to the Pickup Location."
        footer={<>
          <Button variant="neutral" onClick={() => setCancelling(null)}>Close</Button>
          <Button variant="primary" loading={cancel.isPending} disabled={!cancelReason.trim()} onClick={() => cancel.mutate()}>Cancel transfer</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <Textarea id="tr-cancel-reason" label="Reason" required rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          {cancel.isError && <FieldError>{errorText(cancel.error)}</FieldError>}
        </div>
      </Modal>
    </Page>
  );
}

// ── Stock Take ────────────────────────────────────────────────────────────────
type CountRow = {
  id: string; count_no: string; warehouse_id: string; blind: boolean; note: string | null;
  status: "open" | "posted"; created_at: string; posted_at: string | null;
  stock_adjustments: { adjustment_no: string }[];
};
type CountDetail = {
  count: { id: string; count_no: string; blind: boolean; status: "open" | "posted"; extras: { sku: string; qty: number }[] };
  units: { found: boolean | null; ops_stock_items: { id: string; unit_code: string; sku: string } | null }[];
  foundCodes: string[];
};

function CountSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["stock-moves", "count", id], queryFn: () => apiFetch<CountDetail>(`${BASE}/counts/${id}`) });
  const [found, setFound] = useState<string[] | null>(null);
  // Blind count: keep what was typed as raw text, so a scanner's Enter is not eaten. Split only on save.
  const [rawCodes, setRawCodes] = useState<string | null>(null);
  const [confirmingPost, setConfirmingPost] = useState(false);
  const [extras, setExtras] = useState<PlusLine[] | null>(null);
  const codes = rawCodes !== null ? rawCodes.split(/\s+/).filter(Boolean) : found ?? q.data?.foundCodes ?? [];
  const lines = extras ?? (q.data?.count.extras ?? []).map((e) => ({ sku: e.sku, qty: String(e.qty) }));
  const record = useMutation({
    mutationFn: (postIt: boolean) => post(`/counts/${id}`, { found: codes, extras: plusPayload(lines), post: postIt }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["stock-moves"] }); onClose(); },
  });
  const c = q.data?.count;
  const isOpen = c?.status === "open";
  // Units on the sheet that have not been counted: Post writes these off.
  const uncounted = (q.data?.units ?? []).filter((u) => u.ops_stock_items && !codes.includes(u.ops_stock_items.unit_code)).length;
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} width="wide" title={c ? `Stock Take ${c.count_no}` : "Stock Take"}
      description={isOpen ? "Post writes off every Unit not counted and adds the goods with no Unit ID." : undefined}
      footer={<>
        <Button variant="neutral" onClick={onClose}>Close</Button>
        {isOpen && <Button variant="neutral" loading={record.isPending && record.variables === false} onClick={() => record.mutate(false)}>Save</Button>}
        {isOpen && <Button variant="primary" loading={record.isPending && record.variables === true} onClick={() => setConfirmingPost(true)}>Post</Button>}
      </>}>
      {q.isError && <FieldError>The Stock Take could not be loaded. Try again.</FieldError>}
      {c && (
        <div className="flex flex-col gap-3">
          {c.blind && isOpen ? (
            <Textarea id="count-codes" label="Unit IDs counted" hint="One Unit ID per line, or scan them." rows={8}
              value={rawCodes ?? codes.join("\n")} onChange={(e) => setRawCodes(e.target.value)} />
          ) : (
            <div className="max-h-72 overflow-auto rounded-control border border-c-line p-2" aria-label="Units">
              {(q.data?.units ?? []).map((u) => u.ops_stock_items && (
                <Checkbox key={u.ops_stock_items.id} id={`count-${u.ops_stock_items.id}`} disabled={!isOpen}
                  label={`${u.ops_stock_items.unit_code} · ${u.ops_stock_items.sku}`}
                  checked={codes.includes(u.ops_stock_items.unit_code)}
                  onCheckedChange={(on) => {
                    const code = u.ops_stock_items!.unit_code;
                    setFound(on ? [...codes, code] : codes.filter((x) => x !== code));
                  }} />
              ))}
            </div>
          )}
          <p className="text-body text-c-muted">{codes.length} Units counted</p>
          <p className="text-body font-semibold">Goods with no Unit ID</p>
          {isOpen ? <PlusLines lines={lines} onChange={setExtras} /> : <p className="text-body">{lines.map((l) => `${l.sku} ×${l.qty}`).join(", ")}</p>}
          {!confirmingPost && record.isError && <FieldError>{errorText(record.error)}</FieldError>}
        </div>
      )}
      <ConfirmActionDialog open={confirmingPost} title="Post this Stock Take?"
        message={c?.blind
          ? `Every Unit at this Site that is not in your ${codes.length} counted will be written off. This cannot be undone.`
          : `${uncounted} ${uncounted === 1 ? "Unit" : "Units"} will be written off. This cannot be undone.`}
        confirmLabel="Post Stock Take" pending={record.isPending} error={record.isError ? errorText(record.error) : null}
        onConfirm={() => record.mutate(true)} onCancel={() => setConfirmingPost(false)} />
    </Modal>
  );
}

export function StockTakes() {
  const qc = useQueryClient();
  const sites = useSites();
  const list = useQuery({ queryKey: ["stock-moves", "counts"], queryFn: () => apiFetch<{ counts: CountRow[] }>(`${BASE}/counts`) });
  const [open, setOpen] = useState(false);
  const [siteId, setSiteId] = useState("");
  const [blind, setBlind] = useState(false);
  const [note, setNote] = useState("");
  const [sheet, setSheet] = useState<string | null>(null);
  const start = useMutation({
    mutationFn: () => post<{ id: string }>("/counts", { siteId, blind, note }),
    onSuccess: (r) => { setOpen(false); setNote(""); void qc.invalidateQueries({ queryKey: ["stock-moves"] }); setSheet(r.id); },
  });
  const columns = useMemo<DataGridColumn<CountRow>[]>(() => [
    { key: "no", label: "Count No", width: 170, accessor: (r) => r.count_no },
    { key: "date", label: "Date", width: 110, accessor: (r) => fmtDate(r.created_at), dateValue: (r) => r.created_at, filterType: "date" },
    { key: "site", label: "Site", width: 180, accessor: (r) => siteName(sites.data?.sites, r.warehouse_id), filterType: "enum" },
    { key: "blind", label: "Blind count", width: 110, accessor: (r) => (r.blind ? "Yes" : "No"), filterType: "enum" },
    { key: "status", label: "Status", width: 110, accessor: (r) => (r.status === "open" ? "Open" : "Posted"), filterType: "enum" },
    { key: "adj", label: "Stock Adjustment", width: 180, accessor: (r) => r.stock_adjustments.map((a) => a.adjustment_no).join(", ") },
    { key: "note", label: "Note", width: 220, accessor: (r) => r.note ?? "" },
  ], [sites.data]);

  return (
    <Page word="Stock Take" testId="stock-takes">
      {list.isError ? <p role="alert" className="p-4 text-body">The stock takes could not be loaded. Try again.</p> : (
        <ListPageShell register>
          <DataGrid rows={list.data?.counts ?? []} columns={columns} rowKey={(r) => r.id}
            storageKey="carres.warehouse.stock-takes.v1" appearance="reference" exportName="Stock Take"
            groupBanner={false} stickyIdentity isLoading={!list.isSuccess} searchPlaceholder="Search count…"
            onRowClick={(r) => setSheet(r.id)}
            toolbarEnd={<Button variant="primary" icon="add" onClick={() => setOpen(true)}>New Stock Take</Button>}
            emptyMessage="No stock takes yet." />
        </ListPageShell>
      )}
      <Modal open={open} onOpenChange={setOpen} title="New Stock Take"
        footer={<>
          <Button variant="neutral" onClick={() => setOpen(false)}>Close</Button>
          <Button variant="primary" loading={start.isPending} disabled={!siteId} onClick={() => start.mutate()}>Start</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <SiteSelect id="count-site" label="Site" value={siteId} onChange={setSiteId} sites={sites.data?.sites ?? []} />
          <Checkbox id="count-blind" label="Blind count" checked={blind} onCheckedChange={setBlind} />
          <Textarea id="count-note" label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          {start.isError && <FieldError>{errorText(start.error)}</FieldError>}
        </div>
      </Modal>
      {sheet && <CountSheet key={sheet} id={sheet} onClose={() => setSheet(null)} />}
    </Page>
  );
}
