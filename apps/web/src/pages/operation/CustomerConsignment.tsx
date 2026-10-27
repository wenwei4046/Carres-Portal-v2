import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import { FieldError } from "@/components/kit/FieldFrame";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { useManualMethods } from "@/lib/payment-methods";

/**
 * Customer Consignment Order · Consignment Note · Customer Consignment Return
 * (migration 0719).
 *
 * Weisiang's decision (Mr Lim, Houzs owner side, WhatsApp 2026-10-22): office
 * staff send goods to customers on consignment and take unsold goods back, the
 * Houzs way. This overturns Jess's Purchasing MASTER rules (dealers do not take
 * consignment; no blank consignment documents) and COPY-STANDARD's ban on the
 * name "Consignment Note"; Jess was not part of this decision. These are the
 * CUSTOMER side; the supplier-side Consignment Order / Return are separate.
 * A Unit at the customer stays Carres-owned.
 *
 * Money follows Houzs (YH, chat 2026-10-26): the Customer Consignment Order
 * carries each Unit's price and its own payments; no Sales Order is used
 * (Houzs ConsignmentOrderDetail.tsx; consignment-orders.ts:2171-2310), per
 * Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs.
 */

const BASE = "/api/ops/customer-consignment";
const NO_DEALER = "none";
type Choice = { id: string; name: string };
type Unit = { id: string; unit_code: string; sku: string; status: string; reserved_ref: string | null };
type UnitLink = { ops_stock_items: Unit | null };
type Customer = { name: string; phone: string; address: string };

const post = <T,>(path: string, body: unknown) =>
  apiFetch<T>(`${BASE}${path}`, { method: "POST", body: JSON.stringify(body) });
const PRICE_RE = /^\d+(\.\d{1,2})?$/;

function useChoices() {
  return useQuery({
    queryKey: ["customer-consignment", "choices"],
    queryFn: () => apiFetch<{ dealers: Choice[]; sites: Choice[] }>(`${BASE}/choices`),
    staleTime: 300_000,
  });
}
const units = (links: UnitLink[]) => links.map((l) => l.ops_stock_items).filter((u): u is Unit => u !== null);
const codes = (list: Unit[]) => list.map((u) => u.unit_code).join(", ");
/** A Unit is out at the customer while it is reserved to the Note that sent it. */
const outOn = (noteNo: string, list: Unit[]) => list.filter((u) => u.status === "reserved" && u.reserved_ref === noteNo);
const errorText = (e: unknown) => (e instanceof Error ? e.message : "Could not save. Try again.");

function Page({ word, testId, children }: { word: string; testId: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid={testId}>
      <ModuleHeader destinationHeader testId={`${testId}-header`} word={word} docTitle={`${word} · Consignment · Carres`} />
      {children}
    </div>
  );
}

function Ticks({ list, picked, onChange, empty }: { list: Unit[]; picked: string[]; onChange: (ids: string[]) => void; empty: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-64 overflow-auto rounded-control border border-c-line p-2" aria-label="Units">
        {list.length === 0 && <p className="text-body text-c-muted">{empty}</p>}
        {list.map((u) => (
          <Checkbox key={u.id} id={`unit-${u.id}`} label={`${u.unit_code} · ${u.sku}`} checked={picked.includes(u.id)}
            onCheckedChange={(on) => onChange(on ? [...picked, u.id] : picked.filter((x) => x !== u.id))} />
        ))}
      </div>
      <p className="text-body text-c-muted">{picked.length} Units picked</p>
    </div>
  );
}

