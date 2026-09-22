/**
 * SALES ORDER PAGE — CLICKABLE PROPOSAL, KIT PASS (DEV ONLY, 2026-09-22).
 *
 * Step 1 of the kit review: the approved Sales Order editing plan rebuilt on the
 * EXISTING kit — Panel, FieldFrame, Input, DatePicker, Select, Textarea, Tabs,
 * DropdownMenu, Button, DataTable, Loading, notify(). Where the kit cannot do what
 * the approved plan needs, the page keeps a minimal stand-in marked `KIT GAP n` —
 * those markers ARE the measured gap list. Review copy of the SO template on the
 * right. No demo toolbar; URL scenarios: ?po=0 · ?as=management · ?state=loading|error
 */
import { StrictMode, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import Select from "@/components/kit/Select";
import DatePicker from "@/components/kit/DatePicker";
import Textarea from "@/components/kit/Textarea";
import Tabs from "@/components/kit/Tabs";
import Icon from "@/components/kit/Icon";
import Panel from "@/components/kit/Panel";
import FieldFrame from "@/components/kit/FieldFrame";
import Loading from "@/components/kit/Loading";
import type { Column } from "@/components/kit/DataTable";
import DropdownMenu from "@/components/kit/DropdownMenu";
import { notify } from "@/components/kit/Toast";
import { usePdfCanvases } from "@/lib/pdf/use-pdf-canvases";
import { pdf } from "@react-pdf/renderer";
import * as pdfjs from "pdfjs-dist";
import { registerNotoSansSC } from "@/lib/pdf/fonts/noto";
import { ReviewSalesOrderTemplate, type ReviewSoData } from "./review-so-template";
import { fmtDate } from "@/lib/fmt-date";
import "@/index.css";

const renderReview = (d: ReviewSoData) => { registerNotoSansSC(); return pdf(ReviewSalesOrderTemplate(d)).toBlob(); };
const SIGNATURE_PNG = (() => {
  const c = document.createElement("canvas"); c.width = 320; c.height = 120;
  const g = c.getContext("2d")!; g.strokeStyle = "#1A1714"; g.lineWidth = 3; g.beginPath();
  g.moveTo(20, 80); g.bezierCurveTo(50, 20, 70, 110, 100, 60); g.bezierCurveTo(130, 20, 160, 100, 190, 70); g.bezierCurveTo(220, 40, 250, 100, 300, 50); g.stroke();
  return c.toDataURL("image/png");
})();
(globalThis as { __CARRES_LOGO_SRC__?: string }).__CARRES_LOGO_SRC__ = new URL("carres-logo.png", window.location.href).href;

const Q = new URLSearchParams(window.location.search);
const HAS_PO = Q.get("po") !== "0";
const APPROVER = Q.get("as") === "management";
const PAGE_STATE = Q.get("state") ?? "ready";

/* ── fixture (fictional, not catalogue law) ──────────────────────────── */
type Kind = "goods" | "gift" | "service";
type Model = { sku: string; name: string; unit: number; category: string; options?: { key: string; label: string; values: string[] }[]; fixed?: { label: string; value: string }[] };
const CATALOGUE: Model[] = [
  { sku: "M1401F", name: "Jager mattress", unit: 1890, category: "mattress",
    options: [{ key: "size", label: "Size", values: ["Queen", "King", "Super King"] }], fixed: [{ label: "Firmness", value: "Medium (set by the model)" }] },
  { sku: "BR1201", name: "Bedframe Rio", unit: 1200, category: "bedframe",
    options: [{ key: "size", label: "Size", values: ["Queen", "King"] }, { key: "colour", label: "Colour", values: ["Walnut", "Oak", "Grey fabric"] }] },
  { sku: "CP200", name: "Cloud pillow", unit: 90, category: "accessory", options: [{ key: "option", label: "Option", values: ["Standard", "Contour"] }] },
];
type Line = { id: string; sku: string; name: string; kind: Kind; qty: number; unit: number; config: Record<string, string>; fixed?: string; note?: string; removed?: boolean; added?: boolean };
const skuOf = (l: Line) => (l.config.size ? `${l.sku}-${l.config.size === "Super King" ? "SK" : l.config.size[0]}` : l.sku);
const LINES0: Line[] = [
  { id: "l1", sku: "M1401F", name: "Jager mattress", kind: "goods", qty: 2, unit: 1890, config: { size: "King" }, fixed: "Medium" },
  { id: "l2", sku: "GIFT-PILLOW", name: "Latex pillow", kind: "gift", qty: 1, unit: 0, config: {}, note: "Free gift with Jager mattress" },
  { id: "a1", sku: "DELIVERY", name: "Delivery fee", kind: "service", qty: 1, unit: 250, config: {}, note: "Per trip" },
  { id: "a2", sku: "STAIR_CARRY", name: "Stair carry", kind: "service", qty: 1, unit: 100, config: {}, note: "Per order" },
];
const LINKS: Record<string, string> = HAS_PO
  ? { l1: "PO-150926-0142 · Nice Future · In production · Unit ID U1-000-014, U1-000-015 → Purchasing settles it with the supplier",
      l2: "Ready stock · Unit ID U2-000-201 reserved → Warehouse keeps the Unit until the change is decided" }
  : { l1: "Purchase demand only, no PO yet → Purchasing re-counts what to buy",
      l2: "Ready stock · Unit ID U2-000-201 reserved → Warehouse keeps the Unit until the change is decided" };
const PAYMENTS = [
  { date: "2026-08-21", method: "DuitNow QR", code: "FT2083020", by: "Bernard", amount: 500, receipt: "RC-210826-0012", voided: false },
  { date: "2026-09-02", method: "Bank transfer", code: "TXN-77120", by: "Shasha", amount: 1499.5, receipt: "RC-020926-0031", voided: false },
  { date: "2026-08-20", method: "Cash", code: "WRONG-KEY", by: "Li Ching", amount: 1200, receipt: "RC-200826-0007", voided: true },
];
type Payment = (typeof PAYMENTS)[number];
const BASE = {
  proceed: "2026-08-26", requested: "2026-09-24", location: "PJ Showroom", salesperson: "Bernard", dealer: "Carres HQ",
  name: "LIM KUAN YANG", phone: "0162157293", email: "lim@example.com", race: "Chinese", gender: "Male",
  birthday: "1990-02-08", emName: "Siti", emPhone: "0198887777", emRel: "Spouse", billing: "Billing address same as delivery",
  line1: "12 Jalan SS2/24", line2: "Taman Bahagia", postcode: "47300", city: "Petaling Jaya", state: "Selangor",
  building: "Condo", floor: "3", lift: "No lift", stair: "2",
};
type Form = typeof BASE;
const COMMERCIAL: (keyof Form)[] = ["proceed", "requested", "location", "salesperson", "dealer"];
const LABEL: Record<keyof Form, string> = {
  proceed: "Proceed Date", requested: "Customer Requested Delivery Date", location: "Sales Location", salesperson: "Salesperson", dealer: "Dealer",
  name: "Full name", phone: "Phone", email: "Email", race: "Race", gender: "Gender", birthday: "Birthday",
  emName: "Emergency contact name", emPhone: "Emergency contact phone", emRel: "Relationship", billing: "Billing address",
  line1: "Address line 1", line2: "Address line 2", postcode: "Postcode", city: "City", state: "State",
  building: "Building type", floor: "Floor (Max is 3rd Floor)", lift: "Lift available?", stair: "Items needing stair carry",
};
const SHORT: Partial<Record<keyof Form, string>> = { emName: "Name", emPhone: "Phone" };
const IMPACT: Partial<Record<keyof Form, string>> = {
  proceed: "Purchasing: purchase-demand release timing moves; an issued PO or promised production is not rewritten",
  requested: "Delivery and Purchasing plan to the new date; a booked delivery is re-arranged by Delivery",
  location: "People: sales ownership and commission — management decides",
  salesperson: "People: sales ownership and commission — management decides",
  dealer: "People: sales ownership and commission — management decides",
};
const isDate = (k: keyof Form) => k === "proceed" || k === "requested" || k === "birthday";

/* ── one arithmetic ──────────────────────────────────────────────────── */
const live = (ls: Line[]) => ls.filter((l) => !l.removed);
const goodsTotal = (ls: Line[]) => live(ls).filter((l) => l.kind !== "service").reduce((n, l) => n + l.qty * l.unit, 0);
const serviceTotal = (ls: Line[]) => live(ls).filter((l) => l.kind === "service").reduce((n, l) => n + l.qty * l.unit, 0);
const total = (ls: Line[]) => goodsTotal(ls) + serviceTotal(ls);
const KIND: Record<string, string> = { M1401F: "Mattress", BR1201: "Bedframe", CP200: "Accessory", "GIFT-PILLOW": "Accessory" };
const qtyText = (ls: Line[]) => {
  const m = new Map<string, number>();
  for (const l of live(ls)) if (l.kind !== "service") m.set(KIND[l.sku] ?? "Accessory", (m.get(KIND[l.sku] ?? "Accessory") ?? 0) + l.qty);
  return m.size ? `Qty: ${[...m].map(([k, n]) => `${k} ${n}`).join(" · ")}` : "Qty: no goods";
};
const servicesText = (ls: Line[]) => { const sv = live(ls).filter((l) => l.kind === "service").map((l) => l.name); return sv.length ? `Services: ${sv.join(" · ")}` : "Services: none"; };
const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string) => fmtDate(iso);
const configText = (l: Line) => [...Object.values(l.config), l.fixed].filter(Boolean).join(" · ");
const lineChanged = (l: Line, was?: Line) => !!l.added || !!l.removed || !was || was.qty !== l.qty || was.unit !== l.unit || JSON.stringify(was.config) !== JSON.stringify(l.config);
const sameCommercialLines = (a: Line[], b: Line[]) => JSON.stringify(live(a).map((l) => [l.id, l.qty, l.unit, l.config])) === JSON.stringify(live(b).map((l) => [l.id, l.qty, l.unit, l.config]));

