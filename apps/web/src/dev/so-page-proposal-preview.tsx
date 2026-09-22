/**
 * SALES ORDER PAGE — CLICKABLE PROPOSAL (DEV ONLY, 2026-09-22).
 *
 * Follows the owner-approved Sales Order editing plan (whole-page draft, server-chosen
 * Save / Submit amendment request, catalogue items with model configuration,
 * Remove / Restore, three counts, goods vs services money, version-bound documents and
 * signatures, customer agreement evidence). Real kit components + the real
 * `renderSalesOrderPdf` template. No demo toolbar: scenarios are URL links —
 *   ?po=0            no supplier commitment yet
 *   ?as=management   the approver's view
 *   ?state=loading | error
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
import { pdf } from "@react-pdf/renderer";
import * as pdfjs from "pdfjs-dist";
import { registerNotoSansSC } from "@/lib/pdf/fonts/noto";
import { ReviewSalesOrderTemplate, type ReviewSoData } from "./review-so-template";
import { fmtDate } from "@/lib/fmt-date";
import "@/index.css";

/** Review copy only — never the official template. */
const renderReview = (d: ReviewSoData) => { registerNotoSansSC(); return pdf(ReviewSalesOrderTemplate(d)).toBlob(); };
/** A drawn signature image (fixture). */
const SIGNATURE_PNG = (() => {
  const c = document.createElement("canvas"); c.width = 320; c.height = 120;
  const g = c.getContext("2d")!; g.strokeStyle = "#1A1714"; g.lineWidth = 3; g.beginPath();
  g.moveTo(20, 80); g.bezierCurveTo(50, 20, 70, 110, 100, 60); g.bezierCurveTo(130, 20, 160, 100, 190, 70); g.bezierCurveTo(220, 40, 250, 100, 300, 50); g.stroke();
  return c.toDataURL("image/png");
})();

(globalThis as { __CARRES_LOGO_SRC__?: string }).__CARRES_LOGO_SRC__ =
  new URL("carres-logo.png", window.location.href).href;

const Q = new URLSearchParams(window.location.search);
const HAS_PO = Q.get("po") !== "0";
const APPROVER = Q.get("as") === "management";
const PAGE_STATE = Q.get("state") ?? "ready";

/* ── catalogue fixture (fictional, not catalogue law) ────────────────── */
type Kind = "goods" | "gift" | "service";
type Model = {
  sku: string; name: string; kind: Kind; unit: number; category: string;
  options?: { key: string; label: string; values: string[] }[];
  fixed?: { label: string; value: string }[];
};
const CATALOGUE: Model[] = [
  { sku: "M1401F", name: "Jager mattress", kind: "goods", unit: 1890, category: "mattress",
    options: [{ key: "size", label: "Size", values: ["Queen", "King", "Super King"] }],
    fixed: [{ label: "Firmness", value: "Medium (set by the model)" }] },
  { sku: "BR1201", name: "Bedframe Rio", kind: "goods", unit: 1200, category: "bedframe",
    options: [{ key: "size", label: "Size", values: ["Queen", "King"] }, { key: "colour", label: "Colour", values: ["Walnut", "Oak", "Grey fabric"] }] },
  { sku: "CP200", name: "Cloud pillow", kind: "goods", unit: 90, category: "accessory",
    options: [{ key: "option", label: "Option", values: ["Standard", "Contour"] }] },
];
type Line = {
  id: string; sku: string; name: string; kind: Kind; qty: number; unit: number;
  config: Record<string, string>; fixed?: string; note?: string;
  removed?: boolean; added?: boolean;
};
const skuOf = (l: Line) => (l.config.size ? `${l.sku}-${l.config.size === "Super King" ? "SK" : l.config.size[0]}` : l.sku);
const LINES0: Line[] = [
  { id: "l1", sku: "M1401F", name: "Jager mattress", kind: "goods", qty: 2, unit: 1890, config: { size: "King" }, fixed: "Medium" },
  { id: "l2", sku: "GIFT-PILLOW", name: "Latex pillow", kind: "gift", qty: 1, unit: 0, config: {}, note: "Free gift with Jager mattress" },
  { id: "a1", sku: "DELIVERY", name: "Delivery fee", kind: "service", qty: 1, unit: 250, config: {}, note: "Per trip" },
  { id: "a2", sku: "STAIR_CARRY", name: "Stair carry", kind: "service", qty: 1, unit: 100, config: {}, note: "Per order" },
];
/* What each line is tied to today (fixture). An SO change never rewrites these — their owners decide. */
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