/** Pick a Site, then free Carres-owned Units standing there. */
function StockPicker({ sites, picked, onChange, prices, setPrices }: {
  sites: Choice[]; picked: string[]; onChange: (ids: string[]) => void;
  prices?: Record<string, string>; setPrices?: (p: Record<string, string>) => void;
}) {
  const [siteId, setSiteId] = useState("");
  const [find, setFind] = useState("");
  const q = useQuery({
    queryKey: ["customer-consignment", "units", siteId],
    queryFn: () => apiFetch<{ units: Unit[] }>(`${BASE}/units?siteId=${siteId}`),
    enabled: Boolean(siteId),
  });
  const needle = find.trim().toLowerCase();
  const list = (q.data?.units ?? []).filter((u) => !needle || `${u.unit_code} ${u.sku}`.toLowerCase().includes(needle));
  return (
    <div className="flex flex-col gap-2">
      <Select id="cs-site" label="Pickup Location" value={siteId || undefined} onValueChange={(v) => { setSiteId(v); onChange([]); }}
        options={sites.map((s) => ({ value: s.id, label: s.name }))} />
      {siteId && <Input id="cs-find" label="Find Unit" value={find} onChange={(e) => setFind(e.target.value)} />}
      {q.isError && <FieldError>The Units could not be loaded. Try again.</FieldError>}
      {q.isSuccess && <Ticks list={list} picked={picked} onChange={onChange} empty="No Units here." />}
      {prices && setPrices && (q.data?.units ?? []).filter((u) => picked.includes(u.id)).map((u) => (
        <Input key={u.id} id={`price-${u.id}`} label={`Price (RM) · ${u.unit_code}`} inputMode="decimal"
          value={prices[u.id] ?? ""} onChange={(e) => setPrices({ ...prices, [u.id]: e.target.value })}
          error={prices[u.id] && !PRICE_RE.test(prices[u.id]) ? "Enter an amount, e.g. 1200.00" : undefined} />
      ))}
    </div>
  );
}

function CustomerFields({ dealers, dealerId, setDealerId, c, setC }: {
  dealers: Choice[]; dealerId: string; setDealerId: (v: string) => void; c: Customer; setC: (c: Customer) => void;
}) {
  return (
    <>
      <Select id="cs-dealer" label="Dealer" value={dealerId} onValueChange={setDealerId}
        options={[{ value: NO_DEALER, label: "No dealer" }, ...dealers.map((d) => ({ value: d.id, label: d.name }))]} />
      <Input id="cs-name" label="Customer" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
      <Input id="cs-phone" label="Phone" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} />
      <Textarea id="cs-address" label="Delivery Address" rows={2} value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} />
    </>
  );
}
const EMPTY: Customer = { name: "", phone: "", address: "" };
const hasCustomer = (dealerId: string, c: Customer) => dealerId !== NO_DEALER || c.name.trim().length > 0;
const dealerOrNull = (dealerId: string) => (dealerId === NO_DEALER ? null : dealerId);

// ── Customer Consignment Order ────────────────────────────────────────────────
type OrderLine = UnitLink & { price: string | number; sold_at: string | null };
type Payment = { id: string; paid_at: string; method: string; amount: string | number; reference: string | null; note: string | null };
type OrderRow = {
  id: string; order_no: string; customer_name: string; customer_phone: string | null; note: string | null; created_at: string;
  customer_consignment_order_units: OrderLine[];
  customer_consignment_order_payments: Payment[];
  total: number; paid: number; balance: number;
};

type Money = { total: number; paid: number; balance: number };

/**
 * A payments ledger on an order or a blank Note, like Houzs's Consignment
 * Order payments (consignment-orders.ts:2171-2310) and Consignment Note
 * payments (consignment-notes.ts:1074-1160), per Weisiang's ruling
 * (2026-10-22): clear Carres rules, implement Houzs.
 */
function Payments({ path, money, payments, onSaved }: { path: string; money: Money; payments: Payment[]; onSaved: () => void }) {
  const m = useManualMethods();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [reference, setReference] = useState("");
  const add = useMutation({
    mutationFn: () => post(`${path}/payments`, {
      amount: Number(amount), method, paidAt: paidAt || undefined, reference: reference || undefined,
    }),
    onSuccess: () => { setAmount(""); setReference(""); onSaved(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`${BASE}${path}/payments/${id}`, { method: "DELETE" }),
    onSuccess: onSaved,
  });
  return (
    <section className="flex flex-col gap-2" aria-label="Payments">
      <h3 className="text-title">Payments</h3>
      <p className="text-body">Total {rm(money.total)} · Paid {rm(money.paid)} · Balance {rm(money.balance)}</p>
      {payments.length === 0 && <p className="text-body text-c-muted">No payments yet.</p>}
      {payments.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-2 text-body">
          <span>{fmtDate(p.paid_at)} · {m.label(p.method)} · {rm(Number(p.amount))}{p.reference ? ` · ${p.reference}` : ""}</span>
          <Button variant="neutral" loading={remove.isPending && remove.variables === p.id} onClick={() => remove.mutate(p.id)}>Remove</Button>
        </div>
      ))}
      <Input id="ccp-amount" label="Amount (RM)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
        error={amount && !PRICE_RE.test(amount) ? "Enter an amount, e.g. 500.00" : undefined} />
      <Select id="ccp-method" label="Payment Method" value={method || undefined} onValueChange={setMethod}
        options={m.methods.map((x) => ({ value: x.value, label: x.label }))} />
      <DatePicker id="ccp-date" label="Payment Date" value={paidAt || null} onChange={(v) => setPaidAt(v ?? "")} />
      <Input id="ccp-ref" label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
      {(add.isError || remove.isError) && <FieldError>{errorText(add.error ?? remove.error)}</FieldError>}
      <div>
        <Button variant="primary" loading={add.isPending} disabled={!PRICE_RE.test(amount) || Number(amount) <= 0 || !method}
          onClick={() => add.mutate()}>Add Payment</Button>
      </div>
    </section>
  );
}

