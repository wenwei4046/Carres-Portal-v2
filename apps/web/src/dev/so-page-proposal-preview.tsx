/**
 * SALES ORDER PAGE — CLICKABLE PROPOSAL (DEV ONLY, PLAN lane, 2026-09-22).
 *
 * Owner field standard (orders MASTER, 56177c8b): a grey box means "this can be
 * changed with Edit"; plain text only for SO Doc Date, payment rows and the
 * computed totals. Type order: card title 15px blue > value 13px dark > label
 * 12px grey. Real kit components + the real `renderSalesOrderPdf` template.
 * A grey "Preview controls" strip (not part of the design) flips PO / viewer /
 * page state.
 */
import { StrictMode, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import Select from "@/components/kit/Select";
import DatePicker from "@/components/kit/DatePicker";
import Textarea from "@/components/kit/Textarea";
import Tabs from "@/components/kit/Tabs";
import Icon from "@/components/kit/Icon";
import DropdownMenu from "@/components/kit/DropdownMenu";
import { usePdfCanvases } from "@/lib/pdf/use-pdf-canvases";
import { renderSalesOrderPdf } from "@/lib/pdf/render";
import type { SalesOrderTemplateData } from "@/lib/pdf/types";
import { fmtDate } from "@/lib/fmt-date";
import "@/index.css";

(globalThis as { __CARRES_LOGO_SRC__?: string }).__CARRES_LOGO_SRC__ =
  new URL("carres-logo.png", window.location.href).href;

/* ── fixture ─────────────────────────────────────────────────────────── */
type Line = { id: string; cat: string; sku: string; name: string; config: string; qty: number; unit: number; removed?: boolean; added?: boolean };
const LINES0: Line[] = [
  { id: "l1", cat: "mattress", sku: "M1401F-K", name: "Jager", config: "King · Medium", qty: 2, unit: 1890 },
  { id: "l2", cat: "accessory", sku: "GIFT-PILLOW", name: "Latex pillow", config: "Gift", qty: 1, unit: 0 },
  { id: "a1", cat: "service", sku: "ADD-ON", name: "Delivery fee", config: "", qty: 1, unit: 250 },
  { id: "a2", cat: "service", sku: "ADD-ON", name: "Stair carry", config: "", qty: 1, unit: 100 },
];
const NEW_LINE: Line = { id: "n1", cat: "bedframe", sku: "BR1201-Q", name: "Bedframe Rio", config: "Queen", qty: 1, unit: 1200, added: true };
const PAYMENTS = [
  { date: "2026-08-21", method: "DuitNow QR", code: "FT2083020", by: "Bernard", amount: 500, receipt: "RC-210826-0012", voided: false },
  { date: "2026-09-02", method: "Bank transfer", code: "TXN-77120", by: "Shasha", amount: 1499.5, receipt: "RC-020926-0031", voided: false },
  { date: "2026-08-20", method: "Cash", code: "WRONG-KEY", by: "Li Ching", amount: 1200, receipt: "RC-200826-0007", voided: true },
];
const BASE = {
  proceed: "2026-08-26", requested: "2026-09-24", location: "PJ Showroom", salesperson: "Bernard", dealer: "Carres HQ",
  name: "LIM KUAN YANG", phone: "0162157293", email: "lim@example.com", race: "Chinese", gender: "Male",
  birthday: "1990-02-08", emName: "Siti", emPhone: "0198887777", emRel: "Spouse", billing: "Billing address same as delivery",
  line1: "12 Jalan SS2/24", line2: "Taman Bahagia", postcode: "47300", city: "Petaling Jaya", state: "Selangor",
  building: "Condo", floor: "3", lift: "No lift", stair: "2",
};
type Form = typeof BASE;
/* Contractual facts go for approval while a supplier commitment exists;
   ownership facts always need management approval. */
const CONTRACT: (keyof Form)[] = ["proceed", "requested"];
const OWNERSHIP: (keyof Form)[] = ["location", "salesperson", "dealer"];
type Amendment = { status: "waiting" | "rejected"; form: Form; lines: Line[]; reason: string; decision?: string; changes: string[] };
type Row = { title: string; meta: string; note?: string; version?: { form: Form; lines: Line[] } };

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string) => fmtDate(iso);
const NOW = "Tue, 22 Sep 2026 10:05";
const REV1: Row = { title: "Original order", meta: "Rev 1 · Current · Recorded by Bernard Tan · Fri, 21 Aug 2026 10:02", version: { form: BASE, lines: LINES0 } };
const HIST1: Row = { title: "Order created", meta: "Bernard Tan · Sales · Fri, 21 Aug 2026 10:02", note: "Deposit RM 500.00 · Showroom order" };
const uncurrent = (r: Row) => ({ ...r, meta: r.meta.replace(" · Current", "") });
const LABEL: Partial<Record<keyof Form, string>> = { proceed: "Proceed Date", requested: "Customer Requested Delivery Date", location: "Sales Location", salesperson: "Salesperson", dealer: "Dealer" };
const liveLines = (ls: Line[]) => ls.filter((l) => !l.removed);
const sum = (ls: Line[]) => liveLines(ls).reduce((n, l) => n + l.qty * l.unit, 0);
/** Goods pieces only — a Delivery fee or Stair carry is a service, never a piece of goods. */
const goodsQty = (ls: Line[]) => liveLines(ls).filter((l) => l.cat !== "service").reduce((n, l) => n + l.qty, 0);
/* What each goods line is already tied to (fixture). Nothing here is changed by approval —
   the owning module decides. */