type Version = { rev: number; form: Form; lines: Line[]; title: string; meta: string; reason?: string; signedAt: string | null; issuedOn: string };
type Request = { baseRev: number; baseForm: Form; baseLines: Line[]; form: Form; lines: Line[]; reason: string; evidence: string; status: "waiting" | "rejected"; decision?: string };
const NOW = "Tue, 22 Sep 2026 10:05";

/* ── KIT GAP stand-ins — each marker is one measured gap ─────────────── */
/* KIT GAP 1 — Panel draws its title slate-12; the approved SO card title is blue. Panel is used as-is here. */
/* KIT GAP 2 — no read-only field display: a fact Edit can change shows in a grey box; FieldFrame only frames a control. */
const ReadOnlyValue = ({ children, editable }: { children: ReactNode; editable: boolean }) =>
  editable
    ? <span className="flex min-h-8 items-center rounded-control bg-kit-slate-3 px-3 text-body text-kit-slate-12">{children}</span>
    : <span className="flex min-h-8 items-center text-body text-kit-slate-12">{children}</span>;
/* KIT GAP 3 — no persistent notice / callout (lock notice, change review, waiting request). Toast is transient by law. */
const Notice = ({ tone, children }: { tone: "neutral" | "info" | "waiting"; children: ReactNode }) => (
  <section className={`rounded-card border px-4 py-3 ${tone === "info" ? "border-kit-blue-6 bg-kit-blue-2" : tone === "waiting" ? "border-kit-amber-7 bg-kit-amber-2" : "border-kit-slate-5 bg-white"}`}>{children}</section>
);
/* KIT GAP 5 — document line table. Measured 2026-09-22: kit DataTable (sizing="content") keeps every
   column at its fixed width plus a 42px disclosure column, so in the 50% pane Items hides Amount at
   1440 (774px table in 684px) and Unit/Disc/Amount at 1180; its one-line cells also cut long Before/After
   labels. A document table must shrink its text columns (wrap) and keep every money column visible. */
