import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  SN_CATEGORIES,
  SN_TYPES,
  SN_LOGISTICS,
  type ServiceNote,
  type SnItem,
  type SnSectionA,
  type SnSectionB,
  type SnSectionC,
} from "@carres/shared";

interface OrderLine {
  id: string;
  sku: string;
  qty: number;
  attrs: Record<string, unknown>;
  sourcePo: string | null;
}

interface Props {
  mode: "create" | "edit";
  id?: string;
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY_SECTION_A: SnSectionA = { task: "", deliverDate: null, logisticCompany: null, note: null };
const EMPTY_SECTION_B: SnSectionB = { task: "", deliverDate: null, supplierName: null, note: null };
const EMPTY_SECTION_C: SnSectionC = { note1: null, note2: null };

export default function ServiceNoteModal({ mode, id, onClose, onSaved }: Props) {
  // Header state
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [refNo, setRefNo] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [requestDate, setRequestDate] = useState(todayISO());
  const [deadline, setDeadline] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [status, setStatus] = useState<"ongoing" | "closed">("ongoing");

  // Sections
  const [useA, setUseA] = useState(false);
  const [sectionA, setSectionA] = useState<SnSectionA>(EMPTY_SECTION_A);
  const [useB, setUseB] = useState(false);
  const [sectionB, setSectionB] = useState<SnSectionB>(EMPTY_SECTION_B);
  const [useC, setUseC] = useState(false);
  const [sectionC, setSectionC] = useState<SnSectionC>(EMPTY_SECTION_C);

  // Order link (set when SO lookup succeeds)
  const [orderId, setOrderId] = useState<string | null>(null);
  const [lookupStatus, setLookupStatus] = useState<"idle" | "loading" | "found" | "not-found">("idle");
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Items
  const [items, setItems] = useState<SnItem[]>([{ no: 1, item: "", poNo: null, qty: 1, remark: null }]);

  // Load existing SN for edit
  const detailQ = useQuery<ServiceNote>({
    queryKey: ["ops", "service-note", id],
    queryFn: () => apiFetch(`/api/ops/service-notes/${id}`),
    enabled: mode === "edit" && !!id,
  });

  function handleRefNoChange(val: string) {
    setRefNo(val);
    if (lookupTimer.current) clearTimeout(lookupTimer.current);

    const soMatch = val.trim().match(/^SO-?(\d+)$/i);
    if (!soMatch) {
      setLookupStatus("idle");
      return;
    }

    setLookupStatus("loading");
    lookupTimer.current = setTimeout(async () => {
      try {
        const res = await apiFetch<{
          order: {
            id: string; so: string;
            customerName: string; customerPhone: string | null; customerAddress: string | null;
            lines: OrderLine[];
          } | null
        }>(`/api/ops/service-notes/lookup?so=${encodeURIComponent(val.trim())}`);
        if (res.order) {
          setOrderId(res.order.id);
          setCustomerName(res.order.customerName);
          if (res.order.customerPhone) setCustomerPhone(res.order.customerPhone);
          if (res.order.customerAddress) setCustomerAddress(res.order.customerAddress);
          setOrderLines(res.order.lines ?? []);
          setSelectedLineIds(new Set());
          setLookupStatus("found");
        } else {
          setOrderId(null);
          setOrderLines([]);
          setSelectedLineIds(new Set());
          setLookupStatus("not-found");
        }
      } catch {
        setLookupStatus("not-found");
      }
    }, 500);
  }

  useEffect(() => {
    if (!detailQ.data) return;
    const d = detailQ.data;
    setCustomerName(d.customerName ?? "");
    setCustomerPhone(d.customerPhone ?? "");
    setRefNo(d.refNo ?? "");
    setCustomerAddress(d.customerAddress ?? "");
    setCategory(d.category ?? "");
    setType(d.type ?? "");
    setRequestDate(d.requestDate ?? todayISO());
    setDeadline(d.deadline ?? "");
    setWhatHappened(d.whatHappened ?? "");
    setStatus(d.status);
    if (d.orderId) setOrderId(d.orderId);
    if (d.sectionA) { setUseA(true); setSectionA(d.sectionA as SnSectionA); }
    if (d.sectionB) { setUseB(true); setSectionB(d.sectionB as SnSectionB); }
    if (d.sectionC) { setUseC(true); setSectionC(d.sectionC as SnSectionC); }
    if (d.items && d.items.length > 0) {
      setItems(d.items.map(it => ({
        id: it.id,
        no: it.no,
        item: it.item,
        poNo: it.poNo ?? null,
        qty: it.qty ?? 1,
        remark: it.remark ?? null,
      })));
    }
  }, [detailQ.data]);

  const saveMut = useMutation({
    mutationFn: (body: object) =>
      mode === "create"
        ? apiFetch("/api/ops/service-notes", { method: "POST", body: JSON.stringify(body) })
        : apiFetch(`/api/ops/service-notes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: onSaved,
  });

  function buildPayload() {
    return {
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || undefined,
      refNo: refNo.trim() || undefined,
      customerAddress: customerAddress.trim() || undefined,
      orderId: orderId ?? undefined,
      category: category || undefined,
      type: type || undefined,
      requestDate: requestDate || undefined,
      deadline: deadline || null,
      whatHappened: whatHappened.trim() || undefined,
      status,
      sectionA: useA ? sectionA : null,
      sectionB: useB ? sectionB : null,
      sectionC: useC ? sectionC : null,
      items: items.filter(it => it.item.trim()),
    };
  }

  function addItem() {
    setItems(prev => [...prev, { no: prev.length + 1, item: "", poNo: null, qty: 1, remark: null }]);
  }

  function updateItem(idx: number, patch: Partial<SnItem>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, no: i + 1 })));
  }

  const isBusy = saveMut.isPending || (mode === "edit" && detailQ.isLoading);
  const canSave = customerName.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-base-200">
          <div>
            <h2 className="text-lg font-semibold text-base-900">
              {mode === "create" ? "New Case / Service Note" : `Edit ${detailQ.data?.snNo ?? "…"}`}
            </h2>
            <p className="text-xs text-base-500 mt-0.5">
              {mode === "create" ? "SN number auto-assigned on save" : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-base-400 hover:text-base-700 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* ── Customer / Header ───────────────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-base-500 mb-3">Customer</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Customer Name *">
                <input className={inp} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Lek Jia Beng" />
              </Field>
              <Field label="Phone">
                <input className={inp} value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="014-7211042" />
              </Field>
              <Field label="Ref No (SO / custom)">
                <div className="relative">
                  <input
                    className={inp}
                    value={refNo}
                    onChange={e => handleRefNoChange(e.target.value)}
                    placeholder="SO-1001"
                  />
                  {lookupStatus === "loading" && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-base-400">searching…</span>
                  )}
                  {lookupStatus === "found" && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-success-600">✓ auto-filled</span>
                  )}
                  {lookupStatus === "not-found" && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-error-600">not found</span>
                  )}
                </div>
              </Field>
              <Field label="Request Date">
                <input type="date" className={inp} value={requestDate} onChange={e => setRequestDate(e.target.value)} />
              </Field>
              <div className="col-span-2">
                <Field label="Address">
                  <input className={inp} value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} placeholder="5-35-03, Residence Klian Villa Aman No.1, Jalan Beruntung Utara, Klang Baru, Kepong KL" />
                </Field>
              </div>
            </div>
          </section>

          {/* ── Classification ──────────────────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-base-500 mb-3">Classification</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <select className={inp} value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="">— Select —</option>
                  {SN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Type">
                <select className={inp} value={type} onChange={e => setType(e.target.value)}>
                  <option value="">— Select —</option>
                  {SN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Deadline">
                <input type="date" className={inp} value={deadline} onChange={e => setDeadline(e.target.value)} />
              </Field>
              {mode === "edit" && (
                <Field label="Status">
                  <select className={inp} value={status} onChange={e => setStatus(e.target.value as "ongoing" | "closed")}>
                    <option value="ongoing">Ongoing</option>
                    <option value="closed">Closed</option>
                  </select>
                </Field>
              )}
            </div>
            <div className="mt-3">
              <Field label="What Happened">
                <textarea
                  className={`${inp} resize-none`}
                  rows={2}
                  value={whatHappened}
                  onChange={e => setWhatHappened(e.target.value)}
                  placeholder="Arrived at the wrong side / sofa leg broken / wrong colour delivered…"
                />
              </Field>
            </div>
          </section>

          {/* ── Products from order (shown after successful SO lookup) ───────── */}
          {orderLines.length > 0 && (
            <section className="rounded border border-base-200 bg-base-50 p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-base-500">
                  Products in this order — tick to add to Items
                </h3>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => {
                    const newItems: SnItem[] = orderLines
                      .filter(l => selectedLineIds.has(l.id))
                      .map((l, idx) => ({
                        no: idx + 1,
                        item: formatLineLabel(l),
                        poNo: l.sourcePo,
                        qty: l.qty,
                        remark: null,
                      }));
                    if (newItems.length > 0) setItems(newItems);
                  }}
                >
                  Add selected →
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {orderLines.map(l => (
                  <label key={l.id} className="flex items-center gap-2.5 cursor-pointer rounded hover:bg-white px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={selectedLineIds.has(l.id)}
                      onChange={e => {
                        const next = new Set(selectedLineIds);
                        if (e.target.checked) next.add(l.id); else next.delete(l.id);
                        setSelectedLineIds(next);
                      }}
                      className="rounded border-base-300"
                    />
                    <span className="font-mono text-xs text-base-900">{l.sku}</span>
                    {Object.keys(l.attrs).length > 0 && (
                      <span className="text-xs text-base-500">
                        {Object.entries(l.attrs).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-base-500">Qty {l.qty}</span>
                    {l.sourcePo && <span className="text-xs text-base-400 font-mono">{l.sourcePo}</span>}
                  </label>
                ))}
              </div>
            </section>
          )}

          {/* ── Items ───────────────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-base-500">Items</h3>
              <button type="button" onClick={addItem} className="text-xs text-primary hover:underline">+ Add row</button>
            </div>
            <div className="rounded border border-base-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-base-50 text-xs text-base-500">
                  <tr>
                    <th className="text-left px-2 py-1.5 w-8">#</th>
                    <th className="text-left px-2 py-1.5">Item / SKU</th>
                    <th className="text-left px-2 py-1.5 w-28">PO No.</th>
                    <th className="text-left px-2 py-1.5 w-16">Qty</th>
                    <th className="text-left px-2 py-1.5">Remark</th>
                    <th className="w-6" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-t border-base-100">
                      <td className="px-2 py-1 text-base-500 text-xs">{it.no}</td>
                      <td className="px-2 py-1">
                        <input
                          className="w-full rounded border border-base-200 px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
                          value={it.item}
                          onChange={e => updateItem(idx, { item: e.target.value })}
                          placeholder="SF03-HK5535 1 Pce"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-full rounded border border-base-200 px-1.5 py-1 text-xs font-mono focus:border-primary focus:outline-none"
                          value={it.poNo ?? ""}
                          onChange={e => updateItem(idx, { poNo: e.target.value || null })}
                          placeholder="PO23062-035"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          min={1}
                          className="w-full rounded border border-base-200 px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
                          value={it.qty}
                          onChange={e => updateItem(idx, { qty: parseInt(e.target.value) || 1 })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className="w-full rounded border border-base-200 px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
                          value={it.remark ?? ""}
                          onChange={e => updateItem(idx, { remark: e.target.value || null })}
                          placeholder="Optional"
                        />
                      </td>
                      <td className="px-2 py-1">
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItem(idx)} className="text-base-400 hover:text-error-600 text-xs">×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Section A — Logistics ────────────────────────────────────────── */}
          <SectionToggle
            label="Section A — Logistics"
            color="blue"
            enabled={useA}
            onToggle={() => { setUseA(!useA); if (!useA) setSectionA(EMPTY_SECTION_A); }}
          >
            {useA && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="col-span-2">
                  <Field label="Instructions">
                    <textarea
                      className={`${inp} resize-none`}
                      rows={2}
                      value={sectionA.task}
                      onChange={e => setSectionA({ ...sectionA, task: e.target.value })}
                      placeholder="Send to supplier and retrieve back the sofa by 27 May 26"
                    />
                  </Field>
                </div>
                <Field label="Logistic Company">
                  <select className={inp} value={sectionA.logisticCompany ?? ""} onChange={e => setSectionA({ ...sectionA, logisticCompany: e.target.value || null })}>
                    <option value="">— Select —</option>
                    {SN_LOGISTICS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Deliver Date">
                  <input type="date" className={inp} value={sectionA.deliverDate ?? ""} onChange={e => setSectionA({ ...sectionA, deliverDate: e.target.value || null })} />
                </Field>
                <div className="col-span-2">
                  <Field label="Note">
                    <input className={inp} value={sectionA.note ?? ""} onChange={e => setSectionA({ ...sectionA, note: e.target.value || null })} placeholder="Deliver before 24 May 26" />
                  </Field>
                </div>
              </div>
            )}
          </SectionToggle>

          {/* ── Section B — Supplier ─────────────────────────────────────────── */}
          <SectionToggle
            label="Section B — Supplier"
            color="orange"
            enabled={useB}
            onToggle={() => { setUseB(!useB); if (!useB) setSectionB(EMPTY_SECTION_B); }}
          >
            {useB && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="col-span-2">
                  <Field label="Instructions">
                    <textarea
                      className={`${inp} resize-none`}
                      rows={2}
                      value={sectionB.task}
                      onChange={e => setSectionB({ ...sectionB, task: e.target.value })}
                      placeholder="Repair the sofa and return by 20 May 26"
                    />
                  </Field>
                </div>
                <Field label="Supplier Name">
                  <input className={inp} value={sectionB.supplierName ?? ""} onChange={e => setSectionB({ ...sectionB, supplierName: e.target.value || null })} placeholder="HoOKkA" />
                </Field>
                <Field label="Deliver Date">
                  <input type="date" className={inp} value={sectionB.deliverDate ?? ""} onChange={e => setSectionB({ ...sectionB, deliverDate: e.target.value || null })} />
                </Field>
              </div>
            )}
          </SectionToggle>

          {/* ── Section C — Warehouse ────────────────────────────────────────── */}
          <SectionToggle
            label="Section C — Warehouse"
            color="gray"
            enabled={useC}
            onToggle={() => { setUseC(!useC); if (!useC) setSectionC(EMPTY_SECTION_C); }}
          >
            {useC && (
              <div className="grid grid-cols-1 gap-3 mt-3">
                <Field label="Note 1">
                  <input className={inp} value={sectionC.note1 ?? ""} onChange={e => setSectionC({ ...sectionC, note1: e.target.value || null })} />
                </Field>
                <Field label="Note 2">
                  <input className={inp} value={sectionC.note2 ?? ""} onChange={e => setSectionC({ ...sectionC, note2: e.target.value || null })} />
                </Field>
              </div>
            )}
          </SectionToggle>

          {/* Error */}
          {saveMut.isError && (
            <p className="text-xs text-error-700">
              {(saveMut.error as { message?: string })?.message ?? "Save failed"}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-base-200 bg-base-50">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-base-600 hover:text-base-900">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave || isBusy}
            onClick={() => saveMut.mutate(buildPayload())}
            className="rounded bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-primary/90"
          >
            {isBusy ? "Saving…" : mode === "create" ? "Create Case" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatLineLabel(l: OrderLine): string {
  const attrStr = Object.entries(l.attrs ?? {})
    .map(([k, v]) => `${k}:${v}`)
    .join(" ");
  return attrStr ? `${l.sku} ${attrStr}` : l.sku;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-base-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function SectionToggle({
  label, color, enabled, onToggle, children,
}: {
  label: string;
  color: "blue" | "orange" | "gray";
  enabled: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const colors = {
    blue:   "bg-blue-50 border-blue-200 text-blue-800",
    orange: "bg-orange-50 border-orange-200 text-orange-800",
    gray:   "bg-base-50 border-base-200 text-base-700",
  };
  return (
    <section className={`rounded border p-3 ${colors[color]}`}>
      <button type="button" onClick={onToggle} className="flex items-center gap-2 w-full text-left">
        <span className={`w-4 h-4 rounded flex items-center justify-center text-xs border ${
          enabled ? "bg-base-900 border-base-900 text-white" : "bg-white border-base-300"
        }`}>
          {enabled ? "✓" : ""}
        </span>
        <span className="text-xs font-semibold">{label}</span>
        <span className="ml-auto text-xs opacity-60">{enabled ? "included in print" : "click to add"}</span>
      </button>
      {children}
    </section>
  );
}

const inp = "w-full rounded border border-base-300 bg-white px-2.5 py-1.5 text-sm text-base-900 focus:border-primary focus:outline-none";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