const LINKS: Record<string, { po: string; poState: string; unit?: string }> = {
  l1: { po: "PO-150926-0142 · Nice Future", poState: "In production", unit: "U1-000-014, U1-000-015" },
  l2: { po: "Ready stock", poState: "Reserved", unit: "U2-000-201" },
};

/* ── the governed pieces (one style each) ────────────────────────────── */
function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-control border border-kit-slate-5 bg-white">
      <header className="mx-4 flex items-center justify-between gap-3 border-b border-kit-slate-5 py-3">
        <h2 className="text-strong text-kit-blue-11">{title}</h2>
        {aside}
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}
const SubTitle = ({ children }: { children: ReactNode }) => (
  <h3 className="mb-3 mt-4 border-t border-kit-slate-5 pt-4 text-body font-semibold text-kit-slate-12">{children}</h3>
);
const Label = ({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) =>
  htmlFor ? <label htmlFor={htmlFor} className="text-meta text-kit-slate-11">{children}</label> : <span className="text-meta text-kit-slate-11">{children}</span>;
/** Grey box = this can be changed with Edit. */
const GreyBox = ({ children }: { children: ReactNode }) => (
  <span className="flex min-h-8 items-center rounded-control bg-kit-slate-3 px-3 text-body text-kit-slate-12">{children}</span>
);
/** Plain = not this page's to change. */
const Plain = ({ children }: { children: ReactNode }) => (
  <span className="flex min-h-8 items-center text-body text-kit-slate-12">{children}</span>
);
const Grid = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">{children}</div>
);
const Was = ({ children }: { children: ReactNode }) => (
  <p className="whitespace-nowrap text-meta text-kit-slate-11">Was: <span className="line-through">{children}</span></p>
);