type DCol = { key: string; label: string; align?: "left" | "right" | "center"; nowrap?: boolean; width?: string };
function DocTable({ label, cols, rows, foot }: { label: string; cols: DCol[]; rows: { id: string; cells: Record<string, ReactNode>; muted?: boolean; after?: ReactNode }[]; foot?: ReactNode }) {
  const al = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");
  return (
    <div className="overflow-x-auto">
      <table aria-label={label} className="w-full border-collapse text-body">
        <thead><tr className="border-b border-kit-slate-5">{cols.map((c) => <th key={c.key} style={c.width ? { width: c.width } : undefined} className={`whitespace-nowrap px-2 py-2 text-label font-medium text-kit-slate-11 ${al(c.align)}`}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => [
            <tr key={r.id} className={`${r.after ? "" : "border-b border-kit-slate-5"} align-top ${r.muted ? "text-kit-slate-11" : "text-kit-slate-12"}`}>
              {cols.map((c) => <td key={c.key} className={`px-2 py-2 ${al(c.align)} ${c.nowrap ? "whitespace-nowrap" : ""} ${c.align === "right" ? "tabular-nums" : ""}`}>{r.cells[c.key]}</td>)}
            </tr>,
            r.after ? <tr key={`${r.id}-after`} className="border-b border-kit-slate-5 bg-kit-slate-2"><td colSpan={cols.length} className="px-2 py-3">{r.after}</td></tr> : null,
          ])}
        </tbody>
        {foot && <tfoot>{foot}</tfoot>}
      </table>
    </div>
  );
}
const Grid = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">{children}</div>;
const SubTitle = ({ children }: { children: ReactNode }) => <h3 className="mb-3 mt-4 border-t border-kit-slate-5 pt-4 text-body font-semibold text-kit-slate-12">{children}</h3>;