export function CustomerConsignmentOrders() {
  const qc = useQueryClient();
  const choices = useChoices();
  const list = useQuery({ queryKey: ["customer-consignment", "orders"], queryFn: () => apiFetch<{ orders: OrderRow[] }>(`${BASE}/orders`) });
  const [open, setOpen] = useState(false);
  const [dealerId, setDealerId] = useState(NO_DEALER);
  const [c, setC] = useState<Customer>(EMPTY);
  const [picked, setPicked] = useState<string[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const sending = (list.data?.orders ?? []).find((o) => o.id === sendingId) ?? null;
  const setSending = (o: OrderRow | null) => setSendingId(o?.id ?? null);
  const priced = picked.length > 0 && picked.every((id) => PRICE_RE.test(prices[id] ?? ""));
  const [sendPicked, setSendPicked] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const done = () => void qc.invalidateQueries({ queryKey: ["customer-consignment"] });
  const save = useMutation({
    mutationFn: () => post("/orders", {
      dealerId: dealerOrNull(dealerId), customer: c, note,
      lines: picked.map((unitId) => ({ unitId, price: Number(prices[unitId]) })),
    }),
    onSuccess: () => { setOpen(false); setPicked([]); setPrices({}); setC(EMPTY); setNote(""); setDealerId(NO_DEALER); done(); },
  });
  const send = useMutation({
    mutationFn: () => post("/notes", { orderId: sending?.id, unitIds: sendPicked, deliveryDate: date || undefined }),
    onSuccess: () => { setSending(null); setSendPicked([]); setDate(""); done(); },
  });
  const columns = useMemo<DataGridColumn<OrderRow>[]>(() => [
    { key: "no", label: "Order No", width: 170, accessor: (r) => r.order_no },
    { key: "date", label: "Date", width: 110, accessor: (r) => fmtDate(r.created_at), dateValue: (r) => r.created_at, filterType: "date" },
    { key: "customer", label: "Customer", width: 200, accessor: (r) => r.customer_name },
    { key: "phone", label: "Phone", width: 130, accessor: (r) => r.customer_phone ?? "" },
    { key: "units", label: "Units", width: 280, accessor: (r) => codes(units(r.customer_consignment_order_units)) },
    { key: "total", label: "Total", width: 120, accessor: (r) => rm(r.total) },
    { key: "paid", label: "Paid", width: 120, accessor: (r) => rm(r.paid) },
    { key: "balance", label: "Balance", width: 120, accessor: (r) => rm(r.balance) },
    { key: "note", label: "Note", width: 220, accessor: (r) => r.note ?? "" },
  ], []);
  const toSend = sending ? units(sending.customer_consignment_order_units).filter((u) => u.status === "free") : [];

  return (
    <Page word="Customer Consignment Orders" testId="customer-consignment-orders">
      {list.isError ? <p role="alert" className="p-4 text-body">The customer consignment orders could not be loaded. Try again.</p> : (
        <ListPageShell register>
          <DataGrid rows={list.data?.orders ?? []} columns={columns} rowKey={(r) => r.id}
            storageKey="carres.delivery.customer-consignment-orders.v1" appearance="reference" exportName="Customer Consignment Orders"
            groupBanner={false} stickyIdentity isLoading={!list.isSuccess} searchPlaceholder="Search order, customer or Unit ID…"
            onRowClick={(r) => { setSending(r); setSendPicked([]); }}
            toolbarEnd={<Button variant="primary" icon="add" onClick={() => setOpen(true)}>New Customer Consignment Order</Button>}
            emptyMessage="No customer consignment orders yet." />
        </ListPageShell>
      )}
      <Modal open={open} onOpenChange={setOpen} width="wide" title="New Customer Consignment Order"
        description="The Units leave stock when their Consignment Note is issued."
        footer={<>
          <Button variant="neutral" onClick={() => setOpen(false)}>Close</Button>
          <Button variant="primary" loading={save.isPending} disabled={!hasCustomer(dealerId, c) || !priced} onClick={() => save.mutate()}>Save</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <CustomerFields dealers={choices.data?.dealers ?? []} dealerId={dealerId} setDealerId={setDealerId} c={c} setC={setC} />
          <StockPicker sites={choices.data?.sites ?? []} picked={picked} onChange={setPicked} prices={prices} setPrices={setPrices} />
          <Textarea id="cco-note" label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          {save.isError && <FieldError>{errorText(save.error)}</FieldError>}
        </div>
      </Modal>
      <Modal open={sending !== null} onOpenChange={(o) => !o && setSending(null)} width="wide"
        title={`${sending?.order_no ?? ""} · Consignment Note and payments`}
        description="Issue a Consignment Note for the picked Units, and record the customer's payments on this order."
        footer={<>
          <Button variant="neutral" onClick={() => setSending(null)}>Close</Button>
          <Button variant="primary" loading={send.isPending} disabled={sendPicked.length === 0} onClick={() => send.mutate()}>Issue Consignment Note</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <DatePicker id="ccn-date" label="Delivery Date" value={date || null} onChange={(v) => setDate(v ?? "")} />
          <Ticks list={toSend} picked={sendPicked} onChange={setSendPicked} empty="Every Unit on this order has gone out." />
          {send.isError && <FieldError>{errorText(send.error)}</FieldError>}
          {sending && <Payments path={`/orders/${sending.id}`} money={sending} payments={sending.customer_consignment_order_payments} onSaved={done} />}
        </div>
      </Modal>
    </Page>
  );
}

// ── Consignment Note ──────────────────────────────────────────────────────────
type NoteRow = Money & {
  id: string; note_no: string; order_id: string | null; customer_name: string; customer_phone: string | null; delivery_date: string;
  note: string | null; created_at: string;
  customer_consignment_orders: { order_no: string } | null;
  consignment_note_units: OrderLine[];
  consignment_note_payments: Payment[];
};

function useNotes() {
  return useQuery({ queryKey: ["customer-consignment", "notes"], queryFn: () => apiFetch<{ notes: NoteRow[] }>(`${BASE}/notes`) });
}

export function ConsignmentNotes() {
  const qc = useQueryClient();
  const choices = useChoices();
  const list = useNotes();
  const [open, setOpen] = useState(false);
  const [dealerId, setDealerId] = useState(NO_DEALER);
  const [c, setC] = useState<Customer>(EMPTY);
  const [picked, setPicked] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const priced = picked.length > 0 && picked.every((id) => PRICE_RE.test(prices[id] ?? ""));
  const [sellingId, setSellingId] = useState<string | null>(null);
  const selling = (list.data?.notes ?? []).find((n) => n.id === sellingId) ?? null;
  const setSelling = (n: NoteRow | null) => setSellingId(n?.id ?? null);
  const [soldPicked, setSoldPicked] = useState<string[]>([]);
  const done = () => void qc.invalidateQueries({ queryKey: ["customer-consignment"] });
  const save = useMutation({
    mutationFn: () => post("/notes", {
      dealerId: dealerOrNull(dealerId), customer: c, unitIds: picked, deliveryDate: date || undefined, note,
      prices: Object.fromEntries(picked.map((id) => [id, Number(prices[id])])),
    }),
    onSuccess: () => { setOpen(false); setPicked([]); setPrices({}); setC(EMPTY); setNote(""); setDate(""); setDealerId(NO_DEALER); done(); },
  });
  const sell = useMutation({
    mutationFn: () => post("/notes/sold", { unitIds: soldPicked }),
    onSuccess: () => { setSelling(null); setSoldPicked([]); done(); },
  });
  const columns = useMemo<DataGridColumn<NoteRow>[]>(() => [
    { key: "no", label: "Consignment Note No", width: 190, accessor: (r) => r.note_no },
    { key: "date", label: "Delivery Date", width: 120, accessor: (r) => fmtDate(r.delivery_date), dateValue: (r) => r.delivery_date, filterType: "date" },
    { key: "customer", label: "Customer", width: 200, accessor: (r) => r.customer_name },
    { key: "order", label: "Order No", width: 170, accessor: (r) => r.customer_consignment_orders?.order_no ?? "" },
    { key: "out", label: "At customer", width: 260, accessor: (r) => codes(outOn(r.note_no, units(r.consignment_note_units))) },
    { key: "units", label: "Units", width: 260, accessor: (r) => codes(units(r.consignment_note_units)) },
    { key: "total", label: "Total", width: 120, accessor: (r) => rm(r.total) },
    { key: "balance", label: "Balance", width: 120, accessor: (r) => (r.order_id ? "On order" : rm(r.balance)) },
    { key: "note", label: "Note", width: 200, accessor: (r) => r.note ?? "" },
  ], []);
  const out = selling ? outOn(selling.note_no, units(selling.consignment_note_units)) : [];

  return (
    <Page word="Consignment Notes" testId="consignment-notes">
      {list.isError ? <p role="alert" className="p-4 text-body">The consignment notes could not be loaded. Try again.</p> : (
        <ListPageShell register>
          <DataGrid rows={list.data?.notes ?? []} columns={columns} rowKey={(r) => r.id}
            storageKey="carres.delivery.consignment-notes.v1" appearance="reference" exportName="Consignment Notes"
            groupBanner={false} stickyIdentity isLoading={!list.isSuccess} searchPlaceholder="Search note, customer or Unit ID…"
            onRowClick={(r) => { setSelling(r); setSoldPicked([]); }}
            toolbarEnd={<Button variant="primary" icon="add" onClick={() => setOpen(true)}>New Consignment Note</Button>}
            emptyMessage="No consignment notes yet." />
        </ListPageShell>
      )}
      <Modal open={open} onOpenChange={setOpen} width="wide" title="New Consignment Note"
        description="The picked Units go to the customer as soon as you save. They stay Carres-owned."
        footer={<>
          <Button variant="neutral" onClick={() => setOpen(false)}>Close</Button>
          <Button variant="primary" loading={save.isPending} disabled={!hasCustomer(dealerId, c) || !priced} onClick={() => save.mutate()}>Save</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <CustomerFields dealers={choices.data?.dealers ?? []} dealerId={dealerId} setDealerId={setDealerId} c={c} setC={setC} />
          <DatePicker id="csn-date" label="Delivery Date" value={date || null} onChange={(v) => setDate(v ?? "")} />
          <StockPicker sites={choices.data?.sites ?? []} picked={picked} onChange={setPicked} prices={prices} setPrices={setPrices} />
          <Textarea id="csn-note" label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          {save.isError && <FieldError>{errorText(save.error)}</FieldError>}
        </div>
      </Modal>
      <Modal open={selling !== null} onOpenChange={(o) => !o && setSelling(null)} width="wide"
        title={`Record sold Units on ${selling?.note_no ?? ""}`}
        description={selling?.order_id
          ? "Sold Units are sold at their Customer Consignment Order price. Record the customer's payment on that order."
          : "Sold Units are sold at their price on this note. Record the customer's payment below."}
        footer={<>
          <Button variant="neutral" onClick={() => setSelling(null)}>Close</Button>
          <Button variant="primary" loading={sell.isPending} disabled={soldPicked.length === 0} onClick={() => sell.mutate()}>Record sold</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <Ticks list={out} picked={soldPicked} onChange={setSoldPicked} empty="No Units are at the customer on this note." />
          {sell.isError && <FieldError>{errorText(sell.error)}</FieldError>}
          {selling && !selling.order_id && (
            <Payments path={`/notes/${selling.id}`} money={selling} payments={selling.consignment_note_payments} onSaved={done} />
          )}
        </div>
      </Modal>
    </Page>
  );
}

// ── Customer Consignment Return ───────────────────────────────────────────────
type ReturnRow = {
  id: string; return_no: string; warehouse_id: string; note: string | null; created_at: string;
  customer_consignment_return_units: { ops_stock_items: { unit_code: string } | null; consignment_notes: { note_no: string; customer_name: string } | null }[];
};

export function CustomerConsignmentReturns() {
  const qc = useQueryClient();
  const choices = useChoices();
  const notes = useNotes();
  const list = useQuery({ queryKey: ["customer-consignment", "returns"], queryFn: () => apiFetch<{ returns: ReturnRow[] }>(`${BASE}/returns`) });
  const [open, setOpen] = useState(false);
  const [siteId, setSiteId] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () => post("/returns", { siteId, unitIds: picked, note }),
    onSuccess: () => { setOpen(false); setPicked([]); setNote(""); void qc.invalidateQueries({ queryKey: ["customer-consignment"] }); },
  });
  const siteName = (id: string) => choices.data?.sites.find((s) => s.id === id)?.name ?? "";
  const lines = (r: ReturnRow) => r.customer_consignment_return_units;
  const columns = useMemo<DataGridColumn<ReturnRow>[]>(() => [
    { key: "no", label: "Return No", width: 170, accessor: (r) => r.return_no },
    { key: "date", label: "Date", width: 110, accessor: (r) => fmtDate(r.created_at), dateValue: (r) => r.created_at, filterType: "date" },
    { key: "customer", label: "Customer", width: 200, accessor: (r) => [...new Set(lines(r).map((l) => l.consignment_notes?.customer_name ?? ""))].join(", ") },
    { key: "csn", label: "Consignment Note No", width: 190, accessor: (r) => [...new Set(lines(r).map((l) => l.consignment_notes?.note_no ?? ""))].join(", ") },
    { key: "units", label: "Units", width: 260, accessor: (r) => lines(r).map((l) => l.ops_stock_items?.unit_code).filter(Boolean).join(", ") },
    { key: "site", label: "Delivery Location", width: 180, accessor: (r) => siteName(r.warehouse_id), filterType: "enum" },
    { key: "note", label: "Note", width: 200, accessor: (r) => r.note ?? "" },
  ], [choices.data]);
  // Every Unit at a customer, labelled with its customer and note.
  const out = (notes.data?.notes ?? []).flatMap((n) =>
    outOn(n.note_no, units(n.consignment_note_units)).map((u) => ({ ...u, sku: `${u.sku} · ${n.customer_name} · ${n.note_no}` })));

  return (
    <Page word="Customer Consignment Returns" testId="customer-consignment-returns">
      {list.isError ? <p role="alert" className="p-4 text-body">The customer consignment returns could not be loaded. Try again.</p> : (
        <ListPageShell register>
          <DataGrid rows={list.data?.returns ?? []} columns={columns} rowKey={(r) => r.id}
            storageKey="carres.delivery.customer-consignment-returns.v1" appearance="reference" exportName="Customer Consignment Returns"
            groupBanner={false} stickyIdentity isLoading={!list.isSuccess} searchPlaceholder="Search return, customer or Unit ID…"
            toolbarEnd={<Button variant="primary" icon="add" onClick={() => setOpen(true)}>New Customer Consignment Return</Button>}
            emptyMessage="No customer consignment returns yet." />
        </ListPageShell>
      )}
      <Modal open={open} onOpenChange={setOpen} width="wide" title="New Customer Consignment Return"
        description="Unsold Units come back into stock. No refund: nothing was paid for them."
        footer={<>
          <Button variant="neutral" onClick={() => setOpen(false)}>Close</Button>
          <Button variant="primary" loading={save.isPending} disabled={!siteId || picked.length === 0} onClick={() => save.mutate()}>Save</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <Select id="ccr-site" label="Delivery Location" value={siteId || undefined} onValueChange={setSiteId}
            options={(choices.data?.sites ?? []).map((s) => ({ value: s.id, label: s.name }))} />
          {notes.isError && <FieldError>The Units could not be loaded. Try again.</FieldError>}
          <Ticks list={out} picked={picked} onChange={setPicked} empty="No Units are at a customer." />
          <Textarea id="ccr-note" label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          {save.isError && <FieldError>{errorText(save.error)}</FieldError>}
        </div>
      </Modal>
    </Page>
  );
}