/* ── arithmetic: one place, three counts, goods vs services ──────────── */
const live = (ls: Line[]) => ls.filter((l) => !l.removed);
const goodsTotal = (ls: Line[]) => live(ls).filter((l) => l.kind !== "service").reduce((n, l) => n + l.qty * l.unit, 0);
const serviceTotal = (ls: Line[]) => live(ls).filter((l) => l.kind === "service").reduce((n, l) => n + l.qty * l.unit, 0);
const total = (ls: Line[]) => goodsTotal(ls) + serviceTotal(ls);
/* Owner ruling 2026-09-22: quantities by product kind; services named, never counted as goods. */
const KIND: Record<string, string> = { M1401F: "Mattress", BR1201: "Bedframe", CP200: "Accessory", "GIFT-PILLOW": "Accessory" };
const qtyText = (ls: Line[]) => {
  const m = new Map<string, number>();
  for (const l of live(ls)) if (l.kind !== "service") m.set(KIND[l.sku] ?? "Other goods", (m.get(KIND[l.sku] ?? "Other goods") ?? 0) + l.qty);
  return m.size ? `Qty: ${[...m].map(([k, n]) => `${k} ${n}`).join(" · ")}` : "Qty: no goods";
};
const servicesText = (ls: Line[]) => {
  const sv = live(ls).filter((l) => l.kind === "service").map((l) => l.name);
  return sv.length ? `Services: ${sv.join(" · ")}` : "Services: none";
};
const PAID = PAYMENTS.filter((p) => !p.voided).reduce((n, p) => n + p.amount, 0);
const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string) => fmtDate(iso);
const configText = (l: Line) => [...Object.values(l.config), l.fixed].filter(Boolean).join(" · ");
const lineChanged = (l: Line, was?: Line) =>
  !!l.added || !!l.removed || !was || was.qty !== l.qty || was.unit !== l.unit || JSON.stringify(was.config) !== JSON.stringify(l.config);
const isDate = (k: keyof Form) => k === "proceed" || k === "requested" || k === "birthday";

type Version = { rev: number; form: Form; lines: Line[]; title: string; meta: string; reason?: string; signedAt: string | null; issuedOn: string };
type Request = { form: Form; lines: Line[]; reason: string; evidence: string; status: "waiting" | "rejected"; decision?: string };
const NOW = "Tue, 22 Sep 2026 10:05";

/* ── governed pieces, one style each ─────────────────────────────────── */
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
type Align = "left" | "right" | "center";
const just = (a: Align) => (a === "right" ? "justify-end" : a === "center" ? "justify-center" : "");
const GreyBox = ({ children, align = "left" }: { children: ReactNode; align?: Align }) => (
  <span className={`flex min-h-8 items-center rounded-control bg-kit-slate-3 px-3 text-body text-kit-slate-12 ${just(align)}`}>{children}</span>
);
const Plain = ({ children, align = "left" }: { children: ReactNode; align?: Align }) => (
  <span className={`flex min-h-8 items-center text-body text-kit-slate-12 ${just(align)}`}>{children}</span>
);
const Grid = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">{children}</div>;
const th = "whitespace-nowrap px-2 py-1 text-left text-meta font-normal text-kit-slate-11";
const cellInput = "h-8 w-full rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12";