/* ── the page ────────────────────────────────────────────────────────── */
function Page() {
  const [hasPo, setHasPo] = useState(true);
  const [viewer, setViewer] = useState<"operation" | "management">("operation");
  const [pageState, setPageState] = useState<"ready" | "loading" | "error">("ready");

  const [saved, setSaved] = useState<Form>(BASE);
  const [savedLines, setSavedLines] = useState<Line[]>(LINES0);
  const [amendment, setAmendment] = useState<Amendment | null>(null);
  const [revs, setRevs] = useState<Row[]>([REV1]);
  const [hist, setHist] = useState<Row[]>([HIST1]);
  const [toast, setToast] = useState<string | null>(null);

  const [tab, setTab] = useState("Order");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>(BASE);
  const [lines, setLines] = useState<Line[]>(LINES0);
  const [reason, setReason] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [decision, setDecision] = useState("");
  const [openRev, setOpenRev] = useState<string | null>(null);
  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const patchLine = (id: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));

  /* what changed, and which lane it takes */
  const keys = Object.keys(BASE) as (keyof Form)[];
  const changedKeys = editing ? keys.filter((k) => form[k] !== saved[k]) : [];
  const lineChanges = editing
    ? lines.filter((l) => {
        const was = savedLines.find((s) => s.id === l.id);
        return l.added || l.removed || !was || was.sku !== l.sku || was.qty !== l.qty || was.unit !== l.unit;
      })
    : [];
  const needApproval = (k: keyof Form) => OWNERSHIP.includes(k) || (hasPo && CONTRACT.includes(k));
  const approvalKeys = changedKeys.filter(needApproval);
  const directKeys = changedKeys.filter((k) => !needApproval(k));
  const approvalCount = approvalKeys.length + (hasPo ? lineChanges.length : 0);
  const reasonNeeded = changedKeys.some((k) => CONTRACT.includes(k) || OWNERSHIP.includes(k)) || lineChanges.length > 0;
  const changes = changedKeys.length + lineChanges.length;
  const amend = approvalCount > 0;
  const reasonGap = reasonNeeded && reason.trim() === "";
  const blockedByOpen = amend && amendment?.status === "waiting";

  const shownForm = editing ? form : saved;
  const shownLines = editing ? lines : savedLines;
  const total = sum(shownLines);
  const paid = PAYMENTS.filter((p) => !p.voided).reduce((n, p) => n + p.amount, 0);

  const flash = (t: string) => { setToast(t); window.setTimeout(() => setToast(null), 4000); };
  const startEdit = () => { setForm(saved); setLines(savedLines); setReason(""); setAsked(null); setEditing(true); setTab("Order"); };
  const commit = () => {
    const directForm = { ...saved };
    directKeys.forEach((k) => { directForm[k] = form[k]; });
    const describe = [
      ...approvalKeys.map((k) => LABEL[k] ?? k),
      ...(hasPo ? lineChanges.map((l) => (l.added ? `Added ${l.name}` : l.removed ? `Cancelled ${l.name}` : `${l.name} changed`)) : []),
    ];
    if (amend) {
      setSaved(directForm);
      if (!hasPo) setSavedLines(liveLines(lines).map(({ added: _a, ...l }) => l));
      setAmendment({ status: "waiting", form, lines, reason, changes: describe });
      setHist((h) => [{ title: "Amendment request submitted", meta: `Shasha · Operation · ${NOW}`, note: `${describe.join(" · ")} · waiting for management` }, ...h]);
      flash(directKeys.length ? "Saved. The other changes are waiting for management." : "Sent for approval.");
    } else {
      setSaved(form); setSavedLines(liveLines(lines).map(({ added: _a, ...l }) => l));
      if (reasonNeeded) setRevs((r) => [{ title: "Staff correction", meta: `Rev ${r.length + 1} · Current · Saved by Shasha · ${NOW}`, note: `Reason for change: ${reason}`, version: { form, lines: liveLines(lines) } }, ...r.map(uncurrent)]);
      setHist((h) => [{ title: "Order changed", meta: `Shasha · Operation · ${NOW}`, note: `${changes} ${changes === 1 ? "change" : "changes"}` }, ...h]);
      flash("Saved");
    }
    setEditing(false);
  };
  const approve = () => {
    if (!amendment) return;
    const n = revs.length + 1;
    setSaved((s) => { const next = { ...s }; [...CONTRACT, ...OWNERSHIP].forEach((k) => { next[k] = amendment.form[k]; }); return next; });
    setSavedLines(liveLines(amendment.lines).map(({ added: _a, ...l }) => l));
    const cancelled = amendment.lines.filter((l) => l.removed).map((l) => `${l.name} · Qty ${l.qty} · Cancelled · Rev ${n}`);
    setRevs((r) => [{ title: "Customer change", meta: `Rev ${n} · Current · Approved by Jess · Tue, 22 Sep 2026 11:20`, note: [`Reason for change: ${amendment.reason}`, ...cancelled].join("  ·  "), version: { form: amendment.form, lines: liveLines(amendment.lines) } }, ...r.map(uncurrent)]);
    setHist((h) => [{ title: "Amendment approved and applied", meta: "Jess · Principal · Tue, 22 Sep 2026 11:20", note: `Rev ${n} · Purchasing, Warehouse and Payments each handle their part` }, ...h]);
    setAmendment(null); setDecision(""); flash("Approved and applied");
  };
  const reject = () => {
    if (!amendment) return;
    setAmendment({ ...amendment, status: "rejected", decision });
    setHist((h) => [{ title: "Amendment rejected", meta: "Jess · Principal · Tue, 22 Sep 2026 11:40", note: decision }, ...h]);
    setDecision("");
  };
  const reset = () => {
    setSaved(BASE); setSavedLines(LINES0); setAmendment(null); setEditing(false); setTab("Order");
    setRevs([REV1]); setHist([HIST1]); setPageState("ready");
  };

  /* the paper: the draft while editing (under UNSAVED), else the saved revision */
  const docLines = liveLines(shownLines);
  const docTotal = sum(shownLines);
  const pdfData = useMemo<SalesOrderTemplateData>(
    () => ({
      so_number: "SO-1319", issue_date: "2026-08-21", order_id: "x", order_code: "SO-1319",
      status_label: "", channel: "showroom",
      customer: { name: shownForm.name, address: `${shownForm.line1}, ${shownForm.line2}, ${shownForm.postcode} ${shownForm.city}, ${shownForm.state}`,
        phone: shownForm.phone, email: shownForm.email, emergency: `${shownForm.emName} · ${shownForm.emPhone} · ${shownForm.emRel}` },
      dealer: { name: shownForm.dealer, contact: null, address: null, outlet_name: shownForm.location, outlet_address: null,
        salesperson_name: shownForm.salesperson, salesperson_phone: null },
      delivery: { date: shownForm.requested, floor: 3, has_lift: false } as SalesOrderTemplateData["delivery"],
      proceed_date: shownForm.proceed,
      lines: docLines.filter((l) => l.cat !== "service").map((l) => ({ sku: l.sku, description: `${l.name}${l.config ? ` · ${l.config}` : ""}`,
        qty: l.qty, unit_price: l.unit, line_total: l.qty * l.unit, attrs: null, category: l.cat })) as SalesOrderTemplateData["lines"],
      addons: docLines.filter((l) => l.cat === "service").map((l) => ({ label: l.name, sku: "ADD-ON", qty: 1, unit_price: l.unit, line_total: l.unit })),
      payments: PAYMENTS.filter((p) => !p.voided).map((p) => ({ label: p.method, reference: p.code, amount: p.amount, date: p.date, approval_code: p.code, collected_by: p.by })),
      subtotal: docTotal, total: docTotal, paid, balance_due: docTotal - paid, currency: "MYR",
      issued_by: "Bernard Tan", signed: false,
    }) as SalesOrderTemplateData,
    [shownForm, docLines, docTotal, paid],
  );
  const { setPane } = usePdfCanvases(tab === "Order" && pageState === "ready" ? JSON.stringify(pdfData) : null, () => renderSalesOrderPdf(pdfData));

  const controls = (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-kit-slate-6 bg-kit-slate-4 px-4 py-2 text-meta text-kit-slate-11">
      <span className="font-semibold">Preview controls — not part of the page</span>
      <label className="flex items-center gap-2">
        <input id="ctl-po" type="checkbox" checked={hasPo} disabled={editing} onChange={(e) => setHasPo(e.target.checked)} />
        PO already sent to the supplier
      </label>
      <label className="flex items-center gap-2">
        Looking as
        <select id="ctl-viewer" className="rounded-control border border-kit-slate-5 bg-white px-1 py-0.5" value={viewer} onChange={(e) => setViewer(e.target.value as typeof viewer)}>
          <option value="operation">Operation (Shasha)</option>
          <option value="management">Management (Jess)</option>
        </select>
      </label>
      <label className="flex items-center gap-2">
        Page
        <select id="ctl-state" className="rounded-control border border-kit-slate-5 bg-white px-1 py-0.5" value={pageState} onChange={(e) => setPageState(e.target.value as typeof pageState)}>
          <option value="ready">Loaded</option><option value="loading">Loading</option><option value="error">Could not load</option>
        </select>
      </label>
      <button type="button" className="underline" onClick={reset}>Start again</button>
    </div>
  );

  if (pageState !== "ready")
    return (
      <div className="flex min-h-screen flex-col bg-kit-slate-2">
        {controls}
        {pageState === "loading" ? (
          <div className="flex flex-col gap-4 p-4 lg:w-1/2" aria-busy="true" aria-label="Opening the sales order">
            <div className="h-9 w-72 animate-pulse rounded-control bg-kit-slate-4" />
            {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-control border border-kit-slate-5 bg-white" />)}
          </div>
        ) : (
          <div className="grid place-items-center gap-3 p-16 text-center">
            <p className="text-strong text-kit-slate-12">This sales order could not be opened</p>
            <Button variant="neutral" icon="refresh" onClick={() => setPageState("ready")}>Try again</Button>
          </div>
        )}
      </div>
    );

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-kit-slate-5 bg-white px-4 py-3">
      <h1 className="text-title text-kit-slate-12 lg:text-page">SO-1319<span className="ml-3 font-normal text-kit-slate-11">{saved.name}</span></h1>
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            {changes > 0 && <span className="text-body text-kit-slate-11">{changes} {changes === 1 ? "change" : "changes"}</span>}
            <Button variant="neutral" onClick={() => setEditing(false)}>Cancel</Button>
            <Button variant="primary" disabled={changes === 0 || reasonGap || blockedByOpen} onClick={commit}>
              {changes === 0 ? "Save — nothing changed" : reasonGap ? `${amend ? "Submit amendment request" : "Save"} — say why` : amend ? "Submit amendment request" : "Save"}
            </Button>
          </>
        ) : (
          <>
            <DropdownMenu label="Print" trigger={<Button variant="neutral" icon="print">Print ▾</Button>}
              items={[{ key: "p", label: "Print Sales Order", icon: "print", onSelect: () => undefined }, { key: "d", label: "Download PDF", icon: "download", onSelect: () => undefined }]} />
            <Button variant="primary" icon="edit" onClick={startEdit}>Edit</Button>
            <DropdownMenu label="More actions"
              trigger={<Button variant="neutral" icon="overflow" aria-label="More actions" title="More actions" />}
              items={[
                { key: "copy", label: "Copy to new Sales Order", icon: "copy", onSelect: () => undefined },
                { key: "problem", label: "Report a problem", icon: "flag", onSelect: () => undefined },
                { key: "cancel", label: "Cancel SO", icon: "close", onSelect: () => undefined, separatorBefore: true },
              ]} />
          </>
        )}
      </div>
    </div>
  );

  const notice = hasPo && (
    <div className="flex items-start gap-2 border-b border-kit-slate-5 bg-white px-4 py-2 text-body text-kit-slate-12">
      <Icon name="lock" size={16} />
      <span>This SO is already ordered from the supplier. Your change goes for approval first; the order changes only after it is approved.</span>
    </div>
  );

  const approval = amendment && !editing && (
    <section className="rounded-control border border-kit-amber-7 bg-kit-amber-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-strong text-kit-slate-12">{amendment.status === "rejected" ? "Rejected" : "Waiting for management"}</h2>
        <span className="text-meta text-kit-slate-11">Submitted by Shasha · {NOW}</span>
      </div>
      <ul className="mt-2 space-y-1 text-body text-kit-slate-12">
        {[...CONTRACT, ...OWNERSHIP].filter((k) => amendment.form[k] !== saved[k]).map((k) => (
          <li key={k}>{LABEL[k]}: {k === "proceed" || k === "requested" ? `${day(saved[k])} → ${day(amendment.form[k])}` : `${saved[k]} → ${amendment.form[k]}`}</li>
        ))}
        {amendment.lines.map((l) => {
          const was = savedLines.find((s) => s.id === l.id);
          if (l.added) return <li key={l.id}>Added {l.name} ({l.sku}) · Qty {l.qty} · RM {money(l.qty * l.unit)}</li>;
          if (l.removed) return <li key={l.id}>Cancelled {l.name} ({l.sku}) · Qty {l.qty} · RM {money(l.qty * l.unit)}</li>;
          if (was && (was.qty !== l.qty || was.unit !== l.unit || was.sku !== l.sku))
            return <li key={l.id}>{l.name}: Qty {was.qty} → {l.qty} · Amount RM {money(was.qty * was.unit)} → RM {money(l.qty * l.unit)}</li>;
          return null;
        })}
        <li className="text-kit-slate-11">Reason for change: {amendment.reason}</li>
      </ul>
      <div className="mt-3 border-t border-kit-amber-6 pt-3 text-body text-kit-slate-12">
        <p className="text-meta text-kit-slate-11">Before approval</p>
        {amendment.lines.filter((l) => LINKS[l.id] && (l.removed || (savedLines.find((s) => s.id === l.id)?.qty ?? 0) > l.qty)).map((l) => (
          <p key={l.id}>{l.name}: {LINKS[l.id].po} · {LINKS[l.id].poState} — Purchasing settles it with the supplier; made, shipped or received goods are not cancelled automatically</p>
        ))}
        <p>Total payable RM {money(sum(savedLines))} → RM {money(sum(amendment.lines))} · Paid to date RM {money(paid)}
          {paid > sum(amendment.lines) ? ` — RM ${money(paid - sum(amendment.lines))} needs review in Payments` : ""}</p>
      </div>
      {amendment.status === "waiting" && viewer === "management" && (
        <div className="mt-3 flex flex-col gap-3 border-t border-kit-amber-6 pt-3">
          <div className="flex flex-col gap-1"><Label htmlFor="decision">Management decision reason</Label>
            <Textarea id="decision" rows={2} value={decision} onChange={(e) => setDecision(e.target.value)} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="neutral" disabled={!decision.trim()} onClick={reject}>{decision.trim() ? "Reject" : "Reject — say why"}</Button>
            <Button variant="primary" onClick={approve}>Approve and apply</Button>
          </div>
        </div>
      )}
      {amendment.status === "waiting" && viewer === "operation" && (
        <p className="mt-3 border-t border-kit-amber-6 pt-3 text-meta text-kit-slate-11">Preview: switch “Looking as” to Management to approve or reject.</p>
      )}
      {amendment.status === "rejected" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-kit-amber-6 pt-3">
          <p className="text-body text-kit-slate-12">Rejected by Jess · Tue, 22 Sep 2026 11:40 — {amendment.decision}</p>
          <Button variant="neutral" onClick={() => setAmendment(null)}>Close</Button>
        </div>
      )}
    </section>
  );

  /* one field: label above; grey box in view, kit field in edit, Was: when changed */
  const F = (k: keyof Form, label: string, kind: "text" | "tel" | "email" | "date" | "lift" = "text") => {
    const show = kind === "date" ? day(shownForm[k]) : shownForm[k];
    if (!editing) return <div className="flex min-w-0 flex-col gap-1"><Label>{label}</Label><GreyBox>{show}</GreyBox></div>;
    const control =
      kind === "date" ? <DatePicker id={k} value={form[k]} onChange={(v) => set(k)(v ?? saved[k])} />
      : kind === "lift" ? <Select id={k} value={form[k]} onValueChange={set(k)} options={[{ value: "No lift", label: "No lift" }, { value: "Has lift", label: "Has lift" }]} />
      : <Input id={k} type={kind} value={form[k]} onChange={(e) => set(k)(e.target.value)} />;
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={k}>{label}</Label>
        {control}
        {form[k] !== saved[k] && <Was>{kind === "date" ? day(saved[k]) : saved[k]}</Was>}
      </div>
    );
  };

  const soInfo = (
    <Card title="SO info">
      <Grid>
        <div className="flex min-w-0 flex-col gap-1"><Label>SO Doc Date</Label><Plain>{day("2026-08-21")}</Plain></div>
        {F("proceed", "Proceed Date", "date")}
        {F("requested", "Customer Requested Delivery Date", "date")}
        {F("location", "Sales Location")}{F("salesperson", "Salesperson")}{F("dealer", "Dealer")}
      </Grid>
    </Card>
  );
  const customer = (
    <Card title="Customer" aside={<span className="text-meta text-kit-slate-11">Existing customer · <a className="text-kit-blue-11 hover:underline" href="#customer">3 orders ›</a></span>}>
      <Grid>
        {F("name", "Full name")}{F("phone", "Phone", "tel")}{F("email", "Email", "email")}
        {F("race", "Race")}{F("gender", "Gender")}{F("birthday", "Birthday", "date")}
      </Grid>
      <SubTitle>Emergency contact</SubTitle>
      <Grid>{F("emName", "Name")}{F("emPhone", "Phone", "tel")}{F("emRel", "Relationship")}</Grid>
      <SubTitle>Billing</SubTitle>
      <div className="sm:w-2/3">{F("billing", "Billing address")}</div>
    </Card>
  );
  const delivery = (
    <Card title="Delivery">
      <Grid>
        {F("line1", "Address line 1")}{F("line2", "Address line 2")}{F("postcode", "Postcode")}
        {F("city", "City")}{F("state", "State")}{F("building", "Building type")}
        {F("floor", "Floor (Max is 3rd Floor)")}{F("lift", "Lift available?", "lift")}{F("stair", "Items needing stair carry")}
      </Grid>
    </Card>
  );

  const cellInput = "h-8 w-full rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12";
  const items = (
    <Card title="Items">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-body">
          <thead>
            <tr className="border-b border-kit-slate-5 text-left text-meta text-kit-slate-11">
              <th className="w-8 whitespace-nowrap px-2 py-1 font-normal">#</th>
              <th className="whitespace-nowrap w-32 px-2 py-1 font-normal">Item Code</th>
              <th className="px-2 py-1 font-normal">Description</th>
              <th className="whitespace-nowrap w-16 px-2 py-1 text-center font-normal">Qty</th>
              <th className="whitespace-nowrap w-28 px-2 py-1 text-right font-normal">Unit (RM)</th>
              <th className="whitespace-nowrap w-16 px-2 py-1 text-right font-normal">Disc (RM)</th>
              <th className="whitespace-nowrap w-28 px-2 py-1 text-right font-normal">Amount (RM)</th>
              {editing && <th className="w-24 px-2 py-1" />}
            </tr>
          </thead>
          <tbody>
            {shownLines.map((l, i) => {
              const was = savedLines.find((s) => s.id === l.id);
              const gone = l.removed;
              const strike = gone ? "line-through text-kit-slate-11" : "";
              return (
                <tr key={l.id} className="border-b border-kit-slate-5 align-top">
                  <td className={`px-2 py-1 tabular-nums text-kit-slate-11 ${strike}`}><span className="flex min-h-8 items-center">{i + 1}</span></td>
                  <td className="px-1 py-1">
                    {editing && !gone ? <input id={`code-${l.id}`} aria-label={`Item Code line ${i + 1}`} className={cellInput} value={l.sku} onChange={(e) => patchLine(l.id, { sku: e.target.value })} />
                      : <GreyBox><span className={`whitespace-nowrap font-mono text-meta ${strike}`}>{l.sku}</span></GreyBox>}
                  </td>
                  <td className="min-w-[140px] px-2 py-1">
                    <div className={`flex min-h-8 items-center ${strike}`}>{l.name}</div>
                    {l.config && <div className={`text-meta text-kit-slate-11 ${strike}`}>{l.config}</div>}
                    {editing && l.added && <div className="text-meta text-kit-blue-11">Added</div>}
                    {editing && gone && <div className="whitespace-nowrap text-meta text-kit-red-11">Removed</div>}
                  </td>
                  <td className="px-1 py-1 text-center">
                    {editing && !gone ? <input id={`qty-${l.id}`} aria-label={`Qty line ${i + 1}`} type="number" min={1} className={`${cellInput} text-center`} value={l.qty}
                        onChange={(e) => patchLine(l.id, { qty: Math.max(1, Number(e.target.value) || 1) })} />
                      : <GreyBox><span className={`w-full text-center tabular-nums ${strike}`}>{l.qty}</span></GreyBox>}
                    {editing && !gone && was && was.qty !== l.qty && <Was>{was.qty}</Was>}
                  </td>
                  <td className="px-1 py-1 text-right">
                    {editing && !gone ? <input id={`unit-${l.id}`} aria-label={`Unit price line ${i + 1}`} type="number" min={0} step="0.01" className={`${cellInput} text-right`} value={l.unit}
                        onChange={(e) => patchLine(l.id, { unit: Math.max(0, Number(e.target.value) || 0) })} />
                      : <GreyBox><span className={`w-full text-right tabular-nums ${strike}`}>{money(l.unit)}</span></GreyBox>}
                    {editing && !gone && was && was.unit !== l.unit && <Was>{money(was.unit)}</Was>}
                  </td>
                  <td className={`px-2 py-1 text-right text-kit-slate-11 ${strike}`}><span className="flex min-h-8 items-center justify-end">—</span></td>
                  <td className={`px-2 py-1 text-right tabular-nums ${strike}`}>
                    <span className="flex min-h-8 items-center justify-end">{money(l.qty * l.unit)}</span>
                    {editing && !gone && was && was.qty * was.unit !== l.qty * l.unit && <Was>{money(was.qty * was.unit)}</Was>}
                  </td>
                  {editing && (
                    <td className="px-1 py-1 text-right">
                      {gone
                        ? <Button size="sm" variant="ghost" icon="back" onClick={() => patchLine(l.id, { removed: false })}>Undo</Button>
                        : l.added
                          ? <Button size="sm" variant="ghost" icon="delete" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}>Remove</Button>
                          : <Button size="sm" variant="ghost" icon="delete" onClick={() => patchLine(l.id, { removed: true })}>Remove</Button>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-kit-slate-12">
              <td colSpan={3} className="px-2 py-2 text-right">TOTAL PAYABLE</td>
              <td className="px-2 py-2 text-center tabular-nums">{goodsQty(shownLines)} pcs</td>
              <td colSpan={2} />
              <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                RM {money(total)}
                {editing && total !== sum(savedLines) && <Was>RM {money(sum(savedLines))}</Was>}
              </td>
              {editing && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
      {editing && (
        <div className="mt-2">
          <Button variant="ghost" icon="add" disabled={lines.some((l) => l.id === NEW_LINE.id)} onClick={() => setLines((ls) => [...ls, { ...NEW_LINE }])}>Add item</Button>
        </div>
      )}
    </Card>
  );

  const payment = (
    <Card title="Payment" aside={<a className="text-meta text-kit-blue-11 hover:underline" href="#payments">Open this order in Payments →</a>}>
      <p className="mb-2 text-meta text-kit-slate-11">Payment details recorded at sale: 12-month instalment · BANK-REFERENCE · <a className="text-kit-blue-11 hover:underline" href="#slip">View slip</a></p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-body">
          <thead>
            <tr className="border-b border-kit-slate-5 text-left text-meta text-kit-slate-11">
              <th className="whitespace-nowrap px-2 py-1 font-normal">Date</th><th className="whitespace-nowrap px-2 py-1 font-normal">Payment received</th>
              <th className="whitespace-nowrap px-2 py-1 font-normal">Approval code</th><th className="whitespace-nowrap px-2 py-1 font-normal">Collected by</th>
              <th className="whitespace-nowrap px-2 py-1 text-right font-normal">Amount (RM)</th>
            </tr>
          </thead>
          <tbody>
            {PAYMENTS.map((p) => (
              <tr key={p.receipt} className={`border-b border-kit-slate-5 align-top ${p.voided ? "text-kit-slate-11" : "text-kit-slate-12"}`}>
                <td className="whitespace-nowrap px-2 py-2">{day(p.date)}</td>
                <td className="px-2 py-2">{p.method}
                  <div className="whitespace-nowrap text-meta"><a className="text-kit-blue-11 hover:underline" href="#receipt">{p.receipt}</a></div>
                  {p.voided && <div className="text-meta text-kit-red-11">Voided · Keyed on the wrong order</div>}
                </td>
                <td className="whitespace-nowrap px-2 py-2 font-mono text-meta">{p.code}</td>
                <td className="px-2 py-2">{p.by}</td>
                <td className={`px-2 py-2 text-right tabular-nums ${p.voided ? "line-through" : ""}`}>{money(p.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-kit-slate-12">
              <td colSpan={4} className="px-2 py-2 text-right">TOTAL RECEIVED</td>
              <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">RM {money(paid)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <dl className="ml-auto mt-3 grid w-72 grid-cols-2 text-body text-kit-slate-12 [&>*]:border-b [&>*]:border-kit-slate-5 [&>*]:px-2 [&>*]:py-2">
        <dt>Goods total</dt><dd className="text-right tabular-nums">RM {money(total)}</dd>
        <dt>Tax</dt><dd className="text-right text-kit-slate-11">—</dd>
        <dt>Total payable</dt><dd className="text-right tabular-nums">RM {money(total)}</dd>
        <dt>Paid to date</dt><dd className="text-right tabular-nums">RM {money(paid)}</dd>
        <dt className="font-semibold">Balance due</dt>
        <dd className={`text-right font-semibold tabular-nums ${total - paid > 0 ? "text-kit-red-11" : ""}`}>RM {money(Math.max(total - paid, 0))}</dd>
      </dl>
      {paid > total && <p className="mt-1 text-right text-meta text-kit-amber-11">RM {money(paid - total)} needs review</p>}
    </Card>
  );

  const reasonBlock = editing && reasonNeeded && (
    <section className="rounded-control border border-kit-blue-6 bg-kit-blue-2 px-4 py-3">
      <p className="mb-3 text-body text-kit-slate-12">
        {blockedByOpen
          ? "An earlier change is still waiting for management. Contact and delivery changes can still be saved."
          : amend
            ? `${directKeys.length ? `${directKeys.length} ${directKeys.length === 1 ? "change saves" : "changes save"} now. ` : ""}${approvalCount} ${approvalCount === 1 ? "change goes" : "changes go"} for approval.`
            : "This change makes a new Revision."}
      </p>
      <p className="text-meta text-kit-slate-11">What changes</p>
      <ul className="mb-3 mt-1 space-y-1 text-body text-kit-slate-12">
        {changedKeys.filter((k) => LABEL[k]).map((k) => (
          <li key={k}>{LABEL[k]}: {k === "proceed" || k === "requested" ? `${day(saved[k])} → ${day(form[k])}` : `${saved[k]} → ${form[k]}`}</li>
        ))}
        {lineChanges.map((l) => {
          const was = savedLines.find((x) => x.id === l.id);
          if (l.added) return <li key={l.id}>Add {l.name} ({l.sku}) · Qty {l.qty} · + RM {money(l.qty * l.unit)}</li>;
          if (l.removed) return <li key={l.id}>Cancel {l.name} ({l.sku}) · Qty {l.qty} · − RM {money(l.qty * l.unit)}</li>;
          return <li key={l.id}>{l.name}: Qty {was?.qty} → {l.qty} · RM {money((was?.qty ?? 0) * (was?.unit ?? 0))} → RM {money(l.qty * l.unit)}</li>;
        })}
        {lineChanges.length > 0 && <li className="font-semibold">Total payable RM {money(sum(savedLines))} → RM {money(sum(lines))}</li>}
      </ul>
      {lineChanges.length > 0 && (
        <>
          <p className="text-meta text-kit-slate-11">What it touches</p>
          <ul className="mb-3 mt-1 space-y-1 text-body text-kit-slate-12">
            {lineChanges.filter((l) => LINKS[l.id]).map((l) => (
              <li key={l.id}>{l.name}: {LINKS[l.id].po} · {LINKS[l.id].poState}{LINKS[l.id].unit ? ` · Unit ID ${LINKS[l.id].unit}` : ""} — {LINKS[l.id].po === "Ready stock" ? "Warehouse keeps the Unit until the change is decided" : "Purchasing settles it with the supplier"}</li>
            ))}
            {lineChanges.some((l) => l.added) && <li>New goods — Purchasing buys them after the change is decided</li>}
            <li>Delivery Order: not created yet — nothing to change</li>
            {sum(lines) < paid && <li>Paid to date RM {money(paid)} is more than the new total — RM {money(paid - sum(lines))} needs review in Payments</li>}
          </ul>
        </>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1"><Label htmlFor="asked">Requested date (from customer)</Label><DatePicker id="asked" value={asked} onChange={setAsked} /></div>
        <div className="flex flex-col gap-1 sm:col-span-2"><Label htmlFor="why">Reason for change *</Label>
          <Textarea id="why" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      </div>
    </section>
  );

  const pending = amendment?.status === "waiting";
  const order = (
    <div className="flex flex-col lg:h-full lg:min-h-0 lg:flex-row">
      <div className="min-w-0 space-y-4 bg-kit-slate-2 px-4 py-4 lg:min-h-0 lg:w-1/2 lg:overflow-auto" data-pane="form">
        {toast && <p role="status" className="rounded-control border border-kit-green-6 bg-kit-green-2 px-4 py-2 text-body text-kit-green-11">{toast}</p>}
        {approval}{reasonBlock}{soInfo}{customer}{delivery}{items}{payment}
      </div>
      <aside className="min-w-0 border-t border-kit-slate-5 bg-kit-slate-3 px-4 py-4 lg:min-h-0 lg:w-1/2 lg:overflow-auto lg:border-l lg:border-t-0" aria-label="Sales Order document">
        {pending && !editing && (
          <div className="mx-auto mb-3 max-w-[700px] rounded-control border border-kit-amber-7 bg-kit-amber-3 px-3 py-2 text-body font-medium text-kit-amber-11">
            ⚠ Amendment pending approval — the document shows the order as it is now
          </div>
        )}
        <div className="relative mx-auto max-w-[700px]">
          <div ref={setPane} className="min-h-[400px] overflow-x-auto" />
          {editing && changes > 0 && (
            <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
              <span className="rotate-[-24deg] scale-[2.4] text-page tracking-[0.3em] text-base-900/10">UNSAVED</span>
            </div>
          )}
        </div>
      </aside>
    </div>
  );

  const record = (rows: Row[]) => (
    <ol className="mx-auto max-w-3xl divide-y divide-kit-slate-5 rounded-control border border-kit-slate-5 bg-white">
      {rows.map((r) => (
        <li key={r.title + r.meta} className="px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-body font-semibold text-kit-slate-12">{r.title}</p>
              <p className="text-meta text-kit-slate-11">{r.meta}</p>
              {r.note && <p className="text-body text-kit-slate-12">{r.note}</p>}
            </div>
            {r.version && (
              <Button size="sm" variant="neutral" icon="open" onClick={() => setOpenRev(openRev === r.meta ? null : r.meta)}>
                {openRev === r.meta ? "Close this version" : "Open this version"}
              </Button>
            )}
          </div>
          {r.version && openRev === r.meta && (
            <div className="mt-3 rounded-control border border-kit-slate-5 p-3 text-body text-kit-slate-12">
              <p className="text-meta text-kit-slate-11">The complete order as it was in this version · its own PDF prints from here</p>
              <p className="mt-1">Customer Requested Delivery Date: {day(r.version.form.requested)} · Proceed Date: {day(r.version.form.proceed)} · Sales Location: {r.version.form.location}</p>
              <table className="mt-2 w-full text-body">
                <tbody>
                  {r.version.lines.map((l, i) => (
                    <tr key={l.id} className="border-t border-kit-slate-5">
                      <td className="w-8 py-1 text-kit-slate-11">{i + 1}</td><td className="py-1 font-mono text-meta">{l.sku}</td>
                      <td className="py-1">{l.name}</td><td className="py-1 text-center tabular-nums">{l.qty}</td>
                      <td className="py-1 text-right tabular-nums">{money(l.qty * l.unit)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-kit-slate-5 font-semibold">
                    <td colSpan={3} className="py-1 text-right">TOTAL PAYABLE</td>
                    <td className="py-1 text-center tabular-nums">{goodsQty(r.version.lines)} pcs</td>
                    <td className="py-1 text-right tabular-nums">RM {money(sum(r.version.lines))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </li>
      ))}
    </ol>
  );

  return (
    <div className="flex min-h-screen flex-col bg-kit-slate-2 lg:h-screen">
      {controls}
      {header}
      <div className="border-b border-kit-slate-5 bg-white px-4">
        <Tabs label="Sales order views" value={tab} onValueChange={(v) => !editing && setTab(v)}
          tabs={["Order", "Revisions", "History", "Order Route"].map((v) => ({ value: v, label: v, disabled: editing && v !== "Order" }))} />
      </div>
      {notice}
      <div className="lg:min-h-0 lg:flex-1">
        {tab === "Order" && order}
        {tab === "Revisions" && <div className="p-6">{record(revs)}</div>}
        {tab === "History" && <div className="p-6">{record(hist)}</div>}
        {tab === "Order Route" && <p className="p-6 text-body text-kit-slate-11">Order Route is not changed by this proposal.</p>}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);