/* ── the page ────────────────────────────────────────────────────────── */
function Page() {
  const [versions, setVersions] = useState<Version[]>([
    { rev: 1, form: BASE, lines: LINES0, title: "Original order", meta: "Recorded by Bernard Tan · Fri, 21 Aug 2026 10:02", signedAt: "Fri, 21 Aug 2026 10:05", issuedOn: "2026-08-21" },
  ]);
  const current = versions[versions.length - 1];
  const [request, setRequest] = useState<Request | null>(null);
  const [history, setHistory] = useState([{ title: "Order created", meta: "Bernard Tan · Sales · Fri, 21 Aug 2026 10:02", note: "Deposit RM 500.00 · Showroom order · signed by the customer" }]);
  const [tab, setTab] = useState("Order");
  const [viewRev, setViewRev] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>(BASE);
  const [lines, setLines] = useState<Line[]>(LINES0);
  const [openConfig, setOpenConfig] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [evidence, setEvidence] = useState("");
  const [decision, setDecision] = useState("");
  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const patch = (id: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));

  const keys = Object.keys(BASE) as (keyof Form)[];
  const changedFields = editing ? keys.filter((k) => form[k] !== current.form[k]) : [];
  const changedLines = editing ? lines.filter((l) => lineChanged(l, current.lines.find((c) => c.id === l.id))) : [];
  const commercialOf = (f: Form, ls: Line[], base: { form: Form; lines: Line[] }) =>
    ls.some((l) => lineChanged(l, base.lines.find((b) => b.id === l.id))) || COMMERCIAL.some((k) => f[k] !== base.form[k]);
  const commercial = editing && commercialOf(form, lines, current);
  const changes = changedFields.length + changedLines.length;
  /* OUT OF DATE: the commercial facts a waiting request was computed from have changed. */
  const stale = !!request && request.status === "waiting" &&
    (!sameCommercialLines(request.baseLines, current.lines) || COMMERCIAL.some((k) => request.baseForm[k] !== current.form[k]));
  const blockedByOpen = commercial && request?.status === "waiting" && !stale;
  const needReason = changes > 0 && reason.trim() === "";
  const action = commercial ? "Submit amendment request" : "Save";

  const startEdit = (seed?: { form: Form; lines: Line[] }) => {
    setForm(seed?.form ?? current.form); setLines(seed?.lines ?? current.lines); setReason(""); setAsked(null); setEvidence(""); setOpenConfig(new Set());
    setEditing(true); setTab("Order"); setViewRev(null);
  };
  const commit = () => {
    if (commercial) {
      setRequest({ baseRev: current.rev, baseForm: current.form, baseLines: current.lines, form, lines, reason, evidence, status: "waiting" });
      setHistory((h) => [{ title: "Amendment request submitted", meta: `Shasha · Operation · ${NOW}`, note: `${changes} ${changes === 1 ? "change" : "changes"} · Waiting for management` }, ...h]);
      notify("success", "Sent for approval. The order stays as it is until management approves.");
    } else {
      const rev = current.rev + 1;
      setVersions((v) => [...v, { rev, form, lines: current.lines, title: "Staff correction", meta: `Saved by Shasha · ${NOW}`, reason, signedAt: null, issuedOn: "2026-09-22" }]);
      setHistory((h) => [{ title: "Order corrected", meta: `Shasha · Operation · ${NOW}`, note: `Rev ${rev} · ${changedFields.map((k) => LABEL[k]).join(" · ")}` }, ...h]);
      notify("success", "Saved");
    }
    setEditing(false);
  };
  const approve = () => {
    if (!request || stale) return;
    const rev = current.rev + 1;
    const kept = live(request.lines).map(({ added: _a, ...l }) => l);
    const nextForm = { ...current.form, ...Object.fromEntries(COMMERCIAL.map((k) => [k, request.form[k]])) } as Form;
    setVersions((v) => [...v, { rev, form: nextForm, lines: kept, title: "Customer change", meta: `Approved by Jess · Tue, 22 Sep 2026 ${10 + rev}:20`, reason: request.reason, signedAt: null, issuedOn: "2026-09-22" }]);
    setHistory((h) => [{ title: "Amendment approved and applied", meta: "Jess · Principal · Tue, 22 Sep 2026 11:20", note: `Rev ${rev} · Customer agreement: ${request.evidence}` }, ...h]);
    setRequest(null); setDecision(""); notify("success", `Approved and applied · Rev ${rev} is now the order`);
  };
  const reject = () => {
    if (!request) return;
    setRequest({ ...request, status: "rejected", decision });
    setHistory((h) => [{ title: "Amendment rejected", meta: "Jess · Principal · Tue, 22 Sep 2026 11:40", note: decision }, ...h]);
    setDecision("");
  };
  const signCurrent = () => {
    const at = `Tue, 22 Sep 2026 ${12 + current.rev}:00`;
    setVersions((vs) => vs.map((v) => (v.rev === current.rev ? { ...v, signedAt: at } : v)));
    setHistory((h) => [{ title: `Customer signed Rev ${current.rev}`, meta: `${current.form.name} · ${at}`, note: `Signed on the Rev ${current.rev} document` }, ...h]);
  };
  /* Test hooks (preview only): the POS e-sign stand-in, and another approved change landing while a request waits. */
  const w = window as unknown as Record<string, unknown>;
  w.__signCurrent = signCurrent;
  w.__landOtherChange = () => {
    const rev = current.rev + 1;
    setVersions((v) => [...v, { rev, form: { ...current.form, requested: "2026-10-01" }, lines: current.lines, title: "Customer change", meta: "Approved by Jess · Tue, 22 Sep 2026 16:00", reason: "Customer moved the delivery date", signedAt: null, issuedOn: "2026-09-22" }]);
  };

  const docVersion = viewRev ? versions.find((v) => v.rev === viewRev)! : current;
  const paidOn = (v: Version) => PAYMENTS.filter((p) => !p.voided && (v.rev === current.rev || p.date <= v.issuedOn));
  const pdfFor = (v: Version): ReviewSoData => {
    const ls = live(v.lines); const paid = paidOn(v).reduce((n, p) => n + p.amount, 0);
    return {
      so_number: "SO-1319", issue_date: "2026-08-21", order_id: "x", order_code: "SO-1319", status_label: "", channel: "showroom",
      customer: { name: v.form.name, address: `${v.form.line1}, ${v.form.line2}, ${v.form.postcode} ${v.form.city}, ${v.form.state}`, phone: v.form.phone, email: v.form.email, emergency: `${v.form.emName} · ${v.form.emPhone} · ${v.form.emRel}` },
      dealer: { name: v.form.dealer, contact: null, address: null, outlet_name: v.form.location, outlet_address: null, salesperson_name: v.form.salesperson, salesperson_phone: null },
      delivery: { date: v.form.requested, floor: 3, has_lift: false } as ReviewSoData["delivery"],
      proceed_date: v.form.proceed,
      lines: ls.filter((l) => l.kind !== "service").map((l) => ({ sku: skuOf(l), description: `${l.name}${configText(l) ? ` · ${configText(l)}` : ""}`, qty: l.qty, unit_price: l.unit, line_total: l.qty * l.unit, attrs: null, category: CATALOGUE.find((m) => m.sku === l.sku)?.category ?? "accessory" })) as ReviewSoData["lines"],
      addons: ls.filter((l) => l.kind === "service").map((l) => ({ label: l.name, sku: "ADD-ON", qty: l.qty, unit_price: l.unit, line_total: l.qty * l.unit })),
      payments: paidOn(v).map((p) => ({ label: p.method, reference: p.code, amount: p.amount, date: p.date, approval_code: p.code, collected_by: p.by })),
      subtotal: total(ls), total: total(ls), paid, balance_due: Math.max(total(ls) - paid, 0), currency: "MYR", issued_by: "Bernard Tan",
      signed: !!v.signedAt, signature_url: v.signedAt ? SIGNATURE_PNG : null,
      review_rev: v.rev, review_signature: v.signedAt ? { by: v.form.name, at: v.signedAt, rev: v.rev } : null,
    } as ReviewSoData;
  };
  const pdfData = useMemo(() => pdfFor(docVersion), [docVersion, current.rev]);
  const showPdf = PAGE_STATE === "ready" && tab === "Order";
  const { setPane } = usePdfCanvases(showPdf ? `rev-${docVersion.rev}-${docVersion.signedAt ?? "u"}-${current.rev}` : null, () => renderReview(pdfData));
  const printVersion = async (v: Version) => window.open(URL.createObjectURL(await renderReview(pdfFor(v))), "_blank");
  w.__docText = async (rev: number) => {
    const v = versions.find((x) => x.rev === rev)!;
    const doc = await pdfjs.getDocument({ data: await (await renderReview(pdfFor(v))).arrayBuffer() }).promise;
    let out = "";
    for (let i = 1; i <= doc.numPages; i++) out += (await (await doc.getPage(i)).getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
    return out;
  };

  if (PAGE_STATE !== "ready")
    return (
      <div className="flex min-h-screen flex-col bg-kit-slate-2">
        <Toaster position="top-right" />
        {PAGE_STATE === "loading" ? (
          <div className="flex flex-col gap-4 p-4 lg:w-1/2" data-testid="page-loading">
            <Panel title="SO info"><Loading variant="skeleton" lines={3} label="Opening the sales order" /></Panel>
            <Panel title="Customer"><Loading variant="skeleton" lines={4} label="Opening the sales order" /></Panel>
          </div>
        ) : (
          <div className="grid place-items-center gap-3 p-16 text-center">
            <p className="text-strong text-kit-slate-12">This sales order could not be opened</p>
            <Button variant="neutral" icon="refresh" onClick={() => window.location.reload()}>Try again</Button>
          </div>
        )}
      </div>
    );

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-kit-slate-5 bg-white px-4 py-3">
      <h1 className="text-title text-kit-slate-12 lg:text-page">SO-1319<span className="ml-3 font-normal text-kit-slate-11">{current.form.name}</span></h1>
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            {changes > 0 && <span className="text-body text-kit-slate-11">{changes} {changes === 1 ? "change" : "changes"}</span>}
            <Button variant="neutral" onClick={() => setEditing(false)}>Cancel</Button>
            {changes > 0 && <Button variant="primary" disabled={needReason || blockedByOpen} onClick={commit}>{needReason ? `${action} — say why` : action}</Button>}
          </>
        ) : (
          <>
            <DropdownMenu label="Print" trigger={<Button variant="neutral" icon="print">Print ▾</Button>}
              items={[{ key: "p", label: "Print Sales Order", icon: "print", onSelect: () => void printVersion(current) }, { key: "d", label: "Download PDF", icon: "download", onSelect: () => void printVersion(current) }]} />
            <Button variant="primary" icon="edit" onClick={() => startEdit()}>Edit</Button>
            <DropdownMenu label="More actions" trigger={<Button variant="neutral" icon="overflow" aria-label="More actions" title="More actions" />}
              items={[{ key: "copy", label: "Copy to new Sales Order", icon: "copy", onSelect: () => undefined }, { key: "problem", label: "Report a problem", icon: "flag", onSelect: () => undefined }, { key: "cancel", label: "Cancel SO", icon: "close", onSelect: () => undefined, separatorBefore: true }]} />
          </>
        )}
      </div>
    </div>
  );

  /* ── Before / After on the kit DataTable ── */
  type Diff = { what: string; before: string; after: string };
  const diffRows = (f: Form, ls: Line[], base: { form: Form; lines: Line[] }): Diff[] => [
    ...keys.filter((k) => f[k] !== base.form[k]).map((k) => ({ what: LABEL[k], before: isDate(k) ? day(base.form[k]) : base.form[k], after: isDate(k) ? day(f[k]) : f[k] })),
    ...ls.filter((l) => lineChanged(l, base.lines.find((b) => b.id === l.id))).map((l) => {
      const was = base.lines.find((b) => b.id === l.id);
      return { what: `${l.name} (${skuOf(l)})`, before: l.added || !was ? "—" : `${was.qty} × ${money(was.unit)}${configText(was) ? ` · ${configText(was)}` : ""}`, after: l.removed ? "Cancelled" : `${l.qty} × ${money(l.unit)}${configText(l) ? ` · ${configText(l)}` : " · choose the configuration"}` };
    }),
    { what: "Qty", before: qtyText(base.lines).replace("Qty: ", ""), after: qtyText(ls).replace("Qty: ", "") },
    ...(servicesText(base.lines) !== servicesText(ls) ? [{ what: "Services", before: servicesText(base.lines).replace("Services: ", ""), after: servicesText(ls).replace("Services: ", "") }] : []),
    { what: "Total payable", before: `RM ${money(total(base.lines))}`, after: `RM ${money(total(ls))}` },
  ];
  const paidNow = PAYMENTS.filter((p) => !p.voided).reduce((n, p) => n + p.amount, 0);
  const impacts = (f: Form, ls: Line[], base: { form: Form; lines: Line[] }) => [
    ...keys.filter((k) => f[k] !== base.form[k] && IMPACT[k]).map((k) => `${LABEL[k]}: ${IMPACT[k]}`),
    ...ls.filter((l) => lineChanged(l, base.lines.find((b) => b.id === l.id)) && LINKS[l.id]).map((l) => `${l.name}: ${LINKS[l.id]}`),
    ...(ls.some((l) => l.added) ? ["New goods: Purchasing buys them after approval"] : []),
    ...(ls.some((l) => l.removed && l.id === "l1") && ls.some((l) => l.kind === "gift" && !l.removed) ? ["Free gift: check the gift is still allowed without the cancelled mattress"] : []),
    ...(total(ls) !== total(base.lines) ? [`Payments: ${total(ls) < paidNow ? `RM ${money(paidNow - total(ls))} paid more than the new total — Payments reviews a refund` : `balance due becomes RM ${money(Math.max(total(ls) - paidNow, 0))}`}`] : []),
  ];
  const beforeAfter = (f: Form, ls: Line[], base: { form: Form; lines: Line[] }) => (
    <>
      <DocTable label="Before and after" cols={[{ key: "what", label: "Change" }, { key: "before", label: "Before" }, { key: "after", label: "After" }]}
        rows={diffRows(f, ls, base).map((r) => ({ id: r.what, cells: { what: <span className="text-kit-slate-11">{r.what}</span>, before: <span className="text-kit-slate-11">{r.before}</span>, after: <span className="font-semibold">{r.after}</span> } }))} />
      {commercialOf(f, ls, base) && impacts(f, ls, base).length > 0 && (
        <>
          <p className="mt-3 text-meta text-kit-slate-11">Before approval</p>
          <ul className="mt-1 space-y-1 text-body text-kit-slate-12">{impacts(f, ls, base).map((t) => <li key={t}>{t}</li>)}</ul>
        </>
      )}
    </>
  );

  const review = editing && changes > 0 && (
    <Notice tone="info">
      <p className="mb-2 text-body font-semibold text-kit-slate-12">
        {blockedByOpen ? "An earlier change is still waiting for management." : commercial ? "These changes go for approval. The order stays as it is until approved." : "This correction saves as a new revision."}
      </p>
      {beforeAfter(form, lines, current)}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <DatePicker id="asked" label="Requested date (from customer)" value={asked} onChange={setAsked} />
        <div className="sm:col-span-2"><Textarea id="why" label="Reason for change" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        {commercial && (
          <div className="sm:col-span-3">
            <Input id="evidence" label="Customer agreement evidence" hint="You can send the request without it, but management cannot approve until it is recorded."
              placeholder="WhatsApp from the customer, Tue 22 Sep 09:40 — or the signed document" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
          </div>
        )}
      </div>
    </Notice>
  );

  type Tri = { what: string; base: string; now: string; proposed: string };
  const requestPanel = request && !editing && (
    <Notice tone="waiting">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-strong text-kit-slate-12">{request.status === "rejected" ? "Rejected" : stale ? "Out of date — propose again" : "Waiting for management"}</h2>
        <span className="text-meta text-kit-slate-11">Submitted by Shasha · {NOW} · on Rev {request.baseRev}</span>
      </div>
      <p className="mb-2 mt-1 text-body text-kit-slate-12">Reason for change: {request.reason}</p>
      {stale ? (
        <>
          <p className="mb-2 text-body text-kit-slate-12">The order changed after this request was sent. Nothing was applied. Compare and propose again.</p>
          <DocTable label="Sent on, now and proposed"
            cols={[{ key: "what", label: "Change" }, { key: "base", label: `Rev ${request.baseRev} (sent on)` }, { key: "now", label: `Rev ${current.rev} (now)` }, { key: "proposed", label: "Proposed" }]}
            rows={([
              ...COMMERCIAL.filter((k) => request.baseForm[k] !== current.form[k] || request.form[k] !== request.baseForm[k]).map((k) => ({ what: LABEL[k], base: isDate(k) ? day(request.baseForm[k]) : request.baseForm[k], now: isDate(k) ? day(current.form[k]) : current.form[k], proposed: isDate(k) ? day(request.form[k]) : request.form[k] })),
              { what: "Qty", base: qtyText(request.baseLines).replace("Qty: ", ""), now: qtyText(current.lines).replace("Qty: ", ""), proposed: qtyText(request.lines).replace("Qty: ", "") },
              { what: "Total payable", base: `RM ${money(total(request.baseLines))}`, now: `RM ${money(total(current.lines))}`, proposed: `RM ${money(total(request.lines))}` },
            ] as Tri[]).map((r) => ({ id: r.what, cells: { what: <span className="text-kit-slate-11">{r.what}</span>, base: r.base, now: <span className="font-semibold">{r.now}</span>, proposed: r.proposed } }))} />
          <div className="mt-3 flex justify-end">
            <Button variant="primary" onClick={() => {
              const seedForm = { ...current.form, ...Object.fromEntries(COMMERCIAL.filter((k) => request.form[k] !== request.baseForm[k]).map((k) => [k, request.form[k]])) } as Form;
              setRequest(null); startEdit({ form: seedForm, lines: request.lines });
            }}>Propose this version again</Button>
          </div>
        </>
      ) : (
        <>
          {beforeAfter(request.form, request.lines, { form: request.baseForm, lines: request.baseLines })}
          <p className="mt-3 text-body text-kit-slate-12">Customer agreement evidence: {request.evidence ? request.evidence : <span className="text-kit-red-11">Not recorded yet — the change cannot take effect</span>}</p>
          {request.status === "waiting" && APPROVER && (
            <div className="mt-3 flex flex-col gap-3 border-t border-kit-amber-6 pt-3">
              <Textarea id="decision" label="Management decision reason" rows={2} value={decision} onChange={(e) => setDecision(e.target.value)} />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="neutral" disabled={!decision.trim()} onClick={reject}>{decision.trim() ? "Reject" : "Reject — say why"}</Button>
                <Button variant="primary" disabled={!request.evidence} onClick={approve}>{request.evidence ? "Approve and apply" : "Approve and apply — needs customer agreement evidence"}</Button>
              </div>
            </div>
          )}
          {request.status === "rejected" && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-kit-amber-6 pt-3">
              <p className="text-body text-kit-slate-12">Rejected by Jess · Tue, 22 Sep 2026 11:40 — {request.decision}. The order is unchanged.</p>
              <Button variant="neutral" onClick={() => setRequest(null)}>Close</Button>
            </div>
          )}
        </>
      )}
    </Notice>
  );

  const orderCards = (src: Version, readOnly: boolean) => {
    const edit = editing && !readOnly;
    const ls = readOnly ? src.lines : edit ? lines : current.lines;
    const pays: Payment[] = readOnly && src.rev !== current.rev ? PAYMENTS.filter((p) => p.date <= src.issuedOn) : PAYMENTS;
    const paid = pays.filter((p) => !p.voided).reduce((n, p) => n + p.amount, 0);
    const G = (k: keyof Form, kind: "text" | "tel" | "email" | "date" | "lift" = "text") => {
      const label = SHORT[k] ?? LABEL[k];
      if (!edit) return <FieldFrame id={`v-${k}`} label={label}><ReadOnlyValue editable>{isDate(k) ? day(src.form[k]) : src.form[k]}</ReadOnlyValue></FieldFrame>;
      if (kind === "date") return <DatePicker id={k} label={label} value={form[k]} onChange={(v) => set(k)(v ?? current.form[k])} />;
      if (kind === "lift") return <Select id={k} label={label} value={form[k]} onValueChange={set(k)} options={[{ value: "No lift", label: "No lift" }, { value: "Has lift", label: "Has lift" }]} />;
      return <Input id={k} label={label} type={kind} value={form[k]} onChange={(e) => set(k)(e.target.value)} />;
    };
    const itemCols: Column<Line>[] = [
      { key: "no", label: "#", width: "36px", cell: (l) => <span className="text-kit-slate-11">{ls.indexOf(l) + 1}</span> },
      { key: "code", label: "Item Code", width: "130px", cell: (l) => l.kind === "goods" ? <ReadOnlyValue editable><span className="whitespace-nowrap">{skuOf(l)}</span></ReadOnlyValue> : <span className="whitespace-nowrap">{skuOf(l)}</span> },
      { key: "desc", label: "Description", width: "200px", cell: (l) => (
        <div>
          <div>{l.name}</div>
          {configText(l) && <div className="text-meta text-kit-slate-11">{configText(l)}</div>}
          {l.note && <div className="text-meta text-kit-slate-11">{l.note}</div>}
          {edit && l.added && <div className="text-meta text-kit-blue-11">New line</div>}
          {edit && l.removed && <div className="text-meta text-kit-red-11">Cancelled when approved · Restore to keep it</div>}
          {edit && !l.removed && l.kind === "goods" && CATALOGUE.find((m) => m.sku === l.sku)?.options && (
            <button type="button" className="mt-1 text-meta text-kit-blue-11 hover:underline" aria-expanded={openConfig.has(l.id)} aria-label={`Configure ${l.name}`}
              onClick={() => setOpenConfig((st) => { const n = new Set(st); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })}>
              {openConfig.has(l.id) ? "Close configuration" : "Configure"}
            </button>
          )}
        </div>
      ) },
      { key: "qty", label: "Qty", width: "84px", align: "right", numeric: true, cell: (l) =>
          edit && !l.removed && l.kind === "goods"
            ? <Input id={`qty-${l.id}`} aria-label={`Qty ${l.name}`} type="number" min={1} value={l.qty} onChange={(e) => patch(l.id, { qty: Math.max(1, Number(e.target.value) || 1) })} />
            : l.kind === "goods" ? <ReadOnlyValue editable>{l.qty}</ReadOnlyValue> : <span>{l.qty}</span> },
      { key: "unit", label: "Unit (RM)", width: "120px", align: "right", numeric: true, cell: (l) =>
          edit && !l.removed && l.kind === "goods"
            ? <Input id={`unit-${l.id}`} aria-label={`Unit price ${l.name}`} type="number" min={0} step="0.01" value={l.unit} onChange={(e) => patch(l.id, { unit: Math.max(0, Number(e.target.value) || 0) })} />
            : l.kind === "goods" ? <ReadOnlyValue editable>{money(l.unit)}</ReadOnlyValue> : <span>{money(l.unit)}</span> },
      { key: "disc", label: "Disc (RM)", width: "84px", align: "right", numeric: true, cell: () => <span className="text-kit-slate-11">—</span> },
      { key: "amt", label: "Amount (RM)", width: "120px", align: "right", numeric: true, cell: (l) => <span className="whitespace-nowrap">{money(l.qty * l.unit)}</span> },
      ...(edit ? [{ key: "act", label: "Change", width: "110px", cell: (l: Line) => l.removed
          ? <Button size="sm" variant="ghost" icon="back" onClick={() => patch(l.id, { removed: false })}>Restore</Button>
          : <Button size="sm" variant="ghost" icon="delete" onClick={() => (l.added ? setLines((x) => x.filter((y) => y.id !== l.id)) : patch(l.id, { removed: true }))}>Remove</Button> } as Column<Line>] : []),
    ];
    const payCols: Column<Payment>[] = [
      { key: "date", label: "Date", width: "110px", cell: (p) => <span className="whitespace-nowrap">{day(p.date)}</span> },
      { key: "method", label: "Payment received", width: "190px", cell: (p) => (
        <div>{p.method}<div className="text-meta"><a className="text-kit-blue-11 hover:underline" href="#receipt">{p.receipt}</a></div>
          {p.voided && <div className="text-meta text-kit-red-11">Voided · Keyed on the wrong order · not counted</div>}</div>) },
      { key: "code", label: "Approval code", width: "130px", cell: (p) => p.code },
      { key: "by", label: "Collected by", width: "110px", cell: (p) => p.by },
      { key: "amt", label: "Amount (RM)", width: "120px", align: "right", numeric: true, cell: (p) => <span className={p.voided ? "line-through" : ""}>{money(p.amount)}</span> },
    ];
    return (
      <>
        <Panel title="SO info">
          <Grid>
            <FieldFrame id="v-docdate" label="SO Doc Date"><ReadOnlyValue editable={false}>{day("2026-08-21")}</ReadOnlyValue></FieldFrame>
            {G("proceed", "date")}{G("requested", "date")}{G("location")}{G("salesperson")}{G("dealer")}
          </Grid>
        </Panel>
        <Panel title="Customer" right={<span className="text-meta text-kit-slate-11">Existing customer · <a className="text-kit-blue-11 hover:underline" href="#customer">3 orders ›</a></span>}>
          <Grid>{G("name")}{G("phone", "tel")}{G("email", "email")}{G("race")}{G("gender")}{G("birthday", "date")}</Grid>
          <SubTitle>Emergency contact</SubTitle>
          <Grid>{G("emName")}{G("emPhone", "tel")}{G("emRel")}</Grid>
          <SubTitle>Billing</SubTitle>
          <div className="sm:w-2/3">{G("billing")}</div>
        </Panel>
        <Panel title="Delivery">
          <Grid>{G("line1")}{G("line2")}{G("postcode")}{G("city")}{G("state")}{G("building")}{G("floor")}{G("lift", "lift")}{G("stair")}</Grid>
        </Panel>
        <Panel title="Items" padding="none">
          <DocTable label="Items" cols={[
              { key: "no", label: "#", width: "28px" }, { key: "code", label: "Item Code", nowrap: true }, { key: "desc", label: "Description" },
              { key: "qty", label: "Qty", align: "center", width: "60px" }, { key: "unit", label: "Unit (RM)", align: "right", nowrap: true, width: edit ? "96px" : undefined },
              { key: "disc", label: "Disc (RM)", align: "right", nowrap: true }, { key: "amt", label: "Amount (RM)", align: "right", nowrap: true },
              ...(edit ? [{ key: "act", label: "", nowrap: true } as DCol] : []),
            ]}
            rows={ls.map((l) => {
              const model = CATALOGUE.find((m) => m.sku === l.sku);
              const canConfig = edit && !l.removed && l.kind === "goods" && !!model?.options;
              const strike = l.removed ? "line-through" : "";
              return {
                id: l.id, muted: !!l.removed,
                cells: Object.fromEntries(itemCols.map((c) => [c.key, <span key={c.key} className={c.key === "act" ? "" : strike}>{c.cell(l)}</span>])) as Record<string, ReactNode>,
                after: canConfig && openConfig.has(l.id) ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {model!.options!.map((o) => (
                      <Select key={o.key} id={`${l.id}-${o.key}`} label={o.label} value={l.config[o.key]} placeholder={`Choose ${o.label.toLowerCase()}`}
                        onValueChange={(v) => patch(l.id, { config: { ...l.config, [o.key]: v } })} options={o.values.map((v) => ({ value: v, label: v }))} />
                    ))}
                    {model!.fixed?.map((x) => <FieldFrame key={x.label} id={`${l.id}-${x.label}`} label={x.label}><ReadOnlyValue editable={false}>{x.value}</ReadOnlyValue></FieldFrame>)}
                  </div>) : undefined,
              };
            })}
            foot={<tr className="font-semibold text-kit-slate-12"><td colSpan={6} className="px-2 py-2 text-right">TOTAL PAYABLE</td><td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">RM {money(total(ls))}</td>{edit && <td />}</tr>} />
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            {edit ? (
              <DropdownMenu label="Add item" align="start" trigger={<Button variant="ghost" icon="add">Add item</Button>}
                items={CATALOGUE.map((m) => ({ key: m.sku, label: `${m.name} · RM ${money(m.unit)}`, onSelect: () => {
                  const id = `n${Date.now()}`;
                  setLines((x) => [...x, { id, sku: m.sku, name: m.name, kind: "goods", qty: 1, unit: m.unit, config: {}, fixed: m.fixed?.[0]?.value.split(" (")[0], added: true }]);
                  setOpenConfig((s) => new Set(s).add(id));
                } }))} />
            ) : <span />}
            <span className="flex flex-wrap gap-x-6 text-body text-kit-slate-12"><span>{qtyText(ls)}</span><span>{servicesText(ls)}</span></span>
          </div>
        </Panel>
        <Panel title="Payment" padding="none" right={<a className="text-meta text-kit-blue-11 hover:underline" href="#payments">Open this order in Payments →</a>}>
          <p className="px-4 pt-3 text-meta text-kit-slate-11">Payment details recorded at sale: 12-month instalment · BANK-REFERENCE · <a className="text-kit-blue-11 hover:underline" href="#slip">View slip</a></p>
          <div className="px-2 pt-2"><DocTable label="Payments" cols={[{ key: "date", label: "Date", nowrap: true }, { key: "method", label: "Payment received" }, { key: "code", label: "Approval code", nowrap: true }, { key: "by", label: "Collected by" }, { key: "amt", label: "Amount (RM)", align: "right", nowrap: true }]}
            rows={pays.map((p) => ({ id: p.receipt, muted: p.voided, cells: Object.fromEntries(payCols.map((c) => [c.key, c.cell(p)])) as Record<string, ReactNode> }))} /></div>
          {/* KIT GAP 4 — DataTable `totals` is ONE strip; the approved money zone is five rows. */}
          <dl className="ml-auto grid w-80 grid-cols-2 px-4 py-3 text-body text-kit-slate-12 [&>*]:border-b [&>*]:border-kit-slate-5 [&>*]:py-2">
            <dt>Goods amount</dt><dd className="text-right tabular-nums">RM {money(goodsTotal(ls))}</dd>
            <dt>Service amount</dt><dd className="text-right tabular-nums">RM {money(serviceTotal(ls))}</dd>
            <dt>Total payable</dt><dd className="text-right tabular-nums">RM {money(total(ls))}</dd>
            <dt>Paid to date</dt><dd className="text-right tabular-nums">RM {money(paid)}</dd>
            <dt className="font-semibold">Balance due</dt><dd className={`text-right font-semibold tabular-nums ${total(ls) - paid > 0 ? "text-kit-red-11" : ""}`}>RM {money(Math.max(total(ls) - paid, 0))}</dd>
          </dl>
        </Panel>
      </>
    );
  };

  const viewing = viewRev ? versions.find((v) => v.rev === viewRev)! : null;
  const pending = request?.status === "waiting";
  const order = (
    <div className="flex flex-col lg:h-full lg:min-h-0 lg:flex-row">
      <div className="min-w-0 space-y-4 bg-kit-slate-2 px-4 py-4 lg:min-h-0 lg:w-1/2 lg:overflow-auto" data-pane="form">
        {HAS_PO && (
          <Notice tone="neutral"><span className="flex items-start gap-2 text-body text-kit-slate-12"><Icon name="lock" size={16} />This SO is already ordered from the supplier. Your change goes for approval first; the order changes only after it is approved.</span></Notice>
        )}
        {viewing ? (
          <Notice tone="neutral">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-body text-kit-slate-12"><b>Rev {viewing.rev}</b> · {viewing.title} · {viewing.meta}{viewing.rev === current.rev ? " · Current" : ""}</span>
              <span className="flex flex-wrap gap-2">
                <Button variant="neutral" icon="print" onClick={() => void printVersion(viewing)}>Print this version</Button>
                <Button variant="neutral" icon="back" onClick={() => { setViewRev(null); setTab("Revisions"); }}>Return to current</Button>
              </span>
            </div>
          </Notice>
        ) : (<>{requestPanel}{review}</>)}
        {orderCards(viewing ?? current, !!viewing)}
      </div>
      <aside className="min-w-0 border-t border-kit-slate-5 bg-kit-slate-3 px-4 py-4 lg:min-h-0 lg:w-1/2 lg:overflow-auto lg:border-l lg:border-t-0" aria-label="Sales Order document">
        {(pending || editing) && !viewing && (
          <div className="mx-auto mb-3 max-w-[700px]"><Notice tone="neutral"><span className="text-body text-kit-slate-12">Review sample. The document shows the order as it is now (Rev {current.rev}). {editing ? "Your changes appear in the review on the left." : "It changes only after approval."}</span></Notice></div>
        )}
        <div className="mx-auto max-w-[700px]"><div ref={setPane} className="min-h-[400px] overflow-x-auto" /></div>
      </aside>
    </div>
  );

  const revisionsTab = (
    <div className="mx-auto my-6 max-w-3xl">
      <Panel title="Revisions" padding="none">
        <ol className="divide-y divide-kit-slate-5">
          {[...versions].reverse().map((v) => (
            <li key={v.rev} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
              <div>
                <p className="text-body font-semibold text-kit-slate-12">{v.title}</p>
                <p className="text-meta text-kit-slate-11">Rev {v.rev}{v.rev === current.rev ? " · Current" : ""} · {v.meta} · {v.signedAt ? `Signed ${v.signedAt}` : "Not signed"}</p>
                {v.reason && <p className="text-body text-kit-slate-12">Reason for change: {v.reason}</p>}
                <p className="text-meta text-kit-slate-11">{qtyText(v.lines)} · {servicesText(v.lines)} · Total payable RM {money(total(v.lines))}</p>
              </div>
              <Button size="sm" variant="neutral" icon="open" onClick={() => { setViewRev(v.rev); setTab("Order"); }}>View version</Button>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
  const historyTab = (
    <div className="mx-auto my-6 max-w-3xl">
      <Panel title="History" padding="none">
        <ol className="divide-y divide-kit-slate-5">
          {history.map((h) => (
            <li key={h.title + h.meta} className="px-4 py-3">
              <p className="text-body font-semibold text-kit-slate-12">{h.title}</p>
              <p className="text-meta text-kit-slate-11">{h.meta}</p>
              {h.note && <p className="text-body text-kit-slate-12">{h.note}</p>}
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-kit-slate-2 lg:h-screen">
      <Toaster position="top-right" />
      {header}
      <div className="border-b border-kit-slate-5 bg-white px-4">
        <Tabs label="Sales order views" value={tab} onValueChange={(v) => { if (!editing) { setTab(v); setViewRev(null); } }}
          tabs={["Order", "Revisions", "History", "Order Route"].map((v) => ({ value: v, label: v, disabled: editing && v !== "Order" }))} />
      </div>
      <div className="lg:min-h-0 lg:flex-1">
        {tab === "Order" && order}
        {tab === "Revisions" && <div className="px-4">{revisionsTab}</div>}
        {tab === "History" && <div className="px-4">{historyTab}</div>}
        {tab === "Order Route" && <p className="p-6 text-body text-kit-slate-11">Order Route is not changed by this proposal.</p>}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);