/* ── the page ────────────────────────────────────────────────────────── */
function Page() {
  const [versions, setVersions] = useState<Version[]>([
    { rev: 1, form: BASE, lines: LINES0, title: "Original order", meta: "Recorded by Bernard Tan · Fri, 21 Aug 2026 10:02", signedAt: "Fri, 21 Aug 2026 10:05", issuedOn: "2026-08-21" },
  ]);
  const current = versions[versions.length - 1];
  const [request, setRequest] = useState<Request | null>(null);
  const [history, setHistory] = useState([{ title: "Order created", meta: "Bernard Tan · Sales · Fri, 21 Aug 2026 10:02", note: "Deposit RM 500.00 · Showroom order · signed by the customer" }]);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState("Order");
  const [viewRev, setViewRev] = useState<number | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>(BASE);
  const [lines, setLines] = useState<Line[]>(LINES0);
  const [openConfig, setOpenConfig] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [evidence, setEvidence] = useState("");
  const [decision, setDecision] = useState("");
  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const patch = (id: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));

  /* what changed; the SYSTEM chooses the action */
  const keys = Object.keys(BASE) as (keyof Form)[];
  const changedFields = editing ? keys.filter((k) => form[k] !== current.form[k]) : [];
  const changedLines = editing ? lines.filter((l) => lineChanged(l, current.lines.find((c) => c.id === l.id))) : [];
  const commercialOf = (f: Form, ls: Line[], base: Version) =>
    ls.some((l) => lineChanged(l, base.lines.find((b) => b.id === l.id))) || COMMERCIAL.some((k) => f[k] !== base.form[k]);
  const commercial = editing && commercialOf(form, lines, current);
  const changes = changedFields.length + changedLines.length;
  const blockedByOpen = commercial && request?.status === "waiting";
  const needReason = changes > 0 && reason.trim() === "";
  const action = commercial ? "Submit amendment request" : "Save";

  const flash = (t: string) => { setToast(t); window.setTimeout(() => setToast(null), 5000); };
  const startEdit = () => {
    setForm(current.form); setLines(current.lines); setReason(""); setAsked(null); setEvidence(""); setOpenConfig(null);
    setEditing(true); setTab("Order"); setViewRev(null);
  };
  const commit = () => {
    if (commercial) {
      setRequest({ form, lines, reason, evidence, status: "waiting" });
      setHistory((h) => [{ title: "Amendment request submitted", meta: `Shasha · Operation · ${NOW}`, note: `${changes} ${changes === 1 ? "change" : "changes"} · Waiting for management` }, ...h]);
      flash("Sent for approval. The order stays as it is until management approves.");
    } else {
      const rev = current.rev + 1;
      setVersions((v) => [...v, { rev, form, lines: current.lines, title: "Staff correction", meta: `Saved by Shasha · ${NOW}`, reason, signedAt: null, issuedOn: "2026-09-22" }]);
      setHistory((h) => [{ title: "Order corrected", meta: `Shasha · Operation · ${NOW}`, note: `Rev ${rev} · ${changedFields.map((k) => LABEL[k]).join(" · ")}` }, ...h]);
      flash("Saved");
    }
    setEditing(false);
  };
  const approve = () => {
    if (!request) return;
    const rev = current.rev + 1;
    const kept = live(request.lines).map(({ added: _a, ...l }) => l);
    setVersions((v) => [...v, { rev, form: request.form, lines: kept, title: "Customer change", meta: `Approved by Jess · Tue, 22 Sep 2026 ${10 + rev}:20`, reason: request.reason, signedAt: null, issuedOn: "2026-09-22" }]);
    setHistory((h) => [{ title: "Amendment approved and applied", meta: "Jess · Principal · Tue, 22 Sep 2026 11:20", note: `Rev ${rev} · Customer agreement: ${request.evidence}` }, ...h]);
    setRequest(null); setDecision(""); flash(`Approved and applied · Rev ${rev} is now the order`);
  };
  const signCurrent = () => {
    const at = `Tue, 22 Sep 2026 ${12 + current.rev}:00`;
    setVersions((vs) => vs.map((v) => (v.rev === current.rev ? { ...v, signedAt: at } : v)));
    setHistory((h) => [{ title: `Customer signed Rev ${current.rev}`, meta: `${current.form.name} · ${at}`, note: `Signed on the Rev ${current.rev} document` }, ...h]);
  };
  const reject = () => {
    if (!request) return;
    setRequest({ ...request, status: "rejected", decision });
    setHistory((h) => [{ title: "Amendment rejected", meta: "Jess · Principal · Tue, 22 Sep 2026 11:40", note: decision }, ...h]);
    setDecision("");
  };

  /* The document pane always shows the EFFECTIVE revision, or the version being viewed. */
  const docVersion = viewRev ? versions.find((v) => v.rev === viewRev)! : current;
  /* A version's retained document shows the payments recorded when it was issued — never today's. */
  /* The current version printed today shows today's payments; an older version's retained
     document shows only what was paid when it was issued. */
  const paidOn = (v: Version) => PAYMENTS.filter((p) => !p.voided && (v.rev === current.rev || p.date <= v.issuedOn));
  const paidSum = (v: Version) => paidOn(v).reduce((n, p) => n + p.amount, 0);
  const pdfFor = (v: Version): ReviewSoData => {
    const ls = live(v.lines);
    return {
      so_number: "SO-1319", issue_date: "2026-08-21", order_id: "x", order_code: "SO-1319", status_label: "", channel: "showroom",
      customer: { name: v.form.name, address: `${v.form.line1}, ${v.form.line2}, ${v.form.postcode} ${v.form.city}, ${v.form.state}`,
        phone: v.form.phone, email: v.form.email, emergency: `${v.form.emName} · ${v.form.emPhone} · ${v.form.emRel}` },
      dealer: { name: v.form.dealer, contact: null, address: null, outlet_name: v.form.location, outlet_address: null, salesperson_name: v.form.salesperson, salesperson_phone: null },
      delivery: { date: v.form.requested, floor: 3, has_lift: false } as SalesOrderTemplateData["delivery"],
      proceed_date: v.form.proceed,
      lines: ls.filter((l) => l.kind !== "service").map((l) => ({ sku: skuOf(l), description: `${l.name}${configText(l) ? ` · ${configText(l)}` : ""}`,
        qty: l.qty, unit_price: l.unit, line_total: l.qty * l.unit, attrs: null, category: CATALOGUE.find((m) => m.sku === l.sku)?.category ?? "accessory" })) as SalesOrderTemplateData["lines"],
      addons: ls.filter((l) => l.kind === "service").map((l) => ({ label: l.name, sku: "ADD-ON", qty: l.qty, unit_price: l.unit, line_total: l.qty * l.unit })),
      payments: paidOn(v).map((p) => ({ label: p.method, reference: p.code, amount: p.amount, date: p.date, approval_code: p.code, collected_by: p.by })),
      subtotal: total(ls), total: total(ls), paid: paidSum(v), balance_due: Math.max(total(ls) - paidSum(v), 0), currency: "MYR", issued_by: "Bernard Tan",
      signed: !!v.signedAt, signature_url: v.signedAt ? SIGNATURE_PNG : null,
      review_rev: v.rev, review_signature: v.signedAt ? { by: v.form.name, at: v.signedAt, rev: v.rev } : null,
    } as ReviewSoData;
  };
  const pdfData = useMemo(() => pdfFor(docVersion), [docVersion]);
  const showPdf = PAGE_STATE === "ready" && tab === "Order";
  const { setPane } = usePdfCanvases(showPdf ? `rev-${docVersion.rev}-${docVersion.signedAt ?? "u"}` : null, () => renderReview(pdfData));
  const printVersion = async (v: Version) => {
    const blob = await renderReview(pdfFor(v));
    window.open(URL.createObjectURL(blob), "_blank");
  };
  /* Test hook (preview only): the text of a version's printed document. */
  (window as unknown as { __docText?: (rev: number) => Promise<string> }).__docText = async (rev: number) => {
    const v = versions.find((x) => x.rev === rev)!;
    const doc = await pdfjs.getDocument({ data: await (await renderReview(pdfFor(v))).arrayBuffer() }).promise;
    let out = "";
    for (let i = 1; i <= doc.numPages; i++) out += (await (await doc.getPage(i)).getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
    return out;
  };

  if (PAGE_STATE !== "ready")
    return (
      <div className="flex min-h-screen flex-col bg-kit-slate-2">
        {PAGE_STATE === "loading" ? (
          <div className="flex flex-col gap-4 p-4 lg:w-1/2" aria-busy="true" aria-label="Opening the sales order">
            <div className="h-9 w-72 animate-pulse rounded-control bg-kit-slate-4" />
            {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-control border border-kit-slate-5 bg-white" />)}
          </div>
        ) : (
          <div className="grid place-items-center gap-3 p-16 text-center">
            <p className="text-strong text-kit-slate-12">This sales order could not be opened</p>
            <Button variant="neutral" icon="refresh" onClick={() => window.location.reload()}>Try again</Button>
          </div>
        )}
      </div>
    );

  /* ── header, notice ── */
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-kit-slate-5 bg-white px-4 py-3">
      <h1 className="text-title text-kit-slate-12 lg:text-page">SO-1319<span className="ml-3 font-normal text-kit-slate-11">{current.form.name}</span></h1>
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            {changes > 0 && <span className="text-body text-kit-slate-11">{changes} {changes === 1 ? "change" : "changes"}</span>}
            <Button variant="neutral" onClick={() => setEditing(false)}>Cancel</Button>
            {changes > 0 && (
              <Button variant="primary" disabled={needReason || blockedByOpen} onClick={commit}>
                {needReason ? `${action} — say why` : action}
              </Button>
            )}
          </>
        ) : (
          <>
            <DropdownMenu label="Print" trigger={<Button variant="neutral" icon="print">Print ▾</Button>}
              items={[{ key: "p", label: "Print Sales Order", icon: "print", onSelect: () => void printVersion(current) }, { key: "d", label: "Download PDF", icon: "download", onSelect: () => void printVersion(current) }]} />
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
  const notice = HAS_PO && (
    <div className="flex items-start gap-2 border-b border-kit-slate-5 bg-white px-4 py-2 text-body text-kit-slate-12">
      <Icon name="lock" size={16} />
      <span>This SO is already ordered from the supplier. Your change goes for approval first; the order changes only after it is approved.</span>
    </div>
  );

  /* ── Before / After review (draft, request) ── */
  const beforeAfter = (f: Form, ls: Line[], base: Version) => {
    const fieldRows = keys.filter((k) => f[k] !== base.form[k]).map((k) => ({
      what: LABEL[k], before: isDate(k) ? day(base.form[k]) : base.form[k], after: isDate(k) ? day(f[k]) : f[k],
    }));
    const lineRows = ls.filter((l) => lineChanged(l, base.lines.find((b) => b.id === l.id))).map((l) => {
      const was = base.lines.find((b) => b.id === l.id);
      return {
        what: `${l.name} (${skuOf(l)})`,
        before: l.added || !was ? "—" : `${was.qty} × ${money(was.unit)}${configText(was) ? ` · ${configText(was)}` : ""}`,
        after: l.removed ? "Cancelled" : `${l.qty} × ${money(l.unit)}${configText(l) ? ` · ${configText(l)}` : " · choose the configuration"}`,
      };
    });
    const rows = [
      ...fieldRows, ...lineRows,
      { what: "Qty", before: qtyText(base.lines).replace("Qty: ", ""), after: qtyText(ls).replace("Qty: ", "") },
      ...(servicesText(base.lines) !== servicesText(ls) ? [{ what: "Services", before: servicesText(base.lines).replace("Services: ", ""), after: servicesText(ls).replace("Services: ", "") }] : []),
      { what: "Total payable", before: `RM ${money(total(base.lines))}`, after: `RM ${money(total(ls))}` },
    ];
    const impacts = [
      ...keys.filter((k) => f[k] !== base.form[k] && IMPACT[k]).map((k) => `${LABEL[k]}: ${IMPACT[k]}`),
      ...ls.filter((l) => lineChanged(l, base.lines.find((b) => b.id === l.id)) && LINKS[l.id]).map((l) => `${l.name}: ${LINKS[l.id]}`),
      ...(ls.some((l) => l.added) ? ["New goods: Purchasing buys them after approval"] : []),
      ...(ls.some((l) => l.removed && l.id === "l1") && ls.some((l) => l.kind === "gift" && !l.removed) ? ["Free gift: check the gift is still allowed without the cancelled mattress"] : []),
      ...(total(ls) !== total(base.lines) ? [`Payments: ${total(ls) < PAID ? `RM ${money(PAID - total(ls))} paid more than the new total — Payments reviews a refund` : `balance due becomes RM ${money(Math.max(total(ls) - PAID, 0))}`}`] : []),
    ];
    return (
      <>
        <table className="w-full border-collapse text-body">
          <thead><tr className="border-b border-kit-slate-5"><th className={th} /><th className={th}>Before</th><th className={th}>After</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.what} className="border-b border-kit-slate-5 align-top">
                <td className="px-2 py-2 text-kit-slate-11">{r.what}</td>
                <td className="px-2 py-2 text-kit-slate-11">{r.before}</td>
                <td className="px-2 py-2 font-semibold text-kit-slate-12">{r.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {commercialOf(f, ls, base) && impacts.length > 0 && (
          <>
            <p className="mt-3 text-meta text-kit-slate-11">Before approval</p>
            <ul className="mt-1 space-y-1 text-body text-kit-slate-12">{impacts.map((t) => <li key={t}>{t}</li>)}</ul>
          </>
        )}
      </>
    );
  };

  const review = editing && changes > 0 && (
    <section className="rounded-control border border-kit-blue-6 bg-kit-blue-2 px-4 py-3">
      <p className="mb-2 text-body font-semibold text-kit-slate-12">
        {blockedByOpen ? "An earlier change is still waiting for management." : commercial ? "These changes go for approval. The order stays as it is until approved." : "This correction saves as a new revision."}
      </p>
      {beforeAfter(form, lines, current)}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1"><Label htmlFor="asked">Requested date (from customer)</Label><DatePicker id="asked" value={asked} onChange={setAsked} /></div>
        <div className="flex flex-col gap-1 sm:col-span-2"><Label htmlFor="why">Reason for change *</Label>
          <Textarea id="why" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        {commercial && (
          <div className="flex flex-col gap-1 sm:col-span-3"><Label htmlFor="evidence">Customer agreement evidence</Label>
            <Input id="evidence" placeholder="WhatsApp from the customer, Tue 22 Sep 09:40 — or the signed document" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
            <span className="text-meta text-kit-slate-11">You can send the request without it, but management cannot approve until it is recorded.</span></div>
        )}
      </div>
    </section>
  );

  const requestPanel = request && !editing && (
    <section className="rounded-control border border-kit-amber-7 bg-kit-amber-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-strong text-kit-slate-12">{request.status === "rejected" ? "Rejected" : "Waiting for management"}</h2>
        <span className="text-meta text-kit-slate-11">Submitted by Shasha · {NOW}</span>
      </div>
      <p className="mb-2 mt-1 text-body text-kit-slate-12">Reason for change: {request.reason}</p>
      {beforeAfter(request.form, request.lines, current)}
      <p className="mt-3 text-body text-kit-slate-12">
        Customer agreement evidence: {request.evidence ? request.evidence : <span className="text-kit-red-11">Not recorded yet — the change cannot take effect</span>}
      </p>
      {request.status === "waiting" && APPROVER && (
        <div className="mt-3 flex flex-col gap-3 border-t border-kit-amber-6 pt-3">
          <div className="flex flex-col gap-1"><Label htmlFor="decision">Management decision reason</Label>
            <Textarea id="decision" rows={2} value={decision} onChange={(e) => setDecision(e.target.value)} /></div>
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
    </section>
  );

  /* ── fields: grey = editable, plain = not this page's to change ── */
  const orderCards = (src: Version, readOnly: boolean) => {
    const pays = readOnly && src.rev !== current.rev ? PAYMENTS.filter((p) => p.date <= src.issuedOn) : PAYMENTS;
    const paid = pays.filter((p) => !p.voided).reduce((n, p) => n + p.amount, 0);
    const edit = editing && !readOnly;
    const ls = readOnly ? src.lines : edit ? lines : current.lines;
    const G = (k: keyof Form, kind: "text" | "tel" | "email" | "date" | "lift" = "text") => {
      const label = SHORT[k] ?? LABEL[k];
      if (!edit) return <div className="flex min-w-0 flex-col gap-1"><Label>{label}</Label><GreyBox>{isDate(k) ? day(src.form[k]) : src.form[k]}</GreyBox></div>;
      const control =
        kind === "date" ? <DatePicker id={k} value={form[k]} onChange={(v) => set(k)(v ?? current.form[k])} />
        : kind === "lift" ? <Select id={k} value={form[k]} onValueChange={set(k)} options={[{ value: "No lift", label: "No lift" }, { value: "Has lift", label: "Has lift" }]} />
        : <Input id={k} type={kind} value={form[k]} onChange={(e) => set(k)(e.target.value)} />;
      return <div className="flex min-w-0 flex-col gap-1"><Label htmlFor={k}>{label}</Label>{control}</div>;
    };
    return (
      <>
        <Card title="SO info">
          <Grid>
            <div className="flex min-w-0 flex-col gap-1"><Label>SO Doc Date</Label><Plain>{day("2026-08-21")}</Plain></div>
            {G("proceed", "date")}{G("requested", "date")}{G("location")}{G("salesperson")}{G("dealer")}
          </Grid>
        </Card>
        <Card title="Customer" aside={<span className="text-meta text-kit-slate-11">Existing customer · <a className="text-kit-blue-11 hover:underline" href="#customer">3 orders ›</a></span>}>
          <Grid>{G("name")}{G("phone", "tel")}{G("email", "email")}{G("race")}{G("gender")}{G("birthday", "date")}</Grid>
          <SubTitle>Emergency contact</SubTitle>
          <Grid>{G("emName")}{G("emPhone", "tel")}{G("emRel")}</Grid>
          <SubTitle>Billing</SubTitle>
          <div className="sm:w-2/3">{G("billing")}</div>
        </Card>
        <Card title="Delivery">
          <Grid>
            {G("line1")}{G("line2")}{G("postcode")}{G("city")}{G("state")}{G("building")}
            {G("floor")}{G("lift", "lift")}{G("stair")}
          </Grid>
        </Card>
        <Card title="Items">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-body">
              <thead>
                <tr className="border-b border-kit-slate-5">
                  <th className={`${th} w-8`}>#</th><th className={`${th} w-28`}>Item Code</th><th className={th}>Description</th>
                  <th className={`${th} w-20 text-center`}>Qty</th><th className={`${th} w-28 text-right`}>Unit (RM)</th>
                  <th className={`${th} w-16 text-right`}>Disc (RM)</th><th className={`${th} w-28 text-right`}>Amount (RM)</th>
                  {edit && <th className={`${th} w-28`} />}
                </tr>
              </thead>
              <tbody>
                {ls.map((l, i) => {
                  const was = current.lines.find((c) => c.id === l.id);
                  const gone = !!l.removed;
                  const strike = gone ? "line-through text-kit-slate-11" : "";
                  const model = CATALOGUE.find((m) => m.sku === l.sku);
                  const canEditGoods = edit && !gone && l.kind === "goods";
                  const changed = edit && lineChanged(l, was);
                  return [
                    <tr key={l.id} className={`${openConfig === l.id && edit ? "" : "border-b border-kit-slate-5"} align-top ${changed && !gone ? "bg-kit-blue-2" : ""}`}>
                      <td className="px-2 py-1 text-kit-slate-11"><Plain><span className={strike}>{i + 1}</span></Plain></td>
                      <td className="px-1 py-1">{l.kind === "goods" ? <GreyBox><span className={`whitespace-nowrap ${strike}`}>{skuOf(l)}</span></GreyBox> : <Plain><span className={`whitespace-nowrap ${strike}`}>{skuOf(l)}</span></Plain>}</td>
                      <td className="min-w-[170px] px-2 py-1">
                        <div className={`flex min-h-8 items-center ${strike}`}>{l.name}</div>
                        {configText(l) && <div className={`text-meta text-kit-slate-11 ${strike}`}>{configText(l)}</div>}
                        {l.note && <div className="text-meta text-kit-slate-11">{l.note}</div>}
                        {edit && l.added && <div className="text-meta text-kit-blue-11">New line</div>}
                        {canEditGoods && model?.options && (
                          <button type="button" className="mt-1 text-meta text-kit-blue-11 hover:underline" aria-expanded={openConfig === l.id}
                            onClick={() => setOpenConfig(openConfig === l.id ? null : l.id)}>
                            {openConfig === l.id ? "Close configuration" : "Configure"}
                          </button>
                        )}
                      </td>
                      <td className="px-1 py-1">
                        {canEditGoods
                          ? <input id={`qty-${l.id}`} aria-label={`Qty ${l.name}`} type="number" min={1} className={`${cellInput} text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`} value={l.qty} onChange={(e) => patch(l.id, { qty: Math.max(1, Number(e.target.value) || 1) })} />
                          : l.kind === "goods" ? <GreyBox align="center"><span className={strike}>{l.qty}</span></GreyBox> : <Plain align="center"><span className={strike}>{l.qty}</span></Plain>}
                      </td>
                      <td className="px-1 py-1">
                        {canEditGoods
                          ? <input id={`unit-${l.id}`} aria-label={`Unit price ${l.name}`} type="number" min={0} step="0.01" className={`${cellInput} text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`} value={l.unit} onChange={(e) => patch(l.id, { unit: Math.max(0, Number(e.target.value) || 0) })} />
                          : l.kind === "goods" ? <GreyBox align="right"><span className={`tabular-nums ${strike}`}>{money(l.unit)}</span></GreyBox> : <Plain align="right"><span className={`tabular-nums ${strike}`}>{money(l.unit)}</span></Plain>}
                      </td>
                      <td className="px-2 py-1 text-kit-slate-11"><Plain align="right"><span className={strike}>—</span></Plain></td>
                      <td className="px-2 py-1"><Plain align="right"><span className={`tabular-nums ${strike}`}>{money(l.qty * l.unit)}</span></Plain></td>
                      {edit && (
                        <td className="px-1 py-1 text-right">
                          {gone
                            ? <Button size="sm" variant="ghost" icon="back" onClick={() => patch(l.id, { removed: false })}>Restore</Button>
                            : <Button size="sm" variant="ghost" icon="delete" onClick={() => (l.added ? setLines((x) => x.filter((y) => y.id !== l.id)) : patch(l.id, { removed: true }))}>Remove</Button>}
                        </td>
                      )}
                    </tr>,
                    edit && openConfig === l.id && model?.options ? (
                      <tr key={`${l.id}-cfg`} className="border-b border-kit-slate-5 bg-kit-slate-2">
                        <td />
                        <td colSpan={7} className="px-2 py-3">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            {model.options.map((o) => (
                              <div key={o.key} className="flex flex-col gap-1">
                                <Label htmlFor={`${l.id}-${o.key}`}>{o.label}</Label>
                                <Select id={`${l.id}-${o.key}`} value={l.config[o.key]} placeholder={`Choose ${o.label.toLowerCase()}`}
                                  onValueChange={(v) => patch(l.id, { config: { ...l.config, [o.key]: v } })}
                                  options={o.values.map((v) => ({ value: v, label: v }))} />
                              </div>
                            ))}
                            {model.fixed?.map((x) => (
                              <div key={x.label} className="flex flex-col gap-1"><Label>{x.label}</Label><Plain>{x.value}</Plain></div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold text-kit-slate-12">
                  <td colSpan={3} className="px-2 py-2 text-right">TOTAL PAYABLE</td>
                  <td colSpan={3} />
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">RM {money(total(ls))}</td>
                  {edit && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            {edit ? (
              <DropdownMenu label="Add item" align="start" trigger={<Button variant="ghost" icon="add">Add item</Button>}
                items={CATALOGUE.map((m) => ({ key: m.sku, label: `${m.name} · RM ${money(m.unit)}`, onSelect: () => {
                  const id = `n${Date.now()}`;
                  setLines((x) => [...x, { id, sku: m.sku, name: m.name, kind: "goods", qty: 1, unit: m.unit, config: {}, fixed: m.fixed?.[0]?.value.split(" (")[0], added: true }]);
                  setOpenConfig(id);
                } }))} />
            ) : <span />}
            <span className="flex flex-wrap gap-x-6 text-body text-kit-slate-12"><span>{qtyText(ls)}</span><span>{servicesText(ls)}</span></span>
          </div>
        </Card>
        <Card title="Payment" aside={<a className="text-meta text-kit-blue-11 hover:underline" href="#payments">Open this order in Payments →</a>}>
          <p className="mb-2 text-meta text-kit-slate-11">Payment details recorded at sale: 12-month instalment · BANK-REFERENCE · <a className="text-kit-blue-11 hover:underline" href="#slip">View slip</a></p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-body">
              <thead><tr className="border-b border-kit-slate-5">
                <th className={th}>Date</th><th className={th}>Payment received</th><th className={th}>Approval code</th><th className={th}>Collected by</th><th className={`${th} text-right`}>Amount (RM)</th>
              </tr></thead>
              <tbody>
                {pays.map((p) => (
                  <tr key={p.receipt} className={`border-b border-kit-slate-5 align-top ${p.voided ? "text-kit-slate-11" : "text-kit-slate-12"}`}>
                    <td className="whitespace-nowrap px-2 py-2">{day(p.date)}</td>
                    <td className="px-2 py-2">{p.method}
                      <div className="whitespace-nowrap text-meta"><a className="text-kit-blue-11 hover:underline" href="#receipt">{p.receipt}</a></div>
                      {p.voided && <div className="text-meta text-kit-red-11">Voided · Keyed on the wrong order · not counted</div>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">{p.code}</td>
                    <td className="px-2 py-2">{p.by}</td>
                    <td className={`px-2 py-2 text-right tabular-nums ${p.voided ? "line-through" : ""}`}>{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="text-kit-slate-12">
                {([["Goods amount", goodsTotal(ls)], ["Service amount", serviceTotal(ls)], ["Total payable", total(ls)], ["Paid to date", paid]] as const).map(([k, v]) => (
                  <tr key={k} className="border-b border-kit-slate-5">
                    <td colSpan={4} className="px-2 py-2 text-right">{k}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">RM {money(v)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td colSpan={4} className="px-2 py-2 text-right">Balance due</td>
                  <td className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${total(ls) - paid > 0 ? "text-kit-red-11" : ""}`}>RM {money(Math.max(total(ls) - paid, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {paid > total(ls) && <p className="mt-1 text-right text-meta text-kit-amber-11">RM {money(paid - total(ls))} needs review</p>}
        </Card>
        <Card title="Customer signature">
          {src.signedAt ? (
            <div className="flex flex-wrap items-end gap-4">
              <img src={SIGNATURE_PNG} alt={`Customer signature on Rev ${src.rev}`} className="h-16 w-40 rounded-control border border-kit-slate-5 bg-white object-contain" />
              <span className="text-body text-kit-slate-12">Signed by {src.form.name} · Rev {src.rev} · {src.signedAt}</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-body text-kit-slate-12">
                Rev {src.rev} is not signed.{" "}
                {(() => { const last = [...versions].reverse().find((v) => v.signedAt && v.rev < src.rev); return last ? `The last signed version is Rev ${last.rev}; its signature stays with Rev ${last.rev} and its document.` : ""; })()}
              </p>
              {!readOnly && !editing && src.rev === current.rev && (
                <Button size="sm" variant="neutral" icon="edit" onClick={signCurrent}>Preview only: customer signs Rev {src.rev}</Button>
              )}
            </div>
          )}
        </Card>
      </>
    );
  };

  const viewing = viewRev ? versions.find((v) => v.rev === viewRev)! : null;
  const pending = request?.status === "waiting";
  const order = (
    <div className="flex flex-col lg:h-full lg:min-h-0 lg:flex-row">
      <div className="min-w-0 space-y-4 bg-kit-slate-2 px-4 py-4 lg:min-h-0 lg:w-1/2 lg:overflow-auto" data-pane="form">
        {viewing ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-kit-slate-5 bg-white px-4 py-3">
            <span className="text-body text-kit-slate-12"><b>Rev {viewing.rev}</b> · {viewing.title} · {viewing.meta}{viewing.rev === current.rev ? " · Current" : ""}</span>
            <span className="flex flex-wrap gap-2">
              <Button variant="neutral" icon="print" onClick={() => void printVersion(viewing)}>Print this version</Button>
              <Button variant="neutral" icon="back" onClick={() => { setViewRev(null); setTab("Revisions"); }}>Return to current</Button>
            </span>
          </div>
        ) : (
          <>
            {toast && <p role="status" className="rounded-control border border-kit-green-6 bg-kit-green-2 px-4 py-2 text-body text-kit-green-11">{toast}</p>}
            {requestPanel}{review}
          </>
        )}
        {orderCards(viewing ?? current, !!viewing)}
      </div>
      <aside className="min-w-0 border-t border-kit-slate-5 bg-kit-slate-3 px-4 py-4 lg:min-h-0 lg:w-1/2 lg:overflow-auto lg:border-l lg:border-t-0" aria-label="Sales Order document">
        {(pending || editing) && !viewing && (
          <div className="mx-auto mb-3 max-w-[700px] rounded-control border border-kit-slate-5 bg-white px-3 py-2 text-body text-kit-slate-12">
            Review sample. The document shows the order as it is now (Rev {current.rev}). {editing ? "Your changes appear in the review on the left." : "It changes only after approval."}
          </div>
        )}
        <div className="mx-auto max-w-[700px]"><div ref={setPane} className="min-h-[400px] overflow-x-auto" /></div>
      </aside>
    </div>
  );

  const revisionsTab = (
    <ol className="mx-auto my-6 max-w-3xl divide-y divide-kit-slate-5 rounded-control border border-kit-slate-5 bg-white">
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
  );
  const historyTab = (
    <ol className="mx-auto my-6 max-w-3xl divide-y divide-kit-slate-5 rounded-control border border-kit-slate-5 bg-white">
      {history.map((h) => (
        <li key={h.title + h.meta} className="px-4 py-3">
          <p className="text-body font-semibold text-kit-slate-12">{h.title}</p>
          <p className="text-meta text-kit-slate-11">{h.meta}</p>
          {h.note && <p className="text-body text-kit-slate-12">{h.note}</p>}
        </li>
      ))}
    </ol>
  );

  return (
    <div className="flex min-h-screen flex-col bg-kit-slate-2 lg:h-screen">
      {header}
      <div className="border-b border-kit-slate-5 bg-white px-4">
        <Tabs label="Sales order views" value={tab} onValueChange={(v) => { if (!editing) { setTab(v); setViewRev(null); } }}
          tabs={["Order", "Revisions", "History", "Order Route"].map((v) => ({ value: v, label: v, disabled: editing && v !== "Order" }))} />
      </div>
      {notice}
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
